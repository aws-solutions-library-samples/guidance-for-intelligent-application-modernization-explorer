"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LambdaRoleManager = void 0;
const iam = require("aws-cdk-lib/aws-iam");
/**
 * Lambda Role Manager
 * Simplifies creation of per-function IAM roles with specific permissions
 * Implements least-privilege principle for each Lambda function
 */
class LambdaRoleManager {
    constructor(scope, region, account) {
        this.scope = scope;
        this.region = region;
        this.account = account;
    }
    /**
     * Create a basic Lambda execution role with CloudWatch Logs permission
     * @param functionName - Name of the Lambda function
     * @returns IAM Role
     */
    createBasicRole(functionName) {
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
    createLambdaRole(roleName, functionName) {
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
    grantDynamoDBReadWrite(role, table) {
        table.grantReadWriteData(role);
    }
    /**
     * Grant DynamoDB read-only permissions to a role
     * @param role - IAM Role
     * @param table - DynamoDB Table
     */
    grantDynamoDBReadOnly(role, table) {
        table.grantReadData(role);
    }
    /**
     * Grant SQS send message permission to a role
     * @param role - IAM Role
     * @param queue - SQS Queue
     */
    grantSQSSendMessage(role, queue) {
        queue.grantSendMessages(role);
    }
    /**
     * Grant SQS receive/delete message permissions to a role
     * @param role - IAM Role
     * @param queue - SQS Queue
     */
    grantSQSReceiveDelete(role, queue) {
        queue.grantConsumeMessages(role);
    }
    /**
     * Grant Cognito permissions to a role
     * @param role - IAM Role
     * @param userPool - Cognito User Pool
     * @param permissions - Array of permissions ('list-users', 'get-user', 'describe-pool')
     */
    grantCognitoPermissions(role, userPool, permissions) {
        const actions = [];
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
    grantAthenaPermissions(role, permissions) {
        const actions = [];
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
    grantGluePermissions(role, permissions) {
        const actions = [];
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
    grantS3Permissions(role, bucketPattern, permissions) {
        const actions = [];
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
    grantEventBridgePermissions(role, permissions) {
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
    grantBedrockPermissions(role, permissions) {
        const actions = [];
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
    grantSecretsManagerRead(role, secretArn) {
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
    grantCustomPolicy(role, actions, resources, effect = iam.Effect.ALLOW) {
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
    grantSQSProjectQueuePermissions(role, permissions) {
        const actions = [];
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
    grantCodeBuildPermissions(role, permissions) {
        const actions = [];
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
    grantIAMPassRole(role, rolePattern) {
        role.addToPolicy(new iam.PolicyStatement({
            actions: ['iam:PassRole'],
            resources: [
                `arn:aws:iam::${this.account}:role/${rolePattern}`
            ]
        }));
    }
}
exports.LambdaRoleManager = LambdaRoleManager;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLW1vZGV4LWxhbWJkYS1yb2xlLW1hbmFnZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhcHAtbW9kZXgtbGFtYmRhLXJvbGUtbWFuYWdlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSwyQ0FBMkM7QUFPM0M7Ozs7R0FJRztBQUNILE1BQWEsaUJBQWlCO0lBSzVCLFlBQVksS0FBZ0IsRUFBRSxNQUFjLEVBQUUsT0FBZTtRQUMzRCxJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUNyQixJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztJQUN6QixDQUFDO0lBRUQ7Ozs7T0FJRztJQUNILGVBQWUsQ0FBQyxZQUFvQjtRQUNsQyxNQUFNLElBQUksR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxHQUFHLFlBQVksTUFBTSxFQUFFO1lBQzNELFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxzQkFBc0IsQ0FBQztZQUMzRCxXQUFXLEVBQUUsc0JBQXNCLFlBQVksa0JBQWtCO1NBQ2xFLENBQUMsQ0FBQztRQUVILHVFQUF1RTtRQUN2RSxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUN2QyxPQUFPLEVBQUU7Z0JBQ1AscUJBQXFCO2dCQUNyQixzQkFBc0I7Z0JBQ3RCLG1CQUFtQjthQUNwQjtZQUNELFNBQVMsRUFBRTtnQkFDVCxnQkFBZ0IsSUFBSSxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsT0FBTywwQkFBMEIsWUFBWSxJQUFJO2FBQ3RGO1NBQ0YsQ0FBQyxDQUFDLENBQUM7UUFFSixPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFFRDs7Ozs7T0FLRztJQUNILGdCQUFnQixDQUFDLFFBQWdCLEVBQUUsWUFBb0I7UUFDckQsTUFBTSxJQUFJLEdBQUcs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LElBQUksSUFBSSxDQUFDLE9BQU8sbUJBQW1CO2lCQUM5RDthQUNGLENBQUMsQ0FBQyxDQUFDO1NBQ0w7SUFDSCxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNILHlCQUF5QixDQUFDLElBQWMsRUFBRSxXQUFxQjtRQUM3RCxNQUFNLE9BQU8sR0FBYSxFQUFFLENBQUM7UUFFN0IsSUFBSSxXQUFXLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLEVBQUU7WUFDNUMsT0FBTyxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1NBQzFDO1FBQ0QsSUFBSSxXQUFXLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUFDLEVBQUU7WUFDOUMsT0FBTyxDQUFDLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxDQUFDO1NBQzVDO1FBRUQsSUFBSSxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtZQUN0QixJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztnQkFDdkMsT0FBTztnQkFDUCxTQUFTLEVBQUU7b0JBQ1QscUJBQXFCLElBQUksQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLE9BQU8sc0JBQXNCO2lCQUN2RTthQUNGLENBQUMsQ0FBQyxDQUFDO1NBQ0w7SUFDSCxDQUFDO0lBRUQ7Ozs7T0FJRztJQUNILGdCQUFnQixDQUFDLElBQWMsRUFBRSxXQUFtQjtRQUNsRCxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUN2QyxPQUFPLEVBQUUsQ0FBQyxjQUFjLENBQUM7WUFDekIsU0FBUyxFQUFFO2dCQUNULGdCQUFnQixJQUFJLENBQUMsT0FBTyxTQUFTLFdBQVcsRUFBRTthQUNuRDtTQUNGLENBQUMsQ0FBQyxDQUFDO0lBQ04sQ0FBQztDQUNGO0FBbFhELDhDQWtYQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xuaW1wb3J0ICogYXMgc3FzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zcXMnO1xuaW1wb3J0ICogYXMgY29nbml0byBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29nbml0byc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuLyoqXG4gKiBMYW1iZGEgUm9sZSBNYW5hZ2VyXG4gKiBTaW1wbGlmaWVzIGNyZWF0aW9uIG9mIHBlci1mdW5jdGlvbiBJQU0gcm9sZXMgd2l0aCBzcGVjaWZpYyBwZXJtaXNzaW9uc1xuICogSW1wbGVtZW50cyBsZWFzdC1wcml2aWxlZ2UgcHJpbmNpcGxlIGZvciBlYWNoIExhbWJkYSBmdW5jdGlvblxuICovXG5leHBvcnQgY2xhc3MgTGFtYmRhUm9sZU1hbmFnZXIge1xuICBwcml2YXRlIHNjb3BlOiBDb25zdHJ1Y3Q7XG4gIHByaXZhdGUgcmVnaW9uOiBzdHJpbmc7XG4gIHByaXZhdGUgYWNjb3VudDogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIHJlZ2lvbjogc3RyaW5nLCBhY2NvdW50OiBzdHJpbmcpIHtcbiAgICB0aGlzLnNjb3BlID0gc2NvcGU7XG4gICAgdGhpcy5yZWdpb24gPSByZWdpb247XG4gICAgdGhpcy5hY2NvdW50ID0gYWNjb3VudDtcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGUgYSBiYXNpYyBMYW1iZGEgZXhlY3V0aW9uIHJvbGUgd2l0aCBDbG91ZFdhdGNoIExvZ3MgcGVybWlzc2lvblxuICAgKiBAcGFyYW0gZnVuY3Rpb25OYW1lIC0gTmFtZSBvZiB0aGUgTGFtYmRhIGZ1bmN0aW9uXG4gICAqIEByZXR1cm5zIElBTSBSb2xlXG4gICAqL1xuICBjcmVhdGVCYXNpY1JvbGUoZnVuY3Rpb25OYW1lOiBzdHJpbmcpOiBpYW0uUm9sZSB7XG4gICAgY29uc3Qgcm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLnNjb3BlLCBgJHtmdW5jdGlvbk5hbWV9Um9sZWAsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgZGVzY3JpcHRpb246IGBFeGVjdXRpb24gcm9sZSBmb3IgJHtmdW5jdGlvbk5hbWV9IExhbWJkYSBmdW5jdGlvbmBcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IENsb3VkV2F0Y2ggTG9ncyBwZXJtaXNzaW9uIChyZXF1aXJlZCBmb3IgYWxsIExhbWJkYSBmdW5jdGlvbnMpXG4gICAgcm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgICdsb2dzOkNyZWF0ZUxvZ0dyb3VwJyxcbiAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nU3RyZWFtJyxcbiAgICAgICAgJ2xvZ3M6UHV0TG9nRXZlbnRzJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBgYXJuOmF3czpsb2dzOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTpsb2ctZ3JvdXA6L2F3cy9sYW1iZGEvJHtmdW5jdGlvbk5hbWV9OipgXG4gICAgICBdXG4gICAgfSkpO1xuXG4gICAgcmV0dXJuIHJvbGU7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlIGEgTGFtYmRhIGV4ZWN1dGlvbiByb2xlIHdpdGggQ2xvdWRXYXRjaCBMb2dzIHBlcm1pc3Npb24gKGFsaWFzIGZvciBjcmVhdGVCYXNpY1JvbGUpXG4gICAqIEBwYXJhbSByb2xlTmFtZSAtIE5hbWUgZm9yIHRoZSBJQU0gcm9sZSBjb25zdHJ1Y3RcbiAgICogQHBhcmFtIGZ1bmN0aW9uTmFtZSAtIE5hbWUgb2YgdGhlIExhbWJkYSBmdW5jdGlvblxuICAgKiBAcmV0dXJucyBJQU0gUm9sZVxuICAgKi9cbiAgY3JlYXRlTGFtYmRhUm9sZShyb2xlTmFtZTogc3RyaW5nLCBmdW5jdGlvbk5hbWU6IHN0cmluZyk6IGlhbS5Sb2xlIHtcbiAgICBjb25zdCByb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMuc2NvcGUsIHJvbGVOYW1lLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGRlc2NyaXB0aW9uOiBgRXhlY3V0aW9uIHJvbGUgZm9yICR7ZnVuY3Rpb25OYW1lfSBMYW1iZGEgZnVuY3Rpb25gXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBDbG91ZFdhdGNoIExvZ3MgcGVybWlzc2lvbiAocmVxdWlyZWQgZm9yIGFsbCBMYW1iZGEgZnVuY3Rpb25zKVxuICAgIHJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnbG9nczpDcmVhdGVMb2dHcm91cCcsXG4gICAgICAgICdsb2dzOkNyZWF0ZUxvZ1N0cmVhbScsXG4gICAgICAgICdsb2dzOlB1dExvZ0V2ZW50cydcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgYGFybjphd3M6bG9nczoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06bG9nLWdyb3VwOi9hd3MvbGFtYmRhLyR7ZnVuY3Rpb25OYW1lfToqYFxuICAgICAgXVxuICAgIH0pKTtcblxuICAgIHJldHVybiByb2xlO1xuICB9XG5cbiAgLyoqXG4gICAqIEdyYW50IER5bmFtb0RCIHJlYWQvd3JpdGUgcGVybWlzc2lvbnMgdG8gYSByb2xlXG4gICAqIEBwYXJhbSByb2xlIC0gSUFNIFJvbGVcbiAgICogQHBhcmFtIHRhYmxlIC0gRHluYW1vREIgVGFibGVcbiAgICovXG4gIGdyYW50RHluYW1vREJSZWFkV3JpdGUocm9sZTogaWFtLlJvbGUsIHRhYmxlOiBkeW5hbW9kYi5UYWJsZSk6IHZvaWQge1xuICAgIHRhYmxlLmdyYW50UmVhZFdyaXRlRGF0YShyb2xlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHcmFudCBEeW5hbW9EQiByZWFkLW9ubHkgcGVybWlzc2lvbnMgdG8gYSByb2xlXG4gICAqIEBwYXJhbSByb2xlIC0gSUFNIFJvbGVcbiAgICogQHBhcmFtIHRhYmxlIC0gRHluYW1vREIgVGFibGVcbiAgICovXG4gIGdyYW50RHluYW1vREJSZWFkT25seShyb2xlOiBpYW0uUm9sZSwgdGFibGU6IGR5bmFtb2RiLlRhYmxlKTogdm9pZCB7XG4gICAgdGFibGUuZ3JhbnRSZWFkRGF0YShyb2xlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHcmFudCBTUVMgc2VuZCBtZXNzYWdlIHBlcm1pc3Npb24gdG8gYSByb2xlXG4gICAqIEBwYXJhbSByb2xlIC0gSUFNIFJvbGVcbiAgICogQHBhcmFtIHF1ZXVlIC0gU1FTIFF1ZXVlXG4gICAqL1xuICBncmFudFNRU1NlbmRNZXNzYWdlKHJvbGU6IGlhbS5Sb2xlLCBxdWV1ZTogc3FzLlF1ZXVlKTogdm9pZCB7XG4gICAgcXVldWUuZ3JhbnRTZW5kTWVzc2FnZXMocm9sZSk7XG4gIH1cblxuICAvKipcbiAgICogR3JhbnQgU1FTIHJlY2VpdmUvZGVsZXRlIG1lc3NhZ2UgcGVybWlzc2lvbnMgdG8gYSByb2xlXG4gICAqIEBwYXJhbSByb2xlIC0gSUFNIFJvbGVcbiAgICogQHBhcmFtIHF1ZXVlIC0gU1FTIFF1ZXVlXG4gICAqL1xuICBncmFudFNRU1JlY2VpdmVEZWxldGUocm9sZTogaWFtLlJvbGUsIHF1ZXVlOiBzcXMuUXVldWUpOiB2b2lkIHtcbiAgICBxdWV1ZS5ncmFudENvbnN1bWVNZXNzYWdlcyhyb2xlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHcmFudCBDb2duaXRvIHBlcm1pc3Npb25zIHRvIGEgcm9sZVxuICAgKiBAcGFyYW0gcm9sZSAtIElBTSBSb2xlXG4gICAqIEBwYXJhbSB1c2VyUG9vbCAtIENvZ25pdG8gVXNlciBQb29sXG4gICAqIEBwYXJhbSBwZXJtaXNzaW9ucyAtIEFycmF5IG9mIHBlcm1pc3Npb25zICgnbGlzdC11c2VycycsICdnZXQtdXNlcicsICdkZXNjcmliZS1wb29sJylcbiAgICovXG4gIGdyYW50Q29nbml0b1Blcm1pc3Npb25zKHJvbGU6IGlhbS5Sb2xlLCB1c2VyUG9vbDogY29nbml0by5Vc2VyUG9vbCwgcGVybWlzc2lvbnM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgY29uc3QgYWN0aW9uczogc3RyaW5nW10gPSBbXTtcblxuICAgIGlmIChwZXJtaXNzaW9ucy5pbmNsdWRlcygnbGlzdC11c2VycycpKSB7XG4gICAgICBhY3Rpb25zLnB1c2goJ2NvZ25pdG8taWRwOkxpc3RVc2VycycpO1xuICAgIH1cbiAgICBpZiAocGVybWlzc2lvbnMuaW5jbHVkZXMoJ2dldC11c2VyJykpIHtcbiAgICAgIGFjdGlvbnMucHVzaCgnY29nbml0by1pZHA6QWRtaW5HZXRVc2VyJyk7XG4gICAgfVxuICAgIGlmIChwZXJtaXNzaW9ucy5pbmNsdWRlcygnZGVzY3JpYmUtcG9vbCcpKSB7XG4gICAgICBhY3Rpb25zLnB1c2goJ2NvZ25pdG8taWRwOkRlc2NyaWJlVXNlclBvb2wnKTtcbiAgICB9XG5cbiAgICBpZiAoYWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICByb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9ucyxcbiAgICAgICAgcmVzb3VyY2VzOiBbdXNlclBvb2wudXNlclBvb2xBcm5dXG4gICAgICB9KSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEdyYW50IEF0aGVuYSBwZXJtaXNzaW9ucyB0byBhIHJvbGVcbiAgICogQHBhcmFtIHJvbGUgLSBJQU0gUm9sZVxuICAgKiBAcGFyYW0gcGVybWlzc2lvbnMgLSBBcnJheSBvZiBwZXJtaXNzaW9ucyAoJ3N0YXJ0LXF1ZXJ5JywgJ2dldC1yZXN1bHRzJywgJ3N0b3AtcXVlcnknKVxuICAgKi9cbiAgZ3JhbnRBdGhlbmFQZXJtaXNzaW9ucyhyb2xlOiBpYW0uUm9sZSwgcGVybWlzc2lvbnM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgY29uc3QgYWN0aW9uczogc3RyaW5nW10gPSBbXTtcblxuICAgIGlmIChwZXJtaXNzaW9ucy5pbmNsdWRlcygnc3RhcnQtcXVlcnknKSkge1xuICAgICAgYWN0aW9ucy5wdXNoKCdhdGhlbmE6U3RhcnRRdWVyeUV4ZWN1dGlvbicpO1xuICAgIH1cbiAgICBpZiAocGVybWlzc2lvbnMuaW5jbHVkZXMoJ2dldC1yZXN1bHRzJykpIHtcbiAgICAgIGFjdGlvbnMucHVzaCgnYXRoZW5hOkdldFF1ZXJ5RXhlY3V0aW9uJywgJ2F0aGVuYTpHZXRRdWVyeVJlc3VsdHMnKTtcbiAgICB9XG4gICAgaWYgKHBlcm1pc3Npb25zLmluY2x1ZGVzKCdzdG9wLXF1ZXJ5JykpIHtcbiAgICAgIGFjdGlvbnMucHVzaCgnYXRoZW5hOlN0b3BRdWVyeUV4ZWN1dGlvbicpO1xuICAgIH1cblxuICAgIGlmIChhY3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICAgIHJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnMsXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOmF0aGVuYToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06d29ya2dyb3VwL2FwcC1tb2RleC0qYFxuICAgICAgICBdXG4gICAgICB9KSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEdyYW50IEdsdWUgcGVybWlzc2lvbnMgdG8gYSByb2xlXG4gICAqIEBwYXJhbSByb2xlIC0gSUFNIFJvbGVcbiAgICogQHBhcmFtIHBlcm1pc3Npb25zIC0gQXJyYXkgb2YgcGVybWlzc2lvbnMgKCdnZXQtZGF0YWJhc2UnLCAnZ2V0LXRhYmxlJywgJ2dldC1wYXJ0aXRpb24nKVxuICAgKi9cbiAgZ3JhbnRHbHVlUGVybWlzc2lvbnMocm9sZTogaWFtLlJvbGUsIHBlcm1pc3Npb25zOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgIGNvbnN0IGFjdGlvbnM6IHN0cmluZ1tdID0gW107XG5cbiAgICBpZiAocGVybWlzc2lvbnMuaW5jbHVkZXMoJ2dldC1kYXRhYmFzZScpKSB7XG4gICAgICBhY3Rpb25zLnB1c2goJ2dsdWU6R2V0RGF0YWJhc2UnKTtcbiAgICB9XG4gICAgaWYgKHBlcm1pc3Npb25zLmluY2x1ZGVzKCdnZXQtdGFibGUnKSkge1xuICAgICAgYWN0aW9ucy5wdXNoKCdnbHVlOkdldFRhYmxlJyk7XG4gICAgfVxuICAgIGlmIChwZXJtaXNzaW9ucy5pbmNsdWRlcygnZ2V0LXBhcnRpdGlvbicpKSB7XG4gICAgICBhY3Rpb25zLnB1c2goJ2dsdWU6R2V0UGFydGl0aW9uJywgJ2dsdWU6R2V0UGFydGl0aW9ucycpO1xuICAgIH1cblxuICAgIGlmIChhY3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICAgIHJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnMsXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOmdsdWU6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmNhdGFsb2dgLFxuICAgICAgICAgIGBhcm46YXdzOmdsdWU6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmRhdGFiYXNlL2FwcC1tb2RleC0qYCxcbiAgICAgICAgICBgYXJuOmF3czpnbHVlOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTp0YWJsZS9hcHAtbW9kZXgtKi8qYFxuICAgICAgICBdXG4gICAgICB9KSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEdyYW50IFMzIHBlcm1pc3Npb25zIHRvIGEgcm9sZVxuICAgKiBAcGFyYW0gcm9sZSAtIElBTSBSb2xlXG4gICAqIEBwYXJhbSBidWNrZXRQYXR0ZXJuIC0gUzMgYnVja2V0IG5hbWUgcGF0dGVybiAoZS5nLiwgJ2FwcC1tb2RleC1kYXRhLSonKVxuICAgKiBAcGFyYW0gcGVybWlzc2lvbnMgLSBBcnJheSBvZiBwZXJtaXNzaW9ucyAoJ2dldC1vYmplY3QnLCAncHV0LW9iamVjdCcsICdkZWxldGUtb2JqZWN0JywgJ2xpc3QtYnVja2V0JylcbiAgICovXG4gIGdyYW50UzNQZXJtaXNzaW9ucyhyb2xlOiBpYW0uUm9sZSwgYnVja2V0UGF0dGVybjogc3RyaW5nLCBwZXJtaXNzaW9uczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICBjb25zdCBhY3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgaWYgKHBlcm1pc3Npb25zLmluY2x1ZGVzKCdnZXQtb2JqZWN0JykpIHtcbiAgICAgIGFjdGlvbnMucHVzaCgnczM6R2V0T2JqZWN0Jyk7XG4gICAgfVxuICAgIGlmIChwZXJtaXNzaW9ucy5pbmNsdWRlcygncHV0LW9iamVjdCcpKSB7XG4gICAgICBhY3Rpb25zLnB1c2goJ3MzOlB1dE9iamVjdCcpO1xuICAgIH1cbiAgICBpZiAocGVybWlzc2lvbnMuaW5jbHVkZXMoJ2RlbGV0ZS1vYmplY3QnKSkge1xuICAgICAgYWN0aW9ucy5wdXNoKCdzMzpEZWxldGVPYmplY3QnKTtcbiAgICB9XG4gICAgaWYgKHBlcm1pc3Npb25zLmluY2x1ZGVzKCdsaXN0LWJ1Y2tldCcpKSB7XG4gICAgICBhY3Rpb25zLnB1c2goJ3MzOkxpc3RCdWNrZXQnKTtcbiAgICB9XG5cbiAgICBpZiAoYWN0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICByb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9ucyxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6czM6Ojoke2J1Y2tldFBhdHRlcm59YCxcbiAgICAgICAgICBgYXJuOmF3czpzMzo6OiR7YnVja2V0UGF0dGVybn0vKmBcbiAgICAgICAgXVxuICAgICAgfSkpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBHcmFudCBFdmVudEJyaWRnZSBwZXJtaXNzaW9ucyB0byBhIHJvbGVcbiAgICogQHBhcmFtIHJvbGUgLSBJQU0gUm9sZVxuICAgKiBAcGFyYW0gcGVybWlzc2lvbnMgLSBBcnJheSBvZiBwZXJtaXNzaW9ucyAoJ3B1dC1ldmVudHMnKVxuICAgKi9cbiAgZ3JhbnRFdmVudEJyaWRnZVBlcm1pc3Npb25zKHJvbGU6IGlhbS5Sb2xlLCBwZXJtaXNzaW9uczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICBpZiAocGVybWlzc2lvbnMuaW5jbHVkZXMoJ3B1dC1ldmVudHMnKSkge1xuICAgICAgcm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogWydldmVudHM6UHV0RXZlbnRzJ10sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOmV2ZW50czoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06ZXZlbnQtYnVzL2RlZmF1bHRgXG4gICAgICAgIF1cbiAgICAgIH0pKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogR3JhbnQgQmVkcm9jayBwZXJtaXNzaW9ucyB0byBhIHJvbGVcbiAgICogQHBhcmFtIHJvbGUgLSBJQU0gUm9sZVxuICAgKiBAcGFyYW0gcGVybWlzc2lvbnMgLSBBcnJheSBvZiBwZXJtaXNzaW9ucyAoJ2ludm9rZS1tb2RlbCcsICdpbnZva2UtYWdlbnQnKVxuICAgKi9cbiAgZ3JhbnRCZWRyb2NrUGVybWlzc2lvbnMocm9sZTogaWFtLlJvbGUsIHBlcm1pc3Npb25zOiBzdHJpbmdbXSk6IHZvaWQge1xuICAgIGNvbnN0IGFjdGlvbnM6IHN0cmluZ1tdID0gW107XG5cbiAgICBpZiAocGVybWlzc2lvbnMuaW5jbHVkZXMoJ2ludm9rZS1tb2RlbCcpKSB7XG4gICAgICBhY3Rpb25zLnB1c2goJ2JlZHJvY2s6SW52b2tlTW9kZWwnKTtcbiAgICB9XG4gICAgaWYgKHBlcm1pc3Npb25zLmluY2x1ZGVzKCdpbnZva2UtYWdlbnQnKSkge1xuICAgICAgYWN0aW9ucy5wdXNoKCdiZWRyb2NrOkludm9rZUFnZW50Jyk7XG4gICAgfVxuXG4gICAgaWYgKGFjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgcm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9ucyxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6YmVkcm9jazoke3RoaXMucmVnaW9ufTo6Zm91bmRhdGlvbi1tb2RlbC8qYCxcbiAgICAgICAgICBgYXJuOmF3czpiZWRyb2NrOiR7dGhpcy5yZWdpb259OiR7dGhpcy5hY2NvdW50fTphZ2VudC8qYFxuICAgICAgICBdXG4gICAgICB9KSk7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEdyYW50IFNlY3JldHMgTWFuYWdlciByZWFkIHBlcm1pc3Npb24gdG8gYSByb2xlXG4gICAqIEBwYXJhbSByb2xlIC0gSUFNIFJvbGVcbiAgICogQHBhcmFtIHNlY3JldEFybiAtIEFSTiBvZiB0aGUgc2VjcmV0XG4gICAqL1xuICBncmFudFNlY3JldHNNYW5hZ2VyUmVhZChyb2xlOiBpYW0uUm9sZSwgc2VjcmV0QXJuOiBzdHJpbmcpOiB2b2lkIHtcbiAgICByb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgJ3NlY3JldHNtYW5hZ2VyOkdldFNlY3JldFZhbHVlJ1xuICAgICAgXSxcbiAgICAgIHJlc291cmNlczogW3NlY3JldEFybl1cbiAgICB9KSk7XG4gIH1cblxuICAvKipcbiAgICogR3JhbnQgY3VzdG9tIHBvbGljeSB0byBhIHJvbGVcbiAgICogQHBhcmFtIHJvbGUgLSBJQU0gUm9sZVxuICAgKiBAcGFyYW0gYWN0aW9ucyAtIEFycmF5IG9mIElBTSBhY3Rpb25zXG4gICAqIEBwYXJhbSByZXNvdXJjZXMgLSBBcnJheSBvZiByZXNvdXJjZSBBUk5zXG4gICAqIEBwYXJhbSBlZmZlY3QgLSBBbGxvdyBvciBEZW55IChkZWZhdWx0OiBBbGxvdylcbiAgICovXG4gIGdyYW50Q3VzdG9tUG9saWN5KFxuICAgIHJvbGU6IGlhbS5Sb2xlLFxuICAgIGFjdGlvbnM6IHN0cmluZ1tdLFxuICAgIHJlc291cmNlczogc3RyaW5nW10sXG4gICAgZWZmZWN0OiBpYW0uRWZmZWN0ID0gaWFtLkVmZmVjdC5BTExPV1xuICApOiB2b2lkIHtcbiAgICByb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdCxcbiAgICAgIGFjdGlvbnMsXG4gICAgICByZXNvdXJjZXNcbiAgICB9KSk7XG4gIH1cblxuICAvKipcbiAgICogR3JhbnQgU1FTIHByb2plY3Qtc3BlY2lmaWMgcXVldWUgcGVybWlzc2lvbnNcbiAgICogQHBhcmFtIHJvbGUgLSBJQU0gUm9sZVxuICAgKiBAcGFyYW0gcGVybWlzc2lvbnMgLSBBcnJheSBvZiBwZXJtaXNzaW9ucyAoJ2dldC11cmwnLCAnc2VuZC1tZXNzYWdlJywgJ3JlY2VpdmUtbWVzc2FnZScsICdkZWxldGUtbWVzc2FnZScsICdnZXQtYXR0cmlidXRlcycpXG4gICAqL1xuICBncmFudFNRU1Byb2plY3RRdWV1ZVBlcm1pc3Npb25zKHJvbGU6IGlhbS5Sb2xlLCBwZXJtaXNzaW9uczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICBjb25zdCBhY3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgaWYgKHBlcm1pc3Npb25zLmluY2x1ZGVzKCdnZXQtdXJsJykpIHtcbiAgICAgIGFjdGlvbnMucHVzaCgnc3FzOkdldFF1ZXVlVXJsJyk7XG4gICAgfVxuICAgIGlmIChwZXJtaXNzaW9ucy5pbmNsdWRlcygnc2VuZC1tZXNzYWdlJykpIHtcbiAgICAgIGFjdGlvbnMucHVzaCgnc3FzOlNlbmRNZXNzYWdlJyk7XG4gICAgfVxuICAgIGlmIChwZXJtaXNzaW9ucy5pbmNsdWRlcygncmVjZWl2ZS1tZXNzYWdlJykpIHtcbiAgICAgIGFjdGlvbnMucHVzaCgnc3FzOlJlY2VpdmVNZXNzYWdlJyk7XG4gICAgfVxuICAgIGlmIChwZXJtaXNzaW9ucy5pbmNsdWRlcygnZGVsZXRlLW1lc3NhZ2UnKSkge1xuICAgICAgYWN0aW9ucy5wdXNoKCdzcXM6RGVsZXRlTWVzc2FnZScpO1xuICAgIH1cbiAgICBpZiAocGVybWlzc2lvbnMuaW5jbHVkZXMoJ2dldC1hdHRyaWJ1dGVzJykpIHtcbiAgICAgIGFjdGlvbnMucHVzaCgnc3FzOkdldFF1ZXVlQXR0cmlidXRlcycpO1xuICAgIH1cblxuICAgIGlmIChhY3Rpb25zLmxlbmd0aCA+IDApIHtcbiAgICAgIHJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpzcXM6JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OmFwcC1tb2RleC1kYXRhLSpgXG4gICAgICAgIF1cbiAgICAgIH0pKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogR3JhbnQgQ29kZUJ1aWxkIHBlcm1pc3Npb25zIHRvIGEgcm9sZVxuICAgKiBAcGFyYW0gcm9sZSAtIElBTSBSb2xlXG4gICAqIEBwYXJhbSBwZXJtaXNzaW9ucyAtIEFycmF5IG9mIHBlcm1pc3Npb25zICgnYmF0Y2gtZ2V0LWJ1aWxkcycsICdiYXRjaC1nZXQtcHJvamVjdHMnKVxuICAgKi9cbiAgZ3JhbnRDb2RlQnVpbGRQZXJtaXNzaW9ucyhyb2xlOiBpYW0uUm9sZSwgcGVybWlzc2lvbnM6IHN0cmluZ1tdKTogdm9pZCB7XG4gICAgY29uc3QgYWN0aW9uczogc3RyaW5nW10gPSBbXTtcblxuICAgIGlmIChwZXJtaXNzaW9ucy5pbmNsdWRlcygnYmF0Y2gtZ2V0LWJ1aWxkcycpKSB7XG4gICAgICBhY3Rpb25zLnB1c2goJ2NvZGVidWlsZDpCYXRjaEdldEJ1aWxkcycpO1xuICAgIH1cbiAgICBpZiAocGVybWlzc2lvbnMuaW5jbHVkZXMoJ2JhdGNoLWdldC1wcm9qZWN0cycpKSB7XG4gICAgICBhY3Rpb25zLnB1c2goJ2NvZGVidWlsZDpCYXRjaEdldFByb2plY3RzJyk7XG4gICAgfVxuXG4gICAgaWYgKGFjdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgcm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnMsXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOmNvZGVidWlsZDoke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06cHJvamVjdC9hcHAtbW9kZXgtKmBcbiAgICAgICAgXVxuICAgICAgfSkpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBHcmFudCBJQU0gUGFzc1JvbGUgcGVybWlzc2lvbiB0byBhIHJvbGVcbiAgICogQHBhcmFtIHJvbGUgLSBJQU0gUm9sZVxuICAgKiBAcGFyYW0gcm9sZVBhdHRlcm4gLSBJQU0gcm9sZSBuYW1lIHBhdHRlcm4gKGUuZy4sICdhcHAtbW9kZXgtKicpXG4gICAqL1xuICBncmFudElBTVBhc3NSb2xlKHJvbGU6IGlhbS5Sb2xlLCByb2xlUGF0dGVybjogc3RyaW5nKTogdm9pZCB7XG4gICAgcm9sZS5hZGRUb1BvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbJ2lhbTpQYXNzUm9sZSddLFxuICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgIGBhcm46YXdzOmlhbTo6JHt0aGlzLmFjY291bnR9OnJvbGUvJHtyb2xlUGF0dGVybn1gXG4gICAgICBdXG4gICAgfSkpO1xuICB9XG59XG4iXX0=