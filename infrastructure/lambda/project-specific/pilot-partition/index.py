"""
Pilot Partition Lambda Function
Partitions pilot datasets for distributed processing
"""
import json
import boto3
import uuid
from datetime import datetime

def handler(event, context):
    print(f"🚀 Pilot Partition Lambda started")
    print(f"📋 Event: {json.dumps(event, indent=2)}")
    
    try:
        # Extract parameters
        project_id = event['projectId']
        job_id = event['jobId']
        criteria = event['criteria']
        s3_data_info = event['s3_data_info']
        
        # Read actual data from S3 to get real count
        s3_client = boto3.client('s3')
        s3_bucket = s3_data_info['s3_bucket']
        s3_key = s3_data_info['s3_key']
        
        print(f"📥 Reading data from S3: s3://{s3_bucket}/{s3_key}")
        
        # Read the data from S3 to get actual count
        response = s3_client.get_object(Bucket=s3_bucket, Key=s3_key)
        data_content = response['Body'].read().decode('utf-8')
        
        # Parse the JSON data to get actual record count
        athena_result = json.loads(data_content)
        applications_data = athena_result.get('data', [])
        total_applications = len(applications_data)
        
        print(f"📊 Actual applications found in data: {total_applications}")
        
        if total_applications == 0:
            print("⚠️ No applications found in S3 data")
            return {
                'partitions': [],
                'total_partitions': 0,
                'partition_size': 0,
                'total_applications': 0
            }
        
        # Create partitions for distributed processing
        partition_size = 100  # Applications per partition
        
        partitions = []
        for i in range(0, total_applications, partition_size):
            partition_id = str(uuid.uuid4())
            partitions.append({
                'partition_id': partition_id,
                'start_index': i,
                'end_index': min(i + partition_size, total_applications),
                's3_bucket': s3_data_info['s3_bucket'],
                's3_key': s3_data_info['s3_key'],
                'criteria': criteria,
                'project_id': project_id,
                'job_id': job_id
            })
        
        result = {
            'partitions': partitions,
            'total_partitions': len(partitions),
            'partition_size': partition_size,
            'total_applications': total_applications
        }
        
        print(f"✅ Created {len(partitions)} partitions for pilot analysis")
        return result
        
    except Exception as e:
        print(f"❌ Error in pilot partition: {str(e)}")
        raise e