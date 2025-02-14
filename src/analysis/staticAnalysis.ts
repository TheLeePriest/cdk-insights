import fs from 'fs';
import { CloudFormationStack } from './staticAnalysis.type';

// Define possible security findings
export interface SecurityFinding {
  resource: string;
  issue: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: string;
}

export const loadCloudFormationTemplate = (templatePath: string): any =>
  JSON.parse(fs.readFileSync(templatePath, 'utf-8'));

// ----------------------------
// 🔍 Logging Utility
// ----------------------------
const logFinding = (finding: SecurityFinding) => {
  const colorMap: Record<string, string> = {
    LOW: '\x1b[32m', // Green
    MEDIUM: '\x1b[33m', // Yellow
    HIGH: '\x1b[31m', // Red
    CRITICAL: '\x1b[41m', // Red Background
  };

  const resetColor = '\x1b[0m';
  console.log(
    `${colorMap[finding.severity]}[${finding.severity}] ${finding.category}: ${finding.issue} (${finding.resource})${resetColor}`
  );
};

// ----------------------------
// IAM Policy Checks
// ----------------------------
export const checkIamPolicies = (
  template: CloudFormationStack
): SecurityFinding[] =>
  Object.entries(template.Resources || {}).flatMap(
    ([resourceName, resource]) =>
      resource.Type === 'AWS::IAM::Policy' || resource.Type === 'AWS::IAM::Role'
        ? (resource.Properties?.PolicyDocument?.Statement || [])
            .filter(
              (stmt: any) =>
                stmt.Effect === 'Allow' &&
                stmt.Action.includes('*') &&
                stmt.Resource.includes('*')
            )
            .map(() => ({
              resource: resourceName,
              issue: 'IAM policy allows full access to all resources.',
              severity: 'CRITICAL',
              category: 'Security',
            }))
        : []
  );

// ----------------------------
// S3 Bucket Checks
// ----------------------------
export const checkS3Buckets = (
  template: CloudFormationStack
): SecurityFinding[] =>
  Object.entries(template.Resources || {}).flatMap(
    ([resourceName, resource]) =>
      resource.Type === 'AWS::S3::Bucket'
        ? ([
            !resource.Properties?.BucketEncryption
              ? {
                  resource: resourceName,
                  issue: 'S3 Bucket lacks encryption.',
                  severity: 'HIGH',
                  category: 'Security',
                }
              : null,
            resource.Properties?.PublicAccessBlockConfiguration
              ?.BlockPublicAcls === false
              ? {
                  resource: resourceName,
                  issue: 'S3 Bucket allows public ACLs.',
                  severity: 'CRITICAL',
                  category: 'Security',
                }
              : null,
            !resource.Properties?.VersioningConfiguration
              ? {
                  resource: resourceName,
                  issue: 'S3 Bucket has no versioning enabled.',
                  severity: 'MEDIUM',
                  category: 'Security',
                }
              : null,
          ].filter(Boolean) as SecurityFinding[])
        : []
  );

// ----------------------------
// Security Group Checks
// ----------------------------
export const checkSecurityGroups = (
  template: CloudFormationStack
): SecurityFinding[] =>
  Object.entries(template.Resources || {}).flatMap(
    ([resourceName, resource]) =>
      resource.Type === 'AWS::EC2::SecurityGroup' &&
      resource.Properties?.SecurityGroupIngress?.some(
        (rule: any) => rule.CidrIp === '0.0.0.0/0'
      )
        ? [
            {
              resource: resourceName,
              issue: 'Security Group allows unrestricted ingress.',
              severity: 'HIGH',
              category: 'Security',
            },
          ]
        : []
  );

// ----------------------------
// API Gateway Checks
// ----------------------------
export const checkApiGateway = (
  template: CloudFormationStack
): SecurityFinding[] =>
  Object.entries(template.Resources || {}).flatMap(
    ([resourceName, resource]) =>
      resource.Type === 'AWS::ApiGateway::RestApi' &&
      !resource.Properties?.EndpointConfiguration?.Types?.includes('PRIVATE')
        ? [
            {
              resource: resourceName,
              issue: 'API Gateway is publicly accessible.',
              severity: 'HIGH',
              category: 'Security',
            },
          ]
        : []
  );

