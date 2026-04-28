const AWS = require('aws-sdk');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const archiver = require('archiver');
const stream = require('stream');

const s3 = new AWS.S3();
const dynamodbClient = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(dynamodbClient);

const PROJECT_ID = process.env.PROJECT_ID;
const PROJECT_BUCKET = process.env.PROJECT_BUCKET;
const PROJECTS_TABLE = process.env.PROJECTS_TABLE;

/**
 * ZIP Packager Lambda Function
 * Creates ZIP file containing all Excel exports and manages file lifecycle
 */

/**
 * Sanitize project name for use in filenames
 * Replaces spaces with underscores and removes special characters
 */
function sanitizeProjectName(projectName) {
    if (!projectName) return 'unknown_project';
    
    return projectName
        .toLowerCase()
        .replace(/\s+/g, '_')           // Replace spaces with underscores
        .replace(/[^a-z0-9_-]/g, '')   // Remove special characters except underscores and hyphens
        .replace(/_+/g, '_')           // Replace multiple underscores with single
        .replace(/^_|_$/g, '');        // Remove leading/trailing underscores
}

/**
 * Retrieve project name from DynamoDB
 */
async function getProjectName(projectId) {
    try {
        console.log(`🔍 Retrieving project name for projectId: ${projectId}`);
        
        const params = {
            TableName: PROJECTS_TABLE,
            Key: { projectId }
        };
        
        const result = await dynamodb.send(new GetCommand(params));
        
        if (!result.Item) {
            console.warn(`⚠️ Project not found in DynamoDB: ${projectId}`);
            return 'unknown_project';
        }
        
        const projectName = result.Item.name || 'unnamed_project';
        console.log(`✅ Retrieved project name: ${projectName}`);
        
        return sanitizeProjectName(projectName);
    } catch (error) {
        console.error('❌ Error retrieving project name:', error);
        return 'unknown_project';
    }
}
const { sanitizeEvent } = require('app-modex-shared');

exports.handler = async (event) => {
    console.log('ZIP Packager Event:', JSON.stringify(sanitizeEvent(event), null, 2));
    
    try {
        const { projectId, exportId, excelFiles } = event;
        
        if (!excelFiles || excelFiles.length === 0) {
            throw new Error('No Excel files provided for packaging');
        }
        
        // Create ZIP file
        const zipResult = await createZipFile(projectId, exportId, excelFiles);
        
        // Clean up temporary files
        await cleanupTempFiles(exportId, excelFiles);
        
        return {
            success: true,
            zipFile: zipResult.s3Key,
            fileSizeBytes: zipResult.sizeBytes,
            totalFiles: excelFiles.length,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('ZIP Packager Error:', error);
        throw new Error(`Failed to package ZIP file: ${error.message}`);
    }
};

/**
 * Create ZIP file from Excel files
 */
async function createZipFile(projectId, exportId, excelFiles) {
    console.log(`Creating ZIP file for ${excelFiles.length} Excel files`);
    
    // Get project name for filename
    const projectName = await getProjectName(projectId);
    
    return new Promise(async (resolve, reject) => {
        try {
            // Create archive
            const archive = archiver('zip', {
                zlib: { level: 9 } // Maximum compression
            });
            
            // Create upload stream with new naming convention
            const passThrough = new stream.PassThrough();
            const zipKey = `exports/${exportId}/appmodex-${projectName}-${projectId}.zip`;
            
            const uploadParams = {
                Bucket: PROJECT_BUCKET,
                Key: zipKey,
                Body: passThrough,
                ContentType: 'application/zip',
                Metadata: {
                    projectId,
                    exportId,
                    fileCount: excelFiles.length.toString(),
                    createdAt: new Date().toISOString()
                }
            };
            
            // Start S3 upload
            const uploadPromise = s3.upload(uploadParams).promise();
            
            // Handle archive events
            archive.on('error', (err) => {
                console.error('Archive error:', err);
                reject(err);
            });
            
            archive.on('warning', (err) => {
                console.warn('Archive warning:', err);
            });
            
            // Pipe archive to upload stream
            archive.pipe(passThrough);
            
            // Add files to archive
            for (const file of excelFiles) {
                console.log(`Adding file to ZIP: ${file.fileName}`);
                
                // Download file from S3
                const fileStream = s3.getObject({
                    Bucket: PROJECT_BUCKET,
                    Key: file.s3Key
                }).createReadStream();
                
                // Add to archive
                archive.append(fileStream, { name: file.fileName });
            }
            
            // Finalize archive
            archive.finalize();
            
            // Wait for upload to complete
            const uploadResult = await uploadPromise;
            
            console.log(`ZIP file uploaded: ${zipKey}`);
            
            // Get file size
            const headResult = await s3.headObject({
                Bucket: PROJECT_BUCKET,
                Key: zipKey
            }).promise();
            
            resolve({
                s3Key: zipKey,
                sizeBytes: headResult.ContentLength,
                location: uploadResult.Location
            });
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Clean up temporary Excel files
 */
async function cleanupTempFiles(exportId, excelFiles) {
    console.log(`Cleaning up ${excelFiles.length} temporary files`);
    
    const deletePromises = excelFiles.map(file => {
        return s3.deleteObject({
            Bucket: PROJECT_BUCKET,
            Key: file.s3Key
        }).promise().catch(error => {
            console.warn(`Failed to delete temp file ${file.s3Key}:`, error.message);
            // Don't fail the entire process for cleanup errors
        });
    });
    
    await Promise.all(deletePromises);
    
    console.log('Temporary file cleanup completed');
}