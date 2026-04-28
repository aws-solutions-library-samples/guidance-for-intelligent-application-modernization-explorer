// Force deployment timestamp: 2025-07-22T11:18:04.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:31:40.3NZ';

/**
 * Athena Query Lambda Function
 * Executes pre-defined Athena query templates with parameterized inputs
 * 
 * SECURITY: This function uses query templates to prevent SQL injection attacks.
 * All SQL queries are pre-defined and user inputs are safely parameterized.
 */

const AWS = require('aws-sdk');
const athena = new AWS.Athena();

// Environment variables with placeholders
const GLUE_DATABASE = process.env.GLUE_DATABASE;
const RESULTS_BUCKET = process.env.RESULTS_BUCKET;
const ATHENA_WORKGROUP = process.env.ATHENA_WORKGROUP;
const ENVIRONMENT = process.env.ENVIRONMENT || 'dev';

/**
 * Pre-defined query templates for security
 * Each template defines the SQL structure and required parameters
 */
const QUERY_TEMPLATES = {
  // Team Skills Queries
  'team-skills-all': {
    sql: `SELECT id, skill, category, CAST(proficiency AS INTEGER) as proficiency, team, CAST(members AS INTEGER) as members, notes FROM "app_modex_\${projectId}".team_skills ORDER BY skill ASC`,
    params: []
  },
  'team-skills-distinct': {
    sql: `SELECT DISTINCT skill, category, CAST(proficiency AS INTEGER) as proficiency, team, CAST(members AS INTEGER) as members, notes FROM "app_modex_\${projectId}".team_skills ORDER BY skill ASC`,
    params: []
  },
  'team-skills-by-team': {
    sql: `SELECT skill, category, CAST(proficiency AS INTEGER) as proficiency, team, CAST(members AS INTEGER) as members, notes FROM "app_modex_\${projectId}".team_skills WHERE team = ? ORDER BY skill ASC`,
    params: ['team']
  },

  // Technology Vision Queries
  'tech-vision-all': {
    sql: `SELECT id, technology, quadrant, phase FROM "app_modex_\${projectId}".v_tech_vision ORDER BY technology ASC`,
    params: []
  },
  'tech-vision-distinct': {
    sql: `SELECT DISTINCT technology, quadrant, phase FROM "app_modex_\${projectId}".v_tech_vision ORDER BY technology ASC`,
    params: []
  },

  // Application Portfolio Queries
  'application-portfolio-all': {
    sql: `SELECT id, applicationname as applicationName, department, criticality, purpose FROM "app_modex_\${projectId}".application_portfolio ORDER BY applicationname ASC`,
    params: []
  },
  'application-portfolio-distinct': {
    sql: `SELECT DISTINCT applicationname as applicationName, department, criticality, purpose FROM "app_modex_\${projectId}".application_portfolio ORDER BY applicationname ASC`,
    params: []
  },

  // Tech Stack Queries
  'tech-stack-all': {
    sql: `SELECT id, applicationname as applicationName, componentname as componentName, runtime, framework, databases, integrations, storages FROM "app_modex_\${projectId}".v_tech_stack ORDER BY applicationname ASC, componentname ASC`,
    params: []
  },
  'tech-stack-distinct': {
    sql: `SELECT DISTINCT applicationname as applicationName, componentname as componentName, runtime, framework, databases, integrations, storages FROM "app_modex_\${projectId}".v_tech_stack ORDER BY applicationname ASC, componentname ASC`,
    params: []
  },
  'tech-stack-by-applications': {
    sql: `SELECT applicationname as applicationName, runtime, framework, databases, integrations, storages FROM "app_modex_\${projectId}".v_tech_stack WHERE applicationname IN (?) ORDER BY applicationname ASC`,
    params: ['applicationNames']
  },

  // Infrastructure Queries
  'infrastructure-all': {
    sql: `SELECT id, applicationname as applicationName, servername as serverName, servertype as serverType, cpu, memory, storage, region, environment, notes, ostype as osType, osversion as osVersion, dbengineversion as dbEngineVersion, dbclusterid as dbClusterId, dbclustertype as dbClusterType, orchestrationplatform as orchestrationPlatform FROM "app_modex_\${projectId}".infrastructure_resources ORDER BY applicationname ASC`,
    params: []
  },
  'infrastructure-distinct': {
    sql: `SELECT DISTINCT applicationname as applicationName, servername as serverName, servertype as serverType, cpu, memory, storage, region, environment, notes, ostype as osType, osversion as osVersion, dbengineversion as dbEngineVersion, dbclusterid as dbClusterId, dbclustertype as dbClusterType, orchestrationplatform as orchestrationPlatform FROM "app_modex_\${projectId}".infrastructure_resources ORDER BY applicationname ASC`,
    params: []
  },

  // Resource Utilization Queries
  'resource-utilization-all': {
    sql: `SELECT * FROM "app_modex_\${projectId}".resource_utilization ORDER BY timestamp DESC`,
    params: []
  },
  'resource-utilization-distinct': {
    sql: `SELECT DISTINCT * FROM "app_modex_\${projectId}".resource_utilization ORDER BY timestamp DESC`,
    params: []
  },

  // Skill Gap Analysis Queries
  'skill-gaps-all': {
    sql: `WITH skill_importance AS (SELECT team, skill, category, importance_score, confidence as ai_confidence, rationale as ai_rationale FROM skill_importance_scores), skill_gaps AS (SELECT s.team, s.skill, s.category, s.proficiency as actual_proficiency, CASE WHEN si.importance_score IS NULL OR si.importance_score = 0 THEN NULL ELSE ROUND(1.0 + (si.importance_score / 100.0 * 4.0), 1) END as expected_proficiency, CASE WHEN si.importance_score IS NULL OR si.importance_score = 0 THEN NULL ELSE ROUND((1.0 + (si.importance_score / 100.0 * 4.0)) - s.proficiency, 1) END as skill_gap, si.importance_score, si.ai_confidence, si.ai_rationale FROM v_team_skills s LEFT JOIN skill_importance si ON s.team = si.team AND s.skill = si.skill) SELECT team, skill, category, actual_proficiency, expected_proficiency, skill_gap, importance_score, ai_confidence, ai_rationale FROM skill_gaps ORDER BY team, importance_score DESC NULLS LAST, skill_gap DESC NULLS LAST, skill`,
    params: []
  },

  // Team Skill Details Queries
  'team-skill-details': {
    sql: `WITH skill_importance AS (SELECT team, skill, category, importance_score, confidence as ai_confidence, rationale as ai_rationale FROM skill_importance_scores WHERE team = ?), team_skill_details AS (SELECT s.team, s.skill, s.category, s.proficiency as actual_proficiency, CASE WHEN si.importance_score IS NULL OR si.importance_score = 0 THEN NULL ELSE ROUND(1.0 + (si.importance_score / 100.0 * 4.0), 1) END as expected_proficiency, CASE WHEN si.importance_score IS NULL OR si.importance_score = 0 THEN NULL ELSE ROUND((1.0 + (si.importance_score / 100.0 * 4.0)) - s.proficiency, 1) END as skill_gap, CASE WHEN si.importance_score IS NULL OR si.importance_score = 0 THEN NULL WHEN (1.0 + (si.importance_score / 100.0 * 4.0)) - s.proficiency > 1.5 THEN 'Critical' WHEN (1.0 + (si.importance_score / 100.0 * 4.0)) - s.proficiency >= 1.0 THEN 'High' WHEN (1.0 + (si.importance_score / 100.0 * 4.0)) - s.proficiency >= 0.5 THEN 'Medium' WHEN (1.0 + (si.importance_score / 100.0 * 4.0)) - s.proficiency > 0 THEN 'Low' WHEN (1.0 + (si.importance_score / 100.0 * 4.0)) - s.proficiency = 0 THEN 'Aligned' ELSE 'Exceeds' END as gap_severity, CASE WHEN si.importance_score IS NULL OR si.importance_score = 0 THEN NULL WHEN (1.0 + (si.importance_score / 100.0 * 4.0)) - s.proficiency > 0.5 THEN true ELSE false END as needs_upskilling, COALESCE(tcw.weight, 0.0) as category_weight, si.importance_score, si.ai_confidence, si.ai_rationale FROM v_team_skills s LEFT JOIN skill_importance si ON s.team = si.team AND s.skill = si.skill LEFT JOIN team_category_weights tcw ON s.team = tcw.teamname AND s.category = tcw.category WHERE s.team = ?) SELECT team, skill, category, actual_proficiency, expected_proficiency, skill_gap, gap_severity, needs_upskilling, category_weight, importance_score, ai_confidence, ai_rationale FROM team_skill_details ORDER BY importance_score DESC NULLS LAST, CASE gap_severity WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 WHEN 'Low' THEN 4 WHEN 'Aligned' THEN 5 WHEN 'Exceeds' THEN 6 END, skill_gap DESC NULLS LAST, skill`,
    params: ['team', 'team']
  },

  // Vision Skill Gap Queries
  'vision-skill-gaps-all': {
    sql: `WITH tech_vision_expectations AS (SELECT technology, quadrant, phase, CASE phase WHEN 'Adopt' THEN 4.5 WHEN 'Trial' THEN 3.5 WHEN 'Assess' THEN 2.5 WHEN 'Hold' THEN 1.5 ELSE 2.0 END as expected_proficiency FROM v_tech_vision), team_vision_gaps AS (SELECT s.team, s.skill, s.category, s.proficiency as actual_proficiency, tv.quadrant, tv.phase, COALESCE(tv.expected_proficiency, 2.0) as expected_proficiency, ROUND(COALESCE(tv.expected_proficiency, 2.0) - s.proficiency, 1) as skill_gap, CASE WHEN COALESCE(tv.expected_proficiency, 2.0) - s.proficiency > 2.0 THEN 'Critical' WHEN COALESCE(tv.expected_proficiency, 2.0) - s.proficiency >= 1.5 THEN 'High' WHEN COALESCE(tv.expected_proficiency, 2.0) - s.proficiency >= 1.0 THEN 'Medium' WHEN COALESCE(tv.expected_proficiency, 2.0) - s.proficiency > 0 THEN 'Low' WHEN COALESCE(tv.expected_proficiency, 2.0) - s.proficiency = 0 THEN 'Aligned' ELSE 'Exceeds' END as gap_severity, CASE WHEN COALESCE(tv.expected_proficiency, 2.0) - s.proficiency > 1.0 THEN true ELSE false END as needs_upskilling FROM v_team_skills s LEFT JOIN tech_vision_expectations tv ON LOWER(s.skill) = LOWER(tv.technology) WHERE tv.technology IS NOT NULL) SELECT team, skill, category, actual_proficiency, expected_proficiency, skill_gap, gap_severity, needs_upskilling, quadrant, phase FROM team_vision_gaps ORDER BY team, gap_severity, skill_gap DESC, skill`,
    params: []
  },

  // Team Vision Skill Details
  'team-vision-skill-details': {
    sql: `WITH tech_vision_expectations AS (SELECT technology, quadrant, phase, CASE phase WHEN 'Adopt' THEN 4.5 WHEN 'Trial' THEN 3.5 WHEN 'Assess' THEN 2.5 WHEN 'Hold' THEN 1.5 ELSE 2.0 END as expected_proficiency FROM v_tech_vision), team_vision_skill_details AS (SELECT s.team, s.skill, s.category, s.proficiency as actual_proficiency, tv.quadrant, tv.phase, COALESCE(tv.expected_proficiency, 2.0) as expected_proficiency, ROUND(COALESCE(tv.expected_proficiency, 2.0) - s.proficiency, 1) as skill_gap, CASE WHEN COALESCE(tv.expected_proficiency, 2.0) - s.proficiency > 2.0 THEN 'Critical' WHEN COALESCE(tv.expected_proficiency, 2.0) - s.proficiency >= 1.5 THEN 'High' WHEN COALESCE(tv.expected_proficiency, 2.0) - s.proficiency >= 1.0 THEN 'Medium' WHEN COALESCE(tv.expected_proficiency, 2.0) - s.proficiency > 0 THEN 'Low' WHEN COALESCE(tv.expected_proficiency, 2.0) - s.proficiency = 0 THEN 'Aligned' ELSE 'Exceeds' END as gap_severity, CASE WHEN COALESCE(tv.expected_proficiency, 2.0) - s.proficiency > 1.0 THEN true ELSE false END as needs_upskilling FROM v_team_skills s LEFT JOIN tech_vision_expectations tv ON LOWER(s.skill) = LOWER(tv.technology) WHERE s.team = ? AND tv.technology IS NOT NULL) SELECT team, skill, category, actual_proficiency, expected_proficiency, skill_gap, gap_severity, needs_upskilling, quadrant, phase FROM team_vision_skill_details ORDER BY CASE gap_severity WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 WHEN 'Low' THEN 4 WHEN 'Aligned' THEN 5 WHEN 'Exceeds' THEN 6 END, skill_gap DESC, skill`,
    params: ['team']
  },

  // All Teams Skill Details
  'all-teams-skill-details': {
    sql: `WITH skill_importance AS (SELECT team, skill, category, importance_score, confidence as ai_confidence, rationale as ai_rationale FROM skill_importance_scores), all_teams_skill_details AS (SELECT s.team, s.skill, s.category, s.proficiency as actual_proficiency, CASE WHEN si.importance_score IS NULL OR si.importance_score = 0 THEN NULL ELSE ROUND(1.0 + (si.importance_score / 100.0 * 4.0), 1) END as expected_proficiency, CASE WHEN si.importance_score IS NULL OR si.importance_score = 0 THEN NULL ELSE ROUND((1.0 + (si.importance_score / 100.0 * 4.0)) - s.proficiency, 1) END as skill_gap, CASE WHEN si.importance_score IS NULL OR si.importance_score = 0 THEN NULL WHEN (1.0 + (si.importance_score / 100.0 * 4.0)) - s.proficiency > 1.5 THEN 'Critical' WHEN (1.0 + (si.importance_score / 100.0 * 4.0)) - s.proficiency >= 1.0 THEN 'High' WHEN (1.0 + (si.importance_score / 100.0 * 4.0)) - s.proficiency >= 0.5 THEN 'Medium' WHEN (1.0 + (si.importance_score / 100.0 * 4.0)) - s.proficiency > 0 THEN 'Low' WHEN (1.0 + (si.importance_score / 100.0 * 4.0)) - s.proficiency = 0 THEN 'Aligned' ELSE 'Exceeds' END as gap_severity, CASE WHEN si.importance_score IS NULL OR si.importance_score = 0 THEN NULL WHEN (1.0 + (si.importance_score / 100.0 * 4.0)) - s.proficiency > 0.5 THEN true ELSE false END as needs_upskilling, COALESCE(tcw.weight, 0.0) as category_weight, si.importance_score, si.ai_confidence, si.ai_rationale FROM v_team_skills s LEFT JOIN skill_importance si ON s.team = si.team AND s.skill = si.skill LEFT JOIN team_category_weights tcw ON s.team = tcw.teamname AND s.category = tcw.category) SELECT team, skill, category, actual_proficiency, expected_proficiency, skill_gap, gap_severity, needs_upskilling, category_weight, importance_score, ai_confidence, ai_rationale FROM all_teams_skill_details ORDER BY team, importance_score DESC NULLS LAST, CASE gap_severity WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 WHEN 'Low' THEN 4 WHEN 'Aligned' THEN 5 WHEN 'Exceeds' THEN 6 END, skill_gap DESC NULLS LAST, skill`,
    params: []
  },

  // All Teams Vision Skill Details
  'all-teams-vision-skill-details': {
    sql: `WITH tech_vision_expectations AS (SELECT technology, quadrant, phase, CASE phase WHEN 'Adopt' THEN 4.5 WHEN 'Trial' THEN 3.5 WHEN 'Assess' THEN 2.5 WHEN 'Hold' THEN 1.5 ELSE 2.0 END as expected_proficiency FROM v_tech_vision), all_teams_vision_skill_details AS (SELECT s.team, s.skill, s.category, s.proficiency as actual_proficiency, tv.quadrant, tv.phase, COALESCE(tv.expected_proficiency, 2.0) as expected_proficiency, ROUND(COALESCE(tv.expected_proficiency, 2.0) - s.proficiency, 1) as skill_gap, CASE WHEN COALESCE(tv.expected_proficiency, 2.0) - s.proficiency > 2.0 THEN 'Critical' WHEN COALESCE(tv.expected_proficiency, 2.0) - s.proficiency >= 1.5 THEN 'High' WHEN COALESCE(tv.expected_proficiency, 2.0) - s.proficiency >= 1.0 THEN 'Medium' WHEN COALESCE(tv.expected_proficiency, 2.0) - s.proficiency > 0 THEN 'Low' WHEN COALESCE(tv.expected_proficiency, 2.0) - s.proficiency = 0 THEN 'Aligned' ELSE 'Exceeds' END as gap_severity, CASE WHEN COALESCE(tv.expected_proficiency, 2.0) - s.proficiency > 1.0 THEN true ELSE false END as needs_upskilling FROM v_team_skills s LEFT JOIN tech_vision_expectations tv ON LOWER(s.skill) = LOWER(tv.technology) WHERE tv.technology IS NOT NULL) SELECT team, skill, category, actual_proficiency, expected_proficiency, skill_gap, gap_severity, needs_upskilling, quadrant, phase FROM all_teams_vision_skill_details ORDER BY team, CASE gap_severity WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 WHEN 'Low' THEN 4 WHEN 'Aligned' THEN 5 WHEN 'Exceeds' THEN 6 END, skill_gap DESC, skill`,
    params: []
  },

  // Vision Gaps - Technologies with no corresponding skills
  'vision-gaps': {
    sql: `WITH tech_vision_expectations AS (SELECT technology, quadrant, phase, CASE phase WHEN 'Adopt' THEN 4.5 WHEN 'Trial' THEN 3.5 WHEN 'Assess' THEN 2.5 WHEN 'Hold' THEN 1.5 ELSE 2.0 END as expected_proficiency FROM v_tech_vision), existing_skills AS (SELECT DISTINCT LOWER(skill) as skill_lower FROM v_team_skills), vision_gaps AS (SELECT tv.technology, tv.quadrant, tv.phase, tv.expected_proficiency, CASE tv.phase WHEN 'Adopt' THEN 'Critical' WHEN 'Trial' THEN 'High' WHEN 'Assess' THEN 'Medium' WHEN 'Hold' THEN 'Low' ELSE 'Medium' END as gap_severity, CASE WHEN tv.expected_proficiency >= 4.0 THEN 'High Impact' WHEN tv.expected_proficiency >= 3.0 THEN 'Medium Impact' ELSE 'Low Impact' END as strategic_impact, CASE tv.phase WHEN 'Adopt' THEN 'Immediate training/hiring required' WHEN 'Trial' THEN 'Start experimentation and skill building' WHEN 'Assess' THEN 'Begin evaluation and awareness building' WHEN 'Hold' THEN 'Monitor - may be intentionally avoided' ELSE 'Evaluate strategic importance' END as recommendation FROM tech_vision_expectations tv LEFT JOIN existing_skills es ON LOWER(tv.technology) = es.skill_lower WHERE es.skill_lower IS NULL) SELECT technology, quadrant, phase, expected_proficiency, gap_severity, strategic_impact, recommendation FROM vision_gaps ORDER BY CASE phase WHEN 'Adopt' THEN 1 WHEN 'Trial' THEN 2 WHEN 'Assess' THEN 3 WHEN 'Hold' THEN 4 END, expected_proficiency DESC, technology`,
    params: []
  },

  // Data Validation Queries - Record count for each table type
  'table-record-count-team-skills': {
    sql: `SELECT COUNT(*) as record_count FROM "app_modex_\${projectId}".v_team_skills`,
    params: []
  },
  'table-record-count-tech-vision': {
    sql: `SELECT COUNT(*) as record_count FROM "app_modex_\${projectId}".v_tech_vision`,
    params: []
  },
  'table-record-count-application-portfolio': {
    sql: `SELECT COUNT(*) as record_count FROM "app_modex_\${projectId}".v_application_portfolio`,
    params: []
  },
  'table-record-count-tech-stack': {
    sql: `SELECT COUNT(*) as record_count FROM "app_modex_\${projectId}".v_tech_stack`,
    params: []
  },
  'table-record-count-infrastructure-resources': {
    sql: `SELECT COUNT(*) as record_count FROM "app_modex_\${projectId}".v_infrastructure_resources`,
    params: []
  },
  'table-record-count-resource-utilization': {
    sql: `SELECT COUNT(*) as record_count FROM "app_modex_\${projectId}".v_resource_utilization`,
    params: []
  },

  // Team Weights Analysis
  'team-weights-analysis': {
    sql: `WITH team_data AS (SELECT team as teamName, MAX(CAST(members AS INTEGER)) as memberCount, COUNT(DISTINCT skill) as skillCount, ARRAY_AGG(DISTINCT category) as categories FROM "app_modex_\${projectId}".team_skills GROUP BY team), weight_data AS (SELECT teamname, MAP_AGG(category, weight) as weights, SUM(weight) as totalWeight FROM "app_modex_\${projectId}".team_category_weights WHERE projectid = ? GROUP BY teamname) SELECT td.teamName, td.memberCount, td.skillCount, td.categories, COALESCE(wd.weights, MAP()) as weights, COALESCE(wd.totalweight, 0.0) as totalWeight FROM team_data td LEFT JOIN weight_data wd ON td.teamName = wd.teamname ORDER BY td.teamName`,
    params: ['projectId']
  },

  // Application Similarity Analysis Queries
  'application-similarity-tech-stack': {
    sql: `SELECT id, applicationname, componentname, runtime, framework, databases, integrations, storages FROM "app_modex_\${projectId}".tech_stack WHERE applicationname IS NOT NULL AND componentname IS NOT NULL ORDER BY applicationname, componentname`,
    params: []
  },

  // Component Similarity Analysis Queries  
  'component-similarity-tech-stack': {
    sql: `SELECT id, applicationname, componentname, runtime, framework, databases, integrations, storages FROM "app_modex_\${projectId}".tech_stack WHERE componentname IS NOT NULL ORDER BY applicationname, componentname`,
    params: []
  },

  // Normalization Queries
  'normalization-existing-values-runtimes': {
    sql: `SELECT DISTINCT original, normalized FROM "app_modex_\${projectId}".normalized_runtimes WHERE confidence_score > 0.8 AND date_diff('day', timestamp, current_timestamp) <= 30 AND original IN (?)`,
    params: ['valuesList']
  },
  'normalization-existing-values-frameworks': {
    sql: `SELECT DISTINCT original, normalized FROM "app_modex_\${projectId}".normalized_frameworks WHERE confidence_score > 0.8 AND date_diff('day', timestamp, current_timestamp) <= 30 AND original IN (?)`,
    params: ['valuesList']
  },
  'normalization-existing-values-databases': {
    sql: `SELECT DISTINCT original, normalized FROM "app_modex_\${projectId}".normalized_databases WHERE confidence_score > 0.8 AND date_diff('day', timestamp, current_timestamp) <= 30 AND original IN (?)`,
    params: ['valuesList']
  },
  'normalization-existing-values-integrations': {
    sql: `SELECT DISTINCT original, normalized FROM "app_modex_\${projectId}".normalized_integrations WHERE confidence_score > 0.8 AND date_diff('day', timestamp, current_timestamp) <= 30 AND original IN (?)`,
    params: ['valuesList']
  },
  'normalization-existing-values-storage': {
    sql: `SELECT DISTINCT original, normalized FROM "app_modex_\${projectId}".normalized_storage WHERE confidence_score > 0.8 AND date_diff('day', timestamp, current_timestamp) <= 30 AND original IN (?)`,
    params: ['valuesList']
  },

  // Pilot Analysis Query - Comprehensive application data for pilot identification
  'pilot-analysis-applications': {
    sql: `SELECT ap.applicationname, ap.department, ap.criticality, ap.purpose, ts.runtime, ts.framework, ts.databases, ts.integrations, ts.storages, inf.servername, inf.servertype, inf.orchestrationplatform, inf.environment, inf.cpu, inf.memory, util.cpuutilization, util.memoryutilization, util.storageutilization, util.networkin, util.networkout FROM "app_modex_\${projectId}".application_portfolio ap LEFT JOIN "app_modex_\${projectId}".tech_stack ts ON ap.applicationname = ts.applicationname LEFT JOIN "app_modex_\${projectId}".infrastructure_resources inf ON ap.applicationname = inf.applicationname LEFT JOIN "app_modex_\${projectId}".resource_utilization util ON ap.applicationname = util.applicationname WHERE ap.applicationname IS NOT NULL ORDER BY ap.applicationname`,
    params: []
  }
};

