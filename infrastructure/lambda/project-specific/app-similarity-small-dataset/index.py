"""
App Similarity Small Dataset Lambda Function
Handles application similarity analysis for datasets with < 1000 applications
This is part of the redesigned elegant workflow matching the component similarity pattern
"""

import json
import os
import boto3
from typing import Dict, Any, List
from decimal import Decimal
from collections import defaultdict
import itertools

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')
sns = boto3.client('sns')

# Environment variables
SIMILARITY_TABLE = os.environ['SIMILARITY_TABLE']
PROJECT_ID = os.environ['PROJECT_ID']

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
    Process small application dataset and calculate similarities
    """
    print(f"🚀 Processing small application dataset for project {PROJECT_ID}")
    
    try:
        # Extract application data from Athena results
        athena_data = event.get('athena_data', {})
        applications_data = athena_data.get('data', [])
        
        print(f"📊 Processing {len(applications_data)} application records")
        
        if len(applications_data) == 0:
            return {
                'statusCode': 200,
                'message': 'No applications to process',
                'totalApplications': 0,
                'similarPairs': 0,
                'projectId': PROJECT_ID
            }
        
        # Process raw data into application features
        application_features = process_application_data(applications_data)
        
        print(f"🔧 Processed {len(application_features)} unique applications")
        
        # Calculate application similarities
        similarities = calculate_application_similarities(application_features)
        
        # Store results in DynamoDB
        stored_count = store_similarity_results(similarities)
        
        print(f"✅ Small dataset processing completed successfully")
        print(f"📊 Processed {len(application_features)} applications")
        print(f"🔗 Found {len(similarities)} similar pairs")
        print(f"💾 Results stored in DynamoDB: {stored_count} records")
        
        return {
            'statusCode': 200,
            'message': 'Application similarity analysis completed successfully',
            'totalApplications': len(application_features),
            'similarPairs': len(similarities),
            'storedRecords': stored_count,
            'projectId': PROJECT_ID
        }
        
    except Exception as e:
        print(f"❌ Error processing small dataset: {str(e)}")
        raise e

def process_application_data(raw_data: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """
    Process raw tech stack data into application-level features
    """
    application_features = defaultdict(lambda: {
        'components': [],
        'runtime_technologies': set(),
        'framework_technologies': set(),
        'database_technologies': set(),
        'integration_technologies': set(),
        'storage_technologies': set()
    })
    
    for record in raw_data:
        app_name = record.get('applicationname', '').strip()
        if not app_name:
            continue
            
        component_name = record.get('componentname', '').strip()
        
        # Extract technologies from each field
        runtime = parse_technologies(record.get('runtime', ''))
        framework = parse_technologies(record.get('framework', ''))
        databases = parse_technologies(record.get('databases', ''))
        integrations = parse_technologies(record.get('integrations', ''))
        storages = parse_technologies(record.get('storages', ''))
        
        # Add component information
        component_info = {
            'component_name': component_name,
            'runtime': runtime,
            'framework': framework,
            'databases': databases,
            'integrations': integrations,
            'storages': storages
        }
        
        application_features[app_name]['components'].append(component_info)
        
        # Aggregate technologies at application level
        application_features[app_name]['runtime_technologies'].update(runtime)
        application_features[app_name]['framework_technologies'].update(framework)
        application_features[app_name]['database_technologies'].update(databases)
        application_features[app_name]['integration_technologies'].update(integrations)
        application_features[app_name]['storage_technologies'].update(storages)
    
    # Convert sets to lists for JSON serialization
    processed_features = {}
    for app_name, features in application_features.items():
        processed_features[app_name] = {
            'components': features['components'],
            'runtime_technologies': list(features['runtime_technologies']),
            'framework_technologies': list(features['framework_technologies']),
            'database_technologies': list(features['database_technologies']),
            'integration_technologies': list(features['integration_technologies']),
            'storage_technologies': list(features['storage_technologies']),
            'component_count': len(features['components'])
        }
    
    return processed_features

def parse_technologies(tech_string: str) -> List[str]:
    """
    Parse comma-separated technology string into list of technologies
    """
    if not tech_string or tech_string.strip() == '':
        return []
    
    # Split by comma and clean up
    technologies = []
    for tech in tech_string.split(','):
        tech = tech.strip().lower()
        if tech and tech != 'null' and tech != 'none':
            technologies.append(tech)
    
    return technologies

def calculate_application_similarities(application_features: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Calculate similarities between all application pairs
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

def store_similarity_results(similarities: List[Dict[str, Any]]) -> int:
    """
    Store similarity results in DynamoDB using batch write
    """
    if not similarities:
        return 0
    
    table = dynamodb.Table(SIMILARITY_TABLE)
    stored_count = 0
    
    # Process in batches of 25 (DynamoDB batch write limit)
    batch_size = 25
    for i in range(0, len(similarities), batch_size):
        batch = similarities[i:i + batch_size]
        
        # Prepare batch write items
        with table.batch_writer() as batch_writer:
            for result in batch:
                # Convert float to Decimal for DynamoDB
                item = {
                    'application_id': result['application_id'],
                    'similar_app_id': result['similar_app_id'],
                    'similarity_score': Decimal(str(result['similarity_score'])),
                    'app1_component_count': result['app1_component_count'],
                    'app2_component_count': result['app2_component_count'],
                    'project_id': result['project_id'],
                    'ttl': int(context.aws_request_id if 'context' in locals() else 0) + 86400 * 30  # 30 days TTL
                }
                
                batch_writer.put_item(Item=item)
                stored_count += 1
    
    return stored_count
