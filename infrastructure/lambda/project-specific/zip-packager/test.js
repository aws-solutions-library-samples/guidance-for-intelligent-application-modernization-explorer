// Mock AWS SDK
const mockS3 = {
    upload: jest.fn(),
    getObject: jest.fn(),
    deleteObject: jest.fn(),
    headObject: jest.fn()
};

jest.mock('aws-sdk', () => ({
    S3: jest.fn(() => mockS3)
}));

// Mock archiver
const mockArchive = {
    on: jest.fn(),
    pipe: jest.fn(),
    append: jest.fn(),
    finalize: jest.fn()
};

jest.mock('archiver', () => jest.fn(() => mockArchive));

// Mock stream
const mockPassThrough = {
    pipe: jest.fn()
};

jest.mock('stream', () => ({
    PassThrough: jest.fn(() => mockPassThrough)
}));

// Set environment variables before requiring the module
process.env.PROJECT_ID = 'test-project';
process.env.EXPORT_FILES_BUCKET = 'test-bucket';

const { handler } = require('./index');

describe('ZIP Packager Lambda', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        
        // Set up environment variables
        process.env.PROJECT_ID = 'test-project';
        process.env.EXPORT_FILES_BUCKET = 'test-bucket';
        
        // Default mock implementations
        mockS3.upload.mockReturnValue({
            promise: () => Promise.resolve({
                Location: 'https://test-bucket.s3.amazonaws.com/exports/test-project/test-export.zip'
            })
        });
        
        mockS3.getObject.mockReturnValue({
            createReadStream: () => ({
                pipe: jest.fn()
            })
        });
        
        mockS3.deleteObject.mockReturnValue({
            promise: () => Promise.resolve()
        });
        
        mockS3.headObject.mockReturnValue({
            promise: () => Promise.resolve({
                ContentLength: 1024000
            })
        });
        
        // Mock archive events
        mockArchive.on.mockImplementation((event, callback) => {
            if (event === 'error' || event === 'warning') {
                // Store callbacks for later use if needed
            }
        });
    });

    describe('Successful ZIP creation', () => {
        test('should create ZIP file with multiple Excel files', async () => {
            const event = {
                projectId: 'test-project',
                exportId: 'test-export',
                excelFiles: [
                    {
                        fileName: 'skills.xlsx',
                        s3Key: 'temp/test-export/skills.xlsx'
                    },
                    {
                        fileName: 'applications.xlsx',
                        s3Key: 'temp/test-export/applications.xlsx'
                    }
                ]
            };

            const result = await handler(event);

            expect(result.success).toBe(true);
            expect(result.zipFile).toBe('exports/test-project/test-export.zip');
            expect(result.fileSizeBytes).toBe(1024000);
            expect(result.totalFiles).toBe(2);
            expect(result.timestamp).toBeDefined();
        });

        test('should upload ZIP file to correct S3 location', async () => {
            const event = {
                projectId: 'test-project',
                exportId: 'test-export',
                excelFiles: [
                    {
                        fileName: 'test.xlsx',
                        s3Key: 'temp/test-export/test.xlsx'
                    }
                ]
            };

            await handler(event);

            expect(mockS3.upload).toHaveBeenCalledWith(
                expect.objectContaining({
                    Bucket: 'test-bucket',
                    Key: 'exports/test-project/test-export.zip',
                    ContentType: 'application/zip',
                    Metadata: expect.objectContaining({
                        projectId: 'test-project',
                        exportId: 'test-export',
                        fileCount: '1'
                    })
                })
            );
        });

        test('should add all files to archive', async () => {
            const event = {
                projectId: 'test-project',
                exportId: 'test-export',
                excelFiles: [
                    {
                        fileName: 'file1.xlsx',
                        s3Key: 'temp/test-export/file1.xlsx'
                    },
                    {
                        fileName: 'file2.xlsx',
                        s3Key: 'temp/test-export/file2.xlsx'
                    }
                ]
            };

            await handler(event);

            expect(mockArchive.append).toHaveBeenCalledTimes(2);
            expect(mockArchive.finalize).toHaveBeenCalled();
        });

        test('should clean up temporary files after ZIP creation', async () => {
            const event = {
                projectId: 'test-project',
                exportId: 'test-export',
                excelFiles: [
                    {
                        fileName: 'file1.xlsx',
                        s3Key: 'temp/test-export/file1.xlsx'
                    },
                    {
                        fileName: 'file2.xlsx',
                        s3Key: 'temp/test-export/file2.xlsx'
                    }
                ]
            };

            await handler(event);

            expect(mockS3.deleteObject).toHaveBeenCalledTimes(2);
            expect(mockS3.deleteObject).toHaveBeenCalledWith({
                Bucket: 'test-bucket',
                Key: 'temp/test-export/file1.xlsx'
            });
            expect(mockS3.deleteObject).toHaveBeenCalledWith({
                Bucket: 'test-bucket',
                Key: 'temp/test-export/file2.xlsx'
            });
        });
    });

    describe('Error handling', () => {
        test('should throw error when no Excel files provided', async () => {
            const event = {
                projectId: 'test-project',
                exportId: 'test-export',
                excelFiles: []
            };

            await expect(handler(event)).rejects.toThrow('No Excel files provided for packaging');
        });

        test('should throw error when excelFiles is undefined', async () => {
            const event = {
                projectId: 'test-project',
                exportId: 'test-export'
            };

            await expect(handler(event)).rejects.toThrow('No Excel files provided for packaging');
        });

        test('should handle S3 upload failure', async () => {
            mockS3.upload.mockReturnValue({
                promise: () => Promise.reject(new Error('S3 upload failed'))
            });

            const event = {
                projectId: 'test-project',
                exportId: 'test-export',
                excelFiles: [
                    {
                        fileName: 'test.xlsx',
                        s3Key: 'temp/test-export/test.xlsx'
                    }
                ]
            };

            await expect(handler(event)).rejects.toThrow('Failed to package ZIP file: S3 upload failed');
        });

        test('should continue cleanup even if some file deletions fail', async () => {
            // Make first delete fail, second succeed
            mockS3.deleteObject
                .mockReturnValueOnce({
                    promise: () => Promise.reject(new Error('Delete failed'))
                })
                .mockReturnValueOnce({
                    promise: () => Promise.resolve()
                });

            const event = {
                projectId: 'test-project',
                exportId: 'test-export',
                excelFiles: [
                    {
                        fileName: 'file1.xlsx',
                        s3Key: 'temp/test-export/file1.xlsx'
                    },
                    {
                        fileName: 'file2.xlsx',
                        s3Key: 'temp/test-export/file2.xlsx'
                    }
                ]
            };

            // Should not throw error even if cleanup partially fails
            const result = await handler(event);
            expect(result.success).toBe(true);
        });
    });

    describe('File lifecycle management', () => {
        test('should store ZIP in permanent location', async () => {
            const event = {
                projectId: 'test-project',
                exportId: 'test-export',
                excelFiles: [
                    {
                        fileName: 'test.xlsx',
                        s3Key: 'temp/test-export/test.xlsx'
                    }
                ]
            };

            const result = await handler(event);

            // ZIP should be stored in permanent exports folder
            expect(result.zipFile).toBe('exports/test-project/test-export.zip');
            expect(mockS3.upload).toHaveBeenCalledWith(
                expect.objectContaining({
                    Key: 'exports/test-project/test-export.zip'
                })
            );
        });

        test('should include metadata in ZIP file', async () => {
            const event = {
                projectId: 'test-project-123',
                exportId: 'export-456',
                excelFiles: [
                    {
                        fileName: 'test.xlsx',
                        s3Key: 'temp/export-456/test.xlsx'
                    }
                ]
            };

            await handler(event);

            expect(mockS3.upload).toHaveBeenCalledWith(
                expect.objectContaining({
                    Metadata: expect.objectContaining({
                        projectId: 'test-project-123',
                        exportId: 'export-456',
                        fileCount: '1',
                        createdAt: expect.any(String)
                    })
                })
            );
        });
    });

    describe('ZIP compression', () => {
        test('should use maximum compression level', async () => {
            const archiver = require('archiver');
            
            const event = {
                projectId: 'test-project',
                exportId: 'test-export',
                excelFiles: [
                    {
                        fileName: 'test.xlsx',
                        s3Key: 'temp/test-export/test.xlsx'
                    }
                ]
            };

            await handler(event);

            expect(archiver).toHaveBeenCalledWith('zip', {
                zlib: { level: 9 }
            });
        });
    });
});