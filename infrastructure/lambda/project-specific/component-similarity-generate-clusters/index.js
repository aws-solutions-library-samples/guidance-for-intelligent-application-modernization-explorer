const AWS = require('aws-sdk');

// Initialize AWS services
const s3 = new AWS.S3({ region: process.env.AWS_REGION });

// Environment variables
const PROCESSING_BUCKET = process.env.PROCESSING_BUCKET;
const PROJECT_ID = process.env.PROJECT_ID;

/**
 * GenerateClusters Lambda Function
 * 
 * Generates component clusters based on similarity results from the aggregation step.
 * Uses graph-based clustering to group components with similar technology stacks.
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
    console.log('GenerateClusters started', JSON.stringify(sanitizeEvent(event), null, 2));
    
    const startTime = Date.now();
    
    try {
        const { 
            aggregatedResultsKey, 
            filters = {}, 
            executionId, 
            projectId 
        } = event;
        
        if (!aggregatedResultsKey || !executionId || !projectId) {
            throw new Error('aggregatedResultsKey, executionId, and projectId are required');
        }

        console.log(`Generating clusters for project: ${projectId}`);
        console.log(`Loading aggregated results from: ${aggregatedResultsKey}`);
        
        // Load aggregated similarity results
        const aggregatedData = await loadAggregatedResultsFromS3(aggregatedResultsKey);
        const similarities = aggregatedData.allSimilarities;
        const totalComponents = aggregatedData.metadata.totalComponents;
        
        console.log(`Loaded ${similarities.length} similarities for ${totalComponents} components`);

        // Load full dataset to get component details
        const fullDatasetKey = `datasets/${projectId}/${executionId}/full-dataset.json`;
        const fullDataset = await loadDatasetFromS3(fullDatasetKey);
        const allComponents = fullDataset.components;
        
        console.log(`Loaded ${allComponents.length} component details`);

        // Set clustering threshold
        const clusteringThreshold = filters.minSimilarityScore || 0.7;
        console.log(`Using clustering threshold: ${clusteringThreshold}`);

        // Generate clusters using graph-based approach
        const clusters = generateComponentClusters(allComponents, similarities, clusteringThreshold);
        
        // Analyze cluster quality and characteristics
        const clusterAnalysis = analyzeClusterQuality(clusters, similarities);
        
        // Store cluster results
        const clusterResultsKey = `results/${projectId}/${executionId}/component-clusters.json`;
        const clusterResults = {
            clusters,
            analysis: clusterAnalysis,
            statistics: {
                totalClusters: clusters.length,
                totalComponentsInClusters: clusters.reduce((sum, c) => sum + c.size, 0),
                avgClusterSize: clusters.length > 0 
                    ? clusters.reduce((sum, c) => sum + c.size, 0) / clusters.length 
                    : 0,
                largestClusterSize: clusters.length > 0 
                    ? Math.max(...clusters.map(c => c.size)) 
                    : 0,
                smallestClusterSize: clusters.length > 0 
                    ? Math.min(...clusters.map(c => c.size)) 
                    : 0,
                clusteringTimeMs: Date.now() - startTime
            },
            metadata: {
                executionId,
                projectId,
                clusteringThreshold,
                timestamp: new Date().toISOString(),
                filters
            }
        };

        await s3.putObject({
            Bucket: PROCESSING_BUCKET,
            Key: clusterResultsKey,
            Body: JSON.stringify(clusterResults),
            ContentType: 'application/json',
            Metadata: {
                executionId,
                projectId,
                totalClusters: clusters.length.toString(),
                avgClusterSize: clusterResults.statistics.avgClusterSize.toFixed(1)
            }
        }).promise();

        console.log(`Stored cluster results: ${clusterResultsKey}`);

        const response = {
            success: true,
            clusterResultsKey,
            statistics: clusterResults.statistics,
            executionId,
            projectId
        };

        console.log('GenerateClusters completed successfully', {
            totalClusters: response.statistics.totalClusters,
            avgClusterSize: response.statistics.avgClusterSize.toFixed(1),
            clusteringTime: response.statistics.clusteringTimeMs
        });

        return response;

    } catch (error) {
        console.error('Error in GenerateClusters:', error);
        throw new Error(`GenerateClusters failed: ${error.message}`);
    }
};

/**
 * Load aggregated results from S3
 */
