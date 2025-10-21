const express = require("express");
const crawlController = require("../controllers/crawlController");

const router = express.Router();

router.post("/search-urls", crawlController.crawlWebsite);
router.post("/urls", crawlController.scrapeUrls);
router.get("/result/:jobId", crawlController.getScrapeResult);

module.exports = router;
