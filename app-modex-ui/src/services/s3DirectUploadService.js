/**
 * Direct S3 Upload Service
 * Uses AWS SDK directly to upload files to S3
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { fetchAuthSession, getCurrentUser } from 'aws-amplify/auth';
import { v4 as uuidv4 } from 'uuid';
import { addDataSource } from './dataSourcesService';

/**
 * Upload a file directly to S3 using AWS SDK
 * @param {File} file - The file to upload
 * @param {string} projectId - The project ID
 * @param {string} folderPath - The folder path within the bucket (e.g., 'data-uploaded/skills/')
 * @param {string} dataSourceType - The type of data source (e.g., 'skills', 'vision', 'portfolio')
 * @returns {Promise<Object>} - Upload result
 */
export const uploadFileDirectly = async (file, projectId, folderPath = 'data-uploaded/skills/', dataSourceType = 'skills') => {
  try {
    // Get current user
    const username = await getUsernameFromSession();
    
    // Ensure folder path ends with a slash
    const normalizedFolderPath = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
    
    // Create a unique ID for the file
    const fileId = uuidv4();
    
    // Create a key for the file (path + unique ID + filename)
    const key = `${normalizedFolderPath}${fileId}-${file.name}`;
    
    // Dynamically set the bucket name based on the project ID
    const bucketName = `app-modex-data-${projectId}`.toLowerCase();
    
    console.log(`🔄 Uploading file ${file.name} directly to S3 bucket ${bucketName}`);
    console.log(`🔄 File type: ${file.type}, size: ${file.size} bytes`);
    console.log(`🔄 Target key: ${key}`);
    
    // Get auth session with credentials
    const session = await fetchAuthSession();
    console.log('Auth session:', {
      hasIdentityId: !!session.identityId,
      hasTokens: !!session.tokens,
      hasCredentials: !!session.credentials
    });
    
    if (!session.credentials) {
      throw new Error('No credentials available in session');
    }
    
    // Create S3 client with credentials
    const s3Client = new S3Client({
      region: process.env.REACT_APP_AWS_REGION || 'us-west-2',
      credentials: {
        accessKeyId: session.credentials.accessKeyId,
        secretAccessKey: session.credentials.secretAccessKey,
        sessionToken: session.credentials.sessionToken
      }
    });
    
    // Read file as ArrayBuffer
    const fileContent = await readFileAsArrayBuffer(file);
    
    // Create metadata
    const metadata = {
      projectid: projectId,
      uploaddate: new Date().toISOString(),
      datasourcetype: dataSourceType,
      uploadedby: username || 'unknown'
    };
    
    // Create PutObject command
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: fileContent,
      ContentType: file.type,
      Metadata: metadata
    });
    
    // Upload file to S3
    const response = await s3Client.send(command);
    
    console.log('✅ File uploaded successfully to S3:', response);
    
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
      // Continue anyway since the file was uploaded successfully
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
    console.error('❌ Error uploading file directly to S3:', error);
    return {
      success: false,
      error: error.message || 'Failed to upload file',
      details: error
    };
  }
};

/**
 * Read file as ArrayBuffer
 * @param {File} file - The file to read
 * @returns {Promise<ArrayBuffer>} - The file content as ArrayBuffer
 */
const readFileAsArrayBuffer = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Get username from Amplify auth session
 * @returns {Promise<string>} - The username
 */
const getUsernameFromSession = async () => {
  try {
    // Try to get user from Amplify
    const user = await getCurrentUser();
    return user.username || user.attributes?.email || 'unknown';
  } catch (error) {
    console.error('Error getting current user from Amplify:', error);
    
    // Try to get username from selected project
    const selectedProject = localStorage.getItem('selectedProject');
    if (selectedProject) {
      const project = JSON.parse(selectedProject);
      return project.createdBy || 'unknown';
    }
    
    return 'unknown';
  }
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
  uploadFileDirectly,
  validateFileType
};
