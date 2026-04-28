import json
import boto3
import os
import logging
from typing import Dict, List, Any
from decimal import Decimal

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')

# Environment variables
PROJECT_ID = os.environ.get('PROJECT_ID')
APPLICATIONS_TABLE = os.environ.get('APPLICATIONS_TABLE')
PROCESS_FUNCTION_NAME = os.environ.get('PROCESS_FUNCTION_NAME')
BATCH_SIZE = int(os.environ.get('BATCH_SIZE', '50'))

def lambda_handler(event, context):
    """
    Partition applications into batches for similarity processing.
    This function retrieves all applications and creates processing batches.
    """
    try:
        logger.info(f"Starting app similarity partitioning for project: {PROJECT_ID}")
        
        # Get applications table
        applications_table = dynamodb.Table(APPLICATIONS_TABLE)
        
        # Retrieve all applications for the project
        applications = get_all_applications(applications_table)
        logger.info(f"Retrieved {len(applications)} applications for processing")
        
        if len(applications) < 2:
            logger.warning("Need at least 2 applications for similarity analysis")
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'message': 'Insufficient applications for similarity analysis',
                    'applications_count': len(applications)
                })
            }
        
        # Create processing batches
        batches = create_processing_batches(applications)
        logger.info(f"Created {len(batches)} processing batches")
        
        # Invoke processing functions for each batch
        processing_results = []
        for i, batch in enumerate(batches):
            try:
                result = invoke_process_function(batch, i)
                processing_results.append(result)
                logger.info(f"Successfully invoked processing for batch {i}")
            except Exception as e:
                logger.error(f"Failed to invoke processing for batch {i}: {str(e)}")
                processing_results.append({
                    'batch_id': i,
                    'status': 'failed',
                    'error': str(e)
                })
        
        # Calculate summary statistics
        total_comparisons = sum(len(batch['pairs']) for batch in batches)
        successful_batches = sum(1 for result in processing_results if result.get('status') == 'success')
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'App similarity partitioning completed',
                'project_id': PROJECT_ID,
                'applications_count': len(applications),
                'batches_created': len(batches),
                'total_comparisons': total_comparisons,
                'successful_batches': successful_batches,
                'processing_results': processing_results
            }, default=decimal_default)
        }
        
    except Exception as e:
        logger.error(f"Error in app similarity partitioning: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to partition applications for similarity processing',
                'details': str(e)
            })
        }

def get_all_applications(table) -> List[Dict[str, Any]]:
    """Retrieve all applications for the project."""
    applications = []
    
    try:
        # Query applications by project_id
        response = table.query(
            IndexName='ProjectIdIndex',  # Assuming GSI exists
            KeyConditionExpression='project_id = :project_id',
            ExpressionAttributeValues={
                ':project_id': PROJECT_ID
            }
        )
        
        applications.extend(response.get('Items', []))
        
        # Handle pagination
        while 'LastEvaluatedKey' in response:
            response = table.query(
                IndexName='ProjectIdIndex',
                KeyConditionExpression='project_id = :project_id',
                ExpressionAttributeValues={
                    ':project_id': PROJECT_ID
                },
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
            applications.extend(response.get('Items', []))
            
    except Exception as e:
        logger.error(f"Error retrieving applications: {str(e)}")
        raise
    
    return applications

def create_processing_batches(applications: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Create batches of application pairs for processing."""
    batches = []
    current_batch = []
    
    # Generate all unique pairs of applications
    app_pairs = []
    for i in range(len(applications)):
        for j in range(i + 1, len(applications)):
            app_pairs.append({
                'app1': applications[i],
                'app2': applications[j]
            })
    
    # Group pairs into batches
    for i in range(0, len(app_pairs), BATCH_SIZE):
        batch_pairs = app_pairs[i:i + BATCH_SIZE]
        batch = {
            'batch_id': len(batches),
            'pairs': batch_pairs,
            'project_id': PROJECT_ID,
            'total_pairs': len(batch_pairs)
        }
        batches.append(batch)
    
    return batches

def invoke_process_function(batch: Dict[str, Any], batch_id: int) -> Dict[str, Any]:
    """Invoke the processing function for a batch."""
    try:
        payload = {
            'batch': batch,
            'project_id': PROJECT_ID
        }
        
        response = lambda_client.invoke(
            FunctionName=PROCESS_FUNCTION_NAME,
            InvocationType='Event',  # Asynchronous invocation
            Payload=json.dumps(payload, default=decimal_default)
        )
        
        return {
            'batch_id': batch_id,
            'status': 'success',
            'response_status_code': response['StatusCode']
        }
        
    except Exception as e:
        logger.error(f"Error invoking process function for batch {batch_id}: {str(e)}")
        raise

def decimal_default(obj):
    """JSON serializer for Decimal objects."""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")
