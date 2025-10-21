// TODO: Uncomment this code
// require("dotenv").config();
// const { OpenAI } = require("openai");
// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// exports.generateQAsViaGPT = async (textChunk, botName, botDescription) => {
//   try {
//     const systemPrompt = `
// You are an AI assistant that helps generate valuable, context-aware Q&A pairs from user-provided documents.

// The chatbot being built is named **${botName}**.
// Its purpose/description is: **${botDescription}**.

// Based on the chunk of document text provided, extract meaningful questions and answers that reflect the tone and intent of this bot.
// Focus on generating **informative, helpful, and on-topic Q&A pairs** that align with the bot's purpose.
// Return only a list of 10–15 questions and answers in JSON format like this:

// [
//   { "question": "...", "answer": "..." },
//   ...
// ]
//     `;

//     const userPrompt = `Here is a chunk of the document:\n\n${textChunk}\n\nGenerate Q&A pairs now.`;

//     const completion = await openai.chat.completions.create({
//       model: "gpt-4",
//       messages: [
//         { role: "system", content: systemPrompt },
//         { role: "user", content: userPrompt },
//       ],
//       temperature: 0.7,
//     });

//     const responseText = completion.choices[0].message.content;

//     // Parse the JSON block
//     const qas = JSON.parse(responseText);
//     return Array.isArray(qas) ? qas : [];
//   } catch (error) {
//     console.error("Error in generateQAsViaGPT:", error);
//     return [];
//   }
// };

// exports.getEmbedding = async (text) => {
//   const response = await openai.embeddings.create({
//     model: 'text-embedding-ada-002',
//     input: text
//   });

//   return new Float32Array(response.data[0].embedding);
// };

require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Generates Q&A pairs using Gemini.
 * @param {string} textChunk - Text chunk to process
 * @param {string} botName - Name of the bot
 * @param {string} botDescription - Description of the bot
 * @returns {Promise<Array<{question: string, answer: string}>>}
 */
exports.generateQAsViaGPT = async (textChunk, botName, botDescription) => {
  try {
    const systemPrompt = `
You are an AI assistant that helps generate valuable, context-aware Q&A pairs from user-provided documents.

The chatbot being built is named **${botName}**.
Its purpose/description is: **${botDescription}**.

Based on the chunk of document text provided, extract meaningful questions and answers that reflect the tone and intent of this bot.
Focus on generating **informative, helpful, and on-topic Q&A pairs** that align with the bot's purpose.
Return only a list of 10–15 questions and answers in JSON format like this:

[
  { "question": "...", "answer": "..." },
  ...
]
`;

    const userPrompt = `Here is a chunk of the document:\n\n${textChunk}\n\nGenerate Q&A pairs now.`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `${systemPrompt}\n\n${userPrompt}`;

    const result = await model.generateContent(prompt);

    const responseText = result.response.text();

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    const qas = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    return Array.isArray(qas) ? qas : [];
  } catch (error) {
    console.error("Error in generateQAsViaGPT (Gemini):", error);
    return [];
  }
};

/**
 * Generates an embedding vector using Gemini.
 * @param {string} text
 * @returns {Promise<Float32Array>}
 */
exports.getEmbedding = async (text) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const result = await model.embedContent(text);
    return new Float32Array(result.embedding.values);
  } catch (error) {
    console.error("Error generating embedding (Gemini):", error);
    return new Float32Array();
  }
};
