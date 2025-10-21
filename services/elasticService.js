const { esClient, INDICES } = require('../config/elasticSearch');
const logger = require('../utils/logger');

/**
 * Index a Q&A pair with embedding for hybrid search
 */
async function indexQA(botId, question, answer, embedding, metadata = {}) {
  try {
    const doc = {
      bot_id: botId,
      question,
      answer,
      embedding: Array.from(embedding), // Convert Float32Array to regular array
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata
    };

    const result = await esClient.index({
      index: INDICES.QA_HISTORY,
      document: doc,
      refresh: true // Make immediately searchable
    });

    logger.debug('Q&A indexed in Elasticsearch', {
      botId,
      docId: result._id,
      question: question.substring(0, 50)
    });

    return result._id;
  } catch (error) {
    logger.error('Failed to index Q&A in Elasticsearch', {
      error: error.message,
      botId
    });
    throw error;
  }
}

/**
 * Bulk index multiple Q&As for better performance
 */
async function bulkIndexQAs(qaPairs) {
  try {
    const operations = qaPairs.flatMap(({ botId, question, answer, embedding, metadata }) => [
      { index: { _index: INDICES.QA_HISTORY } },
      {
        bot_id: botId,
        question,
        answer,
        embedding: Array.from(embedding),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: metadata || {}
      }
    ]);

    const result = await esClient.bulk({
      operations,
      refresh: true
    });

    if (result.errors) {
      const errors = result.items.filter(item => item.index?.error);
      logger.warn('Some Q&As failed to index', { errorCount: errors.length });
    }

    logger.info('Bulk indexed Q&As', {
      total: qaPairs.length,
      errors: result.errors ? 'yes' : 'no'
    });

    return result;
  } catch (error) {
    logger.error('Failed to bulk index Q&As', { error: error.message });
    throw error;
  }
}

/**
 * Hybrid search: Combines semantic (vector) search with keyword (BM25) search
 * This is the core of Elastic's hybrid search capability
 */
async function hybridSearch(botId, query, embedding, options = {}) {
  const {
    size = 5,
    semanticWeight = 0.7, // Weight for semantic search
    keywordWeight = 0.3,  // Weight for keyword search
    minScore = 0.5
  } = options;

  try {
    // Perform hybrid search using RRF (Reciprocal Rank Fusion)
    const result = await esClient.search({
      index: INDICES.QA_HISTORY,
      body: {
        size,
        min_score: minScore,
        query: {
          bool: {
            must: [
              { term: { bot_id: botId } }
            ],
            should: [
              // Semantic search using vector similarity (kNN)
              {
                script_score: {
                  query: { match_all: {} },
                  script: {
                    source: `
                      cosineSimilarity(params.query_vector, 'embedding') * params.weight
                    `,
                    params: {
                      query_vector: Array.from(embedding),
                      weight: semanticWeight
                    }
                  }
                }
              },
              // Keyword search using BM25
              {
                multi_match: {
                  query,
                  fields: ['question^2', 'answer'], // Boost question matches
                  type: 'best_fields',
                  boost: keywordWeight
                }
              }
            ],
            minimum_should_match: 1
          }
        },
        // Add aggregations for analytics
        aggs: {
          avg_score: {
            avg: {
              script: {
                source: "cosineSimilarity(params.query_vector, 'embedding')",
                params: {
                  query_vector: Array.from(embedding)
                }
              }
            }
          }
        }
      }
    });

    const hits = result.hits.hits.map(hit => ({
      id: hit._id,
      score: hit._score,
      question: hit._source.question,
      answer: hit._source.answer,
      metadata: hit._source.metadata,
      created_at: hit._source.created_at
    }));

    logger.info('Hybrid search completed', {
      botId,
      query: query.substring(0, 50),
      resultsCount: hits.length,
      topScore: hits[0]?.score || 0,
      avgScore: result.aggregations?.avg_score?.value || 0
    });

    return {
      results: hits,
      total: result.hits.total.value,
      avgScore: result.aggregations?.avg_score?.value || 0
    };
  } catch (error) {
    logger.error('Hybrid search failed', {
      error: error.message,
      botId,
      query
    });
    throw error;
  }
}

/**
 * Advanced hybrid search with RRF (Reciprocal Rank Fusion)
 * This provides better result ranking by combining multiple search strategies
 */
