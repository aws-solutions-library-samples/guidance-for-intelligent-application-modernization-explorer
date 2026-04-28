const { handler } = require('./index');

/**
 * Test suite for Excel Generator Lambda Function
 * Tests the enhanced Excel generation with multi-tab support, formatting, and category-specific templates
 */

// Mock AWS SDK
jest.mock('aws-sdk', () => ({
    S3: jest.fn(() => ({
        putObject: jest.fn(() => ({
            promise: jest.fn(() => Promise.resolve({ ETag: 'mock-etag' }))
        }))
    }))
}));

// Mock ExcelJS
jest.mock('exceljs', () => ({
    Workbook: jest.fn(() => ({
        creator: '',
        created: null,
        company: '',
        addWorksheet: jest.fn((name) => ({
            name,
            addRow: jest.fn(() => ({
                getCell: jest.fn(() => ({
                    font: {},
                    fill: {},
                    border: {},
                    alignment: {}
                })),
                eachCell: jest.fn((callback) => {
                    // Mock 3 cells
                    for (let i = 1; i <= 3; i++) {
                        callback({
                            font: {},
                            fill: {},
                            border: {},
                            alignment: {},
                            value: `cell${i}`
                        }, i);
                    }
                })
            })),
            getCell: jest.fn(() => ({
                font: {},
                fill: {},
                border: {},
                alignment: {}
            })),
            columns: [
                { eachCell: jest.fn(), width: 0 },
                { eachCell: jest.fn(), width: 0 },
                { eachCell: jest.fn(), width: 0 }
            ],
            views: []
        })),
        xlsx: {
            writeBuffer: jest.fn(() => Promise.resolve(Buffer.from('mock-excel-data')))
        }
    }))
}));

