import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';

export interface AppModExFrontendStackProps extends cdk.StackProps {
  environment: string;
}

export class AppModExFrontendStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: AppModExFrontendStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Create access logs bucket in us-east-1 for frontend logging
    // (S3 logging requires buckets in the same region)
    const accessLogsBucket = new s3.Bucket(this, 'AccessLogsBucket', {
      bucketName: `app-modex-frontend-logs-${this.account}-us-east-1`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod',
      lifecycleRules: [
        {
          expiration: cdk.Duration.days(90),
          noncurrentVersionExpiration: cdk.Duration.days(30),
        }
      ]
    });

    // S3 bucket for website hosting
    this.bucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `app-modex-frontend-${this.account}`,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod',
      versioned: true,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: 'frontend-bucket/',
      lifecycleRules: [
        {
          id: 'CleanupOldVersions',
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
    });

    // SECURITY NOTE: Enforce encryption in transit (Remediation #7)
    // Deny all requests that don't use HTTPS/TLS
    this.bucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'DenyInsecureTransport',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:*'],
      resources: [
        this.bucket.bucketArn,
        `${this.bucket.bucketArn}/*`
      ],
      conditions: {
        Bool: {
          'aws:SecureTransport': 'false'
        }
      }
    }));

    // SECURITY NOTE: CloudFront Origin Access Control (Remediation #26)
    // Migrated from deprecated OAI to OAC for enhanced security
    // OAC supports SSE-KMS, all HTTP methods, and uses AWS Signature Version 4
    const originAccessControl = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      originAccessControlName: `app-modex-oac-${environment}`,
      description: `OAC for App-ModEx Frontend ${environment}`,
    });

    // Update bucket policy with OAC using service principal and SourceArn condition
    // This replaces the legacy OAI canonical user principal approach
    this.bucket.addToResourcePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
      actions: ['s3:GetObject'],
      resources: [this.bucket.arnForObjects('*')],
      conditions: {
        StringEquals: {
          'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/*`
        }
      }
    }));

    // WAF Web ACL for CloudFront (only create if in us-east-1)
    let webAcl: wafv2.CfnWebACL | undefined;
    let wafArn: string | undefined;

    // Check if we're deploying to us-east-1 using environment variable
    const deploymentRegion = process.env.CDK_DEFAULT_REGION || process.env.AWS_DEFAULT_REGION || 'us-west-2';
    if (deploymentRegion === 'us-east-1') {
      // Create WAF directly in us-east-1
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
              metricName: 'AWSManagedRulesCommonRuleSet',
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
              metricName: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          {
            name: 'AWSManagedRulesAmazonIpReputationList',
            priority: 2,
            overrideAction: { none: {} },
            statement: {
              managedRuleGroupStatement: {
                vendorName: 'AWS',
                name: 'AWSManagedRulesAmazonIpReputationList',
              },
            },
            visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'AWSManagedRulesAmazonIpReputationList',
            },
          },
          {
            name: 'AWSManagedRulesAnonymousIpList',
            priority: 3,
            overrideAction: { none: {} },
            statement: {
              managedRuleGroupStatement: {
                vendorName: 'AWS',
                name: 'AWSManagedRulesAnonymousIpList',
              },
            },
            visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'AWSManagedRulesAnonymousIpList',
            },
          },
          // Rate limiting rule
          {
            name: 'RateLimitRule',
            priority: 4,
            action: { block: {} },
            statement: {
              rateBasedStatement: {
                limit: 2000, // requests per 5-minute window
                aggregateKeyType: 'IP',
              },
            },
            visibilityConfig: {
              sampledRequestsEnabled: true,
              cloudWatchMetricsEnabled: true,
              metricName: 'RateLimitRule',
            },
          },
        ],
      });
      wafArn = webAcl.attrArn;
    } else {
      // For other regions, provide instructions but don't fail
      // Note: Avoid logging tokens during synthesis - they show as ${Token[...]}
      console.log('[Frontend Stack] WAF protection not available in this region. Deploy Frontend to us-east-1 for WAF protection.');
    }

    // CloudFront distribution
    const distributionProps: cloudfront.DistributionProps = {
      comment: `App-ModEx Frontend Distribution - ${environment}`,
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // Use only North America and Europe
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket, {
          originAccessControl,
        }),
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      additionalBehaviors: {
        '/static/*': {
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket, {
            originAccessControl,
          }),
          compress: true,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
          responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        },
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(30),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(30),
        },
      ],
    };

    // Add WAF if available
    if (wafArn) {
      (distributionProps as any).webAclId = wafArn;
    }

    this.distribution = new cloudfront.Distribution(this, 'Distribution', distributionProps);

    // Deploy the built React app to S3
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset('../app-modex-ui/build')],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
      prune: true, // Remove files that are not in the source
      retainOnDelete: environment === 'prod',
    });

    // Outputs
    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'S3 bucket name',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID',
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
    });

    new cdk.CfnOutput(this, 'WebsiteURL', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'Website URL',
    });

    new cdk.CfnOutput(this, 'WAFStatus', {
      value: webAcl ? 'Enabled' : `Not Available (deploy to us-east-1 for WAF protection)`,
      description: 'WAF protection status',
    });

    if (webAcl) {
      new cdk.CfnOutput(this, 'WebACLArn', {
        value: webAcl.attrArn,
        description: 'WAF Web ACL ARN',
      });
    }

    // Add Application tags to the stack for Resource Groups integration
    cdk.Tags.of(this).add('Application', 'App-ModEx');
  }
}
