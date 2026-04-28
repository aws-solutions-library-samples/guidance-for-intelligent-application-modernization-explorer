"""
Process Small Dataset Lambda Function for Component Similarity Analysis
Handles datasets with less than 1000 components using direct processing
"""

import json
import os
import boto3
import math
from typing import Dict, Any, List
from decimal import Decimal

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')
sns = boto3.client('sns')

# Environment variables
COMPONENT_SIMILARITY_TABLE = os.environ['COMPONENT_SIMILARITY_TABLE']
PROCESSING_BUCKET = os.environ['PROCESSING_BUCKET']
NOTIFICATION_TOPIC = os.environ['NOTIFICATION_TOPIC']
PROJECT_ID = os.environ['PROJECT_ID']

def handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Process small component datasets (< 1000 components) directly
    """
    print(f"🔧 Processing small component dataset for project {PROJECT_ID}")
    
    try:
        # Extract data from Athena query result
        athena_result = event.get('athena_result', {})
        project_id = event.get('projectId', PROJECT_ID)
        filters = event.get('filters', {})
        
        print(f"🔍 Processing filters: {filters}")
        
        # Parse the JSON body from Athena result
        if 'body' in athena_result:
            try:
                body_data = json.loads(athena_result['body'])
                components = body_data.get('data', [])
            except json.JSONDecodeError as e:
                print(f"❌ Failed to parse Athena result body: {e}")
                return {
                    'statusCode': 400,
                    'error': f'Failed to parse Athena result: {str(e)}'
                }
        else:
            components = event.get('data', [])
        
        total_components = len(components)
        print(f"📊 Processing {total_components} components directly")
        
        if total_components == 0:
            print("⚠️ No components to process")
            return {
                'statusCode': 200,
                'totalComponents': 0,
                'similarPairs': 0,
                'clusters': [],
                'repeatedPatterns': [],
                'message': 'No components found for analysis'
            }
        
        # Apply filters to components
        filtered_components = apply_filters(components, filters)
        print(f"📋 After filtering: {len(filtered_components)} components")
        
        # Calculate similarity matrix
        similarity_matrix, avg_similarity = calculate_similarity_matrix(filtered_components, filters)
        
        # Find similar pairs above threshold
        threshold = filters.get('minSimilarityScore', 0.7)
        similar_pairs = count_similar_pairs(similarity_matrix, threshold)
        
        # Generate clusters
        clusters = generate_clusters(filtered_components, similarity_matrix, threshold)
        
        # Find repeated patterns
        repeated_patterns = find_repeated_patterns(filtered_components)
        
        # Store results in DynamoDB
        stored_count = store_similarity_results(similarity_matrix, filtered_components)
        
        # Send completion notification
        send_completion_notification(project_id, {
            'totalComponents': len(filtered_components),
            'similarPairs': similar_pairs,
            'clusters': len(clusters),
            'patterns': len(repeated_patterns)
        })
        
        result = {
            'statusCode': 200,
            'totalComponents': len(filtered_components),
            'similarPairs': similar_pairs,
            'avgSimilarityScore': avg_similarity,
            'clusters': clusters,
            'repeatedPatterns': repeated_patterns,
            'storedRecords': stored_count,
            'analysisTimestamp': context.aws_request_id,
            'projectId': project_id
        }
        
        print(f"✅ Small dataset processing completed successfully")
        print(f"📊 Results: {len(filtered_components)} components, {similar_pairs} similar pairs, {len(clusters)} clusters")
        
        return result
        
    except Exception as e:
        print(f"❌ Error processing small dataset: {str(e)}")
        raise e

def apply_filters(components: List[Dict], filters: Dict) -> List[Dict]:
    """Apply analysis filters to component data"""
    filtered = components
    
    # Filter by application if specified
    if filters.get('applicationFilter') and filters['applicationFilter'] != 'all':
        filtered = [c for c in filtered if c.get('applicationname') == filters['applicationFilter']]
    
    # Filter by component type if specified
    if filters.get('componentTypeFilter') and filters['componentTypeFilter'] != 'all':
        filtered = [c for c in filtered if c.get('runtime') == filters['componentTypeFilter']]
    
    return filtered

def calculate_similarity_matrix(components: List[Dict], filters: Dict) -> tuple:
    """Calculate similarity matrix between all components"""
    n = len(components)
    similarity_matrix = [[0.0 for _ in range(n)] for _ in range(n)]
    total_similarity = 0.0
    pair_count = 0
    
    # Create weights based on filters
    weights = {
        'runtime': 0.25 if filters.get('includeRuntimes', True) else 0,
        'framework': 0.25 if filters.get('includeFrameworks', True) else 0,
        'databases': 0.20 if filters.get('includeDatabases', True) else 0,
        'integrations': 0.15 if filters.get('includeIntegrations', True) else 0,
        'storages': 0.15 if filters.get('includeStorages', True) else 0
    }
    
    for i in range(n):
        for j in range(n):
            if i == j:
                similarity_matrix[i][j] = 1.0
            else:
                similarity = calculate_component_similarity(components[i], components[j], weights)
                similarity_matrix[i][j] = similarity
                
                if i < j:  # Count each pair only once
                    total_similarity += similarity
                    pair_count += 1
    
    avg_similarity = total_similarity / pair_count if pair_count > 0 else 0.0
    return similarity_matrix, avg_similarity

def calculate_component_similarity(comp1: Dict, comp2: Dict, weights: Dict) -> float:
    """Calculate weighted similarity between two components"""
    total_score = 0.0
    total_weight = 0.0
    
    # Runtime similarity (exact match)
    if weights['runtime'] > 0:
        runtime_score = 1.0 if comp1.get('runtime') == comp2.get('runtime') else 0.0
        total_score += runtime_score * weights['runtime']
        total_weight += weights['runtime']
    
    # Framework similarity (exact match)
    if weights['framework'] > 0:
        framework_score = 1.0 if comp1.get('framework') == comp2.get('framework') else 0.0
        total_score += framework_score * weights['framework']
        total_weight += weights['framework']
    
    # Database similarity (Jaccard similarity)
    if weights['databases'] > 0:
        db_score = jaccard_similarity(
            parse_tech_list(comp1.get('databases', '')),
            parse_tech_list(comp2.get('databases', ''))
        )
        total_score += db_score * weights['databases']
        total_weight += weights['databases']
    
    # Integration similarity (Jaccard similarity)
    if weights['integrations'] > 0:
        int_score = jaccard_similarity(
            parse_tech_list(comp1.get('integrations', '')),
            parse_tech_list(comp2.get('integrations', ''))
        )
        total_score += int_score * weights['integrations']
        total_weight += weights['integrations']
    
    # Storage similarity (Jaccard similarity)
    if weights['storages'] > 0:
        stor_score = jaccard_similarity(
            parse_tech_list(comp1.get('storages', '')),
            parse_tech_list(comp2.get('storages', ''))
        )
        total_score += stor_score * weights['storages']
        total_weight += weights['storages']
    
    return total_score / total_weight if total_weight > 0 else 0.0

def parse_tech_list(tech_string: str) -> set:
    """Parse comma-separated technology string into set"""
    if not tech_string or tech_string.strip() == '':
        return set()
    
    technologies = set()
    for tech in tech_string.split(','):
        tech = tech.strip().lower()
        if tech and tech != 'null' and tech != 'none':
            technologies.add(tech)
    
    return technologies

def jaccard_similarity(set1: set, set2: set) -> float:
    """Calculate Jaccard similarity between two sets"""
    if len(set1) == 0 and len(set2) == 0:
        return 1.0
    
    intersection = len(set1.intersection(set2))
    union = len(set1.union(set2))
    
    return intersection / union if union > 0 else 0.0

def count_similar_pairs(similarity_matrix: List[List[float]], threshold: float) -> int:
    """Count pairs above similarity threshold"""
    count = 0
    n = len(similarity_matrix)
    
    for i in range(n):
        for j in range(i + 1, n):
            if similarity_matrix[i][j] >= threshold:
                count += 1
    
    return count

def generate_clusters(components: List[Dict], similarity_matrix: List[List[float]], threshold: float) -> List[Dict]:
    """Generate component clusters based on similarity threshold"""
    n = len(components)
    visited = set()
    clusters = []
    
    for i in range(n):
        if i in visited:
            continue
        
        cluster = {
            'id': f'cluster-{len(clusters) + 1}',
            'name': f'Cluster {len(clusters) + 1}',
            'components': [components[i]],
            'avgSimilarity': 0.0
        }
        
        visited.add(i)
        total_similarity = 0.0
        pair_count = 0
        
        # Find similar components
        for j in range(n):
            if i != j and j not in visited and similarity_matrix[i][j] >= threshold:
                cluster['components'].append(components[j])
                visited.add(j)
                total_similarity += similarity_matrix[i][j]
                pair_count += 1
        
        cluster['avgSimilarity'] = total_similarity / pair_count if pair_count > 0 else 1.0
        
        # Only add clusters with more than one component
        if len(cluster['components']) > 1:
            clusters.append(cluster)
    
    return sorted(clusters, key=lambda x: len(x['components']), reverse=True)

def find_repeated_patterns(components: List[Dict]) -> List[Dict]:
    """Find repeated technology patterns across components"""
    patterns = {}
    
    for component in components:
        # Create pattern signature
        pattern = {
            'runtime': component.get('runtime', ''),
            'framework': component.get('framework', ''),
            'databases': sorted(parse_tech_list(component.get('databases', ''))),
            'integrations': sorted(parse_tech_list(component.get('integrations', ''))),
            'storages': sorted(parse_tech_list(component.get('storages', '')))
        }
        
        pattern_key = json.dumps(pattern, sort_keys=True)
        
        if pattern_key in patterns:
            patterns[pattern_key]['components'].append({
                'applicationName': component.get('applicationname', ''),
                'componentName': component.get('componentname', ''),
                'id': component.get('id', '')
            })
            patterns[pattern_key]['frequency'] += 1
        else:
            patterns[pattern_key] = {
                'pattern': pattern,
                'frequency': 1,
                'components': [{
                    'applicationName': component.get('applicationname', ''),
                    'componentName': component.get('componentname', ''),
                    'id': component.get('id', '')
                }]
            }
    
    # Filter patterns that appear more than once
    repeated = []
    for i, (pattern_key, pattern_data) in enumerate(patterns.items()):
        if pattern_data['frequency'] > 1:
            repeated.append({
                'id': f'pattern-{i + 1}',
                'patternName': f'Pattern {i + 1}',
                **pattern_data
            })
    
    return sorted(repeated, key=lambda x: x['frequency'], reverse=True)

def store_similarity_results(similarity_matrix: List[List[float]], components: List[Dict]) -> int:
    """Store similarity results in DynamoDB"""
    table = dynamodb.Table(COMPONENT_SIMILARITY_TABLE)
    stored_count = 0
    
    # Store only meaningful similarities (> 0.1)
    with table.batch_writer() as batch:
        for i in range(len(components)):
            for j in range(i + 1, len(components)):
                similarity = similarity_matrix[i][j]
                
                if similarity > 0.1:
                    item = {
                        'component_id': f"{components[i].get('applicationname', '')}#{components[i].get('componentname', '')}",
                        'similar_component_id': f"{components[j].get('applicationname', '')}#{components[j].get('componentname', '')}",
                        'similarity_score': Decimal(str(round(similarity, 4))),
                        'project_id': PROJECT_ID,
                        'ttl': int(context.aws_request_id if 'context' in locals() else 0) + 86400 * 30  # 30 days TTL
                    }
                    
                    batch.put_item(Item=item)
                    stored_count += 1
    
    return stored_count

def send_completion_notification(project_id: str, results: Dict):
    """Send completion notification via SNS"""
    try:
        message = {
            'projectId': project_id,
            'analysisType': 'component-similarity',
            'status': 'completed',
            'results': results,
            'timestamp': context.aws_request_id if 'context' in locals() else ''
        }
        
        sns.publish(
            TopicArn=NOTIFICATION_TOPIC,
            Message=json.dumps(message),
            Subject=f'Component Similarity Analysis Complete - {project_id}'
        )
        
        print(f"📧 Completion notification sent for project {project_id}")
        
    except Exception as e:
        print(f"⚠️ Failed to send completion notification: {e}")
        # Don't fail the entire process if notification fails
