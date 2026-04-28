/**
 * Tests for export validation functions
 */

import {
  validateExportRequest,
  validateCategoryDependencies,
  validateExportJob,
  validatePagination,
  validateExportId
} from '../exportValidation';
import { ExportRequest, ExportJob, CategoryDefinition } from '../../types/export';

describe('Export Validation', () => {
  const mockCategories: CategoryDefinition[] = [
    {
      id: 'skills',
      name: 'Skills',
      type: 'data',
      dataSource: 'skills_table',
      excelTemplate: 'skills_template'
    },
    {
      id: 'skills-analysis',
      name: 'Skills Analysis',
      type: 'insights',
      dataSource: 'skills_analysis_view',
      excelTemplate: 'skills_analysis_template',
      dependencies: ['skills']
    }
  ];

  describe('validateExportRequest', () => {
    it('should validate a correct export request', () => {
      const request: ExportRequest = {
        projectId: 'project-123',
        userId: 'user-456',
        selectedCategories: ['skills']
      };

      const result = validateExportRequest(request, mockCategories);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty selectedCategories', () => {
      const request: ExportRequest = {
        projectId: 'project-123',
        userId: 'user-456',
        selectedCategories: []
      };

      const result = validateExportRequest(request, mockCategories);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'selectedCategories',
        message: 'At least one category must be selected for export'
      });
    });

    it('should reject invalid category IDs', () => {
      const request: ExportRequest = {
        projectId: 'project-123',
        userId: 'user-456',
        selectedCategories: ['invalid-category']
      };

      const result = validateExportRequest(request, mockCategories);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'selectedCategories',
        message: 'Invalid category IDs: invalid-category'
      });
    });

    it('should reject empty projectId', () => {
      const request: ExportRequest = {
        projectId: '',
        userId: 'user-456',
        selectedCategories: ['skills']
      };

      const result = validateExportRequest(request, mockCategories);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'projectId',
        message: 'Project ID is required and cannot be empty'
      });
    });
  });

  describe('validateCategoryDependencies', () => {
    it('should validate when dependencies are met', () => {
      const result = validateCategoryDependencies(['skills', 'skills-analysis'], mockCategories);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject when dependencies are missing', () => {
      const result = validateCategoryDependencies(['skills-analysis'], mockCategories);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'selectedCategories',
        message: 'Category "Skills Analysis" requires the following dependencies: Skills'
      });
    });
  });

  describe('validateExportJob', () => {
    it('should validate a correct export job', () => {
      const exportJob: ExportJob = {
        exportId: '123e4567-e89b-12d3-a456-426614174000',
        projectId: 'project-123',
        userId: 'user-456',
        selectedCategories: ['skills'],
        status: 'COMPLETED',
        createdAt: '2023-12-17T10:00:00.000Z',
        completedAt: '2023-12-17T10:05:00.000Z',
        processTrackingId: 'track-789',
        metadata: {
          totalFiles: 1,
          zipSizeBytes: 1024,
          processingTimeMs: 5000
        }
      };

      const result = validateExportJob(exportJob);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid status', () => {
      const exportJob: ExportJob = {
        exportId: '123e4567-e89b-12d3-a456-426614174000',
        projectId: 'project-123',
        userId: 'user-456',
        selectedCategories: ['skills'],
        status: 'INVALID' as any,
        createdAt: '2023-12-17T10:00:00.000Z',
        processTrackingId: 'track-789',
        metadata: {
          totalFiles: 1,
          zipSizeBytes: 1024,
          processingTimeMs: 5000
        }
      };

      const result = validateExportJob(exportJob);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'status',
        message: 'Status must be one of: INITIATED, PROCESSING, COMPLETED, FAILED'
      });
    });
  });

  describe('validatePagination', () => {
    it('should validate correct pagination', () => {
      const result = validatePagination(1, 25);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid page number', () => {
      const result = validatePagination(0, 25);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'page',
        message: 'Page must be a positive integer starting from 1'
      });
    });

    it('should reject invalid page size', () => {
      const result = validatePagination(1, 101);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'pageSize',
        message: 'Page size must be an integer between 1 and 100'
      });
    });
  });

  describe('validateExportId', () => {
    it('should validate correct UUID', () => {
      const result = validateExportId('123e4567-e89b-12d3-a456-426614174000');
      expect(result).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = validateExportId('invalid-uuid');
      expect(result).toBe(false);
    });
  });
});