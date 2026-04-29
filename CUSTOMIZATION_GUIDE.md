# App-ModEx Technical Configuration Guide

**Version 1.0 | December 2025**

## Document Purpose

This guide identifies all customization points in the App-ModEx solution and provides technical instructions for implementing them.

**Target Audience**: DevOps Engineers, Cloud Architects, System Administrators

### Understanding Cost Indicators

Throughout this guide, you'll see cost impact boxes like this:

> **💰 COST IMPACT: YES/NO - Brief description**
> 
> **Additional Cost:** Estimated monthly cost
> 
> **How to Calculate Your Cost:**
> Step-by-step instructions to calculate costs for your specific usage

**Important Notes:**
- Cost estimates are approximate and based on typical usage patterns
- Always use the AWS Pricing Calculator links provided to get accurate costs for your specific requirements
- Monitor your actual costs using AWS Cost Explorer after implementation
- Costs vary by AWS region - prices shown are typically for us-east-1

---

## Table of Contents

### Core Infrastructure
1. [Custom Domain Configuration](#custom-domain-configuration)
2. [Authentication and Authorization](#authentication-and-authorization)
3. [API Gateway Configuration](#api-gateway-configuration)
4. [Bedrock AI Configuration](#bedrock-ai-configuration)
5. [Database Configuration](#database-configuration)
6. [Storage Configuration](#storage-configuration)
7. [Monitoring and Logging](#monitoring-and-logging)
8. [Security Configuration](#security-configuration)
9. [Regional Deployment](#regional-deployment)
10. [Environment Variables](#environment-variables)
11. [CDK Version Management](#cdk-version-management)
12. [CI/CD Pipeline Setup](#cicd-pipeline-setup)

### Application Customization
13. [UI Branding and Theming](#ui-branding-and-theming)
14. [Business Rules and Scoring Algorithms](#business-rules-and-scoring-algorithms)
15. [Data Schema and Validation Rules](#data-schema-and-validation-rules)
16. [Export Templates and Formats](#export-templates-and-formats)
17. [Notification and Alerting](#notification-and-alerting)
18. [Data Retention and Archival Policies](#data-retention-and-archival-policies)
19. [Internationalization and Localization](#internationalization-and-localization)
20. [Integration Webhooks and APIs](#integration-webhooks-and-apis)
21. [Custom Analytics and Dashboards](#custom-analytics-and-dashboards)
22. [Access Control and Permissions](#access-control-and-permissions)
23. [Performance Tuning](#performance-tuning)

### Reference
24. [Cost Optimization](#cost-optimization)
25. [Backup and Disaster Recovery](#backup-and-disaster-recovery)
26. [Quick Reference](#quick-reference)
27. [Troubleshooting](#troubleshooting)
28. [Support and Resources](#support-and-resources)

---

## Custom Domain Configuration

> **💰 COST IMPACT: YES - Additional charges apply**
> 
> **New Costs:**
> - Route 53 Hosted Zone: ~$0.50/month
> - Domain registration: $12-99/year (one-time + annual renewal)
> - Route 53 Health Checks (optional): $0.50/month each
> 
> **How to Calculate Your Cost:**
> 1. Go to: https://calculator.aws/#/addService/Route53
> 2. Enter: 1 hosted zone
> 3. Enter: Expected DNS queries per month
> 4. Add: Number of health checks (if using failover)
> 5. Add: Domain registration fee from your registrar
> 
> **No Additional Cost:** ACM certificates are FREE when used with CloudFront

By default, the frontend is deployed to CloudFront without a custom domain. This section explains how to configure a custom domain (e.g., `app-modex.yourcompany.com`).

### Step 1: Register or Prepare Your Domain

**Option A: Using Route 53**
```bash
# If you don't have a domain, register one in Route 53
aws route53domains register-domain \
  --domain-name yourcompany.com \
  --duration-in-years 1 \
  --admin-contact file://contact.json \
  --registrant-contact file://contact.json \
  --tech-contact file://contact.json \
  --profile app-modex-prod
```

**Option B: Using External Registrar**
- Register domain with your preferred registrar (GoDaddy, Namecheap, etc.)
- Create a hosted zone in Route 53
- Update nameservers at your registrar to point to Route 53

### Step 2: Create ACM Certificate (us-east-1 Required)

CloudFront requires certificates in us-east-1 region.

```bash
# Request certificate
aws acm request-certificate \
  --domain-name app-modex.yourcompany.com \
  --validation-method DNS \
  --region us-east-1 \
  --profile app-modex-prod

# Note the CertificateArn from output
```

### Step 3: Validate Certificate

```bash
# Get validation records
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT-ID \
  --region us-east-1 \
  --profile app-modex-prod

# Add CNAME records to Route 53 for validation
# Or use AWS Console for easier validation
```

### Step 4: Modify Frontend Stack

Edit `infrastructure/lib/app-modex-frontend-stack.ts`:

```typescript
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';

export interface AppModExFrontendStackProps extends cdk.StackProps {
  environment: string;
  // Add these new properties
  domainName?: string;
  certificateArn?: string;
  hostedZoneId?: string;
  hostedZoneName?: string;
}

export class AppModExFrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppModExFrontendStackProps) {
    super(scope, id, props);

    const { environment, domainName, certificateArn, hostedZoneId, hostedZoneName } = props;

    // ... existing S3 bucket code ...

    // Import certificate if provided
    let certificate: acm.ICertificate | undefined;
    if (certificateArn) {
      certificate = acm.Certificate.fromCertificateArn(
        this,
        'Certificate',
        certificateArn
      );
    }

    // Create CloudFront distribution with custom domain
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(this.bucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      // Add custom domain configuration
      domainNames: domainName ? [domainName] : undefined,
      certificate: certificate,
      // ... rest of distribution config ...
    });

    // Create Route 53 record if hosted zone provided
    if (hostedZoneId && hostedZoneName && domainName) {
      const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
        this,
        'HostedZone',
        {
          hostedZoneId,
          zoneName: hostedZoneName,
        }
      );

      new route53.ARecord(this, 'AliasRecord', {
        zone: hostedZone,
        recordName: domainName,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.CloudFrontTarget(this.distribution)
        ),
      });
    }

    // Output the custom domain URL
    new cdk.CfnOutput(this, 'CustomDomainUrl', {
      value: domainName ? `https://${domainName}` : 'No custom domain configured',
      description: 'Custom domain URL',
    });
  }
}
```

### Step 5: Update CDK App Configuration

Edit `infrastructure/bin/app-modex-infrastructure.ts`:

```typescript
// Add custom domain configuration
const customDomainConfig = {
  domainName: 'app-modex.yourcompany.com',
  certificateArn: 'arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT-ID',
  hostedZoneId: 'Z1234567890ABC',
  hostedZoneName: 'yourcompany.com',
};

// Create the frontend stack with custom domain
new AppModExFrontendStack(app, `AppModEx-Frontend`, {
  environment,
  description: 'App-ModEx Frontend Stack',
  env: {
    account: account,
    region: 'us-east-1',
  },
  // Add custom domain props
  ...customDomainConfig,
  tags: {
    Project: 'App-ModEx',
    Environment: environment,
    Component: 'Frontend'
  }
});
```

### Step 6: Update CORS Configuration

With a custom domain, you need to update API Gateway CORS settings.

Edit `infrastructure/lib/app-modex-backend-stack.ts`:

```typescript
// Update CORS configuration to include custom domain
defaultCorsPreflightOptions: {
  allowOrigins: [
    'http://localhost:3000',
    'https://app-modex.yourcompany.com',  // Add your custom domain
    // Keep CloudFront domain as fallback
    `https://${cloudFrontDomain}`,
  ],
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
```

### Step 7: Update Cognito Callback URLs

Edit `infrastructure/lib/app-modex-backend-stack.ts`:

```typescript
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
      'https://app-modex.yourcompany.com/',           // Add custom domain
      'https://app-modex.yourcompany.com/callback',   // Add custom domain
      `https://${this.region}.console.aws.amazon.com/cognito/oauth2/success`,
    ],
    logoutUrls: [
      'http://localhost:3000/',
      'http://localhost:3000/logout',
      'https://app-modex.yourcompany.com/',           // Add custom domain
      'https://app-modex.yourcompany.com/logout',     // Add custom domain
      `https://${this.region}.console.aws.amazon.com/cognito/oauth2/logout`,
    ],
  },
  // ... rest of config
});
```

### Step 8: Deploy with Custom Domain

```bash
# Deploy backend first (updates CORS and Cognito)
cd infrastructure
./scripts/deploy-backend.sh --profile app-modex-prod --region us-west-2

# Deploy frontend with custom domain
./scripts/deploy-frontend.sh --profile app-modex-prod

# Verify deployment
aws cloudfront list-distributions \
  --query "DistributionList.Items[?Aliases.Items[?contains(@, 'app-modex.yourcompany.com')]].{Id:Id,Domain:DomainName,Aliases:Aliases.Items}" \
  --profile app-modex-prod
```

### Step 9: Update Frontend Environment Variables

After deployment, update `app-modex-ui/.env`:

```bash
REACT_APP_API_URL=https://your-api-id.execute-api.us-west-2.amazonaws.com/dev
REACT_APP_USER_POOL_ID=us-west-2_XXXXXXXXX
REACT_APP_USER_POOL_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
REACT_APP_AWS_REGION=us-west-2
REACT_APP_S3_BUCKET=app-modex-data-ACCOUNT-ID
REACT_APP_CLOUDFRONT_URL=https://app-modex.yourcompany.com  # Custom domain
```

### Step 10: Verify Custom Domain

```bash
# Test DNS resolution
nslookup app-modex.yourcompany.com

# Test HTTPS access
curl -I https://app-modex.yourcompany.com

# Verify certificate
openssl s_client -connect app-modex.yourcompany.com:443 -servername app-modex.yourcompany.com
```

### Troubleshooting Custom Domain

**Issue: Certificate validation stuck**
- Ensure CNAME records are added to Route 53
- Wait up to 30 minutes for DNS propagation
- Verify nameservers are correctly configured

**Issue: CloudFront returns 403 Forbidden**
- Check S3 bucket policy allows CloudFront OAI
- Verify index.html exists in bucket
- Check CloudFront distribution status is "Deployed"

**Issue: CORS errors with custom domain**
- Verify custom domain is in API Gateway CORS allowOrigins
- Check Cognito callback URLs include custom domain
- Clear browser cache and cookies

**Issue: DNS not resolving**
- Verify Route 53 A record points to CloudFront
- Check hosted zone nameservers match registrar
- Wait for DNS propagation (up to 48 hours)

---

## Authentication and Authorization

The default implementation uses Amazon Cognito User Pools. This section covers customization options including integration with external identity providers like Okta, Azure AD, or custom SAML/OIDC providers.

### Default Cognito Configuration

> **💰 COST IMPACT: NO - Free tier covers most use cases**
> 
> **Current Cost:** FREE for first 50,000 monthly active users (MAUs)
> 
> **How to Calculate Your Cost:**
> 1. Count your expected monthly active users
> 2. If > 50,000: Go to https://calculator.aws/#/addService/Cognito
> 3. Enter: Number of MAUs
> 4. Select: Advanced security features (if needed)
> 5. Calculate: (MAUs - 50,000) × $0.0055 per MAU

**Current Setup:**
- User Pool with email/password authentication
- Self-signup disabled (admin creates users)
- Email verification required
- Password policy: 8+ chars, uppercase, lowercase, numbers, symbols
- MFA: Optional (can be enabled)

### Option 1: Enable Social Identity Providers

> **💰 COST IMPACT: NO - No additional AWS costs**
> 
> **AWS Cost:** Same as base Cognito (FREE for < 50,000 MAUs)
> **Third-party Cost:** FREE (Google and Facebook don't charge for authentication)

#### Google Authentication

**Step 1: Create Google OAuth Credentials**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
   - `https://app-modex.auth.us-west-2.amazoncognito.com/oauth2/idpresponse`
   - `https://app-modex.yourcompany.com/callback`

**Step 2: Configure in CDK**

Edit `infrastructure/lib/app-modex-backend-stack.ts`:

```typescript
// Add Google identity provider
const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'Google', {
  userPool: this.userPool,
  clientId: 'YOUR_GOOGLE_CLIENT_ID',
  clientSecret: 'YOUR_GOOGLE_CLIENT_SECRET',
  scopes: ['profile', 'email', 'openid'],
  attributeMapping: {
    email: cognito.ProviderAttribute.GOOGLE_EMAIL,
    givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
    familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
    profilePicture: cognito.ProviderAttribute.GOOGLE_PICTURE,
  },
});

// Update user pool client to support Google
this.userPoolClient = this.userPool.addClient('WebClient', {
  // ... existing config ...
  supportedIdentityProviders: [
    cognito.UserPoolClientIdentityProvider.COGNITO,
    cognito.UserPoolClientIdentityProvider.GOOGLE,  // Add Google
  ],
});

// Ensure client depends on provider
this.userPoolClient.node.addDependency(googleProvider);
```

#### Facebook Authentication

```typescript
const facebookProvider = new cognito.UserPoolIdentityProviderFacebook(this, 'Facebook', {
  userPool: this.userPool,
  clientId: 'YOUR_FACEBOOK_APP_ID',
  clientSecret: 'YOUR_FACEBOOK_APP_SECRET',
  scopes: ['public_profile', 'email'],
  attributeMapping: {
    email: cognito.ProviderAttribute.FACEBOOK_EMAIL,
    givenName: cognito.ProviderAttribute.FACEBOOK_NAME,
  },
});
```

### Option 2: Integrate with Okta (SAML)

> **💰 COST IMPACT: YES - Significant external subscription costs**
> 
> **AWS Cost:** Same as base Cognito (FREE for < 50,000 MAUs)
> **Okta Cost:** $2-15 per user/month (external subscription required)
> 
> **How to Calculate Your Cost:**
> 1. Go to: https://www.okta.com/pricing/
> 2. Select: Workforce Identity or Customer Identity
> 3. Multiply: Number of users × price per user
> 4. Example: 100 users × $5/user = $500/month

**Step 1: Configure Okta Application**

1. Log in to Okta Admin Console
2. Go to Applications → Create App Integration
3. Select "SAML 2.0"
4. Configure:
   - **Single sign on URL**: `https://app-modex.auth.us-west-2.amazoncognito.com/saml2/idpresponse`
   - **Audience URI**: `urn:amazon:cognito:sp:us-west-2_XXXXXXXXX`
   - **Name ID format**: EmailAddress
   - **Application username**: Email

5. Download metadata XML file

**Step 2: Configure Cognito SAML Provider**

```bash
# Upload Okta metadata to S3
aws s3 cp okta-metadata.xml s3://app-modex-config/okta-metadata.xml --profile app-modex-prod

# Get metadata URL
METADATA_URL="https://app-modex-config.s3.amazonaws.com/okta-metadata.xml"
```

Edit `infrastructure/lib/app-modex-backend-stack.ts`:

```typescript
// Add SAML identity provider for Okta
const oktaProvider = new cognito.UserPoolIdentityProviderSaml(this, 'Okta', {
  userPool: this.userPool,
  name: 'Okta',
  metadata: cognito.UserPoolIdentityProviderSamlMetadata.url(
    'https://dev-12345678.okta.com/app/exk1234567890/sso/saml/metadata'
  ),
  attributeMapping: {
    email: cognito.ProviderAttribute.other('http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'),
    givenName: cognito.ProviderAttribute.other('http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'),
    familyName: cognito.ProviderAttribute.other('http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'),
  },
});

// Update user pool client
this.userPoolClient = this.userPool.addClient('WebClient', {
  // ... existing config ...
  supportedIdentityProviders: [
    cognito.UserPoolClientIdentityProvider.COGNITO,
    cognito.UserPoolClientIdentityProvider.custom('Okta'),  // Add Okta
  ],
});

this.userPoolClient.node.addDependency(oktaProvider);
```

**Step 3: Update Frontend for Okta**

Edit `app-modex-ui/src/config/amplifyConfig.js`:

```javascript
const config = {
  Auth: {
    Cognito: {
      userPoolId: process.env.REACT_APP_USER_POOL_ID,
      userPoolClientId: process.env.REACT_APP_USER_POOL_CLIENT_ID,
      region: process.env.REACT_APP_AWS_REGION,
      loginWith: {
        oauth: {
          domain: 'app-modex.auth.us-west-2.amazoncognito.com',
          scopes: ['openid', 'email', 'profile'],
          redirectSignIn: ['https://app-modex.yourcompany.com/'],
          redirectSignOut: ['https://app-modex.yourcompany.com/logout'],
          responseType: 'code',
          providers: ['Okta'],  // Add Okta provider
        },
      },
    },
  },
  // ... rest of config
};
```

### Option 3: Integrate with Azure AD (OIDC)

> **💰 COST IMPACT: YES - Significant external subscription costs**
> 
> **AWS Cost:** Same as base Cognito (FREE for < 50,000 MAUs)
> **Azure AD Cost:** FREE tier (up to 50,000 MAUs) or $6-9 per user/month for Premium
> 
> **How to Calculate Your Cost:**
> 1. Go to: https://azure.microsoft.com/en-us/pricing/details/active-directory/
> 2. Select: Free, Premium P1, or Premium P2
> 3. Multiply: Number of users × price per user (if Premium)
> 4. Example: 100 users × $6/user (P1) = $600/month

**Step 1: Register Application in Azure AD**

1. Go to Azure Portal → Azure Active Directory
2. App registrations → New registration
3. Configure:
   - **Name**: App-ModEx
   - **Redirect URI**: `https://app-modex.auth.us-west-2.amazoncognito.com/oauth2/idpresponse`
4. Note the Application (client) ID and Directory (tenant) ID
5. Create a client secret

**Step 2: Configure Cognito OIDC Provider**

Edit `infrastructure/lib/app-modex-backend-stack.ts`:

```typescript
// Add Azure AD OIDC provider
const azureAdProvider = new cognito.UserPoolIdentityProviderOidc(this, 'AzureAD', {
  userPool: this.userPool,
  name: 'AzureAD',
  clientId: 'YOUR_AZURE_CLIENT_ID',
  clientSecret: 'YOUR_AZURE_CLIENT_SECRET',
  issuerUrl: 'https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0',
  scopes: ['openid', 'email', 'profile'],
  attributeMapping: {
    email: cognito.ProviderAttribute.other('email'),
    givenName: cognito.ProviderAttribute.other('given_name'),
    familyName: cognito.ProviderAttribute.other('family_name'),
  },
  attributeRequestMethod: cognito.OidcAttributeRequestMethod.GET,
});

// Update user pool client
this.userPoolClient = this.userPool.addClient('WebClient', {
  // ... existing config ...
  supportedIdentityProviders: [
    cognito.UserPoolClientIdentityProvider.COGNITO,
    cognito.UserPoolClientIdentityProvider.custom('AzureAD'),
  ],
});

this.userPoolClient.node.addDependency(azureAdProvider);
```

### Option 4: Custom Authentication with Lambda Triggers

> **💰 COST IMPACT: NO - Negligible costs**
> 
> **Additional Cost:** ~$0.01/month for typical usage
> 
> **How to Calculate Your Cost:**
> 1. Count: Expected authentications per month
> 2. Go to: https://calculator.aws/#/addService/Lambda
> 3. Enter: Number of invocations
> 4. Enter: 512 MB memory, 100ms average duration
> 5. Formula: (invocations / 1,000,000) × $0.20

For advanced authentication logic, use Cognito Lambda triggers.

**Step 1: Create Pre-Authentication Lambda**

Create `infrastructure/lambda/auth/pre-authentication.js`:

```javascript
exports.handler = async (event) => {
  console.log('Pre-authentication trigger:', JSON.stringify(event, null, 2));
  
  // Custom authentication logic
  const { userAttributes } = event.request;
  
  // Example: Block users from specific domains
  if (userAttributes.email.endsWith('@blocked-domain.com')) {
    throw new Error('Users from this domain are not allowed');
  }
  
  // Example: Require specific attribute
  if (!userAttributes['custom:department']) {
    throw new Error('Department attribute is required');
  }
  
  // Allow authentication to proceed
  return event;
};
```

**Step 2: Add Lambda Trigger to User Pool**

Edit `infrastructure/lib/app-modex-backend-stack.ts`:

```typescript
// Create pre-authentication Lambda
const preAuthLambda = new lambda.Function(this, 'PreAuthFunction', {
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: 'pre-authentication.handler',
  code: lambda.Code.fromAsset('lambda/auth'),
  timeout: Duration.seconds(10),
  environment: {
    USER_POOL_ID: this.userPool.userPoolId,
  },
});

// Grant Lambda permission to be invoked by Cognito
preAuthLambda.addPermission('CognitoInvoke', {
  principal: new iam.ServicePrincipal('cognito-idp.amazonaws.com'),
  sourceArn: this.userPool.userPoolArn,
});

// Add trigger to user pool
this.userPool.addTrigger(
  cognito.UserPoolOperation.PRE_AUTHENTICATION,
  preAuthLambda
);
```

**Available Triggers:**
- `PRE_SIGN_UP`: Validate and modify user attributes before signup
- `POST_CONFIRMATION`: Actions after user confirms email
- `PRE_AUTHENTICATION`: Custom authentication logic
- `POST_AUTHENTICATION`: Actions after successful authentication
- `PRE_TOKEN_GENERATION`: Modify claims in ID token
- `CUSTOM_MESSAGE`: Customize email/SMS messages
- `USER_MIGRATION`: Migrate users from legacy system

### Option 5: Completely Replace Cognito

If you need to completely replace Cognito with a custom authentication system:

**Step 1: Remove Cognito from Backend Stack**

Edit `infrastructure/lib/app-modex-backend-stack.ts`:

```typescript
// Comment out or remove Cognito resources
/*
this.userPool = new cognito.UserPool(this, 'UserPool', {
  // ... Cognito config
});
*/

// Create custom authentication Lambda
const customAuthLambda = new lambda.Function(this, 'CustomAuthFunction', {
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda/custom-auth'),
  environment: {
    JWT_SECRET: 'YOUR_JWT_SECRET',  // Use Secrets Manager in production
    TOKEN_EXPIRY: '3600',
  },
});

// Create Lambda authorizer for API Gateway
const authorizer = new apigateway.TokenAuthorizer(this, 'CustomAuthorizer', {
  handler: customAuthLambda,
  identitySource: 'method.request.header.Authorization',
  resultsCacheTtl: Duration.minutes(5),
});

// Apply authorizer to API methods
const protectedResource = this.api.root.addResource('protected');
protectedResource.addMethod('GET', integration, {
  authorizer: authorizer,
  authorizationType: apigateway.AuthorizationType.CUSTOM,
});
```

**Step 2: Implement Custom Auth Lambda**

Create `infrastructure/lambda/custom-auth/index.js`:

```javascript
const jwt = require('jsonwebtoken');

exports.handler = async (event) => {
  const token = event.authorizationToken.replace('Bearer ', '');
  
  try {
    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Generate IAM policy
    return generatePolicy(decoded.userId, 'Allow', event.methodArn, decoded);
  } catch (error) {
    console.error('Token verification failed:', error);
    throw new Error('Unauthorized');
  }
};

function generatePolicy(principalId, effect, resource, context) {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{
        Action: 'execute-api:Invoke',
        Effect: effect,
        Resource: resource,
      }],
    },
    context,  // Additional context passed to Lambda functions
  };
}
```

**Step 3: Update Frontend Authentication**

Replace Amplify Auth with custom implementation in `app-modex-ui/src/services/authService.js`:

```javascript
export const customAuthService = {
  async signIn(username, password) {
    const response = await fetch('https://your-auth-api.com/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    
    const { token, user } = await response.json();
    localStorage.setItem('authToken', token);
    localStorage.setItem('user', JSON.stringify(user));
    
    return { token, user };
  },
  
  async signOut() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  },
  
  async getCurrentUser() {
    const token = localStorage.getItem('authToken');
    if (!token) return null;
    
    // Verify token is still valid
    const response = await fetch('https://your-auth-api.com/verify', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (response.ok) {
      return JSON.parse(localStorage.getItem('user'));
    }
    
    return null;
  },
  
  getAuthToken() {
    return localStorage.getItem('authToken');
  },
};
```

### Testing Authentication Changes

```bash
# Test Cognito configuration
aws cognito-idp describe-user-pool \
  --user-pool-id us-west-2_XXXXXXXXX \
  --profile app-modex-prod

# Test identity providers
aws cognito-idp list-identity-providers \
  --user-pool-id us-west-2_XXXXXXXXX \
  --profile app-modex-prod

# Test user pool client
aws cognito-idp describe-user-pool-client \
  --user-pool-id us-west-2_XXXXXXXXX \
  --client-id XXXXXXXXXXXXXXXXXXXXXXXXXX \
  --profile app-modex-prod
```

---

## Bedrock AI Configuration

> **💰 COST IMPACT: YES - AI model usage charges apply**
> 
> **New Costs:**
> - Claude 3.7 Sonnet: ~$3.00 per 1M input tokens, ~$15.00 per 1M output tokens
> - Nova Lite: ~$0.06 per 1M input tokens, ~$0.24 per 1M output tokens
> - Model invocation charges per request
> 
> **How to Calculate Your Cost:**
> 1. Go to: https://aws.amazon.com/bedrock/pricing/
> 2. Estimate tokens per analysis (pilot identification: ~2000 tokens, skill scoring: ~1000 tokens)
> 3. Multiply by expected monthly usage
> 4. Add model invocation costs
> 
> **Cost Optimization:** Nova Lite is 50x cheaper than Claude for simple tasks

App-ModEx uses direct Bedrock model invocation for AI-enhanced analysis. This section explains how to configure and customize the models and prompts.

### Architecture Overview

The Prompt Templates stack (`app-modex-prompt-templates-stack.ts`) deploys:

1. **DynamoDB Table**: `app-modex-prompt-templates` - Stores prompts with versioning
2. **Prompt Service**: `promptService.js` - Retrieves prompts with 1-hour caching
3. **Seed Lambda**: Populates initial prompts for all three use cases
4. **Direct Model Invocation**: Uses `BedrockRuntimeClient` and `InvokeModelCommand`

### Models and Use Cases

**Current Configuration:**
- **Normalization** (Nova Lite): Standardizes technology names
- **Pilot Analysis** (Claude 3.7 Sonnet): Evaluates pilot candidates with context
- **Skill Importance** (Nova Lite): Scores skill importance based on team weights

### Prompt Templates Configuration

**File Location**: `infrastructure/lib/app-modex-prompt-templates-stack.ts`

```typescript
// Deploy Prompt Templates stack first (required for backend)
./infrastructure/scripts/deploy-prompt-templates.sh --region us-west-2 --environment prod
```

### Prompt Customization

**File Location**: `infrastructure/lambda/global/seed-prompts/index.js`

Each prompt has system and user templates that can be customized for your organization:

```typescript
// Example: Customize normalization prompt for your tech stack
exports.NORMALIZATION_PROMPT = {
  systemPrompt: `You are a technology normalization specialist for [YOUR COMPANY NAME].
Focus on these technology categories:
- Programming Languages: Java, Python, JavaScript, C#, Go
- Frameworks: Spring Boot, React, Angular, .NET Core
- Databases: PostgreSQL, MySQL, MongoDB, Oracle
- Cloud: AWS, Azure, GCP services

Normalization rules:
1. Use official product names
2. Include version numbers when provided
3. Preserve vendor names
4. Use consistent casing
5. Expand abbreviations

Custom mappings for your organization:
- "WebLogic" → "Oracle WebLogic Server"
- "DB2" → "IBM Db2"
- "MQ" → "IBM MQ"
...`,
  userPromptTemplate: `Normalize these technologies: \${technologies}`
};
```

**2. Pilot Analysis Prompt**:
```typescript
exports.PILOT_ANALYSIS_PROMPT = {
  systemPrompt: `You are an expert application modernization consultant analyzing applications for pilot candidate selection.

Your role is to:
1. Evaluate applications based on business value, technical feasibility, and strategic alignment
2. Consider team skills, technology vision, and application similarities
3. Provide actionable recommendations with clear rationale
4. Identify risks and mitigation strategies

Context you will receive:
- Application details and algorithmic scores
- Similar applications and migration patterns
- Team skills inventory and capability gaps
- Technology vision and strategic goals
- Team capacity and resource availability

Provide:
- Enhanced score (0-100) with adjustment rationale
- Confidence level (0-100) in your assessment
- Natural language insights and recommendations
- Specific next steps and considerations
...`,
  userPromptTemplate: `Analyze application: \${applicationName}...`
};
```

**3. Skill Importance Prompt**:
```typescript
exports.SKILL_IMPORTANCE_PROMPT = {
  systemPrompt: `You are a skill assessment specialist analyzing skill importance for modernization initiatives.

Your role is to:
1. Analyze team category weights and strategic priorities
2. Generate importance scores (0-100) for each skill
3. Consider modernization goals and technology direction
4. Provide confidence levels and rationale

Scoring guidelines:
- 80-100: Critical skills essential for success
- 60-79: Important skills with significant impact
- 40-59: Moderate skills useful but not critical
- 20-39: Low importance skills
- 0-19: Very low importance skills

Provide:
- Importance score (0-100) for each skill
- Confidence level (0-100) in assessment
- Rationale explaining the score
...`,
  userPromptTemplate: `Score skills for team: \${teamName}...`
};
```

### Model Selection and Configuration

**Current Models:**
- **Normalization**: `amazon.nova-lite-v1:0` (cost-optimized)
- **Pilot Analysis**: `anthropic.claude-3-7-sonnet-20250219-v1:0` (high-quality analysis)
- **Skill Importance**: `amazon.nova-lite-v1:0` (cost-optimized)

**To Change Models:**

Edit the Lambda functions that invoke Bedrock:
- `infrastructure/lambda/global/bedrock-normalizer/index.js`
- `infrastructure/lambda/global/pilot-ai-enhance-scores/index.js`
- `infrastructure/lambda/project-specific/skill-importance-scorer/index.js`

```javascript
// Change the MODEL_ID constant
const MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0'; // Cheaper alternative
// or
const MODEL_ID = 'anthropic.claude-3-opus-20240229-v1:0';  // Higher quality
```

**Available Models:**
- `amazon.nova-lite-v1:0` - Fast, cost-effective (current default for normalization and skill importance)
- `amazon.nova-pro-v1:0` - Balanced performance and cost
- `amazon.titan-text-premier-v1:0` - AWS Titan, good for structured tasks
- `anthropic.claude-3-haiku-20240307-v1:0` - Fast, affordable Claude
- `anthropic.claude-3-sonnet-20240229-v1:0` - Balanced Claude
- `anthropic.claude-3-7-sonnet-20250219-v1:0` - Latest Claude (current default for pilot analysis)
- `anthropic.claude-3-opus-20240229-v1:0` - Highest quality Claude and refine agent instructions

**Debug Commands:**
```bash
# Check agent status
aws bedrock-agent get-agent --agent-id <agent-id> --region us-west-2

# Test agent invocation
aws bedrock-agent-runtime invoke-agent \
  --agent-id <agent-id> \
  --agent-alias-id PROD \
  --session-id test-session \
  --input-text "Test normalization: java spring boot"
```

---

## Bedrock Guardrails Customization

> **💰 COST IMPACT: NO - Guardrails included in base Bedrock costs**
> 
> **Current Cost:** Included in model invocation pricing
> **Additional Cost:** None - Guardrails are free
> 
> **Note:** Guardrails add minimal latency (~50-100ms) but no additional charges

Amazon Bedrock Guardrails provide content filtering and safety controls for all AI model outputs. The default configuration can be customized for your organization's specific requirements.

### Current Guardrails Configuration

**Guardrail Name**: `app-modex-content-filter`

**Location**: `infrastructure/lib/app-modex-prompt-templates-stack.ts`

### Customizing Content Policy Filters

Content filters detect and block harmful content across six categories. You can adjust the strength for each category.

**Available Strengths**: NONE, LOW, MEDIUM, HIGH

**Current Configuration**:

```typescript
contentPolicyConfig: {
  filtersConfig: [
    { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
    { type: 'VIOLENCE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
    { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
    { type: 'INSULTS', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' },
    { type: 'MISCONDUCT', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' },
    { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
  ],
}
```

**Customization Example - Stricter Filtering**:

```typescript
contentPolicyConfig: {
  filtersConfig: [
    { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
    { type: 'VIOLENCE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
    { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
    { type: 'INSULTS', inputStrength: 'HIGH', outputStrength: 'HIGH' },      // Increased
    { type: 'MISCONDUCT', inputStrength: 'HIGH', outputStrength: 'HIGH' },   // Increased
    { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
  ],
}
```

**Customization Example - More Permissive**:

```typescript
contentPolicyConfig: {
  filtersConfig: [
    { type: 'SEXUAL', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' },   // Decreased
    { type: 'VIOLENCE', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' }, // Decreased
    { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
    { type: 'INSULTS', inputStrength: 'LOW', outputStrength: 'LOW' },        // Decreased
    { type: 'MISCONDUCT', inputStrength: 'LOW', outputStrength: 'LOW' },     // Decreased
    { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
  ],
}
```

### Customizing PII Detection and Anonymization

Control how personally identifiable information (PII) is handled in inputs and outputs.

**Available Actions**: BLOCK, ANONYMIZE

**Current Configuration**:

```typescript
sensitiveInformationPolicyConfig: {
  piiEntitiesConfig: [
    { type: 'EMAIL', action: 'ANONYMIZE' },
    { type: 'PHONE', action: 'ANONYMIZE' },
    { type: 'NAME', action: 'ANONYMIZE' },
    { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'BLOCK' },
    { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
    { type: 'AWS_ACCESS_KEY', action: 'BLOCK' },
    { type: 'AWS_SECRET_KEY', action: 'BLOCK' },
  ],
}
```

**Additional PII Types You Can Add**:

```typescript
sensitiveInformationPolicyConfig: {
  piiEntitiesConfig: [
    // Existing configuration...
    { type: 'ADDRESS', action: 'ANONYMIZE' },
    { type: 'AGE', action: 'ANONYMIZE' },
    { type: 'DATE_OF_BIRTH', action: 'ANONYMIZE' },
    { type: 'DRIVER_ID', action: 'BLOCK' },
    { type: 'IP_ADDRESS', action: 'ANONYMIZE' },
    { type: 'LICENSE_PLATE', action: 'ANONYMIZE' },
    { type: 'MAC_ADDRESS', action: 'ANONYMIZE' },
    { type: 'PASSPORT_NUMBER', action: 'BLOCK' },
    { type: 'PASSWORD', action: 'BLOCK' },
    { type: 'USERNAME', action: 'ANONYMIZE' },
    { type: 'VEHICLE_IDENTIFICATION_NUMBER', action: 'ANONYMIZE' },
    { type: 'URL', action: 'ANONYMIZE' },
  ],
}
```

**Customization for GDPR Compliance**:

```typescript
sensitiveInformationPolicyConfig: {
  piiEntitiesConfig: [
    // Block all PII for strict GDPR compliance
    { type: 'EMAIL', action: 'BLOCK' },
    { type: 'PHONE', action: 'BLOCK' },
    { type: 'NAME', action: 'BLOCK' },
    { type: 'ADDRESS', action: 'BLOCK' },
    { type: 'DATE_OF_BIRTH', action: 'BLOCK' },
    { type: 'IP_ADDRESS', action: 'BLOCK' },
    { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'BLOCK' },
    { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
    { type: 'AWS_ACCESS_KEY', action: 'BLOCK' },
    { type: 'AWS_SECRET_KEY', action: 'BLOCK' },
  ],
}
```

### Customizing Topic Blocking

Block specific topics or subject areas from being discussed.

**Current Configuration**:

```typescript
topicPolicyConfig: {
  topicsConfig: [
    {
      name: 'Financial Advice',
      definition: 'Providing specific financial advice or investment recommendations',
      examples: [
        'Should I invest in stocks?',
        'What mutual funds should I buy?',
      ],
      type: 'DENY',
    },
    {
      name: 'Medical Advice',
      definition: 'Providing specific medical diagnosis or treatment recommendations',
      examples: [
        'What medication should I take?',
        'Do I have a medical condition?',
      ],
      type: 'DENY',
    },
  ],
}
```

**Adding Custom Topics for Your Organization**:

```typescript
topicPolicyConfig: {
  topicsConfig: [
    // Existing topics...
    {
      name: 'Legal Advice',
      definition: 'Providing specific legal advice or interpretations',
      examples: [
        'Should I sue someone?',
        'What are my legal rights?',
      ],
      type: 'DENY',
    },
    {
      name: 'Competitor Information',
      definition: 'Discussing specific competitor strategies or confidential information',
      examples: [
        'What is Company X doing?',
        'Tell me about our competitor\'s plans',
      ],
      type: 'DENY',
    },
    {
      name: 'Internal Politics',
      definition: 'Discussing internal company politics or personnel issues',
      examples: [
        'Who should be promoted?',
        'What do you think about manager X?',
      ],
      type: 'DENY',
    },
  ],
}
```

### Customizing Blocked Messages

Customize the messages users see when content is blocked.

**Current Configuration**:

```typescript
const guardrail = new bedrock.CfnGuardrail(this, 'ContentFilterGuardrail', {
  name: 'app-modex-content-filter',
  blockedInputMessaging: 'Your request contains content that violates our usage policies.',
  blockedOutputsMessaging: 'The AI response was filtered due to content policy violations.',
  // ... rest of configuration
});
```

**Customization for Your Organization**:

```typescript
const guardrail = new bedrock.CfnGuardrail(this, 'ContentFilterGuardrail', {
  name: 'app-modex-content-filter',
  blockedInputMessaging: 'Your request cannot be processed. Please review our acceptable use policy at https://yourcompany.com/ai-policy',
  blockedOutputsMessaging: 'The AI generated content that does not meet our quality standards. Please try rephrasing your request.',
  // ... rest of configuration
});
```

### Testing Guardrails

After customizing guardrails, test them to ensure they work as expected:

```bash
# Deploy updated guardrails
cd infrastructure
./scripts/deploy-prompt-templates-stack.sh --profile app-modex-prod --region us-west-2

# Test with sample inputs
aws bedrock-runtime invoke-model \
  --model-id anthropic.claude-3-7-sonnet-20250219-v1:0 \
  --body '{"anthropic_version":"bedrock-2023-05-31","max_tokens":1024,"messages":[{"role":"user","content":"Test input with PII: john.doe@example.com"}]}' \
  --cli-binary-format raw-in-base64-out \
  --guardrail-identifier <guardrail-id> \
  --guardrail-version DRAFT \
  output.json

# Check if PII was anonymized
cat output.json
```

### Monitoring Guardrails

Monitor guardrail effectiveness through CloudWatch metrics:

```bash
# View guardrail invocations
aws cloudwatch get-metric-statistics \
  --namespace AWS/Bedrock \
  --metric-name GuardrailInvocations \
  --dimensions Name=GuardrailId,Value=<guardrail-id> \
  --start-time 2025-02-01T00:00:00Z \
  --end-time 2025-02-12T23:59:59Z \
  --period 3600 \
  --statistics Sum

# View blocked content
aws cloudwatch get-metric-statistics \
  --namespace AWS/Bedrock \
  --metric-name GuardrailBlocked \
  --dimensions Name=GuardrailId,Value=<guardrail-id> \
  --start-time 2025-02-01T00:00:00Z \
  --end-time 2025-02-12T23:59:59Z \
  --period 3600 \
  --statistics Sum
```

---

## API Gateway Configuration

### CORS Configuration

The default CORS configuration allows all origins. For production, restrict to specific domains.

Edit `infrastructure/lib/app-modex-backend-stack.ts`:

```typescript
this.api = new apigateway.RestApi(this, 'AppModExApi', {
  restApiName: `app-modex-api`,
  description: 'App-ModEx API Gateway',
  deployOptions: {
    stageName: environment,
    loggingLevel: apigateway.MethodLoggingLevel.INFO,
    dataTraceEnabled: environment !== 'prod',  // Disable in prod for performance
    metricsEnabled: true,
    tracingEnabled: true,  // Enable X-Ray tracing
  },
  defaultCorsPreflightOptions: {
    allowOrigins: [
      'http://localhost:3000',                    // Development
      'https://app-modex.yourcompany.com',        // Production custom domain
      'https://d1234567890.cloudfront.net',       // CloudFront domain
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'X-Amz-Date',
      'Authorization',
      'X-Api-Key',
      'X-Amz-Security-Token',
      'x-project-id',  // Custom header for project context
    ],
    allowCredentials: true,
    maxAge: Duration.seconds(3600),  // Cache preflight for 1 hour
  },
  binaryMediaTypes: ['multipart/form-data', 'application/octet-stream'],
});
```

### API Throttling and Rate Limiting

```typescript
// Add usage plan for rate limiting
const usagePlan = this.api.addUsagePlan('UsagePlan', {
  name: 'Standard',
  throttle: {
    rateLimit: 1000,      // Requests per second
    burstLimit: 2000,     // Burst capacity
  },
  quota: {
    limit: 1000000,       // Monthly quota
    period: apigateway.Period.MONTH,
  },
});

// Create API key for programmatic access
const apiKey = this.api.addApiKey('ApiKey', {
  apiKeyName: `app-modex-api-key-${environment}`,
  description: 'API key for App-ModEx programmatic access',
});

// Associate API key with usage plan
usagePlan.addApiKey(apiKey);
usagePlan.addApiStage({
  stage: this.api.deploymentStage,
});
```

### Custom Domain for API Gateway

```typescript
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

// Import certificate (must be in same region as API)
const apiCertificate = acm.Certificate.fromCertificateArn(
  this,
  'ApiCertificate',
  'arn:aws:acm:us-west-2:ACCOUNT:certificate/CERT-ID'
);

// Create custom domain
const apiDomain = new apigateway.DomainName(this, 'ApiDomain', {
  domainName: 'api.app-modex.yourcompany.com',
  certificate: apiCertificate,
  endpointType: apigateway.EndpointType.REGIONAL,
  securityPolicy: apigateway.SecurityPolicy.TLS_1_2,
});

// Map domain to API
new apigateway.BasePathMapping(this, 'ApiMapping', {
  domainName: apiDomain,
  restApi: this.api,
  stage: this.api.deploymentStage,
});

// Create Route 53 record
const apiRecord = new route53.ARecord(this, 'ApiAliasRecord', {
  zone: hostedZone,
  recordName: 'api.app-modex.yourcompany.com',
  target: route53.RecordTarget.fromAlias(
    new route53Targets.ApiGatewayDomain(apiDomain)
  ),
});
```

### Request Validation

```typescript
// Create request validator
const requestValidator = new apigateway.RequestValidator(this, 'RequestValidator', {
  restApi: this.api,
  requestValidatorName: 'request-validator',
  validateRequestBody: true,
  validateRequestParameters: true,
});

// Define request model
const requestModel = new apigateway.Model(this, 'RequestModel', {
  restApi: this.api,
  contentType: 'application/json',
  modelName: 'ProjectRequest',
  schema: {
    type: apigateway.JsonSchemaType.OBJECT,
    required: ['name'],
    properties: {
      name: { type: apigateway.JsonSchemaType.STRING, minLength: 1, maxLength: 100 },
      notes: { type: apigateway.JsonSchemaType.STRING, maxLength: 500 },
    },
  },
});

// Apply to method
resource.addMethod('POST', integration, {
  requestValidator: requestValidator,
  requestModels: {
    'application/json': requestModel,
  },
});
```

---

## Bedrock AI Configuration

### Changing AI Models

> **💰 COST IMPACT: YES - Varies significantly by model choice**
> 
> **Current Cost:** ~$5/month (10K normalizations + 100 pilot analyses)
> **Cost Range:** $1-1,000+/month depending on model and volume
> 
> **How to Calculate Your Cost:**
> 1. Count: Expected API calls per month for each agent
> 2. Estimate: Average tokens per call (input + output)
> 3. Go to: https://aws.amazon.com/bedrock/pricing/
> 4. Find: Your chosen model's price per 1,000 tokens
> 5. Calculate: (calls × avg_tokens / 1,000) × price_per_1k_tokens
> 
> **Model Price Comparison (per 1,000 tokens):**
> - Nova Lite: $0.00006 input, $0.00024 output (cheapest)
> - Claude 3 Haiku: $0.00025 input, $0.00125 output
> - Claude 3.7 Sonnet: $0.003 input, $0.015 output (current)
> - Claude 3 Opus: $0.015 input, $0.075 output (most expensive)

The solution uses direct Bedrock model invocation with three different models. You can customize these based on your needs and budget.

**Current Agent Configuration:**

1. **Normalization Agent** (Claude 3.7 Sonnet)
   - Purpose: Standardize technology names across data sources
   - Model: `anthropic.claude-3-7-sonnet-20250219-v1:0`
   - Use Case: Technology stack normalization
   - Cost: Moderate (high-quality normalization)

2. **Pilot Analysis Agent** (Claude 3.7 Sonnet)
   - Purpose: AI-enhanced pilot candidate evaluation
   - Model: `anthropic.claude-3-7-sonnet-20250219-v1:0`
   - Use Case: Three-stage pilot identification with context
   - Cost: Moderate (contextual analysis)

3. **Skill Importance Agent** (Nova Lite)
   - Purpose: Intelligent skill importance assessment
   - Model: `amazon.nova-lite-v1:0`
   - Use Case: AI-based skill scoring with team weights
   - Cost: Very low (cost-optimized)

Edit `infrastructure/lib/app-modex-prompt-templates-stack.ts`:

```typescript
// Current models:
// 1. Normalization Agent: anthropic.claude-3-7-sonnet-20250219-v1:0 (high quality)
// 2. Pilot Analysis Agent: anthropic.claude-3-7-sonnet-20250219-v1:0 (high quality)
// 3. Skill Importance Agent: amazon.nova-lite-v1:0 (fast, cost-effective)

// Option 1: Use Claude Haiku for cost optimization
const normalizationAgent = new bedrock.CfnAgent(this, 'NormalizationAgent', {
  agentName: 'app-modex-normalization-agent',
  description: 'Normalizes technology names',
  agentResourceRoleArn: agentRole.roleArn,
  foundationModel: 'anthropic.claude-3-haiku-20240307-v1:0',  // Cheaper alternative
  instruction: NORMALIZATION_AGENT_INSTRUCTION,
  idleSessionTtlInSeconds: 600,
});

// Option 2: Use Claude Opus for maximum quality
const pilotAnalysisAgent = new bedrock.CfnAgent(this, 'PilotAnalysisAgent', {
  agentName: 'app-modex-pilot-analysis-agent',
  description: 'Analyzes applications for pilot candidates with context',
  agentResourceRoleArn: agentRole.roleArn,
  foundationModel: 'anthropic.claude-3-opus-20240229-v1:0',  // Highest quality
  instruction: PILOT_ANALYSIS_AGENT_INSTRUCTION,
  idleSessionTtlInSeconds: 600,
});

// Option 3: Keep Nova Lite for skill importance (recommended for cost)
const skillImportanceAgent = new bedrock.CfnAgent(this, 'SkillImportanceAgent', {
  agentName: 'app-modex-skill-importance-agent',
  description: 'Scores skill importance based on team weights',
  agentResourceRoleArn: agentRole.roleArn,
  foundationModel: 'amazon.nova-lite-v1:0',  // Cost-effective (recommended)
  instruction: SKILL_IMPORTANCE_AGENT_INSTRUCTION,
  idleSessionTtlInSeconds: 600,
});
```

**Available Models:**
- `amazon.nova-lite-v1:0` - Fast, cost-effective (current default for skill importance)
- `amazon.nova-pro-v1:0` - Balanced performance and cost
- `amazon.titan-text-premier-v1:0` - AWS Titan, good for structured tasks
- `anthropic.claude-3-haiku-20240307-v1:0` - Fast, affordable Claude
- `anthropic.claude-3-sonnet-20240229-v1:0` - Balanced Claude
- `anthropic.claude-3-7-sonnet-20250219-v1:0` - Latest Claude (current default for normalization and pilot analysis)
- `anthropic.claude-3-opus-20240229-v1:0` - Highest quality Claude

### Customizing Agent Instructions

Each agent has detailed instructions that can be customized for your organization.

**File Location**: `infrastructure/lib/agent-instructions.ts`

**1. Normalization Agent Instructions**:
```typescript
export const NORMALIZATION_AGENT_INSTRUCTION = `
You are a technology normalization specialist for [YOUR COMPANY NAME].
Focus on these technology categories:
- Programming Languages: Java, Python, JavaScript, C#, Go
- Frameworks: Spring Boot, React, Angular, .NET Core
- Databases: PostgreSQL, MySQL, MongoDB, Oracle
- Cloud: AWS, Azure, GCP services

Normalization rules:
1. Use official product names
2. Include version numbers when provided
3. Preserve vendor names
4. Use consistent casing
5. Expand abbreviations

Custom mappings for your organization:
- "WebLogic" → "Oracle WebLogic Server"
- "DB2" → "IBM Db2"
- "MQ" → "IBM MQ"
...`;
```

**2. Pilot Analysis Agent Instructions**:
```typescript
export const PILOT_ANALYSIS_AGENT_INSTRUCTION = `
You are an expert application modernization consultant analyzing applications for pilot candidate selection.

Your role is to:
1. Evaluate applications based on business value, technical feasibility, and strategic alignment
2. Consider team skills, technology vision, and application similarities
3. Provide actionable recommendations with clear rationale
4. Identify risks and mitigation strategies

Context you will receive:
- Application details and algorithmic scores
- Similar applications and migration patterns
- Team skills inventory and capability gaps
- Technology vision and strategic goals
- Team capacity and resource availability

Provide:
- Enhanced score (0-100) with adjustment rationale
- Confidence level (0-100) in your assessment
- Natural language insights and recommendations
- Specific next steps and considerations
...`;
```

**3. Skill Importance Agent Instructions**:
```typescript
export const SKILL_IMPORTANCE_AGENT_INSTRUCTION = `
You are a skill assessment specialist analyzing skill importance for modernization initiatives.

Your role is to:
1. Analyze team category weights and strategic priorities
2. Generate importance scores (0-100) for each skill
3. Consider modernization goals and technology direction
4. Provide confidence levels and rationale

Scoring guidelines:
- 80-100: Critical skills essential for success
- 60-79: Important skills with significant impact
- 40-59: Moderate skills useful but not critical
- 20-39: Low importance skills
- 0-19: Very low importance skills

Provide:
- Importance score (0-100) for each skill
- Confidence level (0-100) in assessment
- Rationale explaining the score
...`;
```

### Step Functions Integration

Bedrock models are integrated with AWS Step Functions for orchestrated workflows:

**Pilot Identification Workflow**:
- Gathers context data (similarities, skills, vision)
- Processes applications in parallel (Map state)
- Invokes Bedrock model for AI enhancement via Lambda
- Combines algorithmic and AI scores
- Max concurrency: 10 (to prevent Bedrock throttling)

**Skill Importance Workflow**:
- Loads team weights and skills from Athena
- Processes teams in parallel (Map state)
- Invokes Bedrock model for each team via Lambda
- Stores results to S3 for Athena querying
- Max concurrency: 10 (cost-optimized)

**Concurrency Configuration**:
Edit Step Function definitions in `infrastructure/stepfunctions/project-specific/`:
```json
{
  "Type": "Map",
  "MaxConcurrency": 10,
  "ItemsPath": "$.teams",
  "Iterator": {
    "StartAt": "ProcessTeam",
    ...
  }
}
```

### Adding Knowledge Bases (Advanced)

> **💰 COST IMPACT: YES - Significant ongoing costs**
> 
> **Additional Cost:** ~$700/month minimum for OpenSearch Serverless
> 
> **How to Calculate Your Cost:**
> 1. OpenSearch Serverless: Minimum 4 OCUs required
> 2. Go to: https://calculator.aws/#/addService/OpenSearchServerless
> 3. Calculate: 4 OCUs × $0.24/hour × 730 hours = $700.80/month
> 4. Add: Storage cost = GB × $0.024/month
> 5. Add: Embeddings = (tokens / 1,000) × $0.0001 (one-time)
> 
> **⚠️ Warning:** Knowledge Bases add significant cost. Only implement if absolutely necessary.

**Note:** The current implementation uses direct model invocation without Knowledge Bases. To add Knowledge Bases for additional context:

**Step 1: Create S3 Bucket for Documents**

```typescript
// Add to infrastructure stack
const knowledgeBaseBucket = new s3.Bucket(this, 'KnowledgeBaseBucket', {
  bucketName: `app-modex-knowledge-base-${this.account}`,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
  versioned: true,
  encryption: s3.BucketEncryption.S3_MANAGED,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
});
```

**Step 2: Create OpenSearch Serverless Collection**

```typescript
import * as opensearchserverless from 'aws-cdk-lib/aws-opensearchserverless';

// Create collection for vector search
const collection = new opensearchserverless.CfnCollection(this, 'KBCollection', {
  name: 'app-modex-kb-collection',
  type: 'VECTORSEARCH',
  description: 'Knowledge base for App-ModEx',
});
```

**Step 3: Modify Lambda to Use Knowledge Base**

Update Lambda functions to retrieve relevant documents before model invocation:

```javascript
// In pilot-ai-enhance-scores/index.js
const { retrieveDocuments } = require('./knowledgeBaseRetriever');

// Before invoking model
const relevantDocs = await retrieveDocuments(applicationContext);
const enhancedPrompt = `${userPrompt}\n\nRelevant Context:\n${relevantDocs}`;
```

**Note:** This is an advanced feature that significantly increases costs. The current direct invocation approach is sufficient for most use cases.

---

## Lambda Layers Customization

> **💰 COST IMPACT: NO - Lambda Layers are free**
> 
> **Current Cost:** $0 - No additional charges for Lambda Layers
> **Storage:** Included in Lambda storage quota (75 GB free)
> 
> **Note:** Layers reduce individual function deployment sizes, potentially speeding up deployments

Lambda Layers allow you to share code and dependencies across all Lambda functions. The solution includes a shared layer with common utilities that can be extended for your organization's needs.

### Current Shared Layer Structure

**Location**: `infrastructure/lambda/layers/shared/nodejs/`

**Included Utilities**:
1. `logger.js` - Structured logging
2. `promptService.js` - AI prompt management with caching
3. `sanitizeEvent.js` - Event sanitization for security
4. `secretsManager.js` - Secrets Manager integration

### Adding Custom Utilities to the Layer

**Step 1: Create Your Custom Utility**

Create a new file in `infrastructure/lambda/layers/shared/nodejs/`:

```javascript
// infrastructure/lambda/layers/shared/nodejs/customValidator.js

/**
 * Custom validation utility for App-ModEx
 */

// Validate application name format
function validateApplicationName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Application name must be a non-empty string');
  }
  
  if (name.length > 100) {
    throw new Error('Application name must be 100 characters or less');
  }
  
  // Your organization's naming convention
  const pattern = /^[A-Z][a-zA-Z0-9\s\-]+$/;
  if (!pattern.test(name)) {
    throw new Error('Application name must start with uppercase letter');
  }
  
  return true;
}

module.exports = {
  validateApplicationName,
};
```

**Step 2: Use in Lambda Functions**

```javascript
// In any Lambda function
const { validateApplicationName } = require('/opt/nodejs/customValidator');

exports.handler = async (event) => {
  try {
    validateApplicationName(event.applicationName);
    // Continue processing...
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
```

### Deploying Layer Updates

```bash
# Deploy updated layer
cd infrastructure
./scripts/deploy-backend-stack.sh --profile app-modex-prod --region us-west-2
```

---

## SQS and DLQ Configuration

> **💰 COST IMPACT: MINIMAL - SQS is very inexpensive**
> 
> **Current Cost:** ~$0.01/month for typical usage
> **Free Tier:** 1 million requests per month (permanent)

The solution uses Amazon SQS for asynchronous message processing with automatic dead letter queue (DLQ) handling.

### Adjusting Visibility Timeout

**Current Configuration**: 15 minutes (900 seconds)

**CDK Configuration** (`infrastructure/lib/app-modex-backend-stack.ts`):

```typescript
// Increase for long-running processes
const projectOpsQueue = new sqs.Queue(this, 'ProjectOperationsQueue', {
  queueName: 'app-modex-project-operations',
  visibilityTimeout: Duration.minutes(30),  // Increased to 30 minutes
  retentionPeriod: Duration.days(14),
  encryption: sqs.QueueEncryption.SQS_MANAGED,
  deadLetterQueue: {
    queue: projectOpsDLQ,
    maxReceiveCount: 3,
  },
});
```

### Configuring DLQ Max Receive Count

**Current Configuration**: 3 attempts before moving to DLQ

```typescript
// More retries for transient failures
deadLetterQueue: {
  queue: projectOpsDLQ,
  maxReceiveCount: 5,  // Increased to 5 attempts
}
```

### Configuring DLQ Automatic Redrive

**Current Configuration**: Runs every 5 minutes

```typescript
// More frequent redrive (every 2 minutes)
const dlqRedriveRule = new events.Rule(this, 'DLQRedriveRule', {
  schedule: events.Schedule.rate(Duration.minutes(2)),
});
```

---

## Secrets Manager Configuration

> **💰 COST IMPACT: MINIMAL**
> 
> **Current Cost:** ~$0.45/month per secret
> **Breakdown:** $0.40 storage + $0.05 per 10,000 API calls
> **Caching:** Reduces API calls by ~99%

The solution uses AWS Secrets Manager to securely store sensitive configuration data.

### Current Secret Structure

**Secret Name**: `app-modex-config-{environment}`

**Content**:
```json
{
  "userPoolId": "us-west-2_XXXXXXXXX",
  "identityPoolId": "us-west-2:XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
  "region": "us-west-2"
}
```

### Adding Custom Secrets

**Step 1: Create Secret in CDK**

```typescript
// infrastructure/lib/app-modex-backend-stack.ts

const customSecret = new secretsmanager.Secret(this, 'CustomSecret', {
  secretName: `app-modex-custom-${environment}`,
  description: 'Custom application secrets',
  generateSecretString: {
    secretStringTemplate: JSON.stringify({
      apiKey: 'your-api-key',
      webhookUrl: 'https://your-webhook.com',
    }),
    generateStringKey: 'placeholder',
  },
});

// Grant read access to Lambda functions
customSecret.grantRead(lambdaFunction);
```

**Step 2: Use in Lambda Functions**

```javascript
const { getSecret } = require('/opt/nodejs/secretsManager');

exports.handler = async (event) => {
  const customConfig = await getSecret(process.env.CUSTOM_SECRET_NAME);
  const apiKey = customConfig.apiKey;
  // Use in business logic...
};
```

### Enabling Secret Rotation

```typescript
const appConfigSecret = new secretsmanager.Secret(this, 'AppConfigSecret', {
  secretName: `app-modex-config-${environment}`,
  description: 'App-ModEx application configuration',
});

// Add rotation
appConfigSecret.addRotationSchedule('RotationSchedule', {
  automaticallyAfter: Duration.days(30),
  rotationLambda: rotationFunction,
});
```

---

## CloudFront OAC Configuration

> **💰 COST IMPACT: NO - OAC is free**
> 
> **Security Benefit:** OAC is more secure than deprecated OAI
> **Migration:** Recommended for all deployments

CloudFront Origin Access Control (OAC) is the modern replacement for Origin Access Identity (OAI).

### Current Configuration

The solution uses OAC by default for enhanced security.

**CDK Configuration** (`infrastructure/lib/app-modex-frontend-stack.ts`):

```typescript
// Create OAC
const originAccessControl = new cloudfront.CfnOriginAccessControl(this, 'OAC', {
  originAccessControlConfig: {
    name: `app-modex-oac-${environment}`,
    originAccessControlOriginType: 's3',
    signingBehavior: 'always',
    signingProtocol: 'sigv4',
  },
});

// Apply to distribution
const distribution = new cloudfront.Distribution(this, 'Distribution', {
  defaultBehavior: {
    origin: new origins.S3Origin(bucket),
    // OAC is automatically applied
  },
});
```

### Security Benefits of OAC

1. **Enhanced Security**: Uses AWS Signature Version 4 (SigV4)
2. **Better Integration**: Works with S3 bucket policies
3. **Future-Proof**: OAI is deprecated, OAC is the modern standard
4. **No Additional Cost**: Free to use

---

## WAF Custom Rules Configuration

> **💰 COST IMPACT: YES - WAF charges per rule and request**
> 
> **Current Cost:** ~$6/month (1 Web ACL + 5 rules + 10M requests)
> **Additional Rules:** $1/month per rule
> **Rate Limiting:** Included in base cost

AWS WAF protects your application from common web exploits. You can add custom rules for your specific security requirements.

### Current WAF Configuration

**Managed Rule Sets**:
- AWSManagedRulesCommonRuleSet
- AWSManagedRulesKnownBadInputsRuleSet
- AWSManagedRulesAmazonIpReputationList (frontend only)
- AWSManagedRulesAnonymousIpList (frontend only)

**Custom Rules**:
- Rate Limiting: 2000 requests per 5 minutes per IP

### Adding Custom IP Allowlist

```typescript
// infrastructure/lib/app-modex-frontend-stack.ts

const ipSetAllowlist = new wafv2.CfnIPSet(this, 'IPSetAllowlist', {
  scope: 'CLOUDFRONT',
  ipAddressVersion: 'IPV4',
  addresses: [
    '203.0.113.0/24',  // Your office IP range
    '198.51.100.0/24', // Your VPN IP range
  ],
});

// Add rule to Web ACL
{
  name: 'IPAllowlistRule',
  priority: 0,  // Highest priority
  statement: {
    ipSetReferenceStatement: {
      arn: ipSetAllowlist.attrArn,
    },
  },
  action: { allow: {} },
  visibilityConfig: {
    sampledRequestsEnabled: true,
    cloudWatchMetricsEnabled: true,
    metricName: 'IPAllowlistRule',
  },
}
```

### Adding Custom Rate Limiting by Path

```typescript
// Rate limit specific endpoints more strictly
{
  name: 'StrictRateLimitRule',
  priority: 1,
  statement: {
    rateBasedStatement: {
      limit: 100,  // 100 requests per 5 minutes
      aggregateKeyType: 'IP',
      scopeDownStatement: {
        byteMatchStatement: {
          searchString: '/api/export',
          fieldToMatch: { uriPath: {} },
          textTransformations: [{ priority: 0, type: 'NONE' }],
          positionalConstraint: 'STARTS_WITH',
        },
      },
    },
  },
  action: { block: {} },
  visibilityConfig: {
    sampledRequestsEnabled: true,
    cloudWatchMetricsEnabled: true,
    metricName: 'StrictRateLimitRule',
  },
}
```

### Testing WAF Rules

```bash
# Test from allowed IP
curl -I https://your-cloudfront-domain.com

# Test rate limiting (should block after threshold)
for i in {1..2100}; do curl -s https://your-cloudfront-domain.com > /dev/null; done
```

---

## Data Validation and Transformation Configuration

> **💰 COST IMPACT: MINIMAL - Current implementation included**
> 
> **Current Cost:** ~$2/month (included in base deployment)
> **Additional Costs Only If You Add:**
> - Virus scanning: +$1/month (Lambda) or +$500/month (third-party API)
> - Data enrichment APIs: +$99-499/month (external services)
> - Additional file formats: Negligible
> 
> **How to Calculate Your Cost:**
> 1. Count: Files processed per month
> 2. Go to: https://calculator.aws/#/addService/Lambda
> 3. Enter: Invocations = files processed
> 4. Enter: Memory and duration for your processing logic
> 5. Add: Any third-party API costs (check their pricing pages)

When files are uploaded to App-ModEx, they go through a validation and transformation pipeline before being stored. This section explains how to customize this critical process.

### Architecture Overview

**Data Processing Flow:**
```
File Upload → S3 (data-uploaded/) → DynamoDB Stream → Data Source Processor Lambda
→ Validation → Transformation → Normalization Lambda (Direct Bedrock Model Invocation)
→ S3 (data-processed/) → Athena Tables → Frontend Display
```

### Step 1: File Format Validation

The `file-upload` Lambda validates file format before accepting uploads.

**Location**: `infrastructure/lambda/global/file-upload/index.js`

**Current Validation:**
```javascript
// Supported file formats
const SUPPORTED_FORMATS = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

// File size limits
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Validation function
function validateFile(file, dataSourceType) {
  // Check file format
  if (!SUPPORTED_FORMATS.includes(file.contentType)) {
    throw new Error(`Unsupported file format: ${file.contentType}`);
  }
  
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds maximum: ${MAX_FILE_SIZE} bytes`);
  }
  
  // Check filename
  if (!file.filename || file.filename.trim() === '') {
    throw new Error('Filename is required');
  }
  
  return true;
}
```

**Customization Options:**

**Option 1: Add Additional File Formats**

```javascript
const SUPPORTED_FORMATS = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/json',  // Add JSON support
  'text/plain',        // Add TXT support
  'application/xml',   // Add XML support
];

// Add format-specific parsers
async function parseFile(fileContent, contentType) {
  switch (contentType) {
    case 'text/csv':
    case 'application/vnd.ms-excel':
      return parseCSV(fileContent);
    
    case 'application/json':
      return parseJSON(fileContent);
    
    case 'application/xml':
      return parseXML(fileContent);
    
    default:
      throw new Error(`Unsupported format: ${contentType}`);
  }
}

function parseJSON(content) {
  const data = JSON.parse(content);
  // Convert JSON to CSV-like structure
  const headers = Object.keys(data[0]);
  const rows = data.map(obj => headers.map(h => obj[h]));
  return { headers, rows };
}

function parseXML(content) {
  const xml2js = require('xml2js');
  const parser = new xml2js.Parser();
  // Parse XML and convert to CSV-like structure
  // Implementation depends on XML structure
}
```

**Option 2: Adjust File Size Limits**

```javascript
// Different limits per data source type
const FILE_SIZE_LIMITS = {
  'team-skills': 10 * 1024 * 1024,      // 10MB
  'technology-vision': 5 * 1024 * 1024,  // 5MB
  'portfolio': 50 * 1024 * 1024,         // 50MB
  'tech-stack': 100 * 1024 * 1024,       // 100MB
  'infrastructure': 100 * 1024 * 1024,   // 100MB
  'utilization': 50 * 1024 * 1024,       // 50MB
};

function validateFile(file, dataSourceType) {
  const maxSize = FILE_SIZE_LIMITS[dataSourceType] || MAX_FILE_SIZE;
  
  if (file.size > maxSize) {
    throw new Error(`File size exceeds maximum for ${dataSourceType}: ${maxSize} bytes`);
  }
  
  return true;
}
```

**Option 3: Add Virus Scanning**

```javascript
const { ClamAV } = require('clamav.js');

async function scanFileForViruses(fileContent) {
  const clam = new ClamAV({
    host: process.env.CLAMAV_HOST || 'localhost',
    port: process.env.CLAMAV_PORT || 3310,
  });
  
  const result = await clam.scanBuffer(fileContent);
  
  if (result.isInfected) {
    throw new Error(`File is infected: ${result.viruses.join(', ')}`);
  }
  
  return true;
}

// Add to validation flow
async function validateAndScanFile(file, dataSourceType) {
  validateFile(file, dataSourceType);
  
  // Download file content for scanning
  const fileContent = await downloadFileFromS3(file.s3Key);
  await scanFileForViruses(fileContent);
  
  return true;
}
```

### Step 2: Content Validation

The `data-source-processor` Lambda validates CSV content structure.

**Location**: `infrastructure/lambda/global/data-source-processor/index.js`

**Current Validation:**
```javascript
// Required columns per data source type
const REQUIRED_COLUMNS = {
  'team-skills': ['Team', 'Persona', 'Skill', 'Proficiency'],
  'technology-vision': ['Domain', 'Technology', 'Phase', 'Description'],
  'portfolio': ['ApplicationName', 'BusinessUnit', 'Criticality', 'Users', 'Description'],
  'tech-stack': ['ApplicationName', 'ComponentType', 'ComponentName', 'Version', 'Notes'],
  'infrastructure': ['ApplicationName', 'ResourceType', 'ResourceName', 'Environment', 'Specifications'],
  'utilization': ['ApplicationName', 'ResourceType', 'MetricName', 'AverageValue', 'PeakValue', 'Unit'],
};

function validateCSVStructure(headers, dataSourceType) {
  const required = REQUIRED_COLUMNS[dataSourceType];
  
  if (!required) {
    throw new Error(`Unknown data source type: ${dataSourceType}`);
  }
  
  const missing = required.filter(col => 
    !headers.some(h => h.toLowerCase() === col.toLowerCase())
  );
  
  if (missing.length > 0) {
    throw new Error(`Missing required columns: ${missing.join(', ')}`);
  }
  
  return true;
}
```

**Customization Options:**

**Option 1: Add Optional Columns**

```javascript
const COLUMN_DEFINITIONS = {
  'team-skills': {
    required: ['Team', 'Persona', 'Skill', 'Proficiency'],
    optional: ['YearsExperience', 'Certifications', 'LastUpdated'],
    validation: {
      'Proficiency': ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
      'YearsExperience': (value) => !isNaN(value) && value >= 0,
    }
  },
  'portfolio': {
    required: ['ApplicationName', 'BusinessUnit', 'Criticality', 'Users'],
    optional: ['Owner', 'LastUpdated', 'Status', 'TechnicalDebt'],
    validation: {
      'Criticality': ['High', 'Medium', 'Low'],
      'Users': (value) => !isNaN(value) && value >= 0,
      'Status': ['Active', 'Deprecated', 'Planned', 'Decommissioned'],
    }
  },
  // ... other data source types
};

function validateCSVContent(rows, headers, dataSourceType) {
  const definition = COLUMN_DEFINITIONS[dataSourceType];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    // Validate each column
    headers.forEach((header, index) => {
      const value = row[index];
      const validation = definition.validation[header];
      
      if (validation) {
        if (Array.isArray(validation)) {
          // Enum validation
          if (!validation.includes(value)) {
            throw new Error(
              `Row ${i + 1}: Invalid value for ${header}: "${value}". ` +
              `Expected one of: ${validation.join(', ')}`
            );
          }
        } else if (typeof validation === 'function') {
          // Custom validation function
          if (!validation(value)) {
            throw new Error(
              `Row ${i + 1}: Invalid value for ${header}: "${value}"`
            );
          }
        }
      }
    });
  }
  
  return true;
}
```

**Option 2: Add Data Quality Checks**

```javascript
function performDataQualityChecks(rows, headers, dataSourceType) {
  const issues = [];
  
  // Check for duplicate rows
  const rowStrings = rows.map(r => r.join('|'));
  const duplicates = rowStrings.filter((item, index) => 
    rowStrings.indexOf(item) !== index
  );
  
  if (duplicates.length > 0) {
    issues.push({
      severity: 'WARNING',
      message: `Found ${duplicates.length} duplicate rows`,
      type: 'DUPLICATE_ROWS'
    });
  }
  
  // Check for missing values in required columns
  const requiredColumns = REQUIRED_COLUMNS[dataSourceType];
  rows.forEach((row, rowIndex) => {
    headers.forEach((header, colIndex) => {
      if (requiredColumns.includes(header)) {
        const value = row[colIndex];
        if (!value || value.trim() === '') {
          issues.push({
            severity: 'ERROR',
            message: `Row ${rowIndex + 1}: Missing value for required column "${header}"`,
            type: 'MISSING_VALUE',
            row: rowIndex + 1,
            column: header
          });
        }
      }
    });
  });
  
  // Check for data consistency
  if (dataSourceType === 'tech-stack') {
    const applications = new Set();
    rows.forEach((row, rowIndex) => {
      const appName = row[headers.indexOf('ApplicationName')];
      applications.add(appName);
    });
    
    // Verify applications exist in portfolio
    // (This would require querying the portfolio data)
  }
  
  return issues;
}

// Add to processing flow
async function processNewRecord(record, tableName) {
  // ... existing code ...
  
  // Perform data quality checks
  const qualityIssues = performDataQualityChecks(rows, headers, dataSourceType);
  
  // Store quality issues in DynamoDB
  if (qualityIssues.length > 0) {
    await storeDataQualityIssues(projectId, dataSourceId, qualityIssues);
  }
  
  // Decide whether to proceed based on severity
  const hasErrors = qualityIssues.some(issue => issue.severity === 'ERROR');
  if (hasErrors) {
    throw new Error('Data quality validation failed');
  }
  
  // ... continue processing ...
}
```

**Option 3: Add Custom Validation Rules**

```javascript
// Define custom validation rules
const CUSTOM_VALIDATION_RULES = {
  'team-skills': [
    {
      name: 'ValidateSkillFormat',
      validate: (row, headers) => {
        const skillIndex = headers.indexOf('Skill');
        const skill = row[skillIndex];
        
        // Skill should not contain special characters
        if (!/^[a-zA-Z0-9\s\.\-]+$/.test(skill)) {
          return {
            valid: false,
            message: `Skill contains invalid characters: "${skill}"`
          };
        }
        
        return { valid: true };
      }
    },
    {
      name: 'ValidateTeamPersonaCombination',
      validate: (row, headers) => {
        const teamIndex = headers.indexOf('Team');
        const personaIndex = headers.indexOf('Persona');
        
        const team = row[teamIndex];
        const persona = row[personaIndex];
        
        // Define valid team-persona combinations
        const validCombinations = {
          'Platform Team': ['DevOps Engineer', 'Cloud Architect', 'SRE'],
          'Application Team': ['Developer', 'Tech Lead', 'QA Engineer'],
          'Data Team': ['Data Engineer', 'Data Scientist', 'Analytics Engineer'],
        };
        
        if (validCombinations[team] && !validCombinations[team].includes(persona)) {
          return {
            valid: false,
            message: `Invalid persona "${persona}" for team "${team}"`
          };
        }
        
        return { valid: true };
      }
    }
  ],
  // ... other data source types
};

function applyCustomValidationRules(rows, headers, dataSourceType) {
  const rules = CUSTOM_VALIDATION_RULES[dataSourceType] || [];
  const errors = [];
  
  rows.forEach((row, rowIndex) => {
    rules.forEach(rule => {
      const result = rule.validate(row, headers);
      if (!result.valid) {
        errors.push({
          row: rowIndex + 1,
          rule: rule.name,
          message: result.message
        });
      }
    });
  });
  
  return errors;
}
```

### Step 3: Data Transformation

The `unified-normalization` Lambda transforms data using Bedrock AI.

**Location**: `infrastructure/lambda/global/unified-normalization/index.js`

**Current Transformation:**
- Normalizes technology names using direct Bedrock model invocation
- Compares with Athena reference data
- Persists normalized data to S3

**Customization Options:**

**Option 1: Customize Normalization Rules**

Edit `infrastructure/lib/agent-instructions.ts`:

```typescript
export const NORMALIZATION_AGENT_INSTRUCTION = `
You are a technology normalization expert. Your task is to standardize technology names to their official forms.

NORMALIZATION RULES:
1. Use official product names (e.g., "PostgreSQL" not "postgres" or "pg")
2. Include version numbers when provided (e.g., "Node.js 22.x")
3. Preserve vendor names (e.g., "Amazon RDS" not just "RDS")
4. Use consistent casing (e.g., "JavaScript" not "javascript")
5. Expand abbreviations (e.g., "Kubernetes" not "k8s")

CUSTOM RULES FOR YOUR ORGANIZATION:
6. Map legacy names to current names:
   - "WebLogic" → "Oracle WebLogic Server"
   - "DB2" → "IBM Db2"
   - "MQ" → "IBM MQ"
7. Standardize cloud service names:
   - "EC2" → "Amazon EC2"
   - "S3" → "Amazon S3"
   - "Lambda" → "AWS Lambda"
8. Handle internal tools:
   - "InternalFramework" → "YourCompany Internal Framework v2"

RESPONSE FORMAT:
Return JSON array: [{"original": "input", "normalized": "output"}]
`;
```

**Option 2: Add Pre-Processing Transformations**

```javascript
// Add to unified-normalization Lambda
function preProcessData(rows, headers, dataSourceType) {
  const transformations = {
    'tech-stack': (row) => {
      // Normalize component types
      const typeIndex = headers.indexOf('ComponentType');
      const type = row[typeIndex];
      
      const typeMapping = {
        'FE': 'Frontend',
        'BE': 'Backend',
        'DB': 'Database',
        'Cache': 'Caching',
        'Queue': 'Message Queue',
      };
      
      row[typeIndex] = typeMapping[type] || type;
      
      // Clean version numbers
      const versionIndex = headers.indexOf('Version');
      let version = row[versionIndex];
      
      // Remove 'v' prefix
      version = version.replace(/^v/i, '');
      
      // Standardize version format
      if (/^\d+$/.test(version)) {
        version = `${version}.0.0`;
      } else if (/^\d+\.\d+$/.test(version)) {
        version = `${version}.0`;
      }
      
      row[versionIndex] = version;
      
      return row;
    },
    
    'portfolio': (row) => {
      // Standardize criticality values
      const criticalityIndex = headers.indexOf('Criticality');
      let criticality = row[criticalityIndex];
      
      const criticalityMapping = {
        'H': 'High',
        'M': 'Medium',
        'L': 'Low',
        'Critical': 'High',
        'Important': 'Medium',
        'Normal': 'Low',
      };
      
      row[criticalityIndex] = criticalityMapping[criticality] || criticality;
      
      // Clean user counts
      const usersIndex = headers.indexOf('Users');
      let users = row[usersIndex];
      
      // Remove commas and convert to number
      users = users.replace(/,/g, '');
      row[usersIndex] = users;
      
      return row;
    },
    
    // ... other data source types
  };
  
  const transform = transformations[dataSourceType];
  if (transform) {
    return rows.map(transform);
  }
  
  return rows;
}

// Add to processing flow
async function processData(s3Key, dataSourceType, projectId) {
  // ... load data ...
  
  // Pre-process data
  const processedRows = preProcessData(rows, headers, dataSourceType);
  
  // Continue with normalization
  // ...
}
```

**Option 3: Add Post-Processing Enrichment**

```javascript
async function enrichData(rows, headers, dataSourceType, projectId) {
  if (dataSourceType === 'tech-stack') {
    // Add technology metadata from external source
    const techIndex = headers.indexOf('ComponentName');
    
    for (let row of rows) {
      const techName = row[techIndex];
      
      // Query external API or database for metadata
      const metadata = await getTechnologyMetadata(techName);
      
      if (metadata) {
        // Add enrichment columns
        row.push(metadata.category);      // Technology category
        row.push(metadata.vendor);        // Vendor name
        row.push(metadata.license);       // License type
        row.push(metadata.endOfLife);     // End of life date
      }
    }
    
    // Update headers
    headers.push('Category', 'Vendor', 'License', 'EndOfLife');
  }
  
  return { rows, headers };
}

async function getTechnologyMetadata(techName) {
  // Query external API (e.g., StackShare, Wappalyzer, etc.)
  try {
    const response = await fetch(`https://api.stackshare.io/v1/tools/${techName}`);
    const data = await response.json();
    
    return {
      category: data.category,
      vendor: data.vendor,
      license: data.license,
      endOfLife: data.endOfLife,
    };
  } catch (error) {
    console.error(`Failed to fetch metadata for ${techName}:`, error);
    return null;
  }
}
```

**Option 4: Replace Bedrock with Custom Normalization**

```javascript
// Create custom normalization function
async function customNormalization(values, columnType) {
  // Load normalization rules from configuration
  const rules = await loadNormalizationRules(columnType);
  
  const normalized = values.map(value => {
    // Apply exact match rules
    if (rules.exactMatch[value]) {
      return rules.exactMatch[value];
    }
    
    // Apply pattern matching rules
    for (const pattern of rules.patterns) {
      if (new RegExp(pattern.regex, 'i').test(value)) {
        return pattern.replacement;
      }
    }
    
    // Apply fuzzy matching
    const match = findFuzzyMatch(value, rules.knownValues);
    if (match && match.confidence > 0.8) {
      return match.value;
    }
    
    // Return original if no match found
    return value;
  });
  
  return normalized;
}

async function loadNormalizationRules(columnType) {
  // Load from S3, DynamoDB, or configuration file
  const response = await s3Client.send(new GetObjectCommand({
    Bucket: 'app-modex-config',
    Key: `normalization-rules/${columnType}.json`
  }));
  
  const content = await response.Body.transformToString('utf-8');
  return JSON.parse(content);
}

function findFuzzyMatch(value, knownValues) {
  const levenshtein = require('fast-levenshtein');
  
  let bestMatch = null;
  let bestDistance = Infinity;
  
  for (const known of knownValues) {
    const distance = levenshtein.get(value.toLowerCase(), known.toLowerCase());
    const maxLength = Math.max(value.length, known.length);
    const confidence = 1 - (distance / maxLength);
    
    if (distance < bestDistance && confidence > 0.7) {
      bestDistance = distance;
      bestMatch = { value: known, confidence };
    }
  }
  
  return bestMatch;
}
```

### Step 4: Configure Normalization Rules File

Create `normalization-rules/runtimes.json`:

```json
{
  "exactMatch": {
    "node": "Node.js",
    "nodejs": "Node.js",
    "python": "Python",
    "py": "Python",
    "java": "Java",
    "dotnet": ".NET",
    "csharp": "C#",
    "golang": "Go",
    "ruby": "Ruby"
  },
  "patterns": [
    {
      "regex": "^node\\.?js\\s*v?(\\d+)",
      "replacement": "Node.js $1.x"
    },
    {
      "regex": "^python\\s*v?(\\d+)",
      "replacement": "Python $1.x"
    },
    {
      "regex": "^java\\s*v?(\\d+)",
      "replacement": "Java $1"
    }
  ],
  "knownValues": [
    "Node.js",
    "Python",
    "Java",
    "Go",
    "Ruby",
    ".NET",
    "PHP",
    "Rust"
  ]
}
```

### Step 5: Update CDK Stack

Add configuration for custom validation and transformation:

```typescript
// Add to app-modex-backend-stack.ts

// Create S3 bucket for normalization rules
const configBucket = new s3.Bucket(this, 'ConfigBucket', {
  bucketName: `app-modex-config-${this.account}`,
  encryption: s3.BucketEncryption.S3_MANAGED,
  versioned: true,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});

// Upload normalization rules
new s3deploy.BucketDeployment(this, 'DeployNormalizationRules', {
  sources: [s3deploy.Source.asset('./config/normalization-rules')],
  destinationBucket: configBucket,
  destinationKeyPrefix: 'normalization-rules/',
});

// Update Lambda environment variables
const dataSourceProcessor = new lambda.Function(this, 'DataSourceProcessor', {
  // ... existing config ...
  environment: {
    // ... existing variables ...
    CONFIG_BUCKET: configBucket.bucketName,
    ENABLE_CUSTOM_VALIDATION: 'true',
    ENABLE_DATA_ENRICHMENT: 'true',
    MAX_FILE_SIZE: '52428800', // 50MB in bytes
    SUPPORTED_FORMATS: 'text/csv,application/json,application/xml',
  },
});

// Grant access to config bucket
configBucket.grantRead(dataSourceProcessor);
```

### Testing Validation and Transformation

```bash
# Test file upload with validation
aws s3 cp test-data.csv s3://app-modex-data-PROJECT_ID/data-uploaded/team-skills/ \
  --profile app-modex-dev

# Monitor processing
aws logs tail /aws/lambda/app-modex-data-source-processor --follow \
  --profile app-modex-dev

# Check for validation errors
aws dynamodb query \
  --table-name app-modex-project-data \
  --key-condition-expression "projectId = :pid AND begins_with(dataType, :dt)" \
  --expression-attribute-values '{":pid":{"S":"PROJECT_ID"},":dt":{"S":"data-quality-"}}' \
  --profile app-modex-dev

# Verify normalized data
aws s3 ls s3://app-modex-data-PROJECT_ID/data-processed/team-skills/ \
  --profile app-modex-dev
```

### Best Practices

1. **Validation First**: Always validate before transformation to catch errors early
2. **Idempotency**: Ensure transformations can be safely re-run
3. **Logging**: Log all validation failures and transformation decisions
4. **Monitoring**: Set up CloudWatch alarms for validation failure rates
5. **Testing**: Test with sample data before deploying to production
6. **Documentation**: Document all custom validation rules and transformations
7. **Versioning**: Version normalization rules for rollback capability

---

## Database Configuration

### DynamoDB Table Customization

**Adjusting Billing Mode:**

> **💰 COST IMPACT: DEPENDS - Can increase or decrease costs**
> 
> **Current:** On-demand (pay per request)
> **Alternative:** Provisioned capacity (pay for reserved capacity)
> 
> **How to Calculate Your Cost:**
> 1. Monitor current usage in CloudWatch for 1 month
> 2. Note: Read/write requests per month
> 3. Go to: https://calculator.aws/#/addService/DynamoDB
> 4. Compare: On-demand vs Provisioned pricing
> 5. Switch if: Provisioned is >20% cheaper for your usage pattern
> 
> **Rule of Thumb:**
> - On-demand cheaper if: < 380K writes OR < 692K reads per capacity unit/month
> - Provisioned cheaper if: Consistent, predictable workload

```typescript
// Current: Pay-per-request (on-demand)
this.projectsTable = new dynamodb.Table(this, 'ProjectsTable', {
  tableName: `app-modex-projects`,
  partitionKey: { name: 'projectId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,  // Current
  // ... rest of config
});

// Option 1: Provisioned capacity for predictable workloads
this.projectsTable = new dynamodb.Table(this, 'ProjectsTable', {
  tableName: `app-modex-projects`,
  partitionKey: { name: 'projectId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PROVISIONED,
  readCapacity: 5,   // Adjust based on expected load
  writeCapacity: 5,  // Adjust based on expected load
  // ... rest of config
});

// Option 2: Auto-scaling for provisioned capacity
const readScaling = this.projectsTable.autoScaleReadCapacity({
  minCapacity: 5,
  maxCapacity: 100,
});

readScaling.scaleOnUtilization({
  targetUtilizationPercent: 70,
});

const writeScaling = this.projectsTable.autoScaleWriteCapacity({
  minCapacity: 5,
  maxCapacity: 100,
});

writeScaling.scaleOnUtilization({
  targetUtilizationPercent: 70,
});
```

### Adding Global Tables (Multi-Region)

> **💰 COST IMPACT: YES - Approximately doubles DynamoDB costs**
> 
> **Additional Cost:** ~100-150% increase per additional region
> 
> **How to Calculate Your Cost:**
> 1. Note: Current DynamoDB monthly cost
> 2. Multiply: Current cost × 1.5 × (number of regions - 1)
> 3. Add: Data transfer = GB replicated × $0.09 per GB
> 4. Go to: https://calculator.aws/#/addService/DynamoDB
> 5. Select: Global Tables option

```typescript
this.projectsTable = new dynamodb.Table(this, 'ProjectsTable', {
  tableName: `app-modex-projects`,
  partitionKey: { name: 'projectId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  replicationRegions: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],  // Add regions
  replicationTimeout: Duration.hours(2),
  // ... rest of config
});
```

### Enabling Point-in-Time Recovery

```typescript
this.projectsTable = new dynamodb.Table(this, 'ProjectsTable', {
  tableName: `app-modex-projects`,
  partitionKey: { name: 'projectId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  pointInTimeRecovery: true,  // Enable PITR for all environments
  // ... rest of config
});
```

### Adding DynamoDB Streams

```typescript
this.projectsTable = new dynamodb.Table(this, 'ProjectsTable', {
  tableName: `app-modex-projects`,
  partitionKey: { name: 'projectId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,  // Enable streams
  // ... rest of config
});

// Create Lambda to process stream events
const streamProcessor = new lambda.Function(this, 'StreamProcessor', {
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda/stream-processor'),
  environment: {
    TABLE_NAME: this.projectsTable.tableName,
  },
});

// Add stream as event source
streamProcessor.addEventSource(
  new lambdaEventSources.DynamoEventSource(this.projectsTable, {
    startingPosition: lambda.StartingPosition.LATEST,
    batchSize: 10,
    retryAttempts: 3,
  })
);
```

### Bring Your Own Keys (BYOK) for DynamoDB Encryption

> **💰 COST IMPACT: YES - Small additional cost**
> 
> **Additional Cost:** ~$1/month per KMS key
> 
> **How to Calculate Your Cost:**
> 1. Count: Number of KMS keys needed (typically 1-3)
> 2. Calculate: Keys × $1.00/month
> 3. Add: API requests = (DynamoDB operations / 10,000) × $0.03
> 4. Note: Cost is minimal compared to security benefit
> 5. Go to: https://calculator.aws/#/addService/KMS

By default, DynamoDB uses AWS-managed keys. For enhanced security and compliance, use customer-managed KMS keys.

**Step 1: Create Customer-Managed KMS Key**

```typescript
import * as kms from 'aws-cdk-lib/aws-kms';

// Create KMS key for DynamoDB encryption
const dynamoDbEncryptionKey = new kms.Key(this, 'DynamoDbEncryptionKey', {
  description: 'Customer-managed key for DynamoDB table encryption',
  enableKeyRotation: true,  // Automatic annual rotation
  removalPolicy: environment === 'prod' 
    ? cdk.RemovalPolicy.RETAIN   // Keep key in production
    : cdk.RemovalPolicy.DESTROY, // Delete in dev/test
  alias: 'app-modex/dynamodb',
  policy: new iam.PolicyDocument({
    statements: [
      // Allow root account full access
      new iam.PolicyStatement({
        sid: 'Enable IAM User Permissions',
        effect: iam.Effect.ALLOW,
        principals: [new iam.AccountRootPrincipal()],
        actions: ['kms:*'],
        resources: ['*'],
      }),
      // Allow DynamoDB service to use the key
      new iam.PolicyStatement({
        sid: 'Allow DynamoDB Service',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('dynamodb.amazonaws.com')],
        actions: [
          'kms:Decrypt',
          'kms:DescribeKey',
          'kms:CreateGrant',
        ],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'kms:ViaService': `dynamodb.${this.region}.amazonaws.com`,
          },
        },
      }),
      // Allow CloudWatch Logs to use the key
      new iam.PolicyStatement({
        sid: 'Allow CloudWatch Logs',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal(`logs.${this.region}.amazonaws.com`)],
        actions: [
          'kms:Encrypt',
          'kms:Decrypt',
          'kms:ReEncrypt*',
          'kms:GenerateDataKey*',
          'kms:CreateGrant',
          'kms:DescribeKey',
        ],
        resources: ['*'],
        conditions: {
          ArnLike: {
            'kms:EncryptionContext:aws:logs:arn': `arn:aws:logs:${this.region}:${this.account}:*`,
          },
        },
      }),
    ],
  }),
});

// Add tags for key management
cdk.Tags.of(dynamoDbEncryptionKey).add('Project', 'App-ModEx');
cdk.Tags.of(dynamoDbEncryptionKey).add('Environment', environment);
cdk.Tags.of(dynamoDbEncryptionKey).add('Purpose', 'DynamoDB-Encryption');
```

**Step 2: Use Customer-Managed Key in DynamoDB Tables**

```typescript
// Projects table with customer-managed encryption
this.projectsTable = new dynamodb.Table(this, 'ProjectsTable', {
  tableName: `app-modex-projects`,
  partitionKey: { name: 'projectId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,  // Use BYOK
  encryptionKey: dynamoDbEncryptionKey,                   // Your KMS key
  pointInTimeRecoverySpecification: {
    pointInTimeRecoveryEnabled: environment === 'prod',
  },
  removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
});

// Project Data table with same encryption key
this.projectDataTable = new dynamodb.Table(this, 'ProjectDataTable', {
  tableName: `app-modex-project-data`,
  partitionKey: { name: 'projectId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'dataType', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
  encryptionKey: dynamoDbEncryptionKey,
  pointInTimeRecoverySpecification: {
    pointInTimeRecoveryEnabled: environment === 'prod',
  },
  removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
});
```

**Step 3: Grant Lambda Functions Access to KMS Key**

```typescript
// Grant Lambda decrypt permissions
dynamoDbEncryptionKey.grantDecrypt(projectsLambda);
dynamoDbEncryptionKey.grantEncryptDecrypt(projectsLambda);

// Or grant to all Lambda functions via role
dynamoDbEncryptionKey.grant(lambdaRole, 
  'kms:Decrypt',
  'kms:DescribeKey',
  'kms:GenerateDataKey'
);
```

**Step 4: Monitor KMS Key Usage**

```typescript
// Create CloudWatch alarm for KMS key usage
const kmsKeyUsageAlarm = new cloudwatch.Alarm(this, 'KmsKeyUsageAlarm', {
  metric: new cloudwatch.Metric({
    namespace: 'AWS/KMS',
    metricName: 'UserErrorCount',
    dimensionsMap: {
      KeyId: dynamoDbEncryptionKey.keyId,
    },
    statistic: 'Sum',
    period: Duration.minutes(5),
  }),
  threshold: 10,
  evaluationPeriods: 2,
  alarmDescription: 'Alert when KMS key errors occur',
  alarmName: 'app-modex-kms-errors',
});

kmsKeyUsageAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alertTopic));
```

**Step 5: External Key Management (Optional)**

For organizations using external HSMs or key management systems:

```typescript
// Import external key material
const externalKey = new kms.Key(this, 'ExternalKey', {
  description: 'Key with external key material',
  enableKeyRotation: false,  // Manual rotation required for external keys
  keySpec: kms.KeySpec.SYMMETRIC_DEFAULT,
  keyUsage: kms.KeyUsage.ENCRYPT_DECRYPT,
  origin: kms.KeyOrigin.EXTERNAL,  // External key material
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});

// Output key import parameters
new cdk.CfnOutput(this, 'KeyImportParameters', {
  value: externalKey.keyId,
  description: 'Use this key ID to import external key material',
  exportName: 'ExternalKeyId',
});
```

**Import external key material using AWS CLI:**

```bash
# Get import parameters
aws kms get-parameters-for-import \
  --key-id <KEY_ID> \
  --wrapping-algorithm RSAES_OAEP_SHA_256 \
  --wrapping-key-spec RSA_2048 \
  --profile app-modex-prod

# Import key material (after encrypting with wrapping key)
aws kms import-key-material \
  --key-id <KEY_ID> \
  --encrypted-key-material fileb://encrypted-key-material.bin \
  --import-token fileb://import-token.bin \
  --expiration-model KEY_MATERIAL_DOES_NOT_EXPIRE \
  --profile app-modex-prod
```

### Backup Configuration

```typescript
import * as backup from 'aws-cdk-lib/aws-backup';

// Create backup vault
const backupVault = new backup.BackupVault(this, 'BackupVault', {
  backupVaultName: 'app-modex-backup-vault',
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});

// Create backup plan
const backupPlan = new backup.BackupPlan(this, 'BackupPlan', {
  backupPlanName: 'app-modex-backup-plan',
  backupPlanRules: [
    new backup.BackupPlanRule({
      ruleName: 'DailyBackup',
      scheduleExpression: backup.Schedule.cron({
        hour: '2',
        minute: '0',
      }),
      deleteAfter: Duration.days(30),
      moveToColdStorageAfter: Duration.days(7),
    }),
  ],
});

// Add DynamoDB tables to backup
backupPlan.addSelection('Selection', {
  resources: [
    backup.BackupResource.fromDynamoDbTable(this.projectsTable),
    backup.BackupResource.fromDynamoDbTable(this.projectDataTable),
  ],
});
```

---

## Storage Configuration

### S3 Bucket Customization

**Lifecycle Policies:**

```typescript
this.bucket = new s3.Bucket(this, 'WebsiteBucket', {
  bucketName: `app-modex-frontend-${this.account}`,
  // ... existing config ...
  lifecycleRules: [
    {
      id: 'TransitionToIA',
      enabled: true,
      transitions: [
        {
          storageClass: s3.StorageClass.INFREQUENT_ACCESS,
          transitionAfter: Duration.days(30),
        },
        {
          storageClass: s3.StorageClass.GLACIER,
          transitionAfter: Duration.days(90),
        },
      ],
    },
    {
      id: 'CleanupOldVersions',
      noncurrentVersionExpiration: Duration.days(30),
    },
    {
      id: 'DeleteIncompleteUploads',
      abortIncompleteMultipartUploadAfter: Duration.days(7),
    },
  ],
});
```

**Replication Configuration:**

```typescript
// Create destination bucket in another region
const replicationBucket = new s3.Bucket(this, 'ReplicationBucket', {
  bucketName: `app-modex-frontend-replica-${this.account}`,
  versioned: true,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});

// Create replication role
const replicationRole = new iam.Role(this, 'ReplicationRole', {
  assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
});

replicationBucket.grantReadWrite(replicationRole);
this.bucket.grantReadWrite(replicationRole);

// Add replication configuration
const cfnBucket = this.bucket.node.defaultChild as s3.CfnBucket;
cfnBucket.replicationConfiguration = {
  role: replicationRole.roleArn,
  rules: [
    {
      id: 'ReplicateAll',
      status: 'Enabled',
      priority: 1,
      filter: {},
      destination: {
        bucket: replicationBucket.bucketArn,
        replicationTime: {
          status: 'Enabled',
          time: { minutes: 15 },
        },
        metrics: {
          status: 'Enabled',
          eventThreshold: { minutes: 15 },
        },
      },
    },
  ],
};
```

**Encryption Configuration:**

```typescript
import * as kms from 'aws-cdk-lib/aws-kms';

// Create KMS key for encryption
const encryptionKey = new kms.Key(this, 'BucketEncryptionKey', {
  description: 'KMS key for S3 bucket encryption',
  enableKeyRotation: true,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});

// Use KMS encryption
this.bucket = new s3.Bucket(this, 'WebsiteBucket', {
  bucketName: `app-modex-frontend-${this.account}`,
  encryption: s3.BucketEncryption.KMS,
  encryptionKey: encryptionKey,
  bucketKeyEnabled: true,  // Reduce KMS costs
  // ... rest of config
});
```

### Bring Your Own Keys (BYOK) for S3 Encryption

> **💰 COST IMPACT: YES - Small additional cost (optimizable to ~$1/month)**
> 
> **Additional Cost:** $1-4/month depending on configuration
> 
> **How to Calculate Your Cost:**
> 1. KMS key: $1.00/month
> 2. WITHOUT S3 Bucket Keys: (S3 operations / 10,000) × $0.03
> 3. WITH S3 Bucket Keys: Reduces API calls by 99%
> 4. Recommended: Always enable S3 Bucket Keys
> 5. Final cost: ~$1.03/month with Bucket Keys enabled
> 6. Go to: https://calculator.aws/#/addService/KMS

For organizations with strict compliance requirements, use customer-managed KMS keys for S3 encryption.

**Step 1: Create Customer-Managed KMS Key for S3**

```typescript
import * as kms from 'aws-cdk-lib/aws-kms';

// Create dedicated KMS key for S3 encryption
const s3EncryptionKey = new kms.Key(this, 'S3EncryptionKey', {
  description: 'Customer-managed key for S3 bucket encryption',
  enableKeyRotation: true,  // Automatic annual rotation
  removalPolicy: environment === 'prod' 
    ? cdk.RemovalPolicy.RETAIN 
    : cdk.RemovalPolicy.DESTROY,
  alias: 'app-modex/s3',
  policy: new iam.PolicyDocument({
    statements: [
      // Allow root account full access
      new iam.PolicyStatement({
        sid: 'Enable IAM User Permissions',
        effect: iam.Effect.ALLOW,
        principals: [new iam.AccountRootPrincipal()],
        actions: ['kms:*'],
        resources: ['*'],
      }),
      // Allow S3 service to use the key
      new iam.PolicyStatement({
        sid: 'Allow S3 Service',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('s3.amazonaws.com')],
        actions: [
          'kms:Decrypt',
          'kms:GenerateDataKey',
          'kms:DescribeKey',
        ],
        resources: ['*'],
      }),
      // Allow CloudFront to decrypt objects
      new iam.PolicyStatement({
        sid: 'Allow CloudFront',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: [
          'kms:Decrypt',
          'kms:DescribeKey',
        ],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/*`,
          },
        },
      }),
      // Allow Lambda functions to access encrypted objects
      new iam.PolicyStatement({
        sid: 'Allow Lambda Functions',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('lambda.amazonaws.com')],
        actions: [
          'kms:Decrypt',
          'kms:GenerateDataKey',
          'kms:DescribeKey',
        ],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'kms:ViaService': `s3.${this.region}.amazonaws.com`,
          },
        },
      }),
    ],
  }),
});

// Add tags for key management
cdk.Tags.of(s3EncryptionKey).add('Project', 'App-ModEx');
cdk.Tags.of(s3EncryptionKey).add('Environment', environment);
cdk.Tags.of(s3EncryptionKey).add('Purpose', 'S3-Encryption');

// Output key ARN for reference
new cdk.CfnOutput(this, 'S3EncryptionKeyArn', {
  value: s3EncryptionKey.keyArn,
  description: 'ARN of S3 encryption KMS key',
  exportName: `${this.stackName}-S3EncryptionKeyArn`,
});
```

**Step 2: Apply Customer-Managed Key to S3 Buckets**

```typescript
// Frontend bucket with customer-managed encryption
this.bucket = new s3.Bucket(this, 'WebsiteBucket', {
  bucketName: `app-modex-frontend-${this.account}`,
  publicReadAccess: false,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.KMS,           // Use KMS encryption
  encryptionKey: s3EncryptionKey,                // Your customer-managed key
  bucketKeyEnabled: true,                        // Reduce KMS API calls (cost optimization)
  versioned: true,
  removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
  autoDeleteObjects: environment !== 'prod',
  lifecycleRules: [
    {
      id: 'CleanupOldVersions',
      noncurrentVersionExpiration: cdk.Duration.days(30),
    },
  ],
});

// Data bucket with same encryption key
const dataBucket = new s3.Bucket(this, 'DataBucket', {
  bucketName: `app-modex-data-${this.account}`,
  encryption: s3.BucketEncryption.KMS,
  encryptionKey: s3EncryptionKey,
  bucketKeyEnabled: true,
  versioned: true,
  removalPolicy: cdk.RemovalPolicy.RETAIN,  // Always retain data
  lifecycleRules: [
    {
      id: 'TransitionToIA',
      transitions: [
        {
          storageClass: s3.StorageClass.INFREQUENT_ACCESS,
          transitionAfter: Duration.days(90),
        },
        {
          storageClass: s3.StorageClass.GLACIER,
          transitionAfter: Duration.days(180),
        },
      ],
    },
  ],
});

// Deployment bucket with encryption
this.deploymentBucket = new s3.Bucket(this, 'DeploymentBucket', {
  bucketName: `app-modex-deployments-${this.account}`,
  encryption: s3.BucketEncryption.KMS,
  encryptionKey: s3EncryptionKey,
  bucketKeyEnabled: true,
  versioned: true,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});
```

**Step 3: Grant Access to KMS Key for Services**

```typescript
// Grant Lambda functions access to decrypt/encrypt
s3EncryptionKey.grantEncryptDecrypt(projectsLambda);
s3EncryptionKey.grantEncryptDecrypt(dataProcessingLambda);

// Grant CloudFront OAI access to decrypt
s3EncryptionKey.grant(
  new iam.CanonicalUserPrincipal(
    originAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId
  ),
  'kms:Decrypt',
  'kms:DescribeKey'
);

// Grant CodeBuild access for deployments
s3EncryptionKey.grantEncryptDecrypt(codeBuildRole);

// Grant authenticated users access via Cognito Identity Pool
s3EncryptionKey.grant(authenticatedRole,
  'kms:Decrypt',
  'kms:GenerateDataKey',
  'kms:DescribeKey'
);
```

**Step 4: Configure Bucket Policy for Encrypted Objects**

```typescript
// Add bucket policy requiring encryption
this.bucket.addToResourcePolicy(new iam.PolicyStatement({
  sid: 'DenyUnencryptedObjectUploads',
  effect: iam.Effect.DENY,
  principals: [new iam.AnyPrincipal()],
  actions: ['s3:PutObject'],
  resources: [this.bucket.arnForObjects('*')],
  conditions: {
    StringNotEquals: {
      's3:x-amz-server-side-encryption': 'aws:kms',
    },
  },
}));

// Require specific KMS key for encryption
this.bucket.addToResourcePolicy(new iam.PolicyStatement({
  sid: 'RequireSpecificKMSKey',
  effect: iam.Effect.DENY,
  principals: [new iam.AnyPrincipal()],
  actions: ['s3:PutObject'],
  resources: [this.bucket.arnForObjects('*')],
  conditions: {
    StringNotEquals: {
      's3:x-amz-server-side-encryption-aws-kms-key-id': s3EncryptionKey.keyArn,
    },
  },
}));
```

**Step 5: Enable S3 Bucket Key (Cost Optimization)**

S3 Bucket Keys reduce KMS request costs by up to 99%:

```typescript
// Bucket key is already enabled in the bucket configuration above
// bucketKeyEnabled: true

// Verify bucket key is enabled
const cfnBucket = this.bucket.node.defaultChild as s3.CfnBucket;
cfnBucket.bucketEncryption = {
  serverSideEncryptionConfiguration: [
    {
      serverSideEncryptionByDefault: {
        sseAlgorithm: 'aws:kms',
        kmsMasterKeyId: s3EncryptionKey.keyArn,
      },
      bucketKeyEnabled: true,  // Critical for cost optimization
    },
  ],
};
```

**Step 6: Cross-Region Replication with Encryption**

When replicating encrypted buckets across regions:

```typescript
// Create KMS key in destination region
const replicationKey = new kms.Key(this, 'ReplicationKey', {
  description: 'KMS key for replicated bucket',
  enableKeyRotation: true,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});

// Create replica bucket with its own encryption key
const replicaBucket = new s3.Bucket(this, 'ReplicaBucket', {
  bucketName: `app-modex-data-replica-${this.account}`,
  encryption: s3.BucketEncryption.KMS,
  encryptionKey: replicationKey,
  bucketKeyEnabled: true,
  versioned: true,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});

// Create replication role with KMS permissions
const replicationRole = new iam.Role(this, 'ReplicationRole', {
  assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
});

// Grant permissions to decrypt from source key
s3EncryptionKey.grantDecrypt(replicationRole);

// Grant permissions to encrypt with destination key
replicationKey.grantEncrypt(replicationRole);

// Grant S3 permissions
this.bucket.grantReadWrite(replicationRole);
replicaBucket.grantReadWrite(replicationRole);

// Configure replication with encryption
const cfnBucket = this.bucket.node.defaultChild as s3.CfnBucket;
cfnBucket.replicationConfiguration = {
  role: replicationRole.roleArn,
  rules: [
    {
      id: 'ReplicateEncrypted',
      status: 'Enabled',
      priority: 1,
      filter: {},
      destination: {
        bucket: replicaBucket.bucketArn,
        encryptionConfiguration: {
          replicaKmsKeyId: replicationKey.keyArn,  // Use destination key
        },
        replicationTime: {
          status: 'Enabled',
          time: { minutes: 15 },
        },
      },
      sourceSelectionCriteria: {
        sseKmsEncryptedObjects: {
          status: 'Enabled',  // Replicate encrypted objects
        },
      },
    },
  ],
};
```

**Step 7: Monitor KMS Key Usage and Costs**

```typescript
// Create CloudWatch dashboard for KMS metrics
const kmsDashboard = new cloudwatch.Dashboard(this, 'KmsDashboard', {
  dashboardName: 'App-ModEx-KMS-Monitoring',
});

kmsDashboard.addWidgets(
  new cloudwatch.GraphWidget({
    title: 'KMS API Calls',
    left: [
      new cloudwatch.Metric({
        namespace: 'AWS/KMS',
        metricName: 'NumberOfRequests',
        dimensionsMap: {
          KeyId: s3EncryptionKey.keyId,
        },
        statistic: 'Sum',
        period: Duration.hours(1),
      }),
    ],
  }),
  new cloudwatch.GraphWidget({
    title: 'KMS Errors',
    left: [
      new cloudwatch.Metric({
        namespace: 'AWS/KMS',
        metricName: 'UserErrorCount',
        dimensionsMap: {
          KeyId: s3EncryptionKey.keyId,
        },
        statistic: 'Sum',
        period: Duration.minutes(5),
      }),
    ],
  })
);

// Create alarm for excessive KMS usage (cost control)
const kmsUsageAlarm = new cloudwatch.Alarm(this, 'KmsUsageAlarm', {
  metric: new cloudwatch.Metric({
    namespace: 'AWS/KMS',
    metricName: 'NumberOfRequests',
    dimensionsMap: {
      KeyId: s3EncryptionKey.keyId,
    },
    statistic: 'Sum',
    period: Duration.hours(1),
  }),
  threshold: 10000,  // Alert if more than 10k requests per hour
  evaluationPeriods: 2,
  alarmDescription: 'Alert when KMS usage is unusually high',
  alarmName: 'app-modex-kms-high-usage',
});

kmsUsageAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alertTopic));
```

**Step 8: Key Rotation and Compliance**

```typescript
// Automatic key rotation is enabled by default
// enableKeyRotation: true

// For manual rotation or compliance requirements:
const manualRotationKey = new kms.Key(this, 'ManualRotationKey', {
  description: 'Key with manual rotation',
  enableKeyRotation: false,  // Disable automatic rotation
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});

// Create Lambda function for manual key rotation
const keyRotationLambda = new lambda.Function(this, 'KeyRotationFunction', {
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda/key-rotation'),
  environment: {
    OLD_KEY_ID: manualRotationKey.keyId,
    NEW_KEY_ALIAS: 'app-modex/s3-rotated',
  },
  timeout: Duration.minutes(5),
});

// Grant permissions for key rotation
manualRotationKey.grantAdmin(keyRotationLambda);

// Schedule rotation (e.g., annually)
const rotationRule = new events.Rule(this, 'KeyRotationRule', {
  schedule: events.Schedule.cron({
    month: '1',  // January
    day: '1',    // 1st
    hour: '0',
    minute: '0',
  }),
});

rotationRule.addTarget(new targets.LambdaFunction(keyRotationLambda));
```

**Step 9: Audit and Compliance Logging**

```typescript
// Enable CloudTrail logging for KMS key usage
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';

const trail = new cloudtrail.Trail(this, 'KmsAuditTrail', {
  trailName: 'app-modex-kms-audit',
  sendToCloudWatchLogs: true,
  cloudWatchLogsRetention: logs.RetentionDays.ONE_YEAR,
  includeGlobalServiceEvents: true,
  isMultiRegionTrail: true,
  managementEvents: cloudtrail.ReadWriteType.ALL,
});

// Add event selectors for KMS
trail.addEventSelector(cloudtrail.DataResourceType.KMS_KEY, [
  s3EncryptionKey.keyArn,
  dynamoDbEncryptionKey.keyArn,
]);

// Create log group for KMS events
const kmsLogGroup = new logs.LogGroup(this, 'KmsLogGroup', {
  logGroupName: '/aws/kms/app-modex',
  retention: logs.RetentionDays.ONE_YEAR,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});

// Create metric filter for unauthorized access attempts
const unauthorizedAccessMetric = new logs.MetricFilter(this, 'UnauthorizedKmsAccess', {
  logGroup: kmsLogGroup,
  metricNamespace: 'AppModEx/Security',
  metricName: 'UnauthorizedKMSAccess',
  filterPattern: logs.FilterPattern.literal('"errorCode"="AccessDenied"'),
  metricValue: '1',
});

// Alert on unauthorized access
const unauthorizedAccessAlarm = new cloudwatch.Alarm(this, 'UnauthorizedKmsAccessAlarm', {
  metric: unauthorizedAccessMetric.metric(),
  threshold: 5,
  evaluationPeriods: 1,
  alarmDescription: 'Alert on unauthorized KMS access attempts',
  alarmName: 'app-modex-kms-unauthorized-access',
});

unauthorizedAccessAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alertTopic));
```

**Cost Considerations for BYOK:**

- **KMS API Calls**: $0.03 per 10,000 requests
- **S3 Bucket Keys**: Reduce costs by up to 99% by reducing KMS API calls
- **Key Storage**: $1/month per customer-managed key
- **Automatic Rotation**: No additional cost

**Best Practices:**
1. Enable S3 Bucket Keys to reduce KMS costs
2. Use the same KMS key for related resources (e.g., all S3 buckets)
3. Enable automatic key rotation for compliance
4. Monitor KMS usage with CloudWatch alarms
5. Use IAM policies to restrict key access
6. Enable CloudTrail logging for audit compliance
7. Tag keys for cost allocation and management

**Access Logging:**

```typescript
// Create logging bucket
const logBucket = new s3.Bucket(this, 'LogBucket', {
  bucketName: `app-modex-logs-${this.account}`,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
  lifecycleRules: [
    {
      expiration: Duration.days(90),
    },
  ],
});

// Enable access logging
this.bucket = new s3.Bucket(this, 'WebsiteBucket', {
  bucketName: `app-modex-frontend-${this.account}`,
  serverAccessLogsBucket: logBucket,
  serverAccessLogsPrefix: 'frontend-access-logs/',
  // ... rest of config
});
```

---

## Monitoring and Logging

### CloudWatch Dashboards

```typescript
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

// Create dashboard
const dashboard = new cloudwatch.Dashboard(this, 'AppModExDashboard', {
  dashboardName: 'App-ModEx-Monitoring',
});

// Add API Gateway metrics
dashboard.addWidgets(
  new cloudwatch.GraphWidget({
    title: 'API Gateway Requests',
    left: [
      this.api.metricCount({ statistic: 'Sum' }),
      this.api.metric4XXError({ statistic: 'Sum' }),
      this.api.metric5XXError({ statistic: 'Sum' }),
    ],
  })
);

// Add Lambda metrics
dashboard.addWidgets(
  new cloudwatch.GraphWidget({
    title: 'Lambda Invocations',
    left: [
      projectsLambda.metricInvocations({ statistic: 'Sum' }),
      projectsLambda.metricErrors({ statistic: 'Sum' }),
      projectsLambda.metricThrottles({ statistic: 'Sum' }),
    ],
  })
);

// Add DynamoDB metrics
dashboard.addWidgets(
  new cloudwatch.GraphWidget({
    title: 'DynamoDB Operations',
    left: [
      this.projectsTable.metricConsumedReadCapacityUnits(),
      this.projectsTable.metricConsumedWriteCapacityUnits(),
    ],
  })
);
```

### CloudWatch Alarms

```typescript
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';

// Create SNS topic for alerts
const alertTopic = new sns.Topic(this, 'AlertTopic', {
  topicName: 'app-modex-alerts',
  displayName: 'App-ModEx Alerts',
});

// Add email subscription
alertTopic.addSubscription(
  new subscriptions.EmailSubscription('ops-team@yourcompany.com')
);

// API Gateway 5XX errors alarm
const api5xxAlarm = new cloudwatch.Alarm(this, 'Api5xxAlarm', {
  metric: this.api.metric5XXError({
    statistic: 'Sum',
    period: Duration.minutes(5),
  }),
  threshold: 10,
  evaluationPeriods: 2,
  alarmDescription: 'Alert when API Gateway 5XX errors exceed threshold',
  alarmName: 'app-modex-api-5xx-errors',
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
});

api5xxAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alertTopic));

// Lambda errors alarm
const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
  metric: projectsLambda.metricErrors({
    statistic: 'Sum',
    period: Duration.minutes(5),
  }),
  threshold: 5,
  evaluationPeriods: 2,
  alarmDescription: 'Alert when Lambda errors exceed threshold',
  alarmName: 'app-modex-lambda-errors',
});

lambdaErrorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alertTopic));

// DynamoDB throttling alarm
const dynamoThrottleAlarm = new cloudwatch.Alarm(this, 'DynamoThrottleAlarm', {
  metric: this.projectsTable.metricUserErrors({
    statistic: 'Sum',
    period: Duration.minutes(5),
  }),
  threshold: 10,
  evaluationPeriods: 2,
  alarmDescription: 'Alert when DynamoDB throttling occurs',
  alarmName: 'app-modex-dynamo-throttle',
});

dynamoThrottleAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alertTopic));
```

### X-Ray Tracing

```typescript
// Enable X-Ray for Lambda functions
const projectsLambda = new lambda.Function(this, 'ProjectsFunction', {
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda/projects'),
  tracing: lambda.Tracing.ACTIVE,  // Enable X-Ray
  // ... rest of config
});

// Enable X-Ray for API Gateway (already enabled in deployOptions)
this.api = new apigateway.RestApi(this, 'AppModExApi', {
  // ... existing config ...
  deployOptions: {
    stageName: environment,
    tracingEnabled: true,  // Enable X-Ray
    // ... rest of config
  },
});
```

### Centralized Logging

```typescript
// Create log group with retention
const logGroup = new logs.LogGroup(this, 'ApplicationLogs', {
  logGroupName: '/app-modex/application',
  retention: logs.RetentionDays.ONE_MONTH,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});

// Create log subscription for analysis
const logSubscription = new logs.SubscriptionFilter(this, 'LogSubscription', {
  logGroup: logGroup,
  destination: new logs_destinations.LambdaDestination(logProcessorLambda),
  filterPattern: logs.FilterPattern.allEvents(),
});
```

---

## Security Configuration

### WAF Rules Customization

Edit `infrastructure/lib/app-modex-frontend-stack.ts`:

```typescript
// Add custom WAF rules
webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
  name: `App-ModEx-Master-WebACL`,
  scope: 'CLOUDFRONT',
  defaultAction: { allow: {} },
  visibilityConfig: {
    cloudWatchMetricsEnabled: true,
    metricName: `App-ModEx-Master-WebACL`,
    sampledRequestsEnabled: true,
  },
  rules: [
    // ... existing AWS managed rules ...
    
    // Custom rule: Block specific countries
    {
      name: 'GeoBlockingRule',
      priority: 10,
      action: { block: {} },
      statement: {
        geoMatchStatement: {
          countryCodes: ['CN', 'RU', 'KP'],  // Block China, Russia, North Korea
        },
      },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'GeoBlockingRule',
      },
    },
    
    // Custom rule: IP safelist
    {
      name: 'IPsafelistRule',
      priority: 11,
      action: { allow: {} },
      statement: {
        ipSetReferenceStatement: {
          arn: ipSet.attrArn,  // Reference to IP set
        },
      },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'IPsafelistRule',
      },
    },
    
    // Custom rule: SQL injection protection
    {
      name: 'SQLInjectionRule',
      priority: 12,
      action: { block: {} },
      statement: {
        sqliMatchStatement: {
          fieldToMatch: {
            allQueryArguments: {},
          },
          textTransformations: [
            {
              priority: 0,
              type: 'URL_DECODE',
            },
            {
              priority: 1,
              type: 'HTML_ENTITY_DECODE',
            },
          ],
        },
      },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'SQLInjectionRule',
      },
    },
  ],
});

// Create IP set for safelist
const ipSet = new wafv2.CfnIPSet(this, 'IPsafelist', {
  name: 'app-modex-ip-safelist',
  scope: 'CLOUDFRONT',
  ipAddressVersion: 'IPV4',
  addresses: [
    '203.0.113.0/24',  // Your office IP range
    '198.51.100.0/24', // Your VPN IP range
  ],
});
```

### Secrets Management

```typescript
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

// Create secret for sensitive configuration
const apiSecret = new secretsmanager.Secret(this, 'ApiSecret', {
  secretName: 'app-modex/api-config',
  description: 'API configuration secrets',
  generateSecretString: {
    secretStringTemplate: JSON.stringify({
      apiKey: '',
      webhookUrl: '',
    }),
    generateStringKey: 'apiKey',
    excludePunctuation: true,
    passwordLength: 32,
  },
});

// Grant Lambda access to secret
apiSecret.grantRead(projectsLambda);

// Use secret in Lambda
const projectsLambda = new lambda.Function(this, 'ProjectsFunction', {
  // ... existing config ...
  environment: {
    SECRET_ARN: apiSecret.secretArn,
  },
});
```

**Lambda code to access secret:**

```javascript
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const client = new SecretsManagerClient({ region: process.env.AWS_REGION });

async function getSecret() {
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: process.env.SECRET_ARN })
  );
  return JSON.parse(response.SecretString);
}
```

### IAM Policies - Least Privilege

```typescript
// Instead of broad permissions, use specific resources
authenticatedRole.addToPolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: [
    's3:GetObject',
    's3:PutObject',
  ],
  resources: [
    `arn:aws:s3:::app-modex-data-${projectId}/*`,  // Specific project bucket
  ],
  conditions: {
    StringEquals: {
      's3:ExistingObjectTag/ProjectId': projectId,  // Tag-based access
    },
  },
}));

// Use resource-based policies
this.projectsTable.grantReadWriteData(projectsLambda);  // Specific table access
```

---

## Regional Deployment

> **💰 COST IMPACT: YES - Significant increase for multi-region**
> 
> **Additional Cost:** +80-150% of base infrastructure cost per additional region
> 
> **How to Calculate Your Cost:**
> 1. Note: Current monthly AWS bill for single region
> 2. Active-Passive (DR): Add 80% of current cost
> 3. Active-Active: Add 100-150% of current cost
> 4. Add: Data transfer = GB replicated × $0.09/GB (cross-region)
> 5. Go to: https://calculator.aws/ and duplicate your services in second region
> 
> **Example:**
> - Single region: $50/month
> - With DR (Active-Passive): $50 + $40 = $90/month
> - Multi-region (Active-Active): $50 + $60 = $110/month

### Multi-Region Architecture

**Primary Region: us-west-2**
- Backend API
- DynamoDB tables
- Lambda functions
- Bedrock models (direct invocation)

**Secondary Region: us-east-1**
- Frontend (CloudFront + WAF)
- DynamoDB global table replica
- Disaster recovery

**Configuration:**

Edit `infrastructure/bin/app-modex-infrastructure.ts`:

```typescript
// Primary backend in us-west-2
const primaryBackend = new AppModExBackendStack(app, 'AppModEx-Backend-Primary', {
  environment: 'prod',
  env: {
    account: account,
    region: 'us-west-2',
  },
});

// Secondary backend in us-east-1 (DR)
const secondaryBackend = new AppModExBackendStack(app, 'AppModEx-Backend-Secondary', {
  environment: 'prod',
  env: {
    account: account,
    region: 'us-east-1',
  },
});

// Enable DynamoDB global tables
primaryBackend.projectsTable.addGlobalSecondaryIndex({
  indexName: 'region-index',
  partitionKey: { name: 'region', type: dynamodb.AttributeType.STRING },
});
```

### Route 53 Health Checks and Failover

```typescript
import * as route53 from 'aws-cdk-lib/aws-route53';

// Create health check for primary region
const primaryHealthCheck = new route53.CfnHealthCheck(this, 'PrimaryHealthCheck', {
  healthCheckConfig: {
    type: 'HTTPS',
    resourcePath: '/health',
    fullyQualifiedDomainName: 'api-us-west-2.app-modex.yourcompany.com',
    port: 443,
    requestInterval: 30,
    failureThreshold: 3,
  },
});

// Create failover records
new route53.ARecord(this, 'PrimaryRecord', {
  zone: hostedZone,
  recordName: 'api.app-modex.yourcompany.com',
  target: route53.RecordTarget.fromAlias(
    new route53Targets.ApiGatewayDomain(primaryApiDomain)
  ),
  setIdentifier: 'Primary',
  failover: route53.FailoverType.PRIMARY,
  evaluateTargetHealth: true,
});

new route53.ARecord(this, 'SecondaryRecord', {
  zone: hostedZone,
  recordName: 'api.app-modex.yourcompany.com',
  target: route53.RecordTarget.fromAlias(
    new route53Targets.ApiGatewayDomain(secondaryApiDomain)
  ),
  setIdentifier: 'Secondary',
  failover: route53.FailoverType.SECONDARY,
});
```

### Region-Specific Configuration

Create `infrastructure/config/regions.ts`:

```typescript
export interface RegionConfig {
  region: string;
  availabilityZones: string[];
  vpcCidr: string;
  natGateways: number;
  bedrockModels: string[];
}

export const REGION_CONFIGS: Record<string, RegionConfig> = {
  'us-west-2': {
    region: 'us-west-2',
    availabilityZones: ['us-west-2a', 'us-west-2b', 'us-west-2c'],
    vpcCidr: '10.0.0.0/16',
    natGateways: 3,
    bedrockModels: ['claude-3-7-sonnet', 'nova-lite'],
  },
  'us-east-1': {
    region: 'us-east-1',
    availabilityZones: ['us-east-1a', 'us-east-1b', 'us-east-1c'],
    vpcCidr: '10.1.0.0/16',
    natGateways: 3,
    bedrockModels: ['claude-3-7-sonnet', 'nova-lite'],
  },
  'eu-west-1': {
    region: 'eu-west-1',
    availabilityZones: ['eu-west-1a', 'eu-west-1b', 'eu-west-1c'],
    vpcCidr: '10.2.0.0/16',
    natGateways: 2,
    bedrockModels: ['claude-3-haiku'],  // Limited model availability
  },
};
```

---

## Environment Variables

### Frontend Environment Variables

Create `app-modex-ui/.env.production`:

```bash
# API Configuration
REACT_APP_API_URL=https://api.app-modex.yourcompany.com
REACT_APP_AWS_REGION=us-west-2

# Cognito Configuration
REACT_APP_USER_POOL_ID=us-west-2_XXXXXXXXX
REACT_APP_USER_POOL_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
REACT_APP_IDENTITY_POOL_ID=us-west-2:XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX

# Cognito Hosted UI (Optional - for advanced auth flows)
REACT_APP_COGNITO_DOMAIN_URL=https://your-domain.auth.us-west-2.amazoncognito.com
REACT_APP_USE_HOSTED_UI=false

# S3 Configuration
REACT_APP_S3_BUCKET=app-modex-data-ACCOUNT-ID

# CloudFront Configuration
REACT_APP_CLOUDFRONT_URL=https://app-modex.yourcompany.com

# Core Feature Flags
REACT_APP_USE_MOCK_API=false
REACT_APP_AUTH_REQUIRED=true
REACT_APP_DEBUG_MODE=false

# Advanced Feature Flags (New in v2.0)
REACT_APP_REAL_TIME_UPDATES=true
REACT_APP_ANALYTICS_ENABLED=true

# Development/Testing Flags
REACT_APP_DISABLE_ERROR_OVERLAY=true

# Optional: Third-party integrations
REACT_APP_GOOGLE_ANALYTICS_ID=UA-XXXXXXXXX-X
REACT_APP_SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
```

### Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REACT_APP_API_URL` | Yes | - | Backend API Gateway URL |
| `REACT_APP_AWS_REGION` | Yes | us-west-2 | AWS region for services |
| `REACT_APP_USER_POOL_ID` | Yes* | - | Cognito User Pool ID |
| `REACT_APP_USER_POOL_CLIENT_ID` | Yes* | - | Cognito Client ID |
| `REACT_APP_IDENTITY_POOL_ID` | No | - | For AWS SDK credentials |
| `REACT_APP_S3_BUCKET` | No | - | For direct S3 uploads |
| `REACT_APP_COGNITO_DOMAIN_URL` | No | - | For hosted UI auth |
| `REACT_APP_USE_MOCK_API` | No | false | Enable mock API mode |
| `REACT_APP_AUTH_REQUIRED` | No | true | Enable authentication |
| `REACT_APP_REAL_TIME_UPDATES` | No | false | Enable real-time features |
| `REACT_APP_ANALYTICS_ENABLED` | No | false | Enable analytics tracking |
| `REACT_APP_DEBUG_MODE` | No | false | Enable debug logging |

*Required when `REACT_APP_AUTH_REQUIRED=true`

### Backend Environment Variables

Lambda functions receive environment variables from CDK:

```typescript
const projectsLambda = new lambda.Function(this, 'ProjectsFunction', {
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda/projects'),
  environment: {
    // DynamoDB Tables
    PROJECTS_TABLE: this.projectsTable.tableName,
    PROJECT_DATA_TABLE: this.projectDataTable.tableName,
    
    // S3 Buckets
    DEPLOYMENT_BUCKET: this.deploymentBucket.bucketName,
    
    // SQS Queues
    PROJECT_OPERATIONS_QUEUE_URL: this.projectOperationsQueue.queueUrl,
    
    // Cognito
    USER_POOL_ID: this.userPool.userPoolId,
    IDENTITY_POOL_ID: this.identityPool.ref,
    
    // Bedrock Model Configuration
    NORMALIZATION_MODEL_ID: 'amazon.nova-lite-v1:0',
    PILOT_ANALYSIS_MODEL_ID: 'anthropic.claude-3-7-sonnet-20250219-v1:0',
    PILOT_ANALYSIS_AGENT_ID: pilotAnalysisAgentId,
    PILOT_ANALYSIS_AGENT_ALIAS_ID: pilotAnalysisAgentAliasId,
    
    // Configuration
    ENVIRONMENT: environment,
    AWS_REGION: this.region,
    LOG_LEVEL: environment === 'prod' ? 'INFO' : 'DEBUG',
    
    // Feature Flags
    ENABLE_XRAY: 'true',
    ENABLE_DETAILED_LOGGING: environment !== 'prod' ? 'true' : 'false',
  },
});
```

### Generating Environment Files

Use the provided script to generate `.env` files from deployed infrastructure:

```bash
cd infrastructure/scripts

# Generate .env for development
./generate_env.sh --region us-west-2 --profile app-modex-dev

# Generate .env for production
./generate_env.sh --region us-west-2 --profile app-modex-prod --output ../../app-modex-ui/.env.production
```

---

## CDK Version Management

> **💰 COST IMPACT: NO - Version management has no additional costs**
> 
> **Important:** CDK version mismatches can cause deployment failures

App-ModEx uses specific CDK versions that must be maintained consistently across environments.

### Current Version Requirements

**File Location**: `infrastructure/package.json`

```json
{
  "devDependencies": {
    "aws-cdk": "^2.87.0",
    "typescript": "~4.9.5"
  },
  "dependencies": {
    "@aws-cdk/aws-bedrock-alpha": "^2.230.0-alpha.0",
    "aws-cdk-lib": "^2.87.0",
    "constructs": "^10.0.0"
  }
}
```

### Version Compatibility Matrix

| CDK Version | Bedrock Alpha | TypeScript | Node.js | Status |
|-------------|---------------|------------|---------|---------|
| 2.87.0 | 2.230.0-alpha.0 | 4.9.5 | 22.x | ✅ Current |
| 2.85.0 | 2.220.0-alpha.0 | 4.9.5 | 22.x | ⚠️ Previous |
| 2.90.0+ | 2.240.0-alpha.0+ | 5.0.0+ | 22.x | 🔄 Future |

### Upgrading CDK Versions

**Step 1: Check Compatibility**
```bash
# Check current versions
cd infrastructure
npm list aws-cdk-lib @aws-cdk/aws-bedrock-alpha

# Check for updates
npm outdated
```

**Step 2: Update Dependencies**
```bash
# Update CDK core
npm install aws-cdk@^2.90.0 aws-cdk-lib@^2.90.0

# Update Bedrock alpha (check compatibility)
npm install @aws-cdk/aws-bedrock-alpha@^2.240.0-alpha.0

# Update TypeScript if needed
npm install typescript@~5.0.0
```

**Step 3: Test Deployment**
```bash
# Synthesize to check for breaking changes
npm run build
npx cdk synth

# Deploy to development first
./scripts/deploy-backend.sh -e dev -r us-west-2
```

### Breaking Changes to Watch

**CDK v2.90.0+ Changes:**
- Bedrock Runtime API updates
- Lambda runtime updates
- IAM policy changes

**Bedrock Alpha Changes:**
- Agent instruction format updates
- Model ID changes
- Permission requirements

### Version Lock Strategy

**For Production:**
```json
{
  "devDependencies": {
    "aws-cdk": "2.87.0",  // Exact version
    "typescript": "4.9.5"
  },
  "dependencies": {
    "@aws-cdk/aws-bedrock-alpha": "2.230.0-alpha.0",  // Exact version
    "aws-cdk-lib": "2.87.0"
  }
}
```

**For Development:**
```json
{
  "devDependencies": {
    "aws-cdk": "^2.87.0",  // Allow patch updates
    "typescript": "~4.9.5"
  }
}
```

### Troubleshooting Version Issues

**Common Errors:**
1. **"CDK version mismatch"**: Ensure all CDK packages use same version
2. **"Bedrock construct not found"**: Update alpha package
3. **"TypeScript compilation errors"**: Check TypeScript compatibility

**Resolution Commands:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Force CDK version alignment
npm install aws-cdk@2.87.0 aws-cdk-lib@2.87.0 --save-exact

# Check for peer dependency issues
npm ls
```

---

## CI/CD Pipeline Setup

### GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy App-ModEx

on:
  push:
    branches:
      - main
      - develop
  pull_request:
    branches:
      - main

env:
  AWS_REGION: us-west-2
  NODE_VERSION: 18

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      
      - name: Install dependencies
        run: |
          cd app-modex-ui
          npm ci
      
      - name: Run tests
        run: |
          cd app-modex-ui
          npm test -- --coverage
      
      - name: Run linter
        run: |
          cd app-modex-ui
          npm run lint

  deploy-dev:
    needs: test
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    environment: development
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID_DEV }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY_DEV }}
          aws-region: ${{ env.AWS_REGION }}
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: ${{ env.NODE_VERSION }}
      
      - name: Install CDK
        run: npm install -g aws-cdk@2.100.0
      
      - name: Deploy infrastructure
        run: |
          cd infrastructure
          npm ci
          npm run build
          cdk deploy --all --require-approval never
      
      - name: Build and deploy frontend
        run: |
          cd app-modex-ui
          npm ci
          npm run build
          aws s3 sync build/ s3://app-modex-frontend-${{ secrets.AWS_ACCOUNT_ID }}/ --delete
          aws cloudfront create-invalidation --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} --paths "/*"

  deploy-prod:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID_PROD }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY_PROD }}
          aws-region: ${{ env.AWS_REGION }}
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: ${{ env.NODE_VERSION }}
      
      - name: Install CDK
        run: npm install -g aws-cdk@2.100.0
      
      - name: Deploy infrastructure
        run: |
          cd infrastructure
          npm ci
          npm run build
          cdk deploy --all --require-approval never
      
      - name: Build and deploy frontend
        run: |
          cd app-modex-ui
          npm ci
          npm run build
          aws s3 sync build/ s3://app-modex-frontend-${{ secrets.AWS_ACCOUNT_ID }}/ --delete
          aws cloudfront create-invalidation --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} --paths "/*"
      
      - name: Run smoke tests
        run: |
          curl -f https://app-modex.yourcompany.com || exit 1
```

---

## Cost Optimization

### Lambda Optimization

**Right-size Memory:**

```typescript
// Test different memory configurations
const projectsLambda = new lambda.Function(this, 'ProjectsFunction', {
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda/projects'),
  memorySize: 512,  // Start with 512MB, adjust based on CloudWatch metrics
  timeout: Duration.seconds(30),
  // ... rest of config
});

// Use Lambda Power Tuning to find optimal memory
// https://github.com/alexcasalboni/aws-lambda-power-tuning
```

**Reserved Concurrency:**

```typescript
// For predictable workloads, use reserved concurrency
projectsLambda.addAlias('prod', {
  provisionedConcurrentExecutions: 5,  // Keep 5 instances warm
});
```

### DynamoDB Cost Optimization

```typescript
// Use on-demand for unpredictable workloads
billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,

// Use provisioned with auto-scaling for predictable workloads
billingMode: dynamodb.BillingMode.PROVISIONED,
readCapacity: 5,
writeCapacity: 5,

// Enable DynamoDB table class for infrequent access
tableClass: dynamodb.TableClass.STANDARD_INFREQUENT_ACCESS,
```

### S3 Cost Optimization

```typescript
// Use Intelligent-Tiering for automatic cost optimization
this.bucket = new s3.Bucket(this, 'DataBucket', {
  bucketName: `app-modex-data-${this.account}`,
  intelligentTieringConfigurations: [
    {
      name: 'AutoArchive',
      archiveAccessTierTime: Duration.days(90),
      deepArchiveAccessTierTime: Duration.days(180),
    },
  ],
  lifecycleRules: [
    {
      id: 'DeleteOldVersions',
      noncurrentVersionExpiration: Duration.days(30),
    },
  ],
});
```

### CloudFront Cost Optimization

```typescript
// Use appropriate price class
this.distribution = new cloudfront.Distribution(this, 'Distribution', {
  // ... existing config ...
  priceClass: cloudfront.PriceClass.PRICE_CLASS_100,  // North America + Europe only
  // Use PRICE_CLASS_200 for Asia Pacific
  // Use PRICE_CLASS_ALL for global coverage
});
```

### Bedrock Cost Optimization

```typescript
// Use cheaper models for simple tasks
const normalizationAgent = new bedrock.CfnAgent(this, 'NormalizationAgent', {
  foundationModel: 'amazon.nova-lite-v1:0',  // Cheapest option
  // ... rest of config
});

// Use expensive models only for complex tasks
const pilotAnalysisAgent = new bedrock.CfnAgent(this, 'PilotAnalysisAgent', {
  foundationModel: 'anthropic.claude-3-7-sonnet-20250219-v1:0',  // High quality
  // ... rest of config
});

// Implement caching in Lambda to reduce Bedrock calls
```

### Cost Monitoring

```typescript
import * as budgets from 'aws-cdk-lib/aws-budgets';

// Create budget alert
new budgets.CfnBudget(this, 'MonthlyBudget', {
  budget: {
    budgetName: 'app-modex-monthly-budget',
    budgetType: 'COST',
    timeUnit: 'MONTHLY',
    budgetLimit: {
      amount: 500,  // $500/month
      unit: 'USD',
    },
  },
  notificationsWithSubscribers: [
    {
      notification: {
        notificationType: 'ACTUAL',
        comparisonOperator: 'GREATER_THAN',
        threshold: 80,  // Alert at 80%
        thresholdType: 'PERCENTAGE',
      },
      subscribers: [
        {
          subscriptionType: 'EMAIL',
          address: 'billing@yourcompany.com',
        },
      ],
    },
  ],
});
```

---

## Backup and Disaster Recovery

### Automated Backups

```typescript
import * as backup from 'aws-cdk-lib/aws-backup';

// Create backup vault
const backupVault = new backup.BackupVault(this, 'BackupVault', {
  backupVaultName: 'app-modex-backup-vault',
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});

// Create backup plan
const backupPlan = new backup.BackupPlan(this, 'BackupPlan', {
  backupPlanName: 'app-modex-backup-plan',
  backupPlanRules: [
    // Daily backups
    new backup.BackupPlanRule({
      ruleName: 'DailyBackup',
      scheduleExpression: backup.Schedule.cron({
        hour: '2',
        minute: '0',
      }),
      deleteAfter: Duration.days(7),
    }),
    // Weekly backups
    new backup.BackupPlanRule({
      ruleName: 'WeeklyBackup',
      scheduleExpression: backup.Schedule.cron({
        weekDay: 'SUN',
        hour: '3',
        minute: '0',
      }),
      deleteAfter: Duration.days(30),
      moveToColdStorageAfter: Duration.days(7),
    }),
    // Monthly backups
    new backup.BackupPlanRule({
      ruleName: 'MonthlyBackup',
      scheduleExpression: backup.Schedule.cron({
        day: '1',
        hour: '4',
        minute: '0',
      }),
      deleteAfter: Duration.days(365),
      moveToColdStorageAfter: Duration.days(30),
    }),
  ],
});

// Add resources to backup
backupPlan.addSelection('BackupSelection', {
  resources: [
    backup.BackupResource.fromDynamoDbTable(this.projectsTable),
    backup.BackupResource.fromDynamoDbTable(this.projectDataTable),
  ],
});
```

### Disaster Recovery Testing

Create `scripts/dr-test.sh`:

```bash
#!/bin/bash

# Disaster Recovery Test Script

set -e

echo "Starting DR test..."

# 1. Verify backups exist
echo "Checking backups..."
aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name app-modex-backup-vault \
  --profile app-modex-prod

# 2. Test restore to secondary region
echo "Testing restore to secondary region..."
aws backup start-restore-job \
  --recovery-point-arn <RECOVERY_POINT_ARN> \
  --metadata file://restore-metadata.json \
  --iam-role-arn <RESTORE_ROLE_ARN> \
  --region us-east-1 \
  --profile app-modex-prod

# 3. Verify restored resources
echo "Verifying restored resources..."
aws dynamodb describe-table \
  --table-name app-modex-projects-dr \
  --region us-east-1 \
  --profile app-modex-prod

# 4. Run smoke tests
echo "Running smoke tests..."
curl -f https://api-dr.app-modex.yourcompany.com/health || exit 1

echo "DR test completed successfully!"
```

---

## Quick Reference

### Common Deployment Commands

```bash
# Full deployment (backend + frontend)
cd infrastructure
./scripts/deploy.sh --profile app-modex-prod --region us-west-2

# Backend only
./scripts/deploy-backend.sh --profile app-modex-prod --region us-west-2

# Frontend only
./scripts/deploy-frontend.sh --profile app-modex-prod

# Prompt Templates stack only
./scripts/deploy-prompt-templates-stack.sh --profile app-modex-prod --region us-west-2

# Force Lambda redeployment
./scripts/deploy-backend.sh --force-lambda --profile app-modex-prod --region us-west-2

# Generate environment file
./scripts/generate_env.sh --region us-west-2 --profile app-modex-prod
```

### Useful AWS CLI Commands

```bash
# Check CloudFormation stack status
aws cloudformation describe-stacks \
  --stack-name AppModEx-Backend \
  --profile app-modex-prod

# List Lambda functions
aws lambda list-functions \
  --query 'Functions[?starts_with(FunctionName, `app-modex`)].FunctionName' \
  --profile app-modex-prod

# Check API Gateway endpoints
aws apigateway get-rest-apis \
  --query 'items[?name==`app-modex-api`]' \
  --profile app-modex-prod

# View CloudWatch logs
aws logs tail /aws/lambda/app-modex-projects --follow \
  --profile app-modex-prod

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*" \
  --profile app-modex-prod
```

---

## Troubleshooting

### Common Issues and Solutions

**Issue: CDK deployment fails with "Resource already exists"**
```bash
# Solution: Import existing resource or delete and recreate
cdk import AppModEx-Backend --profile app-modex-prod
```

**Issue: Lambda function timeout**
```typescript
// Solution: Increase timeout and memory
timeout: Duration.minutes(5),
memorySize: 1024,
```

**Issue: CORS errors in browser**
```typescript
// Solution: Verify CORS configuration includes your domain
allowOrigins: ['https://app-modex.yourcompany.com'],
```

**Issue: Cognito authentication fails**
```bash
# Solution: Verify callback URLs match exactly
aws cognito-idp describe-user-pool-client \
  --user-pool-id us-west-2_XXXXXXXXX \
  --client-id XXXXXXXXXXXXXXXXXXXXXXXXXX \
  --profile app-modex-prod
```

**Issue: Bedrock model invocation failing**
```bash
# Solution: Check model access and IAM permissions
aws bedrock list-foundation-models \
  --profile app-modex-prod

# Verify Lambda has bedrock:InvokeModel permission
aws iam get-role-policy \
  --role-name YourLambdaRoleName \
  --policy-name BedrockPolicy \
  --profile app-modex-prod
```

---

## UI Branding and Theming

> **💰 COST IMPACT: NO - Cosmetic changes only**

Organizations want App-ModEx to match their corporate branding and visual identity. This section covers customizing the user interface appearance.

### Cloudscape Theme Configuration

**File**: `app-modex-ui/src/App.js`

```javascript
import { applyMode, Mode } from '@cloudscape-design/global-styles';

// Apply theme on app load
useEffect(() => {
  // Options: Mode.Light, Mode.Dark
  applyMode(Mode.Light);
}, []);

// Or allow user preference
const [theme, setTheme] = useState(
  localStorage.getItem('theme') || Mode.Light
);

useEffect(() => {
  applyMode(theme);
  localStorage.setItem('theme', theme);
}, [theme]);
```

### Custom CSS Variables

**File**: `app-modex-ui/src/index.css`

```css
/* Override Cloudscape Design System variables */
:root {
  /* Primary brand colors */
  --custom-primary-color: #0073bb;
  --custom-secondary-color: #ec7211;
  
  /* Override Cloudscape variables */
  --awsui-color-background-button-primary-default: var(--custom-primary-color);
  --awsui-color-text-link-default: var(--custom-primary-color);
  
  /* Custom font family */
  --awsui-font-family-base: 'Your-Corporate-Font', 'Amazon Ember', sans-serif;
  
  /* Custom spacing */
  --custom-header-height: 60px;
  --custom-sidebar-width: 280px;
}

/* Custom header styling */
.custom-header {
  background-color: var(--custom-primary-color);
  height: var(--custom-header-height);
}

/* Custom navigation */
.awsui-side-navigation {
  width: var(--custom-sidebar-width);
}
```

### Logo and Favicon Replacement

**Files to replace**:
- `app-modex-ui/public/logo.svg` - Main application logo
- `app-modex-ui/public/favicon.ico` - Browser favicon
- `app-modex-ui/public/logo192.png` - PWA icon (192x192)
- `app-modex-ui/public/logo512.png` - PWA icon (512x512)

**Update manifest**:

**File**: `app-modex-ui/public/manifest.json`

```json
{
  "short_name": "YourCompany ModEx",
  "name": "YourCompany Application Modernization Explorer",
  "icons": [
    {
      "src": "favicon.ico",
      "sizes": "64x64 32x32 24x24 16x16",
      "type": "image/x-icon"
    },
    {
      "src": "logo192.png",
      "type": "image/png",
      "sizes": "192x192"
    },
    {
      "src": "logo512.png",
      "type": "image/png",
      "sizes": "512x512"
    }
  ],
  "start_url": ".",
  "display": "standalone",
  "theme_color": "#0073bb",
  "background_color": "#ffffff"
}
```

### Application Title and Metadata

**File**: `app-modex-ui/public/index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%PUBLIC_URL%/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0073bb" />
    <meta
      name="description"
      content="YourCompany Application Modernization Explorer"
    />
    <link rel="apple-touch-icon" href="%PUBLIC_URL%/logo192.png" />
    <link rel="manifest" href="%PUBLIC_URL%/manifest.json" />
    <title>YourCompany ModEx</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this application.</noscript>
    <div id="root"></div>
  </body>
</html>
```

### Custom Chart Colors

**File**: `app-modex-ui/src/components/charts/index.js`

```javascript
// Define custom color schemes for D3.js charts
export const CUSTOM_COLOR_SCHEMES = {
  primary: [
    '#0073bb', // Your primary blue
    '#ec7211', // Your secondary orange
    '#1d8102', // Your success green
    '#d13212', // Your error red
    '#8b0a50', // Your accent purple
  ],
  
  heatmap: {
    low: '#e6f2ff',
    medium: '#0073bb',
    high: '#003d66',
  },
  
  status: {
    success: '#1d8102',
    warning: '#ec7211',
    error: '#d13212',
    info: '#0073bb',
  }
};

// Use in chart components
import { CUSTOM_COLOR_SCHEMES } from './index';

const colorScale = d3.scaleOrdinal()
  .range(CUSTOM_COLOR_SCHEMES.primary);
```

### Navigation Structure Customization

**File**: `app-modex-ui/src/components/CustomSideNavigation.js`

```javascript
// Customize navigation items
const navigationItems = [
  {
    type: 'section',
    text: t('navigation.yourSection'),
    items: [
      {
        type: 'link',
        text: t('navigation.yourCustomPage'),
        href: '/custom-page',
      },
      // Add your custom navigation items
    ]
  },
  // Keep or modify existing sections
];
```

### Deployment

After making branding changes:

```bash
cd app-modex-ui
npm run build
cd ../infrastructure
./scripts/deploy-frontend-stack.sh --profile your-profile
```

---

## Business Rules and Scoring Algorithms

> **💰 COST IMPACT: NO - Logic changes only**

Different organizations have different criteria for modernization decisions. This section covers customizing business rules and scoring algorithms.

### Similarity Threshold Configuration

**File**: `infrastructure/lambda/project-specific/component-similarity-process-small/index.js`

```javascript
// Default similarity threshold (0.0 to 1.0)
const DEFAULT_SIMILARITY_THRESHOLD = 0.7; // 70%

// Customize threshold
const minThreshold = filters.minSimilarityScore || DEFAULT_SIMILARITY_THRESHOLD;

// Make it configurable per project
const projectConfig = await getProjectConfiguration(projectId);
const threshold = projectConfig.similarityThreshold || DEFAULT_SIMILARITY_THRESHOLD;
```

**Frontend Configuration**:

**File**: `app-modex-ui/src/pages/similarities/ApplicationSimilaritiesPage.js`

```javascript
// Allow users to adjust threshold
const [threshold, setThreshold] = useState(70); // Default 70%

<Slider
  value={threshold}
  onChange={({ detail }) => setThreshold(detail.value)}
  min={0}
  max={100}
  step={5}
  valueLabel={`${threshold}%`}
/>
```

### Pilot Identification Scoring Weights

**File**: `infrastructure/lambda/project-specific/pilot-process/index.py`

```python
# Customize scoring weights
SCORING_WEIGHTS = {
    'business_drivers': {
        'cost_reduction': 20,      # Adjust these values
        'agility_improvement': 15,
        'scalability': 15,
        'modernization': 10,
    },
    'technical_feasibility': {
        'modern_runtime': 20,
        'legacy_runtime': 15,
        'other_runtime': 10,
    },
    'risk_assessment': {
        'low_criticality': 25,
        'medium_criticality': 15,
        'high_criticality': 5,
    },
    'user_base': {
        'ideal_range': (10, 100),  # Ideal user count range
        'ideal_score': 20,
        'acceptable_range': (5, 200),
        'acceptable_score': 15,
        'default_score': 10,
    }
}

# Use in scoring function
def calculate_pilot_score(application, criteria):
    score = 0
    
    # Business drivers
    for driver in criteria.get('business_drivers', []):
        score += SCORING_WEIGHTS['business_drivers'].get(driver, 0)
    
    # Technical feasibility
    runtime = application.get('runtime', '').lower()
    if runtime in ['java', 'python', 'nodejs', '.net']:
        score += SCORING_WEIGHTS['technical_feasibility']['modern_runtime']
    elif runtime in ['php', 'ruby']:
        score += SCORING_WEIGHTS['technical_feasibility']['legacy_runtime']
    else:
        score += SCORING_WEIGHTS['technical_feasibility']['other_runtime']
    
    # Risk assessment
    criticality = application.get('criticality', '').lower()
    score += SCORING_WEIGHTS['risk_assessment'].get(f'{criticality}_criticality', 0)
    
    # User base
    users = int(application.get('users', 0))
    ideal_min, ideal_max = SCORING_WEIGHTS['user_base']['ideal_range']
    acceptable_min, acceptable_max = SCORING_WEIGHTS['user_base']['acceptable_range']
    
    if ideal_min <= users <= ideal_max:
        score += SCORING_WEIGHTS['user_base']['ideal_score']
    elif acceptable_min <= users <= acceptable_max:
        score += SCORING_WEIGHTS['user_base']['acceptable_score']
    else:
        score += SCORING_WEIGHTS['user_base']['default_score']
    
    return score
```

### TCO Estimation Formulas

**File**: `app-modex-ui/src/pages/planning/TCOPage.js`

```javascript
// Customize TCO calculation formula
const calculateApplicationCost = (pilotCost, similarityScore) => {
  // Default formula: Cost increases as similarity decreases
  // Cost = PilotCost × (1 + (1 - Similarity))
  
  // Option 1: Linear scaling (current)
  const linearCost = pilotCost * (1 + (1 - similarityScore));
  
  // Option 2: Exponential scaling (more aggressive)
  const exponentialCost = pilotCost * Math.pow(2, (1 - similarityScore));
  
  // Option 3: Logarithmic scaling (more conservative)
  const logCost = pilotCost * (1 + Math.log2(2 - similarityScore));
  
  // Option 4: Custom threshold-based
  let customCost;
  if (similarityScore >= 0.9) {
    customCost = pilotCost * 1.1; // 10% more
  } else if (similarityScore >= 0.7) {
    customCost = pilotCost * 1.3; // 30% more
  } else if (similarityScore >= 0.5) {
    customCost = pilotCost * 1.6; // 60% more
  } else {
    customCost = pilotCost * 2.0; // 100% more
  }
  
  // Choose your formula
  return linearCost; // or exponentialCost, logCost, customCost
};
```

### Team Resource Allocation Ratios

**File**: `app-modex-ui/src/pages/planning/TeamEstimatePage.js`

```javascript
// Customize resource distribution
const RESOURCE_DISTRIBUTION = {
  developers: 0.47,    // 47% - Adjust based on your organization
  devops: 0.28,        // 28%
  architects: 0.17,    // 17%
  testers: 0.08,       // 8%
};

// Customize complexity multipliers
const COMPLEXITY_MULTIPLIERS = {
  'XS': 0.5,   // Very Simple
  'S': 0.75,   // Simple
  'M': 1.0,    // Medium (baseline)
  'L': 1.5,    // Complex
  'XL': 2.0,   // Very Complex
  'XXL': 2.5,  // Extremely Complex
};

// Customize delivery mode multipliers
const DELIVERY_MODE_MULTIPLIERS = {
  'Faster': {
    resources: {
      developers: 1.3,
      devops: 1.2,
      architects: 1.1,
      testers: 1.25,
    },
    time: 0.85, // 15% faster
  },
  'Cheaper': {
    resources: {
      developers: 0.8,
      devops: 0.85,
      architects: 0.9,
      testers: 0.75,
    },
    time: 1.25, // 25% longer
  },
};

// Customize parallelization constraints
const PARALLELIZATION_CONSTRAINTS = {
  developers: {
    optimal: 6,
    diminishingFactor: 0.5,
  },
  devops: {
    optimal: 3,
    diminishingFactor: 0.3,
  },
  architects: {
    maximum: 2, // Hard limit
  },
  testers: {
    optimal: 3,
    diminishingFactor: 0.4,
  },
};
```

### Skill Importance Calculation

**File**: `infrastructure/lambda/project-specific/skill-importance-scorer/index.js`

```javascript
// Customize how AI importance scores are converted to expected proficiency
const calculateExpectedProficiency = (importanceScore) => {
  // Default formula: Expected = 1.0 + (importance_score / 100.0 × 4.0)
  // Range: 1.0 (minimum) to 5.0 (expert)
  
  // Option 1: Linear (current)
  const linear = 1.0 + (importanceScore / 100.0 * 4.0);
  
  // Option 2: Exponential (emphasizes high importance)
  const exponential = 1.0 + Math.pow(importanceScore / 100.0, 0.7) * 4.0;
  
  // Option 3: Logarithmic (more gradual)
  const logarithmic = 1.0 + Math.log10(1 + importanceScore / 100.0 * 9) * 4.0;
  
  // Option 4: Threshold-based
  let thresholdBased;
  if (importanceScore >= 80) {
    thresholdBased = 5.0; // Expert
  } else if (importanceScore >= 60) {
    thresholdBased = 4.0; // Advanced
  } else if (importanceScore >= 40) {
    thresholdBased = 3.0; // Intermediate
  } else if (importanceScore >= 20) {
    thresholdBased = 2.0; // Beginner
  } else {
    thresholdBased = 1.0; // Minimal
  }
  
  return linear; // Choose your formula
};
```

### Deployment

After modifying business rules:

```bash
# For Lambda changes
cd infrastructure
./scripts/deploy-backend-stack.sh --profile your-profile --region us-west-2

# For frontend changes
cd app-modex-ui
npm run build
cd ../infrastructure
./scripts/deploy-frontend-stack.sh --profile your-profile
```

---

## Data Schema and Validation Rules

> **💰 COST IMPACT: MINIMAL - Validation logic only**

Organizations have different data requirements and taxonomies. This section covers customizing data schemas and validation rules.

### Custom Fields for Applications

**File**: `infrastructure/athena-tables/v_application_portfolio.sql`

```sql
-- Add custom fields to application portfolio view
CREATE OR REPLACE VIEW v_application_portfolio AS
SELECT 
  application_name,
  business_unit,
  criticality,
  users,
  description,
  -- Add your custom fields
  custom_field_1,
  custom_field_2,
  compliance_level,
  data_classification,
  business_owner,
  technical_owner
FROM app_modex_data.application_portfolio
WHERE project_id = '${project_id}';
```

### Data Validation Rules

**File**: `app-modex-ui/src/services/dataValidationService.js`

```javascript
// Define validation rules for each data type
export const VALIDATION_RULES = {
  portfolio: {
    required: ['ApplicationName', 'BusinessUnit', 'Criticality'],
    optional: ['Users', 'Description', 'ComplianceLevel'],
    
    patterns: {
      ApplicationName: /^[A-Za-z0-9\s\-_]+$/,
      Users: /^\d+$/,
    },
    
    enums: {
      Criticality: ['High', 'Medium', 'Low', 'Critical', 'Non-Critical'], // Customize
      ComplianceLevel: ['PCI-DSS', 'HIPAA', 'SOC2', 'None'], // Add your levels
    },
    
    ranges: {
      Users: { min: 0, max: 1000000 },
    },
  },
  
  skills: {
    required: ['Team', 'Persona', 'Skill', 'Proficiency'],
    optional: ['CertificationDate', 'YearsExperience'],
    
    enums: {
      Proficiency: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
      // Or use numeric scale
      // Proficiency: ['1', '2', '3', '4', '5'],
    },
  },
  
  techStack: {
    required: ['ApplicationName', 'ComponentType', 'ComponentName'],
    optional: ['Version', 'Notes', 'LicenseType', 'SupportEndDate'],
    
    enums: {
      ComponentType: [
        'Frontend',
        'Backend',
        'Database',
        'Integration',
        'Storage',
        'Messaging',      // Add custom types
        'Caching',
        'Monitoring',
      ],
    },
  },
};

// Validation function
export const validateData = (dataType, record) => {
  const rules = VALIDATION_RULES[dataType];
  if (!rules) return { valid: true };
  
  const errors = [];
  
  // Check required fields
  for (const field of rules.required) {
    if (!record[field] || record[field].trim() === '') {
      errors.push(`${field} is required`);
    }
  }
  
  // Check patterns
  if (rules.patterns) {
    for (const [field, pattern] of Object.entries(rules.patterns)) {
      if (record[field] && !pattern.test(record[field])) {
        errors.push(`${field} has invalid format`);
      }
    }
  }
  
  // Check enums
  if (rules.enums) {
    for (const [field, validValues] of Object.entries(rules.enums)) {
      if (record[field] && !validValues.includes(record[field])) {
        errors.push(`${field} must be one of: ${validValues.join(', ')}`);
      }
    }
  }
  
  // Check ranges
  if (rules.ranges) {
    for (const [field, range] of Object.entries(rules.ranges)) {
      const value = parseInt(record[field]);
      if (!isNaN(value) && (value < range.min || value > range.max)) {
        errors.push(`${field} must be between ${range.min} and ${range.max}`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
};
```

### Custom Criticality Levels

**File**: `app-modex-ui/src/components/PortfolioTable.js`

```javascript
// Customize criticality levels and colors
const CRITICALITY_CONFIG = {
  'Critical': { color: 'red', priority: 1 },
  'High': { color: 'red', priority: 2 },
  'Medium': { color: 'orange', priority: 3 },
  'Low': { color: 'blue', priority: 4 },
  'Non-Critical': { color: 'grey', priority: 5 },
};

// Use in table
<Badge color={CRITICALITY_CONFIG[item.criticality]?.color || 'grey'}>
  {item.criticality}
</Badge>
```

### Technology Categories

**File**: `infrastructure/lambda/global/bedrock-normalizer/index.js`

```javascript
// Customize technology categories for normalization
const TECHNOLOGY_CATEGORIES = {
  runtimes: [
    'Java', 'Python', 'Node.js', '.NET', 'Go', 'Ruby', 'PHP',
    // Add your custom runtimes
    'Rust', 'Kotlin', 'Scala',
  ],
  
  frameworks: [
    'Spring Boot', 'Django', 'Express', 'React', 'Angular', 'Vue.js',
    // Add your custom frameworks
    'FastAPI', 'NestJS', 'Svelte',
  ],
  
  databases: [
    'PostgreSQL', 'MySQL', 'MongoDB', 'Oracle', 'SQL Server',
    // Add your custom databases
    'CockroachDB', 'Cassandra', 'Neo4j',
  ],
};
```

### CSV Template Generation

Create custom CSV templates for users:

**File**: `app-modex-ui/src/utils/csvTemplateGenerator.js`

```javascript
export const generateCSVTemplate = (dataType) => {
  const templates = {
    portfolio: {
      headers: [
        'ApplicationName',
        'BusinessUnit',
        'Criticality',
        'Users',
        'Description',
        'ComplianceLevel',      // Custom field
        'DataClassification',   // Custom field
        'BusinessOwner',        // Custom field
      ],
      example: [
        'Customer Portal',
        'Sales',
        'High',
        '5000',
        'Customer-facing web application',
        'PCI-DSS',
        'Confidential',
        'john.doe@company.com',
      ],
    },
    // Add templates for other data types
  };
  
  const template = templates[dataType];
  if (!template) return null;
  
  const csv = [
    template.headers.join(','),
    template.example.join(','),
  ].join('\n');
  
  return csv;
};

// Download template
export const downloadTemplate = (dataType) => {
  const csv = generateCSVTemplate(dataType);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${dataType}_template.csv`;
  link.click();
};
```

---

## Export Templates and Formats

> **💰 COST IMPACT: MINIMAL - Processing logic only**

Different stakeholders need different report formats. This section covers customizing export templates and formats.

### Excel Template Customization

**File**: `infrastructure/lambda/project-specific/excel-generator/index.js`

```javascript
const ExcelJS = require('exceljs');

// Customize Excel styling
const EXCEL_STYLES = {
  header: {
    font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0073BB' } }, // Your brand color
    alignment: { vertical: 'middle', horizontal: 'center' },
    border: {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    },
  },
  
  subheader: {
    font: { bold: true, size: 11 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F2FF' } },
    alignment: { vertical: 'middle' },
  },
  
  data: {
    font: { size: 10 },
    alignment: { vertical: 'top', wrapText: true },
  },
  
  summary: {
    font: { bold: true, size: 11 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } },
  },
};

// Customize workbook properties
const createWorkbook = (projectName) => {
  const workbook = new ExcelJS.Workbook();
  
  workbook.creator = 'YourCompany ModEx';
  workbook.company = 'Your Company Name';
  workbook.created = new Date();
  workbook.modified = new Date();
  
  // Add custom properties
  workbook.properties.keywords = `modernization,${projectName}`;
  workbook.properties.category = 'Application Modernization';
  
  return workbook;
};

// Add company logo to worksheet
const addCompanyLogo = async (worksheet) => {
  const logoPath = '/path/to/your/logo.png';
  const imageId = workbook.addImage({
    filename: logoPath,
    extension: 'png',
  });
  
  worksheet.addImage(imageId, {
    tl: { col: 0, row: 0 },
    ext: { width: 150, height: 50 },
  });
  
  // Add space for logo
  worksheet.getRow(1).height = 50;
};

// Custom header and footer
const addHeaderFooter = (worksheet, projectName) => {
  worksheet.headerFooter = {
    firstHeader: `&L&"Arial,Bold"${projectName}&R&"Arial"&D`,
    firstFooter: `&L&"Arial"YourCompany ModEx&C&"Arial"Page &P of &N&R&"Arial"Confidential`,
  };
};
```

### Custom Export Categories

**File**: `app-modex-ui/src/config/exportCategories.ts`

```typescript
export const EXPORT_CATEGORIES = {
  data: {
    label: 'Data Section',
    subcategories: {
      skills: { label: 'Team Skills', enabled: true },
      portfolio: { label: 'Application Portfolio', enabled: true },
      techStack: { label: 'Technology Stack', enabled: true },
      infrastructure: { label: 'Infrastructure Resources', enabled: true },
      utilization: { label: 'Resource Utilization', enabled: true },
      // Add custom categories
      compliance: { label: 'Compliance Data', enabled: true },
      costs: { label: 'Cost Data', enabled: true },
    },
  },
  
  insights: {
    label: 'Insights Section',
    subcategories: {
      skillGaps: { label: 'Skill Gaps Analysis', enabled: true },
      techStackInsights: { label: 'Tech Stack Insights', enabled: true },
      // Add custom insights
      riskAssessment: { label: 'Risk Assessment', enabled: true },
      complianceGaps: { label: 'Compliance Gaps', enabled: true },
    },
  },
  
  // Add custom top-level categories
  executive: {
    label: 'Executive Summary',
    subcategories: {
      overview: { label: 'Project Overview', enabled: true },
      recommendations: { label: 'Recommendations', enabled: true },
      roadmap: { label: 'Modernization Roadmap', enabled: true },
    },
  },
};
```

### Report Templates

**File**: `infrastructure/lambda/project-specific/excel-generator/templates/executiveSummary.js`

```javascript
// Create executive summary template
exports.generateExecutiveSummary = async (worksheet, data) => {
  // Title
  worksheet.mergeCells('A1:F1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'Application Modernization - Executive Summary';
  titleCell.font = { bold: true, size: 16, color: { argb: 'FF0073BB' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 30;
  
  // Project Information
  let row = 3;
  worksheet.getCell(`A${row}`).value = 'Project Name:';
  worksheet.getCell(`B${row}`).value = data.projectName;
  row++;
  
  worksheet.getCell(`A${row}`).value = 'Report Date:';
  worksheet.getCell(`B${row}`).value = new Date().toLocaleDateString();
  row++;
  
  worksheet.getCell(`A${row}`).value = 'Total Applications:';
  worksheet.getCell(`B${row}`).value = data.totalApplications;
  row += 2;
  
  // Key Metrics
  worksheet.mergeCells(`A${row}:F${row}`);
  worksheet.getCell(`A${row}`).value = 'Key Metrics';
  worksheet.getCell(`A${row}`).font = { bold: true, size: 14 };
  row++;
  
  const metrics = [
    ['Applications Analyzed', data.applicationsAnalyzed],
    ['Pilot Candidates Identified', data.pilotCandidates],
    ['Estimated Total Cost', `$${data.estimatedCost.toLocaleString()}`],
    ['Estimated Timeline', `${data.estimatedTimeline} months`],
    ['Team Resources Required', data.resourcesRequired],
  ];
  
  metrics.forEach(([label, value]) => {
    worksheet.getCell(`A${row}`).value = label;
    worksheet.getCell(`B${row}`).value = value;
    row++;
  });
  
  // Add charts, recommendations, etc.
};
```

### File Naming Conventions

**File**: `infrastructure/lambda/project-specific/zip-packager/index.js`

```javascript
// Customize export file naming
const generateFileName = (projectName, category, format) => {
  const timestamp = new Date().toISOString().split('T')[0];
  const sanitizedProject = projectName.replace(/[^a-z0-9]/gi, '_');
  
  // Option 1: Simple
  const simple = `${sanitizedProject}_${category}_${timestamp}.${format}`;
  
  // Option 2: Detailed
  const detailed = `ModEx_${sanitizedProject}_${category}_Export_${timestamp}_v1.${format}`;
  
  // Option 3: With organization prefix
  const withOrg = `YourCompany_ModEx_${sanitizedProject}_${category}_${timestamp}.${format}`;
  
  return withOrg; // Choose your format
};
```

---

## Notification and Alerting

> **💰 COST IMPACT: YES - SNS and potential third-party service costs**
> 
> **Additional Cost:** $0.50-50/month depending on volume and integrations
> 
> **How to Calculate Your Cost:**
> 1. SNS: First 1,000 email notifications FREE, then $2 per 100,000
> 2. Go to: https://calculator.aws/#/addService/SNS
> 3. Enter: Expected notifications per month
> 4. Add: Third-party service costs (Slack/Teams/PagerDuty)
> 5. Slack webhooks: FREE
> 6. PagerDuty: $19-41 per user/month
> 7. Opsgenie: $9-29 per user/month

App-ModEx includes SNS topics for alerts. This section covers customizing notifications for various events.

### Current SNS Topics

The backend stack already includes two SNS topics:

**File**: `infrastructure/lib/app-modex-backend-stack.ts` (lines 1539 and 3062)

```typescript
// SNS topic for normalization alerts
const normalizationAlertTopic = new sns.Topic(this, 'NormalizationAlertTopic', {
  topicName: `app-modex-normalization-alerts`,
  displayName: 'AppModEx Normalization Alerts'
});

// SNS Topic for general alerts
const alertTopic = new sns.Topic(this, 'AlertTopic', {
  topicName: 'app-modex-alerts',
  displayName: 'App-ModEx Alerts',
});
```

### Option 1: Add Email Subscriptions

```typescript
// Add email subscriptions to alert topics
normalizationAlertTopic.addSubscription(
  new subscriptions.EmailSubscription('devops@yourcompany.com')
);

alertTopic.addSubscription(
  new subscriptions.EmailSubscription('alerts@yourcompany.com')
);

// Add multiple emails
const alertEmails = [
  'devops@yourcompany.com',
  'platform-team@yourcompany.com',
  'oncall@yourcompany.com'
];

alertEmails.forEach(email => {
  alertTopic.addSubscription(new subscriptions.EmailSubscription(email));
});
```

### Option 2: Slack Integration

```typescript
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';

// Create Lambda function for Slack notifications
const slackNotifier = new lambda.Function(this, 'SlackNotifier', {
  functionName: 'app-modex-slack-notifier',
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda/global/slack-notifier'),
  environment: {
    SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL || '',
    SLACK_CHANNEL: '#app-modex-alerts',
  },
  timeout: Duration.seconds(10),
});

// Subscribe Lambda to SNS topic
alertTopic.addSubscription(new subscriptions.LambdaSubscription(slackNotifier));
```

**Lambda Implementation**: `infrastructure/lambda/global/slack-notifier/index.js`

```javascript
const https = require('https');

exports.handler = async (event) => {
  const message = JSON.parse(event.Records[0].Sns.Message);
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  
  const slackMessage = {
    channel: process.env.SLACK_CHANNEL,
    username: 'App-ModEx Bot',
    icon_emoji: ':warning:',
    attachments: [{
      color: message.severity === 'ERROR' ? 'danger' : 'warning',
      title: message.title || 'App-ModEx Alert',
      text: message.description,
      fields: [
        {
          title: 'Project',
          value: message.projectId || 'N/A',
          short: true
        },
        {
          title: 'Severity',
          value: message.severity || 'INFO',
          short: true
        },
        {
          title: 'Timestamp',
          value: new Date().toISOString(),
          short: false
        }
      ],
      footer: 'App-ModEx Monitoring',
      ts: Math.floor(Date.now() / 1000)
    }]
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve({ statusCode: 200, body: 'Notification sent' });
        } else {
          reject(new Error(`Slack API error: ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(JSON.stringify(slackMessage));
    req.end();
  });
};
```

### Option 3: Microsoft Teams Integration

```javascript
// Lambda for Teams notifications
exports.handler = async (event) => {
  const message = JSON.parse(event.Records[0].Sns.Message);
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  
  const teamsMessage = {
    '@type': 'MessageCard',
    '@context': 'https://schema.org/extensions',
    summary: message.title || 'App-ModEx Alert',
    themeColor: message.severity === 'ERROR' ? 'FF0000' : 'FFA500',
    title: message.title || 'App-ModEx Alert',
    sections: [{
      activityTitle: 'Alert Details',
      facts: [
        { name: 'Project:', value: message.projectId || 'N/A' },
        { name: 'Severity:', value: message.severity || 'INFO' },
        { name: 'Time:', value: new Date().toISOString() }
      ],
      text: message.description
    }],
    potentialAction: [{
      '@type': 'OpenUri',
      name: 'View in Console',
      targets: [{
        os: 'default',
        uri: `https://console.aws.amazon.com/`
      }]
    }]
  };
  
  // Send to Teams webhook (similar HTTP request as Slack)
};
```

### Option 4: CloudWatch Alarms with SNS

```typescript
// Create CloudWatch alarms for Lambda errors
const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
  alarmName: 'app-modex-lambda-errors',
  metric: projectsFunction.metricErrors({
    statistic: 'Sum',
    period: Duration.minutes(5),
  }),
  threshold: 5,
  evaluationPeriods: 1,
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
});

// Add SNS action
lambdaErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

// Create alarm for API Gateway 5xx errors
const apiErrorAlarm = new cloudwatch.Alarm(this, 'ApiErrorAlarm', {
  alarmName: 'app-modex-api-5xx-errors',
  metric: this.api.metricServerError({
    statistic: 'Sum',
    period: Duration.minutes(5),
  }),
  threshold: 10,
  evaluationPeriods: 2,
  comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
});

apiErrorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));

// Create alarm for DynamoDB throttling
const dynamoThrottleAlarm = new cloudwatch.Alarm(this, 'DynamoThrottleAlarm', {
  alarmName: 'app-modex-dynamodb-throttle',
  metric: new cloudwatch.Metric({
    namespace: 'AWS/DynamoDB',
    metricName: 'UserErrors',
    dimensionsMap: {
      TableName: projectsTableName,
    },
    statistic: 'Sum',
    period: Duration.minutes(5),
  }),
  threshold: 5,
  evaluationPeriods: 1,
});

dynamoThrottleAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alertTopic));
```

### Option 5: Custom Event-Based Notifications

```typescript
// Create EventBridge rule for specific events
const exportCompletedRule = new events.Rule(this, 'ExportCompletedRule', {
  ruleName: 'app-modex-export-completed',
  description: 'Trigger notification when export completes',
  eventPattern: {
    source: ['app-modex'],
    detailType: ['Export Completed'],
  },
});

// Add SNS target
exportCompletedRule.addTarget(new targets.SnsTopic(alertTopic));

// Emit events from Lambda functions
// In export Lambda:
const { EventBridge } = require('@aws-sdk/client-eventbridge');
const eventBridge = new EventBridge();

await eventBridge.putEvents({
  Entries: [{
    Source: 'app-modex',
    DetailType: 'Export Completed',
    Detail: JSON.stringify({
      projectId: projectId,
      exportId: exportId,
      status: 'SUCCESS',
      fileSize: fileSize,
      duration: duration,
    }),
  }],
});
```

### Option 6: PagerDuty Integration

```typescript
// Create Lambda for PagerDuty integration
const pagerDutyNotifier = new lambda.Function(this, 'PagerDutyNotifier', {
  functionName: 'app-modex-pagerduty-notifier',
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda/global/pagerduty-notifier'),
  environment: {
    PAGERDUTY_INTEGRATION_KEY: process.env.PAGERDUTY_INTEGRATION_KEY || '',
  },
});

alertTopic.addSubscription(new subscriptions.LambdaSubscription(pagerDutyNotifier));
```

**Lambda Implementation**:

```javascript
const https = require('https');

exports.handler = async (event) => {
  const message = JSON.parse(event.Records[0].Sns.Message);
  const integrationKey = process.env.PAGERDUTY_INTEGRATION_KEY;
  
  const pagerDutyEvent = {
    routing_key: integrationKey,
    event_action: 'trigger',
    payload: {
      summary: message.title || 'App-ModEx Alert',
      severity: message.severity === 'ERROR' ? 'error' : 'warning',
      source: 'app-modex',
      custom_details: {
        project_id: message.projectId,
        description: message.description,
        timestamp: new Date().toISOString(),
      },
    },
  };
  
  const options = {
    hostname: 'events.pagerduty.com',
    path: '/v2/enqueue',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 202) {
          resolve({ statusCode: 200, body: 'PagerDuty event created' });
        } else {
          reject(new Error(`PagerDuty API error: ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(JSON.stringify(pagerDutyEvent));
    req.end();
  });
};
```

### Deployment

```bash
# Set environment variables
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
export TEAMS_WEBHOOK_URL="https://outlook.office.com/webhook/YOUR/WEBHOOK/URL"
export PAGERDUTY_INTEGRATION_KEY="your-integration-key"

# Deploy backend with notification configuration
cd infrastructure
./scripts/deploy-backend.sh --profile app-modex-prod --region us-west-2

# Verify SNS topics
aws sns list-topics --profile app-modex-prod --region us-west-2

# Test notification
aws sns publish \
  --topic-arn arn:aws:sns:us-west-2:ACCOUNT:app-modex-alerts \
  --message '{"title":"Test Alert","description":"Testing notification system","severity":"INFO"}' \
  --profile app-modex-prod
```

---

## Data Retention and Archival Policies

> **💰 COST IMPACT: MINIMAL to MODERATE - Can reduce storage costs**
> 
> **Cost Savings:** $5-500/month depending on data volume
> 
> **How to Calculate Your Cost:**
> 1. Current S3 storage: Check AWS Cost Explorer for S3 costs
> 2. Glacier savings: ~90% cheaper than S3 Standard
> 3. Go to: https://calculator.aws/#/addService/S3
> 4. Compare: Standard vs Glacier vs Intelligent-Tiering
> 5. DynamoDB: No cost for TTL feature itself
> 
> **Cost Optimization:** Proper retention policies can significantly reduce storage costs

App-ModEx stores data in DynamoDB and S3. This section covers configuring retention and archival policies to manage costs and comply with regulations.

### Current Retention Configuration

**Export History Table** already has TTL enabled:

**File**: `infrastructure/lib/app-modex-data-stack.ts` (line 115)

```typescript
const exportHistoryTable = new dynamodb.Table(this, 'ExportHistoryTable', {
  tableName: `app-modex-export-history`,
  partitionKey: { name: 'exportId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'projectId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'ttl',  // TTL already enabled
  // ...
});
```

**Access Logs Bucket** already has lifecycle policy:

**File**: `infrastructure/lib/app-modex-data-stack.ts` (line 245)

```typescript
this.accessLogsBucket = new s3.Bucket(this, 'AccessLogsBucket', {
  bucketName: `app-modex-access-logs-${this.account}-${this.region}`,
  lifecycleRules: [
    {
      expiration: Duration.days(90),  // Delete after 90 days
      noncurrentVersionExpiration: Duration.days(30),
    }
  ]
});
```

### Option 1: Configure DynamoDB TTL for Other Tables

Add TTL to projects and project data tables for automatic cleanup:

```typescript
// Add TTL to projects table for archived projects
this.projectsTable = new dynamodb.Table(this, 'ProjectsTable', {
  tableName: `app-modex-projects`,
  partitionKey: { name: 'projectId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'expiresAt',  // Add TTL attribute
  // ...
});

// Add TTL to project data table
this.projectDataTable = new dynamodb.Table(this, 'ProjectDataTable', {
  tableName: `app-modex-project-data`,
  partitionKey: { name: 'projectId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'dataType', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'expiresAt',  // Add TTL attribute
  // ...
});
```

**Set TTL in Application Code**:

```javascript
// When creating export history records
const ttlDays = 90; // Retain for 90 days
const expiresAt = Math.floor(Date.now() / 1000) + (ttlDays * 24 * 60 * 60);

await dynamodb.putItem({
  TableName: 'app-modex-export-history',
  Item: {
    exportId: { S: exportId },
    projectId: { S: projectId },
    status: { S: 'COMPLETED' },
    createdAt: { S: new Date().toISOString() },
    ttl: { N: expiresAt.toString() },  // TTL in epoch seconds
    // ... other attributes
  },
});

// For archived projects (optional)
const archiveProject = async (projectId) => {
  const archiveRetentionDays = 365; // Keep archived projects for 1 year
  const expiresAt = Math.floor(Date.now() / 1000) + (archiveRetentionDays * 24 * 60 * 60);
  
  await dynamodb.updateItem({
    TableName: 'app-modex-projects',
    Key: { projectId: { S: projectId } },
    UpdateExpression: 'SET #status = :archived, expiresAt = :expires',
    ExpressionAttributeNames: {
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ':archived': { S: 'ARCHIVED' },
      ':expires': { N: expiresAt.toString() },
    },
  });
};
```

### Option 2: S3 Lifecycle Policies for Project Data

Configure lifecycle policies for project data buckets:

```typescript
this.projectDataBucket = new s3.Bucket(this, 'ProjectDataBucket', {
  bucketName: `app-modex-project-data-${this.account}-${this.region}`,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.S3_MANAGED,
  versioned: true,
  lifecycleRules: [
    {
      id: 'transition-to-ia',
      enabled: true,
      transitions: [
        {
          storageClass: s3.StorageClass.INFREQUENT_ACCESS,
          transitionAfter: Duration.days(30),  // Move to IA after 30 days
        },
        {
          storageClass: s3.StorageClass.GLACIER,
          transitionAfter: Duration.days(90),  // Move to Glacier after 90 days
        },
        {
          storageClass: s3.StorageClass.DEEP_ARCHIVE,
          transitionAfter: Duration.days(365),  // Move to Deep Archive after 1 year
        },
      ],
    },
    {
      id: 'delete-old-versions',
      enabled: true,
      noncurrentVersionTransitions: [
        {
          storageClass: s3.StorageClass.GLACIER,
          transitionAfter: Duration.days(30),
        },
      ],
      noncurrentVersionExpiration: Duration.days(90),  // Delete old versions after 90 days
    },
    {
      id: 'cleanup-incomplete-uploads',
      enabled: true,
      abortIncompleteMultipartUploadAfter: Duration.days(7),
    },
    {
      id: 'expire-temp-data',
      enabled: true,
      prefix: 'temp/',
      expiration: Duration.days(7),  // Delete temp files after 7 days
    },
  ],
});
```

### Option 3: Intelligent-Tiering for Cost Optimization

Use S3 Intelligent-Tiering for automatic cost optimization:

```typescript
this.projectDataBucket = new s3.Bucket(this, 'ProjectDataBucket', {
  bucketName: `app-modex-project-data-${this.account}-${this.region}`,
  intelligentTieringConfigurations: [
    {
      name: 'auto-archive',
      archiveAccessTierTime: Duration.days(90),  // Archive tier after 90 days
      deepArchiveAccessTierTime: Duration.days(180),  // Deep archive after 180 days
    },
  ],
  lifecycleRules: [
    {
      id: 'intelligent-tiering',
      enabled: true,
      transitions: [
        {
          storageClass: s3.StorageClass.INTELLIGENT_TIERING,
          transitionAfter: Duration.days(0),  // Immediate transition
        },
      ],
    },
  ],
});
```

### Option 4: Compliance-Based Retention

Implement retention policies for compliance requirements:

```typescript
// HIPAA/SOC2 compliance: 7-year retention
const complianceRetentionBucket = new s3.Bucket(this, 'ComplianceDataBucket', {
  bucketName: `app-modex-compliance-${this.account}`,
  versioned: true,
  objectLockEnabled: true,  // Enable object lock for compliance
  objectLockDefaultRetention: {
    mode: s3.BucketObjectLockRetentionMode.GOVERNANCE,
    duration: Duration.days(2555),  // 7 years
  },
  lifecycleRules: [
    {
      id: 'compliance-retention',
      enabled: true,
      transitions: [
        {
          storageClass: s3.StorageClass.GLACIER,
          transitionAfter: Duration.days(90),
        },
      ],
      expiration: Duration.days(2555),  // Delete after 7 years
    },
  ],
});
```

### Option 5: Backup and Restore Strategy

Implement backup retention for disaster recovery:

```typescript
// Enable point-in-time recovery for DynamoDB
this.projectsTable = new dynamodb.Table(this, 'ProjectsTable', {
  tableName: `app-modex-projects`,
  partitionKey: { name: 'projectId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  pointInTimeRecovery: true,  // Enable PITR (35-day retention)
  // ...
});

// Create backup vault for AWS Backup
const backupVault = new backup.BackupVault(this, 'BackupVault', {
  backupVaultName: 'app-modex-backup-vault',
  removalPolicy: environment === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
});

// Create backup plan
const backupPlan = new backup.BackupPlan(this, 'BackupPlan', {
  backupPlanName: 'app-modex-backup-plan',
  backupPlanRules: [
    {
      ruleName: 'daily-backup',
      scheduleExpression: events.Schedule.cron({ hour: '2', minute: '0' }),
      startWindow: Duration.hours(1),
      completionWindow: Duration.hours(2),
      deleteAfter: Duration.days(30),  // Retain daily backups for 30 days
    },
    {
      ruleName: 'weekly-backup',
      scheduleExpression: events.Schedule.cron({ weekDay: 'SUN', hour: '3', minute: '0' }),
      deleteAfter: Duration.days(90),  // Retain weekly backups for 90 days
    },
    {
      ruleName: 'monthly-backup',
      scheduleExpression: events.Schedule.cron({ day: '1', hour: '4', minute: '0' }),
      deleteAfter: Duration.days(365),  // Retain monthly backups for 1 year
      moveToColdStorageAfter: Duration.days(30),  // Move to cold storage after 30 days
    },
  ],
  backupVault: backupVault,
});

// Add DynamoDB tables to backup plan
backupPlan.addSelection('DynamoDBBackup', {
  resources: [
    backup.BackupResource.fromDynamoDbTable(this.projectsTable),
    backup.BackupResource.fromDynamoDbTable(this.projectDataTable),
    backup.BackupResource.fromDynamoDbTable(this.exportHistoryTable),
  ],
});
```

### Option 6: Custom Archival Lambda

Create Lambda function for custom archival logic:

```javascript
// Lambda: infrastructure/lambda/global/data-archival/index.js
const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const { S3 } = require('@aws-sdk/client-s3');

const dynamodb = new DynamoDB();
const s3 = new S3();

exports.handler = async (event) => {
  const archivalPolicies = {
    'export-history': {
      table: 'app-modex-export-history',
      retentionDays: 90,
      archiveBucket: 'app-modex-archive',
    },
    'project-data': {
      table: 'app-modex-project-data',
      retentionDays: 365,
      archiveBucket: 'app-modex-archive',
    },
  };
  
  for (const [policyName, policy] of Object.entries(archivalPolicies)) {
    console.log(`Processing archival policy: ${policyName}`);
    
    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);
    const cutoffTimestamp = cutoffDate.toISOString();
    
    // Scan for old records
    const scanResult = await dynamodb.scan({
      TableName: policy.table,
      FilterExpression: 'createdAt < :cutoff',
      ExpressionAttributeValues: {
        ':cutoff': { S: cutoffTimestamp },
      },
    });
    
    console.log(`Found ${scanResult.Items.length} records to archive`);
    
    // Archive to S3
    if (scanResult.Items.length > 0) {
      const archiveKey = `${policyName}/${new Date().toISOString()}.json`;
      
      await s3.putObject({
        Bucket: policy.archiveBucket,
        Key: archiveKey,
        Body: JSON.stringify(scanResult.Items),
        StorageClass: 'GLACIER',
      });
      
      console.log(`Archived ${scanResult.Items.length} records to ${archiveKey}`);
      
      // Delete from DynamoDB
      for (const item of scanResult.Items) {
        await dynamodb.deleteItem({
          TableName: policy.table,
          Key: {
            // Extract key attributes based on table schema
          },
        });
      }
    }
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Archival completed' }),
  };
};
```

**Schedule with EventBridge**:

```typescript
// Create archival Lambda
const archivalFunction = new lambda.Function(this, 'ArchivalFunction', {
  functionName: 'app-modex-data-archival',
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda/global/data-archival'),
  timeout: Duration.minutes(15),
  memorySize: 1024,
});

// Grant permissions
this.projectsTable.grantReadWriteData(archivalFunction);
this.projectDataTable.grantReadWriteData(archivalFunction);
this.exportHistoryTable.grantReadWriteData(archivalFunction);

// Schedule to run daily
const archivalRule = new events.Rule(this, 'ArchivalRule', {
  ruleName: 'app-modex-daily-archival',
  schedule: events.Schedule.cron({ hour: '2', minute: '0' }),
});

archivalRule.addTarget(new targets.LambdaFunction(archivalFunction));
```

### Deployment

```bash
# Deploy with updated retention policies
cd infrastructure
./scripts/deploy-data-stack.sh --profile app-modex-prod --region us-west-2

# Verify S3 lifecycle policies
aws s3api get-bucket-lifecycle-configuration \
  --bucket app-modex-project-data-ACCOUNT-REGION \
  --profile app-modex-prod

# Verify DynamoDB TTL
aws dynamodb describe-time-to-live \
  --table-name app-modex-export-history \
  --profile app-modex-prod

# Check backup plan
aws backup list-backup-plans --profile app-modex-prod
```

---

## Internationalization and Localization

> **💰 COST IMPACT: NO - Translation services only if using external APIs**
> 
> **Current Cost:** FREE (manual translations)
> **Optional Costs:**
> - AWS Translate: $15 per million characters
> - Professional translation services: $0.10-0.30 per word
> 
> **How to Calculate Your Cost:**
> 1. Count: Total words/characters in your UI
> 2. AWS Translate: https://calculator.aws/#/addService/Translate
> 3. Multiply: Characters × $0.000015
> 4. One-time cost for initial translation, minimal ongoing

App-ModEx already has i18n infrastructure implemented using i18next. This section covers adding new languages and customizing localization.

### Current i18n Configuration

**File**: `app-modex-ui/src/i18n/index.js`

```javascript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Import translation files
import commonEn from '../locales/en/common.json';
import pagesEn from '../locales/en/pages.json';
import componentsEn from '../locales/en/components.json';
import infoEn from '../locales/en/info.json';

const resources = {
  en: {
    common: commonEn,
    pages: pagesEn,
    components: componentsEn,
    info: infoEn
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en', // default language
    fallbackLng: 'en',
    defaultNS: 'common',
    nsSeparator: ':',
    keySeparator: '.',
    interpolation: {
      escapeValue: false
    },
    debug: false,
  });

export default i18n;
```

### Translation File Structure

Current structure in `app-modex-ui/src/locales/en/`:
- `common.json` - Buttons, labels, status messages, navigation
- `pages.json` - Page-specific content
- `components.json` - Component-specific text
- `info.json` - Info panel content

### Option 1: Add Spanish Translation

**Step 1: Create Spanish Translation Files**

Create `app-modex-ui/src/locales/es/` directory:

```bash
mkdir -p app-modex-ui/src/locales/es
```

**File**: `app-modex-ui/src/locales/es/common.json`

```json
{
  "buttons": {
    "save": "Guardar",
    "saveChanges": "Guardar Cambios",
    "cancel": "Cancelar",
    "delete": "Eliminar",
    "edit": "Editar",
    "create": "Crear",
    "update": "Actualizar",
    "refresh": "Actualizar",
    "retry": "Reintentar",
    "close": "Cerrar",
    "clear": "Limpiar",
    "download": "Descargar",
    "upload": "Subir",
    "export": "Exportar",
    "import": "Importar",
    "search": "Buscar",
    "filter": "Filtrar",
    "reset": "Restablecer",
    "apply": "Aplicar",
    "confirm": "Confirmar",
    "submit": "Enviar"
  },
  "labels": {
    "name": "Nombre",
    "description": "Descripción",
    "status": "Estado",
    "type": "Tipo",
    "category": "Categoría",
    "date": "Fecha",
    "time": "Hora",
    "created": "Creado",
    "updated": "Actualizado",
    "project": "Proyecto",
    "application": "Aplicación",
    "team": "Equipo",
    "skill": "Habilidad"
  },
  "messages": {
    "loading": "Cargando...",
    "noData": "No hay datos disponibles",
    "error": "Ocurrió un error",
    "success": "Operación completada exitosamente",
    "saved": "Cambios guardados exitosamente"
  }
}
```

**Step 2: Update i18n Configuration**

```javascript
// app-modex-ui/src/i18n/index.js
import commonEn from '../locales/en/common.json';
import pagesEn from '../locales/en/pages.json';
import componentsEn from '../locales/en/components.json';
import infoEn from '../locales/en/info.json';

// Import Spanish translations
import commonEs from '../locales/es/common.json';
import pagesEs from '../locales/es/pages.json';
import componentsEs from '../locales/es/components.json';
import infoEs from '../locales/es/info.json';

const resources = {
  en: {
    common: commonEn,
    pages: pagesEn,
    components: componentsEn,
    info: infoEn
  },
  es: {
    common: commonEs,
    pages: pagesEs,
    components: componentsEs,
    info: infoEs
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem('language') || 'en',  // Load from localStorage
    fallbackLng: 'en',
    // ... rest of config
  });
```

**Step 3: Add Language Selector Component**

```javascript
// app-modex-ui/src/components/LanguageSelector.js
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '@cloudscape-design/components';

const LanguageSelector = () => {
  const { i18n } = useTranslation();
  
  const languages = [
    { label: 'English', value: 'en' },
    { label: 'Español', value: 'es' },
    { label: 'Français', value: 'fr' },
    { label: 'Deutsch', value: 'de' },
    { label: '日本語', value: 'ja' },
    { label: '中文', value: 'zh' },
  ];
  
  const handleLanguageChange = ({ detail }) => {
    const newLang = detail.selectedOption.value;
    i18n.changeLanguage(newLang);
    localStorage.setItem('language', newLang);
  };
  
  return (
    <Select
      selectedOption={languages.find(lang => lang.value === i18n.language)}
      onChange={handleLanguageChange}
      options={languages}
      placeholder="Select language"
    />
  );
};

export default LanguageSelector;
```

### Option 2: Date and Number Formatting

Configure locale-specific formatting:

```javascript
// app-modex-ui/src/utils/formatters.js
import { useTranslation } from 'react-i18next';

export const useFormatters = () => {
  const { i18n } = useTranslation();
  
  const formatDate = (date, format = 'short') => {
    const locale = i18n.language;
    const dateObj = new Date(date);
    
    const formats = {
      short: { dateStyle: 'short' },
      medium: { dateStyle: 'medium' },
      long: { dateStyle: 'long' },
      full: { dateStyle: 'full', timeStyle: 'short' },
    };
    
    return new Intl.DateTimeFormat(locale, formats[format]).format(dateObj);
  };
  
  const formatNumber = (number, options = {}) => {
    const locale = i18n.language;
    return new Intl.NumberFormat(locale, options).format(number);
  };
  
  const formatCurrency = (amount, currency = 'USD') => {
    const locale = i18n.language;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };
  
  const formatPercent = (value) => {
    const locale = i18n.language;
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value / 100);
  };
  
  return {
    formatDate,
    formatNumber,
    formatCurrency,
    formatPercent,
  };
};

// Usage in components
const MyComponent = () => {
  const { formatDate, formatCurrency } = useFormatters();
  
  return (
    <div>
      <p>Date: {formatDate('2025-02-04', 'long')}</p>
      <p>Cost: {formatCurrency(1234.56, 'USD')}</p>
    </div>
  );
};
```

### Option 3: RTL Language Support

Add support for right-to-left languages (Arabic, Hebrew):

```javascript
// app-modex-ui/src/i18n/index.js
const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

i18n.on('languageChanged', (lng) => {
  const dir = RTL_LANGUAGES.includes(lng) ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', lng);
});
```

**CSS for RTL Support**:

```css
/* app-modex-ui/src/index.css */
[dir="rtl"] {
  text-align: right;
}

[dir="rtl"] .margin-left {
  margin-left: 0;
  margin-right: 1rem;
}

[dir="rtl"] .float-left {
  float: right;
}

[dir="rtl"] .float-right {
  float: left;
}
```

### Option 4: Automated Translation with AWS Translate

```javascript
// Script: app-modex-ui/scripts/translate.js
const { TranslateClient, TranslateTextCommand } = require('@aws-sdk/client-translate');
const fs = require('fs');
const path = require('path');

const translate = new TranslateClient({ region: 'us-west-2' });

async function translateFile(sourceFile, targetLang) {
  const sourceLang = 'en';
  const content = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  const translated = {};
  
  async function translateObject(obj, targetObj) {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        const command = new TranslateTextCommand({
          Text: value,
          SourceLanguageCode: sourceLang,
          TargetLanguageCode: targetLang,
        });
        
        const response = await translate.send(command);
        targetObj[key] = response.TranslatedText;
      } else if (typeof value === 'object') {
        targetObj[key] = {};
        await translateObject(value, targetObj[key]);
      }
    }
  }
  
  await translateObject(content, translated);
  
  const targetDir = path.join(__dirname, '../src/locales', targetLang);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  const targetFile = path.join(targetDir, path.basename(sourceFile));
  fs.writeFileSync(targetFile, JSON.stringify(translated, null, 2));
  
  console.log(`Translated ${sourceFile} to ${targetLang}`);
}

// Usage
const languages = ['es', 'fr', 'de', 'ja', 'zh'];
const files = ['common.json', 'pages.json', 'components.json', 'info.json'];

(async () => {
  for (const lang of languages) {
    for (const file of files) {
      const sourceFile = path.join(__dirname, '../src/locales/en', file);
      await translateFile(sourceFile, lang);
    }
  }
})();
```

**Run Translation Script**:

```bash
cd app-modex-ui
node scripts/translate.js
```

### Option 5: Pluralization Rules

Handle plural forms correctly for different languages:

```json
{
  "items": {
    "zero": "No items",
    "one": "{{count}} item",
    "other": "{{count}} items"
  },
  "applications": {
    "zero": "No applications",
    "one": "{{count}} application",
    "other": "{{count}} applications"
  }
}
```

**Usage**:

```javascript
const { t } = useTranslation();

// Automatically selects correct plural form
<p>{t('items', { count: 0 })}</p>  // "No items"
<p>{t('items', { count: 1 })}</p>  // "1 item"
<p>{t('items', { count: 5 })}</p>  // "5 items"
```

### Option 6: Context-Specific Translations

Handle words with different meanings in different contexts:

```json
{
  "save": "Save",
  "save_verb": "Save",
  "save_noun": "Savings",
  "close_verb": "Close",
  "close_adjective": "Close (near)"
}
```

### Testing Translations

```bash
# Build with all languages
cd app-modex-ui
npm run build

# Test language switching
npm start

# Verify all translation keys are present
npm run i18n:check
```

---

## Integration Webhooks and APIs

> **💰 COST IMPACT: MINIMAL - Lambda invocations only**
> 
> **Additional Cost:** $0.20-5/month for typical webhook volume
> **Third-party Costs:** Varies by service (Jira, ServiceNow, etc.)
> 
> **How to Calculate Your Cost:**
> 1. Count: Expected webhook calls per month
> 2. Go to: https://calculator.aws/#/addService/Lambda
> 3. Enter: Invocations, 512MB memory, 5s duration
> 4. Add: API Gateway costs ($3.50 per million requests)
> 5. Add: Third-party API subscription costs

Integrate App-ModEx with external systems using webhooks and APIs for event-driven workflows.

### Architecture for Webhooks

```
App-ModEx Event → EventBridge → Lambda → External System (Jira/ServiceNow/Slack)
External System → API Gateway → Lambda → App-ModEx (DynamoDB/S3)
```

### Option 1: Outbound Webhooks (App-ModEx → External)

**Step 1: Create Webhook Configuration Table**

```typescript
// Add to app-modex-data-stack.ts
const webhookConfigTable = new dynamodb.Table(this, 'WebhookConfigTable', {
  tableName: `app-modex-webhook-config`,
  partitionKey: { name: 'projectId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'webhookId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  encryption: dynamodb.TableEncryption.AWS_MANAGED,
});
```

**Step 2: Create Webhook Sender Lambda**

**File**: `infrastructure/lambda/global/webhook-sender/index.js`

```javascript
const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const { SecretsManager } = require('@aws-sdk/client-secrets-manager');
const https = require('https');
const crypto = require('crypto');

const dynamodb = new DynamoDB();
const secretsManager = new SecretsManager();

exports.handler = async (event) => {
  console.log('Webhook event:', JSON.stringify(event));
  
  const { projectId, eventType, payload } = event;
  
  // Get webhook configurations for this project
  const webhooks = await getWebhookConfigs(projectId, eventType);
  
  // Send to all configured webhooks
  const results = await Promise.allSettled(
    webhooks.map(webhook => sendWebhook(webhook, payload))
  );
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      sent: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
    }),
  };
};

async function getWebhookConfigs(projectId, eventType) {
  const result = await dynamodb.query({
    TableName: 'app-modex-webhook-config',
    KeyConditionExpression: 'projectId = :projectId',
    FilterExpression: 'contains(eventTypes, :eventType) AND enabled = :true',
    ExpressionAttributeValues: {
      ':projectId': { S: projectId },
      ':eventType': { S: eventType },
      ':true': { BOOL: true },
    },
  });
  
  return result.Items.map(item => ({
    webhookId: item.webhookId.S,
    url: item.url.S,
    secret: item.secret?.S,
    headers: item.headers ? JSON.parse(item.headers.S) : {},
    retryPolicy: item.retryPolicy ? JSON.parse(item.retryPolicy.S) : { maxRetries: 3 },
  }));
}

async function sendWebhook(webhook, payload, attempt = 1) {
  const body = JSON.stringify(payload);
  
  // Generate signature if secret is provided
  const headers = { ...webhook.headers, 'Content-Type': 'application/json' };
  if (webhook.secret) {
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(body)
      .digest('hex');
    headers['X-Webhook-Signature'] = signature;
  }
  
  return new Promise((resolve, reject) => {
    const url = new URL(webhook.url);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body),
        'X-Webhook-Attempt': attempt.toString(),
      },
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, statusCode: res.statusCode });
        } else if (attempt < webhook.retryPolicy.maxRetries) {
          // Retry with exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          setTimeout(() => {
            sendWebhook(webhook, payload, attempt + 1)
              .then(resolve)
              .catch(reject);
          }, delay);
        } else {
          reject(new Error(`Webhook failed: ${res.statusCode} ${data}`));
        }
      });
    });
    
    req.on('error', (error) => {
      if (attempt < webhook.retryPolicy.maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        setTimeout(() => {
          sendWebhook(webhook, payload, attempt + 1)
            .then(resolve)
            .catch(reject);
        }, delay);
      } else {
        reject(error);
      }
    });
    
    req.write(body);
    req.end();
  });
}
```

**Step 3: Trigger Webhooks from Events**

```typescript
// Create EventBridge rule for export completed
const exportCompletedRule = new events.Rule(this, 'ExportCompletedWebhookRule', {
  ruleName: 'app-modex-export-completed-webhook',
  eventPattern: {
    source: ['app-modex'],
    detailType: ['Export Completed'],
  },
});

// Create webhook sender Lambda
const webhookSender = new lambda.Function(this, 'WebhookSender', {
  functionName: 'app-modex-webhook-sender',
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda/global/webhook-sender'),
  timeout: Duration.seconds(30),
});

exportCompletedRule.addTarget(new targets.LambdaFunction(webhookSender));
```

### Option 2: Jira Integration

**Create Jira Ticket on Export Completion**:

```javascript
// infrastructure/lambda/global/jira-integration/index.js
const https = require('https');

exports.handler = async (event) => {
  const { projectId, exportId, exportType } = event.detail;
  
  const jiraConfig = {
    host: process.env.JIRA_HOST,
    email: process.env.JIRA_EMAIL,
    apiToken: process.env.JIRA_API_TOKEN,
    projectKey: process.env.JIRA_PROJECT_KEY,
  };
  
  const issue = {
    fields: {
      project: { key: jiraConfig.projectKey },
      summary: `App-ModEx Export Completed: ${exportType}`,
      description: `Export ${exportId} for project ${projectId} has been completed.`,
      issuetype: { name: 'Task' },
      labels: ['app-modex', 'export', exportType],
    },
  };
  
  const auth = Buffer.from(`${jiraConfig.email}:${jiraConfig.apiToken}`).toString('base64');
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: jiraConfig.host,
      path: '/rest/api/3/issue',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 201) {
          const issue = JSON.parse(data);
          resolve({ issueKey: issue.key, issueId: issue.id });
        } else {
          reject(new Error(`Jira API error: ${res.statusCode} ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(JSON.stringify(issue));
    req.end();
  });
};
```

### Option 3: ServiceNow Integration

```javascript
// infrastructure/lambda/global/servicenow-integration/index.js
exports.handler = async (event) => {
  const { projectId, severity, description } = event.detail;
  
  const snowConfig = {
    instance: process.env.SNOW_INSTANCE,
    username: process.env.SNOW_USERNAME,
    password: process.env.SNOW_PASSWORD,
  };
  
  const incident = {
    short_description: `App-ModEx Alert: ${projectId}`,
    description: description,
    urgency: severity === 'HIGH' ? '1' : severity === 'MEDIUM' ? '2' : '3',
    impact: '2',
    category: 'Application',
    subcategory: 'Modernization',
  };
  
  const auth = Buffer.from(`${snowConfig.username}:${snowConfig.password}`).toString('base64');
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: `${snowConfig.instance}.service-now.com`,
      path: '/api/now/table/incident',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 201) {
          const result = JSON.parse(data);
          resolve({ incidentNumber: result.result.number });
        } else {
          reject(new Error(`ServiceNow API error: ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(JSON.stringify(incident));
    req.end();
  });
};
```

### Option 4: Inbound Webhooks (External → App-ModEx)

**Create API Gateway endpoint for webhooks**:

```typescript
// Add to app-modex-api-stack.ts
const webhookResource = this.api.root.addResource('webhooks');

// Create webhook receiver Lambda
const webhookReceiver = new lambda.Function(this, 'WebhookReceiver', {
  functionName: 'app-modex-webhook-receiver',
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda/global/webhook-receiver'),
});

// Add POST method
webhookResource.addMethod('POST', new apigateway.LambdaIntegration(webhookReceiver), {
  apiKeyRequired: true,  // Require API key for security
});

// Create API key for webhook access
const webhookApiKey = this.api.addApiKey('WebhookApiKey', {
  apiKeyName: 'app-modex-webhook-key',
});
```

**Webhook Receiver Lambda**:

```javascript
// infrastructure/lambda/global/webhook-receiver/index.js
const crypto = require('crypto');
const { DynamoDB } = require('@aws-sdk/client-dynamodb');

const dynamodb = new DynamoDB();

exports.handler = async (event) => {
  console.log('Received webhook:', JSON.stringify(event));
  
  // Verify signature
  const signature = event.headers['X-Webhook-Signature'];
  const secret = process.env.WEBHOOK_SECRET;
  
  if (secret && signature) {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(event.body)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid signature' }),
      };
    }
  }
  
  const payload = JSON.parse(event.body);
  
  // Process webhook based on type
  switch (payload.type) {
    case 'project.update':
      await handleProjectUpdate(payload);
      break;
    case 'data.import':
      await handleDataImport(payload);
      break;
    default:
      console.log('Unknown webhook type:', payload.type);
  }
  
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Webhook processed' }),
  };
};

async function handleProjectUpdate(payload) {
  await dynamodb.updateItem({
    TableName: 'app-modex-projects',
    Key: { projectId: { S: payload.projectId } },
    UpdateExpression: 'SET #status = :status, lastUpdated = :timestamp',
    ExpressionAttributeNames: {
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ':status': { S: payload.status },
      ':timestamp': { S: new Date().toISOString() },
    },
  });
}

async function handleDataImport(payload) {
  // Trigger data import process
  // Implementation depends on your data import workflow
}
```

### Deployment

```bash
# Set environment variables for integrations
export JIRA_HOST="yourcompany.atlassian.net"
export JIRA_EMAIL="your-email@company.com"
export JIRA_API_TOKEN="your-api-token"
export SNOW_INSTANCE="yourcompany"
export SNOW_USERNAME="integration-user"
export SNOW_PASSWORD="YOUR_PASSWORD_HERE"
export WEBHOOK_SECRET="your-webhook-secret"

# Deploy backend with integrations
cd infrastructure
./scripts/deploy-backend.sh --profile app-modex-prod --region us-west-2

# Get webhook endpoint URL
aws apigateway get-rest-apis --profile app-modex-prod --region us-west-2
```

---

## Custom Analytics and Dashboards

> **💰 COST IMPACT: YES - QuickSight subscription required**
> 
> **Additional Cost:** $9-18 per user/month for QuickSight
> **Athena Costs:** $5 per TB scanned (existing)
> 
> **How to Calculate Your Cost:**
> 1. QuickSight: $9/user/month (Reader) or $18/user/month (Author)
> 2. Go to: https://calculator.aws/#/addService/QuickSight
> 3. Enter: Number of users and user types
> 4. Athena: Already included in base deployment
> 5. Total: (Readers × $9) + (Authors × $18)

Create custom analytics views and dashboards using Athena queries and QuickSight visualizations.

### Current Athena Views

App-ModEx includes several pre-built Athena views in `infrastructure/athena-tables/`:

- `v_application_portfolio.sql` - Deduplicated application portfolio
- `v_infrastructure_resources.sql` - Infrastructure resources
- `v_normalized_databases.sql` - Normalized database technologies
- `v_normalized_frameworks.sql` - Normalized frameworks
- `v_normalized_runtimes.sql` - Normalized runtime environments
- `v_resource_utilization.sql` - Resource utilization metrics
- `v_team_skills.sql` - Team skills inventory
- `v_tech_stack.sql` - Technology stack components
- `v_tech_vision.sql` - Technology vision and roadmap

### Option 1: Create Custom Athena Views

**Example: Application Complexity Score View**

```sql
-- infrastructure/athena-tables/v_application_complexity.sql
CREATE VIEW v_application_complexity AS
WITH app_metrics AS (
  SELECT 
    p.applicationname,
    p.department,
    p.criticality,
    COUNT(DISTINCT ts.componenttype) as component_types,
    COUNT(DISTINCT ts.componentname) as total_components,
    COUNT(DISTINCT ir.resourcetype) as resource_types,
    COUNT(DISTINCT ir.resourcename) as total_resources,
    AVG(CAST(ru.averagevalue AS DOUBLE)) as avg_utilization
  FROM v_application_portfolio p
  LEFT JOIN v_tech_stack ts ON p.applicationname = ts.applicationname
  LEFT JOIN v_infrastructure_resources ir ON p.applicationname = ir.applicationname
  LEFT JOIN v_resource_utilization ru ON p.applicationname = ru.applicationname
  GROUP BY p.applicationname, p.department, p.criticality
)
SELECT 
  applicationname,
  department,
  criticality,
  component_types,
  total_components,
  resource_types,
  total_resources,
  avg_utilization,
  -- Calculate complexity score (0-100)
  LEAST(100, 
    (component_types * 5) + 
    (total_components * 2) + 
    (resource_types * 3) + 
    (CASE criticality 
      WHEN 'High' THEN 20 
      WHEN 'Medium' THEN 10 
      ELSE 5 
    END)
  ) as complexity_score,
  -- Categorize complexity
  CASE 
    WHEN (component_types * 5 + total_components * 2) > 50 THEN 'High'
    WHEN (component_types * 5 + total_components * 2) > 25 THEN 'Medium'
    ELSE 'Low'
  END as complexity_category
FROM app_metrics;
```

**Example: Technology Adoption Trend View**

```sql
-- infrastructure/athena-tables/v_technology_adoption.sql
CREATE VIEW v_technology_adoption AS
WITH tech_usage AS (
  SELECT 
    ts.componentname as technology,
    ts.componenttype as category,
    COUNT(DISTINCT ts.applicationname) as app_count,
    COUNT(DISTINCT p.department) as dept_count,
    tv.phase as vision_phase,
    tv.ring as tech_radar_ring
  FROM v_tech_stack ts
  LEFT JOIN v_application_portfolio p ON ts.applicationname = p.applicationname
  LEFT JOIN v_tech_vision tv ON ts.componentname = tv.technology
  GROUP BY ts.componentname, ts.componenttype, tv.phase, tv.ring
)
SELECT 
  technology,
  category,
  app_count,
  dept_count,
  vision_phase,
  tech_radar_ring,
  -- Calculate adoption score
  (app_count * 10 + dept_count * 5) as adoption_score,
  -- Determine adoption status
  CASE 
    WHEN app_count > 10 THEN 'Widely Adopted'
    WHEN app_count > 5 THEN 'Moderately Adopted'
    WHEN app_count > 1 THEN 'Limited Adoption'
    ELSE 'Single Use'
  END as adoption_status,
  -- Strategic alignment
  CASE 
    WHEN tech_radar_ring = 'Adopt' AND vision_phase = 'Current' THEN 'Aligned'
    WHEN tech_radar_ring = 'Hold' AND vision_phase = 'Sunset' THEN 'Aligned'
    WHEN tech_radar_ring = 'Adopt' AND vision_phase = 'Sunset' THEN 'Misaligned'
    ELSE 'Review Required'
  END as strategic_alignment
FROM tech_usage
ORDER BY adoption_score DESC;
```

**Example: Team Capability Gap View**

```sql
-- infrastructure/athena-tables/v_team_capability_gaps.sql
CREATE VIEW v_team_capability_gaps AS
WITH required_skills AS (
  SELECT DISTINCT
    ts.componentname as skill,
    ts.componenttype as category,
    COUNT(DISTINCT ts.applicationname) as demand
  FROM v_tech_stack ts
  GROUP BY ts.componentname, ts.componenttype
),
available_skills AS (
  SELECT 
    sk.skill,
    sk.team,
    COUNT(*) as team_members,
    AVG(CASE sk.proficiency
      WHEN 'Expert' THEN 4
      WHEN 'Advanced' THEN 3
      WHEN 'Intermediate' THEN 2
      ELSE 1
    END) as avg_proficiency
  FROM v_team_skills sk
  GROUP BY sk.skill, sk.team
)
SELECT 
  r.skill,
  r.category,
  r.demand,
  COALESCE(SUM(a.team_members), 0) as available_resources,
  COALESCE(AVG(a.avg_proficiency), 0) as avg_proficiency,
  r.demand - COALESCE(SUM(a.team_members), 0) as resource_gap,
  CASE 
    WHEN r.demand > COALESCE(SUM(a.team_members), 0) * 2 THEN 'Critical'
    WHEN r.demand > COALESCE(SUM(a.team_members), 0) THEN 'High'
    WHEN r.demand > COALESCE(SUM(a.team_members), 0) * 0.5 THEN 'Medium'
    ELSE 'Low'
  END as gap_severity
FROM required_skills r
LEFT JOIN available_skills a ON r.skill = a.skill
GROUP BY r.skill, r.category, r.demand
HAVING r.demand > COALESCE(SUM(a.team_members), 0)
ORDER BY gap_severity DESC, resource_gap DESC;
```

### Option 2: Deploy Custom Views

**Script**: `infrastructure/scripts/create-custom-views.sh`

```bash
#!/bin/bash

PROJECT_ID=$1
REGION=${2:-us-west-2}
DATABASE="app_modex_${PROJECT_ID}"
WORKGROUP="app-modex-workgroup-${PROJECT_ID}"

# Array of custom view files
VIEWS=(
  "v_application_complexity.sql"
  "v_technology_adoption.sql"
  "v_team_capability_gaps.sql"
)

for view in "${VIEWS[@]}"; do
  echo "Creating view: $view"
  
  # Read SQL file
  SQL=$(cat "athena-tables/$view")
  
  # Execute query
  aws athena start-query-execution \
    --query-string "$SQL" \
    --query-execution-context Database="$DATABASE" \
    --work-group "$WORKGROUP" \
    --region "$REGION"
    
  echo "View $view created successfully"
done
```

### Option 3: QuickSight Integration

**Step 1: Create QuickSight Data Source**

```bash
# Create Athena data source in QuickSight
aws quicksight create-data-source \
  --aws-account-id ACCOUNT_ID \
  --data-source-id app-modex-athena \
  --name "App-ModEx Athena" \
  --type ATHENA \
  --data-source-parameters '{
    "AthenaParameters": {
      "WorkGroup": "app-modex-workgroup-PROJECT_ID"
    }
  }' \
  --permissions '[{
    "Principal": "arn:aws:quicksight:us-west-2:ACCOUNT_ID:user/default/admin",
    "Actions": [
      "quicksight:DescribeDataSource",
      "quicksight:DescribeDataSourcePermissions",
      "quicksight:PassDataSource"
    ]
  }]'
```

**Step 2: Create QuickSight Dataset**

```bash
# Create dataset from Athena view
aws quicksight create-data-set \
  --aws-account-id ACCOUNT_ID \
  --data-set-id app-modex-complexity \
  --name "Application Complexity" \
  --physical-table-map '{
    "complexity-table": {
      "RelationalTable": {
        "DataSourceArn": "arn:aws:quicksight:us-west-2:ACCOUNT_ID:datasource/app-modex-athena",
        "Schema": "app_modex_PROJECT_ID",
        "Name": "v_application_complexity",
        "InputColumns": [
          {"Name": "applicationname", "Type": "STRING"},
          {"Name": "department", "Type": "STRING"},
          {"Name": "complexity_score", "Type": "INTEGER"},
          {"Name": "complexity_category", "Type": "STRING"}
        ]
      }
    }
  }' \
  --import-mode DIRECT_QUERY
```

**Step 3: Create QuickSight Dashboard**

Use QuickSight console or API to create dashboards with:
- Application complexity heatmap
- Technology adoption trends
- Team capability gaps
- Modernization progress tracking
- Cost analysis charts

### Option 4: Custom KPIs and Metrics

**Create Lambda for KPI Calculation**:

```javascript
// infrastructure/lambda/global/kpi-calculator/index.js
const { Athena } = require('@aws-sdk/client-athena');
const { DynamoDB } = require('@aws-sdk/client-dynamodb');

const athena = new Athena();
const dynamodb = new DynamoDB();

exports.handler = async (event) => {
  const { projectId } = event;
  const database = `app_modex_${projectId}`;
  const workgroup = `app-modex-workgroup-${projectId}`;
  
  // Calculate KPIs
  const kpis = {
    totalApplications: await executeQuery(
      `SELECT COUNT(DISTINCT applicationname) as count FROM v_application_portfolio`,
      database, workgroup
    ),
    
    highComplexityApps: await executeQuery(
      `SELECT COUNT(*) as count FROM v_application_complexity WHERE complexity_category = 'High'`,
      database, workgroup
    ),
    
    criticalSkillGaps: await executeQuery(
      `SELECT COUNT(*) as count FROM v_team_capability_gaps WHERE gap_severity = 'Critical'`,
      database, workgroup
    ),
    
    modernizationReadiness: await executeQuery(
      `SELECT AVG(CASE WHEN strategic_alignment = 'Aligned' THEN 100 ELSE 0 END) as score 
       FROM v_technology_adoption`,
      database, workgroup
    ),
    
    avgComplexityScore: await executeQuery(
      `SELECT AVG(complexity_score) as avg FROM v_application_complexity`,
      database, workgroup
    ),
  };
  
  // Store KPIs in DynamoDB
  await dynamodb.putItem({
    TableName: 'app-modex-kpis',
    Item: {
      projectId: { S: projectId },
      timestamp: { S: new Date().toISOString() },
      kpis: { S: JSON.stringify(kpis) },
    },
  });
  
  return kpis;
};

async function executeQuery(query, database, workgroup) {
  const execution = await athena.startQueryExecution({
    QueryString: query,
    QueryExecutionContext: { Database: database },
    WorkGroup: workgroup,
  });
  
  // Wait for query to complete
  let status = 'RUNNING';
  while (status === 'RUNNING' || status === 'QUEUED') {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const result = await athena.getQueryExecution({
      QueryExecutionId: execution.QueryExecutionId,
    });
    status = result.QueryExecution.Status.State;
  }
  
  // Get results
  const results = await athena.getQueryResults({
    QueryExecutionId: execution.QueryExecutionId,
  });
  
  return results.ResultSet.Rows[1]?.Data[0]?.VarCharValue || '0';
}
```

### Option 5: Export Analytics to Excel

Add analytics sheets to Excel exports:

```javascript
// In excel-generator Lambda
async function addAnalyticsSheet(workbook, projectId) {
  const sheet = workbook.addWorksheet('Analytics');
  
  // Fetch KPIs
  const kpis = await getKPIs(projectId);
  
  // Add KPI summary
  sheet.addRow(['Key Performance Indicators']);
  sheet.addRow(['Metric', 'Value', 'Status']);
  
  sheet.addRow(['Total Applications', kpis.totalApplications, '']);
  sheet.addRow(['High Complexity Apps', kpis.highComplexityApps, 
    kpis.highComplexityApps > 10 ? 'High' : 'Normal']);
  sheet.addRow(['Critical Skill Gaps', kpis.criticalSkillGaps,
    kpis.criticalSkillGaps > 5 ? 'Action Required' : 'OK']);
  sheet.addRow(['Modernization Readiness', `${kpis.modernizationReadiness}%`,
    kpis.modernizationReadiness > 70 ? 'Good' : 'Needs Improvement']);
  
  // Add charts
  // Implementation depends on ExcelJS charting capabilities
}
```

### Deployment

```bash
# Create custom views
cd infrastructure
./scripts/create-custom-views.sh PROJECT_ID us-west-2

# Verify views
aws athena start-query-execution \
  --query-string "SHOW VIEWS IN app_modex_PROJECT_ID" \
  --query-execution-context Database=app_modex_PROJECT_ID \
  --work-group app-modex-workgroup-PROJECT_ID

# Set up QuickSight (requires QuickSight subscription)
aws quicksight create-account-subscription \
  --edition ENTERPRISE \
  --authentication-method IAM_AND_QUICKSIGHT \
  --aws-account-id ACCOUNT_ID \
  --account-name app-modex-analytics
```

---

## Access Control and Permissions

> **💰 COST IMPACT: NO - Built into Cognito and IAM**
> 
> **Current Cost:** FREE (included in base deployment)
> **No Additional Costs:** Permission management is included

App-ModEx already implements project-level permissions. This section covers extending access control with additional features.

### Current Permission System

**File**: `app-modex-ui/src/hooks/useProjectPermissions.js`

The system already implements:
- Project ownership (full access)
- Shared access with read-only or read-write modes
- Permission checks before operations

```javascript
const { hasWriteAccess, hasReadAccess, loading } = useProjectPermissions(projectId);

// Usage in components
{hasWriteAccess && <Button onClick={handleEdit}>Edit</Button>}
{hasReadAccess && <DataDisplay data={projectData} />}
```

### Option 1: Role-Based Access Control (RBAC)

Extend the current system with roles:

```typescript
// Add to app-modex-data-stack.ts
const rolesTable = new dynamodb.Table(this, 'RolesTable', {
  tableName: `app-modex-roles`,
  partitionKey: { name: 'roleId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
});

const userRolesTable = new dynamodb.Table(this, 'UserRolesTable', {
  tableName: `app-modex-user-roles`,
  partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'projectId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
});
```

**Define Roles**:

```javascript
// Seed roles in DynamoDB
const ROLES = {
  ADMIN: {
    roleId: 'admin',
    name: 'Administrator',
    permissions: [
      'project:create',
      'project:read',
      'project:update',
      'project:delete',
      'project:share',
      'data:upload',
      'data:download',
      'data:delete',
      'export:create',
      'export:download',
      'analysis:run',
    ],
  },
  EDITOR: {
    roleId: 'editor',
    name: 'Editor',
    permissions: [
      'project:read',
      'project:update',
      'data:upload',
      'data:download',
      'export:create',
      'export:download',
      'analysis:run',
    ],
  },
  VIEWER: {
    roleId: 'viewer',
    name: 'Viewer',
    permissions: [
      'project:read',
      'data:download',
      'export:download',
    ],
  },
  ANALYST: {
    roleId: 'analyst',
    name: 'Analyst',
    permissions: [
      'project:read',
      'data:download',
      'export:create',
      'export:download',
      'analysis:run',
    ],
  },
};
```

**Permission Check Hook**:

```javascript
// app-modex-ui/src/hooks/usePermissions.js
import { useState, useEffect } from 'react';
import { useSimpleAuth } from '../contexts/SimpleAuthContext';

export const usePermissions = (projectId) => {
  const { user } = useSimpleAuth();
  const [permissions, setPermissions] = useState([]);
  const [role, setRole] = useState(null);
  
  useEffect(() => {
    const fetchPermissions = async () => {
      const response = await fetch(
        `${API_URL}/projects/${projectId}/permissions`,
        {
          headers: {
            Authorization: `Bearer ${await user.getIdToken()}`,
          },
        }
      );
      
      const data = await response.json();
      setRole(data.role);
      setPermissions(data.permissions);
    };
    
    if (user && projectId) {
      fetchPermissions();
    }
  }, [user, projectId]);
  
  const hasPermission = (permission) => {
    return permissions.includes(permission);
  };
  
  const hasAnyPermission = (...perms) => {
    return perms.some(p => permissions.includes(p));
  };
  
  const hasAllPermissions = (...perms) => {
    return perms.every(p => permissions.includes(p));
  };
  
  return {
    role,
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };
};

// Usage
const MyComponent = () => {
  const { hasPermission } = usePermissions(projectId);
  
  return (
    <>
      {hasPermission('data:upload') && <UploadButton />}
      {hasPermission('export:create') && <ExportButton />}
      {hasPermission('project:delete') && <DeleteButton />}
    </>
  );
};
```

### Option 2: Feature Flags

Implement feature flags for gradual rollouts:

```typescript
// Add feature flags table
const featureFlagsTable = new dynamodb.Table(this, 'FeatureFlagsTable', {
  tableName: `app-modex-feature-flags`,
  partitionKey: { name: 'flagKey', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
});
```

**Feature Flag Service**:

```javascript
// app-modex-ui/src/services/featureFlagService.js
class FeatureFlagService {
  constructor() {
    this.flags = {};
    this.loaded = false;
  }
  
  async loadFlags(userId, projectId) {
    const response = await fetch(`${API_URL}/feature-flags`, {
      headers: {
        'x-user-id': userId,
        'x-project-id': projectId,
      },
    });
    
    this.flags = await response.json();
    this.loaded = true;
  }
  
  isEnabled(flagKey, defaultValue = false) {
    if (!this.loaded) {
      console.warn('Feature flags not loaded yet');
      return defaultValue;
    }
    
    const flag = this.flags[flagKey];
    if (!flag) return defaultValue;
    
    // Check if flag is enabled globally
    if (flag.enabled === false) return false;
    
    // Check percentage rollout
    if (flag.percentage && flag.percentage < 100) {
      const hash = this.hashUserId(flag.userId);
      return (hash % 100) < flag.percentage;
    }
    
    // Check user whitelist
    if (flag.whitelist && flag.whitelist.length > 0) {
      return flag.whitelist.includes(flag.userId);
    }
    
    return flag.enabled;
  }
  
  hashUserId(userId) {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

export const featureFlags = new FeatureFlagService();

// Usage
import { featureFlags } from '../services/featureFlagService';

const MyComponent = () => {
  const newFeatureEnabled = featureFlags.isEnabled('new-export-format');
  
  return (
    <>
      {newFeatureEnabled && <NewExportButton />}
      {!newFeatureEnabled && <OldExportButton />}
    </>
  );
};
```

### Option 3: Data Masking for Sensitive Fields

Implement field-level security:

```javascript
// Lambda: infrastructure/lambda/global/data-masking/index.js
const SENSITIVE_FIELDS = {
  'team-skills': ['email', 'salary', 'personalInfo'],
  'portfolio': ['owner', 'costCenter', 'budget'],
};

const MASKING_RULES = {
  email: (value) => value.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
  salary: (value) => '***',
  budget: (value) => Math.round(value / 1000) * 1000, // Round to nearest 1000
};

exports.handler = async (event) => {
  const { dataType, data, userRole } = event;
  
  // Admins see everything
  if (userRole === 'admin') {
    return data;
  }
  
  const sensitiveFields = SENSITIVE_FIELDS[dataType] || [];
  
  return data.map(record => {
    const maskedRecord = { ...record };
    
    sensitiveFields.forEach(field => {
      if (maskedRecord[field]) {
        const maskingRule = MASKING_RULES[field];
        maskedRecord[field] = maskingRule 
          ? maskingRule(maskedRecord[field])
          : '***';
      }
    });
    
    return maskedRecord;
  });
};
```

### Option 4: Audit Logging

Track all access and modifications:

```typescript
// Add audit log table
const auditLogTable = new dynamodb.Table(this, 'AuditLogTable', {
  tableName: `app-modex-audit-log`,
  partitionKey: { name: 'logId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'ttl',  // Auto-delete old logs
});

// Add GSI for user queries
auditLogTable.addGlobalSecondaryIndex({
  indexName: 'userId-timestamp-index',
  partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
});
```

**Audit Logger Lambda**:

```javascript
// infrastructure/lambda/global/audit-logger/index.js
const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new DynamoDB();

exports.handler = async (event) => {
  const {
    userId,
    action,
    resource,
    resourceId,
    projectId,
    result,
    metadata,
  } = event;
  
  const timestamp = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60); // 90 days
  
  await dynamodb.putItem({
    TableName: 'app-modex-audit-log',
    Item: {
      logId: { S: uuidv4() },
      timestamp: { S: timestamp },
      userId: { S: userId },
      action: { S: action },
      resource: { S: resource },
      resourceId: { S: resourceId },
      projectId: { S: projectId || 'N/A' },
      result: { S: result },
      metadata: { S: JSON.stringify(metadata || {}) },
      ttl: { N: ttl.toString() },
    },
  });
  
  console.log(`Audit log created: ${action} on ${resource} by ${userId}`);
};

// Trigger from other Lambdas
const { Lambda } = require('@aws-sdk/client-lambda');
const lambda = new Lambda();

await lambda.invoke({
  FunctionName: 'app-modex-audit-logger',
  InvocationType: 'Event',  // Async
  Payload: JSON.stringify({
    userId: user.userId,
    action: 'PROJECT_CREATED',
    resource: 'project',
    resourceId: projectId,
    result: 'SUCCESS',
    metadata: { projectName: name },
  }),
});
```

### Option 5: IP Whitelisting

Restrict access by IP address:

```typescript
// Add WAF Web ACL to API Gateway
const webAcl = new wafv2.CfnWebACL(this, 'ApiWebAcl', {
  scope: 'REGIONAL',
  defaultAction: { block: {} },
  rules: [
    {
      name: 'AllowCorporateIPs',
      priority: 1,
      statement: {
        ipSetReferenceStatement: {
          arn: ipSet.attrArn,
        },
      },
      action: { allow: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'AllowCorporateIPs',
      },
    },
  ],
  visibilityConfig: {
    sampledRequestsEnabled: true,
    cloudWatchMetricsEnabled: true,
    metricName: 'ApiWebAcl',
  },
});

// Create IP set
const ipSet = new wafv2.CfnIPSet(this, 'CorporateIPs', {
  scope: 'REGIONAL',
  ipAddressVersion: 'IPV4',
  addresses: [
    '203.0.113.0/24',  // Your corporate IP range
    '198.51.100.0/24',
  ],
});

// Associate with API Gateway
new wafv2.CfnWebACLAssociation(this, 'ApiWafAssociation', {
  resourceArn: this.api.deploymentStage.stageArn,
  webAclArn: webAcl.attrArn,
});
```

---

## Performance Tuning

> **💰 COST IMPACT: VARIABLE - Can increase or decrease costs**
> 
> **Potential Savings:** $50-500/month with proper optimization
> **Potential Increase:** $100-1000/month if over-provisioned
> 
> **How to Calculate Your Impact:**
> 1. Monitor current costs in Cost Explorer
> 2. Test configuration changes in dev environment
> 3. Compare before/after metrics
> 4. Gradually apply to production

Optimize App-ModEx performance through Lambda, DynamoDB, API Gateway, and Athena tuning.

### Option 1: Lambda Memory and Timeout Optimization

**Current Configuration**: Most Lambdas use 512MB memory, 30s timeout

**Optimization Strategy**:

```typescript
// Analyze Lambda performance
// Use CloudWatch Insights query:
// fields @maxMemoryUsed, @duration, @billedDuration
// | filter @type = "REPORT"
// | stats avg(@maxMemoryUsed), max(@maxMemoryUsed), avg(@duration)

// Adjust based on actual usage
const projectsFunction = new lambda.Function(this, 'ProjectsFunction', {
  functionName: 'app-modex-projects',
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda/global/projects'),
  timeout: Duration.seconds(15),  // Reduced from 30s
  memorySize: 256,  // Reduced from 512MB (if avg usage < 200MB)
  // ...
});

// For data-intensive operations
const athenaQueryFunction = new lambda.Function(this, 'AthenaQueryFunction', {
  functionName: 'app-modex-athena-query',
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda/global/athena-query'),
  timeout: Duration.minutes(5),  // Increased for complex queries
  memorySize: 1024,  // Increased for better performance
  // ...
});

// Enable Lambda Insights for monitoring
const insightsLayer = lambda.LayerVersion.fromLayerVersionArn(
  this,
  'LambdaInsightsLayer',
  `arn:aws:lambda:${this.region}:580247275435:layer:LambdaInsightsExtension:14`
);

projectsFunction.addLayers(insightsLayer);
```

### Option 2: DynamoDB Capacity Mode Optimization

**Current**: Pay-per-request (on-demand) mode

**Option A: Switch to Provisioned for Predictable Workloads**

```typescript
this.projectsTable = new dynamodb.Table(this, 'ProjectsTable', {
  tableName: `app-modex-projects`,
  partitionKey: { name: 'projectId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PROVISIONED,
  readCapacity: 5,  // Start low, enable auto-scaling
  writeCapacity: 5,
  // ...
});

// Enable auto-scaling
const readScaling = this.projectsTable.autoScaleReadCapacity({
  minCapacity: 5,
  maxCapacity: 100,
});

readScaling.scaleOnUtilization({
  targetUtilizationPercent: 70,
});

const writeScaling = this.projectsTable.autoScaleWriteCapacity({
  minCapacity: 5,
  maxCapacity: 100,
});

writeScaling.scaleOnUtilization({
  targetUtilizationPercent: 70,
});
```

**Option B: Enable DynamoDB DAX for Read-Heavy Workloads**

```typescript
import * as dax from 'aws-cdk-lib/aws-dax';

// Create DAX cluster
const daxCluster = new dax.CfnCluster(this, 'DaxCluster', {
  clusterName: 'app-modex-dax',
  nodeType: 'dax.t3.small',
  replicationFactor: 3,
  iamRoleArn: daxRole.roleArn,
  subnetGroupName: daxSubnetGroup.ref,
  securityGroupIds: [daxSecurityGroup.securityGroupId],
});

// Update Lambda to use DAX endpoint
const projectsFunction = new lambda.Function(this, 'ProjectsFunction', {
  // ...
  environment: {
    DAX_ENDPOINT: daxCluster.attrClusterDiscoveryEndpoint,
    USE_DAX: 'true',
  },
});
```

### Option 3: API Gateway Caching

```typescript
this.api = new apigateway.RestApi(this, 'AppModExApi', {
  restApiName: `app-modex-api`,
  deployOptions: {
    stageName: environment,
    cachingEnabled: true,
    cacheClusterEnabled: true,
    cacheClusterSize: '0.5',  // 0.5GB cache
    cacheTtl: Duration.minutes(5),
    cacheDataEncrypted: true,
  },
  // ...
});

// Enable caching per method
const projectsResource = this.api.root.addResource('projects');
projectsResource.addMethod('GET', integration, {
  methodResponses: [{
    statusCode: '200',
    responseParameters: {
      'method.response.header.Cache-Control': true,
    },
  }],
  requestParameters: {
    'method.request.header.Cache-Control': false,
  },
});
```

### Option 4: CloudFront Caching Optimization

```typescript
this.distribution = new cloudfront.Distribution(this, 'Distribution', {
  defaultBehavior: {
    origin: new origins.S3Origin(this.bucket),
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    cachePolicy: new cloudfront.CachePolicy(this, 'CachePolicy', {
      cachePolicyName: 'app-modex-cache-policy',
      defaultTtl: Duration.hours(24),
      maxTtl: Duration.days(365),
      minTtl: Duration.seconds(0),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Authorization'),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    }),
  },
  // Add behavior for API calls (no caching)
  additionalBehaviors: {
    '/api/*': {
      origin: new origins.HttpOrigin('api.app-modex.com'),
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
    },
  },
});
```

### Option 5: Athena Query Optimization

**Partition Data**:

```sql
-- Create partitioned table
CREATE EXTERNAL TABLE application_portfolio_partitioned (
  applicationname STRING,
  department STRING,
  criticality STRING,
  purpose STRING
)
PARTITIONED BY (year INT, month INT)
STORED AS PARQUET
LOCATION 's3://app-modex-data-ACCOUNT/portfolio-partitioned/';

-- Add partitions
ALTER TABLE application_portfolio_partitioned 
ADD PARTITION (year=2025, month=2) 
LOCATION 's3://app-modex-data-ACCOUNT/portfolio-partitioned/year=2025/month=2/';
```

**Use Columnar Formats**:

```javascript
// Convert CSV to Parquet in Lambda
const { S3 } = require('@aws-sdk/client-s3');
const parquet = require('parquetjs');

async function convertToParquet(csvData, s3Key) {
  const schema = new parquet.ParquetSchema({
    applicationname: { type: 'UTF8' },
    department: { type: 'UTF8' },
    criticality: { type: 'UTF8' },
  });
  
  const writer = await parquet.ParquetWriter.openFile(schema, '/tmp/output.parquet');
  
  for (const row of csvData) {
    await writer.appendRow(row);
  }
  
  await writer.close();
  
  // Upload to S3
  await s3.putObject({
    Bucket: 'app-modex-data-ACCOUNT',
    Key: s3Key.replace('.csv', '.parquet'),
    Body: fs.readFileSync('/tmp/output.parquet'),
  });
}
```

**Optimize Queries**:

```sql
-- Bad: Full table scan
SELECT * FROM v_application_portfolio WHERE department = 'Engineering';

-- Good: Use WHERE with partition columns
SELECT * FROM application_portfolio_partitioned 
WHERE year = 2025 AND month = 2 AND department = 'Engineering';

-- Bad: SELECT *
SELECT * FROM v_tech_stack;

-- Good: Select only needed columns
SELECT applicationname, componentname, componenttype FROM v_tech_stack;

-- Use LIMIT for testing
SELECT * FROM v_application_portfolio LIMIT 100;
```

### Monitoring and Optimization

```bash
# Monitor Lambda performance
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=app-modex-projects \
  --start-time 2025-02-01T00:00:00Z \
  --end-time 2025-02-04T00:00:00Z \
  --period 3600 \
  --statistics Average,Maximum

# Monitor DynamoDB throttling
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name UserErrors \
  --dimensions Name=TableName,Value=app-modex-projects \
  --start-time 2025-02-01T00:00:00Z \
  --end-time 2025-02-04T00:00:00Z \
  --period 3600 \
  --statistics Sum

# Monitor API Gateway latency
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name Latency \
  --dimensions Name=ApiName,Value=app-modex-api \
  --start-time 2025-02-01T00:00:00Z \
  --end-time 2025-02-04T00:00:00Z \
  --period 3600 \
  --statistics Average,Maximum
```

---

## Cost Optimization

### Documentation
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Amazon Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [AWS Amplify Documentation](https://docs.amplify.aws/)

### Community
- [AWS CDK GitHub](https://github.com/aws/aws-cdk)
- [AWS re:Post](https://repost.aws/)

### Internal Resources
- Project README: `README.md`
- Infrastructure Guide: `INFRASTRUCTURE.md`
- User Guide: `USER_GUIDE.md`
- API Analysis: `API_ANALYSIS.md`

---

**Document Version**: 1.0  
**Last Updated**: February 2026  
**Maintained By**: DevOps Team

For questions or issues, contact: devops@yourcompany.com
