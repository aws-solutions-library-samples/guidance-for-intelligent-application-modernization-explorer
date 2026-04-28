"""
Component Similarity Generate Clusters Lambda Function
Generates component clusters based on similarity thresholds
"""

import json
import os
import boto3
from typing import Dict, Any, List, Set
from collections import defaultdict

# Initialize AWS clients
s3 = boto3.client('s3')

# Environment variables
DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']
S3_BUCKET = os.environ['S3_BUCKET']
PROJECT_ID = os.environ['PROJECT_ID']

# Clustering configuration
SIMILARITY_THRESHOLD = 0.7  # Components with similarity >= 0.7 are clustered together
MIN_CLUSTER_SIZE = 2        # Minimum components per cluster

def handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Generate component clusters based on similarity scores
    """
    print(f"🎯 Starting cluster generation for project {PROJECT_ID}")
    
    try:
        # Check if aggregated results are in S3
        aggregate_result = event.get('aggregate_result', {})
        aggregated_results_s3_key = aggregate_result.get('aggregated_results_s3_key', '')
        
        if aggregated_results_s3_key:
            print(f"📥 Reading aggregated results from S3: {aggregated_results_s3_key}")
            similarities = read_similarities_from_s3(aggregated_results_s3_key)
            total_similarities = len(similarities)
        else:
            # Fallback to reading from event (backward compatibility)
            print(f"⚠️  No S3 key found, reading from event (legacy mode)")
            similarities = aggregate_result.get('similarities', [])
            total_similarities = aggregate_result.get('total_similarities', len(similarities))
        
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
        
        # Store clusters in S3 for next step
        clusters_s3_key = f"component-clusters/{PROJECT_ID}/clusters.json"
        store_clusters_in_s3(clusters_s3_key, clusters)
        
        print(f"✅ Generated {len(clusters)} clusters")
        print(f"💾 Clusters stored at: {clusters_s3_key}")
        
        return {
            'statusCode': 200,
            'clusters': clusters,
            'cluster_count': len(clusters),
            'clusters_s3_key': clusters_s3_key,
            'project_id': PROJECT_ID
        }
        
    except Exception as e:
        print(f"❌ Error generating clusters: {str(e)}")
        raise e

def generate_similarity_clusters(similarities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Generate clusters using graph-based approach with similarity threshold
    """
    # Build adjacency graph for components above threshold
    adjacency = defaultdict(set)
    component_info = {}
    
    for sim in similarities:
        if sim['similarity_score'] >= SIMILARITY_THRESHOLD:
            comp1_id = sim['component_id']
            comp2_id = sim['similar_component_id']
            
            # Add to adjacency graph
            adjacency[comp1_id].add(comp2_id)
            adjacency[comp2_id].add(comp1_id)
            
            # Store component information
            component_info[comp1_id] = {
                'name': sim.get('component1_name', ''),
                'application': sim.get('application1', '')
            }
            component_info[comp2_id] = {
                'name': sim.get('component2_name', ''),
                'application': sim.get('application2', '')
            }
    
    print(f"🔗 Built adjacency graph with {len(adjacency)} connected components")
    
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
    for component_id in adjacency:
        if component_id not in visited:
            cluster_components = []
            dfs(component_id, cluster_components)
            
            # Only include clusters with minimum size
            if len(cluster_components) >= MIN_CLUSTER_SIZE:
                cluster = create_cluster_object(cluster_components, component_info, similarities)
                clusters.append(cluster)
    
    # Sort clusters by size (largest first)
    clusters.sort(key=lambda x: x['component_count'], reverse=True)
    
    # Assign cluster IDs
    for i, cluster in enumerate(clusters):
        cluster['cluster_id'] = i
    
    return clusters

def create_cluster_object(component_ids: List[str], component_info: Dict[str, Dict], similarities: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Create a cluster object with detailed information
    """
    # Build component details
    components = []
    applications = set()
    
    for comp_id in component_ids:
        comp_data = component_info.get(comp_id, {})
        components.append({
            'component_id': comp_id,
            'component_name': comp_data.get('name', ''),
            'application_name': comp_data.get('application', '')
        })
        applications.add(comp_data.get('application', ''))
    
    # Calculate average similarity within cluster
    cluster_similarities = []
    for sim in similarities:
        if (sim['component_id'] in component_ids and 
            sim['similar_component_id'] in component_ids):
            cluster_similarities.append(sim['similarity_score'])
    
    avg_similarity = sum(cluster_similarities) / len(cluster_similarities) if cluster_similarities else 0.0
    
    # Identify dominant technologies (this would require component tech stack data)
    # For now, we'll use application names as a proxy
    dominant_applications = list(applications)[:5]  # Top 5 applications
    
    return {
        'cluster_id': 0,  # Will be set later
        'component_count': len(component_ids),
        'application_count': len(applications),
        'components': components,
        'dominant_applications': dominant_applications,
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

def read_similarities_from_s3(s3_key: str) -> List[Dict[str, Any]]:
    """
    Read aggregated similarities from S3
    """
    try:
        print(f"📥 Reading from S3 bucket: {S3_BUCKET}, key: {s3_key}")
        response = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
        data = json.loads(response['Body'].read().decode('utf-8'))
        similarities = data.get('similarities', [])
        print(f"✅ Successfully read {len(similarities)} similarities from S3")
        return similarities
    except Exception as e:
        print(f"❌ Error reading from S3: {str(e)}")
        raise e

def store_clusters_in_s3(s3_key: str, clusters: List[Dict[str, Any]]):
    """
    Store cluster results in S3
    """
    try:
        cluster_data = {
            'clusters': clusters,
            'cluster_summary': {
                'total_clusters': len(clusters),
                'total_components_clustered': sum(c['component_count'] for c in clusters),
                'project_id': PROJECT_ID,
                'generated_at': context.aws_request_id if 'context' in locals() else ''
            }
        }
        
        s3.put_object(
            Bucket=S3_BUCKET,
            Key=s3_key,
            Body=json.dumps(cluster_data, indent=2),
            ContentType='application/json'
        )
        
        print(f"✅ Clusters stored successfully at: {s3_key}")
        
    except Exception as e:
        print(f"❌ Error storing clusters: {str(e)}")
        raise e
