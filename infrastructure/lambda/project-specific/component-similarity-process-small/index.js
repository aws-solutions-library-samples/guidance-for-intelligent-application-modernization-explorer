const AWS = require('aws-sdk');

// Initialize AWS services
const dynamodb = new AWS.DynamoDB.DocumentClient({ region: process.env.AWS_REGION });
const s3 = new AWS.S3({ region: process.env.AWS_REGION });

// Environment variables
const COMPONENT_SIMILARITY_TABLE = process.env.COMPONENT_SIMILARITY_TABLE;
const PROCESSING_BUCKET = process.env.PROCESSING_BUCKET;
const PROJECT_ID = process.env.PROJECT_ID;

/**
 * ProcessSmallDataset Lambda Function
 * 
 * Processes component similarity analysis for small datasets (< 1K components)
 * directly without partitioning. Performs complete analysis in a single execution.
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
    console.log('ProcessSmallDataset started', JSON.stringify(sanitizeEvent(event), null, 2));
    
    const startTime = Date.now();
    
    try {
        const { componentData, filters = {}, executionId, projectId } = event;
        
        if (!componentData || !Array.isArray(componentData)) {
            throw new Error('componentData is required and must be an array');
        }

        if (!executionId || !projectId) {
            throw new Error('executionId and projectId are required');
        }

        console.log(`Processing ${componentData.length} components for project: ${projectId}`);
        
        // Transform Athena data to component format
        const components = transformAthenaDataToComponents(componentData);
        
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

        // Calculate component similarities
        const similarities = calculateComponentSimilarities(components, weights, minThreshold);
        
        // Generate component clusters
        const clusters = generateComponentClusters(components, similarities, minThreshold);
        
        // Find repeated patterns
        const patterns = findRepeatedPatterns(components);
        
        // Calculate statistics
        const statistics = {
            totalComponents: components.length,
            similarPairs: similarities.length,
            avgSimilarityScore: similarities.length > 0 
                ? similarities.reduce((sum, s) => sum + s.similarity, 0) / similarities.length 
                : 0,
            clustersFound: clusters.length,
            patternsFound: patterns.length,
            processingTimeMs: Date.now() - startTime
        };

        // Store results in S3 for consistency with partitioned approach
        const resultsKey = `results/${projectId}/${executionId}/small-dataset-results.json`;
        const results = {
            similarities,
            clusters,
            patterns,
            statistics,
            metadata: {
                analysisType: 'component_similarity_small',
                executionId,
                projectId,
                timestamp: new Date().toISOString(),
                filters,
                weights
            }
        };

        await s3.putObject({
            Bucket: PROCESSING_BUCKET,
            Key: resultsKey,
            Body: JSON.stringify(results),
            ContentType: 'application/json',
            Metadata: {
                executionId,
                projectId,
                analysisType: 'component_similarity_small',
                totalComponents: components.length.toString()
            }
        }).promise();

        console.log(`Results stored in S3: ${resultsKey}`);

        const response = {
            success: true,
            analysisType: 'small_dataset',
            resultsKey,
            statistics,
            executionId,
            projectId
        };

        console.log('ProcessSmallDataset completed successfully', response);
        return response;

    } catch (error) {
        console.error('Error in ProcessSmallDataset:', error);
        throw new Error(`ProcessSmallDataset failed: ${error.message}`);
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
 * Calculate similarities between all component pairs
 */
function calculateComponentSimilarities(components, weights, minThreshold) {
    const similarities = [];
    const n = components.length;

    console.log(`Calculating similarities for ${n} components (${n * (n - 1) / 2} pairs)`);

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const similarity = calculateSimilarityScore(components[i], components[j], weights);
            
            if (similarity >= minThreshold) {
                similarities.push({
                    component1Id: components[i].id,
                    component2Id: components[j].id,
                    component1Name: components[i].componentName,
                    component2Name: components[j].componentName,
                    application1: components[i].applicationName,
                    application2: components[j].applicationName,
                    similarity: Math.round(similarity * 1000) / 1000,
                    details: {
                        runtimeMatch: components[i].runtime === components[j].runtime,
                        frameworkMatch: components[i].framework === components[j].framework,
                        databaseOverlap: calculateJaccardSimilarity(components[i].databases, components[j].databases),
                        integrationOverlap: calculateJaccardSimilarity(components[i].integrations, components[j].integrations),
                        storageOverlap: calculateJaccardSimilarity(components[i].storages, components[j].storages)
                    }
                });
            }
        }
    }

    console.log(`Found ${similarities.length} similar pairs above threshold ${minThreshold}`);
    return similarities;
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

/**
 * Generate component clusters based on similarity results
 */
function generateComponentClusters(components, similarities, threshold) {
    console.log('Generating component clusters...');
    
    // Build adjacency graph
    const graph = new Map();
    components.forEach(comp => graph.set(comp.id, new Set()));
    
    similarities.forEach(sim => {
        if (sim.similarity >= threshold) {
            graph.get(sim.component1Id).add(sim.component2Id);
            graph.get(sim.component2Id).add(sim.component1Id);
        }
    });

    // Find connected components (clusters)
    const visited = new Set();
    const clusters = [];
    let clusterId = 1;

    components.forEach(component => {
        if (!visited.has(component.id)) {
            const cluster = findConnectedComponents(component.id, graph, visited, components);
            
            if (cluster.length > 1) { // Only clusters with multiple components
                const clusterSimilarities = similarities.filter(sim => 
                    cluster.some(c => c.id === sim.component1Id) && 
                    cluster.some(c => c.id === sim.component2Id)
                );
                
                const avgSimilarity = clusterSimilarities.length > 0
                    ? clusterSimilarities.reduce((sum, s) => sum + s.similarity, 0) / clusterSimilarities.length
                    : 0;

                clusters.push({
                    clusterId: `cluster-${clusterId}`,
                    name: `Cluster ${clusterId}`,
                    components: cluster,
                    size: cluster.length,
                    avgSimilarity: Math.round(avgSimilarity * 1000) / 1000,
                    commonTechnologies: findCommonTechnologies(cluster)
                });
                clusterId++;
            }
        }
    });

    console.log(`Generated ${clusters.length} clusters`);
    return clusters.sort((a, b) => b.size - a.size);
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
 * Find repeated technology patterns across components
 */
function findRepeatedPatterns(components) {
    console.log('Finding repeated patterns...');
    
    const patterns = new Map();

    components.forEach(component => {
        // Create pattern signature
        const pattern = {
            runtime: component.runtime,
            framework: component.framework,
            databases: [...(component.databases || [])].sort(),
            integrations: [...(component.integrations || [])].sort(),
            storages: [...(component.storages || [])].sort()
        };

        const patternKey = JSON.stringify(pattern);
        
        if (patterns.has(patternKey)) {
            const existing = patterns.get(patternKey);
            existing.components.push({
                id: component.id,
                applicationName: component.applicationName,
                componentName: component.componentName
            });
            existing.frequency++;
        } else {
            patterns.set(patternKey, {
                pattern,
                frequency: 1,
                components: [{
                    id: component.id,
                    applicationName: component.applicationName,
                    componentName: component.componentName
                }]
            });
        }
    });

    // Return only patterns that appear more than once
    const repeatedPatterns = Array.from(patterns.values())
        .filter(p => p.frequency > 1)
        .sort((a, b) => b.frequency - a.frequency)
        .map((p, index) => ({
            patternId: `pattern-${index + 1}`,
            patternName: `Pattern ${index + 1}`,
            ...p
        }));

    console.log(`Found ${repeatedPatterns.length} repeated patterns`);
    return repeatedPatterns;
}
