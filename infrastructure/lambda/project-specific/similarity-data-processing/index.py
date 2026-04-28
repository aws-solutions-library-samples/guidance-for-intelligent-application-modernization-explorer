"""
Similarity Data Processing Lambda Function
Processes partitioned tech stack data and extracts features for similarity analysis
"""

import json
import os
from typing import Dict, Any, List, Set
from collections import defaultdict

PROJECT_ID = os.environ['PROJECT_ID']

def handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Process a partition of tech stack data and extract features
    """
    partition_id = event.get('partition_id', 0)
    data = event.get('data', [])
    
    print(f"🔧 Processing partition {partition_id} for project {PROJECT_ID}")
    print(f"📊 Processing {len(data)} records")
    
    try:
        # Process the data to extract application features
        application_features = process_partition_data(data)
        
        print(f"✅ Processed {len(application_features)} applications in partition {partition_id}")
        
        return {
            'statusCode': 200,
            'partition_id': partition_id,
            'application_features': application_features,
            'processed_records': len(data),
            'application_count': len(application_features),
            'project_id': PROJECT_ID
        }
        
    except Exception as e:
        print(f"❌ Error processing partition {partition_id}: {str(e)}")
        raise e

def process_partition_data(data: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """
    Process partition data and extract application features
    """
    application_features = defaultdict(lambda: {
        'components': [],
        'runtime_technologies': set(),
        'framework_technologies': set(),
        'database_technologies': set(),
        'integration_technologies': set(),
        'storage_technologies': set()
    })
    
    for record in data:
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