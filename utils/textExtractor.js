const fs = require("fs");
const pdfParse = require("pdf-parse");

/**
 * Extracts plain text from a PDF file at the given file path.
 * @param {string} filePath - Path to the uploaded PDF file.
 * @returns {Promise<string>} Extracted text from the PDF.
 */
exports.extractTextFromPDF = async (filePath) => {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(fileBuffer);

    // Clean and normalize extracted text
    const cleanedText = data.text.replace(/\s+/g, " ").trim();

    return cleanedText;
  } catch (err) {
    console.error("Error extracting text from PDF:", err);
    return "";
  }
};
