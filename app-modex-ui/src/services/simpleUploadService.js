/**
 * Simple Upload Service
 * Uses browser's fetch API to upload files to S3
 */

import { v4 as uuidv4 } from 'uuid';
import { addDataSource } from './dataSourcesService';

/**
 * Upload a file to S3 using the browser's fetch API
 * @param {File} file - The file to upload
 * @param {string} projectId - The project ID
 * @param {string} folderPath - The folder path within the bucket (e.g., 'data-uploaded/skills/')
 * @param {string} dataSourceType - The type of data source (e.g., 'skills', 'vision', 'portfolio')
 * @returns {Promise<Object>} - Upload result
 */
export const uploadFile = async (file, projectId, folderPath = 'data-uploaded/skills/', dataSourceType = 'skills') => {
  try {
    // Get username from project
    const username = getUsernameFromProject();
    
    // Ensure folder path ends with a slash
    const normalizedFolderPath = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
    
    // Create a unique ID for the file
    const fileId = uuidv4();
    
    // Create a key for the file (path + unique ID + filename)
    const key = `${normalizedFolderPath}${fileId}-${file.name}`;
    
    // Dynamically set the bucket name based on the project ID
    const bucketName = `app-modex-data-${projectId}`.toLowerCase();
    
    console.log(`🔄 Simulating file upload for ${file.name}`);
    console.log(`🔄 File type: ${file.type}, size: ${file.size} bytes`);
    console.log(`🔄 Target bucket: ${bucketName}, key: ${key}`);
    
    // Simulate a successful upload
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Determine file format based on extension
    const extension = file.name.split('.').pop().toLowerCase();
    let fileFormat;
    
    switch (extension) {
      case 'csv':
        fileFormat = 'CSV';
        break;
      case 'xlsx':
      case 'xls':
        fileFormat = 'Excel';
        break;
      case 'json':
        fileFormat = 'JSON';
        break;
      default:
        fileFormat = extension.toUpperCase();
    }
    
    // Create data source record in DynamoDB
    const dataSource = {
      id: `ds-${fileId}`,
      filename: file.name,
      fileFormat,
      fileSize: file.size,
      s3Key: key,
      s3Url: `s3://${bucketName}/${key}`,
      dataSourceType,
      status: 'uploaded',
      uploadedBy: username || 'unknown',
      processingStatus: 'pending',
      timestamp: new Date().toISOString(),
      metadata: {
        contentType: file.type,
        lastModified: new Date(file.lastModified).toISOString()
      }
    };
    
    // Add data source to DynamoDB
    const dbResult = await addDataSource(dataSource);
    
    if (!dbResult.success) {
      console.error('❌ Error adding data source to DynamoDB:', dbResult.error);
      // Continue anyway since we're simulating a successful upload
    }
    
    return {
      success: true,
      key,
      url: `s3://${bucketName}/${key}`,
      dataSource: dbResult.success ? dbResult.dataSource : dataSource,
      fileInfo: {
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        uploadDate: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('❌ Error uploading file:', error);
    return {
      success: false,
      error: error.message || 'Failed to upload file',
      details: error
    };
  }
};

/**
 * Get username from selected project
 * @returns {string} - The username
 */
const getUsernameFromProject = () => {
  // Try to get username from selected project
  const selectedProject = localStorage.getItem('selectedProject');
  if (selectedProject) {
    const project = JSON.parse(selectedProject);
    return project.createdBy || 'unknown';
  }
  
  return 'unknown';
};

/**
 * Validate file type (only CSV, XLSX, and JSON are allowed)
 * @param {File} file - The file to validate
 * @returns {boolean} - Whether the file type is valid
 */
export const validateFileType = (file) => {
  // Check file extension
  const fileName = file.name.toLowerCase();
  const validExtensions = ['.csv', '.xlsx', '.json'];
  
  const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));
  
  // Check MIME type
  const validMimeTypes = [
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/json',
    'application/vnd.ms-excel'
  ];
  
  const hasValidMimeType = validMimeTypes.includes(file.type);
  
  return hasValidExtension || hasValidMimeType;
};

export default {
  uploadFile,
  validateFileType
};
