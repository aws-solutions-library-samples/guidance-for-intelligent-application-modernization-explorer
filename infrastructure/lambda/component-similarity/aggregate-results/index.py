"""
Aggregate Results Lambda Function for Component Similarity Analysis
Aggregates similarity results from all partitions into a unified dataset
"""

import json
import os
import boto3
from typing import Dict, Any, List
from collections import defaultdict

# Initialize AWS clients
s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

# Environment variables
PROCESSING_BUCKET = os.environ['PROCESSING_BUCKET']
COMPONENT_SIMILARITY_TABLE = os.environ['COMPONENT_SIMILARITY_TABLE']
PROJECT_ID = os.environ['PROJECT_ID']

def handler(event: List[Dict[str, Any]], context) -> Dict[str, Any]:
    """
    Aggregate similarity results from all partition processing
    """
    print(f"🔗 Starting results aggregation for project {PROJECT_ID}")
    print(f"📦 Processing {len(event)} partition results")
    
    try:
        # Collect all partition results
        all_similarities = []
        total_processed_components = 0
        successful_partitions = 0
        failed_partitions = 0
        
        for partition_result in event:
            if partition_result.get('statusCode') == 200:
                successful_partitions += 1
                
                # Load partition results from S3 if available
                if 'results_s3_key' in partition_result:
                    partition_similarities = load_partition_results(partition_result['results_s3_key'])
                    all_similarities.extend(partition_similarities)
                else:
                    # Fallback to direct results
                    all_similarities.extend(partition_result.get('similarity_results', []))
                
                total_processed_components += partition_result.get('processed_components', 0)
            else:
                failed_partitions += 1
                print(f"⚠️ Skipping failed partition: {partition_result}")
        
        print(f"✅ Successful partitions: {successful_partitions}")
        print(f"❌ Failed partitions: {failed_partitions}")
        print(f"📊 Total similarities collected: {len(all_similarities)}")
        
        # Remove duplicates and aggregate
        unique_similarities = deduplicate_similarities(all_similarities)
        print(f"🔄 After deduplication: {len(unique_similarities)} unique similarities")
        
        # Store aggregated results in DynamoDB
        stored_count = store_aggregated_results(unique_similarities)
        
        # Generate aggregation summary
        summary = generate_aggregation_summary(unique_similarities, total_processed_components)
        
        # Store aggregated results in S3 for next stage
        aggregated_key = f"aggregated/{PROJECT_ID}/similarity-results.json"
        aggregated_data = {
            'project_id': PROJECT_ID,
            'total_similarities': len(unique_similarities),
            'total_components': total_processed_components,
            'similarities': unique_similarities,
            'summary': summary,
            'aggregated_at': context.aws_request_id
        }
        
        s3.put_object(
            Bucket=PROCESSING_BUCKET,
            Key=aggregated_key,
            Body=json.dumps(aggregated_data),
            ContentType='application/json',
            Metadata={
                'project-id': PROJECT_ID,
                'similarity-count': str(len(unique_similarities)),
                'component-count': str(total_processed_components)
            }
        )
        
        print(f"✅ Results aggregation completed successfully")
        print(f"💾 Aggregated results stored at s3://{PROCESSING_BUCKET}/{aggregated_key}")
        print(f"🗄️ {stored_count} records stored in DynamoDB")
        
        return {
            'statusCode': 200,
            'project_id': PROJECT_ID,
            'total_similarities': len(unique_similarities),
            'total_components': total_processed_components,
            'successful_partitions': successful_partitions,
            'failed_partitions': failed_partitions,
            'stored_records': stored_count,
            'aggregated_s3_key': aggregated_key,
            'summary': summary
        }
        
    except Exception as e:
        print(f"❌ Error aggregating results: {str(e)}")
        raise e

def load_partition_results(s3_key: str) -> List[Dict]:
    """Load partition results from S3"""
    try:
        response = s3.get_object(Bucket=PROCESSING_BUCKET, Key=s3_key)
        partition_data = json.loads(response['Body'].read().decode('utf-8'))
        return partition_data.get('similarity_results', [])
    except Exception as e:
        print(f"⚠️ Failed to load partition results from {s3_key}: {e}")
        return []