// ----------------------------
// Secrets Manager Checks
// ----------------------------
export const checkSecretsManager = (
  template: CloudFormationStack
): SecurityFinding[] =>
  Object.entries(template.Resources || {}).flatMap(
    ([resourceName, resource]) =>
      resource.Type === 'AWS::SecretsManager::Secret' &&
      resource.Properties?.PublicPolicy
        ? [
            {
              resource: resourceName,
              issue: 'Secret is publicly accessible.',
              severity: 'CRITICAL',
              category: 'Security',
            },
          ]
        : []
  );

// ----------------------------
// KMS Checks
// ----------------------------
export const checkKMSKeys = (
  template: CloudFormationStack
): SecurityFinding[] =>
  Object.entries(template.Resources || {}).flatMap(
    ([resourceName, resource]) =>
      resource.Type === 'AWS::KMS::Key' &&
      resource.Properties?.KeyPolicy?.Statement?.some(
        (s: any) => s.Principal === '*'
      )
        ? [
            {
              resource: resourceName,
              issue: 'KMS key has a public policy.',
              severity: 'CRITICAL',
              category: 'Security',
            },
          ]
        : []
  );

// ----------------------------
// SNS Checks
// ----------------------------
export const checkSNS = (template: CloudFormationStack): SecurityFinding[] =>
  Object.entries(template.Resources || {}).flatMap(
    ([resourceName, resource]) =>
      resource.Type === 'AWS::SNS::Topic' &&
      !resource.Properties?.KmsMasterKeyId
        ? [
            {
              resource: resourceName,
              issue: 'SNS topic is not encrypted.',
              severity: 'HIGH',
              category: 'Security',
            },
          ]
        : []
  );

// ----------------------------
// SQS Checks
// ----------------------------
export const checkSQS = (template: CloudFormationStack): SecurityFinding[] =>
  Object.entries(template.Resources || {}).flatMap(
    ([resourceName, resource]) =>
      resource.Type === 'AWS::SQS::Queue' &&
      !resource.Properties?.KmsMasterKeyId
        ? [
            {
              resource: resourceName,
              issue: 'SQS queue is not encrypted.',
              severity: 'HIGH',
              category: 'Security',
            },
          ]
        : []
  );

// ----------------------------
// EventBridge Rules Checks
// ----------------------------
export const checkEventBridgeRules = (
  template: CloudFormationStack
): SecurityFinding[] =>
  Object.entries(template.Resources || {}).flatMap(
    ([resourceName, resource]) =>
      resource.Type === 'AWS::Events::Rule' &&
      resource.Properties?.State !== 'ENABLED'
        ? [
            {
              resource: resourceName,
              issue: 'EventBridge rule is disabled.',
              severity: 'MEDIUM',
              category: 'Security',
            },
          ]
        : []
  );

// ----------------------------
// Lambda Environment Variables Checks
// ----------------------------
export const checkLambdaEnvironmentVariables = (
  template: CloudFormationStack
): SecurityFinding[] =>
  Object.entries(template.Resources || {}).flatMap(
    ([resourceName, resource]) =>
      resource.Type === 'AWS::Lambda::Function'
        ? Object.entries(resource.Properties?.Environment?.Variables || {})
            .filter(([key]) => /secret|password|token|key/i.test(key))
            .map(([key]) => ({
              resource: resourceName,
              issue: `Lambda function contains sensitive environment variable: ${key}.`,
              severity: 'HIGH',
              category: 'Security',
            }))
        : []
  );

// ----------------------------
// RDS Encryption Checks
// ----------------------------
export const checkRdsEncryption = (
  template: CloudFormationStack
): SecurityFinding[] =>
  Object.entries(template.Resources || {}).flatMap(
    ([resourceName, resource]) =>
      resource.Type === 'AWS::RDS::DBInstance' &&
      !resource.Properties?.StorageEncrypted
        ? [
            {
              resource: resourceName,
              issue: 'RDS instance is not encrypted.',
              severity: 'HIGH',
              category: 'Security',
            },
          ]
        : []
  );

