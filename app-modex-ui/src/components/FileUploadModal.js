import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  Box,
  SpaceBetween,
  Button,
  FormField,
  Alert,
  ProgressBar
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import { validateFileType } from '../services/s3UploadService';
import { uploadFile } from '../services/apiService';
import useProjectPermissions from '../hooks/useProjectPermissions';

// File size threshold for chunking (3MB)
const CHUNK_SIZE_THRESHOLD = 3 * 1024 * 1024;

/**
 * File Upload Modal Component
 * Allows users to select and upload files to S3 via API
 */
const FileUploadModal = ({ 
  visible, 
  onDismiss, 
  projectId, 
  folderPath = 'data-uploaded/team-skills/', 
  dataSourceType = 'team-skills',
  onUploadComplete 
}) => {
  const { t } = useTranslation(['components', 'common']);
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [willBeChunked, setWillBeChunked] = useState(false);
  const fileInputRef = useRef(null);
  
  // Check if user has write access to the project
  const { hasWriteAccess, loading: permissionsLoading } = useProjectPermissions(projectId);

  // Reset file input when modal becomes visible
  useEffect(() => {
    if (visible) {
      setSelectedFile(null);
      setError('');
      setUploading(false);
      setUploadProgress(0);
      setCurrentChunk(0);
      setTotalChunks(0);
      setWillBeChunked(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [visible]);

  // Handle file selection
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    setError('');
    setWillBeChunked(false);
    
    if (!file) {
      setSelectedFile(null);
      return;
    }
    
    // Validate file type - CSV only
    if (!validateFileType(file)) {
      setError(t('components:fileUpload.invalidFileType'));
      setSelectedFile(null);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }
    
    // Check if file will be chunked
    if (file.size > CHUNK_SIZE_THRESHOLD) {
      const estimatedChunks = Math.ceil(file.size / CHUNK_SIZE_THRESHOLD);
      setWillBeChunked(true);
      setTotalChunks(estimatedChunks);
    }
    
    setSelectedFile(file);
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!selectedFile) {
      setError(t('components:fileUpload.pleaseSelectFile'));
      return;
    }
    
    try {
      setUploading(true);
      setError('');
      setUploadProgress(0);
      setCurrentChunk(0);
      
      // Upload file using API service with progress callback
      const result = await uploadFile(
        selectedFile, 
        projectId, 
        folderPath, 
        dataSourceType,
        (progress) => {
          setUploadProgress(progress.percent);
          setCurrentChunk(progress.chunk);
          setTotalChunks(progress.totalChunks);
        }
      );
      
      // Call the onUploadComplete callback with the result
      if (onUploadComplete) {
        onUploadComplete(result);
      }
      
      // Close the modal
      onDismiss();
    } catch (error) {
      console.error('Error uploading file:', error);
      setError(t('components:fileUpload.errorUploading', { message: error.message }));
      setUploadProgress(0);
      setCurrentChunk(0);
    } finally {
      setUploading(false);
    }
  };

  // Handle modal dismiss
  const handleDismiss = () => {
    // Reset state
    setSelectedFile(null);
    setError('');
    setUploading(false);
    setUploadProgress(0);
    setCurrentChunk(0);
    setTotalChunks(0);
    setWillBeChunked(false);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    // Call the onDismiss callback
    onDismiss();
  };

  // Show permission error if user doesn't have write access
  const showPermissionError = visible && !permissionsLoading && !hasWriteAccess;

  return (
    <Modal
      visible={visible}
      onDismiss={handleDismiss}
      header={t('components:fileUpload.uploadDataFile', { dataSourceType: dataSourceType.charAt(0).toUpperCase() + dataSourceType.slice(1) })}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={handleDismiss} disabled={uploading}>
              {t('common:buttons.cancel')}
            </Button>
            <Button 
              variant="primary" 
              onClick={handleUpload} 
              disabled={!selectedFile || uploading || !hasWriteAccess}
              loading={uploading}
            >
              {t('common:buttons.upload')}
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        {showPermissionError && (
          <Alert type="error" dismissible={false}>
            {t('components:fileUpload.noWriteAccess')}
          </Alert>
        )}
        
        {willBeChunked && !uploading && (
          <Alert type="info" dismissible={false}>
            This file will be split into {totalChunks} chunks for upload. Each chunk will be named with a _part{'{N}'} suffix.
          </Alert>
        )}
        
        {error && (
          <Alert type="error" dismissible onDismiss={() => setError('')}>
            {error}
          </Alert>
        )}
        
        <FormField
          label={t('components:fileUpload.selectFile')}
          description={t('components:fileUpload.uploadDescription', { dataSourceType })}
        >
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            accept=".csv,text/csv"
            disabled={uploading || !hasWriteAccess}
            style={{
              padding: '8px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              width: '100%'
            }}
          />
        </FormField>
        
        {selectedFile && !uploading && (
          <Box>
            <strong>{t('components:fileUpload.selectedFile')}</strong> {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
          </Box>
        )}
        
        {uploading && (
          <Box>
            <SpaceBetween size="s">
              <ProgressBar
                value={uploadProgress}
                label={totalChunks > 1 ? `Uploading chunk ${currentChunk} of ${totalChunks}` : 'Uploading file'}
                description={`${uploadProgress}% complete`}
                variant="standalone"
              />
              {uploadProgress === 100 && (
                <Box variant="p" color="text-status-info">
                  Processing upload...
                </Box>
              )}
            </SpaceBetween>
          </Box>
        )}
      </SpaceBetween>
    </Modal>
  );
};

export default FileUploadModal;
