import json
import boto3
import os
import logging
from typing import Dict, List, Any, Set
from decimal import Decimal
import time

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')

# Environment variables
PROJECT_ID = os.environ.get('PROJECT_ID')
SIMILARITY_RESULTS_TABLE = os.environ.get('SIMILARITY_RESULTS_TABLE')
AGGREGATE_FUNCTION_NAME = os.environ.get('AGGREGATE_FUNCTION_NAME')

# Similarity weights for different application attributes
SIMILARITY_WEIGHTS = {
    'runtime': 0.40,      # Programming language/runtime
    'framework': 0.30,    # Framework/technology stack
    'database': 0.20,     # Database technology
    'integration': 0.07,  # Integration patterns
    'storage': 0.03       # Storage solutions
}

def lambda_handler(event, context):
    """
    Process application similarity calculations for a batch of application pairs.
    """
    try:
        logger.info("Starting app similarity processing")
        
        # Extract batch data from event
        batch = event.get('batch', {})
        project_id = event.get('project_id', PROJECT_ID)
        batch_id = batch.get('batch_id', 0)
        pairs = batch.get('pairs', [])
        
        logger.info(f"Processing batch {batch_id} with {len(pairs)} application pairs")
        
        if not pairs:
            logger.warning("No application pairs to process")
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'message': 'No application pairs to process',
                    'batch_id': batch_id
                })
            }
        
        # Get similarity results table
        similarity_table = dynamodb.Table(SIMILARITY_RESULTS_TABLE)
        
        # Process each application pair
        similarity_results = []
        for pair in pairs:
            try:
                app1 = pair['app1']
                app2 = pair['app2']
                
                # Calculate similarity score
                similarity_score = calculate_application_similarity(app1, app2)
                
                # Create similarity result record
                result = create_similarity_result(app1, app2, similarity_score, project_id)
                similarity_results.append(result)
                
                logger.info(f"Calculated similarity between {app1.get('name', 'Unknown')} and {app2.get('name', 'Unknown')}: {similarity_score:.3f}")
                
            except Exception as e:
                logger.error(f"Error processing pair {app1.get('name', 'Unknown')} - {app2.get('name', 'Unknown')}: {str(e)}")
                continue
        
        # Batch write similarity results to DynamoDB
        if similarity_results:
            write_similarity_results(similarity_table, similarity_results)
            logger.info(f"Wrote {len(similarity_results)} similarity results to database")
        
        # Invoke aggregate function if this is the last batch
        # (In a real implementation, you'd track batch completion more sophisticatedly)
        try:
            invoke_aggregate_function(project_id, batch_id, len(similarity_results))
        except Exception as e:
            logger.warning(f"Failed to invoke aggregate function: {str(e)}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'App similarity processing completed',
                'project_id': project_id,
                'batch_id': batch_id,
                'pairs_processed': len(pairs),
                'results_created': len(similarity_results)
            }, default=decimal_default)
        }
        
    except Exception as e:
        logger.error(f"Error in app similarity processing: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to process application similarity',
                'details': str(e)
            })
        }

def calculate_application_similarity(app1: Dict[str, Any], app2: Dict[str, Any]) -> float:
    """Calculate weighted similarity score between two applications."""
    try:
        total_score = 0.0
        
        # Runtime similarity (programming language, runtime environment)
        runtime_similarity = calculate_attribute_similarity(
            app1.get('runtime', {}), 
            app2.get('runtime', {})
        )
        total_score += runtime_similarity * SIMILARITY_WEIGHTS['runtime']
        
        # Framework similarity (web frameworks, libraries)
        framework_similarity = calculate_attribute_similarity(
            app1.get('framework', {}), 
            app2.get('framework', {})
        )
        total_score += framework_similarity * SIMILARITY_WEIGHTS['framework']
        
        # Database similarity (database types, data patterns)
        database_similarity = calculate_attribute_similarity(
            app1.get('database', {}), 
            app2.get('database', {})
        )
        total_score += database_similarity * SIMILARITY_WEIGHTS['database']
        
        # Integration similarity (APIs, messaging, protocols)
        integration_similarity = calculate_attribute_similarity(
            app1.get('integration', {}), 
            app2.get('integration', {})
        )
        total_score += integration_similarity * SIMILARITY_WEIGHTS['integration']
        
        # Storage similarity (file systems, object storage)
        storage_similarity = calculate_attribute_similarity(
            app1.get('storage', {}), 
            app2.get('storage', {})
        )
        total_score += storage_similarity * SIMILARITY_WEIGHTS['storage']
        
        return min(1.0, max(0.0, total_score))  # Ensure score is between 0 and 1
        
    except Exception as e:
        logger.error(f"Error calculating similarity: {str(e)}")
        return 0.0