/**
 * Safely escape SQL parameter values to prevent injection
 */
function escapeSqlParameter(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  
  // Convert to string and escape single quotes
  const stringValue = String(value);
  return `'${stringValue.replace(/'/g, "''")}'`;
}

/**
 * Execute a pre-defined Athena query template with parameters
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  console.log('Environment variables:', {
    GLUE_DATABASE,
    RESULTS_BUCKET,
    ENVIRONMENT
  });
  
  // Set up CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
  };
  
  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'CORS preflight successful' })
    };
  }
  
  try {
    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (parseError) {
      console.error('Error parsing request body:', parseError);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Invalid request body format',
          details: 'Request body must be valid JSON'
        })
      };
    }
    
    const { templateId, parameters = {}, projectId, dataType } = body;
    
    if (!projectId) {
      console.error('Missing projectId in request');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Missing projectId',
          details: 'The projectId is required to execute Athena queries'
        })
      };
    }

    if (!templateId) {
      console.error('Missing templateId in request');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Missing templateId',
          details: 'The templateId is required to select a query template'
        })
      };
    }
    
    console.log(`Processing request for template: ${templateId}, project ID: ${projectId}`);
    
    // Get the query template
    const template = QUERY_TEMPLATES[templateId];
    if (!template) {
      console.error(`Unknown template ID: ${templateId}`);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Unknown template ID',
          details: `Template '${templateId}' is not defined`,
          availableTemplates: Object.keys(QUERY_TEMPLATES)
        })
      };
    }

    // Validate parameters
    const missingParams = template.params.filter(param => !(param in parameters));
    if (missingParams.length > 0) {
      console.error(`Missing required parameters: ${missingParams.join(', ')}`);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Missing required parameters',
          details: `Template '${templateId}' requires parameters: ${template.params.join(', ')}`,
          missingParameters: missingParams
        })
      };
    }

    // Build the final query with project ID and parameters
    let finalQuery = template.sql.replace(/\$\{projectId\}/g, projectId);
    
    // Replace parameter placeholders with escaped values
    template.params.forEach(param => {
      const value = parameters[param];
      let escapedValue;
      
      // Handle array parameters for IN clauses
      if (Array.isArray(value)) {
        const escapedArray = value.map(v => escapeSqlParameter(v)).join(', ');
        escapedValue = escapedArray;
      } else {
        escapedValue = escapeSqlParameter(value);
      }
      
      finalQuery = finalQuery.replace('?', escapedValue);
    });
    
    console.log(`Executing template '${templateId}' with query:`, finalQuery);
    
    // Start the Athena query
    const queryExecutionId = await startAthenaQuery(finalQuery, projectId);
    console.log(`Started Athena query with execution ID: ${queryExecutionId}`);
    
    // Wait for the query to complete
    const status = await waitForQueryCompletion(queryExecutionId);
    console.log(`Query execution completed with status: ${status}`);
    
    if (status === 'SUCCEEDED') {
      // Get the query results
      const queryResults = await getQueryResults(queryExecutionId);
      const processedResults = processQueryResults(queryResults);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          data: processedResults,
          metadata: {
            executionId: queryExecutionId,
            templateId,
            dataType,
            projectId,
            database: GLUE_DATABASE.replace('${projectId}', projectId),
            resultsBucket: RESULTS_BUCKET.replace('${projectId}', projectId).toLowerCase(),
            rowCount: processedResults.length,
            parameters
          }
        })
      };
    } else {
      // Query failed
      const queryExecution = await getQueryExecution(queryExecutionId);
      const errorMessage = queryExecution.QueryExecution.Status.StateChangeReason || 'Unknown error';
      
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: `Query execution failed: ${status}`,
          details: errorMessage,
          templateId,
          projectId
        })
      };
    }
  } catch (error) {
    console.error('Error processing request:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to process request',
        details: error.toString()
      })
    };
  }
};

/**
 * Start an Athena query execution
 */
