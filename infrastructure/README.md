# App-ModEx Infrastructure

This directory contains the AWS CDK (Cloud Development Kit) infrastructure code for the App-ModEx (Intelligent Applications Modernization Explorer) application. The infrastructure is built using TypeScript and follows AWS best practices for serverless applications.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Key Infrastructure Components](#key-infrastructure-components)
- [DynamoDB Streams Workflow](#dynamodb-streams-workflow)
- [Environment Configuration](#environment-configuration)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Monitoring and Logging](#monitoring-and-logging)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Cost Optimization](#cost-optimization)
- [Disaster Recovery](#disaster-recovery)
- [Contributing](#contributing)
- [Migration Notes](#migration-notes)
- [Support](#support)
- [Learn More](#learn-more)

## Architecture Overview

The App-ModEx infrastructure implements a modern serverless architecture with the following key components:

### Frontend Architecture
- **Static Hosting**: Amazon S3 for reliable, scalable static website hosting
- **Global CDN**: CloudFront distribution for fast worldwide content delivery
- **Security**: AWS WAF protection against common web attacks and DDoS
- **SSL/TLS**: Automatic HTTPS with CloudFront managed certificates

### Backend Architecture
- **API Gateway**: RESTful APIs with Cognito authentication
- **Lambda Functions**: Serverless functions for business logic
- **DynamoDB**: NoSQL database with DynamoDB Streams for real-time processing
- **S3**: File storage for project artifacts and deployments
- **Cognito**: User authentication and authorization
- **CodeBuild**: Project provisioning and infrastructure management
- **EventBridge**: Event-driven architecture for build monitoring

### Event-Driven Provisioning (DynamoDB Streams)
The infrastructure uses DynamoDB Streams to implement an event-driven project provisioning workflow:

```
Project Status Change → DynamoDB Stream → Provisioning Lambda → CodeBuild → EventBridge → Build Monitor Lambda
```

This eliminates the previous SQS-based approach and ensures reliable project lifecycle management.

## Technology Stack

- **Infrastructure as Code**: AWS CDK v2.87.0
- **Language**: TypeScript 4.9.5
- **Runtime**: Node.js 18.x
- **Database**: DynamoDB with Streams
- **Compute**: AWS Lambda
- **Storage**: Amazon S3
- **CDN**: Amazon CloudFront
- **Authentication**: Amazon Cognito
- **API**: Amazon API Gateway
- **Build**: AWS CodeBuild
- **Events**: Amazon EventBridge
- **Monitoring**: CloudWatch Logs

## Project Structure

```
infrastructure/
├── lib/                          # CDK stack definitions
│   ├── app-modex-master-backend-stack.ts    # Main backend infrastructure
│   ├── app-modex-master-frontend-stack.ts   # Frontend hosting infrastructure
│   ├── app-modex-project-stack.ts           # Project-specific resources
│   └── api-helpers.ts                    # API Gateway helper functions
├── lambda/                       # Lambda function source code
│   ├── projects/                 # Project management Lambda
│   ├── provisioning/             # DynamoDB Streams provisioning Lambda
│   ├── project-data/             # Project data management Lambda
│   ├── sharing/                  # Project sharing Lambda
│   ├── user-search/              # User search Lambda
│   └── role-mapper/              # Cognito role mapping Lambda
├── bin/                          # CDK app entry points
├── scripts/                      # Deployment and utility scripts
├── buildspec.yml                 # CodeBuild specification
├── cdk.json                      # CDK configuration
├── package.json                  # Node.js dependencies
└── tsconfig.json                 # TypeScript configuration
```

## Key Infrastructure Components

### 1. DynamoDB Tables

#### Projects Table (`app-modex-projects-{environment}`)
- **Purpose**: Stores project metadata and sharing information
- **Partition Key**: `projectId` (String)
- **Features**: 
  - DynamoDB Streams enabled (NEW_AND_OLD_IMAGES)
  - Global Secondary Indexes for efficient querying
  - Point-in-time recovery (production)
- **Stream Integration**: Triggers provisioning Lambda on status changes

#### Project Data Table (`app-modex-project-data-{environment}`)
- **Purpose**: Stores actual project data (skills, tech radar, portfolio, etc.)
- **Partition Key**: `projectId` (String)
- **Sort Key**: `dataType` (String)
- **Features**: DynamoDB Streams enabled for real-time updates

### 2. Lambda Functions

#### Projects Lambda (`app-modex-projects-{environment}`)
- **Purpose**: Handles project CRUD operations
- **Trigger**: API Gateway
- **Key Features**:
  - Project creation with automatic provisioning trigger
  - Project deletion with status-based workflow
  - User access control and sharing management

#### Provisioning Lambda (`app-modex-provisioning-{environment}`)
- **Purpose**: Handles DynamoDB Stream events for project provisioning
- **Trigger**: DynamoDB Streams
- **Key Features**:
  - Event-driven project provisioning
  - Smart routing based on project status changes
  - CodeBuild job management for deploy/destroy operations

#### Build Monitor Lambda (`app-modex-build-monitor-{environment}`)
- **Purpose**: Monitors CodeBuild job completion
- **Trigger**: EventBridge (CodeBuild state changes)
- **Key Features**:
  - Updates project status on build completion
  - Handles complete project deletion after successful destroy
  - Error handling for failed builds

### 3. API Gateway

#### REST API (`app-modex-api-{environment}`)
- **Authentication**: Cognito User Pools
- **CORS**: Configured for cross-origin requests
- **Endpoints**:
  - `/projects` - Project management
  - `/projects/{projectId}/data` - Project data operations
  - `/projects/{projectId}/share` - Project sharing
  - `/users/search` - User directory search

### 4. Cognito Authentication

#### User Pool (`app-modex-users-{environment}`)
- **Features**:
  - Email-based authentication
  - Password policies enforced
  - Hosted UI for authentication flows
  - Self-signup disabled (admin-managed)

#### Identity Pool (`app-modex-identity-pool-{environment}`)
- **Purpose**: Role-based access control
- **Features**: Authenticated and unauthenticated roles

### 5. CodeBuild Project

#### CDK Deployment Project (`app-modex-cdk-deployment-{environment}`)
- **Purpose**: Deploys and destroys project-specific infrastructure
- **Environment**: Amazon Linux 2
- **Features**:
  - Environment variable injection for project context
  - S3 artifact storage
  - CloudWatch logging

## DynamoDB Streams Workflow

### Project Creation Flow
```
1. User creates project via API
2. Projects Lambda writes to DynamoDB (status: "pending")
3. DynamoDB Stream triggers Provisioning Lambda
4. Provisioning Lambda updates status to "provisioning"
5. Provisioning Lambda starts CodeBuild deploy job
6. CodeBuild completion triggers Build Monitor Lambda
7. Build Monitor Lambda updates status to "active" (success) or "failed" (failure)
```

### Project Deletion Flow
```
1. User deletes project via API
2. Projects Lambda updates DynamoDB (status: "deleting", previousStatus: "active")
3. DynamoDB Stream triggers Provisioning Lambda
4. Provisioning Lambda checks previousStatus:
   - If "failed": Delete record immediately
   - If "active": Start CodeBuild destroy job
5. CodeBuild completion triggers Build Monitor Lambda
6. Build Monitor Lambda deletes project record completely (success) or sets status to "failed"
```

## Environment Configuration

The infrastructure supports multiple environments (dev, staging, prod) with environment-specific configurations:

### Development Environment
- **Removal Policy**: DESTROY (for easy cleanup)
- **Point-in-time Recovery**: Disabled
- **Log Retention**: 1 week
- **Auto-delete Objects**: Enabled

### Production Environment
- **Removal Policy**: RETAIN (data protection)
- **Point-in-time Recovery**: Enabled
- **Log Retention**: Extended
- **Auto-delete Objects**: Disabled

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- AWS CLI configured with appropriate permissions
- AWS CDK CLI (`npm install -g aws-cdk`)
- TypeScript (`npm install -g typescript`)

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Bootstrap CDK (first time only):
   ```bash
   npx cdk bootstrap
   ```

3. Build TypeScript:
   ```bash
   npm run build
   ```

### Deployment

#### Quick Deployment
```bash
# Deploy backend infrastructure
npx cdk deploy App-ModEx-Backend --require-approval never

# Deploy frontend infrastructure
npx cdk deploy App-ModEx-Frontend --require-approval never
```

#### Environment-Specific Deployment
```bash
# Development
npx cdk deploy App-ModEx-Backend -c environment=dev

# Production
npx cdk deploy App-ModEx-Backend -c environment=prod
```

#### Using Deployment Scripts
```bash
# Deploy to development
./scripts/deploy.sh

# Deploy to production
./scripts/deploy.sh -e prod
```

### Useful CDK Commands

- `npm run build`: Compile TypeScript to JavaScript
- `npm run watch`: Watch for changes and compile
- `npx cdk diff`: Compare deployed stack with current state
- `npx cdk synth`: Emit the synthesized CloudFormation template
- `npx cdk deploy`: Deploy this stack to your default AWS account/region
- `npx cdk destroy`: Destroy the deployed stack

## Configuration

### Environment Variables

The Lambda functions use the following environment variables:

```bash
ENVIRONMENT=dev|staging|prod
PROJECTS_TABLE=app-modex-projects-{environment}
PROJECT_DATA_TABLE=app-modex-project-data-{environment}
USER_POOL_ID=cognito-user-pool-id
REGION=aws-region
DEPLOYMENT_BUCKET=deployment-bucket-name
CODEBUILD_PROJECT=codebuild-project-name
IDENTITY_POOL_ID=cognito-identity-pool-id
```

### CDK Context

Configure CDK context in `cdk.json`:

```json
{
  "context": {
    "environment": "dev",
    "@aws-cdk/core:enableStackNameDuplicates": true,
    "@aws-cdk/core:stackRelativeExports": true
  }
}
```

## Monitoring and Logging

### CloudWatch Logs

Each Lambda function has dedicated log groups:
- `/aws/lambda/app-modex-projects-{environment}`
- `/aws/lambda/app-modex-provisioning-{environment}`
- `/aws/lambda/app-modex-build-monitor-{environment}`
- `/aws/lambda/app-modex-project-data-{environment}`
- `/aws/lambda/app-modex-sharing-{environment}`
- `/aws/lambda/app-modex-user-search-{environment}`

### Metrics

Key metrics to monitor:
- Lambda function duration and error rates
- DynamoDB read/write capacity and throttling
- API Gateway request count and latency
- CodeBuild job success/failure rates
- DynamoDB Stream processing metrics

### Alarms

Consider setting up CloudWatch alarms for:
- Lambda function errors
- DynamoDB throttling
- API Gateway 4xx/5xx errors
- CodeBuild job failures

## Security

### IAM Roles and Policies

The infrastructure follows the principle of least privilege:

- **Lambda Execution Roles**: Minimal permissions for each function
- **DynamoDB Access**: Table-specific read/write permissions
- **S3 Access**: Bucket-specific permissions
- **CodeBuild Role**: Permissions for CDK deployments only

### Network Security

- **API Gateway**: CORS configured for specific origins
- **Lambda**: VPC configuration available if needed
- **S3**: Block public access enabled
- **CloudFront**: Security headers configured

### Data Protection

- **DynamoDB**: Encryption at rest with AWS managed keys
- **S3**: Server-side encryption enabled
- **CloudFront**: HTTPS redirect enforced
- **API Gateway**: TLS 1.2 minimum

## Troubleshooting

### Common Issues

1. **CDK Bootstrap Issues**
   ```bash
   # Re-bootstrap if needed
   npx cdk bootstrap --force
   ```

2. **Permission Errors**
   - Verify AWS credentials and permissions
   - Check IAM roles and policies
   - Ensure CDK execution role has necessary permissions

3. **DynamoDB Stream Processing Errors**
   - Check Lambda function logs
   - Verify stream configuration
   - Check for malformed records

4. **CodeBuild Job Failures**
   - Review CodeBuild logs
   - Check environment variables
   - Verify buildspec.yml configuration

### Debug Commands

```bash
# Check stack status
npx cdk list

# View stack outputs
aws cloudformation describe-stacks --stack-name App-ModEx-Backend

# Check Lambda logs
aws logs tail /aws/lambda/app-modex-provisioning-dev --follow

# Monitor DynamoDB streams
aws dynamodb describe-stream --stream-arn <stream-arn>
```

## Cost Optimization

### Serverless Benefits
- **Pay-per-use**: Only pay for actual usage
- **Auto-scaling**: Automatic scaling based on demand
- **No idle costs**: No charges when not in use

### Cost Monitoring
- Use AWS Cost Explorer to track spending
- Set up billing alerts for cost thresholds
- Monitor DynamoDB read/write capacity usage

### Optimization Tips
- Use DynamoDB on-demand billing for variable workloads
- Implement proper Lambda memory sizing
- Use S3 lifecycle policies for artifact cleanup
- Monitor and optimize API Gateway usage

## Disaster Recovery

### Backup Strategy
- **DynamoDB**: Point-in-time recovery enabled (production)
- **S3**: Versioning enabled for critical buckets
- **Code**: Version controlled in Git
- **Infrastructure**: Reproducible via CDK

### Recovery Procedures
1. **Data Recovery**: Use DynamoDB point-in-time recovery
2. **Infrastructure Recovery**: Redeploy using CDK
3. **Application Recovery**: Redeploy frontend from Git

## Contributing

### Development Workflow
1. Create feature branch from main
2. Make infrastructure changes
3. Test in development environment
4. Update documentation
5. Submit pull request

### Code Standards
- Use TypeScript for type safety
- Follow AWS CDK best practices
- Implement proper error handling
- Add comprehensive logging
- Write unit tests for complex logic

### Testing
```bash
# Run tests
npm test

# Lint code
npm run lint

# Type check
npm run type-check
```

## Migration Notes

### DynamoDB Streams Migration (July 2025)

The infrastructure was migrated from SQS-based provisioning to DynamoDB Streams:

#### Removed Components
- SQS provisioning queue
- SQS dead letter queue
- SQS event source mappings

#### Added Components
- DynamoDB Streams on projects table
- Enhanced Build Monitor Lambda
- Stream event source mapping

#### Benefits
- Eliminated stuck project states
- Improved reliability and performance
- Simplified architecture
- Better error handling

## Support

For infrastructure-related issues:
1. Check CloudWatch logs for error details
2. Review AWS service health dashboard
3. Consult AWS documentation
4. Contact AWS support if needed

## Learn More

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [DynamoDB Streams](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html)
- [API Gateway Documentation](https://docs.aws.amazon.com/apigateway/)
- [Main Project README](../README.md)
- [UI Documentation](../app-modex-ui/README.md)
