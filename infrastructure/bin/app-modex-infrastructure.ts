#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AppModExApplicationStack } from '../lib/app-modex-application-stack';
import { AppModExDataStack } from '../lib/app-modex-data-stack';
import { AppModExApiStack } from '../lib/app-modex-api-stack';
import { AppModExBackendStack } from '../lib/app-modex-backend-stack';
import { AppModExFrontendStack } from '../lib/app-modex-frontend-stack';
import { AppModExPromptTemplatesStack } from '../lib/app-modex-prompt-templates-stack';

const app = new cdk.App();

// Get environment from context or use default
const environment = app.node.tryGetContext('environment') || 'dev';

// Get log level from context or use environment-based default
const logLevel = app.node.tryGetContext('logLevel') || 
  (environment === 'prod' ? 'ERROR' : environment === 'staging' ? 'INFO' : 'DEBUG');

// Get the target region from environment variable (set by deploy scripts)
const appmodexRegion = process.env.APPMODEX_REGION || 'us-west-2';
const account = process.env.CDK_DEFAULT_ACCOUNT;

// Create the Application stack FIRST - this creates the AppRegistry application
// and exports the AWS application tag for other stacks to use
const applicationStack = new AppModExApplicationStack(app, 'AppModEx-Application', {
  environment,
  description: 'App-ModEx Application Registry and Resource Groups (SO9684)',
  env: {
    account: account,
    region: appmodexRegion,
  },
});

// Create the Prompt Templates stack (DynamoDB for centralized prompt management)
const promptTemplatesStack = new AppModExPromptTemplatesStack(app, 'AppModEx-PromptTemplates', {
  environment,
  description: 'App-ModEx Prompt Templates Stack (SO9684)',
  env: {
    account: account,
    region: appmodexRegion,
  },
});

// Create the Data stack - databases, Cognito, S3 buckets, Glue
const dataStack = new AppModExDataStack(app, `AppModEx-Data`, {
  environment,
  description: 'App-ModEx Data Stack (DynamoDB, Cognito, S3, Glue) (SO9684)',
  env: {
    account: account,
    region: appmodexRegion,
  },
  tags: {
    Project: 'App-ModEx',
    Environment: environment,
    Component: 'Data',
  }
});

// Create the API stack - API Gateway and authorizers
const apiStack = new AppModExApiStack(app, `AppModEx-Api`, {
  environment,
  description: 'App-ModEx API Stack (API Gateway) (SO9684)',
  userPool: dataStack.userPool,
  env: {
    account: account,
    region: appmodexRegion,
  },
  tags: {
    Project: 'App-ModEx',
    Environment: environment,
    Component: 'API',
  }
});

// Create the backend stack - Lambda functions, roles, SQS, Step Functions
const backendStack = new AppModExBackendStack(app, `AppModEx-Backend`, {
  environment,
  logLevel,
  description: 'App-ModEx Backend Stack (Lambda, SQS, Step Functions) (SO9684)',
  env: {
    account: account,
    region: appmodexRegion,
  },
  tags: {
    Project: 'App-ModEx',
    Environment: environment,
    Component: 'Backend',
  }
});

// Create the frontend stack - ALWAYS us-east-1 for WAF protection
const frontendStack = new AppModExFrontendStack(app, `AppModEx-Frontend`, {
  environment,
  description: 'App-ModEx Frontend Stack (${environment}) (SO9684)',
  env: {
    account: account,
    region: 'us-east-1', // Frontend must be in us-east-1 for WAF
  },
  tags: {
    Project: 'App-ModEx',
    Environment: environment,
    Component: 'Frontend'
  }
});

// Ensure proper deployment order
promptTemplatesStack.addDependency(applicationStack);
dataStack.addDependency(applicationStack);
// Backend imports Data stack resources via CloudFormation exports (implicit dependency)
apiStack.addDependency(backendStack);
// Frontend deploys independently to us-east-1 and is included in Resource Group via tags
