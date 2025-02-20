#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { OpenSearchServerlessStack } from './stacks/OpenSearchServerlessStack';

const app = new App();

new OpenSearchServerlessStack(app, 'CDKInsightsAppStack');
