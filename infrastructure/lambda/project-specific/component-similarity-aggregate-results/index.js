const AWS = require('aws-sdk');

// Initialize AWS services
const s3 = new AWS.S3({ region: process.env.AWS_REGION });

// Environment variables
const PROCESSING_BUCKET = process.env.PROCESSING_BUCKET;
const PROJECT_ID = process.env.PROJECT_ID;

/**
 * AggregateResults Lambda Function
 * 
 * Combines similarity results from all partition processing Lambda functions
 * into a single comprehensive similarity dataset. Creates a sparse similarity
 * matrix for memory efficiency with large datasets.
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
    console.log('AggregateResults started', JSON.stringify(sanitizeEvent(event), null, 2));
    
    const startTime = Date.now();
    
    try {
        const { 
            partitionResults, 
            totalComponents, 
            filters = {}, 
            executionId, 
            projectId 
        } = event;
        
        if (!partitionResults || !Array.isArray(partitionResults)) {
            throw new Error('partitionResults is required and must be an array');
        }

        if (!executionId || !projectId) {
            throw new Error('executionId and projectId are required');
        }

        console.log(`Aggregating results from ${partitionResults.length} partitions for project: ${projectId}`);
        console.log(`Total components in dataset: ${totalComponents}`);
        
        // Load and combine all partition results
        const allSimilarities = [];
        let totalComparisons = 0;
        let totalProcessingTime = 0;

        for (const partitionResult of partitionResults) {
            if (!partitionResult.success || !partitionResult.resultKey) {
                console.warn(`Skipping failed partition: ${partitionResult.partitionIndex}`);
                continue;
            }

            console.log(`Loading results from partition ${partitionResult.partitionIndex}`);
            
            try {
                const partitionData = await loadPartitionResultsFromS3(partitionResult.resultKey);
                
                allSimilarities.push(...partitionData.similarities);
                totalComparisons += partitionData.statistics.comparisons;
                totalProcessingTime += partitionData.statistics.processingTimeMs;
                
                console.log(`Partition ${partitionResult.partitionIndex}: ${partitionData.similarities.length} similarities`);
            } catch (error) {
                console.error(`Error loading partition ${partitionResult.partitionIndex}:`, error);
                // Continue with other partitions
            }
        }

        console.log(`Combined ${allSimilarities.length} similarities from ${totalComparisons} comparisons`);

        // Create sparse similarity matrix (only store non-zero similarities)
        const sparseMatrix = createSparseMatrix(allSimilarities);
        
        // Calculate comprehensive statistics
        const statistics = calculateAggregatedStatistics(
            allSimilarities, 
            totalComponents, 
            totalComparisons, 
            totalProcessingTime,
            startTime
        );

        // Store aggregated results
        const aggregatedKey = `results/${projectId}/${executionId}/aggregated-similarities.json`;
        const aggregatedResults = {
            sparseMatrix,
            allSimilarities, // Keep for clustering and pattern analysis
            statistics,
            metadata: {
                executionId,
                projectId,
                totalComponents,
                partitionsProcessed: partitionResults.length,
                timestamp: new Date().toISOString(),
                filters
            }
        };

        await s3.putObject({
            Bucket: PROCESSING_BUCKET,
            Key: aggregatedKey,
            Body: JSON.stringify(aggregatedResults),
            ContentType: 'application/json',
            Metadata: {
                executionId,
                projectId,
                totalSimilarities: allSimilarities.length.toString(),
                totalComponents: totalComponents.toString()
            }
        }).promise();

        console.log(`Stored aggregated results: ${aggregatedKey}`);

        // Also create a compressed version for frontend consumption
        const compressedKey = `results/${projectId}/${executionId}/similarities-compressed.json`;
        const compressedResults = {
            similarities: allSimilarities.map(sim => ({
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
                similarity: sim.similarity
            })),
            statistics,
            metadata: {
                executionId,
                projectId,
                timestamp: new Date().toISOString(),
                compressed: true
            }
        };

        await s3.putObject({
            Bucket: PROCESSING_BUCKET,
            Key: compressedKey,
            Body: JSON.stringify(compressedResults),
            ContentType: 'application/json',
            Metadata: {
                executionId,
                projectId,
                compressed: 'true'
            }
        }).promise();

        console.log(`Stored compressed results: ${compressedKey}`);

        const response = {
            success: true,
            aggregatedKey,
            compressedKey,
            statistics,
            executionId,
            projectId
        };

        console.log('AggregateResults completed successfully', {
            totalSimilarities: statistics.totalSimilarities,
            avgSimilarity: statistics.avgSimilarity,
            aggregationTime: statistics.aggregationTimeMs
        });

        return response;

    } catch (error) {
        console.error('Error in AggregateResults:', error);
        throw new Error(`AggregateResults failed: ${error.message}`);
    }
};

/**
 * Load partition results from S3
 */