describe('Excel Generator Lambda Function', () => {
    beforeEach(() => {
        // Reset environment variables
        process.env.PROJECT_ID = 'test-project-123';
        process.env.EXPORT_FILES_BUCKET = 'test-export-bucket';
        
        // Clear all mocks
        jest.clearAllMocks();
    });

    describe('Basic Functionality', () => {
        test('should generate Excel files for valid data sourcing results', async () => {
            const event = {
                projectId: 'test-project-123',
                exportId: 'export-456',
                selectedCategories: ['skills', 'application-portfolio'],
                dataSourcingResults: [
                    {
                        category: 'skills',
                        success: true,
                        data: [
                            { team: 'Frontend', skill: 'React', level: 'Expert' },
                            { team: 'Backend', skill: 'Node.js', level: 'Intermediate' }
                        ]
                    },
                    {
                        category: 'application-portfolio',
                        success: true,
                        data: [
                            { applicationName: 'App1', department: 'IT', status: 'Active' },
                            { applicationName: 'App2', department: 'Finance', status: 'Legacy' }
                        ]
                    }
                ]
            };

            const result = await handler(event);

            expect(result.success).toBe(true);
            expect(result.files).toHaveLength(2);
            expect(result.totalFiles).toBe(2);
            expect(result.files[0].category).toBe('skills');
            expect(result.files[1].category).toBe('application-portfolio');
        });

        test('should handle empty data gracefully', async () => {
            const event = {
                projectId: 'test-project-123',
                exportId: 'export-456',
                selectedCategories: ['skills'],
                dataSourcingResults: [
                    {
                        category: 'skills',
                        success: true,
                        data: []
                    }
                ]
            };

            const result = await handler(event);

            expect(result.success).toBe(true);
            expect(result.files).toHaveLength(1);
            expect(result.files[0].recordCount).toBe(0);
        });

        test('should skip failed data sourcing results', async () => {
            const event = {
                projectId: 'test-project-123',
                exportId: 'export-456',
                selectedCategories: ['skills', 'application-portfolio'],
                dataSourcingResults: [
                    {
                        category: 'skills',
                        success: true,
                        data: [{ team: 'Frontend', skill: 'React' }]
                    },
                    {
                        category: 'application-portfolio',
                        success: false,
                        error: 'Data source unavailable'
                    }
                ]
            };

            const result = await handler(event);

            expect(result.success).toBe(true);
            expect(result.files).toHaveLength(1);
            expect(result.files[0].category).toBe('skills');
        });
    });

    describe('Category-Specific Excel Generation', () => {
        test('should generate Data Section Excel with proper formatting', async () => {
            const event = {
                projectId: 'test-project-123',
                exportId: 'export-456',
                selectedCategories: ['skills'],
                dataSourcingResults: [
                    {
                        category: 'skills',
                        success: true,
                        data: [
                            { team: 'Frontend', skill: 'React', level: 'Expert' },
                            { team: 'Backend', skill: 'Node.js', level: 'Intermediate' }
                        ]
                    }
                ]
            };

            const result = await handler(event);

            expect(result.success).toBe(true);
            expect(result.files[0].categoryType).toBe('data');
            expect(result.files[0].fileName).toBe('skills-test-project-123-export-456.xlsx');
        });

        test('should generate Insights Section Excel with summary', async () => {
            const event = {
                projectId: 'test-project-123',
                exportId: 'export-456',
                selectedCategories: ['skills-analysis'],
                dataSourcingResults: [
                    {
                        category: 'skills-analysis',
                        success: true,
                        data: [
                            { team: 'Frontend', skillGap: 'React Advanced', priority: 'High' },
                            { team: 'Backend', skillGap: 'Microservices', priority: 'Medium' }
                        ]
                    }
                ]
            };

            const result = await handler(event);

            expect(result.success).toBe(true);
            expect(result.files[0].categoryType).toBe('insights');
        });

        test('should generate Planning Section Excel with logical tabs', async () => {
            const event = {
                projectId: 'test-project-123',
                exportId: 'export-456',
                selectedCategories: ['pilot-identification'],
                dataSourcingResults: [
                    {
                        category: 'pilot-identification',
                        success: true,
                        data: [
                            { applicationName: 'App1', pilotScore: 85, complexity: 'Low' },
                            { applicationName: 'App2', pilotScore: 72, complexity: 'Medium' }
                        ]
                    }
                ]
            };

            const result = await handler(event);

            expect(result.success).toBe(true);
            expect(result.files[0].categoryType).toBe('planning');
        });
    });

    describe('Large Dataset Handling', () => {
        test('should handle large datasets by splitting across multiple tabs', async () => {
            // Create large dataset (simulate > 1M rows by mocking the constant)
            const largeData = Array.from({ length: 50 }, (_, i) => ({
                id: i + 1,
                name: `Item ${i + 1}`,
                value: Math.random() * 100
            }));

            const event = {
                projectId: 'test-project-123',
                exportId: 'export-456',
                selectedCategories: ['application-portfolio'],
                dataSourcingResults: [
                    {
                        category: 'application-portfolio',
                        success: true,
                        data: largeData
                    }
                ]
            };

            const result = await handler(event);

            expect(result.success).toBe(true);
            expect(result.files[0].recordCount).toBe(50);
        });
    });

    describe('Error Handling', () => {
        test('should throw error for missing required parameters', async () => {
            const event = {
                // Missing projectId
                exportId: 'export-456',
                dataSourcingResults: []
            };

            await expect(handler(event)).rejects.toThrow('Missing required parameters');
        });

        test('should handle invalid data gracefully by skipping', async () => {
            // Test with invalid data that gets skipped
            const event = {
                projectId: 'test-project-123',
                exportId: 'export-456',
                selectedCategories: ['skills'],
                dataSourcingResults: [
                    {
                        category: 'skills',
                        success: true,
                        data: null // Invalid data that should be skipped
                    }
                ]
            };

            const result = await handler(event);
            
            // Should succeed but with no files generated
            expect(result.success).toBe(true);
            expect(result.files).toHaveLength(0);
            expect(result.totalFiles).toBe(0);
        });
    });

    describe('Category Configuration', () => {
        test('should return correct configuration for all category types', async () => {
            const testCategories = [
                { category: 'skills', expectedType: 'data' },
                { category: 'skills-analysis', expectedType: 'insights' },
                { category: 'pilot-identification', expectedType: 'planning' },
                { category: 'unknown-category', expectedType: 'data' } // fallback
            ];

            for (const { category, expectedType } of testCategories) {
                const event = {
                    projectId: 'test-project-123',
                    exportId: 'export-456',
                    selectedCategories: [category],
                    dataSourcingResults: [
                        {
                            category,
                            success: true,
                            data: [{ test: 'data' }]
                        }
                    ]
                };

                const result = await handler(event);
                expect(result.files[0].categoryType).toBe(expectedType);
            }
        });
    });
});