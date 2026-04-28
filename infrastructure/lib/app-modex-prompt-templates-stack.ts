import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { RemovalPolicy } from 'aws-cdk-lib';

export interface AppModExPromptTemplatesStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * App-ModEx Prompt Templates Stack
 * 
 * ARCHITECTURE NOTE: Option C - Direct Model Invocation with Prompt Templates
 * - Stores AI prompts in DynamoDB for centralized management
 * - Supports versioning and per-model customization
 * - Enables runtime prompt updates without Lambda redeployment
 * - Replaces Bedrock Agent infrastructure with direct model calls
 * 
 * Tables:
 * - PromptTemplates: Stores prompt templates with versioning
 * 
 * Seed Data:
 * - Normalization prompts (Nova Lite)
 * - Pilot Analysis prompts (Claude 3.7 Sonnet)
 * - Skill Importance prompts (Nova Lite)
 */
export class AppModExPromptTemplatesStack extends cdk.Stack {
  public readonly promptTemplatesTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: AppModExPromptTemplatesStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // ===== PROMPT TEMPLATES TABLE =====
    
    this.promptTemplatesTable = new dynamodb.Table(this, 'PromptTemplatesTable', {
      tableName: `app-modex-prompt-templates`,
      partitionKey: {
        name: 'promptId',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'modelVersion',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: environment === 'prod',
      },
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Add tags
    cdk.Tags.of(this.promptTemplatesTable).add('Project', 'App-ModEx');
    cdk.Tags.of(this.promptTemplatesTable).add('Environment', environment);
    cdk.Tags.of(this.promptTemplatesTable).add('DataType', 'PromptTemplates');

    // Add GSI for querying by status
    this.promptTemplatesTable.addGlobalSecondaryIndex({
      indexName: 'status-updatedAt-index',
      partitionKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'updatedAt',
        type: dynamodb.AttributeType.STRING
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ===== SEED DATA LAMBDA =====
    
    // Create Lambda function to seed initial prompts
    const seedRole = new iam.Role(this, 'SeedRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    seedRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/app-modex-seed-prompts:*`
      ]
    }));

    this.promptTemplatesTable.grantWriteData(seedRole);

    const seedFunction = new lambda.Function(this, 'SeedPromptsFunction', {
      functionName: `app-modex-seed-prompts`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/global/seed-prompts'),
      environment: {
        PROMPTS_TABLE: this.promptTemplatesTable.tableName,
      },
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      role: seedRole,
    });

    // ===== CUSTOM RESOURCE TO RUN SEED FUNCTION =====
    
    const seedProvider = new cdk.custom_resources.Provider(this, 'SeedProvider', {
      onEventHandler: seedFunction,
      logGroup: new logs.LogGroup(this, 'SeedProvider-LogGroup', {
        logGroupName: '/aws/lambda/app-modex-seed-prompts',
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });

    new cdk.CustomResource(this, 'SeedPromptsResource', {
      serviceToken: seedProvider.serviceToken,
      properties: {
        TableName: this.promptTemplatesTable.tableName,
      },
    });

    // ===== OUTPUTS =====
    
    new cdk.CfnOutput(this, 'PromptTemplatesTableName', {
      value: this.promptTemplatesTable.tableName,
      description: 'Prompt Templates Table Name',
      exportName: `${this.stackName}-PromptTemplatesTableName`,
    });

    new cdk.CfnOutput(this, 'PromptTemplatesTableArn', {
      value: this.promptTemplatesTable.tableArn,
      description: 'Prompt Templates Table ARN',
      exportName: `${this.stackName}-PromptTemplatesTableArn`,
    });
  }
}
