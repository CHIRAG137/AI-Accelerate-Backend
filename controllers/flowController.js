const ChatBot = require("../models/ChatBot");
const FlowSession = require("../models/FlowSession");
const flowEngine = require("../services/flowEngineService");

/**
 * Format outputs into display-ready messages
 */
const formatMessagesForDisplay = (outputs, pausedFor = null) => {
  const messages = [];

  // Add all outputs as messages
  outputs.forEach((output) => {
    let content = "";
    
    if (typeof output.content === "string") {
      content = output.content;
    } else if (output.content?.prompt) {
      content = output.content.prompt;
    } else if (output.content?.message) {
      content = output.content.message;
    } else if (output.type === "redirect") {
      content = `Redirecting to: ${output.content}`;
    }

    // Only add messages, not questions/confirmations that were just answered
    if (output.type === "message" || output.type === "redirect") {
      messages.push({
        type: output.type,
        content: content,
        nodeId: output.nodeId,
        awaitingInput: false,
      });
    }
  });

  // Add the paused node as a message if waiting for input
  if (pausedFor) {
    messages.push({
      type: pausedFor.type,
      content: pausedFor.message || pausedFor.prompt || "Please respond",
      nodeId: pausedFor.nodeId,
      options: pausedFor.options || [],
      variable: pausedFor.variable,
      awaitingInput: true, // This message requires user interaction
    });
  }

  return messages;
};

/**
 * Start a new conversation flow for a bot
 */
