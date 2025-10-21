const mongoose = require("mongoose");

const QAHistorySchema = new mongoose.Schema(
  {
    bot: { type: mongoose.Schema.Types.ObjectId, ref: "ChatBot" },
    question: String,
    answer: String,
    embedding: Buffer,
  },
  { timestamps: true }
);

module.exports = mongoose.model("QAHistory", QAHistorySchema);
