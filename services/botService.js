const axios = require("axios");
const SlackIntegration = require("../models/SlackIntegration");
const ChatBot = require("../models/ChatBot");
const QAHistory = require("../models/QAHistory");
const Customization = require("../models/Customisation");
const { extractTextFromPDF } = require("../utils/textExtractor");
const { generateQAsViaGPT, getEmbedding } = require("../utils/gptUtils");
const { embedText, cosineSimilarity } = require("../utils/embedUtils");
const logger = require("../utils/logger");
const FlowSession = require("../models/FlowSession");

// Helper function to process a single chunk
async function processChunk(chunk, botId, name, description, source, index) {
  try {
    const qas = await generateQAsViaGPT(chunk, name, description);

    // Process all Q&As in parallel
    const qaPromises = qas.map(async (qa) => {
      const { question, answer } = qa;

      if (question && answer) {
        const embedding = await embedText(question);

        await QAHistory.create({
          bot: botId,
          question,
          answer,
          embedding: Buffer.from(embedding.buffer),
        });

        return { success: true, question: question.substring(0, 50) + "..." };
      }
      return { success: false };
    });

    const results = await Promise.allSettled(qaPromises);
    const successful = results.filter(
      (r) => r.status === "fulfilled" && r.value.success
    ).length;

    logger.debug(`Processed ${source} chunk`, {
      botId,
      index,
      successful,
      total: qas.length,
    });

    return { success: true, qaCount: successful };
  } catch (err) {
    logger.error(`Error processing ${source} chunk`, {
      botId,
      index,
      error: err.message,
    });
    return { success: false, error: err.message };
  }
}

// Helper function to process markdown content
async function processMarkdownContent(markdownArray, botId, name, description) {
  if (!markdownArray || markdownArray.length === 0) return 0;

  logger.info("Processing scraped markdown content for bot", {
    botId,
    pageCount: markdownArray.length,
  });

  // Process all markdown pages in parallel
  const pagePromises = markdownArray.map(async (markdown, i) => {
    if (!markdown || !markdown.trim()) {
      logger.warn("Skipping empty markdown content", { botId, index: i });
      return { pageIndex: i, qaCount: 0 };
    }

    logger.debug("Processing markdown page", {
      botId,
      pageIndex: i + 1,
      contentLength: markdown.length,
    });

    // Split markdown into chunks
    const chunks = markdown.match(/.{1,3000}/g) || [];

    // Process all chunks of this page in parallel
    const chunkPromises = chunks.map((chunk, j) =>
      processChunk(
        chunk,
        botId,
        name,
        description,
        `markdown page ${i + 1}`,
        j + 1
      )
    );

    const chunkResults = await Promise.allSettled(chunkPromises);
    const qaCount = chunkResults
      .filter((r) => r.status === "fulfilled" && r.value.success)
      .reduce((sum, r) => sum + r.value.qaCount, 0);

    return { pageIndex: i, qaCount };
  });

  const results = await Promise.allSettled(pagePromises);
  const totalQAs = results
    .filter((r) => r.status === "fulfilled")
    .reduce((sum, r) => sum + r.value.qaCount, 0);

  logger.info("Completed processing scraped markdown content", {
    botId,
    pagesProcessed: markdownArray.length,
    totalQAs,
  });

  return totalQAs;
}

// Helper function to process PDF content
async function processPDFContent(file, botId, name, description) {
  if (!file) return 0;

  logger.info("Processing uploaded PDF for bot", {
    botId,
    file: file.originalname,
  });

  const text = await extractTextFromPDF(file.path);

  if (!text || !text.trim()) {
    logger.warn("PDF extraction resulted in empty text", { botId });
    return 0;
  }

  const chunks = text.match(/.{1,3000}/g) || [];

  // Process all PDF chunks in parallel
  const chunkPromises = chunks.map((chunk, i) =>
    processChunk(chunk, botId, name, description, "PDF", i + 1)
  );

  const results = await Promise.allSettled(chunkPromises);
  const totalQAs = results
    .filter((r) => r.status === "fulfilled" && r.value.success)
    .reduce((sum, r) => sum + r.value.qaCount, 0);

  logger.info("Completed processing PDF content", {
    botId,
    totalQAs,
  });

  return totalQAs;
}

