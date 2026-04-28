"""
Component Similarity Aggregate Results Lambda Function
Aggregates similarity results from all partition processing
"""

import json
import os
import boto3
from datetime import datetime
from typing import Dict, Any, List

# Initialize AWS clients
s3 = boto3.client('s3')

# Environment variables
S3_BUCKET = os.environ['S3_BUCKET']
PROJECT_ID = os.environ['PROJECT_ID']

def handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Aggregate similarity results from all partition processing
    """
    print(f"📊 Starting results aggregation for project {PROJECT_ID}")
    
    # Extract partition results from event
    # The Step Function Map state passes results in partition_results field
    if isinstance(event, dict) and 'partition_results' in event:
        partition_results = event['partition_results']
    elif isinstance(event, list):
        partition_results = event
    else:
        partition_results = []
    
    print(f"🔄 Processing {len(partition_results)} partition results")
    print(f"📋 Event structure: {json.dumps(partition_results[:2], indent=2) if len(partition_results) > 0 else 'Empty partition_results'}")
    
    try:
        # Aggregate all partition results
        all_similarities = []
        total_processed_components = 0
        successful_partitions = 0
        failed_partitions = 0
        
        print(f"🔍 Analyzing partition results...")
        
        for partition_idx, partition_result in enumerate(partition_results):
            print(f"📦 Processing partition {partition_idx + 1}/{len(event)}")
            
            # Handle both dict and string partition results
            if isinstance(partition_result, str):
                try:
                    partition_result = json.loads(partition_result)
                except:
                    print(f"   ⚠️  Could not parse partition result as JSON")
                    failed_partitions += 1
                    continue
            
            status_code = partition_result.get('statusCode', 'unknown') if isinstance(partition_result, dict) else 'unknown'
            print(f"   📋 Partition status: {status_code}")
            
            if status_code == 200:
                successful_partitions += 1
                components_in_partition = partition_result.get('processed_components', 0)
                total_processed_components += components_in_partition
                
                print(f"   ✅ Successful partition with {components_in_partition} components processed")
                
                # Read partition results from S3
                results_s3_key = partition_result.get('results_s3_key', '')
                print(f"   📥 Reading results from S3 key: {results_s3_key}")
                
                if results_s3_key:
                    partition_similarities = read_partition_results_from_s3(results_s3_key)
                    print(f"   📊 Found {len(partition_similarities)} similarity records in this partition")
                    all_similarities.extend(partition_similarities)
                else:
                    print(f"   ⚠️  No S3 key found for partition {partition_idx + 1}")
            else:
                failed_partitions += 1
                print(f"   ❌ Failed partition: {partition_result}")
        
        print(f"🎯 AGGREGATION SUMMARY:")
        print(f"   📊 Total partitions processed: {len(partition_results)}")
        print(f"   ✅ Successful partitions: {successful_partitions}")
        print(f"   ❌ Failed partitions: {failed_partitions}")
        print(f"   🔢 Total components processed: {total_processed_components}")
        print(f"   🔗 Total similarity records found: {len(all_similarities)}")
        
        if len(all_similarities) == 0:
            print(f"⚠️  WARNING: No similarity records found across all partitions!")
            print(f"📋 This could indicate:")
            print(f"   - Partition processing didn't find any similar components")
            print(f"   - S3 results are empty or missing")
            print(f"   - Similarity threshold is too high")
        
        # Create aggregation summary
        aggregation_summary = {
            'total_partitions': len(partition_results),
            'successful_partitions': successful_partitions,
            'failed_partitions': failed_partitions,
            'total_processed_components': total_processed_components,
            'total_similarities': len(all_similarities),
            'project_id': PROJECT_ID
        }
        
        print(f"📊 Aggregation completed: {len(all_similarities)} similarities extracted")
        
        # Store aggregated results in S3 to avoid Step Function payload size limits
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        aggregated_s3_key = f"comp-aggregated-results/{PROJECT_ID}/aggregated_{timestamp}.json"
        
        aggregated_data = {
            'similarities': all_similarities,
            'aggregation_summary': aggregation_summary,
            'project_id': PROJECT_ID,
            'timestamp': timestamp
        }
        
        print(f"💾 Storing aggregated results in S3: {aggregated_s3_key}")
        s3.put_object(
            Bucket=S3_BUCKET,
            Key=aggregated_s3_key,
            Body=json.dumps(aggregated_data),
            ContentType='application/json'
        )
        print(f"✅ Aggregated results stored successfully in S3")
        
        # Return only metadata to Step Functions (not the full similarities array)
        return {
            'statusCode': 200,
            'message': 'Component similarity analysis completed successfully',
            'aggregation_summary': aggregation_summary,
            'total_similarities': len(all_similarities),
            'aggregated_results_s3_key': aggregated_s3_key,
            'project_id': PROJECT_ID
        }
        
    except Exception as e:
        print(f"❌ Error aggregating results: {str(e)}")
        raise e

def read_partition_results_from_s3(s3_key: str) -> List[Dict[str, Any]]:
    """
    Read partition results from S3
    """
    if not s3_key:
        print(f"   ⚠️  Empty S3 key provided")
        return []
        
    try:
        print(f"   📥 Attempting to read from S3...")
        print(f"   🪣 Bucket: {S3_BUCKET}")
        print(f"   🔑 Key: {s3_key}")
        
        response = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
        data_content = response['Body'].read().decode('utf-8')
        
        print(f"   📄 File size: {len(data_content)} bytes")
        
        results_data = json.loads(data_content)
        print(f"   📋 JSON structure keys: {list(results_data.keys())}")
        
        similarities = results_data.get('similarities', [])
        print(f"   🔗 Found {len(similarities)} similarity records")
        
        # Log sample record structure for debugging
        if similarities:
            print(f"   📋 Sample similarity record structure:")
            print(f"      Keys: {list(similarities[0].keys())}")
            print(f"      Sample data: {json.dumps(similarities[0], indent=6)}")
        
        return similarities
        
    except Exception as e:
        print(f"   ❌ Error reading partition results from S3: {str(e)}")
        return []