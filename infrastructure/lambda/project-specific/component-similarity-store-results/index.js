const AWS = require('aws-sdk');

// Initialize AWS services
const dynamodb = new AWS.DynamoDB.DocumentClient({ region: process.env.AWS_REGION });
const s3 = new AWS.S3({ region: process.env.AWS_REGION });
const sns = new AWS.SNS({ region: process.env.AWS_REGION });

// Environment variables
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE;
const S3_BUCKET = process.env.S3_BUCKET;
const PROJECT_ID = process.env.PROJECT_ID;

/**
 * StoreFinalResults Lambda Function
 * 
 * Stores the final component similarity analysis results in DynamoDB.
 * This function stores both the analysis summary and individual patterns as separate records.
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
    console.log('StoreFinalResults started', JSON.stringify(sanitizeEvent(event), null, 2));
    
    const startTime = Date.now();
    
    try {
        const { 
            projectId, 
            filters = {}, 
            athenaResults,
            aggregatedResults,
            clusterResults,
            patternResults,
            executionId, 
            startTime: analysisStartTime 
        } = event;
        
        if (!executionId || !projectId) {
            throw new Error('executionId and projectId are required');
        }

        console.log(`Storing final results for project: ${projectId}, execution: ${executionId}`);
        
        // Load all result components from S3
        const [aggregatedData, clusterData, patternData] = await Promise.all([
            loadResultsFromS3(aggregatedResults?.aggregatedKey),
            loadResultsFromS3(clusterResults?.clusterResultsKey),
            loadResultsFromS3(patternResults?.patternResultsKey)
        ]);

        // Calculate total processing time
        const totalProcessingTimeMs = Date.now() - new Date(analysisStartTime).getTime();
        const totalProcessingTimeMinutes = Math.round(totalProcessingTimeMs / 60000);

        // Create analysis summary record
        const analysisSummary = {
            component_id: `ANALYSIS_SUMMARY_${projectId}`,
            project_id: projectId,
            execution_id: executionId,
            analysis_type: 'component_similarity',
            status: 'completed',
            timestamp: new Date().toISOString(),
            
            // Summary statistics
            total_components: athenaResults?.metadata?.rowCount || 0,
            total_similarities: aggregatedData?.statistics?.totalSimilarities || 0,
            avg_similarity_score: aggregatedData?.statistics?.avgSimilarity || 0,
            clusters_found: clusterData?.statistics?.totalClusters || 0,
            patterns_found: patternData?.statistics?.totalPatterns || 0,
            processing_time_minutes: totalProcessingTimeMinutes,
            quick_wins_identified: patternData?.analysis?.quickWins?.length || 0,
            
            // Top-level insights for quick access
            top_similarities: getTopSimilarities(aggregatedData?.allSimilarities || [], 10),
            largest_clusters: getLargestClusters(clusterData?.clusters || [], 5),
            quick_win_patterns: getQuickWinPatterns(patternData?.analysis?.quickWins || [], 5),
            
            // Analysis metadata
            filters: filters,
            analysis_start_time: analysisStartTime,
            analysis_end_time: new Date().toISOString(),
            total_processing_time_ms: totalProcessingTimeMs,
            dataset_size: athenaResults?.metadata?.rowCount || 0,
            processing_strategy: (athenaResults?.metadata?.rowCount || 0) < 1000 ? 'small_dataset' : 'partitioned',
            
            // Statistics for frontend charts
            similarity_distribution: aggregatedData?.statistics?.similarityDistribution || {},
            technology_matches: aggregatedData?.statistics?.technologyMatches || {},
            application_distribution: aggregatedData?.statistics?.applicationDistribution || {},
            cluster_size_distribution: calculateClusterSizeDistribution(clusterData?.clusters || []),
            pattern_frequency_distribution: calculatePatternFrequencyDistribution(patternData?.patterns || []),
            
            // Insights and recommendations
            insights: [
                ...(clusterData?.analysis?.insights || []),
                ...(patternData?.analysis?.insights || [])
            ],
            recommendations: patternData?.recommendations || [],
            
            // TTL for automatic cleanup (30 days)
            ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
        };

        // Store analysis summary in DynamoDB
        await storeRecordInDynamoDB(analysisSummary);
        console.log(`Stored analysis summary: ${analysisSummary.component_id}`);

        // Store individual patterns as separate records
        if (patternData?.patterns && patternData.patterns.length > 0) {
            const patternRecords = patternData.patterns.map((pattern, index) => ({
                component_id: `PATTERN_${projectId}_${executionId}_${index + 1}`,
                project_id: projectId,
                execution_id: executionId,
                record_type: 'pattern',
                timestamp: new Date().toISOString(),
                
                pattern_id: pattern.patternId || `pattern_${index + 1}`,
                pattern_name: pattern.patternName,
                pattern_type: pattern.patternType,
                frequency: pattern.frequency,
                percentage: pattern.percentage,
                components: pattern.components || [],
                applications: pattern.applications || [],
                technologies: pattern.technologies || [],
                description: pattern.description,
                modernization_impact: pattern.modernizationImpact,
                effort_estimate: pattern.effortEstimate,
                cost_estimate: pattern.costEstimate,
                
                // TTL for automatic cleanup (30 days)
                ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
            }));

            // Store patterns in batches
            await storeRecordsInBatches(patternRecords);
            console.log(`Stored ${patternRecords.length} pattern records`);
        }

        // Send completion notification (if SNS topic is configured)
        await sendCompletionNotification(projectId, executionId, analysisSummary);

        // Clean up intermediate processing files (optional)
        await cleanupIntermediateFiles(projectId, executionId);

        const response = {
            success: true,
            analysis_id: analysisSummary.component_id,
            summary: {
                total_components: analysisSummary.total_components,
                total_similarities: analysisSummary.total_similarities,
                clusters_found: analysisSummary.clusters_found,
                patterns_found: analysisSummary.patterns_found,
                processing_time_minutes: analysisSummary.processing_time_minutes,
                quick_wins_identified: analysisSummary.quick_wins_identified
            },
            execution_id: executionId,
            project_id: projectId
        };

        console.log('StoreFinalResults completed successfully', {
            analysisId: response.analysis_id,
            totalComponents: response.summary.total_components,
            totalSimilarities: response.summary.total_similarities,
            clustersFound: response.summary.clusters_found,
            patternsFound: response.summary.patterns_found,
            processingTime: response.summary.processing_time_minutes
        });

        return response;

    } catch (error) {
        console.error('Error in StoreFinalResults:', error);
        throw new Error(`StoreFinalResults failed: ${error.message}`);
    }
};

/**
 * Load results from S3
 */
