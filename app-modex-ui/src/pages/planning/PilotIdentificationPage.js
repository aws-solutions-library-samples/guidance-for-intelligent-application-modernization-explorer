import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { navigateToExportWithCategory } from '../../utils/exportNavigationUtils';
import {
  ContentLayout,
  Header,
  Box,
  SpaceBetween,
  Container,
  Table,
  ColumnLayout,
  StatusIndicator,
  Tabs,
  Cards,
  Link,
  Alert,
  CollectionPreferences,
  Pagination,
  Spinner,
  ProgressBar,
  FormField,
  Multiselect,
  Button,
  Slider,
  ExpandableSection
} from '@cloudscape-design/components';

// Layouts
import Layout from '../../layouts/AppLayout';

// Components
import PilotIdentificationInfoContent from '../../components/info/PilotIdentificationInfoContent';
import PilotIdentificationTrigger from '../../components/PilotIdentificationTrigger';
import MissingDataAlert from '../../components/MissingDataAlert';

// Hooks
import useDataSourceCheck from '../../hooks/useDataSourceCheck';

// Services
import { fetchPilotIdentificationResults, getSimilarApplications } from '../../services/pilotIdentificationApi';

/**
 * Pilot Identification Page Component
 * 
 * This page helps identify ideal POC candidates for modernization initiatives
 * based on business drivers, compelling events, and application characteristics.
 * 
 * Follows the same pattern as ApplicationSimilaritiesPage.
 */
