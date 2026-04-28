"""
Component Similarity Store Results Lambda Function
Stores final analysis results and sends completion notifications
"""

import json
import os
import boto3
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Dict, Any, List

# Initialize AWS clients
s3 = boto3.client('s3')
sns = boto3.client('sns')
dynamodb = boto3.resource('dynamodb')

# Environment variables
S3_BUCKET = os.environ.get('S3_BUCKET', '')  # Optional for backward compatibility
DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']
CLUSTERS_TABLE = os.environ.get('CLUSTERS_TABLE', '')  # Optional for backward compatibility
PATTERNS_TABLE = os.environ.get('PATTERNS_TABLE', '')  # Optional for backward compatibility
SNS_TOPIC = os.environ['SNS_TOPIC']
PROJECT_ID = os.environ['PROJECT_ID']

def handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Store final component similarity analysis results
    """
    print(f"💾 Starting final results storage for project {PROJECT_ID}")
    
    try:
        # Extract patterns from previous step
        patterns = event.get('patterns', [])
        if not patterns and 'pattern_result' in event:
            pattern_result = event['pattern_result']
            if isinstance(pattern_result, dict):
                patterns = pattern_result.get('patterns', [])
        
        patterns_s3_key = event.get('patterns_s3_key', '')
        pattern_count = event.get('pattern_count', len(patterns))
        
        # Extract clusters from cluster generation step
        clusters = event.get('clusters', [])
        if not clusters and 'cluster_result' in event:
            cluster_result = event['cluster_result']
            if isinstance(cluster_result, dict):
                clusters = cluster_result.get('clusters', [])
        
        # Extract similarities from aggregate step - check S3 first
        similarities = []
        if 'aggregate_result' in event:
            aggregate_result = event['aggregate_result']
            if isinstance(aggregate_result, dict):
                aggregated_results_s3_key = aggregate_result.get('aggregated_results_s3_key', '')
                
                if aggregated_results_s3_key:
                    print(f"� Reading aggregated results from S3: {aggregated_results_s3_key}")
                    similarities = read_similarities_from_s3(aggregated_results_s3_key)
                else:
                    # Fallback to reading from event (backward compatibility)
                    print(f"⚠️  No S3 key found, reading from event (legacy mode)")
                    similarities = aggregate_result.get('similarities', [])
        
        print(f"📊 Storing {len(similarities)} similarities, {pattern_count} patterns, and {len(clusters)} clusters")
        
        # Create comprehensive analysis summary
        analysis_summary = create_analysis_summary(patterns, patterns_s3_key)
        
        # Store component similarity records in DynamoDB
        similarities_stored = store_similarities(similarities)
        
        # Store clusters in DynamoDB
        clusters_stored = store_clusters(clusters)
        
        # Store patterns in DynamoDB
        patterns_stored = store_patterns(patterns)
        
        # Send completion notification
        send_completion_notification(analysis_summary, clusters_stored)
        
        print(f"✅ Final results stored successfully")
        print(f"📊 Analysis complete: {similarities_stored} similarities, {pattern_count} patterns, {clusters_stored} clusters")
        
        return {
            'statusCode': 200,
            'message': 'Component similarity analysis completed successfully',
            'analysis_summary': analysis_summary,
            'similarities_stored': similarities_stored,
            'patterns_stored': patterns_stored,
            'clusters_stored': clusters_stored,
            'storage_location': 'dynamodb',
            'analysis_id': f"ANALYSIS_SUMMARY_{PROJECT_ID}",
            'project_id': PROJECT_ID
        }
        
    except Exception as e:
        print(f"❌ Error storing final results: {str(e)}")
        raise e

def create_analysis_summary(patterns: List[Dict[str, Any]], patterns_s3_key: str) -> Dict[str, Any]:
    """
    Create comprehensive analysis summary
    """
    # Calculate pattern statistics
    pattern_types = {}
    high_impact_patterns = 0
    total_affected_components = 0
    
    for pattern in patterns:
        pattern_type = pattern.get('pattern_type', 'unknown')
        pattern_types[pattern_type] = pattern_types.get(pattern_type, 0) + 1
        
        if pattern.get('modernization_impact') in ['high', 'very_high']:
            high_impact_patterns += 1
        
        total_affected_components += pattern.get('affected_components', 0)
    
    # Create modernization recommendations
    recommendations = generate_modernization_recommendations(patterns)
    
    return {
        'project_id': PROJECT_ID,
        'analysis_type': 'component_similarity',
        'analysis_status': 'completed',
        'completion_timestamp': context.aws_request_id if 'context' in locals() else '',
        'results_summary': {
            'total_patterns_found': len(patterns),
            'pattern_types_distribution': pattern_types,
            'high_impact_patterns': high_impact_patterns,
            'total_affected_components': total_affected_components,
            'patterns_s3_location': patterns_s3_key
        },
        'modernization_insights': {
            'recommendations': recommendations,
            'priority_actions': get_priority_actions(patterns),
            'estimated_consolidation_opportunities': calculate_consolidation_opportunities(patterns)
        },
        'next_steps': [
            'Review high-impact patterns for immediate consolidation opportunities',
            'Analyze cross-cutting applications for architectural improvements',
            'Consider microservice extraction for tightly coupled component clusters',
            'Evaluate duplicate components for potential elimination'
        ]
    }

def generate_modernization_recommendations(patterns: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Generate actionable modernization recommendations
    """
    recommendations = []
    
    # Group patterns by type for targeted recommendations
    pattern_groups = {}
    for pattern in patterns:
        pattern_type = pattern.get('pattern_type', 'unknown')
        if pattern_type not in pattern_groups:
            pattern_groups[pattern_type] = []
        pattern_groups[pattern_type].append(pattern)
    
    # Generate recommendations for each pattern type
    for pattern_type, type_patterns in pattern_groups.items():
        if pattern_type == 'cross_cutting_application':
            recommendations.extend(generate_cross_cutting_recommendations(type_patterns))
        elif pattern_type == 'cluster_size_distribution':
            recommendations.extend(generate_cluster_size_recommendations(type_patterns))
        elif pattern_type == 'similarity_strength_distribution':
            recommendations.extend(generate_strength_recommendations(type_patterns))
    
    # Sort by priority (impact score)
    recommendations.sort(key=lambda x: x.get('priority_score', 0), reverse=True)
    
    return recommendations[:10]  # Return top 10 recommendations

