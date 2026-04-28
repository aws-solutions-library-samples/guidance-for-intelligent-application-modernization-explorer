const AWS = require('aws-sdk');

// Initialize AWS services
const s3 = new AWS.S3({ region: process.env.AWS_REGION });

// Environment variables
const PROCESSING_BUCKET = process.env.PROCESSING_BUCKET;
const PROJECT_ID = process.env.PROJECT_ID;

/**
 * FindPatterns Lambda Function
 * 
 * Identifies repeated technology patterns across components to highlight
 * quick win opportunities for standardization and modernization.
 */
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
    console.log('FindPatterns started', JSON.stringify(sanitizeEvent(event), null, 2));
    
    const startTime = Date.now();
    
    try {
        const { componentData, executionId, projectId } = event;
        
        if (!executionId || !projectId) {
            throw new Error('executionId and projectId are required');
        }

        console.log(`Finding patterns for project: ${projectId}`);
        
        let components;
        
        // Load component data (either from event or from S3)
        if (componentData && Array.isArray(componentData)) {
            components = transformAthenaDataToComponents(componentData);
            console.log(`Using component data from event: ${components.length} components`);
        } else {
            // Load from S3 if not provided in event
            const fullDatasetKey = `datasets/${projectId}/${executionId}/full-dataset.json`;
            const fullDataset = await loadDatasetFromS3(fullDatasetKey);
            components = fullDataset.components;
            console.log(`Loaded component data from S3: ${components.length} components`);
        }

        // Find repeated technology patterns
        const patterns = findRepeatedTechnologyPatterns(components);
        
        // Analyze pattern significance and quick win potential
        const patternAnalysis = analyzePatternSignificance(patterns, components);
        
        // Generate modernization recommendations
        const recommendations = generateModernizationRecommendations(patterns, components);
        
        // Store pattern results
        const patternResultsKey = `results/${projectId}/${executionId}/repeated-patterns.json`;
        const patternResults = {
            patterns,
            analysis: patternAnalysis,
            recommendations,
            statistics: {
                totalPatterns: patterns.length,
                totalRepeatedComponents: patterns.reduce((sum, p) => sum + p.frequency, 0),
                avgPatternFrequency: patterns.length > 0 
                    ? patterns.reduce((sum, p) => sum + p.frequency, 0) / patterns.length 
                    : 0,
                mostCommonPatternFrequency: patterns.length > 0 
                    ? Math.max(...patterns.map(p => p.frequency)) 
                    : 0,
                patternAnalysisTimeMs: Date.now() - startTime
            },
            metadata: {
                executionId,
                projectId,
                timestamp: new Date().toISOString(),
                totalComponents: components.length
            }
        };

        await s3.putObject({
            Bucket: PROCESSING_BUCKET,
            Key: patternResultsKey,
            Body: JSON.stringify(patternResults),
            ContentType: 'application/json',
            Metadata: {
                executionId,
                projectId,
                totalPatterns: patterns.length.toString(),
                mostCommonFrequency: patternResults.statistics.mostCommonPatternFrequency.toString()
            }
        }).promise();

        console.log(`Stored pattern results: ${patternResultsKey}`);

        const response = {
            success: true,
            patternResultsKey,
            statistics: patternResults.statistics,
            executionId,
            projectId
        };

        console.log('FindPatterns completed successfully', {
            totalPatterns: response.statistics.totalPatterns,
            avgFrequency: response.statistics.avgPatternFrequency.toFixed(1),
            analysisTime: response.statistics.patternAnalysisTimeMs
        });

        return response;

    } catch (error) {
        console.error('Error in FindPatterns:', error);
        throw new Error(`FindPatterns failed: ${error.message}`);
    }
};

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
 * Find repeated technology patterns across components
 */
function findRepeatedTechnologyPatterns(components) {
    console.log('Finding repeated technology patterns...');
    
    const patterns = new Map();

    components.forEach(component => {
        // Create multiple pattern signatures at different granularities
        const patternSignatures = createPatternSignatures(component);
        
        patternSignatures.forEach(signature => {
            const patternKey = signature.key;
            
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
                    pattern: signature.pattern,
                    patternType: signature.type,
                    frequency: 1,
                    components: [{
                        id: component.id,
                        applicationName: component.applicationName,
                        componentName: component.componentName
                    }]
                });
            }
        });
    });

    // Return only patterns that appear more than once, sorted by frequency
    const repeatedPatterns = Array.from(patterns.values())
        .filter(p => p.frequency > 1)
        .sort((a, b) => b.frequency - a.frequency)
        .map((p, index) => ({
            patternId: `pattern-${index + 1}`,
            patternName: generatePatternName(p.pattern, p.patternType),
            ...p
        }));

    console.log(`Found ${repeatedPatterns.length} repeated patterns`);
    return repeatedPatterns;
}

/**
 * Create multiple pattern signatures at different granularities
 */
