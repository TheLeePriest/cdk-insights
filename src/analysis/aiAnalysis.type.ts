export type CloudFormationStack = {
  Resources: Record<string, CloudFormationResource>;
  Mappings?: Record<string, unknown>;
  Conditions?: Record<string, unknown>;
  Outputs?: Record<string, unknown>;
  Metadata?: Record<string, unknown>;
};

export type CloudFormationResource = {
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
};

export type BedrockResponse = {
  inputTextTokenCount: number;
  results: [
    {
      outputText: string;
      tokenCount: number;
      completionReason?: string;
    },
  ];
  outputTokens: number;
};

export type AIAnalysis = {
  recommendations?: string[];
  inputTokens?: number;
  outputTokens?: number;
};

export type AnalysisResult = {
  issues: string[];
  recommendations: string[];
  optimizations: string[];
  timestamp: string;
  status: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  };
};
