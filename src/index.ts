#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  BedrockClient,
  ListFoundationModelsCommand,
} from '@aws-sdk/client-bedrock';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { analyzeStack } from './analysis/staticAnalysis';
import { analyzeWithAI } from './analysis/aiAnalysis';
import { AnalysisResult } from './analysis/aiAnalysis.type';
import { writeAnalysisResultsFile } from './helpers/writeAnalysisResultsFile';

const MAX_TOKENS = 8192;
const TOKEN_ESTIMATE_PER_CHAR = 4;
const MAX_CHAR_LENGTH = MAX_TOKENS * TOKEN_ESTIMATE_PER_CHAR;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const args = process.argv.slice(2);
const modelArg = args.find((arg) => arg.startsWith('--model'));
const stsClient = new STSClient({});
const MAX_RESOURCE_CHAR_LENGTH = MAX_CHAR_LENGTH / 2;
const INPUT_COST_PER_1000 = 0.00163;
const OUTPUT_COST_PER_1000 = 0.00551;

const userPreferredModel = modelArg
  ? modelArg.includes('=')
    ? modelArg.split('=')[1] // Handles "--model=value"
    : args[args.indexOf('--model') + 1] // Handles "--model value"
  : 'amazon.titan-text-express-v1';

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

const ENABLE_AI = process.argv.includes('--enable-ai');

// Token pricing based on AWS Bedrock Anthropic Claude Instant model

const analyzeOnlyIndex = args.findIndex((arg) =>
  arg.startsWith('--analyze-only=')
);
const analyzeOnlyResources =
  analyzeOnlyIndex !== -1
    ? args[analyzeOnlyIndex]
        .split('=')[1]
        .split(',')
        .map((r) => r.trim().toUpperCase())
    : undefined;

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
    const cloudFormation = JSON.parse(rawData);

    console.log('🔍 Running Static Analysis...');
    const { issues, optimizations } = await analyzeStack(cloudFormation);

    console.log('⚠️ Issues Detected:');
    issues.forEach((issue) => console.log(' -', issue));

    console.log('✨ Optimization Suggestions:');
    optimizations.forEach((opt) => console.log(' -', opt));

    let recommendations: string[] = [];
    let analysisResult: AnalysisResult = {
      issues: [],
      recommendations: [],
      optimizations: [],
      timestamp: '',
      status: '',
    };

    if (ENABLE_AI) {
      console.log('🤖 Performing AI-powered Analysis...');
      const aiResponse = await analyzeWithAI(
        cloudFormation,
        userPreferredModel,
        MAX_RESOURCE_CHAR_LENGTH,
        analyzeOnlyResources
      );
      recommendations = aiResponse.recommendations ?? [];

      const inputTokens =
        typeof aiResponse.inputTokens === 'number' ? aiResponse.inputTokens : 0;
      const outputTokens =
        typeof aiResponse.outputTokens === 'number'
          ? aiResponse.outputTokens
          : 0;
      const estimatedCost =
        (inputTokens / 1000) * INPUT_COST_PER_1000 +
        (outputTokens / 1000) * OUTPUT_COST_PER_1000;

      analysisResult = {
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
    } else {
      analysisResult = {
        issues,
        recommendations,
        optimizations,
        timestamp: new Date().toISOString(),
        status: issues.length > 0 ? 'failed' : 'passed',
      };
    }

    writeAnalysisResultsFile(analysisResult);

    process.exit(issues.length > 0 ? 2 : 0);
  } catch (error) {
    console.error('❌ Error running CDK Synth:', error);
    process.exit(1);
  }
};

main();
