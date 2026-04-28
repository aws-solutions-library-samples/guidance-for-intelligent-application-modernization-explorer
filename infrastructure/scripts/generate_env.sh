#!/bin/bash

# App-ModEx Environment File Generator
# Generates .env file for frontend local development from deployed AWS infrastructure

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
REGION=""
PROFILE=""
OUTPUT_FILE="../../app-modex-ui/.env"

# Helper functions
print_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Generates .env file for App-ModEx frontend local development from deployed AWS infrastructure."
    echo ""
    echo "Options:"
    echo "  -r, --region REGION      AWS region (required)"
    echo "  -p, --profile PROFILE    AWS profile to use"
    echo "  -o, --output FILE        Output file path [default: ../../app-modex-ui/.env]"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -r eu-west-2                     # Generate .env from eu-west-2 region"
    echo "  $0 -r us-east-1 -p my-aws-profile  # Use specific AWS profile and region"
    echo "  $0 -r eu-west-2 -o app-modex-ui/.env.local  # Output to .env.local file"
    echo ""
    echo "Prerequisites:"
    echo "  - AWS CLI configured with appropriate permissions"
    echo "  - App-ModEx backend stack deployed in the specified region"
}

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
        -o|--output)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Set AWS profile if provided
if [[ -n "$PROFILE" ]]; then
    export AWS_PROFILE="$PROFILE"
    print_status "Using AWS profile: $PROFILE"
fi

# Validate required parameters
if [[ -z "$REGION" ]]; then
    print_error "Region is required. Please specify -r/--region parameter."
    show_usage
    exit 1
fi