const PilotIdentificationPage = () => {
  const { t } = useTranslation(['pages', 'common']);
  const navigate = useNavigate();
  const [toolsOpen, setToolsOpen] = useState(false);
  
  // Check for required data sources
  const { hasData, loading: checkingData, missingDataSources } = useDataSourceCheck([
    'applications-portfolio',
    'applications-tech-stack',
    'applications-infrastructure',
    'applications-utilization'
  ]);
  
  // Main state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analysisCompleted, setAnalysisCompleted] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  
  // Three result types from backend
  const [ruleBasedResults, setRuleBasedResults] = useState([]);
  const [aiEnhancedResults, setAiEnhancedResults] = useState([]);
  const [consolidatedResults, setConsolidatedResults] = useState([]);
  
  // Store analysis criteria for display
  const [analysisCriteria, setAnalysisCriteria] = useState(null);
  
  // UI state
  const [resultsTabId, setResultsTabId] = useState('consolidated'); // consolidated, rule-based, ai-enhanced
  const [activeTabId, setActiveTabId] = useState('overview');
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [selectedSimilarityThreshold, setSelectedSimilarityThreshold] = useState(85);
  const [similarAppsPageSize, setSimilarAppsPageSize] = useState(10);
  const [similarAppsCurrentPage, setSimilarAppsCurrentPage] = useState(1);
  const [sortingColumn, setSortingColumn] = useState({ sortingField: "similarity" });
  const [sortingDescending, setSortingDescending] = useState(true);
  
  // Similar applications state
  const [similarApplicationsData, setSimilarApplicationsData] = useState({});
  const [loadingSimilarApps, setLoadingSimilarApps] = useState(false);

  // Sync selectedSimilarityThreshold with analysisCriteria when it changes
  useEffect(() => {
    if (analysisCriteria && analysisCriteria.similarityThreshold) {
      setSelectedSimilarityThreshold(analysisCriteria.similarityThreshold);
    }
  }, [analysisCriteria]);

  // Get project ID from localStorage
  const projectData = localStorage.getItem('selectedProject');
  const projectId = projectData ? JSON.parse(projectData).projectId : null;

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
        
        console.log('🔍 Loading existing pilot identification results for project:', projectId);
        
        const existingResults = await fetchPilotIdentificationResults(projectId);
        
        if (existingResults) {
          console.log('✅ Found existing pilot identification results');
          console.log('🔍 Results structure:', existingResults);
          
          setAnalysisCompleted(true);
          setAnalysisData(existingResults);
          
          // Handle both new format (with separate arrays) and old format (with candidates array)
          if (existingResults.ruleBased || existingResults.aiEnhanced || existingResults.consolidated) {
            // New format with three separate result types
            console.log('📊 Using new three-stage format');
            setRuleBasedResults(existingResults.ruleBased || []);
            setAiEnhancedResults(existingResults.aiEnhanced || []);
            setConsolidatedResults(existingResults.consolidated || []);
            
            // Fetch similar applications for consolidated results (default view)
            await fetchSimilarApplicationsForAllCandidates(existingResults.consolidated || []);
          } else if (existingResults.candidates && existingResults.candidates.length > 0) {
            // Old format with single candidates array - treat as consolidated
            console.log('📊 Using legacy format - treating as consolidated results');
            const legacyCandidates = existingResults.candidates || [];
            setConsolidatedResults(legacyCandidates);
            setRuleBasedResults([]); // No separate rule-based results in old format
            setAiEnhancedResults([]); // No separate AI-enhanced results in old format
            
            // Fetch similar applications
            await fetchSimilarApplicationsForAllCandidates(legacyCandidates);
          } else {
            console.log('⚠️ Results found but no data in expected format');
          }
        } else {
          console.log('📭 No existing pilot identification results found');
        }
        
      } catch (err) {
        console.error('❌ Error loading existing pilot identification results:', err);
        
        // Only show error for serious issues, not for "endpoint not implemented" cases
        if (!err.message.includes('404') && 
            !err.message.includes('No data') &&
            !err.message.includes('not found')) {
          setError(`Failed to load existing results: ${err.message}`);
        }
      } finally {
        setLoading(false);
      }
    };

    loadExistingResults();
  }, [projectId]);

  // Refetch similar applications when similarity threshold or results tab changes
  useEffect(() => {
    const currentResults = getCurrentResults();
    if (currentResults.length > 0 && projectId) {
      fetchSimilarApplicationsForAllCandidates(currentResults);
    }
  }, [selectedSimilarityThreshold, resultsTabId]);
  
  // Get current results based on selected tab
  const getCurrentResults = () => {
    switch (resultsTabId) {
      case 'rule-based':
        return ruleBasedResults;
      case 'ai-enhanced':
        return aiEnhancedResults;
      case 'consolidated':
      default:
        return consolidatedResults;
    }
  };

  // Fetch similar applications for all candidates after loading results
  const fetchSimilarApplicationsForAllCandidates = async (candidates) => {
    if (!candidates || candidates.length === 0 || !projectId) return;
    
    setLoadingSimilarApps(true);
    const similarAppsData = {};
    
    try {
      const minSimilarity = selectedSimilarityThreshold / 100;
      
      // Fetch similar applications for all candidates in parallel
      const promises = candidates.map(async (candidate) => {
        try {
          const applicationName = candidate.applicationName || candidate.name;
          const result = await getSimilarApplications(projectId, applicationName, minSimilarity);
          return { applicationName, similarApplications: result.similarApplications || [] };
        } catch (error) {
          console.error(`Error fetching similar apps for ${candidate.applicationName}:`, error);
          return { applicationName: candidate.applicationName || candidate.name, similarApplications: [] };
        }
      });
      
      const results = await Promise.all(promises);
      
      // Store results by application name
      results.forEach(({ applicationName, similarApplications }) => {
        similarAppsData[applicationName] = similarApplications;
      });
      
      setSimilarApplicationsData(similarAppsData);
      console.log('✅ Similar applications loaded for all candidates');
    } catch (error) {
      console.error('❌ Error fetching similar applications for candidates:', error);
    } finally {
      setLoadingSimilarApps(false);
    }
  };

  // Handle analysis completion
  const handleAnalysisComplete = async (results) => {
    if (results === null) {
      // Clear results
      setAnalysisCompleted(false);
      setAnalysisData(null);
      setRuleBasedResults([]);
      setAiEnhancedResults([]);
      setConsolidatedResults([]);
      setAnalysisCriteria(null); // Reset criteria when clearing results
      return;
    }

    console.log('🎉 Pilot identification analysis completed:', results);
    
    // Just call the same simple API that works on page load
    try {
      // Small delay to ensure DynamoDB writes are complete
      console.log('⏳ Waiting 2 seconds for DynamoDB writes to complete...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('📥 Fetching pilot identification results after Step Function completion...');
      const actualResults = await fetchPilotIdentificationResults(projectId);
      
      if (actualResults) {
        console.log('✅ Successfully loaded pilot identification results after completion');
        setAnalysisCompleted(true);
        setAnalysisData(actualResults);
        
        // Handle both new format and old format
        if (actualResults.ruleBased || actualResults.aiEnhanced || actualResults.consolidated) {
          // New format
          setRuleBasedResults(actualResults.ruleBased || []);
          setAiEnhancedResults(actualResults.aiEnhanced || []);
          setConsolidatedResults(actualResults.consolidated || []);
          await fetchSimilarApplicationsForAllCandidates(actualResults.consolidated || []);
        } else if (actualResults.candidates) {
          // Old format
          const candidatesList = actualResults.candidates || [];
          setConsolidatedResults(candidatesList);
          setRuleBasedResults([]);
          setAiEnhancedResults([]);
          await fetchSimilarApplicationsForAllCandidates(candidatesList);
        }
      } else {
        console.warn('⚠️ No pilot identification results found after Step Function completion');
        setAnalysisCompleted(true);
        setAnalysisData(results);
        
        // Fallback to Step Function output
        const candidatesList = results.candidates || [];
        setConsolidatedResults(candidatesList);
        setRuleBasedResults([]);
        setAiEnhancedResults([]);
        
        await fetchSimilarApplicationsForAllCandidates(candidatesList);
      }
    } catch (error) {
      console.error('❌ Error fetching results after Step Function completion:', error);
      setAnalysisCompleted(true);
      setAnalysisData(results);
      
      // Fallback to Step Function output
      const candidatesList = results.candidates || [];
      setConsolidatedResults(candidatesList);
      setRuleBasedResults([]);
      setAiEnhancedResults([]);
      
      await fetchSimilarApplicationsForAllCandidates(candidatesList);
    }
  };

  // Handle candidate selection (simplified - no API calls)
  const handleCandidateSelect = (item) => {
    setSelectedCandidate(item);
    setSimilarAppsCurrentPage(1);
    setSortingColumn({ sortingField: "similarity" });
    setSortingDescending(true);
  };

  // Handle sorting change for similar apps table
  const handleSortingChange = ({ detail }) => {
    setSortingColumn(detail.sortingColumn);
    setSortingDescending(detail.isDescending);
    setSimilarAppsCurrentPage(1);
  };

  // Get candidate columns based on result type
  const getCandidateColumns = () => {
    const baseColumns = [
      {
        id: 'applicationName',
        header: t('pages:pilot.applicationName'),
        cell: item => item.applicationName || item.application_name || '-',
        sortingField: 'applicationName'
      },
      {
        id: 'department',
        header: t('pages:pilot.department'),
        cell: item => item.department || '-',
        sortingField: 'department'
      },
      {
        id: 'criticality',
        header: t('pages:pilot.criticality'),
        cell: item => (
          <StatusIndicator type={
            item.criticality === 'High' ? 'error' :
            item.criticality === 'Medium' ? 'warning' : 'success'
          }>
            {item.criticality || '-'}
          </StatusIndicator>
        ),
        sortingField: 'criticality'
      }
    ];
    
    // Add score columns based on result type
    if (resultsTabId === 'rule-based') {
      baseColumns.push({
        id: 'score',
        header: 'Algorithmic Score',
        cell: item => (
          <Box>
            <strong>{item.score || 0}</strong>
            <Box variant="small" color="text-body-secondary">
              {t('pages:pilot.ruleBasedCalculation')}
            </Box>
          </Box>
        ),
        sortingField: 'score'
      });
    } else if (resultsTabId === 'ai-enhanced') {
      baseColumns.push(
        {
          id: 'score',
          header: 'AI-Enhanced Score',
          cell: item => (
            <Box>
              <strong>{item.score || 0}</strong>
              <Box variant="small" color="text-body-secondary">
                {t('pages:pilot.aiEnhanced')}
              </Box>
            </Box>
          ),
          sortingField: 'score'
        },
        {
          id: 'confidence',
          header: 'AI Confidence',
          cell: item => `${item.confidence || 0}%`,
          sortingField: 'confidence'
        }
      );
    } else {
      // Consolidated view
      baseColumns.push(
        {
          id: 'consolidatedScore',
          header: 'Consolidated Score',
          cell: item => (
            <Box>
              <strong>{item.score || 0}</strong>
              <Box variant="small" color="text-body-secondary">
                {item.recommendation || 'Not rated'}
              </Box>
            </Box>
          ),
          sortingField: 'score'
        },
        {
          id: 'scoreComparison',
          header: 'Score Comparison',
          cell: item => (
            <Box>
              <Box variant="small">{t('pages:pilot.algo')} {item.algorithmicScore || 0}</Box>
              <Box variant="small">{t('pages:pilot.ai')} {item.aiEnhancedScore || 0}</Box>
              <Box variant="small" color={
                item.agreementLevel === 'HIGH' ? 'text-status-success' :
                item.agreementLevel === 'MEDIUM' ? 'text-status-warning' : 'text-status-error'
              }>
                {t('pages:pilot.agreement')} {item.agreementLevel || 'N/A'}
              </Box>
            </Box>
          )
        }
      );
    }
    
    baseColumns.push({
      id: 'actions',
      header: t('pages:pilot.actions'),
      cell: item => (
        <SpaceBetween direction="horizontal" size="xs">
          <Link onFollow={() => handleCandidateSelect(item)}>
            {t('pages:pilot.viewDetails')}
          </Link>
        </SpaceBetween>
      )
    });
    
    return baseColumns;
  };

  return (
    <Layout
      activeHref="/planning/pilot-identification"
      toolsOpen={toolsOpen}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
      infoContent={
        <Box padding="l">
          <PilotIdentificationInfoContent />
        </Box>
      }
    >
      <ContentLayout
        header={
          <Header 
            variant="h1"
            actions={
              <Button 
                iconName="download"
                onClick={() => navigateToExportWithCategory('pilot-identification', navigate)}
              >
                {t('pages:pilot.export')}
              </Button>
            }
          >
            {t('pages:pilot.title')}
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

          {/* Loading State */}
          {loading && (
            <Container>
              <Box textAlign="center" padding="l">
                <SpaceBetween size="m">
                  <Spinner size="large" />
                  <Box variant="h3">{t('pages:pilot.loadingPilotIdentification')}</Box>
                  <Box variant="p" color="text-body-secondary">
                    {t('pages:pilot.checkingResults')}
                  </Box>
                </SpaceBetween>
              </Box>
            </Container>
          )}

          {/* Error State */}
          {error && (
            <Alert type="error" header={t('pages:pilot.errorLoadingResults')} dismissible onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* Pilot Identification Analysis Trigger Section */}
          {!loading && (
            <PilotIdentificationTrigger 
              onAnalysisComplete={handleAnalysisComplete}
              onAnalysisStart={(criteria) => setAnalysisCriteria(criteria)}
              analysisData={analysisData}
            />
          )}

          {/* Spacing between trigger and results */}
          {!loading && analysisData && analysisCompleted && <Box margin={{ top: 'xl' }} />}

          {/* Pilot Identification Results */}
          {!loading && analysisData && analysisCompleted && (
            <Container>
              <Header variant="h2">{t('pages:pilot.pilotIdentificationResults')}</Header>
              
              {/* Display Analysis Criteria */}
              {analysisCriteria && (
                <Alert type="info" header={t('pages:pilot.analysisCriteria')}>
                  <ColumnLayout columns={3} variant="text-grid">
                    <div>
                      <Box variant="awsui-key-label">{t('pages:pilot.businessDrivers')}</Box>
                      <Box>
                        {analysisCriteria.drivers && analysisCriteria.drivers.length > 0 ? (
                          analysisCriteria.drivers.map((driver, idx) => (
                            <Box key={idx} variant="p">• {driver.charAt(0).toUpperCase() + driver.slice(1)}</Box>
                          ))
                        ) : (
                          <Box variant="p" color="text-body-secondary">{t('pages:pilot.noneSelected')}</Box>
                        )}
                      </Box>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{t('pages:pilot.compellingEvents')}</Box>
                      <Box>
                        {analysisCriteria.events && analysisCriteria.events.length > 0 ? (
                          analysisCriteria.events.map((event, idx) => (
                            <Box key={idx} variant="p">• {event.charAt(0).toUpperCase() + event.slice(1).replace(/_/g, ' ')}</Box>
                          ))
                        ) : (
                          <Box variant="p" color="text-body-secondary">{t('pages:pilot.noneSelected')}</Box>
                        )}
                      </Box>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{t('pages:pilot.parameters')}</Box>
                      <Box variant="p">{t('pages:pilot.maxCandidates')}: {analysisCriteria.maxCandidates}</Box>
                      <Box variant="p">{t('pages:pilot.similarityThreshold')}: {analysisCriteria.similarityThreshold}%</Box>
                      <Box variant="p">{t('pages:pilot.riskTolerance')}: {analysisCriteria.riskTolerance}%</Box>
                    </div>
                  </ColumnLayout>
                </Alert>
              )}
              
              {(consolidatedResults.length > 0 || ruleBasedResults.length > 0 || aiEnhancedResults.length > 0) ? (
                <SpaceBetween size="l">
                  {/* Results Type Tabs */}
                  <Tabs
                    activeTabId={resultsTabId}
                    onChange={({ detail }) => {
                      setResultsTabId(detail.activeTabId);
                      setSelectedCandidate(null); // Clear selection when switching tabs
                    }}
                    tabs={[
                      {
                        id: 'consolidated',
                        label: `${t('pages:pilot.consolidatedResults')} (${consolidatedResults.length})`,
                        content: (
                          <SpaceBetween size="l">
                            <Alert type="info">
                              <Box variant="p">
                                <strong>{t('pages:pilot.consolidatedResults')}:</strong> {t('pages:pilot.consolidatedDescription')}
                              </Box>
                            </Alert>
                            
                            {/* Results Summary */}
                            <ColumnLayout columns={4}>
                              <Box>
                                <Box variant="awsui-key-label">{t('pages:pilot.totalCandidates')}</Box>
                                <Box variant="h2">{consolidatedResults.length}</Box>
                              </Box>
                              <Box>
                                <Box variant="awsui-key-label">{t('pages:pilot.avgAlgorithmic')}</Box>
                                <Box variant="h2">
                                  {consolidatedResults.length > 0 ? 
                                    Math.round(consolidatedResults.reduce((sum, c) => sum + (c.algorithmicScore || 0), 0) / consolidatedResults.length) : 0}
                                </Box>
                              </Box>
                              <Box>
                                <Box variant="awsui-key-label">{t('pages:pilot.avgAiEnhanced')}</Box>
                                <Box variant="h2">
                                  {consolidatedResults.length > 0 ? 
                                    Math.round(consolidatedResults.reduce((sum, c) => sum + (c.aiEnhancedScore || 0), 0) / consolidatedResults.length) : 0}
                                </Box>
                              </Box>
                              <Box>
                                <Box variant="awsui-key-label">{t('pages:pilot.avgConsolidated')}</Box>
                                <Box variant="h2">
                                  {consolidatedResults.length > 0 ? 
                                    Math.round(consolidatedResults.reduce((sum, c) => sum + (c.score || 0), 0) / consolidatedResults.length) : 0}
                                </Box>
                              </Box>
                            </ColumnLayout>
                          </SpaceBetween>
                        )
                      },
                      {
                        id: 'rule-based',
                        label: `${t('pages:pilot.ruleBasedResults')} (${ruleBasedResults.length})`,
                        content: (
                          <SpaceBetween size="l">
                            <Alert type="info">
                              <Box variant="p">
                                <strong>{t('pages:pilot.ruleBasedResults')}:</strong> {t('pages:pilot.ruleBasedDescription')}
                              </Box>
                            </Alert>
                            
                            {/* Results Summary */}
                            <ColumnLayout columns={3}>
                              <Box>
                                <Box variant="awsui-key-label">{t('pages:pilot.totalCandidates')}</Box>
                                <Box variant="h2">{ruleBasedResults.length}</Box>
                              </Box>
                              <Box>
                                <Box variant="awsui-key-label">{t('pages:pilot.averageScore')}</Box>
                                <Box variant="h2">
                                  {ruleBasedResults.length > 0 ? 
                                    Math.round(ruleBasedResults.reduce((sum, c) => sum + (c.score || 0), 0) / ruleBasedResults.length) : 0}
                                </Box>
                              </Box>
                              <Box>
                                <Box variant="awsui-key-label">{t('pages:pilot.topCandidate')}</Box>
                                <Box variant="h2">
                                  {ruleBasedResults[0]?.applicationName || t('pages:pilot.none')}
                                </Box>
                              </Box>
                            </ColumnLayout>
                          </SpaceBetween>
                        )
                      },
                      {
                        id: 'ai-enhanced',
                        label: `${t('pages:pilot.aiEnhancedResults')} (${aiEnhancedResults.length})`,
                        content: (
                          <SpaceBetween size="l">
                            <Alert type="info">
                              <Box variant="p">
                                <strong>{t('pages:pilot.aiEnhancedResults')}:</strong> {t('pages:pilot.aiEnhancedDescription')}
                              </Box>
                            </Alert>
                            
                            {/* Results Summary */}
                            <ColumnLayout columns={3}>
                              <Box>
                                <Box variant="awsui-key-label">{t('pages:pilot.totalCandidates')}</Box>
                                <Box variant="h2">{aiEnhancedResults.length}</Box>
                              </Box>
                              <Box>
                                <Box variant="awsui-key-label">{t('pages:pilot.averageScore')}</Box>
                                <Box variant="h2">
                                  {aiEnhancedResults.length > 0 ? 
                                    Math.round(aiEnhancedResults.reduce((sum, c) => sum + (c.score || 0), 0) / aiEnhancedResults.length) : 0}
                                </Box>
                              </Box>
                              <Box>
                                <Box variant="awsui-key-label">{t('pages:pilot.avgConfidence')}</Box>
                                <Box variant="h2">
                                  {aiEnhancedResults.length > 0 ? 
                                    Math.round(aiEnhancedResults.reduce((sum, c) => sum + (c.confidence || 0), 0) / aiEnhancedResults.length) : 0}%
                                </Box>
                              </Box>
                            </ColumnLayout>
                          </SpaceBetween>
                        )
                      }
                    ]}
                  />

                  {/* Selected Candidate Details - Moved above candidates list */}
                  {selectedCandidate && (
                    <Container>
                      <SpaceBetween size="l">
                        <Header 
                          variant="h2"
                          actions={
                            <Button 
                              variant="icon" 
                              iconName="close"
                              onClick={() => setSelectedCandidate(null)}
                              ariaLabel={t('components:common.closePilotDetails')}
                            />
                          }
                        >
                          {selectedCandidate.applicationName || selectedCandidate.name} {t('pages:pilot.details')}
                        </Header>
                        
                        <Tabs
                          activeTabId={activeTabId}
                          onChange={({ detail }) => setActiveTabId(detail.activeTabId)}
                          tabs={[
                            {
                              id: "overview",
                              label: t('pages:pilot.overview'),
                              content: (
                                <SpaceBetween size="l">
                                  <ColumnLayout columns={2}>
                                    <div>
                                      <Box variant="awsui-key-label">{t('pages:pilot.applicationName')}</Box>
                                      <Box variant="awsui-value-large">{selectedCandidate.applicationName || selectedCandidate.name}</Box>
                                    </div>
                                    <div>
                                      <Box variant="awsui-key-label">{t('pages:pilot.department')}</Box>
                                      <Box variant="awsui-value-large">{selectedCandidate.department}</Box>
                                    </div>
                                    <div>
                                      <Box variant="awsui-key-label">{t('pages:pilot.criticality')}</Box>
                                      <Box variant="awsui-value-large">
                                        <StatusIndicator type={
                                          selectedCandidate.criticality === 'High' ? 'error' :
                                          selectedCandidate.criticality === 'Medium' ? 'warning' : 'success'
                                        }>
                                          {selectedCandidate.criticality}
                                        </StatusIndicator>
                                      </Box>
                                    </div>
                                    <div>
                                      <Box variant="awsui-key-label">{t('pages:pilot.users')}</Box>
                                      <Box variant="awsui-value-large">{selectedCandidate.users || 'Not specified'}</Box>
                                    </div>
                                  </ColumnLayout>
                                  
                                  <Box>
                                    <Box variant="awsui-key-label">{t('pages:pilot.description')}</Box>
                                    <Box variant="p">{selectedCandidate.purpose || selectedCandidate.description || t('pages:pilot.noDescriptionAvailable')}</Box>
                                  </Box>
                                  
                                  <ColumnLayout columns={2}>
                                    <div>
                                      <Box variant="awsui-key-label">{t('pages:pilot.driverAlignment')}</Box>
                                      <ProgressBar 
                                        value={selectedCandidate.pilotScore?.business_driver || selectedCandidate.scores?.driverAlignment || selectedCandidate.driverAlignment || 0} 
                                        label={t('pages:pilot.driverAlignment')}
                                        description={`${Math.round(selectedCandidate.pilotScore?.business_driver || selectedCandidate.scores?.driverAlignment || selectedCandidate.driverAlignment || 0)}% ${t('pages:pilot.alignment')}`}
                                      />
                                    </div>
                                    <div>
                                      <Box variant="awsui-key-label">{t('pages:pilot.technicalFeasibility')}</Box>
                                      <ProgressBar 
                                        value={selectedCandidate.pilotScore?.technical_feasibility || selectedCandidate.scores?.feasibility || selectedCandidate.feasibility || 0} 
                                        label={t('pages:pilot.feasibility')}
                                        description={`${Math.round(selectedCandidate.pilotScore?.technical_feasibility || selectedCandidate.scores?.feasibility || selectedCandidate.feasibility || 0)}% ${t('pages:pilot.feasible')}`}
                                      />
                                    </div>
                                  </ColumnLayout>
                                  
                                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                    <Button 
                                      variant="normal"
                                      onClick={() => setSelectedCandidate(null)}
                                    >
                                      {t('pages:pilot.close')}
                                    </Button>
                                    <Button 
                                      variant="primary"
                                      onClick={() => {
                                        // Store the pilot information in localStorage
                                        localStorage.setItem('createBucketPilot', JSON.stringify({
                                          id: selectedCandidate.candidateId || selectedCandidate.id,
                                          name: selectedCandidate.applicationName || selectedCandidate.name,
                                          threshold: selectedSimilarityThreshold
                                        }));
                                        // Navigate to the Application Buckets page
                                        window.location.href = '/planning/application-grouping';
                                      }}
                                    >
                                      {t('pages:pilot.createBucketWithPilot')}
                                    </Button>
                                  </div>
                                  
                                  <Header variant="h3">{t('pages:pilot.similarApplications')}</Header>
                                  
                                  <SpaceBetween size="m">
                                    <FormField
                                      label={`${t('pages:pilot.similarityThresholdLabel')}: ${selectedSimilarityThreshold}%`}
                                      description={t('pages:pilot.adjustSimilarity')}
                                      constraintText={t('pages:pilot.higherValues')}
                                    >
                                      <Slider
                                        value={selectedSimilarityThreshold}
                                        onChange={({ detail }) => setSelectedSimilarityThreshold(detail.value)}
                                        min={0}
                                        max={100}
                                        step={1}
                                      />
                                    </FormField>
                                    
                                    <Table
                                      columnDefinitions={[
                                        {
                                          id: "name",
                                          header: t('pages:pilot.applicationName'),
                                          cell: item => item.name || item.applicationName,
                                          sortingField: "name"
                                        },
                                        {
                                          id: "department",
                                          header: t('pages:pilot.department'),
                                          cell: item => item.department || t('pages:pilot.notSpecified'),
                                          sortingField: "department"
                                        },
                                        {
                                          id: "similarity",
                                          header: t('pages:pilot.similarity'),
                                          cell: item => `${Math.round(item.similarity || 0)}%`,
                                          sortingField: "similarity"
                                        },
                                        {
                                          id: "criticality",
                                          header: t('pages:pilot.criticality'),
                                          cell: item => (
                                            <StatusIndicator type={
                                              item.criticality === 'High' ? 'error' :
                                              item.criticality === 'Medium' ? 'warning' : 'success'
                                            }>
                                              {item.criticality || t('pages:pilot.notSpecified')}
                                            </StatusIndicator>
                                          ),
                                          sortingField: "criticality"
                                        }
                                      ]}
                                      items={selectedCandidate ? (similarApplicationsData[selectedCandidate.applicationName || selectedCandidate.name] || []) : []}
                                      loading={loadingSimilarApps}
                                      loadingText={t('pages:pilot.loadingSimilarApplications')}
                                      empty={
                                        <Box textAlign="center" color="inherit">
                                          <b>{t('pages:pilot.noSimilarApplicationsFound')}</b>
                                          <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                                            {t('pages:pilot.tryLoweringThreshold')}
                                          </Box>
                                        </Box>
                                      }
                                      header={
                                        <Header
                                          counter={`(${selectedCandidate ? (similarApplicationsData[selectedCandidate.applicationName || selectedCandidate.name] || []).length : 0})`}
                                        >
                                          {t('pages:pilot.similarApplications')}
                                        </Header>
                                      }
                                    />
                                  </SpaceBetween>
                                </SpaceBetween>
                              )
                            }
                          ]}
                        />
                      </SpaceBetween>
                    </Container>
                  )}

                  {/* Candidates Cards */}
                  <Cards
                    cardDefinition={{
                      header: item => (
                        <div>{item.applicationName || item.name}</div>
                      ),
                      sections: [
                        {
                          id: "department",
                          header: t('pages:pilot.department'),
                          content: item => item.department || t('pages:pilot.notSpecified')
                        },
                        {
                          id: "criticality",
                          header: t('pages:pilot.criticality'),
                          content: item => (
                            <StatusIndicator type={
                              item.criticality === 'High' ? 'error' :
                              item.criticality === 'Medium' ? 'warning' : 'success'
                            }>
                              {item.criticality || t('pages:pilot.notSpecified')}
                            </StatusIndicator>
                          )
                        },
                        {
                          id: "score",
                          header: resultsTabId === 'consolidated' ? t('pages:pilot.consolidatedScore') : 
                                  resultsTabId === 'ai-enhanced' ? t('pages:pilot.aiEnhancedScore') : t('pages:pilot.algorithmicScore'),
                          content: item => (
                            <ProgressBar 
                              value={item.score || 0} 
                              label={`${item.score || 0}%`}
                              description={
                                resultsTabId === 'consolidated' ? item.recommendation || t('pages:pilot.notRated') :
                                resultsTabId === 'ai-enhanced' ? `${item.confidence || 0}% confidence` :
                                t('pages:pilot.ruleBasedCalculation')
                              }
                            />
                          )
                        },
                        ...(resultsTabId === 'consolidated' ? [{
                          id: "scoreBreakdown",
                          header: "Score Breakdown",
                          content: item => (
                            <Box>
                              <Box variant="small">{t('pages:pilot.algo')} {item.algorithmicScore || 0}</Box>
                              <Box variant="small">{t('pages:pilot.aiEnhanced')} {item.aiEnhancedScore || 0}</Box>
                              <Box variant="small" color={
                                item.agreementLevel === 'HIGH' ? 'text-status-success' :
                                item.agreementLevel === 'MEDIUM' ? 'text-status-warning' : 'text-status-error'
                              }>
                                {t('pages:pilot.agreement')} {item.agreementLevel || 'N/A'}
                              </Box>
                            </Box>
                          )
                        }] : []),
                        {
                          id: "similarApps",
                          header: t('pages:pilot.similarApplications'),
                          content: item => {
                            const applicationName = item.applicationName || item.name;
                            const similarApps = similarApplicationsData[applicationName] || [];
                            return t('pages:pilot.similarAppsCount', { count: similarApps.length });
                          }
                        }
                      ]
                    }}
                    cardsPerRow={[
                      { cards: 1 },
                      { minWidth: 500, cards: 2 }
                    ]}
                    items={getCurrentResults()}
                    loadingText={t('common:messages.loading')}
                    empty={
                      <Box textAlign="center" color="inherit">
                        <b>{t('pages:pilot.noCandidatesFound')}</b>
                        <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                          {t('pages:pilot.adjustCriteria')}
                        </Box>
                      </Box>
                    }
                    header={
                      <Header
                        counter={`(${getCurrentResults().length})`}
                      >
                        {t('pages:pilot.modernizationPocCandidates')}
                      </Header>
                    }
                    onSelectionChange={({ detail }) => {
                      if (detail.selectedItems.length > 0) {
                        handleCandidateSelect(detail.selectedItems[0]);
                      }
                    }}
                    selectedItems={selectedCandidate ? [selectedCandidate] : []}
                    selectionType="single"
                  />
                </SpaceBetween>
              ) : (
                <Box textAlign="center" padding="l">
                  <Box variant="h3">{t('pages:pilot.noPilotCandidatesFound')}</Box>
                  <Box variant="p" color="text-body-secondary">
                    {t('pages:pilot.noSuitableCandidates')}
                  </Box>
                </Box>
              )}
            </Container>
          )}
          
          {/* Selected Candidate Details - Moved outside main results container */}
          {!loading && selectedCandidate && (
            <Container>
              <SpaceBetween size="l">
                <Header 
                  variant="h2"
                  actions={
                    <Button 
                      variant="icon" 
                      iconName="close"
                      onClick={() => setSelectedCandidate(null)}
                      ariaLabel={t('components:common.closePilotDetails')}
                    />
                  }
                >
                  {selectedCandidate.applicationName || selectedCandidate.name} - {t('pages:pilot.detailedAnalysis')}
                </Header>
                
                <Tabs
                  activeTabId={activeTabId}
                  onChange={({ detail }) => setActiveTabId(detail.activeTabId)}
                  tabs={[
                    {
                      id: "overview",
                      label: "Overview",
                      content: (
                        <SpaceBetween size="l">
                          <ColumnLayout columns={2}>
                            <div>
                              <Box variant="awsui-key-label">{t('components:pilotDetails.applicationName')}</Box>
                              <Box variant="awsui-value-large">{selectedCandidate.applicationName || selectedCandidate.name}</Box>
                            </div>
                            <div>
                              <Box variant="awsui-key-label">{t('components:pilotDetails.department')}</Box>
                              <Box variant="awsui-value-large">{selectedCandidate.department}</Box>
                            </div>
                            <div>
                              <Box variant="awsui-key-label">{t('components:pilotDetails.criticality')}</Box>
                              <Box variant="awsui-value-large">
                                <StatusIndicator type={
                                  selectedCandidate.criticality === 'High' ? 'error' :
                                  selectedCandidate.criticality === 'Medium' ? 'warning' : 'success'
                                }>
                                  {selectedCandidate.criticality}
                                </StatusIndicator>
                              </Box>
                            </div>
                            <div>
                              <Box variant="awsui-key-label">{t('components:pilotDetails.resultType')}</Box>
                              <Box variant="awsui-value-large">{selectedCandidate.resultType || 'N/A'}</Box>
                            </div>
                          </ColumnLayout>
                          
                          {/* Score Details based on result type */}
                          {resultsTabId === 'consolidated' && (
                            <ExpandableSection headerText={t('components:common.scoreAnalysis')} defaultExpanded>
                              <ColumnLayout columns={3}>
                                <div>
                                  <Box variant="awsui-key-label">{t('components:pilotDetails.algorithmicScore')}</Box>
                                  <ProgressBar 
                                    value={selectedCandidate.algorithmicScore || 0} 
                                    label={`${selectedCandidate.algorithmicScore || 0}%`}
                                    description="Rule-based calculation"
                                  />
                                </div>
                                <div>
                                  <Box variant="awsui-key-label">AI-Enhanced Score</Box>
                                  <ProgressBar 
                                    value={selectedCandidate.aiEnhancedScore || 0} 
                                    label={`${selectedCandidate.aiEnhancedScore || 0}%`}
                                    description="AI-enhanced analysis"
                                  />
                                </div>
                                <div>
                                  <Box variant="awsui-key-label">{t('components:pilotDetails.consolidatedScore')}</Box>
                                  <ProgressBar 
                                    value={selectedCandidate.score || 0} 
                                    label={`${selectedCandidate.score || 0}%`}
                                    description={selectedCandidate.recommendation || 'Final score'}
                                  />
                                </div>
                              </ColumnLayout>
                              
                              <ColumnLayout columns={3}>
                                <div>
                                  <Box variant="awsui-key-label">{t('components:pilotDetails.scoreDifference')}</Box>
                                  <Box variant="h3" color={
                                    Math.abs(selectedCandidate.scoreDifference || 0) <= 10 ? 'text-status-success' :
                                    Math.abs(selectedCandidate.scoreDifference || 0) <= 20 ? 'text-status-warning' : 'text-status-error'
                                  }>
                                    {selectedCandidate.scoreDifference > 0 ? '+' : ''}{selectedCandidate.scoreDifference || 0}
                                  </Box>
                                </div>
                                <div>
                                  <Box variant="awsui-key-label">{t('components:pilotDetails.agreementLevel')}</Box>
                                  <Box variant="h3">
                                    <StatusIndicator type={
                                      selectedCandidate.agreementLevel === 'HIGH' ? 'success' :
                                      selectedCandidate.agreementLevel === 'MEDIUM' ? 'warning' : 'error'
                                    }>
                                      {selectedCandidate.agreementLevel || 'N/A'}
                                    </StatusIndicator>
                                  </Box>
                                </div>
                                <div>
                                  <Box variant="awsui-key-label">{t('components:pilotDetails.weighting')}</Box>
                                  <Box variant="p">
                                    AI: {Math.round((selectedCandidate.aiWeight || 0) * 100)}% | 
                                    Algo: {Math.round((selectedCandidate.algorithmicWeight || 0) * 100)}%
                                  </Box>
                                </div>
                              </ColumnLayout>
                            </ExpandableSection>
                          )}
                          
                          {/* AI Insights for AI-enhanced and consolidated views */}
                          {(resultsTabId === 'ai-enhanced' || resultsTabId === 'consolidated') && selectedCandidate.aiInsights && (
                            <ExpandableSection headerText={t('components:common.aiInsights')} defaultExpanded>
                              <SpaceBetween size="m">
                                <ColumnLayout columns={2}>
                                  <div>
                                    <Box variant="awsui-key-label">{t('components:pilotDetails.strategicTechnologyAlignment')}</Box>
                                    <ProgressBar 
                                      value={selectedCandidate.aiInsights.strategicTechnologyAlignment || 0} 
                                      label={`${selectedCandidate.aiInsights.strategicTechnologyAlignment || 0}%`}
                                    />
                                  </div>
                                  <div>
                                    <Box variant="awsui-key-label">{t('pages:pilot.skillsAwareFeasibility')}</Box>
                                    <ProgressBar 
                                      value={selectedCandidate.aiInsights.skillsAwareFeasibility || 0} 
                                      label={`${selectedCandidate.aiInsights.skillsAwareFeasibility || 0}%`}
                                    />
                                  </div>
                                  <div>
                                    <Box variant="awsui-key-label">{t('components:pilotDetails.organizationalImpact')}</Box>
                                    <ProgressBar 
                                      value={selectedCandidate.aiInsights.organizationalImpact || 0} 
                                      label={`${selectedCandidate.aiInsights.organizationalImpact || 0}%`}
                                    />
                                  </div>
                                  <div>
                                    <Box variant="awsui-key-label">{t('components:pilotDetails.riskAssessment')}</Box>
                                    <ProgressBar 
                                      value={selectedCandidate.aiInsights.riskAssessment || 0} 
                                      label={`${selectedCandidate.aiInsights.riskAssessment || 0}%`}
                                    />
                                  </div>
                                </ColumnLayout>
                                
                                {selectedCandidate.aiInsights.keyInsights && selectedCandidate.aiInsights.keyInsights.length > 0 && (
                                  <div>
                                    <Box variant="awsui-key-label">{t('components:pilotDetails.keyInsights')}</Box>
                                    <ul>
                                      {selectedCandidate.aiInsights.keyInsights.map((insight, idx) => (
                                        <li key={idx}>{insight}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                
                                {selectedCandidate.aiInsights.recommendations && selectedCandidate.aiInsights.recommendations.length > 0 && (
                                  <div>
                                    <Box variant="awsui-key-label">{t('components:pilotDetails.aiRecommendations')}</Box>
                                    <ul>
                                      {selectedCandidate.aiInsights.recommendations.map((rec, idx) => (
                                        <li key={idx}>{rec}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </SpaceBetween>
                            </ExpandableSection>
                          )}
                          
                          {/* Score Breakdown for rule-based view */}
                          {resultsTabId === 'rule-based' && selectedCandidate.scoreBreakdown && (
                            <ExpandableSection headerText={t('components:common.scoreBreakdown')} defaultExpanded>
                              <ColumnLayout columns={2}>
                                {Object.entries(selectedCandidate.scoreBreakdown).map(([key, value]) => (
                                  <div key={key}>
                                    <Box variant="awsui-key-label">{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</Box>
                                    <ProgressBar 
                                      value={value || 0} 
                                      label={`${value || 0}%`}
                                    />
                                  </div>
                                ))}
                              </ColumnLayout>
                            </ExpandableSection>
                          )}
                          
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <Button 
                              variant="normal"
                              onClick={() => setSelectedCandidate(null)}
                            >
                              {t('pages:pilot.close')}
                            </Button>
                            <Button 
                              variant="primary"
                              onClick={() => {
                                localStorage.setItem('createBucketPilot', JSON.stringify({
                                  id: selectedCandidate.candidateId || selectedCandidate.id,
                                  name: selectedCandidate.applicationName || selectedCandidate.name,
                                  threshold: selectedSimilarityThreshold
                                }));
                                window.location.href = '/planning/application-grouping';
                              }}
                            >
                              {t('pages:pilot.createBucketWithPilot')}
                            </Button>
                          </div>
                          
                          <Header variant="h3">{t('pages:pilot.similarApplications')}</Header>
                          
                          <SpaceBetween size="m">
                            <FormField
                              label={`${t('pages:pilot.similarityThresholdLabel')}: ${selectedSimilarityThreshold}%`}
                              description={t('pages:pilot.adjustSimilarity')}
                              constraintText={t('pages:pilot.higherValues')}
                            >
                              <Slider
                                value={selectedSimilarityThreshold}
                                onChange={({ detail }) => setSelectedSimilarityThreshold(detail.value)}
                                min={0}
                                max={100}
                                step={1}
                              />
                            </FormField>
                            
                            <Table
                              columnDefinitions={[
                                {
                                  id: "name",
                                  header: "Application Name",
                                  cell: item => item.name || item.applicationName,
                                  sortingField: "name"
                                },
                                {
                                  id: "department",
                                  header: "Department",
                                  cell: item => item.department || 'Not specified',
                                  sortingField: "department"
                                },
                                {
                                  id: "similarity",
                                  header: "Similarity",
                                  cell: item => `${Math.round(item.similarity || 0)}%`,
                                  sortingField: "similarity"
                                },
                                {
                                  id: "criticality",
                                  header: "Criticality",
                                  cell: item => (
                                    <StatusIndicator type={
                                      item.criticality === 'High' ? 'error' :
                                      item.criticality === 'Medium' ? 'warning' : 'success'
                                    }>
                                      {item.criticality || 'Not specified'}
                                    </StatusIndicator>
                                  ),
                                  sortingField: "criticality"
                                }
                              ]}
                              items={selectedCandidate ? (similarApplicationsData[selectedCandidate.applicationName || selectedCandidate.name] || []) : []}
                              loading={loadingSimilarApps}
                              loadingText={t('pages:pilot.loadingSimilarApplications')}
                              empty={
                                <Box textAlign="center" color="inherit">
                                  <b>{t('pages:pilot.noSimilarApplicationsFound')}</b>
                                  <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                                    {t('pages:pilot.tryLoweringThreshold')}
                                  </Box>
                                </Box>
                              }
                              header={
                                <Header
                                  counter={`(${selectedCandidate ? (similarApplicationsData[selectedCandidate.applicationName || selectedCandidate.name] || []).length : 0})`}
                                >
                                  {t('pages:pilot.similarApplications')}
                                </Header>
                              }
                            />
                          </SpaceBetween>
                        </SpaceBetween>
                      )
                    }
                  ]}
                />
              </SpaceBetween>
            </Container>
          )}
          </div>
        </SpaceBetween>
      </ContentLayout>
    </Layout>
  );
};

export default PilotIdentificationPage;
