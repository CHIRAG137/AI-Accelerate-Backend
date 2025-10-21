const axios = require("axios");
const logger = require("../utils/logger");

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

exports.crawlWebsite = async ({ url, limit = 100, includeSubdomains = true, ignoreSitemap = true }) => {
  if (!url) {
    logger.error("Crawl website failed: URL missing");
    throw new Error("URL is required");
  }

  logger.info("Starting crawlWebsite request", { url, limit, includeSubdomains, ignoreSitemap });

  try {
    const response = await axios.post(
      "https://api.firecrawl.dev/v1/map",
      { url, limit, includeSubdomains, ignoreSitemap },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        },
      }
    );

    logger.info("CrawlWebsite completed successfully", { url, count: response.data?.results?.length });
    return response.data;
  } catch (error) {
    logger.error("Error in crawlWebsite", { url, error: error.message });
    throw error;
  }
};

exports.scrapeUrls = async ({ urls, formats = ["markdown", "html"] }) => {
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    logger.error("Scrape URLs failed: Invalid or empty array");
    throw new Error("A non-empty array of URLs is required.");
  }

  logger.info("Starting scrapeUrls request", { urlsCount: urls.length, formats });

  try {
    const response = await axios.post(
      "https://api.firecrawl.dev/v1/batch/scrape",
      { urls, formats },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        },
      }
    );

    logger.info("ScrapeUrls request submitted successfully", { jobId: response.data?.jobId });
    return response.data;
  } catch (error) {
    logger.error("Error in scrapeUrls", { error: error.message });
    throw error;
  }
};

exports.getScrapeResult = async (jobId) => {
  if (!jobId) {
    logger.error("Get scrape result failed: Job ID missing");
    throw new Error("Job ID is required");
  }

  logger.info("Fetching scrape result", { jobId });

  try {
    const response = await axios.get(
      `https://api.firecrawl.dev/v1/batch/scrape/${jobId}`,
      {
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        },
      }
    );

    const { status, data } = response.data;
    logger.info("Scrape result received", { jobId, status });

    if (status === "in_progress" || status === "scraping") {
      return {
        statusCode: 202,
        response: { message: "Job is still in progress." },
      };
    }

    if (status === "completed") {
      return {
        statusCode: 200,
        response: { message: "Job completed.", data },
      };
    }

    logger.warn("Unexpected job status received", { jobId, status });
    return {
      statusCode: 500,
      response: { error: "Unexpected job status.", status },
    };
  } catch (error) {
    logger.error("Error fetching scrape result", { jobId, error: error.message });
    throw error;
  }
};
