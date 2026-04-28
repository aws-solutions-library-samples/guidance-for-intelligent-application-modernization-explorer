"""
Process Partition Lambda Function for Component Similarity Analysis
Processes individual partitions and calculates similarities within the partition
"""

import json
import os
import boto3
import math
from typing import Dict, Any, List
from decimal import Decimal

# Initialize AWS clients
s3 = boto3.client('s3')

# Environment variables
PROCESSING_BUCKET = os.environ['PROCESSING_BUCKET']
PROJECT_ID = os.environ['PROJECT_ID']

def handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Process a single partition and calculate component similarities
    """
    partition_id = event.get('partition_id', 0)
    s3_key = event.get('s3_key', '')
    project_id = event.get('project_id', PROJECT_ID)
    
    print(f"🔧 Processing partition {partition_id} for project {project_id}")
    print(f"📁 Loading partition data from s3://{PROCESSING_BUCKET}/{s3_key}")
    
    try:
        # Load partition data from S3
        response = s3.get_object(Bucket=PROCESSING_BUCKET, Key=s3_key)
        partition_data = json.loads(response['Body'].read().decode('utf-8'))
        
        components = partition_data.get('components', [])
        filters = partition_data.get('filters', {})
        
        print(f"📊 Processing {len(components)} components in partition {partition_id}")
        
        if len(components) == 0:
            print("⚠️ No components in partition")
            return {
                'statusCode': 200,
                'partition_id': partition_id,
                'similarity_results': [],
                'processed_components': 0,
                'project_id': project_id
            }
        
        # Calculate similarities within this partition
        similarity_results = calculate_partition_similarities(components, filters)
        
        # Store partition results in S3
        results_key = f"results/{project_id}/partition-{partition_id}-results.json"
        results_data = {
            'partition_id': partition_id,
            'project_id': project_id,
            'component_count': len(components),
            'similarity_results': similarity_results,
            'processed_at': context.aws_request_id
        }
        
        s3.put_object(
            Bucket=PROCESSING_BUCKET,
            Key=results_key,
            Body=json.dumps(results_data, default=decimal_default),
            ContentType='application/json',
            Metadata={
                'project-id': project_id,
                'partition-id': str(partition_id),
                'result-count': str(len(similarity_results))
            }
        )
        
        print(f"✅ Partition {partition_id} processed successfully")
        print(f"📊 Generated {len(similarity_results)} similarity records")
        print(f"💾 Results stored at s3://{PROCESSING_BUCKET}/{results_key}")
        
        return {
            'statusCode': 200,
            'partition_id': partition_id,
            'similarity_results': similarity_results,
            'processed_components': len(components),
            'results_s3_key': results_key,
            'project_id': project_id
        }
        
    except Exception as e:
        print(f"❌ Error processing partition {partition_id}: {str(e)}")
        raise e

def calculate_partition_similarities(components: List[Dict], filters: Dict) -> List[Dict]:
    """Calculate similarities between all components in the partition"""
    similarity_results = []
    n = len(components)
    
    # Create weights based on filters
    weights = {
        'runtime': 0.25 if filters.get('includeRuntimes', True) else 0,
        'framework': 0.25 if filters.get('includeFrameworks', True) else 0,
        'databases': 0.20 if filters.get('includeDatabases', True) else 0,
        'integrations': 0.15 if filters.get('includeIntegrations', True) else 0,
        'storages': 0.15 if filters.get('includeStorages', True) else 0
    }
    
    threshold = filters.get('minSimilarityScore', 0.7)
    
    print(f"🔧 Using similarity threshold: {threshold}")
    print(f"⚖️ Technology weights: {weights}")
    
    # Calculate similarities between all pairs
    for i in range(n):
        for j in range(i + 1, n):
            similarity = calculate_component_similarity(components[i], components[j], weights)
            
            # Only store meaningful similarities
            if similarity > 0.1:
                result = {
                    'component1': {
                        'id': components[i].get('id', ''),
                        'applicationName': components[i].get('applicationname', ''),
                        'componentName': components[i].get('componentname', ''),
                        'runtime': components[i].get('runtime', ''),
                        'framework': components[i].get('framework', '')
                    },
                    'component2': {
                        'id': components[j].get('id', ''),
                        'applicationName': components[j].get('applicationname', ''),
                        'componentName': components[j].get('componentname', ''),
                        'runtime': components[j].get('runtime', ''),
                        'framework': components[j].get('framework', '')
                    },
                    'similarity_score': round(similarity, 4),
                    'above_threshold': similarity >= threshold
                }
                
                similarity_results.append(result)
    
    print(f"📊 Found {len(similarity_results)} meaningful similarities")
    above_threshold = sum(1 for r in similarity_results if r['above_threshold'])
    print(f"🎯 {above_threshold} similarities above threshold ({threshold})")
    
    return similarity_results

def calculate_component_similarity(comp1: Dict, comp2: Dict, weights: Dict) -> float:
    """Calculate weighted similarity between two components"""
    total_score = 0.0
    total_weight = 0.0
    
    # Runtime similarity (exact match)
    if weights['runtime'] > 0:
        runtime_score = 1.0 if comp1.get('runtime') == comp2.get('runtime') else 0.0
        total_score += runtime_score * weights['runtime']
        total_weight += weights['runtime']
    
    # Framework similarity (exact match)
    if weights['framework'] > 0:
        framework_score = 1.0 if comp1.get('framework') == comp2.get('framework') else 0.0
        total_score += framework_score * weights['framework']
        total_weight += weights['framework']
    
    # Database similarity (Jaccard similarity)
    if weights['databases'] > 0:
        db_score = jaccard_similarity(
            parse_tech_list(comp1.get('databases', '')),
            parse_tech_list(comp2.get('databases', ''))
        )
        total_score += db_score * weights['databases']
        total_weight += weights['databases']
    
    # Integration similarity (Jaccard similarity)
    if weights['integrations'] > 0:
        int_score = jaccard_similarity(
            parse_tech_list(comp1.get('integrations', '')),
            parse_tech_list(comp2.get('integrations', ''))
        )
        total_score += int_score * weights['integrations']
        total_weight += weights['integrations']
    
    # Storage similarity (Jaccard similarity)
    if weights['storages'] > 0:
        stor_score = jaccard_similarity(
            parse_tech_list(comp1.get('storages', '')),
            parse_tech_list(comp2.get('storages', ''))
        )
        total_score += stor_score * weights['storages']
        total_weight += weights['storages']
    
    return total_score / total_weight if total_weight > 0 else 0.0

def parse_tech_list(tech_string: str) -> set:
    """Parse comma-separated technology string into set"""
    if not tech_string or tech_string.strip() == '':
        return set()
    
    technologies = set()
    for tech in tech_string.split(','):
        tech = tech.strip().lower()
        if tech and tech != 'null' and tech != 'none':
            technologies.add(tech)
    
    return technologies

def jaccard_similarity(set1: set, set2: set) -> float:
    """Calculate Jaccard similarity between two sets"""
    if len(set1) == 0 and len(set2) == 0:
        return 1.0
    
    intersection = len(set1.intersection(set2))
    union = len(set1.union(set2))
    
    return intersection / union if union > 0 else 0.0

def decimal_default(obj):
    """JSON serializer for Decimal objects"""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")
