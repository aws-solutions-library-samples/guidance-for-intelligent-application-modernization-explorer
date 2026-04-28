// Force deployment timestamp: 2026-01-30T00:00:00.000Z
const DEPLOYMENT_TIMESTAMP = '2026-01-30T00:00:00.000Z';

/**
 * Batch Extractor Lambda Function
 * 
 * Extracts unique values from all 5 technology columns in a single pass:
 * - runtime
 * - framework
 * - databases (comma-separated)
 * - integrations (comma-separated)
 * - storage (comma-separated)
 * 
 * This replaces the old extract-unique-values Lambda which processed one column at a time.
 * 
 * IAM Permissions (Least Privilege):
 * - S3: GetObject on app-modex-data-{projectId}/data-uploaded/applications-tech-stack/*
 * - CloudWatch Logs: CreateLogGroup, CreateLogStream, PutLogEvents
 */

const { S3Client, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({});

/**
 * CSV parser - handles quoted fields properly
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(csvContent) {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }
  
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      rows.push(values);
    }
  }
  
  return { headers, rows };
}

/**
 * Extract unique values from a single-value column (runtime, framework)
 */
function extractSingleValues(rows, columnIndex) {
  const uniqueValues = new Set();
  
  for (const row of rows) {
    if (row[columnIndex]) {
      const cleanValue = row[columnIndex].replace(/^"|"$/g, '').trim();
      if (cleanValue && cleanValue !== 'N/A' && cleanValue !== 'None' && cleanValue !== '') {
        uniqueValues.add(cleanValue);
      }
    }
  }
  
  return Array.from(uniqueValues).sort();
}

/**
 * List all chunk files in S3 folder matching the original filename pattern
 */
async function listChunkFiles(bucketName, folderPath, originalFilename) {
  const baseName = originalFilename.replace('.csv', '');
  const prefix = folderPath;
  
  console.log(`🔍 Listing chunks in ${bucketName}/${prefix} for pattern: ${baseName}_part*.csv`);
  
  const response = await s3Client.send(new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: prefix
  }));
  
  if (!response.Contents) {
    return [];
  }
  
  // Filter files that match the chunk pattern
  const chunkFiles = response.Contents
    .filter(obj => {
      const filename = obj.Key.split('/').pop();
      // Match pattern: {baseName}_part{N}.csv
      const pattern = new RegExp(`${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_part\\d+\\.csv$`);
      return pattern.test(filename);
    })
    .map(obj => obj.Key)
    .sort((a, b) => {
      // Sort by part number
      const aMatch = a.match(/_part(\d+)\.csv$/);
      const bMatch = b.match(/_part(\d+)\.csv$/);
      if (aMatch && bMatch) {
        return parseInt(aMatch[1]) - parseInt(bMatch[1]);
      }
      return 0;
    });
  
  console.log(`✅ Found ${chunkFiles.length} chunk files`);
  return chunkFiles;
}

/**
 * Read and combine multiple chunk files from S3
 */
async function readAndCombineChunks(bucketName, chunkKeys) {
  console.log(`📚 Reading and combining ${chunkKeys.length} chunks...`);
  
  const allRows = [];
  let headers = null;
  
  for (let i = 0; i < chunkKeys.length; i++) {
    const chunkKey = chunkKeys[i];
    console.log(`📖 Reading chunk ${i + 1}/${chunkKeys.length}: ${chunkKey}`);
    
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: chunkKey
    }));
    
    const csvContent = await response.Body.transformToString('utf-8');
    const { headers: chunkHeaders, rows: chunkRows } = parseCSV(csvContent);
    
    // First chunk: save headers
    if (!headers) {
      headers = chunkHeaders;
      console.log(`📋 Headers from first chunk: ${headers.join(', ')}`);
    }
    
    // Add rows from this chunk
    allRows.push(...chunkRows);
    console.log(`   Added ${chunkRows.length} rows (total: ${allRows.length})`);
  }
  
  console.log(`✅ Combined ${chunkKeys.length} chunks: ${allRows.length} total rows`);
  
  return { headers, rows: allRows };
}

/**
 * Extract unique values from multi-value columns (databases, integrations, storage)
 * Values are comma/semicolon/pipe separated
 */
function extractMultiValues(rows, columnIndex) {
  const uniqueValues = new Set();
  
  for (const row of rows) {
    if (row[columnIndex]) {
      const cellValue = row[columnIndex].replace(/^"|"$/g, '').trim();
      
      // Split by comma, semicolon, or pipe
      const values = cellValue
        .split(/[,;|]/)
        .map(v => v.trim())
        .filter(v => v && v !== 'N/A' && v !== 'None' && v !== '');
      
      values.forEach(value => {
        if (value) uniqueValues.add(value);
      });
    }
  }
  
  return Array.from(uniqueValues).sort();
}

/**
 * Main handler function
 */
