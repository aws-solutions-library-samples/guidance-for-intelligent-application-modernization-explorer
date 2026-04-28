#!/bin/bash

# App-ModEx Resource Cleanup Script
# Cleans up orphaned CloudWatch Log Groups and S3 Buckets
# Can be run independently or invoked from other scripts

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
REGION=""
PROFILE=""

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

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_header() {
    echo -e "${CYAN}[CLEANUP]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Cleans up orphaned App-ModEx resources:"
    echo "  - CloudWatch Log Groups (app-modex* or appmodex*)"
    echo "  - S3 Buckets (app-modex* or appmodex*)"
    echo ""
    echo "Options:"
    echo "  -r, --region REGION      AWS region [default: \$AWS_DEFAULT_REGION or us-west-2]"
    echo "  -p, --profile PROFILE    AWS profile to use [default: \$AWS_PROFILE]"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -r eu-west-2 -p gturrini"
    echo "  $0 --region us-east-1"
    echo ""
    echo "Note: This script can also be invoked from other scripts with inherited"
    echo "      environment variables (AWS_PROFILE, AWS_DEFAULT_REGION)"
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
fi

# Display cleanup plan
echo ""
print_header "=== App-ModEx Resource Cleanup ==="
echo "Region: $REGION"
if [[ -n "$PROFILE" ]]; then
    echo "Profile: $PROFILE"
fi
echo ""
echo "Resources to clean up:"
echo "  1. CloudWatch Log Groups (app-modex* or appmodex*)"
echo "  2. S3 Buckets (app-modex* or appmodex*)"
echo "  3. IAM Managed Policies (app-modex* or appmodex*)"
echo ""

# Confirm cleanup
print_warning "This will permanently delete matching resources!"
read -p "Are you sure you want to continue? (yes/no): " -r
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    print_status "Cleanup cancelled by user"
    exit 0
fi
echo ""

# Start cleanup process
START_TIME=$(date +%s)
print_header "Starting cleanup process..."
echo ""

# 1. Clean up CloudWatch Log Groups
print_header "Step 1/3: Cleaning up CloudWatch Log Groups..."
echo ""
print_status "Scanning for app-modex CloudWatch Log Groups..."

# Get all log groups matching app-modex* or appmodex* (case-insensitive)
LOG_GROUPS=$(aws logs describe-log-groups --region "$REGION" ${PROFILE:+--profile "$PROFILE"} --query 'logGroups[].logGroupName' --output text 2>/dev/null || echo "")

if [[ -n "$LOG_GROUPS" ]]; then
    DELETED_LOG_COUNT=0
    for LOG_GROUP in $LOG_GROUPS; do
        # Check if log group name contains app-modex or appmodex (case-insensitive)
        if [[ "$LOG_GROUP" =~ [Aa][Pp][Pp]-?[Mm][Oo][Dd][Ee][Xx] ]]; then
            print_status "Deleting log group: $LOG_GROUP"
            if aws logs delete-log-group --log-group-name "$LOG_GROUP" --region "$REGION" ${PROFILE:+--profile "$PROFILE"} 2>/dev/null; then
                print_success "✓ Deleted: $LOG_GROUP"
                ((DELETED_LOG_COUNT++))
            else
                print_error "✗ Failed to delete: $LOG_GROUP"
            fi
        fi
    done
    
    if [[ $DELETED_LOG_COUNT -eq 0 ]]; then
        print_status "No app-modex log groups found to clean up"
    else
        print_success "Deleted $DELETED_LOG_COUNT log group(s)"
    fi
else
    print_status "No log groups found"
fi

echo ""

# 2. Clean up S3 Buckets
print_header "Step 2/3: Cleaning up S3 Buckets..."
echo ""
print_status "Scanning for app-modex S3 Buckets..."

# Get all buckets matching app-modex* or appmodex* (case-insensitive)
ALL_BUCKETS=$(aws s3api list-buckets --region "$REGION" ${PROFILE:+--profile "$PROFILE"} --query 'Buckets[].Name' --output text 2>/dev/null || echo "")

if [[ -n "$ALL_BUCKETS" ]]; then
    DELETED_BUCKET_COUNT=0
    for BUCKET in $ALL_BUCKETS; do
        # Check if bucket name contains app-modex or appmodex (case-insensitive)
        if [[ "$BUCKET" =~ [Aa][Pp][Pp]-?[Mm][Oo][Dd][Ee][Xx] ]]; then
            print_status "Processing bucket: $BUCKET"
            
            # Check if bucket exists and get its region
            BUCKET_REGION=$(aws s3api get-bucket-location --bucket "$BUCKET" ${PROFILE:+--profile "$PROFILE"} --query 'LocationConstraint' --output text 2>/dev/null || echo "")
            
            # Handle null region (us-east-1)
            if [[ "$BUCKET_REGION" == "None" ]] || [[ "$BUCKET_REGION" == "null" ]] || [[ -z "$BUCKET_REGION" ]]; then
                BUCKET_REGION="us-east-1"
            fi
            
            # Only delete if bucket is in the target region
            if [[ "$BUCKET_REGION" == "$REGION" ]]; then
                print_status "  Emptying bucket: $BUCKET"
                
                # Empty the bucket (delete all objects and versions)
                if aws s3 rm "s3://$BUCKET" --recursive ${PROFILE:+--profile "$PROFILE"} 2>/dev/null; then
                    print_success "  ✓ Emptied bucket"
                else
                    print_error "  ✗ Failed to empty bucket"
                    continue
                fi
                
                # Delete all object versions (for versioned buckets)
                print_status "  Deleting object versions..."
                aws s3api list-object-versions --bucket "$BUCKET" ${PROFILE:+--profile "$PROFILE"} --query 'Versions[].{Key:Key,VersionId:VersionId}' --output json 2>/dev/null | \
                jq -r '.[] | "--key \"\(.Key)\" --version-id \"\(.VersionId)\""' 2>/dev/null | \
                while read -r args; do
                    eval aws s3api delete-object --bucket "$BUCKET" $args ${PROFILE:+--profile "$PROFILE"} 2>/dev/null
                done
                
                # Delete all delete markers
                aws s3api list-object-versions --bucket "$BUCKET" ${PROFILE:+--profile "$PROFILE"} --query 'DeleteMarkers[].{Key:Key,VersionId:VersionId}' --output json 2>/dev/null | \
                jq -r '.[] | "--key \"\(.Key)\" --version-id \"\(.VersionId)\""' 2>/dev/null | \
                while read -r args; do
                    eval aws s3api delete-object --bucket "$BUCKET" $args ${PROFILE:+--profile "$PROFILE"} 2>/dev/null
                done
                
                # Delete the bucket
                print_status "  Deleting bucket: $BUCKET"
                if aws s3api delete-bucket --bucket "$BUCKET" --region "$BUCKET_REGION" ${PROFILE:+--profile "$PROFILE"} 2>/dev/null; then
                    print_success "✓ Deleted bucket: $BUCKET"
                    ((DELETED_BUCKET_COUNT++))
                else
                    print_error "✗ Failed to delete bucket: $BUCKET (may have remaining objects or policies)"
                fi
            else
                print_status "  Skipping (bucket is in region $BUCKET_REGION, not $REGION)"
            fi
        fi
    done
    
    if [[ $DELETED_BUCKET_COUNT -eq 0 ]]; then
        print_status "No app-modex S3 buckets found to clean up in region $REGION"
    else
        print_success "Deleted $DELETED_BUCKET_COUNT S3 bucket(s)"
    fi
else
    print_status "No S3 buckets found"
fi

echo ""

# 3. Clean up IAM Managed Policies
print_header "Step 3/3: Cleaning up IAM Managed Policies..."
echo ""
print_status "Scanning for app-modex IAM Managed Policies..."

# Get account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text ${PROFILE:+--profile "$PROFILE"} 2>/dev/null || echo "")

if [[ -z "$ACCOUNT_ID" ]]; then
    print_error "Failed to get AWS account ID"
else
    # List all customer managed policies
    POLICY_ARNS=$(aws iam list-policies --scope Local ${PROFILE:+--profile "$PROFILE"} --query 'Policies[].Arn' --output text 2>/dev/null || echo "")
    
    if [[ -n "$POLICY_ARNS" ]]; then
        DELETED_POLICY_COUNT=0
        for POLICY_ARN in $POLICY_ARNS; do
            # Extract policy name from ARN
            POLICY_NAME=$(echo "$POLICY_ARN" | awk -F'/' '{print $NF}')
            
            # Check if policy name contains app-modex or appmodex (case-insensitive)
            if [[ "$POLICY_NAME" =~ [Aa][Pp][Pp]-?[Mm][Oo][Dd][Ee][Xx] ]]; then
                print_status "Processing policy: $POLICY_NAME"
                
                # Check if policy is attached to any entities
                ATTACHED_ROLES=$(aws iam list-entities-for-policy --policy-arn "$POLICY_ARN" ${PROFILE:+--profile "$PROFILE"} --query 'PolicyRoles[].RoleName' --output text 2>/dev/null || echo "")
                ATTACHED_USERS=$(aws iam list-entities-for-policy --policy-arn "$POLICY_ARN" ${PROFILE:+--profile "$PROFILE"} --query 'PolicyUsers[].UserName' --output text 2>/dev/null || echo "")
                ATTACHED_GROUPS=$(aws iam list-entities-for-policy --policy-arn "$POLICY_ARN" ${PROFILE:+--profile "$PROFILE"} --query 'PolicyGroups[].GroupName' --output text 2>/dev/null || echo "")
                
                # Detach from roles
                if [[ -n "$ATTACHED_ROLES" ]]; then
                    for ROLE in $ATTACHED_ROLES; do
                        print_status "  Detaching from role: $ROLE"
                        aws iam detach-role-policy --role-name "$ROLE" --policy-arn "$POLICY_ARN" ${PROFILE:+--profile "$PROFILE"} 2>/dev/null || print_error "  ✗ Failed to detach from role: $ROLE"
                    done
                fi
                
                # Detach from users
                if [[ -n "$ATTACHED_USERS" ]]; then
                    for USER in $ATTACHED_USERS; do
                        print_status "  Detaching from user: $USER"
                        aws iam detach-user-policy --user-name "$USER" --policy-arn "$POLICY_ARN" ${PROFILE:+--profile "$PROFILE"} 2>/dev/null || print_error "  ✗ Failed to detach from user: $USER"
                    done
                fi
                
                # Detach from groups
                if [[ -n "$ATTACHED_GROUPS" ]]; then
                    for GROUP in $ATTACHED_GROUPS; do
                        print_status "  Detaching from group: $GROUP"
                        aws iam detach-group-policy --group-name "$GROUP" --policy-arn "$POLICY_ARN" ${PROFILE:+--profile "$PROFILE"} 2>/dev/null || print_error "  ✗ Failed to detach from group: $GROUP"
                    done
                fi
                
                # Delete all non-default policy versions
                POLICY_VERSIONS=$(aws iam list-policy-versions --policy-arn "$POLICY_ARN" ${PROFILE:+--profile "$PROFILE"} --query 'Versions[?!IsDefaultVersion].VersionId' --output text 2>/dev/null || echo "")
                if [[ -n "$POLICY_VERSIONS" ]]; then
                    for VERSION in $POLICY_VERSIONS; do
                        print_status "  Deleting policy version: $VERSION"
                        aws iam delete-policy-version --policy-arn "$POLICY_ARN" --version-id "$VERSION" ${PROFILE:+--profile "$PROFILE"} 2>/dev/null || print_error "  ✗ Failed to delete version: $VERSION"
                    done
                fi
                
                # Delete the policy
                print_status "  Deleting policy: $POLICY_NAME"
                if aws iam delete-policy --policy-arn "$POLICY_ARN" ${PROFILE:+--profile "$PROFILE"} 2>/dev/null; then
                    print_success "✓ Deleted policy: $POLICY_NAME"
                    ((DELETED_POLICY_COUNT++))
                else
                    print_error "✗ Failed to delete policy: $POLICY_NAME"
                fi
            fi
        done
        
        if [[ $DELETED_POLICY_COUNT -eq 0 ]]; then
            print_status "No app-modex IAM policies found to clean up"
        else
            print_success "Deleted $DELETED_POLICY_COUNT IAM policy/policies"
        fi
    else
        print_status "No IAM policies found"
    fi
fi

echo ""

# Calculate cleanup time
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

# Final summary
print_header "=== Cleanup Summary ==="
echo "Region: $REGION"
echo "Duration: ${MINUTES}m ${SECONDS}s"
echo ""
print_success "Cleanup completed successfully!"
echo ""
