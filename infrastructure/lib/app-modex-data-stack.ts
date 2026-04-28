import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';

export interface AppModExDataStackProps extends cdk.StackProps {
  environment: string;
}

export class AppModExDataStack extends cdk.Stack {
  public readonly projectsTable: dynamodb.Table;
  public readonly projectDataTable: dynamodb.Table;
  public readonly exportHistoryTable: dynamodb.Table;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;
  public readonly deploymentBucket: s3.Bucket;
  public readonly projectDataBucket: s3.Bucket;
  public readonly accessLogsBucket: s3.Bucket;
  public readonly glueDatabase: glue.CfnDatabase;
  public readonly appConfigSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: AppModExDataStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // ===== DATABASE RESOURCES =====
    
    // Projects table - stores project metadata and sharing information
    this.projectsTable = new dynamodb.Table(this, 'ProjectsTable', {
      tableName: `app-modex-projects`,
      partitionKey: { 
        name: 'projectId', 
        type: dynamodb.AttributeType.STRING 
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: environment === 'prod',
      },
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Add tags to Projects table
    cdk.Tags.of(this.projectsTable).add('Project', 'App-ModEx');
    cdk.Tags.of(this.projectsTable).add('Environment', environment);
    cdk.Tags.of(this.projectsTable).add('DataType', 'ProjectMetadata');

    // Add Global Secondary Indexes
    this.projectsTable.addGlobalSecondaryIndex({
      indexName: 'createdBy-createdDate-index',
      partitionKey: { 
        name: 'createdBy', 
        type: dynamodb.AttributeType.STRING 
      },
      sortKey: { 
        name: 'createdDate', 
        type: dynamodb.AttributeType.STRING 
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.projectsTable.addGlobalSecondaryIndex({
      indexName: 'sharedWith-index',
      partitionKey: { 
        name: 'sharedWith', 
        type: dynamodb.AttributeType.STRING 
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Project Data table - stores actual project data (skills, tech radar, portfolio, etc.)
    this.projectDataTable = new dynamodb.Table(this, 'ProjectDataTable', {
      tableName: `app-modex-project-data`,
      partitionKey: { 
        name: 'projectId', 
        type: dynamodb.AttributeType.STRING 
      },
      sortKey: {
        name: 'dataType',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: environment === 'prod',
      },
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Add tags to Project Data table
    cdk.Tags.of(this.projectDataTable).add('Project', 'App-ModEx');
    cdk.Tags.of(this.projectDataTable).add('Environment', environment);
    cdk.Tags.of(this.projectDataTable).add('DataType', 'ProjectContent');

    // Add Global Secondary Index for data type queries
    this.projectDataTable.addGlobalSecondaryIndex({
      indexName: 'dataType-lastUpdated-index',
      partitionKey: { 
        name: 'dataType', 
        type: dynamodb.AttributeType.STRING 
      },
      sortKey: { 
        name: 'lastUpdated', 
        type: dynamodb.AttributeType.STRING 
      },
      projectionType: dynamodb.ProjectionType.KEYS_ONLY,
    });

    // Export History table - stores export job metadata and status
    const exportHistoryTable = new dynamodb.Table(this, 'ExportHistoryTable', {
      tableName: `app-modex-export-history`,
      partitionKey: { 
        name: 'exportId', 
        type: dynamodb.AttributeType.STRING 
      },
      sortKey: {
        name: 'projectId',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: environment === 'prod',
      },
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    // Add tags to Export History table
    cdk.Tags.of(exportHistoryTable).add('Project', 'App-ModEx');
    cdk.Tags.of(exportHistoryTable).add('Environment', environment);
    cdk.Tags.of(exportHistoryTable).add('DataType', 'ExportMetadata');

    // Add Global Secondary Indexes for export history queries
    exportHistoryTable.addGlobalSecondaryIndex({
      indexName: 'projectId-createdAt-index',
      partitionKey: { 
        name: 'projectId', 
        type: dynamodb.AttributeType.STRING 
      },
      sortKey: { 
        name: 'createdAt', 
        type: dynamodb.AttributeType.STRING 
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    exportHistoryTable.addGlobalSecondaryIndex({
      indexName: 'userId-createdAt-index',
      partitionKey: { 
        name: 'userId', 
        type: dynamodb.AttributeType.STRING 
      },
      sortKey: { 
        name: 'createdAt', 
        type: dynamodb.AttributeType.STRING 
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Store export history table reference for backend stack
    this.exportHistoryTable = exportHistoryTable;

    // ===== COGNITO USER POOL =====
    
    // User Pool for authentication
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `app-modex-users`,
      selfSignUpEnabled: false,
      autoVerify: { email: true },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        givenName: {
          required: true,
          mutable: true,
        },
        familyName: {
          required: true,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Add domain for hosted UI
    this.userPool.addDomain('CognitoDomain', {
      cognitoDomain: {
        domainPrefix: `app-modex`,
      },
    });

    // User Pool Client for frontend application
    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: `app-modex-web-client`,
      authFlows: {
        userPassword: true,
        userSrp: true,
        adminUserPassword: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: [
          'http://localhost:3000/',
          'http://localhost:3000/callback',
          'https://localhost:3000/',
          'https://localhost:3000/callback',
          `https://${this.region}.console.aws.amazon.com/cognito/oauth2/success`,
          `https://${this.region}.console.aws.amazon.com/cognito/oauth2/callback`,
        ],
        logoutUrls: [
          'http://localhost:3000/',
          'http://localhost:3000/logout',
          'https://localhost:3000/',
          'https://localhost:3000/logout',
          `https://${this.region}.console.aws.amazon.com/cognito/oauth2/logout`,
        ],
      },
      preventUserExistenceErrors: true,
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
    });
    
    // Create Cognito Identity Pool for role-based access
    this.identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: `app-modex-identity-pool`,
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [{
        clientId: this.userPoolClient.userPoolClientId,
        providerName: this.userPool.userPoolProviderName,
        serverSideTokenCheck: true
      }]
    });
    
    // Create default authenticated and unauthenticated roles
    const authenticatedRole = new iam.Role(this, 'DefaultAuthenticatedRole', {
      roleName: `app-modex-default-authenticated`,
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated'
          }
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      description: 'Default role for authenticated users'
    });
    
    const unauthenticatedRole = new iam.Role(this, 'DefaultUnauthenticatedRole', {
      roleName: `app-modex-default-unauthenticated`,
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'unauthenticated'
          }
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      description: 'Default role for unauthenticated users'
    });
    
    // Attach minimal permissions to the default authenticated role
    // NOTE: Users should be assigned project-specific roles for actual resource access
    // This default role only allows listing projects and basic API access
    authenticatedRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'execute-api:Invoke'
      ],
      resources: [
        `arn:aws:execute-api:${this.region}:${this.account}:*/*/GET/projects`,
        `arn:aws:execute-api:${this.region}:${this.account}:*/*/GET/projects/*`
      ]
    }));
    
    // Users must assume project-specific roles (app-modex-proj-{projectId}-read/write)
    // for actual S3 and DynamoDB access. This enforces least-privilege and explicit
    // project-level access control.
    
    // Attach the roles to the identity pool
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
        unauthenticated: unauthenticatedRole.roleArn
      }
    });

    // ===== S3 BUCKETS =====

    // Access logs bucket for S3 and API Gateway
    this.accessLogsBucket = new s3.Bucket(this, 'AccessLogsBucket', {
      bucketName: `app-modex-access-logs-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      removalPolicy: environment === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod',
      lifecycleRules: [
        {
          expiration: Duration.days(90),
          noncurrentVersionExpiration: Duration.days(30),
        }
      ]
    });

    // Enforce encryption in transit
    this.accessLogsBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'DenyInsecureTransport',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:*'],
      resources: [
        this.accessLogsBucket.bucketArn,
        `${this.accessLogsBucket.bucketArn}/*`
      ],
      conditions: {
        Bool: {
          'aws:SecureTransport': 'false'
        }
      }
    }));

    // Deployment bucket for Lambda code and assets
    this.deploymentBucket = new s3.Bucket(this, 'DeploymentBucket', {
      bucketName: `app-modex-deployment-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: environment === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod',
      serverAccessLogsBucket: this.accessLogsBucket,
      serverAccessLogsPrefix: 'deployment-bucket/',
    });

    // Enforce encryption in transit
    this.deploymentBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'DenyInsecureTransport',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:*'],
      resources: [
        this.deploymentBucket.bucketArn,
        `${this.deploymentBucket.bucketArn}/*`
      ],
      conditions: {
        Bool: {
          'aws:SecureTransport': 'false'
        }
      }
    }));

    // Project data bucket for storing project-specific data
    this.projectDataBucket = new s3.Bucket(this, 'ProjectDataBucket', {
      bucketName: `app-modex-project-data-${this.account}-${this.region}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: environment === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod',
      serverAccessLogsBucket: this.accessLogsBucket,
      serverAccessLogsPrefix: 'project-data-logs/',
    });

    // Enforce encryption in transit
    this.projectDataBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'DenyInsecureTransport',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:*'],
      resources: [
        this.projectDataBucket.bucketArn,
        `${this.projectDataBucket.bucketArn}/*`
      ],
      conditions: {
        Bool: {
          'aws:SecureTransport': 'false'
        }
      }
    }));

    // ===== GLUE RESOURCES =====

    // Glue database for Athena queries
    this.glueDatabase = new glue.CfnDatabase(this, 'AppModExDatabase', {
      catalogId: this.account,
      databaseInput: {
        name: 'app_modex_data',
        description: 'App-ModEx data catalog for Athena queries',
      },
    });

    // ===== SECRETS MANAGER =====

    // App configuration secret for storing sensitive configuration
    // Stores Cognito User Pool ID and Identity Pool ID to avoid exposing in environment variables
    this.appConfigSecret = new secretsmanager.Secret(this, 'AppConfigSecret', {
      secretName: `app-modex-config-${environment}`,
      description: 'App-ModEx application configuration (Cognito IDs)',
      removalPolicy: environment === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      secretObjectValue: {
        userPoolId: cdk.SecretValue.unsafePlainText(this.userPool.userPoolId),
        identityPoolId: cdk.SecretValue.unsafePlainText(this.identityPool.ref),
      },
    });

    // Export outputs
    new cdk.CfnOutput(this, 'ProjectsTableName', {
      value: this.projectsTable.tableName,
      description: 'Projects DynamoDB Table Name',
      exportName: 'AppModEx-ProjectsTableName',
    });

    new cdk.CfnOutput(this, 'ProjectDataTableName', {
      value: this.projectDataTable.tableName,
      description: 'Project Data DynamoDB Table Name',
      exportName: 'AppModEx-ProjectDataTableName',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: 'AppModEx-UserPoolId',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: 'AppModEx-UserPoolClientId',
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: this.identityPool.ref,
      description: 'Cognito Identity Pool ID',
      exportName: 'AppModEx-IdentityPoolId',
    });

    new cdk.CfnOutput(this, 'DeploymentBucketName', {
      value: this.deploymentBucket.bucketName,
      description: 'Deployment S3 Bucket Name',
      exportName: 'AppModEx-DeploymentBucketName',
    });

    new cdk.CfnOutput(this, 'ProjectDataBucketName', {
      value: this.projectDataBucket.bucketName,
      description: 'Project Data S3 Bucket Name',
      exportName: 'AppModEx-ProjectDataBucketName',
    });

    new cdk.CfnOutput(this, 'GlueDatabaseName', {
      value: this.glueDatabase.ref,
      description: 'Glue Database Name',
      exportName: 'AppModEx-GlueDatabaseName',
    });

    new cdk.CfnOutput(this, 'AccessLogsBucketName', {
      value: this.accessLogsBucket.bucketName,
      description: 'Access Logs S3 Bucket Name',
      exportName: 'AppModEx-AccessLogsBucketName',
    });

    new cdk.CfnOutput(this, 'ExportHistoryTableName', {
      value: this.exportHistoryTable.tableName,
      description: 'Export History DynamoDB Table Name',
      exportName: 'AppModEx-ExportHistoryTableName',
    });

    new cdk.CfnOutput(this, 'AppConfigSecretArn', {
      value: this.appConfigSecret.secretArn,
      description: 'App Config Secret ARN',
      exportName: 'AppModEx-AppConfigSecretArn',
    });

    new cdk.CfnOutput(this, 'UserPoolArn', {
      value: this.userPool.userPoolArn,
      description: 'Cognito User Pool ARN',
      exportName: 'AppModEx-UserPoolArn',
    });

    new cdk.CfnOutput(this, 'ProjectsTableArn', {
      value: this.projectsTable.tableArn,
      description: 'Projects DynamoDB Table ARN',
      exportName: 'AppModEx-ProjectsTableArn',
    });

    new cdk.CfnOutput(this, 'ProjectDataTableArn', {
      value: this.projectDataTable.tableArn,
      description: 'Project Data DynamoDB Table ARN',
      exportName: 'AppModEx-ProjectDataTableArn',
    });

    new cdk.CfnOutput(this, 'ExportHistoryTableArn', {
      value: this.exportHistoryTable.tableArn,
      description: 'Export History DynamoDB Table ARN',
      exportName: 'AppModEx-ExportHistoryTableArn',
    });

    new cdk.CfnOutput(this, 'DeploymentBucketArn', {
      value: this.deploymentBucket.bucketArn,
      description: 'Deployment S3 Bucket ARN',
      exportName: 'AppModEx-DeploymentBucketArn',
    });

    new cdk.CfnOutput(this, 'ProjectDataBucketArn', {
      value: this.projectDataBucket.bucketArn,
      description: 'Project Data S3 Bucket ARN',
      exportName: 'AppModEx-ProjectDataBucketArn',
    });

    new cdk.CfnOutput(this, 'AccessLogsBucketArn', {
      value: this.accessLogsBucket.bucketArn,
      description: 'Access Logs S3 Bucket ARN',
      exportName: 'AppModEx-AccessLogsBucketArn',
    });
  }
}
