"""
Data Partitioning Lambda Function for Similarity Analysis
Partitions tech stack data into manageable chunks for parallel processing
"""

import json
import os
import math
from typing import Dict, Any, List

# Environment variables
MAX_ROWS_PER_PARTITION = int(os.environ.get('MAX_ROWS_PER_PARTITION', '10000'))
PROJECT_ID = os.environ['PROJECT_ID']

def handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Partition tech stack data for parallel processing
    """
    print(f"📦 Starting data partitioning for project {PROJECT_ID}")
    
    try:
        # Extract data from Athena query result
        athena_result = event.get('athena_result', {})
        project_id = event.get('projectId', PROJECT_ID)
        
        print(f"🔍 Athena result structure: {json.dumps(athena_result, indent=2)}")
        
        # Parse the JSON body from Athena result
        if 'body' in athena_result:
            try:
                body_data = json.loads(athena_result['body'])
                data = body_data.get('data', [])
            except json.JSONDecodeError as e:
                print(f"❌ Failed to parse Athena result body: {e}")
                return {
                    'statusCode': 400,
                    'error': f'Failed to parse Athena result: {str(e)}'
                }
        else:
            # Fallback to direct data access for backward compatibility
            data = event.get('data', [])
        
        total_records = len(data)
        
        print(f"📊 Total records to partition: {total_records}")
        print(f"📦 Max rows per partition: {MAX_ROWS_PER_PARTITION}")
        
        if total_records == 0:
            print("⚠️ No data to partition")
            return {
                'statusCode': 200,
                'partitions': [],
                'total_records': 0,
                'partition_count': 0
            }
        
        # Calculate number of partitions needed
        partition_count = math.ceil(total_records / MAX_ROWS_PER_PARTITION)
        
        print(f"📦 Creating {partition_count} partitions")
        
        # Create partitions
        partitions = []
        for i in range(partition_count):
            start_idx = i * MAX_ROWS_PER_PARTITION
            end_idx = min((i + 1) * MAX_ROWS_PER_PARTITION, total_records)
            
            partition_data = data[start_idx:end_idx]
            
            partition = {
                'partition_id': i,
                'start_index': start_idx,
                'end_index': end_idx,
                'record_count': len(partition_data),
                'data': partition_data,
                'project_id': PROJECT_ID
            }
            
            partitions.append(partition)
            
            print(f"📦 Partition {i}: {len(partition_data)} records (indices {start_idx}-{end_idx-1})")
        
        print(f"✅ Data partitioning completed successfully")
        print(f"📊 Created {len(partitions)} partitions from {total_records} records")
        
        return {
            'statusCode': 200,
            'partitions': partitions,
            'total_records': total_records,
            'partition_count': len(partitions),
            'project_id': PROJECT_ID
        }
        
    except Exception as e:
        print(f"❌ Error partitioning data: {str(e)}")
        raise e