function createPatternSignatures(component) {
    const signatures = [];

    // Full stack pattern (most specific)
    signatures.push({
        type: 'full_stack',
        key: JSON.stringify({
            runtime: component.runtime,
            framework: component.framework,
            databases: [...(component.databases || [])].sort(),
            integrations: [...(component.integrations || [])].sort(),
            storages: [...(component.storages || [])].sort()
        }),
        pattern: {
            runtime: component.runtime,
            framework: component.framework,
            databases: [...(component.databases || [])].sort(),
            integrations: [...(component.integrations || [])].sort(),
            storages: [...(component.storages || [])].sort()
        }
    });

    // Runtime + Framework pattern
    if (component.runtime && component.framework) {
        signatures.push({
            type: 'runtime_framework',
            key: JSON.stringify({
                runtime: component.runtime,
                framework: component.framework
            }),
            pattern: {
                runtime: component.runtime,
                framework: component.framework
            }
        });
    }

    // Database pattern (if has databases)
    if (component.databases && component.databases.length > 0) {
        signatures.push({
            type: 'database_stack',
            key: JSON.stringify({
                databases: [...component.databases].sort()
            }),
            pattern: {
                databases: [...component.databases].sort()
            }
        });
    }

    // Integration pattern (if has integrations)
    if (component.integrations && component.integrations.length > 0) {
        signatures.push({
            type: 'integration_stack',
            key: JSON.stringify({
                integrations: [...component.integrations].sort()
            }),
            pattern: {
                integrations: [...component.integrations].sort()
            }
        });
    }

    // Storage pattern (if has storage)
    if (component.storages && component.storages.length > 0) {
        signatures.push({
            type: 'storage_stack',
            key: JSON.stringify({
                storages: [...component.storages].sort()
            }),
            pattern: {
                storages: [...component.storages].sort()
            }
        });
    }

    return signatures;
}

/**
 * Generate human-readable pattern names
 */
function generatePatternName(pattern, patternType) {
    switch (patternType) {
        case 'full_stack':
            const parts = [];
            if (pattern.runtime) parts.push(pattern.runtime);
            if (pattern.framework) parts.push(pattern.framework);
            if (pattern.databases && pattern.databases.length > 0) {
                parts.push(`DB: ${pattern.databases.join(', ')}`);
            }
            return parts.join(' + ') || 'Full Stack Pattern';
            
        case 'runtime_framework':
            return `${pattern.runtime} + ${pattern.framework}`;
            
        case 'database_stack':
            return `Database: ${pattern.databases.join(', ')}`;
            
        case 'integration_stack':
            return `Integration: ${pattern.integrations.join(', ')}`;
            
        case 'storage_stack':
            return `Storage: ${pattern.storages.join(', ')}`;
            
        default:
            return 'Technology Pattern';
    }
}

/**
 * Analyze pattern significance and quick win potential
 */
function analyzePatternSignificance(patterns, components) {
    console.log('Analyzing pattern significance...');
    
    const analysis = {
        quickWins: [],
        standardizationOpportunities: [],
        consolidationCandidates: [],
        insights: []
    };

    // Identify quick wins (high frequency patterns)
    const quickWinThreshold = Math.max(3, Math.ceil(components.length * 0.05)); // At least 3 or 5% of components
    analysis.quickWins = patterns
        .filter(p => p.frequency >= quickWinThreshold)
        .map(p => ({
            patternId: p.patternId,
            patternName: p.patternName,
            frequency: p.frequency,
            percentage: ((p.frequency / components.length) * 100).toFixed(1),
            quickWinReason: `Appears in ${p.frequency} components (${((p.frequency / components.length) * 100).toFixed(1)}% of total)`
        }));

    // Identify standardization opportunities (runtime + framework patterns)
    analysis.standardizationOpportunities = patterns
        .filter(p => p.patternType === 'runtime_framework' && p.frequency >= 2)
        .map(p => ({
            patternId: p.patternId,
            patternName: p.patternName,
            frequency: p.frequency,
            applications: [...new Set(p.components.map(c => c.applicationName))],
            standardizationPotential: p.frequency >= 5 ? 'High' : p.frequency >= 3 ? 'Medium' : 'Low'
        }));

    // Identify consolidation candidates (identical full stacks)
    analysis.consolidationCandidates = patterns
        .filter(p => p.patternType === 'full_stack' && p.frequency >= 2)
        .map(p => ({
            patternId: p.patternId,
            patternName: p.patternName,
            frequency: p.frequency,
            components: p.components,
            consolidationPotential: p.frequency >= 4 ? 'High' : 'Medium'
        }));

    // Generate insights
    if (analysis.quickWins.length > 0) {
        analysis.insights.push(`${analysis.quickWins.length} high-frequency patterns identified as quick wins`);
    }

    if (analysis.standardizationOpportunities.length > 0) {
        analysis.insights.push(`${analysis.standardizationOpportunities.length} runtime+framework combinations found for standardization`);
    }

    if (analysis.consolidationCandidates.length > 0) {
        analysis.insights.push(`${analysis.consolidationCandidates.length} identical technology stacks found for potential consolidation`);
    }

    const totalPatterned = patterns.reduce((sum, p) => sum + p.frequency, 0);
    const patternedPercentage = ((totalPatterned / components.length) * 100).toFixed(1);
    analysis.insights.push(`${patternedPercentage}% of components follow repeated patterns`);

    return analysis;
}

