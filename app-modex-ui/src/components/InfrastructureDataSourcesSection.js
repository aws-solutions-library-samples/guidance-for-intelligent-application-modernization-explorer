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
import InfrastructureDataSourcesTable from './InfrastructureDataSourcesTable';
import FileUploadModal from './FileUploadModal';
import { useSimpleAuth } from '../contexts/SimpleAuthContext';
import useProjectPermissions from '../hooks/useProjectPermissions';

function InfrastructureDataSourcesSection({ onDataProcessingComplete, onDataChanged }) {
  const { t } = useTranslation(['components', 'common']);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { user } = useSimpleAuth();
  
  // Define the data source type for this section
  const dataSourceType = 'applications-infrastructure';
  
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
          description={`Manage data sources for infrastructure`}
        >
          {t('components:infrastructureDataSources.dataSources')}
        </Header>
      }
    >
      <SpaceBetween size="l">
        {uploadSuccess && (
          <Alert type="success" dismissible onDismiss={() => setUploadSuccess(false)}>
            {t('components:infrastructureDataSources.fileUploadedSuccessfully')}
          </Alert>
        )}
        
        <InfrastructureDataSourcesTable 
          dataSourceType={dataSourceType} 
          refreshTrigger={refreshTrigger}
          projectId={projectId}
          onDataProcessingComplete={onDataProcessingComplete}
          onDataChanged={onDataChanged}
        />
        
        <Box textAlign="right">
          <Button 
            onClick={handleUpload} 
            disabled={!hasWriteAccess}
            ariaLabel={!hasWriteAccess ? t('components:common.noPermissionUpload') : t('components:common.uploadNewFile')}
          >
            {t('components:infrastructureDataSources.uploadNewFile')}
          </Button>
          
          {!hasWriteAccess && (
            <Box color="text-status-info" padding={{ top: 'xs' }}>
              <small>{t('components:dataSources.needWritePermission')}</small>
            </Box>
          )}
        </Box>
      </SpaceBetween>
      
      {selectedProject && (
        <FileUploadModal
          visible={uploadModalVisible}
          onDismiss={() => setUploadModalVisible(false)}
          projectId={projectId}
          folderPath="data-uploaded/applications-infrastructure/"
          dataSourceType={dataSourceType}
          onUploadComplete={handleUploadComplete}
        />
      )}
    </Container>
  );
}

export default InfrastructureDataSourcesSection;
