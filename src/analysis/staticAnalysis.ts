import fs from 'fs';
import { CloudFormationStack } from './staticAnalysis.type';

// Define possible security findings
export interface SecurityFinding {
  resource: string;
  issue: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: string;
  recommendation?: string;
}

export type AnalysisResults = Record<string, { issues: SecurityFinding[] }>;

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
// Generic Finding Generator
// ----------------------------
const createFinding = (
  resource: string,
  issue: string,
  recommendation: string,
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
  category: string
): SecurityFinding => ({
  resource,
  issue,
  recommendation,
  severity,
  category,
});

// ----------------------------
// IAM Policy Checks
// ----------------------------
export const checkIamPolicies = (
  template: CloudFormationStack
): AnalysisResults =>
  Object.entries(template.Resources || {}).reduce(
    (acc, [resourceName, resource]) => {
      if (
        resource.Type === 'AWS::IAM::Policy' ||
        resource.Type === 'AWS::IAM::Role'
      ) {
        const findings = (resource.Properties?.PolicyDocument?.Statement || [])
          .filter(
            (stmt: any) =>
              stmt.Effect === 'Allow' &&
              stmt.Action.includes('*') &&
              stmt.Resource.includes('*')
          )
          .map(() =>
            createFinding(
              resourceName,
              'IAM policy allows full access to all resources.',
              'Restrict IAM policies to least privilege access.',
              'CRITICAL',
              'Security'
            )
          );

        if (findings.length > 0) {
          acc[resourceName] = { issues: findings };
        }
      }
      return acc;
    },
    {} as AnalysisResults
  );

// ----------------------------
// S3 Bucket Checks
// ----------------------------
export const checkS3Buckets = (
  template: CloudFormationStack
): AnalysisResults =>
  Object.entries(template.Resources || {}).reduce(
    (acc, [resourceName, resource]) => {
      if (resource.Type === 'AWS::S3::Bucket') {
        const findings: SecurityFinding[] = [];

        if (!resource.Properties?.BucketEncryption) {
          findings.push(
            createFinding(
              resourceName,
              'S3 Bucket lacks encryption.',
              'Enable encryption at rest for better security.',
              'HIGH',
              'Security'
            )
          );
        }
        if (
          resource.Properties?.PublicAccessBlockConfiguration
            ?.BlockPublicAcls === false
        ) {
          findings.push(
            createFinding(
              resourceName,
              'S3 Bucket allows public ACLs.',
              'Restrict ACLs to prevent unauthorized access.',
              'CRITICAL',
              'Security'
            )
          );
        }
        if (!resource.Properties?.VersioningConfiguration) {
          findings.push(
            createFinding(
              resourceName,
              'S3 Bucket has no versioning enabled.',
              'Enable versioning to protect against accidental deletions.',
              'MEDIUM',
              'Security'
            )
          );
        }

        if (findings.length > 0) {
          acc[resourceName] = { issues: findings };
        }
      }
      return acc;
    },
    {} as AnalysisResults
  );

// ----------------------------
// Security Group Checks
// ----------------------------
export const checkSecurityGroups = (
  template: CloudFormationStack
): AnalysisResults =>
  Object.entries(template.Resources || {}).reduce(
    (acc, [resourceName, resource]) => {
      if (
        resource.Type === 'AWS::EC2::SecurityGroup' &&
        resource.Properties?.SecurityGroupIngress?.some(
          (rule: any) => rule.CidrIp === '0.0.0.0/0'
        )
      ) {
        acc[resourceName] = {
          issues: [
            createFinding(
              resourceName,
              'Security Group allows unrestricted ingress.',
              'Restrict security group rules to specific IPs and ports.',
              'HIGH',
              'Security'
            ),
          ],
        };
      }
      return acc;
    },
    {} as AnalysisResults
  );

// ----------------------------
// API Gateway Checks
// ----------------------------
export const checkApiGateway = (
  template: CloudFormationStack
): AnalysisResults =>
  Object.entries(template.Resources || {}).reduce(
    (acc, [resourceName, resource]) => {
      if (
        resource.Type === 'AWS::ApiGateway::RestApi' &&
        !resource.Properties?.EndpointConfiguration?.Types?.includes('PRIVATE')
      ) {
        acc[resourceName] = {
          issues: [
            createFinding(
              resourceName,
              'API Gateway is publicly accessible.',
              'Use PRIVATE endpoints to restrict access.',
              'HIGH',
              'Security'
            ),
          ],
        };
      }
      return acc;
    },
    {} as AnalysisResults
  );

