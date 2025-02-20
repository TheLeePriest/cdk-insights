import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

export interface ChatCompletionRequest {
  modelId: string;
  contentType: string;
  accept: string;
  body: string;
}

export interface ChatCompletionResponse {
  completion: string;
}

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * Sends a request to AWS Bedrock to generate AI completion.
 * @param prompt The input prompt for AI
 * @returns The AI-generated response
 */
export const generateAICompletion = async (prompt: string): Promise<string> => {
  try {
    const requestPayload: ChatCompletionRequest = {
      modelId: 'anthropic.claude-v2', // Adjust model ID as needed
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        prompt: prompt,
        max_tokens: 500, // Limit response length
        temperature: 0.7, // Adjust creativity level
      }),
    };

    const command = new InvokeModelCommand(requestPayload);
    const response = await bedrockClient.send(command);

    if (!response.body) throw new Error('AI response body is empty');

    const responseData = JSON.parse(new TextDecoder().decode(response.body));

    return responseData.completion || ''; // Extract AI-generated response
  } catch (error) {
    console.error('❌ Error in AI Completion:', error);
    return ''; // Return an empty string to avoid breaking workflows
  }
};
