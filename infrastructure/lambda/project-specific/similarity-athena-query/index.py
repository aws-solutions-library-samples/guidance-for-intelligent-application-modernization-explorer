"""
Athena Query Lambda Function for Similarity Analysis
Executes Athena queries to retrieve tech stack data for similarity processing
"""

import json
import boto3
import time
import os
from typing import Dict, Any

# Initialize AWS clients
athena_client = boto3.client('athena')
s3_client = boto3.client('s3')

# Environment variables
ATHENA_DATABASE = os.environ['ATHENA_DATABASE']
ATHENA_TABLE = os.environ['ATHENA_TABLE']
PROJECT_ID = os.environ['PROJECT_ID']

def handler(event: Dict[str, Any], context) -> Dict[str, Any]:
    """
    Execute Athena query to retrieve tech stack data for similarity analysis
    """
    print(f"🔍 Starting Athena query for project {PROJECT_ID}")
    print(f"📊 Database: {ATHENA_DATABASE}, Table: {ATHENA_TABLE}")
    
    try:
        # Build the Athena query
        query = f"""
        SELECT 
            id,
            applicationname,
            componentname,
            runtime,
            framework,
            databases,
            integrations,
            storages
        FROM {ATHENA_DATABASE}.{ATHENA_TABLE}
        WHERE applicationname IS NOT NULL 
        AND componentname IS NOT NULL
        ORDER BY applicationname, componentname
        """
        
        print(f"📝 Executing query: {query}")
        
        # Execute the query
        query_execution_id = execute_athena_query(query)
        
        # Wait for query completion
        query_result = wait_for_query_completion(query_execution_id)
        
        # Get query results
        results = get_query_results(query_execution_id)
        
        print(f"✅ Query completed successfully")
        print(f"📊 Retrieved {len(results)} records")
        
        return {
            'statusCode': 200,
            'query_execution_id': query_execution_id,
            'record_count': len(results),
            'data': results,
            'project_id': PROJECT_ID
        }
        
    except Exception as e:
        print(f"❌ Error executing Athena query: {str(e)}")
        raise e

def execute_athena_query(query: str) -> str:
    """Execute Athena query and return execution ID"""
    
    # Use the results bucket for this project
    results_location = f's3://app-modex-results-{PROJECT_ID.lower()}/athena-results/'
    
    response = athena_client.start_query_execution(
        QueryString=query,
        ResultConfiguration={
            'OutputLocation': results_location
        },
        WorkGroup='primary'
    )
    
    return response['QueryExecutionId']

def wait_for_query_completion(query_execution_id: str, max_wait_time: int = 300) -> Dict[str, Any]:
    """
    Wait for Athena query to complete with exponential backoff polling.
    
    Starts with 1 second wait and increases exponentially up to 10 seconds maximum,
    reducing unnecessary API calls while maintaining responsiveness for quick queries.
    """
    
    start_time = time.time()
    poll_interval = 1  # Start with 1 second
    max_poll_interval = 10  # Cap at 10 seconds
    poll_attempt = 0
    
    while time.time() - start_time < max_wait_time:
        response = athena_client.get_query_execution(
            QueryExecutionId=query_execution_id
        )
        
        status = response['QueryExecution']['Status']['State']
        
        if status == 'SUCCEEDED':
            print(f"✅ Query completed after {poll_attempt} polling attempts")
            return response
        elif status in ['FAILED', 'CANCELLED']:
            error_message = response['QueryExecution']['Status'].get('StateChangeReason', 'Unknown error')
            raise Exception(f"Query failed with status {status}: {error_message}")
        
        # Calculate next poll interval with exponential backoff
        elapsed_time = time.time() - start_time
        print(f"⏳ Query status: {status}, waiting {poll_interval}s (elapsed: {elapsed_time:.1f}s)...")
        # Intentional: polling with exponential backoff for Athena query completion
        time.sleep(poll_interval)
        
        # Exponential backoff: double the interval, capped at max_poll_interval
        poll_interval = min(poll_interval * 2, max_poll_interval)
        poll_attempt += 1
    
    raise Exception(f"Query timed out after {max_wait_time} seconds")

def get_query_results(query_execution_id: str) -> list:
    """Get results from completed Athena query"""
    
    results = []
    next_token = None
    
    while True:
        params = {'QueryExecutionId': query_execution_id}
        if next_token:
            params['NextToken'] = next_token
            
        response = athena_client.get_query_results(**params)
        
        # Skip header row on first iteration
        rows = response['ResultSet']['Rows']
        if not results:  # First iteration
            rows = rows[1:]  # Skip header
            
        for row in rows:
            data = row['Data']
            
            # Extract values, handling null values
            record = {
                'id': data[0].get('VarCharValue', ''),
                'applicationname': data[1].get('VarCharValue', ''),
                'componentname': data[2].get('VarCharValue', ''),
                'runtime': data[3].get('VarCharValue', ''),
                'framework': data[4].get('VarCharValue', ''),
                'databases': data[5].get('VarCharValue', ''),
                'integrations': data[6].get('VarCharValue', ''),
                'storages': data[7].get('VarCharValue', '')
            }
            
            results.append(record)
        
        # Check if there are more results
        next_token = response.get('NextToken')
        if not next_token:
            break
    
    return results
