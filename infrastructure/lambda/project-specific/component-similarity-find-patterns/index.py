"""
Component Similarity Find Patterns Lambda Function
Identifies repeated technology patterns across components
"""

import json
import os
import boto3
from typing import Dict, Any, List
from collections import defaultdict, Counter

# Initialize AWS clients
s3 = boto3.client('s3')

# Environment variables
DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']
S3_BUCKET = os.environ['S3_BUCKET']
PROJECT_ID = os.environ['PROJECT_ID']

# Pattern analysis configuration
MIN_PATTERN_FREQUENCY = 2  # Minimum occurrences to be considered a pattern
MAX_PATTERNS_TO_RETURN = 20  # Maximum number of patterns to return

def handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Find repeated technology patterns across components
    """
    print(f"🔍 Starting pattern analysis for project {PROJECT_ID}")
    
    try:
        # Extract clusters from previous step
        clusters = event.get('clusters', [])
        clusters_s3_key = event.get('clusters_s3_key', '')
        
        print(f"📊 Analyzing patterns from {len(clusters)} clusters")
        
        # If we have an S3 key, read full cluster data
        if clusters_s3_key and not clusters:
            clusters = read_clusters_from_s3(clusters_s3_key)
        
        if not clusters:
            print("⚠️ No clusters to analyze for patterns")
            return {
                'statusCode': 200,
                'patterns': [],
                'pattern_count': 0,
                'project_id': PROJECT_ID
            }
        
        # Analyze patterns from clusters
        patterns = analyze_technology_patterns(clusters)
        
        # Store patterns in S3 for next step
        patterns_s3_key = f"component-patterns/{PROJECT_ID}/patterns.json"
        store_patterns_in_s3(patterns_s3_key, patterns)
        
        print(f"✅ Found {len(patterns)} repeated patterns")
        print(f"💾 Patterns stored at: {patterns_s3_key}")
        
        return {
            'statusCode': 200,
            'patterns': patterns,
            'pattern_count': len(patterns),
            'patterns_s3_key': patterns_s3_key,
            'project_id': PROJECT_ID
        }
        
    except Exception as e:
        print(f"❌ Error finding patterns: {str(e)}")
        raise e

def read_clusters_from_s3(s3_key: str) -> List[Dict[str, Any]]:
    """
    Read cluster data from S3
    """
    try:
        response = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
        data_content = response['Body'].read().decode('utf-8')
        cluster_data = json.loads(data_content)
        
        clusters = cluster_data.get('clusters', [])
        print(f"📥 Read {len(clusters)} clusters from S3")
        
        return clusters
        
    except Exception as e:
        print(f"❌ Error reading clusters from S3: {str(e)}")
        return []

def analyze_technology_patterns(clusters: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Analyze technology patterns from component clusters
    """
    patterns = []
    
    # Pattern 1: Application-based patterns
    app_patterns = analyze_application_patterns(clusters)
    patterns.extend(app_patterns)
    
    # Pattern 2: Cluster size patterns
    size_patterns = analyze_cluster_size_patterns(clusters)
    patterns.extend(size_patterns)
    
    # Pattern 3: Similarity strength patterns
    strength_patterns = analyze_similarity_strength_patterns(clusters)
    patterns.extend(strength_patterns)
    
    # Sort patterns by significance (frequency * impact)
    patterns.sort(key=lambda x: x.get('significance_score', 0), reverse=True)
    
    # Return top patterns
    return patterns[:MAX_PATTERNS_TO_RETURN]

