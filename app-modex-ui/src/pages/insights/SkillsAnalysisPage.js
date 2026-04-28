import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Container,
  ContentLayout,
  Header,
  SpaceBetween,
  Button,
  Tabs,
  Alert,
  Spinner
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { navigateToExportWithCategory } from '../../utils/exportNavigationUtils';

// Layouts
import Layout from '../../layouts/AppLayout';

// Components
import HeatmapChart from '../../components/charts/HeatmapChart';
import SkillGapDetails from '../../components/SkillGapDetails';
import VisionGapsTable from '../../components/VisionGapsTable';
import SkillsAnalysisInfoContent from '../../components/info/SkillsAnalysisInfoContent';
import MissingDataAlert from '../../components/MissingDataAlert';

// Hooks
import useDataSourceCheck from '../../hooks/useDataSourceCheck';

// API services
import { 
  getSkillGapData, 
  getTeamSkillDetailsData,
  getAllTeamsSkillDetailsData,
  getVisionSkillGapData,
  getTeamVisionSkillDetailsData,
  getAllTeamsVisionSkillDetailsData,
  getVisionGapsData
} from '../../services/athenaQueryService';

/**
 * Skills Analysis Page Component
 * 
 * This page displays a heatmap visualization comparing actual team skills against required skills,
 * along with detailed information about skill gaps.
 */