exports.startFlow = async (req, res) => {
  try {
    console.log("Starting flow...");
    const { botId } = req.params;
    
    const bot = await ChatBot.findById(botId);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const session = new FlowSession({
      bot: bot._id,
      variables: {},
    });

    // Find the start node
    const startNode = flowEngine.findStartNode(bot.conversationFlow);
    if (!startNode) {
      session.isFinished = true;
      await session.save();
      return res.json({
        sessionId: session._id,
        messages: [],
        awaitingInput: null,
        finished: true,
      });
    }

    // Run flow until a pause
    const runResult = await flowEngine.runFrom(
      bot.conversationFlow,
      session,
      startNode.id
    );

    // Save outputs to history
    if (runResult.outputs && runResult.outputs.length > 0) {
      session.history.push(
        ...runResult.outputs.map((o) => ({
          nodeId: o.nodeId,
          type: o.type,
          content: o.content,
          timestamp: new Date(),
          fromUser: false,
        }))
      );
    }

    // Save paused node to history if exists
    if (runResult.pausedFor) {
      session.history.push({
        nodeId: runResult.pausedFor.nodeId,
        type: runResult.pausedFor.type,
        content: runResult.pausedFor.message || runResult.pausedFor.prompt,
        timestamp: new Date(),
        fromUser: false,
        awaitingInput: true,
      });
    }

    session.currentNodeId = runResult.pausedFor
      ? runResult.pausedFor.nodeId
      : runResult.nextNodeId;

    if (!session.currentNodeId) session.isFinished = true;

    await session.save();

    // Format response with all messages to display
    const messages = formatMessagesForDisplay(
      runResult.outputs || [],
      runResult.pausedFor
    );

    return res.json({
      sessionId: session._id,
      messages: messages,
      awaitingInput: runResult.pausedFor
        ? {
            type: runResult.pausedFor.type,
            nodeId: runResult.pausedFor.nodeId,
            variable: runResult.pausedFor.variable,
            options: runResult.pausedFor.options,
          }
        : null,
      finished: session.isFinished,
      variables: session.variables,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * Respond to a flow session with user input or branch selection
 */
exports.respondToFlow = async (req, res) => {
  try {
    console.log("Responding to flow...");
    const { sessionId } = req.params;
    const { input, optionIndexOrLabel } = req.body;

    const session = await FlowSession.findById(sessionId);
    if (!session) return res.status(404).json({ error: "Session not found" });

    if (session.isFinished) {
      return res.json({
        messages: [],
        awaitingInput: null,
        finished: true,
        variables: session.variables,
      });
    }

    const bot = await ChatBot.findById(session.bot);
    if (!bot) return res.status(404).json({ error: "Bot for session not found" });

    const nodeMap = flowEngine.buildNodeMap(bot.conversationFlow);

    // Determine current node
    if (!session.currentNodeId) {
      const startNode = flowEngine.findStartNode(bot.conversationFlow);
      if (!startNode) {
        session.isFinished = true;
        await session.save();
        return res.json({
          messages: [],
          awaitingInput: null,
          finished: true,
        });
      }
      session.currentNodeId = startNode.id;
    }

    const waitingNode = flowEngine.getNode(nodeMap, session.currentNodeId);
    if (!waitingNode) {
      session.isFinished = true;
      await session.save();
      return res.json({
        error: "No node to respond to; session ended",
        messages: [],
        awaitingInput: null,
        finished: true,
      });
    }

    let runResult = null;

    switch (waitingNode.type) {
      case "branch":
        if (
          typeof optionIndexOrLabel === "undefined" &&
          typeof input === "undefined"
        ) {
          return res.status(400).json({
            error:
              "Please provide optionIndexOrLabel (index or label) to select branch option.",
          });
        }

        const optNodeId = flowEngine.findBranchOptionNode(
          nodeMap,
          waitingNode,
          typeof optionIndexOrLabel !== "undefined" ? optionIndexOrLabel : input
        );

        if (!optNodeId)
          return res.status(400).json({ error: "Branch option not recognized" });

        // Save user choice
        session.history.push({
          nodeId: waitingNode.id,
          type: "branch_select",
          content: {
            selectedOptionNodeId: optNodeId,
            selected: optionIndexOrLabel ?? input,
          },
          timestamp: new Date(),
          fromUser: true,
        });

        runResult = await flowEngine.runFrom(
          bot.conversationFlow,
          session,
          optNodeId
        );
        break;

      case "question":
      case "confirmation":
        if (typeof input === "undefined")
          return res
            .status(400)
            .json({ error: "Please provide input for this node." });

        // Save user input
        session.history.push({
          nodeId: waitingNode.id,
          type: "user_input",
          content: input,
          timestamp: new Date(),
          fromUser: true,
        });

        runResult = await flowEngine.runFrom(
          bot.conversationFlow,
          session,
          waitingNode.id,
          input
        );
        break;

      default:
        // For message, redirect, branchOption, unknown, continue flow
        runResult = await flowEngine.runFrom(
          bot.conversationFlow,
          session,
          waitingNode.id
        );
        break;
    }

    // Save outputs to history
    if (runResult.outputs && runResult.outputs.length > 0) {
      session.history.push(
        ...runResult.outputs.map((o) => ({
          nodeId: o.nodeId,
          type: o.type,
          content: o.content,
          timestamp: new Date(),
          fromUser: false,
        }))
      );
    }

    // Save paused node to history if exists
    if (runResult.pausedFor) {
      session.history.push({
        nodeId: runResult.pausedFor.nodeId,
        type: runResult.pausedFor.type,
        content: runResult.pausedFor.message || runResult.pausedFor.prompt,
        timestamp: new Date(),
        fromUser: false,
        awaitingInput: true,
      });
    }

    session.currentNodeId = runResult.pausedFor
      ? runResult.pausedFor.nodeId
      : runResult.nextNodeId;

    if (!session.currentNodeId) session.isFinished = true;

    await session.save();

    // Format response with all messages to display
    const messages = formatMessagesForDisplay(
      runResult.outputs || [],
      runResult.pausedFor
    );

    return res.json({
      messages: messages,
      awaitingInput: runResult.pausedFor
        ? {
            type: runResult.pausedFor.type,
            nodeId: runResult.pausedFor.nodeId,
            variable: runResult.pausedFor.variable,
            options: runResult.pausedFor.options,
          }
        : null,
      finished: session.isFinished,
      variables: session.variables,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};