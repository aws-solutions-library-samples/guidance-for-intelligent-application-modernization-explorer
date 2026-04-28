import json
import boto3
import os
import logging
from typing import Dict, List, Any, Tuple
from decimal import Decimal
from collections import defaultdict
import statistics

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')

# Environment variables
PROJECT_ID = os.environ.get('PROJECT_ID')
SIMILARITY_RESULTS_TABLE = os.environ.get('SIMILARITY_RESULTS_TABLE')
APPLICATIONS_TABLE = os.environ.get('APPLICATIONS_TABLE')
RESULTS_BUCKET = os.environ.get('RESULTS_BUCKET')

def lambda_handler(event, context):
    """
    Aggregate and analyze application similarity results.
    Generate insights and recommendations based on similarity patterns.
    """
    try:
        logger.info("Starting app similarity aggregation")
        
        project_id = event.get('project_id', PROJECT_ID)
        batch_id = event.get('batch_id', 0)
        trigger = event.get('trigger', 'manual')
        
        logger.info(f"Processing aggregation for project {project_id}, trigger: {trigger}")
        
        # Get tables
        similarity_table = dynamodb.Table(SIMILARITY_RESULTS_TABLE)
        applications_table = dynamodb.Table(APPLICATIONS_TABLE)
        
        # Retrieve all similarity results for the project
        similarity_results = get_similarity_results(similarity_table, project_id)
        logger.info(f"Retrieved {len(similarity_results)} similarity results")
        
        if not similarity_results:
            logger.warning("No similarity results found for aggregation")
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'message': 'No similarity results found',
                    'project_id': project_id
                })
            }
        
        # Retrieve application metadata
        applications = get_applications(applications_table, project_id)
        app_lookup = {app['id']: app for app in applications}
        
        # Generate aggregated insights
        insights = generate_similarity_insights(similarity_results, app_lookup)
        
        # Generate recommendations
        recommendations = generate_recommendations(similarity_results, app_lookup, insights)
        
        # Create comprehensive report
        report = create_similarity_report(project_id, similarity_results, insights, recommendations)
        
        # Save report to S3
        if RESULTS_BUCKET:
            save_report_to_s3(report, project_id)
        
        logger.info("App similarity aggregation completed successfully")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'App similarity aggregation completed',
                'project_id': project_id,
                'total_comparisons': len(similarity_results),
                'insights': insights,
                'recommendations_count': len(recommendations),
                'report_generated': True
            }, default=decimal_default)
        }
        
    except Exception as e:
        logger.error(f"Error in app similarity aggregation: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to aggregate similarity results',
                'details': str(e)
            })
        }

