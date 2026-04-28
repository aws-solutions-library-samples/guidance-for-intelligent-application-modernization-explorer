#!/bin/bash

# App-ModEx Full Stack Deployment Script
# This script can deploy backend, frontend, or both components

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
LOG_LEVEL=""
REGION=""
PROFILE=""
BACKEND_ONLY=false
FRONTEND_ONLY=false
BUILD_ONLY=false
FORCE_LAMBDA=false

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
    echo "This script deploys the App-ModEx application stack components."
    echo "By default, it deploys both backend and frontend."
    echo ""
    echo "IMPORTANT: Frontend is always deployed to us-east-1 for WAF protection."
    echo "Backend can be deployed to any region specified by -r parameter."
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV    Environment (dev, staging, prod) [default: dev]"
    echo "  -l, --log-level LEVEL    Log level (ERROR, WARN, INFO, DEBUG) [default: based on environment]"
    echo "  -r, --region REGION      AWS region for BACKEND only [default: us-west-2]"
    echo "  -p, --profile PROFILE    AWS profile to use"
    echo "  --backend-only           Deploy only the backend stack"
    echo "  --frontend-only          Deploy only the frontend stack (always us-east-1)"
    echo "  --build-only             Only build components, don't deploy"
    echo "  --force-lambda           Force Lambda function redeployment by updating timestamps"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Log Level Defaults:"
    echo "  dev      -> DEBUG (most verbose)"
    echo "  staging  -> INFO"
    echo "  prod     -> ERROR (least verbose)"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Backend to us-west-2, Frontend to us-east-1"
    echo "  $0 -e prod                           # Deploy all stacks to production"
    echo "  $0 -e prod -l DEBUG                  # Deploy prod with DEBUG logging"
    echo "  $0 --backend-only -r eu-west-2       # Deploy backend to eu-west-2"
    echo "  $0 --frontend-only                   # Deploy frontend to us-east-1 (with WAF)"
    echo "  $0 -e staging --backend-only         # Deploy backend to staging"
    echo "  $0 -p my-profile -r us-east-1       # Backend to us-east-1, Frontend to us-east-1"
    echo "  $0 --build-only                      # Build both components without deploying"
    echo "  $0 --force-lambda --backend-only     # Force Lambda redeployment"
    echo ""
    echo "Deployment Regions:"
    echo "  • Backend: Deployed to region specified by -r parameter"
    echo "  • Frontend: Always deployed to us-east-1 (required for WAF protection)"
    echo ""
    echo "Deployment Order:"
    echo "  1. Application Stack (AppRegistry)"
    echo "  2. Backend (API Gateway, Lambda, Cognito, DynamoDB)"
    echo "  3. Frontend (S3, CloudFront, with backend integration)"
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
        --backend-only)
            BACKEND_ONLY=true
            shift
            ;;
        --frontend-only)
            FRONTEND_ONLY=true
            shift
            ;;
        --build-only)
            BUILD_ONLY=true
            shift
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

# Validate region is provided
if [[ -z "$REGION" ]]; then
    print_error "Region is required. Use -r or --region to specify the AWS region."
    show_usage
    exit 1
fi

# Validate profile is provided
if [[ -z "$PROFILE" ]]; then
    print_error "Profile is required. Use -p or --profile to specify the AWS profile."
    show_usage
    exit 1
fi

# Validate conflicting options
ONLY_COUNT=0
[[ "$BACKEND_ONLY" == true ]] && ((ONLY_COUNT++))
[[ "$FRONTEND_ONLY" == true ]] && ((ONLY_COUNT++))

if [[ $ONLY_COUNT -gt 1 ]]; then
    print_error "Cannot specify multiple --*-only options together"
    exit 1
fi

# Set AWS profile if provided
if [[ -n "$PROFILE" ]]; then
    export AWS_PROFILE="$PROFILE"
    print_status "Using AWS profile: $PROFILE"
fi

# Set the target region for CDK stacks
export APPMODEX_REGION="$REGION"

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Determine what to deploy
DEPLOY_BACKEND=true
DEPLOY_FRONTEND=true

if [[ "$BACKEND_ONLY" == true ]]; then
    DEPLOY_FRONTEND=false
elif [[ "$FRONTEND_ONLY" == true ]]; then
    DEPLOY_BACKEND=false
fi

# Display deployment plan
echo ""
print_header "=== App-ModEx Deployment Plan ==="
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo "Backend: $([ "$DEPLOY_BACKEND" == true ] && echo "✅ Deploy" || echo "⏭️  Skip")"
echo "Frontend: $([ "$DEPLOY_FRONTEND" == true ] && echo "✅ Deploy" || echo "⏭️  Skip")"
if [[ "$BUILD_ONLY" == true ]]; then
    echo "Mode: 🔨 Build Only"
else
    echo "Mode: 🚀 Build & Deploy"
fi
echo ""