// ----------------------------
// Secrets Manager Checks
// ----------------------------
export const checkSecretsManager = (
  template: CloudFormationStack
): AnalysisResults =>
  Object.entries(template.Resources || {}).reduce(
    (acc, [resourceName, resource]) => {
      if (
        resource.Type === 'AWS::SecretsManager::Secret' &&
        resource.Properties?.PublicPolicy
      ) {
        acc[resourceName] = {
          issues: [
            createFinding(
              resourceName,
              'Secret is publicly accessible.',
              'Restrict secret access using IAM policies to ensure only authorized entities can retrieve it.',
              'CRITICAL',
              'Security'
            ),
          ],
        };
      }
      return acc;
    },
    {} as AnalysisResults
  );

// ----------------------------
// KMS Checks
// ----------------------------
export const checkKMSKeys = (template: CloudFormationStack): AnalysisResults =>
  Object.entries(template.Resources || {}).reduce(
    (acc, [resourceName, resource]) => {
      if (
        resource.Type === 'AWS::KMS::Key' &&
        resource.Properties?.KeyPolicy?.Statement?.some(
          (s: any) => s.Principal === '*'
        )
      ) {
        acc[resourceName] = {
          issues: [
            createFinding(
              resourceName,
              'KMS key has a public policy.',
              'Restrict the KMS key policy to specific IAM roles or users to prevent unauthorized access.',
              'CRITICAL',
              'Security'
            ),
          ],
        };
      }
      return acc;
    },
    {} as AnalysisResults
  );

// ----------------------------
// SNS Checks
// ----------------------------
export const checkSNS = (template: CloudFormationStack): AnalysisResults =>
  Object.entries(template.Resources || {}).reduce(
    (acc, [resourceName, resource]) => {
      if (
        resource.Type === 'AWS::SNS::Topic' &&
        !resource.Properties?.KmsMasterKeyId
      ) {
        acc[resourceName] = {
          issues: [
            createFinding(
              resourceName,
              'SNS topic is not encrypted.',
              'Enable AWS KMS encryption for SNS to protect sensitive messages in transit and at rest.',
              'HIGH',
              'Security'
            ),
          ],
        };
      }
      return acc;
    },
    {} as AnalysisResults
  );

// ----------------------------
// SQS Checks
// ----------------------------
export const checkSQS = (template: CloudFormationStack): AnalysisResults =>
  Object.entries(template.Resources || {}).reduce(
    (acc, [resourceName, resource]) => {
      if (
        resource.Type === 'AWS::SQS::Queue' &&
        !resource.Properties?.KmsMasterKeyId
      ) {
        acc[resourceName] = {
          issues: [
            {
              resource: resourceName,
              issue: 'SQS queue is not encrypted.',
              recommendation:
                'Enable AWS KMS encryption for SQS to protect message data in transit and at rest.',
              severity: 'HIGH',
              category: 'Security',
            },
          ],
        };
      }
      return acc;
    },
    {} as AnalysisResults
  );

// ----------------------------
// EventBridge Rules Checks
// ----------------------------
export const checkEventBridgeRules = (
  template: CloudFormationStack
): AnalysisResults =>
  Object.entries(template.Resources || {}).reduce(
    (acc, [resourceName, resource]) => {
      if (
        resource.Type === 'AWS::Events::Rule' &&
        resource.Properties?.State !== 'ENABLED'
      ) {
        acc[resourceName] = {
          issues: [
            createFinding(
              resourceName,
              'EventBridge rule is disabled.',
              'Ensure the EventBridge rule is enabled to trigger events as expected.',
              'MEDIUM',
              'Security'
            ),
          ],
        };
      }
      return acc;
    },
    {} as AnalysisResults
  );

// ----------------------------
// Lambda Environment Variables Checks
// ----------------------------
export const checkLambdaEnvironmentVariables = (
  template: CloudFormationStack
): AnalysisResults =>
  Object.entries(template.Resources || {}).reduce(
    (acc, [resourceName, resource]) => {
      if (resource.Type === 'AWS::Lambda::Function') {
        const findings = Object.entries(
          resource.Properties?.Environment?.Variables || {}
        )
          .filter(([key]) => /secret|password|token|key/i.test(key))
          .map(([key]) =>
            createFinding(
              resourceName,
              `Lambda function contains sensitive environment variable: ${key}.`,
              'Store sensitive environment variables in AWS Secrets Manager or SSM Parameter Store instead of plaintext environment variables.',
              'HIGH',
              'Security'
            )
          );

        if (findings.length > 0) {
          acc[resourceName] = { issues: findings };
        }
      }
      return acc;
    },
    {} as AnalysisResults
  );