async function loadPartitionResultsFromS3(resultKey) {
    try {
        const response = await s3.getObject({
            Bucket: PROCESSING_BUCKET,
            Key: resultKey
        }).promise();
        
        return JSON.parse(response.Body.toString());
    } catch (error) {
        console.error(`Error loading partition results from S3: ${resultKey}`, error);
        throw new Error(`Failed to load partition results: ${error.message}`);
    }
}

/**
 * Create sparse similarity matrix for memory efficiency
 */
function createSparseMatrix(similarities) {
    console.log('Creating sparse similarity matrix...');
    
    const sparseMatrix = new Map();
    
    similarities.forEach(sim => {
        // Use consistent ordering for matrix keys
        const index1 = sim.globalIndex1 || 0;
        const index2 = sim.globalIndex2 || 0;
        
        const key = index1 < index2 ? `${index1}-${index2}` : `${index2}-${index1}`;
        
        sparseMatrix.set(key, {
            similarity: sim.similarity,
            component1Id: sim.component1Id,
            component2Id: sim.component2Id,
            details: sim.details
        });
    });

    console.log(`Created sparse matrix with ${sparseMatrix.size} entries`);
    
    // Convert to array format for JSON serialization
    return Array.from(sparseMatrix.entries()).map(([key, value]) => ({
        key,
        ...value
    }));
}

/**
 * Calculate comprehensive aggregated statistics
 */
function calculateAggregatedStatistics(similarities, totalComponents, totalComparisons, totalProcessingTime, startTime) {
    const stats = {
        totalComponents,
        totalComparisons,
        totalSimilarities: similarities.length,
        avgSimilarity: similarities.length > 0 
            ? similarities.reduce((sum, s) => sum + s.similarity, 0) / similarities.length 
            : 0,
        maxSimilarity: similarities.length > 0 
            ? Math.max(...similarities.map(s => s.similarity)) 
            : 0,
        minSimilarity: similarities.length > 0 
            ? Math.min(...similarities.map(s => s.similarity)) 
            : 0,
        totalProcessingTimeMs: totalProcessingTime,
        aggregationTimeMs: Date.now() - startTime
    };

    // Calculate similarity distribution
    const buckets = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0];
    stats.similarityDistribution = {};
    
    buckets.forEach((bucket, index) => {
        const prevBucket = index === 0 ? 0 : buckets[index - 1];
        const count = similarities.filter(s => s.similarity > prevBucket && s.similarity <= bucket).length;
        stats.similarityDistribution[`${prevBucket}-${bucket}`] = count;
    });

    // Calculate technology match statistics
    const runtimeMatches = similarities.filter(s => s.details?.runtimeMatch).length;
    const frameworkMatches = similarities.filter(s => s.details?.frameworkMatch).length;
    
    stats.technologyMatches = {
        runtime: runtimeMatches,
        framework: frameworkMatches,
        runtimePercentage: similarities.length > 0 ? (runtimeMatches / similarities.length * 100).toFixed(1) : 0,
        frameworkPercentage: similarities.length > 0 ? (frameworkMatches / similarities.length * 100).toFixed(1) : 0
    };

    // Calculate cross-application vs same-application similarities
    const sameAppSimilarities = similarities.filter(s => s.application1 === s.application2).length;
    const crossAppSimilarities = similarities.length - sameAppSimilarities;
    
    stats.applicationDistribution = {
        sameApplication: sameAppSimilarities,
        crossApplication: crossAppSimilarities,
        sameAppPercentage: similarities.length > 0 ? (sameAppSimilarities / similarities.length * 100).toFixed(1) : 0,
        crossAppPercentage: similarities.length > 0 ? (crossAppSimilarities / similarities.length * 100).toFixed(1) : 0
    };

    console.log('Aggregated statistics:', {
        totalSimilarities: stats.totalSimilarities,
        avgSimilarity: stats.avgSimilarity.toFixed(3),
        runtimeMatches: stats.technologyMatches.runtime,
        frameworkMatches: stats.technologyMatches.framework
    });

    return stats;
}
