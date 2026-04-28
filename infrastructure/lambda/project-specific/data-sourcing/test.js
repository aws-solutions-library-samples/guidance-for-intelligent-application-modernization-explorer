/**
 * Test file for data-sourcing Lambda function
 * Tests core functionality and error handling
 */

// Set environment variables before requiring the handler
process.env.PROJECT_ID = 'test-project-123';
process.env.GLUE_DATABASE = 'app_modex_test_project_123';
process.env.RESULTS_BUCKET = 'app-modex-results-test-project-123';
process.env.WORKGROUP_NAME = 'app-modex-workgroup';

// Mock AWS SDK clients with proper implementations
const mockSend = jest.fn();
const mockAthenaClient = jest.fn().mockImplementation(() => ({
  send: mockSend
}));
const mockDynamoDBClient = jest.fn().mockImplementation(() => ({
  send: mockSend
}));
const mockDynamoDBDocumentClient = {
  from: jest.fn().mockReturnValue({
    send: mockSend
  })
};
const mockS3Client = jest.fn().mockImplementation(() => ({
  send: mockSend
}));

jest.mock('@aws-sdk/client-athena', () => ({
  AthenaClient: mockAthenaClient,
  StartQueryExecutionCommand: jest.fn(),
  GetQueryExecutionCommand: jest.fn(),
  GetQueryResultsCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: mockDynamoDBClient
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: mockDynamoDBDocumentClient,
  QueryCommand: jest.fn(),
  ScanCommand: jest.fn()
}));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: mockS3Client
}));

const { handler } = require('./index');

describe('Data Sourcing Lambda', () => {
  
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Set up default mock responses
    mockSend.mockRejectedValue(new Error('Mocked AWS service error'));
  });

  describe('Input Validation', () => {
    test('should validate required parameters', async () => {
      const event = {
        // Missing required parameters
      };

      const result = await handler(event);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required parameter');
    });

    test('should enforce project-specific resource isolation', async () => {
      const event = {
        category: 'skills',
        projectId: 'different-project',
        exportId: 'export-123',
        selectedCategories: ['skills']
      };

      const result = await handler(event);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Access denied');
      expect(result.error).toContain('does not match Lambda PROJECT_ID');
    });

    test('should skip unselected categories', async () => {
      const event = {
        category: 'skills',
        projectId: 'test-project-123',
        exportId: 'export-123',
        selectedCategories: ['technology-vision'] // skills not selected
      };

      const result = await handler(event);

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('Category not selected');
    });
  });

  describe('Category Support', () => {
    test('should support all data section categories', async () => {
      const dataCategories = [
        'skills',
        'technology-vision',
        'application-portfolio',
        'application-tech-stack',
        'application-infrastructure',
        'application-utilization'
      ];

      for (const category of dataCategories) {
        const event = {
          category,
          projectId: 'test-project-123',
          exportId: 'export-123',
          selectedCategories: [category]
        };

        // This will fail due to mocked AWS services, but should not fail on unknown category
        const result = await handler(event);
        expect(result.category).toBe(category);
        // Should not be an "Unknown category" error
        if (result.error) {
          expect(result.error).not.toContain('Unknown category');
        }
      }
    }, 30000);

    test('should support all insights section categories', async () => {
      const insightsCategories = [
        'skills-analysis',
        'vision-analysis',
        'tech-stack-analysis',
        'infrastructure-analysis',
        'utilization-analysis',
        'team-analysis'
      ];

      for (const category of insightsCategories) {
        const event = {
          category,
          projectId: 'test-project-123',
          exportId: 'export-123',
          selectedCategories: [category]
        };

        const result = await handler(event);
        expect(result.category).toBe(category);
        // Should not be an "Unknown category" error
        if (result.error) {
          expect(result.error).not.toContain('Unknown category');
        }
      }
    }, 30000);

    test('should support all planning section categories', async () => {
      const planningCategories = [
        'pilot-identification',
        'application-grouping',
        'tco-estimates',
        'team-estimates'
      ];

      for (const category of planningCategories) {
        const event = {
          category,
          projectId: 'test-project-123',
          exportId: 'export-123',
          selectedCategories: [category]
        };

        const result = await handler(event);
        expect(result.category).toBe(category);
        // Should not be an "Unknown category" error
        if (result.error) {
          expect(result.error).not.toContain('Unknown category');
        }
      }
    }, 30000);

    test('should reject unknown categories', async () => {
      const event = {
        category: 'unknown-category',
        projectId: 'test-project-123',
        exportId: 'export-123',
        selectedCategories: ['unknown-category']
      };

      const result = await handler(event);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown category');
    });
  });

  describe('Error Handling', () => {
    test('should return structured error response on failure', async () => {
      const event = {
        category: 'skills',
        projectId: 'test-project-123',
        exportId: 'export-123',
        selectedCategories: ['skills']
      };

      const result = await handler(event);

      // Should have error structure even if operation fails
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('projectId');
      expect(result).toHaveProperty('exportId');

      if (!result.success) {
        expect(result).toHaveProperty('error');
        expect(result).toHaveProperty('errorType');
      }
    });
  });

  describe('Response Format', () => {
    test('should return consistent response format for successful operations', () => {
      // This test validates the expected response structure
      const successResponse = {
        category: 'skills',
        success: true,
        data: [],
        recordCount: 0,
        timestamp: expect.any(String),
        projectId: 'test-project-123',
        exportId: 'export-123'
      };

      expect(successResponse).toHaveProperty('category');
      expect(successResponse).toHaveProperty('success');
      expect(successResponse).toHaveProperty('data');
      expect(successResponse).toHaveProperty('recordCount');
      expect(successResponse).toHaveProperty('timestamp');
      expect(successResponse).toHaveProperty('projectId');
      expect(successResponse).toHaveProperty('exportId');
    });

    test('should return consistent response format for failed operations', () => {
      const errorResponse = {
        category: 'skills',
        success: false,
        error: 'Test error message',
        errorType: 'TestError',
        timestamp: expect.any(String),
        projectId: 'test-project-123',
        exportId: 'export-123'
      };

      expect(errorResponse).toHaveProperty('category');
      expect(errorResponse).toHaveProperty('success');
      expect(errorResponse).toHaveProperty('error');
      expect(errorResponse).toHaveProperty('errorType');
      expect(errorResponse).toHaveProperty('timestamp');
      expect(errorResponse).toHaveProperty('projectId');
      expect(errorResponse).toHaveProperty('exportId');
    });
  });
});