// ----------------------------
// DynamoDB Streams Checks
// ----------------------------
export const checkDynamoDBStreams = (
  template: CloudFormationStack
): SecurityFinding[] =>
  Object.entries(template.Resources || {}).flatMap(
    ([resourceName, resource]) =>
      resource.Type === 'AWS::DynamoDB::Table' &&
      !resource.Properties?.StreamSpecification
        ? [
            {
              resource: resourceName,
              issue: 'DynamoDB table does not have streams enabled.',
              severity: 'MEDIUM',
              category: 'Security',
            },
          ]
        : []
  );

// ----------------------------
// Step Functions Logging Checks
// ----------------------------
export const checkStepFunctions = (
  template: CloudFormationStack
): SecurityFinding[] =>
  Object.entries(template.Resources || {}).flatMap(
    ([resourceName, resource]) =>
      resource.Type === 'AWS::StepFunctions::StateMachine' &&
      resource.Properties?.LoggingConfiguration === undefined
        ? [
            {
              resource: resourceName,
              issue: 'Step Function lacks logging configuration.',
              severity: 'HIGH',
              category: 'Security',
            },
          ]
        : []
  );

// ----------------------------
// CloudTrail Logging Checks
// ----------------------------
export const checkCloudTrailLogging = (
  template: CloudFormationStack
): SecurityFinding[] =>
  Object.entries(template.Resources || {}).some(
    ([_, resource]) => resource.Type === 'AWS::CloudTrail::Trail'
  )
    ? []
    : [
        {
          resource: 'Global',
          issue: 'CloudTrail is not enabled for logging.',
          severity: 'HIGH',
          category: 'Security',
        },
      ];

// ----------------------------
// Cost Optimization Checks
// ----------------------------

export const checkLambdaMemory = (
  template: CloudFormationStack
): SecurityFinding[] =>
  Object.entries(template.Resources || {}).flatMap(
    ([resourceName, resource]) =>
      resource.Type === 'AWS::Lambda::Function' &&
      (Number(resource.Properties?.MemorySize) || 0) > 1024
        ? [
            {
              resource: resourceName,
              issue:
                'Lambda function has high memory allocation. Consider reducing memory for cost savings.',
              severity: 'MEDIUM',
              category: 'Cost Optimization',
            },
          ]
        : []
  );

export const checkDynamoDBAutoScaling = (
  template: CloudFormationStack
): SecurityFinding[] =>
  Object.entries(template.Resources || {}).flatMap(
    ([resourceName, resource]) =>
      resource.Type === 'AWS::DynamoDB::Table' &&
      !resource.Properties?.BillingMode
        ? [
            {
              resource: resourceName,
              issue:
                'DynamoDB table has no auto-scaling enabled. Enable auto-scaling to reduce costs.',
              severity: 'MEDIUM',
              category: 'Cost Optimization',
            },
          ]
        : []
  );

export const checkEC2InstanceType = (
  template: CloudFormationStack
): SecurityFinding[] =>
  Object.entries(template.Resources || {}).flatMap(
    ([resourceName, resource]) =>
      resource.Type === 'AWS::EC2::Instance' &&
      resource.Properties?.InstanceType?.toString().startsWith('t2')
        ? [
            {
              resource: resourceName,
              issue:
                'EC2 instance is using an older t2 instance. Consider upgrading to t3 for better performance and cost savings.',
              severity: 'MEDIUM',
              category: 'Cost Optimization',
            },
          ]
        : []
  );

export const checkS3IntelligentTiering = (
  template: CloudFormationStack
): SecurityFinding[] =>
  Object.entries(template.Resources || {}).flatMap(
    ([resourceName, resource]) =>
      resource.Type === 'AWS::S3::Bucket' &&
      !resource.Properties?.IntelligentTieringConfiguration
        ? [
            {
              resource: resourceName,
              issue:
                'S3 Bucket does not use Intelligent-Tiering. Consider enabling it for cost optimization.',
              severity: 'LOW',
              category: 'Cost Optimization',
            },
          ]
        : []
  );

export const checkRDSMultiAZ = (
  template: CloudFormationStack
): SecurityFinding[] =>
  Object.entries(template.Resources || {}).flatMap(
    ([resourceName, resource]) =>
      resource.Type === 'AWS::RDS::DBInstance' &&
      resource.Properties?.MultiAZ &&
      resource.Properties?.StorageType === 'gp2'
        ? [
            {
              resource: resourceName,
              issue:
                'RDS instance is using Multi-AZ with gp2 storage. Consider gp3 for lower costs.',
              severity: 'MEDIUM',
              category: 'Cost Optimization',
            },
          ]
        : []
  );

