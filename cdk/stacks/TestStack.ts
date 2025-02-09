import { App, CfnRule, Stack, StackProps } from 'aws-cdk-lib';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import {
  ManagedPolicy,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import {
  AmazonLinuxGeneration,
  AmazonLinuxImage,
  CfnNatGateway,
  Instance,
  InstanceClass,
  InstanceSize,
  InstanceType,
  MachineImage,
  Peer,
  Port,
  SecurityGroup,
  Subnet,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import path from 'path';
import { DatabaseInstance, DatabaseInstanceEngine } from 'aws-cdk-lib/aws-rds';
import { EndpointType, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { Pass, StateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { Rule } from 'aws-cdk-lib/aws-events';
import { CfnCacheCluster } from 'aws-cdk-lib/aws-elasticache';
import { CfnCluster } from 'aws-cdk-lib/aws-redshift';
import { CfnDomain } from 'aws-cdk-lib/aws-opensearchservice';

export class TestStack extends Stack {
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    // 🚨 IAM Role with wildcard permissions (Security Issue)
    new Role(this, 'InsecureIamRole', {
      assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
      inlinePolicies: {
        FullAccess: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ['*'],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    // 🚨 S3 Bucket without versioning (Security Issue)
    new Bucket(this, 'UnversionedBucket', {
      versioned: false,
    });

    // 🚨 Publicly Accessible RDS Database (Security Issue)
    new DatabaseInstance(this, 'PublicRdsInstance', {
      engine: DatabaseInstanceEngine.POSTGRES,
      vpc: new Vpc(this, 'TestVPC'),
      publiclyAccessible: true,
    });

    // 🚨 Publicly Accessible API Gateway (Security Issue)
    const apiGateway = new RestApi(this, 'PublicApiGateway', {
      endpointConfiguration: {
        types: [EndpointType.REGIONAL],
      },
    });

    apiGateway.root.addMethod('OPTIONS');

    // 🚨 Security Group with Open Ingress (Security Issue)
    const insecureSecurityGroup = new SecurityGroup(this, 'OpenSecurityGroup', {
      vpc: new Vpc(this, 'SecurityVpc'),
    });
    insecureSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(22));

    // 🚨 Step Function without logging (Security Issue)
    new StateMachine(this, 'UnloggedStepFunction', {
      definition: new Pass(this, 'StartState'),
      logs: undefined, // No logging enabled
    });

    // 🚨 OpenSearch without node-to-node encryption (Security Issue)
    new CfnDomain(this, 'InsecureOpenSearch', {
      domainName: 'test-domain',
      nodeToNodeEncryptionOptions: {
        enabled: false,
      },
    });

    // 🚨 Publicly Accessible Redshift Cluster (Security Issue)
    new CfnCluster(this, 'PublicRedshift', {
      clusterType: 'single-node',
      nodeType: 'dc2.large',
      publiclyAccessible: true,
      dbName: 'mydatabase',
      masterUsername: 'admin',
      masterUserPassword: 'password123', // Replace with a secure password
    });

    // 🚨 ElastiCache without transit encryption (Security Issue)
    new CfnCacheCluster(this, 'UnencryptedElastiCache', {
      engine: 'redis',
      cacheNodeType: 'cache.t3.micro',
      numCacheNodes: 1,
      transitEncryptionEnabled: false,
    });

    // 🚨 EventBridge Rule without specifying an EventBus (Security Issue)
    new Rule(this, 'UnroutedEventBridgeRule', {
      eventPattern: { source: ['custom.test'] },
    });

    // 💰 Lambda with high memory allocation (Cost Optimization)
    // Lambda function with high memory allocation (Cost Issue)
    const lambdaCodePath = path.join(__dirname, '../../functions/lambda');
    new Function(this, 'HighMemoryLambda', {
      runtime: Runtime.NODEJS_18_X,
      handler: 'highMemoryLambda.handler',
      memorySize: 2048,
      code: Code.fromAsset(lambdaCodePath),
    });

    // 💰 DynamoDB without auto-scaling (Cost Optimization)
    new Table(this, 'UnoptimizedDynamoDB', {
      partitionKey: { name: 'id', type: AttributeType.STRING },
      billingMode: BillingMode.PROVISIONED, // No auto-scaling
    });

    // 💰 EC2 instance using t2 family (Cost Optimization)
    new Instance(this, 'LegacyT2Instance', {
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MICRO),
      machineImage: new AmazonLinuxImage({
        generation: AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      vpc: new Vpc(this, 'EC2Vpc'),
    });

    // 💰 Unnecessary NAT Gateway (Cost Optimization)
    new CfnNatGateway(this, 'UnusedNAT', {
      subnetId: new Subnet(this, 'UnusedNatSubnet', {
        vpcId: new Vpc(this, 'NatVpc').vpcId,
        cidrBlock: '10.0.2.0/24',
        availabilityZone: 'us-east-1a',
      }).subnetId,
    });
  }
}

const app = new App();
new TestStack(app, 'TestStack');
app.synth();
