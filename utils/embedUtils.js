// TODO: Uncomment this code
// const { OpenAI } = require("openai");
// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// /**
//  * Generates an embedding for a given input string using OpenAI's Embedding API.
//  * @param {string} text - Text to embed
//  * @returns {Promise<Float32Array>} - The embedding vector
//  */
// exports.embedText = async (text) => {
//   try {
//     const trimmed = text.trim();
//     if (!trimmed) throw new Error("Empty input for embedding.");

//     const response = await openai.embeddings.create({
//       model: "text-embedding-ada-002",
//       input: trimmed,
//     });

//     const embedding = response.data[0].embedding;
//     return new Float32Array(embedding);
//   } catch (error) {
//     console.error("Embedding error:", error);
//     return new Float32Array();
//   }
// };

exports.cosineSimilarity = (vecA, vecB) => {
  let dot = 0,
    normA = 0,
    normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Generates an embedding for a given input string using Gemini's Embedding API.
 * @param {string} text - Text to embed
 * @returns {Promise<Float32Array>} - The embedding vector
 */
exports.embedText = async (text) => {
  try {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Empty input for embedding.");

    const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

    const result = await model.embedContent(trimmed);

    const embedding = result.embedding.values;
    return new Float32Array(embedding);
  } catch (error) {
    console.error("Embedding error (Gemini):", error);
    return new Float32Array();
  }
};
