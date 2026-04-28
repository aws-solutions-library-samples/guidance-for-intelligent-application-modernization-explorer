import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ContentLayout,
  Header,
  Box,
  SpaceBetween,
  Alert,
  Container,
  Tabs,
  Grid,
  Spinner,
  Table,
  Badge,
  Pagination,
  CollectionPreferences,
  TextFilter,
  Button,
  Modal,
  Icon,
  Input,
  FormField
} from '@cloudscape-design/components';

// Layouts
import Layout from '../../layouts/AppLayout';

// Components
import ComponentSimilaritiesInfoContent from '../../components/info/ComponentSimilaritiesInfoContent';
import ComponentSimilaritiesAnalysisTrigger from '../../components/ComponentSimilaritiesAnalysisTrigger';
// import ComponentSimilarityMatrix from '../../components/ComponentSimilarityMatrix';
// import ComponentClusters from '../../components/ComponentClusters';
import RepeatedPatternsTable from '../../components/RepeatedPatternsTable';
import MissingDataAlert from '../../components/MissingDataAlert';

// Hooks
import useDataSourceCheck from '../../hooks/useDataSourceCheck';

// Services
import { fetchComponentSimilarityResults } from '../../services/componentSimilarityApi';
import { getTechStackData } from '../../services/athenaQueryService';

/**
 * Component Similarities Page Component
 * 
 * This page analyzes similarities at the component level using backend Step Functions
 * processing for scalability with large datasets (35K+ components).
 * 
 * Layout is consistent with ApplicationSimilaritiesPage for better UX.
 */
