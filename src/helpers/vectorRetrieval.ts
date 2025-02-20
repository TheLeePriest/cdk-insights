import { sendOpenSearchRequest } from './openSearchClient';

const INDEX_NAME = 'cdk-insights-ai';

export interface OpenSearchHit<T> {
  _index: string;
  _id: string;
  _score: number;
  _source: T;
}

export interface OpenSearchResponse<T> {
  hits: {
    total: { value: number };
    hits: OpenSearchHit<T>[];
  };
}

interface AIEmbedding {
  resourceId: string;
  recommendation: string;
  embedding: number[];
}

/**
 * Finds similar AI insights using vector search in OpenSearch Serverless.
 */
export const findSimilarInsights = async (embedding: number[]) => {
  try {
    const response: OpenSearchResponse<AIEmbedding> =
      await sendOpenSearchRequest('POST', `/${INDEX_NAME}/_search`, {
        size: 5,
        query: {
          knn: [
            {
              field: 'embedding',
              query_vector: embedding,
              k: 5,
            },
          ],
        },
      });

    return response.hits?.hits?.map((hit) => hit._source.recommendation) || [];
  } catch (error) {
    console.error('❌ Error retrieving similar AI insights:', error);
    return [];
  }
};
