"""
Component Similarity Process Small Dataset Lambda Function
Handles component similarity analysis for datasets with < 1000 components
"""

import json
import os
import boto3
from typing import Dict, Any, List
from decimal import Decimal
from collections import defaultdict
import itertools

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')
sns = boto3.client('sns')

# Environment variables
DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']
S3_BUCKET = os.environ['S3_BUCKET']
SNS_TOPIC = os.environ['SNS_TOPIC']
PROJECT_ID = os.environ['PROJECT_ID']

# Component similarity weights
COMPONENT_WEIGHTS = {
    'runtime': 0.35,      # 35% - Runtime environment
    'framework': 0.30,    # 30% - Framework
    'databases': 0.20,    # 20% - Database technologies
    'integrations': 0.10, # 10% - Integration points
    'storages': 0.05      # 5% - Storage solutions
}

def handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Process small component dataset and calculate similarities
    """
    print(f"🔧 Processing small component dataset for project {PROJECT_ID}")
    
    try:
        # Extract component data from Athena results
        athena_data = event.get('athena_data', {})
        components_data = athena_data.get('data', [])
        
        print(f"📊 Processing {len(components_data)} components")
        
        if len(components_data) == 0:
            return {
                'statusCode': 200,
                'message': 'No components to process',
                'totalComponents': 0,
                'similarPairs': 0,
                'clusters': [],
                'repeatedPatterns': []
            }
        
        # Calculate component similarities
        similarities = calculate_component_similarities(components_data)
        
        # Generate component clusters
        clusters = generate_component_clusters(components_data, similarities, 0.7)
        
        # Find repeated patterns
        patterns = find_repeated_patterns(components_data)
        
        # Store results in DynamoDB
        stored_count = store_similarity_results(similarities)
        
        # Send completion notification
        send_completion_notification(len(components_data), len(similarities), len(clusters))
        
        print(f"✅ Small dataset processing completed successfully")
        print(f"📊 Processed {len(components_data)} components")
        print(f"🔗 Found {len(similarities)} similar pairs")
        print(f"🎯 Generated {len(clusters)} clusters")
        print(f"💾 Results stored in DynamoDB: {stored_count} records")
        
        # Return lightweight summary (no S3 reference)
        return {
            'statusCode': 200,
            'message': 'Component similarity analysis completed successfully',
            'totalComponents': len(components_data),
            'similarPairs': len(similarities),
            'storedRecords': stored_count,
            'clustersCount': len(clusters),
            'patternsCount': len(patterns),
            'projectId': PROJECT_ID
        }
        
    except Exception as e:
        print(f"❌ Error processing small dataset: {str(e)}")
        raise e

def calculate_component_similarities(components: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Calculate similarities between all component pairs
    """
    similarities = []
    
    for i, comp1 in enumerate(components):
        for j, comp2 in enumerate(components[i + 1:], i + 1):
            similarity_score = calculate_component_similarity(comp1, comp2)
            
            if similarity_score > 0.3:  # Only store meaningful similarities
                similarities.append({
                    'component_id': comp1.get('id', f"comp_{i}"),
                    'similar_component_id': comp2.get('id', f"comp_{j}"),
                    'similarity_score': similarity_score,
                    'component1_name': comp1.get('componentname', ''),
                    'component2_name': comp2.get('componentname', ''),
                    'application1': comp1.get('applicationname', ''),
                    'application2': comp2.get('applicationname', ''),
                    'project_id': PROJECT_ID
                })
    
    return similarities

def calculate_component_similarity(comp1: Dict[str, Any], comp2: Dict[str, Any]) -> float:
    """
    Calculate weighted Jaccard similarity between two components
    """
    total_score = 0.0
    
    for field, weight in COMPONENT_WEIGHTS.items():
        set1 = set(parse_technologies(comp1.get(field, '')))
        set2 = set(parse_technologies(comp2.get(field, '')))
        
        if len(set1) == 0 and len(set2) == 0:
            jaccard_score = 1.0
        elif len(set1) == 0 or len(set2) == 0:
            jaccard_score = 0.0
        else:
            intersection = len(set1.intersection(set2))
            union = len(set1.union(set2))
            jaccard_score = intersection / union if union > 0 else 0.0
        
        total_score += jaccard_score * weight
    
    return round(total_score, 4)