const ComponentSimilaritiesPage = () => {
  const { t } = useTranslation(['pages', 'common', 'components']);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [error, setError] = useState(null);
  const [analysisCompleted, setAnalysisCompleted] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  const [activeTab, setActiveTab] = useState('matrix');
  const [loading, setLoading] = useState(true);
  
  // Execution state - lifted from Trigger component
  const [executionStatus, setExecutionStatus] = useState(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  // Check for required data sources
  const { hasData, loading: checkingData, missingDataSources } = useDataSourceCheck(['applications-portfolio', 'applications-tech-stack']);
  
  // Component similarity pairs table state
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const [filterText, setFilterText] = useState('');
  const [selectedSimilarityPair, setSelectedSimilarityPair] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [showClusterModal, setShowClusterModal] = useState(false);
  const [preferences, setPreferences] = useState({
    pageSize: 10,
    visibleContent: ['component1', 'component2', 'similarity', 'actions']
  });

  // Threshold input state for Component Clusters 1
  const [similarityThreshold, setSimilarityThreshold] = useState(70); // Default 70%
  const [allSimilarityData, setAllSimilarityData] = useState(null); // Store all similarity data
  const [filteredClusters, setFilteredClusters] = useState([]); // Locally filtered clusters

  // Similarity Clusters tab state (new tab)
  const [selectedSimilarityCluster, setSelectedSimilarityCluster] = useState(null);
  const clusterChartRef = useRef(null);

  // Debug preferences changes
  useEffect(() => {
    console.log('🔧 Preferences state changed:', preferences);
  }, [preferences]);

  // Get project ID from localStorage - use same key as trigger component
  const projectData = localStorage.getItem('selectedProject');
  const projectId = projectData ? JSON.parse(projectData).projectId : null;

  // Function to enhance similarity results with tech stack data
  const enhanceSimilarityResultsWithTechData = (similarityResults, techStackData) => {
    console.log('🔄 Enhancing similarity results with tech stack data...');
    console.log('📊 Similarity results components count:', similarityResults.components?.length || 0);
    console.log('📊 Tech stack data count:', techStackData?.length || 0);
    
    // Create a map of component ID to tech stack data
    const techStackMap = new Map();
    techStackData.forEach(tech => {
      techStackMap.set(tech.id, tech);
    });
    
    console.log('🗺️ Tech stack map created with', techStackMap.size, 'entries');
    console.log('🔍 Sample tech stack entry:', techStackData?.[0]);
    console.log('🔍 Sample similarity component:', similarityResults.components?.[0]);
    
    // Enhance components with tech stack data
    const enhancedComponents = similarityResults.components?.map(comp => {
      const techData = techStackMap.get(comp.id);
      const enhanced = {
        ...comp,
        runtime: techData?.runtime || '',
        framework: techData?.framework || '',
        databases: techData?.databases || '',
        integrations: techData?.integrations || '',
        storages: techData?.storages || ''
      };
      
      // Log first few enhanced components
      if (similarityResults.components.indexOf(comp) < 3) {
        console.log(`🔍 Enhanced component ${comp.id}:`, enhanced);
      }
      
      return enhanced;
    }) || [];

    // Enhance similarity matrix with application information
    const enhancedSimilarityMatrix = similarityResults.similarityMatrix?.map(pair => ({
      ...pair,
      // The Lambda already provides application1 and application2 fields
      component1_application: pair.application1 || t('common:general.unknown') + ' Application',
      component2_application: pair.application2 || t('common:general.unknown') + ' Application'
    })) || [];
    
    console.log('✅ Enhanced', enhancedComponents.length, 'components with tech data');
    console.log('🔍 Enhanced similarity matrix count:', enhancedSimilarityMatrix.length);
    console.log('🔍 Sample enhanced similarity pair:', enhancedSimilarityMatrix[0]);
    
    // Generate granular repeated patterns using the enhanced component data
    const granularPatterns = generateGranularPatterns(enhancedComponents);
    
    return {
      ...similarityResults,
      components: enhancedComponents,
      similarityMatrix: enhancedSimilarityMatrix,
      repeatedPatterns: granularPatterns
    };
  };

  // Function to generate granular technology patterns
  const generateGranularPatterns = (components) => {
    console.log('🏗️ Generating granular technology patterns...');
    console.log('📊 Input components for pattern generation:', components.length);
    
    const patterns = [];
    const technologyCombinations = new Map();
    let processedCount = 0;
    let skippedCount = 0;
    let emptyTechCount = 0;
    
    // Debug: Count components with tech data
    const componentsWithTechData = components.filter(comp => 
      comp.runtime || comp.framework || comp.databases || comp.integrations || comp.storages
    );
    console.log('📊 Components with some tech data:', componentsWithTechData.length);
    console.log('📊 Components without tech data:', components.length - componentsWithTechData.length);
    
    components.forEach((comp, index) => {
      // Create comprehensive technology stack signature
      const runtime = (comp.runtime || '').toLowerCase().trim();
      const framework = (comp.framework || '').toLowerCase().trim();
      
      // Handle databases, integrations, storages as comma-separated strings
      let databases = comp.databases || '';
      if (typeof databases === 'string') {
        databases = databases.split(',').map(db => db.trim().toLowerCase()).filter(db => db);
      }
      databases = databases.sort();
      
      let integrations = comp.integrations || '';
      if (typeof integrations === 'string') {
        integrations = integrations.split(',').map(int => int.trim().toLowerCase()).filter(int => int);
      }
      integrations = integrations.sort();
      
      let storages = comp.storages || '';
      if (typeof storages === 'string') {
        storages = storages.split(',').map(stor => stor.trim().toLowerCase()).filter(stor => stor);
      }
      storages = storages.sort();
      
      // Create technology stack signature for grouping
      const techStackSignature = `${runtime}|${framework}|${databases.join(',')}|${integrations.join(',')}|${storages.join(',')}`;
      
      // Log first few components for debugging
      if (index < 10) {
        console.log(`🔍 Component ${comp.id} tech signature:`, {
          runtime,
          framework,
          databases,
          integrations,
          storages,
          signature: techStackSignature,
          originalData: {
            runtime: comp.runtime,
            framework: comp.framework,
            databases: comp.databases,
            integrations: comp.integrations,
            storages: comp.storages
          }
        });
      }
      
      // Check if component has any technology data
      const hasAnyTechData = runtime || framework || databases.length > 0 || integrations.length > 0 || storages.length > 0;
      
      if (!hasAnyTechData) {
        emptyTechCount++;
        // For large datasets, let's create a pattern for "No Technology Data" components
        const emptySignature = 'no-tech-data';
        if (!technologyCombinations.has(emptySignature)) {
          technologyCombinations.set(emptySignature, {
            signature: {
              runtime: null,
              framework: null,
              databases: [],
              integrations: [],
              storages: []
            },
            components: []
          });
        }
        
        technologyCombinations.get(emptySignature).components.push({
          componentId: comp.id,
          componentName: comp.componentname || comp.name || t('common:general.unknown') + ' Component',
          applicationName: comp.applicationname || comp.application || t('common:general.unknown') + ' Application'
        });
        
        processedCount++;
        return;
      }
      
      // Create more flexible patterns by also considering partial matches
      const partialSignatures = [
        techStackSignature, // Full signature
        `${runtime}|${framework}|||`, // Runtime + Framework only
        `${runtime}||||`, // Runtime only
        `|${framework}|||`, // Framework only
        `||${databases.join(',')}||`, // Databases only
        `|||${integrations.join(',')}|`, // Integrations only
        `||||${storages.join(',')}` // Storages only
      ].filter(sig => sig !== '|||||'); // Remove completely empty signatures
      
      // Use the most specific signature that's not empty
      const selectedSignature = partialSignatures[0];
      
      if (!technologyCombinations.has(selectedSignature)) {
        technologyCombinations.set(selectedSignature, {
          signature: {
            runtime: runtime || null,
            framework: framework || null,
            databases: databases,
            integrations: integrations,
            storages: storages
          },
          components: []
        });
      }
      
      technologyCombinations.get(selectedSignature).components.push({
        componentId: comp.id,
        componentName: comp.componentname || comp.name || t('common:general.unknown') + ' Component',
        applicationName: comp.applicationname || comp.application || t('common:general.unknown') + ' Application'
      });
      
      processedCount++;
    });
    
    console.log(`📊 Enhanced pattern generation stats:`, {
      totalComponents: components.length,
      processedComponents: processedCount,
      skippedComponents: skippedCount,
      emptyTechComponents: emptyTechCount,
      uniqueSignatures: technologyCombinations.size,
      componentsWithTechData: components.length - emptyTechCount
    });
    
    // Log all technology combinations for debugging
    console.log('🔍 All technology combinations:');
    const sortedCombinations = Array.from(technologyCombinations.entries())
      .sort(([, a], [, b]) => b.components.length - a.components.length);
    
    sortedCombinations.forEach(([signature, data], index) => {
      if (index < 20) { // Show top 20 patterns
        console.log(`  ${signature} → ${data.components.length} components`);
      }
    });
    
    // Convert to pattern objects in RepeatedPatternsTable expected format
    let patternId = 0;
    technologyCombinations.forEach((data, techStackSignature) => {
      // Lower the threshold for large datasets - show patterns with 2+ components
      const minPatternSize = components.length > 1000 ? 3 : 2;
      
      if (data.components.length >= minPatternSize) {
        const signature = data.signature;
        
        // Create descriptive pattern name
        const nameParts = [];
        
        // Handle special case for no-tech-data
        if (techStackSignature === 'no-tech-data') {
          nameParts.push('No Technology Data');
        } else {
          if (signature.runtime) nameParts.push(signature.runtime.charAt(0).toUpperCase() + signature.runtime.slice(1));
          if (signature.framework) nameParts.push(signature.framework.charAt(0).toUpperCase() + signature.framework.slice(1));
          if (signature.databases.length > 0) nameParts.push(signature.databases.map(db => db.charAt(0).toUpperCase() + db.slice(1)).join(' + '));
          if (signature.integrations.length > 0) nameParts.push(signature.integrations.map(int => int.charAt(0).toUpperCase() + int.slice(1)).join(' + '));
          if (signature.storages.length > 0) nameParts.push(signature.storages.map(stor => stor.charAt(0).toUpperCase() + stor.slice(1)).join(' + '));
        }
        
        const patternName = nameParts.length > 0 ? nameParts.join(' + ') : `Pattern ${patternId + 1}`;
        
        const pattern = {
          id: `pattern_${patternId}`,
          patternName: patternName,
          frequency: data.components.length,
          pattern: {
            runtime: signature.runtime,
            framework: signature.framework,
            databases: signature.databases,
            integrations: signature.integrations,
            storages: signature.storages
          },
          components: data.components
        };
        
        if (patternId < 10) { // Log first 10 patterns
          console.log(`✅ Created pattern ${patternId}:`, pattern);
        }
        patterns.push(pattern);
        patternId++;
      }
    });
    
    // Sort by frequency (most common first)
    patterns.sort((a, b) => b.frequency - a.frequency);
    
    console.log(`🏗️ Generated ${patterns.length} granular technology patterns`);
    console.log(`📊 Top 5 patterns by frequency:`, patterns.slice(0, 5).map(p => ({
      name: p.patternName,
      frequency: p.frequency
    })));
    
    return patterns;
  };

  // Load existing results on component mount
  useEffect(() => {
    const loadExistingResults = async () => {
      if (!projectId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        // FIRST: Check localStorage for in-flight execution
        const executionKey = `componentSimilarityExecution_${projectId}`;
        const savedExecution = localStorage.getItem(executionKey);
        
        if (savedExecution) {
          const execution = JSON.parse(savedExecution);
          console.log('🔄 Found in-flight component similarity execution:', execution);
          
          // Check if execution is still potentially running (started within last 30 minutes)
          const startTime = new Date(execution.startTime);
          const now = new Date();
          const minutesElapsed = (now - startTime) / 1000 / 60;
          
          if (minutesElapsed < 30 && execution.status === 'RUNNING') {
            console.log('✅ In-flight execution found - skipping DynamoDB check');
            setExecutionStatus(execution);
            setAnalysisProgress(execution.progress || 0);
            setLoading(false);
            // Don't check DynamoDB - analysis is still running
            return;
          } else {
            console.log('⏰ Execution too old or not running, clearing from localStorage');
            localStorage.removeItem(executionKey);
          }
        }
        
        // SECOND: No in-flight execution, check DynamoDB for completed results
        console.log('🔍 Loading existing component similarity results for project:', projectId);
        
        const existingResults = await fetchComponentSimilarityResults(projectId);
        
        // Check if results actually have data (not just empty structure)
        if (existingResults && (existingResults.similarityMatrix?.length > 0 || existingResults.components?.length > 0)) {
          console.log('✅ Found existing component similarity results with data');
          console.log('🔍 Raw backend data structure:', {
            totalComponents: existingResults.totalComponents,
            similarPairs: existingResults.similarPairs,
            componentsCount: existingResults.components?.length,
            similarityMatrixCount: existingResults.similarityMatrix?.length,
            clustersCount: existingResults.clusters?.length,
            patternsCount: existingResults.repeatedPatterns?.length,
            sampleComponent: existingResults.components?.[0],
            sampleSimilarityPair: existingResults.similarityMatrix?.[0],
            sampleCluster: existingResults.clusters?.[0]
          });
          console.log('🔍 DEBUG: About to start tech stack enhancement process...');
          
          // Fetch tech stack data and enhance the existing results
          console.log('📥 Fetching tech stack data to enhance existing results...');
          try {
            const techStackData = await getTechStackData();
            console.log('🔍 Raw tech stack response:', techStackData);
            
            if (techStackData && techStackData.items && Array.isArray(techStackData.items)) {
              console.log('✅ Successfully fetched tech stack data for enhancement');
              console.log('🔍 Tech stack data count:', techStackData.items.length);
              console.log('🔍 Tech stack data sample:', techStackData.items.slice(0, 2));
              
              // Enhance existing results with tech stack data
              const enhancedResults = enhanceSimilarityResultsWithTechData(existingResults, techStackData.items);
              
              setAnalysisData(enhancedResults);
              setAnalysisCompleted(true);
              console.log('✅ Existing results enhanced with technology information');
              console.log('🔍 Enhanced patterns count:', enhancedResults.repeatedPatterns?.length || 0);
            } else {
              console.warn('⚠️ Invalid tech stack data structure:', techStackData);
              setAnalysisData(existingResults);
              setAnalysisCompleted(true);
            }
          } catch (techError) {
            console.error('❌ Error fetching tech stack data for enhancement:', techError);
            console.log('📋 Using existing results without enhancement');
            setAnalysisData(existingResults);
            setAnalysisCompleted(true);
          }
        } else {
          console.log('📭 No existing component similarity results found or empty data');
          setAnalysisData(null);
          setAnalysisCompleted(false);
        }
        
      } catch (err) {
        console.error('❌ Error loading existing component similarity results:', err);
        
        // Only show error for serious issues, not for "endpoint not implemented" cases
        if (!err.message.includes('404') && 
            !err.message.includes('405') &&
            !err.message.includes('403') &&
            !err.message.includes('Failed to fetch') &&
            !err.message.includes('No data') &&
            !err.message.includes('not found') &&
            !err.message.includes('not available')) {
          setError(`Failed to load existing results: ${err.message}`);
        } else {
          console.log('⚠️ Component similarity results endpoint not yet available, continuing normally');
        }
      } finally {
        setLoading(false);
      }
    };

    loadExistingResults();
  }, [projectId]);

  // Helper function to transform clusters data for the component
  const transformClustersData = (clusters, components) => {
    try {
      console.log('🔄 Transforming clusters data...');
      console.log('📊 Input clusters:', clusters?.length || 0);
      console.log('📊 Input components:', components?.length || 0);
      
      if (!clusters || !components) {
        console.log('❌ Missing clusters or components data');
        return [];
      }
      
      // Create a lookup map for components
      const componentLookup = {};
      components.forEach(comp => {
        componentLookup[comp.id] = comp;
      });
      
      console.log('📋 Component lookup created with', Object.keys(componentLookup).length, 'entries');
      
      // Transform clusters to include full component objects
      const transformedClusters = clusters.map((cluster, index) => {
        console.log(`🔄 Transforming cluster ${index}:`, cluster);
        
        const transformedComponents = cluster.components.map(componentId => {
          const comp = componentLookup[componentId] || {};
          console.log(`📦 Component ${componentId}:`, comp);
          
          return {
            componentId: componentId,
            componentName: comp.componentname || '',
            applicationName: comp.applicationname || '',
            runtime: comp.runtime || '',
            framework: comp.framework || '',
            databases: typeof comp.databases === 'string' ? comp.databases.split(',').map(d => d.trim()) : (comp.databases || []),
            integrations: typeof comp.integrations === 'string' ? comp.integrations.split(',').map(i => i.trim()) : (comp.integrations || []),
            storage: typeof comp.storages === 'string' ? comp.storages.split(',').map(s => s.trim()) : (comp.storages || [])
          };
        });
        
        return {
          ...cluster,
          components: transformedComponents
        };
      });
      
      console.log('✅ Clusters transformation completed:', transformedClusters);
      return transformedClusters;
      
    } catch (error) {
      console.error('❌ Error transforming clusters data:', error);
      return [];
    }
  };

  // Handle analysis completion
  // Handle analysis completion
  const handleAnalysisComplete = async (results) => {
    if (results === null) {
      // Clear results
      setAnalysisCompleted(false);
      setAnalysisData(null);
      return;
    }

    console.log('🎉 Component analysis completed:', results);
    
    try {
      // Fetch the similarity results from DynamoDB
      console.log('📥 Fetching similarity results from DynamoDB...');
      const similarityResults = await fetchComponentSimilarityResults(projectId);
      
      // Check if results actually have data
      if (similarityResults && (similarityResults.similarityMatrix?.length > 0 || similarityResults.components?.length > 0)) {
        console.log('✅ Successfully fetched similarity results from DynamoDB with data');
        
        // Fetch the complete tech stack data from Athena
        console.log('📥 Fetching complete tech stack data from Athena...');
        const techStackData = await getTechStackData();
        
        if (techStackData && techStackData.items && Array.isArray(techStackData.items)) {
          console.log('✅ Successfully fetched tech stack data from Athena');
          console.log('🔍 Tech stack data sample:', techStackData.items?.slice(0, 2));
          
          // Combine similarity results with tech stack data
          const enhancedResults = enhanceSimilarityResultsWithTechData(similarityResults, techStackData.items);
          
          setAnalysisCompleted(true);
          setAnalysisData(enhancedResults);
          console.log('✅ Analysis data enhanced with technology information');
          console.log('🔍 Enhanced patterns count:', enhancedResults.repeatedPatterns?.length || 0);
        } else {
          console.warn('⚠️ Failed to fetch tech stack data, using similarity results only');
          setAnalysisCompleted(true);
          setAnalysisData(similarityResults);
        }
      } else {
        console.log('⚠️ No similarity results found in DynamoDB after completion or empty data');
        // Don't set analysisCompleted if there's no actual data
        setAnalysisCompleted(false);
        setAnalysisData(null);
      }
    } catch (error) {
      console.error('❌ Error fetching and enhancing results after completion:', error);
      setAnalysisCompleted(false);
      setAnalysisData(null);
    }
  };

  // Function to generate clusters locally based on threshold
  const generateLocalClusters = (similarityMatrix, components, threshold) => {
    if (!similarityMatrix || !components) return [];
    
    const thresholdDecimal = threshold / 100; // Convert percentage to decimal
    const clusters = [];
    const clustered = new Set();
    
    components.forEach((component, index) => {
      if (clustered.has(component.id)) return;
      
      const cluster = {
        cluster_id: `cluster_${index}`,
        components: [component.id],
        component_count: 1,
        avg_similarity: 0
      };
      
      let totalSimilarity = 0;
      let similarityCount = 0;
      
      // Find similar components above threshold
      similarityMatrix.forEach(sim => {
        if (sim.component_id === component.id && 
            sim.similarity_score >= thresholdDecimal && 
            !clustered.has(sim.similar_component_id)) {
          cluster.components.push(sim.similar_component_id);
          clustered.add(sim.similar_component_id);
          totalSimilarity += sim.similarity_score;
          similarityCount++;
        }
      });
      
      cluster.component_count = cluster.components.length;
      cluster.avg_similarity = similarityCount > 0 ? totalSimilarity / similarityCount : 0;
      
      // Only include clusters with more than 1 component
      if (cluster.component_count > 1) {
        clusters.push(cluster);
        cluster.components.forEach(compId => clustered.add(compId));
      }
    });
    
    return clusters;
  };

  // Handle threshold input change with real-time filtering
  const handleThresholdChange = (value) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
      setSimilarityThreshold(numValue);
      
      // Generate clusters locally in real-time
      if (allSimilarityData) {
        const newClusters = generateLocalClusters(
          allSimilarityData.similarityMatrix, 
          allSimilarityData.components, 
          numValue
        );
        setFilteredClusters(newClusters);
      }
    }
  };

  // Load all similarity data once (with 0% threshold to get everything)
  const loadAllSimilarityData = async () => {
    if (!projectId) return;

    try {
      console.log('🔄 Loading ALL similarity data (0% threshold) for local filtering...');
      
      // Get authentication token from Cognito
      const { fetchAuthSession } = await import('@aws-amplify/auth');
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      
      if (!idToken) {
        throw new Error('No authentication token found');
      }
      
      // Call API with 0% threshold to get all data
      const apiUrl = process.env.REACT_APP_API_URL || 'https://zpjyu743c5.execute-api.us-west-2.amazonaws.com/dev';
      const cleanApiUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
      const url = `${cleanApiUrl}/step-functions/component-similarity-results?projectId=${encodeURIComponent(projectId)}&threshold=0`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': idToken
        }
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Handle API Gateway response format
      let parsedData = data;
      if (data.body && typeof data.body === 'string') {
        try {
          parsedData = JSON.parse(data.body);
        } catch (e) {
          console.error('Failed to parse response body:', e);
          parsedData = data;
        }
      }
      
      if (parsedData.success && parsedData.results) {
        console.log('✅ Successfully loaded all similarity data');
        console.log('📊 Total similarity pairs:', parsedData.results.similarityMatrix?.length || 0);
        
        setAllSimilarityData(parsedData.results);
        
        // Generate initial clusters with current threshold
        const initialClusters = generateLocalClusters(
          parsedData.results.similarityMatrix, 
          parsedData.results.components, 
          similarityThreshold
        );
        setFilteredClusters(initialClusters);
        
        console.log(`✅ Generated ${initialClusters.length} clusters with ${similarityThreshold}% threshold`);
      } else {
        throw new Error(parsedData.error || 'Failed to load similarity data');
      }
      
    } catch (error) {
      console.error('❌ Error loading all similarity data:', error);
    }
  };

  // Load all data when analysis is completed
  useEffect(() => {
    if (analysisCompleted && analysisData && !allSimilarityData) {
      loadAllSimilarityData();
    }
  }, [analysisCompleted, analysisData, allSimilarityData]);

  // Handle view details click for component similarity pairs
  const handleViewDetails = (similarityPair) => {
    setSelectedSimilarityPair(similarityPair);
    setShowDetailsModal(true);
  };

  // Generate similarity clusters by 5% ranges (for new Similarity Clusters tab)
  const generateSimilarityClusters = (similarityMatrix) => {
    if (!similarityMatrix || similarityMatrix.length === 0) return [];

    const clusters = {};
    
    similarityMatrix.forEach(pair => {
      const percentage = pair.similarity_score * 100;
      const rangeStart = Math.floor(percentage / 5) * 5;
      
      // Handle the edge case where similarity is exactly 100%
      let rangeKey;
      if (rangeStart >= 100) {
        rangeKey = '100%';
      } else {
        const rangeEnd = rangeStart + 5;
        rangeKey = `${rangeStart}%-${rangeEnd}%`;
      }
      
      if (!clusters[rangeKey]) {
        clusters[rangeKey] = {
          range: rangeKey,
          rangeStart: rangeStart >= 100 ? 100 : rangeStart,
          rangeEnd: rangeStart >= 100 ? 100 : rangeStart + 5,
          pairs: [],
          count: 0
        };
      }
      
      clusters[rangeKey].pairs.push(pair);
      clusters[rangeKey].count++;
    });

    // Convert to array and sort by range (highest first)
    return Object.values(clusters).sort((a, b) => b.rangeStart - a.rangeStart);
  };

  // Handle cluster selection (for new Similarity Clusters tab)
  const handleSimilarityClusterSelect = (cluster) => {
    setSelectedSimilarityCluster(cluster);
    setCurrentPageIndex(1); // Reset pagination
  };

  // Handle cluster dismissal (for new Similarity Clusters tab)
  const handleSimilarityClusterDismiss = () => {
    setSelectedSimilarityCluster(null);
    setCurrentPageIndex(1);
  };

  // Create cluster visualization (for new Similarity Clusters tab)
  const createClusterVisualization = (clusters) => {
    if (!clusterChartRef.current || !clusters.length) return;

    // Clear previous chart
    const svg = clusterChartRef.current;
    svg.innerHTML = '';

    const width = 1200;
    const height = 500;
    const margin = { top: 40, right: 40, bottom: 80, left: 40 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Create SVG
    const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgElement.setAttribute('width', width);
    svgElement.setAttribute('height', height);
    svgElement.style.background = '#ffffff';
    svgElement.style.border = '1px solid #e5e7eb';
    svgElement.style.borderRadius = '8px';
    svg.appendChild(svgElement);

    // Create chart group
    const chartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    chartGroup.setAttribute('transform', `translate(${margin.left}, ${margin.top})`);
    svgElement.appendChild(chartGroup);

    // Sort clusters by similarity range (lowest to highest)
    const sortedClusters = [...clusters].sort((a, b) => a.rangeStart - b.rangeStart);

    // Calculate scales - bigger circles now that we have more space
    const maxCount = Math.max(...sortedClusters.map(c => c.count));
    const radiusScale = (count) => Math.sqrt(count / maxCount) * 70 + 25;

    // Calculate all radii first
    const clustersWithRadii = sortedClusters.map(cluster => ({
      ...cluster,
      radius: radiusScale(cluster.count)
    }));

    // Smart horizontal positioning that accounts for circle sizes
    const minSpacing = 20; // Minimum space between circle edges
    let currentX = 0;
    
    clustersWithRadii.forEach((cluster, index) => {
      // For first circle, start with its radius plus margin
      if (index === 0) {
        currentX = margin.left + cluster.radius;
      } else {
        // For subsequent circles, add previous radius + spacing + current radius
        const prevRadius = clustersWithRadii[index - 1].radius;
        currentX += prevRadius + minSpacing + cluster.radius;
      }
      
      cluster.x = currentX;
    });

    // Scale positions to fit within chart width if needed
    const totalWidth = currentX + clustersWithRadii[clustersWithRadii.length - 1].radius;
    const availableWidth = chartWidth;
    const scaleFactor = totalWidth > availableWidth ? availableWidth / totalWidth : 1;
    
    if (scaleFactor < 1) {
      // Rescale positions to fit
      clustersWithRadii.forEach(cluster => {
        cluster.x = (cluster.x - margin.left) * scaleFactor + cluster.radius;
      });
    }
    
    clustersWithRadii.forEach((cluster, index) => {
      const x = cluster.x;
      // Use more vertical levels to spread circles better
      const verticalLevels = 4;
      const levelIndex = index % verticalLevels;
      const yPositions = [
        chartHeight * 0.2,  // Top level
        chartHeight * 0.4,  // Upper middle
        chartHeight * 0.6,  // Lower middle  
        chartHeight * 0.8   // Bottom level
      ];
      const y = yPositions[levelIndex];
      const radius = cluster.radius;

      // Determine color based on similarity range
      const getColor = (rangeStart) => {
        if (rangeStart >= 80) return '#10b981'; // Green for high similarity
        if (rangeStart >= 60) return '#3b82f6'; // Blue for medium-high
        if (rangeStart >= 40) return '#f59e0b'; // Orange for medium
        return '#ef4444'; // Red for low similarity
      };

      const color = getColor(cluster.rangeStart);
      const isSelected = selectedSimilarityCluster?.range === cluster.range;

      // Create cluster circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', radius);
      circle.setAttribute('fill', color);
      circle.setAttribute('fill-opacity', '0.8');
      circle.setAttribute('stroke', isSelected ? '#374151' : color);
      circle.setAttribute('stroke-width', isSelected ? '3' : '1');
      circle.style.cursor = 'pointer';
      circle.style.transition = 'all 0.2s ease';

      // Add hover effects
      circle.addEventListener('mouseenter', () => {
        circle.setAttribute('fill-opacity', '1');
        circle.setAttribute('stroke-width', '2');
      });

      circle.addEventListener('mouseleave', () => {
        if (!isSelected) {
          circle.setAttribute('fill-opacity', '0.8');
          circle.setAttribute('stroke-width', '1');
        }
      });

      // Add click handler
      circle.addEventListener('click', () => {
        handleSimilarityClusterSelect(cluster);
      });

      chartGroup.appendChild(circle);

      // Add range label - now with better sizing for larger circles
      const rangeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      rangeText.setAttribute('x', x);
      rangeText.setAttribute('y', y - 8);
      rangeText.setAttribute('text-anchor', 'middle');
      rangeText.setAttribute('font-size', '14');
      rangeText.setAttribute('font-weight', 'bold');
      rangeText.setAttribute('fill', '#fff');
      rangeText.textContent = cluster.range;
      chartGroup.appendChild(rangeText);

      // Add count label - now fits better in larger circles
      const countText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      countText.setAttribute('x', x);
      countText.setAttribute('y', y + 12);
      countText.setAttribute('text-anchor', 'middle');
      countText.setAttribute('font-size', '12');
      countText.setAttribute('fill', '#fff');
      countText.textContent = `${cluster.count} pairs`;
      chartGroup.appendChild(countText);

      // Add percentage below circle
      const percentText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      percentText.setAttribute('x', x);
      percentText.setAttribute('y', y + radius + 20);
      percentText.setAttribute('text-anchor', 'middle');
      percentText.setAttribute('font-size', '11');
      percentText.setAttribute('fill', '#6b7280');
      percentText.textContent = `${((cluster.count / analysisData.similarityMatrix.length) * 100).toFixed(1)}%`;
      chartGroup.appendChild(percentText);
    });

    // Add title
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', chartWidth / 2);
    title.setAttribute('y', -15);
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('font-size', '16');
    title.setAttribute('font-weight', 'bold');
    title.setAttribute('fill', '#374151');
    title.textContent = 'Component Similarity Distribution (Low → High)';
    chartGroup.appendChild(title);
  };

  // Update visualization when clusters change (for new Similarity Clusters tab)
  useEffect(() => {
    if (analysisData?.similarityMatrix && activeTab === 'similarity-clusters') {
      const clusters = generateSimilarityClusters(analysisData.similarityMatrix);
      createClusterVisualization(clusters);
    }
  }, [analysisData, activeTab, selectedSimilarityCluster]);





  // Tab definitions for results visualization
  const tabs = [
    {
      id: 'matrix',
      label: t('pages:similarities.components.similarityMatrixLabel'),
      content: (
        <SpaceBetween size="l">
          {!analysisCompleted || !analysisData?.similarityMatrix ? (
            <Box textAlign="center" padding="xl">
              <SpaceBetween size="m">
                <Box variant="h3" color="text-body-secondary">
                  {t('pages:similarities.components.noResultsTitle')}
                </Box>
                <Box variant="p" color="text-body-secondary">
                  {t('pages:similarities.components.noResultsDescription')}
                </Box>
              </SpaceBetween>
            </Box>
          ) : (
            <SpaceBetween size="l">
              <Header variant="h2">{t('pages:similarities.components.componentSimilarityDetails')}</Header>
              
              {/* Component Similarity Pairs Table */}
              {analysisData.similarityMatrix && analysisData.similarityMatrix.length > 0 && (
                <Table
                  columnDefinitions={[
                    {
                      id: 'component1',
                      header: t('pages:similarities.components.component1Label'),
                      cell: item => item.component1_name || item.component1_id,
                      sortingField: 'component1_name'
                    },
                    {
                      id: 'component2', 
                      header: t('pages:similarities.components.component2Label'),
                      cell: item => item.component2_name || item.component2_id,
                      sortingField: 'component2_name'
                    },
                    {
                      id: 'similarity',
                      header: t('pages:similarities.components.similarityScoreLabel'),
                      cell: item => (
                        <Badge 
                          color={
                            item.similarity_score >= 0.8 ? 'green' :
                            item.similarity_score >= 0.6 ? 'blue' :
                            item.similarity_score >= 0.4 ? 'grey' : 'red'
                          }
                        >
                          {(item.similarity_score * 100).toFixed(1)}%
                        </Badge>
                      ),
                      sortingField: 'similarity_score'
                    },
                    {
                      id: 'actions',
                      header: 'Actions',
                      cell: item => (
                        <Button
                          variant="inline-icon"
                          iconName="external"
                          onClick={() => handleViewDetails(item)}
                          ariaLabel={`View details for ${item.component1_name || item.component1_id} and ${item.component2_name || item.component2_id}`}
                        />
                      )
                    }
                  ].filter(col => preferences.visibleContent.includes(col.id))}
                  items={(() => {
                    // Filter by component name (searches both comp1 and comp2)
                    let filteredItems = analysisData.similarityMatrix;
                    if (filterText) {
                      const searchText = filterText.toLowerCase();
                      filteredItems = analysisData.similarityMatrix.filter(item => {
                        const comp1Name = (item.component1_name || item.component1_id || '').toLowerCase();
                        const comp2Name = (item.component2_name || item.component2_id || '').toLowerCase();
                        return comp1Name.includes(searchText) || comp2Name.includes(searchText);
                      });
                    }
                    
                    // Sort by similarity score (highest first)
                    const sortedItems = filteredItems.sort((a, b) => b.similarity_score - a.similarity_score);
                    
                    // Apply pagination
                    const startIndex = (currentPageIndex - 1) * preferences.pageSize;
                    const endIndex = startIndex + preferences.pageSize;
                    const paginatedItems = sortedItems.slice(startIndex, endIndex);
                    
                    console.log('📊 Pagination Debug:', {
                      totalItems: analysisData.similarityMatrix?.length || 0,
                      filteredItems: filteredItems.length,
                      sortedItems: sortedItems.length,
                      currentPageIndex,
                      pageSize: preferences.pageSize,
                      startIndex,
                      endIndex,
                      paginatedItems: paginatedItems.length
                    });
                    
                    return paginatedItems;
                  })()}
                  loadingText={t('pages:similarities.components.loadingSimilarityResults')}
                  sortingDisabled={false}
                  empty={
                    <Box textAlign="center" color="inherit">
                      <b>{t('pages:similarities.components.noSimilarityPairs')}</b>
                      <Box variant="p" color="inherit">
                        {filterText ? 'No pairs match your search criteria.' : 'No component similarity data available.'}
                      </Box>
                    </Box>
                  }
                  filter={
                    <TextFilter
                      filteringText={filterText}
                      onChange={({ detail }) => {
                        setFilterText(detail.filteringText);
                        setCurrentPageIndex(1); // Reset to first page when filtering
                      }}
                      filteringPlaceholder={t('pages:similarities.components.searchComponents')}
                      filteringAriaLabel={t('pages:similarities.components.filterComponentPairs')}
                    />
                  }
                  header={
                    <Header
                      counter={(() => {
                        if (!filterText) {
                          return `(${analysisData.similarityMatrix?.length || 0})`;
                        }
                        // Count filtered items
                        const searchText = filterText.toLowerCase();
                        const filteredCount = analysisData.similarityMatrix.filter(item => {
                          const comp1Name = (item.component1_name || item.component1_id || '').toLowerCase();
                          const comp2Name = (item.component2_name || item.component2_id || '').toLowerCase();
                          return comp1Name.includes(searchText) || comp2Name.includes(searchText);
                        }).length;
                        return `(${filteredCount}/${analysisData.similarityMatrix?.length || 0})`;
                      })()}
                      description={t('pages:similarities.components.componentPairsRanked')}
                    >
                      {t('pages:similarities.components.componentSimilarityPairs')}
                    </Header>
                  }
                  preferences={
                    <CollectionPreferences
                      title={t('pages:similarities.components.preferences')}
                      confirmLabel={t('pages:similarities.components.confirm')}
                      cancelLabel={t('pages:similarities.components.cancel')}
                      preferences={preferences}
                      onConfirm={({ detail }) => {
                        console.log('🔧 Preferences updated:', detail);
                        setPreferences(detail);
                        setCurrentPageIndex(1);
                      }}
                      pageSizePreference={{
                        title: 'Page size',
                        options: [
                          { value: 10, label: '10 pairs' },
                          { value: 20, label: '20 pairs' },
                          { value: 50, label: '50 pairs' },
                          { value: 100, label: '100 pairs' }
                        ]
                      }}
                      visibleContentPreference={{
                        title: 'Select visible columns',
                        options: [
                          {
                            label: 'Component similarity properties',
                            options: [
                              { id: 'component1', label: 'Component 1', editable: false },
                              { id: 'component2', label: 'Component 2', editable: false },
                              { id: 'similarity', label: 'Similarity Score', editable: false },
                              { id: 'actions', label: 'Actions' }
                            ]
                          }
                        ]
                      }}
                    />
                  }
                  pagination={
                    <Pagination
                      currentPageIndex={currentPageIndex}
                      pagesCount={(() => {
                        if (!filterText) {
                          const totalPages = Math.ceil((analysisData.similarityMatrix?.length || 0) / preferences.pageSize);
                          console.log('📄 Pagination (no filter):', {
                            totalItems: analysisData.similarityMatrix?.length || 0,
                            pageSize: preferences.pageSize,
                            totalPages,
                            currentPageIndex
                          });
                          return totalPages;
                        }
                        // Calculate pages for filtered items
                        const searchText = filterText.toLowerCase();
                        const filteredCount = analysisData.similarityMatrix.filter(item => {
                          const comp1Name = (item.component1_name || item.component1_id || '').toLowerCase();
                          const comp2Name = (item.component2_name || item.component2_id || '').toLowerCase();
                          return comp1Name.includes(searchText) || comp2Name.includes(searchText);
                        }).length;
                        const totalPages = Math.ceil(filteredCount / preferences.pageSize);
                        console.log('📄 Pagination (with filter):', {
                          filteredCount,
                          pageSize: preferences.pageSize,
                          totalPages,
                          currentPageIndex
                        });
                        return totalPages;
                      })()}
                      onChange={({ detail }) => {
                        console.log('📄 Page changed:', detail.currentPageIndex);
                        setCurrentPageIndex(detail.currentPageIndex);
                      }}
                    />
                  }
                />
              )}
            </SpaceBetween>
          )}
        </SpaceBetween>
      )
    },
    {
      id: 'similarity-clusters',
      label: t('pages:similarities.components.similarityClustersLabel'),
      content: (
        <SpaceBetween size="l">
          {!analysisCompleted || !analysisData?.similarityMatrix ? (
            <Box textAlign="center" padding="xl">
              <SpaceBetween size="m">
                <Box variant="h3" color="text-body-secondary">
                  {t('pages:similarities.components.noResultsTitle')}
                </Box>
                <Box variant="p" color="text-body-secondary">
                  {t('pages:similarities.components.noResultsDescription')}
                </Box>
              </SpaceBetween>
            </Box>
          ) : (
            <SpaceBetween size="l">
              <Header variant="h2">{t('pages:similarities.components.componentSimilarityClusters')}</Header>
              
              {/* Visual Cluster Diagram */}
              <Container>
                <Header variant="h3">{t('pages:similarities.components.similarityDistribution')}</Header>
                <Box textAlign="center">
                  <div ref={clusterChartRef} style={{ display: 'inline-block' }}></div>
                </Box>
                <Box variant="p" color="text-body-secondary" textAlign="center" margin={{ top: 's' }}>
                  {t('pages:similarities.components.clickClusterToView')}
                </Box>
              </Container>

              {/* Selected Cluster Details */}
              {selectedSimilarityCluster && (
                <Table
                  columnDefinitions={[
                    {
                      id: 'component1',
                      header: t('pages:similarities.components.component1Label'),
                      cell: item => item.component1_name || item.component1_id,
                      sortingField: 'component1_name'
                    },
                    {
                      id: 'component2', 
                      header: t('pages:similarities.components.component2Label'),
                      cell: item => item.component2_name || item.component2_id,
                      sortingField: 'component2_name'
                    },
                    {
                      id: 'similarity',
                      header: t('pages:similarities.components.similarityScoreLabel'),
                      cell: item => (
                        <Badge 
                          color={
                            item.similarity_score >= 0.8 ? 'green' :
                            item.similarity_score >= 0.6 ? 'blue' :
                            item.similarity_score >= 0.4 ? 'grey' : 'red'
                          }
                        >
                          {(item.similarity_score * 100).toFixed(1)}%
                        </Badge>
                      ),
                      sortingField: 'similarity_score'
                    },
                    {
                      id: 'actions',
                      header: 'Actions',
                      cell: item => (
                        <Button
                          variant="inline-icon"
                          iconName="external"
                          onClick={() => handleViewDetails(item)}
                          ariaLabel={`View details for ${item.component1_name || item.component1_id} and ${item.component2_name || item.component2_id}`}
                        />
                      )
                    }
                  ]}
                  items={(() => {
                    // Sort cluster pairs by similarity score (highest first)
                    const sortedItems = selectedSimilarityCluster.pairs.sort((a, b) => b.similarity_score - a.similarity_score);
                    
                    // Apply pagination
                    const startIndex = (currentPageIndex - 1) * preferences.pageSize;
                    const endIndex = startIndex + preferences.pageSize;
                    return sortedItems.slice(startIndex, endIndex);
                  })()}
                  loadingText={t('pages:similarities.components.loadingClusterResults')}
                  sortingDisabled={false}
                  empty={
                    <Box textAlign="center" color="inherit">
                      <b>{t('pages:similarities.components.noPairsInCluster')}</b>
                    </Box>
                  }
                  header={
                    <Header
                      variant="h3"
                      counter={`(${selectedSimilarityCluster.count})`}
                      description={`Components with similarity in the ${selectedSimilarityCluster.range} range`}
                      actions={
                        <Button
                          variant="icon"
                          iconName="close"
                          onClick={handleSimilarityClusterDismiss}
                          ariaLabel={t('pages:similarities.components.closeClusterDetails')}
                        />
                      }
                    >
                      {selectedSimilarityCluster.range} Similarity Cluster
                    </Header>
                  }
                  pagination={
                    <Pagination
                      currentPageIndex={currentPageIndex}
                      pagesCount={Math.ceil(selectedSimilarityCluster.count / preferences.pageSize)}
                      onChange={({ detail }) => setCurrentPageIndex(detail.currentPageIndex)}
                    />
                  }
                />
              )}
            </SpaceBetween>
          )}
        </SpaceBetween>
      )
    },
    {
      id: 'patterns',
      label: t('pages:similarities.components.repeatedPatternsLabel'),
      content: (
        <SpaceBetween size="l">
          <Header variant="h2">{t('pages:similarities.components.repeatedTechnologyPatterns')}</Header>
          
          {!analysisCompleted || !analysisData ? (
            <Box textAlign="center" padding="xl">
              <SpaceBetween size="m">
                <Box variant="h3" color="text-body-secondary">
                  {t('pages:similarities.components.noComponentAnalysisResults')}
                </Box>
                <Box variant="p" color="text-body-secondary">
                  {t('pages:similarities.components.startAnalysisForPatterns')}
                </Box>
              </SpaceBetween>
            </Box>
          ) : (
            <SpaceBetween size="l">
              {/* Pattern Analysis Summary */}
              <Container>
                <Header variant="h3">{t('pages:similarities.components.patternAnalysisSummary')}</Header>
                <Grid gridDefinition={[{ colspan: 3 }, { colspan: 3 }, { colspan: 3 }, { colspan: 3 }]}>
                  <Box>
                    <Box variant="awsui-key-label">{t('pages:similarities.components.totalComponents')}</Box>
                    <Box variant="awsui-value-large">{analysisData.components?.length || 0}</Box>
                  </Box>
                  <Box>
                    <Box variant="awsui-key-label">{t('pages:similarities.components.componentsWithTechData')}</Box>
                    <Box variant="awsui-value-large">
                      {analysisData.components?.filter(comp => 
                        comp.runtime || comp.framework || comp.databases || comp.integrations || comp.storages
                      ).length || 0}
                    </Box>
                  </Box>
                  <Box>
                    <Box variant="awsui-key-label">{t('pages:similarities.components.repeatedPatternsFound')}</Box>
                    <Box variant="awsui-value-large">{analysisData.repeatedPatterns?.length || 0}</Box>
                  </Box>
                  <Box>
                    <Box variant="awsui-key-label">{t('pages:similarities.components.componentsInPatterns')}</Box>
                    <Box variant="awsui-value-large">
                      {analysisData.repeatedPatterns?.reduce((total, pattern) => total + pattern.frequency, 0) || 0}
                    </Box>
                  </Box>
                </Grid>
              </Container>

              {/* Pattern Results */}
              {analysisData.repeatedPatterns && analysisData.repeatedPatterns.length === 0 ? (
                <Container>
                  <Alert type="info" header={t('pages:similarities.components.noRepeatedPatternsFound')}>
                    <SpaceBetween size="m">
                      <Box>
                        {t('pages:similarities.components.thisCouldIndicate')}
                      </Box>
                      
                      {/* Enhanced Debug Information */}
                      <details style={{marginTop: '20px', background: '#f5f5f5', padding: '15px', borderRadius: '8px'}}>
                        <summary style={{cursor: 'pointer', fontWeight: 'bold', marginBottom: '10px'}}>
                          🔍 Debug Information (Click to expand)
                        </summary>
                        
                        <SpaceBetween size="s">
                          <Box>
                            <strong>{t('pages:similarities.components.dataAnalysis')}</strong>
                            <ul style={{marginLeft: '20px', marginTop: '5px'}}>
                              <li>{t('pages:similarities.components.totalComponents')} {analysisData.components?.length || 0}</li>
                              <li>{t('pages:similarities.components.componentsWithRuntimeData')} {analysisData.components?.filter(c => c.runtime).length || 0}</li>
                              <li>{t('pages:similarities.components.componentsWithFrameworkData')} {analysisData.components?.filter(c => c.framework).length || 0}</li>
                              <li>{t('pages:similarities.components.componentsWithDatabaseData')} {analysisData.components?.filter(c => c.databases).length || 0}</li>
                              <li>{t('pages:similarities.components.componentsWithIntegrationData')} {analysisData.components?.filter(c => c.integrations).length || 0}</li>
                              <li>{t('pages:similarities.components.componentsWithStorageData')} {analysisData.components?.filter(c => c.storages).length || 0}</li>
                            </ul>
                          </Box>
                          
                          <Box>
                            <strong>{t('pages:similarities.components.sampleComponentData')}</strong>
                            <pre style={{fontSize: '11px', overflow: 'auto', maxHeight: '300px', background: '#fff', padding: '10px', border: '1px solid #ddd', borderRadius: '4px'}}>
                              {JSON.stringify(analysisData.components?.slice(0, 3).map(comp => ({
                                id: comp.id,
                                componentName: comp.componentname || comp.name,
                                applicationName: comp.applicationname || comp.application,
                                runtime: comp.runtime,
                                framework: comp.framework,
                                databases: comp.databases,
                                integrations: comp.integrations,
                                storages: comp.storages,
                                hasAnyTechData: !!(comp.runtime || comp.framework || comp.databases || comp.integrations || comp.storages)
                              })), null, 2)}
                            </pre>
                          </Box>
                          
                          <Box>
                            <strong>{t('pages:similarities.components.possibleReasons')}</strong>
                            <ul style={{marginLeft: '20px', marginTop: '5px'}}>
                              <li>{t('pages:similarities.components.componentsHaveDiverseStacks')}</li>
                              <li>{t('pages:similarities.components.technologyDataMissing')}</li>
                              <li>{t('pages:similarities.components.componentNamesHaveVariations')}</li>
                              <li>{t('pages:similarities.components.datasetTooLarge')}</li>
                            </ul>
                          </Box>
                        </SpaceBetween>
                      </details>
                    </SpaceBetween>
                  </Alert>
                </Container>
              ) : (
                <Container>
                  <RepeatedPatternsTable 
                    data={analysisData.repeatedPatterns || []} 
                    loading={false} 
                  />
                </Container>
              )}
            </SpaceBetween>
          )}
        </SpaceBetween>
      )
    }
  ];

  return (
    <Layout
      activeHref="/similarities/components"
      toolsOpen={toolsOpen}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
      infoContent={
        <Box padding="l">
          <ComponentSimilaritiesInfoContent />
        </Box>
      }
    >
      <ContentLayout
        header={
          <Header variant="h1">
            {t('pages:similarities.components.title')}
          </Header>
        }
      >
        <SpaceBetween size="l">
          {/* Show missing data alert if required data sources are not available */}
          {!checkingData && !hasData && (
            <MissingDataAlert missingDataSources={missingDataSources} />
          )}

          <div style={{ position: 'relative' }}>
            {/* Semi-transparent overlay when data is missing */}
            {!checkingData && !hasData && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(255, 255, 255, 0.7)',
                zIndex: 10,
                pointerEvents: 'all',
                cursor: 'not-allowed'
              }} />
            )}

          {error && (
            <Alert type="error" header={t('pages:similarities.components.error')}>
              {error}
            </Alert>
          )}

          {/* Loading state */}
          {loading && (
            <Container>
              <Box textAlign="center" padding="xxl">
                <SpaceBetween size="m">
                  <Spinner size="large" />
                  <Box variant="h3" color="text-body-secondary">
                    {t('pages:similarities.components.loadingComponentSimilarityResults')}
                  </Box>
                  <Box variant="p" color="text-body-secondary">
                    {t('pages:similarities.components.checkingForExistingResults')}
                  </Box>
                </SpaceBetween>
              </Box>
            </Container>
          )}

          {/* Component Similarities Analysis Trigger Section */}
          {!loading && (
            <SpaceBetween size="l">
              <ComponentSimilaritiesAnalysisTrigger 
                onAnalysisComplete={handleAnalysisComplete}
                analysisData={analysisData}
                executionStatus={executionStatus}
                setExecutionStatus={setExecutionStatus}
                analysisProgress={analysisProgress}
                setAnalysisProgress={setAnalysisProgress}
              />

              {/* Component Similarity Analysis Results Summary */}
              {analysisData && analysisCompleted && (
                <Container>
                  <Header variant="h2">{t('pages:similarities.components.componentSimilarityAnalysisResults')}</Header>
                  <div style={{ marginTop: '20px' }}>
                    <Grid gridDefinition={[{ colspan: 3 }, { colspan: 3 }, { colspan: 3 }, { colspan: 3 }]}>
                      <Box>
                        <Box variant="awsui-key-label">{t('pages:similarities.components.totalComponents')}</Box>
                        <Box variant="awsui-value-large">{analysisData.totalComponents || analysisData.components?.length || 0}</Box>
                      </Box>
                      <Box>
                        <Box variant="awsui-key-label">{t('pages:similarities.components.similarPairs')}</Box>
                        <Box variant="awsui-value-large">{analysisData.similarPairs || analysisData.similarityMatrix?.length || 0}</Box>
                      </Box>
                      <Box>
                        <Box variant="awsui-key-label">
                          {t('pages:similarities.components.maxSimilarity')}
                          {analysisData.similarityMatrix?.length > 0 && (() => {
                            const maxScore = Math.max(...analysisData.similarityMatrix.map(pair => pair.similarity_score));
                            const maxCount = analysisData.similarityMatrix.filter(pair => pair.similarity_score === maxScore).length;
                            return ` (${maxCount} pair${maxCount !== 1 ? 's' : ''})`;
                          })()}
                        </Box>
                        <Box variant="awsui-value-large">
                          {analysisData.similarityMatrix?.length > 0 ? 
                       `${(Math.max(...analysisData.similarityMatrix.map(pair => pair.similarity_score)) * 100).toFixed(1)}%` : 
                       '0%'}
                    </Box>
                  </Box>
                  <Box>
                    <Box variant="awsui-key-label">
                      {t('pages:similarities.components.mostCommonRange')}
                      {analysisData.similarityMatrix?.length > 0 && (() => {
                        // Group similarities into 10% ranges
                        const ranges = {};
                        analysisData.similarityMatrix.forEach(pair => {
                          const percentage = pair.similarity_score * 100;
                          const rangeStart = Math.floor(percentage / 10) * 10;
                          const rangeEnd = rangeStart + 10;
                          const rangeKey = `${rangeStart}%-${rangeEnd}%`;
                          ranges[rangeKey] = (ranges[rangeKey] || 0) + 1;
                        });
                        
                        // Find the range with most pairs
                        const maxRange = Object.entries(ranges).reduce((max, [range, count]) => 
                          count > max.count ? { range, count } : max, { range: '', count: 0 });
                        
                        return maxRange.count > 0 ? ` (${maxRange.count} pairs)` : '';
                      })()}
                    </Box>
                    <Box variant="awsui-value-large">
                      {analysisData.similarityMatrix?.length > 0 ? (() => {
                        // Group similarities into 10% ranges
                        const ranges = {};
                        analysisData.similarityMatrix.forEach(pair => {
                          const percentage = pair.similarity_score * 100;
                          const rangeStart = Math.floor(percentage / 10) * 10;
                          const rangeEnd = rangeStart + 10;
                          const rangeKey = `${rangeStart}%-${rangeEnd}%`;
                          ranges[rangeKey] = (ranges[rangeKey] || 0) + 1;
                        });
                        
                        // Find the range with most pairs
                        const maxRange = Object.entries(ranges).reduce((max, [range, count]) => 
                          count > max.count ? { range, count } : max, { range: '0%-10%', count: 0 });
                        
                        return maxRange.range;
                      })() : '0%-10%'}
                    </Box>
                  </Box>
                </Grid>
              </div>
            </Container>
              )}

              {/* Component Similarities Results Visualization */}
              {analysisData && (
                <Container header={<Header variant="h2">{t('pages:similarities.components.analysisResults')}</Header>}>
                  <Tabs
                    tabs={tabs}
                    activeTabId={activeTab}
                    onChange={({ detail }) => setActiveTab(detail.activeTabId)}
                  />
                </Container>
              )}

              {/* Placeholder when no analysis has been run */}
              {!analysisData && !analysisCompleted && (
                <Container>
                  <Box textAlign="center" padding="xxl">
                    <Box variant="h3" color="text-body-secondary">
                      {t('pages:similarities.components.noComponentAnalysisResultsTitle')}
                    </Box>
                    <Box variant="p" color="text-body-secondary">
                      {t('pages:similarities.components.noComponentAnalysisResultsDescription')}
                </Box>
              </Box>
            </Container>
              )}
            </SpaceBetween>
          )}
          </div>
        </SpaceBetween>

        {/* Component Similarity Details Modal */}
        <Modal
          onDismiss={() => setShowDetailsModal(false)}
          visible={showDetailsModal}
          header={t('pages:similarities.components.componentSimilarityDetailsModal')}
          size="large"
          footer={
            <Box float="right">
              <Button variant="primary" onClick={() => setShowDetailsModal(false)}>
                {t('pages:similarities.components.close')}
              </Button>
            </Box>
          }
        >
          {selectedSimilarityPair && (
            <SpaceBetween size="l">
              <Grid gridDefinition={[{ colspan: 6 }, { colspan: 6 }]}>
                <Box>
                  <Box variant="awsui-key-label">{t('pages:similarities.components.component1')}</Box>
                  <Box variant="h3">{selectedSimilarityPair.component1_name || selectedSimilarityPair.component1_id}</Box>
                  {selectedSimilarityPair.component1_application && (
                    <Box variant="p" color="text-body-secondary">
                      <strong>{t('pages:similarities.components.application')}</strong> {selectedSimilarityPair.component1_application}
                    </Box>
                  )}
                </Box>
                <Box>
                  <Box variant="awsui-key-label">{t('pages:similarities.components.component2')}</Box>
                  <Box variant="h3">{selectedSimilarityPair.component2_name || selectedSimilarityPair.component2_id}</Box>
                  {selectedSimilarityPair.component2_application && (
                    <Box variant="p" color="text-body-secondary">
                      <strong>{t('pages:similarities.components.application')}</strong> {selectedSimilarityPair.component2_application}
                    </Box>
                  )}
                </Box>
              </Grid>

              {/* Show if components are from same or different applications */}
              {selectedSimilarityPair.component1_application && selectedSimilarityPair.component2_application && (
                <Box>
                  <Box variant="awsui-key-label">{t('pages:similarities.components.applicationContext')}</Box>
                  <SpaceBetween direction="horizontal" size="s" alignItems="center">
                    <Badge 
                      color={
                        selectedSimilarityPair.component1_application === selectedSimilarityPair.component2_application 
                          ? 'blue' : 'green'
                      }
                    >
                      {selectedSimilarityPair.component1_application === selectedSimilarityPair.component2_application 
                        ? t('pages:similarities.components.sameApplication') : t('pages:similarities.components.crossApplication')}
                    </Badge>
                    <Box variant="p" color="text-body-secondary">
                      {selectedSimilarityPair.component1_application === selectedSimilarityPair.component2_application 
                        ? t('pages:similarities.components.sameApplicationPotential')
                        : t('pages:similarities.components.crossApplicationPotential')}
                    </Box>
                  </SpaceBetween>
                </Box>
              )}

              <Box>
                <Box variant="awsui-key-label">{t('pages:similarities.components.similarityScore')}</Box>
                <SpaceBetween direction="horizontal" size="s" alignItems="center">
                  <Badge 
                    color={
                      selectedSimilarityPair.similarity_score >= 0.8 ? 'green' :
                      selectedSimilarityPair.similarity_score >= 0.6 ? 'blue' :
                      selectedSimilarityPair.similarity_score >= 0.4 ? 'grey' : 'red'
                    }
                    size="large"
                  >
                    {(selectedSimilarityPair.similarity_score * 100).toFixed(1)}%
                  </Badge>
                  <Box variant="p" color="text-body-secondary">
                    {selectedSimilarityPair.similarity_score >= 0.8 ? t('pages:similarities.components.veryHighSimilarity') :
                     selectedSimilarityPair.similarity_score >= 0.6 ? t('pages:similarities.components.highSimilarity') :
                     selectedSimilarityPair.similarity_score >= 0.4 ? t('pages:similarities.components.moderateSimilarity') : 
                     t('pages:similarities.components.lowSimilarity')}
                  </Box>
                </SpaceBetween>
              </Box>

              {selectedSimilarityPair.cluster_id && (
                <Box>
                  <Box variant="awsui-key-label">{t('pages:similarities.components.clusterId')}</Box>
                  <Badge color="grey">{selectedSimilarityPair.cluster_id}</Badge>
                </Box>
              )}

              <Box>
                <Box variant="awsui-key-label">{t('pages:similarities.components.recommendations')}</Box>
                <Box variant="p">
                  {selectedSimilarityPair.similarity_score >= 0.8 ? (
                    <SpaceBetween size="xs">
                      <Box>• <strong>{t('pages:similarities.components.highPriority')}</strong> {t('pages:similarities.components.highPriorityConsolidate')}</Box>
                      <Box>• {t('pages:similarities.components.reviewDuplicateFunctionality')}</Box>
                      <Box>• {t('pages:similarities.components.evaluatePotentialReuse')}</Box>
                      {selectedSimilarityPair.component1_application === selectedSimilarityPair.component2_application ? (
                        <Box>• <strong>{t('pages:similarities.components.sameApplication')}:</strong> {t('pages:similarities.components.sameApplicationRefactor')}</Box>
                      ) : (
                        <Box>• <strong>{t('pages:similarities.components.crossApplication')}:</strong> {t('pages:similarities.components.crossApplicationExtract')}</Box>
                      )}
                    </SpaceBetween>
                  ) : selectedSimilarityPair.similarity_score >= 0.6 ? (
                    <SpaceBetween size="xs">
                      <Box>• <strong>{t('pages:similarities.components.mediumPriority')}</strong> {t('pages:similarities.components.investigateSharedPatterns')}</Box>
                      <Box>• {t('pages:similarities.components.lookForOpportunities')}</Box>
                      <Box>• {t('pages:similarities.components.considerSharedLibraries')}</Box>
                      {selectedSimilarityPair.component1_application === selectedSimilarityPair.component2_application ? (
                        <Box>• <strong>{t('pages:similarities.components.sameApplication')}:</strong> {t('pages:similarities.components.lookForCommonBase')}</Box>
                      ) : (
                        <Box>• <strong>{t('pages:similarities.components.crossApplication')}:</strong> {t('pages:similarities.components.considerStandardizing')}</Box>
                      )}
                    </SpaceBetween>
                  ) : (
                    <SpaceBetween size="xs">
                      <Box>• <strong>{t('pages:similarities.components.lowPriority')}</strong> {t('pages:similarities.components.componentsDifferentPurposes')}</Box>
                      <Box>• {t('pages:similarities.components.mayBenefitDifferentApproaches')}</Box>
                      <Box>• {t('pages:similarities.components.focusHigherSimilarity')}</Box>
                      {selectedSimilarityPair.component1_application !== selectedSimilarityPair.component2_application && (
                        <Box>• <strong>{t('pages:similarities.components.crossApplication')}:</strong> {t('pages:similarities.components.differentPurposesExpected')}</Box>
                      )}
                    </SpaceBetween>
                  )}
                </Box>
              </Box>
            </SpaceBetween>
          )}
        </Modal>

        {/* Cluster Details Modal */}
        <Modal
          onDismiss={() => setShowClusterModal(false)}
          visible={showClusterModal}
          header={selectedCluster ? `${t('pages:similarities.components.cluster')} ${selectedCluster.cluster_id} ${t('pages:similarities.components.details')}` : t('pages:similarities.components.clusterDetails')}
          size="large"
          footer={
            <Box float="right">
              <Button variant="primary" onClick={() => setShowClusterModal(false)}>
                {t('pages:similarities.components.close')}
              </Button>
            </Box>
          }
        >
          {selectedCluster && (
            <SpaceBetween size="l">
              {/* Cluster Overview */}
              <Container>
                <Header variant="h3">{t('pages:similarities.components.clusterOverview')}</Header>
                <Grid gridDefinition={[{ colspan: 4 }, { colspan: 4 }, { colspan: 4 }]}>
                  <Box textAlign="center">
                    <Box variant="awsui-key-label">{t('pages:similarities.components.clusterId')}</Box>
                    <Box variant="awsui-value-large">{selectedCluster.cluster_id || t('common:unknown')}</Box>
                  </Box>
                  <Box textAlign="center">
                    <Box variant="awsui-key-label">{t('pages:similarities.components.components')}</Box>
                    <Box variant="awsui-value-large" color="text-status-info">
                      {selectedCluster.component_count || selectedCluster.components?.length || 0}
                    </Box>
                  </Box>
                  <Box textAlign="center">
                    <Box variant="awsui-key-label">{t('pages:similarities.components.avgSimilarity')}</Box>
                    <Box variant="awsui-value-large" color="text-status-success">
                      {selectedCluster.avg_similarity ? (selectedCluster.avg_similarity * 100).toFixed(1) : '0'}%
                    </Box>
                  </Box>
                </Grid>
              </Container>

              {/* Component Details Table */}
              <Container>
                <Header variant="h3">{t('pages:similarities.components.componentsInCluster')}</Header>
                {selectedCluster.components && selectedCluster.components.length > 0 ? (
                  <Table
                    columnDefinitions={[
                      {
                        id: 'name',
                        header: t('pages:similarities.components.componentName'),
                        cell: item => {
                          // Handle both component ID strings and component objects
                          if (typeof item === 'string') {
                            // It's a component ID, find the details
                            const componentDetails = analysisData?.components?.find(comp => comp.id === item);
                            return (
                              <Box variant="span">
                                <strong>{componentDetails?.componentname || item}</strong>
                              </Box>
                            );
                          } else {
                            // It's a component object
                            return (
                              <Box variant="span">
                                <strong>
                                  {item.componentname || item.componentName || item.name || item.id || t('common:general.unknown')}
                                </strong>
                              </Box>
                            );
                          }
                        }
                      },
                      {
                        id: 'application',
                        header: t('pages:similarities.components.application'),
                        cell: item => {
                          if (typeof item === 'string') {
                            const componentDetails = analysisData?.components?.find(comp => comp.id === item);
                            return (
                              <Badge color="grey">
                                {componentDetails?.applicationname || t('common:general.unknown')}
                              </Badge>
                            );
                          } else {
                            return (
                              <Badge color="grey">
                                {item.applicationname || item.applicationName || t('common:general.unknown')}
                              </Badge>
                            );
                          }
                        }
                      },
                      {
                        id: 'runtime',
                        header: t('pages:similarities.components.runtime'),
                        cell: item => {
                          if (typeof item === 'string') {
                            const componentDetails = analysisData?.components?.find(comp => comp.id === item);
                            return componentDetails?.runtime || '-';
                          } else {
                            return item.runtime || '-';
                          }
                        }
                      },
                      {
                        id: 'framework',
                        header: t('pages:similarities.components.framework'),
                        cell: item => {
                          if (typeof item === 'string') {
                            const componentDetails = analysisData?.components?.find(comp => comp.id === item);
                            return componentDetails?.framework || '-';
                          } else {
                            return item.framework || '-';
                          }
                        }
                      }
                    ]}
                    items={selectedCluster.components}
                    loadingText={t('pages:similarities.components.loadingComponents')}
                    sortingDisabled={false}
                    empty={
                      <Box textAlign="center" color="inherit">
                        <b>{t('pages:similarities.components.noComponentsFound')}</b>
                        <Box variant="p" color="inherit">
                          {t('pages:similarities.components.clusterEmpty')}
                        </Box>
                      </Box>
                    }
                    header={
                      <Header
                        counter={`(${selectedCluster.components?.length || 0})`}
                        description={t('pages:similarities.components.allComponentsInCluster')}
                      >
                        {t('pages:similarities.components.clusterComponents')}
                      </Header>
                    }
                  />
                ) : (
                  <Box variant="p" color="text-body-secondary">
                    {t('pages:similarities.components.noComponentsInCluster')}
                  </Box>
                )}
              </Container>

              {/* Recommendations */}
              <Container>
                <Header variant="h3">{t('pages:similarities.components.recommendations')}</Header>
                <SpaceBetween size="s">
                  {selectedCluster.avg_similarity >= 0.8 ? (
                    <>
                      <Box>🎯 <strong>{t('pages:similarities.components.highPriority')}:</strong> {t('pages:similarities.components.highPriorityCluster')}</Box>
                      <Box>🔍 <strong>{t('pages:similarities.components.deepAnalysis')}:</strong> {t('pages:similarities.components.deepAnalysisCluster')}</Box>
                      <Box>🏗️ <strong>{t('pages:similarities.components.architectureReview')}:</strong> {t('pages:similarities.components.architectureReviewCluster')}</Box>
                    </>
                  ) : selectedCluster.avg_similarity >= 0.6 ? (
                    <>
                      <Box>📋 <strong>{t('pages:similarities.components.mediumPriority')}:</strong> {t('pages:similarities.components.mediumPriorityCluster')}</Box>
                      <Box>🔍 <strong>{t('pages:similarities.components.patternAnalysis')}:</strong> {t('pages:similarities.components.patternAnalysisCluster')}</Box>
                      <Box>📚 <strong>{t('pages:similarities.components.sharedLibraries')}:</strong> {t('pages:similarities.components.sharedLibrariesCluster')}</Box>
                    </>
                  ) : (
                    <>
                      <Box>📝 <strong>{t('pages:similarities.components.lowPriority')}</strong> {t('pages:similarities.components.lowPriorityCluster')}</Box>
                      <Box>🔍 <strong>{t('pages:similarities.components.validation')}:</strong> {t('pages:similarities.components.validationCluster')}</Box>
                      <Box>🎯 <strong>{t('pages:similarities.components.focus')}:</strong> {t('pages:similarities.components.focusCluster')}</Box>
                    </>
                  )}
                </SpaceBetween>
              </Container>
            </SpaceBetween>
          )}
        </Modal>


      </ContentLayout>
    </Layout>
  );
};

export default ComponentSimilaritiesPage;
