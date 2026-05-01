"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModExPromptTemplatesStack = void 0;
const cdk = require("aws-cdk-lib");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const lambda = require("aws-cdk-lib/aws-lambda");
const iam = require("aws-cdk-lib/aws-iam");
const logs = require("aws-cdk-lib/aws-logs");
const aws_cdk_lib_1 = require("aws-cdk-lib");
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
 * - Pilot Analysis prompts (Claude Sonnet 4.6)
 * - Skill Importance prompts (Nova Lite)
 */
class AppModExPromptTemplatesStack extends cdk.Stack {
    constructor(scope, id, props) {
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
                removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
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
exports.AppModExPromptTemplatesStack = AppModExPromptTemplatesStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLW1vZGV4LXByb21wdC10ZW1wbGF0ZXMtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhcHAtbW9kZXgtcHJvbXB0LXRlbXBsYXRlcy1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFFbkMscURBQXFEO0FBQ3JELGlEQUFpRDtBQUNqRCwyQ0FBMkM7QUFDM0MsNkNBQTZDO0FBQzdDLDZDQUE0QztBQU01Qzs7Ozs7Ozs7Ozs7Ozs7OztHQWdCRztBQUNILE1BQWEsNEJBQTZCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFHekQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUF3QztRQUNoRixLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsV0FBVyxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRTlCLHFDQUFxQztRQUVyQyxJQUFJLENBQUMsb0JBQW9CLEdBQUcsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUMzRSxTQUFTLEVBQUUsNEJBQTRCO1lBQ3ZDLFlBQVksRUFBRTtnQkFDWixJQUFJLEVBQUUsVUFBVTtnQkFDaEIsSUFBSSxFQUFFLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTTthQUNwQztZQUNELE9BQU8sRUFBRTtnQkFDUCxJQUFJLEVBQUUsY0FBYztnQkFDcEIsSUFBSSxFQUFFLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTTthQUNwQztZQUNELFdBQVcsRUFBRSxRQUFRLENBQUMsV0FBVyxDQUFDLGVBQWU7WUFDakQsVUFBVSxFQUFFLFFBQVEsQ0FBQyxlQUFlLENBQUMsV0FBVztZQUNoRCxnQ0FBZ0MsRUFBRTtnQkFDaEMsMEJBQTBCLEVBQUUsV0FBVyxLQUFLLE1BQU07YUFDbkQ7WUFDRCxhQUFhLEVBQUUsV0FBVyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEs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Y0FBYyxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUNsRCxZQUFZLEVBQUUsWUFBWSxDQUFDLFlBQVk7WUFDdkMsVUFBVSxFQUFFO2dCQUNWLFNBQVMsRUFBRSxJQUFJLENBQUMsb0JBQW9CLENBQUMsU0FBUzthQUMvQztTQUNGLENBQUMsQ0FBQztRQUVILHNCQUFzQjtRQUV0QixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLDBCQUEwQixFQUFFO1lBQ2xELEtBQUssRUFBRSxJQUFJLENBQUMsb0JBQW9CLENBQUMsU0FBUztZQUMxQyxXQUFXLEVBQUUsNkJBQTZCO1lBQzFDLFVBQVUsRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFTLDJCQUEyQjtTQUN6RCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHlCQUF5QixFQUFFO1lBQ2pELEtBQUssRUFBRSxJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUTtZQUN6QyxXQUFXLEVBQUUsNEJBQTRCO1lBQ3pDLFVBQVUsRUFBRSxHQUFHLElBQUksQ0FBQyxTQUFTLDBCQUEwQjtTQUN4RCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFoSEQsb0VBZ0hDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0IHsgUmVtb3ZhbFBvbGljeSB9IGZyb20gJ2F3cy1jZGstbGliJztcblxuZXhwb3J0IGludGVyZmFjZSBBcHBNb2RFeFByb21wdFRlbXBsYXRlc1N0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG59XG5cbi8qKlxuICogQXBwLU1vZEV4IFByb21wdCBUZW1wbGF0ZXMgU3RhY2tcbiAqIFxuICogQVJDSElURUNUVVJFIE5PVEU6IE9wdGlvbiBDIC0gRGlyZWN0IE1vZGVsIEludm9jYXRpb24gd2l0aCBQcm9tcHQgVGVtcGxhdGVzXG4gKiAtIFN0b3JlcyBBSSBwcm9tcHRzIGluIER5bmFtb0RCIGZvciBjZW50cmFsaXplZCBtYW5hZ2VtZW50XG4gKiAtIFN1cHBvcnRzIHZlcnNpb25pbmcgYW5kIHBlci1tb2RlbCBjdXN0b21pemF0aW9uXG4gKiAtIEVuYWJsZXMgcnVudGltZSBwcm9tcHQgdXBkYXRlcyB3aXRob3V0IExhbWJkYSByZWRlcGxveW1lbnRcbiAqIC0gUmVwbGFjZXMgQmVkcm9jayBBZ2VudCBpbmZyYXN0cnVjdHVyZSB3aXRoIGRpcmVjdCBtb2RlbCBjYWxsc1xuICogXG4gKiBUYWJsZXM6XG4gKiAtIFByb21wdFRlbXBsYXRlczogU3RvcmVzIHByb21wdCB0ZW1wbGF0ZXMgd2l0aCB2ZXJzaW9uaW5nXG4gKiBcbiAqIFNlZWQgRGF0YTpcbiAqIC0gTm9ybWFsaXphdGlvbiBwcm9tcHRzIChOb3ZhIExpdGUpXG4gKiAtIFBpbG90IEFuYWx5c2lzIHByb21wdHMgKENsYXVkZSAzLjcgU29ubmV0KVxuICogLSBTa2lsbCBJbXBvcnRhbmNlIHByb21wdHMgKE5vdmEgTGl0ZSlcbiAqL1xuZXhwb3J0IGNsYXNzIEFwcE1vZEV4UHJvbXB0VGVtcGxhdGVzU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgcHJvbXB0VGVtcGxhdGVzVGFibGU6IGR5bmFtb2RiLlRhYmxlO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBBcHBNb2RFeFByb21wdFRlbXBsYXRlc1N0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgZW52aXJvbm1lbnQgfSA9IHByb3BzO1xuXG4gICAgLy8gPT09PT0gUFJPTVBUIFRFTVBMQVRFUyBUQUJMRSA9PT09PVxuICAgIFxuICAgIHRoaXMucHJvbXB0VGVtcGxhdGVzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1Byb21wdFRlbXBsYXRlc1RhYmxlJywge1xuICAgICAgdGFibGVOYW1lOiBgYXBwLW1vZGV4LXByb21wdC10ZW1wbGF0ZXNgLFxuICAgICAgcGFydGl0aW9uS2V5OiB7XG4gICAgICAgIG5hbWU6ICdwcm9tcHRJZCcsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HXG4gICAgICB9LFxuICAgICAgc29ydEtleToge1xuICAgICAgICBuYW1lOiAnbW9kZWxWZXJzaW9uJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkdcbiAgICAgIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgZW5jcnlwdGlvbjogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkFXU19NQU5BR0VELFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHtcbiAgICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IGVudmlyb25tZW50ID09PSAncHJvZCcsXG4gICAgICB9LFxuICAgICAgcmVtb3ZhbFBvbGljeTogZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgdGFnc1xuICAgIGNkay5UYWdzLm9mKHRoaXMucHJvbXB0VGVtcGxhdGVzVGFibGUpLmFkZCgnUHJvamVjdCcsICdBcHAtTW9kRXgnKTtcbiAgICBjZGsuVGFncy5vZih0aGlzLnByb21wdFRlbXBsYXRlc1RhYmxlKS5hZGQoJ0Vudmlyb25tZW50JywgZW52aXJvbm1lbnQpO1xuICAgIGNkay5UYWdzLm9mKHRoaXMucHJvbXB0VGVtcGxhdGVzVGFibGUpLmFkZCgnRGF0YVR5cGUnLCAnUHJvbXB0VGVtcGxhdGVzJyk7XG5cbiAgICAvLyBBZGQgR1NJIGZvciBxdWVyeWluZyBieSBzdGF0dXNcbiAgICB0aGlzLnByb21wdFRlbXBsYXRlc1RhYmxlLmFkZEdsb2JhbFNlY29uZGFyeUluZGV4KHtcbiAgICAgIGluZGV4TmFtZTogJ3N0YXR1cy11cGRhdGVkQXQtaW5kZXgnLFxuICAgICAgcGFydGl0aW9uS2V5OiB7XG4gICAgICAgIG5hbWU6ICdzdGF0dXMnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklOR1xuICAgICAgfSxcbiAgICAgIHNvcnRLZXk6IHtcbiAgICAgICAgbmFtZTogJ3VwZGF0ZWRBdCcsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HXG4gICAgICB9LFxuICAgICAgcHJvamVjdGlvblR5cGU6IGR5bmFtb2RiLlByb2plY3Rpb25UeXBlLkFMTCxcbiAgICB9KTtcblxuICAgIC8vID09PT09IFNFRUQgREFUQSBMQU1CREEgPT09PT1cbiAgICBcbiAgICAvLyBDcmVhdGUgTGFtYmRhIGZ1bmN0aW9uIHRvIHNlZWQgaW5pdGlhbCBwcm9tcHRzXG4gICAgY29uc3Qgc2VlZFJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1NlZWRSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgfSk7XG5cbiAgICBzZWVkUm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdsb2dzOkNyZWF0ZUxvZ0dyb3VwJyxcbiAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nU3RyZWFtJyxcbiAgICAgICAgJ2xvZ3M6UHV0TG9nRXZlbnRzJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpsb2dzOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpsb2ctZ3JvdXA6L2F3cy9sYW1iZGEvYXBwLW1vZGV4LXNlZWQtcHJvbXB0czoqYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIHRoaXMucHJvbXB0VGVtcGxhdGVzVGFibGUuZ3JhbnRXcml0ZURhdGEoc2VlZFJvbGUpO1xuXG4gICAgY29uc3Qgc2VlZEZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnU2VlZFByb21wdHNGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGFwcC1tb2RleC1zZWVkLXByb21wdHNgLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIyX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJ2xhbWJkYS9nbG9iYWwvc2VlZC1wcm9tcHRzJyksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBQUk9NUFRTX1RBQkxFOiB0aGlzLnByb21wdFRlbXBsYXRlc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcyg2MCksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICByb2xlOiBzZWVkUm9sZSxcbiAgICB9KTtcblxuICAgIC8vID09PT09IENVU1RPTSBSRVNPVVJDRSBUTyBSVU4gU0VFRCBGVU5DVElPTiA9PT09PVxuICAgIFxuICAgIGNvbnN0IHNlZWRQcm92aWRlciA9IG5ldyBjZGsuY3VzdG9tX3Jlc291cmNlcy5Qcm92aWRlcih0aGlzLCAnU2VlZFByb3ZpZGVyJywge1xuICAgICAgb25FdmVudEhhbmRsZXI6IHNlZWRGdW5jdGlvbixcbiAgICAgIGxvZ0dyb3VwOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnU2VlZFByb3ZpZGVyLUxvZ0dyb3VwJywge1xuICAgICAgICBsb2dHcm91cE5hbWU6ICcvYXdzL2xhbWJkYS9hcHAtbW9kZXgtc2VlZC1wcm9tcHRzJyxcbiAgICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IFJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIH0pLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DdXN0b21SZXNvdXJjZSh0aGlzLCAnU2VlZFByb21wdHNSZXNvdXJjZScsIHtcbiAgICAgIHNlcnZpY2VUb2tlbjogc2VlZFByb3ZpZGVyLnNlcnZpY2VUb2tlbixcbiAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgVGFibGVOYW1lOiB0aGlzLnByb21wdFRlbXBsYXRlc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyA9PT09PSBPVVRQVVRTID09PT09XG4gICAgXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb21wdFRlbXBsYXRlc1RhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnByb21wdFRlbXBsYXRlc1RhYmxlLnRhYmxlTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHJvbXB0IFRlbXBsYXRlcyBUYWJsZSBOYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1Qcm9tcHRUZW1wbGF0ZXNUYWJsZU5hbWVgLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Byb21wdFRlbXBsYXRlc1RhYmxlQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMucHJvbXB0VGVtcGxhdGVzVGFibGUudGFibGVBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1Byb21wdCBUZW1wbGF0ZXMgVGFibGUgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6IGAke3RoaXMuc3RhY2tOYW1lfS1Qcm9tcHRUZW1wbGF0ZXNUYWJsZUFybmAsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==