# Confirm deployment in production
if [[ "$ENVIRONMENT" == "prod" && "$BUILD_ONLY" != true ]]; then
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
print_header "Starting App-ModEx deployment process..."

# Deploy Backend
if [[ "$DEPLOY_BACKEND" == true ]]; then
    print_header "🔧 Deploying Backend Stack..."
    echo ""
    
    BACKEND_ARGS="-e $ENVIRONMENT -r $REGION"
    if [[ -n "$LOG_LEVEL" ]]; then
        BACKEND_ARGS="$BACKEND_ARGS -l $LOG_LEVEL"
    fi
    if [[ -n "$PROFILE" ]]; then
        BACKEND_ARGS="$BACKEND_ARGS -p $PROFILE"
    fi
    if [[ "$BUILD_ONLY" == true ]]; then
        BACKEND_ARGS="$BACKEND_ARGS --build-only"
    fi
    if [[ "$FORCE_LAMBDA" == true ]]; then
        BACKEND_ARGS="$BACKEND_ARGS --force-lambda"
    fi
    
    if ! "$SCRIPT_DIR/deploy-backend.sh" $BACKEND_ARGS; then
        print_error "Backend deployment failed"
        exit 1
    fi
    
    print_success "Backend deployment completed"
    echo ""
fi

# Deploy Frontend
if [[ "$DEPLOY_FRONTEND" == true ]]; then
    print_header "🎨 Deploying Frontend Stack..."
    echo ""
    
    # Don't use --deploy-only when backend was deployed, so frontend can retrieve config
    FRONTEND_ARGS="-e $ENVIRONMENT --backend-region $REGION"
    if [[ "$DEPLOY_BACKEND" == false ]]; then
        # Only use --deploy-only if backend wasn't deployed in this run
        FRONTEND_ARGS="$FRONTEND_ARGS --deploy-only"
    fi
    if [[ -n "$PROFILE" ]]; then
        FRONTEND_ARGS="$FRONTEND_ARGS -p $PROFILE"
    fi
    if [[ "$BUILD_ONLY" == true ]]; then
        FRONTEND_ARGS="$FRONTEND_ARGS --build-only"
    fi
    
    if ! "$SCRIPT_DIR/deploy-frontend.sh" $FRONTEND_ARGS; then
        print_error "Frontend deployment failed"
        exit 1
    fi
    
    print_success "Frontend deployment completed"
    echo ""
fi

# Calculate deployment time
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

# Final summary
echo ""
print_header "=== Deployment Summary ==="
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo "Duration: ${MINUTES}m ${SECONDS}s"
echo ""

if [[ "$BUILD_ONLY" != true ]]; then
    # Get deployment URLs and information
    if [[ "$DEPLOY_FRONTEND" == true ]]; then
        print_status "🌐 Application Access:"
        
        # Try to get the frontend URL from CloudFormation
        FRONTEND_STACK_NAME="AppModEx-Frontend"
        WEBSITE_URL=$(aws cloudformation describe-stacks \
            --stack-name "$FRONTEND_STACK_NAME" \
            --region "$REGION" \
            --query 'Stacks[0].Outputs[?OutputKey==`WebsiteURL`].OutputValue' \
            --output text 2>/dev/null || echo "")
        
        if [[ -n "$WEBSITE_URL" && "$WEBSITE_URL" != "None" ]]; then
            echo -e "Frontend: ${GREEN}$WEBSITE_URL${NC}"
        fi
    fi
    
    if [[ "$DEPLOY_BACKEND" == true ]]; then
        # Try to get the API URL from CloudFormation
        BACKEND_STACK_NAME="AppModEx-Backend"
        API_URL=$(aws cloudformation describe-stacks \
            --stack-name "$BACKEND_STACK_NAME" \
            --region "$REGION" \
            --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
            --output text 2>/dev/null || echo "")
        
        if [[ -n "$API_URL" && "$API_URL" != "None" ]]; then
            echo -e "API: ${GREEN}$API_URL${NC}"
        fi
    fi
    
    echo ""
    print_status "📋 Next Steps:"
    echo "1. Test the application functionality"
    echo "2. Verify authentication and API integration"
    echo "3. Check CloudWatch logs for any issues"
    if [[ "$ENVIRONMENT" == "prod" ]]; then
        echo "4. Monitor production metrics and alerts"
    fi
else
    print_status "📋 Build completed successfully!"
    echo "Run the same command without --build-only to deploy."
fi

# Create AWS Application Resource Group for AWS Applications Console integration (only if not build-only)
if [[ "$BUILD_ONLY" != true ]]; then
    print_status "Creating AWS Application Resource Group..."
    if ! "$SCRIPT_DIR/create-application.sh" --profile "$PROFILE" --region "$REGION"; then
        print_warning "Failed to create AWS Application Resource Group, but deployment continues"
    fi
fi

echo ""
print_success "🎉 App-ModEx deployment process completed successfully!"
