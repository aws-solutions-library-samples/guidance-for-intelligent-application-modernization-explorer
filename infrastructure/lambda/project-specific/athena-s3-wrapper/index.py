"""
S3 Wrapper Lambda for Athena Query Results
Handles large datasets by storing results in S3 instead of returning through Step Functions
"""

import json
import boto3
import os
from typing import Dict, Any

# Initialize AWS clients
lambda_client = boto3.client('lambda')
s3_client = boto3.client('s3')

# Environment variables
PROJECT_ID = os.environ['PROJECT_ID']
RESULTS_BUCKET = os.environ['RESULTS_BUCKET']
ORIGINAL_ATHENA_FUNCTION = os.environ['ORIGINAL_ATHENA_FUNCTION']
WORKGROUP_NAME = os.environ['WORKGROUP_NAME']

# Size threshold for S3 storage (200KB)
SIZE_THRESHOLD = 200 * 1024

def lambda_handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Wrapper function that calls the original Athena query Lambda
    and ALWAYS stores results in S3 for consistent processing
    """
    print(f"🔄 S3 Wrapper Lambda started for project {PROJECT_ID}")
    print(f"📋 Event: {json.dumps(event, indent=2)}")
    
    try:
        # Call the original Athena query Lambda
        print(f"📞 Calling original Athena function: {ORIGINAL_ATHENA_FUNCTION}")
        
        # Prepare the request for the athena-query Lambda
        # The athena-query Lambda expects templateId, parameters, and projectId
        if 'body' in event:
            try:
                body_data = json.loads(event['body'])
                
                # Ensure we have the required fields for the new templateId approach
                if 'templateId' not in body_data:
                    print(f"❌ Missing templateId in request body")
                    return {
                        'statusCode': 400,
                        'body': json.dumps({
                            'error': 'Missing templateId',
                            'details': 'The templateId is required for the new secure query approach'
                        })
                    }
                
                # Ensure projectId is present
                if 'projectId' not in body_data:
                    print(f"❌ Missing projectId in request body")
                    return {
                        'statusCode': 400,
                        'body': json.dumps({
                            'error': 'Missing projectId',
                            'details': 'The projectId is required to execute Athena queries'
                        })
                    }
                
                # Add WorkGroup if not already present (for backward compatibility)
                if 'workGroup' not in body_data:
                    body_data['workGroup'] = WORKGROUP_NAME
                    print(f"🔧 Added WorkGroup: {body_data['workGroup']}")
                
                # Ensure parameters field exists (even if empty)
                if 'parameters' not in body_data:
                    body_data['parameters'] = {}
                
                event['body'] = json.dumps(body_data)
                print(f"🔧 Prepared request with templateId: {body_data['templateId']}")
                
            except (json.JSONDecodeError, KeyError) as e:
                print(f"❌ Error processing request body: {e}")
                return {
                    'statusCode': 400,
                    'body': json.dumps({
                        'error': 'Invalid request body',
                        'details': str(e)
                    })
                }
        
        response = lambda_client.invoke(
            FunctionName=ORIGINAL_ATHENA_FUNCTION,
            InvocationType='RequestResponse',
            Payload=json.dumps(event)
        )
        
        # Parse the response
        response_payload = json.loads(response['Payload'].read())
        print(f"✅ Original Lambda response received")
        
        # Check if response is successful
        if response_payload.get('statusCode') != 200:
            print(f"❌ Original Lambda failed: {response_payload}")
            return response_payload
        
        # Parse the response body
        response_body = response_payload.get('body', '{}')
        if isinstance(response_body, str):
            response_data = json.loads(response_body)
        else:
            response_data = response_body
        
        # ALWAYS store in S3 for consistent processing
        print(f"💾 Storing all results in S3 for consistent processing")
        
        # Generate S3 key
        process_id = context.aws_request_id
        s3_key = f"athena-results/{PROJECT_ID}/{process_id}/query-result.json"
        
        # Store in S3
        s3_client.put_object(
            Bucket=RESULTS_BUCKET,
            Key=s3_key,
            Body=json.dumps(response_data),
            ContentType='application/json',
            Metadata={
                'project-id': PROJECT_ID,
                'process-id': process_id,
                'stored-at': context.aws_request_id
            }
        )
        
        print(f"✅ Results stored in S3: s3://{RESULTS_BUCKET}/{s3_key}")
        
        # ALWAYS return S3 reference
        return {
            'statusCode': 200,
            'body': json.dumps({
                'dataStoredInS3': True,
                's3_bucket': RESULTS_BUCKET,
                's3_key': s3_key,
                'process_id': process_id,
                'metadata': response_data.get('metadata', {}),
                'message': 'Results stored in S3 for consistent processing'
            })
        }
        
    except Exception as e:
        print(f"❌ Error in S3 wrapper: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e),
                'message': 'S3 wrapper Lambda failed'
            })
        }