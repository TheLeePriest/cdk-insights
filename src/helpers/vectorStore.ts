import { sendOpenSearchRequest } from './openSearchClient';

const INDEX_NAME = 'cdk-insights-ai';

/**
 * Stores AI-generated embeddings in OpenSearch Serverless.
 */
export const storeVector = async (
  resourceId: string,
  recommendation: string,
  embedding: number[]
) => {
  try {
    const response = await sendOpenSearchRequest(
      'POST',
      `/${INDEX_NAME}/_doc`,
      {
        resourceId,
        recommendation,
        embedding,
      }
    );

    console.log(`✅ Stored AI embedding for ${resourceId}`, response);
  } catch (error) {
    console.error('❌ Error storing AI embedding:', error);
  }
};
