"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModExApplicationStack = void 0;
const cdk = require("aws-cdk-lib");
class AppModExApplicationStack extends cdk.Stack {
    constructor(scope, id, props) {
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
exports.AppModExApplicationStack = AppModExApplicationStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBwLW1vZGV4LWFwcGxpY2F0aW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXBwLW1vZGV4LWFwcGxpY2F0aW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQU9uQyxNQUFhLHdCQUF5QixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3JELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBb0M7UUFDNUUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxFQUFFLFdBQVcsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUU5Qix5REFBeUQ7UUFDekQsTUFBTSxhQUFhLEdBQUcsSUFBSSxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUN2RSxJQUFJLEVBQUUsNEJBQTRCO1lBQ2xDLFVBQVUsRUFBRTtnQkFDVixJQUFJLEVBQUUsdUJBQXVCO2dCQUM3QixhQUFhLEVBQUU7b0JBQ2IsSUFBSSxFQUFFLGlCQUFpQjtvQkFDdkIsS0FBSyxFQUFFO3dCQUNMLG1CQUFtQixFQUFFLENBQUMsbUJBQW1CLENBQUM7d0JBQzFDLFVBQVUsRUFBRTs0QkFDVjtnQ0FDRSxHQUFHLEVBQUUsYUFBYTtnQ0FDbEIsTUFBTSxFQUFFLENBQUMsV0FBVyxDQUFDOzZCQUN0Qjt5QkFDRjtxQkFDRjtpQkFDRjtnQkFDRCxJQUFJLEVBQUU7b0JBQ0o7d0JBQ0UsR0FBRyxFQUFFLGFBQWE7d0JBQ2xCLEtBQUssRUFBRSxXQUFXO3FCQUNuQjtvQkFDRDt3QkFDRSxHQUFHLEVBQUUsYUFBYTt3QkFDbEIsS0FBSyxFQUFFLFdBQVc7cUJBQ25CO2lCQUNGO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFFSCw4Q0FBOEM7UUFDOUMsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUMxQyxLQUFLLEVBQUUsYUFBYSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxRQUFRLEVBQUU7WUFDN0MsV0FBVyxFQUFFLDhCQUE4QjtZQUMzQyxVQUFVLEVBQUUsMkJBQTJCO1NBQ3hDLENBQUMsQ0FBQztRQUVILG9DQUFvQztRQUNwQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQ3BELENBQUM7Q0FDRjtBQTlDRCw0REE4Q0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXBwTW9kRXhBcHBsaWNhdGlvblN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBBcHBNb2RFeEFwcGxpY2F0aW9uU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXBwTW9kRXhBcHBsaWNhdGlvblN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgZW52aXJvbm1lbnQgfSA9IHByb3BzO1xuXG4gICAgLy8gQ3JlYXRlIFJlc291cmNlIEdyb3VwIGZvciB0YWctYmFzZWQgcmVzb3VyY2UgZGlzY292ZXJ5XG4gICAgY29uc3QgcmVzb3VyY2VHcm91cCA9IG5ldyBjZGsuQ2ZuUmVzb3VyY2UodGhpcywgJ0FwcE1vZEV4UmVzb3VyY2VHcm91cCcsIHtcbiAgICAgIHR5cGU6ICdBV1M6OlJlc291cmNlR3JvdXBzOjpHcm91cCcsXG4gICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgIE5hbWU6ICdBcHAtTW9kRXgtQXBwbGljYXRpb24nLFxuICAgICAgICBSZXNvdXJjZVF1ZXJ5OiB7XG4gICAgICAgICAgVHlwZTogJ1RBR19GSUxURVJTXzFfMCcsXG4gICAgICAgICAgUXVlcnk6IHtcbiAgICAgICAgICAgIFJlc291cmNlVHlwZUZpbHRlcnM6IFsnQVdTOjpBbGxTdXBwb3J0ZWQnXSxcbiAgICAgICAgICAgIFRhZ0ZpbHRlcnM6IFtcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIEtleTogJ0FwcGxpY2F0aW9uJyxcbiAgICAgICAgICAgICAgICBWYWx1ZXM6IFsnQXBwLU1vZEV4J11cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgVGFnczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIEtleTogJ0FwcGxpY2F0aW9uJyxcbiAgICAgICAgICAgIFZhbHVlOiAnQXBwLU1vZEV4J1xuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgS2V5OiAnRW52aXJvbm1lbnQnLFxuICAgICAgICAgICAgVmFsdWU6IGVudmlyb25tZW50XG4gICAgICAgICAgfVxuICAgICAgICBdXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBFeHBvcnQgdGhlIFJlc291cmNlIEdyb3VwIEFSTiBmb3IgcmVmZXJlbmNlXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Jlc291cmNlR3JvdXBBcm4nLCB7XG4gICAgICB2YWx1ZTogcmVzb3VyY2VHcm91cC5nZXRBdHQoJ0FybicpLnRvU3RyaW5nKCksXG4gICAgICBkZXNjcmlwdGlvbjogJ0FwcC1Nb2RFeCBSZXNvdXJjZSBHcm91cCBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogJ0FwcE1vZEV4LVJlc291cmNlR3JvdXBBcm4nXG4gICAgfSk7XG5cbiAgICAvLyBBZGQgQXBwbGljYXRpb24gdGFncyB0byB0aGUgc3RhY2tcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ0FwcGxpY2F0aW9uJywgJ0FwcC1Nb2RFeCcpO1xuICB9XG59Il19