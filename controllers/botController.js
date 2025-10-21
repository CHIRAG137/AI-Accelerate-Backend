const botService = require("../services/botService");
const logger = require("../utils/logger");
const responseBuilder = require("../utils/responseBuilder");
const { getBotAnalytics } = require("../services/elasticService");

exports.createBot = async (req, res) => {
  try {
    const result = await botService.createBot(req);

    logger.info("Bot created successfully with Elastic", { 
      userId: req.user?._id, 
      botId: result.bot_id,
      searchEngine: 'elasticsearch' 
    });
    
    return responseBuilder.created(res, result, result.message);
  } catch (error) {
    logger.error("Create bot error", { 
      error: error.message, 
      stack: error.stack 
    });
    return responseBuilder.internalError(res, "Failed to create bot");
  }
};

exports.askBot = async (req, res) => {
  try {
    const { question, botId } = req.body;
    
    if (!question || !botId) {
      return responseBuilder.badRequest(res, "Missing required fields: question and botId");
    }

    const result = await botService.askBot(question, botId);

    logger.info("Bot answered question via Elastic hybrid search", { 
      botId, 
      question: question.substring(0, 50),
      source: result.source,
      confidence: result.confidence
    });
    
    return responseBuilder.ok(res, result, "Bot responded successfully");
  } catch (error) {
    logger.error("Ask bot error", { 
      error: error.message, 
      stack: error.stack 
    });
    return responseBuilder.error(res, "Failed to get bot response");
  }
};

/**
 * New endpoint: Get bot analytics from Elasticsearch
 */
exports.getBotAnalytics = async (req, res) => {
  try {
    const { botId } = req.params;
    
    if (!botId) {
      return responseBuilder.badRequest(res, "Bot ID is required");
    }

    const analytics = await getBotAnalytics(botId);

    logger.info("Bot analytics retrieved", { 
      botId, 
      totalQAs: analytics.total 
    });
    
    return responseBuilder.ok(res, analytics, "Analytics retrieved successfully");
  } catch (error) {
    logger.error("Get bot analytics error", { 
      error: error.message, 
      stack: error.stack 
    });
    return responseBuilder.error(res, "Failed to retrieve analytics");
  }
};

/**
 * New endpoint: Advanced search with custom parameters
 */
exports.advancedSearch = async (req, res) => {
  try {
    const { question, botId, searchOptions } = req.body;
    
    if (!question || !botId) {
      return responseBuilder.badRequest(res, "Missing required fields: question and botId");
    }

    const { getEmbedding } = require("../utils/gptUtils");
    const { advancedHybridSearch } = require("../services/elasticService");

    const embedding = await getEmbedding(question);
    const results = await advancedHybridSearch(botId, question, embedding, searchOptions || {});

    logger.info("Advanced search completed", { 
      botId, 
      resultsCount: results.results.length 
    });
    
    return responseBuilder.ok(res, results, "Search completed successfully");
  } catch (error) {
    logger.error("Advanced search error", { 
      error: error.message, 
      stack: error.stack 
    });
    return responseBuilder.error(res, "Failed to perform search");
  }
};

exports.getAllChatBots = async (req, res) => {
  try {
    const userId = req.user.id;
    const bots = await botService.getAllChatBots(userId);

    logger.info("Fetched all chat bots", { userId, count: bots.length });
    return responseBuilder.ok(res, { bots }, "Chat bots fetched successfully");
  } catch (error) {
    logger.error("Error fetching all chat bots", { error: error.message });
    return responseBuilder.internalError(res, "Failed to fetch bots");
  }
};

exports.getBotById = async (req, res) => {
  try {
    const botId = req.params.botId;
    const bot = await botService.getBotById(botId);

    if (!bot) {
      logger.warn("Bot not found", { botId });
      return responseBuilder.notFound(res, null, "Bot not found");
    }

    logger.info("Fetched bot by ID", { botId });
    return responseBuilder.ok(res, bot, "Bot fetched successfully");
  } catch (error) {
    logger.error("Error fetching bot by ID", { error: error.message, botId: req.params.botId });
    return responseBuilder.internalError(res, "Server error");
  }
};

