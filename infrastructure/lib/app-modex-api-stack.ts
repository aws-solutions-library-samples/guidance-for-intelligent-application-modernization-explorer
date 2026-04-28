import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Duration } from 'aws-cdk-lib';

export interface AppModExApiStackProps extends cdk.StackProps {
  environment: string;
  userPool: cognito.UserPool;
}

export class AppModExApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly authorizer: apigateway.CognitoUserPoolsAuthorizer;

  constructor(scope: Construct, id: string, props: AppModExApiStackProps) {
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
        accessLogFormat: apigateway.AccessLogFormat.custom(
          JSON.stringify({
            requestId: '$context.requestId',
            ip: '$context.identity.sourceIp',
            method: '$context.httpMethod',
            path: '$context.path',
            status: '$context.status',
            responseLength: '$context.responseLength',
          })
        ),
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
        maxAge: Duration.seconds(300),
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
    } else {
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
    const projectsFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedProjectsFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-ProjectsFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const projectDataFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedProjectDataFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-ProjectDataFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const sharingFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedSharingFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-SharingFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const processTrackingFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedProcessTrackingFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-ProcessTrackingFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const userSearchFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedUserSearchFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-UserSearchFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const pilotInitiateFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedPilotInitiateFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-PilotInitiateFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const pilotStatusFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedPilotStatusFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-PilotStatusFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const pilotResultsFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedPilotResultsFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-PilotResultsFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const pilotDeleteFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedPilotDeleteFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-PilotDeleteFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const applicationBucketsFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedApplicationBucketsFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-ApplicationBucketsFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const tcoFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedTCOFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-TCOFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const teamEstimatesFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedTeamEstimatesFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-TeamEstimatesFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const athenaQueryFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedAthenaQueryFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-AthenaQueryFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const teamWeightsFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedTeamWeightsFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-TeamWeightsFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const stepFunctionApiFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedStepFunctionApiFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-StepFunctionApiFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const exportInitiatorFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedExportInitiatorFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-ExportInitiatorFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const exportReaderFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedExportReaderFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-ExportReaderFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const automationStatusFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedAutomationStatusFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-AutomationStatusFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const provisioningFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedProvisioningFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-ProvisioningFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const buildMonitorFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedBuildMonitorFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-BuildMonitorFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const fileOperationsFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedFileOperationsFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-FileOperationsFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const dataSourcesFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedDataSourcesFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-DataSourcesFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const fileUploadFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedFileUploadFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-FileUploadFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const compareWithAthenaFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedCompareWithAthenaFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-CompareWithAthenaFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const roleMapperFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedRoleMapperFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-RoleMapperFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const stepFunctionTriggerFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedStepFunctionTriggerFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-StepFunctionTriggerFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const pilotIdentificationAsyncFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedPilotIdentificationAsyncFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-PilotIdentificationAsyncFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const applicationSimilaritiesFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedApplicationSimilaritiesFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-ApplicationSimilaritiesFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const componentSimilaritiesFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedComponentSimilaritiesFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-ComponentSimilaritiesFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const pilotIdentificationFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedPilotIdentificationFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-PilotIdentificationFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const pilotGatherContextFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedPilotGatherContextFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-PilotGatherContextFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const pilotAIEnhanceFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedPilotAIEnhanceFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-PilotAIEnhanceFunctionArn'),
        sameEnvironment: true 
      }
    );
    
    const pilotCombineScoresFunction = lambda.Function.fromFunctionAttributes(
      this, 'ImportedPilotCombineScoresFunction',
      { 
        functionArn: cdk.Fn.importValue('AppModEx-Backend-PilotCombineScoresFunctionArn'),
        sameEnvironment: true 
      }
    );

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
