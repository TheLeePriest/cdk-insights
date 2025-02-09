import {
  BedrockClient,
  ListFoundationModelsCommand,
} from '@aws-sdk/client-bedrock';

let bedrockClient: BedrockClient;
try {
  bedrockClient = new BedrockClient({});
} catch (error) {
  console.error(
    '❌ Failed to initialize Bedrock client. Check your AWS credentials:',
    error
  );
  process.exit(1);
}

export const getAvailableModels = async (
  userPreferredModel: string
): Promise<string | null> => {
  try {
    const foundationModelsCommand = new ListFoundationModelsCommand({});
    const foundationModelsResponse = await bedrockClient.send(
      foundationModelsCommand
    );
    const foundationModels =
      foundationModelsResponse.modelSummaries?.map((model) => model.modelId) ||
      [];
    console.log('userPreferredModel', userPreferredModel);
    if (userPreferredModel && foundationModels.includes(userPreferredModel)) {
      return userPreferredModel;
    }

    const preferredModels = [
      'amazon.nova-pro-v1:0',
      'anthropic.claude-v2',
      'anthropic.claude-instant-v1',
      'amazon.titan-text-lite-v1',
      'amazon.titan-text-express-v1',
      'amazon.titan-text-g1-express',
    ];

    for (const model of preferredModels) {
      if (foundationModels.includes(model)) {
        console.log(model, 'the model to use...');
        return model;
      }
    }

    return null;
  } catch (error) {
    console.error('❌ Error fetching available AWS Bedrock models:', error);
    return null;
  }
};