async function advancedHybridSearch(botId, query, embedding, options = {}) {
  const { size = 5, minScore = 0.5 } = options;

  try {
    // Execute multiple searches in parallel
    const [vectorResults, keywordResults] = await Promise.all([
      // Pure vector search
      esClient.search({
        index: INDICES.QA_HISTORY,
        body: {
          size: size * 2,
          query: {
            bool: {
              must: [
                { term: { bot_id: botId } }
              ],
              filter: [
                {
                  script: {
                    script: {
                      source: "cosineSimilarity(params.query_vector, 'embedding') > params.min_score",
                      params: {
                        query_vector: Array.from(embedding),
                        min_score: minScore
                      }
                    }
                  }
                }
              ]
            }
          },
          script_fields: {
            vector_score: {
              script: {
                source: "cosineSimilarity(params.query_vector, 'embedding')",
                params: {
                  query_vector: Array.from(embedding)
                }
              }
            }
          }
        }
      }),
      // Pure keyword search
      esClient.search({
        index: INDICES.QA_HISTORY,
        body: {
          size: size * 2,
          query: {
            bool: {
              must: [
                { term: { bot_id: botId } },
                {
                  multi_match: {
                    query,
                    fields: ['question^3', 'answer^1'],
                    type: 'best_fields',
                    fuzziness: 'AUTO'
                  }
                }
              ]
            }
          }
        }
      })
    ]);

    // Apply Reciprocal Rank Fusion
    const rrfResults = applyRRF(
      vectorResults.hits.hits,
      keywordResults.hits.hits,
      { k: 60 }
    );

    const topResults = rrfResults.slice(0, size).map(item => ({
      id: item._id,
      score: item.rrf_score,
      vector_score: item.vector_score,
      keyword_score: item.keyword_score,
      question: item._source.question,
      answer: item._source.answer,
      metadata: item._source.metadata,
      created_at: item._source.created_at
    }));

    logger.info('Advanced hybrid search completed', {
      botId,
      query: query.substring(0, 50),
      resultsCount: topResults.length,
      topScore: topResults[0]?.score || 0
    });

    return {
      results: topResults,
      total: rrfResults.length,
      searchMethods: ['vector', 'keyword', 'rrf']
    };
  } catch (error) {
    logger.error('Advanced hybrid search failed', {
      error: error.message,
      botId,
      query
    });
    throw error;
  }
}

/**
 * Apply Reciprocal Rank Fusion algorithm
 */
function applyRRF(vectorResults, keywordResults, options = {}) {
  const { k = 60 } = options;
  const scoreMap = new Map();

  // Process vector results
  vectorResults.forEach((hit, index) => {
    const id = hit._id;
    const rrfScore = 1 / (k + index + 1);
    const vectorScore = hit.fields?.vector_score?.[0] || hit._score;
    
    scoreMap.set(id, {
      ...hit,
      rrf_score: rrfScore,
      vector_score: vectorScore,
      keyword_score: 0,
      vector_rank: index + 1
    });
  });

  // Process keyword results
  keywordResults.forEach((hit, index) => {
    const id = hit._id;
    const rrfScore = 1 / (k + index + 1);
    
    if (scoreMap.has(id)) {
      const existing = scoreMap.get(id);
      existing.rrf_score += rrfScore;
      existing.keyword_score = hit._score;
      existing.keyword_rank = index + 1;
    } else {
      scoreMap.set(id, {
        ...hit,
        rrf_score: rrfScore,
        vector_score: 0,
        keyword_score: hit._score,
        keyword_rank: index + 1
      });
    }
  });

  // Sort by combined RRF score
  return Array.from(scoreMap.values())
    .sort((a, b) => b.rrf_score - a.rrf_score);
}

/**
 * Get analytics for a bot's Q&A performance
 */
async function getBotAnalytics(botId) {
  try {
    const result = await esClient.search({
      index: INDICES.QA_HISTORY,
      body: {
        size: 0,
        query: {
          term: { bot_id: botId }
        },
        aggs: {
          total_qas: {
            value_count: { field: 'question.keyword' }
          },
          recent_qas: {
            date_histogram: {
              field: 'created_at',
              calendar_interval: 'day',
              min_doc_count: 0
            }
          },
          top_questions: {
            terms: {
              field: 'question.keyword',
              size: 10
            }
          }
        }
      }
    });

    return {
      total: result.aggregations.total_qas.value,
      recentActivity: result.aggregations.recent_qas.buckets,
      topQuestions: result.aggregations.top_questions.buckets
    };
  } catch (error) {
    logger.error('Failed to get bot analytics', { error: error.message, botId });
    throw error;
  }
}

module.exports = {
  indexQA,
  bulkIndexQAs,
  hybridSearch,
  advancedHybridSearch,
  getBotAnalytics
};