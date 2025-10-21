const mongoose = require("mongoose");

const slackIntegrationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  slackAccessToken: { type: String, required: true },
  slackTeamId: String,
  slackTeamName: String,
  slackAuthedUserId: String,
});

module.exports = mongoose.model("SlackIntegration", slackIntegrationSchema);
