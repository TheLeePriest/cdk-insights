import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import pLimit from 'p-limit';
import crypto from 'crypto';
import { CloudFormationResource } from './aiAnalysis.type';

// Define possible security findings
export interface SecurityFinding {
  resource: string;
  issue: string;
  recommendation: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: string;
}

export type AnalysisResults = Record<string, { issues: SecurityFinding[] }>;

// Initialize AWS Bedrock AI Client
const bedrockClient = new BedrockRuntimeClient();
const modelId = process.env.BEDROCK_MODEL_ID || 'amazon.titan-text-express-v1';

// AI rate limiting & caching
const MAX_CONCURRENT_REQUESTS = 10;
const limit = pLimit(MAX_CONCURRENT_REQUESTS);
const CACHE = new Map<string, SecurityFinding[]>();
const MAX_RETRIES = 5; // Maximum retry attempts
const BASE_DELAY = 2000; // Initial delay (2 seconds)
const CONCURRENCY_LIMIT = 2; // Limit concurrent AI requests

enum AnalysisMode {
  Security = 'security',
  CostOptimization = 'cost',
  Compliance = 'compliance',
  RiskScoring = 'risk',
}

const DEFAULT_MODES: AnalysisMode[] = [
  AnalysisMode.Security,
  AnalysisMode.CostOptimization,
  AnalysisMode.Compliance,
  AnalysisMode.RiskScoring,
];

// Generate a hash for caching purposes
const generateResourceHash = (resource: CloudFormationResource): string => {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(resource))
    .digest('hex');
};

// Extract essential resource information to keep AI prompts small
const extractEssentialResourceInfo = (resource: CloudFormationResource) => {
  return {
    Type: resource.Type,
    Properties: Object.keys(resource.Properties || {})
      .slice(0, 5)
      .join(', '),
  };
};

// **Exponential Backoff Retry for Throttling**
const retryWithExponentialBackoff = async <T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delay: number = BASE_DELAY
): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    if (retries === 0 || error['$metadata']?.httpStatusCode !== 429) {
      throw error; // Stop retrying if retries exhausted or different error
    }
    console.warn(`⚠️ Throttled. Retrying in ${delay / 1000}s...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return retryWithExponentialBackoff(fn, retries - 1, delay * 2);
  }
};

const sendPromptToAI = async <T>(prompt: string): Promise<T> => {
  const inputPayload = {
    inputText: prompt,
    textGenerationConfig: {
      maxTokenCount: 1200, // Reduce to prevent cut-off
      temperature: 0.3, // Lower randomness for more structured output
      topP: 0.8, // Encourage concise responses
    },
  };

  const command = new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(inputPayload),
  });

  let retries = 3;
  let delay = 1000;

  while (retries > 0) {
    try {
      const response = await bedrockClient.send(command);
      let responseBody = JSON.parse(new TextDecoder().decode(response.body));
      const [completeMessage] =
        extractJsonFromMarkdown(responseBody.results?.[0]?.outputText) || '';
      console.log(completeMessage, 'the completeMessage');

      if (!completeMessage) {
        throw new Error('AI response did not contain valid results.');
      }

      try {
        return completeMessage as T;
      } catch (jsonError) {
        console.error(
          `❌ Failed to parse AI response outputText as JSON:`,
          completeMessage
        );
        throw new Error('AI outputText did not contain valid JSON.');
      }
    } catch (error: any) {
      if (error['$metadata']?.httpStatusCode === 429) {
        console.warn(`⚠️ Throttled. Retrying in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      } else {
        console.error(`❌ AI request failed:`, error);
        throw error;
      }
    }
    retries--;
  }

  throw new Error('Max retries reached for AI request.');
};

const extractJsonFromResponse = (responseText: string) => {
  try {
    const jsonStart = responseText.indexOf('{');
    const jsonEnd = responseText.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error('JSON not found in AI response.');
    }

    const jsonString = responseText.substring(jsonStart, jsonEnd + 1);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('❌ Failed to extract JSON from AI response:', error);
    return null;
  }
};

const extractJsonFromMarkdown = (response: string): any | null => {
  const parts = response.split('```');

  if (parts.length < 3) {
    console.error('❌ No valid JSON block found in response.');
    return null;
  }

  const jsonString = parts[1].trim();

  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('❌ Failed to parse JSON:', error);
    return null;
  }
};

