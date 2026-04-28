"""
Pilot Process Lambda Function
Processes individual pilot partitions and scores applications
"""
import json
import boto3
import csv
from io import StringIO

def handler(event, context):
    print(f"🚀 Pilot Process Lambda started")
    print(f"📋 Event: {json.dumps(event, indent=2)}")
    
    try:
        s3_client = boto3.client('s3')
        
        # Extract partition info
        partition_id = event['partition_id']
        start_index = event['start_index']
        end_index = event['end_index']
        s3_bucket = event['s3_bucket']
        s3_key = event['s3_key']
        criteria = event['criteria']
        
        print(f"📊 Processing partition {partition_id}: indices {start_index}-{end_index}")
        
        # Read data from S3
        response = s3_client.get_object(Bucket=s3_bucket, Key=s3_key)
        data_content = response['Body'].read().decode('utf-8')
        
        # Parse the JSON data (not CSV as originally assumed)
        athena_result = json.loads(data_content)
        all_applications = athena_result.get('data', [])
        
        print(f"📊 Total applications in S3: {len(all_applications)}")
        
        # Extract the partition slice
        raw_applications = all_applications[start_index:end_index]
        
        print(f"📊 Raw applications in this partition: {len(raw_applications)}")
        
        if len(raw_applications) == 0:
            print("⚠️ No applications in this partition")
            return {
                'partition_id': partition_id,
                'processed_count': 0,
                'applications': []
            }
        
        # Deduplicate and aggregate applications
        # The Athena query JOINs multiple tables, so we get multiple rows per application
        from collections import defaultdict
        
        applications_dict = defaultdict(lambda: {
            'applicationname': '',
            'department': '',
            'criticality': '',
            'purpose': '',
            'runtime': set(),
            'framework': set(),
            'databases': set(),
            'integrations': set(),
            'storages': set(),
            'servername': set(),
            'servertype': set(),
            'orchestrationplatform': set(),
            'environment': set(),
            'cpu': [],
            'memory': [],
            'cpuutilization': [],
            'memoryutilization': [],
            'storageutilization': [],
            'networkin': [],
            'networkout': []
        })
        
        # Aggregate data by application name
        for row in raw_applications:
            app_name = row.get('applicationname', '').strip()
            if not app_name:
                continue
            
            app_data = applications_dict[app_name]
            
            # Set basic fields (same for all rows of the same app)
            app_data['applicationname'] = app_name
            app_data['department'] = row.get('department', '').strip() or app_data['department']
            app_data['criticality'] = row.get('criticality', '').strip() or app_data['criticality']
            app_data['purpose'] = row.get('purpose', '').strip() or app_data['purpose']
            
            # Aggregate sets (unique values)
            if row.get('runtime'):
                app_data['runtime'].add(row['runtime'].strip())
            if row.get('framework'):
                app_data['framework'].add(row['framework'].strip())
            if row.get('databases'):
                app_data['databases'].add(row['databases'].strip())
            if row.get('integrations'):
                app_data['integrations'].add(row['integrations'].strip())
            if row.get('storages'):
                app_data['storages'].add(row['storages'].strip())
            if row.get('servername'):
                app_data['servername'].add(row['servername'].strip())
            if row.get('servertype'):
                app_data['servertype'].add(row['servertype'].strip())
            if row.get('orchestrationplatform'):
                app_data['orchestrationplatform'].add(row['orchestrationplatform'].strip())
            if row.get('environment'):
                app_data['environment'].add(row['environment'].strip())
            
            # Aggregate numeric values
            for field in ['cpu', 'memory', 'cpuutilization', 'memoryutilization', 'storageutilization', 'networkin', 'networkout']:
                value = row.get(field)
                if value and str(value).strip():
                    try:
                        app_data[field].append(float(value))
                    except (ValueError, TypeError):
                        pass
        
        # Convert aggregated data to final format
        applications = []
        for app_name, app_data in applications_dict.items():
            # Convert sets to comma-separated strings
            final_app = {
                'applicationname': app_data['applicationname'],
                'department': app_data['department'],
                'criticality': app_data['criticality'],
                'purpose': app_data['purpose'],
                'runtime': ', '.join(sorted(app_data['runtime'])) if app_data['runtime'] else '',
                'framework': ', '.join(sorted(app_data['framework'])) if app_data['framework'] else '',
                'databases': ', '.join(sorted(app_data['databases'])) if app_data['databases'] else '',
                'integrations': ', '.join(sorted(app_data['integrations'])) if app_data['integrations'] else '',
                'storages': ', '.join(sorted(app_data['storages'])) if app_data['storages'] else '',
                'servername': ', '.join(sorted(app_data['servername'])) if app_data['servername'] else '',
                'servertype': ', '.join(sorted(app_data['servertype'])) if app_data['servertype'] else '',
                'orchestrationplatform': ', '.join(sorted(app_data['orchestrationplatform'])) if app_data['orchestrationplatform'] else '',
                'environment': ', '.join(sorted(app_data['environment'])) if app_data['environment'] else '',
                # Average numeric values
                'avg_cpu': sum(app_data['cpu']) / len(app_data['cpu']) if app_data['cpu'] else 0,
                'avg_memory': sum(app_data['memory']) / len(app_data['memory']) if app_data['memory'] else 0,
                'avg_cpu_utilization': sum(app_data['cpuutilization']) / len(app_data['cpuutilization']) if app_data['cpuutilization'] else 0,
                'avg_memory_utilization': sum(app_data['memoryutilization']) / len(app_data['memoryutilization']) if app_data['memoryutilization'] else 0,
                'avg_storage_utilization': sum(app_data['storageutilization']) / len(app_data['storageutilization']) if app_data['storageutilization'] else 0,
                'avg_network_in': sum(app_data['networkin']) / len(app_data['networkin']) if app_data['networkin'] else 0,
                'avg_network_out': sum(app_data['networkout']) / len(app_data['networkout']) if app_data['networkout'] else 0
            }
            applications.append(final_app)
        
        print(f"📊 Deduplicated to {len(applications)} unique applications")
        
        scored_applications = []
        for app in applications:
            score = calculate_pilot_score(app, criteria)
            scored_applications.append({
                'application_name': app.get('applicationname', ''),
                'department': app.get('department', ''),
                'criticality': app.get('criticality', ''),
                'purpose': app.get('purpose', ''),
                'runtime': app.get('runtime', ''),
                'framework': app.get('framework', ''),
                'databases': app.get('databases', ''),
                'pilot_score': score,
                'business_driver_score': score.get('business_driver', 0),
                'technical_feasibility_score': score.get('technical_feasibility', 0),
                'risk_score': score.get('risk', 0),
                'user_base_score': score.get('user_base', 0),
                'compelling_events_score': score.get('compelling_events', 0)
            })
        
        result = {
            'partition_id': partition_id,
            'processed_count': len(scored_applications),
            'applications': scored_applications
        }
        
        print(f"✅ Processed {len(scored_applications)} applications in partition {partition_id}")
        return result
        
    except Exception as e:
        print(f"❌ Error in pilot process: {str(e)}")
        import traceback
        print(f"📋 Full traceback: {traceback.format_exc()}")
        raise e

