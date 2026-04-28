"""
Results Aggregation Lambda Function
Aggregates similarity processing results and provides summary statistics
"""

import json
import os
import boto3
from typing import Dict, Any, List
from collections import defaultdict
from decimal import Decimal

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')

# Environment variables
SIMILARITY_TABLE = os.environ['SIMILARITY_TABLE']
PROJECT_ID = os.environ['PROJECT_ID']

def handler(event: List[Dict[str, Any]], context) -> Dict[str, Any]:
    """
    Aggregate similarity processing results and generate summary
    """
    print(f"📊 Starting results aggregation for project {PROJECT_ID}")
    print(f"🔄 Processing {len(event)} batch results")
    
    try:
        # Get DynamoDB table
        table = dynamodb.Table(SIMILARITY_TABLE)
        
        # Aggregate batch results
        aggregation_summary = aggregate_batch_results(event)
        
        # Generate similarity statistics
        similarity_stats = generate_similarity_statistics(table)
        
        # Create final summary
        final_summary = {
            'statusCode': 200,
            'project_id': PROJECT_ID,
            'batch_summary': aggregation_summary,
            'similarity_statistics': similarity_stats,
            'processing_complete': True
        }
        
        print(f"✅ Results aggregation completed successfully")
        print(f"📊 Total similarity records: {similarity_stats.get('total_records', 0)}")
        print(f"🎯 Average similarity score: {similarity_stats.get('average_similarity', 0):.3f}")
        
        return final_summary
        
    except Exception as e:
        print(f"❌ Error aggregating results: {str(e)}")
        raise e

def aggregate_batch_results(batch_results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Aggregate results from all similarity processing batches
    """
    total_processed = 0
    total_similarity_records = 0
    total_stored_records = 0
    successful_batches = 0
    failed_batches = 0
    
    for batch_result in batch_results:
        if batch_result.get('statusCode') == 200:
            successful_batches += 1
            total_processed += batch_result.get('processed_applications', 0)
            total_similarity_records += batch_result.get('similarity_records', 0)
            total_stored_records += batch_result.get('stored_records', 0)
        else:
            failed_batches += 1
            print(f"⚠️ Failed batch: {batch_result}")
    
    return {
        'total_batches': len(batch_results),
        'successful_batches': successful_batches,
        'failed_batches': failed_batches,
        'total_processed_applications': total_processed,
        'total_similarity_records': total_similarity_records,
        'total_stored_records': total_stored_records
    }

def generate_similarity_statistics(table) -> Dict[str, Any]:
    """
    Generate statistics from stored similarity data
    """
    try:
        # Scan the table to get all similarity records for this project
        response = table.scan(
            FilterExpression='project_id = :project_id',
            ExpressionAttributeValues={':project_id': PROJECT_ID}
        )
        
        items = response['Items']
        
        # Continue scanning if there are more items
        while 'LastEvaluatedKey' in response:
            response = table.scan(
                FilterExpression='project_id = :project_id',
                ExpressionAttributeValues={':project_id': PROJECT_ID},
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
            items.extend(response['Items'])
        
        if not items:
            return {
                'total_records': 0,
                'unique_applications': 0,
                'average_similarity': 0.0,
                'max_similarity': 0.0,
                'min_similarity': 0.0,
                'similarity_distribution': {}
            }
        
        # Calculate statistics
        similarity_scores = [float(item['similarity_score']) for item in items]
        unique_apps = set()
        
        for item in items:
            unique_apps.add(item['application_id'])
            unique_apps.add(item['similar_app_id'])
        
        # Calculate similarity distribution
        distribution = defaultdict(int)
        for score in similarity_scores:
            if score >= 0.9:
                distribution['0.9-1.0'] += 1
            elif score >= 0.8:
                distribution['0.8-0.9'] += 1
            elif score >= 0.7:
                distribution['0.7-0.8'] += 1
            elif score >= 0.6:
                distribution['0.6-0.7'] += 1
            elif score >= 0.5:
                distribution['0.5-0.6'] += 1
            elif score >= 0.4:
                distribution['0.4-0.5'] += 1
            elif score >= 0.3:
                distribution['0.3-0.4'] += 1
            elif score >= 0.2:
                distribution['0.2-0.3'] += 1
            else:
                distribution['0.1-0.2'] += 1
        
        return {
            'total_records': len(items),
            'unique_applications': len(unique_apps),
            'average_similarity': round(sum(similarity_scores) / len(similarity_scores), 4),
            'max_similarity': round(max(similarity_scores), 4),
            'min_similarity': round(min(similarity_scores), 4),
            'similarity_distribution': dict(distribution)
        }
        
    except Exception as e:
        print(f"⚠️ Error generating statistics: {str(e)}")
        return {
            'total_records': 0,
            'error': str(e)
        }