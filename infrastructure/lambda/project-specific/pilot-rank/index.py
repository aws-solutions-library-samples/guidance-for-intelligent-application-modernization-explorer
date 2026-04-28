"""
Pilot Rank Lambda Function
Ranks and scores pilot candidates with final recommendations
"""
import json
import boto3
from datetime import datetime
from decimal import Decimal

def handler(event, context):
    print(f"🚀 Pilot Rank Lambda started")
    print(f"📋 Event: {json.dumps(event, indent=2)}")
    
    try:
        dynamodb = boto3.resource('dynamodb')
        
        # Extract parameters
        project_id = event['projectId']
        job_id = event['jobId']
        criteria = event['criteria']
        jobs_table_name = event['jobsTableName']
        results_table_name = event['resultsTableName']
        
        # Get aggregated results from previous step
        top_candidates = event.get('top_candidates', [])
        statistics = event.get('statistics', {})
        
        print(f"📊 Processing {len(top_candidates)} top candidates")
        
        # Deduplicate candidates by application name (in case aggregation missed some)
        seen_applications = set()
        unique_candidates = []
        for candidate in top_candidates:
            app_name = candidate.get('application_name', '').strip()
            if app_name and app_name not in seen_applications:
                seen_applications.add(app_name)
                unique_candidates.append(candidate)
            else:
                print(f"⚠️ Skipping duplicate candidate: {app_name}")
        
        print(f"📊 After deduplication: {len(unique_candidates)} unique candidates")
        
        # Apply final ranking logic and add similar applications
        final_rankings = []
        for i, candidate in enumerate(unique_candidates):
            rank = i + 1
            app_name = candidate.get('application_name', '')
            
            # Calculate confidence score based on various factors
            confidence = calculate_confidence_score(candidate, statistics)
            
            # Add recommendation reasoning
            recommendation = generate_recommendation(candidate, rank, confidence)
            
            # Get similar applications from similarity results table
            # Note: We don't store similar apps in DynamoDB anymore - they're fetched on-demand
            # similar_apps = get_similar_applications(project_id, app_name, dynamodb)
            
            final_rankings.append({
                'rank': rank,
                'application_name': app_name,
                'department': candidate.get('department', ''),
                'criticality': candidate.get('criticality', ''),
                'purpose': candidate.get('purpose', ''),
                'runtime': candidate.get('runtime', ''),
                'framework': candidate.get('framework', ''),
                'databases': candidate.get('databases', ''),
                'pilot_score': candidate.get('pilot_score'),
                'confidence_score': confidence,
                'recommendation': recommendation,
                'suitability_rating': get_suitability_rating(candidate.get('pilot_score', {}).get('total', 0))
                # Removed: 'similar_applications' and 'similar_apps_count'
            })
        
        # Store results in DynamoDB
        results_table = dynamodb.Table(results_table_name)
        
        # Store final rankings
        for ranking in final_rankings:
            # Generate a unique candidate ID for the sort key
            candidate_id = f"candidate_{ranking['rank']:02d}_{ranking['application_name'].replace(' ', '_').replace('-', '_').lower()}"
            
            # Convert the ranking data to DynamoDB-compatible format
            item_data = {
                'jobId': job_id,
                'candidateId': candidate_id,  # Required sort key
                'applicationName': ranking['application_name'],
                'department': ranking['department'],
                'criticality': ranking['criticality'],
                'purpose': ranking['purpose'],
                'runtime': ranking['runtime'],
                'framework': ranking['framework'],
                'databases': ranking['databases'],
                'rank': ranking['rank'],
                'pilotScore': ranking['pilot_score'],
                'confidenceScore': ranking['confidence_score'],
                'recommendation': ranking['recommendation'],
                'suitabilityRating': ranking['suitability_rating'],
                'timestamp': datetime.utcnow().isoformat()
                # Removed: 'similarApplications' and 'similarAppsCount'
            }
            
            # Convert floats to Decimals for DynamoDB compatibility
            item_data = convert_floats_to_decimal(item_data)
            
            results_table.put_item(Item=item_data)
        
        # Update job status
        results_table = dynamodb.Table(results_table_name)
        
        # Store final rankings
        for ranking in final_rankings:
            # Generate a unique candidate ID for the sort key
            candidate_id = f"candidate_{ranking['rank']}_{ranking['application_name'].replace(' ', '_').lower()}"
            
            results_table.put_item(
                Item={
                    'jobId': job_id,
                    'candidateId': candidate_id,  # Required sort key
                    'applicationName': ranking['application_name'],
                    'rank': ranking['rank'],
                    'pilotScore': ranking['pilot_score'],
                    'confidenceScore': ranking['confidence_score'],
                    'recommendation': ranking['recommendation'],
                    'suitabilityRating': ranking['suitability_rating'],
                    'timestamp': datetime.utcnow().isoformat()
                }
            )
        
        # Update job status
        jobs_table = dynamodb.Table(jobs_table_name)
        jobs_table.update_item(
            Key={'jobId': job_id},
            UpdateExpression='SET #status = :status, completedAt = :completed, totalCandidates = :total',
            ExpressionAttributeNames={
                '#status': 'status'
            },
            ExpressionAttributeValues={
                ':status': 'COMPLETED',
                ':completed': datetime.utcnow().isoformat(),
                ':total': len(final_rankings)
            }
        )
        
        result = {
            'job_id': job_id,
            'status': 'completed',
            'total_candidates': len(final_rankings),
            'top_recommendations': final_rankings[:5],  # Top 5 recommendations
            'analysis_summary': {
                'total_applications_analyzed': event.get('total_applications', 0),
                'average_score': statistics.get('average_score', 0),
                'score_distribution': statistics.get('score_distribution', {}),
                'completion_time': datetime.utcnow().isoformat()
            }
        }
        
        print(f"✅ Ranked {len(final_rankings)} pilot candidates, job {job_id} completed")
        return result
        
    except Exception as e:
        print(f"❌ Error in pilot rank: {str(e)}")
        raise e