def calculate_pilot_score(application, criteria):
    """Calculate pilot score based on business drivers and technical feasibility with enhanced differentiation"""
    
    # Get weights from criteria (with defaults)
    weights = criteria.get('weights', {
        'businessDriver': 30,
        'compellingEvent': 25,
        'feasibility': 25,
        'impact': 20
    })
    
    # Get risk tolerance (0-100, higher = more risk acceptable)
    risk_tolerance = criteria.get('riskTolerance', 50)
    
    # Get team capabilities
    team_capabilities = criteria.get('teamCapabilities', [])
    
    # Get business drivers for alignment scoring
    business_drivers = criteria.get('drivers', [])
    
    # ===== ENHANCED BUSINESS DRIVER SCORING =====
    business_score = 0
    if business_drivers:
        # Base criticality score
        criticality = application.get('criticality', '').lower()
        if 'high' in criticality:
            business_score = 25
        elif 'medium' in criticality:
            business_score = 18
        else:
            business_score = 10
        
        # Add strategic alignment bonus based on drivers
        alignment_bonus = 0
        purpose = application.get('purpose', '').lower()
        department = application.get('department', '').lower()
        
        # Cost optimization driver
        if 'cost' in business_drivers:
            # High resource utilization = good cost optimization candidate
            avg_cpu_util = application.get('avg_cpu_utilization', 0)
            avg_mem_util = application.get('avg_memory_utilization', 0)
            if avg_cpu_util < 30 or avg_mem_util < 30:  # Underutilized
                alignment_bonus += 3
            
        # Agility driver
        if 'agility' in business_drivers:
            # Modern tech stack = better agility
            runtime = application.get('runtime', '').lower()
            if 'node' in runtime or 'python' in runtime:
                alignment_bonus += 2
            if 'microservice' in purpose or 'api' in purpose:
                alignment_bonus += 2
        
        # Innovation driver
        if 'innovation' in business_drivers:
            if 'customer' in purpose or 'portal' in purpose or 'platform' in purpose:
                alignment_bonus += 3
        
        # Compliance driver
        if 'compliance' in business_drivers:
            if 'legal' in department or 'compliance' in purpose or 'audit' in purpose:
                alignment_bonus += 3
        
        business_score = min(business_score + alignment_bonus, 30)
    
    # Apply business driver weight
    weighted_business_score = (business_score * weights.get('businessDriver', 30)) / 30
    
    # ===== ENHANCED TECHNICAL FEASIBILITY SCORING =====
    technical_score = 0
    runtime = application.get('runtime', '').lower()
    framework = application.get('framework', '').lower()
    
    # Base technology modernity score (0-12 points)
    modernity_score = 0
    if 'node' in runtime or 'python' in runtime:
        modernity_score = 12  # Modern, cloud-friendly
    elif 'java' in runtime:
        if '17' in runtime or '21' in runtime:
            modernity_score = 10  # Modern Java
        else:
            modernity_score = 7  # Older Java
    elif '.net' in runtime or 'dotnet' in runtime:
        if 'core' in runtime:
            modernity_score = 10  # .NET Core
        else:
            modernity_score = 6  # .NET Framework
    else:
        modernity_score = 4  # Legacy or unknown
    
    # Complexity penalty (0-8 points, inverted - simpler is better)
    complexity_penalty = 0
    
    # Count technology components
    num_runtimes = len([r for r in application.get('runtime', '').split(',') if r.strip()])
    num_frameworks = len([f for f in application.get('framework', '').split(',') if f.strip()])
    num_databases = len([d for d in application.get('databases', '').split(',') if d.strip()])
    num_integrations = len([i for i in application.get('integrations', '').split(',') if i.strip()])
    num_storages = len([s for s in application.get('storages', '').split(',') if s.strip()])
    
    total_components = num_runtimes + num_frameworks + num_databases + num_integrations + num_storages
    
    # Simpler applications are easier to migrate
    if total_components <= 3:
        complexity_penalty = 0  # Very simple
    elif total_components <= 6:
        complexity_penalty = 2  # Moderate
    elif total_components <= 10:
        complexity_penalty = 4  # Complex
    else:
        complexity_penalty = 6  # Very complex
    
    # Team capability alignment (0-8 points)
    capability_score = 0
    if 'cloud_architecture' in team_capabilities:
        capability_score += 3
    if 'containerization' in team_capabilities:
        capability_score += 2
    if 'microservices' in team_capabilities:
        capability_score += 2
    if 'devops' in team_capabilities:
        capability_score += 1
    
    technical_score = modernity_score - complexity_penalty + capability_score
    technical_score = max(5, min(technical_score, 30))  # Clamp between 5-30
    
    # Apply feasibility weight
    weighted_technical_score = (technical_score * weights.get('feasibility', 25)) / 25
    
    # ===== ENHANCED RISK ASSESSMENT =====
    base_risk_score = 15
    
    # Environment risk
    environment = application.get('environment', '').lower()
    if 'production' in environment:
        base_risk_score -= 3  # Higher risk
    elif 'dev' in environment or 'test' in environment:
        base_risk_score += 3  # Lower risk
    
    # Utilization risk (high utilization = higher risk to migrate)
    avg_cpu_util = application.get('avg_cpu_utilization', 0)
    avg_mem_util = application.get('avg_memory_utilization', 0)
    
    if avg_cpu_util > 70 or avg_mem_util > 70:
        base_risk_score -= 4  # High utilization = risky
    elif avg_cpu_util < 30 and avg_mem_util < 30:
        base_risk_score += 3  # Low utilization = safer
    
    # Complexity risk
    if total_components > 10:
        base_risk_score -= 3  # Very complex = risky
    elif total_components <= 3:
        base_risk_score += 2  # Simple = safer
    
    # Adjust risk score based on risk tolerance
    # Higher risk tolerance = higher scores for risky applications
    risk_adjustment = (risk_tolerance - 50) / 10  # -5 to +5 adjustment
    risk_score = base_risk_score + risk_adjustment
    risk_score = max(5, min(risk_score, 25))  # Clamp between 5-25
    
    # ===== ENHANCED USER BASE / IMPACT SCORING =====
    user_score = 10  # Base score
    
    # Use server count as proxy for scale
    num_servers = len([s for s in application.get('servername', '').split(',') if s.strip()])
    if num_servers >= 5:
        user_score += 5  # Large scale
    elif num_servers >= 2:
        user_score += 3  # Medium scale
    elif num_servers == 1:
        user_score += 1  # Small scale
    
    # Use network traffic as proxy for usage
    avg_network_in = application.get('avg_network_in', 0)
    avg_network_out = application.get('avg_network_out', 0)
    total_network = avg_network_in + avg_network_out
    
    if total_network > 1000:  # High traffic
        user_score += 4
    elif total_network > 100:  # Medium traffic
        user_score += 2
    
    # Department importance
    department = application.get('department', '').lower()
    if 'sales' in department or 'customer' in department or 'revenue' in department:
        user_score += 2  # Revenue-generating departments
    
    user_score = min(user_score, 20)  # Cap at 20
    
    # Apply impact weight
    weighted_impact_score = (user_score * weights.get('impact', 20)) / 20
    
    # ===== COMPELLING EVENTS SCORING =====
    event_score = 0
    if criteria.get('events'):
        event_score = 10  # Base score for having compelling events
    
    # Apply compelling event weight
    weighted_event_score = (event_score * weights.get('compellingEvent', 25)) / 25
    
    # ===== CALCULATE TOTAL SCORE =====
    total_score = weighted_business_score + weighted_technical_score + risk_score + weighted_impact_score + weighted_event_score
    
    return {
        'total': min(round(total_score), 100),  # Cap at 100
        'business_driver': round(weighted_business_score),
        'technical_feasibility': round(weighted_technical_score),
        'risk': round(risk_score),
        'user_base': round(weighted_impact_score),
        'compelling_events': round(weighted_event_score)
    }