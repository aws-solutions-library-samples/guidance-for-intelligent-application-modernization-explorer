/**
 * Validation functions for Advanced Data Export System
 * Implements validation requirements from specifications
 */

import { ExportRequest, CategoryDefinition, ExportJob } from '../types/export';

/**
 * Validation error interface
 */
export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Validates an export request according to requirements 1.3 and 1.5
 * @param request - The export request to validate
 * @param availableCategories - Array of available category definitions
 * @returns Validation result with any errors
 */
export function validateExportRequest(
  request: ExportRequest,
  availableCategories: CategoryDefinition[]
): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate projectId is present and non-empty
  if (!request.projectId || request.projectId.trim() === '') {
    errors.push({
      field: 'projectId',
      message: 'Project ID is required and cannot be empty'
    });
  }

  // Validate userId is present and non-empty
  if (!request.userId || request.userId.trim() === '') {
    errors.push({
      field: 'userId',
      message: 'User ID is required and cannot be empty'
    });
  }

  // Validate selectedCategories array
  if (!Array.isArray(request.selectedCategories)) {
    errors.push({
      field: 'selectedCategories',
      message: 'Selected categories must be an array'
    });
  } else {
    // Requirement 1.3: At least one category must be selected
    if (request.selectedCategories.length === 0) {
      errors.push({
        field: 'selectedCategories',
        message: 'At least one category must be selected for export'
      });
    }

    // Validate each selected category exists in available categories
    const availableCategoryIds = availableCategories.map(cat => cat.id);
    const invalidCategories = request.selectedCategories.filter(
      categoryId => !availableCategoryIds.includes(categoryId)
    );

    if (invalidCategories.length > 0) {
      errors.push({
        field: 'selectedCategories',
        message: `Invalid category IDs: ${invalidCategories.join(', ')}`
      });
    }

    // Check for duplicate category selections
    const uniqueCategories = new Set(request.selectedCategories);
    if (uniqueCategories.size !== request.selectedCategories.length) {
      errors.push({
        field: 'selectedCategories',
        message: 'Duplicate categories are not allowed'
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates category dependencies are met
 * @param selectedCategories - Array of selected category IDs
 * @param availableCategories - Array of available category definitions
 * @returns Validation result with dependency errors
 */
export function validateCategoryDependencies(
  selectedCategories: string[],
  availableCategories: CategoryDefinition[]
): ValidationResult {
  const errors: ValidationError[] = [];
  const categoryMap = new Map(availableCategories.map(cat => [cat.id, cat]));

  for (const categoryId of selectedCategories) {
    const category = categoryMap.get(categoryId);
    if (category && category.dependencies) {
      const missingDependencies = category.dependencies.filter(
        depId => !selectedCategories.includes(depId)
      );

      if (missingDependencies.length > 0) {
        const dependencyNames = missingDependencies
          .map(depId => categoryMap.get(depId)?.name || depId)
          .join(', ');
        
        errors.push({
          field: 'selectedCategories',
          message: `Category "${category.name}" requires the following dependencies: ${dependencyNames}`
        });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates export job data integrity
 * @param exportJob - The export job to validate
 * @returns Validation result with any errors
 */
export function validateExportJob(exportJob: ExportJob): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate required fields
  if (!exportJob.exportId || exportJob.exportId.trim() === '') {
    errors.push({
      field: 'exportId',
      message: 'Export ID is required and cannot be empty'
    });
  }

  if (!exportJob.projectId || exportJob.projectId.trim() === '') {
    errors.push({
      field: 'projectId',
      message: 'Project ID is required and cannot be empty'
    });
  }

  if (!exportJob.userId || exportJob.userId.trim() === '') {
    errors.push({
      field: 'userId',
      message: 'User ID is required and cannot be empty'
    });
  }

  if (!exportJob.processTrackingId || exportJob.processTrackingId.trim() === '') {
    errors.push({
      field: 'processTrackingId',
      message: 'Process tracking ID is required and cannot be empty'
    });
  }

  // Validate selectedCategories
  if (!Array.isArray(exportJob.selectedCategories) || exportJob.selectedCategories.length === 0) {
    errors.push({
      field: 'selectedCategories',
      message: 'At least one category must be selected'
    });
  }

  // Validate status
  const validStatuses = ['INITIATED', 'PROCESSING', 'COMPLETED', 'FAILED'];
  if (!validStatuses.includes(exportJob.status)) {
    errors.push({
      field: 'status',
      message: `Status must be one of: ${validStatuses.join(', ')}`
    });
  }

  // Validate timestamps
  if (!exportJob.createdAt || !isValidISOTimestamp(exportJob.createdAt)) {
    errors.push({
      field: 'createdAt',
      message: 'Created at must be a valid ISO timestamp'
    });
  }

  if (exportJob.completedAt && !isValidISOTimestamp(exportJob.completedAt)) {
    errors.push({
      field: 'completedAt',
      message: 'Completed at must be a valid ISO timestamp'
    });
  }

  // Validate metadata
  if (!exportJob.metadata) {
    errors.push({
      field: 'metadata',
      message: 'Metadata is required'
    });
  } else {
    if (typeof exportJob.metadata.totalFiles !== 'number' || exportJob.metadata.totalFiles < 0) {
      errors.push({
        field: 'metadata.totalFiles',
        message: 'Total files must be a non-negative number'
      });
    }

    if (typeof exportJob.metadata.zipSizeBytes !== 'number' || exportJob.metadata.zipSizeBytes < 0) {
      errors.push({
        field: 'metadata.zipSizeBytes',
        message: 'ZIP size bytes must be a non-negative number'
      });
    }

    if (typeof exportJob.metadata.processingTimeMs !== 'number' || exportJob.metadata.processingTimeMs < 0) {
      errors.push({
        field: 'metadata.processingTimeMs',
        message: 'Processing time must be a non-negative number'
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates if a string is a valid ISO timestamp
 * @param timestamp - The timestamp string to validate
 * @returns True if valid ISO timestamp, false otherwise
 */
function isValidISOTimestamp(timestamp: string): boolean {
  try {
    const date = new Date(timestamp);
    return date.toISOString() === timestamp;
  } catch {
    return false;
  }
}

/**
 * Validates pagination parameters
 * @param page - Page number (1-based)
 * @param pageSize - Number of records per page
 * @returns Validation result with any errors
 */
export function validatePagination(page: number, pageSize: number): ValidationResult {
  const errors: ValidationError[] = [];

  if (!Number.isInteger(page) || page < 1) {
    errors.push({
      field: 'page',
      message: 'Page must be a positive integer starting from 1'
    });
  }

  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    errors.push({
      field: 'pageSize',
      message: 'Page size must be an integer between 1 and 100'
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validates export ID format (should be UUID)
 * @param exportId - The export ID to validate
 * @returns True if valid UUID format, false otherwise
 */
export function validateExportId(exportId: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(exportId);
}