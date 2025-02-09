#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  BedrockClient,
  ListFoundationModelsCommand,
} from '@aws-sdk/client-bedrock';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';

console.log(process.env.AWS_REGION, 'process.env.AWS_REGION');
const MAX_TOKENS = 8192;
const TOKEN_ESTIMATE_PER_CHAR = 4;
const MAX_CHAR_LENGTH = MAX_TOKENS * TOKEN_ESTIMATE_PER_CHAR;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const args = process.argv.slice(2);
const modelArg = args.find((arg) => arg.startsWith('--model'));
const stsClient = new STSClient({});
const MAX_RESOURCES_PER_REQUEST = 10;
const MAX_RESOURCE_CHAR_LENGTH = MAX_CHAR_LENGTH / 2;

const userPreferredModel = modelArg
  ? modelArg.includes('=')
    ? modelArg.split('=')[1] // Handles "--model=value"
    : args[args.indexOf('--model') + 1] // Handles "--model value"
  : null;

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

const bedrockRuntimeClient = new BedrockRuntimeClient({});

interface CloudFormationStack {
  Resources: Record<string, CloudFormationResource>;
  Mappings?: Record<string, unknown>;
  Conditions?: Record<string, unknown>;
  Outputs?: Record<string, unknown>;
  Metadata?: Record<string, unknown>;
}

interface CloudFormationResource {
  Type: string;
  Properties: {
    PolicyDocument?: {
      Statement?: Array<{
        Action?: string;
      }>;
    };
    SecurityGroupIngress?: Array<{
      CidrIp?: string;
    }>;
    [key: string]: unknown;
  };
  Metadata?: {
    'aws:cdk:path'?: string;
  };
}

interface BedrockResponse {
  inputTextTokenCount: number;
  results: [
    {
      outputText: string;
      tokenCount: number;
      completionReason?: string;
    },
  ];
  outputTokens: number;
}

interface AIAnalysis {
  recommendations?: string[];
  inputTokens?: number;
  outputTokens?: number;
}

interface AnalysisResult {
  issues: string[];
  recommendations: string[];
  optimizations: string[];
  timestamp: string;
  status: string;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  };
}

// Token pricing based on AWS Bedrock Anthropic Claude Instant model
const INPUT_COST_PER_1000 = 0.00163;
const OUTPUT_COST_PER_1000 = 0.00551;

const analyzeOnlyIndex = args.findIndex((arg) =>
  arg.startsWith('--analyze-only=')
);
const analyzeOnlyResources =
  analyzeOnlyIndex !== -1
    ? args[analyzeOnlyIndex]
        .split('=')[1]
        .split(',')
        .map((r) => r.trim().toUpperCase())
    : null;

const normalizeResourceType = (resourceType: string): string => {
  return resourceType.replace('AWS::', '').split('::')[0].toUpperCase();
};

const findCDKFilePath = (cdkPath: string): string | null => {
  const srcDir = path.resolve('lib');
  if (!fs.existsSync(srcDir)) return null;

  const files = fs.readdirSync(srcDir).filter((file) => file.endsWith('.ts'));
  for (const file of files) {
    const filePath = path.join(srcDir, file);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    if (fileContent.includes(cdkPath.split('/')[1])) {
      return filePath;
    }
  }
  return null;
};

const checkBedrockAccess = async (): Promise<boolean> => {
  try {
    const identity = await stsClient.send(new GetCallerIdentityCommand({}));
    console.log(`✅ AWS Account ID: ${identity.Account}`);
    console.log(`✅ AWS Region: ${AWS_REGION}`);
    console.log('🔍 Checking Bedrock access...');

    const foundationModelsCommand = new ListFoundationModelsCommand({});
    await bedrockClient.send(foundationModelsCommand);
    console.log('✅ Bedrock access confirmed.');
    return true;
  } catch (error: any) {
    if (error.name === 'AccessDeniedException') {
      console.error(
        "❌ Access Denied: Ensure your IAM role has 'bedrock:ListFoundationModels' and 'bedrock:InvokeModel' permissions."
      );
    } else {
      console.error('❌ Error checking Bedrock access:', error);
    }
    return false;
  }
};