def get_similar_applications(project_id, application_name, dynamodb):
    """Get similar applications from the similarity results table"""
    try:
        # Construct similarity table name
        similarity_table_name = f"app-modex-app-sim-{project_id.lower()}"
        similarity_table = dynamodb.Table(similarity_table_name)
        
        print(f"🔍 Looking for similar applications to '{application_name}' in table: {similarity_table_name}")
        
        # Query similarity table for this application
        response = similarity_table.query(
            KeyConditionExpression='application_id = :app_id',
            ExpressionAttributeValues={
                ':app_id': application_name
            }
        )
        
        similar_apps = []
        items = response.get('Items', [])
        print(f"📊 Found {len(items)} similarity records for '{application_name}'")
        
        for item in items:
            # Each item is a separate similarity record
            similarity_score = float(item.get('similarity_score', 0))
            similar_app_name = item.get('similar_app_id', '')
            
            if similar_app_name and similarity_score > 0:
                similar_apps.append({
                    'name': similar_app_name,
                    'applicationName': similar_app_name,
                    'similarity': similarity_score,
                    'department': '',  # We don't have department in similarity table
                    'criticality': ''  # We don't have criticality in similarity table
                })
        
        # Sort by similarity score (descending) and limit to top 20
        similar_apps.sort(key=lambda x: x['similarity'], reverse=True)
        similar_apps = similar_apps[:20]
        
        print(f"✅ Found {len(similar_apps)} similar applications for '{application_name}'")
        if similar_apps:
            print(f"🔍 Top similar app: {similar_apps[0]['name']} ({similar_apps[0]['similarity']:.1%})")
        
        return similar_apps
        
    except Exception as e:
        print(f"⚠️ Error getting similar applications for '{application_name}': {str(e)}")
        import traceback
        print(f"📋 Full traceback: {traceback.format_exc()}")
        return []

def convert_floats_to_decimal(obj):
    """Recursively convert float values to Decimal for DynamoDB compatibility"""
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {key: convert_floats_to_decimal(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_floats_to_decimal(item) for item in obj]
    else:
        return obj

def calculate_confidence_score(candidate, statistics):
    """Calculate confidence score for the recommendation"""
    base_score = candidate.get('pilot_score', {}).get('total', 0)
    avg_score = statistics.get('average_score', 50)
    
    # Higher confidence for scores significantly above average
    if base_score > avg_score + 20:
        return min(95, base_score + 10)
    elif base_score > avg_score + 10:
        return min(85, base_score + 5)
    elif base_score > avg_score:
        return min(75, base_score)
    else:
        return max(30, base_score - 10)

def generate_recommendation(candidate, rank, confidence):
    """Generate recommendation text based on candidate profile"""
    app_name = candidate.get('application_name', 'Unknown')
    score = candidate.get('pilot_score', {}).get('total', 0)
    
    if rank <= 3 and confidence >= 80:
        return f"Highly recommended pilot candidate. {app_name} shows excellent potential with strong business alignment and technical feasibility."
    elif rank <= 5 and confidence >= 70:
        return f"Strong pilot candidate. {app_name} demonstrates good modernization potential with manageable risks."
    elif rank <= 10 and confidence >= 60:
        return f"Viable pilot option. {app_name} could serve as a pilot with proper planning and risk mitigation."
    else:
        return f"Consider as backup option. {app_name} may require additional assessment before pilot selection."

def get_suitability_rating(score):
    """Get suitability rating based on score"""
    if score >= 85:
        return "Excellent"
    elif score >= 75:
        return "Very Good"
    elif score >= 65:
        return "Good"
    elif score >= 55:
        return "Fair"
    else:
        return "Poor"