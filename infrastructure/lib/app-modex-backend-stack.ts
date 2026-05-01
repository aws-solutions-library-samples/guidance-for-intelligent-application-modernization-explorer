import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as lambdaDestinations from 'aws-cdk-lib/aws-lambda-destinations';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as stepfunctionsTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as glue from 'aws-cdk-lib/aws-glue';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { LambdaRoleManager } from './app-modex-lambda-role-manager';
import * as fs from 'fs';
import * as path from 'path';

// Create shared Lambda layer
function createSharedLayer(scope: Construct, id: string): lambda.LayerVersion {
  return new lambda.LayerVersion(scope, id, {
    code: lambda.Code.fromAsset('lambda/layers/shared'),
    compatibleRuntimes: [lambda.Runtime.NODEJS_22_X, lambda.Runtime.NODEJS_22_X],
    description: 'Shared utilities for App-ModEx Lambda functions',
  });
}

// Helper function to create Lambda functions with shared layer
function createLambdaFunction(
  scope: Construct,
  id: string,
  functionName: string,
  codePath: string,
  sharedLayer: lambda.LayerVersion,
  role: iam.Role,
  environment: Record<string, string>
): lambda.Function {
  const logGroup = new logs.LogGroup(scope, `${id}-LogGroup`, {
    logGroupName: `/aws/lambda/${functionName}`,
    retention: logs.RetentionDays.ONE_WEEK,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  return new lambda.Function(scope, id, {
    functionName,
    runtime: lambda.Runtime.NODEJS_22_X,
    handler: 'index.handler',
    code: lambda.Code.fromAsset(codePath),
    timeout: Duration.seconds(30),
    memorySize: 512,
    role,
    environment,
    logGroup,
    layers: [sharedLayer],
  });
}

export interface AppModExBackendStackProps extends cdk.StackProps {
  environment: string;
  logLevel?: string;
}

export class AppModExBackendStack extends cdk.Stack {
  public readonly codeBuildProject: codebuild.Project;
  public readonly projectOperationsQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props: AppModExBackendStackProps) {
    super(scope, id, props);

    const { environment, logLevel } = props;
    
    // Determine log level: use provided value or default based on environment
    const effectiveLogLevel = logLevel || (environment === 'prod' ? 'ERROR' : environment === 'staging' ? 'INFO' : 'DEBUG');

    // Import Data stack resources via CloudFormation exports
    const userPoolId = cdk.Fn.importValue('AppModEx-UserPoolId');
    const userPoolArn = cdk.Fn.importValue('AppModEx-UserPoolArn');
    const identityPoolId = cdk.Fn.importValue('AppModEx-IdentityPoolId');
    const projectsTableName = cdk.Fn.importValue('AppModEx-ProjectsTableName');
    const projectsTableArn = cdk.Fn.importValue('AppModEx-ProjectsTableArn');
    const projectDataTableName = cdk.Fn.importValue('AppModEx-ProjectDataTableName');
    const projectDataTableArn = cdk.Fn.importValue('AppModEx-ProjectDataTableArn');
    const exportHistoryTableName = cdk.Fn.importValue('AppModEx-ExportHistoryTableName');
    const exportHistoryTableArn = cdk.Fn.importValue('AppModEx-ExportHistoryTableArn');
    const deploymentBucketName = cdk.Fn.importValue('AppModEx-DeploymentBucketName');
    const deploymentBucketArn = cdk.Fn.importValue('AppModEx-DeploymentBucketArn');
    const projectDataBucketName = cdk.Fn.importValue('AppModEx-ProjectDataBucketName');
    const projectDataBucketArn = cdk.Fn.importValue('AppModEx-ProjectDataBucketArn');
    const accessLogsBucketName = cdk.Fn.importValue('AppModEx-AccessLogsBucketName');
    const accessLogsBucketArn = cdk.Fn.importValue('AppModEx-AccessLogsBucketArn');
    const appConfigSecretArn = cdk.Fn.importValue('AppModEx-AppConfigSecretArn');
    const glueDatabaseName = cdk.Fn.importValue('AppModEx-GlueDatabaseName');

    // ===== GLOBAL SQS QUEUE FOR PROJECT OPERATIONS =====
    
    // Dead Letter Queue for project operations
    const projectOperationsDLQ = new sqs.Queue(this, 'ProjectOperationsDLQ', {
      queueName: `app-modex-project-operations-dlq`,
      retentionPeriod: Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });
    cdk.Tags.of(projectOperationsDLQ).add('Owner', 'platform-team');
    cdk.Tags.of(projectOperationsDLQ).add('Purpose', 'Project operations failure handling');

    // Main queue for project operations (create, delete) - GLOBAL LEVEL
    this.projectOperationsQueue = new sqs.Queue(this, 'ProjectOperationsQueue', {
      queueName: `app-modex-project-operations`,
      visibilityTimeout: Duration.minutes(15),
      retentionPeriod: Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: projectOperationsDLQ,
        maxReceiveCount: 3,
      },
    });

    // ===== GLOBAL SQS QUEUE FOR ASYNC PROCESS ROUTING =====
    
    // Dead Letter Queue for async process routing
    const asyncProcessDLQ = new sqs.Queue(this, 'AsyncProcessDLQ', {
      queueName: `app-modex-async-process-dlq`,
      retentionPeriod: Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });
    cdk.Tags.of(asyncProcessDLQ).add('Owner', 'data-processing-team');
    cdk.Tags.of(asyncProcessDLQ).add('Purpose', 'Async process failure handling');

    // Main queue for async process routing (normalization, skill importance, etc.)
    const asyncProcessQueue = new sqs.Queue(this, 'AsyncProcessQueue', {
      queueName: `app-modex-async-process-queue`,
      visibilityTimeout: Duration.minutes(15),
      retentionPeriod: Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: asyncProcessDLQ,
        maxReceiveCount: 3,
      },
    });

    // ===== DLQ AUTOMATIC REDRIVE LAMBDA =====
    
    // Lambda function for automatic DLQ redrive
    const dlqRedriveRole = new iam.Role(this, 'DLQRedriveRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    projectOperationsDLQ.grantConsumeMessages(dlqRedriveRole);
    asyncProcessDLQ.grantConsumeMessages(dlqRedriveRole);
    this.projectOperationsQueue.grantSendMessages(dlqRedriveRole);
    asyncProcessQueue.grantSendMessages(dlqRedriveRole);

    const dlqRedriveFunction = new lambda.Function(this, 'DLQRedriveFunction', {
      functionName: 'app-modex-dlq-redrive',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand } = require('@aws-sdk/client-sqs');
        const sqs = new SQSClient({});
        
        exports.handler = async (event) => {
          const dlqUrl = event.dlqUrl;
          const targetQueueUrl = event.targetQueueUrl;
          const maxMessages = event.maxMessages || 10;
          
          const receiveParams = {
            QueueUrl: dlqUrl,
            MaxNumberOfMessages: maxMessages,
            WaitTimeSeconds: 1
          };
          
          const { Messages } = await sqs.send(new ReceiveMessageCommand(receiveParams));
          
          if (!Messages || Messages.length === 0) {
            return { redrivenCount: 0 };
          }
          
          for (const message of Messages) {
            await sqs.send(new SendMessageCommand({
              QueueUrl: targetQueueUrl,
              MessageBody: message.Body
            }));
            
            await sqs.send(new DeleteMessageCommand({
              QueueUrl: dlqUrl,
              ReceiptHandle: message.ReceiptHandle
            }));
          }
          
          return { redrivenCount: Messages.length };
        };
      `),
      role: dlqRedriveRole,
      timeout: Duration.minutes(5),
      environment: {
        PROJECT_OPS_DLQ_URL: projectOperationsDLQ.queueUrl,
        PROJECT_OPS_QUEUE_URL: this.projectOperationsQueue.queueUrl,
        ASYNC_PROCESS_DLQ_URL: asyncProcessDLQ.queueUrl,
        ASYNC_PROCESS_QUEUE_URL: asyncProcessQueue.queueUrl,
      },
    });

    // ===== LAMBDA ROLE MANAGER - HELPER FOR PER-FUNCTION ROLES =====
    
    const roleManager = new LambdaRoleManager(this, this.region, this.account);

    // ===== LAMBDA FUNCTIONS =====
    
    // Common Lambda environment variables
    const commonEnvironmentVars = {
      ENVIRONMENT: environment,
      LOG_LEVEL: effectiveLogLevel,
      PROJECTS_TABLE: projectsTableName,
      PROJECT_DATA_TABLE: projectDataTableName,
      EXPORT_HISTORY_TABLE: exportHistoryTableName,
      APP_CONFIG_SECRET_ARN: appConfigSecretArn,
      REGION: this.region,
      PROJECT_OPERATIONS_QUEUE_URL: this.projectOperationsQueue.queueUrl,
      ASYNC_PROCESS_QUEUE_URL: asyncProcessQueue.queueUrl,
      CODEBUILD_PROJECT: 'app-modex-project-provisioning',
      DEPLOYMENT_BUCKET: deploymentBucketName,
      // USER_POOL_ID and IDENTITY_POOL_ID moved to Secrets Manager (APP_CONFIG_SECRET_ARN)
      GLUE_DATABASE: 'app_modex_${projectId}',
      ATHENA_WORKGROUP: 'app-modex-workgroup-${projectId}',
      RESULTS_BUCKET: 'app-modex-results-${projectId}',
      AWS_ACCOUNT_ID: this.account,
      NORMALIZED_DATA_DATABASE: `app-modex-${this.account}`,
      EXPORT_STEP_FUNCTION_ARN_PREFIX: `arn:aws:states:${this.region}:${this.account}:stateMachine:app-modex-export-`,
    };

    // Common Lambda execution role permissions
    const lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-*:*`
      ]
    }));

    // Import DynamoDB tables (use fromTableArn to avoid validation error)
    const projectsTable = dynamodb.Table.fromTableArn(this, 'ImportedProjectsTable', projectsTableArn);
    const projectDataTable = dynamodb.Table.fromTableArn(this, 'ImportedProjectDataTable', projectDataTableArn);
    const exportHistoryTable = dynamodb.Table.fromTableArn(this, 'ImportedExportHistoryTable', exportHistoryTableArn);

    // Grant DynamoDB permissions
    projectsTable.grantReadWriteData(lambdaExecutionRole);
    projectDataTable.grantReadWriteData(lambdaExecutionRole);
    
    // Grant DynamoDB permissions for project-specific process tracking tables
    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:UpdateItem',
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:Query'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-process-*`
      ]
    }));
    
    // Grant SQS permissions for global project operations queue
    this.projectOperationsQueue.grantSendMessages(lambdaExecutionRole);
    this.projectOperationsQueue.grantConsumeMessages(lambdaExecutionRole);
    
    // Grant SQS permissions for async process queue
    asyncProcessQueue.grantSendMessages(lambdaExecutionRole);
    asyncProcessQueue.grantConsumeMessages(lambdaExecutionRole);
    
    // Grant SQS permissions for project-specific data processing queues
    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'sqs:GetQueueUrl',
        'sqs:SendMessage',
        'sqs:ReceiveMessage',
        'sqs:DeleteMessage',
        'sqs:GetQueueAttributes'
      ],
      resources: [
        `arn:aws:sqs:${this.region}:${this.account}:app-modex-data-*`
      ]
    }));
    
    // Grant Cognito permissions for user search
    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:ListUsers',
        'cognito-idp:AdminGetUser',
        'cognito-idp:DescribeUserPool'
      ],
      resources: [userPoolArn]
    }));

    // Grant Secrets Manager read permission
    const appConfigSecret = secretsmanager.Secret.fromSecretCompleteArn(this, 'ImportedAppConfigSecret', appConfigSecretArn);
    appConfigSecret.grantRead(lambdaExecutionRole);

    // Grant Athena permissions
    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'athena:StartQueryExecution',
        'athena:GetQueryExecution',
        'athena:GetQueryResults',
        'athena:StopQueryExecution'
      ],
      resources: [
        `arn:aws:athena:${this.region}:${this.account}:workgroup/app-modex-*`
      ]
    }));

    // Grant Glue permissions
    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'glue:GetDatabase',
        'glue:GetTable',
        'glue:GetPartitions',
        'glue:GetTables'
      ],
      resources: [
        `arn:aws:glue:${this.region}:${this.account}:catalog`,
        `arn:aws:glue:${this.region}:${this.account}:database/app_modex_*`,
        `arn:aws:glue:${this.region}:${this.account}:table/app_modex_*/*`
      ]
    }));

    // Grant S3 permissions for Athena query results
    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket'
      ],
      resources: [
        `arn:aws:s3:::app-modex-results-*`,
        `arn:aws:s3:::app-modex-results-*/*`
      ]
    }));

    // ===== S3 BUCKET POLICIES =====
    
    // Grant S3 permissions to Lambda execution role for deployment and project data buckets
    const deploymentBucket = s3.Bucket.fromBucketAttributes(this, 'ImportedDeploymentBucket', {
      bucketName: deploymentBucketName,
      bucketArn: deploymentBucketArn,
    });
    const projectDataBucket = s3.Bucket.fromBucketAttributes(this, 'ImportedProjectDataBucket', {
      bucketName: projectDataBucketName,
      bucketArn: projectDataBucketArn,
    });
    const accessLogsBucket1 = s3.Bucket.fromBucketAttributes(this, 'ImportedAccessLogsBucket', {
      bucketName: accessLogsBucketName,
      bucketArn: accessLogsBucketArn,
    });
    
    deploymentBucket.grantReadWrite(lambdaExecutionRole);
    projectDataBucket.grantReadWrite(lambdaExecutionRole);
    accessLogsBucket1.grantReadWrite(lambdaExecutionRole);

    // ===== CLOUDFORMATION PERMISSIONS =====
    
    // Grant CloudFormation permissions for provisioning Lambda to check stack status
    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudformation:DescribeStacks',
        'cloudformation:DescribeStackEvents',
        'cloudformation:GetStackPolicy'
      ],
      resources: [
        `arn:aws:cloudformation:${this.region}:${this.account}:stack/App-ModEx-Project-*/*`
      ]
    }));

    // ===== CODEBUILD PERMISSIONS =====
    
    // Grant CodeBuild permissions for provisioning Lambda to start builds
    lambdaExecutionRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'codebuild:StartBuild',
        'codebuild:BatchGetBuilds'
      ],
      resources: [
        `arn:aws:codebuild:${this.region}:${this.account}:project/app-modex-project-provisioning`
      ]
    }));

    // ===== LAMBDA LAYER FOR SHARED UTILITIES =====
    
    const sharedLayer = createSharedLayer(this, 'SharedLayer');

    // ===== BEDROCK GUARDRAILS =====

    // Create Bedrock Guardrail for content filtering
    const bedrockGuardrail = new cdk.CfnResource(this, 'BedrockGuardrail', {
      type: 'AWS::Bedrock::Guardrail',
      properties: {
        Name: 'app-modex-content-filter',
        Description: 'Content filtering for App-ModEx Bedrock models',
        BlockedInputMessaging: 'Your request was blocked due to content policy violations.',
        BlockedOutputsMessaging: 'The response was blocked due to content policy violations.',
        ContentPolicyConfig: {
          FiltersConfig: [
            { Type: 'SEXUAL', InputStrength: 'HIGH', OutputStrength: 'HIGH' },
            { Type: 'VIOLENCE', InputStrength: 'HIGH', OutputStrength: 'HIGH' },
            { Type: 'HATE', InputStrength: 'HIGH', OutputStrength: 'HIGH' },
            { Type: 'INSULTS', InputStrength: 'MEDIUM', OutputStrength: 'MEDIUM' },
            { Type: 'MISCONDUCT', InputStrength: 'MEDIUM', OutputStrength: 'MEDIUM' },
            { Type: 'PROMPT_ATTACK', InputStrength: 'HIGH', OutputStrength: 'NONE' },
          ],
        },
        SensitiveInformationPolicyConfig: {
          PiiEntitiesConfig: [
            { Type: 'EMAIL', Action: 'ANONYMIZE' },
            { Type: 'PHONE', Action: 'ANONYMIZE' },
            { Type: 'NAME', Action: 'ANONYMIZE' },
            { Type: 'US_SOCIAL_SECURITY_NUMBER', Action: 'BLOCK' },
            { Type: 'CREDIT_DEBIT_CARD_NUMBER', Action: 'BLOCK' },
            { Type: 'AWS_ACCESS_KEY', Action: 'BLOCK' },
            { Type: 'AWS_SECRET_KEY', Action: 'BLOCK' },
          ],
        },
        TopicPolicyConfig: {
          TopicsConfig: [
            {
              Name: 'Financial Advice',
              Definition: 'Investment or financial advice',
              Type: 'DENY',
            },
            {
              Name: 'Medical Advice',
              Definition: 'Medical diagnosis or treatment advice',
              Type: 'DENY',
            },
          ],
        },
      },
    });

    cdk.Tags.of(bedrockGuardrail).add('Environment', environment);
    cdk.Tags.of(bedrockGuardrail).add('ManagedBy', 'CDK');

    // ===== PROJECTS LAMBDA - DEDICATED ROLE =====
    
    // Create dedicated role for projects Lambda with least privilege permissions
    const projectsRole = new iam.Role(this, 'ProjectsRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-projects-role',
    });

    // CloudWatch Logs permissions
    projectsRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-projects:*`
      ]
    }));

    // DynamoDB permissions for projects and project data tables
    projectsRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:BatchWriteItem'
      ],
      resources: [
        projectsTableArn,
        projectDataTableArn
      ]
    }));

    // SQS permissions for project operations queue
    projectsRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'sqs:SendMessage',
        'sqs:GetQueueUrl',
        'sqs:GetQueueAttributes'
      ],
      resources: [
        this.projectOperationsQueue.queueArn
      ]
    }));

    // ===== LAMBDA FUNCTIONS =====
    
    // Projects Lambda Function
    const projectsFunction = new lambda.Function(this, 'ProjectsFunction', {
      functionName: 'app-modex-projects',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/projects'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: projectsRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'ProjectsFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-projects',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // Project Data Lambda Function
    const projectDataFunction = createLambdaFunction(
      this,
      'ProjectDataFunction',
      'app-modex-project-data',
      'lambda/global/project-data',
      sharedLayer,
      lambdaExecutionRole,
      commonEnvironmentVars
    );

    // ===== PERMISSIONS BOUNDARY =====
    
    // Create Permissions Boundary to prevent privilege escalation
    // This is created early so it can be referenced by roles throughout the stack
    const permissionsBoundary = new iam.ManagedPolicy(this, 'CDKPermissionsBoundary', {
      managedPolicyName: 'app-modex-cdk-permissions-boundary',
      description: 'Permissions boundary for roles created by CDK deployment',
      statements: [
        // Allow only app-modex specific resources
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            's3:*',
            'dynamodb:*',
            'lambda:*',
            'logs:*',
            'states:*',
            'glue:*',
            'athena:*',
            'bedrock:InvokeModel',
            'sqs:*',
            'sns:*',
            'events:*',
            'secretsmanager:GetSecretValue',
            'cognito-idp:*',
            'cloudformation:DescribeStacks',
            'codebuild:StartBuild'
          ],
          resources: [
            `arn:aws:s3:::app-modex-*`,
            `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-*`,
            `arn:aws:lambda:${this.region}:${this.account}:function:app-modex-*`,
            `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-*`,
            `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/vendedlogs/states/app-modex-*`,
            `arn:aws:states:${this.region}:${this.account}:stateMachine:app-modex-*`,
            `arn:aws:states:${this.region}:${this.account}:execution:app-modex-*:*`,
            `arn:aws:glue:${this.region}:${this.account}:*`,
            `arn:aws:athena:${this.region}:${this.account}:workgroup/app-modex-*`,
            `arn:aws:bedrock:${this.region}::foundation-model/*`,
            `arn:aws:sqs:${this.region}:${this.account}:app-modex-*`,
            `arn:aws:sns:${this.region}:${this.account}:app-modex-*`,
            `arn:aws:events:${this.region}:${this.account}:rule/app-modex-*`,
            `arn:aws:secretsmanager:${this.region}:${this.account}:secret:app-modex-*`,
            `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`,
            `arn:aws:cloudformation:${this.region}:${this.account}:stack/App-ModEx-Project-*`,
            `arn:aws:codebuild:${this.region}:${this.account}:project/app-modex-*`
          ]
        }),
        // Allow CloudWatch Logs management actions that require wildcard resources
        // These actions don't support specific resource ARNs per AWS documentation
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'logs:CreateLogDelivery',
            'logs:GetLogDelivery',
            'logs:UpdateLogDelivery',
            'logs:DeleteLogDelivery',
            'logs:ListLogDeliveries',
            'logs:PutResourcePolicy',
            'logs:DescribeResourcePolicies',
            'logs:DescribeLogGroups'
          ],
          resources: ['*']
        }),
        // Deny IAM privilege escalation
        new iam.PolicyStatement({
          effect: iam.Effect.DENY,
          actions: [
            'iam:CreateUser',
            'iam:CreateAccessKey',
            'iam:PutUserPolicy',
            'iam:AttachUserPolicy'
          ],
          resources: ['*']
        })
      ]
    });

    // ===== SHARING LAMBDA - DEDICATED ROLE =====
    
    // Create dedicated role for sharing Lambda with Secrets Manager, DynamoDB, and Cognito permissions
    const sharingRole = new iam.Role(this, 'SharingRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-sharing-role',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ],
      permissionsBoundary: permissionsBoundary
    });

    // Grant Secrets Manager permissions
    sharingRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['secretsmanager:GetSecretValue'],
      resources: [appConfigSecret.secretArn]
    }));

    // Grant DynamoDB permissions for projects table
    projectsTable.grantReadWriteData(sharingRole);

    // Grant Cognito permissions for user management
    sharingRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminCreateUser',
        'cognito-idp:ListUsers'
      ],
      resources: [userPoolArn]
    }));

    // Sharing Lambda Function
    const sharingFunction = createLambdaFunction(
      this,
      'SharingFunction',
      'app-modex-sharing',
      'lambda/global/sharing',
      sharedLayer,
      sharingRole,
      commonEnvironmentVars
    );

    // ===== PROCESS TRACKING LAMBDA - DEDICATED ROLE =====
    
    // Create dedicated role for process tracking Lambda with least privilege permissions
    const processTrackingRole = new iam.Role(this, 'ProcessTrackingRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-process-tracking-role',
    });

    // CloudWatch Logs permissions
    processTrackingRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-process-tracking:*`
      ]
    }));

    // DynamoDB permissions for project-specific process tables
    processTrackingRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:Scan',
        'dynamodb:Query',
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-process-*`
      ]
    }));

    // EventBridge permissions for publishing process events
    processTrackingRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'events:PutEvents'
      ],
      resources: [
        `arn:aws:events:${this.region}:${this.account}:event-bus/app-modex-events-*`
      ]
    }));

    // Process Tracking Lambda Function
    const processTrackingFunction = new lambda.Function(this, 'ProcessTrackingFunction', {
      functionName: 'app-modex-process-tracking',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/process-tracking'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: processTrackingRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'ProcessTrackingFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-process-tracking',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // User Search Lambda Role
    const userSearchRole = roleManager.createLambdaRole('UserSearchRole', 'app-modex-user-search');
    appConfigSecret.grantRead(userSearchRole);
    userSearchRole.addToPolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:ListUsers'],
      resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`]
    }));

    // User Search Lambda Function
    const userSearchFunction = new lambda.Function(this, 'UserSearchFunction', {
      functionName: 'app-modex-user-search',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/user-search'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: userSearchRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'UserSearchFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-user-search',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // Pilot Initiate Lambda Role
    const pilotInitiateRole = roleManager.createLambdaRole('PilotInitiateRole', 'app-modex-pilot-initiate');
    projectsTable.grantReadData(pilotInitiateRole);
    projectDataTable.grantReadData(pilotInitiateRole);
    pilotInitiateRole.addToPolicy(new iam.PolicyStatement({
      actions: ['states:StartExecution'],
      resources: [`arn:aws:states:${this.region}:${this.account}:stateMachine:app-modex-pilot-analysis-*`]
    }));

    // Pilot Identification - Initiate Lambda Function
    const pilotInitiateFunction = new lambda.Function(this, 'PilotInitiateFunction', {
      functionName: 'app-modex-pilot-initiate',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/pilot-identification'),
      timeout: Duration.seconds(60),
      memorySize: 512,
      role: pilotInitiateRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'PilotInitiateFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-pilot-initiate',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // Pilot Status Lambda Role
    const pilotStatusRole = roleManager.createLambdaRole('PilotStatusRole', 'app-modex-pilot-status');
    pilotStatusRole.addToPolicy(new iam.PolicyStatement({
      actions: ['states:DescribeExecution', 'states:GetExecutionHistory'],
      resources: [`arn:aws:states:${this.region}:${this.account}:execution:app-modex-pilot-analysis-*:*`]
    }));

    // Pilot Identification - Status Lambda Function
    const pilotStatusFunction = new lambda.Function(this, 'PilotStatusFunction', {
      functionName: 'app-modex-pilot-status',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/pilot-identification'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: pilotStatusRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'PilotStatusFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-pilot-status',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // Pilot Results Lambda Role
    const pilotResultsRole = roleManager.createLambdaRole('PilotResultsRole', 'app-modex-pilot-results');
    pilotResultsRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [`arn:aws:s3:::app-modex-data-*/pilot-analysis/*`]
    }));

    // Pilot Identification - Results Lambda Function
    const pilotResultsFunction = new lambda.Function(this, 'PilotResultsFunction', {
      functionName: 'app-modex-pilot-results',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/pilot-identification'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: pilotResultsRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'PilotResultsFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-pilot-results',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // Pilot Delete Lambda Role
    const pilotDeleteRole = roleManager.createLambdaRole('PilotDeleteRole', 'app-modex-pilot-delete');
    pilotDeleteRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:DeleteObject'],
      resources: [`arn:aws:s3:::app-modex-data-*/pilot-analysis/*`]
    }));
    pilotDeleteRole.addToPolicy(new iam.PolicyStatement({
      actions: ['states:StopExecution'],
      resources: [`arn:aws:states:${this.region}:${this.account}:execution:app-modex-pilot-analysis-*:*`]
    }));

    // Pilot Identification - Delete Lambda Function
    const pilotDeleteFunction = new lambda.Function(this, 'PilotDeleteFunction', {
      functionName: 'app-modex-pilot-delete',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/pilot-identification'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: pilotDeleteRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'PilotDeleteFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-pilot-delete',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // ===== APPLICATION BUCKETS LAMBDA - DEDICATED ROLE =====
    
    // Create dedicated role for application buckets Lambda with least privilege permissions
    const applicationBucketsRole = new iam.Role(this, 'ApplicationBucketsRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-application-buckets-role',
    });

    // CloudWatch Logs permissions
    applicationBucketsRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-application-buckets:*`
      ]
    }));

    // DynamoDB permissions for project-specific application-buckets tables
    applicationBucketsRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:Query',
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:DeleteItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-application-buckets-*`
      ]
    }));

    // Application Buckets Lambda Function
    const applicationBucketsFunction = new lambda.Function(this, 'ApplicationBucketsFunction', {
      functionName: 'app-modex-application-buckets',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/application-buckets'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: applicationBucketsRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'ApplicationBucketsFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-application-buckets',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // ===== TCO ESTIMATES LAMBDA - DEDICATED ROLE =====
    
    // Create dedicated role for TCO Lambda with least privilege permissions
    const tcoRole = new iam.Role(this, 'TCORole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-tco-role',
    });

    // CloudWatch Logs permissions
    tcoRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-tco:*`
      ]
    }));

    // DynamoDB permissions for project-specific TCO estimates tables
    tcoRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:Query',
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:DeleteItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-tco-estimates-*`
      ]
    }));

    // TCO Estimates Lambda Function
    const tcoFunction = new lambda.Function(this, 'TCOFunction', {
      functionName: 'app-modex-tco',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/tco'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: tcoRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'TCOFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-tco',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // ===== TEAM ESTIMATES LAMBDA - DEDICATED ROLE =====
    
    // Create dedicated role for team estimates Lambda with least privilege permissions
    const teamEstimatesRole = new iam.Role(this, 'TeamEstimatesRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-team-estimates-role',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      description: 'Execution role for team-estimates Lambda with least privilege DynamoDB access',
    });

    // Grant DynamoDB permissions only for team-estimates tables
    teamEstimatesRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-team-estimates-*`
      ],
    }));

    // Team Estimates Lambda Function
    const teamEstimatesFunction = new lambda.Function(this, 'TeamEstimatesFunction', {
      functionName: 'app-modex-team-estimates',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/team-estimates'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: teamEstimatesRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'TeamEstimatesFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-team-estimates',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // ===== ATHENA QUERY LAMBDA - DEDICATED ROLE =====
    
    // Create dedicated role for athena query Lambda with least privilege permissions
    const athenaQueryRole = new iam.Role(this, 'AthenaQueryRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-athena-query-role',
    });

    // CloudWatch Logs permissions
    athenaQueryRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-athena-query:*`
      ]
    }));

    // Athena permissions for query execution
    athenaQueryRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'athena:StartQueryExecution',
        'athena:GetQueryExecution',
        'athena:GetQueryResults',
        'athena:StopQueryExecution'
      ],
      resources: [
        `arn:aws:athena:${this.region}:${this.account}:workgroup/app-modex-workgroup-*`
      ]
    }));

    // Glue permissions for database and table metadata
    athenaQueryRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'glue:GetDatabase',
        'glue:GetTable',
        'glue:GetPartitions',
        'glue:GetTables'
      ],
      resources: [
        `arn:aws:glue:${this.region}:${this.account}:catalog`,
        `arn:aws:glue:${this.region}:${this.account}:database/app_modex_*`,
        `arn:aws:glue:${this.region}:${this.account}:database/app-modex-*`,
        `arn:aws:glue:${this.region}:${this.account}:table/app_modex_*/*`,
        `arn:aws:glue:${this.region}:${this.account}:table/app-modex-*/*`
      ]
    }));

    // S3 permissions for Athena query results and project data
    athenaQueryRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:DeleteObject',
        's3:ListBucket',
        's3:GetBucketLocation',
        's3:GetBucketVersioning',
        's3:ListBucketVersions'
      ],
      resources: [
        `arn:aws:s3:::app-modex-results-*`,
        `arn:aws:s3:::app-modex-results-*/*`,
        `arn:aws:s3:::app-modex-data-*`,
        `arn:aws:s3:::app-modex-data-*/*`,
        `arn:aws:s3:::app-modex-normalized-data-*`,
        `arn:aws:s3:::app-modex-normalized-data-*/*`
      ]
    }));

    // Athena Query Lambda Function
    const athenaQueryFunction = new lambda.Function(this, 'AthenaQueryFunction', {
      functionName: 'app-modex-athena-query',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/athena-query'),
      timeout: Duration.seconds(60),
      memorySize: 512,
      role: athenaQueryRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'AthenaQueryFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-athena-query',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // ===== TEAM WEIGHTS LAMBDA - DEDICATED ROLE =====
    
    // Create dedicated role for team weights Lambda with least privilege permissions
    const teamWeightsRole = new iam.Role(this, 'TeamWeightsRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-team-weights-role',
    });

    // CloudWatch Logs permissions
    teamWeightsRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-team-weights:*`
      ]
    }));

    // S3 permissions for reading and writing team weights files
    teamWeightsRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:GetObject',
        's3:PutObject'
      ],
      resources: [
        `arn:aws:s3:::app-modex-data-*`,
        `arn:aws:s3:::app-modex-data-*/*`
      ]
    }));

    // DynamoDB permissions for reading team data from data sources tables
    teamWeightsRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:GetItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-data-sources-*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-data-sources-*/index/*`
      ]
    }));

    // DynamoDB permissions for writing process tracking records
    teamWeightsRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:PutItem',
        'dynamodb:UpdateItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-process-*`
      ]
    }));

    // Step Functions permissions for starting skill importance executions
    teamWeightsRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'states:StartExecution'
      ],
      resources: [
        `arn:aws:states:${this.region}:${this.account}:stateMachine:app-modex-skill-importance-*`
      ]
    }));

    // Team Weights Lambda Function
    const teamWeightsFunction = new lambda.Function(this, 'TeamWeightsFunction', {
      functionName: 'app-modex-team-weights',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/team-weights'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: teamWeightsRole,
      environment: {
        ...commonEnvironmentVars,
        AWS_ACCOUNT_ID: this.account,
        REGION: this.region
      },
      logGroup: new logs.LogGroup(this, 'TeamWeightsFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-team-weights',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // ===== STEP FUNCTION API LAMBDA - DEDICATED ROLE =====
    
    // Create dedicated role for step function API Lambda with least privilege permissions
    const stepFunctionApiRole = new iam.Role(this, 'StepFunctionApiRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-step-function-api-role',
    });

    // CloudWatch Logs permissions
    stepFunctionApiRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-step-function-api:*`
      ]
    }));

    // Step Functions permissions for describing executions (polling status)
    stepFunctionApiRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'states:DescribeExecution',
        'states:ListExecutions'
      ],
      resources: [
        `arn:aws:states:${this.region}:${this.account}:execution:app-modex-*:*`,
        `arn:aws:states:${this.region}:${this.account}:stateMachine:app-modex-*`
      ]
    }));

    // DynamoDB permissions for process tracking tables (read/write for tracking)
    stepFunctionApiRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:Query',
        'dynamodb:Scan'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-process-*`
      ]
    }));

    // Step Function API Lambda Function
    const stepFunctionApiFunction = new lambda.Function(this, 'StepFunctionApiFunction', {
      functionName: 'app-modex-step-function-api',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/step-function-api'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: stepFunctionApiRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'StepFunctionApiFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-step-function-api',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // ===== EXPORT INITIATOR LAMBDA - DEDICATED ROLE =====
    
    // Create dedicated role for export initiation (POST /export) with least privilege permissions
    const exportInitiatorRole = new iam.Role(this, 'ExportInitiatorRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-export-initiator-role',
    });

    // CloudWatch Logs permissions
    exportInitiatorRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-export-initiator:*`
      ]
    }));

    // DynamoDB permissions for export history table (write operations only)
    exportInitiatorRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:PutItem',
        'dynamodb:UpdateItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-export-history`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-export-history/index/*`
      ]
    }));

    // DynamoDB permissions for projects table (read-only to get project names)
    exportInitiatorRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:GetItem'
      ],
      resources: [
        projectsTableArn
      ]
    }));

    // Step Functions permissions to start executions for project-specific export step functions
    exportInitiatorRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'states:StartExecution'
      ],
      resources: [
        `arn:aws:states:${this.region}:${this.account}:stateMachine:app-modex-export-*`
      ]
    }));

    // Export Initiator Lambda Function
    const exportInitiatorFunction = new lambda.Function(this, 'ExportInitiatorFunction', {
      functionName: 'app-modex-export-initiator',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/export-initiator'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: exportInitiatorRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'ExportInitiatorFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-export-initiator',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // ===== EXPORT READER LAMBDA - DEDICATED ROLE =====
    
    // Create dedicated role for export reading and downloading (GET /export*) with least privilege permissions
    const exportReaderRole = new iam.Role(this, 'ExportReaderRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-export-reader-role',
    });

    // CloudWatch Logs permissions
    exportReaderRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-export-reader:*`
      ]
    }));

    // DynamoDB permissions for export history table (read and query operations)
    exportReaderRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:GetItem',
        'dynamodb:Query'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-export-history`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-export-history/index/*`
      ]
    }));

    // DynamoDB permissions for updating download metadata (UpdateItem only for download tracking)
    exportReaderRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:UpdateItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-export-history`
      ]
    }));

    // S3 permissions for generating signed URLs on project data buckets (read-only)
    exportReaderRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:GetObject',
        's3:ListBucket'
      ],
      resources: [
        `arn:aws:s3:::app-modex-data-*`,
        `arn:aws:s3:::app-modex-data-*/*`
      ]
    }));

    // Export Reader Lambda Function
    const exportReaderFunction = new lambda.Function(this, 'ExportReaderFunction', {
      functionName: 'app-modex-export-reader',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/export-reader'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: exportReaderRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'ExportReaderFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-export-reader',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // Automation Status Lambda Role
    const automationStatusRole = roleManager.createLambdaRole('AutomationStatusRole', 'app-modex-automation-status');
    projectsTable.grantReadData(automationStatusRole);
    automationStatusRole.addToPolicy(new iam.PolicyStatement({
      actions: ['codebuild:BatchGetBuilds'],
      resources: [`arn:aws:codebuild:${this.region}:${this.account}:project/app-modex-*`]
    }));

    // Automation Status Lambda Function
    const automationStatusFunction = new lambda.Function(this, 'AutomationStatusFunction', {
      functionName: 'app-modex-automation-status',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/automation-status'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: automationStatusRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'AutomationStatusFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-automation-status',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // ===== PROVISIONING LAMBDA - DEDICATED ROLE =====
    
    // Create dedicated role for provisioning Lambda with least privilege permissions
    const provisioningRole = new iam.Role(this, 'ProvisioningRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-provisioning-role',
    });

    // CloudWatch Logs permissions
    provisioningRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-provisioning:*`
      ]
    }));

    // DynamoDB permissions for projects table
    provisioningRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:GetItem',
        'dynamodb:UpdateItem'
      ],
      resources: [
        projectsTableArn
      ]
    }));

    // CodeBuild permissions to start builds and get build status
    provisioningRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'codebuild:StartBuild',
        'codebuild:BatchGetBuilds'
      ],
      resources: [
        `arn:aws:codebuild:${this.region}:${this.account}:project/app-modex-project-provisioning`
      ]
    }));

    // CloudFormation permissions to check stack status
    provisioningRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'cloudformation:DescribeStacks',
        'cloudformation:DescribeStackEvents',
        'cloudformation:GetStackPolicy'
      ],
      resources: [
        `arn:aws:cloudformation:${this.region}:${this.account}:stack/App-ModEx-Project-*/*`
      ]
    }));

    // S3 permissions to read deployment bucket
    provisioningRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:GetObject',
        's3:ListBucket'
      ],
      resources: [
        deploymentBucketArn,
        `${deploymentBucketArn}/*`
      ]
    }));

    // SQS permissions to receive messages from project operations queue
    provisioningRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'sqs:ReceiveMessage',
        'sqs:DeleteMessage',
        'sqs:GetQueueAttributes'
      ],
      resources: [
        this.projectOperationsQueue.queueArn
      ]
    }));

    // Secrets Manager permissions to read app configuration
    provisioningRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['secretsmanager:GetSecretValue'],
      resources: [appConfigSecretArn]
    }));

    // Provisioning Lambda Function
    const provisioningFunction = new lambda.Function(this, 'ProvisioningFunction', {
      functionName: 'app-modex-provisioning',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/provisioning'),
      timeout: Duration.seconds(60),
      memorySize: 512,
      role: provisioningRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'ProvisioningFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-provisioning',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // Connect provisioning Lambda to project operations queue
    provisioningFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(this.projectOperationsQueue, {
        batchSize: 1,
        maxConcurrency: 2,
      })
    );

    // ===== BUILD MONITOR LAMBDA - DEDICATED ROLE =====
    
    // Create dedicated role for build monitor Lambda with least privilege permissions
    const buildMonitorRole = new iam.Role(this, 'BuildMonitorRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-build-monitor-role',
    });

    // CloudWatch Logs permissions
    buildMonitorRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-build-monitor:*`
      ]
    }));

    // DynamoDB permissions for projects and project data tables
    buildMonitorRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:Query',
        'dynamodb:BatchWriteItem'
      ],
      resources: [
        projectsTableArn,
        projectDataTableArn
      ]
    }));

    // Build Monitor Lambda Function
    const buildMonitorFunction = new lambda.Function(this, 'BuildMonitorFunction', {
      functionName: 'app-modex-build-monitor',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/build-monitor'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: buildMonitorRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'BuildMonitorFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-build-monitor',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });
    
    // DLQ for async Lambda invocations (EventBridge)
    const asyncInvocationDLQ = new sqs.Queue(this, 'AsyncInvocationDLQ', {
      queueName: 'app-modex-async-invocation-dlq',
      retentionPeriod: Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });
    
    cdk.Tags.of(asyncInvocationDLQ).add('Owner', 'platform-team');
    cdk.Tags.of(asyncInvocationDLQ).add('Purpose', 'Async Lambda invocation failure handling');
    
    // Configure on-failure destination for buildMonitorFunction
    buildMonitorFunction.configureAsyncInvoke({
      onFailure: new lambdaDestinations.SqsDestination(asyncInvocationDLQ),
      maxEventAge: Duration.hours(6),
      retryAttempts: 2,
    });

    // ===== FILE OPERATIONS LAMBDA - DEDICATED ROLE =====
    
    // Create dedicated role for file operations Lambda with least privilege permissions
    const fileOperationsRole = new iam.Role(this, 'FileOperationsRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-file-operations-role',
    });

    // CloudWatch Logs permissions
    fileOperationsRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-file-operations:*`
      ]
    }));

    // S3 permissions for file deletion and retrieval
    fileOperationsRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:GetObject',
        's3:DeleteObject'
      ],
      resources: [
        `arn:aws:s3:::app-modex-data-*`,
        `arn:aws:s3:::app-modex-data-*/*`
      ]
    }));

    // DynamoDB permissions for data sources table (read and delete)
    fileOperationsRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:GetItem',
        'dynamodb:DeleteItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-data-sources-*`
      ]
    }));

    // DynamoDB permissions for process tracking table (write process records)
    fileOperationsRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:PutItem',
        'dynamodb:UpdateItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-process-*`
      ]
    }));

    // File Operations Lambda Function
    const fileOperationsFunction = new lambda.Function(this, 'FileOperationsFunction', {
      functionName: 'app-modex-file-operations',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/file-operations'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: fileOperationsRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'FileOperationsFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-file-operations',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // ===== DATA SOURCES LAMBDA - DEDICATED ROLE =====
    
    // Create dedicated role for data sources Lambda with least privilege permissions
    const dataSourcesRole = new iam.Role(this, 'DataSourcesRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-data-sources-role',
    });

    // CloudWatch Logs permissions
    dataSourcesRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-data-sources:*`
      ]
    }));

    // DynamoDB permissions for project-specific data sources tables
    dataSourcesRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:Query',
        'dynamodb:Scan',
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-data-sources-*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-data-sources-*/index/*`
      ]
    }));

    // Data Sources Lambda Function
    const dataSourcesFunction = new lambda.Function(this, 'DataSourcesFunction', {
      functionName: 'app-modex-data-sources',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/data-sources'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: dataSourcesRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'DataSourcesFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-data-sources',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // ===== FILE UPLOAD LAMBDA - DEDICATED ROLE =====
    
    // Create dedicated role for file upload Lambda with least privilege permissions
    const fileUploadRole = new iam.Role(this, 'FileUploadRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-file-upload-role',
    });

    // CloudWatch Logs permissions
    fileUploadRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-file-upload:*`
      ]
    }));

    // DynamoDB permissions for projects table (read-only for permission checks)
    fileUploadRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:GetItem'
      ],
      resources: [
        projectsTableArn
      ]
    }));

    // DynamoDB permissions for project-specific process tables
    fileUploadRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:PutItem',
        'dynamodb:UpdateItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-process-*`
      ]
    }));

    // DynamoDB permissions for project-specific data sources tables
    fileUploadRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:PutItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-data-sources-*`
      ]
    }));

    // S3 permissions for project data buckets
    fileUploadRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:PutObject',
        's3:GetObject'
      ],
      resources: [
        `arn:aws:s3:::app-modex-data-*`,
        `arn:aws:s3:::app-modex-data-*/*`
      ]
    }));

    // SQS permissions for project-specific data processing queues
    fileUploadRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'sqs:SendMessage',
        'sqs:GetQueueUrl'
      ],
      resources: [
        `arn:aws:sqs:${this.region}:${this.account}:app-modex-data-*`
      ]
    }));

    // File Upload Lambda Function
    const fileUploadFunction = new lambda.Function(this, 'FileUploadFunction', {
      functionName: 'app-modex-file-upload',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/file-upload'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: fileUploadRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'FileUploadFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-file-upload',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // Compare with Athena Lambda Role
    const compareWithAthenaRole = roleManager.createLambdaRole('CompareWithAthenaRole', 'app-modex-compare-with-athena');
    compareWithAthenaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['athena:StartQueryExecution', 'athena:GetQueryExecution', 'athena:GetQueryResults'],
      resources: [`arn:aws:athena:${this.region}:${this.account}:workgroup/app-modex-*`]
    }));
    compareWithAthenaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:PutObject'],
      resources: [`arn:aws:s3:::app-modex-results-*/*`]
    }));

    // Compare with Athena Lambda Function
    const compareWithAthenaFunction = new lambda.Function(this, 'CompareWithAthenaFunction', {
      functionName: 'app-modex-compare-with-athena',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/compare-with-athena'),
      timeout: Duration.seconds(60),
      memorySize: 512,
      role: compareWithAthenaRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'CompareWithAthenaFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-compare-with-athena',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // ===== NEW NORMALIZATION LAMBDA FUNCTIONS V2 =====
    
    // Dead Letter Queue for normalization workflow
    const normalizationDLQ = new sqs.Queue(this, 'NormalizationDLQ', {
      queueName: `app-modex-normalization-dlq`,
      retentionPeriod: Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      visibilityTimeout: Duration.minutes(30), // Must be >= 6x Lambda timeout (5 min * 6 = 30 min)
    });

    // SNS topic for normalization alerts
    const normalizationAlertTopic = new sns.Topic(this, 'NormalizationAlertTopic', {
      topicName: `app-modex-normalization-alerts`,
      displayName: 'AppModEx Normalization Alerts'
    });

    // 1. Batch Extractor Lambda
    const batchExtractorRole = new iam.Role(this, 'BatchExtractorRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-batch-extractor-role',
    });

    batchExtractorRole.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-batch-extractor:*`]
    }));

    batchExtractorRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: ['arn:aws:s3:::app-modex-data-*/data-processed/applications-tech-stack/*']
    }));

    const batchExtractorFunction = new lambda.Function(this, 'BatchExtractorFunction', {
      functionName: 'app-modex-batch-extractor',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/batch-extractor'),
      timeout: Duration.seconds(60),
      memorySize: 512,
      role: batchExtractorRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'BatchExtractorFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-batch-extractor',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    // 2. Athena Lookup Service Lambda
    const athenaLookupRole = new iam.Role(this, 'AthenaLookupRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-athena-lookup-service-role',
    });

    athenaLookupRole.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-athena-lookup-service:*`]
    }));

    athenaLookupRole.addToPolicy(new iam.PolicyStatement({
      actions: ['athena:StartQueryExecution', 'athena:GetQueryResults', 'athena:GetQueryExecution'],
      resources: [`arn:aws:athena:${this.region}:${this.account}:workgroup/primary`]
    }));

    athenaLookupRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:GetBucketLocation',
        's3:ListBucket'
      ],
      resources: [
        'arn:aws:s3:::app-modex-results-*',
        'arn:aws:s3:::app-modex-results-*/*'
      ]
    }));

    athenaLookupRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:GetObject',
        's3:ListBucket',
        's3:GetBucketLocation'
      ],
      resources: [
        'arn:aws:s3:::app-modex-normalized-data-*',
        'arn:aws:s3:::app-modex-normalized-data-*/*'
      ]
    }));

    athenaLookupRole.addToPolicy(new iam.PolicyStatement({
      actions: ['glue:GetDatabase', 'glue:GetTable'],
      resources: [
        `arn:aws:glue:${this.region}:${this.account}:catalog`,
        `arn:aws:glue:${this.region}:${this.account}:database/app-modex-${this.account}`,
        `arn:aws:glue:${this.region}:${this.account}:table/app-modex-${this.account}/normalized_*`
      ]
    }));

    const athenaLookupFunction = new lambda.Function(this, 'AthenaLookupFunction', {
      functionName: 'app-modex-athena-lookup-service',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/athena-lookup-service'),
      timeout: Duration.seconds(90),
      memorySize: 512,
      role: athenaLookupRole,
      environment: {
        ...commonEnvironmentVars,
        NORMALIZED_DATA_DATABASE: `app-modex-${this.account}`
      },
      logGroup: new logs.LogGroup(this, 'AthenaLookupFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-athena-lookup-service',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    // 3. Bedrock Normalizer Lambda
    const bedrockNormalizerRole = new iam.Role(this, 'BedrockNormalizerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-bedrock-normalizer-role',
    });

    bedrockNormalizerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-bedrock-normalizer:*`]
    }));

    bedrockNormalizerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [`arn:aws:bedrock:${this.region}::foundation-model/amazon.nova-lite-v1:0`]
    }));

    bedrockNormalizerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:ApplyGuardrail'],
      resources: [bedrockGuardrail.ref]
    }));

    bedrockNormalizerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['dynamodb:GetItem'],
      resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-prompt-templates`]
    }));

    const bedrockNormalizerFunction = new lambda.Function(this, 'BedrockNormalizerFunction', {
      functionName: 'app-modex-bedrock-normalizer',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/bedrock-normalizer'),
      timeout: Duration.minutes(5),
      memorySize: 512,
      role: bedrockNormalizerRole,
      environment: {
        ...commonEnvironmentVars,
        BEDROCK_GUARDRAIL_ID: bedrockGuardrail.ref,
        BEDROCK_GUARDRAIL_VERSION: 'DRAFT',
      },
      logGroup: new logs.LogGroup(this, 'BedrockNormalizerFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-bedrock-normalizer',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // 4. Mapping Aggregator Lambda
    const mappingAggregatorRole = new iam.Role(this, 'MappingAggregatorRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-mapping-aggregator-role',
    });

    mappingAggregatorRole.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-mapping-aggregator:*`]
    }));

    mappingAggregatorRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:PutObject'],
      resources: [`arn:aws:s3:::app-modex-normalized-data-${this.account}-${this.region}/normalized-data/*`]
    }));

    mappingAggregatorRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:ListBucket', 's3:GetBucketLocation'],
      resources: [`arn:aws:s3:::app-modex-normalized-data-${this.account}-${this.region}`]
    }));

    mappingAggregatorRole.addToPolicy(new iam.PolicyStatement({
      actions: ['glue:UpdateTable'],
      resources: [
        `arn:aws:glue:${this.region}:${this.account}:catalog`,
        `arn:aws:glue:${this.region}:${this.account}:database/app-modex-${this.account}`,
        `arn:aws:glue:${this.region}:${this.account}:table/app-modex-${this.account}/normalized-*`
      ]
    }));

    const mappingAggregatorFunction = new lambda.Function(this, 'MappingAggregatorFunction', {
      functionName: 'app-modex-mapping-aggregator',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/mapping-aggregator'),
      timeout: Duration.seconds(90),
      memorySize: 512,
      role: mappingAggregatorRole,
      environment: {
        ...commonEnvironmentVars,
        NORMALIZED_DATA_BUCKET: `app-modex-normalized-data-${this.account}-${this.region}`,
        NORMALIZED_DATA_DATABASE: `app-modex-${this.account}`
      },
      logGroup: new logs.LogGroup(this, 'MappingAggregatorFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-mapping-aggregator',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    // 5. Normalization Status Tracker Lambda
    const statusTrackerRole = new iam.Role(this, 'StatusTrackerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-normalization-status-tracker-role',
    });

    statusTrackerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-normalization-status-tracker:*`]
    }));

    statusTrackerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['dynamodb:UpdateItem', 'dynamodb:GetItem'],
      resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-process-*`]
    }));

    const statusTrackerFunction = new lambda.Function(this, 'StatusTrackerFunction', {
      functionName: 'app-modex-normalization-status-tracker',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/normalization-status-tracker'),
      timeout: Duration.seconds(30),
      memorySize: 256,
      role: statusTrackerRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'StatusTrackerFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-normalization-status-tracker',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    // 6. Normalization Error Handler Lambda
    const errorHandlerRole = new iam.Role(this, 'ErrorHandlerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-normalization-error-handler-role',
    });

    errorHandlerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-normalization-error-handler:*`]
    }));

    errorHandlerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['dynamodb:UpdateItem'],
      resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-process-*`]
    }));

    errorHandlerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['sqs:SendMessage'],
      resources: [normalizationDLQ.queueArn]
    }));

    const errorHandlerFunction = new lambda.Function(this, 'ErrorHandlerFunction', {
      functionName: 'app-modex-normalization-error-handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/normalization-error-handler'),
      timeout: Duration.seconds(30),
      memorySize: 256,
      role: errorHandlerRole,
      environment: {
        ...commonEnvironmentVars,
        NORMALIZATION_DLQ_URL: normalizationDLQ.queueUrl
      },
      logGroup: new logs.LogGroup(this, 'ErrorHandlerFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-normalization-error-handler',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    // 7. Normalization Metrics Lambda
    const metricsRole = new iam.Role(this, 'MetricsRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-normalization-metrics-role',
    });

    metricsRole.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-normalization-metrics:*`]
    }));

    // WILDCARD JUSTIFICATION: CloudWatch PutMetricData requires wildcard resource
    // AWS Service Limitation: CloudWatch Metrics API does not support resource-level permissions
    // Reference: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/permissions-reference-cw.html
    // Mitigation: Scoped to specific namespace 'AppModEx/Normalization' via condition
    // Security Impact: Low - only allows publishing metrics to designated namespace
    metricsRole.addToPolicy(new iam.PolicyStatement({
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'cloudwatch:namespace': 'AppModEx/Normalization'
        }
      }
    }));

    const metricsFunction = new lambda.Function(this, 'MetricsFunction', {
      functionName: 'app-modex-normalization-metrics',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/normalization-metrics'),
      timeout: Duration.seconds(30),
      memorySize: 256,
      role: metricsRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'MetricsFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-normalization-metrics',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    // 8. Normalization DLQ Processor Lambda
    const dlqProcessorRole = new iam.Role(this, 'DLQProcessorRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-normalization-dlq-processor-role',
    });

    dlqProcessorRole.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-normalization-dlq-processor:*`]
    }));

    dlqProcessorRole.addToPolicy(new iam.PolicyStatement({
      actions: ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes'],
      resources: [normalizationDLQ.queueArn]
    }));

    dlqProcessorRole.addToPolicy(new iam.PolicyStatement({
      actions: ['dynamodb:UpdateItem'],
      resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-process-*`]
    }));

    dlqProcessorRole.addToPolicy(new iam.PolicyStatement({
      actions: ['sns:Publish'],
      resources: [normalizationAlertTopic.topicArn]
    }));

    const dlqProcessorFunction = new lambda.Function(this, 'DLQProcessorFunction', {
      functionName: 'app-modex-normalization-dlq-processor',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/normalization-dlq-processor'),
      timeout: Duration.minutes(5),
      memorySize: 256,
      role: dlqProcessorRole,
      environment: {
        ...commonEnvironmentVars,
        ALERT_TOPIC_ARN: normalizationAlertTopic.topicArn
      },
      logGroup: new logs.LogGroup(this, 'DLQProcessorFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-normalization-dlq-processor',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    // Add DLQ as event source for DLQ processor
    dlqProcessorFunction.addEventSource(new lambdaEventSources.SqsEventSource(normalizationDLQ, {
      batchSize: 10,
      maxBatchingWindow: Duration.seconds(5)
    }));

    // Create Glue tables for normalized data
    // Create dedicated logs bucket for normalized data bucket
    const normalizedDataLogsBucket = new s3.Bucket(this, 'NormalizedDataLogsBucket', {
      bucketName: `app-modex-normalized-data-logs-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          id: 'DeleteOldLogs',
          enabled: true,
          expiration: Duration.days(90),
        },
      ],
    });

    // Enforce encryption in transit for logs bucket
    normalizedDataLogsBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'DenyInsecureTransport',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:*'],
      resources: [
        normalizedDataLogsBucket.bucketArn,
        `${normalizedDataLogsBucket.bucketArn}/*`
      ],
      conditions: {
        Bool: {
          'aws:SecureTransport': 'false'
        }
      }
    }));

    const normalizedDataBucket = new s3.Bucket(this, 'NormalizedDataBucket', {
      bucketName: `app-modex-normalized-data-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      serverAccessLogsBucket: normalizedDataLogsBucket,
      serverAccessLogsPrefix: 'normalized-data/',
    });

    // Enforce encryption in transit
    normalizedDataBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'DenyInsecureTransport',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:*'],
      resources: [
        normalizedDataBucket.bucketArn,
        `${normalizedDataBucket.bucketArn}/*`
      ],
      conditions: {
        Bool: {
          'aws:SecureTransport': 'false'
        }
      }
    }));

    // Create Glue database for normalized tables
    const glueDatabase = new glue.CfnDatabase(this, 'GlueDatabase', {
      catalogId: this.account,
      databaseInput: {
        name: `app-modex-${this.account}`,
        description: 'App-ModEx global database for normalized technology data',
      },
    });

    // Create normalized tables
    const tableTypes = [
      'normalized_runtimes',
      'normalized_frameworks',
      'normalized_databases',
      'normalized_integrations',
      'normalized_storages'
    ];

    tableTypes.forEach(tableType => {
      new glue.CfnTable(this, `${tableType.replace('normalized_', '')}Table`, {
        catalogId: this.account,
        databaseName: glueDatabase.ref,
        tableInput: {
          name: tableType,
          description: `Normalized ${tableType.replace('normalized_', '')} technology mappings`,
          tableType: 'EXTERNAL_TABLE',
          parameters: {
            'classification': 'csv',
            'delimiter': ',',
            'skip.header.line.count': '1',
          },
          storageDescriptor: {
            columns: [
              {
                name: 'original',
                type: 'string',
                comment: 'Original technology name from user input'
              },
              {
                name: 'normalized',
                type: 'string',
                comment: 'Normalized technology name from Bedrock'
              },
              {
                name: 'confidence_score',
                type: 'double',
                comment: 'Confidence score from Bedrock normalization'
              },
              {
                name: 'timestamp',
                type: 'timestamp',
                comment: 'When this mapping was created'
              }
            ],
            location: `s3://${normalizedDataBucket.bucketName}/normalized-data/${tableType.replace('normalized_', '')}/`,
            inputFormat: 'org.apache.hadoop.mapred.TextInputFormat',
            outputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
            serdeInfo: {
              serializationLibrary: 'org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe',
              parameters: {
                'field.delim': ',',
                'quote.delim': '"',
                'escape.delim': '\\'
              }
            }
          }
        }
      });
    });

    // Data Source Processor Lambda Function
    // ===== DATA SOURCE PROCESSOR LAMBDA - DEDICATED ROLE =====
    
    // Role Mapper Lambda Role
    const roleMapperRole = roleManager.createLambdaRole('RoleMapperRole', 'app-modex-role-mapper');
    appConfigSecret.grantRead(roleMapperRole);
    projectsTable.grantReadData(roleMapperRole);
    roleMapperRole.addToPolicy(new iam.PolicyStatement({
      actions: ['cognito-identity:SetIdentityPoolRoles', 'cognito-identity:GetIdentityPoolRoles'],
      resources: [`arn:aws:cognito-identity:${this.region}:${this.account}:identitypool/*`]
    }));
    roleMapperRole.addToPolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [`arn:aws:iam::${this.account}:role/app-modex-*`]
    }));
    
    // Role Mapper Lambda Function
    const roleMapperFunction = new lambda.Function(this, 'RoleMapperFunction', {
      functionName: 'app-modex-role-mapper',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/role-mapper'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: roleMapperRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'RoleMapperFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-role-mapper',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // ===== STEP FUNCTION TRIGGER LAMBDA - DEDICATED ROLE =====
    
    // Create dedicated role for step function trigger Lambda with least privilege permissions
    const stepFunctionTriggerRole = new iam.Role(this, 'StepFunctionTriggerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      roleName: 'app-modex-step-function-trigger-role',
    });

    // CloudWatch Logs permissions
    stepFunctionTriggerRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-step-function-trigger:*`
      ]
    }));

    // DynamoDB permissions for updating process tracking records
    stepFunctionTriggerRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:UpdateItem',
        'dynamodb:PutItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-process-*`
      ]
    }));

    // Step Functions permissions to start executions for both normalization and skill importance
    stepFunctionTriggerRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'states:StartExecution'
      ],
      resources: [
        `arn:aws:states:${this.region}:${this.account}:stateMachine:app-modex-normalization`,
        `arn:aws:states:${this.region}:${this.account}:stateMachine:app-modex-skill-importance-*`
      ]
    }));

    // Step Function Trigger Lambda Function
    const stepFunctionTriggerFunction = new lambda.Function(this, 'StepFunctionTriggerFunction', {
      functionName: 'app-modex-step-function-trigger',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/step-function-trigger'),
      timeout: Duration.seconds(30),
      memorySize: 512,
      role: stepFunctionTriggerRole,
      environment: {
        ...commonEnvironmentVars,
        REGION: this.region,
        AWS_ACCOUNT_ID: this.account,
        // STATE_MACHINE_ARN will be set after normalization step function is created
      },
      logGroup: new logs.LogGroup(this, 'StepFunctionTriggerFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-step-function-trigger',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });

    // Pilot Identification Async Lambda Role
    const pilotIdentificationAsyncRole = roleManager.createLambdaRole('PilotIdentificationAsyncRole', 'app-modex-pilot-identification-async');

    // Pilot Identification Async Lambda Function
    const pilotIdentificationAsyncFunction = new lambda.Function(this, 'PilotIdentificationAsyncFunction', {
      functionName: 'app-modex-pilot-identification-async',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/pilot-identification-async'),
      timeout: Duration.seconds(60),
      memorySize: 512,
      role: pilotIdentificationAsyncRole,
      environment: commonEnvironmentVars,
      logGroup: new logs.LogGroup(this, 'PilotIdentificationAsyncFunction-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-pilot-identification-async',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      layers: [sharedLayer],
    });
    pilotIdentificationAsyncRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:PutObject'],
      resources: [`arn:aws:s3:::app-modex-data-*/pilot-analysis/*`]
    }));
    pilotIdentificationAsyncRole.addToPolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [
        `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/global.anthropic.claude-sonnet-4-6`,
        `arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-6`
      ]
    }));

    // ===== SIMILARITY AND PILOT ANALYSIS LAMBDA FUNCTIONS =====
    
    // Application Similarities - global Lambda integration
    const applicationSimilaritiesRole = new iam.Role(this, 'ApplicationSimilaritiesRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      description: 'Execution role for global application-similarities Lambda',
    });

    // Grant read-only DynamoDB permissions for all project similarity tables
    applicationSimilaritiesRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:Scan',
        'dynamodb:GetItem',
        'dynamodb:BatchWriteItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-app-sim-*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-app-clusters-*`
      ]
    }));

    // Grant DynamoDB permissions for process tracking (write for POST requests)
    applicationSimilaritiesRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:PutItem',
        'dynamodb:UpdateItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-process-*`
      ]
    }));

    // Grant Step Functions permissions to start application similarity analysis
    applicationSimilaritiesRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'states:StartExecution'
      ],
      resources: [
        `arn:aws:states:${this.region}:${this.account}:stateMachine:app-modex-app-sim-analysis-*`
      ]
    }));

    const applicationSimilaritiesFunction = new lambda.Function(this, 'ApplicationSimilaritiesFunction', {
      functionName: 'app-modex-application-similarities',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/application-similarities'),
      role: applicationSimilaritiesRole,
      description: 'Global Lambda for application similarity analysis (GET results, POST trigger)',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        APP_SIM_STEP_FUNCTION_ARN: `arn:aws:states:${this.region}:${this.account}:stateMachine:app-modex-app-sim-analysis-{projectId}`,
      },
    });

    // Component Similarities - global Lambda integration
    const componentSimilaritiesRole = new iam.Role(this, 'ComponentSimilaritiesRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      description: 'Execution role for global component-similarities Lambda',
    });

    // Grant read-only DynamoDB permissions for all project similarity tables
    componentSimilaritiesRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:Scan',
        'dynamodb:GetItem',
        'dynamodb:BatchWriteItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-comp-sim-*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-comp-clusters-*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-comp-patterns-*`
      ]
    }));

    // Grant DynamoDB permissions for process tracking (write for POST requests)
    componentSimilaritiesRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:PutItem',
        'dynamodb:UpdateItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-process-*`
      ]
    }));

    // Grant Step Functions permissions to start component similarity analysis
    componentSimilaritiesRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'states:StartExecution'
      ],
      resources: [
        `arn:aws:states:${this.region}:${this.account}:stateMachine:app-modex-comp-sim-analysis-*`
      ]
    }));

    const componentSimilaritiesFunction = new lambda.Function(this, 'ComponentSimilaritiesFunction', {
      functionName: 'app-modex-component-similarities',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/component-similarities'),
      role: componentSimilaritiesRole,
      description: 'Global Lambda for component similarity analysis (GET results, POST trigger)',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        COMP_SIM_STEP_FUNCTION_ARN: `arn:aws:states:${this.region}:${this.account}:stateMachine:app-modex-comp-sim-analysis-{projectId}`,
      },
    });

    // Pilot Identification - global Lambda integration
    const pilotIdentificationRole = new iam.Role(this, 'PilotIdentificationRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      description: 'Execution role for global pilot-identification Lambda',
    });

    // Grant DynamoDB permissions for pilot jobs and results tables
    pilotIdentificationRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:Scan',
        'dynamodb:Query',
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:BatchWriteItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-pilot-jobs-*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-pilot-jobs-*/index/*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-pilot-results-*`
      ]
    }));

    // Grant DynamoDB permissions for process tracking (write for POST requests)
    pilotIdentificationRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:PutItem',
        'dynamodb:UpdateItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-process-*`
      ]
    }));

    // Grant Step Functions permissions to start pilot identification analysis
    pilotIdentificationRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'states:StartExecution'
      ],
      resources: [
        `arn:aws:states:${this.region}:${this.account}:stateMachine:app-modex-pilot-analysis-*`
      ]
    }));

    const pilotIdentificationFunction = new lambda.Function(this, 'PilotIdentificationFunction', {
      functionName: 'app-modex-pilot-identification',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/pilot-identification'),
      role: pilotIdentificationRole,
      description: 'Global Lambda for pilot identification analysis (GET results, POST trigger, DELETE clear)',
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: {
        PILOT_STEP_FUNCTION_ARN: `arn:aws:states:${this.region}:${this.account}:stateMachine:app-modex-pilot-analysis-{projectId}`,
      },
    });

    // Pilot Gather Context Data - global Lambda for AI enhancement
    const pilotGatherContextRole = new iam.Role(this, 'PilotGatherContextRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      description: 'Execution role for pilot-gather-context-data Lambda',
    });

    // Grant read-only DynamoDB permissions for context data tables
    pilotGatherContextRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:Scan',
        'dynamodb:Query',
        'dynamodb:GetItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-similarity-results-*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-component-similarity-results-*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-skills-*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-skill-expectations-*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-tech-radar-*`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-team-weights-*`
      ]
    }));

    const pilotGatherContextFunction = new lambda.Function(this, 'PilotGatherContextFunction', {
      functionName: 'app-modex-gather-context-data',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/pilot-gather-context-data'),
      role: pilotGatherContextRole,
      description: 'Gathers context data for AI-enhanced pilot identification',
      timeout: cdk.Duration.seconds(300),
      memorySize: 1024,
      layers: [sharedLayer],
    });

    // Pilot AI Enhance Scores - global Lambda for AI enhancement
    const pilotAIEnhanceRole = new iam.Role(this, 'PilotAIEnhanceRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      description: 'Execution role for pilot-ai-enhance-scores Lambda',
    });

    // Grant Bedrock permissions for AI model invocation
    pilotAIEnhanceRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel'
      ],
      resources: [
        `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/global.anthropic.claude-sonnet-4-6`,
        `arn:aws:bedrock:*::foundation-model/anthropic.claude-sonnet-4-6`
      ]
    }));

    // Grant Bedrock Guardrail permissions
    pilotAIEnhanceRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:ApplyGuardrail'
      ],
      resources: [bedrockGuardrail.ref]
    }));

    // Grant DynamoDB permissions to read prompt templates
    pilotAIEnhanceRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:Query'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-prompt-templates`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-prompt-templates/index/*`
      ]
    }));

    // Grant DynamoDB permissions to write AI-enhanced results
    pilotAIEnhanceRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:PutItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-pilot-results-*`
      ]
    }));

    const pilotAIEnhanceFunction = new lambda.Function(this, 'PilotAIEnhanceFunction', {
      functionName: 'app-modex-ai-enhance-scores',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/pilot-ai-enhance-scores'),
      role: pilotAIEnhanceRole,
      description: 'AI-enhances pilot identification scores using Bedrock',
      timeout: cdk.Duration.seconds(900),
      memorySize: 2048,
      layers: [sharedLayer],
      environment: {
        BEDROCK_GUARDRAIL_ID: bedrockGuardrail.ref,
        BEDROCK_GUARDRAIL_VERSION: 'DRAFT',
      },
    });

    // Pilot Combine Scores - global Lambda for score consolidation
    const pilotCombineScoresRole = new iam.Role(this, 'PilotCombineScoresRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      description: 'Execution role for pilot-combine-scores Lambda',
    });

    // Grant DynamoDB permissions to write consolidated results
    pilotCombineScoresRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:PutItem',
        'dynamodb:BatchWriteItem'
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-pilot-results-*`
      ]
    }));

    const pilotCombineScoresFunction = new lambda.Function(this, 'PilotCombineScoresFunction', {
      functionName: 'app-modex-combine-scores',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/pilot-combine-scores'),
      role: pilotCombineScoresRole,
      description: 'Combines rule-based and AI-enhanced pilot scores',
      timeout: cdk.Duration.seconds(300),
      memorySize: 1024,
      layers: [sharedLayer],
    });

    // ===== LAMBDA FUNCTION EXPORTS =====
    // Export Lambda ARNs for API stack to import
    
    new cdk.CfnOutput(this, 'ProjectsFunctionArn', {
      value: projectsFunction.functionArn,
      exportName: 'AppModEx-Backend-ProjectsFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'ProcessTrackingFunctionArn', {
      value: processTrackingFunction.functionArn,
      exportName: 'AppModEx-Backend-ProcessTrackingFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'UserSearchFunctionArn', {
      value: userSearchFunction.functionArn,
      exportName: 'AppModEx-Backend-UserSearchFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'PilotInitiateFunctionArn', {
      value: pilotInitiateFunction.functionArn,
      exportName: 'AppModEx-Backend-PilotInitiateFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'PilotStatusFunctionArn', {
      value: pilotStatusFunction.functionArn,
      exportName: 'AppModEx-Backend-PilotStatusFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'PilotResultsFunctionArn', {
      value: pilotResultsFunction.functionArn,
      exportName: 'AppModEx-Backend-PilotResultsFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'PilotDeleteFunctionArn', {
      value: pilotDeleteFunction.functionArn,
      exportName: 'AppModEx-Backend-PilotDeleteFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'ApplicationBucketsFunctionArn', {
      value: applicationBucketsFunction.functionArn,
      exportName: 'AppModEx-Backend-ApplicationBucketsFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'TCOFunctionArn', {
      value: tcoFunction.functionArn,
      exportName: 'AppModEx-Backend-TCOFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'TeamEstimatesFunctionArn', {
      value: teamEstimatesFunction.functionArn,
      exportName: 'AppModEx-Backend-TeamEstimatesFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'AthenaQueryFunctionArn', {
      value: athenaQueryFunction.functionArn,
      exportName: 'AppModEx-Backend-AthenaQueryFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'TeamWeightsFunctionArn', {
      value: teamWeightsFunction.functionArn,
      exportName: 'AppModEx-Backend-TeamWeightsFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'StepFunctionApiFunctionArn', {
      value: stepFunctionApiFunction.functionArn,
      exportName: 'AppModEx-Backend-StepFunctionApiFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'ExportInitiatorFunctionArn', {
      value: exportInitiatorFunction.functionArn,
      exportName: 'AppModEx-Backend-ExportInitiatorFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'ExportReaderFunctionArn', {
      value: exportReaderFunction.functionArn,
      exportName: 'AppModEx-Backend-ExportReaderFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'AutomationStatusFunctionArn', {
      value: automationStatusFunction.functionArn,
      exportName: 'AppModEx-Backend-AutomationStatusFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'ProvisioningFunctionArn', {
      value: provisioningFunction.functionArn,
      exportName: 'AppModEx-Backend-ProvisioningFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'BuildMonitorFunctionArn', {
      value: buildMonitorFunction.functionArn,
      exportName: 'AppModEx-Backend-BuildMonitorFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'FileOperationsFunctionArn', {
      value: fileOperationsFunction.functionArn,
      exportName: 'AppModEx-Backend-FileOperationsFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'DataSourcesFunctionArn', {
      value: dataSourcesFunction.functionArn,
      exportName: 'AppModEx-Backend-DataSourcesFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'FileUploadFunctionArn', {
      value: fileUploadFunction.functionArn,
      exportName: 'AppModEx-Backend-FileUploadFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'CompareWithAthenaFunctionArn', {
      value: compareWithAthenaFunction.functionArn,
      exportName: 'AppModEx-Backend-CompareWithAthenaFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'RoleMapperFunctionArn', {
      value: roleMapperFunction.functionArn,
      exportName: 'AppModEx-Backend-RoleMapperFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'StepFunctionTriggerFunctionArn', {
      value: stepFunctionTriggerFunction.functionArn,
      exportName: 'AppModEx-Backend-StepFunctionTriggerFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'PilotIdentificationAsyncFunctionArn', {
      value: pilotIdentificationAsyncFunction.functionArn,
      exportName: 'AppModEx-Backend-PilotIdentificationAsyncFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'BatchExtractorFunctionArn', {
      value: batchExtractorFunction.functionArn,
      exportName: 'AppModEx-Backend-BatchExtractorFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'AthenaLookupFunctionArn', {
      value: athenaLookupFunction.functionArn,
      exportName: 'AppModEx-Backend-AthenaLookupFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'BedrockNormalizerFunctionArn', {
      value: bedrockNormalizerFunction.functionArn,
      exportName: 'AppModEx-Backend-BedrockNormalizerFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'MappingAggregatorFunctionArn', {
      value: mappingAggregatorFunction.functionArn,
      exportName: 'AppModEx-Backend-MappingAggregatorFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'StatusTrackerFunctionArn', {
      value: statusTrackerFunction.functionArn,
      exportName: 'AppModEx-Backend-StatusTrackerFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'ErrorHandlerFunctionArn', {
      value: errorHandlerFunction.functionArn,
      exportName: 'AppModEx-Backend-ErrorHandlerFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'MetricsFunctionArn', {
      value: metricsFunction.functionArn,
      exportName: 'AppModEx-Backend-MetricsFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'DLQProcessorFunctionArn', {
      value: dlqProcessorFunction.functionArn,
      exportName: 'AppModEx-Backend-DLQProcessorFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'ProjectDataFunctionArn', {
      value: projectDataFunction.functionArn,
      exportName: 'AppModEx-Backend-ProjectDataFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'SharingFunctionArn', {
      value: sharingFunction.functionArn,
      exportName: 'AppModEx-Backend-SharingFunctionArn',
    });

    new cdk.CfnOutput(this, 'ApplicationSimilaritiesFunctionArn', {
      value: applicationSimilaritiesFunction.functionArn,
      exportName: 'AppModEx-Backend-ApplicationSimilaritiesFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'ComponentSimilaritiesFunctionArn', {
      value: componentSimilaritiesFunction.functionArn,
      exportName: 'AppModEx-Backend-ComponentSimilaritiesFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'PilotIdentificationFunctionArn', {
      value: pilotIdentificationFunction.functionArn,
      exportName: 'AppModEx-Backend-PilotIdentificationFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'PilotGatherContextFunctionArn', {
      value: pilotGatherContextFunction.functionArn,
      exportName: 'AppModEx-Backend-PilotGatherContextFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'PilotAIEnhanceFunctionArn', {
      value: pilotAIEnhanceFunction.functionArn,
      exportName: 'AppModEx-Backend-PilotAIEnhanceFunctionArn',
    });
    
    new cdk.CfnOutput(this, 'PilotCombineScoresFunctionArn', {
      value: pilotCombineScoresFunction.functionArn,
      exportName: 'AppModEx-Backend-PilotCombineScoresFunctionArn',
    });

    // ===== CODEBUILD PROJECT =====
    
    // CodeBuild project for project provisioning - deploys project-specific infrastructure
    this.codeBuildProject = new codebuild.Project(this, 'ProjectProvisioningProject', {
      projectName: 'app-modex-project-provisioning',
      source: codebuild.Source.s3({
        bucket: deploymentBucket,
        path: 'buildspec-source.zip',
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true,
      },
      buildSpec: codebuild.BuildSpec.fromAsset('./buildspec.yml'),
    });

    // Create CDK Deployment Role with elevated permissions (least-privilege via role chaining)
    const cdkDeploymentRole = new iam.Role(this, 'CDKDeploymentRole', {
      roleName: 'app-modex-cdk-deployment-role',
      assumedBy: this.codeBuildProject.role!,
      description: 'Role for CodeBuild to assume when deploying CDK stacks'
    });

    // Grant CDK Deployment Role permissions for CloudFormation operations
    cdkDeploymentRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudformation:CreateStack',
        'cloudformation:UpdateStack',
        'cloudformation:DeleteStack',
        'cloudformation:DescribeStacks',
        'cloudformation:DescribeStackEvents',
        'cloudformation:DescribeStackResource',
        'cloudformation:DescribeStackResources',
        'cloudformation:GetTemplate',
        'cloudformation:ListStacks',
        'cloudformation:ListStackResources',
        'cloudformation:ValidateTemplate',
        'cloudformation:CreateChangeSet',
        'cloudformation:DescribeChangeSet',
        'cloudformation:ExecuteChangeSet',
        'cloudformation:DeleteChangeSet'
      ],
      resources: [`arn:aws:cloudformation:${this.region}:${this.account}:stack/App-ModEx-Project-*`]
    }));

    // Grant CDK Deployment Role permissions for S3 operations
    // INCLUDES s3:GetBucketAcl and s3:GetBucketLocation for bucket ownership verification
    cdkDeploymentRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:CreateBucket',
        's3:DeleteBucket',
        's3:GetBucketLocation',
        's3:GetBucketAcl',
        's3:GetBucketVersioning',
        's3:PutBucketVersioning',
        's3:PutBucketPolicy',
        's3:GetBucketPolicy',
        's3:DeleteBucketPolicy',
        's3:PutBucketPublicAccessBlock',
        's3:GetBucketPublicAccessBlock',
        's3:PutBucketLogging',
        's3:GetBucketLogging',
        's3:PutBucketCors',
        's3:GetBucketCors',
        's3:PutBucketLifecycleConfiguration',
        's3:GetBucketLifecycleConfiguration',
        's3:PutObject',
        's3:GetObject',
        's3:DeleteObject',
        's3:ListBucket'
      ],
      resources: [
        `arn:aws:s3:::app-modex-data-*`,
        `arn:aws:s3:::app-modex-results-*`,
        `arn:aws:s3:::app-modex-data-*/*`,
        `arn:aws:s3:::app-modex-results-*/*`
      ]
    }));

    // Grant CDK Deployment Role permissions for IAM operations (project-specific roles)
    // REQUIRES permissions boundary to prevent privilege escalation
    cdkDeploymentRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'iam:CreateRole',
        'iam:DeleteRole',
        'iam:GetRole',
        'iam:PutRolePolicy',
        'iam:DeleteRolePolicy',
        'iam:AttachRolePolicy',
        'iam:DetachRolePolicy',
        'iam:ListRolePolicies',
        'iam:ListAttachedRolePolicies',
        'iam:PassRole'
      ],
      resources: [`arn:aws:iam::${this.account}:role/app-modex-proj-*`],
      conditions: {
        StringEquals: {
          'iam:PermissionsBoundary': permissionsBoundary.managedPolicyArn
        }
      }
    }));

    // Grant CDK Deployment Role permissions for DynamoDB operations
    cdkDeploymentRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:CreateTable',
        'dynamodb:DeleteTable',
        'dynamodb:DescribeTable',
        'dynamodb:UpdateTable',
        'dynamodb:CreateGlobalSecondaryIndex',
        'dynamodb:DeleteGlobalSecondaryIndex',
        'dynamodb:UpdateGlobalSecondaryIndex',
        'dynamodb:ListTables',
        'dynamodb:ListTagsOfResource',
        'dynamodb:TagResource',
        'dynamodb:UntagResource'
      ],
      resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-*`]
    }));

    // Grant CDK Deployment Role permissions for Glue operations
    cdkDeploymentRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'glue:CreateDatabase',
        'glue:DeleteDatabase',
        'glue:GetDatabase',
        'glue:GetDatabases',
        'glue:UpdateDatabase',
        'glue:CreateTable',
        'glue:DeleteTable',
        'glue:GetTable',
        'glue:UpdateTable',
        'glue:GetPartition',
        'glue:GetPartitions',
        'glue:CreatePartition',
        'glue:DeletePartition',
        'glue:UpdatePartition',
        'glue:BatchCreatePartition',
        'glue:BatchDeletePartition',
        'glue:BatchUpdatePartition'
      ],
      resources: [
        `arn:aws:glue:${this.region}:${this.account}:catalog`,
        `arn:aws:glue:${this.region}:${this.account}:database/app_modex_*`,
        `arn:aws:glue:${this.region}:${this.account}:database/app-modex-${this.account}`,
        `arn:aws:glue:${this.region}:${this.account}:table/app_modex_*/*`,
        `arn:aws:glue:${this.region}:${this.account}:table/app-modex-${this.account}/*`
      ]
    }));

    // Grant CDK Deployment Role permissions for Athena operations (view creation)
    cdkDeploymentRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'athena:StartQueryExecution',
        'athena:GetQueryExecution',
        'athena:GetQueryResults',
        'athena:GetWorkGroup',
        'athena:StopQueryExecution'
      ],
      resources: [
        `arn:aws:athena:${this.region}:${this.account}:workgroup/app-modex-workgroup-*`,
        '*' // Query execution ARNs are dynamic and cannot be predicted
      ]
    }));

    // Grant CDK Deployment Role permissions for Lambda operations
    cdkDeploymentRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'lambda:CreateFunction',
        'lambda:DeleteFunction',
        'lambda:GetFunction',
        'lambda:UpdateFunctionCode',
        'lambda:UpdateFunctionConfiguration',
        'lambda:AddPermission',
        'lambda:RemovePermission',
        'lambda:ListFunctions',
        'lambda:TagResource',
        'lambda:UntagResource'
      ],
      resources: [`arn:aws:lambda:${this.region}:${this.account}:function:app-modex-*`]
    }));

    // Grant CDK Deployment Role permissions for SSM (CDK bootstrap version check)
    cdkDeploymentRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ssm:GetParameter'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/*`]
    }));

    // Grant CDK Deployment Role permissions for CloudWatch Logs
    cdkDeploymentRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateLogGroup',
        'logs:DeleteLogGroup',
        'logs:DescribeLogGroups',
        'logs:CreateLogStream',
        'logs:DeleteLogStream',
        'logs:PutRetentionPolicy'
      ],
      resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-*`]
    }));

    // Grant CDK Deployment Role permissions for SNS (notifications)
    cdkDeploymentRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'sns:CreateTopic',
        'sns:DeleteTopic',
        'sns:GetTopicAttributes',
        'sns:SetTopicAttributes',
        'sns:Subscribe',
        'sns:Unsubscribe',
        'sns:ListSubscriptionsByTopic'
      ],
      resources: [`arn:aws:sns:${this.region}:${this.account}:app-modex-*`]
    }));

    // Grant CDK Deployment Role permissions for SQS (queues)
    cdkDeploymentRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'sqs:CreateQueue',
        'sqs:DeleteQueue',
        'sqs:GetQueueAttributes',
        'sqs:SetQueueAttributes',
        'sqs:ListQueues'
      ],
      resources: [`arn:aws:sqs:${this.region}:${this.account}:app-modex-*`]
    }));

    // Grant CDK Deployment Role permissions for Step Functions
    cdkDeploymentRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'states:CreateStateMachine',
        'states:DeleteStateMachine',
        'states:DescribeStateMachine',
        'states:UpdateStateMachine',
        'states:ListStateMachines'
      ],
      resources: [`arn:aws:states:${this.region}:${this.account}:stateMachine:*`]
    }));

    // Grant CDK Deployment Role permissions for CDK bootstrap bucket (asset publishing)
    cdkDeploymentRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
        's3:GetObjectVersion',
        's3:ListBucket',
        's3:GetBucketVersioning'
      ],
      resources: [
        `arn:aws:s3:::cdk-hnb659fds-assets-${this.account}-${this.region}`,
        `arn:aws:s3:::cdk-hnb659fds-assets-${this.account}-${this.region}/*`
      ]
    }));

    // Grant CDK Deployment Role permissions to assume CDK file publishing role
    cdkDeploymentRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['sts:AssumeRole'],
      resources: [
        `arn:aws:iam::${this.account}:role/cdk-hnb659fds-file-publishing-role-${this.account}-${this.region}`
      ]
    }));

    // Grant CDK Deployment Role permissions to pass CloudFormation execution role
    cdkDeploymentRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['iam:PassRole'],
      resources: [
        `arn:aws:iam::${this.account}:role/cdk-hnb659fds-cfn-exec-role-${this.account}-${this.region}`
      ]
    }));

    // Create CDK Destroy Role with deletion-only permissions (least-privilege)
    const cdkDestroyRole = new iam.Role(this, 'CDKDestroyRole', {
      roleName: 'app-modex-cdk-destroy-role',
      assumedBy: this.codeBuildProject.role!,
      description: 'Role for CodeBuild to assume when destroying CDK stacks'
    });

    // Grant CDK Destroy Role permissions for CloudFormation deletion operations
    cdkDestroyRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudformation:DeleteStack',
        'cloudformation:DescribeStacks',
        'cloudformation:DescribeStackEvents',
        'cloudformation:DescribeStackResource',
        'cloudformation:DescribeStackResources',
        'cloudformation:ListStacks',
        'cloudformation:ListStackResources'
      ],
      resources: [`arn:aws:cloudformation:${this.region}:${this.account}:stack/App-ModEx-Project-*`]
    }));

    // Grant CDK Destroy Role permissions for S3 deletion operations (empty buckets before deletion)
    cdkDestroyRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:DeleteBucket',
        's3:DeleteObject',
        's3:DeleteObjectVersion',
        's3:ListBucket',
        's3:ListBucketVersions',
        's3:GetBucketVersioning',
        's3:GetBucketLocation',
        's3:GetObject'
      ],
      resources: [
        `arn:aws:s3:::app-modex-data-*`,
        `arn:aws:s3:::app-modex-results-*`,
        `arn:aws:s3:::app-modex-data-*/*`,
        `arn:aws:s3:::app-modex-results-*/*`
      ]
    }));

    // Grant CDK Destroy Role permissions for IAM role deletion (project-specific roles)
    cdkDestroyRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'iam:DeleteRole',
        'iam:GetRole',
        'iam:DeleteRolePolicy',
        'iam:DetachRolePolicy',
        'iam:ListRolePolicies',
        'iam:ListAttachedRolePolicies'
      ],
      resources: [`arn:aws:iam::${this.account}:role/app-modex-proj-*`]
    }));

    // Grant CDK Destroy Role permissions for DynamoDB deletion
    cdkDestroyRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:DeleteTable',
        'dynamodb:DescribeTable',
        'dynamodb:ListTables'
      ],
      resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/app-modex-*`]
    }));

    // Grant CDK Destroy Role permissions for Glue deletion
    cdkDestroyRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'glue:DeleteDatabase',
        'glue:GetDatabase',
        'glue:DeleteTable',
        'glue:GetTable',
        'glue:DeletePartition',
        'glue:GetPartition',
        'glue:GetPartitions',
        'glue:BatchDeletePartition'
      ],
      resources: [
        `arn:aws:glue:${this.region}:${this.account}:catalog`,
        `arn:aws:glue:${this.region}:${this.account}:database/app_modex_*`,
        `arn:aws:glue:${this.region}:${this.account}:table/app_modex_*/*`
      ]
    }));

    // Grant CDK Destroy Role permissions for Lambda deletion
    cdkDestroyRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'lambda:DeleteFunction',
        'lambda:GetFunction',
        'lambda:ListFunctions'
      ],
      resources: [`arn:aws:lambda:${this.region}:${this.account}:function:app-modex-*`]
    }));

    // Grant CDK Destroy Role permissions for CloudWatch Logs deletion
    cdkDestroyRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:DeleteLogGroup',
        'logs:DescribeLogGroups'
      ],
      resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-*`]
    }));

    // Grant CDK Destroy Role permissions for SNS deletion
    cdkDestroyRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'sns:DeleteTopic',
        'sns:GetTopicAttributes',
        'sns:ListSubscriptionsByTopic',
        'sns:Unsubscribe'
      ],
      resources: [`arn:aws:sns:${this.region}:${this.account}:app-modex-*`]
    }));

    // Grant CDK Destroy Role permissions for SQS deletion
    cdkDestroyRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'sqs:DeleteQueue',
        'sqs:GetQueueAttributes',
        'sqs:ListQueues'
      ],
      resources: [`arn:aws:sqs:${this.region}:${this.account}:app-modex-*`]
    }));

    // Grant CDK Destroy Role permissions for Step Functions deletion
    cdkDestroyRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'states:DeleteStateMachine',
        'states:DescribeStateMachine',
        'states:ListStateMachines'
      ],
      resources: [`arn:aws:states:${this.region}:${this.account}:stateMachine:*`]
    }));

    // Grant CDK Destroy Role permissions to pass CloudFormation execution role
    cdkDestroyRole.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['iam:PassRole'],
      resources: [
        `arn:aws:iam::${this.account}:role/cdk-hnb659fds-cfn-exec-role-${this.account}-${this.region}`
      ]
    }));

    // Grant CodeBuild role minimal permissions: assume both CDK Deployment Role and CDK Destroy Role
    this.codeBuildProject.role!.addToPrincipalPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['sts:AssumeRole'],
      resources: [cdkDeploymentRole.roleArn, cdkDestroyRole.roleArn]
    }));

    // Grant CodeBuild permissions to read deployment bucket (for buildspec-source.zip)
    deploymentBucket.grantRead(this.codeBuildProject.role!);
    
    // Grant CodeBuild permissions to assume Lambda execution role (for existing operations)
    lambdaExecutionRole.grantAssumeRole(this.codeBuildProject.role!);

    // ===== EVENTBRIDGE RULES =====
    
    // EventBridge rule for CodeBuild state changes
    const codeBuildStateChangeRule = new events.Rule(this, 'CodeBuildStateChangeRule', {
      eventPattern: {
        source: ['aws.codebuild'],
        detailType: ['CodeBuild Build State Change'],
        detail: {
          'build-status': ['SUCCEEDED', 'FAILED', 'STOPPED']
        }
      },
      description: 'Trigger build monitor when CodeBuild projects complete',
    });

    // Invoke build-monitor Lambda when CodeBuild completes
    codeBuildStateChangeRule.addTarget(new targets.LambdaFunction(buildMonitorFunction));

    // ===== CLOUDWATCH ALARMS AND SNS TOPIC =====
    
    // SNS Topic for alerts
    const alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: 'app-modex-alerts',
      displayName: 'App-ModEx Alerts',
    });

    // ===== BEDROCK MODEL INVOCATION LOGGING =====

    // CloudWatch Log Group for Bedrock invocations
    const bedrockLogGroup = new logs.LogGroup(this, 'BedrockInvocationLogs', {
      logGroupName: '/aws/bedrock/modelinvocations',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // IAM Role for Bedrock logging
    const bedrockLoggingRole = new iam.Role(this, 'BedrockLoggingRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      inlinePolicies: {
        BedrockLoggingPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
              resources: [`${bedrockLogGroup.logGroupArn}:*`],
            }),
            new iam.PolicyStatement({
              actions: ['s3:PutObject'],
              resources: [`${accessLogsBucketArn}/bedrock-invocations/*`],
            }),
          ],
        }),
      },
    });

    // Enable Bedrock Model Invocation Logging (account-level)
    // Only available in certain regions (us-east-1, us-west-2, ap-southeast-1, ap-northeast-1, eu-central-1)
    const bedrockLoggingSupportedRegions = ['us-east-1', 'us-west-2', 'ap-southeast-1', 'ap-northeast-1', 'eu-central-1'];
    
    if (bedrockLoggingSupportedRegions.includes(this.region)) {
      const bedrockLoggingConfig = new cdk.CfnResource(this, 'BedrockLoggingConfig', {
        type: 'AWS::Bedrock::ModelInvocationLoggingConfiguration',
        properties: {
          LoggingConfig: {
            CloudWatchConfig: {
              LogGroupName: bedrockLogGroup.logGroupName,
              RoleArn: bedrockLoggingRole.roleArn,
              LargeDataDeliveryS3Config: {
                BucketName: accessLogsBucketName,
                KeyPrefix: 'bedrock-invocations/',
              },
            },
            TextDataDeliveryEnabled: true,
            ImageDataDeliveryEnabled: false,
            EmbeddingDataDeliveryEnabled: false,
          },
        },
      });
      
      cdk.Tags.of(bedrockLoggingConfig).add('Environment', environment);
      cdk.Tags.of(bedrockLoggingConfig).add('ManagedBy', 'CDK');
    } else {
      // Log a warning that Bedrock logging is not available in this region
      new cdk.CfnOutput(this, 'BedrockLoggingWarning', {
        value: `Bedrock Model Invocation Logging is not available in ${this.region}. Supported regions: ${bedrockLoggingSupportedRegions.join(', ')}`,
        description: 'Bedrock Logging Availability Warning',
      });
    }

    // ===== RESPONSIBLE AI MONITORING ALARMS =====

    // Alarm for Bedrock invocation errors
    const bedrockErrorAlarm = new cloudwatch.Alarm(this, 'BedrockErrorAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Bedrock',
        metricName: 'InvocationClientErrors',
        statistic: 'Sum',
        period: Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 2,
      alarmDescription: 'Alert on Bedrock invocation errors',
      alarmName: 'app-modex-bedrock-errors',
    });

    bedrockErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    // Alarm for high token usage (cost control)
    const bedrockTokenAlarm = new cloudwatch.Alarm(this, 'BedrockTokenAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Bedrock',
        metricName: 'OutputTokenCount',
        statistic: 'Sum',
        period: Duration.hours(1),
      }),
      threshold: 100000,
      evaluationPeriods: 1,
      alarmDescription: 'Alert on high Bedrock token usage',
      alarmName: 'app-modex-bedrock-high-tokens',
    });

    bedrockTokenAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    // Alarm for throttling (responsible AI policy adherence)
    const bedrockThrottleAlarm = new cloudwatch.Alarm(this, 'BedrockThrottleAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Bedrock',
        metricName: 'InvocationThrottles',
        statistic: 'Sum',
        period: Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 1,
      alarmDescription: 'Alert on Bedrock throttling',
      alarmName: 'app-modex-bedrock-throttles',
    });

    bedrockThrottleAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    // CloudWatch Alarm for Lambda errors
    const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Errors',
        statistic: 'Sum',
        period: Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 1,
      alarmDescription: 'Alert when Lambda functions have errors',
      alarmName: 'app-modex-lambda-errors',
    });

    lambdaErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));
    
    // Assign owner to Lambda error alarm for monitoring responsibility
    cdk.Tags.of(lambdaErrorAlarm).add('Owner', 'platform-team');

    // CloudWatch Alarms for all DLQs
    const projectOpsDLQAlarm = new cloudwatch.Alarm(this, 'ProjectOperationsDLQAlarm', {
      alarmName: 'app-modex-project-operations-dlq-messages',
      metric: projectOperationsDLQ.metricApproximateNumberOfMessagesVisible(),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Alert when project operations fail and land in DLQ',
    });
    projectOpsDLQAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    const asyncProcessDLQAlarm = new cloudwatch.Alarm(this, 'AsyncProcessDLQAlarm', {
      alarmName: 'app-modex-async-process-dlq-messages',
      metric: asyncProcessDLQ.metricApproximateNumberOfMessagesVisible(),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Alert when async processes fail and land in DLQ',
    });
    asyncProcessDLQAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));
    
    // CloudWatch Alarm for async invocation DLQ
    const asyncInvocationDLQAlarm = new cloudwatch.Alarm(this, 'AsyncInvocationDLQAlarm', {
      alarmName: 'app-modex-async-invocation-dlq-messages',
      metric: asyncInvocationDLQ.metricApproximateNumberOfMessagesVisible(),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Alert when async Lambda invocations fail and land in DLQ',
    });
    asyncInvocationDLQAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));
    
    // Automatic DLQ redrive - EventBridge scheduled rule (every 5 minutes)
    const dlqRedriveRule = new events.Rule(this, 'DLQRedriveRule', {
      schedule: events.Schedule.rate(Duration.minutes(5)),
      description: 'Automatically redrive messages from DLQs every 5 minutes',
    });
    
    // Invoke DLQ redrive function for each DLQ
    dlqRedriveRule.addTarget(new targets.LambdaFunction(dlqRedriveFunction, {
      event: events.RuleTargetInput.fromObject({
        dlqUrl: projectOperationsDLQ.queueUrl,
        targetQueueUrl: this.projectOperationsQueue.queueUrl,
        maxMessages: 10
      })
    }));
    
    dlqRedriveRule.addTarget(new targets.LambdaFunction(dlqRedriveFunction, {
      event: events.RuleTargetInput.fromObject({
        dlqUrl: asyncProcessDLQ.queueUrl,
        targetQueueUrl: asyncProcessQueue.queueUrl,
        maxMessages: 10
      })
    }));

    // CloudWatch Alarm for API Gateway errors
    const apiErrorAlarm = new cloudwatch.Alarm(this, 'APIErrorAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5XXError',
        statistic: 'Sum',
        period: Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 1,
      alarmDescription: 'Alert when API Gateway has 5XX errors',
      alarmName: 'app-modex-api-errors',
    });

    apiErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    // CloudWatch Alarm for DynamoDB throttling
    const dynamodbThrottleAlarm = new cloudwatch.Alarm(this, 'DynamoDBThrottleAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'UserErrors',
        statistic: 'Sum',
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Alert when DynamoDB has throttling errors',
      alarmName: 'app-modex-dynamodb-throttle',
    });

    dynamodbThrottleAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

    // ===== LAMBDA FUNCTION OWNER TAGS =====
    
    // Assign owner tags to all Lambda functions for monitoring accountability
    const lambdaFunctions = [
      projectsFunction, projectDataFunction, sharingFunction, userSearchFunction,
      fileOperationsFunction, fileUploadFunction, dataSourcesFunction,
      athenaQueryFunction, processTrackingFunction, automationStatusFunction,
      provisioningFunction, buildMonitorFunction, tcoFunction, applicationBucketsFunction,
      teamEstimatesFunction, teamWeightsFunction, applicationSimilaritiesFunction,
      componentSimilaritiesFunction, pilotIdentificationFunction, stepFunctionApiFunction,
      stepFunctionTriggerFunction, exportInitiatorFunction, exportReaderFunction,
      roleMapperFunction, bedrockNormalizerFunction,
      batchExtractorFunction, compareWithAthenaFunction, mappingAggregatorFunction,
      statusTrackerFunction, metricsFunction,
      errorHandlerFunction, dlqProcessorFunction,
      pilotGatherContextFunction, pilotAIEnhanceFunction, pilotCombineScoresFunction,
      athenaLookupFunction, dlqRedriveFunction
    ];
    
    lambdaFunctions.forEach(fn => {
      cdk.Tags.of(fn).add('Owner', 'platform-team');
      cdk.Tags.of(fn).add('MonitoringRequired', 'true');
    });

    // ===== STEP FUNCTIONS =====
    
    // ===== NEW TECH STACK NORMALIZATION STEP FUNCTION V2 =====

    // Step Function Role with least privilege
    const techStackNormalizationRole = new iam.Role(this, 'TechStackNormalizationRole', {
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      roleName: 'app-modex-tech-stack-normalization-role',
    });

    // Grant invoke permissions ONLY to the specific Lambdas used in the workflow
    [
      batchExtractorFunction,
      athenaLookupFunction,
      bedrockNormalizerFunction,
      mappingAggregatorFunction,
      statusTrackerFunction,
      errorHandlerFunction,
      metricsFunction
    ].forEach(fn => {
      fn.grantInvoke(techStackNormalizationRole);
    });

    // WILDCARD JUSTIFICATION: Step Functions CloudWatch Logs delivery requires wildcard resource
    // AWS Service Limitation: Step Functions log delivery APIs don't support resource-level permissions
    // Reference: https://docs.aws.amazon.com/step-functions/latest/dg/cw-logs.html
    // Actions: CreateLogDelivery, GetLogDelivery, UpdateLogDelivery, DeleteLogDelivery, ListLogDeliveries
    // Security Impact: Low - limited to log delivery management operations only
    // Alternative: None available - AWS service requirement
    techStackNormalizationRole.addToPolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogDelivery', 'logs:GetLogDelivery', 'logs:UpdateLogDelivery', 'logs:DeleteLogDelivery', 'logs:ListLogDeliveries', 'logs:PutResourcePolicy', 'logs:DescribeResourcePolicies', 'logs:DescribeLogGroups'],
      resources: ['*']
    }));

    // WILDCARD JUSTIFICATION: X-Ray tracing requires wildcard resource
    // AWS Service Limitation: X-Ray PutTraceSegments/PutTelemetryRecords don't support resource-level permissions
    // Reference: https://docs.aws.amazon.com/xray/latest/devguide/security_iam_service-with-iam.html
    // Security Impact: Low - only allows sending trace data, cannot read or modify existing traces
    // Alternative: None available - AWS service requirement for distributed tracing
    techStackNormalizationRole.addToPolicy(new iam.PolicyStatement({
      actions: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
      resources: ['*']
    }));

    // Load Step Function definition
    const techStackNormalizationDefinitionPath = path.join(__dirname, '..', 'stepfunctions', 'global', 'tech-stack-normalization.json');
    let techStackNormalizationDefinition = JSON.parse(fs.readFileSync(techStackNormalizationDefinitionPath, 'utf8'));

    // Replace template placeholders with actual Lambda ARNs
    const definitionString = JSON.stringify(techStackNormalizationDefinition)
      .replace(/{{BATCH_EXTRACTOR_ARN}}/g, batchExtractorFunction.functionArn)
      .replace(/{{ATHENA_LOOKUP_SERVICE_ARN}}/g, athenaLookupFunction.functionArn)
      .replace(/{{BEDROCK_NORMALIZER_ARN}}/g, bedrockNormalizerFunction.functionArn)
      .replace(/{{MAPPING_AGGREGATOR_ARN}}/g, mappingAggregatorFunction.functionArn)
      .replace(/{{NORMALIZATION_STATUS_TRACKER_ARN}}/g, statusTrackerFunction.functionArn)
      .replace(/{{NORMALIZATION_ERROR_HANDLER_ARN}}/g, errorHandlerFunction.functionArn)
      .replace(/{{NORMALIZATION_METRICS_ARN}}/g, metricsFunction.functionArn);

    techStackNormalizationDefinition = JSON.parse(definitionString);

    // Create Step Function
    const techStackNormalizationStateMachine = new stepfunctions.StateMachine(this, 'TechStackNormalizationStateMachine', {
      stateMachineName: 'app-modex-tech-stack-normalization',
      definitionBody: stepfunctions.DefinitionBody.fromString(JSON.stringify(techStackNormalizationDefinition)),
      role: techStackNormalizationRole,
      tracingEnabled: true,
      logs: {
        destination: new logs.LogGroup(this, 'TechStackNormalizationLogGroup', {
          logGroupName: '/aws/vendedlogs/states/app-modex-tech-stack-normalization',
          retention: logs.RetentionDays.ONE_WEEK,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
        level: stepfunctions.LogLevel.ALL,
        includeExecutionData: true,
      },
    });

    // CloudWatch Alarm for normalization failures
    const normalizationFailureAlarm = new cloudwatch.Alarm(this, 'NormalizationFailureAlarm', {
      alarmName: 'app-modex-normalization-failures',
      metric: techStackNormalizationStateMachine.metricFailed(),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    normalizationFailureAlarm.addAlarmAction(new cloudwatchActions.SnsAction(normalizationAlertTopic));

    // CloudWatch Alarm for DLQ messages
    const dlqMessagesAlarm = new cloudwatch.Alarm(this, 'NormalizationDLQAlarm', {
      alarmName: 'app-modex-normalization-dlq-messages',
      metric: normalizationDLQ.metricApproximateNumberOfMessagesVisible(),
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    dlqMessagesAlarm.addAlarmAction(new cloudwatchActions.SnsAction(normalizationAlertTopic));

    // ===== SHARED CLOUDWATCH LOGS RESOURCE POLICY FOR ALL STEP FUNCTIONS =====
    
    // Create a single shared resource policy that covers ALL project Step Function log groups
    // This allows unlimited projects without hitting the 10 resource policy limit
    new logs.CfnResourcePolicy(this, 'StepFunctionsLogsResourcePolicy', {
      policyName: 'app-modex-stepfunctions-logs-policy',
      policyDocument: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'states.amazonaws.com'
            },
            Action: [
              'logs:CreateLogDelivery',
              'logs:GetLogDelivery',
              'logs:UpdateLogDelivery',
              'logs:DeleteLogDelivery',
              'logs:ListLogDeliveries',
              'logs:PutLogEvents',
              'logs:PutResourcePolicy',
              'logs:DescribeResourcePolicies',
              'logs:DescribeLogGroups'
            ],
            Resource: `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/vendedlogs/states/app-modex-*`
          }
        ]
      })
    });

    // ===== CFNOUTPUT EXPORTS =====
    
    new cdk.CfnOutput(this, 'ProjectsTableName', {
      value: projectsTableName,
      exportName: 'app-modex-projects-table',
      description: 'Projects DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'ProjectDataTableName', {
      value: projectDataTableName,
      exportName: 'app-modex-project-data-table',
      description: 'Project Data DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'ProjectOperationsQueueUrl', {
      value: this.projectOperationsQueue.queueUrl,
      exportName: 'app-modex-project-operations-queue-url',
      description: 'Project Operations SQS queue URL',
    });

    new cdk.CfnOutput(this, 'ProjectOperationsQueueArn', {
      value: this.projectOperationsQueue.queueArn,
      exportName: 'app-modex-project-operations-queue-arn',
      description: 'Project Operations SQS queue ARN',
    });

    new cdk.CfnOutput(this, 'NormalizationStateMachineArn', {
      value: techStackNormalizationStateMachine.stateMachineArn,
      exportName: 'app-modex-normalization-state-machine-arn',
      description: 'TechStack Normalization workflow state machine ARN',
    });

    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: alertTopic.topicArn,
      exportName: 'app-modex-alert-topic-arn',
      description: 'SNS topic for alerts',
    });

    new cdk.CfnOutput(this, 'CodeBuildProjectName', {
      value: this.codeBuildProject.projectName,
      exportName: 'app-modex-codebuild-project',
      description: 'CodeBuild project for Lambda packaging',
    });

    new cdk.CfnOutput(this, 'AsyncProcessQueueUrl', {
      value: asyncProcessQueue.queueUrl,
      exportName: 'app-modex-async-process-queue-url',
      description: 'Async process queue URL for normalization and skill importance workflows',
    });

    new cdk.CfnOutput(this, 'BedrockGuardrailId', {
      value: bedrockGuardrail.ref,
      exportName: 'AppModEx-BedrockGuardrailId',
      description: 'Bedrock Guardrail ID for content filtering',
    });

    new cdk.CfnOutput(this, 'BedrockGuardrailVersion', {
      value: 'DRAFT',
      exportName: 'AppModEx-BedrockGuardrailVersion',
      description: 'Bedrock Guardrail Version',
    });

    new cdk.CfnOutput(this, 'CDKPermissionsBoundaryArn', {
      value: permissionsBoundary.managedPolicyArn,
      exportName: 'AppModEx-CDKPermissionsBoundaryArn',
      description: 'Permissions boundary ARN for CDK-created roles',
    });

    // ===== FRONTEND CONFIGURATION OUTPUTS =====
    // Note: UserPool and UserPoolClient outputs are in the Data stack
    // API URL output is in the API stack
    // This avoids circular dependencies between stacks
  }
}
