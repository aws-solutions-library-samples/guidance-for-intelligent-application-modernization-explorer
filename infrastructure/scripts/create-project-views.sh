#!/bin/bash

# Script to create project-specific deduplication views
# Called by buildspec.yml during project provisioning

set -e

# Validate required environment variables
if [ -z "$PROJECT_ID" ]; then
  echo "[ERROR] PROJECT_ID environment variable is not set"
  exit 1
fi

if [ -z "$AWS_REGION" ]; then
  echo "[ERROR] AWS_REGION environment variable is not set"
  exit 1
fi

echo "[INFO] Creating project-specific deduplication views..."

# Get AWS account ID for normalized database reference
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region ${AWS_REGION})
echo "[INFO] AWS Account ID: $ACCOUNT_ID"

DATABASE_NAME=$(echo "app_modex_${PROJECT_ID}" | tr '[:upper:]' '[:lower:]')
BUCKET_NAME=$(echo "app-modex-results-${PROJECT_ID}" | tr '[:upper:]' '[:lower:]')

echo "[INFO] Database: $DATABASE_NAME"
echo "[INFO] Results bucket: $BUCKET_NAME"

# Array of view files in dependency order
VIEW_FILES=(
  "v_team_skills.sql"
  "v_tech_vision.sql"
  "v_application_portfolio.sql"
  "v_tech_stack.sql"
  "v_infrastructure_resources.sql"
  "v_resource_utilization.sql"
)

SUCCESS_COUNT=0
FAIL_COUNT=0

for view_file in "${VIEW_FILES[@]}"; do
  VIEW_PATH="athena-tables/$view_file"
  VIEW_NAME="${view_file%.sql}"
  
  if [ ! -f "$VIEW_PATH" ]; then
    echo "[ERROR] View file not found: $VIEW_PATH"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    continue
  fi
  
  echo "[INFO] Processing view: $VIEW_NAME"
  
  # Drop existing view (ignore errors)
  echo "[INFO] Dropping existing view (if exists): $VIEW_NAME"
  DROP_QUERY="DROP VIEW IF EXISTS $VIEW_NAME"
  DROP_QUERY_ID=$(aws athena start-query-execution \
    --query-string "$DROP_QUERY" \
    --query-execution-context Database="$DATABASE_NAME" \
    --result-configuration OutputLocation="s3://${BUCKET_NAME}/athena-views/" \
    --region ${AWS_REGION} \
    --query 'QueryExecutionId' \
    --output text) || true
  
  if [ -n "$DROP_QUERY_ID" ]; then
    # Wait for drop query to complete (max 10 seconds)
    for i in {1..5}; do
      sleep 2
      STATUS=$(aws athena get-query-execution \
        --query-execution-id "$DROP_QUERY_ID" \
        --region ${AWS_REGION} \
        --query 'QueryExecution.Status.State' \
        --output text)
      
      if [ "$STATUS" = "SUCCEEDED" ] || [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "CANCELLED" ]; then
        break
      fi
    done
  fi
  
  # Read SQL from file and replace placeholders
  SQL_QUERY=$(cat "$VIEW_PATH")
  
  # Replace ${account} placeholder with actual AWS account ID
  SQL_QUERY=$(echo "$SQL_QUERY" | sed "s/\${account}/$ACCOUNT_ID/g")
  
  # Create the view
  echo "[INFO] Creating view: $VIEW_NAME"
  QUERY_ID=$(aws athena start-query-execution \
    --query-string "$SQL_QUERY" \
    --query-execution-context Database="$DATABASE_NAME" \
    --result-configuration OutputLocation="s3://${BUCKET_NAME}/athena-views/" \
    --region ${AWS_REGION} \
    --query 'QueryExecutionId' \
    --output text)
  
  if [ -z "$QUERY_ID" ]; then
    echo "[ERROR] Failed to start query for $VIEW_NAME"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    continue
  fi
  
  echo "[INFO] Query ID: $QUERY_ID"
  
  # Wait for query to complete (max 30 seconds)
  for i in {1..15}; do
    sleep 2
    STATUS=$(aws athena get-query-execution \
      --query-execution-id "$QUERY_ID" \
      --region ${AWS_REGION} \
      --query 'QueryExecution.Status.State' \
      --output text)
    
    if [ "$STATUS" = "SUCCEEDED" ]; then
      echo "[SUCCESS] View $VIEW_NAME created successfully"
      SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
      break
    elif [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "CANCELLED" ]; then
      REASON=$(aws athena get-query-execution \
        --query-execution-id "$QUERY_ID" \
        --region ${AWS_REGION} \
        --query 'QueryExecution.Status.StateChangeReason' \
        --output text)
      echo "[ERROR] View creation failed for $VIEW_NAME: $REASON"
      FAIL_COUNT=$((FAIL_COUNT + 1))
      break
    fi
    
    if [ $i -eq 15 ]; then
      echo "[ERROR] Query timeout for $VIEW_NAME"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
  done
  
  echo ""
done

echo "========================================="
echo "[SUMMARY]"
echo "  Total views: ${#VIEW_FILES[@]}"
echo "  Successful: $SUCCESS_COUNT"
echo "  Failed: $FAIL_COUNT"
echo "========================================="

if [ $FAIL_COUNT -gt 0 ]; then
  echo "[WARNING] Some views failed to create. Check the errors above."
  exit 0  # Don't fail the build, just warn
else
  echo "[SUCCESS] All project-specific views created successfully!"
fi
