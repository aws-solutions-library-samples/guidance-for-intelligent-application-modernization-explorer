import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface AppModExApplicationStackProps extends cdk.StackProps {
  environment: string;
}

export class AppModExApplicationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppModExApplicationStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Create Resource Group for tag-based resource discovery
    const resourceGroup = new cdk.CfnResource(this, 'AppModExResourceGroup', {
      type: 'AWS::ResourceGroups::Group',
      properties: {
        Name: 'App-ModEx-Application',
        ResourceQuery: {
          Type: 'TAG_FILTERS_1_0',
          Query: {
            ResourceTypeFilters: ['AWS::AllSupported'],
            TagFilters: [
              {
                Key: 'Application',
                Values: ['App-ModEx']
              }
            ]
          }
        },
        Tags: [
          {
            Key: 'Application',
            Value: 'App-ModEx'
          },
          {
            Key: 'Environment',
            Value: environment
          }
        ]
      }
    });

    // Export the Resource Group ARN for reference
    new cdk.CfnOutput(this, 'ResourceGroupArn', {
      value: resourceGroup.getAtt('Arn').toString(),
      description: 'App-ModEx Resource Group ARN',
      exportName: 'AppModEx-ResourceGroupArn'
    });

    // Add Application tags to the stack
    cdk.Tags.of(this).add('Application', 'App-ModEx');
  }
}