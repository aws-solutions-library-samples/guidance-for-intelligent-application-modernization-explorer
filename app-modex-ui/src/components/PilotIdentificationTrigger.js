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
  Multiselect,
  Slider,
  ColumnLayout,
  StatusIndicator,
  ProgressBar
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

// Services
import { triggerPilotIdentificationAnalysis, getExecutionStatus } from '../services/stepFunctionService';
import { clearPilotIdentificationResults } from '../services/pilotIdentificationApi';

// Hooks
import useProjectPermissions from '../hooks/useProjectPermissions';

/**
 * Pilot Identification Analysis Trigger Component
 * 
 * Provides a form to configure and trigger pilot identification analysis step function
 * and shows the current status of the analysis.
 */
const PilotIdentificationTrigger = ({ onAnalysisComplete, onAnalysisStart, analysisData }) => {
  const { t } = useTranslation(['components', 'common']);
  const [selectedProject, setSelectedProject] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [executionStatus, setExecutionStatus] = useState(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  
  // Check project permissions
  const { hasWriteAccess, loading: permissionsLoading } = useProjectPermissions(selectedProject?.projectId);

  // Form state
  const [selectedDrivers, setSelectedDrivers] = useState([]);
  const [selectedEvents, setSelectedEvents] = useState([]);
  const [teamCapabilities, setTeamCapabilities] = useState([]);
  const [maxCandidates, setMaxCandidates] = useState(4);
  const [similarityThreshold, setSimilarityThreshold] = useState(85);
  const [riskTolerance, setRiskTolerance] = useState(50);
  const [weights, setWeights] = useState({
    businessDriver: 30,
    compellingEvent: 25,
    feasibility: 25,
    impact: 20
  });

  // Business driver options
  const businessDriverOptions = [
    { label: t('components:pilotTrigger.costReduction'), value: 'cost' },
    { label: t('components:pilotTrigger.agilityInnovation'), value: 'agility' },
    { label: t('components:pilotTrigger.operationalEfficiency'), value: 'efficiency' },
    { label: t('components:pilotTrigger.riskReduction'), value: 'risk' },
    { label: t('components:pilotTrigger.customerExperience'), value: 'customer' },
    { label: t('components:pilotTrigger.competitiveAdvantage'), value: 'competitive' },
    { label: t('components:pilotTrigger.regulatoryCompliance'), value: 'compliance' },
    { label: t('components:pilotTrigger.technicalDebtReduction'), value: 'debt' }
  ];

  // Compelling event options
  const compellingEventOptions = [
    { label: t('components:pilotTrigger.endOfSupport'), value: 'end_of_support' },
    { label: t('components:pilotTrigger.licenseRenewal'), value: 'license_renewal' },
    { label: t('components:pilotTrigger.securityVulnerability'), value: 'security' },
    { label: t('components:pilotTrigger.performanceIssues'), value: 'performance' },
    { label: t('components:pilotTrigger.scalabilityConstraints'), value: 'scalability' },
    { label: t('components:pilotTrigger.complianceRequirements'), value: 'compliance_req' },
    { label: t('components:pilotTrigger.budgetConstraints'), value: 'budget' },
    { label: t('components:pilotTrigger.strategicInitiative'), value: 'strategic' }
  ];

  // Team capability options
  const teamCapabilityOptions = [
    { label: t('components:pilotTrigger.cloudArchitecture'), value: 'cloud_architecture' },
    { label: t('components:pilotTrigger.containerization'), value: 'containerization' },
    { label: t('components:pilotTrigger.microservices'), value: 'microservices' },
    { label: t('components:pilotTrigger.devOpsCICD'), value: 'devops' },
    { label: t('components:pilotTrigger.databaseMigration'), value: 'database_migration' },
    { label: t('components:pilotTrigger.apiDevelopment'), value: 'api_development' },
    { label: t('components:pilotTrigger.securityImplementation'), value: 'security' },
    { label: t('components:pilotTrigger.performanceOptimization'), value: 'performance' }
  ];

  // Load selected project from localStorage
  useEffect(() => {
    const projectData = localStorage.getItem('selectedProject');
    if (projectData) {
      setSelectedProject(JSON.parse(projectData));
    }
  }, []);

  // Handle clearing results
  const handleClearResults = async () => {
    try {
      console.log('🗑️ Clearing pilot identification results...');
      
      setIsClearing(true);
      setError(null);
      setSuccess(null);
      
      await clearPilotIdentificationResults(selectedProject.projectId);
      
      // Clear local state
      setSuccess(t('components:pilotTrigger.resultsClearedSuccessfully'));
      setExecutionStatus(null);
      setAnalysisProgress(0);
      
      // Reset business drivers and compelling events selections
      setSelectedDrivers([]);
      setSelectedEvents([]);
      
      // Notify parent component
      if (onAnalysisComplete) {
        onAnalysisComplete(null);
      }
      
      console.log('✅ Pilot identification results cleared');
    } catch (err) {
      console.error('❌ Error clearing results:', err);
      setError(`Failed to clear results: ${err.message}`);
    } finally {
      setIsClearing(false);
    }
  };

  // Handle triggering the analysis
  const handleTriggerAnalysis = async () => {
    if (!selectedProject?.projectId) {
      setError('No project selected');
      return;
    }

    if (selectedDrivers.length === 0 && selectedEvents.length === 0) {
      setError('Please select at least one business driver or compelling event');
      return;
    }

    setIsTriggering(true);
    setError(null);
    setSuccess(null);
    setExecutionStatus(null);
    setAnalysisProgress(0);

    try {
      // Clear old results before starting new analysis
      console.log('🗑️ Clearing old pilot identification results before starting new analysis...');
      try {
        await clearPilotIdentificationResults(selectedProject.projectId);
        console.log('✅ Old results cleared successfully');
      } catch (clearError) {
        console.warn('⚠️ Error clearing old results (continuing anyway):', clearError.message);
        // Continue with analysis even if clear fails
      }

      console.log('🚀 Triggering pilot identification analysis for project:', selectedProject.projectId);
      console.log('🔍 selectedDrivers state:', selectedDrivers);
      console.log('🔍 selectedEvents state:', selectedEvents);
      
      const criteria = {
        drivers: selectedDrivers.map(d => d.value),
        events: selectedEvents.map(e => e.value),
        teamCapabilities: teamCapabilities.map(t => t.value),
        maxCandidates,
        similarityThreshold,
        riskTolerance,
        weights
      };

      console.log('📋 Analysis criteria:', criteria);
      console.log('🔍 Drivers array:', criteria.drivers);
      console.log('🔍 Drivers length:', criteria.drivers.length);
      console.log('🔍 Sample driver:', criteria.drivers[0]);

      const result = await triggerPilotIdentificationAnalysis(selectedProject.projectId, criteria);
      
      if (result.success) {
        setSuccess(t('components:pilotTrigger.analysisStartedSuccessfully'));
        setExecutionStatus('RUNNING');
        
        // Notify parent component with the criteria used
        if (onAnalysisStart) {
          onAnalysisStart(criteria);
        }
        
        // Start polling for Step Function execution status (same as similarities pages)
        if (result.executionArn) {
          pollExecution(result.executionArn);
        } else {
          setError('No execution ARN returned from analysis trigger');
        }
      } else {
        setError(result.error || t('components:pilotTrigger.failedToStartAnalysis'));
      }
    } catch (err) {
      console.error('❌ Error triggering analysis:', err);
      setError(t('components:pilotTrigger.failedToTriggerAnalysis', { error: err.message }));
    } finally {
      setIsTriggering(false);
    }
  };

  // Poll Step Function execution status (same pattern as similarities pages)
  const pollExecution = async (executionArn) => {
    let pollCount = 0;
    const maxPolls = 360; // Poll for up to 30 minutes (360 * 5 seconds)
    
    const pollInterval = setInterval(async () => {
      try {
        const statusResult = await getExecutionStatus(executionArn, selectedProject.projectId);
        
        if (statusResult.success) {
          const status = statusResult.status;
          
          // Calculate progress based on time elapsed (rough estimate)
          const progress = Math.min(95, (pollCount / maxPolls) * 100);
          
          setExecutionStatus(status);
          setAnalysisProgress(progress);
          
          if (status === 'SUCCEEDED') {
            clearInterval(pollInterval);
            setAnalysisProgress(100);
            setSuccess(t('components:pilotTrigger.analysisCompletedSuccessfully'));
            
            // Clear execution status since analysis is complete
            setExecutionStatus(null);
            setAnalysisProgress(0);
            
            // Notify parent component to fetch and display results
            if (onAnalysisComplete) {
              onAnalysisComplete(statusResult.output || { success: true });
            }
          } else if (status === 'FAILED' || status === 'TIMED_OUT' || status === 'ABORTED') {
            clearInterval(pollInterval);
            setError(t('components:pilotTrigger.analysisFailed', { status: status.toLowerCase(), error: statusResult.error || t('components:pilotTrigger.unknownError') }));
            setExecutionStatus(null);
            setAnalysisProgress(0);
          } else if (status === 'RUNNING') {
            // Continue polling
            pollCount++;
            if (pollCount >= maxPolls) {
              clearInterval(pollInterval);
              setError(t('components:pilotTrigger.analysisTimeout'));
              setExecutionStatus(null);
              setAnalysisProgress(0);
            }
          }
        } else {
          console.error('❌ Error getting execution status:', statusResult.error);
          pollCount++;
          if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            setError(t('components:pilotTrigger.failedToCheckStatus', { error: statusResult.error }));
            setExecutionStatus(null);
            setAnalysisProgress(0);
          }
        }
      } catch (error) {
        console.error('❌ Error in poll interval:', error);
        pollCount++;
        if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
          setError(t('components:pilotTrigger.failedToCheckStatus', { error: error.message }));
          setExecutionStatus(null);
          setAnalysisProgress(0);
        }
      }
    }, 5000); // Poll every 5 seconds
  };

  return (
    <Container>
      <SpaceBetween size="l">
        <Header
          variant="h2"
          description={t('components:pilotTrigger.headerDescription')}
        >
          {t('components:pilotTrigger.pilotIdentificationAnalysis')}
        </Header>

        {/* Read-only access alert */}
        {!permissionsLoading && !hasWriteAccess && (
          <Alert type="info" header="Read-only access">
            You have read-only access to this project. You cannot run new analyses or clear results.
          </Alert>
        )}

        {/* Status Messages */}
        {error && (
          <Alert type="error" header={t('components:pilotTrigger.analysisError')} dismissible onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert type="success" header={t('components:pilotTrigger.analysisStatus')} dismissible onDismiss={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        {/* Execution Status */}
        {executionStatus && executionStatus !== 'SUCCEEDED' && (
          <Box>
            <SpaceBetween size="s">
              <Box>
                <Box variant="awsui-key-label">{t('components:pilotTrigger.analysisStatus')}</Box>
                <StatusIndicator type={
                  executionStatus === 'FAILED' ? 'error' :
                  executionStatus === 'RUNNING' ? 'in-progress' : 'pending'
                }>
                  {executionStatus === 'RUNNING' ? t('components:pilotTrigger.analysisInProgress') :
                   executionStatus === 'FAILED' ? t('components:pilotTrigger.analysisFailed') : executionStatus}
                </StatusIndicator>
              </Box>
              
              {executionStatus === 'RUNNING' && (
                <ProgressBar
                  value={analysisProgress}
                  additionalInfo={t('components:pilotTrigger.processingAnalysis')}
                  description={t('components:pilotTrigger.analysisTimeDescription')}
                />
              )}
            </SpaceBetween>
          </Box>
        )}

        {/* Selection Criteria Form */}
        <SpaceBetween size="l">
          <ColumnLayout columns={2}>
            <FormField
              label={t('components:pilotTrigger.businessDrivers')}
              description={t('components:pilotTrigger.businessDriversDescription')}
            >
              <Multiselect
                selectedOptions={selectedDrivers}
                onChange={({ detail }) => setSelectedDrivers(detail.selectedOptions)}
                options={businessDriverOptions}
                placeholder={t('components:pilotTrigger.selectBusinessDrivers')}
                filteringType="auto"
              />
            </FormField>
            
            <FormField
              label={t('components:pilotTrigger.compellingEvents')}
              description={t('components:pilotTrigger.compellingEventsDescription')}
            >
              <Multiselect
                selectedOptions={selectedEvents}
                onChange={({ detail }) => setSelectedEvents(detail.selectedOptions)}
                options={compellingEventOptions}
                placeholder={t('components:pilotTrigger.selectCompellingEvents')}
                filteringType="auto"
              />
            </FormField>
          </ColumnLayout>

          <ExpandableSection
            headerText={t('components:pilotTrigger.advancedConfiguration')}
            defaultExpanded={false}
            description={t('components:pilotTrigger.advancedConfigDescription')}
          >
            <SpaceBetween size="l">
              <FormField
                label={t('components:pilotTrigger.teamCapabilities')}
                description={t('components:pilotTrigger.teamCapabilitiesDescription')}
              >
                <Multiselect
                  selectedOptions={teamCapabilities}
                  onChange={({ detail }) => setTeamCapabilities(detail.selectedOptions)}
                  options={teamCapabilityOptions}
                  placeholder={t('components:pilotTrigger.selectTeamCapabilities')}
                  filteringType="auto"
                />
              </FormField>
              
              <FormField
                label={t('components:pilotTrigger.maximumCandidates')}
                description={t('components:pilotTrigger.maximumCandidatesDescription', { maxCandidates })}
              >
                <Slider
                  value={maxCandidates}
                  onChange={({ detail }) => setMaxCandidates(detail.value)}
                  min={1}
                  max={10}
                  step={1}
                />
              </FormField>
              
              <FormField
                label={t('components:pilotTrigger.similarityThreshold')}
                description={t('components:pilotTrigger.similarityThresholdDescription', { similarityThreshold })}
              >
                <Slider
                  value={similarityThreshold}
                  onChange={({ detail }) => setSimilarityThreshold(detail.value)}
                  min={0}
                  max={100}
                  step={5}
                />
              </FormField>
              
              <FormField
                label={t('components:pilotTrigger.riskTolerance')}
                description={t('components:pilotTrigger.riskToleranceDescription', { riskTolerance })}
              >
                <Slider
                  value={riskTolerance}
                  onChange={({ detail }) => setRiskTolerance(detail.value)}
                  min={0}
                  max={100}
                  step={10}
                />
              </FormField>
              
              <FormField
                label={t('components:pilotTrigger.criteriaWeights')}
                description={t('components:pilotTrigger.criteriaWeightsDescription')}
              >
                <ColumnLayout columns={2}>
                  <FormField label={t('components:pilotTrigger.businessDriverWeight')}>
                    <Slider
                      value={weights.businessDriver}
                      onChange={({ detail }) => setWeights({...weights, businessDriver: detail.value})}
                      min={0}
                      max={100}
                      step={5}
                    />
                  </FormField>
                  <FormField label={t('components:pilotTrigger.compellingEventWeight')}>
                    <Slider
                      value={weights.compellingEvent}
                      onChange={({ detail }) => setWeights({...weights, compellingEvent: detail.value})}
                      min={0}
                      max={100}
                      step={5}
                    />
                  </FormField>
                  <FormField label={t('components:pilotTrigger.technicalFeasibilityWeight')}>
                    <Slider
                      value={weights.feasibility}
                      onChange={({ detail }) => setWeights({...weights, feasibility: detail.value})}
                      min={0}
                      max={100}
                      step={5}
                    />
                  </FormField>
                  <FormField label={t('components:pilotTrigger.businessImpactWeight')}>
                    <Slider
                      value={weights.impact}
                      onChange={({ detail }) => setWeights({...weights, impact: detail.value})}
                      min={0}
                      max={100}
                      step={5}
                    />
                  </FormField>
                </ColumnLayout>
              </FormField>
            </SpaceBetween>
          </ExpandableSection>

          {/* Action Buttons */}
          <Box textAlign="left">
            <SpaceBetween direction="horizontal" size="s">
              <Button 
                variant="primary"
                disabled={
                  (selectedDrivers.length === 0 && selectedEvents.length === 0) || 
                  isTriggering || 
                  isClearing || 
                  executionStatus === 'RUNNING' || 
                  analysisData ||
                  !hasWriteAccess
                }
                loading={isTriggering || executionStatus === 'RUNNING'}
                onClick={handleTriggerAnalysis}
              >
                {isTriggering ? t('components:pilotTrigger.startingAnalysis') : 
                 executionStatus === 'RUNNING' ? t('components:pilotTrigger.analysisInProgressButton') : 
                 analysisData ? t('components:pilotTrigger.clearResultsToRunNew') :
                 t('components:pilotTrigger.runPilotAnalysis')}
              </Button>
              
              {/* Clear Results button - only show if there's analysis data */}
              {analysisData && (
                <Button 
                  variant="normal"
                  disabled={
                    isTriggering || 
                    isClearing || 
                    executionStatus === 'RUNNING' ||
                    !hasWriteAccess
                  }
                  loading={isClearing}
                  onClick={handleClearResults}
                >
                  {isClearing ? t('components:pilotTrigger.clearingResults') : t('components:pilotTrigger.clearResults')}
                </Button>
              )}
            </SpaceBetween>
          </Box>
        </SpaceBetween>
      </SpaceBetween>
    </Container>
  );
};

export default PilotIdentificationTrigger;
