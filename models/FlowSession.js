const mongoose = require("mongoose");

const FlowSessionSchema = new mongoose.Schema({
  bot: { type: mongoose.Schema.Types.ObjectId, ref: "ChatBot", required: true },
  currentNodeId: { type: String, default: null },
  variables: { type: mongoose.Schema.Types.Mixed, default: {} },
  history: { type: Array, default: [] },
  isFinished: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  lastUpdatedAt: { type: Date, default: Date.now },
});

FlowSessionSchema.pre("save", function (next) {
  this.lastUpdatedAt = new Date();
  next();
});

module.exports = mongoose.model("FlowSession", FlowSessionSchema);