# Get the script directory and resolve output path
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Convert relative path to absolute path without requiring the file to exist
if [[ "$OUTPUT_FILE" = /* ]]; then
    # Already absolute path
    OUTPUT_PATH="$OUTPUT_FILE"
else
    # Relative path - resolve from script directory
    OUTPUT_PATH="$(cd "$SCRIPT_DIR" && pwd)/$OUTPUT_FILE"
fi

print_status "Generating App-ModEx frontend environment configuration..."
print_status "Region: $REGION"
print_status "Output file: $OUTPUT_PATH"
echo ""

# Check if AWS CLI is available
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed or not in PATH"
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials not configured or invalid"
    print_status "Please run 'aws configure' or set AWS credentials"
    exit 1
fi

# Use the standard stack names
API_STACK_NAME="AppModEx-Api"
DATA_STACK_NAME="AppModEx-Data"

print_status "Extracting configuration from CloudFormation stacks"

# Check if stacks exist
if ! aws cloudformation describe-stacks --stack-name "$API_STACK_NAME" --region "$REGION" &> /dev/null; then
    print_error "CloudFormation stack '$API_STACK_NAME' not found in region '$REGION'"
    print_status "Please deploy the infrastructure first using:"
    print_status "  ./deploy.sh -r $REGION"
    exit 1
fi

if ! aws cloudformation describe-stacks --stack-name "$DATA_STACK_NAME" --region "$REGION" &> /dev/null; then
    print_error "CloudFormation stack '$DATA_STACK_NAME' not found in region '$REGION'"
    print_status "Please deploy the infrastructure first using:"
    print_status "  ./deploy.sh -r $REGION"
    exit 1
fi

# Extract CDK outputs from CloudFormation
print_status "Extracting CDK outputs..."

# Get outputs from different stacks
# API URL comes from API stack
API_URL=$(aws cloudformation describe-stacks \
    --stack-name "AppModEx-Api" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
    --output text 2>/dev/null || echo "")

# User Pool info comes from Data stack
USER_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name "AppModEx-Data" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
    --output text 2>/dev/null || echo "")

USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks \
    --stack-name "AppModEx-Data" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' \
    --output text 2>/dev/null || echo "")

IDENTITY_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name "$BACKEND_STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`IdentityPoolId`].OutputValue' \
    --output text 2>/dev/null || echo "")

# Validate required outputs
MISSING_OUTPUTS=()

if [[ -z "$API_URL" || "$API_URL" == "None" ]]; then
    MISSING_OUTPUTS+=("ApiUrl")
fi

if [[ -z "$USER_POOL_ID" || "$USER_POOL_ID" == "None" ]]; then
    MISSING_OUTPUTS+=("UserPoolId")
fi

if [[ -z "$USER_POOL_CLIENT_ID" || "$USER_POOL_CLIENT_ID" == "None" ]]; then
    MISSING_OUTPUTS+=("UserPoolClientId")
fi

if [[ ${#MISSING_OUTPUTS[@]} -gt 0 ]]; then
    print_error "Missing required CloudFormation outputs: ${MISSING_OUTPUTS[*]}"
    print_status "Please ensure the backend stack is fully deployed"
    exit 1
fi

# Warn about optional outputs
if [[ -z "$IDENTITY_POOL_ID" || "$IDENTITY_POOL_ID" == "None" ]]; then
    print_warning "IdentityPoolId not found - some features may not work"
    IDENTITY_POOL_ID="your-identity-pool-id"
fi

# Generate timestamp
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

# Create .env file content
print_status "Generating .env file content..."

ENV_CONTENT="# App-ModEx Application Environment Variables
# Generated automatically from deployed AWS infrastructure
# Generated on: $TIMESTAMP
# Region: $REGION

# API Configuration
REACT_APP_API_URL=$API_URL
REACT_APP_USE_MOCK_API=false

# AWS Configuration
REACT_APP_AWS_REGION=$REGION
REACT_APP_USER_POOL_ID=$USER_POOL_ID
REACT_APP_USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID

# Required for S3 uploads and authenticated access to AWS services
REACT_APP_IDENTITY_POOL_ID=$IDENTITY_POOL_ID

# Feature Flags
REACT_APP_AUTH_REQUIRED=true
REACT_APP_REAL_TIME_UPDATES=true
REACT_APP_ANALYTICS_ENABLED=false
REACT_APP_DEBUG_MODE=true

# Cognito Hosted UI Domain
REACT_APP_COGNITO_DOMAIN_URL=https://app-modex.auth.${REGION}.amazoncognito.com
"

# Create output directory if it doesn't exist
OUTPUT_DIR="$(dirname "$OUTPUT_PATH")"
if [[ ! -d "$OUTPUT_DIR" ]]; then
    print_status "Creating output directory: $OUTPUT_DIR"
    mkdir -p "$OUTPUT_DIR"
fi

# Backup existing .env file if it exists
if [[ -f "$OUTPUT_PATH" ]]; then
    BACKUP_PATH="${OUTPUT_PATH}.backup.$(date +%Y%m%d_%H%M%S)"
    print_warning "Backing up existing .env file to: $BACKUP_PATH"
    cp "$OUTPUT_PATH" "$BACKUP_PATH"
fi

# Write .env file
echo "$ENV_CONTENT" > "$OUTPUT_PATH"

# Verify file was created
if [[ ! -f "$OUTPUT_PATH" ]]; then
    print_error "Failed to create .env file at: $OUTPUT_PATH"
    exit 1
fi

# Display summary
echo ""
print_success "=== Environment File Generated Successfully ==="
echo ""
echo "File: $OUTPUT_PATH"
echo "Region: $REGION"
echo ""
echo "Configuration:"
echo "  API URL: $API_URL"
echo "  User Pool ID: $USER_POOL_ID"
echo "  User Pool Client ID: $USER_POOL_CLIENT_ID"
echo "  Identity Pool ID: $IDENTITY_POOL_ID"
echo "  Region: $REGION"
echo ""
echo "Next Steps:"
echo "1. Start the development server: cd app-modex-ui && npm start"
echo "2. The app will automatically use the generated configuration"
echo "3. Test authentication and API connectivity"
echo ""

print_success "Ready for local development!"