const SkillsAnalysisPage = () => {
  const { t } = useTranslation(['pages', 'common']);
  console.log('SkillsAnalysisPage: Component rendering');
  
  const navigate = useNavigate();
  
  // Check if required data sources exist
  const { hasData, loading: checkingData, missingDataSources } = useDataSourceCheck(['team-skills', 'technology-vision']);
  
  const [toolsOpen, setToolsOpen] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;
  
  // Team Skills state
  const [skillGapData, setSkillGapData] = useState(null);
  // Helper function to get project ID
  const getProjectId = () => {
    try {
      const projectData = localStorage.getItem('selectedProject');
      if (projectData) {
        const project = JSON.parse(projectData);
        return project.projectId;
      }
    } catch (err) {
      console.error('Error loading project data:', err);
    }
    return 'default';
  };

  const projectId = getProjectId();

  const [selectedTeam, setSelectedTeam] = useState(() => {
    const saved = localStorage.getItem(`skillsFilters_${projectId}_selectedTeam`);
    return saved ? saved : null;
  });
  const [teamDetails, setTeamDetails] = useState(null);
  const [allTeamsDetails, setAllTeamsDetails] = useState(null);
  const [selectedTeams, setSelectedTeams] = useState(() => {
    const saved = localStorage.getItem(`skillsFilters_${projectId}_selectedTeams`);
    return saved ? JSON.parse(saved) : [];
  });
  const [loading, setLoading] = useState({
    heatmap: true,
    details: false,
    allDetails: true
  });
  
  const [activeTabId, setActiveTabId] = useState("teamSkills");
  const [visionSkillGapData, setVisionSkillGapData] = useState(null);
  const [selectedVisionTeam, setSelectedVisionTeam] = useState(() => {
    const saved = localStorage.getItem(`skillsFilters_${projectId}_selectedVisionTeam`);
    return saved ? saved : null;
  });
  const [visionTeamDetails, setVisionTeamDetails] = useState(null);
  const [allVisionTeamsDetails, setAllVisionTeamsDetails] = useState(null);
  const [selectedVisionTeams, setSelectedVisionTeams] = useState(() => {
    const saved = localStorage.getItem(`skillsFilters_${projectId}_selectedVisionTeams`);
    return saved ? JSON.parse(saved) : [];
  });
  const [visionLoading, setVisionLoading] = useState({
    heatmap: true,
    details: false,
    allDetails: true
  });
  
  // Vision Gaps state
  const [visionGapsData, setVisionGapsData] = useState(null);
  const [visionGapsLoading, setVisionGapsLoading] = useState(true);
  const [visionGapsError, setVisionGapsError] = useState(null);
  
  const [chartDimensions, setChartDimensions] = useState({
    width: 1200,
    height: 550
  });
  
  // Reference to the container element
  const containerRef = useRef(null);

  // Update chart dimensions based on container size
  useEffect(() => {
    console.log('SkillsAnalysisPage: containerRef effect running');
    if (!containerRef.current) return;
    
    // Store the current ref value to avoid stale closure issues
    const currentContainer = containerRef.current;
    
    const updateDimensions = () => {
      if (currentContainer) {
        const width = currentContainer.clientWidth - 40; // Subtract padding
        setChartDimensions({
          width: Math.max(width, 800), // Ensure minimum width
          height: 550
        });
      }
    };
    
    // Initial update only - disable ResizeObserver temporarily
    updateDimensions();
    
    // TODO: Re-enable ResizeObserver with proper error handling later
    // For now, charts will have fixed dimensions but page will work
    
  }, []); // Remove containerRef from dependencies to fix ESLint warning

  // Transform matrix data to heatmap format
  const transformMatrixToHeatmapData = useCallback((matrixData) => {
    console.log('SkillsAnalysisPage: transformMatrixToHeatmapData called', matrixData);
    if (!matrixData || !matrixData.rows || !matrixData.columns || !matrixData.values) {
      console.log('SkillsAnalysisPage: Invalid matrix data', matrixData);
      return [];
    }

    const heatmapData = [];
    matrixData.rows.forEach((row, rowIndex) => {
      matrixData.columns.forEach((column, columnIndex) => {
        const value = matrixData.values[rowIndex] ? matrixData.values[rowIndex][columnIndex] : 0;
        heatmapData.push({
          x: column,
          y: row,
          value: value,
          row: row,
          column: column,
          description: `${row} - ${column}: ${value}`
        });
      });
    });
    
    console.log('SkillsAnalysisPage: Transformed heatmap data', heatmapData.length);
    return heatmapData;
  }, []);

  // Fetch skill gap data on component mount
  useEffect(() => {
    // Don't fetch if data sources are not available
    if (!hasData) {
      console.log('SkillsAnalysisPage: Skipping data fetch - required data sources not available');
      return;
    }
    
    console.log('SkillsAnalysisPage: Data fetching effect running');
    const fetchSkillGapData = async () => {
      try {
        console.log(`🔄 Fetching skill gap data from Athena... (Attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
        setLoading(prev => ({ ...prev, heatmap: true }));
        setError(null);
        
        const rawData = await getSkillGapData();
        console.log('SkillsAnalysisPage: Received skill gap data', rawData);
        const transformedData = transformMatrixToHeatmapData(rawData);
        console.log('SkillsAnalysisPage: Transformed skill gap data', transformedData.length);
        setSkillGapData(transformedData);
      } catch (error) {
        console.error('❌ Error fetching skill gap data:', error);
        
        // Check if error is due to missing view/table (no data uploaded yet)
        if (error.message && (
          error.message.includes('does not exist') || 
          error.message.includes('FAILED') ||
          error.message.includes('Table not found') ||
          error.message.includes('View not found') ||
          /No .* data available/.test(error.message)
        )) {
          // Don't show error for missing data - just show empty state
          console.log('No skills data uploaded yet for gap analysis');
          setError(null);
          setSkillGapData([]);
        } else if (retryCount < MAX_RETRIES) {
          // If we haven't reached max retries, increment retry count
          console.log(`🔄 Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
          setRetryCount(retryCount + 1);
        } else {
          setError(`Failed to fetch skill gap data after ${MAX_RETRIES + 1} attempts: ${error.message}`);
        }
      } finally {
        setLoading(prev => ({ ...prev, heatmap: false }));
      }
    };
    
    const fetchVisionSkillGapData = async () => {
      try {
        console.log(`🔄 Fetching vision skill gap data from Athena... (Attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
        setVisionLoading(prev => ({ ...prev, heatmap: true }));
        
        const rawData = await getVisionSkillGapData();
        console.log('SkillsAnalysisPage: Received vision skill gap data', rawData);
        const transformedData = transformMatrixToHeatmapData(rawData);
        console.log('SkillsAnalysisPage: Transformed vision skill gap data', transformedData.length);
        setVisionSkillGapData(transformedData);
      } catch (error) {
        console.error('❌ Error fetching vision skill gap data:', error);
        
        // Check if error is due to missing view/table (no data uploaded yet)
        if (error.message && (
          error.message.includes('does not exist') || 
          error.message.includes('FAILED') ||
          error.message.includes('Table not found') ||
          error.message.includes('View not found') ||
          /No .* data available/.test(error.message)
        )) {
          // Don't show error for missing data - just show empty state
          console.log('No vision data uploaded yet for gap analysis');
          setVisionSkillGapData([]);
        }
        // Vision data errors are not critical, so we don't set the error state
      } finally {
        setVisionLoading(prev => ({ ...prev, heatmap: false }));
      }
    };
    
    const fetchAllTeamsDetails = async () => {
      try {
        console.log(`🔄 Fetching all teams details from Athena... (Attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
        setLoading(prev => ({ ...prev, allDetails: true }));
        
        const data = await getAllTeamsSkillDetailsData();
        console.log('SkillsAnalysisPage: Received all teams details', data.length);
        setAllTeamsDetails(data);
      } catch (error) {
        console.error('❌ Error fetching all teams details:', error);
        // All teams details errors are not critical, so we don't set the error state
      } finally {
        setLoading(prev => ({ ...prev, allDetails: false }));
      }
    };
    
    const fetchAllVisionTeamsDetails = async () => {
      try {
        console.log(`🔄 Fetching all vision teams details from Athena... (Attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
        setVisionLoading(prev => ({ ...prev, allDetails: true }));
        
        const data = await getAllTeamsVisionSkillDetailsData();
        console.log('SkillsAnalysisPage: Received all vision teams details', data.length);
        setAllVisionTeamsDetails(data);
      } catch (error) {
        console.error('❌ Error fetching all vision teams details:', error);
        // All vision teams details errors are not critical, so we don't set the error state
      } finally {
        setVisionLoading(prev => ({ ...prev, allDetails: false }));
      }
    };

    // Load vision gaps data
    const fetchVisionGapsData = async () => {
      try {
        console.log(`🔄 Fetching vision gaps data from Athena... (Attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
        setVisionGapsLoading(true);
        setVisionGapsError(null);
        
        const data = await getVisionGapsData();
        console.log('SkillsAnalysisPage: Received vision gaps data', data.length);
        setVisionGapsData(data);
      } catch (error) {
        console.error('❌ Error fetching vision gaps data:', error);
        setVisionGapsError(error.message);
      } finally {
        setVisionGapsLoading(false);
      }
    };

    fetchSkillGapData();
    fetchVisionSkillGapData();
    fetchAllTeamsDetails();
    fetchAllVisionTeamsDetails();
    fetchVisionGapsData();
  }, [transformMatrixToHeatmapData, retryCount, hasData]);

  // Save team filters to localStorage (project-specific)
  useEffect(() => {
    if (selectedTeam) {
      localStorage.setItem(`skillsFilters_${projectId}_selectedTeam`, selectedTeam);
    } else {
      localStorage.removeItem(`skillsFilters_${projectId}_selectedTeam`);
    }
  }, [selectedTeam, projectId]);

  useEffect(() => {
    if (selectedTeams.length > 0) {
      localStorage.setItem(`skillsFilters_${projectId}_selectedTeams`, JSON.stringify(selectedTeams));
    } else {
      localStorage.removeItem(`skillsFilters_${projectId}_selectedTeams`);
    }
  }, [selectedTeams, projectId]);

  useEffect(() => {
    if (selectedVisionTeam) {
      localStorage.setItem(`skillsFilters_${projectId}_selectedVisionTeam`, selectedVisionTeam);
    } else {
      localStorage.removeItem(`skillsFilters_${projectId}_selectedVisionTeam`);
    }
  }, [selectedVisionTeam, projectId]);

  useEffect(() => {
    if (selectedVisionTeams.length > 0) {
      localStorage.setItem(`skillsFilters_${projectId}_selectedVisionTeams`, JSON.stringify(selectedVisionTeams));
    } else {
      localStorage.removeItem(`skillsFilters_${projectId}_selectedVisionTeams`);
    }
  }, [selectedVisionTeams, projectId]);

  // Fetch team details when selected team changes
  useEffect(() => {
    if (!selectedTeam) return;

    const fetchTeamDetails = async () => {
      try {
        console.log('SkillsAnalysisPage: Fetching team details for', selectedTeam);
        setLoading(prev => ({ ...prev, details: true }));
        const details = await getTeamSkillDetailsData(selectedTeam);
        console.log('SkillsAnalysisPage: Received team details', details);
        setTeamDetails(details);
      } catch (error) {
        console.error(`❌ Error fetching details for team ${selectedTeam}:`, error);
      } finally {
        setLoading(prev => ({ ...prev, details: false }));
      }
    };

    fetchTeamDetails();
  }, [selectedTeam]);
  
  // Fetch vision team details when selected vision team changes
  useEffect(() => {
    if (!selectedVisionTeam) return;

    const fetchVisionTeamDetails = async () => {
      try {
        console.log('SkillsAnalysisPage: Fetching vision team details for', selectedVisionTeam);
        setVisionLoading(prev => ({ ...prev, details: true }));
        const details = await getTeamVisionSkillDetailsData(selectedVisionTeam);
        console.log('SkillsAnalysisPage: Received vision team details', details);
        setVisionTeamDetails(details);
      } catch (error) {
        console.error(`❌ Error fetching details for vision team ${selectedVisionTeam}:`, error);
      } finally {
        setVisionLoading(prev => ({ ...prev, details: false }));
      }
    };

    fetchVisionTeamDetails();
  }, [selectedVisionTeam]);

  // Handle cell click in team skills heatmap
  const handleCellClick = useCallback((cell) => {
    console.log('SkillsAnalysisPage: Cell clicked', cell);
    const teamValue = cell.y; // y represents the team (row)
    setSelectedTeam(teamValue);
    
    // Update selected teams for the dropdown
    const teamOption = { label: teamValue, value: teamValue };
    setSelectedTeams([teamOption]);
  }, []);
  
  // Handle cell click in vision skills heatmap
  const handleVisionCellClick = useCallback((cell) => {
    console.log('SkillsAnalysisPage: Vision cell clicked', cell);
    const teamValue = cell.y; // y represents the team (row)
    setSelectedVisionTeam(teamValue);
    
    // Update selected teams for the dropdown
    const teamOption = { label: teamValue, value: teamValue };
    setSelectedVisionTeams([teamOption]);
  }, []);

  return (
    <Layout
      activeHref="/insights/skills"
      infoContent={
        <Box padding="l">
          <SkillsAnalysisInfoContent />
        </Box>
      }
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
                  onClick={() => navigateToExportWithCategory('skills-analysis', navigate)}
                >
                  {t('common:buttons.export')}
                </Button>
                <Button
                  iconName="refresh"
                  loading={loading.heatmap}
                  onClick={() => {
                    setError(null);
                    setRetryCount(retryCount + 1);
                  }}
                >
                  {t('common:buttons.refresh')}
                </Button>
              </SpaceBetween>
            }
          >
            {t('pages:skillsAnalysis.title')}
          </Header>
        }
      >
          <SpaceBetween size="l">
            {/* Show missing data alert if required data sources are not available */}
            {!checkingData && !hasData && (
              <MissingDataAlert missingDataSources={missingDataSources} />
            )}
            
            {error && (
              <Alert
                type="error"
                header={t('pages:skillsAnalysis.errorFetchingSkillsData')}
                dismissible
                onDismiss={() => setError(null)}
                action={
                  <Button 
                    onClick={() => {
                      setError(null);
                      setRetryCount(retryCount + 1);
                    }}
                  >
                    {t('common:buttons.retry')}
                  </Button>
                }
              >
                {error}
                <Box variant="p" padding={{ top: 's' }}>
                  {t('common:messages.networkError')}
                </Box>
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
              
            <Tabs
              activeTabId={activeTabId}
              onChange={({ detail }) => setActiveTabId(detail.activeTabId)}
              tabs={[
                {
                  label: t('pages:skillsAnalysis.teamVsSkills'),
                  id: "teamSkills",
                  content: (
                    <SpaceBetween size="l">
                      {/* Heatmap Section */}
                      <Container>
                        <SpaceBetween size="l">
                          <Header variant="h2">
                            {t('pages:skillsAnalysis.teamSkillsGapVisualization')}
                          </Header>

                          <Box padding="l" ref={containerRef} style={{ minHeight: '600px' }}>
                            {loading.heatmap ? (
                              <Box textAlign="center" padding="xl">
                                <SpaceBetween size="m" alignItems="center">
                                  <Spinner size="large" />
                                  <Box variant="p">{t('pages:skillsAnalysis.loadingTeamSkillsHeatmap')}</Box>
                                </SpaceBetween>
                              </Box>
                            ) : skillGapData && skillGapData.length > 0 ? (
                              <HeatmapChart
                                data={skillGapData}
                                width={chartDimensions.width}
                                height={chartDimensions.height}
                                onCellClick={handleCellClick}
                                title={t('pages:skillsAnalysis.teamSkillsGapAnalysis')}
                                xLabel={t('pages:skillsAnalysis.skills')}
                                yLabel={t('pages:skillsAnalysis.teams')}
                                colorScale={['#f7fbff', '#08519c']}
                              />
                            ) : (
                              <Box textAlign="center" padding="xl">
                                <div>{t('pages:skillsAnalysis.noDataAvailableForHeatmap')}</div>
                                <div>{t('components:skillsAnalysisPage.dataLength')} {skillGapData ? skillGapData.length : 'null'}</div>
                                <div>{t('components:skillsAnalysisPage.dataPreview')} {JSON.stringify(skillGapData?.slice(0, 2), null, 2)}</div>
                              </Box>
                            )}
                          </Box>
                        </SpaceBetween>
                      </Container>

                      {/* Details Section */}
                      <Container>
                        <SpaceBetween size="l">
                          <Header variant="h2">
                            {t('pages:skillsAnalysis.teamSkillsDetails')}
                          </Header>

                          <SkillGapDetails
                            loading={loading.details}
                            teamName={selectedTeam}
                            details={teamDetails}
                            allTeamsDetails={allTeamsDetails}
                            selectedTeams={selectedTeams}
                            setSelectedTeams={setSelectedTeams}
                            setSelectedTeam={setSelectedTeam}
                          />
                        </SpaceBetween>
                      </Container>
                    </SpaceBetween>
                  )
                },
                {
                  label: t('pages:skillsAnalysis.teamVsVision'),
                  id: "teamVision",
                  content: (
                    <SpaceBetween size="l">
                      {/* Heatmap Section */}
                      <Container>
                        <SpaceBetween size="l">
                          <Header variant="h2">
                            {t('pages:skillsAnalysis.teamVisionGapVisualization')}
                          </Header>

                          <Box padding="l" ref={containerRef} style={{ minHeight: '600px' }}>
                            {visionLoading.heatmap ? (
                              <Box textAlign="center" padding="xl">
                                <SpaceBetween size="m" alignItems="center">
                                  <Spinner size="large" />
                                  <Box variant="p">{t('pages:skillsAnalysis.loadingTeamVisionHeatmap')}</Box>
                                </SpaceBetween>
                              </Box>
                            ) : visionSkillGapData && visionSkillGapData.length > 0 ? (
                              <HeatmapChart
                                data={visionSkillGapData}
                                width={chartDimensions.width}
                                height={chartDimensions.height}
                                onCellClick={handleVisionCellClick}
                                title={t('pages:skillsAnalysis.teamVisionGapAnalysis')}
                                xLabel={t('pages:skillsAnalysis.visionSkills')}
                                yLabel={t('pages:skillsAnalysis.teams')}
                                colorScale={['#fff5f0', '#a50f15']}
                              />
                            ) : (
                              <Box textAlign="center" padding="xl">
                                <div>{t('pages:skillsAnalysis.noDataAvailableForVisionHeatmap')}</div>
                                <div>{t('components:skillsAnalysisPage.dataLength')} {visionSkillGapData ? visionSkillGapData.length : 'null'}</div>
                                <div>{t('components:skillsAnalysisPage.dataPreview')} {JSON.stringify(visionSkillGapData?.slice(0, 2), null, 2)}</div>
                              </Box>
                            )}
                          </Box>
                        </SpaceBetween>
                      </Container>

                      {/* Details Section */}
                      <Container>
                        <SpaceBetween size="l">
                          <Header variant="h2">
                            {t('pages:skillsAnalysis.teamVisionDetails')}
                          </Header>

                          <SkillGapDetails
                            loading={visionLoading.details}
                            teamName={selectedVisionTeam}
                            details={visionTeamDetails}
                            allTeamsDetails={allVisionTeamsDetails}
                            selectedTeams={selectedVisionTeams}
                            setSelectedTeams={setSelectedVisionTeams}
                            setSelectedTeam={setSelectedVisionTeam}
                            isVision={true}
                          />
                        </SpaceBetween>
                      </Container>

                      {/* Vision Gaps Section */}
                      <Container>
                        <SpaceBetween size="l">
                          <Header 
                            variant="h2"
                            description={t('pages:skillsAnalysis.visionGapsDescription')}
                          >
                            {t('pages:skillsAnalysis.visionGaps')}
                          </Header>

                          {visionGapsLoading ? (
                            <Box textAlign="center" padding="xl">
                              <SpaceBetween size="m" alignItems="center">
                                <Spinner size="large" />
                                <Box variant="p">{t('pages:skillsAnalysis.loadingVisionGaps')}</Box>
                              </SpaceBetween>
                            </Box>
                          ) : (
                            <VisionGapsTable
                              loading={visionGapsLoading}
                              visionGapsData={visionGapsData}
                              error={visionGapsError}
                            />
                          )}
                        </SpaceBetween>
                      </Container>
                    </SpaceBetween>
                  )
                }
              ]}
            />
            </div>
          </SpaceBetween>
        </ContentLayout>
    </Layout>
  );
};

export default SkillsAnalysisPage;