async function startAthenaQuery(query, projectId) {
  // Construct the database name and results bucket based on the project ID
  const database = GLUE_DATABASE.replace('${projectId}', projectId);
  const resultsBucket = RESULTS_BUCKET.replace('${projectId}', projectId).toLowerCase(); // Convert to lowercase for S3 compatibility
  const workgroup = ATHENA_WORKGROUP.replace('${projectId}', projectId);
  
  console.log(`Using workgroup: ${workgroup}, database: ${database}, results bucket: ${resultsBucket}`);
  
  const params = {
    QueryString: query,
    QueryExecutionContext: {
      Database: database
    },
    ResultConfiguration: {
      OutputLocation: `s3://${resultsBucket}/query-results/`
    },
    WorkGroup: workgroup
  };
  
  const result = await athena.startQueryExecution(params).promise();
  return result.QueryExecutionId;
}

/**
 * Wait for an Athena query to complete
 */
async function waitForQueryCompletion(queryExecutionId) {
  let status = 'QUEUED';
  
  while (status === 'QUEUED' || status === 'RUNNING') {
    const queryExecution = await getQueryExecution(queryExecutionId);
    status = queryExecution.QueryExecution.Status.State;
    
    if (status === 'QUEUED' || status === 'RUNNING') {
      // Wait for 1 second before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return status;
}

/**
 * Get the execution details of an Athena query
 */
async function getQueryExecution(queryExecutionId) {
  const params = {
    QueryExecutionId: queryExecutionId
  };
  
  return await athena.getQueryExecution(params).promise();
}

/**
 * Get the results of an Athena query
 */
async function getQueryResults(queryExecutionId) {
  const params = {
    QueryExecutionId: queryExecutionId
  };
  
  return await athena.getQueryResults(params).promise();
}

/**
 * Process Athena query results into a more usable format
 */
function processQueryResults(results) {
  if (!results.ResultSet || !results.ResultSet.Rows || results.ResultSet.Rows.length === 0) {
    return [];
  }
  
  // Extract column names from the first row
  const columnNames = results.ResultSet.Rows[0].Data.map(column => column.VarCharValue);
  
  // Process data rows (skip the header row)
  return results.ResultSet.Rows.slice(1).map(row => {
    const rowData = {};
    row.Data.forEach((column, index) => {
      rowData[columnNames[index]] = column.VarCharValue;
    });
    return rowData;
  });
}