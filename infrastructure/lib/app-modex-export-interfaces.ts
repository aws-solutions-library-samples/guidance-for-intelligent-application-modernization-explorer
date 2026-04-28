import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

/**
 * Export Job interface for DynamoDB table structure
 */
export interface ExportJobRecord {
  exportId: string;           // UUID - Partition Key
  projectId: string;          // Project identifier
  userId: string;             // User who initiated the export
  selectedCategories: string[]; // Array of selected export categories
  status: 'INITIATED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: string;          // ISO timestamp
  completedAt?: string;       // ISO timestamp
  downloadUrl?: string;       // Signed S3 URL
  processTrackingId: string;  // Reference to process tracking
  metadata: {
    totalFiles: number;
    zipSizeBytes: number;
    processingTimeMs: number;
  };
  ttl?: number;              // TTL for automatic cleanup (optional)
}

/**
 * Category Definition interface for export configuration
 */
export interface CategoryDefinition {
  id: string;
  name: string;
  type: 'data' | 'insights' | 'planning';
  dataSource: string;         // DynamoDB table or Athena view
  excelTemplate: string;      // Template configuration
  dependencies?: string[];    // Other categories required
}

/**
 * Export History Record interface for frontend display
 */
export interface ExportHistoryRecord {
  exportId: string;
  projectId: string;
  userId: string;
  userName: string;
  selectedCategories: string[];
  status: string;
  createdAt: string;
  completedAt?: string;
  fileSizeMB: number;
  downloadCount: number;
  lastDownloadAt?: string;
}

/**
 * DynamoDB table configuration for export history
 */
export const EXPORT_HISTORY_TABLE_CONFIG = {
  partitionKey: { name: 'exportId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'projectId', type: dynamodb.AttributeType.STRING },
  globalSecondaryIndexes: [
    {
      indexName: 'projectId-createdAt-index',
      partitionKey: { name: 'projectId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    },
    {
      indexName: 'userId-createdAt-index', 
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    },
    {
      indexName: 'status-createdAt-index',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    }
  ]
} as const;