exports.createBot = async (req) => {
  const {
    name,
    website_url,
    description,
    is_voice_enabled,
    is_auto_translate,
    supported_languages,
    primary_purpose,
    specialisation_area,
    conversation_tone,
    response_style,
    target_audience,
    key_topics,
    keywords,
    custom_instructions,
    is_slack_enabled,
    slack_command,
    slack_channel_id,
    conversationFlow,
    scraped_content,
    scraped_urls,
  } = req.body;

  if (!name || !description) {
    logger.error("Bot creation failed - missing required fields", {
      name,
      description,
    });
    throw new Error("Missing required fields: name, or description");
  }

  // Parse supported_languages
  let parsedLanguages;
  try {
    parsedLanguages = JSON.parse(supported_languages);
    if (!Array.isArray(parsedLanguages)) throw new Error("Not an array");
  } catch {
    parsedLanguages = supported_languages
      ?.split(",")
      .map((lang) => lang.trim());
  }

  // Parse conversation flow
  let parsedConversationFlow = conversationFlow;
  if (typeof conversationFlow === "string") {
    try {
      parsedConversationFlow = JSON.parse(conversationFlow);
    } catch {
      parsedConversationFlow = { nodes: [], edges: [] };
    }
  }

  // Parse scraped content
  let parsedScrapedContent = [];
  if (scraped_content) {
    try {
      parsedScrapedContent =
        typeof scraped_content === "string"
          ? JSON.parse(scraped_content)
          : scraped_content;

      if (!Array.isArray(parsedScrapedContent)) {
        parsedScrapedContent = [parsedScrapedContent];
      }
    } catch (err) {
      logger.warn("Failed to parse scraped_content", { error: err.message });
      parsedScrapedContent = [];
    }
  }

  // Parse scraped URLs
  let parsedScrapedUrls = [];
  if (scraped_urls) {
    try {
      parsedScrapedUrls = JSON.parse(scraped_urls);
      if (!Array.isArray(parsedScrapedUrls)) {
        parsedScrapedUrls = [scraped_urls];
      }
    } catch {
      parsedScrapedUrls = [scraped_urls];
    }
  }

  // Create bot
  const bot = await ChatBot.create({
    user: req.user.id,
    name,
    website_url,
    description,
    is_voice_enabled: is_voice_enabled === "true",
    is_auto_translate: is_auto_translate === "true",
    is_slack_enabled: is_slack_enabled === "true",
    slack_command,
    slack_channel_id,
    supported_languages: parsedLanguages,
    primary_purpose,
    specialisation_area,
    conversation_tone,
    response_style,
    target_audience,
    key_topics,
    keywords,
    custom_instructions,
    conversationFlow: parsedConversationFlow,
    scraped_urls: parsedScrapedUrls,
  });

  logger.info("Bot created", { botId: bot._id, userId: req.user.id, name });

  // Start parallel processing
  const processingPromises = [];

  // 1. Process scraped markdown content (parallel)
  if (parsedScrapedContent.length > 0) {
    processingPromises.push(
      processMarkdownContent(
        parsedScrapedContent,
        bot._id,
        name,
        description
      ).catch((err) => {
        logger.error("Error in markdown processing", {
          botId: bot._id,
          error: err.message,
        });
        return 0;
      })
    );
  }

  // 2. Process PDF content (parallel)
  if (req.file) {
    processingPromises.push(
      processPDFContent(req.file, bot._id, name, description).catch((err) => {
        logger.error("Error in PDF processing", {
          botId: bot._id,
          error: err.message,
        });
        return 0;
      })
    );
  }

  // 3. Slack integration (parallel - independent of content processing)
  if (is_slack_enabled === "true" && slack_channel_id) {
    processingPromises.push(
      (async () => {
        const slackIntegration = await SlackIntegration.findOne({
          userId: req.user.id,
        });

        if (slackIntegration?.slackAccessToken) {
          try {
            await axios.post(
              "https://slack.com/api/conversations.join",
              { channel: slack_channel_id },
              {
                headers: {
                  Authorization: `Bearer ${slackIntegration.slackAccessToken}`,
                  "Content-Type": "application/json",
                },
              }
            );
            logger.info("Bot joined Slack channel", {
              botId: bot._id,
              slack_channel_id,
            });
            return { slack: true };
          } catch (err) {
            logger.error("Error joining Slack channel", {
              botId: bot._id,
              slack_channel_id,
              error: err.response?.data || err.message,
            });
            return { slack: false };
          }
        } else {
          logger.warn("Slack integration not found, bot not added to channel", {
            botId: bot._id,
            userId: req.user.id,
          });
          return { slack: false };
        }
      })().catch((err) => {
        logger.error("Error in Slack integration", {
          botId: bot._id,
          error: err.message,
        });
        return { slack: false };
      })
    );
  }

  // Wait for all parallel operations to complete
  const results = await Promise.allSettled(processingPromises);

  // Calculate total QAs processed
  let markdownQAs = 0;
  let pdfQAs = 0;
  let slackJoined = false;

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      if (typeof result.value === "number") {
        if (parsedScrapedContent.length > 0 && index === 0) {
          markdownQAs = result.value;
        } else if (
          req.file &&
          (parsedScrapedContent.length > 0 ? index === 1 : index === 0)
        ) {
          pdfQAs = result.value;
        }
      } else if (result.value?.slack !== undefined) {
        slackJoined = result.value.slack;
      }
    }
  });

  // Build success message
  let message = "Bot created successfully";
  const processedSources = [];

  if (markdownQAs > 0) {
    processedSources.push(
      `${parsedScrapedContent.length} scraped pages (${markdownQAs} Q&As)`
    );
  }

  if (pdfQAs > 0) {
    processedSources.push(`uploaded PDF (${pdfQAs} Q&As)`);
  }

  if (processedSources.length > 0) {
    message += ` with GPT-generated Q&As from ${processedSources.join(
      " and "
    )}`;
  }

  if (slackJoined) {
    message += " and added to Slack channel";
  }

  message += ".";

  logger.info("Bot creation completed", {
    botId: bot._id,
    markdownQAs,
    pdfQAs,
    totalQAs: markdownQAs + pdfQAs,
    slackJoined,
  });

  return {
    bot_id: bot._id,
    message,
    sources_processed: {
      scraped_pages: parsedScrapedContent.length,
      markdown_qas: markdownQAs,
      pdf_uploaded: !!req.file,
      pdf_qas: pdfQAs,
      total_qas: markdownQAs + pdfQAs,
      slack_integrated: slackJoined,
    },
  };
};

