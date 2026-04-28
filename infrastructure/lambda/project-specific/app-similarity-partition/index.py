"""
App Similarity Partition Lambda Function
Partitions large application datasets for distributed processing
Handles both direct data and S3-stored data
"""

import json
import os
import boto3
import math
from typing import Dict, Any, List
from collections import defaultdict

# Initialize S3 client
s3 = boto3.client('s3')

# Environment variables
PROJECT_ID = os.environ['PROJECT_ID']
S3_BUCKET = os.environ['S3_BUCKET']

# Configuration
MAX_APPLICATIONS_PER_PARTITION = 100  # Smaller partitions for app similarity

def handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Partition application dataset for distributed processing
    ALWAYS reads from S3 (consistent with S3 wrapper behavior)
    """
    print(f"📦 Partitioning application dataset for project {PROJECT_ID}")
    
    try:
        # Extract S3 information from the S3 wrapper response
        s3_data_info = event.get('s3_data_info', {})
        print(f"📋 S3 data info: {json.dumps(s3_data_info, indent=2)}")
        
        # Read data from S3 (always)
        applications_data = read_data_from_s3(s3_data_info)
        
        # Process raw data into application-level features
        application_features = process_application_data(applications_data)
        
        total_applications = len(application_features)
        print(f"📊 Total applications to partition: {total_applications}")
        
        if total_applications == 0:
            print("⚠️ No applications found to partition")
            return {
                'statusCode': 200,
                'partitions': [],
                'total_applications': 0,
                'partition_count': 0
            }
        
        # Calculate number of partitions needed
        partition_count = math.ceil(total_applications / MAX_APPLICATIONS_PER_PARTITION)
        print(f"📦 Creating {partition_count} partitions")
        
        # Create partitions and store in S3
        partitions = []
        application_names = list(application_features.keys())
        
        for i in range(partition_count):
            start_idx = i * MAX_APPLICATIONS_PER_PARTITION
            end_idx = min((i + 1) * MAX_APPLICATIONS_PER_PARTITION, total_applications)
            
            partition_app_names = application_names[start_idx:end_idx]
            partition_features = {name: application_features[name] for name in partition_app_names}
            
            # Store partition in S3
            partition_key = f"app-partitions/{PROJECT_ID}/partition_{i}.json"
            s3.put_object(
                Bucket=S3_BUCKET,
                Key=partition_key,
                Body=json.dumps(partition_features),
                ContentType='application/json'
            )
            
            partition = {
                'partition_id': i,
                'start_index': start_idx,
                'end_index': end_idx,
                'application_count': len(partition_app_names),
                's3_key': partition_key,
                'project_id': PROJECT_ID,
                'application_names': partition_app_names
            }
            
            partitions.append(partition)
            print(f"📦 Partition {i}: {len(partition_app_names)} applications stored at {partition_key}")
        
        print(f"✅ Dataset partitioning completed successfully")
        
        return {
            'statusCode': 200,
            'partitions': partitions,
            'total_applications': total_applications,
            'partition_count': len(partitions),
            'project_id': PROJECT_ID
        }
        
    except Exception as e:
        print(f"❌ Error partitioning dataset: {str(e)}")
        import traceback
        print(f"📋 Full traceback: {traceback.format_exc()}")
        raise e

def read_data_from_s3(s3_data_info: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Read application data from S3 when dataset is too large for Step Functions
    """
    try:
        s3_bucket = s3_data_info.get('s3_bucket')
        s3_key = s3_data_info.get('s3_key')
        
        print(f"📥 S3 bucket: {s3_bucket}")
        print(f"📥 S3 key: {s3_key}")
        
        if not s3_bucket or not s3_key:
            raise ValueError(f"Missing S3 information: bucket={s3_bucket}, key={s3_key}")
        
        print(f"📥 Reading data from S3: s3://{s3_bucket}/{s3_key}")
        
        # Read the data from S3
        response = s3.get_object(Bucket=s3_bucket, Key=s3_key)
        data_content = response['Body'].read().decode('utf-8')
        
        # Parse the JSON data
        athena_result = json.loads(data_content)
        applications_data = athena_result.get('data', [])
        
        print(f"✅ Successfully read {len(applications_data)} application records from S3")
        return applications_data
        
    except Exception as e:
        print(f"❌ Error reading data from S3: {str(e)}")
        import traceback
        print(f"📋 Full S3 read traceback: {traceback.format_exc()}")
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