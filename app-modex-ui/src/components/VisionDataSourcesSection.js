import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Container,
  Header,
  SpaceBetween,
  Alert
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import VisionDataSourcesTable from './VisionDataSourcesTable';
import FileUploadModal from './FileUploadModal';
import { useSimpleAuth } from '../contexts/SimpleAuthContext';
import useProjectPermissions from '../hooks/useProjectPermissions';
import { isProjectReady, getProjectStatusMessage } from '../utils/projectUtils';

function VisionDataSourcesSection({ onDataProcessingComplete, onDataChanged }) {
  const { t } = useTranslation(['components', 'common']);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { user } = useSimpleAuth();
  
  // Define the data source type for this section
  const dataSourceType = 'technology-vision';
  
  // Load selected project from localStorage
  useEffect(() => {
    const projectData = localStorage.getItem('selectedProject');
    if (projectData) {
      try {
        const project = JSON.parse(projectData);
        setSelectedProject(project);
        
        // Debug logging
        console.log('Selected Project:', project);
        console.log('Current User:', user);
      } catch (error) {
        console.error('Error parsing project data:', error);
      }
    }
  }, [user]);
  
  // Get project ID
  const projectId = selectedProject?.projectId || selectedProject?.id;
  
  // Check if project is ready
  const projectReady = isProjectReady(selectedProject);
  const statusMessage = getProjectStatusMessage(selectedProject);
  
  // Use the project permissions hook
  const { hasWriteAccess, loading } = useProjectPermissions(projectId);
  
  // Debug logging for permissions
  useEffect(() => {
    console.log('Project Permissions:', { projectId, hasWriteAccess, loading });
  }, [projectId, hasWriteAccess, loading]);

  const handleUpload = () => {
    setUploadModalVisible(true);
  };

  const handleUploadComplete = (result) => {
    console.log('Upload completed:', result);
    setUploadSuccess(true);
    
    // Trigger a refresh of the data sources table
    setRefreshTrigger(prev => prev + 1);
    
    // Hide success message after 5 seconds
    setTimeout(() => {
      setUploadSuccess(false);
    }, 5000);
  };

  return (
    <Container
      header={
        <Header
          variant="h2"
          description={t('components:visionDataSources.manageDataSources')}
        >
          {t('components:visionDataSources.dataSources')}
        </Header>
      }
    >
      <SpaceBetween size="l">
        {uploadSuccess && (
          <Alert type="success" dismissible onDismiss={() => setUploadSuccess(false)}>
            {t('components:visionDataSources.fileUploadedSuccessfully')}
          </Alert>
        )}
        
        {!projectReady && selectedProject && (
          <Alert type={statusMessage.severity} dismissible={false}>
            {statusMessage.message}
          </Alert>
        )}
        
        <VisionDataSourcesTable 
          dataSourceType={dataSourceType} 
          refreshTrigger={refreshTrigger}
          projectId={projectId}
          projectReady={projectReady}
          onDataProcessingComplete={onDataProcessingComplete}
          onDataChanged={onDataChanged}
        />
        
        <Box textAlign="right">
          <Button 
            onClick={handleUpload} 
            disabled={!hasWriteAccess || !projectReady}
            ariaLabel={
              !hasWriteAccess 
                ? t('components:visionDataSources.noPermissionToUpload')
                : !projectReady 
                  ? t('components:visionDataSources.projectNotReadyForUploads')
                  : t('components:visionDataSources.uploadNewFile')
            }
          >
            {t('components:visionDataSources.uploadNewFile')}
          </Button>
          
          {!hasWriteAccess && projectReady && (
            <Box color="text-status-info" padding={{ top: 'xs' }}>
              <small>{t('components:visionDataSources.needWritePermission')}</small>
            </Box>
          )}
          
          {!projectReady && (
            <Box color="text-status-info" padding={{ top: 'xs' }}>
              <small>{t('components:visionDataSources.projectMustBeActive')}</small>
            </Box>
          )}
        </Box>
      </SpaceBetween>
      
      {selectedProject && projectReady && (
        <FileUploadModal
          visible={uploadModalVisible}
          onDismiss={() => setUploadModalVisible(false)}
          projectId={projectId}
          folderPath="data-uploaded/technology-vision/"
          dataSourceType={dataSourceType}
          onUploadComplete={handleUploadComplete}
        />
      )}
    </Container>
  );
}

export default VisionDataSourcesSection;
