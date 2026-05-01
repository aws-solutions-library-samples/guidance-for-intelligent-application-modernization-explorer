"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModExBackendStack = void 0;
const cdk = require("aws-cdk-lib");
const lambda = require("aws-cdk-lib/aws-lambda");
const lambdaEventSources = require("aws-cdk-lib/aws-lambda-event-sources");
const lambdaDestinations = require("aws-cdk-lib/aws-lambda-destinations");
const iam = require("aws-cdk-lib/aws-iam");
const logs = require("aws-cdk-lib/aws-logs");
const codebuild = require("aws-cdk-lib/aws-codebuild");
const s3 = require("aws-cdk-lib/aws-s3");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const events = require("aws-cdk-lib/aws-events");
const targets = require("aws-cdk-lib/aws-events-targets");
const sqs = require("aws-cdk-lib/aws-sqs");
const stepfunctions = require("aws-cdk-lib/aws-stepfunctions");
const secretsmanager = require("aws-cdk-lib/aws-secretsmanager");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const cloudwatchActions = require("aws-cdk-lib/aws-cloudwatch-actions");
const sns = require("aws-cdk-lib/aws-sns");
const glue = require("aws-cdk-lib/aws-glue");
const aws_cdk_lib_1 = require("aws-cdk-lib");
const app_modex_lambda_role_manager_1 = require("./app-modex-lambda-role-manager");
const fs = require("fs");
const path = require("path");
// Create shared Lambda layer
function createSharedLayer(scope, id) {
    return new lambda.LayerVersion(scope, id, {
        code: lambda.Code.fromAsset('lambda/layers/shared'),
        compatibleRuntimes: [lambda.Runtime.NODEJS_22_X, lambda.Runtime.NODEJS_22_X],
        description: 'Shared utilities for App-ModEx Lambda functions',
    });
}
// Helper function to create Lambda functions with shared layer
function createLambdaFunction(scope, id, functionName, codePath, sharedLayer, role, environment) {
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
        timeout: aws_cdk_lib_1.Duration.seconds(30),
        memorySize: 512,
        role,
        environment,
        logGroup,
        layers: [sharedLayer],
    });
}
class AppModExBackendStack extends cdk.Stack {
    constructor(scope, id, props) {
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
            retentionPeriod: aws_cdk_lib_1.Duration.days(14),
            encryption: sqs.QueueEncryption.SQS_MANAGED,
        });
        cdk.Tags.of(projectOperationsDLQ).add('Owner', 'platform-team');
        cdk.Tags.of(projectOperationsDLQ).add('Purpose', 'Project operations failure handling');
        // Main queue for project operations (create, delete) - GLOBAL LEVEL
        this.projectOperationsQueue = new sqs.Queue(this, 'ProjectOperationsQueue', {
            queueName: `app-modex-project-operations`,
            visibilityTimeout: aws_cdk_lib_1.Duration.minutes(15),
            retentionPeriod: aws_cdk_lib_1.Duration.days(14),
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
            retentionPeriod: aws_cdk_lib_1.Duration.days(14),
            encryption: sqs.QueueEncryption.SQS_MANAGED,
        });
        cdk.Tags.of(asyncProcessDLQ).add('Owner', 'data-processing-team');
        cdk.Tags.of(asyncProcessDLQ).add('Purpose', 'Async process failure handling');
        // Main queue for async process routing (normalization, skill importance, etc.)
        const asyncProcessQueue = new sqs.Queue(this, 'AsyncProcessQueue', {
            queueName: `app-modex-async-process-queue`,
            visibilityTimeout: aws_cdk_lib_1.Duration.minutes(15),
            retentionPeriod: aws_cdk_lib_1.Duration.days(14),
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
            timeout: aws_cdk_lib_1.Duration.minutes(5),
            environment: {
                PROJECT_OPS_DLQ_URL: projectOperationsDLQ.queueUrl,
                PROJECT_OPS_QUEUE_URL: this.projectOperationsQueue.queueUrl,
                ASYNC_PROCESS_DLQ_URL: asyncProcessDLQ.queueUrl,
                ASYNC_PROCESS_QUEUE_URL: asyncProcessQueue.queueUrl,
            },
        });
        // ===== LAMBDA ROLE MANAGER - HELPER FOR PER-FUNCTION ROLES =====
        const roleManager = new app_modex_lambda_role_manager_1.LambdaRoleManager(this, this.region, this.account);
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
        const projectDataFunction = createLambdaFunction(this, 'ProjectDataFunction', 'app-modex-project-data', 'lambda/global/project-data', sharedLayer, lambdaExecutionRole, commonEnvironmentVars);
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
        const sharingFunction = createLambdaFunction(this, 'SharingFunction', 'app-modex-sharing', 'lambda/global/sharing', sharedLayer, sharingRole, commonEnvironmentVars);
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(60),
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(60),
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(60),
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
        provisioningFunction.addEventSource(new lambdaEventSources.SqsEventSource(this.projectOperationsQueue, {
            batchSize: 1,
            maxConcurrency: 2,
        }));
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            retentionPeriod: aws_cdk_lib_1.Duration.days(14),
            encryption: sqs.QueueEncryption.SQS_MANAGED,
        });
        cdk.Tags.of(asyncInvocationDLQ).add('Owner', 'platform-team');
        cdk.Tags.of(asyncInvocationDLQ).add('Purpose', 'Async Lambda invocation failure handling');
        // Configure on-failure destination for buildMonitorFunction
        buildMonitorFunction.configureAsyncInvoke({
            onFailure: new lambdaDestinations.SqsDestination(asyncInvocationDLQ),
            maxEventAge: aws_cdk_lib_1.Duration.hours(6),
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(60),
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
            retentionPeriod: aws_cdk_lib_1.Duration.days(14),
            encryption: sqs.QueueEncryption.SQS_MANAGED,
            visibilityTimeout: aws_cdk_lib_1.Duration.minutes(30), // Must be >= 6x Lambda timeout (5 min * 6 = 30 min)
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
            timeout: aws_cdk_lib_1.Duration.seconds(60),
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
            timeout: aws_cdk_lib_1.Duration.seconds(90),
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
            timeout: aws_cdk_lib_1.Duration.minutes(5),
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
            timeout: aws_cdk_lib_1.Duration.seconds(90),
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.minutes(5),
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
            maxBatchingWindow: aws_cdk_lib_1.Duration.seconds(5)
        }));
        // Create Glue tables for normalized data
        // Create dedicated logs bucket for normalized data bucket
        const normalizedDataLogsBucket = new s3.Bucket(this, 'NormalizedDataLogsBucket', {
            bucketName: `app-modex-normalized-data-logs-${this.account}-${this.region}`,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            versioned: false,
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            lifecycleRules: [
                {
                    id: 'DeleteOldLogs',
                    enabled: true,
                    expiration: aws_cdk_lib_1.Duration.days(90),
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
            removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(30),
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
            timeout: aws_cdk_lib_1.Duration.seconds(60),
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
            assumedBy: this.codeBuildProject.role,
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
            assumedBy: this.codeBuildProject.role,
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
        this.codeBuildProject.role.addToPrincipalPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['sts:AssumeRole'],
            resources: [cdkDeploymentRole.roleArn, cdkDestroyRole.roleArn]
        }));
        // Grant CodeBuild permissions to read deployment bucket (for buildspec-source.zip)
        deploymentBucket.grantRead(this.codeBuildProject.role);
        // Grant CodeBuild permissions to assume Lambda execution role (for existing operations)
        lambdaExecutionRole.grantAssumeRole(this.codeBuildProject.role);
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
        }
        else {
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
                period: aws_cdk_lib_1.Duration.minutes(5),
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
                period: aws_cdk_lib_1.Duration.hours(1),
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
                period: aws_cdk_lib_1.Duration.minutes(5),
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
                period: aws_cdk_lib_1.Duration.minutes(5),
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
            schedule: events.Schedule.rate(aws_cdk_lib_1.Duration.minutes(5)),
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
                period: aws_cdk_lib_1.Duration.minutes(5),
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
                period: aws_cdk_lib_1.Duration.minutes(5),
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
exports.AppModExBackendStack = AppModExBackendStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLW1vZGV4LWJhY2tlbmQtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhcHAtbW9kZXgtYmFja2VuZC1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFFbkMsaURBQWlEO0FBQ2pELDJFQUEyRTtBQUMzRSwwRUFBMEU7QUFFMUUsMkNBQTJDO0FBQzNDLDZDQUE2QztBQUM3Qyx1REFBdUQ7QUFDdkQseUNBQXlDO0FBQ3pDLHFEQUFxRDtBQUNyRCxpREFBaUQ7QUFDakQsMERBQTBEO0FBQzFELDJDQUEyQztBQUMzQywrREFBK0Q7QUFFL0QsaUVBQWlFO0FBQ2pFLHlEQUF5RDtBQUN6RCx3RUFBd0U7QUFDeEUsMkNBQTJDO0FBQzNDLDZDQUE2QztBQUM3Qyw2Q0FBc0Q7QUFDdEQsbUZBQW9FO0FBQ3BFLHlCQUF5QjtBQUN6Qiw2QkFBNkI7QUFFN0IsNkJBQTZCO0FBQzdCLFNBQVMsaUJBQWlCLENBQUMsS0FBZ0IsRUFBRSxFQUFVO0lBQ3JELE9BQU8sSUFBSSxNQUFNLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUU7UUFDeEMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLHNCQUFzQixDQUFDO1FBQ25ELGtCQUFrQixFQUFFLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUM7UUFDNUUsV0FBVyxFQUFFLGlEQUFpRDtLQUMvRCxDQUFDLENBQUM7QUFDTCxDQUFDO0FBRUQsK0RBQStEO0FBQy9ELFNBQVMsb0JBQW9CLENBQzNCLEtBQWdCLEVBQ2hCLEVBQVUsRUFDVixZQUFvQixFQUNwQixRQUFnQixFQUNoQixXQUFnQyxFQUNoQyxJQUFjLEVBQ2QsV0FBbUM7SUFFbkMsTUFBTSxRQUFRLEdBQUcsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxHQUFHLEVBQUUsV0FBVyxFQUFF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QUFFLHNCQUFzQixFQUFFO1lBQzlDLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxRQUFRO1lBQ2pDLFVBQVUsRUFBRSxtQ0FBbUM7WUFDL0MsV0FBVyxFQUFFLDBFQUEwRTtTQUN4RixDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQzVDLEtBQUssRUFBRSxnQkFBZ0IsQ0FBQyxHQUFHO1lBQzNCLFVBQVUsRUFBRSw2QkFBNkI7WUFDekMsV0FBVyxFQUFFLDRDQUE0QztTQUMxRCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHlCQUF5QixFQUFFO1lBQ2pELEtBQUssRUFBRSxPQUFPO1lBQ2QsVUFBVSxFQUFFLGtDQUFrQztZQUM5QyxXQUFXLEVBQUUsMkJBQTJCO1NBQ3pDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsMkJBQTJCLEVBQUU7WUFDbkQsS0FBSyxFQUFFLG1CQUFtQixDQUFDLGdCQUFnQjtZQUMzQyxVQUFVLEVBQUUsb0NBQW9DO1lBQ2hELFdBQVcsRUFBRSxnREFBZ0Q7U0FDOUQsQ0FBQyxDQUFDO1FBRUgsNkNBQTZDO1FBQzdDLGtFQUFrRTtRQUNsRSxxQ0FBcUM7UUFDckMsbURBQW1EO0lBQ3JELENBQUM7Q0FDRjtBQWx5SEQsb0RBa3lIQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGxhbWJkYUV2ZW50U291cmNlcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLWV2ZW50LXNvdXJjZXMnO1xuaW1wb3J0ICogYXMgbGFtYmRhRGVzdGluYXRpb25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEtZGVzdGluYXRpb25zJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgKiBhcyBjb2RlYnVpbGQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZGVidWlsZCc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIGV2ZW50cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzJztcbmltcG9ydCAqIGFzIHRhcmdldHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cy10YXJnZXRzJztcbmltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcbmltcG9ydCAqIGFzIHN0ZXBmdW5jdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXN0ZXBmdW5jdGlvbnMnO1xuaW1wb3J0ICogYXMgc3RlcGZ1bmN0aW9uc1Rhc2tzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zdGVwZnVuY3Rpb25zLXRhc2tzJztcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlcic7XG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoJztcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2hBY3Rpb25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoLWFjdGlvbnMnO1xuaW1wb3J0ICogYXMgc25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMnO1xuaW1wb3J0ICogYXMgZ2x1ZSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZ2x1ZSc7XG5pbXBvcnQgeyBEdXJhdGlvbiwgUmVtb3ZhbFBvbGljeSB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IExhbWJkYVJvbGVNYW5hZ2VyIH0gZnJvbSAnLi9hcHAtbW9kZXgtbGFtYmRhLXJvbGUtbWFuYWdlcic7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG4vLyBDcmVhdGUgc2hhcmVkIExhbWJkYSBsYXllclxuZnVuY3Rpb24gY3JlYXRlU2hhcmVkTGF5ZXIoc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZyk6IGxhbWJkYS5MYXllclZlcnNpb24ge1xuICByZXR1cm4gbmV3IGxhbWJkYS5MYXllclZlcnNpb24oc2NvcGUsIGlkLCB7XG4gICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEvbGF5ZXJzL3NoYXJlZCcpLFxuICAgIGNvbXBhdGlibGVSdW50aW1lczogW2xhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLCBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWF0sXG4gICAgZGVzY3JpcHRpb246ICdTaGFyZWQgdXRpbGl0aWVzIGZvciBBcHAtTW9kRXggTGFtYmRhIGZ1bmN0aW9ucycsXG4gIH0pO1xufVxuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gY3JlYXRlIExhbWJkYSBmdW5jdGlvbnMgd2l0aCBzaGFyZWQgbGF5ZXJcbmZ1bmN0aW9uIGNyZWF0ZUxhbWJkYUZ1bmN0aW9uKFxuICBzY29wZTogQ29uc3RydWN0LFxuICBpZDogc3RyaW5nLFxuICBmdW5jdGlvbk5hbWU6IHN0cmluZyxcbiAgY29kZVBhdGg6IHN0cmluZyxcbiAgc2hhcmVkTGF5ZXI6IGxhbWJkYS5MYXllclZlcnNpb24sXG4gIHJvbGU6IGlhbS5Sb2xlLFxuICBlbnZpcm9ubWVudDogUmVjb3JkPHN0cmluZywgc3RyaW5nPlxuKTogbGFtYmRhLkZ1bmN0aW9uIHtcbiAgY29uc3QgbG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cChzY29wZSwgYCR7aWR9LUxvZ0dyb3VwYCwge1xuICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvbGFtYmRhLyR7ZnVuY3Rpb25OYW1lfWAsXG4gICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgfSk7XG5cbiAgcmV0dXJuIG5ldyBsYW1iZGEuRnVuY3Rpb24oc2NvcGUsIGlkLCB7XG4gICAgZnVuY3Rpb25OYW1lLFxuICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoY29kZVBhdGgpLFxuICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICByb2xlLFxuICAgIGVudmlyb25tZW50LFxuICAgIGxvZ0dyb3VwLFxuICAgIGxheWVyczogW3NoYXJlZExheWVyXSxcbiAgfSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXBwTW9kRXhCYWNrZW5kU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcbiAgbG9nTGV2ZWw/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBBcHBNb2RFeEJhY2tlbmRTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSBjb2RlQnVpbGRQcm9qZWN0OiBjb2RlYnVpbGQuUHJvamVjdDtcbiAgcHVibGljIHJlYWRvbmx5IHByb2plY3RPcGVyYXRpb25zUXVldWU6IHNxcy5RdWV1ZTtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXBwTW9kRXhCYWNrZW5kU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgeyBlbnZpcm9ubWVudCwgbG9nTGV2ZWwgfSA9IHByb3BzO1xuICAgIFxuICAgIC8vIERldGVybWluZSBsb2cgbGV2ZWw6IHVzZSBwcm92aWRlZCB2YWx1ZSBvciBkZWZhdWx0IGJhc2VkIG9uIGVudmlyb25tZW50XG4gICAgY29uc3QgZWZmZWN0aXZlTG9nTGV2ZWwgPSBsb2dMZXZlbCB8fCAoZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/ICdFUlJPUicgOiBlbnZpcm9ubWVudCA9PT0gJ3N0YWdpbmcnID8gJ0lORk8nIDogJ0RFQlVHJyk7XG5cbiAgICAvLyBJbXBvcnQgRGF0YSBzdGFjayByZXNvdXJjZXMgdmlhIENsb3VkRm9ybWF0aW9uIGV4cG9ydHNcbiAgICBjb25zdCB1c2VyUG9vbElkID0gY2RrLkZuLmltcG9ydFZhbHVlKCdBcHBNb2RFeC1Vc2VyUG9vbElkJyk7XG4gICAgY29uc3QgdXNlclBvb2xBcm4gPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0FwcE1vZEV4LVVzZXJQb29sQXJuJyk7XG4gICAgY29uc3QgaWRlbnRpdHlQb29sSWQgPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0FwcE1vZEV4LUlkZW50aXR5UG9vbElkJyk7XG4gICAgY29uc3QgcHJvamVjdHNUYWJsZU5hbWUgPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0FwcE1vZEV4LVByb2plY3RzVGFibGVOYW1lJyk7XG4gICAgY29uc3QgcHJvamVjdHNUYWJsZUFybiA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQXBwTW9kRXgtUHJvamVjdHNUYWJsZUFybicpO1xuICAgIGNvbnN0IHByb2plY3REYXRhVGFibGVOYW1lID0gY2RrLkZuLmltcG9ydFZhbHVlKCdBcHBNb2RFeC1Qcm9qZWN0RGF0YVRhYmxlTmFtZScpO1xuICAgIGNvbnN0IHByb2plY3REYXRhVGFibGVBcm4gPSBjZGsuRm4uaW1wb3J0VmFsdWUoJ0FwcE1vZEV4LVByb2plY3REYXRhVGFibGVBcm4nKTtcbiAgICBjb25zdCBleHBvcnRIaXN0b3J5VGFibGVOYW1lID0gY2RrLkZuLmltcG9ydFZhbHVlKCdBcHBNb2RFeC1FeHBvcnRIaXN0b3J5VGFibGVOYW1lJyk7XG4gICAgY29uc3QgZXhwb3J0SGlzdG9yeVRhYmxlQXJuID0gY2RrLkZuLmltcG9ydFZhbHVlKCdBcHBNb2RFeC1FeHBvcnRIaXN0b3J5VGFibGVBcm4nKTtcbiAgICBjb25zdCBkZXBsb3ltZW50QnVja2V0TmFtZSA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQXBwTW9kRXgtRGVwbG95bWVudEJ1Y2tldE5hbWUnKTtcbiAgICBjb25zdCBkZXBsb3ltZW50QnVja2V0QXJuID0gY2RrLkZuLmltcG9ydFZhbHVlKCdBcHBNb2RFeC1EZXBsb3ltZW50QnVja2V0QXJuJyk7XG4gICAgY29uc3QgcHJvamVjdERhdGFCdWNrZXROYW1lID0gY2RrLkZuLmltcG9ydFZhbHVlKCdBcHBNb2RFeC1Qcm9qZWN0RGF0YUJ1Y2tldE5hbWUnKTtcbiAgICBjb25zdCBwcm9qZWN0RGF0YUJ1Y2tldEFybiA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQXBwTW9kRXgtUHJvamVjdERhdGFCdWNrZXRBcm4nKTtcbiAgICBjb25zdCBhY2Nlc3NMb2dzQnVja2V0TmFtZSA9IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQXBwTW9kRXgtQWNjZXNzTG9nc0J1Y2tldE5hbWUnKTtcbiAgICBjb25zdCBhY2Nlc3NMb2dzQnVja2V0QXJuID0gY2RrLkZuLmltcG9ydFZhbHVlKCdBcHBNb2RFeC1BY2Nlc3NMb2dzQnVja2V0QXJuJyk7XG4gICAgY29uc3QgYXBwQ29uZmlnU2VjcmV0QXJuID0gY2RrLkZuLmltcG9ydFZhbHVlKCdBcHBNb2RFeC1BcHBDb25maWdTZWNyZXRBcm4nKTtcbiAgICBjb25zdCBnbHVlRGF0YWJhc2VOYW1lID0gY2RrLkZuLmltcG9ydFZhbHVlKCdBcHBNb2RFeC1HbHVlRGF0YWJhc2VOYW1lJyk7XG5cbiAgICAvLyA9PT09PSBHTE9CQUwgU1FTIFFVRVVFIEZPUiBQUk9KRUNUIE9QRVJBVElPTlMgPT09PT1cbiAgICBcbiAgICAvLyBEZWFkIExldHRlciBRdWV1ZSBmb3IgcHJvamVjdCBvcGVyYXRpb25zXG4gICAgY29uc3QgcHJvamVjdE9wZXJhdGlvbnNETFEgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdQcm9qZWN0T3BlcmF0aW9uc0RMUScsIHtcbiAgICAgIHF1ZXVlTmFtZTogYGFwcC1tb2RleC1wcm9qZWN0LW9wZXJhdGlvbnMtZGxxYCxcbiAgICAgIHJldGVudGlvblBlcmlvZDogRHVyYXRpb24uZGF5cygxNCksXG4gICAgICBlbmNyeXB0aW9uOiBzcXMuUXVldWVFbmNyeXB0aW9uLlNRU19NQU5BR0VELFxuICAgIH0pO1xuICAgIGNkay5UYWdzLm9mKHByb2plY3RPcGVyYXRpb25zRExRKS5hZGQoJ093bmVyJywgJ3BsYXRmb3JtLXRlYW0nKTtcbiAgICBjZGsuVGFncy5vZihwcm9qZWN0T3BlcmF0aW9uc0RMUSkuYWRkKCdQdXJwb3NlJywgJ1Byb2plY3Qgb3BlcmF0aW9ucyBmYWlsdXJlIGhhbmRsaW5nJyk7XG5cbiAgICAvLyBNYWluIHF1ZXVlIGZvciBwcm9qZWN0IG9wZXJhdGlvbnMgKGNyZWF0ZSwgZGVsZXRlKSAtIEdMT0JBTCBMRVZFTFxuICAgIHRoaXMucHJvamVjdE9wZXJhdGlvbnNRdWV1ZSA9IG5ldyBzcXMuUXVldWUodGhpcywgJ1Byb2plY3RPcGVyYXRpb25zUXVldWUnLCB7XG4gICAgICBxdWV1ZU5hbWU6IGBhcHAtbW9kZXgtcHJvamVjdC1vcGVyYXRpb25zYCxcbiAgICAgIHZpc2liaWxpdHlUaW1lb3V0OiBEdXJhdGlvbi5taW51dGVzKDE1KSxcbiAgICAgIHJldGVudGlvblBlcmlvZDogRHVyYXRpb24uZGF5cygxNCksXG4gICAgICBlbmNyeXB0aW9uOiBzcXMuUXVldWVFbmNyeXB0aW9uLlNRU19NQU5BR0VELFxuICAgICAgZGVhZExldHRlclF1ZXVlOiB7XG4gICAgICAgIHF1ZXVlOiBwcm9qZWN0T3BlcmF0aW9uc0RMUSxcbiAgICAgICAgbWF4UmVjZWl2ZUNvdW50OiAzLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vID09PT09IEdMT0JBTCBTUVMgUVVFVUUgRk9SIEFTWU5DIFBST0NFU1MgUk9VVElORyA9PT09PVxuICAgIFxuICAgIC8vIERlYWQgTGV0dGVyIFF1ZXVlIGZvciBhc3luYyBwcm9jZXNzIHJvdXRpbmdcbiAgICBjb25zdCBhc3luY1Byb2Nlc3NETFEgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdBc3luY1Byb2Nlc3NETFEnLCB7XG4gICAgICBxdWV1ZU5hbWU6IGBhcHAtbW9kZXgtYXN5bmMtcHJvY2Vzcy1kbHFgLFxuICAgICAgcmV0ZW50aW9uUGVyaW9kOiBEdXJhdGlvbi5kYXlzKDE0KSxcbiAgICAgIGVuY3J5cHRpb246IHNxcy5RdWV1ZUVuY3J5cHRpb24uU1FTX01BTkFHRUQsXG4gICAgfSk7XG4gICAgY2RrLlRhZ3Mub2YoYXN5bmNQcm9jZXNzRExRKS5hZGQoJ093bmVyJywgJ2RhdGEtcHJvY2Vzc2luZy10ZWFtJyk7XG4gICAgY2RrLlRhZ3Mub2YoYXN5bmNQcm9jZXNzRExRKS5hZGQoJ1B1cnBvc2UnLCAnQXN5bmMgcHJvY2VzcyBmYWlsdXJlIGhhbmRsaW5nJyk7XG5cbiAgICAvLyBNYWluIHF1ZXVlIGZvciBhc3luYyBwcm9jZXNzIHJvdXRpbmcgKG5vcm1hbGl6YXRpb24sIHNraWxsIGltcG9ydGFuY2UsIGV0Yy4pXG4gICAgY29uc3QgYXN5bmNQcm9jZXNzUXVldWUgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdBc3luY1Byb2Nlc3NRdWV1ZScsIHtcbiAgICAgIHF1ZXVlTmFtZTogYGFwcC1tb2RleC1hc3luYy1wcm9jZXNzLXF1ZXVlYCxcbiAgICAgIHZpc2liaWxpdHlUaW1lb3V0OiBEdXJhdGlvbi5taW51dGVzKDE1KSxcbiAgICAgIHJldGVudGlvblBlcmlvZDogRHVyYXRpb24uZGF5cygxNCksXG4gICAgICBlbmNyeXB0aW9uOiBzcXMuUXVldWVFbmNyeXB0aW9uLlNRU19NQU5BR0VELFxuICAgICAgZGVhZExldHRlclF1ZXVlOiB7XG4gICAgICAgIHF1ZXVlOiBhc3luY1Byb2Nlc3NETFEsXG4gICAgICAgIG1heFJlY2VpdmVDb3VudDogMyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PSBETFEgQVVUT01BVElDIFJFRFJJVkUgTEFNQkRBID09PT09XG4gICAgXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uIGZvciBhdXRvbWF0aWMgRExRIHJlZHJpdmVcbiAgICBjb25zdCBkbHFSZWRyaXZlUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnRExRUmVkcml2ZVJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICBwcm9qZWN0T3BlcmF0aW9uc0RMUS5ncmFudENvbnN1bWVNZXNzYWdlcyhkbHFSZWRyaXZlUm9sZSk7XG4gICAgYXN5bmNQcm9jZXNzRExRLmdyYW50Q29uc3VtZU1lc3NhZ2VzKGRscVJlZHJpdmVSb2xlKTtcbiAgICB0aGlzLnByb2plY3RPcGVyYXRpb25zUXVldWUuZ3JhbnRTZW5kTWVzc2FnZXMoZGxxUmVkcml2ZVJvbGUpO1xuICAgIGFzeW5jUHJvY2Vzc1F1ZXVlLmdyYW50U2VuZE1lc3NhZ2VzKGRscVJlZHJpdmVSb2xlKTtcblxuICAgIGNvbnN0IGRscVJlZHJpdmVGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0RMUVJlZHJpdmVGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ2FwcC1tb2RleC1kbHEtcmVkcml2ZScsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUoYFxuICAgICAgICBjb25zdCB7IFNRU0NsaWVudCwgUmVjZWl2ZU1lc3NhZ2VDb21tYW5kLCBEZWxldGVNZXNzYWdlQ29tbWFuZCwgU2VuZE1lc3NhZ2VDb21tYW5kIH0gPSByZXF1aXJlKCdAYXdzLXNkay9jbGllbnQtc3FzJyk7XG4gICAgICAgIGNvbnN0IHNxcyA9IG5ldyBTUVNDbGllbnQoe30pO1xuICAgICAgICBcbiAgICAgICAgZXhwb3J0cy5oYW5kbGVyID0gYXN5bmMgKGV2ZW50KSA9PiB7XG4gICAgICAgICAgY29uc3QgZGxxVXJsID0gZXZlbnQuZGxxVXJsO1xuICAgICAgICAgIGNvbnN0IHRhcmdldFF1ZXVlVXJsID0gZXZlbnQudGFyZ2V0UXVldWVVcmw7XG4gICAgICAgICAgY29uc3QgbWF4TWVzc2FnZXMgPSBldmVudC5tYXhNZXNzYWdlcyB8fCAxMDtcbiAgICAgICAgICBcbiAgICAgICAgICBjb25zdCByZWNlaXZlUGFyYW1zID0ge1xuICAgICAgICAgICAgUXVldWVVcmw6IGRscVVybCxcbiAgICAgICAgICAgIE1heE51bWJlck9mTWVzc2FnZXM6IG1heE1lc3NhZ2VzLFxuICAgICAgICAgICAgV2FpdFRpbWVTZWNvbmRzOiAxXG4gICAgICAgICAgfTtcbiAgICAgICAgICBcbiAgICAgICAgICBjb25zdCB7IE1lc3NhZ2VzIH0gPSBhd2FpdCBzcXMuc2VuZChuZXcgUmVjZWl2ZU1lc3NhZ2VDb21tYW5kKHJlY2VpdmVQYXJhbXMpKTtcbiAgICAgICAgICBcbiAgICAgICAgICBpZiAoIU1lc3NhZ2VzIHx8IE1lc3NhZ2VzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgcmVkcml2ZW5Db3VudDogMCB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICBmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgTWVzc2FnZXMpIHtcbiAgICAgICAgICAgIGF3YWl0IHNxcy5zZW5kKG5ldyBTZW5kTWVzc2FnZUNvbW1hbmQoe1xuICAgICAgICAgICAgICBRdWV1ZVVybDogdGFyZ2V0UXVldWVVcmwsXG4gICAgICAgICAgICAgIE1lc3NhZ2VCb2R5OiBtZXNzYWdlLkJvZHlcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgYXdhaXQgc3FzLnNlbmQobmV3IERlbGV0ZU1lc3NhZ2VDb21tYW5kKHtcbiAgICAgICAgICAgICAgUXVldWVVcmw6IGRscVVybCxcbiAgICAgICAgICAgICAgUmVjZWlwdEhhbmRsZTogbWVzc2FnZS5SZWNlaXB0SGFuZGxlXG4gICAgICAgICAgICB9KSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIHJldHVybiB7IHJlZHJpdmVuQ291bnQ6IE1lc3NhZ2VzLmxlbmd0aCB9O1xuICAgICAgICB9O1xuICAgICAgYCksXG4gICAgICByb2xlOiBkbHFSZWRyaXZlUm9sZSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBQUk9KRUNUX09QU19ETFFfVVJMOiBwcm9qZWN0T3BlcmF0aW9uc0RMUS5xdWV1ZVVybCxcbiAgICAgICAgUFJPSkVDVF9PUFNfUVVFVUVfVVJMOiB0aGlzLnByb2plY3RPcGVyYXRpb25zUXVldWUucXVldWVVcmwsXG4gICAgICAgIEFTWU5DX1BST0NFU1NfRExRX1VSTDogYXN5bmNQcm9jZXNzRExRLnF1ZXVlVXJsLFxuICAgICAgICBBU1lOQ19QUk9DRVNTX1FVRVVFX1VSTDogYXN5bmNQcm9jZXNzUXVldWUucXVldWVVcmwsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT0gTEFNQkRBIFJPTEUgTUFOQUdFUiAtIEhFTFBFUiBGT1IgUEVSLUZVTkNUSU9OIFJPTEVTID09PT09XG4gICAgXG4gICAgY29uc3Qgcm9sZU1hbmFnZXIgPSBuZXcgTGFtYmRhUm9sZU1hbmFnZXIodGhpcywgdGhpcy5yZWdpb24sIHRoaXMuYWNjb3VudCk7XG5cbiAgICAvLyA9PT09PSBMQU1CREEgRlVOQ1RJT05TID09PT09XG4gICAgXG4gICAgLy8gQ29tbW9uIExhbWJkYSBlbnZpcm9ubWVudCB2YXJpYWJsZXNcbiAgICBjb25zdCBjb21tb25FbnZpcm9ubWVudFZhcnMgPSB7XG4gICAgICBFTlZJUk9OTUVOVDogZW52aXJvbm1lbnQsXG4gICAgICBMT0dfTEVWRUw6IGVmZmVjdGl2ZUxvZ0xldmVsLFxuICAgICAgUFJPSkVDVFNfVEFCTEU6IHByb2plY3RzVGFibGVOYW1lLFxuICAgICAgUFJPSkVDVF9EQVRBX1RBQkxFOiBwcm9qZWN0RGF0YVRhYmxlTmFtZSxcbiAgICAgIEVYUE9SVF9ISVNUT1JZX1RBQkxFOiBleHBvcnRIaXN0b3J5VGFibGVOYW1lLFxuICAgICAgQVBQX0NPTkZJR19TRUNSRVRfQVJOOiBhcHBDb25maWdTZWNyZXRBcm4sXG4gICAgICBSRUdJT046IHRoaXMucmVnaW9uLFxuICAgICAgUFJPSkVDVF9PUEVSQVRJT05TX1FVRVVFX1VSTDogdGhpcy5wcm9qZWN0T3BlcmF0aW9uc1F1ZXVlLnF1ZXVlVXJsLFxuICAgICAgQVNZTkNfUFJPQ0VTU19RVUVVRV9VUkw6IGFzeW5jUHJvY2Vzc1F1ZXVlLnF1ZXVlVXJsLFxuICAgICAgQ09ERUJVSUxEX1BST0pFQ1Q6ICdhcHAtbW9kZXgtcHJvamVjdC1wcm92aXNpb25pbmcnLFxuICAgICAgREVQTE9ZTUVOVF9CVUNLRVQ6IGRlcGxveW1lbnRCdWNrZXROYW1lLFxuICAgICAgLy8gVVNFUl9QT09MX0lEIGFuZCBJREVOVElUWV9QT09MX0lEIG1vdmVkIHRvIFNlY3JldHMgTWFuYWdlciAoQVBQX0NPTkZJR19TRUNSRVRfQVJOKVxuICAgICAgR0xVRV9EQVRBQkFTRTogJ2FwcF9tb2RleF8ke3Byb2plY3RJZH0nLFxuICAgICAgQVRIRU5BX1dPUktHUk9VUDogJ2FwcC1tb2RleC13b3JrZ3JvdXAtJHtwcm9qZWN0SWR9JyxcbiAgICAgIFJFU1VMVFNfQlVDS0VUOiAnYXBwLW1vZGV4LXJlc3VsdHMtJHtwcm9qZWN0SWR9JyxcbiAgICAgIEFXU19BQ0NPVU5UX0lEOiB0aGlzLmFjY291bnQsXG4gICAgICBOT1JNQUxJWkVEX0RBVEFfREFUQUJBU0U6IGBhcHAtbW9kZXgtJHt0aGlzLmFjY291bnR9YCxcbiAgICAgIEVYUE9SVF9TVEVQX0ZVTkNUSU9OX0FSTl9QUkVGSVg6IGBhcm46YXdzOnN0YXRlczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06c3RhdGVNYWNoaW5lOmFwcC1tb2RleC1leHBvcnQtYCxcbiAgICB9O1xuXG4gICAgLy8gQ29tbW9uIExhbWJkYSBleGVjdXRpb24gcm9sZSBwZXJtaXNzaW9uc1xuICAgIGNvbnN0IGxhbWJkYUV4ZWN1dGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0xhbWJkYUV4ZWN1dGlvblJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICB9KTtcblxuICAgIGxhbWJkYUV4ZWN1dGlvblJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnbG9nczpDcmVhdGVMb2dHcm91cCcsXG4gICAgICAgICdsb2dzOkNyZWF0ZUxvZ1N0cmVhbScsXG4gICAgICAgICdsb2dzOlB1dExvZ0V2ZW50cydcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6bG9nczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06bG9nLWdyb3VwOi9hd3MvbGFtYmRhL2FwcC1tb2RleC0qOipgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gSW1wb3J0IER5bmFtb0RCIHRhYmxlcyAodXNlIGZyb21UYWJsZUFybiB0byBhdm9pZCB2YWxpZGF0aW9uIGVycm9yKVxuICAgIGNvbnN0IHByb2plY3RzVGFibGUgPSBkeW5hbW9kYi5UYWJsZS5mcm9tVGFibGVBcm4odGhpcywgJ0ltcG9ydGVkUHJvamVjdHNUYWJsZScsIHByb2plY3RzVGFibGVBcm4pO1xuICAgIGNvbnN0IHByb2plY3REYXRhVGFibGUgPSBkeW5hbW9kYi5UYWJsZS5mcm9tVGFibGVBcm4odGhpcywgJ0ltcG9ydGVkUHJvamVjdERhdGFUYWJsZScsIHByb2plY3REYXRhVGFibGVBcm4pO1xuICAgIGNvbnN0IGV4cG9ydEhpc3RvcnlUYWJsZSA9IGR5bmFtb2RiLlRhYmxlLmZyb21UYWJsZUFybih0aGlzLCAnSW1wb3J0ZWRFeHBvcnRIaXN0b3J5VGFibGUnLCBleHBvcnRIaXN0b3J5VGFibGVBcm4pO1xuXG4gICAgLy8gR3JhbnQgRHluYW1vREIgcGVybWlzc2lvbnNcbiAgICBwcm9qZWN0c1RhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShsYW1iZGFFeGVjdXRpb25Sb2xlKTtcbiAgICBwcm9qZWN0RGF0YVRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShsYW1iZGFFeGVjdXRpb25Sb2xlKTtcbiAgICBcbiAgICAvLyBHcmFudCBEeW5hbW9EQiBwZXJtaXNzaW9ucyBmb3IgcHJvamVjdC1zcGVjaWZpYyBwcm9jZXNzIHRyYWNraW5nIHRhYmxlc1xuICAgIGxhbWJkYUV4ZWN1dGlvblJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6VXBkYXRlSXRlbScsXG4gICAgICAgICdkeW5hbW9kYjpHZXRJdGVtJyxcbiAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxuICAgICAgICAnZHluYW1vZGI6UXVlcnknXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS9hcHAtbW9kZXgtcHJvY2Vzcy0qYFxuICAgICAgXVxuICAgIH0pKTtcbiAgICBcbiAgICAvLyBHcmFudCBTUVMgcGVybWlzc2lvbnMgZm9yIGdsb2JhbCBwcm9qZWN0IG9wZXJhdGlvbnMgcXVldWVcbiAgICB0aGlzLnByb2plY3RPcGVyYXRpb25zUXVldWUuZ3JhbnRTZW5kTWVzc2FnZXMobGFtYmRhRXhlY3V0aW9uUm9sZSk7XG4gICAgdGhpcy5wcm9qZWN0T3BlcmF0aW9uc1F1ZXVlLmdyYW50Q29uc3VtZU1lc3NhZ2VzKGxhbWJkYUV4ZWN1dGlvblJvbGUpO1xuICAgIFxuICAgIC8vIEdyYW50IFNRUyBwZXJtaXNzaW9ucyBmb3IgYXN5bmMgcHJvY2VzcyBxdWV1ZVxuICAgIGFzeW5jUHJvY2Vzc1F1ZXVlLmdyYW50U2VuZE1lc3NhZ2VzKGxhbWJkYUV4ZWN1dGlvblJvbGUpO1xuICAgIGFzeW5jUHJvY2Vzc1F1ZXVlLmdyYW50Q29uc3VtZU1lc3NhZ2VzKGxhbWJkYUV4ZWN1dGlvblJvbGUpO1xuICAgIFxuICAgIC8vIEdyYW50IFNRUyBwZXJtaXNzaW9ucyBmb3IgcHJvamVjdC1zcGVjaWZpYyBkYXRhIHByb2Nlc3NpbmcgcXVldWVzXG4gICAgbGFtYmRhRXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdzcXM6R2V0UXVldWVVcmwnLFxuICAgICAgICAnc3FzOlNlbmRNZXNzYWdlJyxcbiAgICAgICAgJ3NxczpSZWNlaXZlTWVzc2FnZScsXG4gICAgICAgICdzcXM6RGVsZXRlTWVzc2FnZScsXG4gICAgICAgICdzcXM6R2V0UXVldWVBdHRyaWJ1dGVzJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpzcXM6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmFwcC1tb2RleC1kYXRhLSpgXG4gICAgICBdXG4gICAgfSkpO1xuICAgIFxuICAgIC8vIEdyYW50IENvZ25pdG8gcGVybWlzc2lvbnMgZm9yIHVzZXIgc2VhcmNoXG4gICAgbGFtYmRhRXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdjb2duaXRvLWlkcDpMaXN0VXNlcnMnLFxuICAgICAgICAnY29nbml0by1pZHA6QWRtaW5HZXRVc2VyJyxcbiAgICAgICAgJ2NvZ25pdG8taWRwOkRlc2NyaWJlVXNlclBvb2wnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbdXNlclBvb2xBcm5dXG4gICAgfSkpO1xuXG4gICAgLy8gR3JhbnQgU2VjcmV0cyBNYW5hZ2VyIHJlYWQgcGVybWlzc2lvblxuICAgIGNvbnN0IGFwcENvbmZpZ1NlY3JldCA9IHNlY3JldHNtYW5hZ2VyLlNlY3JldC5mcm9tU2VjcmV0Q29tcGxldGVBcm4odGhpcywgJ0ltcG9ydGVkQXBwQ29uZmlnU2VjcmV0JywgYXBwQ29uZmlnU2VjcmV0QXJuKTtcbiAgICBhcHBDb25maWdTZWNyZXQuZ3JhbnRSZWFkKGxhbWJkYUV4ZWN1dGlvblJvbGUpO1xuXG4gICAgLy8gR3JhbnQgQXRoZW5hIHBlcm1pc3Npb25zXG4gICAgbGFtYmRhRXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdhdGhlbmE6U3RhcnRRdWVyeUV4ZWN1dGlvbicsXG4gICAgICAgICdhdGhlbmE6R2V0UXVlcnlFeGVjdXRpb24nLFxuICAgICAgICAnYXRoZW5hOkdldFF1ZXJ5UmVzdWx0cycsXG4gICAgICAgICdhdGhlbmE6U3RvcFF1ZXJ5RXhlY3V0aW9uJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czphdGhlbmE6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9Ondvcmtncm91cC9hcHAtbW9kZXgtKmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBHcmFudCBHbHVlIHBlcm1pc3Npb25zXG4gICAgbGFtYmRhRXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdnbHVlOkdldERhdGFiYXNlJyxcbiAgICAgICAgJ2dsdWU6R2V0VGFibGUnLFxuICAgICAgICAnZ2x1ZTpHZXRQYXJ0aXRpb25zJyxcbiAgICAgICAgJ2dsdWU6R2V0VGFibGVzJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpnbHVlOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpjYXRhbG9nYCxcbiAgICAgICAgYGFybjphd3M6Z2x1ZToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06ZGF0YWJhc2UvYXBwX21vZGV4XypgLFxuICAgICAgICBgYXJuOmF3czpnbHVlOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS9hcHBfbW9kZXhfKi8qYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIEdyYW50IFMzIHBlcm1pc3Npb25zIGZvciBBdGhlbmEgcXVlcnkgcmVzdWx0c1xuICAgIGxhbWJkYUV4ZWN1dGlvblJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnczM6R2V0T2JqZWN0JyxcbiAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICdzMzpEZWxldGVPYmplY3QnLFxuICAgICAgICAnczM6TGlzdEJ1Y2tldCdcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6czM6OjphcHAtbW9kZXgtcmVzdWx0cy0qYCxcbiAgICAgICAgYGFybjphd3M6czM6OjphcHAtbW9kZXgtcmVzdWx0cy0qLypgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gPT09PT0gUzMgQlVDS0VUIFBPTElDSUVTID09PT09XG4gICAgXG4gICAgLy8gR3JhbnQgUzMgcGVybWlzc2lvbnMgdG8gTGFtYmRhIGV4ZWN1dGlvbiByb2xlIGZvciBkZXBsb3ltZW50IGFuZCBwcm9qZWN0IGRhdGEgYnVja2V0c1xuICAgIGNvbnN0IGRlcGxveW1lbnRCdWNrZXQgPSBzMy5CdWNrZXQuZnJvbUJ1Y2tldEF0dHJpYnV0ZXModGhpcywgJ0ltcG9ydGVkRGVwbG95bWVudEJ1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGRlcGxveW1lbnRCdWNrZXROYW1lLFxuICAgICAgYnVja2V0QXJuOiBkZXBsb3ltZW50QnVja2V0QXJuLFxuICAgIH0pO1xuICAgIGNvbnN0IHByb2plY3REYXRhQnVja2V0ID0gczMuQnVja2V0LmZyb21CdWNrZXRBdHRyaWJ1dGVzKHRoaXMsICdJbXBvcnRlZFByb2plY3REYXRhQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogcHJvamVjdERhdGFCdWNrZXROYW1lLFxuICAgICAgYnVja2V0QXJuOiBwcm9qZWN0RGF0YUJ1Y2tldEFybixcbiAgICB9KTtcbiAgICBjb25zdCBhY2Nlc3NMb2dzQnVja2V0MSA9IHMzLkJ1Y2tldC5mcm9tQnVja2V0QXR0cmlidXRlcyh0aGlzLCAnSW1wb3J0ZWRBY2Nlc3NMb2dzQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYWNjZXNzTG9nc0J1Y2tldE5hbWUsXG4gICAgICBidWNrZXRBcm46IGFjY2Vzc0xvZ3NCdWNrZXRBcm4sXG4gICAgfSk7XG4gICAgXG4gICAgZGVwbG95bWVudEJ1Y2tldC5ncmFudFJlYWRXcml0ZShsYW1iZGFFeGVjdXRpb25Sb2xlKTtcbiAgICBwcm9qZWN0RGF0YUJ1Y2tldC5ncmFudFJlYWRXcml0ZShsYW1iZGFFeGVjdXRpb25Sb2xlKTtcbiAgICBhY2Nlc3NMb2dzQnVja2V0MS5ncmFudFJlYWRXcml0ZShsYW1iZGFFeGVjdXRpb25Sb2xlKTtcblxuICAgIC8vID09PT09IENMT1VERk9STUFUSU9OIFBFUk1JU1NJT05TID09PT09XG4gICAgXG4gICAgLy8gR3JhbnQgQ2xvdWRGb3JtYXRpb24gcGVybWlzc2lvbnMgZm9yIHByb3Zpc2lvbmluZyBMYW1iZGEgdG8gY2hlY2sgc3RhY2sgc3RhdHVzXG4gICAgbGFtYmRhRXhlY3V0aW9uUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdjbG91ZGZvcm1hdGlvbjpEZXNjcmliZVN0YWNrcycsXG4gICAgICAgICdjbG91ZGZvcm1hdGlvbjpEZXNjcmliZVN0YWNrRXZlbnRzJyxcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkdldFN0YWNrUG9saWN5J1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpjbG91ZGZvcm1hdGlvbjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06c3RhY2svQXBwLU1vZEV4LVByb2plY3QtKi8qYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vID09PT09IENPREVCVUlMRCBQRVJNSVNTSU9OUyA9PT09PVxuICAgIFxuICAgIC8vIEdyYW50IENvZGVCdWlsZCBwZXJtaXNzaW9ucyBmb3IgcHJvdmlzaW9uaW5nIExhbWJkYSB0byBzdGFydCBidWlsZHNcbiAgICBsYW1iZGFFeGVjdXRpb25Sb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2NvZGVidWlsZDpTdGFydEJ1aWxkJyxcbiAgICAgICAgJ2NvZGVidWlsZDpCYXRjaEdldEJ1aWxkcydcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6Y29kZWJ1aWxkOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpwcm9qZWN0L2FwcC1tb2RleC1wcm9qZWN0LXByb3Zpc2lvbmluZ2BcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyA9PT09PSBMQU1CREEgTEFZRVIgRk9SIFNIQVJFRCBVVElMSVRJRVMgPT09PT1cbiAgICBcbiAgICBjb25zdCBzaGFyZWRMYXllciA9IGNyZWF0ZVNoYXJlZExheWVyKHRoaXMsICdTaGFyZWRMYXllcicpO1xuXG4gICAgLy8gPT09PT0gQkVEUk9DSyBHVUFSRFJBSUxTID09PT09XG5cbiAgICAvLyBDcmVhdGUgQmVkcm9jayBHdWFyZHJhaWwgZm9yIGNvbnRlbnQgZmlsdGVyaW5nXG4gICAgY29uc3QgYmVkcm9ja0d1YXJkcmFpbCA9IG5ldyBjZGsuQ2ZuUmVzb3VyY2UodGhpcywgJ0JlZHJvY2tHdWFyZHJhaWwnLCB7XG4gICAgICB0eXBlOiAnQVdTOjpCZWRyb2NrOjpHdWFyZHJhaWwnLFxuICAgICAgcHJvcGVydGllczoge1xuICAgICAgICBOYW1lOiAnYXBwLW1vZGV4LWNvbnRlbnQtZmlsdGVyJyxcbiAgICAgICAgRGVzY3JpcHRpb246ICdDb250ZW50IGZpbHRlcmluZyBmb3IgQXBwLU1vZEV4IEJlZHJvY2sgbW9kZWxzJyxcbiAgICAgICAgQmxvY2tlZElucHV0TWVzc2FnaW5nOiAnWW91ciByZXF1ZXN0IHdhcyBibG9ja2VkIGR1ZSB0byBjb250ZW50IHBvbGljeSB2aW9sYXRpb25zLicsXG4gICAgICAgIEJsb2NrZWRPdXRwdXRzTWVzc2FnaW5nOiAnVGhlIHJlc3BvbnNlIHdhcyBibG9ja2VkIGR1ZSB0byBjb250ZW50IHBvbGljeSB2aW9sYXRpb25zLicsXG4gICAgICAgIENvbnRlbnRQb2xpY3lDb25maWc6IHtcbiAgICAgICAgICBGaWx0ZXJzQ29uZmlnOiBbXG4gICAgICAgICAgICB7IFR5cGU6ICdTRVhVQUwnLCBJbnB1dFN0cmVuZ3RoOiAnSElHSCcsIE91dHB1dFN0cmVuZ3RoOiAnSElHSCcgfSxcbiAgICAgICAgICAgIHsgVHlwZTogJ1ZJT0xFTkNFJywgSW5wdXRTdHJlbmd0aDogJ0hJR0gnLCBPdXRwdXRTdHJlbmd0aDogJ0hJR0gnIH0sXG4gICAgICAgICAgICB7IFR5cGU6ICdIQVRFJywgSW5wdXRTdHJlbmd0aDogJ0hJR0gnLCBPdXRwdXRTdHJlbmd0aDogJ0hJR0gnIH0sXG4gICAgICAgICAgICB7IFR5cGU6ICdJTlNVTFRTJywgSW5wdXRTdHJlbmd0aDogJ01FRElVTScsIE91dHB1dFN0cmVuZ3RoOiAnTUVESVVNJyB9LFxuICAgICAgICAgICAgeyBUeXBlOiAnTUlTQ09ORFVDVCcsIElucHV0U3RyZW5ndGg6ICdNRURJVU0nLCBPdXRwdXRTdHJlbmd0aDogJ01FRElVTScgfSxcbiAgICAgICAgICAgIHsgVHlwZTogJ1BST01QVF9BVFRBQ0snLCBJbnB1dFN0cmVuZ3RoOiAnSElHSCcsIE91dHB1dFN0cmVuZ3RoOiAnTk9ORScgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgICBTZW5zaXRpdmVJbmZvcm1hdGlvblBvbGljeUNvbmZpZzoge1xuICAgICAgICAgIFBpaUVudGl0aWVzQ29uZmlnOiBbXG4gICAgICAgICAgICB7IFR5cGU6ICdFTUFJTCcsIEFjdGlvbjogJ0FOT05ZTUlaRScgfSxcbiAgICAgICAgICAgIHsgVHlwZTogJ1BIT05FJywgQWN0aW9uOiAnQU5PTllNSVpFJyB9LFxuICAgICAgICAgICAgeyBUeXBlOiAnTkFNRScsIEFjdGlvbjogJ0FOT05ZTUlaRScgfSxcbiAgICAgICAgICAgIHsgVHlwZTogJ1VTX1NPQ0lBTF9TRUNVUklUWV9OVU1CRVInLCBBY3Rpb246ICdCTE9DSycgfSxcbiAgICAgICAgICAgIHsgVHlwZTogJ0NSRURJVF9ERUJJVF9DQVJEX05VTUJFUicsIEFjdGlvbjogJ0JMT0NLJyB9LFxuICAgICAgICAgICAgeyBUeXBlOiAnQVdTX0FDQ0VTU19LRVknLCBBY3Rpb246ICdCTE9DSycgfSxcbiAgICAgICAgICAgIHsgVHlwZTogJ0FXU19TRUNSRVRfS0VZJywgQWN0aW9uOiAnQkxPQ0snIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgICAgVG9waWNQb2xpY3lDb25maWc6IHtcbiAgICAgICAgICBUb3BpY3NDb25maWc6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgTmFtZTogJ0ZpbmFuY2lhbCBBZHZpY2UnLFxuICAgICAgICAgICAgICBEZWZpbml0aW9uOiAnSW52ZXN0bWVudCBvciBmaW5hbmNpYWwgYWR2aWNlJyxcbiAgICAgICAgICAgICAgVHlwZTogJ0RFTlknLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgTmFtZTogJ01lZGljYWwgQWR2aWNlJyxcbiAgICAgICAgICAgICAgRGVmaW5pdGlvbjogJ01lZGljYWwgZGlhZ25vc2lzIG9yIHRyZWF0bWVudCBhZHZpY2UnLFxuICAgICAgICAgICAgICBUeXBlOiAnREVOWScsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY2RrLlRhZ3Mub2YoYmVkcm9ja0d1YXJkcmFpbCkuYWRkKCdFbnZpcm9ubWVudCcsIGVudmlyb25tZW50KTtcbiAgICBjZGsuVGFncy5vZihiZWRyb2NrR3VhcmRyYWlsKS5hZGQoJ01hbmFnZWRCeScsICdDREsnKTtcblxuICAgIC8vID09PT09IFBST0pFQ1RTIExBTUJEQSAtIERFRElDQVRFRCBST0xFID09PT09XG4gICAgXG4gICAgLy8gQ3JlYXRlIGRlZGljYXRlZCByb2xlIGZvciBwcm9qZWN0cyBMYW1iZGEgd2l0aCBsZWFzdCBwcml2aWxlZ2UgcGVybWlzc2lvbnNcbiAgICBjb25zdCBwcm9qZWN0c1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1Byb2plY3RzUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgcm9sZU5hbWU6ICdhcHAtbW9kZXgtcHJvamVjdHMtcm9sZScsXG4gICAgfSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIExvZ3MgcGVybWlzc2lvbnNcbiAgICBwcm9qZWN0c1JvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnbG9nczpDcmVhdGVMb2dHcm91cCcsXG4gICAgICAgICdsb2dzOkNyZWF0ZUxvZ1N0cmVhbScsXG4gICAgICAgICdsb2dzOlB1dExvZ0V2ZW50cydcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6bG9nczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06bG9nLWdyb3VwOi9hd3MvbGFtYmRhL2FwcC1tb2RleC1wcm9qZWN0czoqYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIER5bmFtb0RCIHBlcm1pc3Npb25zIGZvciBwcm9qZWN0cyBhbmQgcHJvamVjdCBkYXRhIHRhYmxlc1xuICAgIHByb2plY3RzUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdkeW5hbW9kYjpHZXRJdGVtJyxcbiAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxuICAgICAgICAnZHluYW1vZGI6VXBkYXRlSXRlbScsXG4gICAgICAgICdkeW5hbW9kYjpEZWxldGVJdGVtJyxcbiAgICAgICAgJ2R5bmFtb2RiOlF1ZXJ5JyxcbiAgICAgICAgJ2R5bmFtb2RiOlNjYW4nLFxuICAgICAgICAnZHluYW1vZGI6QmF0Y2hXcml0ZUl0ZW0nXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIHByb2plY3RzVGFibGVBcm4sXG4gICAgICAgIHByb2plY3REYXRhVGFibGVBcm5cbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBTUVMgcGVybWlzc2lvbnMgZm9yIHByb2plY3Qgb3BlcmF0aW9ucyBxdWV1ZVxuICAgIHByb2plY3RzUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdzcXM6U2VuZE1lc3NhZ2UnLFxuICAgICAgICAnc3FzOkdldFF1ZXVlVXJsJyxcbiAgICAgICAgJ3NxczpHZXRRdWV1ZUF0dHJpYnV0ZXMnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIHRoaXMucHJvamVjdE9wZXJhdGlvbnNRdWV1ZS5xdWV1ZUFyblxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vID09PT09IExBTUJEQSBGVU5DVElPTlMgPT09PT1cbiAgICBcbiAgICAvLyBQcm9qZWN0cyBMYW1iZGEgRnVuY3Rpb25cbiAgICBjb25zdCBwcm9qZWN0c0Z1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUHJvamVjdHNGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ2FwcC1tb2RleC1wcm9qZWN0cycsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL2dsb2JhbC9wcm9qZWN0cycpLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICByb2xlOiBwcm9qZWN0c1JvbGUsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52aXJvbm1lbnRWYXJzLFxuICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdQcm9qZWN0c0Z1bmN0aW9uLUxvZ0dyb3VwJywge1xuICAgICAgICBsb2dHcm91cE5hbWU6ICcvYXdzL2xhbWJkYS9hcHAtbW9kZXgtcHJvamVjdHMnLFxuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIH0pLFxuICAgICAgbGF5ZXJzOiBbc2hhcmVkTGF5ZXJdLFxuICAgIH0pO1xuXG4gICAgLy8gUHJvamVjdCBEYXRhIExhbWJkYSBGdW5jdGlvblxuICAgIGNvbnN0IHByb2plY3REYXRhRnVuY3Rpb24gPSBjcmVhdGVMYW1iZGFGdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnUHJvamVjdERhdGFGdW5jdGlvbicsXG4gICAgICAnYXBwLW1vZGV4LXByb2plY3QtZGF0YScsXG4gICAgICAnbGFtYmRhL2dsb2JhbC9wcm9qZWN0LWRhdGEnLFxuICAgICAgc2hhcmVkTGF5ZXIsXG4gICAgICBsYW1iZGFFeGVjdXRpb25Sb2xlLFxuICAgICAgY29tbW9uRW52aXJvbm1lbnRWYXJzXG4gICAgKTtcblxuICAgIC8vID09PT09IFBFUk1JU1NJT05TIEJPVU5EQVJZID09PT09XG4gICAgXG4gICAgLy8gQ3JlYXRlIFBlcm1pc3Npb25zIEJvdW5kYXJ5IHRvIHByZXZlbnQgcHJpdmlsZWdlIGVzY2FsYXRpb25cbiAgICAvLyBUaGlzIGlzIGNyZWF0ZWQgZWFybHkgc28gaXQgY2FuIGJlIHJlZmVyZW5jZWQgYnkgcm9sZXMgdGhyb3VnaG91dCB0aGUgc3RhY2tcbiAgICBjb25zdCBwZXJtaXNzaW9uc0JvdW5kYXJ5ID0gbmV3IGlhbS5NYW5hZ2VkUG9saWN5KHRoaXMsICdDREtQZXJtaXNzaW9uc0JvdW5kYXJ5Jywge1xuICAgICAgbWFuYWdlZFBvbGljeU5hbWU6ICdhcHAtbW9kZXgtY2RrLXBlcm1pc3Npb25zLWJvdW5kYXJ5JyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUGVybWlzc2lvbnMgYm91bmRhcnkgZm9yIHJvbGVzIGNyZWF0ZWQgYnkgQ0RLIGRlcGxveW1lbnQnLFxuICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAvLyBBbGxvdyBvbmx5IGFwcC1tb2RleCBzcGVjaWZpYyByZXNvdXJjZXNcbiAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAnczM6KicsXG4gICAgICAgICAgICAnZHluYW1vZGI6KicsXG4gICAgICAgICAgICAnbGFtYmRhOionLFxuICAgICAgICAgICAgJ2xvZ3M6KicsXG4gICAgICAgICAgICAnc3RhdGVzOionLFxuICAgICAgICAgICAgJ2dsdWU6KicsXG4gICAgICAgICAgICAnYXRoZW5hOionLFxuICAgICAgICAgICAgJ2JlZHJvY2s6SW52b2tlTW9kZWwnLFxuICAgICAgICAgICAgJ3NxczoqJyxcbiAgICAgICAgICAgICdzbnM6KicsXG4gICAgICAgICAgICAnZXZlbnRzOionLFxuICAgICAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkdldFNlY3JldFZhbHVlJyxcbiAgICAgICAgICAgICdjb2duaXRvLWlkcDoqJyxcbiAgICAgICAgICAgICdjbG91ZGZvcm1hdGlvbjpEZXNjcmliZVN0YWNrcycsXG4gICAgICAgICAgICAnY29kZWJ1aWxkOlN0YXJ0QnVpbGQnXG4gICAgICAgICAgXSxcbiAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgIGBhcm46YXdzOnMzOjo6YXBwLW1vZGV4LSpgLFxuICAgICAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcC1tb2RleC0qYCxcbiAgICAgICAgICAgIGBhcm46YXdzOmxhbWJkYToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06ZnVuY3Rpb246YXBwLW1vZGV4LSpgLFxuICAgICAgICAgICAgYGFybjphd3M6bG9nczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06bG9nLWdyb3VwOi9hd3MvbGFtYmRhL2FwcC1tb2RleC0qYCxcbiAgICAgICAgICAgIGBhcm46YXdzOmxvZ3M6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmxvZy1ncm91cDovYXdzL3ZlbmRlZGxvZ3Mvc3RhdGVzL2FwcC1tb2RleC0qYCxcbiAgICAgICAgICAgIGBhcm46YXdzOnN0YXRlczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06c3RhdGVNYWNoaW5lOmFwcC1tb2RleC0qYCxcbiAgICAgICAgICAgIGBhcm46YXdzOnN0YXRlczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06ZXhlY3V0aW9uOmFwcC1tb2RleC0qOipgLFxuICAgICAgICAgICAgYGFybjphd3M6Z2x1ZToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06KmAsXG4gICAgICAgICAgICBgYXJuOmF3czphdGhlbmE6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9Ondvcmtncm91cC9hcHAtbW9kZXgtKmAsXG4gICAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7dGhpcy5yZWdpb259Ojpmb3VuZGF0aW9uLW1vZGVsLypgLFxuICAgICAgICAgICAgYGFybjphd3M6c3FzOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTphcHAtbW9kZXgtKmAsXG4gICAgICAgICAgICBgYXJuOmF3czpzbnM6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmFwcC1tb2RleC0qYCxcbiAgICAgICAgICAgIGBhcm46YXdzOmV2ZW50czoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06cnVsZS9hcHAtbW9kZXgtKmAsXG4gICAgICAgICAgICBgYXJuOmF3czpzZWNyZXRzbWFuYWdlcjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06c2VjcmV0OmFwcC1tb2RleC0qYCxcbiAgICAgICAgICAgIGBhcm46YXdzOmNvZ25pdG8taWRwOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp1c2VycG9vbC8qYCxcbiAgICAgICAgICAgIGBhcm46YXdzOmNsb3VkZm9ybWF0aW9uOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpzdGFjay9BcHAtTW9kRXgtUHJvamVjdC0qYCxcbiAgICAgICAgICAgIGBhcm46YXdzOmNvZGVidWlsZDoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06cHJvamVjdC9hcHAtbW9kZXgtKmBcbiAgICAgICAgICBdXG4gICAgICAgIH0pLFxuICAgICAgICAvLyBBbGxvdyBDbG91ZFdhdGNoIExvZ3MgbWFuYWdlbWVudCBhY3Rpb25zIHRoYXQgcmVxdWlyZSB3aWxkY2FyZCByZXNvdXJjZXNcbiAgICAgICAgLy8gVGhlc2UgYWN0aW9ucyBkb24ndCBzdXBwb3J0IHNwZWNpZmljIHJlc291cmNlIEFSTnMgcGVyIEFXUyBkb2N1bWVudGF0aW9uXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nRGVsaXZlcnknLFxuICAgICAgICAgICAgJ2xvZ3M6R2V0TG9nRGVsaXZlcnknLFxuICAgICAgICAgICAgJ2xvZ3M6VXBkYXRlTG9nRGVsaXZlcnknLFxuICAgICAgICAgICAgJ2xvZ3M6RGVsZXRlTG9nRGVsaXZlcnknLFxuICAgICAgICAgICAgJ2xvZ3M6TGlzdExvZ0RlbGl2ZXJpZXMnLFxuICAgICAgICAgICAgJ2xvZ3M6UHV0UmVzb3VyY2VQb2xpY3knLFxuICAgICAgICAgICAgJ2xvZ3M6RGVzY3JpYmVSZXNvdXJjZVBvbGljaWVzJyxcbiAgICAgICAgICAgICdsb2dzOkRlc2NyaWJlTG9nR3JvdXBzJ1xuICAgICAgICAgIF0sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbJyonXVxuICAgICAgICB9KSxcbiAgICAgICAgLy8gRGVueSBJQU0gcHJpdmlsZWdlIGVzY2FsYXRpb25cbiAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5ERU5ZLFxuICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICdpYW06Q3JlYXRlVXNlcicsXG4gICAgICAgICAgICAnaWFtOkNyZWF0ZUFjY2Vzc0tleScsXG4gICAgICAgICAgICAnaWFtOlB1dFVzZXJQb2xpY3knLFxuICAgICAgICAgICAgJ2lhbTpBdHRhY2hVc2VyUG9saWN5J1xuICAgICAgICAgIF0sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbJyonXVxuICAgICAgICB9KVxuICAgICAgXVxuICAgIH0pO1xuXG4gICAgLy8gPT09PT0gU0hBUklORyBMQU1CREEgLSBERURJQ0FURUQgUk9MRSA9PT09PVxuICAgIFxuICAgIC8vIENyZWF0ZSBkZWRpY2F0ZWQgcm9sZSBmb3Igc2hhcmluZyBMYW1iZGEgd2l0aCBTZWNyZXRzIE1hbmFnZXIsIER5bmFtb0RCLCBhbmQgQ29nbml0byBwZXJtaXNzaW9uc1xuICAgIGNvbnN0IHNoYXJpbmdSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdTaGFyaW5nUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgcm9sZU5hbWU6ICdhcHAtbW9kZXgtc2hhcmluZy1yb2xlJyxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKVxuICAgICAgXSxcbiAgICAgIHBlcm1pc3Npb25zQm91bmRhcnk6IHBlcm1pc3Npb25zQm91bmRhcnlcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IFNlY3JldHMgTWFuYWdlciBwZXJtaXNzaW9uc1xuICAgIHNoYXJpbmdSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFsnc2VjcmV0c21hbmFnZXI6R2V0U2VjcmV0VmFsdWUnXSxcbiAgICAgIHJlc291cmNlczogW2FwcENvbmZpZ1NlY3JldC5zZWNyZXRBcm5dXG4gICAgfSkpO1xuXG4gICAgLy8gR3JhbnQgRHluYW1vREIgcGVybWlzc2lvbnMgZm9yIHByb2plY3RzIHRhYmxlXG4gICAgcHJvamVjdHNUYWJsZS5ncmFudFJlYWRXcml0ZURhdGEoc2hhcmluZ1JvbGUpO1xuXG4gICAgLy8gR3JhbnQgQ29nbml0byBwZXJtaXNzaW9ucyBmb3IgdXNlciBtYW5hZ2VtZW50XG4gICAgc2hhcmluZ1JvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnY29nbml0by1pZHA6QWRtaW5HZXRVc2VyJyxcbiAgICAgICAgJ2NvZ25pdG8taWRwOkFkbWluQ3JlYXRlVXNlcicsXG4gICAgICAgICdjb2duaXRvLWlkcDpMaXN0VXNlcnMnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbdXNlclBvb2xBcm5dXG4gICAgfSkpO1xuXG4gICAgLy8gU2hhcmluZyBMYW1iZGEgRnVuY3Rpb25cbiAgICBjb25zdCBzaGFyaW5nRnVuY3Rpb24gPSBjcmVhdGVMYW1iZGFGdW5jdGlvbihcbiAgICAgIHRoaXMsXG4gICAgICAnU2hhcmluZ0Z1bmN0aW9uJyxcbiAgICAgICdhcHAtbW9kZXgtc2hhcmluZycsXG4gICAgICAnbGFtYmRhL2dsb2JhbC9zaGFyaW5nJyxcbiAgICAgIHNoYXJlZExheWVyLFxuICAgICAgc2hhcmluZ1JvbGUsXG4gICAgICBjb21tb25FbnZpcm9ubWVudFZhcnNcbiAgICApO1xuXG4gICAgLy8gPT09PT0gUFJPQ0VTUyBUUkFDS0lORyBMQU1CREEgLSBERURJQ0FURUQgUk9MRSA9PT09PVxuICAgIFxuICAgIC8vIENyZWF0ZSBkZWRpY2F0ZWQgcm9sZSBmb3IgcHJvY2VzcyB0cmFja2luZyBMYW1iZGEgd2l0aCBsZWFzdCBwcml2aWxlZ2UgcGVybWlzc2lvbnNcbiAgICBjb25zdCBwcm9jZXNzVHJhY2tpbmdSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdQcm9jZXNzVHJhY2tpbmdSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICByb2xlTmFtZTogJ2FwcC1tb2RleC1wcm9jZXNzLXRyYWNraW5nLXJvbGUnLFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBMb2dzIHBlcm1pc3Npb25zXG4gICAgcHJvY2Vzc1RyYWNraW5nUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdsb2dzOkNyZWF0ZUxvZ0dyb3VwJyxcbiAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nU3RyZWFtJyxcbiAgICAgICAgJ2xvZ3M6UHV0TG9nRXZlbnRzJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpsb2dzOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpsb2ctZ3JvdXA6L2F3cy9sYW1iZGEvYXBwLW1vZGV4LXByb2Nlc3MtdHJhY2tpbmc6KmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBEeW5hbW9EQiBwZXJtaXNzaW9ucyBmb3IgcHJvamVjdC1zcGVjaWZpYyBwcm9jZXNzIHRhYmxlc1xuICAgIHByb2Nlc3NUcmFja2luZ1JvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6U2NhbicsXG4gICAgICAgICdkeW5hbW9kYjpRdWVyeScsXG4gICAgICAgICdkeW5hbW9kYjpHZXRJdGVtJyxcbiAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxuICAgICAgICAnZHluYW1vZGI6VXBkYXRlSXRlbScsXG4gICAgICAgICdkeW5hbW9kYjpEZWxldGVJdGVtJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvYXBwLW1vZGV4LXByb2Nlc3MtKmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBFdmVudEJyaWRnZSBwZXJtaXNzaW9ucyBmb3IgcHVibGlzaGluZyBwcm9jZXNzIGV2ZW50c1xuICAgIHByb2Nlc3NUcmFja2luZ1JvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZXZlbnRzOlB1dEV2ZW50cydcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6ZXZlbnRzOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpldmVudC1idXMvYXBwLW1vZGV4LWV2ZW50cy0qYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIFByb2Nlc3MgVHJhY2tpbmcgTGFtYmRhIEZ1bmN0aW9uXG4gICAgY29uc3QgcHJvY2Vzc1RyYWNraW5nRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdQcm9jZXNzVHJhY2tpbmdGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ2FwcC1tb2RleC1wcm9jZXNzLXRyYWNraW5nJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEvZ2xvYmFsL3Byb2Nlc3MtdHJhY2tpbmcnKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgcm9sZTogcHJvY2Vzc1RyYWNraW5nUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnZpcm9ubWVudFZhcnMsXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1Byb2Nlc3NUcmFja2luZ0Z1bmN0aW9uLUxvZ0dyb3VwJywge1xuICAgICAgICBsb2dHcm91cE5hbWU6ICcvYXdzL2xhbWJkYS9hcHAtbW9kZXgtcHJvY2Vzcy10cmFja2luZycsXG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgfSksXG4gICAgICBsYXllcnM6IFtzaGFyZWRMYXllcl0sXG4gICAgfSk7XG5cbiAgICAvLyBVc2VyIFNlYXJjaCBMYW1iZGEgUm9sZVxuICAgIGNvbnN0IHVzZXJTZWFyY2hSb2xlID0gcm9sZU1hbmFnZXIuY3JlYXRlTGFtYmRhUm9sZSgnVXNlclNlYXJjaFJvbGUnLCAnYXBwLW1vZGV4LXVzZXItc2VhcmNoJyk7XG4gICAgYXBwQ29uZmlnU2VjcmV0LmdyYW50UmVhZCh1c2VyU2VhcmNoUm9sZSk7XG4gICAgdXNlclNlYXJjaFJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogWydjb2duaXRvLWlkcDpMaXN0VXNlcnMnXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmNvZ25pdG8taWRwOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp1c2VycG9vbC8qYF1cbiAgICB9KSk7XG5cbiAgICAvLyBVc2VyIFNlYXJjaCBMYW1iZGEgRnVuY3Rpb25cbiAgICBjb25zdCB1c2VyU2VhcmNoRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdVc2VyU2VhcmNoRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6ICdhcHAtbW9kZXgtdXNlci1zZWFyY2gnLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9nbG9iYWwvdXNlci1zZWFyY2gnKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgcm9sZTogdXNlclNlYXJjaFJvbGUsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52aXJvbm1lbnRWYXJzLFxuICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdVc2VyU2VhcmNoRnVuY3Rpb24tTG9nR3JvdXAnLCB7XG4gICAgICAgIGxvZ0dyb3VwTmFtZTogJy9hd3MvbGFtYmRhL2FwcC1tb2RleC11c2VyLXNlYXJjaCcsXG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgfSksXG4gICAgICBsYXllcnM6IFtzaGFyZWRMYXllcl0sXG4gICAgfSk7XG5cbiAgICAvLyBQaWxvdCBJbml0aWF0ZSBMYW1iZGEgUm9sZVxuICAgIGNvbnN0IHBpbG90SW5pdGlhdGVSb2xlID0gcm9sZU1hbmFnZXIuY3JlYXRlTGFtYmRhUm9sZSgnUGlsb3RJbml0aWF0ZVJvbGUnLCAnYXBwLW1vZGV4LXBpbG90LWluaXRpYXRlJyk7XG4gICAgcHJvamVjdHNUYWJsZS5ncmFudFJlYWREYXRhKHBpbG90SW5pdGlhdGVSb2xlKTtcbiAgICBwcm9qZWN0RGF0YVRhYmxlLmdyYW50UmVhZERhdGEocGlsb3RJbml0aWF0ZVJvbGUpO1xuICAgIHBpbG90SW5pdGlhdGVSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFsnc3RhdGVzOlN0YXJ0RXhlY3V0aW9uJ10sXG4gICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpzdGF0ZXM6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnN0YXRlTWFjaGluZTphcHAtbW9kZXgtcGlsb3QtYW5hbHlzaXMtKmBdXG4gICAgfSkpO1xuXG4gICAgLy8gUGlsb3QgSWRlbnRpZmljYXRpb24gLSBJbml0aWF0ZSBMYW1iZGEgRnVuY3Rpb25cbiAgICBjb25zdCBwaWxvdEluaXRpYXRlRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdQaWxvdEluaXRpYXRlRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6ICdhcHAtbW9kZXgtcGlsb3QtaW5pdGlhdGUnLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9nbG9iYWwvcGlsb3QtaWRlbnRpZmljYXRpb24nKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoNjApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgcm9sZTogcGlsb3RJbml0aWF0ZVJvbGUsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52aXJvbm1lbnRWYXJzLFxuICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdQaWxvdEluaXRpYXRlRnVuY3Rpb24tTG9nR3JvdXAnLCB7XG4gICAgICAgIGxvZ0dyb3VwTmFtZTogJy9hd3MvbGFtYmRhL2FwcC1tb2RleC1waWxvdC1pbml0aWF0ZScsXG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgfSksXG4gICAgICBsYXllcnM6IFtzaGFyZWRMYXllcl0sXG4gICAgfSk7XG5cbiAgICAvLyBQaWxvdCBTdGF0dXMgTGFtYmRhIFJvbGVcbiAgICBjb25zdCBwaWxvdFN0YXR1c1JvbGUgPSByb2xlTWFuYWdlci5jcmVhdGVMYW1iZGFSb2xlKCdQaWxvdFN0YXR1c1JvbGUnLCAnYXBwLW1vZGV4LXBpbG90LXN0YXR1cycpO1xuICAgIHBpbG90U3RhdHVzUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbJ3N0YXRlczpEZXNjcmliZUV4ZWN1dGlvbicsICdzdGF0ZXM6R2V0RXhlY3V0aW9uSGlzdG9yeSddLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6c3RhdGVzOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpleGVjdXRpb246YXBwLW1vZGV4LXBpbG90LWFuYWx5c2lzLSo6KmBdXG4gICAgfSkpO1xuXG4gICAgLy8gUGlsb3QgSWRlbnRpZmljYXRpb24gLSBTdGF0dXMgTGFtYmRhIEZ1bmN0aW9uXG4gICAgY29uc3QgcGlsb3RTdGF0dXNGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1BpbG90U3RhdHVzRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6ICdhcHAtbW9kZXgtcGlsb3Qtc3RhdHVzJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEvZ2xvYmFsL3BpbG90LWlkZW50aWZpY2F0aW9uJyksXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIHJvbGU6IHBpbG90U3RhdHVzUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnZpcm9ubWVudFZhcnMsXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1BpbG90U3RhdHVzRnVuY3Rpb24tTG9nR3JvdXAnLCB7XG4gICAgICAgIGxvZ0dyb3VwTmFtZTogJy9hd3MvbGFtYmRhL2FwcC1tb2RleC1waWxvdC1zdGF0dXMnLFxuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIH0pLFxuICAgICAgbGF5ZXJzOiBbc2hhcmVkTGF5ZXJdLFxuICAgIH0pO1xuXG4gICAgLy8gUGlsb3QgUmVzdWx0cyBMYW1iZGEgUm9sZVxuICAgIGNvbnN0IHBpbG90UmVzdWx0c1JvbGUgPSByb2xlTWFuYWdlci5jcmVhdGVMYW1iZGFSb2xlKCdQaWxvdFJlc3VsdHNSb2xlJywgJ2FwcC1tb2RleC1waWxvdC1yZXN1bHRzJyk7XG4gICAgcGlsb3RSZXN1bHRzUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbJ3MzOkdldE9iamVjdCddLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6czM6OjphcHAtbW9kZXgtZGF0YS0qL3BpbG90LWFuYWx5c2lzLypgXVxuICAgIH0pKTtcblxuICAgIC8vIFBpbG90IElkZW50aWZpY2F0aW9uIC0gUmVzdWx0cyBMYW1iZGEgRnVuY3Rpb25cbiAgICBjb25zdCBwaWxvdFJlc3VsdHNGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1BpbG90UmVzdWx0c0Z1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiAnYXBwLW1vZGV4LXBpbG90LXJlc3VsdHMnLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9nbG9iYWwvcGlsb3QtaWRlbnRpZmljYXRpb24nKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgcm9sZTogcGlsb3RSZXN1bHRzUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnZpcm9ubWVudFZhcnMsXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1BpbG90UmVzdWx0c0Z1bmN0aW9uLUxvZ0dyb3VwJywge1xuICAgICAgICBsb2dHcm91cE5hbWU6ICcvYXdzL2xhbWJkYS9hcHAtbW9kZXgtcGlsb3QtcmVzdWx0cycsXG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgfSksXG4gICAgICBsYXllcnM6IFtzaGFyZWRMYXllcl0sXG4gICAgfSk7XG5cbiAgICAvLyBQaWxvdCBEZWxldGUgTGFtYmRhIFJvbGVcbiAgICBjb25zdCBwaWxvdERlbGV0ZVJvbGUgPSByb2xlTWFuYWdlci5jcmVhdGVMYW1iZGFSb2xlKCdQaWxvdERlbGV0ZVJvbGUnLCAnYXBwLW1vZGV4LXBpbG90LWRlbGV0ZScpO1xuICAgIHBpbG90RGVsZXRlUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbJ3MzOkRlbGV0ZU9iamVjdCddLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6czM6OjphcHAtbW9kZXgtZGF0YS0qL3BpbG90LWFuYWx5c2lzLypgXVxuICAgIH0pKTtcbiAgICBwaWxvdERlbGV0ZVJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogWydzdGF0ZXM6U3RvcEV4ZWN1dGlvbiddLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6c3RhdGVzOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpleGVjdXRpb246YXBwLW1vZGV4LXBpbG90LWFuYWx5c2lzLSo6KmBdXG4gICAgfSkpO1xuXG4gICAgLy8gUGlsb3QgSWRlbnRpZmljYXRpb24gLSBEZWxldGUgTGFtYmRhIEZ1bmN0aW9uXG4gICAgY29uc3QgcGlsb3REZWxldGVGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1BpbG90RGVsZXRlRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6ICdhcHAtbW9kZXgtcGlsb3QtZGVsZXRlJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEvZ2xvYmFsL3BpbG90LWlkZW50aWZpY2F0aW9uJyksXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIHJvbGU6IHBpbG90RGVsZXRlUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnZpcm9ubWVudFZhcnMsXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1BpbG90RGVsZXRlRnVuY3Rpb24tTG9nR3JvdXAnLCB7XG4gICAgICAgIGxvZ0dyb3VwTmFtZTogJy9hd3MvbGFtYmRhL2FwcC1tb2RleC1waWxvdC1kZWxldGUnLFxuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIH0pLFxuICAgICAgbGF5ZXJzOiBbc2hhcmVkTGF5ZXJdLFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT0gQVBQTElDQVRJT04gQlVDS0VUUyBMQU1CREEgLSBERURJQ0FURUQgUk9MRSA9PT09PVxuICAgIFxuICAgIC8vIENyZWF0ZSBkZWRpY2F0ZWQgcm9sZSBmb3IgYXBwbGljYXRpb24gYnVja2V0cyBMYW1iZGEgd2l0aCBsZWFzdCBwcml2aWxlZ2UgcGVybWlzc2lvbnNcbiAgICBjb25zdCBhcHBsaWNhdGlvbkJ1Y2tldHNSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdBcHBsaWNhdGlvbkJ1Y2tldHNSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICByb2xlTmFtZTogJ2FwcC1tb2RleC1hcHBsaWNhdGlvbi1idWNrZXRzLXJvbGUnLFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBMb2dzIHBlcm1pc3Npb25zXG4gICAgYXBwbGljYXRpb25CdWNrZXRzUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdsb2dzOkNyZWF0ZUxvZ0dyb3VwJyxcbiAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nU3RyZWFtJyxcbiAgICAgICAgJ2xvZ3M6UHV0TG9nRXZlbnRzJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpsb2dzOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpsb2ctZ3JvdXA6L2F3cy9sYW1iZGEvYXBwLW1vZGV4LWFwcGxpY2F0aW9uLWJ1Y2tldHM6KmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBEeW5hbW9EQiBwZXJtaXNzaW9ucyBmb3IgcHJvamVjdC1zcGVjaWZpYyBhcHBsaWNhdGlvbi1idWNrZXRzIHRhYmxlc1xuICAgIGFwcGxpY2F0aW9uQnVja2V0c1JvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6UXVlcnknLFxuICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICdkeW5hbW9kYjpQdXRJdGVtJyxcbiAgICAgICAgJ2R5bmFtb2RiOkRlbGV0ZUl0ZW0nXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS9hcHAtbW9kZXgtYXBwbGljYXRpb24tYnVja2V0cy0qYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIEFwcGxpY2F0aW9uIEJ1Y2tldHMgTGFtYmRhIEZ1bmN0aW9uXG4gICAgY29uc3QgYXBwbGljYXRpb25CdWNrZXRzRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdBcHBsaWNhdGlvbkJ1Y2tldHNGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ2FwcC1tb2RleC1hcHBsaWNhdGlvbi1idWNrZXRzJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEvZ2xvYmFsL2FwcGxpY2F0aW9uLWJ1Y2tldHMnKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgcm9sZTogYXBwbGljYXRpb25CdWNrZXRzUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnZpcm9ubWVudFZhcnMsXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0FwcGxpY2F0aW9uQnVja2V0c0Z1bmN0aW9uLUxvZ0dyb3VwJywge1xuICAgICAgICBsb2dHcm91cE5hbWU6ICcvYXdzL2xhbWJkYS9hcHAtbW9kZXgtYXBwbGljYXRpb24tYnVja2V0cycsXG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgfSksXG4gICAgICBsYXllcnM6IFtzaGFyZWRMYXllcl0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PSBUQ08gRVNUSU1BVEVTIExBTUJEQSAtIERFRElDQVRFRCBST0xFID09PT09XG4gICAgXG4gICAgLy8gQ3JlYXRlIGRlZGljYXRlZCByb2xlIGZvciBUQ08gTGFtYmRhIHdpdGggbGVhc3QgcHJpdmlsZWdlIHBlcm1pc3Npb25zXG4gICAgY29uc3QgdGNvUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnVENPUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgcm9sZU5hbWU6ICdhcHAtbW9kZXgtdGNvLXJvbGUnLFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBMb2dzIHBlcm1pc3Npb25zXG4gICAgdGNvUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdsb2dzOkNyZWF0ZUxvZ0dyb3VwJyxcbiAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nU3RyZWFtJyxcbiAgICAgICAgJ2xvZ3M6UHV0TG9nRXZlbnRzJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpsb2dzOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpsb2ctZ3JvdXA6L2F3cy9sYW1iZGEvYXBwLW1vZGV4LXRjbzoqYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIER5bmFtb0RCIHBlcm1pc3Npb25zIGZvciBwcm9qZWN0LXNwZWNpZmljIFRDTyBlc3RpbWF0ZXMgdGFibGVzXG4gICAgdGNvUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdkeW5hbW9kYjpRdWVyeScsXG4gICAgICAgICdkeW5hbW9kYjpHZXRJdGVtJyxcbiAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxuICAgICAgICAnZHluYW1vZGI6RGVsZXRlSXRlbSdcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcC1tb2RleC10Y28tZXN0aW1hdGVzLSpgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gVENPIEVzdGltYXRlcyBMYW1iZGEgRnVuY3Rpb25cbiAgICBjb25zdCB0Y29GdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1RDT0Z1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiAnYXBwLW1vZGV4LXRjbycsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL2dsb2JhbC90Y28nKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgcm9sZTogdGNvUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnZpcm9ubWVudFZhcnMsXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1RDT0Z1bmN0aW9uLUxvZ0dyb3VwJywge1xuICAgICAgICBsb2dHcm91cE5hbWU6ICcvYXdzL2xhbWJkYS9hcHAtbW9kZXgtdGNvJyxcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICB9KSxcbiAgICAgIGxheWVyczogW3NoYXJlZExheWVyXSxcbiAgICB9KTtcblxuICAgIC8vID09PT09IFRFQU0gRVNUSU1BVEVTIExBTUJEQSAtIERFRElDQVRFRCBST0xFID09PT09XG4gICAgXG4gICAgLy8gQ3JlYXRlIGRlZGljYXRlZCByb2xlIGZvciB0ZWFtIGVzdGltYXRlcyBMYW1iZGEgd2l0aCBsZWFzdCBwcml2aWxlZ2UgcGVybWlzc2lvbnNcbiAgICBjb25zdCB0ZWFtRXN0aW1hdGVzUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnVGVhbUVzdGltYXRlc1JvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIHJvbGVOYW1lOiAnYXBwLW1vZGV4LXRlYW0tZXN0aW1hdGVzLXJvbGUnLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpLFxuICAgICAgXSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRXhlY3V0aW9uIHJvbGUgZm9yIHRlYW0tZXN0aW1hdGVzIExhbWJkYSB3aXRoIGxlYXN0IHByaXZpbGVnZSBEeW5hbW9EQiBhY2Nlc3MnLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgRHluYW1vREIgcGVybWlzc2lvbnMgb25seSBmb3IgdGVhbS1lc3RpbWF0ZXMgdGFibGVzXG4gICAgdGVhbUVzdGltYXRlc1JvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICdkeW5hbW9kYjpQdXRJdGVtJyxcbiAgICAgICAgJ2R5bmFtb2RiOkRlbGV0ZUl0ZW0nLFxuICAgICAgICAnZHluYW1vZGI6UXVlcnknLFxuICAgICAgICAnZHluYW1vZGI6U2NhbidcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcC1tb2RleC10ZWFtLWVzdGltYXRlcy0qYFxuICAgICAgXSxcbiAgICB9KSk7XG5cbiAgICAvLyBUZWFtIEVzdGltYXRlcyBMYW1iZGEgRnVuY3Rpb25cbiAgICBjb25zdCB0ZWFtRXN0aW1hdGVzRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdUZWFtRXN0aW1hdGVzRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6ICdhcHAtbW9kZXgtdGVhbS1lc3RpbWF0ZXMnLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9nbG9iYWwvdGVhbS1lc3RpbWF0ZXMnKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgcm9sZTogdGVhbUVzdGltYXRlc1JvbGUsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52aXJvbm1lbnRWYXJzLFxuICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdUZWFtRXN0aW1hdGVzRnVuY3Rpb24tTG9nR3JvdXAnLCB7XG4gICAgICAgIGxvZ0dyb3VwTmFtZTogJy9hd3MvbGFtYmRhL2FwcC1tb2RleC10ZWFtLWVzdGltYXRlcycsXG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgfSksXG4gICAgICBsYXllcnM6IFtzaGFyZWRMYXllcl0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PSBBVEhFTkEgUVVFUlkgTEFNQkRBIC0gREVESUNBVEVEIFJPTEUgPT09PT1cbiAgICBcbiAgICAvLyBDcmVhdGUgZGVkaWNhdGVkIHJvbGUgZm9yIGF0aGVuYSBxdWVyeSBMYW1iZGEgd2l0aCBsZWFzdCBwcml2aWxlZ2UgcGVybWlzc2lvbnNcbiAgICBjb25zdCBhdGhlbmFRdWVyeVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0F0aGVuYVF1ZXJ5Um9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgcm9sZU5hbWU6ICdhcHAtbW9kZXgtYXRoZW5hLXF1ZXJ5LXJvbGUnLFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBMb2dzIHBlcm1pc3Npb25zXG4gICAgYXRoZW5hUXVlcnlSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nR3JvdXAnLFxuICAgICAgICAnbG9nczpDcmVhdGVMb2dTdHJlYW0nLFxuICAgICAgICAnbG9nczpQdXRMb2dFdmVudHMnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmxvZ3M6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmxvZy1ncm91cDovYXdzL2xhbWJkYS9hcHAtbW9kZXgtYXRoZW5hLXF1ZXJ5OipgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gQXRoZW5hIHBlcm1pc3Npb25zIGZvciBxdWVyeSBleGVjdXRpb25cbiAgICBhdGhlbmFRdWVyeVJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnYXRoZW5hOlN0YXJ0UXVlcnlFeGVjdXRpb24nLFxuICAgICAgICAnYXRoZW5hOkdldFF1ZXJ5RXhlY3V0aW9uJyxcbiAgICAgICAgJ2F0aGVuYTpHZXRRdWVyeVJlc3VsdHMnLFxuICAgICAgICAnYXRoZW5hOlN0b3BRdWVyeUV4ZWN1dGlvbidcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6YXRoZW5hOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp3b3JrZ3JvdXAvYXBwLW1vZGV4LXdvcmtncm91cC0qYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIEdsdWUgcGVybWlzc2lvbnMgZm9yIGRhdGFiYXNlIGFuZCB0YWJsZSBtZXRhZGF0YVxuICAgIGF0aGVuYVF1ZXJ5Um9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdnbHVlOkdldERhdGFiYXNlJyxcbiAgICAgICAgJ2dsdWU6R2V0VGFibGUnLFxuICAgICAgICAnZ2x1ZTpHZXRQYXJ0aXRpb25zJyxcbiAgICAgICAgJ2dsdWU6R2V0VGFibGVzJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpnbHVlOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpjYXRhbG9nYCxcbiAgICAgICAgYGFybjphd3M6Z2x1ZToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06ZGF0YWJhc2UvYXBwX21vZGV4XypgLFxuICAgICAgICBgYXJuOmF3czpnbHVlOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpkYXRhYmFzZS9hcHAtbW9kZXgtKmAsXG4gICAgICAgIGBhcm46YXdzOmdsdWU6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcF9tb2RleF8qLypgLFxuICAgICAgICBgYXJuOmF3czpnbHVlOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS9hcHAtbW9kZXgtKi8qYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIFMzIHBlcm1pc3Npb25zIGZvciBBdGhlbmEgcXVlcnkgcmVzdWx0cyBhbmQgcHJvamVjdCBkYXRhXG4gICAgYXRoZW5hUXVlcnlSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICdzMzpQdXRPYmplY3QnLFxuICAgICAgICAnczM6RGVsZXRlT2JqZWN0JyxcbiAgICAgICAgJ3MzOkxpc3RCdWNrZXQnLFxuICAgICAgICAnczM6R2V0QnVja2V0TG9jYXRpb24nLFxuICAgICAgICAnczM6R2V0QnVja2V0VmVyc2lvbmluZycsXG4gICAgICAgICdzMzpMaXN0QnVja2V0VmVyc2lvbnMnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOnMzOjo6YXBwLW1vZGV4LXJlc3VsdHMtKmAsXG4gICAgICAgIGBhcm46YXdzOnMzOjo6YXBwLW1vZGV4LXJlc3VsdHMtKi8qYCxcbiAgICAgICAgYGFybjphd3M6czM6OjphcHAtbW9kZXgtZGF0YS0qYCxcbiAgICAgICAgYGFybjphd3M6czM6OjphcHAtbW9kZXgtZGF0YS0qLypgLFxuICAgICAgICBgYXJuOmF3czpzMzo6OmFwcC1tb2RleC1ub3JtYWxpemVkLWRhdGEtKmAsXG4gICAgICAgIGBhcm46YXdzOnMzOjo6YXBwLW1vZGV4LW5vcm1hbGl6ZWQtZGF0YS0qLypgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gQXRoZW5hIFF1ZXJ5IExhbWJkYSBGdW5jdGlvblxuICAgIGNvbnN0IGF0aGVuYVF1ZXJ5RnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdBdGhlbmFRdWVyeUZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiAnYXBwLW1vZGV4LWF0aGVuYS1xdWVyeScsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL2dsb2JhbC9hdGhlbmEtcXVlcnknKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoNjApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgcm9sZTogYXRoZW5hUXVlcnlSb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudmlyb25tZW50VmFycyxcbiAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnQXRoZW5hUXVlcnlGdW5jdGlvbi1Mb2dHcm91cCcsIHtcbiAgICAgICAgbG9nR3JvdXBOYW1lOiAnL2F3cy9sYW1iZGEvYXBwLW1vZGV4LWF0aGVuYS1xdWVyeScsXG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgfSksXG4gICAgICBsYXllcnM6IFtzaGFyZWRMYXllcl0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PSBURUFNIFdFSUdIVFMgTEFNQkRBIC0gREVESUNBVEVEIFJPTEUgPT09PT1cbiAgICBcbiAgICAvLyBDcmVhdGUgZGVkaWNhdGVkIHJvbGUgZm9yIHRlYW0gd2VpZ2h0cyBMYW1iZGEgd2l0aCBsZWFzdCBwcml2aWxlZ2UgcGVybWlzc2lvbnNcbiAgICBjb25zdCB0ZWFtV2VpZ2h0c1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1RlYW1XZWlnaHRzUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgcm9sZU5hbWU6ICdhcHAtbW9kZXgtdGVhbS13ZWlnaHRzLXJvbGUnLFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBMb2dzIHBlcm1pc3Npb25zXG4gICAgdGVhbVdlaWdodHNSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nR3JvdXAnLFxuICAgICAgICAnbG9nczpDcmVhdGVMb2dTdHJlYW0nLFxuICAgICAgICAnbG9nczpQdXRMb2dFdmVudHMnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmxvZ3M6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmxvZy1ncm91cDovYXdzL2xhbWJkYS9hcHAtbW9kZXgtdGVhbS13ZWlnaHRzOipgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gUzMgcGVybWlzc2lvbnMgZm9yIHJlYWRpbmcgYW5kIHdyaXRpbmcgdGVhbSB3ZWlnaHRzIGZpbGVzXG4gICAgdGVhbVdlaWdodHNSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICdzMzpQdXRPYmplY3QnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOnMzOjo6YXBwLW1vZGV4LWRhdGEtKmAsXG4gICAgICAgIGBhcm46YXdzOnMzOjo6YXBwLW1vZGV4LWRhdGEtKi8qYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIER5bmFtb0RCIHBlcm1pc3Npb25zIGZvciByZWFkaW5nIHRlYW0gZGF0YSBmcm9tIGRhdGEgc291cmNlcyB0YWJsZXNcbiAgICB0ZWFtV2VpZ2h0c1JvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6UXVlcnknLFxuICAgICAgICAnZHluYW1vZGI6U2NhbicsXG4gICAgICAgICdkeW5hbW9kYjpHZXRJdGVtJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvYXBwLW1vZGV4LWRhdGEtc291cmNlcy0qYCxcbiAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcC1tb2RleC1kYXRhLXNvdXJjZXMtKi9pbmRleC8qYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIER5bmFtb0RCIHBlcm1pc3Npb25zIGZvciB3cml0aW5nIHByb2Nlc3MgdHJhY2tpbmcgcmVjb3Jkc1xuICAgIHRlYW1XZWlnaHRzUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdkeW5hbW9kYjpQdXRJdGVtJyxcbiAgICAgICAgJ2R5bmFtb2RiOlVwZGF0ZUl0ZW0nXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS9hcHAtbW9kZXgtcHJvY2Vzcy0qYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIFN0ZXAgRnVuY3Rpb25zIHBlcm1pc3Npb25zIGZvciBzdGFydGluZyBza2lsbCBpbXBvcnRhbmNlIGV4ZWN1dGlvbnNcbiAgICB0ZWFtV2VpZ2h0c1JvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnc3RhdGVzOlN0YXJ0RXhlY3V0aW9uJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpzdGF0ZXM6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnN0YXRlTWFjaGluZTphcHAtbW9kZXgtc2tpbGwtaW1wb3J0YW5jZS0qYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIFRlYW0gV2VpZ2h0cyBMYW1iZGEgRnVuY3Rpb25cbiAgICBjb25zdCB0ZWFtV2VpZ2h0c0Z1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnVGVhbVdlaWdodHNGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ2FwcC1tb2RleC10ZWFtLXdlaWdodHMnLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9nbG9iYWwvdGVhbS13ZWlnaHRzJyksXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIHJvbGU6IHRlYW1XZWlnaHRzUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIC4uLmNvbW1vbkVudmlyb25tZW50VmFycyxcbiAgICAgICAgQVdTX0FDQ09VTlRfSUQ6IHRoaXMuYWNjb3VudCxcbiAgICAgICAgUkVHSU9OOiB0aGlzLnJlZ2lvblxuICAgICAgfSxcbiAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnVGVhbVdlaWdodHNGdW5jdGlvbi1Mb2dHcm91cCcsIHtcbiAgICAgICAgbG9nR3JvdXBOYW1lOiAnL2F3cy9sYW1iZGEvYXBwLW1vZGV4LXRlYW0td2VpZ2h0cycsXG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgfSksXG4gICAgICBsYXllcnM6IFtzaGFyZWRMYXllcl0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PSBTVEVQIEZVTkNUSU9OIEFQSSBMQU1CREEgLSBERURJQ0FURUQgUk9MRSA9PT09PVxuICAgIFxuICAgIC8vIENyZWF0ZSBkZWRpY2F0ZWQgcm9sZSBmb3Igc3RlcCBmdW5jdGlvbiBBUEkgTGFtYmRhIHdpdGggbGVhc3QgcHJpdmlsZWdlIHBlcm1pc3Npb25zXG4gICAgY29uc3Qgc3RlcEZ1bmN0aW9uQXBpUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnU3RlcEZ1bmN0aW9uQXBpUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgcm9sZU5hbWU6ICdhcHAtbW9kZXgtc3RlcC1mdW5jdGlvbi1hcGktcm9sZScsXG4gICAgfSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIExvZ3MgcGVybWlzc2lvbnNcbiAgICBzdGVwRnVuY3Rpb25BcGlSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nR3JvdXAnLFxuICAgICAgICAnbG9nczpDcmVhdGVMb2dTdHJlYW0nLFxuICAgICAgICAnbG9nczpQdXRMb2dFdmVudHMnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmxvZ3M6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmxvZy1ncm91cDovYXdzL2xhbWJkYS9hcHAtbW9kZXgtc3RlcC1mdW5jdGlvbi1hcGk6KmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBTdGVwIEZ1bmN0aW9ucyBwZXJtaXNzaW9ucyBmb3IgZGVzY3JpYmluZyBleGVjdXRpb25zIChwb2xsaW5nIHN0YXR1cylcbiAgICBzdGVwRnVuY3Rpb25BcGlSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3N0YXRlczpEZXNjcmliZUV4ZWN1dGlvbicsXG4gICAgICAgICdzdGF0ZXM6TGlzdEV4ZWN1dGlvbnMnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOnN0YXRlczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06ZXhlY3V0aW9uOmFwcC1tb2RleC0qOipgLFxuICAgICAgICBgYXJuOmF3czpzdGF0ZXM6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnN0YXRlTWFjaGluZTphcHAtbW9kZXgtKmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBEeW5hbW9EQiBwZXJtaXNzaW9ucyBmb3IgcHJvY2VzcyB0cmFja2luZyB0YWJsZXMgKHJlYWQvd3JpdGUgZm9yIHRyYWNraW5nKVxuICAgIHN0ZXBGdW5jdGlvbkFwaVJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICdkeW5hbW9kYjpQdXRJdGVtJyxcbiAgICAgICAgJ2R5bmFtb2RiOlVwZGF0ZUl0ZW0nLFxuICAgICAgICAnZHluYW1vZGI6UXVlcnknLFxuICAgICAgICAnZHluYW1vZGI6U2NhbidcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcC1tb2RleC1wcm9jZXNzLSpgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gU3RlcCBGdW5jdGlvbiBBUEkgTGFtYmRhIEZ1bmN0aW9uXG4gICAgY29uc3Qgc3RlcEZ1bmN0aW9uQXBpRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdTdGVwRnVuY3Rpb25BcGlGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ2FwcC1tb2RleC1zdGVwLWZ1bmN0aW9uLWFwaScsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL2dsb2JhbC9zdGVwLWZ1bmN0aW9uLWFwaScpLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICByb2xlOiBzdGVwRnVuY3Rpb25BcGlSb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudmlyb25tZW50VmFycyxcbiAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnU3RlcEZ1bmN0aW9uQXBpRnVuY3Rpb24tTG9nR3JvdXAnLCB7XG4gICAgICAgIGxvZ0dyb3VwTmFtZTogJy9hd3MvbGFtYmRhL2FwcC1tb2RleC1zdGVwLWZ1bmN0aW9uLWFwaScsXG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgfSksXG4gICAgICBsYXllcnM6IFtzaGFyZWRMYXllcl0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PSBFWFBPUlQgSU5JVElBVE9SIExBTUJEQSAtIERFRElDQVRFRCBST0xFID09PT09XG4gICAgXG4gICAgLy8gQ3JlYXRlIGRlZGljYXRlZCByb2xlIGZvciBleHBvcnQgaW5pdGlhdGlvbiAoUE9TVCAvZXhwb3J0KSB3aXRoIGxlYXN0IHByaXZpbGVnZSBwZXJtaXNzaW9uc1xuICAgIGNvbnN0IGV4cG9ydEluaXRpYXRvclJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0V4cG9ydEluaXRpYXRvclJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIHJvbGVOYW1lOiAnYXBwLW1vZGV4LWV4cG9ydC1pbml0aWF0b3Itcm9sZScsXG4gICAgfSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIExvZ3MgcGVybWlzc2lvbnNcbiAgICBleHBvcnRJbml0aWF0b3JSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nR3JvdXAnLFxuICAgICAgICAnbG9nczpDcmVhdGVMb2dTdHJlYW0nLFxuICAgICAgICAnbG9nczpQdXRMb2dFdmVudHMnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmxvZ3M6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmxvZy1ncm91cDovYXdzL2xhbWJkYS9hcHAtbW9kZXgtZXhwb3J0LWluaXRpYXRvcjoqYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIER5bmFtb0RCIHBlcm1pc3Npb25zIGZvciBleHBvcnQgaGlzdG9yeSB0YWJsZSAod3JpdGUgb3BlcmF0aW9ucyBvbmx5KVxuICAgIGV4cG9ydEluaXRpYXRvclJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6UHV0SXRlbScsXG4gICAgICAgICdkeW5hbW9kYjpVcGRhdGVJdGVtJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvYXBwLW1vZGV4LWV4cG9ydC1oaXN0b3J5YCxcbiAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcC1tb2RleC1leHBvcnQtaGlzdG9yeS9pbmRleC8qYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIER5bmFtb0RCIHBlcm1pc3Npb25zIGZvciBwcm9qZWN0cyB0YWJsZSAocmVhZC1vbmx5IHRvIGdldCBwcm9qZWN0IG5hbWVzKVxuICAgIGV4cG9ydEluaXRpYXRvclJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6R2V0SXRlbSdcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgcHJvamVjdHNUYWJsZUFyblxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIFN0ZXAgRnVuY3Rpb25zIHBlcm1pc3Npb25zIHRvIHN0YXJ0IGV4ZWN1dGlvbnMgZm9yIHByb2plY3Qtc3BlY2lmaWMgZXhwb3J0IHN0ZXAgZnVuY3Rpb25zXG4gICAgZXhwb3J0SW5pdGlhdG9yUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdzdGF0ZXM6U3RhcnRFeGVjdXRpb24nXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOnN0YXRlczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06c3RhdGVNYWNoaW5lOmFwcC1tb2RleC1leHBvcnQtKmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBFeHBvcnQgSW5pdGlhdG9yIExhbWJkYSBGdW5jdGlvblxuICAgIGNvbnN0IGV4cG9ydEluaXRpYXRvckZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnRXhwb3J0SW5pdGlhdG9yRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6ICdhcHAtbW9kZXgtZXhwb3J0LWluaXRpYXRvcicsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL2dsb2JhbC9leHBvcnQtaW5pdGlhdG9yJyksXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIHJvbGU6IGV4cG9ydEluaXRpYXRvclJvbGUsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52aXJvbm1lbnRWYXJzLFxuICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdFeHBvcnRJbml0aWF0b3JGdW5jdGlvbi1Mb2dHcm91cCcsIHtcbiAgICAgICAgbG9nR3JvdXBOYW1lOiAnL2F3cy9sYW1iZGEvYXBwLW1vZGV4LWV4cG9ydC1pbml0aWF0b3InLFxuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIH0pLFxuICAgICAgbGF5ZXJzOiBbc2hhcmVkTGF5ZXJdLFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT0gRVhQT1JUIFJFQURFUiBMQU1CREEgLSBERURJQ0FURUQgUk9MRSA9PT09PVxuICAgIFxuICAgIC8vIENyZWF0ZSBkZWRpY2F0ZWQgcm9sZSBmb3IgZXhwb3J0IHJlYWRpbmcgYW5kIGRvd25sb2FkaW5nIChHRVQgL2V4cG9ydCopIHdpdGggbGVhc3QgcHJpdmlsZWdlIHBlcm1pc3Npb25zXG4gICAgY29uc3QgZXhwb3J0UmVhZGVyUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnRXhwb3J0UmVhZGVyUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgcm9sZU5hbWU6ICdhcHAtbW9kZXgtZXhwb3J0LXJlYWRlci1yb2xlJyxcbiAgICB9KTtcblxuICAgIC8vIENsb3VkV2F0Y2ggTG9ncyBwZXJtaXNzaW9uc1xuICAgIGV4cG9ydFJlYWRlclJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnbG9nczpDcmVhdGVMb2dHcm91cCcsXG4gICAgICAgICdsb2dzOkNyZWF0ZUxvZ1N0cmVhbScsXG4gICAgICAgICdsb2dzOlB1dExvZ0V2ZW50cydcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6bG9nczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06bG9nLWdyb3VwOi9hd3MvbGFtYmRhL2FwcC1tb2RleC1leHBvcnQtcmVhZGVyOipgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gRHluYW1vREIgcGVybWlzc2lvbnMgZm9yIGV4cG9ydCBoaXN0b3J5IHRhYmxlIChyZWFkIGFuZCBxdWVyeSBvcGVyYXRpb25zKVxuICAgIGV4cG9ydFJlYWRlclJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICdkeW5hbW9kYjpRdWVyeSdcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcC1tb2RleC1leHBvcnQtaGlzdG9yeWAsXG4gICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS9hcHAtbW9kZXgtZXhwb3J0LWhpc3RvcnkvaW5kZXgvKmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBEeW5hbW9EQiBwZXJtaXNzaW9ucyBmb3IgdXBkYXRpbmcgZG93bmxvYWQgbWV0YWRhdGEgKFVwZGF0ZUl0ZW0gb25seSBmb3IgZG93bmxvYWQgdHJhY2tpbmcpXG4gICAgZXhwb3J0UmVhZGVyUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdkeW5hbW9kYjpVcGRhdGVJdGVtJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvYXBwLW1vZGV4LWV4cG9ydC1oaXN0b3J5YFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIFMzIHBlcm1pc3Npb25zIGZvciBnZW5lcmF0aW5nIHNpZ25lZCBVUkxzIG9uIHByb2plY3QgZGF0YSBidWNrZXRzIChyZWFkLW9ubHkpXG4gICAgZXhwb3J0UmVhZGVyUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdzMzpHZXRPYmplY3QnLFxuICAgICAgICAnczM6TGlzdEJ1Y2tldCdcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6czM6OjphcHAtbW9kZXgtZGF0YS0qYCxcbiAgICAgICAgYGFybjphd3M6czM6OjphcHAtbW9kZXgtZGF0YS0qLypgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gRXhwb3J0IFJlYWRlciBMYW1iZGEgRnVuY3Rpb25cbiAgICBjb25zdCBleHBvcnRSZWFkZXJGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0V4cG9ydFJlYWRlckZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiAnYXBwLW1vZGV4LWV4cG9ydC1yZWFkZXInLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9nbG9iYWwvZXhwb3J0LXJlYWRlcicpLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICByb2xlOiBleHBvcnRSZWFkZXJSb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudmlyb25tZW50VmFycyxcbiAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnRXhwb3J0UmVhZGVyRnVuY3Rpb24tTG9nR3JvdXAnLCB7XG4gICAgICAgIGxvZ0dyb3VwTmFtZTogJy9hd3MvbGFtYmRhL2FwcC1tb2RleC1leHBvcnQtcmVhZGVyJyxcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICB9KSxcbiAgICAgIGxheWVyczogW3NoYXJlZExheWVyXSxcbiAgICB9KTtcblxuICAgIC8vIEF1dG9tYXRpb24gU3RhdHVzIExhbWJkYSBSb2xlXG4gICAgY29uc3QgYXV0b21hdGlvblN0YXR1c1JvbGUgPSByb2xlTWFuYWdlci5jcmVhdGVMYW1iZGFSb2xlKCdBdXRvbWF0aW9uU3RhdHVzUm9sZScsICdhcHAtbW9kZXgtYXV0b21hdGlvbi1zdGF0dXMnKTtcbiAgICBwcm9qZWN0c1RhYmxlLmdyYW50UmVhZERhdGEoYXV0b21hdGlvblN0YXR1c1JvbGUpO1xuICAgIGF1dG9tYXRpb25TdGF0dXNSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFsnY29kZWJ1aWxkOkJhdGNoR2V0QnVpbGRzJ10sXG4gICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpjb2RlYnVpbGQ6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnByb2plY3QvYXBwLW1vZGV4LSpgXVxuICAgIH0pKTtcblxuICAgIC8vIEF1dG9tYXRpb24gU3RhdHVzIExhbWJkYSBGdW5jdGlvblxuICAgIGNvbnN0IGF1dG9tYXRpb25TdGF0dXNGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0F1dG9tYXRpb25TdGF0dXNGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ2FwcC1tb2RleC1hdXRvbWF0aW9uLXN0YXR1cycsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL2dsb2JhbC9hdXRvbWF0aW9uLXN0YXR1cycpLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICByb2xlOiBhdXRvbWF0aW9uU3RhdHVzUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnZpcm9ubWVudFZhcnMsXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0F1dG9tYXRpb25TdGF0dXNGdW5jdGlvbi1Mb2dHcm91cCcsIHtcbiAgICAgICAgbG9nR3JvdXBOYW1lOiAnL2F3cy9sYW1iZGEvYXBwLW1vZGV4LWF1dG9tYXRpb24tc3RhdHVzJyxcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICB9KSxcbiAgICAgIGxheWVyczogW3NoYXJlZExheWVyXSxcbiAgICB9KTtcblxuICAgIC8vID09PT09IFBST1ZJU0lPTklORyBMQU1CREEgLSBERURJQ0FURUQgUk9MRSA9PT09PVxuICAgIFxuICAgIC8vIENyZWF0ZSBkZWRpY2F0ZWQgcm9sZSBmb3IgcHJvdmlzaW9uaW5nIExhbWJkYSB3aXRoIGxlYXN0IHByaXZpbGVnZSBwZXJtaXNzaW9uc1xuICAgIGNvbnN0IHByb3Zpc2lvbmluZ1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1Byb3Zpc2lvbmluZ1JvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIHJvbGVOYW1lOiAnYXBwLW1vZGV4LXByb3Zpc2lvbmluZy1yb2xlJyxcbiAgICB9KTtcblxuICAgIC8vIENsb3VkV2F0Y2ggTG9ncyBwZXJtaXNzaW9uc1xuICAgIHByb3Zpc2lvbmluZ1JvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnbG9nczpDcmVhdGVMb2dHcm91cCcsXG4gICAgICAgICdsb2dzOkNyZWF0ZUxvZ1N0cmVhbScsXG4gICAgICAgICdsb2dzOlB1dExvZ0V2ZW50cydcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6bG9nczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06bG9nLWdyb3VwOi9hd3MvbGFtYmRhL2FwcC1tb2RleC1wcm92aXNpb25pbmc6KmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBEeW5hbW9EQiBwZXJtaXNzaW9ucyBmb3IgcHJvamVjdHMgdGFibGVcbiAgICBwcm92aXNpb25pbmdSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2R5bmFtb2RiOkdldEl0ZW0nLFxuICAgICAgICAnZHluYW1vZGI6VXBkYXRlSXRlbSdcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgcHJvamVjdHNUYWJsZUFyblxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIENvZGVCdWlsZCBwZXJtaXNzaW9ucyB0byBzdGFydCBidWlsZHMgYW5kIGdldCBidWlsZCBzdGF0dXNcbiAgICBwcm92aXNpb25pbmdSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2NvZGVidWlsZDpTdGFydEJ1aWxkJyxcbiAgICAgICAgJ2NvZGVidWlsZDpCYXRjaEdldEJ1aWxkcydcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6Y29kZWJ1aWxkOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpwcm9qZWN0L2FwcC1tb2RleC1wcm9qZWN0LXByb3Zpc2lvbmluZ2BcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBDbG91ZEZvcm1hdGlvbiBwZXJtaXNzaW9ucyB0byBjaGVjayBzdGFjayBzdGF0dXNcbiAgICBwcm92aXNpb25pbmdSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlc2NyaWJlU3RhY2tzJyxcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlc2NyaWJlU3RhY2tFdmVudHMnLFxuICAgICAgICAnY2xvdWRmb3JtYXRpb246R2V0U3RhY2tQb2xpY3knXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmNsb3VkZm9ybWF0aW9uOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpzdGFjay9BcHAtTW9kRXgtUHJvamVjdC0qLypgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gUzMgcGVybWlzc2lvbnMgdG8gcmVhZCBkZXBsb3ltZW50IGJ1Y2tldFxuICAgIHByb3Zpc2lvbmluZ1JvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnczM6R2V0T2JqZWN0JyxcbiAgICAgICAgJ3MzOkxpc3RCdWNrZXQnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGRlcGxveW1lbnRCdWNrZXRBcm4sXG4gICAgICAgIGAke2RlcGxveW1lbnRCdWNrZXRBcm59LypgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gU1FTIHBlcm1pc3Npb25zIHRvIHJlY2VpdmUgbWVzc2FnZXMgZnJvbSBwcm9qZWN0IG9wZXJhdGlvbnMgcXVldWVcbiAgICBwcm92aXNpb25pbmdSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3NxczpSZWNlaXZlTWVzc2FnZScsXG4gICAgICAgICdzcXM6RGVsZXRlTWVzc2FnZScsXG4gICAgICAgICdzcXM6R2V0UXVldWVBdHRyaWJ1dGVzJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICB0aGlzLnByb2plY3RPcGVyYXRpb25zUXVldWUucXVldWVBcm5cbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBTZWNyZXRzIE1hbmFnZXIgcGVybWlzc2lvbnMgdG8gcmVhZCBhcHAgY29uZmlndXJhdGlvblxuICAgIHByb3Zpc2lvbmluZ1JvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogWydzZWNyZXRzbWFuYWdlcjpHZXRTZWNyZXRWYWx1ZSddLFxuICAgICAgcmVzb3VyY2VzOiBbYXBwQ29uZmlnU2VjcmV0QXJuXVxuICAgIH0pKTtcblxuICAgIC8vIFByb3Zpc2lvbmluZyBMYW1iZGEgRnVuY3Rpb25cbiAgICBjb25zdCBwcm92aXNpb25pbmdGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1Byb3Zpc2lvbmluZ0Z1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiAnYXBwLW1vZGV4LXByb3Zpc2lvbmluZycsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL2dsb2JhbC9wcm92aXNpb25pbmcnKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoNjApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgcm9sZTogcHJvdmlzaW9uaW5nUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnZpcm9ubWVudFZhcnMsXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1Byb3Zpc2lvbmluZ0Z1bmN0aW9uLUxvZ0dyb3VwJywge1xuICAgICAgICBsb2dHcm91cE5hbWU6ICcvYXdzL2xhbWJkYS9hcHAtbW9kZXgtcHJvdmlzaW9uaW5nJyxcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICB9KSxcbiAgICAgIGxheWVyczogW3NoYXJlZExheWVyXSxcbiAgICB9KTtcblxuICAgIC8vIENvbm5lY3QgcHJvdmlzaW9uaW5nIExhbWJkYSB0byBwcm9qZWN0IG9wZXJhdGlvbnMgcXVldWVcbiAgICBwcm92aXNpb25pbmdGdW5jdGlvbi5hZGRFdmVudFNvdXJjZShcbiAgICAgIG5ldyBsYW1iZGFFdmVudFNvdXJjZXMuU3FzRXZlbnRTb3VyY2UodGhpcy5wcm9qZWN0T3BlcmF0aW9uc1F1ZXVlLCB7XG4gICAgICAgIGJhdGNoU2l6ZTogMSxcbiAgICAgICAgbWF4Q29uY3VycmVuY3k6IDIsXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyA9PT09PSBCVUlMRCBNT05JVE9SIExBTUJEQSAtIERFRElDQVRFRCBST0xFID09PT09XG4gICAgXG4gICAgLy8gQ3JlYXRlIGRlZGljYXRlZCByb2xlIGZvciBidWlsZCBtb25pdG9yIExhbWJkYSB3aXRoIGxlYXN0IHByaXZpbGVnZSBwZXJtaXNzaW9uc1xuICAgIGNvbnN0IGJ1aWxkTW9uaXRvclJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0J1aWxkTW9uaXRvclJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIHJvbGVOYW1lOiAnYXBwLW1vZGV4LWJ1aWxkLW1vbml0b3Itcm9sZScsXG4gICAgfSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIExvZ3MgcGVybWlzc2lvbnNcbiAgICBidWlsZE1vbml0b3JSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nR3JvdXAnLFxuICAgICAgICAnbG9nczpDcmVhdGVMb2dTdHJlYW0nLFxuICAgICAgICAnbG9nczpQdXRMb2dFdmVudHMnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmxvZ3M6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmxvZy1ncm91cDovYXdzL2xhbWJkYS9hcHAtbW9kZXgtYnVpbGQtbW9uaXRvcjoqYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIER5bmFtb0RCIHBlcm1pc3Npb25zIGZvciBwcm9qZWN0cyBhbmQgcHJvamVjdCBkYXRhIHRhYmxlc1xuICAgIGJ1aWxkTW9uaXRvclJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6VXBkYXRlSXRlbScsXG4gICAgICAgICdkeW5hbW9kYjpEZWxldGVJdGVtJyxcbiAgICAgICAgJ2R5bmFtb2RiOlF1ZXJ5JyxcbiAgICAgICAgJ2R5bmFtb2RiOkJhdGNoV3JpdGVJdGVtJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBwcm9qZWN0c1RhYmxlQXJuLFxuICAgICAgICBwcm9qZWN0RGF0YVRhYmxlQXJuXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gQnVpbGQgTW9uaXRvciBMYW1iZGEgRnVuY3Rpb25cbiAgICBjb25zdCBidWlsZE1vbml0b3JGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0J1aWxkTW9uaXRvckZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiAnYXBwLW1vZGV4LWJ1aWxkLW1vbml0b3InLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9nbG9iYWwvYnVpbGQtbW9uaXRvcicpLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICByb2xlOiBidWlsZE1vbml0b3JSb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudmlyb25tZW50VmFycyxcbiAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnQnVpbGRNb25pdG9yRnVuY3Rpb24tTG9nR3JvdXAnLCB7XG4gICAgICAgIGxvZ0dyb3VwTmFtZTogJy9hd3MvbGFtYmRhL2FwcC1tb2RleC1idWlsZC1tb25pdG9yJyxcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICB9KSxcbiAgICAgIGxheWVyczogW3NoYXJlZExheWVyXSxcbiAgICB9KTtcbiAgICBcbiAgICAvLyBETFEgZm9yIGFzeW5jIExhbWJkYSBpbnZvY2F0aW9ucyAoRXZlbnRCcmlkZ2UpXG4gICAgY29uc3QgYXN5bmNJbnZvY2F0aW9uRExRID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnQXN5bmNJbnZvY2F0aW9uRExRJywge1xuICAgICAgcXVldWVOYW1lOiAnYXBwLW1vZGV4LWFzeW5jLWludm9jYXRpb24tZGxxJyxcbiAgICAgIHJldGVudGlvblBlcmlvZDogRHVyYXRpb24uZGF5cygxNCksXG4gICAgICBlbmNyeXB0aW9uOiBzcXMuUXVldWVFbmNyeXB0aW9uLlNRU19NQU5BR0VELFxuICAgIH0pO1xuICAgIFxuICAgIGNkay5UYWdzLm9mKGFzeW5jSW52b2NhdGlvbkRMUSkuYWRkKCdPd25lcicsICdwbGF0Zm9ybS10ZWFtJyk7XG4gICAgY2RrLlRhZ3Mub2YoYXN5bmNJbnZvY2F0aW9uRExRKS5hZGQoJ1B1cnBvc2UnLCAnQXN5bmMgTGFtYmRhIGludm9jYXRpb24gZmFpbHVyZSBoYW5kbGluZycpO1xuICAgIFxuICAgIC8vIENvbmZpZ3VyZSBvbi1mYWlsdXJlIGRlc3RpbmF0aW9uIGZvciBidWlsZE1vbml0b3JGdW5jdGlvblxuICAgIGJ1aWxkTW9uaXRvckZ1bmN0aW9uLmNvbmZpZ3VyZUFzeW5jSW52b2tlKHtcbiAgICAgIG9uRmFpbHVyZTogbmV3IGxhbWJkYURlc3RpbmF0aW9ucy5TcXNEZXN0aW5hdGlvbihhc3luY0ludm9jYXRpb25ETFEpLFxuICAgICAgbWF4RXZlbnRBZ2U6IER1cmF0aW9uLmhvdXJzKDYpLFxuICAgICAgcmV0cnlBdHRlbXB0czogMixcbiAgICB9KTtcblxuICAgIC8vID09PT09IEZJTEUgT1BFUkFUSU9OUyBMQU1CREEgLSBERURJQ0FURUQgUk9MRSA9PT09PVxuICAgIFxuICAgIC8vIENyZWF0ZSBkZWRpY2F0ZWQgcm9sZSBmb3IgZmlsZSBvcGVyYXRpb25zIExhbWJkYSB3aXRoIGxlYXN0IHByaXZpbGVnZSBwZXJtaXNzaW9uc1xuICAgIGNvbnN0IGZpbGVPcGVyYXRpb25zUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnRmlsZU9wZXJhdGlvbnNSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICByb2xlTmFtZTogJ2FwcC1tb2RleC1maWxlLW9wZXJhdGlvbnMtcm9sZScsXG4gICAgfSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIExvZ3MgcGVybWlzc2lvbnNcbiAgICBmaWxlT3BlcmF0aW9uc1JvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnbG9nczpDcmVhdGVMb2dHcm91cCcsXG4gICAgICAgICdsb2dzOkNyZWF0ZUxvZ1N0cmVhbScsXG4gICAgICAgICdsb2dzOlB1dExvZ0V2ZW50cydcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6bG9nczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06bG9nLWdyb3VwOi9hd3MvbGFtYmRhL2FwcC1tb2RleC1maWxlLW9wZXJhdGlvbnM6KmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBTMyBwZXJtaXNzaW9ucyBmb3IgZmlsZSBkZWxldGlvbiBhbmQgcmV0cmlldmFsXG4gICAgZmlsZU9wZXJhdGlvbnNSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICdzMzpEZWxldGVPYmplY3QnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOnMzOjo6YXBwLW1vZGV4LWRhdGEtKmAsXG4gICAgICAgIGBhcm46YXdzOnMzOjo6YXBwLW1vZGV4LWRhdGEtKi8qYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIER5bmFtb0RCIHBlcm1pc3Npb25zIGZvciBkYXRhIHNvdXJjZXMgdGFibGUgKHJlYWQgYW5kIGRlbGV0ZSlcbiAgICBmaWxlT3BlcmF0aW9uc1JvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICdkeW5hbW9kYjpEZWxldGVJdGVtJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvYXBwLW1vZGV4LWRhdGEtc291cmNlcy0qYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIER5bmFtb0RCIHBlcm1pc3Npb25zIGZvciBwcm9jZXNzIHRyYWNraW5nIHRhYmxlICh3cml0ZSBwcm9jZXNzIHJlY29yZHMpXG4gICAgZmlsZU9wZXJhdGlvbnNSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxuICAgICAgICAnZHluYW1vZGI6VXBkYXRlSXRlbSdcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcC1tb2RleC1wcm9jZXNzLSpgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gRmlsZSBPcGVyYXRpb25zIExhbWJkYSBGdW5jdGlvblxuICAgIGNvbnN0IGZpbGVPcGVyYXRpb25zRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdGaWxlT3BlcmF0aW9uc0Z1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiAnYXBwLW1vZGV4LWZpbGUtb3BlcmF0aW9ucycsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL2dsb2JhbC9maWxlLW9wZXJhdGlvbnMnKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgcm9sZTogZmlsZU9wZXJhdGlvbnNSb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudmlyb25tZW50VmFycyxcbiAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnRmlsZU9wZXJhdGlvbnNGdW5jdGlvbi1Mb2dHcm91cCcsIHtcbiAgICAgICAgbG9nR3JvdXBOYW1lOiAnL2F3cy9sYW1iZGEvYXBwLW1vZGV4LWZpbGUtb3BlcmF0aW9ucycsXG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgfSksXG4gICAgICBsYXllcnM6IFtzaGFyZWRMYXllcl0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PSBEQVRBIFNPVVJDRVMgTEFNQkRBIC0gREVESUNBVEVEIFJPTEUgPT09PT1cbiAgICBcbiAgICAvLyBDcmVhdGUgZGVkaWNhdGVkIHJvbGUgZm9yIGRhdGEgc291cmNlcyBMYW1iZGEgd2l0aCBsZWFzdCBwcml2aWxlZ2UgcGVybWlzc2lvbnNcbiAgICBjb25zdCBkYXRhU291cmNlc1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0RhdGFTb3VyY2VzUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgcm9sZU5hbWU6ICdhcHAtbW9kZXgtZGF0YS1zb3VyY2VzLXJvbGUnLFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBMb2dzIHBlcm1pc3Npb25zXG4gICAgZGF0YVNvdXJjZXNSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nR3JvdXAnLFxuICAgICAgICAnbG9nczpDcmVhdGVMb2dTdHJlYW0nLFxuICAgICAgICAnbG9nczpQdXRMb2dFdmVudHMnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmxvZ3M6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmxvZy1ncm91cDovYXdzL2xhbWJkYS9hcHAtbW9kZXgtZGF0YS1zb3VyY2VzOipgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gRHluYW1vREIgcGVybWlzc2lvbnMgZm9yIHByb2plY3Qtc3BlY2lmaWMgZGF0YSBzb3VyY2VzIHRhYmxlc1xuICAgIGRhdGFTb3VyY2VzUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdkeW5hbW9kYjpRdWVyeScsXG4gICAgICAgICdkeW5hbW9kYjpTY2FuJyxcbiAgICAgICAgJ2R5bmFtb2RiOkdldEl0ZW0nLFxuICAgICAgICAnZHluYW1vZGI6UHV0SXRlbScsXG4gICAgICAgICdkeW5hbW9kYjpVcGRhdGVJdGVtJyxcbiAgICAgICAgJ2R5bmFtb2RiOkRlbGV0ZUl0ZW0nXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS9hcHAtbW9kZXgtZGF0YS1zb3VyY2VzLSpgLFxuICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvYXBwLW1vZGV4LWRhdGEtc291cmNlcy0qL2luZGV4LypgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gRGF0YSBTb3VyY2VzIExhbWJkYSBGdW5jdGlvblxuICAgIGNvbnN0IGRhdGFTb3VyY2VzRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdEYXRhU291cmNlc0Z1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiAnYXBwLW1vZGV4LWRhdGEtc291cmNlcycsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL2dsb2JhbC9kYXRhLXNvdXJjZXMnKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgcm9sZTogZGF0YVNvdXJjZXNSb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudmlyb25tZW50VmFycyxcbiAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnRGF0YVNvdXJjZXNGdW5jdGlvbi1Mb2dHcm91cCcsIHtcbiAgICAgICAgbG9nR3JvdXBOYW1lOiAnL2F3cy9sYW1iZGEvYXBwLW1vZGV4LWRhdGEtc291cmNlcycsXG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgfSksXG4gICAgICBsYXllcnM6IFtzaGFyZWRMYXllcl0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PSBGSUxFIFVQTE9BRCBMQU1CREEgLSBERURJQ0FURUQgUk9MRSA9PT09PVxuICAgIFxuICAgIC8vIENyZWF0ZSBkZWRpY2F0ZWQgcm9sZSBmb3IgZmlsZSB1cGxvYWQgTGFtYmRhIHdpdGggbGVhc3QgcHJpdmlsZWdlIHBlcm1pc3Npb25zXG4gICAgY29uc3QgZmlsZVVwbG9hZFJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0ZpbGVVcGxvYWRSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICByb2xlTmFtZTogJ2FwcC1tb2RleC1maWxlLXVwbG9hZC1yb2xlJyxcbiAgICB9KTtcblxuICAgIC8vIENsb3VkV2F0Y2ggTG9ncyBwZXJtaXNzaW9uc1xuICAgIGZpbGVVcGxvYWRSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nR3JvdXAnLFxuICAgICAgICAnbG9nczpDcmVhdGVMb2dTdHJlYW0nLFxuICAgICAgICAnbG9nczpQdXRMb2dFdmVudHMnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmxvZ3M6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmxvZy1ncm91cDovYXdzL2xhbWJkYS9hcHAtbW9kZXgtZmlsZS11cGxvYWQ6KmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBEeW5hbW9EQiBwZXJtaXNzaW9ucyBmb3IgcHJvamVjdHMgdGFibGUgKHJlYWQtb25seSBmb3IgcGVybWlzc2lvbiBjaGVja3MpXG4gICAgZmlsZVVwbG9hZFJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6R2V0SXRlbSdcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgcHJvamVjdHNUYWJsZUFyblxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIER5bmFtb0RCIHBlcm1pc3Npb25zIGZvciBwcm9qZWN0LXNwZWNpZmljIHByb2Nlc3MgdGFibGVzXG4gICAgZmlsZVVwbG9hZFJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6UHV0SXRlbScsXG4gICAgICAgICdkeW5hbW9kYjpVcGRhdGVJdGVtJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvYXBwLW1vZGV4LXByb2Nlc3MtKmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBEeW5hbW9EQiBwZXJtaXNzaW9ucyBmb3IgcHJvamVjdC1zcGVjaWZpYyBkYXRhIHNvdXJjZXMgdGFibGVzXG4gICAgZmlsZVVwbG9hZFJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6UHV0SXRlbSdcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcC1tb2RleC1kYXRhLXNvdXJjZXMtKmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBTMyBwZXJtaXNzaW9ucyBmb3IgcHJvamVjdCBkYXRhIGJ1Y2tldHNcbiAgICBmaWxlVXBsb2FkUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdzMzpQdXRPYmplY3QnLFxuICAgICAgICAnczM6R2V0T2JqZWN0J1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpzMzo6OmFwcC1tb2RleC1kYXRhLSpgLFxuICAgICAgICBgYXJuOmF3czpzMzo6OmFwcC1tb2RleC1kYXRhLSovKmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBTUVMgcGVybWlzc2lvbnMgZm9yIHByb2plY3Qtc3BlY2lmaWMgZGF0YSBwcm9jZXNzaW5nIHF1ZXVlc1xuICAgIGZpbGVVcGxvYWRSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3NxczpTZW5kTWVzc2FnZScsXG4gICAgICAgICdzcXM6R2V0UXVldWVVcmwnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOnNxczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06YXBwLW1vZGV4LWRhdGEtKmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBGaWxlIFVwbG9hZCBMYW1iZGEgRnVuY3Rpb25cbiAgICBjb25zdCBmaWxlVXBsb2FkRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdGaWxlVXBsb2FkRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6ICdhcHAtbW9kZXgtZmlsZS11cGxvYWQnLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9nbG9iYWwvZmlsZS11cGxvYWQnKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgcm9sZTogZmlsZVVwbG9hZFJvbGUsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52aXJvbm1lbnRWYXJzLFxuICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdGaWxlVXBsb2FkRnVuY3Rpb24tTG9nR3JvdXAnLCB7XG4gICAgICAgIGxvZ0dyb3VwTmFtZTogJy9hd3MvbGFtYmRhL2FwcC1tb2RleC1maWxlLXVwbG9hZCcsXG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgfSksXG4gICAgICBsYXllcnM6IFtzaGFyZWRMYXllcl0sXG4gICAgfSk7XG5cbiAgICAvLyBDb21wYXJlIHdpdGggQXRoZW5hIExhbWJkYSBSb2xlXG4gICAgY29uc3QgY29tcGFyZVdpdGhBdGhlbmFSb2xlID0gcm9sZU1hbmFnZXIuY3JlYXRlTGFtYmRhUm9sZSgnQ29tcGFyZVdpdGhBdGhlbmFSb2xlJywgJ2FwcC1tb2RleC1jb21wYXJlLXdpdGgtYXRoZW5hJyk7XG4gICAgY29tcGFyZVdpdGhBdGhlbmFSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFsnYXRoZW5hOlN0YXJ0UXVlcnlFeGVjdXRpb24nLCAnYXRoZW5hOkdldFF1ZXJ5RXhlY3V0aW9uJywgJ2F0aGVuYTpHZXRRdWVyeVJlc3VsdHMnXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmF0aGVuYToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06d29ya2dyb3VwL2FwcC1tb2RleC0qYF1cbiAgICB9KSk7XG4gICAgY29tcGFyZVdpdGhBdGhlbmFSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFsnczM6R2V0T2JqZWN0JywgJ3MzOlB1dE9iamVjdCddLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6czM6OjphcHAtbW9kZXgtcmVzdWx0cy0qLypgXVxuICAgIH0pKTtcblxuICAgIC8vIENvbXBhcmUgd2l0aCBBdGhlbmEgTGFtYmRhIEZ1bmN0aW9uXG4gICAgY29uc3QgY29tcGFyZVdpdGhBdGhlbmFGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0NvbXBhcmVXaXRoQXRoZW5hRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6ICdhcHAtbW9kZXgtY29tcGFyZS13aXRoLWF0aGVuYScsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL2dsb2JhbC9jb21wYXJlLXdpdGgtYXRoZW5hJyksXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDYwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIHJvbGU6IGNvbXBhcmVXaXRoQXRoZW5hUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnZpcm9ubWVudFZhcnMsXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0NvbXBhcmVXaXRoQXRoZW5hRnVuY3Rpb24tTG9nR3JvdXAnLCB7XG4gICAgICAgIGxvZ0dyb3VwTmFtZTogJy9hd3MvbGFtYmRhL2FwcC1tb2RleC1jb21wYXJlLXdpdGgtYXRoZW5hJyxcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICB9KSxcbiAgICAgIGxheWVyczogW3NoYXJlZExheWVyXSxcbiAgICB9KTtcblxuICAgIC8vID09PT09IE5FVyBOT1JNQUxJWkFUSU9OIExBTUJEQSBGVU5DVElPTlMgVjIgPT09PT1cbiAgICBcbiAgICAvLyBEZWFkIExldHRlciBRdWV1ZSBmb3Igbm9ybWFsaXphdGlvbiB3b3JrZmxvd1xuICAgIGNvbnN0IG5vcm1hbGl6YXRpb25ETFEgPSBuZXcgc3FzLlF1ZXVlKHRoaXMsICdOb3JtYWxpemF0aW9uRExRJywge1xuICAgICAgcXVldWVOYW1lOiBgYXBwLW1vZGV4LW5vcm1hbGl6YXRpb24tZGxxYCxcbiAgICAgIHJldGVudGlvblBlcmlvZDogRHVyYXRpb24uZGF5cygxNCksXG4gICAgICBlbmNyeXB0aW9uOiBzcXMuUXVldWVFbmNyeXB0aW9uLlNRU19NQU5BR0VELFxuICAgICAgdmlzaWJpbGl0eVRpbWVvdXQ6IER1cmF0aW9uLm1pbnV0ZXMoMzApLCAvLyBNdXN0IGJlID49IDZ4IExhbWJkYSB0aW1lb3V0ICg1IG1pbiAqIDYgPSAzMCBtaW4pXG4gICAgfSk7XG5cbiAgICAvLyBTTlMgdG9waWMgZm9yIG5vcm1hbGl6YXRpb24gYWxlcnRzXG4gICAgY29uc3Qgbm9ybWFsaXphdGlvbkFsZXJ0VG9waWMgPSBuZXcgc25zLlRvcGljKHRoaXMsICdOb3JtYWxpemF0aW9uQWxlcnRUb3BpYycsIHtcbiAgICAgIHRvcGljTmFtZTogYGFwcC1tb2RleC1ub3JtYWxpemF0aW9uLWFsZXJ0c2AsXG4gICAgICBkaXNwbGF5TmFtZTogJ0FwcE1vZEV4IE5vcm1hbGl6YXRpb24gQWxlcnRzJ1xuICAgIH0pO1xuXG4gICAgLy8gMS4gQmF0Y2ggRXh0cmFjdG9yIExhbWJkYVxuICAgIGNvbnN0IGJhdGNoRXh0cmFjdG9yUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnQmF0Y2hFeHRyYWN0b3JSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICByb2xlTmFtZTogJ2FwcC1tb2RleC1iYXRjaC1leHRyYWN0b3Itcm9sZScsXG4gICAgfSk7XG5cbiAgICBiYXRjaEV4dHJhY3RvclJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogWydsb2dzOkNyZWF0ZUxvZ0dyb3VwJywgJ2xvZ3M6Q3JlYXRlTG9nU3RyZWFtJywgJ2xvZ3M6UHV0TG9nRXZlbnRzJ10sXG4gICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpsb2dzOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpsb2ctZ3JvdXA6L2F3cy9sYW1iZGEvYXBwLW1vZGV4LWJhdGNoLWV4dHJhY3RvcjoqYF1cbiAgICB9KSk7XG5cbiAgICBiYXRjaEV4dHJhY3RvclJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogWydzMzpHZXRPYmplY3QnXSxcbiAgICAgIHJlc291cmNlczogWydhcm46YXdzOnMzOjo6YXBwLW1vZGV4LWRhdGEtKi9kYXRhLXByb2Nlc3NlZC9hcHBsaWNhdGlvbnMtdGVjaC1zdGFjay8qJ11cbiAgICB9KSk7XG5cbiAgICBjb25zdCBiYXRjaEV4dHJhY3RvckZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQmF0Y2hFeHRyYWN0b3JGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ2FwcC1tb2RleC1iYXRjaC1leHRyYWN0b3InLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9nbG9iYWwvYmF0Y2gtZXh0cmFjdG9yJyksXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDYwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIHJvbGU6IGJhdGNoRXh0cmFjdG9yUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiBjb21tb25FbnZpcm9ubWVudFZhcnMsXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0JhdGNoRXh0cmFjdG9yRnVuY3Rpb24tTG9nR3JvdXAnLCB7XG4gICAgICAgIGxvZ0dyb3VwTmFtZTogJy9hd3MvbGFtYmRhL2FwcC1tb2RleC1iYXRjaC1leHRyYWN0b3InLFxuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIH0pLFxuICAgIH0pO1xuXG4gICAgLy8gMi4gQXRoZW5hIExvb2t1cCBTZXJ2aWNlIExhbWJkYVxuICAgIGNvbnN0IGF0aGVuYUxvb2t1cFJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0F0aGVuYUxvb2t1cFJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIHJvbGVOYW1lOiAnYXBwLW1vZGV4LWF0aGVuYS1sb29rdXAtc2VydmljZS1yb2xlJyxcbiAgICB9KTtcblxuICAgIGF0aGVuYUxvb2t1cFJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogWydsb2dzOkNyZWF0ZUxvZ0dyb3VwJywgJ2xvZ3M6Q3JlYXRlTG9nU3RyZWFtJywgJ2xvZ3M6UHV0TG9nRXZlbnRzJ10sXG4gICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpsb2dzOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpsb2ctZ3JvdXA6L2F3cy9sYW1iZGEvYXBwLW1vZGV4LWF0aGVuYS1sb29rdXAtc2VydmljZToqYF1cbiAgICB9KSk7XG5cbiAgICBhdGhlbmFMb29rdXBSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFsnYXRoZW5hOlN0YXJ0UXVlcnlFeGVjdXRpb24nLCAnYXRoZW5hOkdldFF1ZXJ5UmVzdWx0cycsICdhdGhlbmE6R2V0UXVlcnlFeGVjdXRpb24nXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmF0aGVuYToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06d29ya2dyb3VwL3ByaW1hcnlgXVxuICAgIH0pKTtcblxuICAgIGF0aGVuYUxvb2t1cFJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnczM6R2V0T2JqZWN0JyxcbiAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICdzMzpHZXRCdWNrZXRMb2NhdGlvbicsXG4gICAgICAgICdzMzpMaXN0QnVja2V0J1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICAnYXJuOmF3czpzMzo6OmFwcC1tb2RleC1yZXN1bHRzLSonLFxuICAgICAgICAnYXJuOmF3czpzMzo6OmFwcC1tb2RleC1yZXN1bHRzLSovKidcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICBhdGhlbmFMb29rdXBSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICdzMzpMaXN0QnVja2V0JyxcbiAgICAgICAgJ3MzOkdldEJ1Y2tldExvY2F0aW9uJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICAnYXJuOmF3czpzMzo6OmFwcC1tb2RleC1ub3JtYWxpemVkLWRhdGEtKicsXG4gICAgICAgICdhcm46YXdzOnMzOjo6YXBwLW1vZGV4LW5vcm1hbGl6ZWQtZGF0YS0qLyonXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgYXRoZW5hTG9va3VwUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbJ2dsdWU6R2V0RGF0YWJhc2UnLCAnZ2x1ZTpHZXRUYWJsZSddLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmdsdWU6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmNhdGFsb2dgLFxuICAgICAgICBgYXJuOmF3czpnbHVlOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpkYXRhYmFzZS9hcHAtbW9kZXgtJHt0aGlzLmFjY291bnR9YCxcbiAgICAgICAgYGFybjphd3M6Z2x1ZToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvYXBwLW1vZGV4LSR7dGhpcy5hY2NvdW50fS9ub3JtYWxpemVkXypgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgY29uc3QgYXRoZW5hTG9va3VwRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdBdGhlbmFMb29rdXBGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ2FwcC1tb2RleC1hdGhlbmEtbG9va3VwLXNlcnZpY2UnLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9nbG9iYWwvYXRoZW5hLWxvb2t1cC1zZXJ2aWNlJyksXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDkwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIHJvbGU6IGF0aGVuYUxvb2t1cFJvbGUsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAuLi5jb21tb25FbnZpcm9ubWVudFZhcnMsXG4gICAgICAgIE5PUk1BTElaRURfREFUQV9EQVRBQkFTRTogYGFwcC1tb2RleC0ke3RoaXMuYWNjb3VudH1gXG4gICAgICB9LFxuICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdBdGhlbmFMb29rdXBGdW5jdGlvbi1Mb2dHcm91cCcsIHtcbiAgICAgICAgbG9nR3JvdXBOYW1lOiAnL2F3cy9sYW1iZGEvYXBwLW1vZGV4LWF0aGVuYS1sb29rdXAtc2VydmljZScsXG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgfSksXG4gICAgfSk7XG5cbiAgICAvLyAzLiBCZWRyb2NrIE5vcm1hbGl6ZXIgTGFtYmRhXG4gICAgY29uc3QgYmVkcm9ja05vcm1hbGl6ZXJSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdCZWRyb2NrTm9ybWFsaXplclJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIHJvbGVOYW1lOiAnYXBwLW1vZGV4LWJlZHJvY2stbm9ybWFsaXplci1yb2xlJyxcbiAgICB9KTtcblxuICAgIGJlZHJvY2tOb3JtYWxpemVyUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbJ2xvZ3M6Q3JlYXRlTG9nR3JvdXAnLCAnbG9nczpDcmVhdGVMb2dTdHJlYW0nLCAnbG9nczpQdXRMb2dFdmVudHMnXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmxvZ3M6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmxvZy1ncm91cDovYXdzL2xhbWJkYS9hcHAtbW9kZXgtYmVkcm9jay1ub3JtYWxpemVyOipgXVxuICAgIH0pKTtcblxuICAgIGJlZHJvY2tOb3JtYWxpemVyUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbJ2JlZHJvY2s6SW52b2tlTW9kZWwnXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmJlZHJvY2s6JHt0aGlzLnJlZ2lvbn06OmZvdW5kYXRpb24tbW9kZWwvYW1hem9uLm5vdmEtbGl0ZS12MTowYF1cbiAgICB9KSk7XG5cbiAgICBiZWRyb2NrTm9ybWFsaXplclJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogWydiZWRyb2NrOkFwcGx5R3VhcmRyYWlsJ10sXG4gICAgICByZXNvdXJjZXM6IFtiZWRyb2NrR3VhcmRyYWlsLnJlZl1cbiAgICB9KSk7XG5cbiAgICBiZWRyb2NrTm9ybWFsaXplclJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogWydkeW5hbW9kYjpHZXRJdGVtJ10sXG4gICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvYXBwLW1vZGV4LXByb21wdC10ZW1wbGF0ZXNgXVxuICAgIH0pKTtcblxuICAgIGNvbnN0IGJlZHJvY2tOb3JtYWxpemVyRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdCZWRyb2NrTm9ybWFsaXplckZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiAnYXBwLW1vZGV4LWJlZHJvY2stbm9ybWFsaXplcicsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL2dsb2JhbC9iZWRyb2NrLW5vcm1hbGl6ZXInKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXG4gICAgICByb2xlOiBiZWRyb2NrTm9ybWFsaXplclJvbGUsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAuLi5jb21tb25FbnZpcm9ubWVudFZhcnMsXG4gICAgICAgIEJFRFJPQ0tfR1VBUkRSQUlMX0lEOiBiZWRyb2NrR3VhcmRyYWlsLnJlZixcbiAgICAgICAgQkVEUk9DS19HVUFSRFJBSUxfVkVSU0lPTjogJ0RSQUZUJyxcbiAgICAgIH0sXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0JlZHJvY2tOb3JtYWxpemVyRnVuY3Rpb24tTG9nR3JvdXAnLCB7XG4gICAgICAgIGxvZ0dyb3VwTmFtZTogJy9hd3MvbGFtYmRhL2FwcC1tb2RleC1iZWRyb2NrLW5vcm1hbGl6ZXInLFxuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIH0pLFxuICAgICAgbGF5ZXJzOiBbc2hhcmVkTGF5ZXJdLFxuICAgIH0pO1xuXG4gICAgLy8gNC4gTWFwcGluZyBBZ2dyZWdhdG9yIExhbWJkYVxuICAgIGNvbnN0IG1hcHBpbmdBZ2dyZWdhdG9yUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnTWFwcGluZ0FnZ3JlZ2F0b3JSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICByb2xlTmFtZTogJ2FwcC1tb2RleC1tYXBwaW5nLWFnZ3JlZ2F0b3Itcm9sZScsXG4gICAgfSk7XG5cbiAgICBtYXBwaW5nQWdncmVnYXRvclJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogWydsb2dzOkNyZWF0ZUxvZ0dyb3VwJywgJ2xvZ3M6Q3JlYXRlTG9nU3RyZWFtJywgJ2xvZ3M6UHV0TG9nRXZlbnRzJ10sXG4gICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpsb2dzOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpsb2ctZ3JvdXA6L2F3cy9sYW1iZGEvYXBwLW1vZGV4LW1hcHBpbmctYWdncmVnYXRvcjoqYF1cbiAgICB9KSk7XG5cbiAgICBtYXBwaW5nQWdncmVnYXRvclJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogWydzMzpHZXRPYmplY3QnLCAnczM6UHV0T2JqZWN0J10sXG4gICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpzMzo6OmFwcC1tb2RleC1ub3JtYWxpemVkLWRhdGEtJHt0aGlzLmFjY291bnR9LSR7dGhpcy5yZWdpb259L25vcm1hbGl6ZWQtZGF0YS8qYF1cbiAgICB9KSk7XG5cbiAgICBtYXBwaW5nQWdncmVnYXRvclJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogWydzMzpMaXN0QnVja2V0JywgJ3MzOkdldEJ1Y2tldExvY2F0aW9uJ10sXG4gICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpzMzo6OmFwcC1tb2RleC1ub3JtYWxpemVkLWRhdGEtJHt0aGlzLmFjY291bnR9LSR7dGhpcy5yZWdpb259YF1cbiAgICB9KSk7XG5cbiAgICBtYXBwaW5nQWdncmVnYXRvclJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogWydnbHVlOlVwZGF0ZVRhYmxlJ10sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6Z2x1ZToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06Y2F0YWxvZ2AsXG4gICAgICAgIGBhcm46YXdzOmdsdWU6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmRhdGFiYXNlL2FwcC1tb2RleC0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgICBgYXJuOmF3czpnbHVlOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS9hcHAtbW9kZXgtJHt0aGlzLmFjY291bnR9L25vcm1hbGl6ZWQtKmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICBjb25zdCBtYXBwaW5nQWdncmVnYXRvckZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnTWFwcGluZ0FnZ3JlZ2F0b3JGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ2FwcC1tb2RleC1tYXBwaW5nLWFnZ3JlZ2F0b3InLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9nbG9iYWwvbWFwcGluZy1hZ2dyZWdhdG9yJyksXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDkwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIHJvbGU6IG1hcHBpbmdBZ2dyZWdhdG9yUm9sZSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIC4uLmNvbW1vbkVudmlyb25tZW50VmFycyxcbiAgICAgICAgTk9STUFMSVpFRF9EQVRBX0JVQ0tFVDogYGFwcC1tb2RleC1ub3JtYWxpemVkLWRhdGEtJHt0aGlzLmFjY291bnR9LSR7dGhpcy5yZWdpb259YCxcbiAgICAgICAgTk9STUFMSVpFRF9EQVRBX0RBVEFCQVNFOiBgYXBwLW1vZGV4LSR7dGhpcy5hY2NvdW50fWBcbiAgICAgIH0sXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ01hcHBpbmdBZ2dyZWdhdG9yRnVuY3Rpb24tTG9nR3JvdXAnLCB7XG4gICAgICAgIGxvZ0dyb3VwTmFtZTogJy9hd3MvbGFtYmRhL2FwcC1tb2RleC1tYXBwaW5nLWFnZ3JlZ2F0b3InLFxuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIH0pLFxuICAgIH0pO1xuXG4gICAgLy8gNS4gTm9ybWFsaXphdGlvbiBTdGF0dXMgVHJhY2tlciBMYW1iZGFcbiAgICBjb25zdCBzdGF0dXNUcmFja2VyUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnU3RhdHVzVHJhY2tlclJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIHJvbGVOYW1lOiAnYXBwLW1vZGV4LW5vcm1hbGl6YXRpb24tc3RhdHVzLXRyYWNrZXItcm9sZScsXG4gICAgfSk7XG5cbiAgICBzdGF0dXNUcmFja2VyUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbJ2xvZ3M6Q3JlYXRlTG9nR3JvdXAnLCAnbG9nczpDcmVhdGVMb2dTdHJlYW0nLCAnbG9nczpQdXRMb2dFdmVudHMnXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmxvZ3M6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmxvZy1ncm91cDovYXdzL2xhbWJkYS9hcHAtbW9kZXgtbm9ybWFsaXphdGlvbi1zdGF0dXMtdHJhY2tlcjoqYF1cbiAgICB9KSk7XG5cbiAgICBzdGF0dXNUcmFja2VyUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbJ2R5bmFtb2RiOlVwZGF0ZUl0ZW0nLCAnZHluYW1vZGI6R2V0SXRlbSddLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcC1tb2RleC1wcm9jZXNzLSpgXVxuICAgIH0pKTtcblxuICAgIGNvbnN0IHN0YXR1c1RyYWNrZXJGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1N0YXR1c1RyYWNrZXJGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ2FwcC1tb2RleC1ub3JtYWxpemF0aW9uLXN0YXR1cy10cmFja2VyJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEvZ2xvYmFsL25vcm1hbGl6YXRpb24tc3RhdHVzLXRyYWNrZXInKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgcm9sZTogc3RhdHVzVHJhY2tlclJvbGUsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52aXJvbm1lbnRWYXJzLFxuICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdTdGF0dXNUcmFja2VyRnVuY3Rpb24tTG9nR3JvdXAnLCB7XG4gICAgICAgIGxvZ0dyb3VwTmFtZTogJy9hd3MvbGFtYmRhL2FwcC1tb2RleC1ub3JtYWxpemF0aW9uLXN0YXR1cy10cmFja2VyJyxcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICB9KSxcbiAgICB9KTtcblxuICAgIC8vIDYuIE5vcm1hbGl6YXRpb24gRXJyb3IgSGFuZGxlciBMYW1iZGFcbiAgICBjb25zdCBlcnJvckhhbmRsZXJSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdFcnJvckhhbmRsZXJSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICByb2xlTmFtZTogJ2FwcC1tb2RleC1ub3JtYWxpemF0aW9uLWVycm9yLWhhbmRsZXItcm9sZScsXG4gICAgfSk7XG5cbiAgICBlcnJvckhhbmRsZXJSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFsnbG9nczpDcmVhdGVMb2dHcm91cCcsICdsb2dzOkNyZWF0ZUxvZ1N0cmVhbScsICdsb2dzOlB1dExvZ0V2ZW50cyddLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6bG9nczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06bG9nLWdyb3VwOi9hd3MvbGFtYmRhL2FwcC1tb2RleC1ub3JtYWxpemF0aW9uLWVycm9yLWhhbmRsZXI6KmBdXG4gICAgfSkpO1xuXG4gICAgZXJyb3JIYW5kbGVyUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbJ2R5bmFtb2RiOlVwZGF0ZUl0ZW0nXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmR5bmFtb2RiOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS9hcHAtbW9kZXgtcHJvY2Vzcy0qYF1cbiAgICB9KSk7XG5cbiAgICBlcnJvckhhbmRsZXJSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFsnc3FzOlNlbmRNZXNzYWdlJ10sXG4gICAgICByZXNvdXJjZXM6IFtub3JtYWxpemF0aW9uRExRLnF1ZXVlQXJuXVxuICAgIH0pKTtcblxuICAgIGNvbnN0IGVycm9ySGFuZGxlckZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnRXJyb3JIYW5kbGVyRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6ICdhcHAtbW9kZXgtbm9ybWFsaXphdGlvbi1lcnJvci1oYW5kbGVyJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEvZ2xvYmFsL25vcm1hbGl6YXRpb24tZXJyb3ItaGFuZGxlcicpLFxuICAgICAgdGltZW91dDogRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICByb2xlOiBlcnJvckhhbmRsZXJSb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgLi4uY29tbW9uRW52aXJvbm1lbnRWYXJzLFxuICAgICAgICBOT1JNQUxJWkFUSU9OX0RMUV9VUkw6IG5vcm1hbGl6YXRpb25ETFEucXVldWVVcmxcbiAgICAgIH0sXG4gICAgICBsb2dHcm91cDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0Vycm9ySGFuZGxlckZ1bmN0aW9uLUxvZ0dyb3VwJywge1xuICAgICAgICBsb2dHcm91cE5hbWU6ICcvYXdzL2xhbWJkYS9hcHAtbW9kZXgtbm9ybWFsaXphdGlvbi1lcnJvci1oYW5kbGVyJyxcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICB9KSxcbiAgICB9KTtcblxuICAgIC8vIDcuIE5vcm1hbGl6YXRpb24gTWV0cmljcyBMYW1iZGFcbiAgICBjb25zdCBtZXRyaWNzUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnTWV0cmljc1JvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIHJvbGVOYW1lOiAnYXBwLW1vZGV4LW5vcm1hbGl6YXRpb24tbWV0cmljcy1yb2xlJyxcbiAgICB9KTtcblxuICAgIG1ldHJpY3NSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFsnbG9nczpDcmVhdGVMb2dHcm91cCcsICdsb2dzOkNyZWF0ZUxvZ1N0cmVhbScsICdsb2dzOlB1dExvZ0V2ZW50cyddLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6bG9nczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06bG9nLWdyb3VwOi9hd3MvbGFtYmRhL2FwcC1tb2RleC1ub3JtYWxpemF0aW9uLW1ldHJpY3M6KmBdXG4gICAgfSkpO1xuXG4gICAgLy8gV0lMRENBUkQgSlVTVElGSUNBVElPTjogQ2xvdWRXYXRjaCBQdXRNZXRyaWNEYXRhIHJlcXVpcmVzIHdpbGRjYXJkIHJlc291cmNlXG4gICAgLy8gQVdTIFNlcnZpY2UgTGltaXRhdGlvbjogQ2xvdWRXYXRjaCBNZXRyaWNzIEFQSSBkb2VzIG5vdCBzdXBwb3J0IHJlc291cmNlLWxldmVsIHBlcm1pc3Npb25zXG4gICAgLy8gUmVmZXJlbmNlOiBodHRwczovL2RvY3MuYXdzLmFtYXpvbi5jb20vQW1hem9uQ2xvdWRXYXRjaC9sYXRlc3QvbW9uaXRvcmluZy9wZXJtaXNzaW9ucy1yZWZlcmVuY2UtY3cuaHRtbFxuICAgIC8vIE1pdGlnYXRpb246IFNjb3BlZCB0byBzcGVjaWZpYyBuYW1lc3BhY2UgJ0FwcE1vZEV4L05vcm1hbGl6YXRpb24nIHZpYSBjb25kaXRpb25cbiAgICAvLyBTZWN1cml0eSBJbXBhY3Q6IExvdyAtIG9ubHkgYWxsb3dzIHB1Ymxpc2hpbmcgbWV0cmljcyB0byBkZXNpZ25hdGVkIG5hbWVzcGFjZVxuICAgIG1ldHJpY3NSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFsnY2xvdWR3YXRjaDpQdXRNZXRyaWNEYXRhJ10sXG4gICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAnY2xvdWR3YXRjaDpuYW1lc3BhY2UnOiAnQXBwTW9kRXgvTm9ybWFsaXphdGlvbidcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKTtcblxuICAgIGNvbnN0IG1ldHJpY3NGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ01ldHJpY3NGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ2FwcC1tb2RleC1ub3JtYWxpemF0aW9uLW1ldHJpY3MnLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9nbG9iYWwvbm9ybWFsaXphdGlvbi1tZXRyaWNzJyksXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIHJvbGU6IG1ldHJpY3NSb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IGNvbW1vbkVudmlyb25tZW50VmFycyxcbiAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnTWV0cmljc0Z1bmN0aW9uLUxvZ0dyb3VwJywge1xuICAgICAgICBsb2dHcm91cE5hbWU6ICcvYXdzL2xhbWJkYS9hcHAtbW9kZXgtbm9ybWFsaXphdGlvbi1tZXRyaWNzJyxcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICB9KSxcbiAgICB9KTtcblxuICAgIC8vIDguIE5vcm1hbGl6YXRpb24gRExRIFByb2Nlc3NvciBMYW1iZGFcbiAgICBjb25zdCBkbHFQcm9jZXNzb3JSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdETFFQcm9jZXNzb3JSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICByb2xlTmFtZTogJ2FwcC1tb2RleC1ub3JtYWxpemF0aW9uLWRscS1wcm9jZXNzb3Itcm9sZScsXG4gICAgfSk7XG5cbiAgICBkbHFQcm9jZXNzb3JSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFsnbG9nczpDcmVhdGVMb2dHcm91cCcsICdsb2dzOkNyZWF0ZUxvZ1N0cmVhbScsICdsb2dzOlB1dExvZ0V2ZW50cyddLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6bG9nczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06bG9nLWdyb3VwOi9hd3MvbGFtYmRhL2FwcC1tb2RleC1ub3JtYWxpemF0aW9uLWRscS1wcm9jZXNzb3I6KmBdXG4gICAgfSkpO1xuXG4gICAgZGxxUHJvY2Vzc29yUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbJ3NxczpSZWNlaXZlTWVzc2FnZScsICdzcXM6RGVsZXRlTWVzc2FnZScsICdzcXM6R2V0UXVldWVBdHRyaWJ1dGVzJ10sXG4gICAgICByZXNvdXJjZXM6IFtub3JtYWxpemF0aW9uRExRLnF1ZXVlQXJuXVxuICAgIH0pKTtcblxuICAgIGRscVByb2Nlc3NvclJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogWydkeW5hbW9kYjpVcGRhdGVJdGVtJ10sXG4gICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvYXBwLW1vZGV4LXByb2Nlc3MtKmBdXG4gICAgfSkpO1xuXG4gICAgZGxxUHJvY2Vzc29yUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbJ3NuczpQdWJsaXNoJ10sXG4gICAgICByZXNvdXJjZXM6IFtub3JtYWxpemF0aW9uQWxlcnRUb3BpYy50b3BpY0Fybl1cbiAgICB9KSk7XG5cbiAgICBjb25zdCBkbHFQcm9jZXNzb3JGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0RMUVByb2Nlc3NvckZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiAnYXBwLW1vZGV4LW5vcm1hbGl6YXRpb24tZGxxLXByb2Nlc3NvcicsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL2dsb2JhbC9ub3JtYWxpemF0aW9uLWRscS1wcm9jZXNzb3InKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICByb2xlOiBkbHFQcm9jZXNzb3JSb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgLi4uY29tbW9uRW52aXJvbm1lbnRWYXJzLFxuICAgICAgICBBTEVSVF9UT1BJQ19BUk46IG5vcm1hbGl6YXRpb25BbGVydFRvcGljLnRvcGljQXJuXG4gICAgICB9LFxuICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdETFFQcm9jZXNzb3JGdW5jdGlvbi1Mb2dHcm91cCcsIHtcbiAgICAgICAgbG9nR3JvdXBOYW1lOiAnL2F3cy9sYW1iZGEvYXBwLW1vZGV4LW5vcm1hbGl6YXRpb24tZGxxLXByb2Nlc3NvcicsXG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgfSksXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgRExRIGFzIGV2ZW50IHNvdXJjZSBmb3IgRExRIHByb2Nlc3NvclxuICAgIGRscVByb2Nlc3NvckZ1bmN0aW9uLmFkZEV2ZW50U291cmNlKG5ldyBsYW1iZGFFdmVudFNvdXJjZXMuU3FzRXZlbnRTb3VyY2Uobm9ybWFsaXphdGlvbkRMUSwge1xuICAgICAgYmF0Y2hTaXplOiAxMCxcbiAgICAgIG1heEJhdGNoaW5nV2luZG93OiBEdXJhdGlvbi5zZWNvbmRzKDUpXG4gICAgfSkpO1xuXG4gICAgLy8gQ3JlYXRlIEdsdWUgdGFibGVzIGZvciBub3JtYWxpemVkIGRhdGFcbiAgICAvLyBDcmVhdGUgZGVkaWNhdGVkIGxvZ3MgYnVja2V0IGZvciBub3JtYWxpemVkIGRhdGEgYnVja2V0XG4gICAgY29uc3Qgbm9ybWFsaXplZERhdGFMb2dzQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnTm9ybWFsaXplZERhdGFMb2dzQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYGFwcC1tb2RleC1ub3JtYWxpemVkLWRhdGEtbG9ncy0ke3RoaXMuYWNjb3VudH0tJHt0aGlzLnJlZ2lvbn1gLFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIHZlcnNpb25lZDogZmFsc2UsXG4gICAgICByZW1vdmFsUG9saWN5OiBSZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0RlbGV0ZU9sZExvZ3MnLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgZXhwaXJhdGlvbjogRHVyYXRpb24uZGF5cyg5MCksXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gRW5mb3JjZSBlbmNyeXB0aW9uIGluIHRyYW5zaXQgZm9yIGxvZ3MgYnVja2V0XG4gICAgbm9ybWFsaXplZERhdGFMb2dzQnVja2V0LmFkZFRvUmVzb3VyY2VQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgc2lkOiAnRGVueUluc2VjdXJlVHJhbnNwb3J0JyxcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5ERU5ZLFxuICAgICAgcHJpbmNpcGFsczogW25ldyBpYW0uQW55UHJpbmNpcGFsKCldLFxuICAgICAgYWN0aW9uczogWydzMzoqJ10sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgbm9ybWFsaXplZERhdGFMb2dzQnVja2V0LmJ1Y2tldEFybixcbiAgICAgICAgYCR7bm9ybWFsaXplZERhdGFMb2dzQnVja2V0LmJ1Y2tldEFybn0vKmBcbiAgICAgIF0sXG4gICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgIEJvb2w6IHtcbiAgICAgICAgICAnYXdzOlNlY3VyZVRyYW5zcG9ydCc6ICdmYWxzZSdcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKTtcblxuICAgIGNvbnN0IG5vcm1hbGl6ZWREYXRhQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnTm9ybWFsaXplZERhdGFCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgYXBwLW1vZGV4LW5vcm1hbGl6ZWQtZGF0YS0ke3RoaXMuYWNjb3VudH0tJHt0aGlzLnJlZ2lvbn1gLFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgICAgc2VydmVyQWNjZXNzTG9nc0J1Y2tldDogbm9ybWFsaXplZERhdGFMb2dzQnVja2V0LFxuICAgICAgc2VydmVyQWNjZXNzTG9nc1ByZWZpeDogJ25vcm1hbGl6ZWQtZGF0YS8nLFxuICAgIH0pO1xuXG4gICAgLy8gRW5mb3JjZSBlbmNyeXB0aW9uIGluIHRyYW5zaXRcbiAgICBub3JtYWxpemVkRGF0YUJ1Y2tldC5hZGRUb1Jlc291cmNlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIHNpZDogJ0RlbnlJbnNlY3VyZVRyYW5zcG9ydCcsXG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuREVOWSxcbiAgICAgIHByaW5jaXBhbHM6IFtuZXcgaWFtLkFueVByaW5jaXBhbCgpXSxcbiAgICAgIGFjdGlvbnM6IFsnczM6KiddLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIG5vcm1hbGl6ZWREYXRhQnVja2V0LmJ1Y2tldEFybixcbiAgICAgICAgYCR7bm9ybWFsaXplZERhdGFCdWNrZXQuYnVja2V0QXJufS8qYFxuICAgICAgXSxcbiAgICAgIGNvbmRpdGlvbnM6IHtcbiAgICAgICAgQm9vbDoge1xuICAgICAgICAgICdhd3M6U2VjdXJlVHJhbnNwb3J0JzogJ2ZhbHNlJ1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSkpO1xuXG4gICAgLy8gQ3JlYXRlIEdsdWUgZGF0YWJhc2UgZm9yIG5vcm1hbGl6ZWQgdGFibGVzXG4gICAgY29uc3QgZ2x1ZURhdGFiYXNlID0gbmV3IGdsdWUuQ2ZuRGF0YWJhc2UodGhpcywgJ0dsdWVEYXRhYmFzZScsIHtcbiAgICAgIGNhdGFsb2dJZDogdGhpcy5hY2NvdW50LFxuICAgICAgZGF0YWJhc2VJbnB1dDoge1xuICAgICAgICBuYW1lOiBgYXBwLW1vZGV4LSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQXBwLU1vZEV4IGdsb2JhbCBkYXRhYmFzZSBmb3Igbm9ybWFsaXplZCB0ZWNobm9sb2d5IGRhdGEnLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBub3JtYWxpemVkIHRhYmxlc1xuICAgIGNvbnN0IHRhYmxlVHlwZXMgPSBbXG4gICAgICAnbm9ybWFsaXplZF9ydW50aW1lcycsXG4gICAgICAnbm9ybWFsaXplZF9mcmFtZXdvcmtzJyxcbiAgICAgICdub3JtYWxpemVkX2RhdGFiYXNlcycsXG4gICAgICAnbm9ybWFsaXplZF9pbnRlZ3JhdGlvbnMnLFxuICAgICAgJ25vcm1hbGl6ZWRfc3RvcmFnZXMnXG4gICAgXTtcblxuICAgIHRhYmxlVHlwZXMuZm9yRWFjaCh0YWJsZVR5cGUgPT4ge1xuICAgICAgbmV3IGdsdWUuQ2ZuVGFibGUodGhpcywgYCR7dGFibGVUeXBlLnJlcGxhY2UoJ25vcm1hbGl6ZWRfJywgJycpfVRhYmxlYCwge1xuICAgICAgICBjYXRhbG9nSWQ6IHRoaXMuYWNjb3VudCxcbiAgICAgICAgZGF0YWJhc2VOYW1lOiBnbHVlRGF0YWJhc2UucmVmLFxuICAgICAgICB0YWJsZUlucHV0OiB7XG4gICAgICAgICAgbmFtZTogdGFibGVUeXBlLFxuICAgICAgICAgIGRlc2NyaXB0aW9uOiBgTm9ybWFsaXplZCAke3RhYmxlVHlwZS5yZXBsYWNlKCdub3JtYWxpemVkXycsICcnKX0gdGVjaG5vbG9neSBtYXBwaW5nc2AsXG4gICAgICAgICAgdGFibGVUeXBlOiAnRVhURVJOQUxfVEFCTEUnLFxuICAgICAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgICAgICdjbGFzc2lmaWNhdGlvbic6ICdjc3YnLFxuICAgICAgICAgICAgJ2RlbGltaXRlcic6ICcsJyxcbiAgICAgICAgICAgICdza2lwLmhlYWRlci5saW5lLmNvdW50JzogJzEnLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgc3RvcmFnZURlc2NyaXB0b3I6IHtcbiAgICAgICAgICAgIGNvbHVtbnM6IFtcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdvcmlnaW5hbCcsXG4gICAgICAgICAgICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgICAgICAgICAgICAgY29tbWVudDogJ09yaWdpbmFsIHRlY2hub2xvZ3kgbmFtZSBmcm9tIHVzZXIgaW5wdXQnXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnbm9ybWFsaXplZCcsXG4gICAgICAgICAgICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgICAgICAgICAgICAgY29tbWVudDogJ05vcm1hbGl6ZWQgdGVjaG5vbG9neSBuYW1lIGZyb20gQmVkcm9jaydcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdjb25maWRlbmNlX3Njb3JlJyxcbiAgICAgICAgICAgICAgICB0eXBlOiAnZG91YmxlJyxcbiAgICAgICAgICAgICAgICBjb21tZW50OiAnQ29uZmlkZW5jZSBzY29yZSBmcm9tIEJlZHJvY2sgbm9ybWFsaXphdGlvbidcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICd0aW1lc3RhbXAnLFxuICAgICAgICAgICAgICAgIHR5cGU6ICd0aW1lc3RhbXAnLFxuICAgICAgICAgICAgICAgIGNvbW1lbnQ6ICdXaGVuIHRoaXMgbWFwcGluZyB3YXMgY3JlYXRlZCdcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIGxvY2F0aW9uOiBgczM6Ly8ke25vcm1hbGl6ZWREYXRhQnVja2V0LmJ1Y2tldE5hbWV9L25vcm1hbGl6ZWQtZGF0YS8ke3RhYmxlVHlwZS5yZXBsYWNlKCdub3JtYWxpemVkXycsICcnKX0vYCxcbiAgICAgICAgICAgIGlucHV0Rm9ybWF0OiAnb3JnLmFwYWNoZS5oYWRvb3AubWFwcmVkLlRleHRJbnB1dEZvcm1hdCcsXG4gICAgICAgICAgICBvdXRwdXRGb3JtYXQ6ICdvcmcuYXBhY2hlLmhhZG9vcC5oaXZlLnFsLmlvLkhpdmVJZ25vcmVLZXlUZXh0T3V0cHV0Rm9ybWF0JyxcbiAgICAgICAgICAgIHNlcmRlSW5mbzoge1xuICAgICAgICAgICAgICBzZXJpYWxpemF0aW9uTGlicmFyeTogJ29yZy5hcGFjaGUuaGFkb29wLmhpdmUuc2VyZGUyLmxhenkuTGF6eVNpbXBsZVNlckRlJyxcbiAgICAgICAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgICAgICAgICdmaWVsZC5kZWxpbSc6ICcsJyxcbiAgICAgICAgICAgICAgICAncXVvdGUuZGVsaW0nOiAnXCInLFxuICAgICAgICAgICAgICAgICdlc2NhcGUuZGVsaW0nOiAnXFxcXCdcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBEYXRhIFNvdXJjZSBQcm9jZXNzb3IgTGFtYmRhIEZ1bmN0aW9uXG4gICAgLy8gPT09PT0gREFUQSBTT1VSQ0UgUFJPQ0VTU09SIExBTUJEQSAtIERFRElDQVRFRCBST0xFID09PT09XG4gICAgXG4gICAgLy8gUm9sZSBNYXBwZXIgTGFtYmRhIFJvbGVcbiAgICBjb25zdCByb2xlTWFwcGVyUm9sZSA9IHJvbGVNYW5hZ2VyLmNyZWF0ZUxhbWJkYVJvbGUoJ1JvbGVNYXBwZXJSb2xlJywgJ2FwcC1tb2RleC1yb2xlLW1hcHBlcicpO1xuICAgIGFwcENvbmZpZ1NlY3JldC5ncmFudFJlYWQocm9sZU1hcHBlclJvbGUpO1xuICAgIHByb2plY3RzVGFibGUuZ3JhbnRSZWFkRGF0YShyb2xlTWFwcGVyUm9sZSk7XG4gICAgcm9sZU1hcHBlclJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogWydjb2duaXRvLWlkZW50aXR5OlNldElkZW50aXR5UG9vbFJvbGVzJywgJ2NvZ25pdG8taWRlbnRpdHk6R2V0SWRlbnRpdHlQb29sUm9sZXMnXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmNvZ25pdG8taWRlbnRpdHk6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmlkZW50aXR5cG9vbC8qYF1cbiAgICB9KSk7XG4gICAgcm9sZU1hcHBlclJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogWydpYW06UGFzc1JvbGUnXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmlhbTo6JHt0aGlzLmFjY291bnR9OnJvbGUvYXBwLW1vZGV4LSpgXVxuICAgIH0pKTtcbiAgICBcbiAgICAvLyBSb2xlIE1hcHBlciBMYW1iZGEgRnVuY3Rpb25cbiAgICBjb25zdCByb2xlTWFwcGVyRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdSb2xlTWFwcGVyRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6ICdhcHAtbW9kZXgtcm9sZS1tYXBwZXInLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9nbG9iYWwvcm9sZS1tYXBwZXInKSxcbiAgICAgIHRpbWVvdXQ6IER1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgcm9sZTogcm9sZU1hcHBlclJvbGUsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52aXJvbm1lbnRWYXJzLFxuICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdSb2xlTWFwcGVyRnVuY3Rpb24tTG9nR3JvdXAnLCB7XG4gICAgICAgIGxvZ0dyb3VwTmFtZTogJy9hd3MvbGFtYmRhL2FwcC1tb2RleC1yb2xlLW1hcHBlcicsXG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgfSksXG4gICAgICBsYXllcnM6IFtzaGFyZWRMYXllcl0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PSBTVEVQIEZVTkNUSU9OIFRSSUdHRVIgTEFNQkRBIC0gREVESUNBVEVEIFJPTEUgPT09PT1cbiAgICBcbiAgICAvLyBDcmVhdGUgZGVkaWNhdGVkIHJvbGUgZm9yIHN0ZXAgZnVuY3Rpb24gdHJpZ2dlciBMYW1iZGEgd2l0aCBsZWFzdCBwcml2aWxlZ2UgcGVybWlzc2lvbnNcbiAgICBjb25zdCBzdGVwRnVuY3Rpb25UcmlnZ2VyUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnU3RlcEZ1bmN0aW9uVHJpZ2dlclJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIHJvbGVOYW1lOiAnYXBwLW1vZGV4LXN0ZXAtZnVuY3Rpb24tdHJpZ2dlci1yb2xlJyxcbiAgICB9KTtcblxuICAgIC8vIENsb3VkV2F0Y2ggTG9ncyBwZXJtaXNzaW9uc1xuICAgIHN0ZXBGdW5jdGlvblRyaWdnZXJSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nR3JvdXAnLFxuICAgICAgICAnbG9nczpDcmVhdGVMb2dTdHJlYW0nLFxuICAgICAgICAnbG9nczpQdXRMb2dFdmVudHMnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmxvZ3M6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmxvZy1ncm91cDovYXdzL2xhbWJkYS9hcHAtbW9kZXgtc3RlcC1mdW5jdGlvbi10cmlnZ2VyOipgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gRHluYW1vREIgcGVybWlzc2lvbnMgZm9yIHVwZGF0aW5nIHByb2Nlc3MgdHJhY2tpbmcgcmVjb3Jkc1xuICAgIHN0ZXBGdW5jdGlvblRyaWdnZXJSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2R5bmFtb2RiOlVwZGF0ZUl0ZW0nLFxuICAgICAgICAnZHluYW1vZGI6UHV0SXRlbSdcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcC1tb2RleC1wcm9jZXNzLSpgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gU3RlcCBGdW5jdGlvbnMgcGVybWlzc2lvbnMgdG8gc3RhcnQgZXhlY3V0aW9ucyBmb3IgYm90aCBub3JtYWxpemF0aW9uIGFuZCBza2lsbCBpbXBvcnRhbmNlXG4gICAgc3RlcEZ1bmN0aW9uVHJpZ2dlclJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnc3RhdGVzOlN0YXJ0RXhlY3V0aW9uJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpzdGF0ZXM6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnN0YXRlTWFjaGluZTphcHAtbW9kZXgtbm9ybWFsaXphdGlvbmAsXG4gICAgICAgIGBhcm46YXdzOnN0YXRlczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06c3RhdGVNYWNoaW5lOmFwcC1tb2RleC1za2lsbC1pbXBvcnRhbmNlLSpgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gU3RlcCBGdW5jdGlvbiBUcmlnZ2VyIExhbWJkYSBGdW5jdGlvblxuICAgIGNvbnN0IHN0ZXBGdW5jdGlvblRyaWdnZXJGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1N0ZXBGdW5jdGlvblRyaWdnZXJGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ2FwcC1tb2RleC1zdGVwLWZ1bmN0aW9uLXRyaWdnZXInLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9nbG9iYWwvc3RlcC1mdW5jdGlvbi10cmlnZ2VyJyksXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIHJvbGU6IHN0ZXBGdW5jdGlvblRyaWdnZXJSb2xlLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgLi4uY29tbW9uRW52aXJvbm1lbnRWYXJzLFxuICAgICAgICBSRUdJT046IHRoaXMucmVnaW9uLFxuICAgICAgICBBV1NfQUNDT1VOVF9JRDogdGhpcy5hY2NvdW50LFxuICAgICAgICAvLyBTVEFURV9NQUNISU5FX0FSTiB3aWxsIGJlIHNldCBhZnRlciBub3JtYWxpemF0aW9uIHN0ZXAgZnVuY3Rpb24gaXMgY3JlYXRlZFxuICAgICAgfSxcbiAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnU3RlcEZ1bmN0aW9uVHJpZ2dlckZ1bmN0aW9uLUxvZ0dyb3VwJywge1xuICAgICAgICBsb2dHcm91cE5hbWU6ICcvYXdzL2xhbWJkYS9hcHAtbW9kZXgtc3RlcC1mdW5jdGlvbi10cmlnZ2VyJyxcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICB9KSxcbiAgICAgIGxheWVyczogW3NoYXJlZExheWVyXSxcbiAgICB9KTtcblxuICAgIC8vIFBpbG90IElkZW50aWZpY2F0aW9uIEFzeW5jIExhbWJkYSBSb2xlXG4gICAgY29uc3QgcGlsb3RJZGVudGlmaWNhdGlvbkFzeW5jUm9sZSA9IHJvbGVNYW5hZ2VyLmNyZWF0ZUxhbWJkYVJvbGUoJ1BpbG90SWRlbnRpZmljYXRpb25Bc3luY1JvbGUnLCAnYXBwLW1vZGV4LXBpbG90LWlkZW50aWZpY2F0aW9uLWFzeW5jJyk7XG5cbiAgICAvLyBQaWxvdCBJZGVudGlmaWNhdGlvbiBBc3luYyBMYW1iZGEgRnVuY3Rpb25cbiAgICBjb25zdCBwaWxvdElkZW50aWZpY2F0aW9uQXN5bmNGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1BpbG90SWRlbnRpZmljYXRpb25Bc3luY0Z1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiAnYXBwLW1vZGV4LXBpbG90LWlkZW50aWZpY2F0aW9uLWFzeW5jJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEvZ2xvYmFsL3BpbG90LWlkZW50aWZpY2F0aW9uLWFzeW5jJyksXG4gICAgICB0aW1lb3V0OiBEdXJhdGlvbi5zZWNvbmRzKDYwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIHJvbGU6IHBpbG90SWRlbnRpZmljYXRpb25Bc3luY1JvbGUsXG4gICAgICBlbnZpcm9ubWVudDogY29tbW9uRW52aXJvbm1lbnRWYXJzLFxuICAgICAgbG9nR3JvdXA6IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdQaWxvdElkZW50aWZpY2F0aW9uQXN5bmNGdW5jdGlvbi1Mb2dHcm91cCcsIHtcbiAgICAgICAgbG9nR3JvdXBOYW1lOiAnL2F3cy9sYW1iZGEvYXBwLW1vZGV4LXBpbG90LWlkZW50aWZpY2F0aW9uLWFzeW5jJyxcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICB9KSxcbiAgICAgIGxheWVyczogW3NoYXJlZExheWVyXSxcbiAgICB9KTtcbiAgICBwaWxvdElkZW50aWZpY2F0aW9uQXN5bmNSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFsnczM6R2V0T2JqZWN0JywgJ3MzOlB1dE9iamVjdCddLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6czM6OjphcHAtbW9kZXgtZGF0YS0qL3BpbG90LWFuYWx5c2lzLypgXVxuICAgIH0pKTtcbiAgICBwaWxvdElkZW50aWZpY2F0aW9uQXN5bmNSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFsnYmVkcm9jazpJbnZva2VNb2RlbCddLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6YmVkcm9jazoke3RoaXMucmVnaW9ufTo6Zm91bmRhdGlvbi1tb2RlbC9hbnRocm9waWMuY2xhdWRlLTMtNy1zb25uZXQtKmBdXG4gICAgfSkpO1xuXG4gICAgLy8gPT09PT0gU0lNSUxBUklUWSBBTkQgUElMT1QgQU5BTFlTSVMgTEFNQkRBIEZVTkNUSU9OUyA9PT09PVxuICAgIFxuICAgIC8vIEFwcGxpY2F0aW9uIFNpbWlsYXJpdGllcyAtIGdsb2JhbCBMYW1iZGEgaW50ZWdyYXRpb25cbiAgICBjb25zdCBhcHBsaWNhdGlvblNpbWlsYXJpdGllc1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0FwcGxpY2F0aW9uU2ltaWxhcml0aWVzUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpLFxuICAgICAgXSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRXhlY3V0aW9uIHJvbGUgZm9yIGdsb2JhbCBhcHBsaWNhdGlvbi1zaW1pbGFyaXRpZXMgTGFtYmRhJyxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IHJlYWQtb25seSBEeW5hbW9EQiBwZXJtaXNzaW9ucyBmb3IgYWxsIHByb2plY3Qgc2ltaWxhcml0eSB0YWJsZXNcbiAgICBhcHBsaWNhdGlvblNpbWlsYXJpdGllc1JvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6U2NhbicsXG4gICAgICAgICdkeW5hbW9kYjpHZXRJdGVtJyxcbiAgICAgICAgJ2R5bmFtb2RiOkJhdGNoV3JpdGVJdGVtJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvYXBwLW1vZGV4LWFwcC1zaW0tKmAsXG4gICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS9hcHAtbW9kZXgtYXBwLWNsdXN0ZXJzLSpgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gR3JhbnQgRHluYW1vREIgcGVybWlzc2lvbnMgZm9yIHByb2Nlc3MgdHJhY2tpbmcgKHdyaXRlIGZvciBQT1NUIHJlcXVlc3RzKVxuICAgIGFwcGxpY2F0aW9uU2ltaWxhcml0aWVzUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdkeW5hbW9kYjpQdXRJdGVtJyxcbiAgICAgICAgJ2R5bmFtb2RiOlVwZGF0ZUl0ZW0nXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS9hcHAtbW9kZXgtcHJvY2Vzcy0qYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIEdyYW50IFN0ZXAgRnVuY3Rpb25zIHBlcm1pc3Npb25zIHRvIHN0YXJ0IGFwcGxpY2F0aW9uIHNpbWlsYXJpdHkgYW5hbHlzaXNcbiAgICBhcHBsaWNhdGlvblNpbWlsYXJpdGllc1JvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnc3RhdGVzOlN0YXJ0RXhlY3V0aW9uJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpzdGF0ZXM6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnN0YXRlTWFjaGluZTphcHAtbW9kZXgtYXBwLXNpbS1hbmFseXNpcy0qYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIGNvbnN0IGFwcGxpY2F0aW9uU2ltaWxhcml0aWVzRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdBcHBsaWNhdGlvblNpbWlsYXJpdGllc0Z1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiAnYXBwLW1vZGV4LWFwcGxpY2F0aW9uLXNpbWlsYXJpdGllcycsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL2dsb2JhbC9hcHBsaWNhdGlvbi1zaW1pbGFyaXRpZXMnKSxcbiAgICAgIHJvbGU6IGFwcGxpY2F0aW9uU2ltaWxhcml0aWVzUm9sZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnR2xvYmFsIExhbWJkYSBmb3IgYXBwbGljYXRpb24gc2ltaWxhcml0eSBhbmFseXNpcyAoR0VUIHJlc3VsdHMsIFBPU1QgdHJpZ2dlciknLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQVBQX1NJTV9TVEVQX0ZVTkNUSU9OX0FSTjogYGFybjphd3M6c3RhdGVzOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpzdGF0ZU1hY2hpbmU6YXBwLW1vZGV4LWFwcC1zaW0tYW5hbHlzaXMte3Byb2plY3RJZH1gLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENvbXBvbmVudCBTaW1pbGFyaXRpZXMgLSBnbG9iYWwgTGFtYmRhIGludGVncmF0aW9uXG4gICAgY29uc3QgY29tcG9uZW50U2ltaWxhcml0aWVzUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnQ29tcG9uZW50U2ltaWxhcml0aWVzUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpLFxuICAgICAgXSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRXhlY3V0aW9uIHJvbGUgZm9yIGdsb2JhbCBjb21wb25lbnQtc2ltaWxhcml0aWVzIExhbWJkYScsXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCByZWFkLW9ubHkgRHluYW1vREIgcGVybWlzc2lvbnMgZm9yIGFsbCBwcm9qZWN0IHNpbWlsYXJpdHkgdGFibGVzXG4gICAgY29tcG9uZW50U2ltaWxhcml0aWVzUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdkeW5hbW9kYjpTY2FuJyxcbiAgICAgICAgJ2R5bmFtb2RiOkdldEl0ZW0nLFxuICAgICAgICAnZHluYW1vZGI6QmF0Y2hXcml0ZUl0ZW0nXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS9hcHAtbW9kZXgtY29tcC1zaW0tKmAsXG4gICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS9hcHAtbW9kZXgtY29tcC1jbHVzdGVycy0qYCxcbiAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcC1tb2RleC1jb21wLXBhdHRlcm5zLSpgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gR3JhbnQgRHluYW1vREIgcGVybWlzc2lvbnMgZm9yIHByb2Nlc3MgdHJhY2tpbmcgKHdyaXRlIGZvciBQT1NUIHJlcXVlc3RzKVxuICAgIGNvbXBvbmVudFNpbWlsYXJpdGllc1JvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6UHV0SXRlbScsXG4gICAgICAgICdkeW5hbW9kYjpVcGRhdGVJdGVtJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvYXBwLW1vZGV4LXByb2Nlc3MtKmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBHcmFudCBTdGVwIEZ1bmN0aW9ucyBwZXJtaXNzaW9ucyB0byBzdGFydCBjb21wb25lbnQgc2ltaWxhcml0eSBhbmFseXNpc1xuICAgIGNvbXBvbmVudFNpbWlsYXJpdGllc1JvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnc3RhdGVzOlN0YXJ0RXhlY3V0aW9uJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpzdGF0ZXM6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnN0YXRlTWFjaGluZTphcHAtbW9kZXgtY29tcC1zaW0tYW5hbHlzaXMtKmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICBjb25zdCBjb21wb25lbnRTaW1pbGFyaXRpZXNGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0NvbXBvbmVudFNpbWlsYXJpdGllc0Z1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiAnYXBwLW1vZGV4LWNvbXBvbmVudC1zaW1pbGFyaXRpZXMnLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9nbG9iYWwvY29tcG9uZW50LXNpbWlsYXJpdGllcycpLFxuICAgICAgcm9sZTogY29tcG9uZW50U2ltaWxhcml0aWVzUm9sZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnR2xvYmFsIExhbWJkYSBmb3IgY29tcG9uZW50IHNpbWlsYXJpdHkgYW5hbHlzaXMgKEdFVCByZXN1bHRzLCBQT1NUIHRyaWdnZXIpJyxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIENPTVBfU0lNX1NURVBfRlVOQ1RJT05fQVJOOiBgYXJuOmF3czpzdGF0ZXM6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnN0YXRlTWFjaGluZTphcHAtbW9kZXgtY29tcC1zaW0tYW5hbHlzaXMte3Byb2plY3RJZH1gLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFBpbG90IElkZW50aWZpY2F0aW9uIC0gZ2xvYmFsIExhbWJkYSBpbnRlZ3JhdGlvblxuICAgIGNvbnN0IHBpbG90SWRlbnRpZmljYXRpb25Sb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdQaWxvdElkZW50aWZpY2F0aW9uUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpLFxuICAgICAgXSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRXhlY3V0aW9uIHJvbGUgZm9yIGdsb2JhbCBwaWxvdC1pZGVudGlmaWNhdGlvbiBMYW1iZGEnLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgRHluYW1vREIgcGVybWlzc2lvbnMgZm9yIHBpbG90IGpvYnMgYW5kIHJlc3VsdHMgdGFibGVzXG4gICAgcGlsb3RJZGVudGlmaWNhdGlvblJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6U2NhbicsXG4gICAgICAgICdkeW5hbW9kYjpRdWVyeScsXG4gICAgICAgICdkeW5hbW9kYjpHZXRJdGVtJyxcbiAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxuICAgICAgICAnZHluYW1vZGI6VXBkYXRlSXRlbScsXG4gICAgICAgICdkeW5hbW9kYjpCYXRjaFdyaXRlSXRlbSdcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcC1tb2RleC1waWxvdC1qb2JzLSpgLFxuICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvYXBwLW1vZGV4LXBpbG90LWpvYnMtKi9pbmRleC8qYCxcbiAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcC1tb2RleC1waWxvdC1yZXN1bHRzLSpgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gR3JhbnQgRHluYW1vREIgcGVybWlzc2lvbnMgZm9yIHByb2Nlc3MgdHJhY2tpbmcgKHdyaXRlIGZvciBQT1NUIHJlcXVlc3RzKVxuICAgIHBpbG90SWRlbnRpZmljYXRpb25Sb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxuICAgICAgICAnZHluYW1vZGI6VXBkYXRlSXRlbSdcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcC1tb2RleC1wcm9jZXNzLSpgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gR3JhbnQgU3RlcCBGdW5jdGlvbnMgcGVybWlzc2lvbnMgdG8gc3RhcnQgcGlsb3QgaWRlbnRpZmljYXRpb24gYW5hbHlzaXNcbiAgICBwaWxvdElkZW50aWZpY2F0aW9uUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdzdGF0ZXM6U3RhcnRFeGVjdXRpb24nXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOnN0YXRlczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06c3RhdGVNYWNoaW5lOmFwcC1tb2RleC1waWxvdC1hbmFseXNpcy0qYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIGNvbnN0IHBpbG90SWRlbnRpZmljYXRpb25GdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1BpbG90SWRlbnRpZmljYXRpb25GdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ2FwcC1tb2RleC1waWxvdC1pZGVudGlmaWNhdGlvbicsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL2dsb2JhbC9waWxvdC1pZGVudGlmaWNhdGlvbicpLFxuICAgICAgcm9sZTogcGlsb3RJZGVudGlmaWNhdGlvblJvbGUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0dsb2JhbCBMYW1iZGEgZm9yIHBpbG90IGlkZW50aWZpY2F0aW9uIGFuYWx5c2lzIChHRVQgcmVzdWx0cywgUE9TVCB0cmlnZ2VyLCBERUxFVEUgY2xlYXIpJyxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwKSxcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFBJTE9UX1NURVBfRlVOQ1RJT05fQVJOOiBgYXJuOmF3czpzdGF0ZXM6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnN0YXRlTWFjaGluZTphcHAtbW9kZXgtcGlsb3QtYW5hbHlzaXMte3Byb2plY3RJZH1gLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIFBpbG90IEdhdGhlciBDb250ZXh0IERhdGEgLSBnbG9iYWwgTGFtYmRhIGZvciBBSSBlbmhhbmNlbWVudFxuICAgIGNvbnN0IHBpbG90R2F0aGVyQ29udGV4dFJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1BpbG90R2F0aGVyQ29udGV4dFJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKSxcbiAgICAgIF0sXG4gICAgICBkZXNjcmlwdGlvbjogJ0V4ZWN1dGlvbiByb2xlIGZvciBwaWxvdC1nYXRoZXItY29udGV4dC1kYXRhIExhbWJkYScsXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCByZWFkLW9ubHkgRHluYW1vREIgcGVybWlzc2lvbnMgZm9yIGNvbnRleHQgZGF0YSB0YWJsZXNcbiAgICBwaWxvdEdhdGhlckNvbnRleHRSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2R5bmFtb2RiOlNjYW4nLFxuICAgICAgICAnZHluYW1vZGI6UXVlcnknLFxuICAgICAgICAnZHluYW1vZGI6R2V0SXRlbSdcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcC1tb2RleC1zaW1pbGFyaXR5LXJlc3VsdHMtKmAsXG4gICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS9hcHAtbW9kZXgtY29tcG9uZW50LXNpbWlsYXJpdHktcmVzdWx0cy0qYCxcbiAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcC1tb2RleC1za2lsbHMtKmAsXG4gICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS9hcHAtbW9kZXgtc2tpbGwtZXhwZWN0YXRpb25zLSpgLFxuICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvYXBwLW1vZGV4LXRlY2gtcmFkYXItKmAsXG4gICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS9hcHAtbW9kZXgtdGVhbS13ZWlnaHRzLSpgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgY29uc3QgcGlsb3RHYXRoZXJDb250ZXh0RnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdQaWxvdEdhdGhlckNvbnRleHRGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ2FwcC1tb2RleC1nYXRoZXItY29udGV4dC1kYXRhJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEvZ2xvYmFsL3BpbG90LWdhdGhlci1jb250ZXh0LWRhdGEnKSxcbiAgICAgIHJvbGU6IHBpbG90R2F0aGVyQ29udGV4dFJvbGUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0dhdGhlcnMgY29udGV4dCBkYXRhIGZvciBBSS1lbmhhbmNlZCBwaWxvdCBpZGVudGlmaWNhdGlvbicsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMDApLFxuICAgICAgbWVtb3J5U2l6ZTogMTAyNCxcbiAgICAgIGxheWVyczogW3NoYXJlZExheWVyXSxcbiAgICB9KTtcblxuICAgIC8vIFBpbG90IEFJIEVuaGFuY2UgU2NvcmVzIC0gZ2xvYmFsIExhbWJkYSBmb3IgQUkgZW5oYW5jZW1lbnRcbiAgICBjb25zdCBwaWxvdEFJRW5oYW5jZVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1BpbG90QUlFbmhhbmNlUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpLFxuICAgICAgXSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRXhlY3V0aW9uIHJvbGUgZm9yIHBpbG90LWFpLWVuaGFuY2Utc2NvcmVzIExhbWJkYScsXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBCZWRyb2NrIHBlcm1pc3Npb25zIGZvciBBSSBtb2RlbCBpbnZvY2F0aW9uXG4gICAgcGlsb3RBSUVuaGFuY2VSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2JlZHJvY2s6SW52b2tlTW9kZWwnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmJlZHJvY2s6JHt0aGlzLnJlZ2lvbn06OmZvdW5kYXRpb24tbW9kZWwvYW50aHJvcGljLmNsYXVkZS0zLTctc29ubmV0LTIwMjUwMjE5LXYxOjBgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gR3JhbnQgQmVkcm9jayBHdWFyZHJhaWwgcGVybWlzc2lvbnNcbiAgICBwaWxvdEFJRW5oYW5jZVJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnYmVkcm9jazpBcHBseUd1YXJkcmFpbCdcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtiZWRyb2NrR3VhcmRyYWlsLnJlZl1cbiAgICB9KSk7XG5cbiAgICAvLyBHcmFudCBEeW5hbW9EQiBwZXJtaXNzaW9ucyB0byByZWFkIHByb21wdCB0ZW1wbGF0ZXNcbiAgICBwaWxvdEFJRW5oYW5jZVJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICdkeW5hbW9kYjpRdWVyeSdcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcC1tb2RleC1wcm9tcHQtdGVtcGxhdGVzYCxcbiAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcC1tb2RleC1wcm9tcHQtdGVtcGxhdGVzL2luZGV4LypgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gR3JhbnQgRHluYW1vREIgcGVybWlzc2lvbnMgdG8gd3JpdGUgQUktZW5oYW5jZWQgcmVzdWx0c1xuICAgIHBpbG90QUlFbmhhbmNlUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdkeW5hbW9kYjpQdXRJdGVtJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvYXBwLW1vZGV4LXBpbG90LXJlc3VsdHMtKmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICBjb25zdCBwaWxvdEFJRW5oYW5jZUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnUGlsb3RBSUVuaGFuY2VGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ2FwcC1tb2RleC1haS1lbmhhbmNlLXNjb3JlcycsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjJfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhL2dsb2JhbC9waWxvdC1haS1lbmhhbmNlLXNjb3JlcycpLFxuICAgICAgcm9sZTogcGlsb3RBSUVuaGFuY2VSb2xlLFxuICAgICAgZGVzY3JpcHRpb246ICdBSS1lbmhhbmNlcyBwaWxvdCBpZGVudGlmaWNhdGlvbiBzY29yZXMgdXNpbmcgQmVkcm9jaycsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg5MDApLFxuICAgICAgbWVtb3J5U2l6ZTogMjA0OCxcbiAgICAgIGxheWVyczogW3NoYXJlZExheWVyXSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEJFRFJPQ0tfR1VBUkRSQUlMX0lEOiBiZWRyb2NrR3VhcmRyYWlsLnJlZixcbiAgICAgICAgQkVEUk9DS19HVUFSRFJBSUxfVkVSU0lPTjogJ0RSQUZUJyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBQaWxvdCBDb21iaW5lIFNjb3JlcyAtIGdsb2JhbCBMYW1iZGEgZm9yIHNjb3JlIGNvbnNvbGlkYXRpb25cbiAgICBjb25zdCBwaWxvdENvbWJpbmVTY29yZXNSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdQaWxvdENvbWJpbmVTY29yZXNSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJyksXG4gICAgICBdLFxuICAgICAgZGVzY3JpcHRpb246ICdFeGVjdXRpb24gcm9sZSBmb3IgcGlsb3QtY29tYmluZS1zY29yZXMgTGFtYmRhJyxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IER5bmFtb0RCIHBlcm1pc3Npb25zIHRvIHdyaXRlIGNvbnNvbGlkYXRlZCByZXN1bHRzXG4gICAgcGlsb3RDb21iaW5lU2NvcmVzUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdkeW5hbW9kYjpQdXRJdGVtJyxcbiAgICAgICAgJ2R5bmFtb2RiOkJhdGNoV3JpdGVJdGVtJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvYXBwLW1vZGV4LXBpbG90LXJlc3VsdHMtKmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICBjb25zdCBwaWxvdENvbWJpbmVTY29yZXNGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1BpbG90Q29tYmluZVNjb3Jlc0Z1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiAnYXBwLW1vZGV4LWNvbWJpbmUtc2NvcmVzJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMl9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGEvZ2xvYmFsL3BpbG90LWNvbWJpbmUtc2NvcmVzJyksXG4gICAgICByb2xlOiBwaWxvdENvbWJpbmVTY29yZXNSb2xlLFxuICAgICAgZGVzY3JpcHRpb246ICdDb21iaW5lcyBydWxlLWJhc2VkIGFuZCBBSS1lbmhhbmNlZCBwaWxvdCBzY29yZXMnLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzAwKSxcbiAgICAgIG1lbW9yeVNpemU6IDEwMjQsXG4gICAgICBsYXllcnM6IFtzaGFyZWRMYXllcl0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PSBMQU1CREEgRlVOQ1RJT04gRVhQT1JUUyA9PT09PVxuICAgIC8vIEV4cG9ydCBMYW1iZGEgQVJOcyBmb3IgQVBJIHN0YWNrIHRvIGltcG9ydFxuICAgIFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcm9qZWN0c0Z1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IHByb2plY3RzRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtQmFja2VuZC1Qcm9qZWN0c0Z1bmN0aW9uQXJuJyxcbiAgICB9KTtcbiAgICBcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvY2Vzc1RyYWNraW5nRnVuY3Rpb25Bcm4nLCB7XG4gICAgICB2YWx1ZTogcHJvY2Vzc1RyYWNraW5nRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtQmFja2VuZC1Qcm9jZXNzVHJhY2tpbmdGdW5jdGlvbkFybicsXG4gICAgfSk7XG4gICAgXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJTZWFyY2hGdW5jdGlvbkFybicsIHtcbiAgICAgIHZhbHVlOiB1c2VyU2VhcmNoRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtQmFja2VuZC1Vc2VyU2VhcmNoRnVuY3Rpb25Bcm4nLFxuICAgIH0pO1xuICAgIFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQaWxvdEluaXRpYXRlRnVuY3Rpb25Bcm4nLCB7XG4gICAgICB2YWx1ZTogcGlsb3RJbml0aWF0ZUZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LUJhY2tlbmQtUGlsb3RJbml0aWF0ZUZ1bmN0aW9uQXJuJyxcbiAgICB9KTtcbiAgICBcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUGlsb3RTdGF0dXNGdW5jdGlvbkFybicsIHtcbiAgICAgIHZhbHVlOiBwaWxvdFN0YXR1c0Z1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LUJhY2tlbmQtUGlsb3RTdGF0dXNGdW5jdGlvbkFybicsXG4gICAgfSk7XG4gICAgXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1BpbG90UmVzdWx0c0Z1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IHBpbG90UmVzdWx0c0Z1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LUJhY2tlbmQtUGlsb3RSZXN1bHRzRnVuY3Rpb25Bcm4nLFxuICAgIH0pO1xuICAgIFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQaWxvdERlbGV0ZUZ1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IHBpbG90RGVsZXRlRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtQmFja2VuZC1QaWxvdERlbGV0ZUZ1bmN0aW9uQXJuJyxcbiAgICB9KTtcbiAgICBcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBwbGljYXRpb25CdWNrZXRzRnVuY3Rpb25Bcm4nLCB7XG4gICAgICB2YWx1ZTogYXBwbGljYXRpb25CdWNrZXRzRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtQmFja2VuZC1BcHBsaWNhdGlvbkJ1Y2tldHNGdW5jdGlvbkFybicsXG4gICAgfSk7XG4gICAgXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1RDT0Z1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IHRjb0Z1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LUJhY2tlbmQtVENPRnVuY3Rpb25Bcm4nLFxuICAgIH0pO1xuICAgIFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdUZWFtRXN0aW1hdGVzRnVuY3Rpb25Bcm4nLCB7XG4gICAgICB2YWx1ZTogdGVhbUVzdGltYXRlc0Z1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LUJhY2tlbmQtVGVhbUVzdGltYXRlc0Z1bmN0aW9uQXJuJyxcbiAgICB9KTtcbiAgICBcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXRoZW5hUXVlcnlGdW5jdGlvbkFybicsIHtcbiAgICAgIHZhbHVlOiBhdGhlbmFRdWVyeUZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LUJhY2tlbmQtQXRoZW5hUXVlcnlGdW5jdGlvbkFybicsXG4gICAgfSk7XG4gICAgXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1RlYW1XZWlnaHRzRnVuY3Rpb25Bcm4nLCB7XG4gICAgICB2YWx1ZTogdGVhbVdlaWdodHNGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGV4cG9ydE5hbWU6ICdBcHBNb2RFeC1CYWNrZW5kLVRlYW1XZWlnaHRzRnVuY3Rpb25Bcm4nLFxuICAgIH0pO1xuICAgIFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTdGVwRnVuY3Rpb25BcGlGdW5jdGlvbkFybicsIHtcbiAgICAgIHZhbHVlOiBzdGVwRnVuY3Rpb25BcGlGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGV4cG9ydE5hbWU6ICdBcHBNb2RFeC1CYWNrZW5kLVN0ZXBGdW5jdGlvbkFwaUZ1bmN0aW9uQXJuJyxcbiAgICB9KTtcbiAgICBcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRXhwb3J0SW5pdGlhdG9yRnVuY3Rpb25Bcm4nLCB7XG4gICAgICB2YWx1ZTogZXhwb3J0SW5pdGlhdG9yRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtQmFja2VuZC1FeHBvcnRJbml0aWF0b3JGdW5jdGlvbkFybicsXG4gICAgfSk7XG4gICAgXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0V4cG9ydFJlYWRlckZ1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IGV4cG9ydFJlYWRlckZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LUJhY2tlbmQtRXhwb3J0UmVhZGVyRnVuY3Rpb25Bcm4nLFxuICAgIH0pO1xuICAgIFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBdXRvbWF0aW9uU3RhdHVzRnVuY3Rpb25Bcm4nLCB7XG4gICAgICB2YWx1ZTogYXV0b21hdGlvblN0YXR1c0Z1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LUJhY2tlbmQtQXV0b21hdGlvblN0YXR1c0Z1bmN0aW9uQXJuJyxcbiAgICB9KTtcbiAgICBcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvdmlzaW9uaW5nRnVuY3Rpb25Bcm4nLCB7XG4gICAgICB2YWx1ZTogcHJvdmlzaW9uaW5nRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtQmFja2VuZC1Qcm92aXNpb25pbmdGdW5jdGlvbkFybicsXG4gICAgfSk7XG4gICAgXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0J1aWxkTW9uaXRvckZ1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IGJ1aWxkTW9uaXRvckZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LUJhY2tlbmQtQnVpbGRNb25pdG9yRnVuY3Rpb25Bcm4nLFxuICAgIH0pO1xuICAgIFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdGaWxlT3BlcmF0aW9uc0Z1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IGZpbGVPcGVyYXRpb25zRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtQmFja2VuZC1GaWxlT3BlcmF0aW9uc0Z1bmN0aW9uQXJuJyxcbiAgICB9KTtcbiAgICBcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGF0YVNvdXJjZXNGdW5jdGlvbkFybicsIHtcbiAgICAgIHZhbHVlOiBkYXRhU291cmNlc0Z1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LUJhY2tlbmQtRGF0YVNvdXJjZXNGdW5jdGlvbkFybicsXG4gICAgfSk7XG4gICAgXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0ZpbGVVcGxvYWRGdW5jdGlvbkFybicsIHtcbiAgICAgIHZhbHVlOiBmaWxlVXBsb2FkRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtQmFja2VuZC1GaWxlVXBsb2FkRnVuY3Rpb25Bcm4nLFxuICAgIH0pO1xuICAgIFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb21wYXJlV2l0aEF0aGVuYUZ1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IGNvbXBhcmVXaXRoQXRoZW5hRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtQmFja2VuZC1Db21wYXJlV2l0aEF0aGVuYUZ1bmN0aW9uQXJuJyxcbiAgICB9KTtcbiAgICBcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUm9sZU1hcHBlckZ1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IHJvbGVNYXBwZXJGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGV4cG9ydE5hbWU6ICdBcHBNb2RFeC1CYWNrZW5kLVJvbGVNYXBwZXJGdW5jdGlvbkFybicsXG4gICAgfSk7XG4gICAgXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1N0ZXBGdW5jdGlvblRyaWdnZXJGdW5jdGlvbkFybicsIHtcbiAgICAgIHZhbHVlOiBzdGVwRnVuY3Rpb25UcmlnZ2VyRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtQmFja2VuZC1TdGVwRnVuY3Rpb25UcmlnZ2VyRnVuY3Rpb25Bcm4nLFxuICAgIH0pO1xuICAgIFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQaWxvdElkZW50aWZpY2F0aW9uQXN5bmNGdW5jdGlvbkFybicsIHtcbiAgICAgIHZhbHVlOiBwaWxvdElkZW50aWZpY2F0aW9uQXN5bmNGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGV4cG9ydE5hbWU6ICdBcHBNb2RFeC1CYWNrZW5kLVBpbG90SWRlbnRpZmljYXRpb25Bc3luY0Z1bmN0aW9uQXJuJyxcbiAgICB9KTtcbiAgICBcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQmF0Y2hFeHRyYWN0b3JGdW5jdGlvbkFybicsIHtcbiAgICAgIHZhbHVlOiBiYXRjaEV4dHJhY3RvckZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LUJhY2tlbmQtQmF0Y2hFeHRyYWN0b3JGdW5jdGlvbkFybicsXG4gICAgfSk7XG4gICAgXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0F0aGVuYUxvb2t1cEZ1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IGF0aGVuYUxvb2t1cEZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LUJhY2tlbmQtQXRoZW5hTG9va3VwRnVuY3Rpb25Bcm4nLFxuICAgIH0pO1xuICAgIFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdCZWRyb2NrTm9ybWFsaXplckZ1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IGJlZHJvY2tOb3JtYWxpemVyRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtQmFja2VuZC1CZWRyb2NrTm9ybWFsaXplckZ1bmN0aW9uQXJuJyxcbiAgICB9KTtcbiAgICBcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTWFwcGluZ0FnZ3JlZ2F0b3JGdW5jdGlvbkFybicsIHtcbiAgICAgIHZhbHVlOiBtYXBwaW5nQWdncmVnYXRvckZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LUJhY2tlbmQtTWFwcGluZ0FnZ3JlZ2F0b3JGdW5jdGlvbkFybicsXG4gICAgfSk7XG4gICAgXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1N0YXR1c1RyYWNrZXJGdW5jdGlvbkFybicsIHtcbiAgICAgIHZhbHVlOiBzdGF0dXNUcmFja2VyRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtQmFja2VuZC1TdGF0dXNUcmFja2VyRnVuY3Rpb25Bcm4nLFxuICAgIH0pO1xuICAgIFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFcnJvckhhbmRsZXJGdW5jdGlvbkFybicsIHtcbiAgICAgIHZhbHVlOiBlcnJvckhhbmRsZXJGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGV4cG9ydE5hbWU6ICdBcHBNb2RFeC1CYWNrZW5kLUVycm9ySGFuZGxlckZ1bmN0aW9uQXJuJyxcbiAgICB9KTtcbiAgICBcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTWV0cmljc0Z1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IG1ldHJpY3NGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGV4cG9ydE5hbWU6ICdBcHBNb2RFeC1CYWNrZW5kLU1ldHJpY3NGdW5jdGlvbkFybicsXG4gICAgfSk7XG4gICAgXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RMUVByb2Nlc3NvckZ1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IGRscVByb2Nlc3NvckZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LUJhY2tlbmQtRExRUHJvY2Vzc29yRnVuY3Rpb25Bcm4nLFxuICAgIH0pO1xuICAgIFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcm9qZWN0RGF0YUZ1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IHByb2plY3REYXRhRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtQmFja2VuZC1Qcm9qZWN0RGF0YUZ1bmN0aW9uQXJuJyxcbiAgICB9KTtcbiAgICBcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnU2hhcmluZ0Z1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IHNoYXJpbmdGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGV4cG9ydE5hbWU6ICdBcHBNb2RFeC1CYWNrZW5kLVNoYXJpbmdGdW5jdGlvbkFybicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBwbGljYXRpb25TaW1pbGFyaXRpZXNGdW5jdGlvbkFybicsIHtcbiAgICAgIHZhbHVlOiBhcHBsaWNhdGlvblNpbWlsYXJpdGllc0Z1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LUJhY2tlbmQtQXBwbGljYXRpb25TaW1pbGFyaXRpZXNGdW5jdGlvbkFybicsXG4gICAgfSk7XG4gICAgXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NvbXBvbmVudFNpbWlsYXJpdGllc0Z1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IGNvbXBvbmVudFNpbWlsYXJpdGllc0Z1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LUJhY2tlbmQtQ29tcG9uZW50U2ltaWxhcml0aWVzRnVuY3Rpb25Bcm4nLFxuICAgIH0pO1xuICAgIFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQaWxvdElkZW50aWZpY2F0aW9uRnVuY3Rpb25Bcm4nLCB7XG4gICAgICB2YWx1ZTogcGlsb3RJZGVudGlmaWNhdGlvbkZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LUJhY2tlbmQtUGlsb3RJZGVudGlmaWNhdGlvbkZ1bmN0aW9uQXJuJyxcbiAgICB9KTtcbiAgICBcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUGlsb3RHYXRoZXJDb250ZXh0RnVuY3Rpb25Bcm4nLCB7XG4gICAgICB2YWx1ZTogcGlsb3RHYXRoZXJDb250ZXh0RnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtQmFja2VuZC1QaWxvdEdhdGhlckNvbnRleHRGdW5jdGlvbkFybicsXG4gICAgfSk7XG4gICAgXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1BpbG90QUlFbmhhbmNlRnVuY3Rpb25Bcm4nLCB7XG4gICAgICB2YWx1ZTogcGlsb3RBSUVuaGFuY2VGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGV4cG9ydE5hbWU6ICdBcHBNb2RFeC1CYWNrZW5kLVBpbG90QUlFbmhhbmNlRnVuY3Rpb25Bcm4nLFxuICAgIH0pO1xuICAgIFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQaWxvdENvbWJpbmVTY29yZXNGdW5jdGlvbkFybicsIHtcbiAgICAgIHZhbHVlOiBwaWxvdENvbWJpbmVTY29yZXNGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGV4cG9ydE5hbWU6ICdBcHBNb2RFeC1CYWNrZW5kLVBpbG90Q29tYmluZVNjb3Jlc0Z1bmN0aW9uQXJuJyxcbiAgICB9KTtcblxuICAgIC8vID09PT09IENPREVCVUlMRCBQUk9KRUNUID09PT09XG4gICAgXG4gICAgLy8gQ29kZUJ1aWxkIHByb2plY3QgZm9yIHByb2plY3QgcHJvdmlzaW9uaW5nIC0gZGVwbG95cyBwcm9qZWN0LXNwZWNpZmljIGluZnJhc3RydWN0dXJlXG4gICAgdGhpcy5jb2RlQnVpbGRQcm9qZWN0ID0gbmV3IGNvZGVidWlsZC5Qcm9qZWN0KHRoaXMsICdQcm9qZWN0UHJvdmlzaW9uaW5nUHJvamVjdCcsIHtcbiAgICAgIHByb2plY3ROYW1lOiAnYXBwLW1vZGV4LXByb2plY3QtcHJvdmlzaW9uaW5nJyxcbiAgICAgIHNvdXJjZTogY29kZWJ1aWxkLlNvdXJjZS5zMyh7XG4gICAgICAgIGJ1Y2tldDogZGVwbG95bWVudEJ1Y2tldCxcbiAgICAgICAgcGF0aDogJ2J1aWxkc3BlYy1zb3VyY2UuemlwJyxcbiAgICAgIH0pLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgYnVpbGRJbWFnZTogY29kZWJ1aWxkLkxpbnV4QnVpbGRJbWFnZS5TVEFOREFSRF81XzAsXG4gICAgICAgIHByaXZpbGVnZWQ6IHRydWUsXG4gICAgICB9LFxuICAgICAgYnVpbGRTcGVjOiBjb2RlYnVpbGQuQnVpbGRTcGVjLmZyb21Bc3NldCgnLi9idWlsZHNwZWMueW1sJyksXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgQ0RLIERlcGxveW1lbnQgUm9sZSB3aXRoIGVsZXZhdGVkIHBlcm1pc3Npb25zIChsZWFzdC1wcml2aWxlZ2UgdmlhIHJvbGUgY2hhaW5pbmcpXG4gICAgY29uc3QgY2RrRGVwbG95bWVudFJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0NES0RlcGxveW1lbnRSb2xlJywge1xuICAgICAgcm9sZU5hbWU6ICdhcHAtbW9kZXgtY2RrLWRlcGxveW1lbnQtcm9sZScsXG4gICAgICBhc3N1bWVkQnk6IHRoaXMuY29kZUJ1aWxkUHJvamVjdC5yb2xlISxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUm9sZSBmb3IgQ29kZUJ1aWxkIHRvIGFzc3VtZSB3aGVuIGRlcGxveWluZyBDREsgc3RhY2tzJ1xuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgQ0RLIERlcGxveW1lbnQgUm9sZSBwZXJtaXNzaW9ucyBmb3IgQ2xvdWRGb3JtYXRpb24gb3BlcmF0aW9uc1xuICAgIGNka0RlcGxveW1lbnRSb2xlLmFkZFRvUHJpbmNpcGFsUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkNyZWF0ZVN0YWNrJyxcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOlVwZGF0ZVN0YWNrJyxcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlbGV0ZVN0YWNrJyxcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlc2NyaWJlU3RhY2tzJyxcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlc2NyaWJlU3RhY2tFdmVudHMnLFxuICAgICAgICAnY2xvdWRmb3JtYXRpb246RGVzY3JpYmVTdGFja1Jlc291cmNlJyxcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlc2NyaWJlU3RhY2tSZXNvdXJjZXMnLFxuICAgICAgICAnY2xvdWRmb3JtYXRpb246R2V0VGVtcGxhdGUnLFxuICAgICAgICAnY2xvdWRmb3JtYXRpb246TGlzdFN0YWNrcycsXG4gICAgICAgICdjbG91ZGZvcm1hdGlvbjpMaXN0U3RhY2tSZXNvdXJjZXMnLFxuICAgICAgICAnY2xvdWRmb3JtYXRpb246VmFsaWRhdGVUZW1wbGF0ZScsXG4gICAgICAgICdjbG91ZGZvcm1hdGlvbjpDcmVhdGVDaGFuZ2VTZXQnLFxuICAgICAgICAnY2xvdWRmb3JtYXRpb246RGVzY3JpYmVDaGFuZ2VTZXQnLFxuICAgICAgICAnY2xvdWRmb3JtYXRpb246RXhlY3V0ZUNoYW5nZVNldCcsXG4gICAgICAgICdjbG91ZGZvcm1hdGlvbjpEZWxldGVDaGFuZ2VTZXQnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6Y2xvdWRmb3JtYXRpb246JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnN0YWNrL0FwcC1Nb2RFeC1Qcm9qZWN0LSpgXVxuICAgIH0pKTtcblxuICAgIC8vIEdyYW50IENESyBEZXBsb3ltZW50IFJvbGUgcGVybWlzc2lvbnMgZm9yIFMzIG9wZXJhdGlvbnNcbiAgICAvLyBJTkNMVURFUyBzMzpHZXRCdWNrZXRBY2wgYW5kIHMzOkdldEJ1Y2tldExvY2F0aW9uIGZvciBidWNrZXQgb3duZXJzaGlwIHZlcmlmaWNhdGlvblxuICAgIGNka0RlcGxveW1lbnRSb2xlLmFkZFRvUHJpbmNpcGFsUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3MzOkNyZWF0ZUJ1Y2tldCcsXG4gICAgICAgICdzMzpEZWxldGVCdWNrZXQnLFxuICAgICAgICAnczM6R2V0QnVja2V0TG9jYXRpb24nLFxuICAgICAgICAnczM6R2V0QnVja2V0QWNsJyxcbiAgICAgICAgJ3MzOkdldEJ1Y2tldFZlcnNpb25pbmcnLFxuICAgICAgICAnczM6UHV0QnVja2V0VmVyc2lvbmluZycsXG4gICAgICAgICdzMzpQdXRCdWNrZXRQb2xpY3knLFxuICAgICAgICAnczM6R2V0QnVja2V0UG9saWN5JyxcbiAgICAgICAgJ3MzOkRlbGV0ZUJ1Y2tldFBvbGljeScsXG4gICAgICAgICdzMzpQdXRCdWNrZXRQdWJsaWNBY2Nlc3NCbG9jaycsXG4gICAgICAgICdzMzpHZXRCdWNrZXRQdWJsaWNBY2Nlc3NCbG9jaycsXG4gICAgICAgICdzMzpQdXRCdWNrZXRMb2dnaW5nJyxcbiAgICAgICAgJ3MzOkdldEJ1Y2tldExvZ2dpbmcnLFxuICAgICAgICAnczM6UHV0QnVja2V0Q29ycycsXG4gICAgICAgICdzMzpHZXRCdWNrZXRDb3JzJyxcbiAgICAgICAgJ3MzOlB1dEJ1Y2tldExpZmVjeWNsZUNvbmZpZ3VyYXRpb24nLFxuICAgICAgICAnczM6R2V0QnVja2V0TGlmZWN5Y2xlQ29uZmlndXJhdGlvbicsXG4gICAgICAgICdzMzpQdXRPYmplY3QnLFxuICAgICAgICAnczM6R2V0T2JqZWN0JyxcbiAgICAgICAgJ3MzOkRlbGV0ZU9iamVjdCcsXG4gICAgICAgICdzMzpMaXN0QnVja2V0J1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpzMzo6OmFwcC1tb2RleC1kYXRhLSpgLFxuICAgICAgICBgYXJuOmF3czpzMzo6OmFwcC1tb2RleC1yZXN1bHRzLSpgLFxuICAgICAgICBgYXJuOmF3czpzMzo6OmFwcC1tb2RleC1kYXRhLSovKmAsXG4gICAgICAgIGBhcm46YXdzOnMzOjo6YXBwLW1vZGV4LXJlc3VsdHMtKi8qYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIEdyYW50IENESyBEZXBsb3ltZW50IFJvbGUgcGVybWlzc2lvbnMgZm9yIElBTSBvcGVyYXRpb25zIChwcm9qZWN0LXNwZWNpZmljIHJvbGVzKVxuICAgIC8vIFJFUVVJUkVTIHBlcm1pc3Npb25zIGJvdW5kYXJ5IHRvIHByZXZlbnQgcHJpdmlsZWdlIGVzY2FsYXRpb25cbiAgICBjZGtEZXBsb3ltZW50Um9sZS5hZGRUb1ByaW5jaXBhbFBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdpYW06Q3JlYXRlUm9sZScsXG4gICAgICAgICdpYW06RGVsZXRlUm9sZScsXG4gICAgICAgICdpYW06R2V0Um9sZScsXG4gICAgICAgICdpYW06UHV0Um9sZVBvbGljeScsXG4gICAgICAgICdpYW06RGVsZXRlUm9sZVBvbGljeScsXG4gICAgICAgICdpYW06QXR0YWNoUm9sZVBvbGljeScsXG4gICAgICAgICdpYW06RGV0YWNoUm9sZVBvbGljeScsXG4gICAgICAgICdpYW06TGlzdFJvbGVQb2xpY2llcycsXG4gICAgICAgICdpYW06TGlzdEF0dGFjaGVkUm9sZVBvbGljaWVzJyxcbiAgICAgICAgJ2lhbTpQYXNzUm9sZSdcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czppYW06OiR7dGhpcy5hY2NvdW50fTpyb2xlL2FwcC1tb2RleC1wcm9qLSpgXSxcbiAgICAgIGNvbmRpdGlvbnM6IHtcbiAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgJ2lhbTpQZXJtaXNzaW9uc0JvdW5kYXJ5JzogcGVybWlzc2lvbnNCb3VuZGFyeS5tYW5hZ2VkUG9saWN5QXJuXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSk7XG5cbiAgICAvLyBHcmFudCBDREsgRGVwbG95bWVudCBSb2xlIHBlcm1pc3Npb25zIGZvciBEeW5hbW9EQiBvcGVyYXRpb25zXG4gICAgY2RrRGVwbG95bWVudFJvbGUuYWRkVG9QcmluY2lwYWxQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6Q3JlYXRlVGFibGUnLFxuICAgICAgICAnZHluYW1vZGI6RGVsZXRlVGFibGUnLFxuICAgICAgICAnZHluYW1vZGI6RGVzY3JpYmVUYWJsZScsXG4gICAgICAgICdkeW5hbW9kYjpVcGRhdGVUYWJsZScsXG4gICAgICAgICdkeW5hbW9kYjpDcmVhdGVHbG9iYWxTZWNvbmRhcnlJbmRleCcsXG4gICAgICAgICdkeW5hbW9kYjpEZWxldGVHbG9iYWxTZWNvbmRhcnlJbmRleCcsXG4gICAgICAgICdkeW5hbW9kYjpVcGRhdGVHbG9iYWxTZWNvbmRhcnlJbmRleCcsXG4gICAgICAgICdkeW5hbW9kYjpMaXN0VGFibGVzJyxcbiAgICAgICAgJ2R5bmFtb2RiOkxpc3RUYWdzT2ZSZXNvdXJjZScsXG4gICAgICAgICdkeW5hbW9kYjpUYWdSZXNvdXJjZScsXG4gICAgICAgICdkeW5hbW9kYjpVbnRhZ1Jlc291cmNlJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmR5bmFtb2RiOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS9hcHAtbW9kZXgtKmBdXG4gICAgfSkpO1xuXG4gICAgLy8gR3JhbnQgQ0RLIERlcGxveW1lbnQgUm9sZSBwZXJtaXNzaW9ucyBmb3IgR2x1ZSBvcGVyYXRpb25zXG4gICAgY2RrRGVwbG95bWVudFJvbGUuYWRkVG9QcmluY2lwYWxQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZ2x1ZTpDcmVhdGVEYXRhYmFzZScsXG4gICAgICAgICdnbHVlOkRlbGV0ZURhdGFiYXNlJyxcbiAgICAgICAgJ2dsdWU6R2V0RGF0YWJhc2UnLFxuICAgICAgICAnZ2x1ZTpHZXREYXRhYmFzZXMnLFxuICAgICAgICAnZ2x1ZTpVcGRhdGVEYXRhYmFzZScsXG4gICAgICAgICdnbHVlOkNyZWF0ZVRhYmxlJyxcbiAgICAgICAgJ2dsdWU6RGVsZXRlVGFibGUnLFxuICAgICAgICAnZ2x1ZTpHZXRUYWJsZScsXG4gICAgICAgICdnbHVlOlVwZGF0ZVRhYmxlJyxcbiAgICAgICAgJ2dsdWU6R2V0UGFydGl0aW9uJyxcbiAgICAgICAgJ2dsdWU6R2V0UGFydGl0aW9ucycsXG4gICAgICAgICdnbHVlOkNyZWF0ZVBhcnRpdGlvbicsXG4gICAgICAgICdnbHVlOkRlbGV0ZVBhcnRpdGlvbicsXG4gICAgICAgICdnbHVlOlVwZGF0ZVBhcnRpdGlvbicsXG4gICAgICAgICdnbHVlOkJhdGNoQ3JlYXRlUGFydGl0aW9uJyxcbiAgICAgICAgJ2dsdWU6QmF0Y2hEZWxldGVQYXJ0aXRpb24nLFxuICAgICAgICAnZ2x1ZTpCYXRjaFVwZGF0ZVBhcnRpdGlvbidcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6Z2x1ZToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06Y2F0YWxvZ2AsXG4gICAgICAgIGBhcm46YXdzOmdsdWU6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmRhdGFiYXNlL2FwcF9tb2RleF8qYCxcbiAgICAgICAgYGFybjphd3M6Z2x1ZToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06ZGF0YWJhc2UvYXBwLW1vZGV4LSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICAgIGBhcm46YXdzOmdsdWU6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcF9tb2RleF8qLypgLFxuICAgICAgICBgYXJuOmF3czpnbHVlOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS9hcHAtbW9kZXgtJHt0aGlzLmFjY291bnR9LypgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgLy8gR3JhbnQgQ0RLIERlcGxveW1lbnQgUm9sZSBwZXJtaXNzaW9ucyBmb3IgQXRoZW5hIG9wZXJhdGlvbnMgKHZpZXcgY3JlYXRpb24pXG4gICAgY2RrRGVwbG95bWVudFJvbGUuYWRkVG9QcmluY2lwYWxQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnYXRoZW5hOlN0YXJ0UXVlcnlFeGVjdXRpb24nLFxuICAgICAgICAnYXRoZW5hOkdldFF1ZXJ5RXhlY3V0aW9uJyxcbiAgICAgICAgJ2F0aGVuYTpHZXRRdWVyeVJlc3VsdHMnLFxuICAgICAgICAnYXRoZW5hOkdldFdvcmtHcm91cCcsXG4gICAgICAgICdhdGhlbmE6U3RvcFF1ZXJ5RXhlY3V0aW9uJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czphdGhlbmE6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9Ondvcmtncm91cC9hcHAtbW9kZXgtd29ya2dyb3VwLSpgLFxuICAgICAgICAnKicgLy8gUXVlcnkgZXhlY3V0aW9uIEFSTnMgYXJlIGR5bmFtaWMgYW5kIGNhbm5vdCBiZSBwcmVkaWN0ZWRcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBHcmFudCBDREsgRGVwbG95bWVudCBSb2xlIHBlcm1pc3Npb25zIGZvciBMYW1iZGEgb3BlcmF0aW9uc1xuICAgIGNka0RlcGxveW1lbnRSb2xlLmFkZFRvUHJpbmNpcGFsUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2xhbWJkYTpDcmVhdGVGdW5jdGlvbicsXG4gICAgICAgICdsYW1iZGE6RGVsZXRlRnVuY3Rpb24nLFxuICAgICAgICAnbGFtYmRhOkdldEZ1bmN0aW9uJyxcbiAgICAgICAgJ2xhbWJkYTpVcGRhdGVGdW5jdGlvbkNvZGUnLFxuICAgICAgICAnbGFtYmRhOlVwZGF0ZUZ1bmN0aW9uQ29uZmlndXJhdGlvbicsXG4gICAgICAgICdsYW1iZGE6QWRkUGVybWlzc2lvbicsXG4gICAgICAgICdsYW1iZGE6UmVtb3ZlUGVybWlzc2lvbicsXG4gICAgICAgICdsYW1iZGE6TGlzdEZ1bmN0aW9ucycsXG4gICAgICAgICdsYW1iZGE6VGFnUmVzb3VyY2UnLFxuICAgICAgICAnbGFtYmRhOlVudGFnUmVzb3VyY2UnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6bGFtYmRhOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpmdW5jdGlvbjphcHAtbW9kZXgtKmBdXG4gICAgfSkpO1xuXG4gICAgLy8gR3JhbnQgQ0RLIERlcGxveW1lbnQgUm9sZSBwZXJtaXNzaW9ucyBmb3IgU1NNIChDREsgYm9vdHN0cmFwIHZlcnNpb24gY2hlY2spXG4gICAgY2RrRGVwbG95bWVudFJvbGUuYWRkVG9QcmluY2lwYWxQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogWydzc206R2V0UGFyYW1ldGVyJ10sXG4gICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpzc206JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnBhcmFtZXRlci9jZGstYm9vdHN0cmFwLypgXVxuICAgIH0pKTtcblxuICAgIC8vIEdyYW50IENESyBEZXBsb3ltZW50IFJvbGUgcGVybWlzc2lvbnMgZm9yIENsb3VkV2F0Y2ggTG9nc1xuICAgIGNka0RlcGxveW1lbnRSb2xlLmFkZFRvUHJpbmNpcGFsUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nR3JvdXAnLFxuICAgICAgICAnbG9nczpEZWxldGVMb2dHcm91cCcsXG4gICAgICAgICdsb2dzOkRlc2NyaWJlTG9nR3JvdXBzJyxcbiAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nU3RyZWFtJyxcbiAgICAgICAgJ2xvZ3M6RGVsZXRlTG9nU3RyZWFtJyxcbiAgICAgICAgJ2xvZ3M6UHV0UmV0ZW50aW9uUG9saWN5J1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmxvZ3M6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmxvZy1ncm91cDovYXdzL2xhbWJkYS9hcHAtbW9kZXgtKmBdXG4gICAgfSkpO1xuXG4gICAgLy8gR3JhbnQgQ0RLIERlcGxveW1lbnQgUm9sZSBwZXJtaXNzaW9ucyBmb3IgU05TIChub3RpZmljYXRpb25zKVxuICAgIGNka0RlcGxveW1lbnRSb2xlLmFkZFRvUHJpbmNpcGFsUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3NuczpDcmVhdGVUb3BpYycsXG4gICAgICAgICdzbnM6RGVsZXRlVG9waWMnLFxuICAgICAgICAnc25zOkdldFRvcGljQXR0cmlidXRlcycsXG4gICAgICAgICdzbnM6U2V0VG9waWNBdHRyaWJ1dGVzJyxcbiAgICAgICAgJ3NuczpTdWJzY3JpYmUnLFxuICAgICAgICAnc25zOlVuc3Vic2NyaWJlJyxcbiAgICAgICAgJ3NuczpMaXN0U3Vic2NyaXB0aW9uc0J5VG9waWMnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6c25zOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTphcHAtbW9kZXgtKmBdXG4gICAgfSkpO1xuXG4gICAgLy8gR3JhbnQgQ0RLIERlcGxveW1lbnQgUm9sZSBwZXJtaXNzaW9ucyBmb3IgU1FTIChxdWV1ZXMpXG4gICAgY2RrRGVwbG95bWVudFJvbGUuYWRkVG9QcmluY2lwYWxQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnc3FzOkNyZWF0ZVF1ZXVlJyxcbiAgICAgICAgJ3NxczpEZWxldGVRdWV1ZScsXG4gICAgICAgICdzcXM6R2V0UXVldWVBdHRyaWJ1dGVzJyxcbiAgICAgICAgJ3NxczpTZXRRdWV1ZUF0dHJpYnV0ZXMnLFxuICAgICAgICAnc3FzOkxpc3RRdWV1ZXMnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6c3FzOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTphcHAtbW9kZXgtKmBdXG4gICAgfSkpO1xuXG4gICAgLy8gR3JhbnQgQ0RLIERlcGxveW1lbnQgUm9sZSBwZXJtaXNzaW9ucyBmb3IgU3RlcCBGdW5jdGlvbnNcbiAgICBjZGtEZXBsb3ltZW50Um9sZS5hZGRUb1ByaW5jaXBhbFBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdzdGF0ZXM6Q3JlYXRlU3RhdGVNYWNoaW5lJyxcbiAgICAgICAgJ3N0YXRlczpEZWxldGVTdGF0ZU1hY2hpbmUnLFxuICAgICAgICAnc3RhdGVzOkRlc2NyaWJlU3RhdGVNYWNoaW5lJyxcbiAgICAgICAgJ3N0YXRlczpVcGRhdGVTdGF0ZU1hY2hpbmUnLFxuICAgICAgICAnc3RhdGVzOkxpc3RTdGF0ZU1hY2hpbmVzJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOnN0YXRlczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06c3RhdGVNYWNoaW5lOipgXVxuICAgIH0pKTtcblxuICAgIC8vIEdyYW50IENESyBEZXBsb3ltZW50IFJvbGUgcGVybWlzc2lvbnMgZm9yIENESyBib290c3RyYXAgYnVja2V0IChhc3NldCBwdWJsaXNoaW5nKVxuICAgIGNka0RlcGxveW1lbnRSb2xlLmFkZFRvUHJpbmNpcGFsUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICdzMzpQdXRPYmplY3QnLFxuICAgICAgICAnczM6R2V0T2JqZWN0VmVyc2lvbicsXG4gICAgICAgICdzMzpMaXN0QnVja2V0JyxcbiAgICAgICAgJ3MzOkdldEJ1Y2tldFZlcnNpb25pbmcnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOnMzOjo6Y2RrLWhuYjY1OWZkcy1hc3NldHMtJHt0aGlzLmFjY291bnR9LSR7dGhpcy5yZWdpb259YCxcbiAgICAgICAgYGFybjphd3M6czM6OjpjZGstaG5iNjU5ZmRzLWFzc2V0cy0ke3RoaXMuYWNjb3VudH0tJHt0aGlzLnJlZ2lvbn0vKmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBHcmFudCBDREsgRGVwbG95bWVudCBSb2xlIHBlcm1pc3Npb25zIHRvIGFzc3VtZSBDREsgZmlsZSBwdWJsaXNoaW5nIHJvbGVcbiAgICBjZGtEZXBsb3ltZW50Um9sZS5hZGRUb1ByaW5jaXBhbFBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbJ3N0czpBc3N1bWVSb2xlJ10sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6aWFtOjoke3RoaXMuYWNjb3VudH06cm9sZS9jZGstaG5iNjU5ZmRzLWZpbGUtcHVibGlzaGluZy1yb2xlLSR7dGhpcy5hY2NvdW50fS0ke3RoaXMucmVnaW9ufWBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBHcmFudCBDREsgRGVwbG95bWVudCBSb2xlIHBlcm1pc3Npb25zIHRvIHBhc3MgQ2xvdWRGb3JtYXRpb24gZXhlY3V0aW9uIHJvbGVcbiAgICBjZGtEZXBsb3ltZW50Um9sZS5hZGRUb1ByaW5jaXBhbFBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbJ2lhbTpQYXNzUm9sZSddLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmlhbTo6JHt0aGlzLmFjY291bnR9OnJvbGUvY2RrLWhuYjY1OWZkcy1jZm4tZXhlYy1yb2xlLSR7dGhpcy5hY2NvdW50fS0ke3RoaXMucmVnaW9ufWBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBDcmVhdGUgQ0RLIERlc3Ryb3kgUm9sZSB3aXRoIGRlbGV0aW9uLW9ubHkgcGVybWlzc2lvbnMgKGxlYXN0LXByaXZpbGVnZSlcbiAgICBjb25zdCBjZGtEZXN0cm95Um9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnQ0RLRGVzdHJveVJvbGUnLCB7XG4gICAgICByb2xlTmFtZTogJ2FwcC1tb2RleC1jZGstZGVzdHJveS1yb2xlJyxcbiAgICAgIGFzc3VtZWRCeTogdGhpcy5jb2RlQnVpbGRQcm9qZWN0LnJvbGUhLFxuICAgICAgZGVzY3JpcHRpb246ICdSb2xlIGZvciBDb2RlQnVpbGQgdG8gYXNzdW1lIHdoZW4gZGVzdHJveWluZyBDREsgc3RhY2tzJ1xuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgQ0RLIERlc3Ryb3kgUm9sZSBwZXJtaXNzaW9ucyBmb3IgQ2xvdWRGb3JtYXRpb24gZGVsZXRpb24gb3BlcmF0aW9uc1xuICAgIGNka0Rlc3Ryb3lSb2xlLmFkZFRvUHJpbmNpcGFsUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlbGV0ZVN0YWNrJyxcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlc2NyaWJlU3RhY2tzJyxcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlc2NyaWJlU3RhY2tFdmVudHMnLFxuICAgICAgICAnY2xvdWRmb3JtYXRpb246RGVzY3JpYmVTdGFja1Jlc291cmNlJyxcbiAgICAgICAgJ2Nsb3VkZm9ybWF0aW9uOkRlc2NyaWJlU3RhY2tSZXNvdXJjZXMnLFxuICAgICAgICAnY2xvdWRmb3JtYXRpb246TGlzdFN0YWNrcycsXG4gICAgICAgICdjbG91ZGZvcm1hdGlvbjpMaXN0U3RhY2tSZXNvdXJjZXMnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6Y2xvdWRmb3JtYXRpb246JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnN0YWNrL0FwcC1Nb2RFeC1Qcm9qZWN0LSpgXVxuICAgIH0pKTtcblxuICAgIC8vIEdyYW50IENESyBEZXN0cm95IFJvbGUgcGVybWlzc2lvbnMgZm9yIFMzIGRlbGV0aW9uIG9wZXJhdGlvbnMgKGVtcHR5IGJ1Y2tldHMgYmVmb3JlIGRlbGV0aW9uKVxuICAgIGNka0Rlc3Ryb3lSb2xlLmFkZFRvUHJpbmNpcGFsUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3MzOkRlbGV0ZUJ1Y2tldCcsXG4gICAgICAgICdzMzpEZWxldGVPYmplY3QnLFxuICAgICAgICAnczM6RGVsZXRlT2JqZWN0VmVyc2lvbicsXG4gICAgICAgICdzMzpMaXN0QnVja2V0JyxcbiAgICAgICAgJ3MzOkxpc3RCdWNrZXRWZXJzaW9ucycsXG4gICAgICAgICdzMzpHZXRCdWNrZXRWZXJzaW9uaW5nJyxcbiAgICAgICAgJ3MzOkdldEJ1Y2tldExvY2F0aW9uJyxcbiAgICAgICAgJ3MzOkdldE9iamVjdCdcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6czM6OjphcHAtbW9kZXgtZGF0YS0qYCxcbiAgICAgICAgYGFybjphd3M6czM6OjphcHAtbW9kZXgtcmVzdWx0cy0qYCxcbiAgICAgICAgYGFybjphd3M6czM6OjphcHAtbW9kZXgtZGF0YS0qLypgLFxuICAgICAgICBgYXJuOmF3czpzMzo6OmFwcC1tb2RleC1yZXN1bHRzLSovKmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBHcmFudCBDREsgRGVzdHJveSBSb2xlIHBlcm1pc3Npb25zIGZvciBJQU0gcm9sZSBkZWxldGlvbiAocHJvamVjdC1zcGVjaWZpYyByb2xlcylcbiAgICBjZGtEZXN0cm95Um9sZS5hZGRUb1ByaW5jaXBhbFBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdpYW06RGVsZXRlUm9sZScsXG4gICAgICAgICdpYW06R2V0Um9sZScsXG4gICAgICAgICdpYW06RGVsZXRlUm9sZVBvbGljeScsXG4gICAgICAgICdpYW06RGV0YWNoUm9sZVBvbGljeScsXG4gICAgICAgICdpYW06TGlzdFJvbGVQb2xpY2llcycsXG4gICAgICAgICdpYW06TGlzdEF0dGFjaGVkUm9sZVBvbGljaWVzJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmlhbTo6JHt0aGlzLmFjY291bnR9OnJvbGUvYXBwLW1vZGV4LXByb2otKmBdXG4gICAgfSkpO1xuXG4gICAgLy8gR3JhbnQgQ0RLIERlc3Ryb3kgUm9sZSBwZXJtaXNzaW9ucyBmb3IgRHluYW1vREIgZGVsZXRpb25cbiAgICBjZGtEZXN0cm95Um9sZS5hZGRUb1ByaW5jaXBhbFBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdkeW5hbW9kYjpEZWxldGVUYWJsZScsXG4gICAgICAgICdkeW5hbW9kYjpEZXNjcmliZVRhYmxlJyxcbiAgICAgICAgJ2R5bmFtb2RiOkxpc3RUYWJsZXMnXG4gICAgICBdLFxuICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6ZHluYW1vZGI6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnRhYmxlL2FwcC1tb2RleC0qYF1cbiAgICB9KSk7XG5cbiAgICAvLyBHcmFudCBDREsgRGVzdHJveSBSb2xlIHBlcm1pc3Npb25zIGZvciBHbHVlIGRlbGV0aW9uXG4gICAgY2RrRGVzdHJveVJvbGUuYWRkVG9QcmluY2lwYWxQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZ2x1ZTpEZWxldGVEYXRhYmFzZScsXG4gICAgICAgICdnbHVlOkdldERhdGFiYXNlJyxcbiAgICAgICAgJ2dsdWU6RGVsZXRlVGFibGUnLFxuICAgICAgICAnZ2x1ZTpHZXRUYWJsZScsXG4gICAgICAgICdnbHVlOkRlbGV0ZVBhcnRpdGlvbicsXG4gICAgICAgICdnbHVlOkdldFBhcnRpdGlvbicsXG4gICAgICAgICdnbHVlOkdldFBhcnRpdGlvbnMnLFxuICAgICAgICAnZ2x1ZTpCYXRjaERlbGV0ZVBhcnRpdGlvbidcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6Z2x1ZToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06Y2F0YWxvZ2AsXG4gICAgICAgIGBhcm46YXdzOmdsdWU6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmRhdGFiYXNlL2FwcF9tb2RleF8qYCxcbiAgICAgICAgYGFybjphd3M6Z2x1ZToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06dGFibGUvYXBwX21vZGV4XyovKmBcbiAgICAgIF1cbiAgICB9KSk7XG5cbiAgICAvLyBHcmFudCBDREsgRGVzdHJveSBSb2xlIHBlcm1pc3Npb25zIGZvciBMYW1iZGEgZGVsZXRpb25cbiAgICBjZGtEZXN0cm95Um9sZS5hZGRUb1ByaW5jaXBhbFBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdsYW1iZGE6RGVsZXRlRnVuY3Rpb24nLFxuICAgICAgICAnbGFtYmRhOkdldEZ1bmN0aW9uJyxcbiAgICAgICAgJ2xhbWJkYTpMaXN0RnVuY3Rpb25zJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOmxhbWJkYToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06ZnVuY3Rpb246YXBwLW1vZGV4LSpgXVxuICAgIH0pKTtcblxuICAgIC8vIEdyYW50IENESyBEZXN0cm95IFJvbGUgcGVybWlzc2lvbnMgZm9yIENsb3VkV2F0Y2ggTG9ncyBkZWxldGlvblxuICAgIGNka0Rlc3Ryb3lSb2xlLmFkZFRvUHJpbmNpcGFsUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2xvZ3M6RGVsZXRlTG9nR3JvdXAnLFxuICAgICAgICAnbG9nczpEZXNjcmliZUxvZ0dyb3VwcydcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpsb2dzOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpsb2ctZ3JvdXA6L2F3cy9sYW1iZGEvYXBwLW1vZGV4LSpgXVxuICAgIH0pKTtcblxuICAgIC8vIEdyYW50IENESyBEZXN0cm95IFJvbGUgcGVybWlzc2lvbnMgZm9yIFNOUyBkZWxldGlvblxuICAgIGNka0Rlc3Ryb3lSb2xlLmFkZFRvUHJpbmNpcGFsUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3NuczpEZWxldGVUb3BpYycsXG4gICAgICAgICdzbnM6R2V0VG9waWNBdHRyaWJ1dGVzJyxcbiAgICAgICAgJ3NuczpMaXN0U3Vic2NyaXB0aW9uc0J5VG9waWMnLFxuICAgICAgICAnc25zOlVuc3Vic2NyaWJlJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOnNuczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06YXBwLW1vZGV4LSpgXVxuICAgIH0pKTtcblxuICAgIC8vIEdyYW50IENESyBEZXN0cm95IFJvbGUgcGVybWlzc2lvbnMgZm9yIFNRUyBkZWxldGlvblxuICAgIGNka0Rlc3Ryb3lSb2xlLmFkZFRvUHJpbmNpcGFsUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3NxczpEZWxldGVRdWV1ZScsXG4gICAgICAgICdzcXM6R2V0UXVldWVBdHRyaWJ1dGVzJyxcbiAgICAgICAgJ3NxczpMaXN0UXVldWVzJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOnNxczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06YXBwLW1vZGV4LSpgXVxuICAgIH0pKTtcblxuICAgIC8vIEdyYW50IENESyBEZXN0cm95IFJvbGUgcGVybWlzc2lvbnMgZm9yIFN0ZXAgRnVuY3Rpb25zIGRlbGV0aW9uXG4gICAgY2RrRGVzdHJveVJvbGUuYWRkVG9QcmluY2lwYWxQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnc3RhdGVzOkRlbGV0ZVN0YXRlTWFjaGluZScsXG4gICAgICAgICdzdGF0ZXM6RGVzY3JpYmVTdGF0ZU1hY2hpbmUnLFxuICAgICAgICAnc3RhdGVzOkxpc3RTdGF0ZU1hY2hpbmVzJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOnN0YXRlczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06c3RhdGVNYWNoaW5lOipgXVxuICAgIH0pKTtcblxuICAgIC8vIEdyYW50IENESyBEZXN0cm95IFJvbGUgcGVybWlzc2lvbnMgdG8gcGFzcyBDbG91ZEZvcm1hdGlvbiBleGVjdXRpb24gcm9sZVxuICAgIGNka0Rlc3Ryb3lSb2xlLmFkZFRvUHJpbmNpcGFsUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFsnaWFtOlBhc3NSb2xlJ10sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6aWFtOjoke3RoaXMuYWNjb3VudH06cm9sZS9jZGstaG5iNjU5ZmRzLWNmbi1leGVjLXJvbGUtJHt0aGlzLmFjY291bnR9LSR7dGhpcy5yZWdpb259YFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIC8vIEdyYW50IENvZGVCdWlsZCByb2xlIG1pbmltYWwgcGVybWlzc2lvbnM6IGFzc3VtZSBib3RoIENESyBEZXBsb3ltZW50IFJvbGUgYW5kIENESyBEZXN0cm95IFJvbGVcbiAgICB0aGlzLmNvZGVCdWlsZFByb2plY3Qucm9sZSEuYWRkVG9QcmluY2lwYWxQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogWydzdHM6QXNzdW1lUm9sZSddLFxuICAgICAgcmVzb3VyY2VzOiBbY2RrRGVwbG95bWVudFJvbGUucm9sZUFybiwgY2RrRGVzdHJveVJvbGUucm9sZUFybl1cbiAgICB9KSk7XG5cbiAgICAvLyBHcmFudCBDb2RlQnVpbGQgcGVybWlzc2lvbnMgdG8gcmVhZCBkZXBsb3ltZW50IGJ1Y2tldCAoZm9yIGJ1aWxkc3BlYy1zb3VyY2UuemlwKVxuICAgIGRlcGxveW1lbnRCdWNrZXQuZ3JhbnRSZWFkKHRoaXMuY29kZUJ1aWxkUHJvamVjdC5yb2xlISk7XG4gICAgXG4gICAgLy8gR3JhbnQgQ29kZUJ1aWxkIHBlcm1pc3Npb25zIHRvIGFzc3VtZSBMYW1iZGEgZXhlY3V0aW9uIHJvbGUgKGZvciBleGlzdGluZyBvcGVyYXRpb25zKVxuICAgIGxhbWJkYUV4ZWN1dGlvblJvbGUuZ3JhbnRBc3N1bWVSb2xlKHRoaXMuY29kZUJ1aWxkUHJvamVjdC5yb2xlISk7XG5cbiAgICAvLyA9PT09PSBFVkVOVEJSSURHRSBSVUxFUyA9PT09PVxuICAgIFxuICAgIC8vIEV2ZW50QnJpZGdlIHJ1bGUgZm9yIENvZGVCdWlsZCBzdGF0ZSBjaGFuZ2VzXG4gICAgY29uc3QgY29kZUJ1aWxkU3RhdGVDaGFuZ2VSdWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdDb2RlQnVpbGRTdGF0ZUNoYW5nZVJ1bGUnLCB7XG4gICAgICBldmVudFBhdHRlcm46IHtcbiAgICAgICAgc291cmNlOiBbJ2F3cy5jb2RlYnVpbGQnXSxcbiAgICAgICAgZGV0YWlsVHlwZTogWydDb2RlQnVpbGQgQnVpbGQgU3RhdGUgQ2hhbmdlJ10sXG4gICAgICAgIGRldGFpbDoge1xuICAgICAgICAgICdidWlsZC1zdGF0dXMnOiBbJ1NVQ0NFRURFRCcsICdGQUlMRUQnLCAnU1RPUFBFRCddXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBkZXNjcmlwdGlvbjogJ1RyaWdnZXIgYnVpbGQgbW9uaXRvciB3aGVuIENvZGVCdWlsZCBwcm9qZWN0cyBjb21wbGV0ZScsXG4gICAgfSk7XG5cbiAgICAvLyBJbnZva2UgYnVpbGQtbW9uaXRvciBMYW1iZGEgd2hlbiBDb2RlQnVpbGQgY29tcGxldGVzXG4gICAgY29kZUJ1aWxkU3RhdGVDaGFuZ2VSdWxlLmFkZFRhcmdldChuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbihidWlsZE1vbml0b3JGdW5jdGlvbikpO1xuXG4gICAgLy8gPT09PT0gQ0xPVURXQVRDSCBBTEFSTVMgQU5EIFNOUyBUT1BJQyA9PT09PVxuICAgIFxuICAgIC8vIFNOUyBUb3BpYyBmb3IgYWxlcnRzXG4gICAgY29uc3QgYWxlcnRUb3BpYyA9IG5ldyBzbnMuVG9waWModGhpcywgJ0FsZXJ0VG9waWMnLCB7XG4gICAgICB0b3BpY05hbWU6ICdhcHAtbW9kZXgtYWxlcnRzJyxcbiAgICAgIGRpc3BsYXlOYW1lOiAnQXBwLU1vZEV4IEFsZXJ0cycsXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PSBCRURST0NLIE1PREVMIElOVk9DQVRJT04gTE9HR0lORyA9PT09PVxuXG4gICAgLy8gQ2xvdWRXYXRjaCBMb2cgR3JvdXAgZm9yIEJlZHJvY2sgaW52b2NhdGlvbnNcbiAgICBjb25zdCBiZWRyb2NrTG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnQmVkcm9ja0ludm9jYXRpb25Mb2dzJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiAnL2F3cy9iZWRyb2NrL21vZGVsaW52b2NhdGlvbnMnLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgcmVtb3ZhbFBvbGljeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cbiAgICAvLyBJQU0gUm9sZSBmb3IgQmVkcm9jayBsb2dnaW5nXG4gICAgY29uc3QgYmVkcm9ja0xvZ2dpbmdSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdCZWRyb2NrTG9nZ2luZ1JvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnYmVkcm9jay5hbWF6b25hd3MuY29tJyksXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBCZWRyb2NrTG9nZ2luZ1BvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBhY3Rpb25zOiBbJ2xvZ3M6Q3JlYXRlTG9nU3RyZWFtJywgJ2xvZ3M6UHV0TG9nRXZlbnRzJ10sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2Ake2JlZHJvY2tMb2dHcm91cC5sb2dHcm91cEFybn06KmBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGFjdGlvbnM6IFsnczM6UHV0T2JqZWN0J10sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2Ake2FjY2Vzc0xvZ3NCdWNrZXRBcm59L2JlZHJvY2staW52b2NhdGlvbnMvKmBdLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gRW5hYmxlIEJlZHJvY2sgTW9kZWwgSW52b2NhdGlvbiBMb2dnaW5nIChhY2NvdW50LWxldmVsKVxuICAgIC8vIE9ubHkgYXZhaWxhYmxlIGluIGNlcnRhaW4gcmVnaW9ucyAodXMtZWFzdC0xLCB1cy13ZXN0LTIsIGFwLXNvdXRoZWFzdC0xLCBhcC1ub3J0aGVhc3QtMSwgZXUtY2VudHJhbC0xKVxuICAgIGNvbnN0IGJlZHJvY2tMb2dnaW5nU3VwcG9ydGVkUmVnaW9ucyA9IFsndXMtZWFzdC0xJywgJ3VzLXdlc3QtMicsICdhcC1zb3V0aGVhc3QtMScsICdhcC1ub3J0aGVhc3QtMScsICdldS1jZW50cmFsLTEnXTtcbiAgICBcbiAgICBpZiAoYmVkcm9ja0xvZ2dpbmdTdXBwb3J0ZWRSZWdpb25zLmluY2x1ZGVzKHRoaXMucmVnaW9uKSkge1xuICAgICAgY29uc3QgYmVkcm9ja0xvZ2dpbmdDb25maWcgPSBuZXcgY2RrLkNmblJlc291cmNlKHRoaXMsICdCZWRyb2NrTG9nZ2luZ0NvbmZpZycsIHtcbiAgICAgICAgdHlwZTogJ0FXUzo6QmVkcm9jazo6TW9kZWxJbnZvY2F0aW9uTG9nZ2luZ0NvbmZpZ3VyYXRpb24nLFxuICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgTG9nZ2luZ0NvbmZpZzoge1xuICAgICAgICAgICAgQ2xvdWRXYXRjaENvbmZpZzoge1xuICAgICAgICAgICAgICBMb2dHcm91cE5hbWU6IGJlZHJvY2tMb2dHcm91cC5sb2dHcm91cE5hbWUsXG4gICAgICAgICAgICAgIFJvbGVBcm46IGJlZHJvY2tMb2dnaW5nUm9sZS5yb2xlQXJuLFxuICAgICAgICAgICAgICBMYXJnZURhdGFEZWxpdmVyeVMzQ29uZmlnOiB7XG4gICAgICAgICAgICAgICAgQnVja2V0TmFtZTogYWNjZXNzTG9nc0J1Y2tldE5hbWUsXG4gICAgICAgICAgICAgICAgS2V5UHJlZml4OiAnYmVkcm9jay1pbnZvY2F0aW9ucy8nLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFRleHREYXRhRGVsaXZlcnlFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgSW1hZ2VEYXRhRGVsaXZlcnlFbmFibGVkOiBmYWxzZSxcbiAgICAgICAgICAgIEVtYmVkZGluZ0RhdGFEZWxpdmVyeUVuYWJsZWQ6IGZhbHNlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgY2RrLlRhZ3Mub2YoYmVkcm9ja0xvZ2dpbmdDb25maWcpLmFkZCgnRW52aXJvbm1lbnQnLCBlbnZpcm9ubWVudCk7XG4gICAgICBjZGsuVGFncy5vZihiZWRyb2NrTG9nZ2luZ0NvbmZpZykuYWRkKCdNYW5hZ2VkQnknLCAnQ0RLJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIExvZyBhIHdhcm5pbmcgdGhhdCBCZWRyb2NrIGxvZ2dpbmcgaXMgbm90IGF2YWlsYWJsZSBpbiB0aGlzIHJlZ2lvblxuICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0JlZHJvY2tMb2dnaW5nV2FybmluZycsIHtcbiAgICAgICAgdmFsdWU6IGBCZWRyb2NrIE1vZGVsIEludm9jYXRpb24gTG9nZ2luZyBpcyBub3QgYXZhaWxhYmxlIGluICR7dGhpcy5yZWdpb259LiBTdXBwb3J0ZWQgcmVnaW9uczogJHtiZWRyb2NrTG9nZ2luZ1N1cHBvcnRlZFJlZ2lvbnMuam9pbignLCAnKX1gLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0JlZHJvY2sgTG9nZ2luZyBBdmFpbGFiaWxpdHkgV2FybmluZycsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyA9PT09PSBSRVNQT05TSUJMRSBBSSBNT05JVE9SSU5HIEFMQVJNUyA9PT09PVxuXG4gICAgLy8gQWxhcm0gZm9yIEJlZHJvY2sgaW52b2NhdGlvbiBlcnJvcnNcbiAgICBjb25zdCBiZWRyb2NrRXJyb3JBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdCZWRyb2NrRXJyb3JBbGFybScsIHtcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0JlZHJvY2snLFxuICAgICAgICBtZXRyaWNOYW1lOiAnSW52b2NhdGlvbkNsaWVudEVycm9ycycsXG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgIHBlcmlvZDogRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxMCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAyLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0IG9uIEJlZHJvY2sgaW52b2NhdGlvbiBlcnJvcnMnLFxuICAgICAgYWxhcm1OYW1lOiAnYXBwLW1vZGV4LWJlZHJvY2stZXJyb3JzJyxcbiAgICB9KTtcblxuICAgIGJlZHJvY2tFcnJvckFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24oYWxlcnRUb3BpYykpO1xuXG4gICAgLy8gQWxhcm0gZm9yIGhpZ2ggdG9rZW4gdXNhZ2UgKGNvc3QgY29udHJvbClcbiAgICBjb25zdCBiZWRyb2NrVG9rZW5BbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdCZWRyb2NrVG9rZW5BbGFybScsIHtcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0JlZHJvY2snLFxuICAgICAgICBtZXRyaWNOYW1lOiAnT3V0cHV0VG9rZW5Db3VudCcsXG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgIHBlcmlvZDogRHVyYXRpb24uaG91cnMoMSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMTAwMDAwLFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnQgb24gaGlnaCBCZWRyb2NrIHRva2VuIHVzYWdlJyxcbiAgICAgIGFsYXJtTmFtZTogJ2FwcC1tb2RleC1iZWRyb2NrLWhpZ2gtdG9rZW5zJyxcbiAgICB9KTtcblxuICAgIGJlZHJvY2tUb2tlbkFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24oYWxlcnRUb3BpYykpO1xuXG4gICAgLy8gQWxhcm0gZm9yIHRocm90dGxpbmcgKHJlc3BvbnNpYmxlIEFJIHBvbGljeSBhZGhlcmVuY2UpXG4gICAgY29uc3QgYmVkcm9ja1Rocm90dGxlQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnQmVkcm9ja1Rocm90dGxlQWxhcm0nLCB7XG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0FXUy9CZWRyb2NrJyxcbiAgICAgICAgbWV0cmljTmFtZTogJ0ludm9jYXRpb25UaHJvdHRsZXMnLFxuICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgICBwZXJpb2Q6IER1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogNSxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0FsZXJ0IG9uIEJlZHJvY2sgdGhyb3R0bGluZycsXG4gICAgICBhbGFybU5hbWU6ICdhcHAtbW9kZXgtYmVkcm9jay10aHJvdHRsZXMnLFxuICAgIH0pO1xuXG4gICAgYmVkcm9ja1Rocm90dGxlQWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbihhbGVydFRvcGljKSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIEFsYXJtIGZvciBMYW1iZGEgZXJyb3JzXG4gICAgY29uc3QgbGFtYmRhRXJyb3JBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdMYW1iZGFFcnJvckFsYXJtJywge1xuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6ICdBV1MvTGFtYmRhJyxcbiAgICAgICAgbWV0cmljTmFtZTogJ0Vycm9ycycsXG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgIHBlcmlvZDogRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA1LFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnQgd2hlbiBMYW1iZGEgZnVuY3Rpb25zIGhhdmUgZXJyb3JzJyxcbiAgICAgIGFsYXJtTmFtZTogJ2FwcC1tb2RleC1sYW1iZGEtZXJyb3JzJyxcbiAgICB9KTtcblxuICAgIGxhbWJkYUVycm9yQWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbihhbGVydFRvcGljKSk7XG4gICAgXG4gICAgLy8gQXNzaWduIG93bmVyIHRvIExhbWJkYSBlcnJvciBhbGFybSBmb3IgbW9uaXRvcmluZyByZXNwb25zaWJpbGl0eVxuICAgIGNkay5UYWdzLm9mKGxhbWJkYUVycm9yQWxhcm0pLmFkZCgnT3duZXInLCAncGxhdGZvcm0tdGVhbScpO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBBbGFybXMgZm9yIGFsbCBETFFzXG4gICAgY29uc3QgcHJvamVjdE9wc0RMUUFsYXJtID0gbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ1Byb2plY3RPcGVyYXRpb25zRExRQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6ICdhcHAtbW9kZXgtcHJvamVjdC1vcGVyYXRpb25zLWRscS1tZXNzYWdlcycsXG4gICAgICBtZXRyaWM6IHByb2plY3RPcGVyYXRpb25zRExRLm1ldHJpY0FwcHJveGltYXRlTnVtYmVyT2ZNZXNzYWdlc1Zpc2libGUoKSxcbiAgICAgIHRocmVzaG9sZDogMSxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fT1JfRVFVQUxfVE9fVEhSRVNIT0xELFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnQgd2hlbiBwcm9qZWN0IG9wZXJhdGlvbnMgZmFpbCBhbmQgbGFuZCBpbiBETFEnLFxuICAgIH0pO1xuICAgIHByb2plY3RPcHNETFFBbGFybS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKGFsZXJ0VG9waWMpKTtcblxuICAgIGNvbnN0IGFzeW5jUHJvY2Vzc0RMUUFsYXJtID0gbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ0FzeW5jUHJvY2Vzc0RMUUFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiAnYXBwLW1vZGV4LWFzeW5jLXByb2Nlc3MtZGxxLW1lc3NhZ2VzJyxcbiAgICAgIG1ldHJpYzogYXN5bmNQcm9jZXNzRExRLm1ldHJpY0FwcHJveGltYXRlTnVtYmVyT2ZNZXNzYWdlc1Zpc2libGUoKSxcbiAgICAgIHRocmVzaG9sZDogMSxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fT1JfRVFVQUxfVE9fVEhSRVNIT0xELFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnQgd2hlbiBhc3luYyBwcm9jZXNzZXMgZmFpbCBhbmQgbGFuZCBpbiBETFEnLFxuICAgIH0pO1xuICAgIGFzeW5jUHJvY2Vzc0RMUUFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24oYWxlcnRUb3BpYykpO1xuICAgIFxuICAgIC8vIENsb3VkV2F0Y2ggQWxhcm0gZm9yIGFzeW5jIGludm9jYXRpb24gRExRXG4gICAgY29uc3QgYXN5bmNJbnZvY2F0aW9uRExRQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnQXN5bmNJbnZvY2F0aW9uRExRQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6ICdhcHAtbW9kZXgtYXN5bmMtaW52b2NhdGlvbi1kbHEtbWVzc2FnZXMnLFxuICAgICAgbWV0cmljOiBhc3luY0ludm9jYXRpb25ETFEubWV0cmljQXBwcm94aW1hdGVOdW1iZXJPZk1lc3NhZ2VzVmlzaWJsZSgpLFxuICAgICAgdGhyZXNob2xkOiAxLFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6IGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9PUl9FUVVBTF9UT19USFJFU0hPTEQsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdBbGVydCB3aGVuIGFzeW5jIExhbWJkYSBpbnZvY2F0aW9ucyBmYWlsIGFuZCBsYW5kIGluIERMUScsXG4gICAgfSk7XG4gICAgYXN5bmNJbnZvY2F0aW9uRExRQWxhcm0uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbihhbGVydFRvcGljKSk7XG4gICAgXG4gICAgLy8gQXV0b21hdGljIERMUSByZWRyaXZlIC0gRXZlbnRCcmlkZ2Ugc2NoZWR1bGVkIHJ1bGUgKGV2ZXJ5IDUgbWludXRlcylcbiAgICBjb25zdCBkbHFSZWRyaXZlUnVsZSA9IG5ldyBldmVudHMuUnVsZSh0aGlzLCAnRExRUmVkcml2ZVJ1bGUnLCB7XG4gICAgICBzY2hlZHVsZTogZXZlbnRzLlNjaGVkdWxlLnJhdGUoRHVyYXRpb24ubWludXRlcyg1KSksXG4gICAgICBkZXNjcmlwdGlvbjogJ0F1dG9tYXRpY2FsbHkgcmVkcml2ZSBtZXNzYWdlcyBmcm9tIERMUXMgZXZlcnkgNSBtaW51dGVzJyxcbiAgICB9KTtcbiAgICBcbiAgICAvLyBJbnZva2UgRExRIHJlZHJpdmUgZnVuY3Rpb24gZm9yIGVhY2ggRExRXG4gICAgZGxxUmVkcml2ZVJ1bGUuYWRkVGFyZ2V0KG5ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKGRscVJlZHJpdmVGdW5jdGlvbiwge1xuICAgICAgZXZlbnQ6IGV2ZW50cy5SdWxlVGFyZ2V0SW5wdXQuZnJvbU9iamVjdCh7XG4gICAgICAgIGRscVVybDogcHJvamVjdE9wZXJhdGlvbnNETFEucXVldWVVcmwsXG4gICAgICAgIHRhcmdldFF1ZXVlVXJsOiB0aGlzLnByb2plY3RPcGVyYXRpb25zUXVldWUucXVldWVVcmwsXG4gICAgICAgIG1heE1lc3NhZ2VzOiAxMFxuICAgICAgfSlcbiAgICB9KSk7XG4gICAgXG4gICAgZGxxUmVkcml2ZVJ1bGUuYWRkVGFyZ2V0KG5ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKGRscVJlZHJpdmVGdW5jdGlvbiwge1xuICAgICAgZXZlbnQ6IGV2ZW50cy5SdWxlVGFyZ2V0SW5wdXQuZnJvbU9iamVjdCh7XG4gICAgICAgIGRscVVybDogYXN5bmNQcm9jZXNzRExRLnF1ZXVlVXJsLFxuICAgICAgICB0YXJnZXRRdWV1ZVVybDogYXN5bmNQcm9jZXNzUXVldWUucXVldWVVcmwsXG4gICAgICAgIG1heE1lc3NhZ2VzOiAxMFxuICAgICAgfSlcbiAgICB9KSk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIEFsYXJtIGZvciBBUEkgR2F0ZXdheSBlcnJvcnNcbiAgICBjb25zdCBhcGlFcnJvckFsYXJtID0gbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ0FQSUVycm9yQWxhcm0nLCB7XG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0FXUy9BcGlHYXRld2F5JyxcbiAgICAgICAgbWV0cmljTmFtZTogJzVYWEVycm9yJyxcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBEdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDEwLFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQWxlcnQgd2hlbiBBUEkgR2F0ZXdheSBoYXMgNVhYIGVycm9ycycsXG4gICAgICBhbGFybU5hbWU6ICdhcHAtbW9kZXgtYXBpLWVycm9ycycsXG4gICAgfSk7XG5cbiAgICBhcGlFcnJvckFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24oYWxlcnRUb3BpYykpO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBBbGFybSBmb3IgRHluYW1vREIgdGhyb3R0bGluZ1xuICAgIGNvbnN0IGR5bmFtb2RiVGhyb3R0bGVBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdEeW5hbW9EQlRocm90dGxlQWxhcm0nLCB7XG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0FXUy9EeW5hbW9EQicsXG4gICAgICAgIG1ldHJpY05hbWU6ICdVc2VyRXJyb3JzJyxcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBEdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDEsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdBbGVydCB3aGVuIER5bmFtb0RCIGhhcyB0aHJvdHRsaW5nIGVycm9ycycsXG4gICAgICBhbGFybU5hbWU6ICdhcHAtbW9kZXgtZHluYW1vZGItdGhyb3R0bGUnLFxuICAgIH0pO1xuXG4gICAgZHluYW1vZGJUaHJvdHRsZUFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24oYWxlcnRUb3BpYykpO1xuXG4gICAgLy8gPT09PT0gTEFNQkRBIEZVTkNUSU9OIE9XTkVSIFRBR1MgPT09PT1cbiAgICBcbiAgICAvLyBBc3NpZ24gb3duZXIgdGFncyB0byBhbGwgTGFtYmRhIGZ1bmN0aW9ucyBmb3IgbW9uaXRvcmluZyBhY2NvdW50YWJpbGl0eVxuICAgIGNvbnN0IGxhbWJkYUZ1bmN0aW9ucyA9IFtcbiAgICAgIHByb2plY3RzRnVuY3Rpb24sIHByb2plY3REYXRhRnVuY3Rpb24sIHNoYXJpbmdGdW5jdGlvbiwgdXNlclNlYXJjaEZ1bmN0aW9uLFxuICAgICAgZmlsZU9wZXJhdGlvbnNGdW5jdGlvbiwgZmlsZVVwbG9hZEZ1bmN0aW9uLCBkYXRhU291cmNlc0Z1bmN0aW9uLFxuICAgICAgYXRoZW5hUXVlcnlGdW5jdGlvbiwgcHJvY2Vzc1RyYWNraW5nRnVuY3Rpb24sIGF1dG9tYXRpb25TdGF0dXNGdW5jdGlvbixcbiAgICAgIHByb3Zpc2lvbmluZ0Z1bmN0aW9uLCBidWlsZE1vbml0b3JGdW5jdGlvbiwgdGNvRnVuY3Rpb24sIGFwcGxpY2F0aW9uQnVja2V0c0Z1bmN0aW9uLFxuICAgICAgdGVhbUVzdGltYXRlc0Z1bmN0aW9uLCB0ZWFtV2VpZ2h0c0Z1bmN0aW9uLCBhcHBsaWNhdGlvblNpbWlsYXJpdGllc0Z1bmN0aW9uLFxuICAgICAgY29tcG9uZW50U2ltaWxhcml0aWVzRnVuY3Rpb24sIHBpbG90SWRlbnRpZmljYXRpb25GdW5jdGlvbiwgc3RlcEZ1bmN0aW9uQXBpRnVuY3Rpb24sXG4gICAgICBzdGVwRnVuY3Rpb25UcmlnZ2VyRnVuY3Rpb24sIGV4cG9ydEluaXRpYXRvckZ1bmN0aW9uLCBleHBvcnRSZWFkZXJGdW5jdGlvbixcbiAgICAgIHJvbGVNYXBwZXJGdW5jdGlvbiwgYmVkcm9ja05vcm1hbGl6ZXJGdW5jdGlvbixcbiAgICAgIGJhdGNoRXh0cmFjdG9yRnVuY3Rpb24sIGNvbXBhcmVXaXRoQXRoZW5hRnVuY3Rpb24sIG1hcHBpbmdBZ2dyZWdhdG9yRnVuY3Rpb24sXG4gICAgICBzdGF0dXNUcmFja2VyRnVuY3Rpb24sIG1ldHJpY3NGdW5jdGlvbixcbiAgICAgIGVycm9ySGFuZGxlckZ1bmN0aW9uLCBkbHFQcm9jZXNzb3JGdW5jdGlvbixcbiAgICAgIHBpbG90R2F0aGVyQ29udGV4dEZ1bmN0aW9uLCBwaWxvdEFJRW5oYW5jZUZ1bmN0aW9uLCBwaWxvdENvbWJpbmVTY29yZXNGdW5jdGlvbixcbiAgICAgIGF0aGVuYUxvb2t1cEZ1bmN0aW9uLCBkbHFSZWRyaXZlRnVuY3Rpb25cbiAgICBdO1xuICAgIFxuICAgIGxhbWJkYUZ1bmN0aW9ucy5mb3JFYWNoKGZuID0+IHtcbiAgICAgIGNkay5UYWdzLm9mKGZuKS5hZGQoJ093bmVyJywgJ3BsYXRmb3JtLXRlYW0nKTtcbiAgICAgIGNkay5UYWdzLm9mKGZuKS5hZGQoJ01vbml0b3JpbmdSZXF1aXJlZCcsICd0cnVlJyk7XG4gICAgfSk7XG5cbiAgICAvLyA9PT09PSBTVEVQIEZVTkNUSU9OUyA9PT09PVxuICAgIFxuICAgIC8vID09PT09IE5FVyBURUNIIFNUQUNLIE5PUk1BTElaQVRJT04gU1RFUCBGVU5DVElPTiBWMiA9PT09PVxuXG4gICAgLy8gU3RlcCBGdW5jdGlvbiBSb2xlIHdpdGggbGVhc3QgcHJpdmlsZWdlXG4gICAgY29uc3QgdGVjaFN0YWNrTm9ybWFsaXphdGlvblJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1RlY2hTdGFja05vcm1hbGl6YXRpb25Sb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ3N0YXRlcy5hbWF6b25hd3MuY29tJyksXG4gICAgICByb2xlTmFtZTogJ2FwcC1tb2RleC10ZWNoLXN0YWNrLW5vcm1hbGl6YXRpb24tcm9sZScsXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBpbnZva2UgcGVybWlzc2lvbnMgT05MWSB0byB0aGUgc3BlY2lmaWMgTGFtYmRhcyB1c2VkIGluIHRoZSB3b3JrZmxvd1xuICAgIFtcbiAgICAgIGJhdGNoRXh0cmFjdG9yRnVuY3Rpb24sXG4gICAgICBhdGhlbmFMb29rdXBGdW5jdGlvbixcbiAgICAgIGJlZHJvY2tOb3JtYWxpemVyRnVuY3Rpb24sXG4gICAgICBtYXBwaW5nQWdncmVnYXRvckZ1bmN0aW9uLFxuICAgICAgc3RhdHVzVHJhY2tlckZ1bmN0aW9uLFxuICAgICAgZXJyb3JIYW5kbGVyRnVuY3Rpb24sXG4gICAgICBtZXRyaWNzRnVuY3Rpb25cbiAgICBdLmZvckVhY2goZm4gPT4ge1xuICAgICAgZm4uZ3JhbnRJbnZva2UodGVjaFN0YWNrTm9ybWFsaXphdGlvblJvbGUpO1xuICAgIH0pO1xuXG4gICAgLy8gV0lMRENBUkQgSlVTVElGSUNBVElPTjogU3RlcCBGdW5jdGlvbnMgQ2xvdWRXYXRjaCBMb2dzIGRlbGl2ZXJ5IHJlcXVpcmVzIHdpbGRjYXJkIHJlc291cmNlXG4gICAgLy8gQVdTIFNlcnZpY2UgTGltaXRhdGlvbjogU3RlcCBGdW5jdGlvbnMgbG9nIGRlbGl2ZXJ5IEFQSXMgZG9uJ3Qgc3VwcG9ydCByZXNvdXJjZS1sZXZlbCBwZXJtaXNzaW9uc1xuICAgIC8vIFJlZmVyZW5jZTogaHR0cHM6Ly9kb2NzLmF3cy5hbWF6b24uY29tL3N0ZXAtZnVuY3Rpb25zL2xhdGVzdC9kZy9jdy1sb2dzLmh0bWxcbiAgICAvLyBBY3Rpb25zOiBDcmVhdGVMb2dEZWxpdmVyeSwgR2V0TG9nRGVsaXZlcnksIFVwZGF0ZUxvZ0RlbGl2ZXJ5LCBEZWxldGVMb2dEZWxpdmVyeSwgTGlzdExvZ0RlbGl2ZXJpZXNcbiAgICAvLyBTZWN1cml0eSBJbXBhY3Q6IExvdyAtIGxpbWl0ZWQgdG8gbG9nIGRlbGl2ZXJ5IG1hbmFnZW1lbnQgb3BlcmF0aW9ucyBvbmx5XG4gICAgLy8gQWx0ZXJuYXRpdmU6IE5vbmUgYXZhaWxhYmxlIC0gQVdTIHNlcnZpY2UgcmVxdWlyZW1lbnRcbiAgICB0ZWNoU3RhY2tOb3JtYWxpemF0aW9uUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbJ2xvZ3M6Q3JlYXRlTG9nRGVsaXZlcnknLCAnbG9nczpHZXRMb2dEZWxpdmVyeScsICdsb2dzOlVwZGF0ZUxvZ0RlbGl2ZXJ5JywgJ2xvZ3M6RGVsZXRlTG9nRGVsaXZlcnknLCAnbG9nczpMaXN0TG9nRGVsaXZlcmllcycsICdsb2dzOlB1dFJlc291cmNlUG9saWN5JywgJ2xvZ3M6RGVzY3JpYmVSZXNvdXJjZVBvbGljaWVzJywgJ2xvZ3M6RGVzY3JpYmVMb2dHcm91cHMnXSxcbiAgICAgIHJlc291cmNlczogWycqJ11cbiAgICB9KSk7XG5cbiAgICAvLyBXSUxEQ0FSRCBKVVNUSUZJQ0FUSU9OOiBYLVJheSB0cmFjaW5nIHJlcXVpcmVzIHdpbGRjYXJkIHJlc291cmNlXG4gICAgLy8gQVdTIFNlcnZpY2UgTGltaXRhdGlvbjogWC1SYXkgUHV0VHJhY2VTZWdtZW50cy9QdXRUZWxlbWV0cnlSZWNvcmRzIGRvbid0IHN1cHBvcnQgcmVzb3VyY2UtbGV2ZWwgcGVybWlzc2lvbnNcbiAgICAvLyBSZWZlcmVuY2U6IGh0dHBzOi8vZG9jcy5hd3MuYW1hem9uLmNvbS94cmF5L2xhdGVzdC9kZXZndWlkZS9zZWN1cml0eV9pYW1fc2VydmljZS13aXRoLWlhbS5odG1sXG4gICAgLy8gU2VjdXJpdHkgSW1wYWN0OiBMb3cgLSBvbmx5IGFsbG93cyBzZW5kaW5nIHRyYWNlIGRhdGEsIGNhbm5vdCByZWFkIG9yIG1vZGlmeSBleGlzdGluZyB0cmFjZXNcbiAgICAvLyBBbHRlcm5hdGl2ZTogTm9uZSBhdmFpbGFibGUgLSBBV1Mgc2VydmljZSByZXF1aXJlbWVudCBmb3IgZGlzdHJpYnV0ZWQgdHJhY2luZ1xuICAgIHRlY2hTdGFja05vcm1hbGl6YXRpb25Sb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFsneHJheTpQdXRUcmFjZVNlZ21lbnRzJywgJ3hyYXk6UHV0VGVsZW1ldHJ5UmVjb3JkcyddLFxuICAgICAgcmVzb3VyY2VzOiBbJyonXVxuICAgIH0pKTtcblxuICAgIC8vIExvYWQgU3RlcCBGdW5jdGlvbiBkZWZpbml0aW9uXG4gICAgY29uc3QgdGVjaFN0YWNrTm9ybWFsaXphdGlvbkRlZmluaXRpb25QYXRoID0gcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uJywgJ3N0ZXBmdW5jdGlvbnMnLCAnZ2xvYmFsJywgJ3RlY2gtc3RhY2stbm9ybWFsaXphdGlvbi5qc29uJyk7XG4gICAgbGV0IHRlY2hTdGFja05vcm1hbGl6YXRpb25EZWZpbml0aW9uID0gSlNPTi5wYXJzZShmcy5yZWFkRmlsZVN5bmModGVjaFN0YWNrTm9ybWFsaXphdGlvbkRlZmluaXRpb25QYXRoLCAndXRmOCcpKTtcblxuICAgIC8vIFJlcGxhY2UgdGVtcGxhdGUgcGxhY2Vob2xkZXJzIHdpdGggYWN0dWFsIExhbWJkYSBBUk5zXG4gICAgY29uc3QgZGVmaW5pdGlvblN0cmluZyA9IEpTT04uc3RyaW5naWZ5KHRlY2hTdGFja05vcm1hbGl6YXRpb25EZWZpbml0aW9uKVxuICAgICAgLnJlcGxhY2UoL3t7QkFUQ0hfRVhUUkFDVE9SX0FSTn19L2csIGJhdGNoRXh0cmFjdG9yRnVuY3Rpb24uZnVuY3Rpb25Bcm4pXG4gICAgICAucmVwbGFjZSgve3tBVEhFTkFfTE9PS1VQX1NFUlZJQ0VfQVJOfX0vZywgYXRoZW5hTG9va3VwRnVuY3Rpb24uZnVuY3Rpb25Bcm4pXG4gICAgICAucmVwbGFjZSgve3tCRURST0NLX05PUk1BTElaRVJfQVJOfX0vZywgYmVkcm9ja05vcm1hbGl6ZXJGdW5jdGlvbi5mdW5jdGlvbkFybilcbiAgICAgIC5yZXBsYWNlKC97e01BUFBJTkdfQUdHUkVHQVRPUl9BUk59fS9nLCBtYXBwaW5nQWdncmVnYXRvckZ1bmN0aW9uLmZ1bmN0aW9uQXJuKVxuICAgICAgLnJlcGxhY2UoL3t7Tk9STUFMSVpBVElPTl9TVEFUVVNfVFJBQ0tFUl9BUk59fS9nLCBzdGF0dXNUcmFja2VyRnVuY3Rpb24uZnVuY3Rpb25Bcm4pXG4gICAgICAucmVwbGFjZSgve3tOT1JNQUxJWkFUSU9OX0VSUk9SX0hBTkRMRVJfQVJOfX0vZywgZXJyb3JIYW5kbGVyRnVuY3Rpb24uZnVuY3Rpb25Bcm4pXG4gICAgICAucmVwbGFjZSgve3tOT1JNQUxJWkFUSU9OX01FVFJJQ1NfQVJOfX0vZywgbWV0cmljc0Z1bmN0aW9uLmZ1bmN0aW9uQXJuKTtcblxuICAgIHRlY2hTdGFja05vcm1hbGl6YXRpb25EZWZpbml0aW9uID0gSlNPTi5wYXJzZShkZWZpbml0aW9uU3RyaW5nKTtcblxuICAgIC8vIENyZWF0ZSBTdGVwIEZ1bmN0aW9uXG4gICAgY29uc3QgdGVjaFN0YWNrTm9ybWFsaXphdGlvblN0YXRlTWFjaGluZSA9IG5ldyBzdGVwZnVuY3Rpb25zLlN0YXRlTWFjaGluZSh0aGlzLCAnVGVjaFN0YWNrTm9ybWFsaXphdGlvblN0YXRlTWFjaGluZScsIHtcbiAgICAgIHN0YXRlTWFjaGluZU5hbWU6ICdhcHAtbW9kZXgtdGVjaC1zdGFjay1ub3JtYWxpemF0aW9uJyxcbiAgICAgIGRlZmluaXRpb25Cb2R5OiBzdGVwZnVuY3Rpb25zLkRlZmluaXRpb25Cb2R5LmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkodGVjaFN0YWNrTm9ybWFsaXphdGlvbkRlZmluaXRpb24pKSxcbiAgICAgIHJvbGU6IHRlY2hTdGFja05vcm1hbGl6YXRpb25Sb2xlLFxuICAgICAgdHJhY2luZ0VuYWJsZWQ6IHRydWUsXG4gICAgICBsb2dzOiB7XG4gICAgICAgIGRlc3RpbmF0aW9uOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnVGVjaFN0YWNrTm9ybWFsaXphdGlvbkxvZ0dyb3VwJywge1xuICAgICAgICAgIGxvZ0dyb3VwTmFtZTogJy9hd3MvdmVuZGVkbG9ncy9zdGF0ZXMvYXBwLW1vZGV4LXRlY2gtc3RhY2stbm9ybWFsaXphdGlvbicsXG4gICAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgICAgfSksXG4gICAgICAgIGxldmVsOiBzdGVwZnVuY3Rpb25zLkxvZ0xldmVsLkFMTCxcbiAgICAgICAgaW5jbHVkZUV4ZWN1dGlvbkRhdGE6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBBbGFybSBmb3Igbm9ybWFsaXphdGlvbiBmYWlsdXJlc1xuICAgIGNvbnN0IG5vcm1hbGl6YXRpb25GYWlsdXJlQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnTm9ybWFsaXphdGlvbkZhaWx1cmVBbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogJ2FwcC1tb2RleC1ub3JtYWxpemF0aW9uLWZhaWx1cmVzJyxcbiAgICAgIG1ldHJpYzogdGVjaFN0YWNrTm9ybWFsaXphdGlvblN0YXRlTWFjaGluZS5tZXRyaWNGYWlsZWQoKSxcbiAgICAgIHRocmVzaG9sZDogMSxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5HUkVBVEVSX1RIQU5fT1JfRVFVQUxfVE9fVEhSRVNIT0xELFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICBub3JtYWxpemF0aW9uRmFpbHVyZUFsYXJtLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoQWN0aW9ucy5TbnNBY3Rpb24obm9ybWFsaXphdGlvbkFsZXJ0VG9waWMpKTtcblxuICAgIC8vIENsb3VkV2F0Y2ggQWxhcm0gZm9yIERMUSBtZXNzYWdlc1xuICAgIGNvbnN0IGRscU1lc3NhZ2VzQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnTm9ybWFsaXphdGlvbkRMUUFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiAnYXBwLW1vZGV4LW5vcm1hbGl6YXRpb24tZGxxLW1lc3NhZ2VzJyxcbiAgICAgIG1ldHJpYzogbm9ybWFsaXphdGlvbkRMUS5tZXRyaWNBcHByb3hpbWF0ZU51bWJlck9mTWVzc2FnZXNWaXNpYmxlKCksXG4gICAgICB0aHJlc2hvbGQ6IDUsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjogY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuR1JFQVRFUl9USEFOX09SX0VRVUFMX1RPX1RIUkVTSE9MRCxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgZGxxTWVzc2FnZXNBbGFybS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKG5vcm1hbGl6YXRpb25BbGVydFRvcGljKSk7XG5cbiAgICAvLyA9PT09PSBTSEFSRUQgQ0xPVURXQVRDSCBMT0dTIFJFU09VUkNFIFBPTElDWSBGT1IgQUxMIFNURVAgRlVOQ1RJT05TID09PT09XG4gICAgXG4gICAgLy8gQ3JlYXRlIGEgc2luZ2xlIHNoYXJlZCByZXNvdXJjZSBwb2xpY3kgdGhhdCBjb3ZlcnMgQUxMIHByb2plY3QgU3RlcCBGdW5jdGlvbiBsb2cgZ3JvdXBzXG4gICAgLy8gVGhpcyBhbGxvd3MgdW5saW1pdGVkIHByb2plY3RzIHdpdGhvdXQgaGl0dGluZyB0aGUgMTAgcmVzb3VyY2UgcG9saWN5IGxpbWl0XG4gICAgbmV3IGxvZ3MuQ2ZuUmVzb3VyY2VQb2xpY3kodGhpcywgJ1N0ZXBGdW5jdGlvbnNMb2dzUmVzb3VyY2VQb2xpY3knLCB7XG4gICAgICBwb2xpY3lOYW1lOiAnYXBwLW1vZGV4LXN0ZXBmdW5jdGlvbnMtbG9ncy1wb2xpY3knLFxuICAgICAgcG9saWN5RG9jdW1lbnQ6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgVmVyc2lvbjogJzIwMTItMTAtMTcnLFxuICAgICAgICBTdGF0ZW1lbnQ6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBFZmZlY3Q6ICdBbGxvdycsXG4gICAgICAgICAgICBQcmluY2lwYWw6IHtcbiAgICAgICAgICAgICAgU2VydmljZTogJ3N0YXRlcy5hbWF6b25hd3MuY29tJ1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIEFjdGlvbjogW1xuICAgICAgICAgICAgICAnbG9nczpDcmVhdGVMb2dEZWxpdmVyeScsXG4gICAgICAgICAgICAgICdsb2dzOkdldExvZ0RlbGl2ZXJ5JyxcbiAgICAgICAgICAgICAgJ2xvZ3M6VXBkYXRlTG9nRGVsaXZlcnknLFxuICAgICAgICAgICAgICAnbG9nczpEZWxldGVMb2dEZWxpdmVyeScsXG4gICAgICAgICAgICAgICdsb2dzOkxpc3RMb2dEZWxpdmVyaWVzJyxcbiAgICAgICAgICAgICAgJ2xvZ3M6UHV0TG9nRXZlbnRzJyxcbiAgICAgICAgICAgICAgJ2xvZ3M6UHV0UmVzb3VyY2VQb2xpY3knLFxuICAgICAgICAgICAgICAnbG9nczpEZXNjcmliZVJlc291cmNlUG9saWNpZXMnLFxuICAgICAgICAgICAgICAnbG9nczpEZXNjcmliZUxvZ0dyb3VwcydcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBSZXNvdXJjZTogYGFybjphd3M6bG9nczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06bG9nLWdyb3VwOi9hd3MvdmVuZGVkbG9ncy9zdGF0ZXMvYXBwLW1vZGV4LSpgXG4gICAgICAgICAgfVxuICAgICAgICBdXG4gICAgICB9KVxuICAgIH0pO1xuXG4gICAgLy8gPT09PT0gQ0ZOT1VUUFVUIEVYUE9SVFMgPT09PT1cbiAgICBcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvamVjdHNUYWJsZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogcHJvamVjdHNUYWJsZU5hbWUsXG4gICAgICBleHBvcnROYW1lOiAnYXBwLW1vZGV4LXByb2plY3RzLXRhYmxlJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHJvamVjdHMgRHluYW1vREIgdGFibGUgbmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvamVjdERhdGFUYWJsZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogcHJvamVjdERhdGFUYWJsZU5hbWUsXG4gICAgICBleHBvcnROYW1lOiAnYXBwLW1vZGV4LXByb2plY3QtZGF0YS10YWJsZScsXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb2plY3QgRGF0YSBEeW5hbW9EQiB0YWJsZSBuYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcm9qZWN0T3BlcmF0aW9uc1F1ZXVlVXJsJywge1xuICAgICAgdmFsdWU6IHRoaXMucHJvamVjdE9wZXJhdGlvbnNRdWV1ZS5xdWV1ZVVybCxcbiAgICAgIGV4cG9ydE5hbWU6ICdhcHAtbW9kZXgtcHJvamVjdC1vcGVyYXRpb25zLXF1ZXVlLXVybCcsXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb2plY3QgT3BlcmF0aW9ucyBTUVMgcXVldWUgVVJMJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcm9qZWN0T3BlcmF0aW9uc1F1ZXVlQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMucHJvamVjdE9wZXJhdGlvbnNRdWV1ZS5xdWV1ZUFybixcbiAgICAgIGV4cG9ydE5hbWU6ICdhcHAtbW9kZXgtcHJvamVjdC1vcGVyYXRpb25zLXF1ZXVlLWFybicsXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb2plY3QgT3BlcmF0aW9ucyBTUVMgcXVldWUgQVJOJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdOb3JtYWxpemF0aW9uU3RhdGVNYWNoaW5lQXJuJywge1xuICAgICAgdmFsdWU6IHRlY2hTdGFja05vcm1hbGl6YXRpb25TdGF0ZU1hY2hpbmUuc3RhdGVNYWNoaW5lQXJuLFxuICAgICAgZXhwb3J0TmFtZTogJ2FwcC1tb2RleC1ub3JtYWxpemF0aW9uLXN0YXRlLW1hY2hpbmUtYXJuJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGVjaFN0YWNrIE5vcm1hbGl6YXRpb24gd29ya2Zsb3cgc3RhdGUgbWFjaGluZSBBUk4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FsZXJ0VG9waWNBcm4nLCB7XG4gICAgICB2YWx1ZTogYWxlcnRUb3BpYy50b3BpY0FybixcbiAgICAgIGV4cG9ydE5hbWU6ICdhcHAtbW9kZXgtYWxlcnQtdG9waWMtYXJuJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU05TIHRvcGljIGZvciBhbGVydHMnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NvZGVCdWlsZFByb2plY3ROYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuY29kZUJ1aWxkUHJvamVjdC5wcm9qZWN0TmFtZSxcbiAgICAgIGV4cG9ydE5hbWU6ICdhcHAtbW9kZXgtY29kZWJ1aWxkLXByb2plY3QnLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2RlQnVpbGQgcHJvamVjdCBmb3IgTGFtYmRhIHBhY2thZ2luZycsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXN5bmNQcm9jZXNzUXVldWVVcmwnLCB7XG4gICAgICB2YWx1ZTogYXN5bmNQcm9jZXNzUXVldWUucXVldWVVcmwsXG4gICAgICBleHBvcnROYW1lOiAnYXBwLW1vZGV4LWFzeW5jLXByb2Nlc3MtcXVldWUtdXJsJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQXN5bmMgcHJvY2VzcyBxdWV1ZSBVUkwgZm9yIG5vcm1hbGl6YXRpb24gYW5kIHNraWxsIGltcG9ydGFuY2Ugd29ya2Zsb3dzJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdCZWRyb2NrR3VhcmRyYWlsSWQnLCB7XG4gICAgICB2YWx1ZTogYmVkcm9ja0d1YXJkcmFpbC5yZWYsXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtQmVkcm9ja0d1YXJkcmFpbElkJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQmVkcm9jayBHdWFyZHJhaWwgSUQgZm9yIGNvbnRlbnQgZmlsdGVyaW5nJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdCZWRyb2NrR3VhcmRyYWlsVmVyc2lvbicsIHtcbiAgICAgIHZhbHVlOiAnRFJBRlQnLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LUJlZHJvY2tHdWFyZHJhaWxWZXJzaW9uJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQmVkcm9jayBHdWFyZHJhaWwgVmVyc2lvbicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ0RLUGVybWlzc2lvbnNCb3VuZGFyeUFybicsIHtcbiAgICAgIHZhbHVlOiBwZXJtaXNzaW9uc0JvdW5kYXJ5Lm1hbmFnZWRQb2xpY3lBcm4sXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtQ0RLUGVybWlzc2lvbnNCb3VuZGFyeUFybicsXG4gICAgICBkZXNjcmlwdGlvbjogJ1Blcm1pc3Npb25zIGJvdW5kYXJ5IEFSTiBmb3IgQ0RLLWNyZWF0ZWQgcm9sZXMnLFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT0gRlJPTlRFTkQgQ09ORklHVVJBVElPTiBPVVRQVVRTID09PT09XG4gICAgLy8gTm90ZTogVXNlclBvb2wgYW5kIFVzZXJQb29sQ2xpZW50IG91dHB1dHMgYXJlIGluIHRoZSBEYXRhIHN0YWNrXG4gICAgLy8gQVBJIFVSTCBvdXRwdXQgaXMgaW4gdGhlIEFQSSBzdGFja1xuICAgIC8vIFRoaXMgYXZvaWRzIGNpcmN1bGFyIGRlcGVuZGVuY2llcyBiZXR3ZWVuIHN0YWNrc1xuICB9XG59XG4iXX0=