/**
 * Generate modernization recommendations based on patterns
 */
function generateModernizationRecommendations(patterns, components) {
    console.log('Generating modernization recommendations...');
    
    const recommendations = [];

    // Analyze technology age and modernization needs
    const legacyTechnologies = identifyLegacyTechnologies(patterns);
    const modernTechnologies = identifyModernTechnologies(patterns);

    // Recommendation 1: Legacy technology modernization
    if (legacyTechnologies.length > 0) {
        recommendations.push({
            type: 'legacy_modernization',
            priority: 'High',
            title: 'Legacy Technology Modernization',
            description: 'Several patterns contain legacy technologies that should be modernized',
            affectedPatterns: legacyTechnologies.map(tech => ({
                technology: tech.technology,
                patterns: tech.patterns,
                totalComponents: tech.totalComponents
            })),
            recommendedActions: [
                'Create migration plan for legacy technologies',
                'Prioritize patterns with highest component count',
                'Consider gradual migration approach',
                'Establish modern technology standards'
            ]
        });
    }

    // Recommendation 2: Standardization opportunities
    const runtimeFrameworkPatterns = patterns.filter(p => p.patternType === 'runtime_framework');
    if (runtimeFrameworkPatterns.length > 0) {
        recommendations.push({
            type: 'standardization',
            priority: 'Medium',
            title: 'Runtime and Framework Standardization',
            description: 'Multiple runtime+framework combinations found - consider standardizing',
            affectedPatterns: runtimeFrameworkPatterns.slice(0, 5), // Top 5
            recommendedActions: [
                'Select 2-3 preferred runtime+framework combinations',
                'Create migration roadmap for non-standard combinations',
                'Establish development guidelines',
                'Provide training on standard technologies'
            ]
        });
    }

    // Recommendation 3: Consolidation opportunities
    const consolidationCandidates = patterns.filter(p => 
        p.patternType === 'full_stack' && p.frequency >= 3
    );
    if (consolidationCandidates.length > 0) {
        recommendations.push({
            type: 'consolidation',
            priority: 'Medium',
            title: 'Component Consolidation',
            description: 'Identical technology stacks found - consider consolidating components',
            affectedPatterns: consolidationCandidates,
            recommendedActions: [
                'Analyze business logic overlap in identical components',
                'Consider merging components with identical tech stacks',
                'Create shared libraries for common functionality',
                'Reduce maintenance overhead through consolidation'
            ]
        });
    }

    // Recommendation 4: Template creation
    const highFrequencyPatterns = patterns.filter(p => p.frequency >= 5);
    if (highFrequencyPatterns.length > 0) {
        recommendations.push({
            type: 'template_creation',
            priority: 'Low',
            title: 'Component Template Creation',
            description: 'High-frequency patterns should be converted to reusable templates',
            affectedPatterns: highFrequencyPatterns,
            recommendedActions: [
                'Create component templates for common patterns',
                'Establish template governance process',
                'Provide template documentation and examples',
                'Encourage template usage in new development'
            ]
        });
    }

    return recommendations;
}

/**
 * Identify legacy technologies that need modernization
 */
function identifyLegacyTechnologies(patterns) {
    const legacyTechs = [
        // Legacy runtimes
        'Java 8', 'Java 7', 'Node.js 10', 'Node.js 12', 'Python 2.7', 'Python 3.6',
        '.NET Framework', 'PHP 7.0', 'PHP 7.1', 'Ruby 2.5',
        // Legacy frameworks
        'AngularJS', 'jQuery', 'Struts', 'Spring 4', 'Django 1.x', 'Rails 4'
    ];

    const legacyFindings = [];
    
    legacyTechs.forEach(tech => {
        const affectedPatterns = patterns.filter(p => 
            (p.pattern.runtime && p.pattern.runtime.includes(tech)) ||
            (p.pattern.framework && p.pattern.framework.includes(tech))
        );
        
        if (affectedPatterns.length > 0) {
            legacyFindings.push({
                technology: tech,
                patterns: affectedPatterns,
                totalComponents: affectedPatterns.reduce((sum, p) => sum + p.frequency, 0)
            });
        }
    });

    return legacyFindings.sort((a, b) => b.totalComponents - a.totalComponents);
}

/**
 * Identify modern technologies for recommendations
 */
function identifyModernTechnologies(patterns) {
    const modernTechs = [
        // Modern runtimes
        'Java 17', 'Java 21', 'Node.js 18', 'Node.js 20', 'Python 3.9', 'Python 3.10', 'Python 3.11',
        '.NET 6', '.NET 7', 'PHP 8.1', 'PHP 8.2', 'Ruby 3.0',
        // Modern frameworks
        'React', 'Vue 3', 'Angular', 'Spring Boot', 'Django 4', 'Rails 7', 'Next.js'
    ];

    return patterns.filter(p => 
        modernTechs.some(tech => 
            (p.pattern.runtime && p.pattern.runtime.includes(tech)) ||
            (p.pattern.framework && p.pattern.framework.includes(tech))
        )
    );
}