def analyze_application_patterns(clusters: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Analyze patterns based on application distribution in clusters
    """
    patterns = []
    
    # Count applications across clusters
    app_cluster_count = defaultdict(int)
    app_component_count = defaultdict(int)
    
    for cluster in clusters:
        dominant_apps = cluster.get('dominant_applications', [])
        for app in dominant_apps:
            app_cluster_count[app] += 1
            app_component_count[app] += cluster.get('component_count', 0)
    
    # Find applications that appear in multiple clusters (cross-cutting patterns)
    for app, cluster_count in app_cluster_count.items():
        if cluster_count >= MIN_PATTERN_FREQUENCY:
            patterns.append({
                'pattern_type': 'cross_cutting_application',
                'pattern_name': f"Cross-cutting Application: {app}",
                'description': f"Application '{app}' has components that cluster with components from other applications",
                'frequency': cluster_count,
                'affected_components': app_component_count[app],
                'pattern_details': {
                    'application_name': app,
                    'clusters_involved': cluster_count,
                    'total_components': app_component_count[app]
                },
                'significance_score': cluster_count * app_component_count[app],
                'modernization_impact': 'high' if cluster_count >= 5 else 'medium'
            })
    
    return patterns

def analyze_cluster_size_patterns(clusters: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Analyze patterns based on cluster sizes
    """
    patterns = []
    
    # Categorize clusters by size
    size_categories = {
        'small': [],   # 2-5 components
        'medium': [],  # 6-15 components
        'large': [],   # 16+ components
    }
    
    for cluster in clusters:
        component_count = cluster.get('component_count', 0)
        if component_count <= 5:
            size_categories['small'].append(cluster)
        elif component_count <= 15:
            size_categories['medium'].append(cluster)
        else:
            size_categories['large'].append(cluster)
    
    # Analyze each category
    for category, category_clusters in size_categories.items():
        if len(category_clusters) >= MIN_PATTERN_FREQUENCY:
            total_components = sum(c.get('component_count', 0) for c in category_clusters)
            avg_similarity = sum(c.get('average_similarity', 0) for c in category_clusters) / len(category_clusters)
            
            patterns.append({
                'pattern_type': 'cluster_size_distribution',
                'pattern_name': f"{category.title()} Component Clusters",
                'description': f"Multiple {category} clusters indicate {get_size_pattern_insight(category)}",
                'frequency': len(category_clusters),
                'affected_components': total_components,
                'pattern_details': {
                    'cluster_size_category': category,
                    'cluster_count': len(category_clusters),
                    'average_similarity': round(avg_similarity, 4),
                    'total_components': total_components
                },
                'significance_score': len(category_clusters) * total_components * 0.1,
                'modernization_impact': get_size_modernization_impact(category)
            })
    
    return patterns

def analyze_similarity_strength_patterns(clusters: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Analyze patterns based on similarity strength distribution
    """
    patterns = []
    
    # Group clusters by strength
    strength_groups = defaultdict(list)
    for cluster in clusters:
        strength = cluster.get('cluster_strength', 'weak')
        strength_groups[strength].append(cluster)
    
    # Analyze each strength group
    for strength, strength_clusters in strength_groups.items():
        if len(strength_clusters) >= MIN_PATTERN_FREQUENCY:
            total_components = sum(c.get('component_count', 0) for c in strength_clusters)
            
            patterns.append({
                'pattern_type': 'similarity_strength_distribution',
                'pattern_name': f"{strength.replace('_', ' ').title()} Similarity Clusters",
                'description': f"Multiple {strength} similarity clusters indicate {get_strength_pattern_insight(strength)}",
                'frequency': len(strength_clusters),
                'affected_components': total_components,
                'pattern_details': {
                    'similarity_strength': strength,
                    'cluster_count': len(strength_clusters),
                    'total_components': total_components,
                    'avg_cluster_size': round(total_components / len(strength_clusters), 1)
                },
                'significance_score': len(strength_clusters) * total_components * get_strength_multiplier(strength),
                'modernization_impact': get_strength_modernization_impact(strength)
            })
    
    return patterns

def get_size_pattern_insight(category: str) -> str:
    """Get insight text for cluster size patterns"""
    insights = {
        'small': 'tightly coupled component pairs that could be good candidates for microservice extraction',
        'medium': 'moderate-sized component groups that may represent logical service boundaries',
        'large': 'extensive component similarity suggesting potential monolithic patterns or shared libraries'
    }
    return insights.get(category, 'unknown pattern characteristics')

def get_size_modernization_impact(category: str) -> str:
    """Get modernization impact for cluster size patterns"""
    impacts = {
        'small': 'medium',
        'medium': 'high',
        'large': 'very_high'
    }
    return impacts.get(category, 'low')

def get_strength_pattern_insight(strength: str) -> str:
    """Get insight text for similarity strength patterns"""
    insights = {
        'very_strong': 'highly similar components that are likely duplicates or near-duplicates',
        'strong': 'components with significant overlap that could benefit from consolidation',
        'moderate': 'components with some commonalities that might share architectural patterns',
        'weak': 'loosely related components that may have minimal consolidation opportunities'
    }
    return insights.get(strength, 'unknown similarity characteristics')

def get_strength_multiplier(strength: str) -> float:
    """Get significance multiplier for similarity strength"""
    multipliers = {
        'very_strong': 1.0,
        'strong': 0.8,
        'moderate': 0.6,
        'weak': 0.3
    }
    return multipliers.get(strength, 0.1)

def get_strength_modernization_impact(strength: str) -> str:
    """Get modernization impact for similarity strength patterns"""
    impacts = {
        'very_strong': 'very_high',
        'strong': 'high',
        'moderate': 'medium',
        'weak': 'low'
    }
    return impacts.get(strength, 'low')

def store_patterns_in_s3(s3_key: str, patterns: List[Dict[str, Any]]):
    """
    Store pattern analysis results in S3
    """
    try:
        pattern_data = {
            'patterns': patterns,
            'pattern_summary': {
                'total_patterns': len(patterns),
                'pattern_types': list(set(p['pattern_type'] for p in patterns)),
                'high_impact_patterns': len([p for p in patterns if p.get('modernization_impact') in ['high', 'very_high']]),
                'project_id': PROJECT_ID,
                'analyzed_at': context.aws_request_id if 'context' in locals() else ''
            }
        }
        
        s3.put_object(
            Bucket=S3_BUCKET,
            Key=s3_key,
            Body=json.dumps(pattern_data, indent=2),
            ContentType='application/json'
        )
        
        print(f"✅ Patterns stored successfully at: {s3_key}")
        
    except Exception as e:
        print(f"❌ Error storing patterns: {str(e)}")
        raise e