def parse_technologies(tech_string: str) -> List[str]:
    """
    Parse comma-separated technology string
    """
    if not tech_string or tech_string.strip() == '':
        return []
    
    technologies = []
    for tech in tech_string.split(','):
        tech = tech.strip().lower()
        if tech and tech not in ['null', 'none', '']:
            technologies.append(tech)
    
    return technologies

def generate_component_clusters(components: List[Dict[str, Any]], similarities: List[Dict[str, Any]], threshold: float) -> List[Dict[str, Any]]:
    """
    Generate component clusters using similarity threshold
    """
    # Create adjacency list for components above threshold
    adjacency = defaultdict(set)
    comp_lookup = {comp.get('id', f"comp_{i}"): comp for i, comp in enumerate(components)}
    
    for sim in similarities:
        if sim['similarity_score'] >= threshold:
            comp1_id = sim['component_id']
            comp2_id = sim['similar_component_id']
            adjacency[comp1_id].add(comp2_id)
            adjacency[comp2_id].add(comp1_id)
    
    # Find connected components using DFS
    visited = set()
    clusters = []
    
    def dfs(node, cluster):
        if node in visited:
            return
        visited.add(node)
        cluster.append(node)
        for neighbor in adjacency[node]:
            dfs(neighbor, cluster)
    
    for comp in components:
        comp_id = comp.get('id', '')
        if comp_id not in visited:
            cluster = []
            dfs(comp_id, cluster)
            if len(cluster) > 1:  # Only include clusters with multiple components
                # Convert component IDs to full component objects
                cluster_components = []
                for comp_id in cluster:
                    comp = comp_lookup.get(comp_id, {})
                    cluster_components.append({
                        'componentId': comp_id,
                        'componentName': comp.get('componentname', ''),
                        'applicationName': comp.get('applicationname', ''),
                        'runtime': comp.get('runtime', ''),
                        'framework': comp.get('framework', ''),
                        'databases': comp.get('databases', []) if isinstance(comp.get('databases'), list) else [],
                        'integrations': comp.get('integrations', []) if isinstance(comp.get('integrations'), list) else [],
                        'storage': comp.get('storage', []) if isinstance(comp.get('storage'), list) else []
                    })
                
                clusters.append({
                    'cluster_id': len(clusters),
                    'component_count': len(cluster),
                    'components': cluster_components,
                    'avg_similarity': calculate_cluster_avg_similarity(cluster, similarities)
                })
    
    return clusters

def calculate_cluster_avg_similarity(cluster_components: List[str], similarities: List[Dict[str, Any]]) -> float:
    """
    Calculate average similarity within a cluster
    """
    cluster_sims = []
    for sim in similarities:
        if (sim['component_id'] in cluster_components and 
            sim['similar_component_id'] in cluster_components):
            cluster_sims.append(sim['similarity_score'])
    
    return round(sum(cluster_sims) / len(cluster_sims), 4) if cluster_sims else 0.0

