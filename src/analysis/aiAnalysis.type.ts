export type CloudFormationStack = {
  AWSTemplateFormatVersion?: string;
  Description?: string;
  Parameters?: Record<string, CloudFormationParameter>;
  Resources: Record<string, CloudFormationResource>;
  Mappings?: Record<string, CloudFormationMapping>;
  Conditions?: Record<string, CloudFormationCondition>;
  Outputs?: Record<string, CloudFormationOutput>;
  Metadata?: Record<string, unknown>;
};

export type CloudFormationResource = {
  Type: string;
  Properties?: Record<string, any>; // Allow any CloudFormation properties
  Metadata?: {
    'aws:cdk:path'?: string;
  };
  DependsOn?: string | string[];
  Condition?: string;
};

export type CloudFormationParameter = {
  Type: string;
  Default?: string | number | boolean;
  Description?: string;
  AllowedValues?: (string | number)[];
  AllowedPattern?: string;
  ConstraintDescription?: string;
};

export type CloudFormationMapping = Record<
  string,
  Record<string, string | number>
>;

export type CloudFormationCondition = Record<string, unknown>;

export type CloudFormationOutput = {
  Description?: string;
  Value: string | Record<string, any>;
  Export?: { Name: string };
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

export enum AnalysisMode {
  Security = 'security',
  CostOptimization = 'cost',
  Compliance = 'compliance',
  RiskScoring = 'risk',
}
