#!/bin/bash

# App-ModEx Backend Deployment Orchestration Script
# Orchestrates deployment of all backend infrastructure stacks in proper order:
# 1. Application Stack
# 2. Prompt Templates Stack
# 3. Data Stack
# 4. API Stack
# 5. Backend Stack

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
FORCE_LAMBDA=false
CLEANUP=false

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
    echo -e "${CYAN}[DEPLOY]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Orchestrates deployment of all App-ModEx backend infrastructure stacks"
    echo ""
    echo "Deployment Order:"
    echo "  1. Application Stack (AppRegistry)"
    echo "  2. Prompt Templates Stack (DynamoDB)"
    echo "  3. Data Stack (DynamoDB, Cognito, S3, Glue)"
    echo "  4. API Stack (API Gateway)"
    echo "  5. Backend Stack (Lambda, SQS, Step Functions)"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV    Environment (dev, staging, prod) [default: dev]"
    echo "  -l, --log-level LEVEL    Log level (ERROR, WARN, INFO, DEBUG) [default: based on environment]"
    echo "  -r, --region REGION      AWS region [default: us-west-2]"
    echo "  -p, --profile PROFILE    AWS profile to use"
    echo "  --force-lambda           Force Lambda function redeployment"
    echo "  --cleanup                Clean up orphaned CloudWatch Log Groups before deployment"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Log Level Defaults:"
    echo "  dev      -> DEBUG (most verbose)"
    echo "  staging  -> INFO"
    echo "  prod     -> ERROR (least verbose)"
    echo ""
    echo "Examples:"
    echo "  $0 -r eu-west-2 -p gturrini"
    echo "  $0 -e prod -r us-east-1"
    echo "  $0 -e prod -l DEBUG -r us-east-1  # Override prod to use DEBUG logging"
    echo "  $0 --force-lambda -r eu-west-2"
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
        --cleanup)
            CLEANUP=true
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

# Display deployment plan
echo ""
print_header "=== App-ModEx Backend Deployment Plan ==="
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo ""
echo "Stacks to deploy:"
echo "  1. ✓ Application Stack"
echo "  2. ✓ Prompt Templates Stack"
echo "  3. ✓ Data Stack"
echo "  4. ✓ API Stack"
echo "  5. ✓ Backend Stack"
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
print_header "Starting App-ModEx Backend deployment process..."
echo ""

# Cleanup orphaned resources if requested
if [[ "$CLEANUP" == true ]]; then
    print_header "Invoking cleanup script..."
    echo ""
    
    # Set environment variables for cleanup script to inherit
    export AWS_DEFAULT_REGION="$REGION"
    if [[ -n "$PROFILE" ]]; then
        export AWS_PROFILE="$PROFILE"
    fi
    
    # Invoke the cleanup script (it will inherit environment variables)
    # Pass 'yes' to auto-confirm cleanup
    if ! echo "yes" | "$SCRIPT_DIR/cleanup-resources.sh" -r "$REGION" ${PROFILE:+-p "$PROFILE"}; then
        print_error "Cleanup script failed"
        exit 1
    fi
    
    echo ""
fi

# 1. Deploy Application Stack
print_header "Step 1/5: Deploying Application Stack..."
if ! "$SCRIPT_DIR/deploy-application-stack.sh" -e "$ENVIRONMENT" -r "$REGION" ${PROFILE:+-p "$PROFILE"}; then
    print_error "Application Stack deployment failed"
    exit 1
fi
echo ""

# 2. Deploy Prompt Templates Stack
print_header "Step 2/5: Deploying Prompt Templates Stack..."
if ! "$SCRIPT_DIR/deploy-prompt-templates-stack.sh" -e "$ENVIRONMENT" -r "$REGION" ${PROFILE:+-p "$PROFILE"}; then
    print_error "Prompt Templates Stack deployment failed"
    exit 1
fi
echo ""

# 3. Deploy Data Stack
print_header "Step 3/5: Deploying Data Stack..."
if ! "$SCRIPT_DIR/deploy-data-stack.sh" -e "$ENVIRONMENT" -r "$REGION" ${PROFILE:+-p "$PROFILE"}; then
    print_error "Data Stack deployment failed"
    exit 1
fi
echo ""

# 4. Deploy API Stack
print_header "Step 4/5: Deploying API Stack..."
if ! "$SCRIPT_DIR/deploy-api-stack.sh" -e "$ENVIRONMENT" -r "$REGION" ${PROFILE:+-p "$PROFILE"}; then
    print_error "API Stack deployment failed"
    exit 1
fi
echo ""

# 5. Deploy Backend Stack
print_header "Step 5/5: Deploying Backend Stack..."
BACKEND_ARGS="-e $ENVIRONMENT -r $REGION"
if [[ -n "$LOG_LEVEL" ]]; then
    BACKEND_ARGS="$BACKEND_ARGS -l $LOG_LEVEL"
fi
if [[ -n "$PROFILE" ]]; then
    BACKEND_ARGS="$BACKEND_ARGS -p $PROFILE"
fi
if [[ "$FORCE_LAMBDA" == true ]]; then
    BACKEND_ARGS="$BACKEND_ARGS --force-lambda"
fi

if ! "$SCRIPT_DIR/deploy-backend-stack.sh" $BACKEND_ARGS; then
    print_error "Backend Stack deployment failed"
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
print_header "=== Backend Deployment Summary ==="
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo "Duration: ${MINUTES}m ${SECONDS}s"
echo ""
print_success "All backend stacks deployed successfully!"
echo ""
print_status "Next Steps:"
echo "1. Run frontend deployment: ./deploy-frontend.sh -p $PROFILE"
echo "2. Test the application functionality"
echo "3. Verify authentication and API integration"
echo ""

print_success "🎉 App-ModEx backend deployment completed!"
