const { Client } = require('@elastic/elasticsearch');
const logger = require('../utils/logger');
require("dotenv").config();

// Initialize Elasticsearch client
const esClient = new Client({
  cloud: {
    id: process.env.ELASTIC_CLOUD_ID, // Your Elastic Cloud ID
  },
  auth: {
    apiKey: process.env.ELASTIC_API_KEY, // Your Elastic API Key
  },
});

// Test connection
const testConnection = async () => {
  try {
    const health = await esClient.cluster.health();
    logger.info('Elasticsearch connected', { status: health.status });
    return true;
  } catch (error) {
    logger.error('Elasticsearch connection failed', { error: error.message });
    return false;
  }
};

// Index names
const INDICES = {
  QA_HISTORY: 'chatbot_qa_history',
  DOCUMENTS: 'chatbot_documents',
};

module.exports = { esClient, testConnection, INDICES };