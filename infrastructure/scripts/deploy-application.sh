#!/bin/bash

# App-ModEx Application Stack Deployment Script
# This script deploys the AppRegistry application and resource groups

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="dev"
REGION=""
PROFILE=""
BUILD_ONLY=false

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

print_header() {
    echo -e "${BLUE}[DEPLOY-APP]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "This script deploys the App-ModEx Application stack (AppRegistry application and resource groups)."
    echo ""
    echo "Options:"
    echo "  --environment ENV    Environment (dev, staging, prod) [default: dev]"
    echo "  --region REGION      AWS region [default: us-west-2]"
    echo "  --profile PROFILE    AWS profile to use"
    echo "  --build-only         Only build, don't deploy"
    echo "  -h, --help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --environment dev --region eu-west-2"
    echo "  $0 --profile my-profile --region us-east-1"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --profile)
            PROFILE="$2"
            shift 2
            ;;
        --build-only)
            BUILD_ONLY=true
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

# Validate region is provided
if [[ -z "$REGION" ]]; then
    print_error "Region is required. Use --region to specify the AWS region."
    show_usage
    exit 1
fi

# Validate profile is provided
if [[ -z "$PROFILE" ]]; then
    print_error "Profile is required. Use --profile to specify the AWS profile."
    show_usage
    exit 1
fi

# Set AWS profile if provided
if [[ -n "$PROFILE" ]]; then
    export AWS_PROFILE="$PROFILE"
    print_status "Using AWS profile: $PROFILE"
fi

# Set the target region for CDK
export APPMODEX_REGION="$REGION"

print_header "=== App-ModEx Application Stack Deployment ==="
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
if [[ "$BUILD_ONLY" == true ]]; then
    echo "Mode: 🔨 Build Only"
else
    echo "Mode: 🚀 Build & Deploy"
fi
echo ""

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRASTRUCTURE_DIR="$(dirname "$SCRIPT_DIR")"

# Change to infrastructure directory
cd "$INFRASTRUCTURE_DIR"

# Install dependencies if needed
if [[ ! -d "node_modules" ]]; then
    print_status "Installing CDK dependencies..."
    npm install
fi

# Build TypeScript
print_status "Building TypeScript..."
npm run build

if [[ "$BUILD_ONLY" == true ]]; then
    print_success "Application stack build completed"
    exit 0
fi

# Deploy the Application stack
print_status "Deploying Application stack..."
echo ""

if npx cdk deploy AppModEx-Application \
    --context environment="$ENVIRONMENT" \
    --require-approval never; then
    
    print_success "Application stack deployed successfully"
else
    print_error "Application stack deployment failed"
    exit 1
fi

print_success "🎉 App-ModEx Application stack deployment completed successfully!"