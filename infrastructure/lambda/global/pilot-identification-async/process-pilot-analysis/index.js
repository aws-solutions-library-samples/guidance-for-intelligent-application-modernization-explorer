// Force deployment timestamp: 2025-08-06T19:56:58.3NZ
const DEPLOYMENT_TIMESTAMP = '2026-01-20T11:32:21.3NZ';

/**
 * Process Pilot Analysis Lambda Function
 * 
 * This function executes the pilot identification algorithm in the background.
 * It's designed to be triggered by Step Functions for long-running analyses.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, BatchWriteCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand } = require('@aws-sdk/client-athena');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamodb = DynamoDBDocumentClient.from(dynamoClient);
const athena = new AthenaClient({ region: process.env.AWS_REGION });

/**
 * Update job progress in DynamoDB
 */
const updateJobProgress = async (jobId, jobsTableName, progress, status, currentPhase, error = null) => {
  const updateParams = {
    TableName: jobsTableName,
    Key: { jobId },
    UpdateExpression: 'SET progress = :progress, #status = :status, currentPhase = :phase, lastUpdated = :updated',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':progress': progress,
      ':status': status,
      ':phase': currentPhase,
      ':updated': new Date().toISOString()
    }
  };
  
  if (error) {
    updateParams.UpdateExpression += ', #error = :error';
    updateParams.ExpressionAttributeNames['#error'] = 'error';
    updateParams.ExpressionAttributeValues[':error'] = error;
  }
  
  if (status === 'COMPLETED') {
    updateParams.UpdateExpression += ', completedAt = :completedAt';
    updateParams.ExpressionAttributeValues[':completedAt'] = new Date().toISOString();
  }
  
  await dynamodb.send(new UpdateCommand(updateParams));
  
  console.log(`📊 Job progress updated: ${progress}% - ${currentPhase}`);
};

/**
 * Execute Athena query and wait for results
 */
const executeAthenaQuery = async (query, database, resultsBucket) => {
  console.log('🔍 Executing Athena query...');
  
  const params = {
    QueryString: query,
    QueryExecutionContext: {
      Database: database
    },
    ResultConfiguration: {
      OutputLocation: `s3://${resultsBucket}/athena-results/`
    }
  };
  
  const command = new StartQueryExecutionCommand(params);
  const execution = await athena.send(command);
  const executionId = execution.QueryExecutionId;
  
  console.log('⏳ Waiting for query completion:', executionId);
  
  // Poll for completion
  let status = 'RUNNING';
  while (status === 'RUNNING' || status === 'QUEUED') {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    
    const command = new GetQueryExecutionCommand({
      QueryExecutionId: executionId
    });
    const result = await athena.send(command);
    
    status = result.QueryExecution.Status.State;
    
    if (status === 'FAILED' || status === 'CANCELLED') {
      throw new Error(`Query failed: ${result.QueryExecution.Status.StateChangeReason}`);
    }
  }
  
  // Get results
  const resultsCommand = new GetQueryResultsCommand({
    QueryExecutionId: executionId
  });
  const results = await athena.send(resultsCommand);
  
  console.log('✅ Query completed successfully');
  return results.ResultSet;
};

/**
 * Parse Athena results into JavaScript objects
 */
const parseAthenaResults = (resultSet) => {
  if (!resultSet.Rows || resultSet.Rows.length === 0) {
    return [];
  }
  
  // First row contains column names
  const columns = resultSet.Rows[0].Data.map(col => col.VarCharValue);
  
  // Remaining rows contain data
  const data = resultSet.Rows.slice(1).map(row => {
    const obj = {};
    row.Data.forEach((cell, index) => {
      obj[columns[index]] = cell.VarCharValue || null;
    });
    return obj;
  });
  
  return data;
};

/**
 * Calculate similarity score between two applications
 */
const calculateSimilarity = (app1, app2) => {
  let score = 0;
  let factors = 0;
  
  // Department similarity (40% weight)
  if (app1.department && app2.department) {
    if (app1.department.toLowerCase() === app2.department.toLowerCase()) {
      score += 40;
    }
    factors += 40;
  }
  
  // Criticality similarity (30% weight)
  if (app1.criticality && app2.criticality) {
    if (app1.criticality.toLowerCase() === app2.criticality.toLowerCase()) {
      score += 30;
    }
    factors += 30;
  }
  
  // Tech stack similarity (30% weight)
  if (app1.runtime && app2.runtime) {
    const runtime1 = app1.runtime.toLowerCase();
    const runtime2 = app2.runtime.toLowerCase();
    
    if (runtime1 === runtime2) {
      score += 30;
    } else if (runtime1.includes(runtime2) || runtime2.includes(runtime1)) {
      score += 15; // Partial match
    }
    factors += 30;
  }
  
  return factors > 0 ? Math.round((score / factors) * 100) : 0;
};

/**
 * Calculate driver alignment score
 */
