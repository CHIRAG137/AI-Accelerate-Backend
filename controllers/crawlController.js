const firecrawlService = require("../services/firecrawlService");
const logger = require("../utils/logger");
const responseBuilder = require("../utils/responseBuilder");

exports.crawlWebsite = async (req, res) => {
  try {
    logger.info("Crawl website request received", { body: req.body });
    const result = await firecrawlService.crawlWebsite(req.body);

    logger.info("Crawl website completed successfully", { result });
    return responseBuilder.ok(res, result, "Website crawled successfully");
  } catch (error) {
    logger.error("Firecrawl crawlWebsite error", { error: error.message });
    return responseBuilder.internalError(res, null, "Failed to crawl website");
  }
};

exports.scrapeUrls = async (req, res) => {
  try {
    logger.info("Scrape URLs request received", { body: req.body });
    const result = await firecrawlService.scrapeUrls(req.body);

    logger.info("Scrape URLs completed successfully", { result });
    return responseBuilder.ok( res, result, "Batch URLs scraped successfully");
  } catch (error) {
    logger.error("Firecrawl scrapeUrls error", { error: error.message });
    return responseBuilder.internalError( res, null, "Failed to scrape batch URLs");
  }
};

exports.getScrapeResult = async (req, res) => {
  try {
    const { jobId } = req.params;
    logger.info("Get scrape result request received", { jobId });

    const result = await firecrawlService.getScrapeResult(jobId);

    logger.info("Scrape result fetched successfully", { jobId, statusCode: result.statusCode});
    return responseBuilder.ok( res, result.statusCode, result.response, "Scrape result fetched");
  } catch (error) {
    logger.error("Firecrawl getScrapeResult error", { error: error.message });
    return responseBuilder.internalError( res, null, "Failed to fetch job result");
  }
};
