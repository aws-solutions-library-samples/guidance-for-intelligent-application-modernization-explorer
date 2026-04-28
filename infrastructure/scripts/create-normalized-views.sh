#!/bin/bash

# Script to create normalized deduplication views in the global normalized database
# These views deduplicate the normalized tech stack data by selecting the best mapping
# (highest confidence score, most recent timestamp) for each original value
#
# Usage: ./create-normalized-views.sh -r <region> -p <profile>

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
REGION=""
PROFILE=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -r|--region)
      REGION="$2"
      shift 2
      ;;
    -p|--profile)
      PROFILE="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Creates normalized deduplication views in the global normalized database"
      echo ""
      echo "Options:"
      echo "  -r, --region REGION      AWS region [required]"
      echo "  -p, --profile PROFILE    AWS profile to use [required]"
      echo "  -h, --help               Show this help message"
      echo ""
      echo "Examples:"
      echo "  $0 -r eu-west-2 -p gturrini"
      exit 0
      ;;
    *)
      echo -e "${RED}[ERROR]${NC} Unknown option: $1"
      echo "Use -h or --help for usage information"
      exit 1
      ;;
  esac
done

# Validate required parameters
if [ -z "$REGION" ]; then
  echo -e "${RED}[ERROR]${NC} Region is required. Use -r or --region to specify the AWS region."
  exit 1
fi

if [ -z "$PROFILE" ]; then
  echo -e "${RED}[ERROR]${NC} Profile is required. Use -p or --profile to specify the AWS profile."
  exit 1
fi

# Get AWS account ID
echo -e "${YELLOW}[INFO]${NC} Getting AWS account ID..."
ACCOUNT_ID=$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text)
if [ -z "$ACCOUNT_ID" ]; then
  echo -e "${RED}[ERROR]${NC} Failed to get AWS account ID"
  exit 1
fi
echo -e "${GREEN}[INFO]${NC} AWS Account ID: $ACCOUNT_ID"

# Set database name
DATABASE="app-modex-${ACCOUNT_ID}"
echo -e "${GREEN}[INFO]${NC} Normalized database: $DATABASE"

# Set results bucket
RESULTS_BUCKET="app-modex-deployment-${ACCOUNT_ID}-${REGION}"
echo -e "${GREEN}[INFO]${NC} Results bucket: $RESULTS_BUCKET"

# Array of view files
VIEW_FILES=(
  "v_normalized_runtimes.sql"
  "v_normalized_frameworks.sql"
  "v_normalized_databases.sql"
  "v_normalized_integrations.sql"
  "v_normalized_storages.sql"
)

# Note: View names in SQL files are v_norm_* (shortened to avoid conflicts with table names)

# Function to execute Athena query and wait for completion
execute_athena_query() {
  local query="$1"
  local view_name="$2"
  
  echo -e "${YELLOW}[INFO]${NC} Executing query for: $view_name"
  
  # Start query execution
  QUERY_ID=$(aws athena start-query-execution \
    --query-string "$query" \
    --query-execution-context Database="$DATABASE" \
    --result-configuration OutputLocation="s3://${RESULTS_BUCKET}/athena-views/" \
    --region "$REGION" \
    --profile "$PROFILE" \
    --query 'QueryExecutionId' \
    --output text)
  
  if [ -z "$QUERY_ID" ]; then
    echo -e "${RED}[ERROR]${NC} Failed to start query for $view_name"
    return 1
  fi
  
  echo -e "${YELLOW}[INFO]${NC} Query ID: $QUERY_ID"
  
  # Wait for query to complete (max 30 seconds)
  for i in {1..15}; do
    sleep 2
    STATUS=$(aws athena get-query-execution \
      --query-execution-id "$QUERY_ID" \
      --region "$REGION" \
      --profile "$PROFILE" \
      --query 'QueryExecution.Status.State' \
      --output text)
    
    if [ "$STATUS" == "SUCCEEDED" ]; then
      echo -e "${GREEN}[SUCCESS]${NC} Query succeeded for $view_name"
      return 0
    elif [ "$STATUS" == "FAILED" ] || [ "$STATUS" == "CANCELLED" ]; then
      REASON=$(aws athena get-query-execution \
        --query-execution-id "$QUERY_ID" \
        --region "$REGION" \
        --profile "$PROFILE" \
        --query 'QueryExecution.Status.StateChangeReason' \
        --output text)
      echo -e "${RED}[ERROR]${NC} Query failed for $view_name: $REASON"
      return 1
    fi
    
    echo -e "${YELLOW}[INFO]${NC} Waiting for query to complete... ($i/15)"
  done
  
  echo -e "${RED}[ERROR]${NC} Query timeout for $view_name"
  return 1
}

# Create each view
echo -e "${GREEN}[INFO]${NC} Creating normalized deduplication views..."
echo ""

SUCCESS_COUNT=0
FAIL_COUNT=0

for view_file in "${VIEW_FILES[@]}"; do
  VIEW_PATH="./athena-tables/$view_file"
  VIEW_NAME="${view_file%.sql}"
  
  if [ ! -f "$VIEW_PATH" ]; then
    echo -e "${RED}[ERROR]${NC} View file not found: $VIEW_PATH"
    ((FAIL_COUNT++))
    continue
  fi
  
  echo -e "${YELLOW}[INFO]${NC} Processing view: $VIEW_NAME"
  
  # Extract actual view name from SQL file (first CREATE VIEW statement)
  ACTUAL_VIEW_NAME=$(grep -i "CREATE VIEW" "$VIEW_PATH" | head -1 | sed -n 's/.*CREATE VIEW \([^ ]*\) AS.*/\1/p')
  
  if [ -z "$ACTUAL_VIEW_NAME" ]; then
    echo -e "${RED}[ERROR]${NC} Could not extract view name from $VIEW_PATH"
    ((FAIL_COUNT++))
    continue
  fi
  
  # First, try to drop the view if it exists (ignore errors)
  echo -e "${YELLOW}[INFO]${NC} Dropping existing view (if exists): $ACTUAL_VIEW_NAME"
  DROP_QUERY="DROP VIEW IF EXISTS $ACTUAL_VIEW_NAME"
  execute_athena_query "$DROP_QUERY" "$ACTUAL_VIEW_NAME (drop)" || true
  
  # Read SQL from file
  SQL_QUERY=$(cat "$VIEW_PATH")
  
  # Create the view
  echo -e "${YELLOW}[INFO]${NC} Creating view: $ACTUAL_VIEW_NAME"
  if execute_athena_query "$SQL_QUERY" "$ACTUAL_VIEW_NAME (create)"; then
    ((SUCCESS_COUNT++))
  else
    ((FAIL_COUNT++))
  fi
  
  echo ""
done

# Summary
echo "========================================="
echo -e "${GREEN}[SUMMARY]${NC}"
echo "  Total views: ${#VIEW_FILES[@]}"
echo "  Successful: $SUCCESS_COUNT"
echo "  Failed: $FAIL_COUNT"
echo "========================================="

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "${GREEN}[SUCCESS]${NC} All normalized views created successfully!"
  exit 0
else
  echo -e "${YELLOW}[WARNING]${NC} Some views failed to create. Check the errors above."
  exit 1
fi