exports.askBot = async (question, botId) => {
  const bot = await ChatBot.findById(botId);
  if (!bot) {
    logger.error("Bot not found", { botId });
    throw new Error("Bot not found");
  }

  logger.info("Bot asked a question", { botId, question });

  const inputEmbedding = await getEmbedding(question);
  const qas = await QAHistory.find({ bot: botId });

  let bestMatch = null,
    bestScore = -1;
  for (let qa of qas) {
    const storedEmbedding = new Float32Array(qa.embedding.buffer);
    const score = cosineSimilarity(inputEmbedding, storedEmbedding);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = qa;
    }
  }

  if (bestScore > 0.85 && bestMatch) {
    await QAHistory.create({
      bot: botId,
      question,
      answer: bestMatch.answer,
      embedding: Buffer.from(inputEmbedding.buffer),
    });

    logger.info("Best QA match found", { botId, score: bestScore, question });

    return { answer: bestMatch.answer, score: bestScore, source: "qa" };
  }

  logger.warn("No strong QA match found", {
    botId,
    score: bestScore,
    question,
  });
  return { message: "No match found.", score: bestScore };
};

exports.getAllChatBots = async (userId) => {
  logger.info("Fetching all chat bots for user", { userId });
  const bots = await ChatBot.find({ user: userId });
  logger.info("Fetched chat bots", { userId, count: bots.length });
  return bots;
};

exports.getBotById = async (botId) => {
  const bot = await ChatBot.findById(botId);
  if (!bot) {
    logger.warn("Bot not found", { botId });
    throw new Error("Bot not found");
  }
  logger.info("Fetched bot by ID", { botId });
  return bot;
};

exports.deleteBot = async (botId, userId) => {
  const bot = await ChatBot.findOne({ _id: botId, user: userId });
  if (!bot) {
    logger.warn("Bot not found for deletion", { botId, userId });
    throw new Error("Bot not found");
  }

  await Customization.findOneAndDelete({ botId });
  await QAHistory.deleteMany({ bot: botId });
  await ChatBot.findByIdAndDelete(botId);

  logger.info("Bot and associated data deleted", { botId, userId });
};