const calculateDriverAlignment = (application, selectedDrivers) => {
  // Business driver scoring logic
  const driverScores = {
    'cost': application.criticality === 'Low' ? 80 : application.criticality === 'Medium' ? 60 : 40,
    'agility': application.department === 'IT' ? 90 : 70,
    'compliance': application.criticality === 'High' ? 90 : 60,
    'innovation': application.department === 'R&D' ? 95 : 70,
    'scalability': application.criticality === 'High' ? 85 : 65,
    'security': application.criticality === 'High' ? 90 : 70
  };
  
  let totalScore = 0;
  selectedDrivers.forEach(driver => {
    totalScore += driverScores[driver.toLowerCase()] || 50;
  });
  
  return selectedDrivers.length > 0 ? Math.round(totalScore / selectedDrivers.length) : 50;
};

/**
 * Calculate event alignment score
 */
const calculateEventAlignment = (application, selectedEvents) => {
  // Compelling event scoring logic
  const eventScores = {
    'datacenter': 85,
    'compliance': application.criticality === 'High' ? 90 : 60,
    'cost': application.criticality === 'Low' ? 90 : 50,
    'merger': 75,
    'growth': application.department === 'Sales' ? 90 : 70
  };
  
  let totalScore = 0;
  selectedEvents.forEach(event => {
    totalScore += eventScores[event.toLowerCase()] || 60;
  });
  
  return selectedEvents.length > 0 ? Math.round(totalScore / selectedEvents.length) : 60;
};

/**
 * Calculate technical feasibility score
 */
const calculateFeasibility = (application) => {
  // Simple feasibility scoring based on available data
  let score = 50; // Base score
  
  // Higher criticality = more complex = lower feasibility
  if (application.criticality === 'Low') score += 30;
  else if (application.criticality === 'Medium') score += 10;
  else score -= 10;
  
  // Modern tech stack = higher feasibility
  if (application.runtime) {
    const runtime = application.runtime.toLowerCase();
    if (runtime.includes('java 17') || runtime.includes('java 11')) score += 20;
    else if (runtime.includes('java 8')) score += 10;
    else if (runtime.includes('java')) score += 5;
    
    if (runtime.includes('spring boot')) score += 15;
    if (runtime.includes('docker') || runtime.includes('container')) score += 10;
  }
  
  return Math.min(100, Math.max(0, score));
};

/**
 * Calculate business impact score
 */
const calculateImpact = (application) => {
  // Impact based on criticality and department
  const criticalityScores = {
    'high': 100,
    'medium': 70,
    'low': 40
  };
  
  const departmentMultipliers = {
    'sales': 1.2,
    'finance': 1.1,
    'operations': 1.1,
    'it': 0.9,
    'hr': 0.8
  };
  
  const baseScore = criticalityScores[application.criticality?.toLowerCase()] || 50;
  const multiplier = departmentMultipliers[application.department?.toLowerCase()] || 1.0;
  
  return Math.min(100, Math.round(baseScore * multiplier));
};

/**
 * Main processing function
 */