async function loadAggregatedResultsFromS3(aggregatedResultsKey) {
    try {
        const response = await s3.getObject({
            Bucket: PROCESSING_BUCKET,
            Key: aggregatedResultsKey
        }).promise();
        
        return JSON.parse(response.Body.toString());
    } catch (error) {
        console.error(`Error loading aggregated results from S3: ${aggregatedResultsKey}`, error);
        throw new Error(`Failed to load aggregated results: ${error.message}`);
    }
}

/**
 * Load dataset from S3
 */
async function loadDatasetFromS3(datasetKey) {
    try {
        const response = await s3.getObject({
            Bucket: PROCESSING_BUCKET,
            Key: datasetKey
        }).promise();
        
        return JSON.parse(response.Body.toString());
    } catch (error) {
        console.error(`Error loading dataset from S3: ${datasetKey}`, error);
        throw new Error(`Failed to load dataset: ${error.message}`);
    }
}

/**
 * Generate component clusters using graph-based clustering
 */
function generateComponentClusters(components, similarities, threshold) {
    console.log('Generating component clusters...');
    
    // Build adjacency graph from similarities
    const graph = new Map();
    components.forEach(comp => graph.set(comp.id, new Set()));
    
    // Add edges for similarities above threshold
    similarities.forEach(sim => {
        if (sim.similarity >= threshold) {
            const id1 = sim.component1Id;
            const id2 = sim.component2Id;
            
            if (graph.has(id1) && graph.has(id2)) {
                graph.get(id1).add(id2);
                graph.get(id2).add(id1);
            }
        }
    });

    // Find connected components using DFS
    const visited = new Set();
    const clusters = [];
    let clusterId = 1;

    components.forEach(component => {
        if (!visited.has(component.id)) {
            const clusterComponents = findConnectedComponents(component.id, graph, visited, components);
            
            if (clusterComponents.length > 1) { // Only clusters with multiple components
                const cluster = createClusterObject(clusterId, clusterComponents, similarities, threshold);
                clusters.push(cluster);
                clusterId++;
            }
        }
    });

    // Sort clusters by size (largest first)
    clusters.sort((a, b) => b.size - a.size);
    
    console.log(`Generated ${clusters.length} clusters`);
    return clusters;
}

/**
 * Find connected components using DFS
 */
function findConnectedComponents(startId, graph, visited, components) {
    const cluster = [];
    const stack = [startId];

    while (stack.length > 0) {
        const currentId = stack.pop();
        
        if (!visited.has(currentId)) {
            visited.add(currentId);
            
            const component = components.find(c => c.id === currentId);
            if (component) {
                cluster.push(component);
            }
            
            // Add neighbors to stack
            const neighbors = graph.get(currentId) || new Set();
            neighbors.forEach(neighborId => {
                if (!visited.has(neighborId)) {
                    stack.push(neighborId);
                }
            });
        }
    }

    return cluster;
}

/**
 * Create cluster object with detailed information
 */
function createClusterObject(clusterId, components, similarities, threshold) {
    // Calculate cluster similarities
    const clusterSimilarities = similarities.filter(sim => 
        components.some(c => c.id === sim.component1Id) && 
        components.some(c => c.id === sim.component2Id)
    );
    
    const avgSimilarity = clusterSimilarities.length > 0
        ? clusterSimilarities.reduce((sum, s) => sum + s.similarity, 0) / clusterSimilarities.length
        : 0;

    const maxSimilarity = clusterSimilarities.length > 0
        ? Math.max(...clusterSimilarities.map(s => s.similarity))
        : 0;

    const minSimilarity = clusterSimilarities.length > 0
        ? Math.min(...clusterSimilarities.map(s => s.similarity))
        : 0;

    // Find common technologies
    const commonTechnologies = findCommonTechnologies(components);
    
    // Calculate application distribution
    const applications = new Set(components.map(c => c.applicationName));
    const applicationDistribution = {};
    applications.forEach(app => {
        applicationDistribution[app] = components.filter(c => c.applicationName === app).length;
    });

    // Identify cluster characteristics
    const characteristics = identifyClusterCharacteristics(components, commonTechnologies);

    return {
        clusterId: `cluster-${clusterId}`,
        name: `Cluster ${clusterId}`,
        size: components.length,
        components: components.map(c => ({
            id: c.id,
            componentName: c.componentName,
            applicationName: c.applicationName,
            runtime: c.runtime,
            framework: c.framework,
            databases: c.databases,
            integrations: c.integrations,
            storages: c.storages
        })),
        similarities: {
            avg: Math.round(avgSimilarity * 1000) / 1000,
            max: Math.round(maxSimilarity * 1000) / 1000,
            min: Math.round(minSimilarity * 1000) / 1000,
            count: clusterSimilarities.length
        },
        commonTechnologies,
        applicationDistribution,
        characteristics,
        metadata: {
            threshold,
            uniqueApplications: applications.size,
            createdAt: new Date().toISOString()
        }
    };
}

