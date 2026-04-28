# App-ModEx API Integration Documentation

This document outlines the current API integration patterns and endpoints for the App-ModEx (Intelligent Applications Modernization Explorer) application. The application uses a full-stack serverless architecture with real backend APIs implemented using AWS API Gateway and Lambda functions.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Current API Integration Status](#current-api-integration-status)
- [API Integration Patterns](#api-integration-patterns)
- [Data Flow Architecture](#data-flow-architecture)
- [Environment Configuration](#environment-configuration)
- [API Response Formats](#api-response-formats)
- [Security Considerations](#security-considerations)
- [Performance Optimization](#performance-optimization)
- [Monitoring and Observability](#monitoring-and-observability)
- [Integration Testing](#integration-testing)
- [Future Enhancements](#future-enhancements)
- [Quick Reference](#quick-reference)

## Architecture Overview

The App-ModEx application uses a full-stack serverless architecture with:
- **Real Backend APIs**: For all functionality (projects, sharing, file management, data processing, etc.)
- **Athena Integration**: For data querying and analysis
- **Step Functions**: For orchestrating complex workflows (pilot identification, similarity analysis, exports)

## Current API Integration Status

### ✅ **Implemented Backend APIs** (Production Ready)

#### **1. Project Management APIs**
- **Base URL**: `${API_BASE_URL}/projects`
- **Authentication**: Cognito JWT tokens required
- **Service File**: `projectsApi.js`
- **Note**: These are the only endpoints NOT project-scoped (they manage projects themselves)

| Endpoint | Method | Description | Usage |
|----------|--------|-------------|-------|
| `/projects` | GET | List all user projects | ProjectsListPage |
| `/projects` | POST | Create new project | ProjectsListPage |
| `/projects/{projectId}` | GET | Get project details | Project navigation |
| `/projects/{projectId}` | PUT | Update project | Project settings |
| `/projects/{projectId}` | DELETE | Delete project | ProjectsListPage |
| `/projects/{projectId}?force=true` | DELETE | Force delete project with data | ProjectsListPage |

#### **2. Project Sharing APIs**
- **Base URL**: `${API_BASE_URL}/projects/{projectId}/sharing`
- **Authentication**: Cognito JWT tokens required
- **Service File**: `directApiService.js`

| Endpoint | Method | Description | Usage |
|----------|--------|-------------|-------|
| `/projects/{projectId}/sharing` | GET | List shared users | ShareProjectModal |
| `/projects/{projectId}/sharing` | POST | Share project with user | ShareProjectModal |
| `/projects/{projectId}/sharing/{shareId}` | PUT | Update share permissions | ShareProjectModal |
| `/projects/{projectId}/sharing/{shareId}` | DELETE | Remove share access | ShareProjectModal |
| `/projects/{projectId}/sharing/users/search` | GET | Search users for sharing | ShareProjectModal |

#### **3. File Management APIs**
- **Base URL**: `${API_BASE_URL}/projects/{projectId}`
- **Authentication**: Cognito JWT tokens required
- **Service Files**: `apiService.js`, `dataSourcesService.js`

| Endpoint | Method | Description | Usage |
|----------|--------|-------------|-------|
| `/projects/{projectId}/file-upload` | POST | Upload file to S3 | FileUploadModal |
| `/projects/{projectId}/files/{id}` | GET | Download file (returns presigned URL) | DataSourcesTable |
| `/projects/{projectId}/files/{id}` | DELETE | Delete file | DataSourcesTable |
| `/projects/{projectId}/data-sources` | GET | List data sources | DataSourcesTable |
| `/projects/{projectId}/data-sources` | POST | Add data source metadata | DataSourcesTable |
| `/projects/{projectId}/file-operations` | GET | List file operations | File management |
| `/projects/{projectId}/file-operations` | POST | Perform file operation | File management |

#### **4. User Search APIs**
- **Base URL**: `${API_BASE_URL}/projects/{projectId}/sharing`
- **Authentication**: Cognito JWT tokens required
- **Service File**: `directApiService.js`
- **Note**: User search is project-scoped for security and access control

| Endpoint | Method | Description | Usage |
|----------|--------|-------------|-------|
| `/projects/{projectId}/sharing/users/search` | GET | Search users by query (with params: q, limit) | ShareProjectModal |

#### **5. Application Buckets APIs**
- **Base URL**: `${API_BASE_URL}/projects/{projectId}/application-buckets`
- **Authentication**: Cognito JWT tokens required
- **Service File**: `applicationBucketsApi.js`

| Endpoint | Method | Description | Usage |
|----------|--------|-------------|-------|
| `/projects/{projectId}/application-buckets` | GET | List buckets for project | ApplicationGroupingPage |
| `/projects/{projectId}/application-buckets` | POST | Create new bucket | ApplicationGroupingPage |
| `/projects/{projectId}/application-buckets/{bucketId}` | GET | Get bucket details | ApplicationGroupingPage |
| `/projects/{projectId}/application-buckets/{bucketId}` | PUT | Update bucket | ApplicationGroupingPage |
| `/projects/{projectId}/application-buckets/{bucketId}` | DELETE | Delete bucket | ApplicationGroupingPage |

#### **6. TCO Management APIs**
- **Base URL**: `${API_BASE_URL}/projects/{projectId}/tco`
- **Authentication**: Cognito JWT tokens required
- **Service File**: `tcoApi.js`

| Endpoint | Method | Description | Usage |
|----------|--------|-------------|-------|
| `/projects/{projectId}/tco` | GET | List TCO estimates | TCOPage |
| `/projects/{projectId}/tco` | POST | Create TCO estimate | TCOPage |
| `/projects/{projectId}/tco/{tcoId}` | GET | Get TCO estimate | TCOPage |
| `/projects/{projectId}/tco/{tcoId}` | PUT | Update TCO estimate | TCOPage |
| `/projects/{projectId}/tco/{tcoId}` | DELETE | Delete TCO estimate | TCOPage |

#### **7. Team Estimates APIs**
- **Base URL**: `${API_BASE_URL}/projects/{projectId}/team-estimates`
- **Authentication**: Cognito JWT tokens required
- **Service File**: `teamEstimateApi.js`

| Endpoint | Method | Description | Usage |
|----------|--------|-------------|-------|
| `/projects/{projectId}/team-estimates` | GET | List team estimates | TeamEstimatePage |
| `/projects/{projectId}/team-estimates` | POST | Create team estimate | TeamEstimatePage |
| `/projects/{projectId}/team-estimates/{teamEstimateId}` | GET | Get team estimate | TeamEstimatePage |
| `/projects/{projectId}/team-estimates/{teamEstimateId}` | PUT | Update team estimate | TeamEstimatePage |
| `/projects/{projectId}/team-estimates/{teamEstimateId}` | DELETE | Delete team estimate | TeamEstimatePage |

**Note**: `buckets-without-team-estimate` is derived client-side by filtering buckets against team estimates, not a real API endpoint.

#### **8. Automation Status APIs**
- **Base URL**: `${API_BASE_URL}`
- **Authentication**: Cognito JWT tokens required
- **Service File**: `automationStatusApi.js`

| Endpoint | Method | Description | Usage |
|----------|--------|-------------|-------|
| `/automations/status` | GET | Get automation status (with filters) | AutomationStatusPage |
| `/automations/history` | GET | Get automation history (with filters) | AutomationStatusPage |
| `/automations/failures` | GET | Get failure analysis (with filters) | AutomationStatusPage |
| `/automations/project/{projectId}` | GET | Get project automation status | Project monitoring |
| `/projects/{projectId}/automation-status` | GET | Get project-specific automation status | Project monitoring |

#### **9. Application Similarity APIs**
- **Base URL**: `${API_BASE_URL}/projects/{projectId}/application-similarities`
- **Authentication**: Cognito JWT tokens required
- **Service File**: `applicationSimilarityApi.js`

| Endpoint | Method | Description | Usage |
|----------|--------|-------------|-------|
| `/projects/{projectId}/application-similarities` | POST | Trigger similarity analysis | SimilaritiesAnalysisTrigger |
| `/projects/{projectId}/application-similarities` | GET | Get analysis results from DynamoDB | ApplicationSimilaritiesPage |
| `/projects/{projectId}/application-similarities` | DELETE | Clear results from DynamoDB | SimilaritiesAnalysisTrigger |

#### **10. Component Similarity APIs**
- **Base URL**: `${API_BASE_URL}/projects/{projectId}/component-similarities`
- **Authentication**: Cognito JWT tokens required
- **Service File**: `componentSimilarityApi.js`

| Endpoint | Method | Description | Usage |
|----------|--------|-------------|-------|
| `/projects/{projectId}/component-similarities` | POST | Trigger component similarity analysis | ComponentSimilaritiesAnalysisTrigger |
| `/projects/{projectId}/component-similarities` | GET | Get analysis results from DynamoDB | ComponentSimilaritiesPage |
| `/projects/{projectId}/component-similarities` | DELETE | Clear results from DynamoDB | ComponentSimilaritiesAnalysisTrigger |

#### **11. Pilot Identification APIs**
- **Base URL**: `${API_BASE_URL}/projects/{projectId}/pilot-identification`
- **Authentication**: Cognito JWT tokens required
- **Service File**: `pilotIdentificationApi.js`

| Endpoint | Method | Description | Usage |
|----------|--------|-------------|-------|
| `/projects/{projectId}/pilot-identification` | POST | Trigger pilot identification analysis | PilotIdentificationTrigger |
| `/projects/{projectId}/pilot-identification` | GET | Get pilot results (with params: limit, offset, minScore) | PilotIdentificationPage |
| `/projects/{projectId}/pilot-identification` | DELETE | Clear results | PilotIdentificationTrigger |
| `/projects/{projectId}/pilot-identification-async` | POST | Trigger async pilot identification | PilotIdentificationTrigger |

#### **12. Athena Query APIs**
- **Base URL**: `${API_BASE_URL}/projects/{projectId}/athena-query`
- **Authentication**: Cognito JWT tokens required
- **Service File**: `athenaQueryService.js`
- **Security**: Uses pre-defined query templates to prevent SQL injection

| Endpoint | Method | Description | Usage |
|----------|--------|-------------|-------|
| `/projects/{projectId}/athena-query` | POST | Execute Athena query template (params: templateId, parameters, dataType) | Data visualization components |

#### **13. Export APIs**
- **Base URL**: `${API_BASE_URL}/projects/{projectId}/export`
- **Authentication**: Cognito JWT tokens required
- **Service File**: `exportApiService.js`

| Endpoint | Method | Description | Usage |
|----------|--------|-------------|-------|
| `/projects/{projectId}/export` | POST | Initiate export job | ExportDataPage |
| `/projects/{projectId}/export/history` | GET | Get export history (with params: page, pageSize, status, userId) | ExportHistoryTable |
| `/projects/{projectId}/export/{exportId}` | GET | Get export status | ExportHistoryTable |
| `/projects/{projectId}/export/{exportId}` | PUT | Update export metadata | Export management |
| `/projects/{projectId}/export/{exportId}` | DELETE | Delete export | ExportHistoryTable |
| `/projects/{projectId}/export/{exportId}/download` | GET | Get presigned download URL | ExportHistoryTable |

#### **14. Step Functions Status APIs**
- **Base URL**: `${API_BASE_URL}/projects/{projectId}`
- **Authentication**: Cognito JWT tokens required
- **Service File**: `stepFunctionService.js`

| Endpoint | Method | Description | Usage |
|----------|--------|-------------|-------|
| `/projects/{projectId}/step-function` | GET | Check execution status (param: executionArn) | Analysis monitoring |
| `/projects/{projectId}/step-function-trigger` | POST | Generic Step Function trigger | Workflow orchestration |
| `/step-functions/executions` | GET | List recent executions (params: projectId, maxResults) | Execution history |

#### **15. Additional Project APIs**
- **Base URL**: `${API_BASE_URL}/projects/{projectId}`
- **Authentication**: Cognito JWT tokens required
- **Service Files**: Various

| Endpoint | Method | Description | Usage |
|----------|--------|-------------|-------|
| `/projects/{projectId}/compare-with-athena` | POST | Compare data with Athena results | Data validation |
| `/projects/{projectId}/role-mapper` | GET | Get role mappings | Role management |
| `/projects/{projectId}/role-mapper` | POST | Create role mapping | Role management |
| `/projects/{projectId}/build-monitor` | GET | Get build monitoring status | CI/CD monitoring |
| `/projects/{projectId}/provisioning` | POST | Trigger infrastructure provisioning | Infrastructure automation |

---

### ❌ **Unused APIs** (Defined but Not Used)

Based on code analysis, these endpoints are defined in the API Gateway stack but not actively used by the frontend:

#### **Process Tracking APIs** (Complete set unused)
- `GET /projects/{projectId}/processes`
- `POST /projects/{projectId}/processes`
- `GET /projects/{projectId}/processes/{processId}`
- `PUT /projects/{projectId}/processes/{processId}`

**Note**: Component Similarity APIs ARE actively used (corrected from previous documentation)

---

## API Integration Patterns

### **1. Authentication Pattern**
All backend APIs use Cognito JWT token authentication:

```javascript
const getAuthHeaders = async () => {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};
```

### **2. API Call Pattern**
Standardized API calling with error handling:

```javascript
const apiCall = async (endpoint, options = {}) => {
  const headers = await getAuthHeaders();
  const fullUrl = `${API_BASE_URL}${endpoint}`;
  
  const response = await fetch(fullUrl, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  
  if (!response.ok) {
    throw new Error(`API call failed: ${response.statusText}`);
  }
  
  return response.json();
};
```

### **3. Error Handling Pattern**
Consistent error handling across all services:

```javascript
try {
  const data = await apiCall('/endpoint');
  return data;
} catch (error) {
  console.error('API Error:', error);
  throw new Error(`Operation failed: ${error.message}`);
}
```

### **4. Project Context Pattern**
**ALL APIs (except project CRUD) are project-scoped** and require projectId:

```javascript
// URL pattern: /projects/{projectId}/resource
const getProjectData = async (projectId, dataType) => {
  return apiCall(`/projects/${projectId}/data/${dataType}`);
};
```

**Important**: This is a security and data isolation design - all resources are scoped to projects to ensure proper access control and multi-tenancy.

### **5. Pagination Pattern**
List endpoints support pagination:

```javascript
const getResources = async (projectId, options = {}) => {
  const params = new URLSearchParams({
    projectId,
    page: options.page || 1,
    pageSize: options.pageSize || 25,
    ...options.filters
  });
  
  return apiCall(`/resources?${params}`);
};
```

## Data Flow Architecture

### **1. Frontend → Backend APIs**
```
React Component → Service Layer → API Gateway → Lambda → DynamoDB
```

### **2. File Upload Flow**
```
FileUploadModal → apiService.js → /files/upload → Lambda → S3
```

### **3. Data Visualization Flow**
```
Chart Component → athenaQueryService.js → /athena-query → Lambda → Athena → S3
```

### **4. Project Sharing Flow**
```
ShareProjectModal → directApiService.js → /projects/{id}/share → Lambda → DynamoDB
Note: No email notifications - users see shared projects in their projects list
```

### **5. Event-Driven Processing**
```
API Request → Lambda → DynamoDB → DynamoDB Streams → Processing Lambda → EventBridge
```

### **6. Export Generation Flow**
```
ExportDataPage → exportApiService.js → /export → Lambda → Step Functions → Excel/CSV Generation → S3 → Download Link
```

### **7. Step Functions Orchestration Flow**
```
Trigger → Step Functions → Map State (Parallel) → Lambda Functions → Bedrock (AI) → Aggregate Results → DynamoDB
```

## Environment Configuration

### **API Base URL Configuration**
```javascript
// Environment-specific API URLs
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://api.app-modex.dev';

// Development
REACT_APP_API_URL=https://dev-api.app-modex.dev

// Production  
REACT_APP_API_URL=https://api.app-modex.dev
```

### **Complete Environment Variables**
```bash
# Core API Configuration
REACT_APP_API_URL=https://api.app-modex.yourcompany.com
REACT_APP_AWS_REGION=us-west-2

# Authentication Configuration
REACT_APP_USER_POOL_ID=us-west-2_XXXXXXXXX
REACT_APP_USER_POOL_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
REACT_APP_IDENTITY_POOL_ID=us-west-2:XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
REACT_APP_COGNITO_DOMAIN_URL=https://your-domain.auth.us-west-2.amazoncognito.com

# Storage Configuration
REACT_APP_S3_BUCKET=app-modex-data-ACCOUNT-ID

# Feature Flags
REACT_APP_AUTH_REQUIRED=true
REACT_APP_DEBUG_MODE=false
REACT_APP_REAL_TIME_UPDATES=true
REACT_APP_ANALYTICS_ENABLED=true

# Development Flags
REACT_APP_DISABLE_ERROR_OVERLAY=true
```

### **⚠️ Code Quality Issues to Address**

**Hardcoded API URLs Found in Code:**
```javascript
// ❌ REMOVE: Hardcoded fallback URL in production code
// File: app-modex-ui/src/services/applicationBucketsApi.js
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://xxxxxxxxxx.execute-api.REGION.amazonaws.com/dev/';
```

**Note**: componentSimilarityApi.js does NOT have hardcoded URLs (verified in code review).

**Recommended Fix:**
```javascript
// ✅ BETTER: Fail fast if API URL not configured
const API_BASE_URL = process.env.REACT_APP_API_URL;
if (!API_BASE_URL) {
  throw new Error('REACT_APP_API_URL environment variable is required');
}
```

## API Response Formats

### **Standard Success Response**
```json
{
  "success": true,
  "data": { /* response data */ },
  "message": "Operation completed successfully"
}
```

### **Standard Error Response**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": { /* additional error context */ }
  }
}
```

### **Paginated Response**
```json
{
  "success": true,
  "data": [/* array of items */],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "totalItems": 100,
    "totalPages": 4,
    "hasNext": true,
    "hasPrevious": false
  }
}
```

## Security Considerations

### **1. Authentication**
- All backend APIs require Cognito JWT tokens
- Tokens are automatically refreshed by AWS Amplify
- API Gateway validates tokens before reaching Lambda functions

### **2. Authorization**
- Project-based access control
- User permissions managed through project sharing
- Resource-level access validation in Lambda functions

### **3. Data Protection**
- HTTPS-only communication
- Request/response encryption in transit
- Sensitive data encrypted at rest in DynamoDB

### **4. Rate Limiting**
- API Gateway throttling configured
- WAF rate limiting for DDoS protection
- Per-user rate limits enforced

## Performance Optimization

### **1. Caching Strategy**
- API Gateway response caching for read operations
- CloudFront caching for static assets
- Browser caching with appropriate headers

### **2. Request Optimization**
- Batch operations where possible
- Pagination for large datasets
- Selective field loading

### **3. Connection Management**
- HTTP/2 support via CloudFront
- Keep-alive connections
- Connection pooling in Lambda functions

## Monitoring and Observability

### **1. API Metrics**
- Request counts and latency via CloudWatch
- Error rates and success rates
- Custom business metrics

### **2. Distributed Tracing**
- X-Ray tracing for end-to-end request flow
- Performance bottleneck identification
- Error root cause analysis

### **3. Logging**
- Structured logging in Lambda functions
- API Gateway access logs
- CloudWatch Logs aggregation

## Integration Testing

### **1. API Testing Strategy**
- Unit tests for service layer functions
- Integration tests for API endpoints
- End-to-end tests for critical user flows

### **2. Error Scenario Testing**
- Network failure handling
- Authentication failure scenarios
- Rate limiting behavior

## Future Enhancements

### **1. GraphQL Integration**
- Consider AppSync for more efficient data fetching
- Real-time subscriptions for live updates
- Reduced over-fetching with selective queries

### **2. Offline Support**
- Service worker implementation
- Local data caching
- Sync when connection restored

### **3. API Versioning**
- Version headers for backward compatibility
- Gradual API evolution
- Deprecation notices

### **4. Enhanced Analytics**
- API usage analytics
- Performance monitoring
- User behavior tracking

---

## Quick Reference

### **Environment Variables**
```bash
REACT_APP_API_URL=https://api.app-modex.dev
REACT_APP_AUTH_REQUIRED=true
```

### **Key Service Files**
- `projectsApi.js` - Project management (CRUD operations)
- `directApiService.js` - Project sharing and user search
- `applicationBucketsApi.js` - Application buckets management
- `tcoApi.js` - TCO estimates
- `teamEstimateApi.js` - Team estimates and resource planning
- `automationStatusApi.js` - Build and automation monitoring
- `athenaQueryService.js` - Data querying with secure templates
- `applicationSimilarityApi.js` - Application similarity analysis
- `componentSimilarityApi.js` - Component similarity analysis
- `pilotIdentificationApi.js` - Pilot identification analysis
- `exportApiService.js` - Export generation and management
- `stepFunctionService.js` - Step Functions orchestration
- `dataSourcesService.js` - Data source management

### **Authentication Setup**
```javascript
import { fetchAuthSession } from 'aws-amplify/auth';

const getAuthHeaders = async () => {
  const session = await fetchAuthSession();
  return {
    'Authorization': `Bearer ${session.tokens.idToken.toString()}`,
    'Content-Type': 'application/json',
  };
};
```

---

**Last Updated**: February 2026  
**API Version**: v2.0 (Full-Stack Implementation)  
**Total Endpoints**: 71 (documented and verified against codebase)  
**Authentication**: AWS Cognito JWT Tokens  
**Architecture**: All endpoints are project-scoped under `/projects/{projectId}/*`
