const mongoose = require("mongoose");

const ChatBotSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: String,
    website_url: String,
    description: String,
    is_voice_enabled: { type: Boolean, default: false },
    is_auto_translate: { type: Boolean, default: false },
    is_slack_enabled: { type: Boolean, default: false },
    slack_channel_id: String,
    slack_command: String,
    supported_languages: { type: [String], default: ["English"] },
    primary_purpose: String,
    specialisation_area: String,
    conversation_tone: { type: String, default: "Professional" },
    response_style: { type: String, default: "Helpful & Detailed" },
    target_audience: String,
    key_topics: String,
    keywords: String,
    custom_instructions: String,
    conversationFlow: {
      type: mongoose.Schema.Types.Mixed,
      default: { nodes: [], edges: [] },
    },
    scraped_urls: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ChatBot", ChatBotSchema);
