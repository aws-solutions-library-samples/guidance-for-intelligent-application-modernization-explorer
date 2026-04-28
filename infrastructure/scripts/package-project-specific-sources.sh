#!/bin/bash

# Package Project-Specific Sources Script
# Creates a zip file of project-specific Lambda functions and Step Function definitions and uploads to S3
# Handles both Node.js and Python Lambda functions with their dependencies

set -e

# Default values
PROFILE=""
REGION=""
HELP=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --profile)
      PROFILE="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --help|-h)
      HELP=true
      shift
      ;;
    *)
      echo "Unknown option $1"
      exit 1
      ;;
  esac
done

# Show help
if [ "$HELP" = true ]; then
  echo "Usage: $0 --profile <aws-profile> --region <aws-region>"
  echo ""
  echo "Options:"
  echo "  --profile    AWS profile to use"
  echo "  --region     AWS region"
  echo "  --help, -h   Show this help message"
  echo ""
  echo "Example:"
  echo "  $0 --profile gturrini --region eu-west-2"
  echo ""
  echo "Note: The deployment bucket name is automatically retrieved from the CDK stack outputs."
  exit 0
fi

# Validate required parameters
if [ -z "$PROFILE" ] || [ -z "$REGION" ]; then
  echo "Error: Missing required parameters"
  echo "Use --help for usage information"
  exit 1
fi

echo "[INFO] Packaging project-specific source files (Lambda functions and Step Function definitions)..."
echo "[INFO] Profile: $PROFILE"
echo "[INFO] Region: $REGION"

