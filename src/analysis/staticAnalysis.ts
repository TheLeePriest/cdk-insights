import { CloudFormationStack } from './staticAnalysis.type';
import fs from 'fs';
import path from 'path';
const INPUT_COST_PER_1000 = 0.00163;
const OUTPUT_COST_PER_1000 = 0.00551;

export const analyzeStack = async (
  stack: CloudFormationStack
): Promise<{ issues: string[]; optimizations: string[] }> => {
  const issues: string[] = [];
  const optimizations: string[] = [];
  console.log(stack.Resources, 'the stack.Resources');
  for (const [resourceId, resource] of Object.entries(stack.Resources)) {
    console.log(resourceId, 'the resourceId');
    console.log(resource, 'the resource');
    const resourceType = resource.Type;

    const addIssue = (message: string) =>
      issues.push(`🚨 ${message} (${resourceId})`);
    const addOptimization = (message: string) =>
      optimizations.push(`💡 ${message} (${resourceId})`);
    console.log(resourceType, 'resourceType');
    // Security Checks - Mapped to STRIDE & AWS Well-Architected Framework
    const securityChecks = [
      {
        condition:
          resourceType === 'AWS::IAM::Policy' &&
          resource.Properties?.PolicyDocument?.Statement?.some(
            (stmt: any) => stmt.Action === '*'
          ),
        message:
          'IAM Policy allows all actions (*). 🔹 **STRIDE: Elevation of Privilege** 🔹 **AWS WAF: Security Best Practice**',
      },
      {
        condition:
          resourceType === 'AWS::S3::Bucket' &&
          !resource.Properties?.VersioningConfiguration,
        message:
          'S3 Bucket has no versioning. 🔹 **STRIDE: Tampering** 🔹 **AWS WAF: Security Best Practice**',
      },
      {
        condition:
          resourceType === 'AWS::EC2::SecurityGroup' &&
          resource.Properties?.SecurityGroupIngress?.some(
            (rule: any) => rule.CidrIp === '0.0.0.0/0'
          ),
        message:
          'Security Group allows unrestricted ingress. 🔹 **STRIDE: Information Disclosure** 🔹 **AWS WAF: Security Best Practice**',
      },
      {
        condition:
          resourceType === 'AWS::ApiGateway::RestApi' &&
          !resource.Properties?.EndpointConfiguration?.Types?.includes(
            'PRIVATE'
          ),
        message:
          'API Gateway is publicly accessible. 🔹 **STRIDE: Information Disclosure** 🔹 **AWS WAF: Security Best Practice**',
      },
      {
        condition:
          resourceType === 'AWS::Cognito::UserPool' &&
          !resource.Properties?.Policies?.PasswordPolicy,
        message:
          'Cognito User Pool has no password policy set. 🔹 **STRIDE: Spoofing** 🔹 **AWS WAF: Security Best Practice**',
      },
      {
        condition:
          resourceType === 'AWS::Cognito::UserPool' &&
          !resource.Properties?.AccountRecoverySetting,
        message:
          'Cognito User Pool does not have account recovery configured. 🔹 **STRIDE: Repudiation** 🔹 **AWS WAF: Security Best Practice**',
      },
      {
        condition:
          resourceType === 'AWS::RDS::DBInstance' &&
          resource.Properties?.PubliclyAccessible,
        message:
          'RDS Instance is publicly accessible. 🔹 **STRIDE: Information Disclosure** 🔹 **AWS WAF: Security Best Practice**',
      },
      {
        condition:
          resourceType === 'AWS::Redshift::Cluster' &&
          resource.Properties?.PubliclyAccessible,
        message:
          'Redshift Cluster is publicly accessible. 🔹 **STRIDE: Information Disclosure** 🔹 **AWS WAF: Security Best Practice**',
      },
      {
        condition:
          resourceType === 'AWS::VPC' &&
          !resource.Properties?.EnableDnsHostnames,
        message:
          'VPC does not have DNS hostnames enabled. 🔹 **STRIDE: Information Disclosure** 🔹 **AWS WAF: Security Best Practice**',
      },
      {
        condition:
          resourceType === 'AWS::OpenSearchService::Domain' &&
          !resource.Properties?.NodeToNodeEncryptionOptions?.Enabled,
        message:
          'OpenSearch Domain lacks node-to-node encryption. 🔹 **STRIDE: Tampering** 🔹 **AWS WAF: Security Best Practice**',
      },
      {
        condition:
          resourceType === 'AWS::ElastiCache::Cluster' &&
          !resource.Properties?.TransitEncryptionEnabled,
        message:
          'ElastiCache Cluster lacks transit encryption. 🔹 **STRIDE: Tampering** 🔹 **AWS WAF: Security Best Practice**',
      },
      {
        condition:
          resourceType === 'AWS::ElasticBeanstalk::Environment' &&
          !resource.Properties?.OptionSettings?.some(
            (setting: any) =>
              setting.Namespace === 'aws:elasticbeanstalk:environment' &&
              setting.OptionName === 'EnvironmentType' &&
              setting.Value === 'LoadBalanced'
          ),
        message:
          'Elastic Beanstalk Environment is not Load Balanced. 🔹 **STRIDE: Denial of Service** 🔹 **AWS WAF: Security Best Practice**',
      },
      {
        condition:
          resourceType === 'AWS::StepFunctions::StateMachine' &&
          !resource.Properties?.LoggingConfiguration,
        message:
          'Step Function lacks logging configuration. 🔹 **STRIDE: Repudiation** 🔹 **AWS WAF: Security Best Practice**',
      },
      {
        condition:
          resourceType === 'AWS::Events::Rule' &&
          !resource.Properties?.EventBusName,
        message:
          'EventBridge Rule does not specify an EventBus. 🔹 **STRIDE: Tampering** 🔹 **AWS WAF: Security Best Practice**',
      },
      {
        condition:
          resourceType === 'AWS::EC2::NatGateway' &&
          !resource.Properties?.SubnetRouteTableAssociations,
        message:
          'NAT Gateway is deployed but lacks a route table association. 🔹 **AWS WAF: Cost Optimization**',
      },
    ];

    securityChecks.forEach(
      ({ condition, message }) => condition && addIssue(message)
    );

    // Cost Optimizations - Mapped to AWS Well-Architected Framework Cost Pillar
    const costOptimizations = [
      {
        condition:
          resourceType === 'AWS::Lambda::Function' &&
          (Number(resource.Properties?.MemorySize) || 0) > 1024,
        message:
          'Lambda function has high memory allocation. 🔹 **AWS WAF: Cost Optimization**',
      },
      {
        condition:
          resourceType === 'AWS::DynamoDB::Table' &&
          !resource.Properties?.BillingMode,
        message:
          'DynamoDB table has no auto-scaling enabled. 🔹 **AWS WAF: Cost Optimization**',
      },
      {
        condition:
          resourceType === 'AWS::EC2::Instance' &&
          resource.Properties?.InstanceType?.toString().startsWith('t2'),
        message:
          'EC2 instance is using an older t2 instance. 🔹 **AWS WAF: Cost Optimization**',
      },
      {
        condition:
          resourceType === 'AWS::SQS::Queue' &&
          !resource.Properties?.KmsMasterKeyId,
        message:
          'SQS Queue does not use KMS encryption. 🔹 **STRIDE: Tampering** 🔹 **AWS WAF: Security Best Practice**',
      },
      {
        condition:
          resourceType === 'AWS::EC2::NatGateway' &&
          resource.Properties?.SubnetRouteTableAssociations,
        message:
          'Review NAT Gateway usage for cost efficiency. 🔹 **AWS WAF: Cost Optimization**',
      },
    ];

    costOptimizations.forEach(
      ({ condition, message }) => condition && addOptimization(message)
    );
  }

  return { issues, optimizations };
};