export const checkEBSUnusedVolumes = (
  template: CloudFormationStack
): SecurityFinding[] =>
  Object.entries(template.Resources || {}).flatMap(
    ([resourceName, resource]) =>
      resource.Type === 'AWS::EC2::Volume' && !resource.Properties?.Attachments
        ? [
            {
              resource: resourceName,
              issue:
                'EBS Volume is not attached to any instance. Consider deleting to save costs.',
              severity: 'HIGH',
              category: 'Cost Optimization',
            },
          ]
        : []
  );

export const checkNATGatewayUsage = (
  template: CloudFormationStack
): SecurityFinding[] =>
  Object.entries(template.Resources || {}).flatMap(
    ([resourceName, resource]) =>
      resource.Type === 'AWS::EC2::NatGateway' &&
      !resource.Properties?.SubnetRouteTableAssociations
        ? [
            {
              resource: resourceName,
              issue:
                'NAT Gateway exists but lacks a route table association. Review usage to avoid unnecessary costs.',
              severity: 'LOW',
              category: 'Cost Optimization',
            },
          ]
        : []
  );

// ----------------------------
// **Main Analysis Function**
// ----------------------------
export const analyzeTemplate = (
  cloudformationTemplate: CloudFormationStack,
  selectedServices: string[] = []
): SecurityFinding[] => {
  const serviceChecks: {
    [key: string]: ((template: CloudFormationStack) => SecurityFinding[])[];
  } = {
    IAM: [checkIamPolicies],
    S3: [checkS3Buckets, checkS3IntelligentTiering],
    SecurityGroup: [checkSecurityGroups],
    ApiGateway: [checkApiGateway],
    SecretsManager: [checkSecretsManager],
    KMS: [checkKMSKeys],
    SNS: [checkSNS],
    SQS: [checkSQS],
    EventBridge: [checkEventBridgeRules],
    Lambda: [checkLambdaEnvironmentVariables, checkLambdaMemory],
    RDS: [checkRdsEncryption, checkRDSMultiAZ],
    DynamoDB: [checkDynamoDBStreams],
    StepFunctions: [checkStepFunctions],
    CloudTrail: [checkCloudTrailLogging],
    DynamoDBAutoScaling: [checkDynamoDBAutoScaling],
    EC2: [checkEC2InstanceType],
    EBS: [checkEBSUnusedVolumes],
    NATGateway: [checkNATGatewayUsage],
  };

  const checks = selectedServices.length
    ? selectedServices.flatMap((service) =>
        serviceChecks[service] ? serviceChecks[service] : []
      )
    : Object.values(serviceChecks).flat();

  const findings = checks.flatMap((check) => check(cloudformationTemplate));

  if (findings.length === 0) {
    console.log('\x1b[32m✅ No security or cost issues detected!\x1b[0m\n');
    process.exit(0);
  }

  return findings;

  // Split findings into Security vs Cost Optimization
  //   const securityFindings = findings.filter((f) => f.category === 'Security');
  //   const costFindings = findings.filter(
  //     (f) => f.category === 'Cost Optimization'
  //   );

  //   console.log('\n🚨 Security Findings:');
  //   securityFindings.forEach(logFinding);
  //   console.log(`\n🔴 Total Security Issues Found: ${securityFindings.length}\n`);

  //   console.log('\n💰 Cost Optimization Suggestions:');
  //   costFindings.forEach(logFinding);
  //   console.log(
  //     `\n🟡 Total Cost Optimization Suggestions: ${costFindings.length}\n`
  //   );

  //   // Set exit codes:
  //   if (securityFindings.some((f) => f.severity === 'CRITICAL')) {
  //     console.error(
  //       '\x1b[41m❌ Critical security issues detected! Failing pipeline.\x1b[0m'
  //     );
  //     process.exit(2);
  //   } else if (findings.length > 0) {
  //     console.warn(
  //       '\x1b[33m⚠️ Issues detected. Review before deployment.\x1b[0m'
  //     );
  //     process.exit(1);
  //   }
};