def deduplicate_similarities(similarities: List[Dict]) -> List[Dict]:
    """Remove duplicate similarity records"""
    seen = set()
    unique = []
    
    for sim in similarities:
        # Create a unique key for this similarity pair
        comp1_id = f"{sim['component1']['applicationName']}#{sim['component1']['componentName']}"
        comp2_id = f"{sim['component2']['applicationName']}#{sim['component2']['componentName']}"
        
        # Ensure consistent ordering for deduplication
        if comp1_id > comp2_id:
            comp1_id, comp2_id = comp2_id, comp1_id
        
        key = f"{comp1_id}|{comp2_id}"
        
        if key not in seen:
            seen.add(key)
            unique.append(sim)
    
    return unique

def store_aggregated_results(similarities: List[Dict]) -> int:
    """Store aggregated similarity results in DynamoDB"""
    table = dynamodb.Table(COMPONENT_SIMILARITY_TABLE)
    stored_count = 0
    
    # Store in batches of 25 (DynamoDB batch write limit)
    batch_size = 25
    for i in range(0, len(similarities), batch_size):
        batch = similarities[i:i + batch_size]
        
        with table.batch_writer() as batch_writer:
            for sim in batch:
                try:
                    # Create component IDs
                    comp1_id = f"{sim['component1']['applicationName']}#{sim['component1']['componentName']}"
                    comp2_id = f"{sim['component2']['applicationName']}#{sim['component2']['componentName']}"
                    
                    item = {
                        'component_id': comp1_id,
                        'similar_component_id': comp2_id,
                        'similarity_score': sim['similarity_score'],
                        'project_id': PROJECT_ID,
                        'component1_details': sim['component1'],
                        'component2_details': sim['component2'],
                        'above_threshold': sim.get('above_threshold', False),
                        'ttl': int(context.aws_request_id if 'context' in locals() else 0) + 86400 * 30  # 30 days TTL
                    }
                    
                    batch_writer.put_item(Item=item)
                    stored_count += 1
                    
                except Exception as e:
                    print(f"⚠️ Failed to store similarity record: {e}")
                    continue
    
    return stored_count

def generate_aggregation_summary(similarities: List[Dict], total_components: int) -> Dict:
    """Generate summary statistics from aggregated results"""
    if not similarities:
        return {
            'total_components': total_components,
            'total_similarities': 0,
            'above_threshold_count': 0,
            'average_similarity': 0.0,
            'max_similarity': 0.0,
            'min_similarity': 0.0,
            'similarity_distribution': {}
        }
    
    # Calculate statistics
    scores = [sim['similarity_score'] for sim in similarities]
    above_threshold = sum(1 for sim in similarities if sim.get('above_threshold', False))
    
    # Calculate similarity distribution
    distribution = defaultdict(int)
    for score in scores:
        if score >= 0.9:
            distribution['0.9-1.0'] += 1
        elif score >= 0.8:
            distribution['0.8-0.9'] += 1
        elif score >= 0.7:
            distribution['0.7-0.8'] += 1
        elif score >= 0.6:
            distribution['0.6-0.7'] += 1
        elif score >= 0.5:
            distribution['0.5-0.6'] += 1
        elif score >= 0.4:
            distribution['0.4-0.5'] += 1
        elif score >= 0.3:
            distribution['0.3-0.4'] += 1
        elif score >= 0.2:
            distribution['0.2-0.3'] += 1
        else:
            distribution['0.1-0.2'] += 1
    
    # Get unique components
    unique_components = set()
    for sim in similarities:
        unique_components.add(f"{sim['component1']['applicationName']}#{sim['component1']['componentName']}")
        unique_components.add(f"{sim['component2']['applicationName']}#{sim['component2']['componentName']}")
    
    return {
        'total_components': total_components,
        'unique_components_with_similarities': len(unique_components),
        'total_similarities': len(similarities),
        'above_threshold_count': above_threshold,
        'average_similarity': round(sum(scores) / len(scores), 4),
        'max_similarity': round(max(scores), 4),
        'min_similarity': round(min(scores), 4),
        'similarity_distribution': dict(distribution)
    }