def get_similarity_results(table, project_id: str) -> List[Dict[str, Any]]:
    """Retrieve all similarity results for a project."""
    results = []
    
    try:
        # Query by project_id using GSI
        response = table.query(
            IndexName='ProjectIdIndex',
            KeyConditionExpression='project_id = :project_id',
            ExpressionAttributeValues={
                ':project_id': project_id
            }
        )
        
        results.extend(response.get('Items', []))
        
        # Handle pagination
        while 'LastEvaluatedKey' in response:
            response = table.query(
                IndexName='ProjectIdIndex',
                KeyConditionExpression='project_id = :project_id',
                ExpressionAttributeValues={
                    ':project_id': project_id
                },
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
            results.extend(response.get('Items', []))
            
    except Exception as e:
        logger.error(f"Error retrieving similarity results: {str(e)}")
        raise
    
    return results

def get_applications(table, project_id: str) -> List[Dict[str, Any]]:
    """Retrieve all applications for a project."""
    applications = []
    
    try:
        response = table.query(
            IndexName='ProjectIdIndex',
            KeyConditionExpression='project_id = :project_id',
            ExpressionAttributeValues={
                ':project_id': project_id
            }
        )
        
        applications.extend(response.get('Items', []))
        
        # Handle pagination
        while 'LastEvaluatedKey' in response:
            response = table.query(
                IndexName='ProjectIdIndex',
                KeyConditionExpression='project_id = :project_id',
                ExpressionAttributeValues={
                    ':project_id': project_id
                },
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
            applications.extend(response.get('Items', []))
            
    except Exception as e:
        logger.error(f"Error retrieving applications: {str(e)}")
        raise
    
    return applications

def generate_similarity_insights(results: List[Dict[str, Any]], 
                                app_lookup: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """Generate insights from similarity results."""
    try:
        scores = [float(result['similarity_score']) for result in results]
        
        # Basic statistics
        insights = {
            'total_comparisons': len(results),
            'average_similarity': round(statistics.mean(scores), 4),
            'median_similarity': round(statistics.median(scores), 4),
            'min_similarity': round(min(scores), 4),
            'max_similarity': round(max(scores), 4),
            'std_deviation': round(statistics.stdev(scores) if len(scores) > 1 else 0, 4)
        }
        
        # Similarity distribution
        insights['similarity_distribution'] = {
            'very_high': len([s for s in scores if s >= 0.8]),
            'high': len([s for s in scores if 0.6 <= s < 0.8]),
            'medium': len([s for s in scores if 0.4 <= s < 0.6]),
            'low': len([s for s in scores if 0.2 <= s < 0.4]),
            'very_low': len([s for s in scores if s < 0.2])
        }
        
        # Find most and least similar pairs
        sorted_results = sorted(results, key=lambda x: float(x['similarity_score']), reverse=True)
        
        insights['most_similar_pairs'] = [
            {
                'app1': result['app1_name'],
                'app2': result['app2_name'],
                'similarity_score': float(result['similarity_score'])
            }
            for result in sorted_results[:5]
        ]
        
        insights['least_similar_pairs'] = [
            {
                'app1': result['app1_name'],
                'app2': result['app2_name'],
                'similarity_score': float(result['similarity_score'])
            }
            for result in sorted_results[-5:]
        ]
        
        # Application similarity rankings
        app_similarities = defaultdict(list)
        for result in results:
            app1_id = result['app1_id']
            app2_id = result['app2_id']
            score = float(result['similarity_score'])
            
            app_similarities[app1_id].append(score)
            app_similarities[app2_id].append(score)
        
        app_rankings = []
        for app_id, scores in app_similarities.items():
            app_name = app_lookup.get(app_id, {}).get('name', app_id)
            avg_similarity = statistics.mean(scores)
            app_rankings.append({
                'app_id': app_id,
                'app_name': app_name,
                'average_similarity': round(avg_similarity, 4),
                'comparisons_count': len(scores)
            })
        
        insights['app_similarity_rankings'] = sorted(
            app_rankings, 
            key=lambda x: x['average_similarity'], 
            reverse=True
        )
        
        return insights
        
    except Exception as e:
        logger.error(f"Error generating insights: {str(e)}")
        return {}

def generate_recommendations(results: List[Dict[str, Any]], 
                           app_lookup: Dict[str, Dict[str, Any]],
                           insights: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Generate actionable recommendations based on similarity analysis."""
    recommendations = []
    
    try:
        # Recommendation 1: Consolidation opportunities
        high_similarity_pairs = [
            result for result in results 
            if float(result['similarity_score']) >= 0.8
        ]
        
        if high_similarity_pairs:
            recommendations.append({
                'type': 'consolidation',
                'priority': 'high',
                'title': 'Application Consolidation Opportunities',
                'description': f'Found {len(high_similarity_pairs)} application pairs with very high similarity (≥80%). Consider consolidating these applications to reduce maintenance overhead.',
                'affected_pairs': [
                    {
                        'app1': pair['app1_name'],
                        'app2': pair['app2_name'],
                        'similarity': float(pair['similarity_score'])
                    }
                    for pair in high_similarity_pairs[:10]  # Top 10
                ],
                'estimated_impact': 'High - Reduced maintenance costs and complexity'
            })
        
        # Recommendation 2: Standardization opportunities
        medium_similarity_pairs = [
            result for result in results 
            if 0.4 <= float(result['similarity_score']) < 0.8
        ]
        
        if medium_similarity_pairs:
            recommendations.append({
                'type': 'standardization',
                'priority': 'medium',
                'title': 'Technology Standardization Opportunities',
                'description': f'Found {len(medium_similarity_pairs)} application pairs with moderate similarity. Consider standardizing technologies and patterns across these applications.',
                'affected_pairs': [
                    {
                        'app1': pair['app1_name'],
                        'app2': pair['app2_name'],
                        'similarity': float(pair['similarity_score'])
                    }
                    for pair in medium_similarity_pairs[:10]
                ],
                'estimated_impact': 'Medium - Improved consistency and knowledge sharing'
            })
        
        # Recommendation 3: Outlier applications
        app_rankings = insights.get('app_similarity_rankings', [])
        if app_rankings:
            outliers = [app for app in app_rankings if app['average_similarity'] < 0.3]
            
            if outliers:
                recommendations.append({
                    'type': 'outlier_review',
                    'priority': 'low',
                    'title': 'Review Outlier Applications',
                    'description': f'Found {len(outliers)} applications with low similarity to others. Review these for potential modernization or special handling.',
                    'affected_applications': outliers[:5],
                    'estimated_impact': 'Low - Better understanding of application portfolio diversity'
                })
        
        # Recommendation 4: Portfolio diversity assessment
        distribution = insights.get('similarity_distribution', {})
        total_comparisons = insights.get('total_comparisons', 0)
        
        if total_comparisons > 0:
            diversity_score = (
                distribution.get('very_low', 0) * 1.0 +
                distribution.get('low', 0) * 0.8 +
                distribution.get('medium', 0) * 0.6 +
                distribution.get('high', 0) * 0.4 +
                distribution.get('very_high', 0) * 0.2
            ) / total_comparisons
            
            if diversity_score > 0.7:
                recommendations.append({
                    'type': 'portfolio_assessment',
                    'priority': 'medium',
                    'title': 'High Portfolio Diversity Detected',
                    'description': f'Your application portfolio shows high diversity (score: {diversity_score:.2f}). This may indicate opportunities for standardization or the need for specialized expertise.',
                    'diversity_score': round(diversity_score, 3),
                    'estimated_impact': 'Medium - Strategic portfolio planning insights'
                })
        
        return recommendations
        
    except Exception as e:
        logger.error(f"Error generating recommendations: {str(e)}")
        return []

def create_similarity_report(project_id: str, results: List[Dict[str, Any]], 
                           insights: Dict[str, Any], recommendations: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Create a comprehensive similarity analysis report."""
    import time
    
    report = {
        'report_metadata': {
            'project_id': project_id,
            'generated_at': int(time.time()),
            'report_type': 'application_similarity_analysis',
            'version': '1.0'
        },
        'executive_summary': {
            'total_applications': len(set([r['app1_id'] for r in results] + [r['app2_id'] for r in results])),
            'total_comparisons': len(results),
            'average_similarity': insights.get('average_similarity', 0),
            'key_findings': [
                f"Analyzed {len(results)} application pairs",
                f"Average similarity score: {insights.get('average_similarity', 0):.1%}",
                f"Found {len([r for r in results if float(r['similarity_score']) >= 0.8])} high-similarity pairs",
                f"Generated {len(recommendations)} actionable recommendations"
            ]
        },
        'detailed_insights': insights,
        'recommendations': recommendations,
        'raw_results': [
            {
                'app1': result['app1_name'],
                'app2': result['app2_name'],
                'similarity_score': float(result['similarity_score']),
                'category': result.get('similarity_category', 'unknown')
            }
            for result in results
        ]
    }
    
    return report

def save_report_to_s3(report: Dict[str, Any], project_id: str):
    """Save the similarity report to S3."""
    try:
        import time
        timestamp = int(time.time())
        key = f"similarity-reports/{project_id}/app-similarity-report-{timestamp}.json"
        
        s3.put_object(
            Bucket=RESULTS_BUCKET,
            Key=key,
            Body=json.dumps(report, default=decimal_default, indent=2),
            ContentType='application/json'
        )
        
        logger.info(f"Saved similarity report to S3: s3://{RESULTS_BUCKET}/{key}")
        
    except Exception as e:
        logger.error(f"Error saving report to S3: {str(e)}")
        raise

def decimal_default(obj):
    """JSON serializer for Decimal objects."""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")
