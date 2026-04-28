const AWS = require('aws-sdk');

// Initialize AWS services
const s3 = new AWS.S3({ region: process.env.AWS_REGION });

// Environment variables
const PROCESSING_BUCKET = process.env.PROCESSING_BUCKET;
const RESULTS_BUCKET = process.env.RESULTS_BUCKET;
const PROJECT_ID = process.env.PROJECT_ID;

// Configuration
const PARTITION_SIZE = 500; // Components per partition for optimal Lambda performance

/**
 * PartitionDataset Lambda Function
 * 
 * Splits large component datasets into manageable partitions for parallel processing.
 * Always reads data from S3 for consistent processing regardless of size.
 * Each partition contains ~500 components to optimize Lambda memory usage and execution time.
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
    console.log('PartitionDataset started', JSON.stringify(sanitizeEvent(event), null, 2));
    
    const startTime = Date.now();
    
    try {
        const { s3_data_info, dataStoredInS3, projectId, executionId } = event;
        
        if (!s3_data_info || !dataStoredInS3) {
            throw new Error('s3_data_info is required and dataStoredInS3 must be true');
        }

        if (!executionId || !projectId) {
            throw new Error('executionId and projectId are required');
        }

        console.log(`Reading component data from S3: s3://${s3_data_info.s3_bucket}/${s3_data_info.s3_key}`);
        
        // Read data from S3
        const s3Response = await s3.getObject({
            Bucket: s3_data_info.s3_bucket,
            Key: s3_data_info.s3_key
        }).promise();
        
        const athenaData = JSON.parse(s3Response.Body.toString());
        console.log(`Retrieved ${athenaData.length} component records from S3`);
        
        // Transform Athena data to component format
        const components = transformAthenaDataToComponents(athenaData);
        
        // Calculate optimal number of partitions
        const numPartitions = Math.ceil(components.length / PARTITION_SIZE);
        console.log(`Creating ${numPartitions} partitions for ${components.length} components`);

        // Create partitions and store them in S3
        const partitions = [];
        
        for (let i = 0; i < numPartitions; i++) {
            const startIndex = i * PARTITION_SIZE;
            const endIndex = Math.min(startIndex + PARTITION_SIZE, components.length);
            const partition = components.slice(startIndex, endIndex);
            
            // Store partition in S3
            const partitionKey = `partitions/${projectId}/${executionId}/partition-${i}.json`;
            
            const partitionData = {
                partitionIndex: i,
                startIndex,
                endIndex,
                components: partition,
                metadata: {
                    totalComponents: components.length,
                    partitionSize: partition.length,
                    executionId,
                    projectId,
                    timestamp: new Date().toISOString()
                }
            };

            await s3.putObject({
                Bucket: PROCESSING_BUCKET,
                Key: partitionKey,
                Body: JSON.stringify(partitionData),
                ContentType: 'application/json',
                Metadata: {
                    executionId,
                    projectId,
                    partitionIndex: i.toString(),
                    partitionSize: partition.length.toString()
                }
            }).promise();

            // Add partition metadata for Step Functions
            partitions.push({
                partitionKey,
                partitionIndex: i,
                startIndex,
                endIndex,
                size: partition.length,
                estimatedProcessingTimeMinutes: estimatePartitionProcessingTime(partition.length)
            });

            console.log(`Created partition ${i}: ${partition.length} components (${startIndex}-${endIndex})`);
        }

        // Store complete dataset for cross-partition comparisons
        const fullDatasetKey = `datasets/${projectId}/${executionId}/full-dataset.json`;
        await s3.putObject({
            Bucket: PROCESSING_BUCKET,
            Key: fullDatasetKey,
            Body: JSON.stringify({
                components,
                metadata: {
                    totalComponents: components.length,
                    numPartitions,
                    executionId,
                    projectId,
                    timestamp: new Date().toISOString()
                }
            }),
            ContentType: 'application/json',
            Metadata: {
                executionId,
                projectId,
                totalComponents: components.length.toString(),
                numPartitions: numPartitions.toString()
            }
        }).promise();

        console.log(`Stored full dataset: ${fullDatasetKey}`);

        // Calculate processing estimates
        const totalEstimatedTime = partitions.reduce((sum, p) => sum + p.estimatedProcessingTimeMinutes, 0);
        const parallelEstimatedTime = Math.max(...partitions.map(p => p.estimatedProcessingTimeMinutes));

        const result = {
            success: true,
            partitions,
            fullDatasetKey,
            statistics: {
                totalComponents: components.length,
                numPartitions,
                avgPartitionSize: Math.round(components.length / numPartitions),
                maxPartitionSize: Math.max(...partitions.map(p => p.size)),
                minPartitionSize: Math.min(...partitions.map(p => p.size)),
                totalEstimatedTimeMinutes: totalEstimatedTime,
                parallelEstimatedTimeMinutes: parallelEstimatedTime,
                partitioningTimeMs: Date.now() - startTime
            },
            executionId,
            projectId
        };

        console.log('PartitionDataset completed successfully', {
            numPartitions: result.statistics.numPartitions,
            totalComponents: result.statistics.totalComponents,
            estimatedTime: result.statistics.parallelEstimatedTimeMinutes
        });

        return result;

    } catch (error) {
        console.error('Error in PartitionDataset:', error);
        throw new Error(`PartitionDataset failed: ${error.message}`);
    }
};

/**
 * Transform Athena data to component format
 */
function transformAthenaDataToComponents(athenaData) {
    return athenaData.map((row, index) => ({
        id: row.id || `component-${index}`,
        applicationName: row.application_name || row.applicationName || '',
        componentName: row.component_name || row.componentName || '',
        runtime: row.runtime || '',
        framework: row.framework || '',
        databases: parseArrayField(row.databases),
        integrations: parseArrayField(row.integrations),
        storages: parseArrayField(row.storages)
    }));
}

/**
 * Parse array fields from Athena (comma-separated strings)
 */
function parseArrayField(field) {
    if (!field || field === 'null' || field === '') {
        return [];
    }
    return field.split(',').map(item => item.trim()).filter(item => item.length > 0);
}

/**
 * Estimate processing time for a partition based on size
 */
function estimatePartitionProcessingTime(partitionSize) {
    // Rough estimates based on O(n²) complexity within partition
    // Plus O(n*N) for cross-partition comparisons where N is total dataset size
    
    if (partitionSize <= 100) return 2;
    if (partitionSize <= 200) return 4;
    if (partitionSize <= 300) return 6;
    if (partitionSize <= 400) return 8;
    if (partitionSize <= 500) return 10;
    return 12; // Shouldn't exceed this with PARTITION_SIZE = 500
}
