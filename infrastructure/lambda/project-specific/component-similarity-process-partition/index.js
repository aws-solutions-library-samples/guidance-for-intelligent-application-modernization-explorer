const AWS = require('aws-sdk');

// Initialize AWS services
const s3 = new AWS.S3({ region: process.env.AWS_REGION });
const dynamodb = new AWS.DynamoDB.DocumentClient({ region: process.env.AWS_REGION });

// Environment variables
const PROCESSING_BUCKET = process.env.S3_BUCKET;
const PROJECT_ID = process.env.PROJECT_ID;

/**
 * ProcessPartition Lambda Function
 * 
 * Processes similarity analysis for a single partition of components.
 * Compares components in the partition against ALL components in the full dataset
 * to ensure complete similarity analysis with parallel processing.
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
    console.log('🔧 ProcessPartition started', JSON.stringify(sanitizeEvent(event), null, 2));
    
    const startTime = Date.now();
    
    try {
        const { 
            partitionData,
            fullDataset,
            partitionIndex, 
            startIndex, 
            endIndex, 
            filters = {}, 
            executionId, 
            projectId = PROJECT_ID
        } = event;
        
        if (!partitionData || !fullDataset || !executionId || !projectId) {
            throw new Error('partitionData, fullDataset, executionId, and projectId are required');
        }

        console.log(`Processing partition ${partitionIndex} (${startIndex}-${endIndex}) for project: ${projectId}`);
        console.log(`Partition has ${partitionData.length} components, full dataset has ${fullDataset.length} components`);

        // Set up similarity calculation weights
        const weights = {
            runtime: filters.includeRuntimes !== false ? 0.25 : 0,
            framework: filters.includeFrameworks !== false ? 0.25 : 0,
            databases: filters.includeDatabases !== false ? 0.2 : 0,
            integrations: filters.includeIntegrations !== false ? 0.15 : 0,
            storages: filters.includeStorages !== false ? 0.15 : 0
        };

        const minThreshold = filters.minSimilarityScore || 0.7;
        
        console.log('Similarity calculation weights:', weights);
        console.log('Minimum similarity threshold:', minThreshold);

        // Calculate similarities for this partition against full dataset
        const similarities = [];
        const dynamoItems = [];
        let comparisons = 0;

        for (let i = 0; i < partitionData.length; i++) {
            const component1 = partitionData[i];
            const globalIndex1 = startIndex + i;
            
            // Compare with all components that come after this one globally
            // This ensures we don't duplicate comparisons across partitions
            for (let j = globalIndex1 + 1; j < fullDataset.length; j++) {
                const component2 = fullDataset[j];
                comparisons++;
                
                const similarity = calculateSimilarityScore(component1, component2, weights);
                
                if (similarity >= minThreshold) {
                    const similarityRecord = {
                        component1Id: component1.id,
                        component2Id: component2.id,
                        component1Name: component1.componentname || component1.componentName,
                        component2Name: component2.componentname || component2.componentName,
                        application1: component1.applicationname || component1.applicationName,
                        application2: component2.applicationname || component2.applicationName,
                        similarity: Math.round(similarity * 1000) / 1000,
                        globalIndex1,
                        globalIndex2: j,
                        partitionIndex,
                        details: {
                            runtimeMatch: component1.runtime === component2.runtime,
                            frameworkMatch: component1.framework === component2.framework,
                            databaseOverlap: calculateJaccardSimilarity(component1.databases, component2.databases),
                            integrationOverlap: calculateJaccardSimilarity(component1.integrations, component2.integrations),
                            storageOverlap: calculateJaccardSimilarity(component1.storages, component2.storages)
                        }
                    };
                    
                    similarities.push(similarityRecord);
                    
                    // Prepare DynamoDB item
                    const dynamoItem = {
                        id: `${executionId}#${component1.id}#${component2.id}`,
                        project_id: projectId,
                        execution_id: executionId,
                        component1_id: component1.id,
                        component2_id: component2.id,
                        similarity_score: similarity,
                        component1_name: component1.componentname || component1.componentName,
                        component2_name: component2.componentname || component2.componentName,
                        application1: component1.applicationname || component1.applicationName,
                        application2: component2.applicationname || component2.applicationName,
                        runtime1: component1.runtime,
                        runtime2: component2.runtime,
                        framework1: component1.framework,
                        framework2: component2.framework,
                        databases1: component1.databases || [],
                        databases2: component2.databases || [],
                        integrations1: component1.integrations || [],
                        integrations2: component2.integrations || [],
                        storages1: component1.storages || [],
                        storages2: component2.storages || [],
                        partition_index: partitionIndex,
                        created_at: new Date().toISOString(),
                        ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days TTL
                    };
                    
                    dynamoItems.push(dynamoItem);
                }
            }
        }

        console.log(`Completed ${comparisons} comparisons, found ${similarities.length} similar pairs`);

        // Batch write to DynamoDB
        if (dynamoItems.length > 0) {
            await batchWriteToDynamoDB(dynamoItems, projectId);
            console.log(`Written ${dynamoItems.length} similarity records to DynamoDB`);
        }

        // Store partition results in S3 for aggregation
        const resultKey = `results/${projectId}/${executionId}/partition-${partitionIndex}-results.json`;
        const partitionResults = {
            partitionIndex,
            startIndex,
            endIndex,
            similarities,
            statistics: {
                partitionSize: partitionData.length,
                comparisons,
                similarPairs: similarities.length,
                avgSimilarity: similarities.length > 0 
                    ? similarities.reduce((sum, s) => sum + s.similarity, 0) / similarities.length 
                    : 0,
                processingTimeMs: Date.now() - startTime
            },
            metadata: {
                executionId,
                projectId,
                timestamp: new Date().toISOString(),
                filters,
                weights
            }
        };

        await s3.putObject({
            Bucket: PROCESSING_BUCKET,
            Key: resultKey,
            Body: JSON.stringify(partitionResults),
            ContentType: 'application/json',
            Metadata: {
                executionId,
                projectId,
                partitionIndex: partitionIndex.toString(),
                similarPairs: similarities.length.toString()
            }
        }).promise();

        console.log(`Stored partition results: ${resultKey}`);

        const response = {
            success: true,
            partitionIndex,
            resultKey,
            statistics: partitionResults.statistics,
            executionId,
            projectId
        };

        console.log('🔧 ProcessPartition completed successfully', {
            partitionIndex: response.partitionIndex,
            similarPairs: response.statistics.similarPairs,
            processingTime: response.statistics.processingTimeMs
        });

        return response;

    } catch (error) {
        console.error('❌ Error in ProcessPartition:', error);
        throw new Error(`ProcessPartition failed: ${error.message}`);
    }
};

/**
 * Batch write items to DynamoDB with proper error handling
 */