// ----------------------------
// RDS Encryption Checks
// ----------------------------
export const checkRdsEncryption = (
  template: CloudFormationStack
): AnalysisResults =>
  Object.entries(template.Resources || {}).reduce(
    (acc, [resourceName, resource]) => {
      if (
        resource.Type === 'AWS::RDS::DBInstance' &&
        !resource.Properties?.StorageEncrypted
      ) {
        acc[resourceName] = {
          issues: [
            createFinding(
              resourceName,
              'RDS instance is not encrypted.',
              'Enable encryption for data security.',
              'HIGH',
              'Security'
            ),
          ],
        };
      }
      return acc;
    },
    {} as AnalysisResults
  );

// ----------------------------
// DynamoDB Streams Checks
// ----------------------------
export const checkDynamoDBStreams = (
  template: CloudFormationStack
): AnalysisResults =>
  Object.entries(template.Resources || {}).reduce(
    (acc, [resourceName, resource]) => {
      if (
        resource.Type === 'AWS::DynamoDB::Table' &&
        !resource.Properties?.StreamSpecification
      ) {
        acc[resourceName] = {
          issues: [
            createFinding(
              resourceName,
              'DynamoDB table does not have streams enabled.',
              'Enable DynamoDB Streams to capture item-level changes for analytics, auditing, and replication.',
              'MEDIUM',
              'Security'
            ),
          ],
        };
      }
      return acc;
    },
    {} as AnalysisResults
  );

// ----------------------------
// Step Functions Logging Checks
// ----------------------------
export const checkStepFunctions = (
  template: CloudFormationStack
): AnalysisResults =>
  Object.entries(template.Resources || {}).reduce(
    (acc, [resourceName, resource]) => {
      if (
        resource.Type === 'AWS::StepFunctions::StateMachine' &&
        resource.Properties?.LoggingConfiguration === undefined
      ) {
        acc[resourceName] = {
          issues: [
            createFinding(
              resourceName,
              'Step Function lacks logging configuration.',
              'Enable logging for the Step Function using AWS CloudWatch to improve monitoring and debugging.',
              'HIGH',
              'Security'
            ),
          ],
        };
      }
      return acc;
    },
    {} as AnalysisResults
  );

// ----------------------------
// CloudTrail Logging Checks
// ----------------------------
export const checkCloudTrailLogging = (
  template: CloudFormationStack
): AnalysisResults => {
  const hasCloudTrail = Object.entries(template.Resources || {}).some(
    ([_, resource]) => resource.Type === 'AWS::CloudTrail::Trail'
  );

  return hasCloudTrail
    ? {}
    : {
        Global: {
          issues: [
            createFinding(
              'Global',
              'CloudTrail is not enabled for logging.',
              'Enable AWS CloudTrail to capture API activity and improve security monitoring.',
              'HIGH',
              'Security'
            ),
          ],
        },
      };
};

// ----------------------------
// Cost Optimization Checks
// ----------------------------

export const checkLambdaMemory = (
  template: CloudFormationStack
): AnalysisResults =>
  Object.entries(template.Resources || {}).reduce(
    (acc, [resourceName, resource]) => {
      if (
        resource.Type === 'AWS::Lambda::Function' &&
        (Number(resource.Properties?.MemorySize) || 0) > 1024
      ) {
        acc[resourceName] = {
          issues: [
            createFinding(
              resourceName,
              'Lambda function has high memory allocation.',
              'Consider reducing memory for cost savings.',
              'MEDIUM',
              'Cost Optimization'
            ),
          ],
        };
      }
      return acc;
    },
    {} as AnalysisResults
  );

export const checkDynamoDBAutoScaling = (
  template: CloudFormationStack
): AnalysisResults =>
  Object.entries(template.Resources || {}).reduce(
    (acc, [resourceName, resource]) => {
      if (
        resource.Type === 'AWS::DynamoDB::Table' &&
        !resource.Properties?.BillingMode
      ) {
        acc[resourceName] = {
          issues: [
            createFinding(
              resourceName,
              'DynamoDB table has no auto-scaling enabled. Enable auto-scaling to reduce costs.',
              'Set the BillingMode to PAY_PER_REQUEST or configure Auto Scaling on Read and Write capacities to optimize costs dynamically.',
              'MEDIUM',
              'Cost Optimization'
            ),
          ],
        };
      }
      return acc;
    },
    {} as AnalysisResults
  );

