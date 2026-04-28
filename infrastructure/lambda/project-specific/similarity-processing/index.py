"""
Similarity Processing Lambda Function
Calculates weighted Jaccard similarity between applications using tech stack data
"""

import json
import os
import boto3
from typing import Dict, Any, List, Set
from decimal import Decimal

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')

# Environment variables
SIMILARITY_TABLE = os.environ['SIMILARITY_TABLE']
PROJECT_ID = os.environ['PROJECT_ID']

# Technology weights for similarity calculation
TECH_WEIGHTS = {
    'runtime_technologies': 0.40,    # 40% - Most important for modernization
    'framework_technologies': 0.30,  # 30% - Critical for development approach
    'database_technologies': 0.20,   # 20% - Important for data architecture
    'integration_technologies': 0.07, # 7% - Moderate impact
    'storage_technologies': 0.03     # 3% - Least impact on modernization
}

def handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Process a batch of applications and calculate similarities
    """
    batch_id = event.get('batch_id', 0)
    applications = event.get('applications', [])
    all_features = event.get('all_features', {})
    
    print(f"🔄 Processing similarity batch {batch_id} for project {PROJECT_ID}")
    print(f"📊 Batch contains {len(applications)} applications")
    print(f"🔍 Comparing against {len(all_features)} total applications")
    
    try:
        # Get DynamoDB table
        table = dynamodb.Table(SIMILARITY_TABLE)
        
        # Calculate similarities for this batch
        similarity_results = calculate_batch_similarities(applications, all_features)
        
        # Store results in DynamoDB
        stored_count = store_similarity_results(table, similarity_results)
        
        print(f"✅ Batch {batch_id} completed successfully")
        print(f"💾 Stored {stored_count} similarity records")
        
        return {
            'statusCode': 200,
            'batch_id': batch_id,
            'processed_applications': len(applications),
            'similarity_records': len(similarity_results),
            'stored_records': stored_count,
            'project_id': PROJECT_ID
        }
        
    except Exception as e:
        print(f"❌ Error processing batch {batch_id}: {str(e)}")
        raise e

def calculate_batch_similarities(batch_applications: List[str], all_features: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Calculate similarities between batch applications and all other applications
    """
    similarity_results = []
    
    for app1 in batch_applications:
        if app1 not in all_features:
            print(f"⚠️ Application {app1} not found in features")
            continue
            
        features1 = all_features[app1]
        
        for app2, features2 in all_features.items():
            # Skip self-comparison
            if app1 == app2:
                continue
            
            # Calculate weighted Jaccard similarity
            similarity_score = calculate_weighted_jaccard_similarity(features1, features2)
            
            # Only store meaningful similarities (> 0.1)
            if similarity_score > 0.1:
                similarity_result = {
                    'application_id': app1,
                    'similar_app_id': app2,
                    'similarity_score': similarity_score,
                    'project_id': PROJECT_ID,
                    'ttl': int(context.aws_request_id if 'context' in locals() else 0) + 86400 * 30  # 30 days TTL
                }
                
                similarity_results.append(similarity_result)
    
    return similarity_results

def calculate_weighted_jaccard_similarity(features1: Dict[str, Any], features2: Dict[str, Any]) -> float:
    """
    Calculate weighted Jaccard similarity between two applications
    Uses technology-specific weights to prioritize runtime and framework similarities
    """
    total_weighted_score = 0.0
    
    for tech_type, weight in TECH_WEIGHTS.items():
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
            
            print(f"  {tech_type}: {jaccard_score:.3f} * {weight} = {weighted_score:.3f}")
    
    return round(total_weighted_score, 4)

def store_similarity_results(table, similarity_results: List[Dict[str, Any]]) -> int:
    """
    Store similarity results in DynamoDB using batch write
    """
    if not similarity_results:
        return 0
    
    stored_count = 0
    
    # Process in batches of 25 (DynamoDB batch write limit)
    batch_size = 25
    for i in range(0, len(similarity_results), batch_size):
        batch = similarity_results[i:i + batch_size]
        
        # Prepare batch write items
        with table.batch_writer() as batch_writer:
            for result in batch:
                # Convert float to Decimal for DynamoDB
                item = {
                    'application_id': result['application_id'],
                    'similar_app_id': result['similar_app_id'],
                    'similarity_score': Decimal(str(result['similarity_score'])),
                    'project_id': result['project_id'],
                    'ttl': result['ttl']
                }
                
                batch_writer.put_item(Item=item)
                stored_count += 1
    
    return stored_count