exports.updateBot = async (botId, userId, body, file) => {
  const bot = await ChatBot.findOne({ _id: botId, user: userId });
  if (!bot) {
    logger.warn("Bot not found for update", { botId, userId });
    throw new Error("Bot not found");
  }

  const {
    name,
    website_url,
    description,
    is_voice_enabled,
    is_auto_translate,
    supported_languages,
    primary_purpose,
    specialisation_area,
    conversation_tone,
    response_style,
    target_audience,
    key_topics,
    keywords,
    custom_instructions,
    is_slack_enabled,
    slack_command,
    slack_channel_id,
    conversationFlow,
    scraped_content,
    scraped_urls,
  } = body;

  if (!name || !description) {
    logger.error("Missing required fields for bot update", {
      botId,
      userId,
      name,
      description,
    });
    throw new Error("Missing required fields: name or description");
  }

  // Parse supported languages
  let parsedLanguages;
  try {
    parsedLanguages = JSON.parse(supported_languages);
    if (!Array.isArray(parsedLanguages)) throw new Error("Not an array");
  } catch {
    parsedLanguages = supported_languages
      ?.split(",")
      .map((lang) => lang.trim());
  }

  // Parse conversation flow
  let parsedConversationFlow = conversationFlow;
  if (typeof conversationFlow === "string") {
    try {
      parsedConversationFlow = JSON.parse(conversationFlow);
    } catch {
      parsedConversationFlow = { nodes: [], edges: [] };
    }
  }

  // Parse scraped content
  let parsedScrapedContent = [];
  if (scraped_content) {
    try {
      parsedScrapedContent =
        typeof scraped_content === "string"
          ? JSON.parse(scraped_content)
          : scraped_content;

      if (!Array.isArray(parsedScrapedContent)) {
        parsedScrapedContent = [parsedScrapedContent];
      }
    } catch (err) {
      logger.warn("Failed to parse scraped_content", { error: err.message });
      parsedScrapedContent = [];
    }
  }

  // Parse scraped URLs
  let parsedScrapedUrls = [];
  if (scraped_urls) {
    try {
      parsedScrapedUrls = JSON.parse(scraped_urls);
      if (!Array.isArray(parsedScrapedUrls)) {
        parsedScrapedUrls = [scraped_urls];
      }
    } catch {
      parsedScrapedUrls = [scraped_urls];
    }
  }

  // Detect URL changes
  const prevUrls = Array.isArray(bot.scraped_urls) ? bot.scraped_urls.sort() : [];
  const newUrls = Array.isArray(parsedScrapedUrls) ? parsedScrapedUrls.sort() : [];
  const urlsChanged =
    JSON.stringify(prevUrls) !== JSON.stringify(newUrls);

  // Update bot fields
  Object.assign(bot, {
    name: name || bot.name,
    website_url: website_url || bot.website_url,
    description: description || bot.description,
    is_voice_enabled: is_voice_enabled === "true",
    is_auto_translate: is_auto_translate === "true",
    is_slack_enabled: is_slack_enabled === "true",
    slack_command: slack_command || bot.slack_command,
    slack_channel_id: slack_channel_id || bot.slack_channel_id,
    supported_languages: parsedLanguages || bot.supported_languages,
    primary_purpose: primary_purpose || bot.primary_purpose,
    specialisation_area: specialisation_area || bot.specialisation_area,
    conversation_tone: conversation_tone || bot.conversation_tone,
    response_style: response_style || bot.response_style,
    target_audience: target_audience || bot.target_audience,
    key_topics: key_topics || bot.key_topics,
    keywords: keywords || bot.keywords,
    custom_instructions: custom_instructions || bot.custom_instructions,
    conversationFlow: parsedConversationFlow || bot.conversationFlow,
    scraped_urls: parsedScrapedUrls || bot.scraped_urls,
  });

  logger.info("Bot fields updated locally", { botId, userId });

  // Slack auto-join
  if (is_slack_enabled === "true" && slack_channel_id) {
    const slackIntegration = await SlackIntegration.findOne({ userId });
    if (slackIntegration?.slackAccessToken) {
      try {
        await axios.post(
          "https://slack.com/api/conversations.join",
          { channel: slack_channel_id },
          {
            headers: {
              Authorization: `Bearer ${slackIntegration.slackAccessToken}`,
              "Content-Type": "application/json",
            },
          }
        );
        logger.info("Bot joined Slack channel", { botId, slack_channel_id });
      } catch (err) {
        logger.error("Error joining Slack channel", {
          botId,
          slack_channel_id,
          error: err.response?.data || err.message,
        });
      }
    } else {
      logger.warn("Slack integration not found, bot not added to channel", {
        botId,
        userId,
      });
    }
  }

  // Handle QA regeneration
  if (file || urlsChanged) {
    await QAHistory.deleteMany({ bot: bot._id });
    logger.info("Deleted previous QAs before regeneration", { botId });

    const processingPromises = [];

    // 1. If new scraped content (and URLs changed)
    if (urlsChanged && parsedScrapedContent.length > 0) {
      processingPromises.push(
        processMarkdownContent(
          parsedScrapedContent,
          bot._id,
          name,
          description
        ).catch((err) => {
          logger.error("Error in markdown reprocessing", {
            botId,
            error: err.message,
          });
          return 0;
        })
      );
    }

    // 2. If new PDF uploaded
    if (file) {
      processingPromises.push(
        processPDFContent(file, bot._id, name, description).catch((err) => {
          logger.error("Error in PDF reprocessing", {
            botId,
            error: err.message,
          });
          return 0;
        })
      );
    }

    await Promise.allSettled(processingPromises);
  }

  await bot.save();
  logger.info("Bot updated and saved successfully", {
    botId,
    userId,
    urlsChanged,
  });

  return bot;
};