export const checkEC2InstanceType = (
  template: CloudFormationStack
): AnalysisResults =>
  Object.entries(template.Resources || {}).reduce(
    (acc, [resourceName, resource]) => {
      if (
        resource.Type === 'AWS::EC2::Instance' &&
        resource.Properties?.InstanceType?.toString().startsWith('t2')
      ) {
        acc[resourceName] = {
          issues: [
            createFinding(
              resourceName,
              'EC2 instance is using an older t2 instance. Consider upgrading to t3 for better performance and cost savings.',
              'Upgrade to a t3 instance for improved performance, lower latency, and better cost efficiency.',
              'MEDIUM',
              'Cost Optimization'
            ),
          ],
        };
      }
      return acc;
    },
    {} as AnalysisResults
  );

export const checkS3IntelligentTiering = (
  template: CloudFormationStack
): AnalysisResults =>
  Object.entries(template.Resources || {}).reduce(
    (acc, [resourceName, resource]) => {
      if (
        resource.Type === 'AWS::S3::Bucket' &&
        !resource.Properties?.IntelligentTieringConfiguration
      ) {
        acc[resourceName] = {
          issues: [
            createFinding(
              resourceName,
              'S3 Bucket does not use Intelligent-Tiering. Consider enabling it for cost optimization.',
              'Enable Intelligent-Tiering for automatic cost optimization of infrequently accessed objects.',
              'LOW',
              'Cost Optimization'
            ),
          ],
        };
      }
      return acc;
    },
    {} as AnalysisResults
  );

export const checkRDSMultiAZ = (
  template: CloudFormationStack
): AnalysisResults =>
  Object.entries(template.Resources || {}).reduce(
    (acc, [resourceName, resource]) => {
      if (
        resource.Type === 'AWS::RDS::DBInstance' &&
        resource.Properties?.MultiAZ &&
        resource.Properties?.StorageType === 'gp2'
      ) {
        acc[resourceName] = {
          issues: [
            createFinding(
              resourceName,
              'RDS instance is using Multi-AZ with gp2 storage. Consider gp3 for lower costs.',
              'Switch to gp3 storage for RDS to reduce costs and improve performance.',
              'MEDIUM',
              'Cost Optimization'
            ),
          ],
        };
      }
      return acc;
    },
    {} as AnalysisResults
  );

export const checkEBSUnusedVolumes = (
  template: CloudFormationStack
): AnalysisResults =>
  Object.entries(template.Resources || {}).reduce(
    (acc, [resourceName, resource]) => {
      if (
        resource.Type === 'AWS::EC2::Volume' &&
        !resource.Properties?.Attachments
      ) {
        acc[resourceName] = {
          issues: [
            createFinding(
              resourceName,
              'EBS Volume is not attached to any instance. Consider deleting to save costs.',
              'Review and delete unused EBS volumes to avoid unnecessary storage costs.',
              'HIGH',
              'Cost Optimization'
            ),
          ],
        };
      }
      return acc;
    },
    {} as AnalysisResults
  );

export const checkNATGatewayUsage = (
  template: CloudFormationStack
): AnalysisResults =>
  Object.entries(template.Resources || {}).reduce(
    (acc, [resourceName, resource]) => {
      if (
        resource.Type === 'AWS::EC2::NatGateway' &&
        !resource.Properties?.SubnetRouteTableAssociations
      ) {
        acc[resourceName] = {
          issues: [
            createFinding(
              resourceName,
              'NAT Gateway exists but lacks a route table association. Review usage to avoid unnecessary costs.',
              'Ensure NAT Gateways are only provisioned when necessary and associated with a valid route table.',
              'LOW',
              'Cost Optimization'
            ),
          ],
        };
      }
      return acc;
    },
    {} as AnalysisResults
  );

// ----------------------------
// **Main Analysis Function**
// ----------------------------
export const analyzeTemplate = (
  cloudformationTemplate: CloudFormationStack,
  selectedServices: string[] = []
): AnalysisResults => {
  const serviceChecks: {
    [key: string]: ((template: CloudFormationStack) => AnalysisResults)[];
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
  console.log(selectedServices, 'the selected services');
  const checks = selectedServices.length
    ? selectedServices.flatMap((service) =>
        serviceChecks[service] ? serviceChecks[service] : []
      )
    : Object.values(serviceChecks).flat();

  console.log(checks, 'the checks');
  const findings: AnalysisResults = {};

  checks.forEach((check) => {
    const result = check(cloudformationTemplate);
    Object.entries(result).forEach(([resourceName, finding]) => {
      if (!findings[resourceName]) {
        findings[resourceName] = { issues: [] };
      }
      findings[resourceName].issues.push(...finding.issues);
    });
  });

  if (Object.keys(findings).length === 0) {
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
