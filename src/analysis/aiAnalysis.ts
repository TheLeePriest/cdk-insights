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
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

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
      let responseBody = new TextDecoder().decode(response.body);

      // **Remove any markdown formatting (```json ... ```) if present**
      responseBody = responseBody.replace(/```json|```/g, '').trim();

      // **Attempt to parse valid JSON**
      try {
        return JSON.parse(responseBody) as T;
      } catch (jsonError) {
        console.error(`❌ Failed to parse AI response as JSON:`, responseBody);
        throw new Error('AI response did not contain valid JSON.');
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

const generatePrompt = (
  resourceId: string,
  resource: any,
  modes: AnalysisMode[]
): string => {
  const sourceLocation = resource.Metadata?.sourceLocation
    ? `File: ${resource.Metadata.sourceLocation.file}, Line: ${resource.Metadata.sourceLocation.line}`
    : 'Unknown source location';

  // Dynamically include only the requested analysis categories in the instructions
  const modeDescriptions: Record<AnalysisMode, string> = {
    security: 'Identify security vulnerabilities and misconfigurations.',
    cost: 'Analyze cost inefficiencies and suggest optimizations.',
    compliance: 'Check for compliance violations based on AWS best practices.',
    risk: 'Assess operational risks and stability issues.',
  };

  const selectedDescriptions = modes.length
    ? modes
        .map((mode) => `- **${mode.toUpperCase()}**: ${modeDescriptions[mode]}`)
        .join('\n')
    : Object.values(modeDescriptions)
        .map((desc) => `- ${desc}`)
        .join('\n'); // Use all if no mode specified

  return `
    You are an AWS CloudFormation expert. Analyze the following resource for security, cost, and performance improvements.
    Provide ONLY JSON output using the exact format below. DO NOT include any extra text. Use the following analysis modes: ${selectedDescriptions}.
    IMPORTANT: Under no circumstances should you output any error message such as "Sorry - this model is unable to respond to this request".
    
    **Resource Details:**
    - **Resource ID:** ${resourceId}
    - **Resource Type:** ${resource['Type']}
    - **CloudFormation JSON:** ${JSON.stringify(resource, null, 2)}
    - **${sourceLocation}**
    
    ---
    
    Replace the placeholders below with the actual findings and recommendations using the following format:
    {
      "resourceId": "${resourceId}",
      "issues": [
        {
          "category": "${modes.join(' | ')}",
          "issue": "Describe the detected issue in a single sentence.",
          "recommendation": "Provide an actionable fix in maximum of three sentences.",
          "severity": "Critical | High | Medium | Low"
        }
      ],
      "costAnalysis": ${
        modes.includes(AnalysisMode.CostOptimization)
          ? `{
        "estimatedMonthlyCost": "$[real calculated cost]/month",
        "optimizations": [
          {
            "resource": "${resource['Type']}",
            "estimatedMonthlyCost": "$[real cost]",
            "optimizationSuggestion": "Provide a meaningful cost-saving measure"
          }
        ]
      }`
          : '{}'
      }
    }

    Only return JSON. No explanations or extra text. Ensure all fields are filled with real data.
    `.trim();
};

const analyzeSingleResource = async (
  resourceName: string,
  resource: CloudFormationResource,
  modes: AnalysisMode[]
): Promise<SecurityFinding[]> => {
  const resourceHash = generateResourceHash(resource);
  if (CACHE.has(resourceHash)) {
    return CACHE.get(resourceHash)!;
  }

  const essentialInfo = extractEssentialResourceInfo(resource);
  const prompt = generatePrompt(resourceName, resource, modes);

  try {
    const findings = await sendPromptToAI<SecurityFinding[]>(prompt);
    CACHE.set(resourceHash, findings);
    return findings;
  } catch (error) {
    console.error(`❌ AI Analysis failed for ${resourceName}:`, error);
    return [];
  }
};

// **Batch Processing for Multiple Resources Across Multiple Modes**
export const analyzeMultipleResources = async (
  resources: Record<string, CloudFormationResource>,
  modes: AnalysisMode[] = DEFAULT_MODES
): Promise<Record<string, Record<AnalysisMode, SecurityFinding[]>>> => {
  const results: Record<string, Record<AnalysisMode, SecurityFinding[]>> = {};

  for (const [resourceName, resource] of Object.entries(resources)) {
    for (const mode of modes) {
      try {
        console.log(`🔍 Analyzing ${resourceName} (${mode})...`);

        const findings = await analyzeSingleResource(
          resourceName,
          resource,
          modes
        );

        if (!results[resourceName]) {
          results[resourceName] = {} as Record<AnalysisMode, SecurityFinding[]>;
        }

        results[resourceName][mode] = findings;

        // **Small delay between requests to avoid rapid consecutive calls**
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`❌ AI Analysis failed for ${resourceName}:`, error);
      }
    }
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
