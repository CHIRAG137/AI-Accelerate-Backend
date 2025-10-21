const summarizerService = require("../services/summarizeService");

exports.summarizeConversation = async (req, res) => {
  try {
    const { messages, botName } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res
        .status(400)
        .json({ status: "error", message: "Messages array is required." });
    }

    const summary = await summarizerService.summarizeWithGemini(
      messages,
      botName
    );

    res.json({
      status: "success",
      summary,
    });
  } catch (error) {
    console.error("Error in summarizeConversation controller:", error);
    res.status(500).json({
      status: "error",
      message: error.message || "Failed to summarize conversation.",
    });
  }
};