/**
 * Find common technologies across cluster components
 */
function findCommonTechnologies(components) {
    if (components.length === 0) return {};

    const common = {
        runtime: components[0].runtime,
        framework: components[0].framework,
        databases: [...(components[0].databases || [])],
        integrations: [...(components[0].integrations || [])],
        storages: [...(components[0].storages || [])]
    };

    for (let i = 1; i < components.length; i++) {
        const comp = components[i];
        
        // Check runtime consistency
        if (common.runtime !== comp.runtime) {
            common.runtime = null;
        }
        
        // Check framework consistency
        if (common.framework !== comp.framework) {
            common.framework = null;
        }
        
        // Find intersection of arrays
        common.databases = common.databases.filter(db => (comp.databases || []).includes(db));
        common.integrations = common.integrations.filter(int => (comp.integrations || []).includes(int));
        common.storages = common.storages.filter(stor => (comp.storages || []).includes(stor));
    }

    return common;
}

/**
 * Identify cluster characteristics for better understanding
 */
function identifyClusterCharacteristics(components, commonTechnologies) {
    const characteristics = [];

    // Runtime consistency
    if (commonTechnologies.runtime) {
        characteristics.push(`Consistent Runtime: ${commonTechnologies.runtime}`);
    }

    // Framework consistency
    if (commonTechnologies.framework) {
        characteristics.push(`Consistent Framework: ${commonTechnologies.framework}`);
    }

    // Common databases
    if (commonTechnologies.databases.length > 0) {
        characteristics.push(`Shared Databases: ${commonTechnologies.databases.join(', ')}`);
    }

    // Common integrations
    if (commonTechnologies.integrations.length > 0) {
        characteristics.push(`Shared Integrations: ${commonTechnologies.integrations.join(', ')}`);
    }

    // Common storage
    if (commonTechnologies.storages.length > 0) {
        characteristics.push(`Shared Storage: ${commonTechnologies.storages.join(', ')}`);
    }

    // Application diversity
    const uniqueApps = new Set(components.map(c => c.applicationName)).size;
    if (uniqueApps === 1) {
        characteristics.push('Single Application Cluster');
    } else {
        characteristics.push(`Cross-Application Cluster (${uniqueApps} apps)`);
    }

    return characteristics;
}

/**
 * Analyze cluster quality and provide insights
 */
function analyzeClusterQuality(clusters, similarities) {
    const analysis = {
        qualityMetrics: {
            avgIntraClusterSimilarity: 0,
            clusterCohesion: 0,
            clusterSeparation: 0
        },
        insights: [],
        recommendations: []
    };

    if (clusters.length === 0) {
        analysis.insights.push('No clusters found - consider lowering the similarity threshold');
        return analysis;
    }

    // Calculate average intra-cluster similarity
    const totalIntraClusterSimilarity = clusters.reduce((sum, cluster) => sum + cluster.similarities.avg, 0);
    analysis.qualityMetrics.avgIntraClusterSimilarity = totalIntraClusterSimilarity / clusters.length;

    // Generate insights
    const largestCluster = clusters[0];
    analysis.insights.push(`Largest cluster contains ${largestCluster.size} components`);
    
    const singleAppClusters = clusters.filter(c => c.metadata.uniqueApplications === 1).length;
    const crossAppClusters = clusters.length - singleAppClusters;
    
    if (crossAppClusters > 0) {
        analysis.insights.push(`${crossAppClusters} clusters span multiple applications`);
    }
    
    if (singleAppClusters > 0) {
        analysis.insights.push(`${singleAppClusters} clusters are within single applications`);
    }

    // Generate recommendations
    if (clusters.length > 20) {
        analysis.recommendations.push('Consider increasing similarity threshold to reduce cluster count');
    }
    
    if (clusters.length < 3) {
        analysis.recommendations.push('Consider decreasing similarity threshold to find more clusters');
    }

    const avgClusterSize = clusters.reduce((sum, c) => sum + c.size, 0) / clusters.length;
    if (avgClusterSize > 10) {
        analysis.recommendations.push('Large clusters found - consider sub-clustering for better organization');
    }

    return analysis;
}
