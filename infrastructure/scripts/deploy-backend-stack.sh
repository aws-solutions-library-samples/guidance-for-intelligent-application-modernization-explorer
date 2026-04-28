#!/bin/bash

# App-ModEx Backend Stack Deployment Script
# Deploys Lambda functions, SQS, Step Functions, and related resources

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="dev"
LOG_LEVEL=""
REGION=""
PROFILE=""
FORCE_LAMBDA=false

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Deploys the App-ModEx Backend Stack (Lambda, SQS, Step Functions)"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV    Environment (dev, staging, prod) [default: dev]"
    echo "  -l, --log-level LEVEL    Log level (ERROR, WARN, INFO, DEBUG) [default: based on environment]"
    echo "  -r, --region REGION      AWS region [default: us-west-2]"
    echo "  -p, --profile PROFILE    AWS profile to use"
    echo "  --force-lambda           Force Lambda function redeployment"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -r eu-west-2 -p gturrini"
    echo "  $0 -e prod -r us-east-1 --force-lambda"
    echo "  $0 -e prod -l DEBUG -r us-east-1  # Override prod to use DEBUG logging"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -l|--log-level)
            LOG_LEVEL="$2"
            shift 2
            ;;
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        -p|--profile)
            PROFILE="$2"
            shift 2
            ;;
        --force-lambda)
            FORCE_LAMBDA=true
            shift
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

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    print_error "Invalid environment: $ENVIRONMENT. Must be dev, staging, or prod."
    exit 1
fi

# Validate log level if provided
if [[ -n "$LOG_LEVEL" ]] && [[ ! "$LOG_LEVEL" =~ ^(ERROR|WARN|INFO|DEBUG)$ ]]; then
    print_error "Invalid log level: $LOG_LEVEL. Must be ERROR, WARN, INFO, or DEBUG."
    exit 1
fi

# Validate region is provided
if [[ -z "$REGION" ]]; then
    print_error "Region is required. Use -r or --region to specify the AWS region."
    show_usage
    exit 1
fi

# Set AWS profile if provided
if [[ -n "$PROFILE" ]]; then
    export AWS_PROFILE="$PROFILE"
    print_status "Using AWS profile: $PROFILE"
fi

# Set environment variables for CDK
export APPMODEX_REGION="$REGION"
export CDK_DEFAULT_REGION="$REGION"

print_status "Deploying Backend Stack"
print_status "Environment: $ENVIRONMENT"
print_status "Region: $REGION"

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRASTRUCTURE_DIR="$(dirname "$SCRIPT_DIR")"

cd "$INFRASTRUCTURE_DIR"

# Check if node_modules exists
if [[ ! -d "node_modules" ]]; then
    print_status "Installing CDK dependencies..."
    npm install
fi

# Bootstrap CDK if needed
print_status "Checking CDK bootstrap status..."
if ! aws cloudformation describe-stacks --stack-name CDKToolkit --region "$REGION" >/dev/null 2>&1; then
    print_status "CDK not bootstrapped in region $REGION. Bootstrapping..."
    npx cdk bootstrap --region "$REGION"
fi

# Build TypeScript
print_status "Building CDK code..."
npm run build

# Install dependencies for global Lambda functions
print_status "Installing dependencies for global Lambda functions..."
for lambda_dir in "$INFRASTRUCTURE_DIR/lambda/global"/*; do
  if [[ ! -d "$lambda_dir" ]]; then
    continue
  fi
  
  lambda_name=$(basename "$lambda_dir")
  
  # Check for Node.js Lambda (has package.json)
  if [[ -f "$lambda_dir/package.json" ]]; then
    if [[ ! -d "$lambda_dir/node_modules" ]]; then
      print_status "Installing Node.js dependencies for $lambda_name..."
      cd "$lambda_dir"
      npm install --production
      cd "$INFRASTRUCTURE_DIR"
    else
      print_status "Dependencies already installed for $lambda_name, skipping..."
    fi
  fi
done

# Prepare Lambda functions if force-lambda is set
if [[ "$FORCE_LAMBDA" == true ]]; then
    print_status "Preparing Lambda functions for redeployment..."
    # Update timestamps to force redeployment
    find lambda -type f -name "*.js" -o -name "*.py" | xargs touch
fi

# Deploy only the Backend stack
print_status "Deploying Backend stack..."
CDK_ARGS="--region $REGION --require-approval never --context environment=$ENVIRONMENT"
if [[ -n "$LOG_LEVEL" ]]; then
    CDK_ARGS="$CDK_ARGS --context logLevel=$LOG_LEVEL"
fi

npx cdk deploy "AppModEx-Backend" $CDK_ARGS

if [[ $? -eq 0 ]]; then
    print_success "Backend Stack deployed successfully!"
else
    print_error "Backend Stack deployment failed"
    exit 1
fi

# Create normalized deduplication views
print_status "Creating normalized deduplication views..."
if [[ -f "$SCRIPT_DIR/create-normalized-views.sh" ]]; then
    if [[ -n "$PROFILE" ]]; then
        "$SCRIPT_DIR/create-normalized-views.sh" -r "$REGION" -p "$PROFILE"
    else
        "$SCRIPT_DIR/create-normalized-views.sh" -r "$REGION"
    fi
    
    if [[ $? -eq 0 ]]; then
        print_success "Normalized views created successfully!"
    else
        print_error "Failed to create normalized views. You can create them manually by running:"
        print_error "  ./scripts/create-normalized-views.sh -r $REGION -p $PROFILE"
    fi
else
    print_error "create-normalized-views.sh script not found. Skipping view creation."
fi

print_success "Backend Stack deployment completed!"
