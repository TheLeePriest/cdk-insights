import { CfnResourceProps } from 'aws-cdk-lib';

export type CloudFormationStack = {
  Resources: CfnResourceProps;
};