async function loadResultsFromS3(resultKey) {
    if (!resultKey) {
        console.warn('No result key provided, returning empty object');
        return {};
    }

    try {
        const response = await s3.getObject({
            Bucket: S3_BUCKET,
            Key: resultKey
        }).promise();
        
        return JSON.parse(response.Body.toString());
    } catch (error) {
        console.error(`Error loading results from S3: ${resultKey}`, error);
        return {}; // Return empty object instead of failing
    }
}

/**
 * Store a single record in DynamoDB
 */
async function storeRecordInDynamoDB(record) {
    try {
        await dynamodb.put({
            TableName: DYNAMODB_TABLE,
            Item: record
        }).promise();

        console.log(`Stored record in DynamoDB: ${record.component_id}`);
    } catch (error) {
        console.error('Error storing record in DynamoDB:', error);
        throw new Error(`Failed to store record in DynamoDB: ${error.message}`);
    }
}

/**
 * Store multiple records in DynamoDB using batch operations
 */
async function storeRecordsInBatches(records, batchSize = 25) {
    for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        
        const putRequests = batch.map(record => ({
            PutRequest: {
                Item: record
            }
        }));

        try {
            await dynamodb.batchWrite({
                RequestItems: {
                    [DYNAMODB_TABLE]: putRequests
                }
            }).promise();

            console.log(`Stored batch of ${batch.length} records in DynamoDB`);
        } catch (error) {
            console.error('Error storing batch in DynamoDB:', error);
            throw new Error(`Failed to store batch in DynamoDB: ${error.message}`);
        }
    }
}

