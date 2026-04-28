#!/bin/bash

# App-ModEx Frontend Stack Deployment Script
# Deploys S3, CloudFront, and WAF resources

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="dev"
PROFILE=""

# Frontend is always deployed to us-east-1 for WAF protection
REGION="us-east-1"

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
    echo "Deploys the App-ModEx Frontend Stack (S3, CloudFront, WAF)"
    echo "Frontend is always deployed to us-east-1 for WAF protection"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV    Environment (dev, staging, prod) [default: dev]"
    echo "  -p, --profile PROFILE    AWS profile to use"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -p gturrini"
    echo "  $0 -e prod -p gturrini"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -p|--profile)
            PROFILE="$2"
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

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    print_error "Invalid environment: $ENVIRONMENT. Must be dev, staging, or prod."
    exit 1
fi

# Validate profile is provided
if [[ -z "$PROFILE" ]]; then
    print_error "Profile is required. Use -p or --profile to specify the AWS profile."
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

print_status "Deploying Frontend Stack"
print_status "Environment: $ENVIRONMENT"
print_status "Region: $REGION (us-east-1 for WAF protection)"

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

# Deploy only the Frontend stack
print_status "Deploying Frontend stack..."
npx cdk deploy "AppModEx-Frontend" \
    --context environment="$ENVIRONMENT" \
    --region "$REGION" \
    --require-approval never \
    --outputs-file "outputs-frontend-$ENVIRONMENT.json"

if [[ $? -eq 0 ]]; then
    print_success "Frontend Stack deployed successfully!"
    
    # Display outputs
    if [[ -f "outputs-frontend-$ENVIRONMENT.json" ]]; then
        print_status "Deployment outputs:"
        WEBSITE_URL=$(cat "outputs-frontend-$ENVIRONMENT.json" | jq -r '.["AppModEx-Frontend"]["WebsiteURL"]' 2>/dev/null || echo "")
        if [[ -n "$WEBSITE_URL" && "$WEBSITE_URL" != "null" ]]; then
            echo ""
            print_success "🚀 Your App-ModEx application is now available at:"
            echo -e "${GREEN}${WEBSITE_URL}${NC}"
            echo ""
        fi
    fi
else
    print_error "Frontend Stack deployment failed"
    exit 1
fi

print_success "Frontend Stack deployment completed!"