def generate_cross_cutting_recommendations(patterns: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Generate recommendations for cross-cutting application patterns"""
    recommendations = []
    
    for pattern in patterns:
        app_name = pattern.get('pattern_details', {}).get('application_name', 'Unknown')
        cluster_count = pattern.get('frequency', 0)
        component_count = pattern.get('affected_components', 0)
        
        recommendations.append({
            'recommendation_type': 'architectural_review',
            'title': f"Review Architecture for {app_name}",
            'description': f"Application '{app_name}' has components distributed across {cluster_count} similarity clusters, indicating potential architectural inconsistencies or shared library opportunities.",
            'priority': 'high' if cluster_count >= 5 else 'medium',
            'priority_score': cluster_count * component_count,
            'estimated_effort': 'medium',
            'potential_benefits': [
                'Improved architectural consistency',
                'Reduced code duplication',
                'Better separation of concerns'
            ],
            'action_items': [
                f"Conduct architectural review of {app_name}",
                'Identify shared components that could be extracted',
                'Consider creating shared libraries for common functionality'
            ]
        })
    
    return recommendations

def generate_cluster_size_recommendations(patterns: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Generate recommendations for cluster size patterns"""
    recommendations = []
    
    for pattern in patterns:
        category = pattern.get('pattern_details', {}).get('cluster_size_category', 'unknown')
        cluster_count = pattern.get('frequency', 0)
        
        if category == 'large':
            recommendations.append({
                'recommendation_type': 'decomposition',
                'title': 'Consider Decomposing Large Component Clusters',
                'description': f"Found {cluster_count} large component clusters that may indicate monolithic patterns or over-shared libraries.",
                'priority': 'high',
                'priority_score': cluster_count * 100,
                'estimated_effort': 'high',
                'potential_benefits': [
                    'Improved modularity',
                    'Better scalability',
                    'Reduced deployment coupling'
                ],
                'action_items': [
                    'Analyze large clusters for decomposition opportunities',
                    'Identify bounded contexts within large clusters',
                    'Plan gradual extraction of independent services'
                ]
            })
        elif category == 'small':
            recommendations.append({
                'recommendation_type': 'consolidation',
                'title': 'Evaluate Small Component Pairs for Consolidation',
                'description': f"Found {cluster_count} small component clusters that may represent tightly coupled pairs suitable for consolidation.",
                'priority': 'medium',
                'priority_score': cluster_count * 50,
                'estimated_effort': 'low',
                'potential_benefits': [
                    'Simplified architecture',
                    'Reduced operational overhead',
                    'Improved cohesion'
                ],
                'action_items': [
                    'Review small clusters for consolidation opportunities',
                    'Merge tightly coupled component pairs where appropriate',
                    'Simplify deployment and testing processes'
                ]
            })
    
    return recommendations

def generate_strength_recommendations(patterns: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Generate recommendations for similarity strength patterns"""
    recommendations = []
    
    for pattern in patterns:
        strength = pattern.get('pattern_details', {}).get('similarity_strength', 'unknown')
        cluster_count = pattern.get('frequency', 0)
        
        if strength == 'very_strong':
            recommendations.append({
                'recommendation_type': 'deduplication',
                'title': 'Eliminate Duplicate Components',
                'description': f"Found {cluster_count} clusters with very high similarity, indicating potential duplicate or near-duplicate components.",
                'priority': 'high',
                'priority_score': cluster_count * 80,
                'estimated_effort': 'medium',
                'potential_benefits': [
                    'Reduced maintenance overhead',
                    'Eliminated code duplication',
                    'Improved consistency'
                ],
                'action_items': [
                    'Identify and eliminate duplicate components',
                    'Consolidate similar functionality',
                    'Establish shared component libraries'
                ]
            })
    
    return recommendations

def get_priority_actions(patterns: List[Dict[str, Any]]) -> List[str]:
    """Get top priority actions based on pattern analysis"""
    actions = []
    
    # Count high-impact patterns by type
    high_impact_counts = {}
    for pattern in patterns:
        if pattern.get('modernization_impact') in ['high', 'very_high']:
            pattern_type = pattern.get('pattern_type', 'unknown')
            high_impact_counts[pattern_type] = high_impact_counts.get(pattern_type, 0) + 1
    
    # Generate priority actions
    if high_impact_counts.get('cross_cutting_application', 0) > 0:
        actions.append('Conduct architectural reviews for cross-cutting applications')
    
    if high_impact_counts.get('similarity_strength_distribution', 0) > 0:
        actions.append('Eliminate duplicate and near-duplicate components')
    
    if high_impact_counts.get('cluster_size_distribution', 0) > 0:
        actions.append('Evaluate large clusters for decomposition opportunities')
    
    return actions[:5]  # Return top 5 priority actions

def calculate_consolidation_opportunities(patterns: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Calculate estimated consolidation opportunities"""
    total_components = sum(p.get('affected_components', 0) for p in patterns)
    high_similarity_components = sum(
        p.get('affected_components', 0) for p in patterns 
        if p.get('pattern_details', {}).get('similarity_strength') in ['very_strong', 'strong']
    )
    
    estimated_reduction = min(high_similarity_components * 0.3, total_components * 0.2)  # Conservative estimate
    
    return {
        'total_components_analyzed': total_components,
        'high_similarity_components': high_similarity_components,
        'estimated_component_reduction': int(estimated_reduction),
        'estimated_reduction_percentage': round((estimated_reduction / total_components) * 100, 1) if total_components > 0 else 0
    }

def store_similarities(similarities: List[Dict[str, Any]]) -> int:
    """
    Store component similarity records to DynamoDB
    """
    if not similarities:
        print("⚠️  No similarities to store")
        return 0
    
    print(f"💾 Storing {len(similarities)} component similarities to DynamoDB table: {DYNAMODB_TABLE}")
    
    table = dynamodb.Table(DYNAMODB_TABLE)
    stored_count = 0
    failed_count = 0
    
    # Process in batches of 25 (DynamoDB batch write limit)
    batch_size = 25
    total_batches = (len(similarities) + batch_size - 1) // batch_size
    print(f"🔄 Will process {total_batches} batches of up to {batch_size} records each")
    
    try:
        for batch_num, i in enumerate(range(0, len(similarities), batch_size), 1):
            batch = similarities[i:i + batch_size]
            print(f"📦 Processing batch {batch_num}/{total_batches} with {len(batch)} records...")
            
            try:
                with table.batch_writer() as batch_writer:
                    for sim in batch:
                        try:
                            item = {
                                'component_id': sim['component_id'],
                                'similar_component_id': sim['similar_component_id'],
                                'similarity_score': Decimal(str(sim['similarity_score'])),
                                'component1_name': sim.get('component1_name', ''),
                                'component2_name': sim.get('component2_name', ''),
                                'application1': sim.get('application1', ''),
                                'application2': sim.get('application2', ''),
                                'project_id': sim['project_id'],
                                'created_at': datetime.utcnow().isoformat(),
                                'ttl': int((datetime.utcnow() + timedelta(days=90)).timestamp())
                            }
                            batch_writer.put_item(Item=item)
                            stored_count += 1
                        except Exception as record_error:
                            failed_count += 1
                            print(f"  ❌ Failed to store record: {str(record_error)}")
                            continue
                
                print(f"✅ Batch {batch_num} completed successfully")
                
            except Exception as batch_error:
                failed_count += len(batch)
                print(f"❌ Entire batch {batch_num} failed: {str(batch_error)}")
                continue
        
        print(f"🎯 SIMILARITY STORAGE SUMMARY:")
        print(f"   📊 Expected records: {len(similarities)}")
        print(f"   ✅ Successfully stored: {stored_count}")
        print(f"   ❌ Failed to store: {failed_count}")
        
    except Exception as e:
        print(f"❌ Error storing similarities: {str(e)}")
        return stored_count
    
    return stored_count

def store_patterns(patterns: List[Dict[str, Any]]) -> int:
    """
    Store pattern information to DynamoDB
    """
    if not patterns:
        print("⚠️  No patterns to store")
        return 0
    
    if not PATTERNS_TABLE:
        print("⚠️  PATTERNS_TABLE environment variable not set, skipping pattern storage")
        return 0
    
    print(f"💾 Storing {len(patterns)} patterns to DynamoDB table: {PATTERNS_TABLE}")
    
    table = dynamodb.Table(PATTERNS_TABLE)
    stored_count = 0
    failed_count = 0
    
    try:
        with table.batch_writer() as batch_writer:
            for pattern_num, pattern in enumerate(patterns, 1):
                try:
                    # Generate unique pattern_id
                    pattern_type = pattern.get('pattern_type', 'unknown')
                    pattern_id = f"{pattern_type}_{pattern_num}"
                    
                    item = {
                        'pattern_id': pattern_id,
                        'project_id': PROJECT_ID,
                        'pattern_type': pattern_type,
                        'frequency': pattern.get('frequency', 0),
                        'affected_components': pattern.get('affected_components', 0),
                        'modernization_impact': pattern.get('modernization_impact', 'low'),
                        'pattern_details': json.dumps(pattern.get('pattern_details', {})),
                        'description': pattern.get('description', ''),
                        'created_at': datetime.utcnow().isoformat(),
                        'ttl': int((datetime.utcnow() + timedelta(days=90)).timestamp())
                    }
                    batch_writer.put_item(Item=item)
                    stored_count += 1
                    print(f"  ✅ Stored pattern {pattern_id}")
                    
                except Exception as pattern_error:
                    failed_count += 1
                    print(f"  ❌ Failed to store pattern {pattern_num}: {str(pattern_error)}")
                    continue
        
        print(f"🎯 PATTERN STORAGE SUMMARY:")
        print(f"   📊 Expected patterns: {len(patterns)}")
        print(f"   ✅ Successfully stored: {stored_count}")
        print(f"   ❌ Failed to store: {failed_count}")
        
    except Exception as e:
        print(f"❌ Error storing patterns: {str(e)}")
        # Don't fail the function if pattern storage fails
        return 0
    
    return stored_count

def store_clusters(clusters: List[Dict[str, Any]]) -> int:
    """
    Store cluster information to DynamoDB
    """
    if not clusters:
        print("⚠️  No clusters to store")
        return 0
    
    if not CLUSTERS_TABLE:
        print("⚠️  CLUSTERS_TABLE environment variable not set, skipping cluster storage")
        return 0
    
    print(f"💾 Storing {len(clusters)} clusters to DynamoDB table: {CLUSTERS_TABLE}")
    
    table = dynamodb.Table(CLUSTERS_TABLE)
    stored_count = 0
    failed_count = 0
    
    try:
        with table.batch_writer() as batch_writer:
            for cluster_num, cluster in enumerate(clusters, 1):
                try:
                    cluster_id = cluster.get('cluster_id', cluster_num - 1)
                    
                    item = {
                        'cluster_id': str(cluster_id),
                        'project_id': PROJECT_ID,
                        'component_count': cluster.get('component_count', 0),
                        'application_count': cluster.get('application_count', 0),
                        'components': json.dumps(cluster.get('components', [])),
                        'dominant_applications': cluster.get('dominant_applications', []),
                        'average_similarity': Decimal(str(cluster.get('average_similarity', 0.0))),
                        'cluster_strength': cluster.get('cluster_strength', 'weak'),
                        'similarity_range': json.dumps(cluster.get('similarity_range', {})),
                        'created_at': datetime.utcnow().isoformat(),
                        'ttl': int((datetime.utcnow() + timedelta(days=90)).timestamp())
                    }
                    batch_writer.put_item(Item=item)
                    stored_count += 1
                    print(f"  ✅ Stored cluster {cluster_id} with {cluster.get('component_count', 0)} components")
                    
                except Exception as cluster_error:
                    failed_count += 1
                    print(f"  ❌ Failed to store cluster {cluster_num}: {str(cluster_error)}")
                    continue
        
        print(f"🎯 CLUSTER STORAGE SUMMARY:")
        print(f"   📊 Expected clusters: {len(clusters)}")
        print(f"   ✅ Successfully stored: {stored_count}")
        print(f"   ❌ Failed to store: {failed_count}")
        
    except Exception as e:
        print(f"❌ Error storing clusters: {str(e)}")
        # Don't fail the function if cluster storage fails
        return 0
    
    return stored_count

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

def send_completion_notification(analysis_summary: Dict[str, Any], clusters_stored: int = 0):
    """Send completion notification via SNS"""
    try:
        message = {
            'project_id': PROJECT_ID,
            'analysis_type': 'component_similarity',
            'status': 'completed',
            'summary': {
                'total_patterns': analysis_summary['results_summary']['total_patterns_found'],
                'high_impact_patterns': analysis_summary['results_summary']['high_impact_patterns'],
                'total_affected_components': analysis_summary['results_summary']['total_affected_components'],
                'estimated_reduction_percentage': analysis_summary['modernization_insights']['estimated_consolidation_opportunities']['estimated_reduction_percentage']
            },
            'timestamp': analysis_summary['completion_timestamp']
        }
        
        sns.publish(
            TopicArn=SNS_TOPIC,
            Message=json.dumps(message, indent=2),
            Subject=f'Component Similarity Analysis Complete - {PROJECT_ID}'
        )
        
        print(f"✅ Completion notification sent")
        
    except Exception as e:
        print(f"⚠️ Failed to send notification: {str(e)}")
        # Don't fail the function if notification fails