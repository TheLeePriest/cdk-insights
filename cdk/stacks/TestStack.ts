import { App, Stack, StackProps } from 'aws-cdk-lib';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import path from 'path';

export class TestStack extends Stack {
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    // IAM policy with wildcard permissions (Security Issue)
    new Role(this, 'WildcardRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    });

    // S3 bucket without versioning (Optimization)
    new Bucket(this, 'UnversionedBucket');

    // Security group with unrestricted ingress (Security Issue)
    const vpc = new Vpc(this, 'TestVPC');
    new SecurityGroup(this, 'OpenSG', {
      vpc,
      allowAllOutbound: true,
    });

    // Lambda function with high memory allocation (Cost Issue)
    const lambdaCodePath = path.join(__dirname, '../../functions/lambda');
    new Function(this, 'HighMemoryLambda', {
      runtime: Runtime.NODEJS_18_X,
      handler: 'highMemoryLambda.handler',
      memorySize: 2048,
      code: Code.fromAsset(lambdaCodePath),
    });

    // DynamoDB table without auto-scaling (Optimization)
    new Table(this, 'DDBTable', {
      partitionKey: { name: 'id', type: AttributeType.STRING },
      billingMode: BillingMode.PROVISIONED,
    });
  }
}
