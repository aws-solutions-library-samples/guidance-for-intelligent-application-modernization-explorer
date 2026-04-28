"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModExDataStack = void 0;
const cdk = require("aws-cdk-lib");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const cognito = require("aws-cdk-lib/aws-cognito");
const s3 = require("aws-cdk-lib/aws-s3");
const glue = require("aws-cdk-lib/aws-glue");
const iam = require("aws-cdk-lib/aws-iam");
const secretsmanager = require("aws-cdk-lib/aws-secretsmanager");
const aws_cdk_lib_1 = require("aws-cdk-lib");
class AppModExDataStack extends cdk.Stack {
    constructor(scope, id, props) {
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
            assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
                StringEquals: {
                    'cognito-identity.amazonaws.com:aud': this.identityPool.ref
                },
                'ForAnyValue:StringLike': {
                    'cognito-identity.amazonaws.com:amr': 'authenticated'
                }
            }, 'sts:AssumeRoleWithWebIdentity'),
            description: 'Default role for authenticated users'
        });
        const unauthenticatedRole = new iam.Role(this, 'DefaultUnauthenticatedRole', {
            roleName: `app-modex-default-unauthenticated`,
            assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
                StringEquals: {
                    'cognito-identity.amazonaws.com:aud': this.identityPool.ref
                },
                'ForAnyValue:StringLike': {
                    'cognito-identity.amazonaws.com:amr': 'unauthenticated'
                }
            }, 'sts:AssumeRoleWithWebIdentity'),
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
            removalPolicy: environment === 'prod' ? aws_cdk_lib_1.RemovalPolicy.RETAIN : aws_cdk_lib_1.RemovalPolicy.DESTROY,
            autoDeleteObjects: environment !== 'prod',
            lifecycleRules: [
                {
                    expiration: aws_cdk_lib_1.Duration.days(90),
                    noncurrentVersionExpiration: aws_cdk_lib_1.Duration.days(30),
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
            removalPolicy: environment === 'prod' ? aws_cdk_lib_1.RemovalPolicy.RETAIN : aws_cdk_lib_1.RemovalPolicy.DESTROY,
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
            removalPolicy: environment === 'prod' ? aws_cdk_lib_1.RemovalPolicy.RETAIN : aws_cdk_lib_1.RemovalPolicy.DESTROY,
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
            removalPolicy: environment === 'prod' ? aws_cdk_lib_1.RemovalPolicy.RETAIN : aws_cdk_lib_1.RemovalPolicy.DESTROY,
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
exports.AppModExDataStack = AppModExDataStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLW1vZGV4LWRhdGEtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhcHAtbW9kZXgtZGF0YS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFFbkMscURBQXFEO0FBQ3JELG1EQUFtRDtBQUNuRCx5Q0FBeUM7QUFDekMsNkNBQTZDO0FBQzdDLDJDQUEyQztBQUMzQyxpRUFBaUU7QUFDakUsNkNBQXNEO0FBTXRELE1BQWEsaUJBQWtCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFhOUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE2QjtRQUNyRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsV0FBVyxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRTlCLGlDQUFpQztRQUVqQyxtRUFBbUU7UUFDbkUsSUFBSSxDQUFDLGFBQWEsR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUM3RCxTQUFTLEVBQUUsb0JBQW9CO1lBQy9CLFlBQVksRUFBRTtnQkFDWixJQUFJLEVBQUUsV0FBVztnQkFDakIsSUFBSSxFQUFFLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTTthQUNwQztZQUNELFdBQVcsRUFBRSxRQUFRLENBQUMsV0FBVyxDQUFDLGVBQWU7WUFDakQsVUFBVSxFQUFFLFFBQVEsQ0FBQyxlQUFlLENBQUMsV0FBVztZQUNoRCxnQ0FBZ0MsRUFBRTtnQkFDaEMsMEJBQTBCLEVBQUUsV0FBVyxLQUFLLE1BQU07YUFDbkQ7WUFDRCxhQUFhLEVBQUUsV0FBVyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztTQUM3RixDQUFDLENBQUM7UUFFSCw2QkFBNkI7UUFDN0IsR0FBRyxDQUFDLElBQUks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QUEyQjtZQUN4QyxVQUFVLEVBQUUsOEJBQThCO1NBQzNDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQWpoQkQsOENBaWhCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBnbHVlIGZyb20gJ2F3cy1jZGstbGliL2F3cy1nbHVlJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIHNlY3JldHNtYW5hZ2VyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zZWNyZXRzbWFuYWdlcic7XG5pbXBvcnQgeyBEdXJhdGlvbiwgUmVtb3ZhbFBvbGljeSB9IGZyb20gJ2F3cy1jZGstbGliJztcblxuZXhwb3J0IGludGVyZmFjZSBBcHBNb2RFeERhdGFTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgQXBwTW9kRXhEYXRhU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgcHJvamVjdHNUYWJsZTogZHluYW1vZGIuVGFibGU7XG4gIHB1YmxpYyByZWFkb25seSBwcm9qZWN0RGF0YVRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgcHVibGljIHJlYWRvbmx5IGV4cG9ydEhpc3RvcnlUYWJsZTogZHluYW1vZGIuVGFibGU7XG4gIHB1YmxpYyByZWFkb25seSB1c2VyUG9vbDogY29nbml0by5Vc2VyUG9vbDtcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJQb29sQ2xpZW50OiBjb2duaXRvLlVzZXJQb29sQ2xpZW50O1xuICBwdWJsaWMgcmVhZG9ubHkgaWRlbnRpdHlQb29sOiBjb2duaXRvLkNmbklkZW50aXR5UG9vbDtcbiAgcHVibGljIHJlYWRvbmx5IGRlcGxveW1lbnRCdWNrZXQ6IHMzLkJ1Y2tldDtcbiAgcHVibGljIHJlYWRvbmx5IHByb2plY3REYXRhQnVja2V0OiBzMy5CdWNrZXQ7XG4gIHB1YmxpYyByZWFkb25seSBhY2Nlc3NMb2dzQnVja2V0OiBzMy5CdWNrZXQ7XG4gIHB1YmxpYyByZWFkb25seSBnbHVlRGF0YWJhc2U6IGdsdWUuQ2ZuRGF0YWJhc2U7XG4gIHB1YmxpYyByZWFkb25seSBhcHBDb25maWdTZWNyZXQ6IHNlY3JldHNtYW5hZ2VyLlNlY3JldDtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXBwTW9kRXhEYXRhU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgeyBlbnZpcm9ubWVudCB9ID0gcHJvcHM7XG5cbiAgICAvLyA9PT09PSBEQVRBQkFTRSBSRVNPVVJDRVMgPT09PT1cbiAgICBcbiAgICAvLyBQcm9qZWN0cyB0YWJsZSAtIHN0b3JlcyBwcm9qZWN0IG1ldGFkYXRhIGFuZCBzaGFyaW5nIGluZm9ybWF0aW9uXG4gICAgdGhpcy5wcm9qZWN0c1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdQcm9qZWN0c1RhYmxlJywge1xuICAgICAgdGFibGVOYW1lOiBgYXBwLW1vZGV4LXByb2plY3RzYCxcbiAgICAgIHBhcnRpdGlvbktleTogeyBcbiAgICAgICAgbmFtZTogJ3Byb2plY3RJZCcsIFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyBcbiAgICAgIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgZW5jcnlwdGlvbjogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkFXU19NQU5BR0VELFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHtcbiAgICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IGVudmlyb25tZW50ID09PSAncHJvZCcsXG4gICAgICB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgdGFncyB0byBQcm9qZWN0cyB0YWJsZVxuICAgIGNkay5UYWdzLm9mKHRoaXMucHJvamVjdHNUYWJsZSkuYWRkKCdQcm9qZWN0JywgJ0FwcC1Nb2RFeCcpO1xuICAgIGNkay5UYWdzLm9mKHRoaXMucHJvamVjdHNUYWJsZSkuYWRkKCdFbnZpcm9ubWVudCcsIGVudmlyb25tZW50KTtcbiAgICBjZGsuVGFncy5vZih0aGlzLnByb2plY3RzVGFibGUpLmFkZCgnRGF0YVR5cGUnLCAnUHJvamVjdE1ldGFkYXRhJyk7XG5cbiAgICAvLyBBZGQgR2xvYmFsIFNlY29uZGFyeSBJbmRleGVzXG4gICAgdGhpcy5wcm9qZWN0c1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogJ2NyZWF0ZWRCeS1jcmVhdGVkRGF0ZS1pbmRleCcsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgXG4gICAgICAgIG5hbWU6ICdjcmVhdGVkQnknLCBcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgXG4gICAgICB9LFxuICAgICAgc29ydEtleTogeyBcbiAgICAgICAgbmFtZTogJ2NyZWF0ZWREYXRlJywgXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIFxuICAgICAgfSxcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTEwsXG4gICAgfSk7XG5cbiAgICB0aGlzLnByb2plY3RzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiAnc2hhcmVkV2l0aC1pbmRleCcsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgXG4gICAgICAgIG5hbWU6ICdzaGFyZWRXaXRoJywgXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIFxuICAgICAgfSxcbiAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5BTEwsXG4gICAgfSk7XG5cbiAgICAvLyBQcm9qZWN0IERhdGEgdGFibGUgLSBzdG9yZXMgYWN0dWFsIHByb2plY3QgZGF0YSAoc2tpbGxzLCB0ZWNoIHJhZGFyLCBwb3J0Zm9saW8sIGV0Yy4pXG4gICAgdGhpcy5wcm9qZWN0RGF0YVRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdQcm9qZWN0RGF0YVRhYmxlJywge1xuICAgICAgdGFibGVOYW1lOiBgYXBwLW1vZGV4LXByb2plY3QtZGF0YWAsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgXG4gICAgICAgIG5hbWU6ICdwcm9qZWN0SWQnLCBcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgXG4gICAgICB9LFxuICAgICAgc29ydEtleToge1xuICAgICAgICBuYW1lOiAnZGF0YVR5cGUnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklOR1xuICAgICAgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjoge1xuICAgICAgICBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogZW52aXJvbm1lbnQgPT09ICdwcm9kJyxcbiAgICAgIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIEFkZCB0YWdzIHRvIFByb2plY3QgRGF0YSB0YWJsZVxuICAgIGNkay5UYWdzLm9mKHRoaXMucHJvamVjdERhdGFUYWJsZSkuYWRkKCdQcm9qZWN0JywgJ0FwcC1Nb2RFeCcpO1xuICAgIGNkay5UYWdzLm9mKHRoaXMucHJvamVjdERhdGFUYWJsZSkuYWRkKCdFbnZpcm9ubWVudCcsIGVudmlyb25tZW50KTtcbiAgICBjZGsuVGFncy5vZih0aGlzLnByb2plY3REYXRhVGFibGUpLmFkZCgnRGF0YVR5cGUnLCAnUHJvamVjdENvbnRlbnQnKTtcblxuICAgIC8vIEFkZCBHbG9iYWwgU2Vjb25kYXJ5IEluZGV4IGZvciBkYXRhIHR5cGUgcXVlcmllc1xuICAgIHRoaXMucHJvamVjdERhdGFUYWJsZS5hZGRHbG9iYWxTZWNvbmRhcnlJbmRleCh7XG4gICAgICBpbmRleE5hbWU6ICdkYXRhVHlwZS1sYXN0VXBkYXRlZC1pbmRleCcsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgXG4gICAgICAgIG5hbWU6ICdkYXRhVHlwZScsIFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyBcbiAgICAgIH0sXG4gICAgICBzb3J0S2V5OiB7IFxuICAgICAgICBuYW1lOiAnbGFzdFVwZGF0ZWQnLCBcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgXG4gICAgICB9LFxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLktFWVNfT05MWSxcbiAgICB9KTtcblxuICAgIC8vIEV4cG9ydCBIaXN0b3J5IHRhYmxlIC0gc3RvcmVzIGV4cG9ydCBqb2IgbWV0YWRhdGEgYW5kIHN0YXR1c1xuICAgIGNvbnN0IGV4cG9ydEhpc3RvcnlUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnRXhwb3J0SGlzdG9yeVRhYmxlJywge1xuICAgICAgdGFibGVOYW1lOiBgYXBwLW1vZGV4LWV4cG9ydC1oaXN0b3J5YCxcbiAgICAgIHBhcnRpdGlvbktleTogeyBcbiAgICAgICAgbmFtZTogJ2V4cG9ydElkJywgXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIFxuICAgICAgfSxcbiAgICAgIHNvcnRLZXk6IHtcbiAgICAgICAgbmFtZTogJ3Byb2plY3RJZCcsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HXG4gICAgICB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIGVuY3J5cHRpb246IGR5bmFtb2RiLlRhYmxlRW5jcnlwdGlvbi5BV1NfTUFOQUdFRCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7XG4gICAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnLFxuICAgICAgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgdGltZVRvTGl2ZUF0dHJpYnV0ZTogJ3R0bCcsXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgdGFncyB0byBFeHBvcnQgSGlzdG9yeSB0YWJsZVxuICAgIGNkay5UYWdzLm9mKGV4cG9ydEhpc3RvcnlUYWJsZSkuYWRkKCdQcm9qZWN0JywgJ0FwcC1Nb2RFeCcpO1xuICAgIGNkay5UYWdzLm9mKGV4cG9ydEhpc3RvcnlUYWJsZSkuYWRkKCdFbnZpcm9ubWVudCcsIGVudmlyb25tZW50KTtcbiAgICBjZGsuVGFncy5vZihleHBvcnRIaXN0b3J5VGFibGUpLmFkZCgnRGF0YVR5cGUnLCAnRXhwb3J0TWV0YWRhdGEnKTtcblxuICAgIC8vIEFkZCBHbG9iYWwgU2Vjb25kYXJ5IEluZGV4ZXMgZm9yIGV4cG9ydCBoaXN0b3J5IHF1ZXJpZXNcbiAgICBleHBvcnRIaXN0b3J5VGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiAncHJvamVjdElkLWNyZWF0ZWRBdC1pbmRleCcsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgXG4gICAgICAgIG5hbWU6ICdwcm9qZWN0SWQnLCBcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgXG4gICAgICB9LFxuICAgICAgc29ydEtleTogeyBcbiAgICAgICAgbmFtZTogJ2NyZWF0ZWRBdCcsIFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyBcbiAgICAgIH0sXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMLFxuICAgIH0pO1xuXG4gICAgZXhwb3J0SGlzdG9yeVRhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogJ3VzZXJJZC1jcmVhdGVkQXQtaW5kZXgnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7IFxuICAgICAgICBuYW1lOiAndXNlcklkJywgXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIFxuICAgICAgfSxcbiAgICAgIHNvcnRLZXk6IHsgXG4gICAgICAgIG5hbWU6ICdjcmVhdGVkQXQnLCBcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgXG4gICAgICB9LFxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTCxcbiAgICB9KTtcblxuICAgIC8vIFN0b3JlIGV4cG9ydCBoaXN0b3J5IHRhYmxlIHJlZmVyZW5jZSBmb3IgYmFja2VuZCBzdGFja1xuICAgIHRoaXMuZXhwb3J0SGlzdG9yeVRhYmxlID0gZXhwb3J0SGlzdG9yeVRhYmxlO1xuXG4gICAgLy8gPT09PT0gQ09HTklUTyBVU0VSIFBPT0wgPT09PT1cbiAgICBcbiAgICAvLyBVc2VyIFBvb2wgZm9yIGF1dGhlbnRpY2F0aW9uXG4gICAgdGhpcy51c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsICdVc2VyUG9vbCcsIHtcbiAgICAgIHVzZXJQb29sTmFtZTogYGFwcC1tb2RleC11c2Vyc2AsXG4gICAgICBzZWxmU2lnblVwRW5hYmxlZDogZmFsc2UsXG4gICAgICBhdXRvVmVyaWZ5OiB7IGVtYWlsOiB0cnVlIH0sXG4gICAgICBzdGFuZGFyZEF0dHJpYnV0ZXM6IHtcbiAgICAgICAgZW1haWw6IHtcbiAgICAgICAgICByZXF1aXJlZDogdHJ1ZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBnaXZlbk5hbWU6IHtcbiAgICAgICAgICByZXF1aXJlZDogdHJ1ZSxcbiAgICAgICAgICBtdXRhYmxlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBmYW1pbHlOYW1lOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IHRydWUsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgICBtaW5MZW5ndGg6IDgsXG4gICAgICAgIHJlcXVpcmVMb3dlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXG4gICAgICAgIHJlcXVpcmVTeW1ib2xzOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIGFjY291bnRSZWNvdmVyeTogY29nbml0by5BY2NvdW50UmVjb3ZlcnkuRU1BSUxfT05MWSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIGRvbWFpbiBmb3IgaG9zdGVkIFVJXG4gICAgdGhpcy51c2VyUG9vbC5hZGREb21haW4oJ0NvZ25pdG9Eb21haW4nLCB7XG4gICAgICBjb2duaXRvRG9tYWluOiB7XG4gICAgICAgIGRvbWFpblByZWZpeDogYGFwcC1tb2RleGAsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gVXNlciBQb29sIENsaWVudCBmb3IgZnJvbnRlbmQgYXBwbGljYXRpb25cbiAgICB0aGlzLnVzZXJQb29sQ2xpZW50ID0gdGhpcy51c2VyUG9vbC5hZGRDbGllbnQoJ1dlYkNsaWVudCcsIHtcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogYGFwcC1tb2RleC13ZWItY2xpZW50YCxcbiAgICAgIGF1dGhGbG93czoge1xuICAgICAgICB1c2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICAgIHVzZXJTcnA6IHRydWUsXG4gICAgICAgIGFkbWluVXNlclBhc3N3b3JkOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIG9BdXRoOiB7XG4gICAgICAgIGZsb3dzOiB7XG4gICAgICAgICAgYXV0aG9yaXphdGlvbkNvZGVHcmFudDogdHJ1ZSxcbiAgICAgICAgICBpbXBsaWNpdENvZGVHcmFudDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgc2NvcGVzOiBbY29nbml0by5PQXV0aFNjb3BlLkVNQUlMLCBjb2duaXRvLk9BdXRoU2NvcGUuT1BFTklELCBjb2duaXRvLk9BdXRoU2NvcGUuUFJPRklMRV0sXG4gICAgICAgIGNhbGxiYWNrVXJsczogW1xuICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDAvJyxcbiAgICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAwL2NhbGxiYWNrJyxcbiAgICAgICAgICAnaHR0cHM6Ly9sb2NhbGhvc3Q6MzAwMC8nLFxuICAgICAgICAgICdodHRwczovL2xvY2FsaG9zdDozMDAwL2NhbGxiYWNrJyxcbiAgICAgICAgICBgaHR0cHM6Ly8ke3RoaXMucmVnaW9ufS5jb25zb2xlLmF3cy5hbWF6b24uY29tL2NvZ25pdG8vb2F1dGgyL3N1Y2Nlc3NgLFxuICAgICAgICAgIGBodHRwczovLyR7dGhpcy5yZWdpb259LmNvbnNvbGUuYXdzLmFtYXpvbi5jb20vY29nbml0by9vYXV0aDIvY2FsbGJhY2tgLFxuICAgICAgICBdLFxuICAgICAgICBsb2dvdXRVcmxzOiBbXG4gICAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMC8nLFxuICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDAvbG9nb3V0JyxcbiAgICAgICAgICAnaHR0cHM6Ly9sb2NhbGhvc3Q6MzAwMC8nLFxuICAgICAgICAgICdodHRwczovL2xvY2FsaG9zdDozMDAwL2xvZ291dCcsXG4gICAgICAgICAgYGh0dHBzOi8vJHt0aGlzLnJlZ2lvbn0uY29uc29sZS5hd3MuYW1hem9uLmNvbS9jb2duaXRvL29hdXRoMi9sb2dvdXRgLFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICAgIHByZXZlbnRVc2VyRXhpc3RlbmNlRXJyb3JzOiB0cnVlLFxuICAgICAgc3VwcG9ydGVkSWRlbnRpdHlQcm92aWRlcnM6IFtjb2duaXRvLlVzZXJQb29sQ2xpZW50SWRlbnRpdHlQcm92aWRlci5DT0dOSVRPXSxcbiAgICB9KTtcbiAgICBcbiAgICAvLyBDcmVhdGUgQ29nbml0byBJZGVudGl0eSBQb29sIGZvciByb2xlLWJhc2VkIGFjY2Vzc1xuICAgIHRoaXMuaWRlbnRpdHlQb29sID0gbmV3IGNvZ25pdG8uQ2ZuSWRlbnRpdHlQb29sKHRoaXMsICdJZGVudGl0eVBvb2wnLCB7XG4gICAgICBpZGVudGl0eVBvb2xOYW1lOiBgYXBwLW1vZGV4LWlkZW50aXR5LXBvb2xgLFxuICAgICAgYWxsb3dVbmF1dGhlbnRpY2F0ZWRJZGVudGl0aWVzOiBmYWxzZSxcbiAgICAgIGNvZ25pdG9JZGVudGl0eVByb3ZpZGVyczogW3tcbiAgICAgICAgY2xpZW50SWQ6IHRoaXMudXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgICAgcHJvdmlkZXJOYW1lOiB0aGlzLnVzZXJQb29sLnVzZXJQb29sUHJvdmlkZXJOYW1lLFxuICAgICAgICBzZXJ2ZXJTaWRlVG9rZW5DaGVjazogdHJ1ZVxuICAgICAgfV1cbiAgICB9KTtcbiAgICBcbiAgICAvLyBDcmVhdGUgZGVmYXVsdCBhdXRoZW50aWNhdGVkIGFuZCB1bmF1dGhlbnRpY2F0ZWQgcm9sZXNcbiAgICBjb25zdCBhdXRoZW50aWNhdGVkUm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnRGVmYXVsdEF1dGhlbnRpY2F0ZWRSb2xlJywge1xuICAgICAgcm9sZU5hbWU6IGBhcHAtbW9kZXgtZGVmYXVsdC1hdXRoZW50aWNhdGVkYCxcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5GZWRlcmF0ZWRQcmluY2lwYWwoXG4gICAgICAgICdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb20nLFxuICAgICAgICB7XG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICAnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmF1ZCc6IHRoaXMuaWRlbnRpdHlQb29sLnJlZlxuICAgICAgICAgIH0sXG4gICAgICAgICAgJ0ZvckFueVZhbHVlOlN0cmluZ0xpa2UnOiB7XG4gICAgICAgICAgICAnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmFtcic6ICdhdXRoZW50aWNhdGVkJ1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgJ3N0czpBc3N1bWVSb2xlV2l0aFdlYklkZW50aXR5J1xuICAgICAgKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRGVmYXVsdCByb2xlIGZvciBhdXRoZW50aWNhdGVkIHVzZXJzJ1xuICAgIH0pO1xuICAgIFxuICAgIGNvbnN0IHVuYXV0aGVudGljYXRlZFJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0RlZmF1bHRVbmF1dGhlbnRpY2F0ZWRSb2xlJywge1xuICAgICAgcm9sZU5hbWU6IGBhcHAtbW9kZXgtZGVmYXVsdC11bmF1dGhlbnRpY2F0ZWRgLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLkZlZGVyYXRlZFByaW5jaXBhbChcbiAgICAgICAgJ2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbScsXG4gICAgICAgIHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgICdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YXVkJzogdGhpcy5pZGVudGl0eVBvb2wucmVmXG4gICAgICAgICAgfSxcbiAgICAgICAgICAnRm9yQW55VmFsdWU6U3RyaW5nTGlrZSc6IHtcbiAgICAgICAgICAgICdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YW1yJzogJ3VuYXV0aGVudGljYXRlZCdcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgICdzdHM6QXNzdW1lUm9sZVdpdGhXZWJJZGVudGl0eSdcbiAgICAgICksXG4gICAgICBkZXNjcmlwdGlvbjogJ0RlZmF1bHQgcm9sZSBmb3IgdW5hdXRoZW50aWNhdGVkIHVzZXJzJ1xuICAgIH0pO1xuICAgIFxuICAgIC8vIEF0dGFjaCBtaW5pbWFsIHBlcm1pc3Npb25zIHRvIHRoZSBkZWZhdWx0IGF1dGhlbnRpY2F0ZWQgcm9sZVxuICAgIC8vIE5PVEU6IFVzZXJzIHNob3VsZCBiZSBhc3NpZ25lZCBwcm9qZWN0LXNwZWNpZmljIHJvbGVzIGZvciBhY3R1YWwgcmVzb3VyY2UgYWNjZXNzXG4gICAgLy8gVGhpcyBkZWZhdWx0IHJvbGUgb25seSBhbGxvd3MgbGlzdGluZyBwcm9qZWN0cyBhbmQgYmFzaWMgQVBJIGFjY2Vzc1xuICAgIGF1dGhlbnRpY2F0ZWRSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ2V4ZWN1dGUtYXBpOkludm9rZSdcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6ZXhlY3V0ZS1hcGk6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OiovKi9HRVQvcHJvamVjdHNgLFxuICAgICAgICBgYXJuOmF3czpleGVjdXRlLWFwaToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06Ki8qL0dFVC9wcm9qZWN0cy8qYFxuICAgICAgXVxuICAgIH0pKTtcbiAgICBcbiAgICAvLyBVc2VycyBtdXN0IGFzc3VtZSBwcm9qZWN0LXNwZWNpZmljIHJvbGVzIChhcHAtbW9kZXgtcHJvai17cHJvamVjdElkfS1yZWFkL3dyaXRlKVxuICAgIC8vIGZvciBhY3R1YWwgUzMgYW5kIER5bmFtb0RCIGFjY2Vzcy4gVGhpcyBlbmZvcmNlcyBsZWFzdC1wcml2aWxlZ2UgYW5kIGV4cGxpY2l0XG4gICAgLy8gcHJvamVjdC1sZXZlbCBhY2Nlc3MgY29udHJvbC5cbiAgICBcbiAgICAvLyBBdHRhY2ggdGhlIHJvbGVzIHRvIHRoZSBpZGVudGl0eSBwb29sXG4gICAgbmV3IGNvZ25pdG8uQ2ZuSWRlbnRpdHlQb29sUm9sZUF0dGFjaG1lbnQodGhpcywgJ0lkZW50aXR5UG9vbFJvbGVBdHRhY2htZW50Jywge1xuICAgICAgaWRlbnRpdHlQb29sSWQ6IHRoaXMuaWRlbnRpdHlQb29sLnJlZixcbiAgICAgIHJvbGVzOiB7XG4gICAgICAgIGF1dGhlbnRpY2F0ZWQ6IGF1dGhlbnRpY2F0ZWRSb2xlLnJvbGVBcm4sXG4gICAgICAgIHVuYXV0aGVudGljYXRlZDogdW5hdXRoZW50aWNhdGVkUm9sZS5yb2xlQXJuXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyA9PT09PSBTMyBCVUNLRVRTID09PT09XG5cbiAgICAvLyBBY2Nlc3MgbG9ncyBidWNrZXQgZm9yIFMzIGFuZCBBUEkgR2F0ZXdheVxuICAgIHRoaXMuYWNjZXNzTG9nc0J1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0FjY2Vzc0xvZ3NCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgYXBwLW1vZGV4LWFjY2Vzcy1sb2dzLSR7dGhpcy5hY2NvdW50fS0ke3RoaXMucmVnaW9ufWAsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgdmVyc2lvbmVkOiBmYWxzZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBSZW1vdmFsUG9saWN5LlJFVEFJTiA6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiBlbnZpcm9ubWVudCAhPT0gJ3Byb2QnLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGV4cGlyYXRpb246IER1cmF0aW9uLmRheXMoOTApLFxuICAgICAgICAgIG5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjogRHVyYXRpb24uZGF5cygzMCksXG4gICAgICAgIH1cbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIEVuZm9yY2UgZW5jcnlwdGlvbiBpbiB0cmFuc2l0XG4gICAgdGhpcy5hY2Nlc3NMb2dzQnVja2V0LmFkZFRvUmVzb3VyY2VQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgc2lkOiAnRGVueUluc2VjdXJlVHJhbnNwb3J0JyxcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5ERU5ZLFxuICAgICAgcHJpbmNpcGFsczogW25ldyBpYW0uQW55UHJpbmNpcGFsKCldLFxuICAgICAgYWN0aW9uczogWydzMzoqJ10sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgdGhpcy5hY2Nlc3NMb2dzQnVja2V0LmJ1Y2tldEFybixcbiAgICAgICAgYCR7dGhpcy5hY2Nlc3NMb2dzQnVja2V0LmJ1Y2tldEFybn0vKmBcbiAgICAgIF0sXG4gICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgIEJvb2w6IHtcbiAgICAgICAgICAnYXdzOlNlY3VyZVRyYW5zcG9ydCc6ICdmYWxzZSdcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKTtcblxuICAgIC8vIERlcGxveW1lbnQgYnVja2V0IGZvciBMYW1iZGEgY29kZSBhbmQgYXNzZXRzXG4gICAgdGhpcy5kZXBsb3ltZW50QnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnRGVwbG95bWVudEJ1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGBhcHAtbW9kZXgtZGVwbG95bWVudC0ke3RoaXMuYWNjb3VudH0tJHt0aGlzLnJlZ2lvbn1gLFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGVudmlyb25tZW50ID09PSAncHJvZCcgPyBSZW1vdmFsUG9saWN5LlJFVEFJTiA6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiBlbnZpcm9ubWVudCAhPT0gJ3Byb2QnLFxuICAgICAgc2VydmVyQWNjZXNzTG9nc0J1Y2tldDogdGhpcy5hY2Nlc3NMb2dzQnVja2V0LFxuICAgICAgc2VydmVyQWNjZXNzTG9nc1ByZWZpeDogJ2RlcGxveW1lbnQtYnVja2V0LycsXG4gICAgfSk7XG5cbiAgICAvLyBFbmZvcmNlIGVuY3J5cHRpb24gaW4gdHJhbnNpdFxuICAgIHRoaXMuZGVwbG95bWVudEJ1Y2tldC5hZGRUb1Jlc291cmNlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIHNpZDogJ0RlbnlJbnNlY3VyZVRyYW5zcG9ydCcsXG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuREVOWSxcbiAgICAgIHByaW5jaXBhbHM6IFtuZXcgaWFtLkFueVByaW5jaXBhbCgpXSxcbiAgICAgIGFjdGlvbnM6IFsnczM6KiddLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIHRoaXMuZGVwbG95bWVudEJ1Y2tldC5idWNrZXRBcm4sXG4gICAgICAgIGAke3RoaXMuZGVwbG95bWVudEJ1Y2tldC5idWNrZXRBcm59LypgXG4gICAgICBdLFxuICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICBCb29sOiB7XG4gICAgICAgICAgJ2F3czpTZWN1cmVUcmFuc3BvcnQnOiAnZmFsc2UnXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSk7XG5cbiAgICAvLyBQcm9qZWN0IGRhdGEgYnVja2V0IGZvciBzdG9yaW5nIHByb2plY3Qtc3BlY2lmaWMgZGF0YVxuICAgIHRoaXMucHJvamVjdERhdGFCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdQcm9qZWN0RGF0YUJ1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGBhcHAtbW9kZXgtcHJvamVjdC1kYXRhLSR7dGhpcy5hY2NvdW50fS0ke3RoaXMucmVnaW9ufWAsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgcmVtb3ZhbFBvbGljeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IFJlbW92YWxQb2xpY3kuUkVUQUlOIDogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IGVudmlyb25tZW50ICE9PSAncHJvZCcsXG4gICAgICBzZXJ2ZXJBY2Nlc3NMb2dzQnVja2V0OiB0aGlzLmFjY2Vzc0xvZ3NCdWNrZXQsXG4gICAgICBzZXJ2ZXJBY2Nlc3NMb2dzUHJlZml4OiAncHJvamVjdC1kYXRhLWxvZ3MvJyxcbiAgICB9KTtcblxuICAgIC8vIEVuZm9yY2UgZW5jcnlwdGlvbiBpbiB0cmFuc2l0XG4gICAgdGhpcy5wcm9qZWN0RGF0YUJ1Y2tldC5hZGRUb1Jlc291cmNlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIHNpZDogJ0RlbnlJbnNlY3VyZVRyYW5zcG9ydCcsXG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuREVOWSxcbiAgICAgIHByaW5jaXBhbHM6IFtuZXcgaWFtLkFueVByaW5jaXBhbCgpXSxcbiAgICAgIGFjdGlvbnM6IFsnczM6KiddLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIHRoaXMucHJvamVjdERhdGFCdWNrZXQuYnVja2V0QXJuLFxuICAgICAgICBgJHt0aGlzLnByb2plY3REYXRhQnVja2V0LmJ1Y2tldEFybn0vKmBcbiAgICAgIF0sXG4gICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgIEJvb2w6IHtcbiAgICAgICAgICAnYXdzOlNlY3VyZVRyYW5zcG9ydCc6ICdmYWxzZSdcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKTtcblxuICAgIC8vID09PT09IEdMVUUgUkVTT1VSQ0VTID09PT09XG5cbiAgICAvLyBHbHVlIGRhdGFiYXNlIGZvciBBdGhlbmEgcXVlcmllc1xuICAgIHRoaXMuZ2x1ZURhdGFiYXNlID0gbmV3IGdsdWUuQ2ZuRGF0YWJhc2UodGhpcywgJ0FwcE1vZEV4RGF0YWJhc2UnLCB7XG4gICAgICBjYXRhbG9nSWQ6IHRoaXMuYWNjb3VudCxcbiAgICAgIGRhdGFiYXNlSW5wdXQ6IHtcbiAgICAgICAgbmFtZTogJ2FwcF9tb2RleF9kYXRhJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdBcHAtTW9kRXggZGF0YSBjYXRhbG9nIGZvciBBdGhlbmEgcXVlcmllcycsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT0gU0VDUkVUUyBNQU5BR0VSID09PT09XG5cbiAgICAvLyBBcHAgY29uZmlndXJhdGlvbiBzZWNyZXQgZm9yIHN0b3Jpbmcgc2Vuc2l0aXZlIGNvbmZpZ3VyYXRpb25cbiAgICAvLyBTdG9yZXMgQ29nbml0byBVc2VyIFBvb2wgSUQgYW5kIElkZW50aXR5IFBvb2wgSUQgdG8gYXZvaWQgZXhwb3NpbmcgaW4gZW52aXJvbm1lbnQgdmFyaWFibGVzXG4gICAgdGhpcy5hcHBDb25maWdTZWNyZXQgPSBuZXcgc2VjcmV0c21hbmFnZXIuU2VjcmV0KHRoaXMsICdBcHBDb25maWdTZWNyZXQnLCB7XG4gICAgICBzZWNyZXROYW1lOiBgYXBwLW1vZGV4LWNvbmZpZy0ke2Vudmlyb25tZW50fWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FwcC1Nb2RFeCBhcHBsaWNhdGlvbiBjb25maWd1cmF0aW9uIChDb2duaXRvIElEcyknLFxuICAgICAgcmVtb3ZhbFBvbGljeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IFJlbW92YWxQb2xpY3kuUkVUQUlOIDogUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgc2VjcmV0T2JqZWN0VmFsdWU6IHtcbiAgICAgICAgdXNlclBvb2xJZDogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dCh0aGlzLnVzZXJQb29sLnVzZXJQb29sSWQpLFxuICAgICAgICBpZGVudGl0eVBvb2xJZDogY2RrLlNlY3JldFZhbHVlLnVuc2FmZVBsYWluVGV4dCh0aGlzLmlkZW50aXR5UG9vbC5yZWYpLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIEV4cG9ydCBvdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb2plY3RzVGFibGVOYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMucHJvamVjdHNUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb2plY3RzIER5bmFtb0RCIFRhYmxlIE5hbWUnLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LVByb2plY3RzVGFibGVOYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcm9qZWN0RGF0YVRhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnByb2plY3REYXRhVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9qZWN0IERhdGEgRHluYW1vREIgVGFibGUgTmFtZScsXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtUHJvamVjdERhdGFUYWJsZU5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy51c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBJRCcsXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtVXNlclBvb2xJZCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xDbGllbnRJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIENsaWVudCBJRCcsXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtVXNlclBvb2xDbGllbnRJZCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnSWRlbnRpdHlQb29sSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5pZGVudGl0eVBvb2wucmVmLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIElkZW50aXR5IFBvb2wgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LUlkZW50aXR5UG9vbElkJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEZXBsb3ltZW50QnVja2V0TmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmRlcGxveW1lbnRCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRGVwbG95bWVudCBTMyBCdWNrZXQgTmFtZScsXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtRGVwbG95bWVudEJ1Y2tldE5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb2plY3REYXRhQnVja2V0TmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnByb2plY3REYXRhQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb2plY3QgRGF0YSBTMyBCdWNrZXQgTmFtZScsXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtUHJvamVjdERhdGFCdWNrZXROYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdHbHVlRGF0YWJhc2VOYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuZ2x1ZURhdGFiYXNlLnJlZixcbiAgICAgIGRlc2NyaXB0aW9uOiAnR2x1ZSBEYXRhYmFzZSBOYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdBcHBNb2RFeC1HbHVlRGF0YWJhc2VOYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBY2Nlc3NMb2dzQnVja2V0TmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFjY2Vzc0xvZ3NCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWNjZXNzIExvZ3MgUzMgQnVja2V0IE5hbWUnLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LUFjY2Vzc0xvZ3NCdWNrZXROYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFeHBvcnRIaXN0b3J5VGFibGVOYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuZXhwb3J0SGlzdG9yeVRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRXhwb3J0IEhpc3RvcnkgRHluYW1vREIgVGFibGUgTmFtZScsXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtRXhwb3J0SGlzdG9yeVRhYmxlTmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBwQ29uZmlnU2VjcmV0QXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuYXBwQ29uZmlnU2VjcmV0LnNlY3JldEFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnQXBwIENvbmZpZyBTZWNyZXQgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdBcHBNb2RFeC1BcHBDb25maWdTZWNyZXRBcm4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJQb29sQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMudXNlclBvb2wudXNlclBvb2xBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIEFSTicsXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtVXNlclBvb2xBcm4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb2plY3RzVGFibGVBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5wcm9qZWN0c1RhYmxlLnRhYmxlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9qZWN0cyBEeW5hbW9EQiBUYWJsZSBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LVByb2plY3RzVGFibGVBcm4nLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb2plY3REYXRhVGFibGVBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5wcm9qZWN0RGF0YVRhYmxlLnRhYmxlQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9qZWN0IERhdGEgRHluYW1vREIgVGFibGUgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdBcHBNb2RFeC1Qcm9qZWN0RGF0YVRhYmxlQXJuJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdFeHBvcnRIaXN0b3J5VGFibGVBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5leHBvcnRIaXN0b3J5VGFibGUudGFibGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0V4cG9ydCBIaXN0b3J5IER5bmFtb0RCIFRhYmxlIEFSTicsXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtRXhwb3J0SGlzdG9yeVRhYmxlQXJuJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEZXBsb3ltZW50QnVja2V0QXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuZGVwbG95bWVudEJ1Y2tldC5idWNrZXRBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0RlcGxveW1lbnQgUzMgQnVja2V0IEFSTicsXG4gICAgICBleHBvcnROYW1lOiAnQXBwTW9kRXgtRGVwbG95bWVudEJ1Y2tldEFybicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJvamVjdERhdGFCdWNrZXRBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5wcm9qZWN0RGF0YUJ1Y2tldC5idWNrZXRBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb2plY3QgRGF0YSBTMyBCdWNrZXQgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdBcHBNb2RFeC1Qcm9qZWN0RGF0YUJ1Y2tldEFybicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQWNjZXNzTG9nc0J1Y2tldEFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFjY2Vzc0xvZ3NCdWNrZXQuYnVja2V0QXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdBY2Nlc3MgTG9ncyBTMyBCdWNrZXQgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdBcHBNb2RFeC1BY2Nlc3NMb2dzQnVja2V0QXJuJyxcbiAgICB9KTtcbiAgfVxufVxuIl19