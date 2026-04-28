#!/bin/bash

# Setup S3 folder structure for export system
# This script creates the necessary folder structure in the export S3 bucket

set -e

# Check if bucket name is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <export-bucket-name>"
    echo "Example: $0 app-modex-exports-123456789012"
    exit 1
fi

BUCKET_NAME=$1

echo "Setting up S3 folder structure for export system in bucket: $BUCKET_NAME"

# Create folder structure by uploading empty objects
aws s3api put-object --bucket "$BUCKET_NAME" --key "temp/" --content-length 0
aws s3api put-object --bucket "$BUCKET_NAME" --key "exports/" --content-length 0

echo "Folder structure created:"
echo "  s3://$BUCKET_NAME/temp/     - Temporary files during processing"
echo "  s3://$BUCKET_NAME/exports/  - Final export ZIP files"

echo "Export S3 folder structure setup completed successfully!"