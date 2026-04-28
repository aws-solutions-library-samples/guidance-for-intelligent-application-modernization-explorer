"""
Generate Clusters Lambda Function for Component Similarity Analysis
Creates component clusters based on similarity thresholds and relationships
"""

import json
import os
import boto3
from typing import Dict, Any, List, Set
from collections import defaultdict

# Initialize AWS clients
s3 = boto3.client('s3')

# Environment variables
COMPONENT_SIMILARITY_TABLE = os.environ['COMPONENT_SIMILARITY_TABLE']
PROCESSING_BUCKET = os.environ['PROCESSING_BUCKET']
PROJECT_ID = os.environ['PROJECT_ID']

def handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Generate component clusters from aggregated similarity results
    """
    print(f"🔗 Starting cluster generation for project {PROJECT_ID}")
    
    try:
        # Load aggregated results from S3
        aggregated_s3_key = event.get('aggregated_s3_key', f"aggregated/{PROJECT_ID}/similarity-results.json")
        
        print(f"📁 Loading aggregated results from s3://{PROCESSING_BUCKET}/{aggregated_s3_key}")
        
        response = s3.get_object(Bucket=PROCESSING_BUCKET, Key=aggregated_s3_key)
        aggregated_data = json.loads(response['Body'].read().decode('utf-8'))
        
        similarities = aggregated_data.get('similarities', [])
        summary = aggregated_data.get('summary', {})
        
        print(f"📊 Processing {len(similarities)} similarity relationships")
        
        if not similarities:
            print("⚠️ No similarities to cluster")
            return {
                'statusCode': 200,
                'project_id': PROJECT_ID,
                'clusters': [],
                'cluster_count': 0,
                'clustered_components': 0
            }
        
        # Generate clusters using different algorithms
        threshold_clusters = generate_threshold_clusters(similarities, 0.7)
        hierarchical_clusters = generate_hierarchical_clusters(similarities)
        technology_clusters = generate_technology_clusters(similarities)
        
        # Combine and deduplicate clusters
        all_clusters = {
            'threshold_clusters': threshold_clusters,
            'hierarchical_clusters': hierarchical_clusters,
            'technology_clusters': technology_clusters
        }
        
        # Store cluster results in S3
        clusters_key = f"clusters/{PROJECT_ID}/component-clusters.json"
        clusters_data = {
            'project_id': PROJECT_ID,
            'clusters': all_clusters,
            'cluster_summary': {
                'threshold_clusters': len(threshold_clusters),
                'hierarchical_clusters': len(hierarchical_clusters),
                'technology_clusters': len(technology_clusters),
                'total_clustered_components': count_clustered_components(all_clusters)
            },
            'generated_at': context.aws_request_id
        }
        
        s3.put_object(
            Bucket=PROCESSING_BUCKET,
            Key=clusters_key,
            Body=json.dumps(clusters_data),
            ContentType='application/json',
            Metadata={
                'project-id': PROJECT_ID,
                'cluster-types': '3',
                'total-clusters': str(sum(len(clusters) for clusters in all_clusters.values()))
            }
        )
        
        print(f"✅ Cluster generation completed successfully")
        print(f"🔗 Threshold clusters: {len(threshold_clusters)}")
        print(f"🌳 Hierarchical clusters: {len(hierarchical_clusters)}")
        print(f"🏷️ Technology clusters: {len(technology_clusters)}")
        print(f"💾 Clusters stored at s3://{PROCESSING_BUCKET}/{clusters_key}")
        
        return {
            'statusCode': 200,
            'project_id': PROJECT_ID,
            'clusters': all_clusters,
            'cluster_summary': clusters_data['cluster_summary'],
            'clusters_s3_key': clusters_key
        }
        
    except Exception as e:
        print(f"❌ Error generating clusters: {str(e)}")
        raise e

def generate_threshold_clusters(similarities: List[Dict], threshold: float = 0.7) -> List[Dict]:
    """Generate clusters based on similarity threshold"""
    print(f"🎯 Generating threshold-based clusters (threshold: {threshold})")
    
    # Build adjacency list of components above threshold
    adjacency = defaultdict(set)
    component_details = {}
    
    for sim in similarities:
        if sim['similarity_score'] >= threshold:
            comp1_id = f"{sim['component1']['applicationName']}#{sim['component1']['componentName']}"
            comp2_id = f"{sim['component2']['applicationName']}#{sim['component2']['componentName']}"
            
            adjacency[comp1_id].add(comp2_id)
            adjacency[comp2_id].add(comp1_id)
            
            component_details[comp1_id] = sim['component1']
            component_details[comp2_id] = sim['component2']
    
    # Find connected components using DFS
    visited = set()
    clusters = []
    
    for component_id in adjacency:
        if component_id not in visited:
            cluster_components = []
            dfs_cluster(component_id, adjacency, visited, cluster_components)
            
            if len(cluster_components) > 1:  # Only clusters with multiple components
                cluster = {
                    'id': f'threshold-cluster-{len(clusters) + 1}',
                    'name': f'Threshold Cluster {len(clusters) + 1}',
                    'type': 'threshold',
                    'threshold': threshold,
                    'component_count': len(cluster_components),
                    'components': [component_details.get(comp_id, {}) for comp_id in cluster_components],
                    'avg_similarity': calculate_cluster_avg_similarity(cluster_components, similarities)
                }
                clusters.append(cluster)
    
    # Sort by component count (largest first)
    clusters.sort(key=lambda x: x['component_count'], reverse=True)
    
    print(f"🎯 Generated {len(clusters)} threshold-based clusters")
    return clusters

def generate_hierarchical_clusters(similarities: List[Dict]) -> List[Dict]:
    """Generate hierarchical clusters using different similarity levels"""
    print(f"🌳 Generating hierarchical clusters")
    
    clusters = []
    thresholds = [0.9, 0.8, 0.7, 0.6, 0.5]
    
    for i, threshold in enumerate(thresholds):
        level_clusters = generate_threshold_clusters(similarities, threshold)
        
        for j, cluster in enumerate(level_clusters):
            hierarchical_cluster = {
                'id': f'hierarchical-{i}-{j}',
                'name': f'Level {i+1} Cluster {j+1}',
                'type': 'hierarchical',
                'level': i + 1,
                'threshold': threshold,
                'component_count': cluster['component_count'],
                'components': cluster['components'],
                'avg_similarity': cluster['avg_similarity']
            }
            clusters.append(hierarchical_cluster)
        
        # Only keep top 3 clusters per level to avoid explosion
        if len(level_clusters) > 3:
            break
    
    print(f"🌳 Generated {len(clusters)} hierarchical clusters")
    return clusters[:10]  # Limit to top 10

def generate_technology_clusters(similarities: List[Dict]) -> List[Dict]:
    """Generate clusters based on technology stack patterns"""
    print(f"🏷️ Generating technology-based clusters")
    
    # Group components by technology patterns
    runtime_groups = defaultdict(list)
    framework_groups = defaultdict(list)
    
    component_details = {}
    for sim in similarities:
        comp1 = sim['component1']
        comp2 = sim['component2']
        
        comp1_id = f"{comp1['applicationName']}#{comp1['componentName']}"
        comp2_id = f"{comp2['applicationName']}#{comp2['componentName']}"
        
        component_details[comp1_id] = comp1
        component_details[comp2_id] = comp2
        
        # Group by runtime
        if comp1.get('runtime'):
            runtime_groups[comp1['runtime']].append(comp1_id)
        if comp2.get('runtime'):
            runtime_groups[comp2['runtime']].append(comp2_id)
        
        # Group by framework
        if comp1.get('framework'):
            framework_groups[comp1['framework']].append(comp1_id)
        if comp2.get('framework'):
            framework_groups[comp2['framework']].append(comp2_id)
    
    clusters = []
    
    # Create runtime-based clusters
    for runtime, component_ids in runtime_groups.items():
        unique_components = list(set(component_ids))
        if len(unique_components) > 1:
            cluster = {
                'id': f'runtime-{len(clusters) + 1}',
                'name': f'Runtime: {runtime}',
                'type': 'technology',
                'technology_type': 'runtime',
                'technology_value': runtime,
                'component_count': len(unique_components),
                'components': [component_details.get(comp_id, {}) for comp_id in unique_components],
                'avg_similarity': calculate_cluster_avg_similarity(unique_components, similarities)
            }
            clusters.append(cluster)
    
    # Create framework-based clusters
    for framework, component_ids in framework_groups.items():
        unique_components = list(set(component_ids))
        if len(unique_components) > 1:
            cluster = {
                'id': f'framework-{len(clusters) + 1}',
                'name': f'Framework: {framework}',
                'type': 'technology',
                'technology_type': 'framework',
                'technology_value': framework,
                'component_count': len(unique_components),
                'components': [component_details.get(comp_id, {}) for comp_id in unique_components],
                'avg_similarity': calculate_cluster_avg_similarity(unique_components, similarities)
            }
            clusters.append(cluster)
    
    # Sort by component count
    clusters.sort(key=lambda x: x['component_count'], reverse=True)
    
    print(f"🏷️ Generated {len(clusters)} technology-based clusters")
    return clusters[:15]  # Limit to top 15

def dfs_cluster(component_id: str, adjacency: Dict, visited: Set, cluster_components: List):
    """Depth-first search to find connected components"""
    visited.add(component_id)
    cluster_components.append(component_id)
    
    for neighbor in adjacency[component_id]:
        if neighbor not in visited:
            dfs_cluster(neighbor, adjacency, visited, cluster_components)

def calculate_cluster_avg_similarity(component_ids: List[str], similarities: List[Dict]) -> float:
    """Calculate average similarity within a cluster"""
    if len(component_ids) < 2:
        return 1.0
    
    cluster_similarities = []
    component_id_set = set(component_ids)
    
    for sim in similarities:
        comp1_id = f"{sim['component1']['applicationName']}#{sim['component1']['componentName']}"
        comp2_id = f"{sim['component2']['applicationName']}#{sim['component2']['componentName']}"
        
        if comp1_id in component_id_set and comp2_id in component_id_set:
            cluster_similarities.append(sim['similarity_score'])
    
    return round(sum(cluster_similarities) / len(cluster_similarities), 4) if cluster_similarities else 0.0

def count_clustered_components(all_clusters: Dict) -> int:
    """Count total unique components across all cluster types"""
    all_component_ids = set()
    
    for cluster_type, clusters in all_clusters.items():
        for cluster in clusters:
            for component in cluster.get('components', []):
                comp_id = f"{component.get('applicationName', '')}#{component.get('componentName', '')}"
                all_component_ids.add(comp_id)
    
    return len(all_component_ids)
