"""
Component Similarity Process Partition Lambda Function
Processes individual partitions stored in S3 for component similarity analysis
"""

import json
import os
import boto3
from typing import Dict, Any, List
from decimal import Decimal

# Initialize AWS clients
s3 = boto3.client('s3')

# Environment variables
S3_BUCKET = os.environ['S3_BUCKET']
PROJECT_ID = os.environ['PROJECT_ID']

# Component similarity weights
COMPONENT_WEIGHTS = {
    'runtime': 0.35,      # 35% - Runtime environment
    'framework': 0.30,    # 30% - Framework
    'databases': 0.20,    # 20% - Database technologies
    'integrations': 0.10, # 10% - Integration points
    'storages': 0.05      # 5% - Storage solutions
}

def handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Process a single partition of component data for similarity analysis
    """
    partition_id = event.get('partition_id', 0)
    s3_key = event.get('s3_key', '')
    
    print(f"🔧 Processing partition {partition_id} for project {PROJECT_ID}")
    print(f"📥 Reading partition data from S3: {s3_key}")
    
    try:
        # Read partition data from S3
        components_data = read_partition_from_s3(s3_key)
        
        print(f"📊 Processing {len(components_data)} components in partition {partition_id}")
        
        if len(components_data) == 0:
            return {
                'statusCode': 200,
                'partition_id': partition_id,
                'message': 'No components in partition',
                'similarities': [],
                'processed_components': 0
            }
        
        # Calculate similarities within this partition
        similarities = calculate_partition_similarities(components_data, partition_id)
        
        # Store partition results back to S3
        results_key = f"component-results/{PROJECT_ID}/partition_{partition_id}_results.json"
        store_partition_results(results_key, similarities)
        
        print(f"✅ Partition {partition_id} processing completed")
        print(f"🔗 Found {len(similarities)} similar pairs")
        print(f"💾 Results stored at: {results_key}")
        
        return {
            'statusCode': 200,
            'partition_id': partition_id,
            'processed_components': len(components_data),
            'similarities_found': len(similarities),
            'results_s3_key': results_key,
            'project_id': PROJECT_ID
        }
        
    except Exception as e:
        print(f"❌ Error processing partition {partition_id}: {str(e)}")
        raise e

def read_partition_from_s3(s3_key: str) -> List[Dict[str, Any]]:
    """
    Read partition data from S3
    """
    try:
        response = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
        data_content = response['Body'].read().decode('utf-8')
        components_data = json.loads(data_content)
        
        print(f"✅ Successfully read {len(components_data)} components from S3")
        return components_data
        
    except Exception as e:
        print(f"❌ Error reading partition from S3: {str(e)}")
        raise e

def calculate_partition_similarities(components: List[Dict[str, Any]], partition_id: int) -> List[Dict[str, Any]]:
    """
    Calculate similarities between components in this partition
    """
    similarities = []
    
    for i, comp1 in enumerate(components):
        for j, comp2 in enumerate(components[i + 1:], i + 1):
            similarity_score = calculate_component_similarity(comp1, comp2)
            
            if similarity_score > 0.3:  # Only store meaningful similarities
                similarities.append({
                    'component_id': comp1.get('id', f"comp_{partition_id}_{i}"),
                    'similar_component_id': comp2.get('id', f"comp_{partition_id}_{j}"),
                    'similarity_score': similarity_score,
                    'component1_name': comp1.get('componentname', ''),
                    'component2_name': comp2.get('componentname', ''),
                    'application1': comp1.get('applicationname', ''),
                    'application2': comp2.get('applicationname', ''),
                    'partition_id': partition_id,
                    'project_id': PROJECT_ID
                })
    
    return similarities

def calculate_component_similarity(comp1: Dict[str, Any], comp2: Dict[str, Any]) -> float:
    """
    Calculate weighted Jaccard similarity between two components
    """
    total_score = 0.0
    
    for field, weight in COMPONENT_WEIGHTS.items():
        set1 = set(parse_technologies(comp1.get(field, '')))
        set2 = set(parse_technologies(comp2.get(field, '')))
        
        if len(set1) == 0 and len(set2) == 0:
            jaccard_score = 1.0
        elif len(set1) == 0 or len(set2) == 0:
            jaccard_score = 0.0
        else:
            intersection = len(set1.intersection(set2))
            union = len(set1.union(set2))
            jaccard_score = intersection / union if union > 0 else 0.0
        
        total_score += jaccard_score * weight
    
    return round(total_score, 4)

def parse_technologies(tech_string: str) -> List[str]:
    """
    Parse comma-separated technology string
    """
    if not tech_string or tech_string.strip() == '':
        return []
    
    technologies = []
    for tech in tech_string.split(','):
        tech = tech.strip().lower()
        if tech and tech not in ['null', 'none', '']:
            technologies.append(tech)
    
    return technologies

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