exports.handler = async (event) => {
  console.log('🔍 Batch Extractor Lambda started');
  console.log('📋 Event:', JSON.stringify(event, null, 2));
  
  const { projectId, s3Key, filename, processId, originalTimestamp, isMultiChunk, totalChunks, originalFilename, folderPath } = event;
  
  // Validate required parameters
  if (!projectId || !s3Key) {
    throw new Error('Missing required parameters: projectId, s3Key');
  }
  
  try {
    const bucketName = `app-modex-data-${projectId.toLowerCase()}`;
    
    let headers, rows;
    
    // Check if this is a multi-chunk upload
    if (isMultiChunk) {
      console.log(`📦 Multi-chunk file detected: ${totalChunks} chunks`);
      console.log(`📂 Original filename: ${originalFilename}`);
      console.log(`📁 Folder path: ${folderPath}`);
      
      // List all chunks in the folder
      const chunkKeys = await listChunkFiles(bucketName, folderPath, originalFilename);
      
      // Validate we have all chunks
      if (chunkKeys.length !== totalChunks) {
        console.warn(`⚠️ Expected ${totalChunks} chunks but found ${chunkKeys.length}`);
        
        // Wait a bit for S3 eventual consistency
        console.log('⏳ Waiting 2 seconds for S3 consistency...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Try again
        const retryChunkKeys = await listChunkFiles(bucketName, folderPath, originalFilename);
        if (retryChunkKeys.length !== totalChunks) {
          throw new Error(
            `Expected ${totalChunks} chunks but found ${retryChunkKeys.length}. ` +
            `Missing chunks may cause incomplete normalization.`
          );
        }
        
        // Use retry results
        const combined = await readAndCombineChunks(bucketName, retryChunkKeys);
        headers = combined.headers;
        rows = combined.rows;
      } else {
        // Read and combine all chunks
        const combined = await readAndCombineChunks(bucketName, chunkKeys);
        headers = combined.headers;
        rows = combined.rows;
      }
      
    } else {
      console.log(`📄 Single file upload`);
      console.log(`📥 Reading file from S3: ${bucketName}/${s3Key}`);
      
      // Read single CSV file from S3
      const response = await s3Client.send(new GetObjectCommand({
        Bucket: bucketName,
        Key: s3Key
      }));
      
      const csvContent = await response.Body.transformToString('utf-8');
      console.log(`✅ File read successfully. Size: ${csvContent.length} bytes`);
      
      // Parse CSV
      const parsed = parseCSV(csvContent);
      headers = parsed.headers;
      rows = parsed.rows;
    }
    
    console.log(`📊 Parsed CSV: ${headers.length} columns, ${rows.length} rows`);
    
    if (rows.length === 0) {
      console.warn('⚠️ No data rows found in CSV file');
      return {
        statusCode: 200,
        projectId,
        processId,
        originalTimestamp,
        s3Key,
        filename,
        uniqueValues: {
          runtimes: [],
          frameworks: [],
          databases: [],
          integrations: [],
          storages: []
        },
        totalUniqueValues: 0
      };
    }
    
    // Find column indices (case-insensitive)
    const columnIndices = {
      runtime: headers.findIndex(h => h.toLowerCase() === 'runtime'),
      framework: headers.findIndex(h => h.toLowerCase() === 'framework'),
      databases: headers.findIndex(h => h.toLowerCase() === 'databases'),
      integrations: headers.findIndex(h => h.toLowerCase() === 'integrations'),
      storage: headers.findIndex(h => h.toLowerCase() === 'storage' || h.toLowerCase() === 'storages')
    };
    
    console.log('📍 Column indices:', columnIndices);
    
    // Validate that all required columns exist
    const missingColumns = [];
    for (const [columnName, index] of Object.entries(columnIndices)) {
      if (index === -1) {
        missingColumns.push(columnName);
      }
    }
    
    if (missingColumns.length > 0) {
      throw new Error(`Missing required columns in CSV: ${missingColumns.join(', ')}`);
    }
    
    // Extract unique values from all columns
    console.log('🔄 Extracting unique values from all columns...');
    
    const uniqueValues = {
      runtimes: extractSingleValues(rows, columnIndices.runtime),
      frameworks: extractSingleValues(rows, columnIndices.framework),
      databases: extractMultiValues(rows, columnIndices.databases),
      integrations: extractMultiValues(rows, columnIndices.integrations),
      storages: extractMultiValues(rows, columnIndices.storage)
    };
    
    const totalUniqueValues = 
      uniqueValues.runtimes.length +
      uniqueValues.frameworks.length +
      uniqueValues.databases.length +
      uniqueValues.integrations.length +
      uniqueValues.storages.length;
    
    console.log('✅ Extraction complete:');
    console.log(`   - Runtimes: ${uniqueValues.runtimes.length} unique values`);
    console.log(`   - Frameworks: ${uniqueValues.frameworks.length} unique values`);
    console.log(`   - Databases: ${uniqueValues.databases.length} unique values`);
    console.log(`   - Integrations: ${uniqueValues.integrations.length} unique values`);
    console.log(`   - Storages: ${uniqueValues.storages.length} unique values`);
    console.log(`   - Total: ${totalUniqueValues} unique values`);
    
    return {
      statusCode: 200,
      projectId,
      processId,
      originalTimestamp,
      s3Key,
      filename,
      uniqueValues,
      totalUniqueValues,
      rowCount: rows.length
    };
    
  } catch (error) {
    console.error('❌ Error in batch extractor:', error);
    throw error;
  }
};