const generatePrompt = (
  resourceId: string,
  resource: any,
  modes: AnalysisMode[]
): string => {
  const sourceLocation = resource.Metadata?.sourceLocation
    ? `File: ${resource.Metadata.sourceLocation.file}, Line: ${resource.Metadata.sourceLocation.line}`
    : 'Unknown source location';

  // Define descriptions for analysis categories
  const modeDescriptions: Record<AnalysisMode, string> = {
    security: 'Identify security vulnerabilities and misconfigurations.',
    cost: 'Analyze cost inefficiencies and suggest optimizations.',
    compliance: 'Check for compliance violations based on AWS best practices.',
    risk: 'Assess operational risks and stability issues.',
  };

  const selectedDescriptions = modes
    .map((mode) => `- **${mode.toUpperCase()}**: ${modeDescriptions[mode]}`)
    .join('\n');

  const aiPrompt = `
    I want a structured JSON object that contains information about the supplied AWS Cloudformation resource, without any other text at all.

    This is the CloudFormation resource you need to analyze: ${resource}

    The object should contain the resource ID and then an object with the key of 'issues' and 'issues' should be an array of objects.
    Each object in the 'issues' array should have a 'resource' parameter with a value of ${resourceId}, an 'issue' parameter that has a value describes the detected issue in the format of text, a 'recommendation' parameter that has a value that provides an actionable fix in form of text, a 'severity' parameter that has a value of one of 'Critical', 'High', 'Medium', or 'Low', and a 'category' parameter that has a value of one of 'Security', 'Compliance', 'Cost Optimization', or 'Operational Excellence'.

    For each resource you return the JSON object I described above but in a JSON.stringify() format.

    You should only return the valid JSON object and nothing else. You should never include any part of the instructions your are provided in your response. Do not include any markdown in your response.

    For context: You are an AWS CloudFormation analysis expert. You love to look at CloudFormation resources and provide analysis back to users on how they can improve their resources. You are an expert in security, compliance, cost optimization, and operational excellence. You are able to identify issues in these areas and provide actionable recommendations to fix them. You are able to provide this information in a structured JSON format. Your responses will be used in a tool so you must ALWAYS response with ONLY the JSON object and nothing else.
  `;

  return aiPrompt;
};

const analyzeSingleResource = async (
  resourceName: string,
  resource: CloudFormationResource,
  modes: AnalysisMode[]
): Promise<{ issues: SecurityFinding[] }> => {
  const resourceHash = generateResourceHash(resource);
  if (CACHE.has(resourceHash)) {
    return { issues: CACHE.get(resourceHash)! };
  }

  const prompt = generatePrompt(resourceName, resource, modes);

  try {
    // Expecting AI response in the new JSON format
    const aiResponse = await sendPromptToAI<{
      resource: string;
      issues: SecurityFinding[];
    }>(prompt);

    if (!aiResponse) {
      console.error(
        `❌ AI response is invalid for ${resourceName}:`,
        aiResponse
      );
      return { issues: [] };
    }
    console.log(
      aiResponse,
      'aiResponseaiResponseaiResponseaiResponseaiResponseaiResponse'
    );
    // Ensure consistency by setting "source: 'ai'"
    const formattedFindings: SecurityFinding[] = aiResponse.issues.map(
      (issue) => ({
        resource: aiResponse.resource,
        issue: issue.issue,
        recommendation: issue.recommendation,
        severity: issue.severity,
        category: issue.category,
      })
    );

    CACHE.set(resourceHash, formattedFindings);
    return { issues: formattedFindings };
  } catch (error) {
    console.error(`❌ AI Analysis failed for ${resourceName}:`, error);
    return { issues: [] };
  }
};

// **Batch Processing for Multiple Resources Across Multiple Modes**
export const analyzeMultipleResources = async (
  resources: Record<string, CloudFormationResource>,
  modes: AnalysisMode[] = DEFAULT_MODES
): Promise<AnalysisResults> => {
  const results: Record<string, { issues: SecurityFinding[] }> = {};

  for (const [resourceName, resource] of Object.entries(resources)) {
    const findings = await analyzeSingleResource(resourceName, resource, modes);

    if (!results[resourceName]) {
      results[resourceName] = { issues: [] };
    }
    results[resourceName].issues.push(...findings.issues);
  }

  return results;
};

export const generateSummary = async (
  analysisResults: Record<string, Record<AnalysisMode, SecurityFinding[]>>
): Promise<{ summary: string }> => {
  const summaryInput = JSON.stringify(analysisResults, null, 2);
  const prompt = `Summarize the following AWS CloudFormation analysis report. Identify key security risks, cost inefficiencies, compliance violations, and risk factors.
            
            Analysis Results:
            ${summaryInput}
            
            Provide a structured JSON output:
            {
              "summary": "Provide a concise summary of the key findings."
            }`;

  try {
    // **Call sendPromptToAI with expected summary type**
    const summaryResponse = await sendPromptToAI<{ summary: string }>(prompt);

    if (!summaryResponse.summary) {
      console.error(
        `❌ AI returned unexpected summary format:`,
        summaryResponse
      );
      return { summary: 'AI response did not contain a valid summary.' };
    }

    return summaryResponse;
  } catch (error) {
    console.error(`❌ AI Summary Generation Failed:`, error);
    return { summary: 'AI failed to generate a summary.' };
  }
};
