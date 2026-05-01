import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

/**
 * Lambda Role Manager
 * Simplifies creation of per-function IAM roles with specific permissions
 * Implements least-privilege principle for each Lambda function
 */
export class LambdaRoleManager {
  private scope: Construct;
  private region: string;
  private account: string;

  constructor(scope: Construct, region: string, account: string) {
    this.scope = scope;
    this.region = region;
    this.account = account;
  }

  /**
   * Create a basic Lambda execution role with CloudWatch Logs permission
   * @param functionName - Name of the Lambda function
   * @returns IAM Role
   */
  createBasicRole(functionName: string): iam.Role {
    const role = new iam.Role(this.scope, `${functionName}Role`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: `Execution role for ${functionName} Lambda function`
    });

    // Grant CloudWatch Logs permission (required for all Lambda functions)
    role.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/${functionName}:*`
      ]
    }));

    return role;
  }

  /**
   * Create a Lambda execution role with CloudWatch Logs permission (alias for createBasicRole)
   * @param roleName - Name for the IAM role construct
   * @param functionName - Name of the Lambda function
   * @returns IAM Role
   */
  createLambdaRole(roleName: string, functionName: string): iam.Role {
    const role = new iam.Role(this.scope, roleName, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: `Execution role for ${functionName} Lambda function`
    });

    // Grant CloudWatch Logs permission (required for all Lambda functions)
    role.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents'
      ],
      resources: [
        `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/${functionName}:*`
      ]
    }));

    return role;
  }

  /**
   * Grant DynamoDB read/write permissions to a role
   * @param role - IAM Role
   * @param table - DynamoDB Table
   */
  grantDynamoDBReadWrite(role: iam.Role, table: dynamodb.Table): void {
    table.grantReadWriteData(role);
  }

  /**
   * Grant DynamoDB read-only permissions to a role
   * @param role - IAM Role
   * @param table - DynamoDB Table
   */
  grantDynamoDBReadOnly(role: iam.Role, table: dynamodb.Table): void {
    table.grantReadData(role);
  }

  /**
   * Grant SQS send message permission to a role
   * @param role - IAM Role
   * @param queue - SQS Queue
   */
  grantSQSSendMessage(role: iam.Role, queue: sqs.Queue): void {
    queue.grantSendMessages(role);
  }

  /**
   * Grant SQS receive/delete message permissions to a role
   * @param role - IAM Role
   * @param queue - SQS Queue
   */
  grantSQSReceiveDelete(role: iam.Role, queue: sqs.Queue): void {
    queue.grantConsumeMessages(role);
  }

  /**
   * Grant Cognito permissions to a role
   * @param role - IAM Role
   * @param userPool - Cognito User Pool
   * @param permissions - Array of permissions ('list-users', 'get-user', 'describe-pool')
   */
  grantCognitoPermissions(role: iam.Role, userPool: cognito.UserPool, permissions: string[]): void {
    const actions: string[] = [];

    if (permissions.includes('list-users')) {
      actions.push('cognito-idp:ListUsers');
    }
    if (permissions.includes('get-user')) {
      actions.push('cognito-idp:AdminGetUser');
    }
    if (permissions.includes('describe-pool')) {
      actions.push('cognito-idp:DescribeUserPool');
    }

    if (actions.length > 0) {
      role.addToPolicy(new iam.PolicyStatement({
        actions,
        resources: [userPool.userPoolArn]
      }));
    }
  }

  /**
   * Grant Athena permissions to a role
   * @param role - IAM Role
   * @param permissions - Array of permissions ('start-query', 'get-results', 'stop-query')
   */
  grantAthenaPermissions(role: iam.Role, permissions: string[]): void {
    const actions: string[] = [];

    if (permissions.includes('start-query')) {
      actions.push('athena:StartQueryExecution');
    }
    if (permissions.includes('get-results')) {
      actions.push('athena:GetQueryExecution', 'athena:GetQueryResults');
    }
    if (permissions.includes('stop-query')) {
      actions.push('athena:StopQueryExecution');
    }

    if (actions.length > 0) {
      role.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions,
        resources: [
          `arn:aws:athena:${this.region}:${this.account}:workgroup/app-modex-*`
        ]
      }));
    }
  }

  /**
   * Grant Glue permissions to a role
   * @param role - IAM Role
   * @param permissions - Array of permissions ('get-database', 'get-table', 'get-partition')
   */
  grantGluePermissions(role: iam.Role, permissions: string[]): void {
    const actions: string[] = [];

    if (permissions.includes('get-database')) {
      actions.push('glue:GetDatabase');
    }
    if (permissions.includes('get-table')) {
      actions.push('glue:GetTable');
    }
    if (permissions.includes('get-partition')) {
      actions.push('glue:GetPartition', 'glue:GetPartitions');
    }

    if (actions.length > 0) {
      role.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions,
        resources: [
          `arn:aws:glue:${this.region}:${this.account}:catalog`,
          `arn:aws:glue:${this.region}:${this.account}:database/app-modex-*`,
          `arn:aws:glue:${this.region}:${this.account}:table/app-modex-*/*`
        ]
      }));
    }
  }

  /**
   * Grant S3 permissions to a role
   * @param role - IAM Role
   * @param bucketPattern - S3 bucket name pattern (e.g., 'app-modex-data-*')
   * @param permissions - Array of permissions ('get-object', 'put-object', 'delete-object', 'list-bucket')
   */
  grantS3Permissions(role: iam.Role, bucketPattern: string, permissions: string[]): void {
    const actions: string[] = [];

    if (permissions.includes('get-object')) {
      actions.push('s3:GetObject');
    }
    if (permissions.includes('put-object')) {
      actions.push('s3:PutObject');
    }
    if (permissions.includes('delete-object')) {
      actions.push('s3:DeleteObject');
    }
    if (permissions.includes('list-bucket')) {
      actions.push('s3:ListBucket');
    }

    if (actions.length > 0) {
      role.addToPolicy(new iam.PolicyStatement({
        actions,
        resources: [
          `arn:aws:s3:::${bucketPattern}`,
          `arn:aws:s3:::${bucketPattern}/*`
        ]
      }));
    }
  }

