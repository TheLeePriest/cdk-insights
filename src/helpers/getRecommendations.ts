import { sendOpenSearchRequest } from '../helpers/openSearchClient';

/**
 * Retrieves AI recommendations from OpenSearch.
 */
export const getRecommendations = async (query: string) => {
  const indexName = process.env.INDEX_NAME || 'cdk-insights-ai';

  const searchQuery = {
    query: {
      match: {
        recommendation: query,
      },
    },
    size: 5, // Retrieve top 5 recommendations
  };

  return sendOpenSearchRequest('POST', `/${indexName}/_search`, searchQuery);
};
