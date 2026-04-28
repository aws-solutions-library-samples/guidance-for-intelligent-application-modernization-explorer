import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Header,
  Box,
  SpaceBetween,
  Cards,
  Button,
  Link,
  Textarea,
  FormField,
  Alert
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import Layout from '../layouts/AppLayout';
import ProjectHomeInfoContent from '../components/info/ProjectHomeInfoContent';
import { isProjectReady, getProjectStatusMessage } from '../utils/projectUtils';
import useProjectPermissions from '../hooks/useProjectPermissions';

const ProjectHomePage = () => {
  const { t } = useTranslation(['pages', 'common']);
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  
  // Notes editing state
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  
  // Get project permissions
  const projectId = project?.projectId;
  const { hasWriteAccess, loading: permissionsLoading } = useProjectPermissions(projectId);

  useEffect(() => {
    // Get selected project from localStorage
    const selectedProject = localStorage.getItem('selectedProject');
    
    if (!selectedProject) {
      // If no project is selected, redirect to projects list
      navigate('/projects');
      return;
    }
    
    const projectData = JSON.parse(selectedProject);
    
    // Check if project is ready (active)
    if (!isProjectReady(projectData)) {
      const statusMessage = getProjectStatusMessage(projectData);
      
      // Redirect to projects list with status message
      navigate('/projects', { 
        state: { 
          message: t('pages:projectHome.projectNotReady', { projectName: projectData.name, statusMessage: statusMessage.message }),
          severity: statusMessage.severity,
          projectId: projectData.projectId
        } 
      });
      return;
    }
    
    setProject(projectData);
    setNotesValue(projectData.notes || '');
    
    // Fetch latest project data from API
    const fetchLatestProjectData = async () => {
      try {
        const { getProject } = await import('../services/projectsApi');
        const latestProjectData = await getProject(projectData.projectId);
        
        // Check if the latest project data shows the project is no longer active
        if (!isProjectReady(latestProjectData)) {
          const statusMessage = getProjectStatusMessage(latestProjectData);
          
          // Redirect to projects list with status message
          navigate('/projects', { 
            state: { 
              message: t('pages:projectHome.projectNotReady', { projectName: latestProjectData.name, statusMessage: statusMessage.message }),
              severity: statusMessage.severity,
              projectId: latestProjectData.projectId
            } 
          });
          return;
        }
        
        // Update state with latest data
        setProject(latestProjectData);
        setNotesValue(latestProjectData.notes || '');
        
        // Update localStorage
        localStorage.setItem('selectedProject', JSON.stringify(latestProjectData));
      } catch (error) {
        console.error('Error fetching latest project data:', error);
        // Continue with localStorage data if API call fails
      }
    };
    
    fetchLatestProjectData();
  }, [navigate]);

  // Handle notes editing
  const handleEditNotes = () => {
    setIsEditingNotes(true);
    setSaveMessage('');
  };

  const handleCancelEdit = () => {
    setIsEditingNotes(false);
    setNotesValue(project.notes || '');
    setSaveMessage('');
  };

  const handleSaveNotes = async () => {
    try {
      setSaveLoading(true);
      setSaveMessage('');

      // Import the updateProject function from the real API
      const { updateProject } = await import('../services/projectsApi');
      
      // Update the project with new notes
      const updatedProject = await updateProject(project.projectId, {
        name: project.name,
        notes: notesValue
      });

      // Update local state and localStorage
      setProject(updatedProject);
      localStorage.setItem('selectedProject', JSON.stringify(updatedProject));
      
      setIsEditingNotes(false);
      setSaveMessage(t('pages:projectHome.notesSavedSuccessfully'));
      
      // Clear success message after 3 seconds
      setTimeout(() => setSaveMessage(''), 3000);
      
    } catch (error) {
      console.error('Error saving notes:', error);
      setSaveMessage(t('pages:projectHome.failedToSaveNotes'));
    } finally {
      setSaveLoading(false);
    }
  };

  if (!project) {
    return null; // Will redirect to projects list
  }

  // Define the sections for the cards - matching sidebar navigation structure
  const sections = [
    {
      title: t('pages:projectHome.data'),
      description: t('pages:projectHome.dataDescription'),
      items: [
        { title: t('pages:projectHome.teamSkills'), description: t('pages:projectHome.teamSkillsDesc'), href: '/data/skills' },
        { title: t('pages:projectHome.technologyVision'), description: t('pages:projectHome.technologyVisionDesc'), href: '/data/vision' },
        { title: t('pages:projectHome.portfolio'), description: t('pages:projectHome.portfolioDesc'), href: '/data/applications/portfolio' },
        { title: t('pages:projectHome.techStack'), description: t('pages:projectHome.techStackDesc'), href: '/data/applications/tech-stack' },
        { title: t('pages:projectHome.infrastructure'), description: t('pages:projectHome.infrastructureDesc'), href: '/data/applications/infrastructure' },
        { title: t('pages:projectHome.utilization'), description: t('pages:projectHome.utilizationDesc'), href: '/data/applications/utilization' }
      ]
    },
    {
      title: t('pages:projectHome.insights'),
      description: t('pages:projectHome.insightsDescription'),
      items: [
        { title: t('pages:projectHome.teamAnalysis'), description: t('pages:projectHome.teamAnalysisDesc'), href: '/insights/team-analysis' },
        { title: t('pages:projectHome.skillsAnalysis'), description: t('pages:projectHome.skillsAnalysisDesc'), href: '/insights/skills' },
        { title: t('pages:projectHome.visionAnalysis'), description: t('pages:projectHome.visionAnalysisDesc'), href: '/insights/vision' },
        { title: t('pages:projectHome.techStackAnalysis'), description: t('pages:projectHome.techStackAnalysisDesc'), href: '/insights/tech-stack' },
        { title: t('pages:projectHome.infrastructureAnalysis'), description: t('pages:projectHome.infrastructureAnalysisDesc'), href: '/insights/infrastructure' },
        { title: t('pages:projectHome.utilizationAnalysis'), description: t('pages:projectHome.utilizationAnalysisDesc'), href: '/insights/utilization' },
        { title: t('pages:projectHome.dataDivergencies'), description: t('pages:projectHome.dataDivergenciesDesc'), href: '/insights/data-divergencies' }
      ]
    },
    {
      title: t('pages:projectHome.techStackSimilarities'),
      description: t('pages:projectHome.techStackSimilaritiesDescription'),
      items: [
        { title: t('pages:projectHome.applicationSimilarities'), description: t('pages:projectHome.applicationSimilaritiesDesc'), href: '/similarities/applications' },
        { title: t('pages:projectHome.componentSimilarities'), description: t('pages:projectHome.componentSimilaritiesDesc'), href: '/similarities/components' }
      ]
    },
    {
      title: t('pages:projectHome.planning'),
      description: t('pages:projectHome.planningDescription'),
      items: [
        { title: t('pages:projectHome.pilotIdentification'), description: t('pages:projectHome.pilotIdentificationDesc'), href: '/planning/pilot-identification' },
        { title: t('pages:projectHome.applicationBuckets'), description: t('pages:projectHome.applicationBucketsDesc'), href: '/planning/application-grouping' },
        { title: t('pages:projectHome.tcoEstimates'), description: t('pages:projectHome.tcoEstimatesDesc'), href: '/planning/tco-estimates' },
        { title: t('pages:projectHome.teamEstimates'), description: t('pages:projectHome.teamEstimatesDesc'), href: '/planning/team-estimates' }
      ]
    }
  ];

  return (
    <Layout
      activeHref="/home"
      infoContent={<ProjectHomeInfoContent />}
      toolsOpen={toolsOpen}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
    >
      <Container>
        <SpaceBetween size="l">
          {/* <Header
            variant="h1"
            description={`Created by ${project.createdBy} on ${new Date(project.createdDate).toLocaleDateString()}`}
            actions={
              <Button onClick={() => navigate('/projects')}>
                Back to Projects
              </Button>
            }
          >
            {project.name}
          </Header> */}

          <Box>
            <Header variant="h2">{t('pages:projectHome.projectOverview')}</Header>
            <p>
              {t('pages:projectHome.projectOverviewDescription')}
            </p>
            
            {/* Editable Project Notes Section */}
            <Box variant="awsui-key-label" padding={{ top: 'm' }}>
              <SpaceBetween size="s">
                <Header
                  variant="h3"
                  actions={
                    !isEditingNotes && (
                      <Button
                        variant="normal"
                        iconName="edit"
                        onClick={handleEditNotes}
                        disabled={!hasWriteAccess || permissionsLoading}
                        ariaLabel={
                          !hasWriteAccess 
                            ? t('pages:projectHome.noPermissionToEditNotes')
                            : project.notes ? t('pages:projectHome.editNotes') : t('pages:projectHome.addNotes')
                        }
                      >
                        {project.notes ? t('pages:projectHome.editNotes') : t('pages:projectHome.addNotes')}
                      </Button>
                    )
                  }
                >
                  {t('pages:projectHome.projectNotes')}
                </Header>
                
                {!hasWriteAccess && !permissionsLoading && !isEditingNotes && (
                  <Alert type="info">
                    {t('pages:projectHome.readOnlyNotesMessage')}
                  </Alert>
                )}
                
                {saveMessage && (
                  <Alert
                    type={saveMessage.includes('Failed') ? 'error' : 'success'}
                    dismissible
                    onDismiss={() => setSaveMessage('')}
                  >
                    {saveMessage}
                  </Alert>
                )}
                
                {isEditingNotes ? (
                  <SpaceBetween size="s">
                    <FormField>
                      <Textarea
                        value={notesValue}
                        onChange={({ detail }) => setNotesValue(detail.value)}
                        placeholder={t('pages:projectHome.addNotesPlaceholder')}
                        rows={4}
                        disabled={!hasWriteAccess}
                      />
                    </FormField>
                    <SpaceBetween direction="horizontal" size="xs">
                      <Button
                        variant="primary"
                        onClick={handleSaveNotes}
                        loading={saveLoading}
                        disabled={saveLoading || !hasWriteAccess}
                      >
                        {t('pages:projectHome.saveNotes')}
                      </Button>
                      <Button
                        variant="normal"
                        onClick={handleCancelEdit}
                        disabled={saveLoading}
                      >
                        {t('common:buttons.cancel')}
                      </Button>
                    </SpaceBetween>
                  </SpaceBetween>
                ) : (
                  <Box>
                    {project.notes ? (
                      <p style={{ whiteSpace: 'pre-wrap' }}>{project.notes}</p>
                    ) : (
                      <Box color="text-body-secondary">
                        <em>{t('pages:projectHome.noNotesYet')}</em>
                      </Box>
                    )}
                  </Box>
                )}
              </SpaceBetween>
            </Box>
          </Box>

          {sections.map((section, index) => (
            <Box key={index}>
              <Header variant="h2">{section.title}</Header>
              <p>{section.description}</p>
              <Cards
                items={section.items}
                cardDefinition={{
                  header: item => (
                    <Link href={item.href} onFollow={e => {
                      e.preventDefault();
                      navigate(item.href);
                    }}>
                      {item.title}
                    </Link>
                  ),
                  sections: [
                    {
                      content: item => item.description
                    }
                  ]
                }}
                cardsPerRow={[
                  { cards: 1 },
                  { minWidth: 500, cards: 2 }
                ]}
              />
            </Box>
          ))}
        </SpaceBetween>
      </Container>
    </Layout>
  );
};

export default ProjectHomePage;
