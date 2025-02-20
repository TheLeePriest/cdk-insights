import { sendOpenSearchRequest } from '../helpers/openSearchClient';

/**
 * Stores AI recommendations in OpenSearch Serverless.
 */
export const storeRecommendations = async (recommendations: any[]) => {
  const indexName = process.env.INDEX_NAME || 'cdk-insights-ai';

  const body = recommendations.map((rec) => ({
    resourceId: rec.resourceId, // Ensure it's anonymized
    recommendation: rec.recommendation,
    embedding: rec.embedding, // If using vector search
    category: rec.category,
    severity: rec.severity,
  }));

  return sendOpenSearchRequest('POST', `/${indexName}/_bulk`, {
    operations: body.flatMap((doc) => [{ index: {} }, doc]), // Bulk insert
  });
};
