#!/bin/bash

# Create AWS Resource Groups for App-ModEx
# Usage: ./create-application.sh --profile <profile> --region <region>

PROFILE=""
REGION=""

# Parse arguments
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
    *)
      echo "Unknown option $1"
      exit 1
      ;;
  esac
done

# Validate required parameters
if [ -z "$PROFILE" ] || [ -z "$REGION" ]; then
  echo "Usage: $0 --profile <profile> --region <region>"
  exit 1
fi

echo "🔗 Checking AWS Resource Groups..."

# Check if Resource Group exists in current region
if aws resource-groups get-group --group-name "App-ModEx-Application" --profile $PROFILE --region $REGION >/dev/null 2>&1; then
  echo "✅ App-ModEx Resource Group already exists in $REGION"
else
  echo "📱 Creating App-ModEx Resource Group in $REGION..."
  if aws resource-groups create-group \
    --name "App-ModEx-Application" \
    --resource-query '{
      "Type": "TAG_FILTERS_1_0",
      "Query": "{\"ResourceTypeFilters\":[\"AWS::AllSupported\"],\"TagFilters\":[{\"Key\":\"Application\",\"Values\":[\"App-ModEx\"]}]}"
    }' \
    --profile $PROFILE --region $REGION >/dev/null 2>&1; then
    echo "✅ App-ModEx Resource Group created successfully in $REGION"
  else
    echo "❌ ERROR: Failed to create App-ModEx Resource Group in $REGION"
    echo "   Check AWS permissions for resource-groups:CreateGroup"
  fi
fi

# Also create Resource Group in us-east-1 for frontend resources (if not already in us-east-1)
if [ "$REGION" != "us-east-1" ]; then
  echo "🌍 Checking Resource Group in us-east-1 for frontend resources..."
  if aws resource-groups get-group --group-name "App-ModEx-Application" --profile $PROFILE --region us-east-1 >/dev/null 2>&1; then
    echo "✅ App-ModEx Resource Group already exists in us-east-1"
  else
    echo "📱 Creating App-ModEx Resource Group in us-east-1..."
    if aws resource-groups create-group \
      --name "App-ModEx-Application" \
      --resource-query '{
        "Type": "TAG_FILTERS_1_0",
        "Query": "{\"ResourceTypeFilters\":[\"AWS::AllSupported\"],\"TagFilters\":[{\"Key\":\"Application\",\"Values\":[\"App-ModEx\"]}]}"
      }' \
      --profile $PROFILE --region us-east-1 >/dev/null 2>&1; then
      echo "✅ App-ModEx Resource Group created successfully in us-east-1"
    else
      echo "⚠️  WARNING: Failed to create App-ModEx Resource Group in us-east-1"
      echo "   Frontend resources may not appear in Resource Groups"
    fi
  fi
fi

echo "📱 App-ModEx resources available in AWS Resource Groups console"
echo "📝 Note: All resources tagged with Application=App-ModEx will appear in the resource group"