#!/bin/bash

# App-ModEx Frontend Deployment Orchestration Script
# Orchestrates frontend deployment with proper .env generation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="dev"
PROFILE=""
BACKEND_REGION=""

# Frontend is always deployed to us-east-1 for WAF protection
REGION="us-east-1"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${CYAN}[DEPLOY]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Orchestrates App-ModEx frontend deployment"
    echo "Frontend is always deployed to us-east-1 for WAF protection"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV         Environment (dev, staging, prod) [default: dev]"
    echo "  -p, --profile PROFILE         AWS profile to use"
    echo "  --backend-region REGION       Backend region for config retrieval"
    echo "  -h, --help                    Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -p gturrini"
    echo "  $0 -e prod -p gturrini --backend-region eu-west-2"
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
        --backend-region)
            BACKEND_REGION="$2"
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

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
UI_DIR="$PROJECT_ROOT/app-modex-ui"

# Display deployment plan
echo ""
print_header "=== App-ModEx Frontend Deployment Plan ==="
echo "Environment: $ENVIRONMENT"
echo "Frontend Region: $REGION (us-east-1 for WAF protection)"
if [[ -n "$BACKEND_REGION" ]]; then
    echo "Backend Region: $BACKEND_REGION"
fi
echo ""

# Confirm deployment in production
if [[ "$ENVIRONMENT" == "prod" ]]; then
    echo -e "${YELLOW}⚠️  You are about to deploy to PRODUCTION environment!${NC}"
    read -p "Are you sure you want to continue? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        print_status "Deployment cancelled by user"
        exit 0
    fi
    echo ""
fi

# Start deployment process
START_TIME=$(date +%s)
print_header "Starting App-ModEx frontend deployment process..."
echo ""

# Step 1: Generate .env file with backend configuration
print_header "Step 1/3: Generating frontend environment configuration..."

# Determine backend region if not provided
if [[ -z "$BACKEND_REGION" ]]; then
    print_status "Detecting backend region..."
    COMMON_REGIONS=("eu-west-2" "us-east-1" "us-west-2" "eu-west-1" "ap-southeast-1" "ap-southeast-2")
    
    for region in "${COMMON_REGIONS[@]}"; do
        if aws cloudformation describe-stacks --stack-name "AppModEx-Data" --region "$region" >/dev/null 2>&1; then
            BACKEND_REGION="$region"
            print_status "Backend found in region: $region"
            break
        fi
    done
fi

# Generate .env file using generate_env.sh
if [[ -n "$BACKEND_REGION" ]]; then
    GENERATE_ENV_ARGS="-r $BACKEND_REGION -o ../../app-modex-ui/.env"
    if [[ -n "$PROFILE" ]]; then
        GENERATE_ENV_ARGS="$GENERATE_ENV_ARGS -p $PROFILE"
    fi
    
    if "$SCRIPT_DIR/generate_env.sh" $GENERATE_ENV_ARGS; then
        print_success "Environment configuration generated successfully"
    else
        print_warning "Failed to generate .env file with backend configuration"
    fi
else
    print_warning "Backend region not found. Frontend will use mock API."
fi
echo ""

# Step 2: Build frontend
print_header "Step 2/3: Building frontend application..."

cd "$UI_DIR"

# Check if node_modules exists
if [[ ! -d "node_modules" ]]; then
    print_status "Installing frontend dependencies..."
    npm install
fi

# Build the app
print_status "Running build..."
npm run build

if [[ $? -eq 0 ]]; then
    print_success "Frontend build completed successfully"
else
    print_error "Failed to build frontend"
    exit 1
fi

# Verify build directory exists
if [[ ! -d "build" ]]; then
    print_error "Build directory not found after build"
    exit 1
fi

print_status "Build artifacts created"
echo ""

# Step 3: Deploy frontend stack
print_header "Step 3/3: Deploying frontend infrastructure..."

FRONTEND_ARGS="-e $ENVIRONMENT"
if [[ -n "$PROFILE" ]]; then
    FRONTEND_ARGS="$FRONTEND_ARGS -p $PROFILE"
fi

if ! "$SCRIPT_DIR/deploy-frontend-stack.sh" $FRONTEND_ARGS; then
    print_error "Frontend Stack deployment failed"
    exit 1
fi
echo ""

# Calculate deployment time
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

# Final summary
echo ""
print_header "=== Frontend Deployment Summary ==="
echo "Environment: $ENVIRONMENT"
echo "Frontend Region: $REGION (us-east-1 for WAF protection)"
if [[ -n "$BACKEND_REGION" ]]; then
    echo "Backend Region: $BACKEND_REGION"
    echo "Backend Integration: ✅ Enabled"
else
    echo "Backend Integration: ❌ Mock API"
fi
echo "Duration: ${MINUTES}m ${SECONDS}s"
echo ""
print_success "Frontend deployment completed successfully!"
echo ""

print_success "🎉 App-ModEx frontend deployment completed!"
