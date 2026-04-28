"""
Find Patterns Lambda Function for Component Similarity Analysis
Identifies repeated technology patterns and architectural patterns across components
"""

import json
import os
import boto3
from typing import Dict, Any, List
from collections import defaultdict, Counter

# Initialize AWS clients
s3 = boto3.client('s3')

# Environment variables
COMPONENT_SIMILARITY_TABLE = os.environ['COMPONENT_SIMILARITY_TABLE']
PROCESSING_BUCKET = os.environ['PROCESSING_BUCKET']
PROJECT_ID = os.environ['PROJECT_ID']

def handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Find repeated patterns in component technology stacks
    """
    print(f"🔍 Starting pattern analysis for project {PROJECT_ID}")
    
    try:
        # Load cluster results from S3
        clusters_s3_key = event.get('clusters_s3_key', f"clusters/{PROJECT_ID}/component-clusters.json")
        
        print(f"📁 Loading cluster data from s3://{PROCESSING_BUCKET}/{clusters_s3_key}")
        
        response = s3.get_object(Bucket=PROCESSING_BUCKET, Key=clusters_s3_key)
        clusters_data = json.loads(response['Body'].read().decode('utf-8'))
        
        all_clusters = clusters_data.get('clusters', {})
        
        # Extract all components from clusters for pattern analysis
        all_components = extract_components_from_clusters(all_clusters)
        
        print(f"📊 Analyzing patterns across {len(all_components)} components")
        
        if not all_components:
            print("⚠️ No components available for pattern analysis")
            return {
                'statusCode': 200,
                'project_id': PROJECT_ID,
                'patterns': [],
                'pattern_count': 0
            }
        
        # Find different types of patterns
        tech_stack_patterns = find_tech_stack_patterns(all_components)
        
        # For now, focus on tech stack patterns for the RepeatedPatternsTable
        # architectural_patterns = find_architectural_patterns(all_components)
        # modernization_patterns = find_modernization_patterns(all_components)
        
        # Store pattern results in S3 (keep existing format for compatibility)
        patterns_key = f"patterns/{PROJECT_ID}/component-patterns.json"
        patterns_data = {
            'project_id': PROJECT_ID,
            'patterns': {
                'tech_stack_patterns': tech_stack_patterns,
                'architectural_patterns': [],  # Disabled for now
                'modernization_patterns': []   # Disabled for now
            },
            'pattern_summary': {
                'tech_stack_patterns': len(tech_stack_patterns),
                'architectural_patterns': 0,
                'modernization_patterns': 0,
                'total_components_analyzed': len(all_components)
            },
            'generated_at': context.aws_request_id
        }
        
        s3.put_object(
            Bucket=PROCESSING_BUCKET,
            Key=patterns_key,
            Body=json.dumps(patterns_data),
            ContentType='application/json',
            Metadata={
                'project-id': PROJECT_ID,
                'pattern-types': '1',  # Only tech stack patterns for now
                'total-patterns': str(len(tech_stack_patterns))
            }
        )
        
        print(f"✅ Pattern analysis completed successfully")
        print(f"🏗️ Tech stack patterns: {len(tech_stack_patterns)}")
        print(f"💾 Patterns stored at s3://{PROCESSING_BUCKET}/{patterns_key}")
        
        # Return tech stack patterns directly for DynamoDB storage
        return {
            'statusCode': 200,
            'project_id': PROJECT_ID,
            'repeatedPatterns': tech_stack_patterns,  # This will be stored in DynamoDB
            'pattern_summary': patterns_data['pattern_summary'],
            'patterns_s3_key': patterns_key
        }
        
    except Exception as e:
        print(f"❌ Error finding patterns: {str(e)}")
        raise e

def extract_components_from_clusters(all_clusters: Dict) -> List[Dict]:
    """Extract unique components from all cluster types"""
    components_map = {}
    
    for cluster_type, clusters in all_clusters.items():
        for cluster in clusters:
            for component in cluster.get('components', []):
                comp_id = f"{component.get('applicationName', '')}#{component.get('componentName', '')}"
                if comp_id not in components_map:
                    components_map[comp_id] = component
    
    return list(components_map.values())

def find_tech_stack_patterns(components: List[Dict]) -> List[Dict]:
    """Find repeated technology stack patterns using full technology stack"""
    print(f"🏗️ Analyzing technology stack patterns with full tech stack")
    
    # Create technology stack signatures using all technology fields
    stack_patterns = defaultdict(list)
    
    for component in components:
        # Create a comprehensive stack signature
        runtime = component.get('runtime', '').lower().strip()
        framework = component.get('framework', '').lower().strip()
        
        # Handle databases, integrations, storages as arrays or strings
        databases = component.get('databases', [])
        if isinstance(databases, str):
            databases = [db.strip() for db in databases.split(',') if db.strip()]
        elif not isinstance(databases, list):
            databases = []
        databases = sorted([db.lower() for db in databases if db])
        
        integrations = component.get('integrations', [])
        if isinstance(integrations, str):
            integrations = [int.strip() for int in integrations.split(',') if int.strip()]
        elif not isinstance(integrations, list):
            integrations = []
        integrations = sorted([int.lower() for int in integrations if int])
        
        storages = component.get('storages', [])
        if isinstance(storages, str):
            storages = [stor.strip() for stor in storages.split(',') if stor.strip()]
        elif not isinstance(storages, list):
            storages = []
        storages = sorted([stor.lower() for stor in storages if stor])
        
        # Create comprehensive signature
        stack_signature = {
            'runtime': runtime or None,
            'framework': framework or None,
            'databases': databases,
            'integrations': integrations,
            'storages': storages
        }
        
        # Skip completely empty patterns
        if not any([runtime, framework, databases, integrations, storages]):
            continue
        
        # Create signature key for grouping
        signature_key = f"{runtime}|{framework}|{','.join(databases)}|{','.join(integrations)}|{','.join(storages)}"
        stack_patterns[signature_key].append({
            'component': component,
            'stack_signature': stack_signature
        })
    
    # Convert to pattern objects in the format expected by RepeatedPatternsTable
    patterns = []
    pattern_id = 0
    
    for signature_key, pattern_data in stack_patterns.items():
        if len(pattern_data) > 1:  # Only patterns with multiple instances
            pattern_id += 1
            first_signature = pattern_data[0]['stack_signature']
            
            # Create pattern name from technology stack
            name_parts = []
            if first_signature['runtime']:
                name_parts.append(first_signature['runtime'].title())
            if first_signature['framework']:
                name_parts.append(first_signature['framework'].title())
            if first_signature['databases']:
                name_parts.append(' + '.join([db.title() for db in first_signature['databases']]))
            if first_signature['integrations']:
                name_parts.append(' + '.join([int.title() for int in first_signature['integrations']]))
            if first_signature['storages']:
                name_parts.append(' + '.join([stor.title() for stor in first_signature['storages']]))
            
            pattern_name = ' + '.join(name_parts) if name_parts else f"Pattern {pattern_id}"
            
            # Extract component details for the pattern
            pattern_components = []
            for item in pattern_data:
                comp = item['component']
                pattern_components.append({
                    'componentId': comp.get('id', comp.get('componentId', f"comp-{pattern_id}-{len(pattern_components)}")),
                    'componentName': comp.get('componentName', comp.get('name', 'Unknown Component')),
                    'applicationName': comp.get('applicationName', comp.get('application', 'Unknown Application'))
                })
            
            # Create pattern in RepeatedPatternsTable expected format
            pattern = {
                'id': f'pattern_{pattern_id}',
                'patternName': pattern_name,
                'frequency': len(pattern_data),
                'pattern': {
                    'runtime': first_signature['runtime'],
                    'framework': first_signature['framework'],
                    'databases': first_signature['databases'],
                    'integrations': first_signature['integrations'],
                    'storages': first_signature['storages']
                },
                'components': pattern_components,
                'modernization_potential': assess_modernization_potential(
                    first_signature['runtime'], 
                    first_signature['framework']
                )
            }
            patterns.append(pattern)
    
    # Sort by frequency (most common first)
    patterns.sort(key=lambda x: x['frequency'], reverse=True)
    
    print(f"🏗️ Found {len(patterns)} granular technology stack patterns")
    return patterns

def find_architectural_patterns(components: List[Dict]) -> List[Dict]:
    """Find architectural patterns based on component relationships"""
    print(f"🏛️ Analyzing architectural patterns")
    
    # Group components by application to analyze architectural patterns
    app_components = defaultdict(list)
    for component in components:
        app_name = component.get('applicationName', '')
        if app_name:
            app_components[app_name].append(component)
    
    patterns = []
    
    # Analyze multi-tier patterns
    multi_tier_apps = []
    microservice_apps = []
    monolith_apps = []
    
    for app_name, app_comps in app_components.items():
        component_count = len(app_comps)
        
        if component_count >= 5:
            # Likely microservices architecture
            microservice_apps.append({
                'application': app_name,
                'component_count': component_count,
                'components': app_comps
            })
        elif component_count >= 2:
            # Multi-tier architecture
            multi_tier_apps.append({
                'application': app_name,
                'component_count': component_count,
                'components': app_comps
            })
        else:
            # Monolithic architecture
            monolith_apps.append({
                'application': app_name,
                'component_count': component_count,
                'components': app_comps
            })
    
    # Create architectural patterns
    if microservice_apps:
        patterns.append({
            'id': 'arch-microservices',
            'name': 'Microservices Architecture',
            'type': 'architectural',
            'pattern_description': 'Applications with 5+ components indicating microservices architecture',
            'frequency': len(microservice_apps),
            'applications': microservice_apps,
            'modernization_impact': 'Low - Already modern architecture'
        })
    
    if multi_tier_apps:
        patterns.append({
            'id': 'arch-multi-tier',
            'name': 'Multi-Tier Architecture',
            'type': 'architectural',
            'pattern_description': 'Applications with 2-4 components indicating multi-tier architecture',
            'frequency': len(multi_tier_apps),
            'applications': multi_tier_apps,
            'modernization_impact': 'Medium - Could benefit from microservices decomposition'
        })
    
    if monolith_apps:
        patterns.append({
            'id': 'arch-monolith',
            'name': 'Monolithic Architecture',
            'type': 'architectural',
            'pattern_description': 'Applications with single components indicating monolithic architecture',
            'frequency': len(monolith_apps),
            'applications': monolith_apps,
            'modernization_impact': 'High - Prime candidates for decomposition'
        })
    
    print(f"🏛️ Found {len(patterns)} architectural patterns")
    return patterns

def find_modernization_patterns(components: List[Dict]) -> List[Dict]:
    """Find patterns relevant to modernization efforts"""
    print(f"🚀 Analyzing modernization patterns")
    
    patterns = []
    
    # Analyze runtime patterns for modernization
    runtime_counter = Counter(comp.get('runtime', '').lower().strip() for comp in components if comp.get('runtime'))
    framework_counter = Counter(comp.get('framework', '').lower().strip() for comp in components if comp.get('framework'))
    
    # Legacy runtime patterns
    legacy_runtimes = ['java 8', 'java8', 'python 2', 'python2', '.net framework', 'php 5', 'php5', 'node 10', 'node10']
    legacy_components = []
    
    for component in components:
        runtime = component.get('runtime', '').lower().strip()
        if any(legacy in runtime for legacy in legacy_runtimes):
            legacy_components.append(component)
    
    if legacy_components:
        patterns.append({
            'id': 'modernization-legacy-runtime',
            'name': 'Legacy Runtime Modernization',
            'type': 'modernization',
            'pattern_description': 'Components using legacy runtime versions that need upgrading',
            'frequency': len(legacy_components),
            'components': legacy_components,
            'modernization_priority': 'High',
            'recommended_action': 'Upgrade to supported runtime versions'
        })
    
    # Container readiness pattern
    containerizable_components = []
    for component in components:
        runtime = component.get('runtime', '').lower()
        framework = component.get('framework', '').lower()
        
        # Check if component is likely containerizable
        if any(tech in runtime or tech in framework for tech in ['java', 'python', 'node', 'go', 'dotnet']):
            containerizable_components.append(component)
    
    if containerizable_components:
        patterns.append({
            'id': 'modernization-containerization',
            'name': 'Containerization Candidates',
            'type': 'modernization',
            'pattern_description': 'Components that are good candidates for containerization',
            'frequency': len(containerizable_components),
            'components': containerizable_components[:10],  # Limit for readability
            'modernization_priority': 'Medium',
            'recommended_action': 'Consider containerizing with Docker/Kubernetes'
        })
    
    # Cloud-native patterns
    cloud_native_indicators = ['spring boot', 'express', 'flask', 'fastapi', 'gin', 'echo']
    cloud_native_components = []
    
    for component in components:
        framework = component.get('framework', '').lower()
        if any(indicator in framework for indicator in cloud_native_indicators):
            cloud_native_components.append(component)
    
    if cloud_native_components:
        patterns.append({
            'id': 'modernization-cloud-native',
            'name': 'Cloud-Native Ready',
            'type': 'modernization',
            'pattern_description': 'Components already using cloud-native frameworks',
            'frequency': len(cloud_native_components),
            'components': cloud_native_components[:10],
            'modernization_priority': 'Low',
            'recommended_action': 'Optimize for cloud deployment'
        })
    
    print(f"🚀 Found {len(patterns)} modernization patterns")
    return patterns

def assess_modernization_potential(runtime: str, framework: str) -> str:
    """Assess modernization potential based on technology stack"""
    legacy_indicators = ['java 8', 'python 2', '.net framework', 'php 5', 'node 10']
    modern_indicators = ['java 17', 'java 21', 'python 3', '.net core', '.net 6', 'node 18', 'node 20']
    
    runtime_lower = runtime.lower() if runtime else ''
    framework_lower = framework.lower() if framework else ''
    
    if any(legacy in runtime_lower or legacy in framework_lower for legacy in legacy_indicators):
        return 'High - Legacy technology requiring modernization'
    elif any(modern in runtime_lower or modern in framework_lower for modern in modern_indicators):
        return 'Low - Modern technology stack'
    else:
        return 'Medium - Could benefit from technology updates'