const processAnalysis = async (input) => {
  const { jobId, projectId, criteria, jobsTableName, resultsTableName } = input;
  
  console.log('🚀 Starting pilot analysis processing:', {
    jobId,
    projectId,
    driversCount: criteria.drivers?.length || 0,
    eventsCount: criteria.events?.length || 0
  });
  
  try {
    // Phase 1: Query application data (0-25%)
    await updateJobProgress(jobId, jobsTableName, 10, 'RUNNING', 'Querying application data...');
    
    const normalizedProjectId = projectId.toLowerCase();
    const database = `app_modex_${normalizedProjectId}`;
    const resultsBucket = `app-modex-results-${normalizedProjectId}`;
    
    // Query applications with tech stack data
    const applicationsQuery = `
      SELECT DISTINCT
        p.applicationname,
        p.department,
        p.criticality,
        p.purpose,
        t.runtime,
        t.framework,
        t.databases
      FROM v_application_portfolio p
      INNER JOIN v_tech_stack t ON p.applicationname = t.applicationname
      WHERE t.runtime IS NOT NULL AND t.runtime != ''
      ORDER BY p.applicationname
    `;
    
    const applicationsResult = await executeAthenaQuery(applicationsQuery, database, resultsBucket);
    const applications = parseAthenaResults(applicationsResult);
    
    console.log(`📊 Found ${applications.length} applications`);
    
    await updateJobProgress(jobId, jobsTableName, 25, 'RUNNING', 'Calculating similarity scores...');
    
    // Phase 2: Calculate scores for each application (25-75%)
    const candidates = [];
    const totalApps = applications.length;
    
    for (let i = 0; i < applications.length; i++) {
      const app = applications[i];
      
      // Find similar applications FIRST (needed for reusability scoring)
      const similarApps = applications
        .filter(otherApp => otherApp.applicationname !== app.applicationname)
        .map(otherApp => ({
          name: otherApp.applicationname,
          similarity: calculateSimilarity(app, otherApp),
          department: otherApp.department,
          criticality: otherApp.criticality
        }))
        .filter(similar => similar.similarity >= (criteria.similarityThreshold || 70))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5); // Top 5 similar apps
      
      const similarAppCount = similarApps.length;
      
      // Calculate individual scores
      const driverAlignment = calculateDriverAlignment(app, criteria.drivers || []);
      const eventAlignment = calculateEventAlignment(app, criteria.events || []);
      const feasibility = calculateFeasibility(app);
      const impact = calculateImpact(app, similarAppCount); // Pass similar app count for reusability multiplier
      
      // Calculate reusability multiplier for display
      let reusabilityMultiplier = 1.0;
      if (similarAppCount >= 10) {
        reusabilityMultiplier = 1.5;
      } else if (similarAppCount >= 5) {
        reusabilityMultiplier = 1.3;
      } else if (similarAppCount >= 2) {
        reusabilityMultiplier = 1.15;
      } else if (similarAppCount === 1) {
        reusabilityMultiplier = 1.05;
      } else {
        reusabilityMultiplier = 0.7;
      }
      
      // Calculate weighted final score
      const weights = criteria.weights || {
        businessDriver: 30,
        compellingEvent: 25,
        feasibility: 25,
        impact: 20
      };
      
      const finalScore = Math.round(
        (driverAlignment * weights.businessDriver / 100) +
        (eventAlignment * weights.compellingEvent / 100) +
        (feasibility * weights.feasibility / 100) +
        (impact * weights.impact / 100)
      );
      
      candidates.push({
        applicationName: app.applicationname,
        department: app.department,
        criticality: app.criticality,
        purpose: app.purpose,
        techStack: {
          runtime: app.runtime,
          framework: app.framework,
          databases: app.databases
        },
        scores: {
          driverAlignment,
          eventAlignment,
          feasibility,
          impact,
          finalScore,
          reusabilityMultiplier: Math.round(reusabilityMultiplier * 100) / 100,
          similarApplicationCount: similarAppCount
        },
        similarApplications: similarApps,
        rank: 0 // Will be set after sorting
      });
      
      // Update progress
      const progress = 25 + Math.round((i / totalApps) * 50);
      if (i % 10 === 0 || i === totalApps - 1) {
        await updateJobProgress(jobId, jobsTableName, progress, 'RUNNING', 
          `Processing application ${i + 1} of ${totalApps}...`);
      }
    }
    
    await updateJobProgress(jobId, jobsTableName, 75, 'RUNNING', 'Ranking pilot candidates...');
    
    // Phase 3: Sort and rank candidates (75-90%)
    candidates.sort((a, b) => b.scores.finalScore - a.scores.finalScore);
    
    // Set ranks and limit to max candidates
    const maxCandidates = criteria.maxCandidates || 10;
    const topCandidates = candidates.slice(0, maxCandidates);
    
    topCandidates.forEach((candidate, index) => {
      candidate.rank = index + 1;
    });
    
    await updateJobProgress(jobId, jobsTableName, 90, 'RUNNING', 'Storing results...');
    
    // Phase 4: Store results in DynamoDB (90-100%)
    const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days TTL
    
    for (let i = 0; i < topCandidates.length; i++) {
      const candidate = topCandidates[i];
      
      const putCommand = new PutCommand({
        TableName: resultsTableName,
        Item: {
          jobId,
          candidateId: `candidate_${candidate.rank}`,
          rank: candidate.rank,
          applicationName: candidate.applicationName,
          department: candidate.department,
          criticality: candidate.criticality,
          purpose: candidate.purpose,
          techStack: candidate.techStack,
          scores: candidate.scores,
          similarApplications: candidate.similarApplications,
          finalScore: candidate.scores.finalScore,
          ttl
        }
      });
      
      await dynamodb.send(putCommand);
    }
    
    // Update job as completed
    await updateJobProgress(jobId, jobsTableName, 100, 'COMPLETED', 'Analysis completed successfully');
    
    // Update job metadata
    const updateCommand = new UpdateCommand({
      TableName: jobsTableName,
      Key: { jobId },
      UpdateExpression: 'SET metadata.candidatesFound = :count, metadata.totalApplications = :total',
      ExpressionAttributeValues: {
        ':count': topCandidates.length,
        ':total': applications.length
      }
    });
    
    await dynamodb.send(updateCommand);
    
    console.log('✅ Analysis completed successfully:', {
      jobId,
      candidatesFound: topCandidates.length,
      totalApplications: applications.length
    });
    
    return {
      success: true,
      candidatesFound: topCandidates.length,
      totalApplications: applications.length
    };
    
  } catch (error) {
    console.error('❌ Error processing analysis:', error);
    
    await updateJobProgress(jobId, jobsTableName, 0, 'FAILED', 'Analysis failed', {
      message: error.message,
      timestamp: new Date().toISOString()
    });
    
    throw error;
  }
};

/**
 * Main Lambda handler
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
  console.log('⚙️ Process Pilot Analysis - Event:', JSON.stringify(sanitizeEvent(event), null, 2));
  
  try {
    const result = await processAnalysis(event);
    return result;
  } catch (error) {
    console.error('❌ Handler error:', error);
    throw error;
  }
};
