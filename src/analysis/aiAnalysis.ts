import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { findCDKFilePath } from '../helpers/findCDKFilePath';
import { getAvailableModels } from '../helpers/getAvailableModels';
import { normalizeResourceType } from '../helpers/normalizeResourceType';
import { truncateResource } from '../helpers/truncateResource';
import {
  AIAnalysis,
  BedrockResponse,
  CloudFormationStack,
} from './aiAnalysis.type';

const bedrockRuntimeClient = new BedrockRuntimeClient({});

export const analyzeWithAI = async (
  stack: CloudFormationStack,
  userPreferredModel: string,
  maxCharLength: number,
  analyzeOnlyResources?: string[]
): Promise<AIAnalysis> => {
  try {
    const modelId = await getAvailableModels(userPreferredModel);

    if (!modelId) {
      console.error(
        '❌ No available models found in AWS Bedrock. Please check your access permissions.'
      );
      return { recommendations: [], inputTokens: 0, outputTokens: 0 };
    }

    console.log(`🔍 Invoking model: ${userPreferredModel}...`);
    let allRecommendations: string[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const seenResources = new Set<string>();

    for (const [resourceId, resource] of Object.entries(stack.Resources)) {
      if (seenResources.has(resourceId)) continue;
      seenResources.add(resourceId);

      const normalizedType = normalizeResourceType(resource.Type);
      if (
        analyzeOnlyResources &&
        !analyzeOnlyResources.includes(normalizedType)
      )
        continue;

      const cdkPath = resource.Metadata?.['aws:cdk:path'] || 'Unknown';
      const cdkFilePath = findCDKFilePath(cdkPath) || 'Unknown';

      const formattedResource = JSON.stringify(
        {
          [resourceId]: truncateResource(resource, maxCharLength),
          cdkPath,
          cdkFilePath,
        },
        null,
        2
      );

      const requestBody = {
        inputText: `Analyze this CloudFormation resource and highlight any security, cost, or performance issues. Limit your response to a single sentence. Only highlight actual potential issues. Do not include the resource properties in your response.\n\n
          CloudFormation Resource:
          ${formattedResource}`,
      };

      const command = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(requestBody),
      });

      const response = await bedrockRuntimeClient.send(command);
      const responseBody = Buffer.from(response.body).toString('utf-8');
      const result: BedrockResponse = JSON.parse(responseBody);
      const { results, inputTextTokenCount } = result;

      try {
        totalInputTokens += inputTextTokenCount ?? 0;
        totalOutputTokens += results[0].tokenCount ?? 0;

        console.log(results, 'results');
        if (results && results.length > 0) {
          const aiOutputText = results[0].outputText.trim();
          allRecommendations.push(aiOutputText);
        }
      } catch (error) {
        console.warn('⚠️ Failed to parse AI output as JSON, skipping entry.');
      }
    }

    return {
      recommendations: allRecommendations,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    };
  } catch (error) {
    console.error('❌ Error invoking AWS Bedrock AI:', error);
    return { recommendations: [], inputTokens: 0, outputTokens: 0 };
  }
};
