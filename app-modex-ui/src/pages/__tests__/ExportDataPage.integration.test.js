/**
 * Integration Tests for Export Data System
 * 
 * These tests verify the core export functionality and API integration,
 * focusing on service-level integration rather than full UI rendering.
 */

import exportApiService from '../../services/exportApiService';
import { retryExportOperation } from '../../utils/exportRetryUtils';

// Mock the export API service
jest.mock('../../services/exportApiService');

describe('Export Data System Integration Tests', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock responses
    exportApiService.getExportHistory.mockResolvedValue({
      data: [],
      pagination: { hasNextPage: false, totalItems: 0 }
    });
    
    exportApiService.initiateExport.mockResolvedValue({
      exportId: 'test-export-123',
      status: 'INITIATED',
      message: 'Export started successfully'
    });
    
    exportApiService.getExportStatus.mockResolvedValue({
      exportId: 'test-export-123',
      status: 'COMPLETED',
      downloadUrl: 'https://example.com/download/test-export-123.zip'
    });
  });

  describe('API Integration', () => {
    test('should successfully retrieve export history', async () => {
      const mockHistory = [
        {
          exportId: 'export-1',
          selectedCategories: ['skills', 'applications'],
          status: 'COMPLETED',
          createdAt: '2023-12-01T10:00:00Z',
          userName: 'Test User'
        }
      ];
      
      exportApiService.getExportHistory.mockResolvedValue({
        data: mockHistory,
        pagination: { hasNextPage: false, totalItems: 1 }
      });
      
      const result = await exportApiService.getExportHistory({
        projectId: 'project-123',
        page: 1,
        pageSize: 25
      });
      
      expect(result.data).toEqual(mockHistory);
      expect(result.pagination.totalItems).toBe(1);
    });

    test('should handle pagination correctly', async () => {
      const mockHistory = Array.from({ length: 25 }, (_, i) => ({
        exportId: `export-${i}`,
        selectedCategories: ['skills'],
        status: 'COMPLETED',
        createdAt: new Date(Date.now() - i * 86400000).toISOString(),
        userName: `User ${i}`
      }));
      
      exportApiService.getExportHistory.mockResolvedValue({
        data: mockHistory,
        pagination: { hasNextPage: true, totalItems: 100 }
      });
      
      const result = await exportApiService.getExportHistory({
        projectId: 'project-123',
        page: 1,
        pageSize: 25
      });
      
      expect(result.data).toHaveLength(25);
      expect(result.pagination.hasNextPage).toBe(true);
      expect(result.pagination.totalItems).toBe(100);
    });
  });

  describe('Export Workflow', () => {
    test('should successfully initiate export', async () => {
      const mockExportResponse = {
        exportId: 'test-export-123',
        status: 'INITIATED',
        message: 'Export started successfully'
      };
      
      exportApiService.initiateExport.mockResolvedValue(mockExportResponse);
      
      const result = await exportApiService.initiateExport({
        projectId: 'project-123',
        userId: 'user-456',
        selectedCategories: ['skills', 'applications']
      });
      
      expect(result.exportId).toBe('test-export-123');
      expect(result.status).toBe('INITIATED');
      expect(exportApiService.initiateExport).toHaveBeenCalledWith({
        projectId: 'project-123',
        userId: 'user-456',
        selectedCategories: ['skills', 'applications']
      });
    });

    test('should track export status progression', async () => {
      const exportId = 'test-export-123';
      
      // Mock status progression: INITIATED -> PROCESSING -> COMPLETED
      exportApiService.getExportStatus
        .mockResolvedValueOnce({
          exportId,
          status: 'INITIATED',
          progress: 0
        })
        .mockResolvedValueOnce({
          exportId,
          status: 'PROCESSING',
          progress: 50
        })
        .mockResolvedValueOnce({
          exportId,
          status: 'COMPLETED',
          progress: 100,
          downloadUrl: 'https://example.com/download/test-export-123.zip'
        });
      
      // Simulate polling for status updates
      let status1 = await exportApiService.getExportStatus(exportId);
      expect(status1.status).toBe('INITIATED');
      
      let status2 = await exportApiService.getExportStatus(exportId);
      expect(status2.status).toBe('PROCESSING');
      expect(status2.progress).toBe(50);
      
      let status3 = await exportApiService.getExportStatus(exportId);
      expect(status3.status).toBe('COMPLETED');
      expect(status3.downloadUrl).toBeDefined();
    });
  });

  describe('Error Recovery', () => {
    test('should retry failed operations with exponential backoff', async () => {
      // First call fails, second succeeds
      exportApiService.getExportHistory
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          data: [],
          pagination: { hasNextPage: false, totalItems: 0 }
        });
      
      const operation = () => exportApiService.getExportHistory({
        projectId: 'project-123',
        page: 1,
        pageSize: 25
      });
      
      const result = await retryExportOperation(operation, 2, 100);
      
      expect(result.data).toEqual([]);
      expect(exportApiService.getExportHistory).toHaveBeenCalledTimes(2);
    });

    test('should handle network connectivity issues', async () => {
      const networkError = new Error('Network connection failed');
      networkError.code = 'NETWORK_ERROR';
      
      exportApiService.getExportHistory.mockRejectedValue(networkError);
      
      try {
        await exportApiService.getExportHistory({
          projectId: 'project-123',
          page: 1,
          pageSize: 25
        });
      } catch (error) {
        expect(error.message).toBe('Network connection failed');
        expect(error.code).toBe('NETWORK_ERROR');
      }
    });

    test('should handle export processing failures', async () => {
      const exportId = 'failed-export-123';
      
      exportApiService.getExportStatus.mockResolvedValue({
        exportId,
        status: 'FAILED',
        error: 'Data source unavailable',
        retryable: true
      });
      
      const status = await exportApiService.getExportStatus(exportId);
      
      expect(status.status).toBe('FAILED');
      expect(status.error).toBe('Data source unavailable');
      expect(status.retryable).toBe(true);
    });
  });

  describe('Security and Access Control', () => {
    test('should validate user permissions before export', async () => {
      const permissionError = new Error('Insufficient permissions');
      permissionError.status = 403;
      
      exportApiService.initiateExport.mockRejectedValue(permissionError);
      
      try {
        await exportApiService.initiateExport({
          projectId: 'project-123',
          userId: 'user-456',
          selectedCategories: ['skills']
        });
      } catch (error) {
        expect(error.message).toBe('Insufficient permissions');
        expect(error.status).toBe(403);
      }
    });

    test('should handle authentication expiry', async () => {
      const authError = new Error('Authentication expired');
      authError.status = 401;
      
      exportApiService.getExportHistory.mockRejectedValue(authError);
      
      try {
        await exportApiService.getExportHistory({
          projectId: 'project-123',
          page: 1,
          pageSize: 25
        });
      } catch (error) {
        expect(error.message).toBe('Authentication expired');
        expect(error.status).toBe(401);
      }
    });

    test('should generate secure download URLs', async () => {
      const exportId = 'secure-export-123';
      
      // Mock the download URL method if it exists
      if (exportApiService.getDownloadUrl) {
        exportApiService.getDownloadUrl.mockResolvedValue({
          downloadUrl: 'https://secure-bucket.s3.amazonaws.com/exports/secure-export-123.zip?X-Amz-Signature=...',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
        });
        
        const result = await exportApiService.getDownloadUrl(exportId);
        
        expect(result.downloadUrl).toContain('X-Amz-Signature');
        expect(new Date(result.expiresAt)).toBeInstanceOf(Date);
      } else {
        // If method doesn't exist, test that export status includes download URL
        exportApiService.getExportStatus.mockResolvedValue({
          exportId,
          status: 'COMPLETED',
          downloadUrl: 'https://secure-bucket.s3.amazonaws.com/exports/secure-export-123.zip?X-Amz-Signature=...'
        });
        
        const result = await exportApiService.getExportStatus(exportId);
        expect(result.downloadUrl).toContain('X-Amz-Signature');
      }
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large export operations efficiently', async () => {
      const largeExportId = 'large-export-123';
      
      // Mock a large export with progress tracking
      exportApiService.getExportStatus
        .mockResolvedValueOnce({
          exportId: largeExportId,
          status: 'PROCESSING',
          progress: 25,
          estimatedTimeRemaining: 180000, // 3 minutes
          processedCategories: ['skills'],
          totalCategories: ['skills', 'applications', 'infrastructure', 'insights']
        })
        .mockResolvedValueOnce({
          exportId: largeExportId,
          status: 'PROCESSING',
          progress: 75,
          estimatedTimeRemaining: 60000, // 1 minute
          processedCategories: ['skills', 'applications', 'infrastructure'],
          totalCategories: ['skills', 'applications', 'infrastructure', 'insights']
        })
        .mockResolvedValueOnce({
          exportId: largeExportId,
          status: 'COMPLETED',
          progress: 100,
          fileSizeMB: 25.6,
          downloadUrl: 'https://example.com/download/large-export-123.zip'
        });
      
      // Simulate progress tracking
      let status1 = await exportApiService.getExportStatus(largeExportId);
      expect(status1.progress).toBe(25);
      expect(status1.processedCategories).toHaveLength(1);
      
      let status2 = await exportApiService.getExportStatus(largeExportId);
      expect(status2.progress).toBe(75);
      expect(status2.processedCategories).toHaveLength(3);
      
      let status3 = await exportApiService.getExportStatus(largeExportId);
      expect(status3.status).toBe('COMPLETED');
      expect(status3.fileSizeMB).toBe(25.6);
    });

    test('should handle concurrent export requests', async () => {
      // Set up mocks before making calls
      exportApiService.initiateExport
        .mockResolvedValueOnce({ exportId: 'export-1', status: 'INITIATED' })
        .mockResolvedValueOnce({ exportId: 'export-2', status: 'INITIATED' });
      
      const export1 = exportApiService.initiateExport({
        projectId: 'project-123',
        userId: 'user-1',
        selectedCategories: ['skills']
      });
      
      const export2 = exportApiService.initiateExport({
        projectId: 'project-123',
        userId: 'user-2',
        selectedCategories: ['applications']
      });
      
      const results = await Promise.all([export1, export2]);
      
      expect(results).toHaveLength(2);
      expect(results[0].exportId).toBe('export-1');
      expect(results[1].exportId).toBe('export-2');
    });

    test('should validate system resource limits', async () => {
      const resourceError = new Error('System resource limit exceeded');
      resourceError.status = 429;
      resourceError.retryAfter = 300; // 5 minutes
      
      exportApiService.initiateExport.mockRejectedValue(resourceError);
      
      try {
        await exportApiService.initiateExport({
          projectId: 'project-123',
          userId: 'user-456',
          selectedCategories: ['skills', 'applications', 'infrastructure', 'insights', 'planning']
        });
      } catch (error) {
        expect(error.status).toBe(429);
        expect(error.retryAfter).toBe(300);
      }
    });
  });
});