import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Header, Container, ContentLayout, SpaceBetween, Box, Button, Alert, StatusIndicator } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import Layout from '../../layouts/AppLayout';
import TeamAnalysisInfoContent from '../../components/info/TeamAnalysisInfoContent';
import TeamWeightsTable from '../../components/TeamWeightsTable';
import MissingDataAlert from '../../components/MissingDataAlert';
import useDataSourceCheck from '../../hooks/useDataSourceCheck';
import useProjectPermissions from '../../hooks/useProjectPermissions';
import { getExecutionStatus } from '../../services/stepFunctionService';

function TeamAnalysisPage() {
  const { t } = useTranslation(['pages', 'common']);
  // Check if required data sources exist
  const { hasData, loading: checkingData, missingDataSources } = useDataSourceCheck(['team-skills']);
  
  const [toolsOpen, setToolsOpen] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState(null); // 'running', 'success', 'failed', null
  const [analysisMessage, setAnalysisMessage] = useState('');
  const [currentExecutionArn, setCurrentExecutionArn] = useState(null);
  const pollingIntervalRef = useRef(null);
  
  // Get projectId from localStorage
  const selectedProject = JSON.parse(localStorage.getItem('selectedProject') || '{}');
  const projectId = selectedProject.projectId;
  
  // Check project permissions
  const { hasWriteAccess, loading: permissionsLoading } = useProjectPermissions(projectId);
  
  const toggleTools = () => {
    setToolsOpen(!toolsOpen);
  };

  const handleExport = () => {
    alert(t('pages:teamAnalysis.exportFunctionality'));
  };
  
  // Poll execution status
  const pollExecutionStatus = useCallback(async (executionArn) => {
    try {
      console.log('🔄 Polling skill importance execution status:', executionArn);
      const statusResponse = await getExecutionStatus(executionArn, projectId);
      
      if (statusResponse.success) {
        const status = statusResponse.status;
        console.log('📊 Execution status:', status);
        
        if (status === 'SUCCEEDED') {
          setAnalysisStatus('success');
          setAnalysisMessage('Skill importance analysis completed successfully');
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          // Auto-dismiss success message after 10 seconds
          setTimeout(() => {
            setAnalysisStatus(null);
            setCurrentExecutionArn(null);
          }, 10000);
        } else if (status === 'FAILED' || status === 'TIMED_OUT' || status === 'ABORTED') {
          setAnalysisStatus('failed');
          setAnalysisMessage(`Skill importance analysis failed: ${status}`);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        } else if (status === 'RUNNING') {
          setAnalysisStatus('running');
          setAnalysisMessage('Analyzing skill importance for teams...');
        }
      }
    } catch (error) {
      console.error('❌ Error polling execution status:', error);
      setAnalysisStatus('failed');
      setAnalysisMessage('Failed to check analysis status');
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
  }, [projectId]);
  
  // Handle skill importance analysis started
  const handleAnalysisStarted = useCallback((executionArn) => {
    console.log('🚀 Skill importance analysis started:', executionArn);
    setCurrentExecutionArn(executionArn);
    setAnalysisStatus('running');
    setAnalysisMessage('Starting skill importance analysis...');
    
    // Start polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    
    // Poll immediately, then every 5 seconds
    pollExecutionStatus(executionArn);
    pollingIntervalRef.current = setInterval(() => {
      pollExecutionStatus(executionArn);
    }, 5000);
  }, [pollExecutionStatus]);
  
  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);
  
  return (
    <Layout 
      activeHref="/insights/team-analysis"
      infoContent={<TeamAnalysisInfoContent />}
      toolsOpen={toolsOpen}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
    >
      <ContentLayout
        header={
          <Header
            variant="h1"
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button 
                  iconName="download"
                  onClick={handleExport}
                >
                  {t('common:export')}
                </Button>
                <button 
                  onClick={toggleTools}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0 10px'
                  }}
                  aria-label={toolsOpen ? t('pages:teamAnalysis.closeInformationPanel') : t('pages:teamAnalysis.openInformationPanel')}
                >
                  <span className="awsui-icon awsui-icon-size-normal awsui-icon-variant-normal">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" focusable="false">
                      {toolsOpen ? (
                        <path d="M9.414 8l4.293-4.293a1 1 0 00-1.414-1.414L8 6.586 3.707 2.293a1 1 0 00-1.414 1.414L6.586 8l-4.293 4.293a1 1 0 101.414 1.414L8 9.414l4.293 4.293a1 1 0 001.414-1.414L9.414 8z" />
                      ) : (
                        <path d="M8 1C4.14 1 1 4.14 1 8s3.14 7 7 7 7-3.14-7-7-3.14-7-7-7zm1 10.5H7v-5h2v5zm0-6.5H7V3h2v2z" />
                      )}
                    </svg>
                  </span>
                </button>
              </SpaceBetween>
            }
          >
            {t('pages:teamAnalysis.title')}
          </Header>
        }
      >
        <SpaceBetween size="l">
          {/* Show missing data alert if required data sources are not available */}
          {!checkingData && !hasData && (
            <MissingDataAlert missingDataSources={missingDataSources} />
          )}
          
          {/* Show analysis status */}
          {analysisStatus === 'running' && (
            <Alert
              type="info"
              statusIconAriaLabel="Info"
              header="Skill Importance Analysis"
            >
              <SpaceBetween size="xs">
                <StatusIndicator type="in-progress">
                  {analysisMessage}
                </StatusIndicator>
                <Box variant="small">
                  This may take a few minutes depending on the number of teams and skills.
                </Box>
              </SpaceBetween>
            </Alert>
          )}
          
          {analysisStatus === 'success' && (
            <Alert
              type="success"
              dismissible
              onDismiss={() => {
                setAnalysisStatus(null);
                setCurrentExecutionArn(null);
              }}
              header="Analysis Complete"
            >
              {analysisMessage}
            </Alert>
          )}
          
          {analysisStatus === 'failed' && (
            <Alert
              type="error"
              dismissible
              onDismiss={() => {
                setAnalysisStatus(null);
                setCurrentExecutionArn(null);
              }}
              header="Analysis Failed"
            >
              {analysisMessage}
            </Alert>
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
            
          <Container>
            <SpaceBetween size="l">
              <Box>
                <h2>{t('pages:teamAnalysis.weightingTitle')}</h2>
                <p>
                  {t('pages:teamAnalysis.description')}
                </p>
              </Box>
              
              <TeamWeightsTable 
                onAnalysisStarted={handleAnalysisStarted} 
                hasWriteAccess={hasWriteAccess}
              />
            </SpaceBetween>
          </Container>
          </div>
        </SpaceBetween>
      </ContentLayout>
    </Layout>
  );
}

export default TeamAnalysisPage;
