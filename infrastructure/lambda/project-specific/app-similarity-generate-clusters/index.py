"""
Application Similarity Generate Clusters Lambda Function
Generates application clusters based on similarity thresholds
"""

import json
import os
import boto3
from typing import Dict, Any, List, Set
from collections import defaultdict

# Initialize AWS clients
s3 = boto3.client('s3')

# Environment variables
PROJECT_ID = os.environ['PROJECT_ID']
S3_BUCKET = os.environ.get('S3_BUCKET', '')

# Clustering configuration
SIMILARITY_THRESHOLD = 0.7  # Applications with similarity >= 0.7 are clustered together
MIN_CLUSTER_SIZE = 2        # Minimum applications per cluster

def handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Generate application clusters based on similarity scores
    """
    print(f"🎯 Starting cluster generation for project {PROJECT_ID}")
    
    try:
        # Check if aggregated results are stored in S3 (new approach to avoid payload size limits)
        aggregated_s3_key = None
        s3_bucket = None
        
        # Check in aggregate_result first (Step Function passes it there)
        if 'aggregate_result' in event:
            aggregate_result = event['aggregate_result']
            if isinstance(aggregate_result, dict):
                aggregated_s3_key = aggregate_result.get('aggregated_results_s3_key')
                s3_bucket = aggregate_result.get('s3_bucket')
        
        # Fallback: check at root level
        if not aggregated_s3_key:
            aggregated_s3_key = event.get('aggregated_results_s3_key')
            s3_bucket = event.get('s3_bucket')
        
        # If S3 key exists, read similarities from S3
        if aggregated_s3_key and s3_bucket:
            print(f"📥 Reading aggregated results from S3...")
            print(f"   🪣 Bucket: {s3_bucket}")
            print(f"   🔑 Key: {aggregated_s3_key}")
            
            similarities = read_similarities_from_s3(s3_bucket, aggregated_s3_key)
            total_similarities = len(similarities)
            
            print(f"✅ Loaded {total_similarities} similarities from S3")
        else:
            # Fallback: Extract similarities from event (backward compatibility)
            print(f"📋 Reading similarities from event (legacy mode)")
            
            similarities = event.get('similarities', [])
            
            # Fallback: check if similarities are in aggregate_result
            if not similarities and 'aggregate_result' in event:
                aggregate_result = event['aggregate_result']
                if isinstance(aggregate_result, dict):
                    similarities = aggregate_result.get('similarities', [])
            
            total_similarities = event.get('total_similarities', len(similarities))
        
        print(f"📊 Processing {len(similarities)} similarities (total: {total_similarities})")
        
        if not similarities:
            print("⚠️ No similarities to cluster")
            return {
                'statusCode': 200,
                'clusters': [],
                'cluster_count': 0,
                'project_id': PROJECT_ID
            }
        
        # Generate clusters using graph-based clustering
        clusters = generate_similarity_clusters(similarities)
        
        print(f"✅ Generated {len(clusters)} clusters")
        print(f"📤 Passing clusters to StoreResults step for DynamoDB storage")
        
        return {
            'statusCode': 200,
            'clusters': clusters,
            'cluster_count': len(clusters),
            'project_id': PROJECT_ID
        }
        
    except Exception as e:
        print(f"❌ Error generating clusters: {str(e)}")
        raise e

def read_similarities_from_s3(bucket: str, key: str) -> List[Dict[str, Any]]:
    """
    Read aggregated similarities from S3
    """
    try:
        response = s3.get_object(Bucket=bucket, Key=key)
        data_content = response['Body'].read().decode('utf-8')
        
        print(f"   📄 File size: {len(data_content)} bytes")
        
        aggregated_data = json.loads(data_content)
        similarities = aggregated_data.get('similarities', [])
        
        print(f"   🔗 Found {len(similarities)} similarity records")
        
        return similarities
        
    except Exception as e:
        print(f"   ❌ Error reading aggregated results from S3: {str(e)}")
        raise e

def generate_similarity_clusters(similarities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Generate clusters using graph-based approach with similarity threshold
    """
    # Build adjacency graph for applications above threshold
    adjacency = defaultdict(set)
    application_info = {}
    
    for sim in similarities:
        if sim['similarity_score'] >= SIMILARITY_THRESHOLD:
            app1_id = sim['application_id']
            app2_id = sim['similar_app_id']
            
            # Add to adjacency graph
            adjacency[app1_id].add(app2_id)
            adjacency[app2_id].add(app1_id)
            
            # Store application information
            application_info[app1_id] = {
                'name': sim.get('application1_name', '')
            }
            application_info[app2_id] = {
                'name': sim.get('application2_name', '')
            }
    
    print(f"🔗 Built adjacency graph with {len(adjacency)} connected applications")
    
    # Find connected components using DFS
    visited = set()
    clusters = []
    
    def dfs(node: str, cluster: List[str]):
        if node in visited:
            return
        visited.add(node)
        cluster.append(node)
        for neighbor in adjacency[node]:
            dfs(neighbor, cluster)
    
    # Generate clusters
    for application_id in adjacency:
        if application_id not in visited:
            cluster_applications = []
            dfs(application_id, cluster_applications)
            
            # Only include clusters with minimum size
            if len(cluster_applications) >= MIN_CLUSTER_SIZE:
                cluster = create_cluster_object(cluster_applications, application_info, similarities)
                clusters.append(cluster)
    
    # Sort clusters by size (largest first)
    clusters.sort(key=lambda x: x['application_count'], reverse=True)
    
    # Assign cluster IDs
    for i, cluster in enumerate(clusters):
        cluster['cluster_id'] = i
    
    return clusters

def create_cluster_object(application_ids: List[str], application_info: Dict[str, Dict], similarities: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Create a cluster object with detailed information
    """
    # Build application details
    applications = []
    
    for app_id in application_ids:
        app_data = application_info.get(app_id, {})
        applications.append({
            'application_id': app_id,
            'application_name': app_data.get('name', '')
        })
    
    # Calculate average similarity within cluster
    cluster_similarities = []
    for sim in similarities:
        if (sim['application_id'] in application_ids and 
            sim['similar_app_id'] in application_ids):
            cluster_similarities.append(sim['similarity_score'])
    
    avg_similarity = sum(cluster_similarities) / len(cluster_similarities) if cluster_similarities else 0.0
    
    return {
        'cluster_id': 0,  # Will be set later
        'application_count': len(application_ids),
        'applications': applications,
        'average_similarity': round(avg_similarity, 4),
        'similarity_range': {
            'min': round(min(cluster_similarities), 4) if cluster_similarities else 0.0,
            'max': round(max(cluster_similarities), 4) if cluster_similarities else 0.0
        },
        'cluster_strength': calculate_cluster_strength(cluster_similarities)
    }

def calculate_cluster_strength(similarities: List[float]) -> str:
    """
    Calculate cluster strength based on similarity distribution
    """
    if not similarities:
        return 'weak'
    
    avg_sim = sum(similarities) / len(similarities)
    
    if avg_sim >= 0.9:
        return 'very_strong'
    elif avg_sim >= 0.8:
        return 'strong'
    elif avg_sim >= 0.7:
        return 'moderate'
    else:
        return 'weak'