/**
 * Send completion notification via SNS (if configured)
 */
async function sendCompletionNotification(projectId, executionId, summary) {
    try {
        // Only send notification if SNS topic is configured
        const snsTopicArn = process.env.SNS_TOPIC_ARN;
        if (!snsTopicArn) {
            console.log('No SNS topic configured, skipping notification');
            return;
        }

        const message = {
            projectId,
            executionId,
            analysisType: 'component_similarity',
            status: 'completed',
            timestamp: new Date().toISOString(),
            summary: {
                totalComponents: summary.total_components,
                totalSimilarities: summary.total_similarities,
                clustersFound: summary.clusters_found,
                patternsFound: summary.patterns_found,
                processingTimeMinutes: summary.processing_time_minutes,
                quickWinsIdentified: summary.quick_wins_identified
            }
        };

        await sns.publish({
            TopicArn: snsTopicArn,
            Message: JSON.stringify(message),
            Subject: `Component Similarity Analysis Complete - ${projectId}`
        }).promise();

        console.log('Completion notification sent via SNS');
    } catch (error) {
        console.warn('Error sending completion notification (non-critical):', error.message);
        // Don't fail the entire operation for notification errors
    }
}

/**
 * Get top similarities for quick access
 */
function getTopSimilarities(similarities, limit) {
    return similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
        .map(sim => ({
            component1: {
                id: sim.component1Id,
                name: sim.component1Name,
                application: sim.application1
            },
            component2: {
                id: sim.component2Id,
                name: sim.component2Name,
                application: sim.application2
            },
            similarity: sim.similarity,
            details: sim.details
        }));
}

/**
 * Get largest clusters for quick access
 */
function getLargestClusters(clusters, limit) {
    return clusters
        .sort((a, b) => b.size - a.size)
        .slice(0, limit)
        .map(cluster => ({
            clusterId: cluster.clusterId,
            name: cluster.name,
            size: cluster.size,
            avgSimilarity: cluster.similarities?.avg,
            commonTechnologies: cluster.commonTechnologies,
            characteristics: cluster.characteristics
        }));
}

/**
 * Get quick win patterns for quick access
 */
function getQuickWinPatterns(quickWins, limit) {
    return quickWins
        .slice(0, limit)
        .map(qw => ({
            patternId: qw.patternId,
            patternName: qw.patternName,
            frequency: qw.frequency,
            percentage: qw.percentage,
            quickWinReason: qw.quickWinReason
        }));
}

/**
 * Clean up intermediate processing files to save storage costs
 */
async function cleanupIntermediateFiles(projectId, executionId) {
    try {
        console.log('Cleaning up intermediate processing files...');
        
        // List objects to delete
        const listParams = {
            Bucket: S3_BUCKET,
            Prefix: `partitions/${projectId}/${executionId}/`
        };

        const objects = await s3.listObjectsV2(listParams).promise();
        
        if (objects.Contents && objects.Contents.length > 0) {
            const deleteParams = {
                Bucket: S3_BUCKET,
                Delete: {
                    Objects: objects.Contents.map(obj => ({ Key: obj.Key }))
                }
            };

            await s3.deleteObjects(deleteParams).promise();
            console.log(`Cleaned up ${objects.Contents.length} intermediate files`);
        }
    } catch (error) {
        console.warn('Error cleaning up intermediate files (non-critical):', error.message);
        // Don't fail the entire operation for cleanup errors
    }
}