# Get deployment bucket name from CDK stack outputs
echo "[INFO] Retrieving deployment bucket name from CDK stack..."
BUCKET=$(aws cloudformation describe-stacks \
  --stack-name AppModEx-Data \
  --profile "$PROFILE" \
  --region "$REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`DeploymentBucketName`].OutputValue' \
  --output text)

if [ -z "$BUCKET" ] || [ "$BUCKET" = "None" ]; then
  echo "[ERROR] Could not retrieve deployment bucket name from CDK stack"
  echo "[ERROR] Make sure the AppModEx-Backend stack is deployed and has the DeploymentBucketName output"
  exit 1
fi

echo "[INFO] Deployment bucket: $BUCKET"

# Change to infrastructure directory
cd "$(dirname "$0")/.."

# Verify required directories exist
if [ ! -d "lambda/project-specific" ]; then
  echo "[ERROR] lambda/project-specific directory not found"
  exit 1
fi

if [ ! -d "stepfunctions/project-specific" ]; then
  echo "[ERROR] stepfunctions/project-specific directory not found"
  exit 1
fi

# Create temporary directory for packaging
TEMP_DIR=$(mktemp -d)
echo "[INFO] Using temporary directory: $TEMP_DIR"

# Copy shared Lambda layer (including node_modules)
echo "[INFO] Copying shared Lambda layer..."
mkdir -p "$TEMP_DIR/lambda/layers"
rsync -av --exclude='__pycache__' --exclude='*.pyc' --exclude='*.log' --exclude='.git' \
  lambda/layers/shared/ "$TEMP_DIR/lambda/layers/shared/"

# Copy project-specific Lambda files (including node_modules)
echo "[INFO] Copying Lambda source files..."
mkdir -p "$TEMP_DIR/lambda"
rsync -av --exclude='__pycache__' --exclude='*.pyc' --exclude='*.log' --exclude='.git' \
  lambda/project-specific/ "$TEMP_DIR/lambda/project-specific/"

# Install dependencies for shared Lambda layer
echo "[INFO] Installing dependencies for shared Lambda layer..."
if [ -f "$TEMP_DIR/lambda/layers/shared/package.json" ]; then
  echo "[INFO] Installing Node.js dependencies for shared layer..."
  cd "$TEMP_DIR/lambda/layers/shared"
  npm install --production --silent 2>/dev/null || echo "[WARN] npm install failed for shared layer, continuing..."
  cd - > /dev/null
fi

# Install dependencies for Lambda functions
echo "[INFO] Installing dependencies for Lambda functions..."
for lambda_dir in "$TEMP_DIR/lambda/project-specific"/*; do
  if [ ! -d "$lambda_dir" ]; then
    continue
  fi
  
  lambda_name=$(basename "$lambda_dir")
  
  # Check for Node.js Lambda (has package.json)
  if [ -f "$lambda_dir/package.json" ]; then
    echo "[INFO] Installing Node.js dependencies for $lambda_name..."
    cd "$lambda_dir"
    npm install --production --silent 2>/dev/null || echo "[WARN] npm install failed for $lambda_name, continuing..."
    cd - > /dev/null
  fi
  
  # Check for Python Lambda (has requirements.txt)
  if [ -f "$lambda_dir/requirements.txt" ]; then
    echo "[INFO] Installing Python dependencies for $lambda_name..."
    cd "$lambda_dir"
    
    # Check if pip is available
    if command -v pip3 &> /dev/null; then
      pip3 install -r requirements.txt -t . --quiet 2>/dev/null || echo "[WARN] pip install failed for $lambda_name, continuing..."
    elif command -v pip &> /dev/null; then
      pip install -r requirements.txt -t . --quiet 2>/dev/null || echo "[WARN] pip install failed for $lambda_name, continuing..."
    else
      echo "[WARN] pip not found, skipping Python dependencies for $lambda_name"
    fi
    
    cd - > /dev/null
  fi
done

# Copy project-specific Step Function definitions
echo "[INFO] Copying Step Function definition files..."
mkdir -p "$TEMP_DIR/stepfunctions"
rsync -av stepfunctions/project-specific/ "$TEMP_DIR/stepfunctions/project-specific/"

# Copy project-specific Athena view SQL files
echo "[INFO] Copying project-specific Athena view SQL files..."
mkdir -p "$TEMP_DIR/athena-tables"
PROJECT_VIEW_FILES=(
  "v_team_skills.sql"
  "v_tech_vision.sql"
  "v_application_portfolio.sql"
  "v_tech_stack.sql"
  "v_infrastructure_resources.sql"
  "v_resource_utilization.sql"
)

for view_file in "${PROJECT_VIEW_FILES[@]}"; do
  if [ -f "athena-tables/$view_file" ]; then
    cp "athena-tables/$view_file" "$TEMP_DIR/athena-tables/"
    echo "[INFO]   Copied $view_file"
  else
    echo "[WARN]   $view_file not found, skipping..."
  fi
done

# Copy view creation script
echo "[INFO] Copying view creation script..."
mkdir -p "$TEMP_DIR/scripts"
if [ -f "scripts/create-project-views.sh" ]; then
  cp "scripts/create-project-views.sh" "$TEMP_DIR/scripts/"
  echo "[INFO]   Copied create-project-views.sh"
else
  echo "[WARN]   create-project-views.sh not found, skipping..."
fi

# Create zip file
ZIP_FILE="$TEMP_DIR/project-sources.zip"
echo "[INFO] Creating zip file..."
cd "$TEMP_DIR"
zip -r project-sources.zip lambda/ stepfunctions/ athena-tables/ scripts/ -q

# Get zip file size
ZIP_SIZE=$(du -h "$ZIP_FILE" | cut -f1)
echo "[INFO] Zip file size: $ZIP_SIZE"

# Upload to S3
echo "[INFO] Uploading to S3..."
aws s3 cp "$ZIP_FILE" "s3://$BUCKET/buildspec-source.zip" \
  --profile "$PROFILE" \
  --region "$REGION" \
  --quiet

# Cleanup
rm -rf "$TEMP_DIR"

echo "[SUCCESS] Project-specific source files (Lambda functions and Step Function definitions) packaged and uploaded successfully!"
echo "[INFO] S3 location: s3://$BUCKET/buildspec-source.zip"