async function batchWriteToDynamoDB(items, projectId) {
    const tableName = `app-modex-component-similarities-${projectId}`;
    const batchSize = 25; // DynamoDB batch write limit
    
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        
        const params = {
            RequestItems: {
                [tableName]: batch.map(item => ({
                    PutRequest: {
                        Item: item
                    }
                }))
            }
        };
        
        try {
            const result = await dynamodb.batchWrite(params).promise();
            
            // Handle unprocessed items
            if (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0) {
                console.warn('Some items were not processed, retrying...', result.UnprocessedItems);
                // Could implement retry logic here
            }
        } catch (error) {
            console.error(`Error writing batch ${i / batchSize + 1} to DynamoDB:`, error);
            throw error;
        }
    }
}

/**
 * Calculate similarity score between two components
 */
function calculateSimilarityScore(comp1, comp2, weights) {
    let totalScore = 0;
    let totalWeight = 0;

    // Runtime similarity
    if (weights.runtime > 0) {
        const runtimeScore = comp1.runtime === comp2.runtime ? 1 : 0;
        totalScore += runtimeScore * weights.runtime;
        totalWeight += weights.runtime;
    }

    // Framework similarity
    if (weights.framework > 0) {
        const frameworkScore = comp1.framework === comp2.framework ? 1 : 0;
        totalScore += frameworkScore * weights.framework;
        totalWeight += weights.framework;
    }

    // Array-based similarities (Jaccard coefficient)
    ['databases', 'integrations', 'storages'].forEach(field => {
        if (weights[field] > 0) {
            const score = calculateJaccardSimilarity(comp1[field], comp2[field]);
            totalScore += score * weights[field];
            totalWeight += weights[field];
        }
    });

    return totalWeight > 0 ? totalScore / totalWeight : 0;
}

/**
 * Calculate Jaccard similarity coefficient for arrays
 */
function calculateJaccardSimilarity(arr1, arr2) {
    const set1 = new Set(arr1 || []);
    const set2 = new Set(arr2 || []);
    
    if (set1.size === 0 && set2.size === 0) {
        return 1.0; // Both empty
    }
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
}
