import React, { useState, useEffect } from 'react';
import {
  Container,
  Header,
  Button,
  SpaceBetween,
  Box,
  Alert,
  ExpandableSection,
  FormField,
  Checkbox,
  Select,
  ColumnLayout,
  StatusIndicator,
  ProgressBar
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

// Services
import { 
  analyzeComponentSimilarities, 
  pollComponentSimilarityExecution,
  clearCachedResults
} from '../services/componentSimilarityApi';

// Hooks
import useProjectPermissions from '../hooks/useProjectPermissions';

const ComponentSimilaritiesAnalysisTrigger = ({ 
  onAnalysisComplete, 
  filters = {}, 
  analysisData,
  executionStatus,
  setExecutionStatus,
  analysisProgress,
  setAnalysisProgress
}) => {
  const { t } = useTranslation(['components', 'common']);
  const [selectedProject, setSelectedProject] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  
  // Check project permissions
  const { hasWriteAccess, loading: permissionsLoading } = useProjectPermissions(selectedProject?.projectId);

  // Debug: Log when analysisData prop changes
  useEffect(() => {
    console.log('🔍 ComponentSimilaritiesAnalysisTrigger - analysisData prop changed:', {
      hasAnalysisData: !!analysisData,
      analysisDataKeys: analysisData ? Object.keys(analysisData) : []
    });
  }, [analysisData]);

  // Advanced filters state - only technology weights that affect similarity calculation
  const [currentFilters, setCurrentFilters] = useState({
    includeRuntimes: true,
    includeFrameworks: true,
    includeDatabases: true,
    includeIntegrations: true,
    includeStorages: true
  });

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setCurrentFilters(prev => ({ ...prev, [key]: value }));
  };

  // Load selected project from localStorage
  useEffect(() => {
    try {
      const projectData = localStorage.getItem('selectedProject');
      if (projectData) {
        const project = JSON.parse(projectData);
        setSelectedProject(project);
      }
    } catch (err) {
      console.error('Error loading project data:', err);
      setError('Failed to load project data');
    }
  }, []);
  
  // Resume polling if execution status is provided and running
  useEffect(() => {
    if (executionStatus && executionStatus.status === 'RUNNING' && executionStatus.executionArn) {
      console.log('🔄 Resuming polling for in-flight execution:', executionStatus.executionArn);
      pollExecution(executionStatus.executionArn);
    }
  }, [executionStatus?.executionArn]); // Only trigger when executionArn changes

  const handleTriggerAnalysis = async () => {
    if (!selectedProject) {
      setError(t('components:similaritiesAnalysis.noProjectSelected'));
      return;
    }

    setIsTriggering(true);
    setError(null);
    setSuccess(null);
    setExecutionStatus(null);
    setAnalysisProgress(0);

    try {
      console.log('🚀 Triggering component similarity analysis for project:', selectedProject.projectId);
      console.log('🔧 Using filters:', currentFilters);
      
      const result = await analyzeComponentSimilarities(selectedProject.projectId, currentFilters);
      
      if (result.success) {
        console.log('✅ Component analysis triggered successfully');
        
        const execution = {
          status: 'RUNNING',
          executionArn: result.executionArn,
          executionId: result.executionId,
          estimatedTimeMinutes: result.estimatedTimeMinutes,
          startTime: new Date().toISOString(),
          progress: 0
        };
        
        setExecutionStatus(execution);

        // Save execution status to localStorage for persistence across navigation
        const executionKey = `componentSimilarityExecution_${selectedProject.projectId}`;
        localStorage.setItem(executionKey, JSON.stringify(execution));
        console.log('💾 Saved execution status to localStorage:', executionKey);

        // Start polling for status updates
        pollExecution(result.executionArn);
      } else {
        throw new Error(result.error || t('components:similaritiesAnalysis.failedToStartAnalysis'));
      }
    } catch (error) {
      console.error('❌ Error triggering component analysis:', error);
      setError(t('components:similaritiesAnalysis.failedToTriggerAnalysis', { error: error.message }));
    } finally {
      setIsTriggering(false);
    }
  };

  // Poll execution status
  const pollExecution = async (executionArn) => {
    let pollCount = 0;
    const maxPolls = 360; // Poll for up to 30 minutes (360 * 5 seconds)
    
    const pollInterval = setInterval(async () => {
      try {
        // Import the getExecutionStatus function directly to get immediate status
        const { getExecutionStatus } = await import('../services/stepFunctionService');
        const statusResult = await getExecutionStatus(executionArn);
        
        if (statusResult.success) {
          const status = statusResult.status;
          
          // Calculate progress based on time elapsed (rough estimate)
          const progress = Math.min(95, (pollCount / maxPolls) * 100);
          
          const updatedExecution = {
            executionArn,
            status,
            progress,
            estimatedTimeMinutes: executionStatus?.estimatedTimeMinutes || 15,
            startTime: executionStatus?.startTime || new Date().toISOString()
          };
          
          setExecutionStatus(updatedExecution);
          setAnalysisProgress(progress);
          
          // Update localStorage with current status
          if (selectedProject) {
            const executionKey = `componentSimilarityExecution_${selectedProject.projectId}`;
            localStorage.setItem(executionKey, JSON.stringify(updatedExecution));
          }
          
          if (status === 'SUCCEEDED') {
            clearInterval(pollInterval);
            setSuccess(t('components:similaritiesAnalysis.analysisCompletedSuccessfully'));
            
            // Clear execution status since analysis is complete
            setExecutionStatus(null);
            setAnalysisProgress(0);
            
            // Clear from localStorage
            if (selectedProject) {
              const executionKey = `componentSimilarityExecution_${selectedProject.projectId}`;
              localStorage.removeItem(executionKey);
              console.log('🗑️ Cleared execution from localStorage');
            }
            
            // Notify parent component to fetch and display results
            if (onAnalysisComplete) {
              onAnalysisComplete();
            }
          } else if (status === 'FAILED' || status === 'TIMED_OUT' || status === 'ABORTED') {
            clearInterval(pollInterval);
            setError(t('components:similaritiesAnalysis.analysisFailed', { status: status.toLowerCase(), error: statusResult.error || t('components:similaritiesAnalysis.unknownError') }));
            setExecutionStatus(null);
            setAnalysisProgress(0);
            
            // Clear from localStorage
            if (selectedProject) {
              const executionKey = `componentSimilarityExecution_${selectedProject.projectId}`;
              localStorage.removeItem(executionKey);
              console.log('🗑️ Cleared failed execution from localStorage');
            }
          } else if (status === 'RUNNING') {
            // Continue polling
            pollCount++;
            if (pollCount >= maxPolls) {
              clearInterval(pollInterval);
              setError(t('components:similaritiesAnalysis.analysisTimeout'));
              setExecutionStatus(null);
              setAnalysisProgress(0);
              
              // Clear from localStorage
              if (selectedProject) {
                const executionKey = `componentSimilarityExecution_${selectedProject.projectId}`;
                localStorage.removeItem(executionKey);
                console.log('🗑️ Cleared timed out execution from localStorage');
              }
            }
          }
        } else {
          console.error('❌ Error getting execution status:', statusResult.error);
          pollCount++;
          if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            setError(t('components:similaritiesAnalysis.failedToCheckStatus', { error: statusResult.error }));
            setExecutionStatus(null);
            setAnalysisProgress(0);
            
            // Clear from localStorage
            if (selectedProject) {
              const executionKey = `componentSimilarityExecution_${selectedProject.projectId}`;
              localStorage.removeItem(executionKey);
            }
          }
        }
      } catch (error) {
        console.error('❌ Error polling execution status:', error);
        pollCount++;
        if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
          setError(t('components:similaritiesAnalysis.failedToCheckStatus', { error: error.message }));
          setExecutionStatus(null);
          setAnalysisProgress(0);
          
          // Clear from localStorage
          if (selectedProject) {
            const executionKey = `componentSimilarityExecution_${selectedProject.projectId}`;
            localStorage.removeItem(executionKey);
          }
        }
      }
    }, 5000); // Poll every 5 seconds
  };

  const handleClearResults = async () => {
    if (!selectedProject) {
      setError(t('components:similaritiesAnalysis.noProjectSelected'));
      return;
    }

    try {
      console.log('🗑️ Clearing cached results for project:', selectedProject.projectId);
      
      setIsClearing(true);
      setError(null);
      setSuccess(null);
      
      const result = await clearCachedResults(selectedProject.projectId);
      
      console.log('🔍 Clear results response:', result);
      
      if (result.success) {
        console.log('✅ Clear operation reported success');
        setSuccess(t('components:similaritiesAnalysis.resultsClearedSuccessfully'));
        setError(null);
        
        // Clear local state
        setExecutionStatus(null);
        setAnalysisProgress(0);
        
        // Clear from localStorage
        if (selectedProject) {
          const executionKey = `componentSimilarityExecution_${selectedProject.projectId}`;
          localStorage.removeItem(executionKey);
          console.log('🗑️ Cleared execution from localStorage after clearing results');
        }
        
        // Notify parent component to clear results
        if (onAnalysisComplete) {
          onAnalysisComplete(null);
        }
      } else {
        console.log('❌ Clear operation reported failure:', result.error);
        throw new Error(result.error || t('components:similaritiesAnalysis.failedToClearResults'));
      }
    } catch (error) {
      console.error('❌ Error clearing results:', error);
      setError(t('components:similaritiesAnalysis.failedToClearResults', { error: error.message }));
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <Container
      header={
        <Header
          variant="h2"
          description={t('components:similaritiesAnalysis.headerDescriptionComponents')}
        >
          {t('components:similaritiesAnalysis.componentSimilarityAnalysis')}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Box variant="p" color="text-body-secondary">
          {t('components:similaritiesAnalysis.descriptionComponents')}
        </Box>

        {/* Read-only access alert */}
        {!permissionsLoading && !hasWriteAccess && (
          <Alert type="info" header="Read-only access">
            You have read-only access to this project. You cannot run new analyses or clear results.
          </Alert>
        )}

        {error && (
          <Alert
            statusIconAriaLabel={t('components:errors.statusIconAriaLabel')}
            type="error"
            onDismiss={() => setError(null)}
            dismissAriaLabel={t('components:errors.dismissAriaLabel')}
            dismissible
          >
            {error}
          </Alert>
        )}

        {success && (
          <Alert
            statusIconAriaLabel={t('components:errors.statusIconAriaLabel')}
            type="success"
            onDismiss={() => setSuccess(null)}
            dismissAriaLabel={t('components:errors.dismissAriaLabel')}
            dismissible
          >
            {success}
          </Alert>
        )}

        {/* Clearing Status */}
        {isClearing && (
          <Box>
            <SpaceBetween size="s">
              <Box>
                <Box variant="awsui-key-label">{t('components:similaritiesAnalysis.clearStatus')}</Box>
                <StatusIndicator type="in-progress">
                  {t('components:similaritiesAnalysis.clearingResults')}
                </StatusIndicator>
              </Box>
              
              <ProgressBar
                value={50}
                additionalInfo={t('components:similaritiesAnalysis.removingSimilarityRecords')}
                description={t('components:similaritiesAnalysis.analysisTimeDescription')}
              />
            </SpaceBetween>
          </Box>
        )}

        {/* Execution Status - Hide when successfully completed */}
        {executionStatus && executionStatus.status !== 'SUCCEEDED' && (
          <Box>
            <Box>
              <Box variant="awsui-key-label">{t('components:similaritiesAnalysis.analysisStatus')}</Box>
              <StatusIndicator type={
                executionStatus.status === 'FAILED' ? 'error' :
                executionStatus.status === 'RUNNING' ? 'in-progress' : 'pending'
              }>
                {executionStatus.status === 'RUNNING' ? t('components:similaritiesAnalysis.analysisInProgress') :
                 executionStatus.status === 'FAILED' ? t('components:similaritiesAnalysis.analysisFailed') : executionStatus.status}
              </StatusIndicator>
            </Box>
          </Box>
        )}

        {/* Action Buttons */}
        <SpaceBetween direction="horizontal" size="s">
          <Button 
            variant="primary"
            disabled={!selectedProject || isTriggering || isClearing || executionStatus?.status === 'RUNNING' || analysisData || !hasWriteAccess}
            loading={isTriggering || executionStatus?.status === 'RUNNING'}
            onClick={handleTriggerAnalysis}
          >
            {isTriggering ? t('components:similaritiesAnalysis.startingAnalysis') : 
             executionStatus?.status === 'RUNNING' ? t('components:similaritiesAnalysis.analysisInProgressButton') : 
             analysisData ? t('components:similaritiesAnalysis.clearResultsToRunNew') :
             t('components:similaritiesAnalysis.runComponentSimilaritiesAnalysis')}
          </Button>
          
          {/* Clear Results button - only show if there's analysis data */}
          {analysisData && (
            <Button 
              variant="normal"
              disabled={!selectedProject || isTriggering || isClearing || executionStatus?.status === 'RUNNING' || !hasWriteAccess}
              loading={isClearing}
              onClick={handleClearResults}
            >
              {isClearing ? t('components:similaritiesAnalysis.clearingResults') : t('components:similaritiesAnalysis.clearResults')}
            </Button>
          )}
        </SpaceBetween>

        {/* Advanced Configuration - Below the button */}
        <ExpandableSection
          headerText={t('components:similaritiesAnalysis.advancedConfiguration')}
          defaultExpanded={false}
          description={t('components:similaritiesAnalysis.advancedConfigDescription')}
        >
          <SpaceBetween size="l">
            {/* Technology Category Weights */}
            <FormField 
              description={t('components:similaritiesAnalysis.technologyCategoryDescription')}
            >
              <SpaceBetween size="m">
                <ColumnLayout columns={2}>
                  <FormField label={t('components:similaritiesAnalysis.includeRuntimes')} description={t('components:similaritiesAnalysis.includeRuntimesDescription')}>
                    <Checkbox
                      checked={currentFilters.includeRuntimes}
                      onChange={({ detail }) => handleFilterChange('includeRuntimes', detail.checked)}
                      disabled={isTriggering}
                    >
                      {t('components:similaritiesAnalysis.runtimeExamples')}
                    </Checkbox>
                  </FormField>

                  <FormField label={t('components:similaritiesAnalysis.includeFrameworks')} description={t('components:similaritiesAnalysis.includeFrameworksDescription')}>
                    <Checkbox
                      checked={currentFilters.includeFrameworks}
                      onChange={({ detail }) => handleFilterChange('includeFrameworks', detail.checked)}
                      disabled={isTriggering}
                    >
                      {t('components:similaritiesAnalysis.frameworkExamples')}
                    </Checkbox>
                  </FormField>

                  <FormField label={t('components:similaritiesAnalysis.includeDatabases')} description={t('components:similaritiesAnalysis.includeDatabasesDescription')}>
                    <Checkbox
                      checked={currentFilters.includeDatabases}
                      onChange={({ detail }) => handleFilterChange('includeDatabases', detail.checked)}
                      disabled={isTriggering}
                    >
                      {t('components:similaritiesAnalysis.databaseExamples')}
                    </Checkbox>
                  </FormField>

                  <FormField label={t('components:similaritiesAnalysis.includeIntegrations')} description={t('components:similaritiesAnalysis.includeIntegrationsDescription')}>
                    <Checkbox
                      checked={currentFilters.includeIntegrations}
                      onChange={({ detail }) => handleFilterChange('includeIntegrations', detail.checked)}
                      disabled={isTriggering}
                    >
                      {t('components:similaritiesAnalysis.integrationExamples')}
                    </Checkbox>
                  </FormField>

                  <FormField label={t('components:similaritiesAnalysis.includeStorages')} description={t('components:similaritiesAnalysis.includeStoragesDescription')}>
                    <Checkbox
                      checked={currentFilters.includeStorages}
                      onChange={({ detail }) => handleFilterChange('includeStorages', detail.checked)}
                      disabled={isTriggering}
                    >
                      {t('components:similaritiesAnalysis.storageExamples')}
                    </Checkbox>
                  </FormField>
                </ColumnLayout>
              </SpaceBetween>
            </FormField>
          </SpaceBetween>
        </ExpandableSection>
      </SpaceBetween>
    </Container>
  );
};

export default ComponentSimilaritiesAnalysisTrigger;
