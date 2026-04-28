"""
Component Similarity Partition Dataset Lambda Function
Partitions large component datasets for distributed processing
Handles both direct data and S3-stored data
"""

import json
import os
import boto3
import math
from typing import Dict, Any, List

# Initialize S3 client
s3 = boto3.client('s3')

# Environment variables
S3_BUCKET = os.environ['S3_BUCKET']
PROJECT_ID = os.environ['PROJECT_ID']

# Configuration
MAX_COMPONENTS_PER_PARTITION = 500

def handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Partition large component dataset for distributed processing
    """
    print(f"📦 Partitioning component dataset for project {PROJECT_ID}")
    
    # Safe event logging - only log keys to avoid serialization issues
    try:
        event_keys = list(event.keys()) if isinstance(event, dict) else "Not a dict"
        print(f"📋 Event keys: {event_keys}")
    except Exception as e:
        print(f"⚠️ Could not log event keys: {str(e)}")
    
    try:
        # Check if data is stored in S3 (large dataset)
        data_stored_in_s3 = event.get('dataStoredInS3', False)
        print(f"🔍 dataStoredInS3 flag: {data_stored_in_s3}")
        print(f"🔍 dataStoredInS3 type: {type(data_stored_in_s3)}")
        
        # Ensure we handle both boolean and string representations
        if data_stored_in_s3 is True or str(data_stored_in_s3).lower() == 'true':
            print(f"📥 Large dataset detected - reading from S3")
            s3_data_info = event.get('s3_data_info', {})
            print(f"📋 S3 data info keys: {list(s3_data_info.keys()) if isinstance(s3_data_info, dict) else 'Not a dict'}")
            components_data = read_data_from_s3(s3_data_info)
        else:
            print(f"📥 Small dataset detected - reading from direct input")
            # Extract component data from direct Athena results
            athena_data = event.get('athena_data', {})
            components_data = athena_data.get('data', [])
        
        total_components = len(components_data)
        print(f"📊 Total components to partition: {total_components}")
        
        if total_components == 0:
            print("⚠️ No components found to partition")
            return {
                'statusCode': 200,
                'partitions': [],
                'total_components': 0,
                'partition_count': 0
            }
        
        # Calculate number of partitions needed
        partition_count = math.ceil(total_components / MAX_COMPONENTS_PER_PARTITION)
        print(f"📦 Creating {partition_count} partitions")
        
        # Create partitions and store in S3
        partitions = []
        for i in range(partition_count):
            start_idx = i * MAX_COMPONENTS_PER_PARTITION
            end_idx = min((i + 1) * MAX_COMPONENTS_PER_PARTITION, total_components)
            
            partition_data = components_data[start_idx:end_idx]
            
            # Store partition in S3
            partition_key = f"component-partitions/{PROJECT_ID}/partition_{i}.json"
            s3.put_object(
                Bucket=S3_BUCKET,
                Key=partition_key,
                Body=json.dumps(partition_data),
                ContentType='application/json'
            )
            
            partition = {
                'partition_id': i,
                'start_index': start_idx,
                'end_index': end_idx,
                'component_count': len(partition_data),
                's3_key': partition_key,
                'project_id': PROJECT_ID
            }
            
            partitions.append(partition)
            print(f"📦 Partition {i}: {len(partition_data)} components stored at {partition_key}")
        
        print(f"✅ Dataset partitioning completed successfully")
        
        return {
            'statusCode': 200,
            'partitions': partitions,
            'total_components': total_components,
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
    Read component data from S3 when dataset is too large for Step Functions
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
        components_data = athena_result.get('data', [])
        
        print(f"✅ Successfully read {len(components_data)} components from S3")
        return components_data
        
    except Exception as e:
        print(f"❌ Error reading data from S3: {str(e)}")
        import traceback
        print(f"📋 Full S3 read traceback: {traceback.format_exc()}")
        raise e