"""
Application Similarity Store Results Lambda Function
Stores similarity pairs and clusters to DynamoDB and sends completion notification
"""

import json
import os
import boto3
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, Any, List

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
sns = boto3.client('sns')
s3 = boto3.client('s3')

# Environment variables
SIMILARITY_TABLE = os.environ['SIMILARITY_TABLE']
CLUSTERS_TABLE = os.environ['CLUSTERS_TABLE']
SNS_TOPIC = os.environ['SNS_TOPIC']
PROJECT_ID = os.environ['PROJECT_ID']
S3_BUCKET = os.environ.get('S3_BUCKET', '')

def handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Store application similarity pairs and clusters to DynamoDB
    """
    print(f"💾 Starting results storage for project {PROJECT_ID}")
    
    try:
        # Check if aggregated results are stored in S3 (new approach to avoid payload size limits)
        aggregated_s3_key = None
        s3_bucket = None
        
        # Check in aggregate_result first (Step Function passes it there)
        if 'aggregate_result' in event:
            aggregate_result = event['aggregate_result']
            if isinstance(aggregate_result, dict):
                aggregated_s3_key = aggregate_result.get('aggregated_results_s3_key')
                s3_bucket = aggregate_result.get('s3_bucket')
        
        # Fallback: check at root level
        if not aggregated_s3_key:
            aggregated_s3_key = event.get('aggregated_results_s3_key')
            s3_bucket = event.get('s3_bucket')
        
        # If S3 key exists, read similarities from S3
        if aggregated_s3_key and s3_bucket:
            print(f"📥 Reading aggregated results from S3...")
            print(f"   🪣 Bucket: {s3_bucket}")
            print(f"   🔑 Key: {aggregated_s3_key}")
            
            similarities = read_similarities_from_s3(s3_bucket, aggregated_s3_key)
            
            print(f"✅ Loaded {len(similarities)} similarities from S3")
        else:
            # Fallback: Extract similarities from event (backward compatibility)
            print(f"📋 Reading similarities from event (legacy mode)")
            
            similarities = event.get('similarities', [])
            if not similarities and 'aggregate_result' in event:
                aggregate_result = event['aggregate_result']
                if isinstance(aggregate_result, dict):
                    similarities = aggregate_result.get('similarities', [])
        
        # Extract clusters from cluster results
        clusters = event.get('clusters', [])
        if not clusters and 'cluster_result' in event:
            cluster_result = event['cluster_result']
            if isinstance(cluster_result, dict):
                clusters = cluster_result.get('clusters', [])
        
        print(f"📊 Storing {len(similarities)} similarity pairs and {len(clusters)} clusters")
        
        # Store similarity pairs to DynamoDB
        similarities_stored = store_similarity_pairs(similarities)
        
        # Store clusters to DynamoDB
        clusters_stored = store_clusters(clusters)
        
        # Send completion notification
        send_completion_notification(similarities_stored, clusters_stored)
        
        print(f"✅ Results storage completed successfully")
        
        return {
            'statusCode': 200,
            'message': 'Application similarity analysis completed successfully',
            'similarity_pairs_stored': similarities_stored,
            'clusters_stored': clusters_stored,
            'storage_location': 'dynamodb',
            'project_id': PROJECT_ID
        }
        
    except Exception as e:
        print(f"❌ Error storing results: {str(e)}")
        raise e

def read_similarities_from_s3(bucket: str, key: str) -> List[Dict[str, Any]]:
    """
    Read aggregated similarities from S3
    """
    try:
        response = s3.get_object(Bucket=bucket, Key=key)
        data_content = response['Body'].read().decode('utf-8')
        
        print(f"   📄 File size: {len(data_content)} bytes")
        
        aggregated_data = json.loads(data_content)
        similarities = aggregated_data.get('similarities', [])
        
        print(f"   🔗 Found {len(similarities)} similarity records")
        
        return similarities
        
    except Exception as e:
        print(f"   ❌ Error reading aggregated results from S3: {str(e)}")
        raise e

def store_similarity_pairs(similarities: List[Dict[str, Any]]) -> int:
    """
    Store individual similarity pairs to DynamoDB
    """
    if not similarities:
        print("⚠️  No similarity pairs to store")
        return 0
    
    print(f"💾 Storing {len(similarities)} similarity pairs to DynamoDB...")
    
    # Log sample record structure for debugging
    if similarities:
        print(f"📋 Sample similarity record structure:")
        print(f"   Keys: {list(similarities[0].keys())}")
        print(f"   Sample data: {json.dumps(similarities[0], indent=3, default=str)}")
    
    table = dynamodb.Table(SIMILARITY_TABLE)
    stored_count = 0
    failed_count = 0
    
    # Process in batches of 25 (DynamoDB batch write limit)
    batch_size = 25
    total_batches = (len(similarities) + batch_size - 1) // batch_size
    print(f"🔄 Will process {total_batches} batches of up to {batch_size} records each")
    
    for batch_num, i in enumerate(range(0, len(similarities), batch_size), 1):
        batch = similarities[i:i + batch_size]
        print(f"📦 Processing batch {batch_num}/{total_batches} with {len(batch)} records...")
        
        try:
            batch_stored = 0
            with table.batch_writer() as batch_writer:
                for record_num, sim in enumerate(batch, 1):
                    try:
                        # Validate required keys
                        if not sim.get('application_id') or not sim.get('similar_app_id'):
                            print(f"  ⚠️  Skipping record {record_num} - missing required keys")
                            failed_count += 1
                            continue
                        
                        # Convert float to Decimal for DynamoDB
                        item = {
                            'application_id': sim['application_id'],
                            'similar_app_id': sim['similar_app_id'],
                            'similarity_score': Decimal(str(sim['similarity_score'])),
                            'app1_component_count': sim.get('app1_component_count', 0),
                            'app2_component_count': sim.get('app2_component_count', 0),
                            'project_id': sim.get('project_id', PROJECT_ID),
                            'ttl': int((datetime.utcnow() + timedelta(days=90)).timestamp())
                        }
                        batch_writer.put_item(Item=item)
                        batch_stored += 1
                        stored_count += 1
                            
                    except Exception as record_error:
                        failed_count += 1
                        print(f"  ❌ Failed to store record {record_num}: {str(record_error)}")
                        continue
            
            print(f"✅ Batch {batch_num} completed: {batch_stored}/{len(batch)} records stored")
            
        except Exception as batch_error:
            failed_count += len(batch)
            print(f"❌ Entire batch {batch_num} failed: {str(batch_error)}")
            continue
    
    print(f"🎯 SIMILARITY STORAGE SUMMARY:")
    print(f"   📊 Expected records: {len(similarities)}")
    print(f"   ✅ Successfully stored: {stored_count}")
    print(f"   ❌ Failed to store: {failed_count}")
    
    return stored_count

def store_clusters(clusters: List[Dict[str, Any]]) -> int:
    """
    Store cluster information to DynamoDB
    """
    if not clusters:
        print("⚠️  No clusters to store")
        return 0
    
    print(f"💾 Storing {len(clusters)} clusters to DynamoDB...")
    
    table = dynamodb.Table(CLUSTERS_TABLE)
    stored_count = 0
    failed_count = 0
    
    try:
        with table.batch_writer() as batch_writer:
            for cluster_num, cluster in enumerate(clusters, 1):
                try:
                    cluster_id = cluster.get('cluster_id', cluster_num - 1)
                    
                    item = {
                        'cluster_id': str(cluster_id),
                        'project_id': PROJECT_ID,
                        'application_count': cluster.get('application_count', 0),
                        'applications': json.dumps(cluster.get('applications', [])),
                        'average_similarity': Decimal(str(cluster.get('average_similarity', 0.0))),
                        'cluster_strength': cluster.get('cluster_strength', 'weak'),
                        'similarity_range': json.dumps(cluster.get('similarity_range', {})),
                        'created_at': datetime.utcnow().isoformat(),
                        'ttl': int((datetime.utcnow() + timedelta(days=90)).timestamp())
                    }
                    batch_writer.put_item(Item=item)
                    stored_count += 1
                    print(f"  ✅ Stored cluster {cluster_id} with {cluster.get('application_count', 0)} applications")
                    
                except Exception as cluster_error:
                    failed_count += 1
                    print(f"  ❌ Failed to store cluster {cluster_num}: {str(cluster_error)}")
                    continue
        
        print(f"🎯 CLUSTER STORAGE SUMMARY:")
        print(f"   📊 Expected clusters: {len(clusters)}")
        print(f"   ✅ Successfully stored: {stored_count}")
        print(f"   ❌ Failed to store: {failed_count}")
        
    except Exception as e:
        print(f"❌ Error storing clusters: {str(e)}")
        raise e
    
    return stored_count

def send_completion_notification(similarities_stored: int, clusters_stored: int):
    """
    Send SNS notification about analysis completion
    """
    try:
        message = {
            'project_id': PROJECT_ID,
            'analysis_type': 'application_similarity',
            'status': 'completed',
            'similarity_pairs_stored': similarities_stored,
            'clusters_stored': clusters_stored,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        sns.publish(
            TopicArn=SNS_TOPIC,
            Message=json.dumps(message, indent=2),
            Subject=f'Application Similarity Analysis Complete - {PROJECT_ID}'
        )
        
        print(f"✅ Completion notification sent via SNS")
        
    except Exception as e:
        print(f"⚠️ Failed to send notification: {str(e)}")
        # Don't fail the function if notification fails
