/**
 * API Service
 * Handles API requests to the backend
 */

import { fetchAuthSession } from 'aws-amplify/auth';

/**
 * Base API URL from environment variables
 */
const API_URL = process.env.REACT_APP_API_URL || '';

// File size threshold for chunking (3MB)
const CHUNK_SIZE_THRESHOLD = 3 * 1024 * 1024;
const CHUNK_SIZE = 3 * 1024 * 1024; // 3MB chunks

/**
 * Get authentication headers for API requests
 * @returns {Promise<Object>} - Headers object with Authorization
 */
const getAuthHeaders = async () => {
  try {
    const { tokens } = await fetchAuthSession();
    if (!tokens || !tokens.idToken) {
      throw new Error('No authentication token available');
    }
    
    return {
      'Authorization': `Bearer ${tokens.idToken.toString()}`
    };
  } catch (error) {
    console.error('Error getting auth headers:', error);
    throw error;
  }
};

/**
 * Split CSV file into chunks
 * @param {File} file - The CSV file to split
 * @param {number} chunkSize - Size of each chunk in bytes
 * @returns {Promise<Array>} - Array of chunk objects with {data, name, isLast}
 */
const splitCSVFile = async (file, chunkSize) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n');
        const header = lines[0];
        const dataLines = lines.slice(1);
        
        const chunks = [];
        let currentChunk = [];
        let currentSize = 0;
        let chunkIndex = 1;
        
        // Calculate approximate size per line
        const headerSize = new Blob([header + '\n']).size;
        
        for (let i = 0; i < dataLines.length; i++) {
          const line = dataLines[i];
          const lineSize = new Blob([line + '\n']).size;
          
          // Check if adding this line would exceed chunk size
          if (currentSize + lineSize > chunkSize && currentChunk.length > 0) {
            // Create chunk with header
            const chunkContent = header + '\n' + currentChunk.join('\n');
            const chunkBlob = new Blob([chunkContent], { type: 'text/csv' });
            const baseName = file.name.replace('.csv', '');
            const chunkFile = new File([chunkBlob], `${baseName}_part${chunkIndex}.csv`, { type: 'text/csv' });
            
            chunks.push({
              file: chunkFile,
              index: chunkIndex,
              isLast: false
            });
            
            // Reset for next chunk
            currentChunk = [];
            currentSize = headerSize;
            chunkIndex++;
          }
          
          currentChunk.push(line);
          currentSize += lineSize;
        }
        
        // Add final chunk
        if (currentChunk.length > 0) {
          const chunkContent = header + '\n' + currentChunk.join('\n');
          const chunkBlob = new Blob([chunkContent], { type: 'text/csv' });
          const baseName = file.name.replace('.csv', '');
          const chunkFile = new File([chunkBlob], `${baseName}_part${chunkIndex}.csv`, { type: 'text/csv' });
          
          chunks.push({
            file: chunkFile,
            index: chunkIndex,
            isLast: true
          });
        }
        
        resolve(chunks);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
};

/**
 * Upload a single file with progress tracking using XMLHttpRequest
 * @param {File} file - The file to upload
 * @param {string} projectId - The project ID
 * @param {string} folderPath - The folder path
 * @param {string} dataSourceType - The data source type
 * @param {boolean} isLastChunk - Whether this is the last chunk
 * @param {number} chunkIndex - Current chunk index (1-based)
 * @param {number} totalChunks - Total number of chunks
 * @param {string} originalFilename - Original filename before chunking
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} - Upload result
 */
const uploadSingleFileWithProgress = async (file, projectId, folderPath, dataSourceType, isLastChunk, chunkIndex, totalChunks, originalFilename, onProgress) => {
  // Get auth headers
  const authHeaders = await getAuthHeaders();
  
  // Read file as base64
  const fileContent = await readFileAsBase64(file);
  
  // Prepare request body
  const requestBody = JSON.stringify({
    projectId,
    fileName: file.name,
    fileType: file.type || 'text/csv',
    fileSize: file.size,
    fileContent,
    folderPath,
    dataSourceType,
    isLastChunk,
    chunkIndex,
    totalChunks,
    originalFilename
  });
  
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    // Track upload progress
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          onProgress(percentComplete);
        }
      });
    }
    
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText);
          resolve(result);
        } catch (error) {
          reject(new Error('Failed to parse response'));
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.error || 'Upload failed'));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    });
    
    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });
    
    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'));
    });
    
    xhr.open('POST', `${API_URL}/projects/${projectId}/file-upload`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', authHeaders.Authorization);
    xhr.send(requestBody);
  });
};

/**
 * Upload a file to the backend API with automatic chunking for large files
 * @param {File} file - The file to upload
 * @param {string} projectId - The project ID
 * @param {string} folderPath - The folder path within the bucket
 * @param {string} dataSourceType - The type of data source
 * @param {Function} onProgress - Progress callback (receives {percent, chunk, totalChunks})
 * @returns {Promise<Object>} - Upload result
 */
export const uploadFile = async (file, projectId, folderPath = 'data-uploaded/skills/', dataSourceType = 'skills', onProgress = null) => {
  try {
    // Check if file needs to be chunked
    if (file.size > CHUNK_SIZE_THRESHOLD) {
      console.log(`📦 File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds threshold, splitting into chunks...`);
      
      // Split file into chunks
      const chunks = await splitCSVFile(file, CHUNK_SIZE);
      console.log(`✂️ File split into ${chunks.length} chunks`);
      
      // Upload each chunk
      const results = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`📤 Uploading chunk ${chunk.index} of ${chunks.length}...`);
        
        const result = await uploadSingleFileWithProgress(
          chunk.file,
          projectId,
          folderPath,
          dataSourceType,
          chunk.isLast,
          chunk.index,
          chunks.length,
          file.name, // Original filename
          (percent) => {
            if (onProgress) {
              onProgress({
                percent,
                chunk: chunk.index,
                totalChunks: chunks.length
              });
            }
          }
        );
        
        results.push(result);
      }
      
      // Return the last chunk's result (which triggered processing)
      return results[results.length - 1];
    } else {
      // Upload single file
      return await uploadSingleFileWithProgress(
        file,
        projectId,
        folderPath,
        dataSourceType,
        true, // Single file is always the "last chunk"
        1,    // chunkIndex = 1
        1,    // totalChunks = 1
        file.name, // originalFilename
        (percent) => {
          if (onProgress) {
            onProgress({ percent, chunk: 1, totalChunks: 1 });
          }
        }
      );
    }
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
};

/**
 * Read a file as base64
 * @param {File} file - The file to read
 * @returns {Promise<string>} - Base64 encoded file content
 */
const readFileAsBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
};

export default {
  uploadFile
};
