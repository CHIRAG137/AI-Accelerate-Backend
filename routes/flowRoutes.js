const express = require("express");
const router = express.Router();
const flowController = require("../controllers/flowController");

// start a new session for a bot
router.post("/start/:botId", flowController.startFlow);

// respond to a session waiting for input
// body: { input: "Chirag", optionIndexOrLabel: 0 }
router.post("/session/:sessionId/respond", flowController.respondToFlow);

module.exports = router;
