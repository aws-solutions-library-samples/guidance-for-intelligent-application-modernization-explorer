"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModExApiStack = void 0;
const cdk = require("aws-cdk-lib");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const lambda = require("aws-cdk-lib/aws-lambda");
const logs = require("aws-cdk-lib/aws-logs");
const iam = require("aws-cdk-lib/aws-iam");
const wafv2 = require("aws-cdk-lib/aws-wafv2");
const aws_cdk_lib_1 = require("aws-cdk-lib");
class AppModExApiStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { environment, userPool } = props;
        // ===== API GATEWAY =====
        // Create CloudWatch Logs role for API Gateway
        const apiGatewayLoggingRole = new iam.Role(this, 'ApiGatewayLoggingRole', {
            assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonAPIGatewayPushToCloudWatchLogs'),
            ],
            roleName: `app-modex-api-gateway-logging-role`,
        });
        // Set the account-level API Gateway logging role
        const cfnAccount = new apigateway.CfnAccount(this, 'ApiGatewayAccount', {
            cloudWatchRoleArn: apiGatewayLoggingRole.roleArn,
        });
        // Create CloudWatch Log Group for API Gateway access logs
        const apiAccessLogGroup = new logs.LogGroup(this, 'ApiAccessLogGroup', {
            logGroupName: `/aws/apigateway/app-modex-${environment}`,
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: environment === 'prod'
                ? cdk.RemovalPolicy.RETAIN
                : cdk.RemovalPolicy.DESTROY,
            encryptionKey: undefined,
        });
        // REST API with enhanced CORS configuration
        this.api = new apigateway.RestApi(this, 'AppModExApi', {
            restApiName: `app-modex-api`,
            description: 'App-ModEx API Gateway',
            deployOptions: {
                stageName: environment,
                loggingLevel: environment === 'prod'
                    ? apigateway.MethodLoggingLevel.ERROR
                    : apigateway.MethodLoggingLevel.INFO,
                dataTraceEnabled: environment !== 'prod',
                metricsEnabled: true,
                accessLogFormat: apigateway.AccessLogFormat.custom(JSON.stringify({
                    requestId: '$context.requestId',
                    ip: '$context.identity.sourceIp',
                    method: '$context.httpMethod',
                    path: '$context.path',
                    status: '$context.status',
                    responseLength: '$context.responseLength',
                })),
                accessLogDestination: new apigateway.LogGroupLogDestination(apiAccessLogGroup),
            },
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: [
                    'Content-Type',
                    'X-Amz-Date',
                    'Authorization',
                    'X-Api-Key',
                    'X-Amz-Security-Token',
                    'Access-Control-Allow-Origin',
                    'Access-Control-Allow-Headers',
                    'Access-Control-Allow-Methods',
                ],
                allowCredentials: true,
                maxAge: aws_cdk_lib_1.Duration.seconds(300),
            },
            binaryMediaTypes: ['multipart/form-data', 'application/octet-stream'],
        });
        // Configure Gateway Response for CORS errors
        new apigateway.CfnGatewayResponse(this, 'DefaultGatewayResponse4XX', {
            restApiId: this.api.restApiId,
            responseType: 'DEFAULT_4XX',
            responseParameters: {
                'gatewayresponse.header.Access-Control-Allow-Origin': "'*'",
                'gatewayresponse.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,x-project-id'",
                'gatewayresponse.header.Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'"
            }
        });
        new apigateway.CfnGatewayResponse(this, 'DefaultGatewayResponse5XX', {
            restApiId: this.api.restApiId,
            responseType: 'DEFAULT_5XX',
            responseParameters: {
                'gatewayresponse.header.Access-Control-Allow-Origin': "'*'",
                'gatewayresponse.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,x-project-id'",
                'gatewayresponse.header.Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,OPTIONS'"
            }
        });
        // Ensure the API Gateway account settings are configured before the API is created
        this.api.node.addDependency(cfnAccount);
        // ===== AWS WAF FOR API GATEWAY =====
        // Create WAF Web ACL for API Gateway (Regional scope)
        // WAFv2 for API Gateway only works in us-east-1
        if (this.region === 'us-east-1') {
            const apiWebAcl = new wafv2.CfnWebACL(this, 'ApiWebAcl', {
                name: `app-modex-api-waf-${environment}`,
                scope: 'REGIONAL',
                defaultAction: { allow: {} },
                visibilityConfig: {
                    cloudWatchMetricsEnabled: true,
                    metricName: `app-modex-api-waf-${environment}`,
                    sampledRequestsEnabled: true,
                },
                rules: [
                    {
                        name: 'AWSManagedRulesCommonRuleSet',
                        priority: 0,
                        overrideAction: { none: {} },
                        statement: {
                            managedRuleGroupStatement: {
                                vendorName: 'AWS',
                                name: 'AWSManagedRulesCommonRuleSet',
                            },
                        },
                        visibilityConfig: {
                            sampledRequestsEnabled: true,
                            cloudWatchMetricsEnabled: true,
                            metricName: 'CommonRuleSet',
                        },
                    },
                    {
                        name: 'AWSManagedRulesKnownBadInputsRuleSet',
                        priority: 1,
                        overrideAction: { none: {} },
                        statement: {
                            managedRuleGroupStatement: {
                                vendorName: 'AWS',
                                name: 'AWSManagedRulesKnownBadInputsRuleSet',
                            },
                        },
                        visibilityConfig: {
                            sampledRequestsEnabled: true,
                            cloudWatchMetricsEnabled: true,
                            metricName: 'KnownBadInputs',
                        },
                    },
                    {
                        name: 'RateLimitRule',
                        priority: 2,
                        action: { block: {} },
                        statement: {
                            rateBasedStatement: {
                                limit: 2000,
                                aggregateKeyType: 'IP',
                            },
                        },
                        visibilityConfig: {
                            sampledRequestsEnabled: true,
                            cloudWatchMetricsEnabled: true,
                            metricName: 'RateLimit',
                        },
                    },
                ],
            });
            // Associate WAF with API Gateway stage
            new wafv2.CfnWebACLAssociation(this, 'ApiWafAssociation', {
                resourceArn: `arn:aws:apigateway:${this.region}::/restapis/${this.api.restApiId}/stages/${environment}`,
                webAclArn: apiWebAcl.attrArn,
            });
            new cdk.CfnOutput(this, 'WafStatus', {
                value: 'WAF protection enabled',
                description: 'API Gateway WAF Status',
            });
            new cdk.CfnOutput(this, 'ApiWafArn', {
                value: apiWebAcl.attrArn,
                description: 'API Gateway WAF Web ACL ARN',
                exportName: 'AppModEx-ApiWafArn',
            });
        }
        else {
            new cdk.CfnOutput(this, 'WafStatus', {
                value: `WAF protection not available in ${this.region}. Deploy to us-east-1 for WAF protection.`,
                description: 'API Gateway WAF Status',
            });
        }
        // ===== COGNITO AUTHORIZER =====
        // Create Cognito authorizer for API Gateway
        this.authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
            cognitoUserPools: [userPool],
            identitySource: 'method.request.header.Authorization',
        });
        // ===== IMPORT LAMBDA FUNCTIONS FROM BACKEND STACK =====
        // Import all Lambda functions using their exported ARNs from Backend stack
        const projectsFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedProjectsFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-ProjectsFunctionArn'),
            sameEnvironment: true
        });
        const projectDataFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedProjectDataFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-ProjectDataFunctionArn'),
            sameEnvironment: true
        });
        const sharingFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedSharingFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-SharingFunctionArn'),
            sameEnvironment: true
        });
        const processTrackingFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedProcessTrackingFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-ProcessTrackingFunctionArn'),
            sameEnvironment: true
        });
        const userSearchFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedUserSearchFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-UserSearchFunctionArn'),
            sameEnvironment: true
        });
        const pilotInitiateFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedPilotInitiateFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-PilotInitiateFunctionArn'),
            sameEnvironment: true
        });
        const pilotStatusFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedPilotStatusFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-PilotStatusFunctionArn'),
            sameEnvironment: true
        });
        const pilotResultsFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedPilotResultsFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-PilotResultsFunctionArn'),
            sameEnvironment: true
        });
        const pilotDeleteFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedPilotDeleteFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-PilotDeleteFunctionArn'),
            sameEnvironment: true
        });
        const applicationBucketsFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedApplicationBucketsFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-ApplicationBucketsFunctionArn'),
            sameEnvironment: true
        });
        const tcoFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedTCOFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-TCOFunctionArn'),
            sameEnvironment: true
        });
        const teamEstimatesFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedTeamEstimatesFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-TeamEstimatesFunctionArn'),
            sameEnvironment: true
        });
        const athenaQueryFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedAthenaQueryFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-AthenaQueryFunctionArn'),
            sameEnvironment: true
        });
        const teamWeightsFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedTeamWeightsFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-TeamWeightsFunctionArn'),
            sameEnvironment: true
        });
        const stepFunctionApiFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedStepFunctionApiFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-StepFunctionApiFunctionArn'),
            sameEnvironment: true
        });
        const exportInitiatorFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedExportInitiatorFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-ExportInitiatorFunctionArn'),
            sameEnvironment: true
        });
        const exportReaderFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedExportReaderFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-ExportReaderFunctionArn'),
            sameEnvironment: true
        });
        const automationStatusFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedAutomationStatusFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-AutomationStatusFunctionArn'),
            sameEnvironment: true
        });
        const provisioningFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedProvisioningFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-ProvisioningFunctionArn'),
            sameEnvironment: true
        });
        const buildMonitorFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedBuildMonitorFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-BuildMonitorFunctionArn'),
            sameEnvironment: true
        });
        const fileOperationsFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedFileOperationsFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-FileOperationsFunctionArn'),
            sameEnvironment: true
        });
        const dataSourcesFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedDataSourcesFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-DataSourcesFunctionArn'),
            sameEnvironment: true
        });
        const fileUploadFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedFileUploadFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-FileUploadFunctionArn'),
            sameEnvironment: true
        });
        const compareWithAthenaFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedCompareWithAthenaFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-CompareWithAthenaFunctionArn'),
            sameEnvironment: true
        });
        const roleMapperFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedRoleMapperFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-RoleMapperFunctionArn'),
            sameEnvironment: true
        });
        const stepFunctionTriggerFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedStepFunctionTriggerFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-StepFunctionTriggerFunctionArn'),
            sameEnvironment: true
        });
        const pilotIdentificationAsyncFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedPilotIdentificationAsyncFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-PilotIdentificationAsyncFunctionArn'),
            sameEnvironment: true
        });
        const applicationSimilaritiesFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedApplicationSimilaritiesFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-ApplicationSimilaritiesFunctionArn'),
            sameEnvironment: true
        });
        const componentSimilaritiesFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedComponentSimilaritiesFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-ComponentSimilaritiesFunctionArn'),
            sameEnvironment: true
        });
        const pilotIdentificationFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedPilotIdentificationFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-PilotIdentificationFunctionArn'),
            sameEnvironment: true
        });
        const pilotGatherContextFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedPilotGatherContextFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-PilotGatherContextFunctionArn'),
            sameEnvironment: true
        });
        const pilotAIEnhanceFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedPilotAIEnhanceFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-PilotAIEnhanceFunctionArn'),
            sameEnvironment: true
        });
        const pilotCombineScoresFunction = lambda.Function.fromFunctionAttributes(this, 'ImportedPilotCombineScoresFunction', {
            functionArn: cdk.Fn.importValue('AppModEx-Backend-PilotCombineScoresFunctionArn'),
            sameEnvironment: true
        });
        // ===== CREATE LAMBDA INTEGRATIONS =====
        const projectsIntegration = new apigateway.LambdaIntegration(projectsFunction);
        const projectDataIntegration = new apigateway.LambdaIntegration(projectDataFunction);
        const sharingIntegration = new apigateway.LambdaIntegration(sharingFunction);
        const processTrackingIntegration = new apigateway.LambdaIntegration(processTrackingFunction);
        const userSearchIntegration = new apigateway.LambdaIntegration(userSearchFunction);
        const pilotInitiateIntegration = new apigateway.LambdaIntegration(pilotInitiateFunction);
        const pilotStatusIntegration = new apigateway.LambdaIntegration(pilotStatusFunction);
        const pilotResultsIntegration = new apigateway.LambdaIntegration(pilotResultsFunction);
        const pilotDeleteIntegration = new apigateway.LambdaIntegration(pilotDeleteFunction);
        const applicationBucketsIntegration = new apigateway.LambdaIntegration(applicationBucketsFunction);
        const tcoIntegration = new apigateway.LambdaIntegration(tcoFunction);
        const teamEstimatesIntegration = new apigateway.LambdaIntegration(teamEstimatesFunction);
        const athenaQueryIntegration = new apigateway.LambdaIntegration(athenaQueryFunction);
        const teamWeightsIntegration = new apigateway.LambdaIntegration(teamWeightsFunction);
        const stepFunctionApiIntegration = new apigateway.LambdaIntegration(stepFunctionApiFunction);
        const exportInitiatorIntegration = new apigateway.LambdaIntegration(exportInitiatorFunction);
        const exportReaderIntegration = new apigateway.LambdaIntegration(exportReaderFunction);
        const automationStatusIntegration = new apigateway.LambdaIntegration(automationStatusFunction);
        const provisioningIntegration = new apigateway.LambdaIntegration(provisioningFunction);
        const buildMonitorIntegration = new apigateway.LambdaIntegration(buildMonitorFunction);
        const fileOperationsIntegration = new apigateway.LambdaIntegration(fileOperationsFunction);
        const dataSourcesIntegration = new apigateway.LambdaIntegration(dataSourcesFunction);
        const fileUploadIntegration = new apigateway.LambdaIntegration(fileUploadFunction);
        const compareWithAthenaIntegration = new apigateway.LambdaIntegration(compareWithAthenaFunction);
        const roleMapperIntegration = new apigateway.LambdaIntegration(roleMapperFunction);
        const stepFunctionTriggerIntegration = new apigateway.LambdaIntegration(stepFunctionTriggerFunction);
        const pilotIdentificationAsyncIntegration = new apigateway.LambdaIntegration(pilotIdentificationAsyncFunction);
        const applicationSimilaritiesIntegration = new apigateway.LambdaIntegration(applicationSimilaritiesFunction);
        const componentSimilaritiesIntegration = new apigateway.LambdaIntegration(componentSimilaritiesFunction);
        const pilotIdentificationIntegration = new apigateway.LambdaIntegration(pilotIdentificationFunction);
        // ===== API GATEWAY ROUTES =====
        // Add API Gateway resources and methods
        const projectsResource = this.api.root.addResource('projects');
        projectsResource.addMethod('GET', projectsIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        projectsResource.addMethod('POST', projectsIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const projectResource = projectsResource.addResource('{projectId}');
        projectResource.addMethod('GET', projectsIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        projectResource.addMethod('PUT', projectsIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        projectResource.addMethod('DELETE', projectsIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const projectDataResource = projectResource.addResource('data');
        projectDataResource.addMethod('GET', projectDataIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        projectDataResource.addMethod('POST', projectDataIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const projectDataTypeResource = projectDataResource.addResource('{dataType}');
        projectDataTypeResource.addMethod('GET', projectDataIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        projectDataTypeResource.addMethod('PUT', projectDataIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        projectDataTypeResource.addMethod('DELETE', projectDataIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const sharingResource = projectResource.addResource('sharing');
        sharingResource.addMethod('GET', sharingIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        sharingResource.addMethod('POST', sharingIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const shareResource = sharingResource.addResource('{shareId}');
        shareResource.addMethod('PUT', sharingIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        shareResource.addMethod('DELETE', sharingIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // Add user search under sharing resource
        const sharingUsersResource = sharingResource.addResource('users');
        const sharingUserSearchResource = sharingUsersResource.addResource('search');
        sharingUserSearchResource.addMethod('GET', userSearchIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const processTrackingResource = projectResource.addResource('process-tracking');
        processTrackingResource.addMethod('GET', processTrackingIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        processTrackingResource.addMethod('POST', processTrackingIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const userSearchResource = this.api.root.addResource('users');
        userSearchResource.addMethod('GET', userSearchIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const pilotResource = projectResource.addResource('pilot');
        pilotResource.addMethod('POST', pilotInitiateIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const pilotStatusResource = pilotResource.addResource('status');
        pilotStatusResource.addMethod('GET', pilotStatusIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const pilotResultsResource = pilotResource.addResource('results');
        pilotResultsResource.addMethod('GET', pilotResultsIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const pilotDeleteResource = pilotResource.addResource('delete');
        pilotDeleteResource.addMethod('POST', pilotDeleteIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // Application Buckets endpoints: /projects/{projectId}/application-buckets
        const applicationBucketsResource = projectResource.addResource('application-buckets');
        // Base resource methods: list all buckets, create bucket
        applicationBucketsResource.addMethod('GET', applicationBucketsIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        applicationBucketsResource.addMethod('POST', applicationBucketsIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // Sub-resource for specific bucket: /projects/{projectId}/application-buckets/{bucketId}
        const applicationBucketResource = applicationBucketsResource.addResource('{bucketId}');
        applicationBucketResource.addMethod('GET', applicationBucketsIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        applicationBucketResource.addMethod('PUT', applicationBucketsIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        applicationBucketResource.addMethod('DELETE', applicationBucketsIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const tcoResource = projectResource.addResource('tco');
        tcoResource.addMethod('GET', tcoIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        tcoResource.addMethod('POST', tcoIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // TCO item resource for specific TCO operations (PUT, DELETE)
        const tcoItemResource = tcoResource.addResource('{tcoId}');
        tcoItemResource.addMethod('GET', tcoIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        tcoItemResource.addMethod('PUT', tcoIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        tcoItemResource.addMethod('DELETE', tcoIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const teamEstimatesResource = projectResource.addResource('team-estimates');
        teamEstimatesResource.addMethod('GET', teamEstimatesIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        teamEstimatesResource.addMethod('POST', teamEstimatesIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // Add sub-resource for specific team estimate operations
        const teamEstimateItemResource = teamEstimatesResource.addResource('{teamEstimateId}');
        teamEstimateItemResource.addMethod('GET', teamEstimatesIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        teamEstimateItemResource.addMethod('PUT', teamEstimatesIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        teamEstimateItemResource.addMethod('DELETE', teamEstimatesIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const athenaQueryResource = projectResource.addResource('athena-query');
        athenaQueryResource.addMethod('POST', athenaQueryIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const teamWeightsResource = projectResource.addResource('team-weights');
        teamWeightsResource.addMethod('GET', teamWeightsIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        teamWeightsResource.addMethod('POST', teamWeightsIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const stepFunctionApiResource = projectResource.addResource('step-function');
        stepFunctionApiResource.addMethod('POST', stepFunctionApiIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        stepFunctionApiResource.addMethod('GET', stepFunctionApiIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const applicationSimilaritiesResource = projectResource.addResource('application-similarities');
        applicationSimilaritiesResource.addMethod('GET', applicationSimilaritiesIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        applicationSimilaritiesResource.addMethod('POST', applicationSimilaritiesIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        applicationSimilaritiesResource.addMethod('DELETE', applicationSimilaritiesIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const componentSimilaritiesResource = projectResource.addResource('component-similarities');
        componentSimilaritiesResource.addMethod('GET', componentSimilaritiesIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        componentSimilaritiesResource.addMethod('POST', componentSimilaritiesIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        componentSimilaritiesResource.addMethod('DELETE', componentSimilaritiesIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const pilotIdentificationResource = projectResource.addResource('pilot-identification');
        pilotIdentificationResource.addMethod('GET', pilotIdentificationIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        pilotIdentificationResource.addMethod('POST', pilotIdentificationIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        pilotIdentificationResource.addMethod('DELETE', pilotIdentificationIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const exportTriggerResource = projectResource.addResource('export');
        exportTriggerResource.addMethod('POST', exportInitiatorIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const exportHistoryResource = exportTriggerResource.addResource('history');
        exportHistoryResource.addMethod('GET', exportReaderIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const exportIdResource = exportTriggerResource.addResource('{exportId}');
        exportIdResource.addMethod('GET', exportReaderIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        exportIdResource.addMethod('PUT', exportReaderIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const exportDownloadResource = exportIdResource.addResource('download');
        exportDownloadResource.addMethod('GET', exportReaderIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const automationStatusResource = projectResource.addResource('automation-status');
        automationStatusResource.addMethod('GET', automationStatusIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const provisioningResource = projectResource.addResource('provisioning');
        provisioningResource.addMethod('POST', provisioningIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const buildMonitorResource = projectResource.addResource('build-monitor');
        buildMonitorResource.addMethod('GET', buildMonitorIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const fileOperationsResource = projectResource.addResource('file-operations');
        fileOperationsResource.addMethod('GET', fileOperationsIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        fileOperationsResource.addMethod('POST', fileOperationsIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // Files endpoint for download and delete operations
        const filesResource = projectResource.addResource('files');
        const fileIdResource = filesResource.addResource('{id}');
        fileIdResource.addMethod('GET', fileOperationsIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        fileIdResource.addMethod('DELETE', fileOperationsIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const dataSourcesResource = projectResource.addResource('data-sources');
        dataSourcesResource.addMethod('GET', dataSourcesIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        dataSourcesResource.addMethod('POST', dataSourcesIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const fileUploadResource = projectResource.addResource('file-upload');
        fileUploadResource.addMethod('POST', fileUploadIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const compareWithAthenaResource = projectResource.addResource('compare-with-athena');
        compareWithAthenaResource.addMethod('POST', compareWithAthenaIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const roleMapperResource = projectResource.addResource('role-mapper');
        roleMapperResource.addMethod('GET', roleMapperIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        roleMapperResource.addMethod('POST', roleMapperIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const stepFunctionTriggerResource = projectResource.addResource('step-function-trigger');
        stepFunctionTriggerResource.addMethod('POST', stepFunctionTriggerIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        const pilotIdentificationAsyncResource = projectResource.addResource('pilot-identification-async');
        pilotIdentificationAsyncResource.addMethod('POST', pilotIdentificationAsyncIntegration, {
            authorizer: this.authorizer,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // Export outputs
        new cdk.CfnOutput(this, 'ApiUrl', {
            value: this.api.url,
            description: 'API Gateway URL',
            exportName: 'AppModEx-ApiUrl',
        });
        new cdk.CfnOutput(this, 'ApiId', {
            value: this.api.restApiId,
            description: 'API Gateway ID',
            exportName: 'AppModEx-ApiId',
        });
    }
}
exports.AppModExApiStack = AppModExApiStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLW1vZGV4LWFwaS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFwcC1tb2RleC1hcGktc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBRW5DLHlEQUF5RDtBQUN6RCxpREFBaUQ7QUFFakQsNkNBQTZDO0FBQzdDLDJDQUEyQztBQUMzQywrQ0FBK0M7QUFDL0MsNkNBQXVDO0FBT3ZDLE1BQWEsZ0JBQWlCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFJN0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE0QjtRQUNwRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUV4QywwQkFBMEI7UUFFMUIsOENBQThDO1FBQzlDLE1BQU0scUJBQXFCLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUN4RSxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsMEJBQTBCLENBQUM7WUFDL0QsZUFBZSxFQUFFO2dCQUNmLEdBQUcsQ0FBQyxhQUFhLENBQUMsd0JBQXdCLENBQUMsbURBQW1ELENBQUM7YUFDaEc7WUFDRCxRQUFRLEVBQUUsb0NBQW9DO1NBQy9DLENBQUMsQ0FBQztRQUVILGlEQUFpRDtRQUNqRCxNQUFNLFVBQVUsR0FBRyxJQUFJLFVBQVUsQ0FBQyxVQUFVLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQ3RFLGlCQUFpQixFQUFFLHFCQUFxQixDQUFDLE9BQU87U0FDakQsQ0FBQyxDQUFDO1FBRUgsMERBQTBEO1FBQzFELE1BQU0saUJBQWlCLEdBQUcsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUNyRSxZQUFZLEVBQUUsNkJBQTZCLFdBQVcsRUFBRTtZ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QUksQ0FBQyxHQUFHLENBQUMsU0FBUztZQUN6QixXQUFXLEVBQUUsZ0JBQWdCO1lBQzdCLFVBQVUsRUFBRSxnQkFBZ0I7U0FDN0IsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBeDNCRCw0Q0F3M0JDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2duaXRvJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgd2FmdjIgZnJvbSAnYXdzLWNkay1saWIvYXdzLXdhZnYyJztcbmltcG9ydCB7IER1cmF0aW9uIH0gZnJvbSAnYXdzLWNkay1saWInO1xuXG5leHBvcnQgaW50ZXJmYWNlIEFwcE1vZEV4QXBpU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcbiAgdXNlclBvb2w6IGNvZ25pdG8uVXNlclBvb2w7XG59XG5cbmV4cG9ydCBjbGFzcyBBcHBNb2RFeEFwaVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IGFwaTogYXBpZ2F0ZXdheS5SZXN0QXBpO1xuICBwdWJsaWMgcmVhZG9ubHkgYXV0aG9yaXplcjogYXBpZ2F0ZXdheS5Db2duaXRvVXNlclBvb2xzQXV0aG9yaXplcjtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXBwTW9kRXhBcGlTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB7IGVudmlyb25tZW50LCB1c2VyUG9vbCB9ID0gcHJvcHM7XG5cbiAgICAvLyA9PT09PSBBUEkgR0FURVdBWSA9PT09PVxuICAgIFxuICAgIC8vIENyZWF0ZSBDbG91ZFdhdGNoIExvZ3Mgcm9sZSBmb3IgQVBJIEdhdGV3YXlcbiAgICBjb25zdCBhcGlHYXRld2F5TG9nZ2luZ1JvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0FwaUdhdGV3YXlMb2dnaW5nUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdhcGlnYXRld2F5LmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BbWF6b25BUElHYXRld2F5UHVzaFRvQ2xvdWRXYXRjaExvZ3MnKSxcbiAgICAgIF0sXG4gICAgICByb2xlTmFtZTogYGFwcC1tb2RleC1hcGktZ2F0ZXdheS1sb2dnaW5nLXJvbGVgLFxuICAgIH0pO1xuXG4gICAgLy8gU2V0IHRoZSBhY2NvdW50LWxldmVsIEFQSSBHYXRld2F5IGxvZ2dpbmcgcm9sZVxuICAgIGNvbnN0IGNmbkFjY291bnQgPSBuZXcgYXBpZ2F0ZXdheS5DZm5BY2NvdW50KHRoaXMsICdBcGlHYXRld2F5QWNjb3VudCcsIHtcbiAgICAgIGNsb3VkV2F0Y2hSb2xlQXJuOiBhcGlHYXRld2F5TG9nZ2luZ1JvbGUucm9sZUFybixcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBDbG91ZFdhdGNoIExvZyBHcm91cCBmb3IgQVBJIEdhdGV3YXkgYWNjZXNzIGxvZ3NcbiAgICBjb25zdCBhcGlBY2Nlc3NMb2dHcm91cCA9IG5ldyBsb2dzLkxvZ0dyb3VwKHRoaXMsICdBcGlBY2Nlc3NMb2dHcm91cCcsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvYXBpZ2F0ZXdheS9hcHAtbW9kZXgtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgICByZW1vdmFsUG9saWN5OiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnIFxuICAgICAgICA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiBcbiAgICAgICAgOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgZW5jcnlwdGlvbktleTogdW5kZWZpbmVkLFxuICAgIH0pO1xuXG4gICAgLy8gUkVTVCBBUEkgd2l0aCBlbmhhbmNlZCBDT1JTIGNvbmZpZ3VyYXRpb25cbiAgICB0aGlzLmFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgJ0FwcE1vZEV4QXBpJywge1xuICAgICAgcmVzdEFwaU5hbWU6IGBhcHAtbW9kZXgtYXBpYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQXBwLU1vZEV4IEFQSSBHYXRld2F5JyxcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgc3RhZ2VOYW1lOiBlbnZpcm9ubWVudCxcbiAgICAgICAgbG9nZ2luZ0xldmVsOiBlbnZpcm9ubWVudCA9PT0gJ3Byb2QnIFxuICAgICAgICAgID8gYXBpZ2F0ZXdheS5NZXRob2RMb2dnaW5nTGV2ZWwuRVJST1IgXG4gICAgICAgICAgOiBhcGlnYXRld2F5Lk1ldGhvZExvZ2dpbmdMZXZlbC5JTkZPLFxuICAgICAgICBkYXRhVHJhY2VFbmFibGVkOiBlbnZpcm9ubWVudCAhPT0gJ3Byb2QnLFxuICAgICAgICBtZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgYWNjZXNzTG9nRm9ybWF0OiBhcGlnYXRld2F5LkFjY2Vzc0xvZ0Zvcm1hdC5jdXN0b20oXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgcmVxdWVzdElkOiAnJGNvbnRleHQucmVxdWVzdElkJyxcbiAgICAgICAgICAgIGlwOiAnJGNvbnRleHQuaWRlbnRpdHkuc291cmNlSXAnLFxuICAgICAgICAgICAgbWV0aG9kOiAnJGNvbnRleHQuaHR0cE1ldGhvZCcsXG4gICAgICAgICAgICBwYXRoOiAnJGNvbnRleHQucGF0aCcsXG4gICAgICAgICAgICBzdGF0dXM6ICckY29udGV4dC5zdGF0dXMnLFxuICAgICAgICAgICAgcmVzcG9uc2VMZW5ndGg6ICckY29udGV4dC5yZXNwb25zZUxlbmd0aCcsXG4gICAgICAgICAgfSlcbiAgICAgICAgKSxcbiAgICAgICAgYWNjZXNzTG9nRGVzdGluYXRpb246IG5ldyBhcGlnYXRld2F5LkxvZ0dyb3VwTG9nRGVzdGluYXRpb24oYXBpQWNjZXNzTG9nR3JvdXApLFxuICAgICAgfSxcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IGFwaWdhdGV3YXkuQ29ycy5BTExfT1JJR0lOUyxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBhcGlnYXRld2F5LkNvcnMuQUxMX01FVEhPRFMsXG4gICAgICAgIGFsbG93SGVhZGVyczogW1xuICAgICAgICAgICdDb250ZW50LVR5cGUnLFxuICAgICAgICAgICdYLUFtei1EYXRlJyxcbiAgICAgICAgICAnQXV0aG9yaXphdGlvbicsXG4gICAgICAgICAgJ1gtQXBpLUtleScsXG4gICAgICAgICAgJ1gtQW16LVNlY3VyaXR5LVRva2VuJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycycsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnLFxuICAgICAgICBdLFxuICAgICAgICBhbGxvd0NyZWRlbnRpYWxzOiB0cnVlLFxuICAgICAgICBtYXhBZ2U6IER1cmF0aW9uLnNlY29uZHMoMzAwKSxcbiAgICAgIH0sXG4gICAgICBiaW5hcnlNZWRpYVR5cGVzOiBbJ211bHRpcGFydC9mb3JtLWRhdGEnLCAnYXBwbGljYXRpb24vb2N0ZXQtc3RyZWFtJ10sXG4gICAgfSk7XG4gICAgXG4gICAgLy8gQ29uZmlndXJlIEdhdGV3YXkgUmVzcG9uc2UgZm9yIENPUlMgZXJyb3JzXG4gICAgbmV3IGFwaWdhdGV3YXkuQ2ZuR2F0ZXdheVJlc3BvbnNlKHRoaXMsICdEZWZhdWx0R2F0ZXdheVJlc3BvbnNlNFhYJywge1xuICAgICAgcmVzdEFwaUlkOiB0aGlzLmFwaS5yZXN0QXBpSWQsXG4gICAgICByZXNwb25zZVR5cGU6ICdERUZBVUxUXzRYWCcsXG4gICAgICByZXNwb25zZVBhcmFtZXRlcnM6IHtcbiAgICAgICAgJ2dhdGV3YXlyZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogXCInKidcIixcbiAgICAgICAgJ2dhdGV3YXlyZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6IFwiJ0NvbnRlbnQtVHlwZSxYLUFtei1EYXRlLEF1dGhvcml6YXRpb24sWC1BcGktS2V5LFgtQW16LVNlY3VyaXR5LVRva2VuLHgtcHJvamVjdC1pZCdcIixcbiAgICAgICAgJ2dhdGV3YXlyZXNwb25zZS5oZWFkZXIuQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6IFwiJ0dFVCxQT1NULFBVVCxERUxFVEUsT1BUSU9OUydcIlxuICAgICAgfVxuICAgIH0pO1xuICAgIFxuICAgIG5ldyBhcGlnYXRld2F5LkNmbkdhdGV3YXlSZXNwb25zZSh0aGlzLCAnRGVmYXVsdEdhdGV3YXlSZXNwb25zZTVYWCcsIHtcbiAgICAgIHJlc3RBcGlJZDogdGhpcy5hcGkucmVzdEFwaUlkLFxuICAgICAgcmVzcG9uc2VUeXBlOiAnREVGQVVMVF81WFgnLFxuICAgICAgcmVzcG9uc2VQYXJhbWV0ZXJzOiB7XG4gICAgICAgICdnYXRld2F5cmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6IFwiJyonXCIsXG4gICAgICAgICdnYXRld2F5cmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiBcIidDb250ZW50LVR5cGUsWC1BbXotRGF0ZSxBdXRob3JpemF0aW9uLFgtQXBpLUtleSxYLUFtei1TZWN1cml0eS1Ub2tlbix4LXByb2plY3QtaWQnXCIsXG4gICAgICAgICdnYXRld2F5cmVzcG9uc2UuaGVhZGVyLkFjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiBcIidHRVQsUE9TVCxQVVQsREVMRVRFLE9QVElPTlMnXCJcbiAgICAgIH1cbiAgICB9KTtcbiAgICBcbiAgICAvLyBFbnN1cmUgdGhlIEFQSSBHYXRld2F5IGFjY291bnQgc2V0dGluZ3MgYXJlIGNvbmZpZ3VyZWQgYmVmb3JlIHRoZSBBUEkgaXMgY3JlYXRlZFxuICAgIHRoaXMuYXBpLm5vZGUuYWRkRGVwZW5kZW5jeShjZm5BY2NvdW50KTtcblxuICAgIC8vID09PT09IEFXUyBXQUYgRk9SIEFQSSBHQVRFV0FZID09PT09XG4gICAgXG4gICAgLy8gQ3JlYXRlIFdBRiBXZWIgQUNMIGZvciBBUEkgR2F0ZXdheSAoUmVnaW9uYWwgc2NvcGUpXG4gICAgLy8gV0FGdjIgZm9yIEFQSSBHYXRld2F5IG9ubHkgd29ya3MgaW4gdXMtZWFzdC0xXG4gICAgaWYgKHRoaXMucmVnaW9uID09PSAndXMtZWFzdC0xJykge1xuICAgICAgY29uc3QgYXBpV2ViQWNsID0gbmV3IHdhZnYyLkNmbldlYkFDTCh0aGlzLCAnQXBpV2ViQWNsJywge1xuICAgICAgICBuYW1lOiBgYXBwLW1vZGV4LWFwaS13YWYtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICBzY29wZTogJ1JFR0lPTkFMJyxcbiAgICAgICAgZGVmYXVsdEFjdGlvbjogeyBhbGxvdzoge30gfSxcbiAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBtZXRyaWNOYW1lOiBgYXBwLW1vZGV4LWFwaS13YWYtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHJ1bGVzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgbmFtZTogJ0FXU01hbmFnZWRSdWxlc0NvbW1vblJ1bGVTZXQnLFxuICAgICAgICAgICAgcHJpb3JpdHk6IDAsXG4gICAgICAgICAgICBvdmVycmlkZUFjdGlvbjogeyBub25lOiB7fSB9LFxuICAgICAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgIG1hbmFnZWRSdWxlR3JvdXBTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgICB2ZW5kb3JOYW1lOiAnQVdTJyxcbiAgICAgICAgICAgICAgICBuYW1lOiAnQVdTTWFuYWdlZFJ1bGVzQ29tbW9uUnVsZVNldCcsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICAgIG1ldHJpY05hbWU6ICdDb21tb25SdWxlU2V0JyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBuYW1lOiAnQVdTTWFuYWdlZFJ1bGVzS25vd25CYWRJbnB1dHNSdWxlU2V0JyxcbiAgICAgICAgICAgIHByaW9yaXR5OiAxLFxuICAgICAgICAgICAgb3ZlcnJpZGVBY3Rpb246IHsgbm9uZToge30gfSxcbiAgICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgICBtYW5hZ2VkUnVsZUdyb3VwU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgdmVuZG9yTmFtZTogJ0FXUycsXG4gICAgICAgICAgICAgICAgbmFtZTogJ0FXU01hbmFnZWRSdWxlc0tub3duQmFkSW5wdXRzUnVsZVNldCcsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICAgIG1ldHJpY05hbWU6ICdLbm93bkJhZElucHV0cycsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgbmFtZTogJ1JhdGVMaW1pdFJ1bGUnLFxuICAgICAgICAgICAgcHJpb3JpdHk6IDIsXG4gICAgICAgICAgICBhY3Rpb246IHsgYmxvY2s6IHt9IH0sXG4gICAgICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgcmF0ZUJhc2VkU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgbGltaXQ6IDIwMDAsXG4gICAgICAgICAgICAgICAgYWdncmVnYXRlS2V5VHlwZTogJ0lQJyxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgICAgbWV0cmljTmFtZTogJ1JhdGVMaW1pdCcsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9KTtcblxuICAgICAgLy8gQXNzb2NpYXRlIFdBRiB3aXRoIEFQSSBHYXRld2F5IHN0YWdlXG4gICAgICBuZXcgd2FmdjIuQ2ZuV2ViQUNMQXNzb2NpYXRpb24odGhpcywgJ0FwaVdhZkFzc29jaWF0aW9uJywge1xuICAgICAgICByZXNvdXJjZUFybjogYGFybjphd3M6YXBpZ2F0ZXdheToke3RoaXMucmVnaW9ufTo6L3Jlc3RhcGlzLyR7dGhpcy5hcGkucmVzdEFwaUlkfS9zdGFnZXMvJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICB3ZWJBY2xBcm46IGFwaVdlYkFjbC5hdHRyQXJuLFxuICAgICAgfSk7XG4gICAgICBcbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXYWZTdGF0dXMnLCB7XG4gICAgICAgIHZhbHVlOiAnV0FGIHByb3RlY3Rpb24gZW5hYmxlZCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgV0FGIFN0YXR1cycsXG4gICAgICB9KTtcbiAgICAgIFxuICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaVdhZkFybicsIHtcbiAgICAgICAgdmFsdWU6IGFwaVdlYkFjbC5hdHRyQXJuLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IFdBRiBXZWIgQUNMIEFSTicsXG4gICAgICAgIGV4cG9ydE5hbWU6ICdBcHBNb2RFeC1BcGlXYWZBcm4nLFxuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXYWZTdGF0dXMnLCB7XG4gICAgICAgIHZhbHVlOiBgV0FGIHByb3RlY3Rpb24gbm90IGF2YWlsYWJsZSBpbiAke3RoaXMucmVnaW9ufS4gRGVwbG95IHRvIHVzLWVhc3QtMSBmb3IgV0FGIHByb3RlY3Rpb24uYCxcbiAgICAgICAgZGVzY3JpcHRpb246ICdBUEkgR2F0ZXdheSBXQUYgU3RhdHVzJyxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vID09PT09IENPR05JVE8gQVVUSE9SSVpFUiA9PT09PVxuICAgIFxuICAgIC8vIENyZWF0ZSBDb2duaXRvIGF1dGhvcml6ZXIgZm9yIEFQSSBHYXRld2F5XG4gICAgdGhpcy5hdXRob3JpemVyID0gbmV3IGFwaWdhdGV3YXkuQ29nbml0b1VzZXJQb29sc0F1dGhvcml6ZXIodGhpcywgJ0NvZ25pdG9BdXRob3JpemVyJywge1xuICAgICAgY29nbml0b1VzZXJQb29sczogW3VzZXJQb29sXSxcbiAgICAgIGlkZW50aXR5U291cmNlOiAnbWV0aG9kLnJlcXVlc3QuaGVhZGVyLkF1dGhvcml6YXRpb24nLFxuICAgIH0pO1xuXG4gICAgLy8gPT09PT0gSU1QT1JUIExBTUJEQSBGVU5DVElPTlMgRlJPTSBCQUNLRU5EIFNUQUNLID09PT09XG4gICAgXG4gICAgLy8gSW1wb3J0IGFsbCBMYW1iZGEgZnVuY3Rpb25zIHVzaW5nIHRoZWlyIGV4cG9ydGVkIEFSTnMgZnJvbSBCYWNrZW5kIHN0YWNrXG4gICAgY29uc3QgcHJvamVjdHNGdW5jdGlvbiA9IGxhbWJkYS5GdW5jdGlvbi5mcm9tRnVuY3Rpb25BdHRyaWJ1dGVzKFxuICAgICAgdGhpcywgJ0ltcG9ydGVkUHJvamVjdHNGdW5jdGlvbicsXG4gICAgICB7IFxuICAgICAgICBmdW5jdGlvbkFybjogY2RrLkZuLmltcG9ydFZhbHVlKCdBcHBNb2RFeC1CYWNrZW5kLVByb2plY3RzRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgcHJvamVjdERhdGFGdW5jdGlvbiA9IGxhbWJkYS5GdW5jdGlvbi5mcm9tRnVuY3Rpb25BdHRyaWJ1dGVzKFxuICAgICAgdGhpcywgJ0ltcG9ydGVkUHJvamVjdERhdGFGdW5jdGlvbicsXG4gICAgICB7IFxuICAgICAgICBmdW5jdGlvbkFybjogY2RrLkZuLmltcG9ydFZhbHVlKCdBcHBNb2RFeC1CYWNrZW5kLVByb2plY3REYXRhRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3Qgc2hhcmluZ0Z1bmN0aW9uID0gbGFtYmRhLkZ1bmN0aW9uLmZyb21GdW5jdGlvbkF0dHJpYnV0ZXMoXG4gICAgICB0aGlzLCAnSW1wb3J0ZWRTaGFyaW5nRnVuY3Rpb24nLFxuICAgICAgeyBcbiAgICAgICAgZnVuY3Rpb25Bcm46IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQXBwTW9kRXgtQmFja2VuZC1TaGFyaW5nRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgcHJvY2Vzc1RyYWNraW5nRnVuY3Rpb24gPSBsYW1iZGEuRnVuY3Rpb24uZnJvbUZ1bmN0aW9uQXR0cmlidXRlcyhcbiAgICAgIHRoaXMsICdJbXBvcnRlZFByb2Nlc3NUcmFja2luZ0Z1bmN0aW9uJyxcbiAgICAgIHsgXG4gICAgICAgIGZ1bmN0aW9uQXJuOiBjZGsuRm4uaW1wb3J0VmFsdWUoJ0FwcE1vZEV4LUJhY2tlbmQtUHJvY2Vzc1RyYWNraW5nRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgdXNlclNlYXJjaEZ1bmN0aW9uID0gbGFtYmRhLkZ1bmN0aW9uLmZyb21GdW5jdGlvbkF0dHJpYnV0ZXMoXG4gICAgICB0aGlzLCAnSW1wb3J0ZWRVc2VyU2VhcmNoRnVuY3Rpb24nLFxuICAgICAgeyBcbiAgICAgICAgZnVuY3Rpb25Bcm46IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQXBwTW9kRXgtQmFja2VuZC1Vc2VyU2VhcmNoRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgcGlsb3RJbml0aWF0ZUZ1bmN0aW9uID0gbGFtYmRhLkZ1bmN0aW9uLmZyb21GdW5jdGlvbkF0dHJpYnV0ZXMoXG4gICAgICB0aGlzLCAnSW1wb3J0ZWRQaWxvdEluaXRpYXRlRnVuY3Rpb24nLFxuICAgICAgeyBcbiAgICAgICAgZnVuY3Rpb25Bcm46IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQXBwTW9kRXgtQmFja2VuZC1QaWxvdEluaXRpYXRlRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgcGlsb3RTdGF0dXNGdW5jdGlvbiA9IGxhbWJkYS5GdW5jdGlvbi5mcm9tRnVuY3Rpb25BdHRyaWJ1dGVzKFxuICAgICAgdGhpcywgJ0ltcG9ydGVkUGlsb3RTdGF0dXNGdW5jdGlvbicsXG4gICAgICB7IFxuICAgICAgICBmdW5jdGlvbkFybjogY2RrLkZuLmltcG9ydFZhbHVlKCdBcHBNb2RFeC1CYWNrZW5kLVBpbG90U3RhdHVzRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgcGlsb3RSZXN1bHRzRnVuY3Rpb24gPSBsYW1iZGEuRnVuY3Rpb24uZnJvbUZ1bmN0aW9uQXR0cmlidXRlcyhcbiAgICAgIHRoaXMsICdJbXBvcnRlZFBpbG90UmVzdWx0c0Z1bmN0aW9uJyxcbiAgICAgIHsgXG4gICAgICAgIGZ1bmN0aW9uQXJuOiBjZGsuRm4uaW1wb3J0VmFsdWUoJ0FwcE1vZEV4LUJhY2tlbmQtUGlsb3RSZXN1bHRzRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgcGlsb3REZWxldGVGdW5jdGlvbiA9IGxhbWJkYS5GdW5jdGlvbi5mcm9tRnVuY3Rpb25BdHRyaWJ1dGVzKFxuICAgICAgdGhpcywgJ0ltcG9ydGVkUGlsb3REZWxldGVGdW5jdGlvbicsXG4gICAgICB7IFxuICAgICAgICBmdW5jdGlvbkFybjogY2RrLkZuLmltcG9ydFZhbHVlKCdBcHBNb2RFeC1CYWNrZW5kLVBpbG90RGVsZXRlRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgYXBwbGljYXRpb25CdWNrZXRzRnVuY3Rpb24gPSBsYW1iZGEuRnVuY3Rpb24uZnJvbUZ1bmN0aW9uQXR0cmlidXRlcyhcbiAgICAgIHRoaXMsICdJbXBvcnRlZEFwcGxpY2F0aW9uQnVja2V0c0Z1bmN0aW9uJyxcbiAgICAgIHsgXG4gICAgICAgIGZ1bmN0aW9uQXJuOiBjZGsuRm4uaW1wb3J0VmFsdWUoJ0FwcE1vZEV4LUJhY2tlbmQtQXBwbGljYXRpb25CdWNrZXRzRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgdGNvRnVuY3Rpb24gPSBsYW1iZGEuRnVuY3Rpb24uZnJvbUZ1bmN0aW9uQXR0cmlidXRlcyhcbiAgICAgIHRoaXMsICdJbXBvcnRlZFRDT0Z1bmN0aW9uJyxcbiAgICAgIHsgXG4gICAgICAgIGZ1bmN0aW9uQXJuOiBjZGsuRm4uaW1wb3J0VmFsdWUoJ0FwcE1vZEV4LUJhY2tlbmQtVENPRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgdGVhbUVzdGltYXRlc0Z1bmN0aW9uID0gbGFtYmRhLkZ1bmN0aW9uLmZyb21GdW5jdGlvbkF0dHJpYnV0ZXMoXG4gICAgICB0aGlzLCAnSW1wb3J0ZWRUZWFtRXN0aW1hdGVzRnVuY3Rpb24nLFxuICAgICAgeyBcbiAgICAgICAgZnVuY3Rpb25Bcm46IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQXBwTW9kRXgtQmFja2VuZC1UZWFtRXN0aW1hdGVzRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgYXRoZW5hUXVlcnlGdW5jdGlvbiA9IGxhbWJkYS5GdW5jdGlvbi5mcm9tRnVuY3Rpb25BdHRyaWJ1dGVzKFxuICAgICAgdGhpcywgJ0ltcG9ydGVkQXRoZW5hUXVlcnlGdW5jdGlvbicsXG4gICAgICB7IFxuICAgICAgICBmdW5jdGlvbkFybjogY2RrLkZuLmltcG9ydFZhbHVlKCdBcHBNb2RFeC1CYWNrZW5kLUF0aGVuYVF1ZXJ5RnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgdGVhbVdlaWdodHNGdW5jdGlvbiA9IGxhbWJkYS5GdW5jdGlvbi5mcm9tRnVuY3Rpb25BdHRyaWJ1dGVzKFxuICAgICAgdGhpcywgJ0ltcG9ydGVkVGVhbVdlaWdodHNGdW5jdGlvbicsXG4gICAgICB7IFxuICAgICAgICBmdW5jdGlvbkFybjogY2RrLkZuLmltcG9ydFZhbHVlKCdBcHBNb2RFeC1CYWNrZW5kLVRlYW1XZWlnaHRzRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3Qgc3RlcEZ1bmN0aW9uQXBpRnVuY3Rpb24gPSBsYW1iZGEuRnVuY3Rpb24uZnJvbUZ1bmN0aW9uQXR0cmlidXRlcyhcbiAgICAgIHRoaXMsICdJbXBvcnRlZFN0ZXBGdW5jdGlvbkFwaUZ1bmN0aW9uJyxcbiAgICAgIHsgXG4gICAgICAgIGZ1bmN0aW9uQXJuOiBjZGsuRm4uaW1wb3J0VmFsdWUoJ0FwcE1vZEV4LUJhY2tlbmQtU3RlcEZ1bmN0aW9uQXBpRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgZXhwb3J0SW5pdGlhdG9yRnVuY3Rpb24gPSBsYW1iZGEuRnVuY3Rpb24uZnJvbUZ1bmN0aW9uQXR0cmlidXRlcyhcbiAgICAgIHRoaXMsICdJbXBvcnRlZEV4cG9ydEluaXRpYXRvckZ1bmN0aW9uJyxcbiAgICAgIHsgXG4gICAgICAgIGZ1bmN0aW9uQXJuOiBjZGsuRm4uaW1wb3J0VmFsdWUoJ0FwcE1vZEV4LUJhY2tlbmQtRXhwb3J0SW5pdGlhdG9yRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgZXhwb3J0UmVhZGVyRnVuY3Rpb24gPSBsYW1iZGEuRnVuY3Rpb24uZnJvbUZ1bmN0aW9uQXR0cmlidXRlcyhcbiAgICAgIHRoaXMsICdJbXBvcnRlZEV4cG9ydFJlYWRlckZ1bmN0aW9uJyxcbiAgICAgIHsgXG4gICAgICAgIGZ1bmN0aW9uQXJuOiBjZGsuRm4uaW1wb3J0VmFsdWUoJ0FwcE1vZEV4LUJhY2tlbmQtRXhwb3J0UmVhZGVyRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgYXV0b21hdGlvblN0YXR1c0Z1bmN0aW9uID0gbGFtYmRhLkZ1bmN0aW9uLmZyb21GdW5jdGlvbkF0dHJpYnV0ZXMoXG4gICAgICB0aGlzLCAnSW1wb3J0ZWRBdXRvbWF0aW9uU3RhdHVzRnVuY3Rpb24nLFxuICAgICAgeyBcbiAgICAgICAgZnVuY3Rpb25Bcm46IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQXBwTW9kRXgtQmFja2VuZC1BdXRvbWF0aW9uU3RhdHVzRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgcHJvdmlzaW9uaW5nRnVuY3Rpb24gPSBsYW1iZGEuRnVuY3Rpb24uZnJvbUZ1bmN0aW9uQXR0cmlidXRlcyhcbiAgICAgIHRoaXMsICdJbXBvcnRlZFByb3Zpc2lvbmluZ0Z1bmN0aW9uJyxcbiAgICAgIHsgXG4gICAgICAgIGZ1bmN0aW9uQXJuOiBjZGsuRm4uaW1wb3J0VmFsdWUoJ0FwcE1vZEV4LUJhY2tlbmQtUHJvdmlzaW9uaW5nRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgYnVpbGRNb25pdG9yRnVuY3Rpb24gPSBsYW1iZGEuRnVuY3Rpb24uZnJvbUZ1bmN0aW9uQXR0cmlidXRlcyhcbiAgICAgIHRoaXMsICdJbXBvcnRlZEJ1aWxkTW9uaXRvckZ1bmN0aW9uJyxcbiAgICAgIHsgXG4gICAgICAgIGZ1bmN0aW9uQXJuOiBjZGsuRm4uaW1wb3J0VmFsdWUoJ0FwcE1vZEV4LUJhY2tlbmQtQnVpbGRNb25pdG9yRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgZmlsZU9wZXJhdGlvbnNGdW5jdGlvbiA9IGxhbWJkYS5GdW5jdGlvbi5mcm9tRnVuY3Rpb25BdHRyaWJ1dGVzKFxuICAgICAgdGhpcywgJ0ltcG9ydGVkRmlsZU9wZXJhdGlvbnNGdW5jdGlvbicsXG4gICAgICB7IFxuICAgICAgICBmdW5jdGlvbkFybjogY2RrLkZuLmltcG9ydFZhbHVlKCdBcHBNb2RFeC1CYWNrZW5kLUZpbGVPcGVyYXRpb25zRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgZGF0YVNvdXJjZXNGdW5jdGlvbiA9IGxhbWJkYS5GdW5jdGlvbi5mcm9tRnVuY3Rpb25BdHRyaWJ1dGVzKFxuICAgICAgdGhpcywgJ0ltcG9ydGVkRGF0YVNvdXJjZXNGdW5jdGlvbicsXG4gICAgICB7IFxuICAgICAgICBmdW5jdGlvbkFybjogY2RrLkZuLmltcG9ydFZhbHVlKCdBcHBNb2RFeC1CYWNrZW5kLURhdGFTb3VyY2VzRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgZmlsZVVwbG9hZEZ1bmN0aW9uID0gbGFtYmRhLkZ1bmN0aW9uLmZyb21GdW5jdGlvbkF0dHJpYnV0ZXMoXG4gICAgICB0aGlzLCAnSW1wb3J0ZWRGaWxlVXBsb2FkRnVuY3Rpb24nLFxuICAgICAgeyBcbiAgICAgICAgZnVuY3Rpb25Bcm46IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQXBwTW9kRXgtQmFja2VuZC1GaWxlVXBsb2FkRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgY29tcGFyZVdpdGhBdGhlbmFGdW5jdGlvbiA9IGxhbWJkYS5GdW5jdGlvbi5mcm9tRnVuY3Rpb25BdHRyaWJ1dGVzKFxuICAgICAgdGhpcywgJ0ltcG9ydGVkQ29tcGFyZVdpdGhBdGhlbmFGdW5jdGlvbicsXG4gICAgICB7IFxuICAgICAgICBmdW5jdGlvbkFybjogY2RrLkZuLmltcG9ydFZhbHVlKCdBcHBNb2RFeC1CYWNrZW5kLUNvbXBhcmVXaXRoQXRoZW5hRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3Qgcm9sZU1hcHBlckZ1bmN0aW9uID0gbGFtYmRhLkZ1bmN0aW9uLmZyb21GdW5jdGlvbkF0dHJpYnV0ZXMoXG4gICAgICB0aGlzLCAnSW1wb3J0ZWRSb2xlTWFwcGVyRnVuY3Rpb24nLFxuICAgICAgeyBcbiAgICAgICAgZnVuY3Rpb25Bcm46IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQXBwTW9kRXgtQmFja2VuZC1Sb2xlTWFwcGVyRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3Qgc3RlcEZ1bmN0aW9uVHJpZ2dlckZ1bmN0aW9uID0gbGFtYmRhLkZ1bmN0aW9uLmZyb21GdW5jdGlvbkF0dHJpYnV0ZXMoXG4gICAgICB0aGlzLCAnSW1wb3J0ZWRTdGVwRnVuY3Rpb25UcmlnZ2VyRnVuY3Rpb24nLFxuICAgICAgeyBcbiAgICAgICAgZnVuY3Rpb25Bcm46IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQXBwTW9kRXgtQmFja2VuZC1TdGVwRnVuY3Rpb25UcmlnZ2VyRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgcGlsb3RJZGVudGlmaWNhdGlvbkFzeW5jRnVuY3Rpb24gPSBsYW1iZGEuRnVuY3Rpb24uZnJvbUZ1bmN0aW9uQXR0cmlidXRlcyhcbiAgICAgIHRoaXMsICdJbXBvcnRlZFBpbG90SWRlbnRpZmljYXRpb25Bc3luY0Z1bmN0aW9uJyxcbiAgICAgIHsgXG4gICAgICAgIGZ1bmN0aW9uQXJuOiBjZGsuRm4uaW1wb3J0VmFsdWUoJ0FwcE1vZEV4LUJhY2tlbmQtUGlsb3RJZGVudGlmaWNhdGlvbkFzeW5jRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgYXBwbGljYXRpb25TaW1pbGFyaXRpZXNGdW5jdGlvbiA9IGxhbWJkYS5GdW5jdGlvbi5mcm9tRnVuY3Rpb25BdHRyaWJ1dGVzKFxuICAgICAgdGhpcywgJ0ltcG9ydGVkQXBwbGljYXRpb25TaW1pbGFyaXRpZXNGdW5jdGlvbicsXG4gICAgICB7IFxuICAgICAgICBmdW5jdGlvbkFybjogY2RrLkZuLmltcG9ydFZhbHVlKCdBcHBNb2RFeC1CYWNrZW5kLUFwcGxpY2F0aW9uU2ltaWxhcml0aWVzRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgY29tcG9uZW50U2ltaWxhcml0aWVzRnVuY3Rpb24gPSBsYW1iZGEuRnVuY3Rpb24uZnJvbUZ1bmN0aW9uQXR0cmlidXRlcyhcbiAgICAgIHRoaXMsICdJbXBvcnRlZENvbXBvbmVudFNpbWlsYXJpdGllc0Z1bmN0aW9uJyxcbiAgICAgIHsgXG4gICAgICAgIGZ1bmN0aW9uQXJuOiBjZGsuRm4uaW1wb3J0VmFsdWUoJ0FwcE1vZEV4LUJhY2tlbmQtQ29tcG9uZW50U2ltaWxhcml0aWVzRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgcGlsb3RJZGVudGlmaWNhdGlvbkZ1bmN0aW9uID0gbGFtYmRhLkZ1bmN0aW9uLmZyb21GdW5jdGlvbkF0dHJpYnV0ZXMoXG4gICAgICB0aGlzLCAnSW1wb3J0ZWRQaWxvdElkZW50aWZpY2F0aW9uRnVuY3Rpb24nLFxuICAgICAgeyBcbiAgICAgICAgZnVuY3Rpb25Bcm46IGNkay5Gbi5pbXBvcnRWYWx1ZSgnQXBwTW9kRXgtQmFja2VuZC1QaWxvdElkZW50aWZpY2F0aW9uRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgcGlsb3RHYXRoZXJDb250ZXh0RnVuY3Rpb24gPSBsYW1iZGEuRnVuY3Rpb24uZnJvbUZ1bmN0aW9uQXR0cmlidXRlcyhcbiAgICAgIHRoaXMsICdJbXBvcnRlZFBpbG90R2F0aGVyQ29udGV4dEZ1bmN0aW9uJyxcbiAgICAgIHsgXG4gICAgICAgIGZ1bmN0aW9uQXJuOiBjZGsuRm4uaW1wb3J0VmFsdWUoJ0FwcE1vZEV4LUJhY2tlbmQtUGlsb3RHYXRoZXJDb250ZXh0RnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgcGlsb3RBSUVuaGFuY2VGdW5jdGlvbiA9IGxhbWJkYS5GdW5jdGlvbi5mcm9tRnVuY3Rpb25BdHRyaWJ1dGVzKFxuICAgICAgdGhpcywgJ0ltcG9ydGVkUGlsb3RBSUVuaGFuY2VGdW5jdGlvbicsXG4gICAgICB7IFxuICAgICAgICBmdW5jdGlvbkFybjogY2RrLkZuLmltcG9ydFZhbHVlKCdBcHBNb2RFeC1CYWNrZW5kLVBpbG90QUlFbmhhbmNlRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG4gICAgXG4gICAgY29uc3QgcGlsb3RDb21iaW5lU2NvcmVzRnVuY3Rpb24gPSBsYW1iZGEuRnVuY3Rpb24uZnJvbUZ1bmN0aW9uQXR0cmlidXRlcyhcbiAgICAgIHRoaXMsICdJbXBvcnRlZFBpbG90Q29tYmluZVNjb3Jlc0Z1bmN0aW9uJyxcbiAgICAgIHsgXG4gICAgICAgIGZ1bmN0aW9uQXJuOiBjZGsuRm4uaW1wb3J0VmFsdWUoJ0FwcE1vZEV4LUJhY2tlbmQtUGlsb3RDb21iaW5lU2NvcmVzRnVuY3Rpb25Bcm4nKSxcbiAgICAgICAgc2FtZUVudmlyb25tZW50OiB0cnVlIFxuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyA9PT09PSBDUkVBVEUgTEFNQkRBIElOVEVHUkFUSU9OUyA9PT09PVxuICAgIFxuICAgIGNvbnN0IHByb2plY3RzSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwcm9qZWN0c0Z1bmN0aW9uKTtcbiAgICBjb25zdCBwcm9qZWN0RGF0YUludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJvamVjdERhdGFGdW5jdGlvbik7XG4gICAgY29uc3Qgc2hhcmluZ0ludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oc2hhcmluZ0Z1bmN0aW9uKTtcbiAgICBjb25zdCBwcm9jZXNzVHJhY2tpbmdJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHByb2Nlc3NUcmFja2luZ0Z1bmN0aW9uKTtcbiAgICBjb25zdCB1c2VyU2VhcmNoSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih1c2VyU2VhcmNoRnVuY3Rpb24pO1xuICAgIGNvbnN0IHBpbG90SW5pdGlhdGVJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHBpbG90SW5pdGlhdGVGdW5jdGlvbik7XG4gICAgY29uc3QgcGlsb3RTdGF0dXNJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHBpbG90U3RhdHVzRnVuY3Rpb24pO1xuICAgIGNvbnN0IHBpbG90UmVzdWx0c0ludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocGlsb3RSZXN1bHRzRnVuY3Rpb24pO1xuICAgIGNvbnN0IHBpbG90RGVsZXRlSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwaWxvdERlbGV0ZUZ1bmN0aW9uKTtcbiAgICBjb25zdCBhcHBsaWNhdGlvbkJ1Y2tldHNJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGFwcGxpY2F0aW9uQnVja2V0c0Z1bmN0aW9uKTtcbiAgICBjb25zdCB0Y29JbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRjb0Z1bmN0aW9uKTtcbiAgICBjb25zdCB0ZWFtRXN0aW1hdGVzSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih0ZWFtRXN0aW1hdGVzRnVuY3Rpb24pO1xuICAgIGNvbnN0IGF0aGVuYVF1ZXJ5SW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihhdGhlbmFRdWVyeUZ1bmN0aW9uKTtcbiAgICBjb25zdCB0ZWFtV2VpZ2h0c0ludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odGVhbVdlaWdodHNGdW5jdGlvbik7XG4gICAgY29uc3Qgc3RlcEZ1bmN0aW9uQXBpSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihzdGVwRnVuY3Rpb25BcGlGdW5jdGlvbik7XG4gICAgY29uc3QgZXhwb3J0SW5pdGlhdG9ySW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihleHBvcnRJbml0aWF0b3JGdW5jdGlvbik7XG4gICAgY29uc3QgZXhwb3J0UmVhZGVySW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihleHBvcnRSZWFkZXJGdW5jdGlvbik7XG4gICAgY29uc3QgYXV0b21hdGlvblN0YXR1c0ludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYXV0b21hdGlvblN0YXR1c0Z1bmN0aW9uKTtcbiAgICBjb25zdCBwcm92aXNpb25pbmdJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHByb3Zpc2lvbmluZ0Z1bmN0aW9uKTtcbiAgICBjb25zdCBidWlsZE1vbml0b3JJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGJ1aWxkTW9uaXRvckZ1bmN0aW9uKTtcbiAgICBjb25zdCBmaWxlT3BlcmF0aW9uc0ludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZmlsZU9wZXJhdGlvbnNGdW5jdGlvbik7XG4gICAgY29uc3QgZGF0YVNvdXJjZXNJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGRhdGFTb3VyY2VzRnVuY3Rpb24pO1xuICAgIGNvbnN0IGZpbGVVcGxvYWRJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGZpbGVVcGxvYWRGdW5jdGlvbik7XG4gICAgY29uc3QgY29tcGFyZVdpdGhBdGhlbmFJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGNvbXBhcmVXaXRoQXRoZW5hRnVuY3Rpb24pO1xuICAgIGNvbnN0IHJvbGVNYXBwZXJJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHJvbGVNYXBwZXJGdW5jdGlvbik7XG4gICAgY29uc3Qgc3RlcEZ1bmN0aW9uVHJpZ2dlckludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oc3RlcEZ1bmN0aW9uVHJpZ2dlckZ1bmN0aW9uKTtcbiAgICBjb25zdCBwaWxvdElkZW50aWZpY2F0aW9uQXN5bmNJbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHBpbG90SWRlbnRpZmljYXRpb25Bc3luY0Z1bmN0aW9uKTtcbiAgICBjb25zdCBhcHBsaWNhdGlvblNpbWlsYXJpdGllc0ludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYXBwbGljYXRpb25TaW1pbGFyaXRpZXNGdW5jdGlvbik7XG4gICAgY29uc3QgY29tcG9uZW50U2ltaWxhcml0aWVzSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihjb21wb25lbnRTaW1pbGFyaXRpZXNGdW5jdGlvbik7XG4gICAgY29uc3QgcGlsb3RJZGVudGlmaWNhdGlvbkludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocGlsb3RJZGVudGlmaWNhdGlvbkZ1bmN0aW9uKTtcblxuICAgIC8vID09PT09IEFQSSBHQVRFV0FZIFJPVVRFUyA9PT09PVxuICAgIFxuICAgIC8vIEFkZCBBUEkgR2F0ZXdheSByZXNvdXJjZXMgYW5kIG1ldGhvZHNcbiAgICBjb25zdCBwcm9qZWN0c1Jlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgncHJvamVjdHMnKTtcbiAgICBwcm9qZWN0c1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgcHJvamVjdHNJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgcHJvamVjdHNSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBwcm9qZWN0c0ludGVncmF0aW9uLCB7IFxuICAgICAgYXV0aG9yaXplcjogdGhpcy5hdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHByb2plY3RSZXNvdXJjZSA9IHByb2plY3RzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3twcm9qZWN0SWR9Jyk7XG4gICAgcHJvamVjdFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgcHJvamVjdHNJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgcHJvamVjdFJlc291cmNlLmFkZE1ldGhvZCgnUFVUJywgcHJvamVjdHNJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgcHJvamVjdFJlc291cmNlLmFkZE1ldGhvZCgnREVMRVRFJywgcHJvamVjdHNJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICBjb25zdCBwcm9qZWN0RGF0YVJlc291cmNlID0gcHJvamVjdFJlc291cmNlLmFkZFJlc291cmNlKCdkYXRhJyk7XG4gICAgcHJvamVjdERhdGFSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIHByb2plY3REYXRhSW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuICAgIHByb2plY3REYXRhUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgcHJvamVjdERhdGFJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICBjb25zdCBwcm9qZWN0RGF0YVR5cGVSZXNvdXJjZSA9IHByb2plY3REYXRhUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3tkYXRhVHlwZX0nKTtcbiAgICBwcm9qZWN0RGF0YVR5cGVSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIHByb2plY3REYXRhSW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuICAgIHByb2plY3REYXRhVHlwZVJlc291cmNlLmFkZE1ldGhvZCgnUFVUJywgcHJvamVjdERhdGFJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgcHJvamVjdERhdGFUeXBlUmVzb3VyY2UuYWRkTWV0aG9kKCdERUxFVEUnLCBwcm9qZWN0RGF0YUludGVncmF0aW9uLCB7IFxuICAgICAgYXV0aG9yaXplcjogdGhpcy5hdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHNoYXJpbmdSZXNvdXJjZSA9IHByb2plY3RSZXNvdXJjZS5hZGRSZXNvdXJjZSgnc2hhcmluZycpO1xuICAgIHNoYXJpbmdSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIHNoYXJpbmdJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgc2hhcmluZ1Jlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIHNoYXJpbmdJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICBjb25zdCBzaGFyZVJlc291cmNlID0gc2hhcmluZ1Jlc291cmNlLmFkZFJlc291cmNlKCd7c2hhcmVJZH0nKTtcbiAgICBzaGFyZVJlc291cmNlLmFkZE1ldGhvZCgnUFVUJywgc2hhcmluZ0ludGVncmF0aW9uLCB7IFxuICAgICAgYXV0aG9yaXplcjogdGhpcy5hdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcbiAgICBzaGFyZVJlc291cmNlLmFkZE1ldGhvZCgnREVMRVRFJywgc2hhcmluZ0ludGVncmF0aW9uLCB7IFxuICAgICAgYXV0aG9yaXplcjogdGhpcy5hdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIC8vIEFkZCB1c2VyIHNlYXJjaCB1bmRlciBzaGFyaW5nIHJlc291cmNlXG4gICAgY29uc3Qgc2hhcmluZ1VzZXJzUmVzb3VyY2UgPSBzaGFyaW5nUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3VzZXJzJyk7XG4gICAgY29uc3Qgc2hhcmluZ1VzZXJTZWFyY2hSZXNvdXJjZSA9IHNoYXJpbmdVc2Vyc1Jlc291cmNlLmFkZFJlc291cmNlKCdzZWFyY2gnKTtcbiAgICBzaGFyaW5nVXNlclNlYXJjaFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgdXNlclNlYXJjaEludGVncmF0aW9uLCB7IFxuICAgICAgYXV0aG9yaXplcjogdGhpcy5hdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHByb2Nlc3NUcmFja2luZ1Jlc291cmNlID0gcHJvamVjdFJlc291cmNlLmFkZFJlc291cmNlKCdwcm9jZXNzLXRyYWNraW5nJyk7XG4gICAgcHJvY2Vzc1RyYWNraW5nUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBwcm9jZXNzVHJhY2tpbmdJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgcHJvY2Vzc1RyYWNraW5nUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgcHJvY2Vzc1RyYWNraW5nSW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdXNlclNlYXJjaFJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgndXNlcnMnKTtcbiAgICB1c2VyU2VhcmNoUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCB1c2VyU2VhcmNoSW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcGlsb3RSZXNvdXJjZSA9IHByb2plY3RSZXNvdXJjZS5hZGRSZXNvdXJjZSgncGlsb3QnKTtcbiAgICBwaWxvdFJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIHBpbG90SW5pdGlhdGVJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICBjb25zdCBwaWxvdFN0YXR1c1Jlc291cmNlID0gcGlsb3RSZXNvdXJjZS5hZGRSZXNvdXJjZSgnc3RhdHVzJyk7XG4gICAgcGlsb3RTdGF0dXNSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIHBpbG90U3RhdHVzSW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcGlsb3RSZXN1bHRzUmVzb3VyY2UgPSBwaWxvdFJlc291cmNlLmFkZFJlc291cmNlKCdyZXN1bHRzJyk7XG4gICAgcGlsb3RSZXN1bHRzUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBwaWxvdFJlc3VsdHNJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICBjb25zdCBwaWxvdERlbGV0ZVJlc291cmNlID0gcGlsb3RSZXNvdXJjZS5hZGRSZXNvdXJjZSgnZGVsZXRlJyk7XG4gICAgcGlsb3REZWxldGVSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBwaWxvdERlbGV0ZUludGVncmF0aW9uLCB7IFxuICAgICAgYXV0aG9yaXplcjogdGhpcy5hdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIC8vIEFwcGxpY2F0aW9uIEJ1Y2tldHMgZW5kcG9pbnRzOiAvcHJvamVjdHMve3Byb2plY3RJZH0vYXBwbGljYXRpb24tYnVja2V0c1xuICAgIGNvbnN0IGFwcGxpY2F0aW9uQnVja2V0c1Jlc291cmNlID0gcHJvamVjdFJlc291cmNlLmFkZFJlc291cmNlKCdhcHBsaWNhdGlvbi1idWNrZXRzJyk7XG4gICAgXG4gICAgLy8gQmFzZSByZXNvdXJjZSBtZXRob2RzOiBsaXN0IGFsbCBidWNrZXRzLCBjcmVhdGUgYnVja2V0XG4gICAgYXBwbGljYXRpb25CdWNrZXRzUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBhcHBsaWNhdGlvbkJ1Y2tldHNJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgYXBwbGljYXRpb25CdWNrZXRzUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgYXBwbGljYXRpb25CdWNrZXRzSW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgLy8gU3ViLXJlc291cmNlIGZvciBzcGVjaWZpYyBidWNrZXQ6IC9wcm9qZWN0cy97cHJvamVjdElkfS9hcHBsaWNhdGlvbi1idWNrZXRzL3tidWNrZXRJZH1cbiAgICBjb25zdCBhcHBsaWNhdGlvbkJ1Y2tldFJlc291cmNlID0gYXBwbGljYXRpb25CdWNrZXRzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3tidWNrZXRJZH0nKTtcbiAgICBhcHBsaWNhdGlvbkJ1Y2tldFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgYXBwbGljYXRpb25CdWNrZXRzSW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuICAgIGFwcGxpY2F0aW9uQnVja2V0UmVzb3VyY2UuYWRkTWV0aG9kKCdQVVQnLCBhcHBsaWNhdGlvbkJ1Y2tldHNJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgYXBwbGljYXRpb25CdWNrZXRSZXNvdXJjZS5hZGRNZXRob2QoJ0RFTEVURScsIGFwcGxpY2F0aW9uQnVja2V0c0ludGVncmF0aW9uLCB7IFxuICAgICAgYXV0aG9yaXplcjogdGhpcy5hdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHRjb1Jlc291cmNlID0gcHJvamVjdFJlc291cmNlLmFkZFJlc291cmNlKCd0Y28nKTtcbiAgICB0Y29SZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIHRjb0ludGVncmF0aW9uLCB7IFxuICAgICAgYXV0aG9yaXplcjogdGhpcy5hdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcbiAgICB0Y29SZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCB0Y29JbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgXG4gICAgLy8gVENPIGl0ZW0gcmVzb3VyY2UgZm9yIHNwZWNpZmljIFRDTyBvcGVyYXRpb25zIChQVVQsIERFTEVURSlcbiAgICBjb25zdCB0Y29JdGVtUmVzb3VyY2UgPSB0Y29SZXNvdXJjZS5hZGRSZXNvdXJjZSgne3Rjb0lkfScpO1xuICAgIHRjb0l0ZW1SZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIHRjb0ludGVncmF0aW9uLCB7IFxuICAgICAgYXV0aG9yaXplcjogdGhpcy5hdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcbiAgICB0Y29JdGVtUmVzb3VyY2UuYWRkTWV0aG9kKCdQVVQnLCB0Y29JbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgdGNvSXRlbVJlc291cmNlLmFkZE1ldGhvZCgnREVMRVRFJywgdGNvSW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdGVhbUVzdGltYXRlc1Jlc291cmNlID0gcHJvamVjdFJlc291cmNlLmFkZFJlc291cmNlKCd0ZWFtLWVzdGltYXRlcycpO1xuICAgIHRlYW1Fc3RpbWF0ZXNSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIHRlYW1Fc3RpbWF0ZXNJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgdGVhbUVzdGltYXRlc1Jlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIHRlYW1Fc3RpbWF0ZXNJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgc3ViLXJlc291cmNlIGZvciBzcGVjaWZpYyB0ZWFtIGVzdGltYXRlIG9wZXJhdGlvbnNcbiAgICBjb25zdCB0ZWFtRXN0aW1hdGVJdGVtUmVzb3VyY2UgPSB0ZWFtRXN0aW1hdGVzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3t0ZWFtRXN0aW1hdGVJZH0nKTtcbiAgICB0ZWFtRXN0aW1hdGVJdGVtUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCB0ZWFtRXN0aW1hdGVzSW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuICAgIHRlYW1Fc3RpbWF0ZUl0ZW1SZXNvdXJjZS5hZGRNZXRob2QoJ1BVVCcsIHRlYW1Fc3RpbWF0ZXNJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgdGVhbUVzdGltYXRlSXRlbVJlc291cmNlLmFkZE1ldGhvZCgnREVMRVRFJywgdGVhbUVzdGltYXRlc0ludGVncmF0aW9uLCB7IFxuICAgICAgYXV0aG9yaXplcjogdGhpcy5hdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGF0aGVuYVF1ZXJ5UmVzb3VyY2UgPSBwcm9qZWN0UmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2F0aGVuYS1xdWVyeScpO1xuICAgIGF0aGVuYVF1ZXJ5UmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgYXRoZW5hUXVlcnlJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICBjb25zdCB0ZWFtV2VpZ2h0c1Jlc291cmNlID0gcHJvamVjdFJlc291cmNlLmFkZFJlc291cmNlKCd0ZWFtLXdlaWdodHMnKTtcbiAgICB0ZWFtV2VpZ2h0c1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgdGVhbVdlaWdodHNJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgdGVhbVdlaWdodHNSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCB0ZWFtV2VpZ2h0c0ludGVncmF0aW9uLCB7IFxuICAgICAgYXV0aG9yaXplcjogdGhpcy5hdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHN0ZXBGdW5jdGlvbkFwaVJlc291cmNlID0gcHJvamVjdFJlc291cmNlLmFkZFJlc291cmNlKCdzdGVwLWZ1bmN0aW9uJyk7XG4gICAgc3RlcEZ1bmN0aW9uQXBpUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgc3RlcEZ1bmN0aW9uQXBpSW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuICAgIHN0ZXBGdW5jdGlvbkFwaVJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgc3RlcEZ1bmN0aW9uQXBpSW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYXBwbGljYXRpb25TaW1pbGFyaXRpZXNSZXNvdXJjZSA9IHByb2plY3RSZXNvdXJjZS5hZGRSZXNvdXJjZSgnYXBwbGljYXRpb24tc2ltaWxhcml0aWVzJyk7XG4gICAgYXBwbGljYXRpb25TaW1pbGFyaXRpZXNSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGFwcGxpY2F0aW9uU2ltaWxhcml0aWVzSW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuICAgIGFwcGxpY2F0aW9uU2ltaWxhcml0aWVzUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgYXBwbGljYXRpb25TaW1pbGFyaXRpZXNJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgYXBwbGljYXRpb25TaW1pbGFyaXRpZXNSZXNvdXJjZS5hZGRNZXRob2QoJ0RFTEVURScsIGFwcGxpY2F0aW9uU2ltaWxhcml0aWVzSW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgY29tcG9uZW50U2ltaWxhcml0aWVzUmVzb3VyY2UgPSBwcm9qZWN0UmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2NvbXBvbmVudC1zaW1pbGFyaXRpZXMnKTtcbiAgICBjb21wb25lbnRTaW1pbGFyaXRpZXNSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGNvbXBvbmVudFNpbWlsYXJpdGllc0ludGVncmF0aW9uLCB7IFxuICAgICAgYXV0aG9yaXplcjogdGhpcy5hdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcbiAgICBjb21wb25lbnRTaW1pbGFyaXRpZXNSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBjb21wb25lbnRTaW1pbGFyaXRpZXNJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgY29tcG9uZW50U2ltaWxhcml0aWVzUmVzb3VyY2UuYWRkTWV0aG9kKCdERUxFVEUnLCBjb21wb25lbnRTaW1pbGFyaXRpZXNJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICBjb25zdCBwaWxvdElkZW50aWZpY2F0aW9uUmVzb3VyY2UgPSBwcm9qZWN0UmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3BpbG90LWlkZW50aWZpY2F0aW9uJyk7XG4gICAgcGlsb3RJZGVudGlmaWNhdGlvblJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgcGlsb3RJZGVudGlmaWNhdGlvbkludGVncmF0aW9uLCB7IFxuICAgICAgYXV0aG9yaXplcjogdGhpcy5hdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcbiAgICBwaWxvdElkZW50aWZpY2F0aW9uUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgcGlsb3RJZGVudGlmaWNhdGlvbkludGVncmF0aW9uLCB7IFxuICAgICAgYXV0aG9yaXplcjogdGhpcy5hdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcbiAgICBwaWxvdElkZW50aWZpY2F0aW9uUmVzb3VyY2UuYWRkTWV0aG9kKCdERUxFVEUnLCBwaWxvdElkZW50aWZpY2F0aW9uSW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZXhwb3J0VHJpZ2dlclJlc291cmNlID0gcHJvamVjdFJlc291cmNlLmFkZFJlc291cmNlKCdleHBvcnQnKTtcbiAgICBleHBvcnRUcmlnZ2VyUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgZXhwb3J0SW5pdGlhdG9ySW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZXhwb3J0SGlzdG9yeVJlc291cmNlID0gZXhwb3J0VHJpZ2dlclJlc291cmNlLmFkZFJlc291cmNlKCdoaXN0b3J5Jyk7XG4gICAgZXhwb3J0SGlzdG9yeVJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgZXhwb3J0UmVhZGVySW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZXhwb3J0SWRSZXNvdXJjZSA9IGV4cG9ydFRyaWdnZXJSZXNvdXJjZS5hZGRSZXNvdXJjZSgne2V4cG9ydElkfScpO1xuICAgIGV4cG9ydElkUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBleHBvcnRSZWFkZXJJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgZXhwb3J0SWRSZXNvdXJjZS5hZGRNZXRob2QoJ1BVVCcsIGV4cG9ydFJlYWRlckludGVncmF0aW9uLCB7IFxuICAgICAgYXV0aG9yaXplcjogdGhpcy5hdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGV4cG9ydERvd25sb2FkUmVzb3VyY2UgPSBleHBvcnRJZFJlc291cmNlLmFkZFJlc291cmNlKCdkb3dubG9hZCcpO1xuICAgIGV4cG9ydERvd25sb2FkUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBleHBvcnRSZWFkZXJJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICBjb25zdCBhdXRvbWF0aW9uU3RhdHVzUmVzb3VyY2UgPSBwcm9qZWN0UmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2F1dG9tYXRpb24tc3RhdHVzJyk7XG4gICAgYXV0b21hdGlvblN0YXR1c1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgYXV0b21hdGlvblN0YXR1c0ludGVncmF0aW9uLCB7IFxuICAgICAgYXV0aG9yaXplcjogdGhpcy5hdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IHByb3Zpc2lvbmluZ1Jlc291cmNlID0gcHJvamVjdFJlc291cmNlLmFkZFJlc291cmNlKCdwcm92aXNpb25pbmcnKTtcbiAgICBwcm92aXNpb25pbmdSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBwcm92aXNpb25pbmdJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICBjb25zdCBidWlsZE1vbml0b3JSZXNvdXJjZSA9IHByb2plY3RSZXNvdXJjZS5hZGRSZXNvdXJjZSgnYnVpbGQtbW9uaXRvcicpO1xuICAgIGJ1aWxkTW9uaXRvclJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgYnVpbGRNb25pdG9ySW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgZmlsZU9wZXJhdGlvbnNSZXNvdXJjZSA9IHByb2plY3RSZXNvdXJjZS5hZGRSZXNvdXJjZSgnZmlsZS1vcGVyYXRpb25zJyk7XG4gICAgZmlsZU9wZXJhdGlvbnNSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGZpbGVPcGVyYXRpb25zSW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuICAgIGZpbGVPcGVyYXRpb25zUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgZmlsZU9wZXJhdGlvbnNJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICAvLyBGaWxlcyBlbmRwb2ludCBmb3IgZG93bmxvYWQgYW5kIGRlbGV0ZSBvcGVyYXRpb25zXG4gICAgY29uc3QgZmlsZXNSZXNvdXJjZSA9IHByb2plY3RSZXNvdXJjZS5hZGRSZXNvdXJjZSgnZmlsZXMnKTtcbiAgICBjb25zdCBmaWxlSWRSZXNvdXJjZSA9IGZpbGVzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3tpZH0nKTtcbiAgICBmaWxlSWRSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIGZpbGVPcGVyYXRpb25zSW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuICAgIGZpbGVJZFJlc291cmNlLmFkZE1ldGhvZCgnREVMRVRFJywgZmlsZU9wZXJhdGlvbnNJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICBjb25zdCBkYXRhU291cmNlc1Jlc291cmNlID0gcHJvamVjdFJlc291cmNlLmFkZFJlc291cmNlKCdkYXRhLXNvdXJjZXMnKTtcbiAgICBkYXRhU291cmNlc1Jlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgZGF0YVNvdXJjZXNJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgZGF0YVNvdXJjZXNSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBkYXRhU291cmNlc0ludGVncmF0aW9uLCB7IFxuICAgICAgYXV0aG9yaXplcjogdGhpcy5hdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGZpbGVVcGxvYWRSZXNvdXJjZSA9IHByb2plY3RSZXNvdXJjZS5hZGRSZXNvdXJjZSgnZmlsZS11cGxvYWQnKTtcbiAgICBmaWxlVXBsb2FkUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgZmlsZVVwbG9hZEludGVncmF0aW9uLCB7IFxuICAgICAgYXV0aG9yaXplcjogdGhpcy5hdXRob3JpemVyLFxuICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbXBhcmVXaXRoQXRoZW5hUmVzb3VyY2UgPSBwcm9qZWN0UmVzb3VyY2UuYWRkUmVzb3VyY2UoJ2NvbXBhcmUtd2l0aC1hdGhlbmEnKTtcbiAgICBjb21wYXJlV2l0aEF0aGVuYVJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIGNvbXBhcmVXaXRoQXRoZW5hSW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3Qgcm9sZU1hcHBlclJlc291cmNlID0gcHJvamVjdFJlc291cmNlLmFkZFJlc291cmNlKCdyb2xlLW1hcHBlcicpO1xuICAgIHJvbGVNYXBwZXJSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIHJvbGVNYXBwZXJJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG4gICAgcm9sZU1hcHBlclJlc291cmNlLmFkZE1ldGhvZCgnUE9TVCcsIHJvbGVNYXBwZXJJbnRlZ3JhdGlvbiwgeyBcbiAgICAgIGF1dGhvcml6ZXI6IHRoaXMuYXV0aG9yaXplcixcbiAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNPR05JVE8sXG4gICAgfSk7XG5cbiAgICBjb25zdCBzdGVwRnVuY3Rpb25UcmlnZ2VyUmVzb3VyY2UgPSBwcm9qZWN0UmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3N0ZXAtZnVuY3Rpb24tdHJpZ2dlcicpO1xuICAgIHN0ZXBGdW5jdGlvblRyaWdnZXJSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBzdGVwRnVuY3Rpb25UcmlnZ2VySW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgY29uc3QgcGlsb3RJZGVudGlmaWNhdGlvbkFzeW5jUmVzb3VyY2UgPSBwcm9qZWN0UmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3BpbG90LWlkZW50aWZpY2F0aW9uLWFzeW5jJyk7XG4gICAgcGlsb3RJZGVudGlmaWNhdGlvbkFzeW5jUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgcGlsb3RJZGVudGlmaWNhdGlvbkFzeW5jSW50ZWdyYXRpb24sIHsgXG4gICAgICBhdXRob3JpemVyOiB0aGlzLmF1dGhvcml6ZXIsXG4gICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgIH0pO1xuXG4gICAgLy8gRXhwb3J0IG91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpVXJsJywge1xuICAgICAgdmFsdWU6IHRoaXMuYXBpLnVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgVVJMJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdBcHBNb2RFeC1BcGlVcmwnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUlkJywge1xuICAgICAgdmFsdWU6IHRoaXMuYXBpLnJlc3RBcGlJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LUFwaUlkJyxcbiAgICB9KTtcbiAgfVxufVxuIl19