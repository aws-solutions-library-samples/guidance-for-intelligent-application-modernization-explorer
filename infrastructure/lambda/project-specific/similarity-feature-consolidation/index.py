"""
Feature Consolidation Lambda Function
Consolidates application features from all partitions and prepares similarity batches
"""

import json
import os
import math
from typing import Dict, Any, List
from collections import defaultdict

PROJECT_ID = os.environ['PROJECT_ID']

def handler(event: List[Dict[str, Any]], context) -> Dict[str, Any]:
    """
    Consolidate application features from all partitions
    """
    print(f"🔗 Starting feature consolidation for project {PROJECT_ID}")
    print(f"📦 Processing {len(event)} partition results")
    
    try:
        # Consolidate features from all partitions
        consolidated_features = consolidate_partition_results(event)
        
        # Create similarity processing batches
        similarity_batches = create_similarity_batches(consolidated_features)
        
        print(f"✅ Feature consolidation completed")
        print(f"📊 Consolidated {len(consolidated_features)} applications")
        print(f"🔄 Created {len(similarity_batches)} similarity batches")
        
        return {
            'statusCode': 200,
            'consolidated_features': consolidated_features,
            'similarity_batches': similarity_batches,
            'application_count': len(consolidated_features),
            'batch_count': len(similarity_batches),
            'project_id': PROJECT_ID
        }
        
    except Exception as e:
        print(f"❌ Error consolidating features: {str(e)}")
        raise e

def consolidate_partition_results(partition_results: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """
    Consolidate application features from all partition results
    """
    consolidated = defaultdict(lambda: {
        'components': [],
        'runtime_technologies': set(),
        'framework_technologies': set(),
        'database_technologies': set(),
        'integration_technologies': set(),
        'storage_technologies': set()
    })
    
    for partition_result in partition_results:
        # Handle both dict and string partition results
        if isinstance(partition_result, str):
            try:
                partition_result = json.loads(partition_result)
            except:
                print(f"⚠️ Could not parse partition result as JSON, skipping")
                continue
        
        status_code = partition_result.get('statusCode', 'unknown') if isinstance(partition_result, dict) else 'unknown'
        if status_code != 200:
            print(f"⚠️ Skipping failed partition: {partition_result}")
            continue
            
        application_features = partition_result.get('application_features', {})
        
        for app_name, features in application_features.items():
            # Merge components
            consolidated[app_name]['components'].extend(features.get('components', []))
            
            # Merge technology sets
            consolidated[app_name]['runtime_technologies'].update(features.get('runtime_technologies', []))
            consolidated[app_name]['framework_technologies'].update(features.get('framework_technologies', []))
            consolidated[app_name]['database_technologies'].update(features.get('database_technologies', []))
            consolidated[app_name]['integration_technologies'].update(features.get('integration_technologies', []))
            consolidated[app_name]['storage_technologies'].update(features.get('storage_technologies', []))
    
    # Convert to final format
    final_features = {}
    for app_name, features in consolidated.items():
        final_features[app_name] = {
            'components': features['components'],
            'runtime_technologies': list(features['runtime_technologies']),
            'framework_technologies': list(features['framework_technologies']),
            'database_technologies': list(features['database_technologies']),
            'integration_technologies': list(features['integration_technologies']),
            'storage_technologies': list(features['storage_technologies']),
            'component_count': len(features['components'])
        }
    
    return final_features

def create_similarity_batches(consolidated_features: Dict[str, Dict[str, Any]], batch_size: int = 50) -> List[Dict[str, Any]]:
    """
    Create batches for similarity processing
    Each batch contains a subset of applications to compare against all others
    """
    application_names = list(consolidated_features.keys())
    total_apps = len(application_names)
    
    if total_apps == 0:
        return []
    
    # Calculate number of batches needed
    batch_count = math.ceil(total_apps / batch_size)
    
    batches = []
    for i in range(batch_count):
        start_idx = i * batch_size
        end_idx = min((i + 1) * batch_size, total_apps)
        
        batch_apps = application_names[start_idx:end_idx]
        
        batch = {
            'batch_id': i,
            'applications': batch_apps,
            'all_features': consolidated_features,  # All features for comparison
            'batch_size': len(batch_apps),
            'total_applications': total_apps,
            'project_id': PROJECT_ID
        }
        
        batches.append(batch)
        
        print(f"🔄 Batch {i}: {len(batch_apps)} applications")
    
    return batches