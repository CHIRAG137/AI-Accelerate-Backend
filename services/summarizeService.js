const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.summarizeWithGemini = async (messages, botName) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Combine all messages into a single conversation text
    const conversationText = messages
      .map(
        (msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`
      )
      .join("\n\n");

    const prompt = `
You are an AI summarizer. Summarize the following conversation between a user and a chatbot named ${botName}.
Provide a clear, concise summary highlighting key points, decisions, and tone.
Format it in 4 bullet points keeping bullet points concise and short.

Conversation:
${conversationText}
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return text;
  } catch (error) {
    console.error("Gemini summarization failed:", error);
    throw new Error("Failed to summarize conversation using Gemini.");
  }
};
