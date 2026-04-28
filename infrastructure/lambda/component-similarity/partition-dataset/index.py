"""
Partition Dataset Lambda Function for Component Similarity Analysis
Partitions large datasets into manageable chunks for distributed processing
Supports both normal data and S3-stored data from wrapper Lambda
"""

import json
import os
import boto3
import math
from typing import Dict, Any, List

# Initialize AWS clients
s3 = boto3.client('s3')

# Environment variables
PROCESSING_BUCKET = os.environ['PROCESSING_BUCKET']
RESULTS_BUCKET = os.environ.get('RESULTS_BUCKET', PROCESSING_BUCKET)
MAX_COMPONENTS_PER_PARTITION = int(os.environ.get('MAX_COMPONENTS_PER_PARTITION', '500'))
PROJECT_ID = os.environ['PROJECT_ID']

def handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Partition large component datasets for distributed processing
    Handles both normal data and S3-stored data from wrapper Lambda
    """
    print(f"📦 Starting data partitioning for project {PROJECT_ID}")
    
    try:
        project_id = event.get('projectId', PROJECT_ID)
        filters = event.get('filters', {})
        
        # Check if data is stored in S3 (from wrapper Lambda)
        if event.get('dataStoredInS3'):
            print("📥 Loading data from S3 (large dataset)")
            components = load_data_from_s3(event['s3_data_info'])
        else:
            print("📥 Loading data from Step Function payload (normal dataset)")
            components = load_data_from_payload(event)
        
        total_components = len(components)
        
        print(f"📊 Total components to partition: {total_components}")
        print(f"📦 Max components per partition: {MAX_COMPONENTS_PER_PARTITION}")
        
        if total_components == 0:
            print("⚠️ No components to partition")
            return {
                'statusCode': 200,
                'partitions': [],
                'total_components': 0,
                'partition_count': 0
            }
        
        # Apply filters before partitioning
        filtered_components = apply_filters(components, filters)
        filtered_count = len(filtered_components)
        
        print(f"📋 After filtering: {filtered_count} components")
        
        # Calculate number of partitions needed
        partition_count = math.ceil(filtered_count / MAX_COMPONENTS_PER_PARTITION)
        
        print(f"📦 Creating {partition_count} partitions")
        
        # Create partitions
        partitions = []
        for i in range(partition_count):
            start_idx = i * MAX_COMPONENTS_PER_PARTITION
            end_idx = min((i + 1) * MAX_COMPONENTS_PER_PARTITION, filtered_count)
            
            partition_components = filtered_components[start_idx:end_idx]
            
            # Store partition data in S3 for processing
            partition_key = f"partitions/{project_id}/partition-{i}.json"
            partition_data = {
                'partition_id': i,
                'components': partition_components,
                'filters': filters,
                'project_id': project_id,
                'start_index': start_idx,
                'end_index': end_idx,
                'component_count': len(partition_components)
            }
            
            # Upload partition to S3
            s3.put_object(
                Bucket=PROCESSING_BUCKET,
                Key=partition_key,
                Body=json.dumps(partition_data),
                ContentType='application/json',
                Metadata={
                    'project-id': project_id,
                    'partition-id': str(i),
                    'component-count': str(len(partition_components))
                }
            )
            
            partition = {
                'partition_id': i,
                'start_index': start_idx,
                'end_index': end_idx,
                'component_count': len(partition_components),
                's3_key': partition_key,
                'project_id': project_id,
                'filters': filters
            }
            
            partitions.append(partition)
            
            print(f"📦 Partition {i}: {len(partition_components)} components (indices {start_idx}-{end_idx-1}) -> s3://{PROCESSING_BUCKET}/{partition_key}")
        
        print(f"✅ Data partitioning completed successfully")
        print(f"📊 Created {len(partitions)} partitions from {filtered_count} components")
        
        return {
            'statusCode': 200,
            'partitions': partitions,
            'total_components': filtered_count,
            'partition_count': len(partitions),
            'project_id': project_id,
            'processing_bucket': PROCESSING_BUCKET
        }
        
    except Exception as e:
        print(f"❌ Error partitioning dataset: {str(e)}")
        raise e

def load_data_from_s3(s3_data_info: Dict) -> List[Dict]:
    """Load component data from S3 (for large datasets)"""
    try:
        bucket_name = s3_data_info['bucketName']
        s3_key = s3_data_info['s3Key']
        
        print(f"📥 Reading data from S3: s3://{bucket_name}/{s3_key}")
        
        response = s3.get_object(Bucket=bucket_name, Key=s3_key)
        s3_data = json.loads(response['Body'].read())
        
        components = s3_data['data']
        print(f"📊 Loaded {len(components)} components from S3")
        
        return components
        
    except Exception as e:
        print(f"❌ Error loading data from S3: {str(e)}")
        raise e

def load_data_from_payload(event: Dict) -> List[Dict]:
    """Load component data from Step Function payload (for normal datasets)"""
    try:
        # Extract data from Athena query result
        athena_result = event.get('athena_result', {})
        
        print(f"🔍 Athena result structure: {json.dumps(athena_result, indent=2)}")
        
        # Parse the JSON body from Athena result
        if 'body' in athena_result:
            try:
                body_data = json.loads(athena_result['body'])
                components = body_data.get('data', [])
            except json.JSONDecodeError as e:
                print(f"❌ Failed to parse Athena result body: {e}")
                raise e
        else:
            # Fallback to direct data access
            components = event.get('data', [])
        
        print(f"📊 Loaded {len(components)} components from payload")
        return components
        
    except Exception as e:
        print(f"❌ Error loading data from payload: {str(e)}")
        raise e

def apply_filters(components: List[Dict], filters: Dict) -> List[Dict]:
    """Apply analysis filters to component data"""
    filtered = components
    
    # Filter by application if specified
    if filters.get('applicationFilter') and filters['applicationFilter'] != 'all':
        filtered = [c for c in filtered if c.get('applicationname') == filters['applicationFilter']]
        print(f"🔍 Application filter '{filters['applicationFilter']}': {len(filtered)} components")
    
    # Filter by component type if specified
    if filters.get('componentTypeFilter') and filters['componentTypeFilter'] != 'all':
        filtered = [c for c in filtered if c.get('runtime') == filters['componentTypeFilter']]
        print(f"🔍 Component type filter '{filters['componentTypeFilter']}': {len(filtered)} components")
    
    # Filter out components with missing critical data
    original_count = len(filtered)
    filtered = [c for c in filtered if c.get('componentname') and c.get('applicationname')]
    
    if len(filtered) < original_count:
        print(f"🔍 Removed {original_count - len(filtered)} components with missing names")
    
    return filtered
