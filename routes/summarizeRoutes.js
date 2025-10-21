const express = require("express");
const router = express.Router();
const summarizerController = require("../controllers/summarizeController");

router.post("/", summarizerController.summarizeConversation);

module.exports = router;
