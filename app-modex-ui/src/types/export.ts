/**
 * TypeScript interfaces for Advanced Data Export System
 * Based on design document specifications
 */

/**
 * Export job status enumeration
 */
export type ExportStatus = 'INITIATED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/**
 * Export category types
 */
export type CategoryType = 'data' | 'insights' | 'planning';

/**
 * Export job interface representing a single export generation request
 */
export interface ExportJob {
  /** Unique identifier for the export job (UUID) */
  exportId: string;
  /** Project identifier */
  projectId: string;
  /** User identifier who initiated the export */
  userId: string;
  /** Array of selected category IDs for export */
  selectedCategories: string[];
  /** Current status of the export job */
  status: ExportStatus;
  /** ISO timestamp when the export was created */
  createdAt: string;
  /** ISO timestamp when the export was completed (optional) */
  completedAt?: string;
  /** Signed S3 URL for downloading the export (optional) */
  downloadUrl?: string;
  /** Reference to process tracking system */
  processTrackingId: string;
  /** Additional metadata about the export */
  metadata: {
    /** Total number of files in the export */
    totalFiles: number;
    /** Size of the ZIP file in bytes */
    zipSizeBytes: number;
    /** Processing time in milliseconds */
    processingTimeMs: number;
  };
}

/**
 * Category definition interface for export categories
 */
export interface CategoryDefinition {
  /** Unique identifier for the category */
  id: string;
  /** Display name for the category */
  name: string;
  /** Type of category (data, insights, or planning) */
  type: CategoryType;
  /** Data source identifier (DynamoDB table or Athena view) */
  dataSource: string;
  /** Excel template configuration identifier */
  excelTemplate: string;
  /** Optional array of category IDs that this category depends on */
  dependencies?: string[];
}

/**
 * Export history record interface for displaying export history
 */
export interface ExportHistoryRecord {
  /** Unique identifier for the export */
  exportId: string;
  /** Project identifier */
  projectId: string;
  /** User identifier who initiated the export */
  userId: string;
  /** Display name of the user */
  userName: string;
  /** Array of selected category names for display */
  selectedCategories: string[];
  /** Current status of the export */
  status: string;
  /** ISO timestamp when the export was created */
  createdAt: string;
  /** ISO timestamp when the export was completed (optional) */
  completedAt?: string;
  /** File size in megabytes */
  fileSizeMB: number;
  /** Number of times the export has been downloaded */
  downloadCount: number;
  /** ISO timestamp of the last download (optional) */
  lastDownloadAt?: string;
}

/**
 * Export request interface for initiating new exports
 */
export interface ExportRequest {
  /** Project identifier */
  projectId: string;
  /** User identifier */
  userId: string;
  /** Array of selected category IDs */
  selectedCategories: string[];
}

/**
 * Pagination interface for export history
 */
export interface ExportHistoryPagination {
  /** Current page number (1-based) */
  page: number;
  /** Number of records per page */
  pageSize: number;
  /** Total number of records */
  totalRecords: number;
  /** Total number of pages */
  totalPages: number;
}

/**
 * Export history response interface
 */
export interface ExportHistoryResponse {
  /** Array of export history records */
  records: ExportHistoryRecord[];
  /** Pagination information */
  pagination: ExportHistoryPagination;
}

/**
 * Category tree interface for hierarchical display
 */
export interface CategoryTree {
  /** Category type */
  type: CategoryType;
  /** Display name for the category type */
  name: string;
  /** Array of categories under this type */
  categories: CategoryDefinition[];
  /** Optional subcategories for nested structure */
  subcategories?: CategoryTree[];
}