  /**
   * Grant EventBridge permissions to a role
   * @param role - IAM Role
   * @param permissions - Array of permissions ('put-events')
   */
  grantEventBridgePermissions(role: iam.Role, permissions: string[]): void {
    if (permissions.includes('put-events')) {
      role.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['events:PutEvents'],
        resources: [
          `arn:aws:events:${this.region}:${this.account}:event-bus/default`
        ]
      }));
    }
  }

  /**
   * Grant Bedrock permissions to a role
   * @param role - IAM Role
   * @param permissions - Array of permissions ('invoke-model', 'invoke-agent')
   */
  grantBedrockPermissions(role: iam.Role, permissions: string[]): void {
    const actions: string[] = [];

    if (permissions.includes('invoke-model')) {
      actions.push('bedrock:InvokeModel');
    }
    if (permissions.includes('invoke-agent')) {
      actions.push('bedrock:InvokeAgent');
    }

    if (actions.length > 0) {
      role.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions,
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/*`,
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/*`,
          `arn:aws:bedrock:${this.region}:${this.account}:agent/*`
        ]
      }));
    }
  }

  /**
   * Grant Secrets Manager read permission to a role
   * @param role - IAM Role
   * @param secretArn - ARN of the secret
   */
  grantSecretsManagerRead(role: iam.Role, secretArn: string): void {
    role.addToPolicy(new iam.PolicyStatement({
      actions: [
        'secretsmanager:GetSecretValue'
      ],
      resources: [secretArn]
    }));
  }

  /**
   * Grant custom policy to a role
   * @param role - IAM Role
   * @param actions - Array of IAM actions
   * @param resources - Array of resource ARNs
   * @param effect - Allow or Deny (default: Allow)
   */
  grantCustomPolicy(
    role: iam.Role,
    actions: string[],
    resources: string[],
    effect: iam.Effect = iam.Effect.ALLOW
  ): void {
    role.addToPolicy(new iam.PolicyStatement({
      effect,
      actions,
      resources
    }));
  }

  /**
   * Grant SQS project-specific queue permissions
   * @param role - IAM Role
   * @param permissions - Array of permissions ('get-url', 'send-message', 'receive-message', 'delete-message', 'get-attributes')
   */
  grantSQSProjectQueuePermissions(role: iam.Role, permissions: string[]): void {
    const actions: string[] = [];

    if (permissions.includes('get-url')) {
      actions.push('sqs:GetQueueUrl');
    }
    if (permissions.includes('send-message')) {
      actions.push('sqs:SendMessage');
    }
    if (permissions.includes('receive-message')) {
      actions.push('sqs:ReceiveMessage');
    }
    if (permissions.includes('delete-message')) {
      actions.push('sqs:DeleteMessage');
    }
    if (permissions.includes('get-attributes')) {
      actions.push('sqs:GetQueueAttributes');
    }

    if (actions.length > 0) {
      role.addToPolicy(new iam.PolicyStatement({
        actions,
        resources: [
          `arn:aws:sqs:${this.region}:${this.account}:app-modex-data-*`
        ]
      }));
    }
  }

  /**
   * Grant CodeBuild permissions to a role
   * @param role - IAM Role
   * @param permissions - Array of permissions ('batch-get-builds', 'batch-get-projects')
   */
  grantCodeBuildPermissions(role: iam.Role, permissions: string[]): void {
    const actions: string[] = [];

    if (permissions.includes('batch-get-builds')) {
      actions.push('codebuild:BatchGetBuilds');
    }
    if (permissions.includes('batch-get-projects')) {
      actions.push('codebuild:BatchGetProjects');
    }

    if (actions.length > 0) {
      role.addToPolicy(new iam.PolicyStatement({
        actions,
        resources: [
          `arn:aws:codebuild:${this.region}:${this.account}:project/app-modex-*`
        ]
      }));
    }
  }

  /**
   * Grant IAM PassRole permission to a role
   * @param role - IAM Role
   * @param rolePattern - IAM role name pattern (e.g., 'app-modex-*')
   */
  grantIAMPassRole(role: iam.Role, rolePattern: string): void {
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [
        `arn:aws:iam::${this.account}:role/${rolePattern}`
      ]
    }));
  }
}
