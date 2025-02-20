import { Construct } from 'constructs';
import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { CfnCollection } from 'aws-cdk-lib/aws-opensearchserverless';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';

export class OpenSearchServerlessStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create an OpenSearch Serverless collection with Vector Engine
    const collection = new CfnCollection(this, 'CDKInsightsVectorCollection', {
      name: 'cdk-insights',
      type: 'VECTORSEARCH',
    });

    // IAM policy to allow OpenSearch access
    const accessPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['aoss:*'],
      resources: [
        `arn:aws:aoss:${this.region}:${this.account}:collection/cdk-insights`,
      ],
    });

    // Output OpenSearch Serverless Collection Endpoint
    new CfnOutput(this, 'OpenSearchCollectionEndpoint', {
      value: collection.attrCollectionEndpoint,
    });
  }
}
