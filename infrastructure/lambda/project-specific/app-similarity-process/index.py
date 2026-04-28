"""
App Similarity Process Lambda Function
Processes individual partitions of application data for similarity analysis
"""

import json
import os
import boto3
from typing import Dict, Any, List
from decimal import Decimal

# Initialize AWS clients
s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

# Environment variables
SIMILARITY_TABLE = os.environ['SIMILARITY_TABLE']
PROJECT_ID = os.environ['PROJECT_ID']
S3_BUCKET = os.environ['S3_BUCKET']

# Application similarity weights - focused on modernization impact
APP_WEIGHTS = {
    'runtime_technologies': 0.40,    # 40% - Most important for modernization
    'framework_technologies': 0.30,  # 30% - Critical for development approach
    'database_technologies': 0.20,   # 20% - Important for data architecture
    'integration_technologies': 0.07, # 7% - Moderate impact
    'storage_technologies': 0.03     # 3% - Least impact on modernization
}

def handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Process a single partition of application data for similarity analysis
    """
    partition_id = event.get('partition_id', 0)
    s3_key = event.get('s3_key', '')
    
    print(f"🔧 Processing partition {partition_id} for project {PROJECT_ID}")
    print(f"📥 Reading partition data from S3: {s3_key}")
    
    try:
        # Read partition data from S3
        partition_features = read_partition_from_s3(s3_key)
        
        print(f"📊 Processing {len(partition_features)} applications in partition {partition_id}")
        
        if len(partition_features) == 0:
            return {
                'statusCode': 200,
                'partition_id': partition_id,
                'message': 'No applications in partition',
                'similarities': [],
                'processed_applications': 0
            }
        
        # Calculate similarities within this partition and against all other applications
        # For now, we'll calculate similarities within the partition
        # In a full implementation, we'd need access to all application features
        similarities = calculate_partition_similarities(partition_features, partition_id)
        
        # Store partition results back to S3
        results_key = f"app-results/{PROJECT_ID}/partition_{partition_id}_results.json"
        store_partition_results(results_key, similarities)
        
        print(f"✅ Partition {partition_id} processing completed")
        print(f"🔗 Found {len(similarities)} similar pairs")
        print(f"💾 Results stored at: {results_key}")
        
        return {
            'statusCode': 200,
            'partition_id': partition_id,
            'processed_applications': len(partition_features),
            'similarities_found': len(similarities),
            'results_s3_key': results_key,
            'project_id': PROJECT_ID
        }
        
    except Exception as e:
        print(f"❌ Error processing partition {partition_id}: {str(e)}")
        raise e

def read_partition_from_s3(s3_key: str) -> Dict[str, Dict[str, Any]]:
    """
    Read partition data from S3
    """
    try:
        response = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
        data_content = response['Body'].read().decode('utf-8')
        partition_features = json.loads(data_content)
        
        print(f"✅ Successfully read {len(partition_features)} applications from S3")
        return partition_features
        
    except Exception as e:
        print(f"❌ Error reading partition from S3: {str(e)}")
        raise e

def calculate_partition_similarities(application_features: Dict[str, Dict[str, Any]], partition_id: int) -> List[Dict[str, Any]]:
    """
    Calculate similarities between applications in this partition
    """
    similarities = []
    app_names = list(application_features.keys())
    
    for i, app1 in enumerate(app_names):
        for j, app2 in enumerate(app_names[i + 1:], i + 1):
            similarity_score = calculate_weighted_jaccard_similarity(
                application_features[app1], 
                application_features[app2]
            )
            
            if similarity_score > 0.1:  # Only store meaningful similarities
                similarities.append({
                    'application_id': app1,
                    'similar_app_id': app2,
                    'similarity_score': similarity_score,
                    'app1_component_count': application_features[app1]['component_count'],
                    'app2_component_count': application_features[app2]['component_count'],
                    'partition_id': partition_id,
                    'project_id': PROJECT_ID
                })
    
    return similarities

def calculate_weighted_jaccard_similarity(features1: Dict[str, Any], features2: Dict[str, Any]) -> float:
    """
    Calculate weighted Jaccard similarity between two applications
    Uses technology-specific weights to prioritize runtime and framework similarities
    """
    total_weighted_score = 0.0
    
    for tech_type, weight in APP_WEIGHTS.items():
        if tech_type in features1 and tech_type in features2:
            set1 = set(features1[tech_type])
            set2 = set(features2[tech_type])
            
            # Calculate Jaccard similarity for this technology type
            if len(set1) == 0 and len(set2) == 0:
                jaccard_score = 1.0  # Both empty = perfect match
            elif len(set1) == 0 or len(set2) == 0:
                jaccard_score = 0.0  # One empty, one not = no match
            else:
                intersection = len(set1.intersection(set2))
                union = len(set1.union(set2))
                jaccard_score = intersection / union if union > 0 else 0.0
            
            # Apply weight to this technology type
            weighted_score = jaccard_score * weight
            total_weighted_score += weighted_score
    
    return round(total_weighted_score, 4)

def store_partition_results(results_key: str, similarities: List[Dict[str, Any]]):
    """
    Store partition processing results in S3
    """
    try:
        results_data = {
            'similarities': similarities,
            'partition_summary': {
                'total_similarities': len(similarities),
                'project_id': PROJECT_ID,
                'processed_at': context.aws_request_id if 'context' in locals() else ''
            }
        }
        
        s3.put_object(
            Bucket=S3_BUCKET,
            Key=results_key,
            Body=json.dumps(results_data),
            ContentType='application/json'
        )
        
        print(f"✅ Partition results stored successfully at: {results_key}")
        
    except Exception as e:
        print(f"❌ Error storing partition results: {str(e)}")
        raise e