def find_repeated_patterns(components: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Find repeated technology patterns across components
    """
    patterns = defaultdict(list)
    
    for comp in components:
        # Create pattern signature
        runtime = comp.get('runtime', '').lower().strip()
        framework = comp.get('framework', '').lower().strip()
        databases = comp.get('databases', []) if isinstance(comp.get('databases'), list) else []
        integrations = comp.get('integrations', []) if isinstance(comp.get('integrations'), list) else []
        storage = comp.get('storage', []) if isinstance(comp.get('storage'), list) else []
        
        if runtime and framework:
            pattern_key = f"{runtime}+{framework}"
            patterns[pattern_key].append({
                'component_id': comp.get('id', ''),
                'component_name': comp.get('componentname', ''),
                'application': comp.get('applicationname', ''),
                'runtime': runtime,
                'framework': framework,
                'databases': databases,
                'integrations': integrations,
                'storage': storage
            })
    
    # Filter patterns that appear multiple times
    repeated_patterns = []
    for pattern_key, components_list in patterns.items():
        if len(components_list) >= 2:
            # Parse pattern key
            runtime, framework = pattern_key.split('+', 1)
            
            # Get common technologies across components in this pattern
            all_databases = set()
            all_integrations = set()
            all_storage = set()
            all_applications = set()
            
            for comp in components_list:
                all_databases.update(comp.get('databases', []))
                all_integrations.update(comp.get('integrations', []))
                all_storage.update(comp.get('storage', []))
                all_applications.add(comp.get('application', ''))
            
            repeated_patterns.append({
                'patternName': f"{runtime.title()} + {framework.title()}",
                'frequency': len(components_list),
                'pattern': {
                    'runtime': runtime,
                    'framework': framework,
                    'databases': list(all_databases),
                    'integrations': list(all_integrations),
                    'storage': list(all_storage)
                },
                'applications': len(all_applications),
                'components': components_list
            })
    
    # Sort by frequency
    repeated_patterns.sort(key=lambda x: x['frequency'], reverse=True)
    
    return repeated_patterns[:10]  # Return top 10 patterns

def format_similarity_matrix(components: List[Dict[str, Any]], similarities: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Format similarity data as matrix for React component
    """
    # Create component lookup
    comp_lookup = {comp.get('id', f"comp_{i}"): comp for i, comp in enumerate(components)}
    
    # Create similarity lookup for quick access
    sim_lookup = {}
    for sim in similarities:
        key1 = f"{sim['component_id']}_{sim['similar_component_id']}"
        key2 = f"{sim['similar_component_id']}_{sim['component_id']}"
        sim_lookup[key1] = sim['similarity_score']
        sim_lookup[key2] = sim['similarity_score']
    
    # Build matrix data
    matrix_data = []
    for i, comp1 in enumerate(components):
        comp1_id = comp1.get('id', f"comp_{i}")
        row_data = {
            'componentId': comp1_id,
            'componentName': comp1.get('componentname', ''),
            'application': comp1.get('applicationname', ''),
            'similarities': []
        }
        
        for j, comp2 in enumerate(components):
            comp2_id = comp2.get('id', f"comp_{j}")
            
            if comp1_id == comp2_id:
                similarity_score = 1.0  # Self-similarity
            else:
                key = f"{comp1_id}_{comp2_id}"
                similarity_score = sim_lookup.get(key, 0.0)
            
            row_data['similarities'].append({
                'targetComponentId': comp2_id,
                'targetComponentName': comp2.get('componentname', ''),
                'targetApplication': comp2.get('applicationname', ''),
                'score': similarity_score
            })
        
        matrix_data.append(row_data)
    
    return matrix_data

def store_similarity_results(similarities: List[Dict[str, Any]]) -> int:
    """
    Store similarity results in DynamoDB
    """
    if not similarities:
        return 0
    
    table = dynamodb.Table(DYNAMODB_TABLE)
    stored_count = 0
    
    # Process in batches of 25
    batch_size = 25
    for i in range(0, len(similarities), batch_size):
        batch = similarities[i:i + batch_size]
        
        with table.batch_writer() as batch_writer:
            for sim in batch:
                item = {
                    'component_id': sim['component_id'],
                    'similar_component_id': sim['similar_component_id'],
                    'similarity_score': Decimal(str(sim['similarity_score'])),
                    'component1_name': sim['component1_name'],
                    'component2_name': sim['component2_name'],
                    'application1': sim['application1'],
                    'application2': sim['application2'],
                    'project_id': sim['project_id'],
                    'ttl': int(context.aws_request_id if 'context' in locals() else 0) + 86400 * 30
                }
                batch_writer.put_item(Item=item)
                stored_count += 1
    
    return stored_count

def send_completion_notification(total_components: int, similar_pairs: int, clusters: int):
    """
    Send completion notification via SNS
    """
    try:
        message = {
            'project_id': PROJECT_ID,
            'analysis_type': 'component-similarity',
            'status': 'completed',
            'total_components': total_components,
            'similar_pairs': similar_pairs,
            'clusters': clusters,
            'timestamp': context.aws_request_id if 'context' in locals() else ''
        }
        
        sns.publish(
            TopicArn=SNS_TOPIC,
            Message=json.dumps(message),
            Subject=f'Component Similarity Analysis Complete - {PROJECT_ID}'
        )
    except Exception as e:
        print(f"⚠️ Failed to send notification: {str(e)}")