exports.getCustomization = async (botId) => {
  if (!botId) {
    logger.error("Get customization failed: Bot ID missing");
    throw new Error("Bot ID is required");
  }

  logger.info("Fetching customization", { botId });

  const customization = await Customization.findOne({ botId });

  if (customization) {
    logger.info("Customization fetched successfully", { botId });
  } else {
    logger.warn("No customization found", { botId });
  }

  return customization;
};

exports.saveCustomization = async (botId, data) => {
  if (!botId) {
    logger.error("Save customization failed: Bot ID missing");
    throw new Error("Bot ID is required");
  }

  logger.info("Saving customization", { botId, data });

  const customization = await Customization.findOneAndUpdate(
    { botId },
    { ...data, botId },
    { new: true, upsert: true }
  );

  logger.info("Customization saved successfully", { botId });
  return customization;
};

exports.getAllChatHistories = async (botId) => {
  logger.info("Service: Retrieving all chat histories", { botId });

  const bot = await ChatBot.findById(botId);
  if (!bot) {
    logger.warn("Bot not found while fetching histories", { botId });
    throw new Error("Bot not found");
  }

  const sessions = await FlowSession.find({ bot: botId }).sort({
    createdAt: -1,
  });

  logger.info("Service: Successfully retrieved chat histories", {
    botId,
    totalSessions: sessions.length,
  });

  return { botId, totalSessions: sessions.length, sessions };
};

exports.getChatHistoryBySession = async (botId, sessionId) => {
  logger.info("Service: Retrieving specific chat history", {
    botId,
    sessionId,
  });

  const bot = await ChatBot.findById(botId);
  if (!bot) {
    logger.warn("Bot not found while fetching specific history", {
      botId,
      sessionId,
    });
    throw new Error("Bot not found");
  }

  const session = await FlowSession.findOne({ _id: sessionId, bot: botId });
  if (!session) {
    logger.warn("Chat session not found", { botId, sessionId });
    throw new Error("Chat history not found");
  }

  const history = session.history || [];

  // ✅ Filter out unwanted "extra" entries:
  // - type = question/confirmation
  // - content is object (not string)
  // - immediately follows a user_input of the same node
  const cleanedHistory = history.filter((entry, index) => {
    const prev = history[index - 1];

    const isExtra =
      (entry.type === "question" || entry.type === "confirmation") &&
      typeof entry.content === "object" &&
      prev?.type === "user_input" &&
      prev?.nodeId === entry.nodeId;

    return !isExtra;
  });

  logger.info("Service: Successfully retrieved and cleaned chat history", {
    botId,
    sessionId,
    originalLength: history.length,
    cleanedLength: cleanedHistory.length,
  });

  return {
    botId,
    sessionId,
    history: cleanedHistory,
    currentNodeId: session.currentNodeId,
    isFinished: session.isFinished,
    createdAt: session.createdAt,
    lastUpdatedAt: session.lastUpdatedAt,
  };
};
