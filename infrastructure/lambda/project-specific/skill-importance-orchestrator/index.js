const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } = require('@aws-sdk/client-athena');

const s3 = new S3Client({});
const athena = new AthenaClient({});

const PROJECT_ID = process.env.PROJECT_ID;
const PROJECT_BUCKET = process.env.PROJECT_BUCKET;
const RESULTS_BUCKET = process.env.RESULTS_BUCKET;
const GLUE_DATABASE = process.env.GLUE_DATABASE;
const WORKGROUP_NAME = process.env.WORKGROUP_NAME;

const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('Skill Importance Orchestrator started');
  console.log('Event:', JSON.stringify(sanitizeEvent(event), null, 2));

  try {
    const { projectId, processId, processTableName } = event;
    const teamWeights = await readTeamWeights(projectId);
    console.log(`Loaded weights for ${teamWeights.length} teams`);
    const teamSkills = await queryTeamSkills(projectId);
    console.log(`Loaded skills for ${Object.keys(teamSkills).length} teams`);
    const teams = prepareTeamsData(teamWeights, teamSkills, projectId, processId);
    console.log(`Prepared ${teams.length} teams for processing`);

    return {
      projectId,
      processId,
      processTableName,
      teams,
      s3OutputBucket: PROJECT_BUCKET,
      s3OutputPrefix: 'data-processed/skill-importance-scores/',
      totalTeams: teams.length
    };
  } catch (error) {
    console.error('Error in orchestrator:', error);
    throw error;
  }
};

async function readTeamWeights(projectId) {
  const key = 'data-processed/team-category-weights/weights.csv';
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: PROJECT_BUCKET, Key: key }));
    const csvData = await streamToString(response.Body);
    const lines = csvData.trim().split('\n');
    if (lines.length < 2) throw new Error('Team weights file is empty');
    const teamWeightsMap = {};
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = parseCSVLine(line);
      const [projectIdVal, teamName, category, weight] = values;
      if (!teamWeightsMap[teamName]) teamWeightsMap[teamName] = {};
      teamWeightsMap[teamName][category] = parseFloat(weight) || 0;
    }
    return Object.entries(teamWeightsMap).map(([teamName, weights]) => ({ teamName, weights }));
  } catch (error) {
    if (error.name === 'NoSuchKey') return [];
    throw error;
  }
}

async function queryTeamSkills(projectId) {
  const query = `SELECT team, skill, category, proficiency FROM "${GLUE_DATABASE}".team_skills WHERE project_id = '${projectId}' ORDER BY team, skill`;
  console.log(`🔍 Executing Athena query: ${query}`);
  console.log(`📊 Using database: ${GLUE_DATABASE}, workgroup: ${WORKGROUP_NAME}`);
  
  try {
    const startResponse = await athena.send(new StartQueryExecutionCommand({
      QueryString: query,
      QueryExecutionContext: { Database: GLUE_DATABASE },
      WorkGroup: WORKGROUP_NAME
    }));
    const queryExecutionId = startResponse.QueryExecutionId;
    console.log(`✅ Query started with ID: ${queryExecutionId}`);
    
    let queryStatus = 'RUNNING';
    let attempts = 0;
    while (queryStatus === 'RUNNING' || queryStatus === 'QUEUED') {
      if (attempts >= 30) throw new Error('Athena query timeout');
      await new Promise(resolve => setTimeout(resolve, 2000));
      const statusResponse = await athena.send(new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId }));
      queryStatus = statusResponse.QueryExecution.Status.State;
      console.log(`⏳ Query status (attempt ${attempts + 1}): ${queryStatus}`);
      
      if (statusResponse.QueryExecution.Status.StateChangeReason) {
        console.log(`📝 Status reason: ${statusResponse.QueryExecution.Status.StateChangeReason}`);
      }
      
      attempts++;
    }
    
    if (queryStatus !== 'SUCCEEDED') {
      const statusResponse = await athena.send(new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId }));
      const errorMessage = statusResponse.QueryExecution.Status.StateChangeReason || 'Unknown error';
      console.error(`❌ Query failed with status ${queryStatus}: ${errorMessage}`);
      throw new Error(`Athena query failed: ${errorMessage}`);
    }
    
    console.log(`✅ Query succeeded`);
    const resultsResponse = await athena.send(new GetQueryResultsCommand({ QueryExecutionId: queryExecutionId }));
    const teamSkillsMap = {};
    const rows = resultsResponse.ResultSet.Rows;
    console.log(`📋 Retrieved ${rows.length} rows from Athena`);
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const team = row.Data[0]?.VarCharValue;
      const skill = row.Data[1]?.VarCharValue;
      const category = row.Data[2]?.VarCharValue;
      const proficiency = parseInt(row.Data[3]?.VarCharValue) || 0;
      if (!team || !skill) continue;
      if (!teamSkillsMap[team]) teamSkillsMap[team] = [];
      teamSkillsMap[team].push({ skill, category: category || 'uncategorized', proficiency });
    }
    
    console.log(`✅ Processed team skills: ${Object.keys(teamSkillsMap).length} teams`);
    return teamSkillsMap;
  } catch (error) {
    console.error(`💥 Error in queryTeamSkills: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
    throw error;
  }
}

function prepareTeamsData(teamWeights, teamSkills, projectId, processId) {
  const teams = [];
  for (const teamWeight of teamWeights) {
    const { teamName, weights } = teamWeight;
    const skills = teamSkills[teamName] || [];
    if (skills.length === 0) continue;
    teams.push({ teamName, weights, skills, projectId, processId });
  }
  return teams;
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
    else current += char;
  }
  values.push(current.trim());
  return values;
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}