const getAvailableModels = async (): Promise<string | null> => {
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

// CLI entry point
const main = async (): Promise<void> => {
  console.log('🔍 Running CDK Synth...');

  try {
    if (!(await checkBedrockAccess())) {
      console.error('❌ AWS Bedrock access check failed. Exiting.');
      process.exit(1);
    }

    execSync('cdk synth --json > cdk-output.json', { stdio: 'inherit' });
    console.log('✅ CDK Synth complete. Parsing output...');

    const synthOutputPath = path.resolve('cdk-output.json');
    if (!fs.existsSync(synthOutputPath)) {
      console.error(
        '❌ No CDK output found. Ensure `cdk synth` ran correctly.'
      );
      process.exit(1);
    }

    const rawData = fs.readFileSync(synthOutputPath, 'utf-8');
    const cloudFormation: CloudFormationStack = JSON.parse(rawData);

    console.log('🔍 Analyzing CloudFormation template...');
    await analyzeStack(cloudFormation);
  } catch (error) {
    console.error('❌ Error running CDK Synth:', error);
    process.exit(1);
  }
};

const analyzeStack = async (stack: CloudFormationStack): Promise<void> => {
  if (!stack?.Resources) throw new Error('No resources found in stack');

  const issues: string[] = [];
  const recommendations: string[] = [];
  const optimizations: string[] = [];

  for (const [resourceId, resource] of Object.entries(stack.Resources)) {
    if (
      resource.Type === 'AWS::IAM::Policy' &&
      resource.Properties?.PolicyDocument?.Statement?.some(
        (stmt: any) => stmt.Action === '*'
      )
    ) {
      issues.push(
        `🚨 IAM Policy (${resourceId}) allows all actions (*). Consider restricting permissions.`
      );
    }
    if (
      resource.Type === 'AWS::S3::Bucket' &&
      !resource.Properties?.VersioningConfiguration
    ) {
      optimizations.push(
        `💡 Enable versioning on S3 Bucket (${resourceId}) for better data protection.`
      );
    }
    if (
      resource.Type === 'AWS::Lambda::Function' &&
      (Number(resource.Properties?.Timeout) || 0) > 15
    ) {
      optimizations.push(
        `💡 Reduce Lambda function timeout (${resourceId}) if possible to lower execution costs.`
      );
    }
    if (
      resource.Type === 'AWS::DynamoDB::Table' &&
      !resource.Properties?.BillingMode
    ) {
      optimizations.push(
        `💡 Enable auto-scaling on DynamoDB table (${resourceId}) for cost efficiency.`
      );
    }
    if (
      resource.Type === 'AWS::EC2::Instance' &&
      resource.Properties?.InstanceType?.toString().startsWith('t2')
    ) {
      optimizations.push(
        `💡 Consider upgrading EC2 instance (${resourceId}) from t2 to t3 for better cost and performance.`
      );
    }
    if (
      resource.Type === 'AWS::EC2::SecurityGroup' &&
      resource.Properties?.SecurityGroupIngress?.some(
        (rule) => rule.CidrIp === '0.0.0.0/0'
      )
    ) {
      issues.push(
        `🚨 Security Group (${resourceId}) allows unrestricted ingress. Restrict access to specific IP ranges.`
      );
    }
  }

  if (issues.length > 0) {
    console.log('⚠️ Issues detected:');
    issues.forEach((issue) => console.log(' -', issue));
  }

  if (optimizations.length > 0) {
    console.log('✨ Optimization Suggestions:');
    optimizations.forEach((opt) => console.log(' -', opt));
  }

  const aiResponse = await analyzeWithAI(stack);
  if (aiResponse.recommendations) {
    console.log(aiResponse.recommendations, 'aiResponse.recommendations');
    recommendations.push(...aiResponse.recommendations);
  }

  const inputTokens =
    typeof aiResponse.inputTokens === 'number' ? aiResponse.inputTokens : 0;
  const outputTokens =
    typeof aiResponse.outputTokens === 'number' ? aiResponse.outputTokens : 0;
  const estimatedCost =
    (inputTokens / 1000) * INPUT_COST_PER_1000 +
    (outputTokens / 1000) * OUTPUT_COST_PER_1000;

  const analysisResult: AnalysisResult = {
    issues,
    recommendations,
    optimizations,
    timestamp: new Date().toISOString(),
    status: issues.length > 0 ? 'failed' : 'passed',
    tokenUsage: {
      inputTokens: aiResponse.inputTokens || 0,
      outputTokens: aiResponse.outputTokens || 0,
      estimatedCost: estimatedCost,
    },
  };

  fs.writeFileSync(
    'ai-recommendations.json',
    JSON.stringify(analysisResult, null, 2)
  );
  fs.unlinkSync('cdk-output.json');
  console.log('\U0001F4C2 Recommendations saved to ai-recommendations.json');
  console.log(
    `💰 AI Processing Cost: $${estimatedCost.toFixed(4)} (Input: ${aiResponse.inputTokens || 0} tokens, Output: ${aiResponse.outputTokens || 0} tokens)`
  );

  process.exit(issues.length > 0 ? 2 : 0);
};

const truncateResource = (resource: any): any => {
  let jsonString = JSON.stringify(resource, null, 2);
  if (jsonString.length > MAX_RESOURCE_CHAR_LENGTH) {
    console.warn(`⚠️ Resource too large, truncating properties...`);
    jsonString =
      jsonString.substring(0, MAX_RESOURCE_CHAR_LENGTH) + '\n... (truncated)';
  }
  return JSON.parse(jsonString);
};

const analyzeWithAI = async (
  stack: CloudFormationStack
): Promise<AIAnalysis> => {
  try {
    const modelId = await getAvailableModels();

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
          [resourceId]: truncateResource(resource),
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

main();