exports.deleteBot = async (req, res) => {
  try {
    const userId = req.user.id;
    const botId = req.params.botId;
    await botService.deleteBot(botId, userId);

    logger.info("Bot deleted successfully", { botId, userId });
    return responseBuilder.ok(res, null, "Bot and associated data deleted successfully");
  } catch (error) {
    logger.error("Error deleting bot", { error: error.message, botId: req.params.botId, userId: req.user.id });
    return responseBuilder.internalError(res, "Failed to delete bot");
  }
};

exports.updateBot = async (req, res) => {
  try {
    const userId = req.user.id;
    const botId = req.params.botId;
    const file = req.file;

    const updatedBot = await botService.updateBot(botId, userId, req.body, file);

    logger.info("Bot updated successfully", { botId, userId });
    return responseBuilder.ok(
      res,
      updatedBot,
      "Bot updated successfully. Previous QAs replaced with new ones (if file uploaded) and added to Slack channel (if enabled)."
    );
  } catch (error) {
    logger.error("Error updating bot", { error: error.message, botId: req.params.botId, userId: req.user.id });
    return responseBuilder.internalError(res, "Failed to update bot");
  }
};

exports.getCustomization = async (req, res) => {
  try {
    const { botId } = req.params;
    logger.info("Fetching customization", { botId, userId: req.user?.id });

    const customization = await botService.getCustomization(botId);

    logger.info("Customization fetched successfully", { botId, userId: req.user?.id });
    return responseBuilder.ok(res, customization, "Customization fetched successfully");
  } catch (error) {
    logger.error("Error fetching customization", { error: error.message, botId: req.params.botId, userId: req.user?.id });
    return responseBuilder.internalError(res, null, "Failed to fetch customization");
  }
};

exports.saveCustomization = async (req, res) => {
  try {
    const { botId } = req.params;
    logger.info("Saving customization", { botId, userId: req.user?.id, body: req.body });

    const customization = await botService.saveCustomization(botId, req.body);

    logger.info("Customization saved successfully", { botId, userId: req.user?.id });
    return responseBuilder.ok(res, customization, "Customization saved successfully");
  } catch (error) {
    logger.error("Error saving customization", { error: error.message, botId: req.params.botId, userId: req.user?.id });
    return responseBuilder.internalError(res, null, "Failed to save customization");
  }
};

exports.getAllChatHistories = async (req, res) => {
  const { botId } = req.params;
  try {
    logger.info("Fetching all chat histories", { botId, userId: req.user?.id });

    const result = await botService.getAllChatHistories(botId);

    logger.info("Fetched all chat histories successfully", { botId, userId: req.user?.id, totalSessions: result.totalSessions });

    return responseBuilder.ok(res, result, "Chat histories fetched successfully");
  } catch (error) {
    logger.error("Error fetching all chat histories", { error: error.message, botId, userId: req.user?.id });

    return responseBuilder.internalError(res, null, "Failed to fetch chat histories");
  }
};

exports.getChatHistoryBySession = async (req, res) => {
  const { botId, sessionId } = req.params;
  try {
    logger.info("Fetching specific chat history", { botId, sessionId, userId: req.user?.id });

    const result = await botService.getChatHistoryBySession(botId, sessionId);

    logger.info("Fetched specific chat history successfully", { botId, sessionId, userId: req.user?.id });

    return responseBuilder.ok(res, result, "Chat history fetched successfully");
  } catch (error) {
    logger.error("Error fetching specific chat history", { error: error.message, botId, sessionId, userId: req.user?.id });

    return responseBuilder.internalError(res, null, "Failed to fetch chat history");
  }
};