def calculate_attribute_similarity(attr1: Dict[str, Any], attr2: Dict[str, Any]) -> float:
    """Calculate Jaccard similarity for application attributes."""
    try:
        # Extract sets of technologies/features from each attribute
        set1 = extract_technology_set(attr1)
        set2 = extract_technology_set(attr2)
        
        if not set1 and not set2:
            return 1.0  # Both empty, consider similar
        
        if not set1 or not set2:
            return 0.0  # One empty, one not
        
        # Calculate Jaccard similarity
        intersection = len(set1.intersection(set2))
        union = len(set1.union(set2))
        
        return intersection / union if union > 0 else 0.0
        
    except Exception as e:
        logger.error(f"Error calculating attribute similarity: {str(e)}")
        return 0.0

def extract_technology_set(attribute: Dict[str, Any]) -> Set[str]:
    """Extract a set of technologies from an application attribute."""
    technologies = set()
    
    try:
        # Handle different attribute structures
        if isinstance(attribute, dict):
            # Extract from various possible fields
            for key in ['type', 'name', 'technology', 'language', 'framework', 'version']:
                value = attribute.get(key)
                if value:
                    if isinstance(value, list):
                        technologies.update(str(v).lower() for v in value)
                    else:
                        technologies.add(str(value).lower())
            
            # Extract from nested structures
            if 'technologies' in attribute:
                tech_list = attribute['technologies']
                if isinstance(tech_list, list):
                    technologies.update(str(tech).lower() for tech in tech_list)
        
        elif isinstance(attribute, list):
            technologies.update(str(item).lower() for item in attribute)
        
        elif isinstance(attribute, str):
            technologies.add(attribute.lower())
    
    except Exception as e:
        logger.error(f"Error extracting technology set: {str(e)}")
    
    return technologies

def create_similarity_result(app1: Dict[str, Any], app2: Dict[str, Any], 
                           similarity_score: float, project_id: str) -> Dict[str, Any]:
    """Create a similarity result record."""
    timestamp = int(time.time())
    
    # Create a consistent pair ID (alphabetically ordered)
    app1_id = app1.get('id', app1.get('name', 'unknown'))
    app2_id = app2.get('id', app2.get('name', 'unknown'))
    pair_id = f"{min(app1_id, app2_id)}#{max(app1_id, app2_id)}"
    
    return {
        'pair_id': pair_id,
        'project_id': project_id,
        'app1_id': app1_id,
        'app1_name': app1.get('name', 'Unknown'),
        'app2_id': app2_id,
        'app2_name': app2.get('name', 'Unknown'),
        'similarity_score': Decimal(str(round(similarity_score, 4))),
        'calculated_at': timestamp,
        'ttl': timestamp + (30 * 24 * 60 * 60),  # 30 days TTL
        'similarity_category': categorize_similarity(similarity_score)
    }

def categorize_similarity(score: float) -> str:
    """Categorize similarity score into human-readable categories."""
    if score >= 0.8:
        return 'very_high'
    elif score >= 0.6:
        return 'high'
    elif score >= 0.4:
        return 'medium'
    elif score >= 0.2:
        return 'low'
    else:
        return 'very_low'

def write_similarity_results(table, results: List[Dict[str, Any]]):
    """Batch write similarity results to DynamoDB."""
    try:
        # Write in batches of 25 (DynamoDB limit)
        batch_size = 25
        for i in range(0, len(results), batch_size):
            batch = results[i:i + batch_size]
            
            with table.batch_writer() as batch_writer:
                for result in batch:
                    batch_writer.put_item(Item=result)
                    
    except Exception as e:
        logger.error(f"Error writing similarity results: {str(e)}")
        raise

def invoke_aggregate_function(project_id: str, batch_id: int, results_count: int):
    """Invoke the aggregate function to process results."""
    try:
        payload = {
            'project_id': project_id,
            'batch_id': batch_id,
            'results_count': results_count,
            'trigger': 'batch_complete'
        }
        
        lambda_client.invoke(
            FunctionName=AGGREGATE_FUNCTION_NAME,
            InvocationType='Event',  # Asynchronous invocation
            Payload=json.dumps(payload, default=decimal_default)
        )
        
        logger.info(f"Invoked aggregate function for project {project_id}, batch {batch_id}")
        
    except Exception as e:
        logger.error(f"Error invoking aggregate function: {str(e)}")
        raise

def decimal_default(obj):
    """JSON serializer for Decimal objects."""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")
