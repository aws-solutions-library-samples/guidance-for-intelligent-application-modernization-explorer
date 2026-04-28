"""
Pilot Aggregate Lambda Function
Aggregates results from all pilot partitions
"""
import json
import boto3
from decimal import Decimal

def handler(event, context):
    print(f"🚀 Pilot Aggregate Lambda started")
    print(f"📋 Event: {json.dumps(event, indent=2)}")
    
    try:
        # Extract parameters
        project_id = event['projectId']
        job_id = event['jobId']
        partition_results = event['partition_results']
        
        # Aggregate all applications from partitions
        all_applications = []
        total_processed = 0
        
        for partition_result in partition_results:
            applications = partition_result.get('applications', [])
            all_applications.extend(applications)
            total_processed += partition_result.get('processed_count', 0)
        
        print(f"📊 Total applications from all partitions: {len(all_applications)}")
        
        # Deduplicate applications by name (in case partitioning created overlaps)
        seen_applications = {}
        deduplicated_applications = []
        
        for app in all_applications:
            app_name = app.get('application_name', '').strip()
            if app_name:
                if app_name not in seen_applications:
                    seen_applications[app_name] = app
                    deduplicated_applications.append(app)
                else:
                    # Keep the one with higher score
                    existing_score = seen_applications[app_name].get('pilot_score', {}).get('total', 0)
                    current_score = app.get('pilot_score', {}).get('total', 0)
                    if current_score > existing_score:
                        # Replace with higher scoring version
                        seen_applications[app_name] = app
                        # Remove old version and add new one
                        deduplicated_applications = [a for a in deduplicated_applications if a.get('application_name') != app_name]
                        deduplicated_applications.append(app)
        
        print(f"📊 After deduplication: {len(deduplicated_applications)} unique applications")
        
        # Sort applications by pilot score (descending)
        sorted_applications = sorted(
            deduplicated_applications, 
            key=lambda x: x.get('pilot_score', {}).get('total', 0), 
            reverse=True
        )
        
        # Calculate statistics
        scores = [app.get('pilot_score', {}).get('total', 0) for app in sorted_applications]
        avg_score = sum(scores) / len(scores) if scores else 0
        max_score = max(scores) if scores else 0
        min_score = min(scores) if scores else 0
        
        # Get top candidates based on maxCandidates parameter
        criteria = event.get('criteria', {})
        max_candidates = criteria.get('maxCandidates', 4)  # Use frontend parameter
        top_candidates = sorted_applications[:max_candidates]
        
        print(f"📊 Selected top {len(top_candidates)} candidates (max: {max_candidates})")
        
        result = {
            'projectId': project_id,  # Add missing projectId field
            'jobId': job_id,  # Add missing jobId field
            'criteria': event.get('criteria', {}),  # Add missing criteria field
            'total_applications': len(all_applications),
            'total_processed': total_processed,
            'top_candidates_count': len(top_candidates),
            'top_candidates': top_candidates,
            'statistics': {
                'average_score': round(avg_score, 2),
                'max_score': max_score,
                'min_score': min_score,
                'score_distribution': calculate_score_distribution(scores)
            },
            'aggregation_complete': True
        }
        
        print(f"✅ Aggregated {len(all_applications)} applications, identified {len(top_candidates)} top candidates")
        return result
        
    except Exception as e:
        print(f"❌ Error in pilot aggregate: {str(e)}")
        raise e

def calculate_score_distribution(scores):
    """Calculate score distribution for analysis"""
    if not scores:
        return {}
    
    ranges = {
        '90-100': 0,
        '80-89': 0,
        '70-79': 0,
        '60-69': 0,
        '50-59': 0,
        'below-50': 0
    }
    
    for score in scores:
        if score >= 90:
            ranges['90-100'] += 1
        elif score >= 80:
            ranges['80-89'] += 1
        elif score >= 70:
            ranges['70-79'] += 1
        elif score >= 60:
            ranges['60-69'] += 1
        elif score >= 50:
            ranges['50-59'] += 1
        else:
            ranges['below-50'] += 1
    
    return ranges