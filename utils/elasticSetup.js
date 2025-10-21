const { esClient, INDICES } = require('../config/elasticSearch');
const logger = require('./logger');

/**
 * Initialize Elasticsearch indices with proper mappings for hybrid search
 */
async function initializeIndices() {
  try {
    // Create Q&A History Index with dense vector support
    const qaIndexExists = await esClient.indices.exists({ index: INDICES.QA_HISTORY });
    
    if (!qaIndexExists) {
      await esClient.indices.create({
        index: INDICES.QA_HISTORY,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 1,
            analysis: {
              analyzer: {
                custom_text_analyzer: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase', 'stop', 'snowball']
                }
              }
            }
          },
          mappings: {
            properties: {
              bot_id: { type: 'keyword' },
              question: { 
                type: 'text',
                analyzer: 'custom_text_analyzer',
                fields: {
                  keyword: { type: 'keyword' }
                }
              },
              answer: { 
                type: 'text',
                analyzer: 'custom_text_analyzer'
              },
              embedding: {
                type: 'dense_vector',
                dims: 768, // Gemini embedding-001 produces 768-dimensional vectors
                index: true,
                similarity: 'cosine'
              },
              created_at: { type: 'date' },
              updated_at: { type: 'date' },
              metadata: {
                type: 'object',
                properties: {
                  source: { type: 'keyword' },
                  page_number: { type: 'integer' },
                  chunk_index: { type: 'integer' }
                }
              }
            }
          }
        }
      });
      
      logger.info('Q&A History index created successfully', { index: INDICES.QA_HISTORY });
    }

    // Create Documents Index for raw content storage
    const docsIndexExists = await esClient.indices.exists({ index: INDICES.DOCUMENTS });
    
    if (!docsIndexExists) {
      await esClient.indices.create({
        index: INDICES.DOCUMENTS,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 1,
            analysis: {
              analyzer: {
                content_analyzer: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase', 'stop', 'snowball', 'word_delimiter']
                }
              }
            }
          },
          mappings: {
            properties: {
              bot_id: { type: 'keyword' },
              content: { 
                type: 'text',
                analyzer: 'content_analyzer'
              },
              content_type: { type: 'keyword' }, // 'pdf', 'markdown', 'scraped'
              source_url: { type: 'keyword' },
              title: { type: 'text' },
              embedding: {
                type: 'dense_vector',
                dims: 768,
                index: true,
                similarity: 'cosine'
              },
              created_at: { type: 'date' }
            }
          }
        }
      });
      
      logger.info('Documents index created successfully', { index: INDICES.DOCUMENTS });
    }

    return true;
  } catch (error) {
    logger.error('Failed to initialize Elasticsearch indices', { error: error.message });
    throw error;
  }
}

/**
 * Delete and recreate indices (use with caution)
 */
async function resetIndices() {
  try {
    for (const index of Object.values(INDICES)) {
      const exists = await esClient.indices.exists({ index });
      if (exists) {
        await esClient.indices.delete({ index });
        logger.info('Index deleted', { index });
      }
    }
    
    await initializeIndices();
    logger.info('Indices reset successfully');
    return true;
  } catch (error) {
    logger.error('Failed to reset indices', { error: error.message });
    throw error;
  }
}

module.exports = { initializeIndices, resetIndices };