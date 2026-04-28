# App-ModEx Developer Guide

**Version 1.0 | February 2026**

## Purpose

This guide provides comprehensive developer documentation for contributing to or customizing the App-ModEx (Intelligent Applications Modernization Explorer) solution. It covers the technology stack, project structure, local development setup, key components, and contribution guidelines.

## Table of Contents

1. [Technology Stack](#technology-stack)
2. [Project Structure](#project-structure)
3. [Local Development Setup](#local-development-setup)
4. [Key Components](#key-components)
5. [Development History](#development-history)
6. [Contributing](#contributing)
7. [License](#license)
8. [Acknowledgments](#acknowledgments)

---

## Technology Stack

### Frontend

- **Framework**: React 19.1.0
- **UI Components**: AWS Cloudscape Design System
- **Data Visualization**: D3.js for interactive visualizations (radar charts, heatmaps, doughnut charts, bubble charts)
- **Routing**: React Router for client-side navigation
- **State Management**: React Hooks (useState, useEffect, useContext, useCallback, useMemo)
- **Build Tool**: Create React App (react-scripts)
- **Authentication**: AWS Amplify Auth
- **Internationalization**: i18next for multi-language support

### Backend & Infrastructure

- **Infrastructure as Code**: AWS CDK (TypeScript)
- **API**: Amazon API Gateway with Cognito authentication
- **Compute**: AWS Lambda (Node.js 22.x runtime)
- **Database**: Amazon DynamoDB with Streams for event-driven processing
- **Storage**: Amazon S3 for files and static hosting
- **CDN**: Amazon CloudFront with WAF protection
- **AI/ML**: Amazon Bedrock Runtime API with direct model invocation:
  - **Normalization** (Nova Lite): Technology stack standardization
  - **Pilot Analysis** (Claude 3.7 Sonnet): AI-enhanced pilot candidate evaluation
  - **Skill Importance** (Nova Lite): Intelligent skill importance assessment
  - **Prompt Templates**: Stored in DynamoDB with versioning and 1-hour caching
- **Orchestration**: AWS Step Functions for complex workflows:
  - **1 Global Workflow**: Tech Stack Normalization
  - **5 Project-Specific Workflows**: Application Similarity, Component Similarity, Pilot Identification, Skill Importance, Export Generation
- **Analytics**: Amazon Athena for data querying
- **Monitoring**: Amazon CloudWatch, EventBridge, SQS
- **Event Processing**: DynamoDB Streams for real-time event handling
- **Build Automation**: AWS CodeBuild for project provisioning

### Development & Deployment

- **Version Control**: Git
- **Deployment**: Automated scripts with AWS profile and region support
- **CI/CD**: Event-driven project provisioning via CodeBuild
- **Package Management**: npm
- **Code Quality**: ESLint for JavaScript/React linting
- **Testing**: Jest for unit testing (test files in `__tests__` directories)

---

## Project Structure

```
app-modex-project/
├── infrastructure/               # AWS Infrastructure (CDK)
│   ├── lib/                     # CDK stack definitions
│   │   ├── app-modex-application-stack.ts      # AppRegistry and resource groups
│   │   ├── app-modex-prompt-templates-stack.ts # AI prompt management
│   │   ├── app-modex-data-stack.ts             # DynamoDB, Cognito, S3, Glue
│   │   ├── app-modex-backend-stack.ts          # Lambda, SQS, Step Functions
│   │   ├── app-modex-api-stack.ts              # API Gateway
│   │   ├── app-modex-frontend-stack.ts         # S3, CloudFront, WAF
│   │   └── app-modex-lambda-role-manager.ts    # IAM role management
│   ├── lambda/                  # Lambda function source code
│   │   ├── global/              # Core Lambda functions (30+)
│   │   │   ├── projects/        # Project management
│   │   │   ├── project-data/    # Project data operations
│   │   │   ├── tco/             # TCO estimates (CRUD)
│   │   │   ├── application-buckets/  # Application grouping
│   │   │   ├── pilot-identification/ # Pilot analysis
│   │   │   ├── bedrock-normalizer/   # AI-powered normalization
│   │   │   ├── automation-status/    # Build monitoring
│   │   │   ├── provisioning/    # Project provisioning
│   │   │   ├── file-operations/ # File management
│   │   │   ├── data-sources/    # Data source management
│   │   │   ├── user-search/     # User directory search
│   │   │   ├── athena-query/    # Data querying
│   │   │   ├── team-weights/    # Team analysis
│   │   │   ├── team-estimates/  # Resource planning
│   │   │   ├── step-function-api/    # Workflow orchestration
│   │   │   ├── step-function-trigger/ # Workflow triggers
│   │   │   ├── export-initiator/     # Export generation
│   │   │   ├── export-reader/        # Export retrieval
│   │   │   ├── sharing/              # Project sharing
│   │   │   └── seed-prompts/         # AI prompt initialization
│   │   ├── project-specific/    # Per-project Lambda functions
│   │   │   ├── data-processing/ # Data normalization
│   │   │   ├── data-sourcing/   # Data retrieval
│   │   │   ├── excel-generator/ # Export generation
│   │   │   ├── zip-packager/    # Export packaging
│   │   │   ├── pilot-partition/ # Pilot analysis partitioning
│   │   │   ├── pilot-process/   # Pilot analysis processing
│   │   │   ├── pilot-aggregate/ # Pilot results aggregation
│   │   │   ├── pilot-rank/      # Pilot ranking
│   │   │   ├── app-similarity-*/ # Application similarity analysis
│   │   │   ├── component-similarity-*/ # Component similarity analysis
│   │   │   └── skill-importance-*/ # Skill importance scoring
│   │   ├── layers/              # Lambda layers
│   │   │   └── shared/          # Shared dependencies
│   │   └── shared/              # Shared utilities
│   │       ├── logger.js        # Logging utility
│   │       ├── promptService.js # AI prompt management
│   │       ├── sanitizeEvent.js # Event sanitization
│   │       └── secretsManager.js # Secrets management
│   ├── stepfunctions/           # Step Functions definitions
│   │   ├── global/              # Global workflows
│   │   │   └── tech-stack-normalization.json
│   │   └── project-specific/    # Per-project workflows
│   │       ├── application-similarity.json
│   │       ├── component-similarity.json
│   │       ├── pilot-analysis.json
│   │       ├── skill-importance.json
│   │       └── export-workflow.json
│   ├── scripts/                 # Deployment scripts
│   │   ├── deploy.sh            # Full deployment (all 6 stacks)
│   │   ├── deploy-application-stack.sh
│   │   ├── deploy-prompt-templates-stack.sh
│   │   ├── deploy-data-stack.sh
│   │   ├── deploy-backend-stack.sh
│   │   ├── deploy-api-stack.sh
│   │   ├── deploy-frontend-stack.sh
│   │   └── generate_env.sh      # Environment file generation
│   ├── buildspec.yml            # CodeBuild configuration
│   ├── package.json             # CDK dependencies
│   └── cdk.json                 # CDK configuration
├── app-modex-ui/                # React frontend application
│   ├── src/
│   │   ├── components/          # Reusable UI components
│   │   │   ├── info/            # Page-specific info panels (30+ files)
│   │   │   ├── auth/            # Authentication components
│   │   │   │   ├── LoginForm.js
│   │   │   │   ├── ChangePasswordModal.js
│   │   │   │   ├── AuthenticatedRoute.js
│   │   │   │   └── UserProfile.js
│   │   │   ├── charts/          # D3.js visualization components
│   │   │   │   ├── TechRadarChart.js
│   │   │   │   ├── HeatmapChart.js
│   │   │   │   ├── BubbleChart.js
│   │   │   │   ├── DoughnutChart.js
│   │   │   │   ├── BarChart.js
│   │   │   │   └── LineChart.js
│   │   │   ├── dataProcessing/  # Data processing components
│   │   │   ├── export/          # Export components
│   │   │   ├── modals/          # Modal dialogs
│   │   │   ├── CustomSideNavigation.js
│   │   │   ├── DataSourcesSection.js
│   │   │   ├── ShareProjectModal.js
│   │   │   ├── FileUploadModal.js
│   │   │   ├── AutoRefreshControl.js
│   │   │   ├── DownloadButtons.js
│   │   │   ├── ExportHistoryTable.js
│   │   │   ├── PilotIdentificationTrigger.js
│   │   │   ├── SimilaritiesAnalysisTrigger.js
│   │   │   └── ... (50+ component files)
│   │   ├── services/            # API services
│   │   │   ├── projectsApi.js           # Project management
│   │   │   ├── applicationBucketsApi.js # Application buckets
│   │   │   ├── tcoApi.js                # TCO estimates
│   │   │   ├── teamEstimateApi.js       # Team estimates
│   │   │   ├── athenaQueryService.js    # Data querying
│   │   │   ├── automationStatusApi.js   # Build monitoring
│   │   │   ├── pilotIdentificationApi.js # Pilot analysis
│   │   │   ├── applicationSimilarityApi.js # Similarity analysis
│   │   │   ├── componentSimilarityApi.js   # Component similarity
│   │   │   ├── dataSourcesService.js    # File management
│   │   │   ├── directApiService.js      # Project sharing
│   │   │   ├── authService.js           # Authentication
│   │   │   ├── exportApiService.js      # Export generation
│   │   │   ├── stepFunctionService.js   # Workflow status
│   │   │   └── s3UploadService.js       # File uploads
│   │   ├── pages/               # Page components
│   │   │   ├── data/            # Data section pages
│   │   │   │   ├── SkillsPage.js
│   │   │   │   ├── TechRadarPage.js
│   │   │   │   ├── PortfolioPage.js
│   │   │   │   ├── TechStackPage.js
│   │   │   │   ├── InfrastructurePage.js
│   │   │   │   └── UtilizationPage.js
│   │   │   ├── insights/        # Insights section pages
│   │   │   │   ├── SkillsAnalysisPage.js
│   │   │   │   ├── TechStackAnalysisPage.js
│   │   │   │   ├── InfrastructureAnalysisPage.js
│   │   │   │   ├── UtilizationAnalysisPage.js
│   │   │   │   ├── VisionAnalysisPage.js
│   │   │   │   └── TeamAnalysisPage.js
│   │   │   ├── planning/        # Planning section pages
│   │   │   │   ├── PilotIdentificationPage.js
│   │   │   │   ├── ApplicationGroupingPage.js
│   │   │   │   ├── TCOPage.js
│   │   │   │   └── TeamEstimatePage.js
│   │   │   ├── similarities/    # Similarity analysis pages
│   │   │   │   ├── ApplicationSimilaritiesPage.js
│   │   │   │   └── ComponentSimilaritiesPage.js
│   │   │   ├── execution/       # Execution section pages
│   │   │   ├── DataProcessingPage.js
│   │   │   ├── ExportDataPage.js
│   │   │   ├── ProjectsListPage.js
│   │   │   ├── ProjectHomePage.js
│   │   │   └── LandingPage.js
│   │   ├── contexts/            # React contexts
│   │   │   └── SimpleAuthContext.js
│   │   ├── hooks/               # Custom React hooks
│   │   │   ├── useAutoRefresh.js
│   │   │   ├── useDataSourceCheck.js
│   │   │   ├── useProjectPermissions.js
│   │   │   └── useResizeObserver.js
│   │   ├── hoc/                 # Higher-order components
│   │   │   └── withResizeOptimization.js
│   │   ├── utils/               # Utility functions
│   │   │   ├── authUtils.js
│   │   │   ├── dataComparisonUtils.js
│   │   │   ├── errorHandlers.js
│   │   │   ├── exportValidation.ts
│   │   │   ├── projectUtils.js
│   │   │   ├── resizeUtils.js
│   │   │   └── mockDataGenerators.js
│   │   ├── config/              # Configuration files
│   │   │   ├── amplifyConfig.js
│   │   │   ├── apiConfig.js
│   │   │   └── exportCategories.ts
│   │   ├── i18n/                # Internationalization
│   │   │   └── index.js
│   │   ├── locales/             # Translation files
│   │   │   └── en/              # English translations
│   │   ├── types/               # TypeScript types
│   │   │   └── export.ts
│   │   ├── App.js               # Main application component
│   │   ├── index.js             # Application entry point
│   │   └── index.css            # Global CSS styles
│   ├── public/                  # Static assets
│   │   ├── index.html
│   │   ├── logo.svg
│   │   └── manifest.json
│   ├── .env.example             # Environment variables template
│   ├── package.json             # Frontend dependencies
│   └── README.md                # Frontend-specific README
├── SAMPLE_DATA/                 # Sample CSV files for testing (synthetic, AI-generated via Kiro CLI)
│   ├── 1_skills_inventory.csv
│   ├── 2_technology_radar.csv
│   ├── 3_application_inventory.csv
│   ├── 4_technology_components.csv
│   ├── 5_infrastructure_resources.csv
│   └── 6_resource_utilization.csv
├── diagrams/                    # Architecture diagrams
│   ├── app-modex-core-architecture.png
│   └── app-modex-per-project-architecture.png
├── DEVELOPER_GUIDE.md           # This file
├── README2.md                   # AWS Guidance Samples README (deployment)
├── USER_GUIDE.md                # End-user guide (usage)
├── CUSTOMIZATION_GUIDE.md       # Technical customization guide
├── INFRASTRUCTURE.md            # Infrastructure documentation
├── INTEGRATION.md               # API integration documentation
└── LICENSE.md                   # License information
```

---

## Local Development Setup

### Prerequisites

- **Node.js** v22 or later (to match Lambda runtime)
- **npm** v9 or later (comes with Node.js)
- **AWS CLI** v2.x configured with appropriate credentials
- **AWS CDK CLI** v2.x - Install globally: `npm install -g aws-cdk`
- **Git** for version control
- **Code Editor**: VS Code recommended (with ESLint extension)

### Installation Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/aws-solutions-library-samples/guidance-for-intelligent-application-modernization-explorer.git
   cd app-modex-project
   ```

2. **Install frontend dependencies:**
   ```bash
   cd app-modex-ui
   npm install
   ```

3. **Install infrastructure dependencies:**
   ```bash
   cd ../infrastructure
   npm install
   ```

### Environment Configuration

The frontend application requires environment variables to connect to the AWS backend. You have two options:

#### Option 1: Automated Generation (Recommended)

Use the `generate_env.sh` script to automatically extract configuration from your deployed AWS infrastructure:

```bash
cd infrastructure/scripts
./generate_env.sh -r your-aws-region
```

**What the script does:**
- Queries CloudFormation stacks for deployed resource information
- Extracts API Gateway URL, Cognito User Pool IDs, and other configuration
- Generates a properly formatted `.env` file in `app-modex-ui/`
- Creates a backup of any existing `.env` file

**Script Options:**
```bash
./generate_env.sh -r eu-west-2                     # Generate from eu-west-2 region
./generate_env.sh -r us-east-1 -p my-aws-profile  # Use specific AWS profile
./generate_env.sh -r eu-west-2 -o .env.local       # Output to .env.local file
./generate_env.sh -h                               # Show help
```

**Prerequisites:**
- AWS CLI configured with appropriate credentials
- App-ModEx backend infrastructure deployed in the target region
- Permissions to describe CloudFormation stacks

#### Option 2: Manual Configuration

Create a `.env` file manually in the `app-modex-ui` directory:

```bash
# Core Configuration
REACT_APP_API_URL=https://your-api-gateway-url
REACT_APP_AWS_REGION=your-aws-region

# Authentication (required for real backend)
REACT_APP_USER_POOL_ID=your-cognito-user-pool-id
REACT_APP_USER_POOL_CLIENT_ID=your-cognito-client-id
REACT_APP_IDENTITY_POOL_ID=your-cognito-identity-pool-id

# Feature Flags
REACT_APP_USE_MOCK_API=false
REACT_APP_AUTH_REQUIRED=true
REACT_APP_REAL_TIME_UPDATES=true
REACT_APP_ANALYTICS_ENABLED=false
REACT_APP_DEBUG_MODE=true
```

**Finding Configuration Values:**

To get the required values from your deployed infrastructure:

```bash
# Get API URL
aws cloudformation describe-stacks \
  --stack-name AppModEx-Api \
  --region your-region \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' \
  --output text

# Get User Pool ID
aws cloudformation describe-stacks \
  --stack-name AppModEx-Data \
  --region your-region \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text

# Get User Pool Client ID
aws cloudformation describe-stacks \
  --stack-name AppModEx-Data \
  --region your-region \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' \
  --output text
```

**Note:** For local development without a deployed backend, you can set `REACT_APP_AUTH_REQUIRED=false` to bypass authentication.

### Running the Development Server

```bash
cd app-modex-ui
npm start
```

The application will open at `http://localhost:3000` with hot-reloading enabled.

### Building for Production

```bash
cd app-modex-ui
npm run build
```

The optimized production build will be created in the `build/` directory.

### Running Tests

```bash
cd app-modex-ui
npm test
```

### Linting

```bash
cd app-modex-ui
npm run lint
```

---

## Key Components

### Navigation and Layout

**File**: `app-modex-ui/src/components/CustomSideNavigation.js`

The application features a responsive layout with:
- Collapsible sidebar navigation that can be toggled open/closed
- Hierarchical navigation structure with expandable sections
- Project name displayed in the top navigation bar
- Quick access buttons at the bottom of the sidebar
- Responsive design that adapts to different screen sizes
- Custom scrollbar styling for better user experience

**Key Features:**
- Dynamic navigation items based on user permissions
- Active item highlighting
- Section expansion/collapse state management
- Integration with React Router for navigation

### Pilot Identification

**Files**: 
- `app-modex-ui/src/pages/planning/PilotIdentificationPage.js`
- `infrastructure/lambda/global/pilot-identification/`
- `infrastructure/stepfunctions/project-specific/pilot-analysis.json`

The Pilot Identification page uses a revolutionary three-stage AI-enhanced approach:

**Three-Stage Analysis:**
1. **Rule-Based Results**: Algorithmic scoring based on business drivers and technical feasibility
2. **AI-Enhanced Results**: Context-aware analysis using Amazon Bedrock (Claude 3.7 Sonnet)
3. **Consolidated Results**: Intelligent weighted combination optimized by AI confidence levels

**Key Features:**
- Selection criteria based on business drivers and compelling events
- Advanced settings for team capabilities, risk tolerance, and scoring weights
- Tab navigation to compare all three result types side-by-side
- Analysis criteria display showing parameters used
- Candidate applications displayed as cards with comprehensive metrics
- Detailed view with algorithmic breakdown, AI insights, and recommendations
- Similar applications table with filtering and sorting
- Score agreement tracking and divergence analysis
- "Create Bucket with this Pilot" button for workflow integration

**AI Context Integration:**
- Application similarity patterns from previous analyses
- Component technology clusters and reuse opportunities
- Team skills inventory and capability matching
- Skill gaps analysis and training needs identification
- Technology vision alignment with strategic goals
- Team capacity and resource availability

### Application Buckets

**Files**:
- `app-modex-ui/src/pages/planning/ApplicationGroupingPage.js`
- `infrastructure/lambda/global/application-buckets/`

The Application Buckets page allows grouping similar applications:
- Table of existing buckets with filtering and sorting
- Create bucket functionality with pilot application selection
- Edit bucket with similarity threshold adjustment
- View applications in a bucket with detailed tech stack information
- Integration with Pilot Identification page for seamless workflow

**Technical Implementation:**
- Uses DynamoDB for bucket storage
- Calculates similarity scores based on technology stack components
- Real-time filtering based on similarity threshold
- Supports CRUD operations via API Gateway endpoints

### TCO Estimation

**Files**:
- `app-modex-ui/src/pages/planning/TCOPage.js`
- `infrastructure/lambda/global/tco/`

The TCO Estimate page provides cost analysis for application modernization:
- Table of TCO estimates with expandable cost details
- Create and edit TCO estimates with detailed cost components
- Application costs calculated based on similarity to pilot application
- Cost summary showing aggregated costs across all applications
- Action buttons for editing and deleting TCO estimates

**Cost Calculation Logic:**
- Base costs entered for pilot application
- Similar applications' costs adjusted by similarity percentage
- Aggregation across all applications in bucket
- Separate tracking for development, infrastructure, and operational costs

### Team Estimates

**Files**:
- `app-modex-ui/src/pages/planning/TeamEstimatePage.js`
- `infrastructure/lambda/global/team-estimates/`

The Team Estimates page provides resource allocation and timeline planning:
- Table of team estimates with expandable resource details
- Create and edit team estimates based on pilot application characteristics
- Individual application complexity and delivery mode customization
- Real-time resource calculations using similarity scores
- Time required calculations with delivery mode optimizations
- Skills selection and management with local skill creation

**Resource Calculation:**
- Base resources defined for pilot application
- Complexity factors applied per application
- Parallelization constraints considered
- Delivery mode affects resource allocation (Faster vs Cheaper)

### Data Visualization Components

**Files**: `app-modex-ui/src/components/charts/`

#### Technology Radar Chart
**File**: `TechRadarChart.js`

Interactive radar visualization showing technology adoption phases:
- Four quadrants: Languages & Frameworks, Tools, Platforms, Techniques
- Four rings: Adopt, Trial, Assess, Hold
- D3.js-based implementation with zoom and pan
- Responsive design with resize optimization
- Tooltip showing technology details on hover

#### Heatmap Chart
**File**: `HeatmapChart.js`

Visualizes correlations between skills and technologies:
- Color-coded cells showing proficiency levels
- Interactive tooltips with detailed information
- Sortable rows and columns
- Zoom and pan capabilities
- Export to PNG functionality

#### Doughnut Chart
**File**: `DoughnutChart.js`

Analyzes technology stack and infrastructure distribution:
- Interactive segments with hover effects
- Legend with color coding
- Percentage and count display
- Responsive sizing
- Click-to-filter functionality

#### Bubble Chart
**File**: `BubbleChart.js`

Shows application clustering and similarity:
- Bubble size represents application size/complexity
- Color represents cluster membership
- Interactive tooltips with application details
- Zoom and pan capabilities
- Force-directed layout for optimal positioning

### Data Tables

**Files**: Various table components in `app-modex-ui/src/components/`

All data tables share common features:
- **Pagination**: Configurable page size (10, 25, 50, 100 items)
- **Filtering**: Column-specific filters with text search
- **Sorting**: Click column headers to sort ascending/descending
- **Column Visibility**: Show/hide columns via preferences
- **Selection**: Single or multi-select rows
- **Actions**: Edit, delete, view details buttons
- **Download**: Export filtered or complete dataset to CSV
- **Empty State**: Helpful messages when no data available
- **Loading State**: Spinner during data fetch

**Implementation Pattern:**
```javascript
<Table
  columnDefinitions={columns}
  items={filteredItems}
  loading={loading}
  loadingText="Loading data..."
  sortingColumn={sortingColumn}
  sortingDescending={sortingDescending}
  onSortingChange={handleSortingChange}
  filter={
    <TextFilter
      filteringText={filteringText}
      onChange={handleFilterChange}
    />
  }
  pagination={
    <Pagination
      currentPageIndex={currentPage}
      pagesCount={totalPages}
      onChange={handlePageChange}
    />
  }
  preferences={
    <CollectionPreferences
      visibleContentOptions={visibleColumns}
      onConfirm={handlePreferencesChange}
    />
  }
/>
```

### Authentication Components

**Files**: `app-modex-ui/src/components/auth/`

#### LoginForm
Handles user authentication with Cognito:
- Email/password input
- Remember me functionality
- Forgot password link
- Error handling and display
- Integration with AWS Amplify Auth

#### ChangePasswordModal
Forces password change for new users:
- Current password verification
- New password with strength requirements
- Confirmation field
- Real-time validation
- Success/error feedback

#### AuthenticatedRoute
Protects routes requiring authentication:
- Checks authentication status
- Redirects to login if not authenticated
- Preserves intended destination
- Handles token refresh

### Project Sharing

**Files**:
- `app-modex-ui/src/components/ShareProjectModal.js`
- `infrastructure/lambda/global/sharing/`

Implements granular access control:
- User search functionality
- Permission levels (read-only, read-write)
- Real-time permission updates
- Owner-only controls
- Confirmation dialogs for destructive actions
- No email notifications (deferred feature)

**Technical Implementation:**
- DynamoDB table for sharing records
- Cognito user search via Lambda
- Real-time updates via API calls
- Permission validation in backend

### Export Functionality

**Files**:
- `app-modex-ui/src/pages/ExportDataPage.js`
- `infrastructure/lambda/project-specific/excel-generator/`
- `infrastructure/lambda/project-specific/zip-packager/`
- `infrastructure/stepfunctions/project-specific/export-workflow.json`

Comprehensive export system with:
- Category selection (skills, portfolio, tech stack, infrastructure, utilization)
- Export history tracking
- Download management
- Status monitoring
- Error handling and retry logic

**Export Workflow:**
1. User selects categories to export
2. Frontend triggers Step Functions workflow
3. Data sourcing Lambda retrieves data from DynamoDB/Athena
4. Excel generator creates formatted spreadsheets
5. Zip packager combines files
6. S3 stores final export
7. User downloads via presigned URL

### Step Functions Integration

**Files**: `infrastructure/stepfunctions/`

The solution uses AWS Step Functions for orchestrating complex workflows:

#### Global Workflows
- **Tech Stack Normalization**: AI-powered technology standardization using Bedrock Nova Lite

#### Project-Specific Workflows
- **Application Similarity**: Parallel processing of similarity calculations
- **Component Similarity**: Technology component clustering
- **Pilot Identification**: Three-stage analysis (rule-based, AI-enhanced, consolidated)
- **Skill Importance**: AI-powered skill importance scoring
- **Export Generation**: Multi-step export creation and packaging

**Implementation Pattern:**
- Map state for parallel processing
- Choice state for conditional logic
- Task state for Lambda invocations
- Error handling with Catch and Retry
- DynamoDB integration for state persistence

---

## Backend Architecture Deep Dive

This section provides detailed technical information about the backend infrastructure components, their organization, and implementation patterns.

### Lambda Functions Detailed Breakdown

The solution uses **43 Lambda functions** (all running Node.js 22.x runtime) organized into functional categories:

#### Core Business Functions (5 functions)

| Function Name | Purpose | Trigger |
|--------------|---------|---------|
| `app-modex-create-project` | Creates new projects and initiates provisioning | API Gateway POST /projects |
| `app-modex-list-projects` | Lists all projects for authenticated user | API Gateway GET /projects |
| `app-modex-get-project` | Retrieves project details | API Gateway GET /projects/{id} |
| `app-modex-delete-project` | Deletes project and triggers cleanup | API Gateway DELETE /projects/{id} |
| `app-modex-update-project` | Updates project metadata | API Gateway PUT /projects/{id} |

#### File Management Functions (3 functions)

| Function Name | Purpose | Trigger |
|--------------|---------|---------|
| `app-modex-file-upload` | Handles file uploads with presigned URLs | API Gateway POST /upload |
| `app-modex-file-download` | Generates presigned URLs for downloads | API Gateway GET /files/{key} |
| `app-modex-file-delete` | Deletes files from S3 | API Gateway DELETE /files/{key} |

#### Planning & Analysis Functions (14 functions)

| Function Name | Purpose | Trigger |
|--------------|---------|---------|
| `app-modex-create-bucket` | Creates application bucket | API Gateway POST /buckets |
| `app-modex-list-buckets` | Lists all buckets for project | API Gateway GET /buckets |
| `app-modex-get-bucket` | Retrieves bucket details | API Gateway GET /buckets/{id} |
| `app-modex-update-bucket` | Updates bucket configuration | API Gateway PUT /buckets/{id} |
| `app-modex-delete-bucket` | Deletes application bucket | API Gateway DELETE /buckets/{id} |
| `app-modex-create-tco` | Creates TCO estimate | API Gateway POST /tco |
| `app-modex-list-tco` | Lists TCO estimates | API Gateway GET /tco |
| `app-modex-get-tco` | Retrieves TCO details | API Gateway GET /tco/{id} |
| `app-modex-update-tco` | Updates TCO estimate | API Gateway PUT /tco/{id} |
| `app-modex-delete-tco` | Deletes TCO estimate | API Gateway DELETE /tco/{id} |
| `app-modex-create-team-estimate` | Creates team resource estimate | API Gateway POST /team-estimates |
| `app-modex-list-team-estimates` | Lists team estimates | API Gateway GET /team-estimates |
| `app-modex-update-team-estimate` | Updates team estimate | API Gateway PUT /team-estimates/{id} |
| `app-modex-delete-team-estimate` | Deletes team estimate | API Gateway DELETE /team-estimates/{id} |

#### Data Processing & Normalization Functions (7 functions)

| Function Name | Purpose | Trigger |
|--------------|---------|---------|
| `app-modex-data-source-processor` | Processes uploaded data files | DynamoDB Stream |
| `app-modex-unified-normalization` | Normalizes technology names via Bedrock | Step Functions |
| `app-modex-bedrock-normalizer` | Direct Bedrock model invocation for normalization | Lambda invocation |
| `app-modex-data-sourcing` | Retrieves data from DynamoDB/Athena | Step Functions |
| `app-modex-compare-with-athena` | Compares uploaded data with Athena | API Gateway POST /compare |
| `app-modex-get-data-sources` | Lists data sources for project | API Gateway GET /data-sources |
| `app-modex-delete-data-source` | Deletes data source | API Gateway DELETE /data-sources/{id} |

#### Analytics & Query Functions (5 functions)

| Function Name | Purpose | Trigger |
|--------------|---------|---------|
| `app-modex-athena-query` | Executes Athena queries | API Gateway POST /query |
| `app-modex-get-team-weights` | Retrieves team category weights | API Gateway GET /team-weights |
| `app-modex-update-team-weights` | Updates team weights and triggers skill scoring | API Gateway PUT /team-weights |
| `app-modex-pilot-identification` | Triggers pilot analysis workflow | API Gateway POST /pilot-identification |
| `app-modex-get-pilot-results` | Retrieves pilot analysis results | API Gateway GET /pilot-identification |

#### Workflow & Orchestration Functions (4 functions)

| Function Name | Purpose | Trigger |
|--------------|---------|---------|
| `app-modex-step-function-trigger` | Triggers Step Functions workflows | API Gateway POST /workflows/trigger |
| `app-modex-step-function-status` | Checks workflow execution status | API Gateway GET /workflows/status |
| `app-modex-export-initiator` | Initiates export workflow | API Gateway POST /export |
| `app-modex-export-reader` | Retrieves export results | API Gateway GET /export/{id} |

#### Infrastructure & Operations Functions (4 functions)

| Function Name | Purpose | Trigger |
|--------------|---------|---------|
| `app-modex-provisioning-trigger` | Triggers CodeBuild for project provisioning | DynamoDB Stream |
| `app-modex-build-monitor` | Monitors CodeBuild status via EventBridge | EventBridge Rule |
| `app-modex-automation-status` | Returns build status | API Gateway GET /automation-status |
| `app-modex-dlq-redrive` | Automatically reprocesses failed messages | Scheduled (EventBridge) |

#### Prompt Templates Function (1 function)

| Function Name | Purpose | Trigger |
|--------------|---------|---------|
| `app-modex-seed-prompts` | Seeds initial AI prompts to DynamoDB | CloudFormation Custom Resource |

#### Project-Specific Functions (Dynamically Created)

In addition to the global functions above, each project gets its own set of Lambda functions created during provisioning:

- **Pilot Analysis Functions** (4 per project): partition, process, aggregate, rank
- **Application Similarity Functions** (3 per project): calculate, aggregate, store
- **Component Similarity Functions** (3 per project): calculate, cluster, store
- **Skill Importance Functions** (2 per project): orchestrator, scorer
- **Export Functions** (2 per project): excel-generator, zip-packager

**Total Lambda Functions**: 43 global + ~14 per project

### Lambda Layers Architecture

All Lambda functions share a common Lambda Layer that provides reusable utilities and reduces code duplication.

#### Shared Layer Structure

**Location**: `infrastructure/lambda/layers/shared/`

The shared layer includes four core utilities:

**1. Logger Utility (`logger.js`)**

Provides centralized, structured logging with consistent formatting:

```javascript
// Features:
// - Structured JSON logging for CloudWatch Insights
// - Automatic request ID tracking
// - Log level support (DEBUG, INFO, WARN, ERROR)
// - Sanitization of sensitive data
// - Performance timing utilities

// Usage in Lambda functions:
const logger = require('/opt/nodejs/logger');

exports.handler = async (event) => {
  logger.info('Processing request', { projectId: event.projectId });
  
  try {
    // Business logic
    logger.debug('Intermediate result', { data });
  } catch (error) {
    logger.error('Processing failed', { error: error.message });
    throw error;
  }
};
```

**2. Prompt Service (`promptService.js`)**

Manages AI prompt templates with caching:

```javascript
// Features:
// - Retrieves prompts from DynamoDB
// - 1-hour in-memory caching to reduce DynamoDB reads
// - Version management
// - Fallback to default prompts
// - Automatic cache invalidation

// Usage:
const { getPrompt } = require('/opt/nodejs/promptService');

const prompt = await getPrompt('normalization', 'v1');
// Subsequent calls within 1 hour use cached version
```

**Caching Strategy:**
- Cache TTL: 1 hour (3600 seconds)
- Cache key: `${promptType}-${version}`
- Invalidation: Automatic after TTL expires
- Benefits: Reduces DynamoDB costs by ~95% for prompt retrieval

**3. Event Sanitizer (`sanitizeEvent.js`)**

Sanitizes events before logging to prevent sensitive data exposure:

```javascript
// Features:
// - Removes Authorization headers
// - Masks API keys and tokens
// - Redacts PII (email, phone, SSN)
// - Truncates large payloads
// - Preserves structure for debugging

// Usage:
const { sanitizeEvent } = require('/opt/nodejs/sanitizeEvent');

exports.handler = async (event) => {
  const sanitized = sanitizeEvent(event);
  logger.info('Received event', { event: sanitized });
};
```

**4. Secrets Manager Helper (`secretsManager.js`)**

Simplifies Secrets Manager integration with caching:

```javascript
// Features:
// - Retrieves secrets from AWS Secrets Manager
// - In-memory caching (5-minute TTL)
// - Automatic JSON parsing
// - Error handling and retries

// Usage:
const { getSecret } = require('/opt/nodejs/secretsManager');

const config = await getSecret('app-modex-config-prod');
const userPoolId = config.userPoolId;
```

#### Layer Configuration

**CDK Definition** (`infrastructure/lib/app-modex-backend-stack.ts`):

```typescript
// Create Lambda Layer
const sharedLayer = new lambda.LayerVersion(this, 'SharedLayer', {
  code: lambda.Code.fromAsset('lambda/layers/shared'),
  compatibleRuntimes: [lambda.Runtime.NODEJS_22_X],
  description: 'Shared utilities for App-ModEx Lambda functions',
  layerVersionName: 'app-modex-shared-layer',
});

// Attach to all Lambda functions
const myFunction = new lambda.Function(this, 'MyFunction', {
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda/my-function'),
  layers: [sharedLayer],  // Add shared layer
});
```

#### Benefits of Lambda Layers

1. **Code Reuse**: Write once, use in all 43+ functions
2. **Consistency**: Standardized logging, error handling, and utilities
3. **Reduced Package Size**: Shared dependencies don't count toward function size limits
4. **Faster Deployments**: Update layer once instead of 43 functions
5. **Cost Optimization**: Prompt caching reduces DynamoDB read costs by 95%
6. **Maintainability**: Single source of truth for common utilities

### API Gateway Endpoints Breakdown

The solution exposes **71 REST API endpoints** organized into 26 functional domains:

#### Projects Domain (5 endpoints)
- `POST /projects` - Create new project
- `GET /projects` - List all projects
- `GET /projects/{id}` - Get project details
- `PUT /projects/{id}` - Update project
- `DELETE /projects/{id}` - Delete project

#### Project Data Domain (5 endpoints)
- `POST /project-data` - Create project data
- `GET /project-data` - List project data
- `GET /project-data/{id}` - Get data details
- `PUT /project-data/{id}` - Update data
- `DELETE /project-data/{id}` - Delete data

#### Sharing Domain (6 endpoints)
- `POST /sharing/share` - Share project with user
- `GET /sharing/shared-users` - List users with access
- `DELETE /sharing/unshare` - Remove user access
- `GET /sharing/shared-projects` - List projects shared with me
- `POST /sharing/search-users` - Search for users to share with
- `GET /sharing/permissions` - Get my permissions for project

#### Process Tracking Domain (2 endpoints)
- `GET /process-tracking` - List all processes
- `GET /process-tracking/{id}` - Get process details

#### Application Buckets Domain (5 endpoints)
- `POST /buckets` - Create application bucket
- `GET /buckets` - List all buckets
- `GET /buckets/{id}` - Get bucket details
- `PUT /buckets/{id}` - Update bucket
- `DELETE /buckets/{id}` - Delete bucket

#### TCO Estimates Domain (6 endpoints)
- `POST /tco` - Create TCO estimate
- `GET /tco` - List all TCO estimates
- `GET /tco/{id}` - Get TCO details
- `PUT /tco/{id}` - Update TCO estimate
- `DELETE /tco/{id}` - Delete TCO estimate
- `GET /tco/summary` - Get cost summary

#### Team Estimates Domain (6 endpoints)
- `POST /team-estimates` - Create team estimate
- `GET /team-estimates` - List all estimates
- `GET /team-estimates/{id}` - Get estimate details
- `PUT /team-estimates/{id}` - Update estimate
- `DELETE /team-estimates/{id}` - Delete estimate
- `GET /team-estimates/summary` - Get resource summary

#### Athena Query Domain (1 endpoint)
- `POST /query` - Execute Athena query

#### Team Weights Domain (2 endpoints)
- `GET /team-weights` - Get team category weights
- `PUT /team-weights` - Update weights (triggers skill importance scoring)

#### Step Function API Domain (2 endpoints)
- `POST /workflows/trigger` - Trigger workflow
- `GET /workflows/status` - Check workflow status

#### Application Similarities Domain (3 endpoints)
- `POST /similarities/applications` - Trigger similarity analysis
- `GET /similarities/applications` - Get analysis results
- `DELETE /similarities/applications` - Delete results

#### Component Similarities Domain (3 endpoints)
- `POST /similarities/components` - Trigger component analysis
- `GET /similarities/components` - Get component results
- `DELETE /similarities/components` - Delete results

#### Pilot Identification Domain (3 endpoints)
- `POST /pilot-identification` - Trigger pilot analysis
- `GET /pilot-identification` - Get pilot results
- `DELETE /pilot-identification` - Delete results

#### Export Domain (5 endpoints)
- `POST /export` - Trigger export generation
- `GET /export/history` - List export history
- `GET /export/{id}` - Get export details
- `GET /export/{id}/download` - Download export file
- `DELETE /export/{id}` - Delete export

#### Automation Status Domain (1 endpoint)
- `GET /automation-status` - Get CodeBuild status

#### Provisioning Domain (1 endpoint)
- `POST /provisioning/trigger` - Trigger project provisioning

#### Build Monitor Domain (1 endpoint)
- `GET /build-monitor/status` - Get build status

#### File Operations Domain (2 endpoints)
- `POST /upload` - Upload file (presigned URL)
- `GET /files/{key}` - Download file (presigned URL)

#### Files Domain (2 endpoints)
- `GET /files/{key}/download` - Generate download URL
- `DELETE /files/{key}` - Delete file

#### Data Sources Domain (2 endpoints)
- `GET /data-sources` - List data sources
- `DELETE /data-sources/{id}` - Delete data source

#### File Upload Domain (1 endpoint)
- `POST /file-upload` - Direct file upload

#### Compare with Athena Domain (1 endpoint)
- `POST /compare` - Compare data with Athena

#### Role Mapper Domain (2 endpoints)
- `GET /role-mapper` - Get role mappings
- `POST /role-mapper` - Create role mapping

#### Step Function Trigger Domain (1 endpoint)
- `POST /step-function/trigger` - Trigger Step Function

#### Pilot Identification Async Domain (1 endpoint)
- `POST /pilot-identification/async` - Async pilot analysis

**Total API Endpoints**: 71

**Authentication**: All endpoints require Cognito JWT token authentication via API Gateway authorizer.

**CORS Configuration**: Configured to allow requests from CloudFront distribution and localhost (development).

### Amazon Bedrock Integration Details

The solution uses direct Bedrock model invocation for three AI-enhanced features, with comprehensive safety controls via Bedrock Guardrails.

#### Bedrock Guardrails Configuration

**Purpose**: Content filtering and safety controls for all AI model outputs

**Guardrail Name**: `app-modex-content-filter`

**Content Policy Filters**:

| Filter Type | Strength | Applied To |
|------------|----------|------------|
| SEXUAL | High | Input & Output |
| VIOLENCE | High | Input & Output |
| HATE | High | Input & Output |
| INSULTS | Medium | Input & Output |
| MISCONDUCT | Medium | Input & Output |
| PROMPT_ATTACK | High | Input Only |

**PII Detection & Anonymization**:

| PII Type | Action |
|----------|--------|
| EMAIL | Anonymize |
| PHONE | Anonymize |
| NAME | Anonymize |
| US_SOCIAL_SECURITY_NUMBER | Block |
| CREDIT_DEBIT_CARD_NUMBER | Block |
| AWS_ACCESS_KEY | Block |
| AWS_SECRET_KEY | Block |

**Topic Blocking**:
- Financial Advice: Denied
- Medical Advice: Denied

**Custom Messaging**:
- Blocked Input: "Your request contains content that violates our usage policies."
- Blocked Output: "The AI response was filtered due to content policy violations."

**Implementation** (`infrastructure/lib/app-modex-prompt-templates-stack.ts`):

```typescript
const guardrail = new bedrock.CfnGuardrail(this, 'ContentFilterGuardrail', {
  name: 'app-modex-content-filter',
  blockedInputMessaging: 'Your request contains content that violates our usage policies.',
  blockedOutputsMessaging: 'The AI response was filtered due to content policy violations.',
  contentPolicyConfig: {
    filtersConfig: [
      { type: 'SEXUAL', inputStrength: 'HIGH', outputStrength: 'HIGH' },
      { type: 'VIOLENCE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
      { type: 'HATE', inputStrength: 'HIGH', outputStrength: 'HIGH' },
      { type: 'INSULTS', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' },
      { type: 'MISCONDUCT', inputStrength: 'MEDIUM', outputStrength: 'MEDIUM' },
      { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
    ],
  },
  sensitiveInformationPolicyConfig: {
    piiEntitiesConfig: [
      { type: 'EMAIL', action: 'ANONYMIZE' },
      { type: 'PHONE', action: 'ANONYMIZE' },
      { type: 'NAME', action: 'ANONYMIZE' },
      { type: 'US_SOCIAL_SECURITY_NUMBER', action: 'BLOCK' },
      { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
      { type: 'AWS_ACCESS_KEY', action: 'BLOCK' },
      { type: 'AWS_SECRET_KEY', action: 'BLOCK' },
    ],
  },
  topicPolicyConfig: {
    topicsConfig: [
      { name: 'Financial Advice', type: 'DENY' },
      { name: 'Medical Advice', type: 'DENY' },
    ],
  },
});
```

#### Direct Model Invocation Architecture

The solution uses **direct Bedrock Runtime API calls** instead of Bedrock Agents for cost optimization and flexibility.

**Three AI Use Cases**:

1. **Technology Normalization** (Nova Lite)
   - Model: `amazon.nova-lite-v1:0`
   - Purpose: Standardize technology names
   - Invocation: Synchronous via `InvokeModelCommand`
   - Cost: ~$0.06 per 1M input tokens

2. **Pilot Analysis** (Claude 3.7 Sonnet)
   - Model: `anthropic.claude-3-7-sonnet-20250219-v1:0`
   - Purpose: AI-enhanced pilot candidate evaluation
   - Invocation: Synchronous via `InvokeModelCommand`
   - Cost: ~$3.00 per 1M input tokens

3. **Skill Importance Scoring** (Nova Lite)
   - Model: `amazon.nova-lite-v1:0`
   - Purpose: Intelligent skill importance assessment
   - Invocation: Synchronous via `InvokeModelCommand`
   - Cost: ~$0.06 per 1M input tokens

**Lambda Implementation Pattern**:

```javascript
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

async function invokeModel(prompt, modelId, guardrailId) {
  const command = new InvokeModelCommand({
    modelId: modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    }),
    guardrailIdentifier: guardrailId,
    guardrailVersion: 'DRAFT',
  });
  
  const response = await client.send(command);
  const result = JSON.parse(new TextDecoder().decode(response.body));
  return result.content[0].text;
}
```

#### Prompt Template Management

**Storage**: DynamoDB table `app-modex-prompt-templates`

**Caching Strategy**:
- **TTL**: 1 hour (3600 seconds)
- **Location**: Lambda Layer (`promptService.js`)
- **Cache Key**: `${promptType}-${version}`
- **Invalidation**: Automatic after TTL expires
- **Benefits**: 95% reduction in DynamoDB read costs

**Prompt Structure**:

```javascript
{
  promptId: 'normalization-v1',
  promptType: 'normalization',
  version: 'v1',
  systemPrompt: 'You are a technology normalization specialist...',
  userPromptTemplate: 'Normalize these technologies: ${technologies}',
  modelId: 'amazon.nova-lite-v1:0',
  status: 'active',
  createdAt: '2025-01-15T10:00:00Z',
  updatedAt: '2025-01-15T10:00:00Z',
}
```

**GSI**: `status-updatedAt-index` for querying active prompts

**Runtime Updates**: Prompts can be updated in DynamoDB without redeploying Lambda functions. Changes take effect after cache TTL expires (1 hour).

### SQS Queue Architecture

The solution uses Amazon SQS for asynchronous message processing with automatic dead letter queue (DLQ) handling.

#### Global Queues

**1. Project Operations Queue** (`app-modex-project-operations`)
- **Purpose**: Handles project create/delete operations
- **Visibility Timeout**: 15 minutes (900 seconds)
- **Message Retention**: 14 days
- **Encryption**: SQS-managed (SSE-SQS)
- **DLQ**: `app-modex-project-operations-dlq` (max receive count: 3)

**2. Async Process Queue** (`app-modex-async-process-queue`)
- **Purpose**: Routes normalization, skill importance, and other async processes
- **Visibility Timeout**: 15 minutes (900 seconds)
- **Message Retention**: 14 days
- **Encryption**: SQS-managed (SSE-SQS)
- **DLQ**: `app-modex-async-process-dlq` (max receive count: 3)

#### Project-Specific Queues

Each project gets its own data processing queue:
- **Queue Name**: `app-modex-data-{projectId}`
- **Purpose**: Project-specific data processing tasks
- **Configuration**: Same as global queues

#### DLQ Automatic Redrive

**Lambda Function**: `app-modex-dlq-redrive`

**Purpose**: Automatically reprocesses failed messages from DLQs

**Trigger**: EventBridge scheduled rule (every 5 minutes)

**Implementation**:

```javascript
// Simplified implementation
exports.handler = async (event) => {
  const dlqUrls = [
    process.env.PROJECT_OPS_DLQ_URL,
    process.env.ASYNC_PROCESS_DLQ_URL,
  ];
  
  for (const dlqUrl of dlqUrls) {
    // Receive messages from DLQ
    const messages = await receiveMessages(dlqUrl, 10);
    
    if (messages.length === 0) continue;
    
    // Determine source queue
    const sourceQueueUrl = getSourceQueueUrl(dlqUrl);
    
    // Redrive messages to source queue
    for (const message of messages) {
      try {
        await sendMessage(sourceQueueUrl, message.Body);
        await deleteMessage(dlqUrl, message.ReceiptHandle);
        logger.info('Message redriven successfully', { messageId: message.MessageId });
      } catch (error) {
        logger.error('Failed to redrive message', { error, messageId: message.MessageId });
      }
    }
  }
};
```

**Configuration**:
- **Batch Size**: 10 messages per DLQ per execution
- **Timeout**: 5 minutes
- **Retry Logic**: Messages remain in DLQ if redrive fails
- **Monitoring**: CloudWatch metrics for redrive success/failure rates

**Benefits**:
- Automatic recovery from transient failures
- No manual intervention required
- Preserves message order within batches
- Reduces operational overhead

### Secrets Manager Integration

The solution uses AWS Secrets Manager to securely store sensitive configuration data.

#### App Config Secret

**Secret Name**: `app-modex-config-{environment}`

**Purpose**: Store Cognito configuration to avoid exposing in environment variables

**Secret Structure**:

```json
{
  "userPoolId": "us-west-2_XXXXXXXXX",
  "identityPoolId": "us-west-2:XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
  "region": "us-west-2"
}
```

**CDK Configuration** (`infrastructure/lib/app-modex-backend-stack.ts`):

```typescript
// Create secret
const appConfigSecret = new secretsmanager.Secret(this, 'AppConfigSecret', {
  secretName: `app-modex-config-${environment}`,
  description: 'App-ModEx application configuration',
  generateSecretString: {
    secretStringTemplate: JSON.stringify({
      userPoolId: this.userPool.userPoolId,
      identityPoolId: identityPool.ref,
      region: this.region,
    }),
    generateStringKey: 'placeholder',
  },
  removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
});

// Grant read access to Lambda functions
appConfigSecret.grantRead(lambdaFunction);
```

#### Usage in Lambda Functions

Lambda functions use the shared `secretsManager.js` utility from the Lambda Layer:

```javascript
const { getSecret } = require('/opt/nodejs/secretsManager');

exports.handler = async (event) => {
  // Retrieve secret (cached for 5 minutes)
  const config = await getSecret(process.env.CONFIG_SECRET_NAME);
  
  // Access configuration
  const userPoolId = config.userPoolId;
  const identityPoolId = config.identityPoolId;
  
  // Use in business logic
  // ...
};
```

**Caching**:
- **TTL**: 5 minutes (300 seconds)
- **Location**: In-memory within Lambda execution context
- **Benefits**: Reduces Secrets Manager API calls and costs

**Security Benefits**:
1. **No Hardcoding**: Sensitive values not in code or environment variables
2. **Encryption at Rest**: AWS-managed KMS encryption
3. **Access Control**: IAM-based permissions
4. **Audit Trail**: CloudTrail logs all secret access
5. **Rotation Support**: Can enable automatic rotation (not currently enabled)

**Cost Optimization**:
- **Secret Storage**: $0.40 per secret per month
- **API Calls**: $0.05 per 10,000 calls
- **Caching**: Reduces API calls by ~99%
- **Total Cost**: ~$0.45/month per environment

---

## Development History

### Recent Updates (Newest First)

**Mock Data Removal (February 2026)**
- Completely removed all mock data services and references
- Updated documentation to reflect real API-only architecture
- Cleaned up environment variables and configuration files
- Application now uses 100% real backend APIs

**Project Sharing Functionality (February 2026)**
- Implemented complete project sharing with granular access control
- Read-only and read/write permission levels
- User search and management interface
- Real-time permission updates
- Project owner controls for sharing and deletion
- No email notifications (deferred to future version)

**Info Panel Improvements (February 2025)**
- Removed all placeholder URLs and invalid links
- Removed technical implementation details (CDK, CloudFormation, Lambda)
- Fixed font consistency across all 30 info panels
- Converted raw HTML to Cloudscape components
- Improved padding and layout consistency
- Removed internal navigation from "Related Resources" sections

**AI-Enhanced Skill Importance Scoring (December 2025)**
- Implemented direct Bedrock model invocation (Nova Lite) for intelligent skill importance assessment
- Created Skill Importance Step Function workflow with orchestrator and scorer Lambdas
- Replaced formula-based expected proficiency with AI-generated importance scores (0-100)
- Added `skill_importance_scores` Athena table for AI-generated assessments
- Updated skill gap queries (F7, F8, F9) to use AI importance scores instead of linear formula
- Includes confidence scores and rationale for transparency
- Dedicated IAM role (`skillImportanceLambdaRole`) for skill importance Lambdas
- Automatic scoring triggered when team category weights are updated

**Three-Stage Pilot Identification (December 2025)**
- Revolutionary hybrid approach combining algorithmic and AI analysis
- Rule-based scoring for consistency and auditability
- AI-enhanced analysis with context integration (similarities, skills, vision)
- Consolidated results with confidence-based weighting
- Parallel processing with AWS Step Functions Map state
- Direct Bedrock model invocation (Claude 3.7 Sonnet) for contextual insights
- Prompts managed via DynamoDB with runtime updates without redeployment

**Documentation Architecture Update (October 2025)**
- Updated documentation to clearly reflect two-part deployment architecture
- Clarified separation between core infrastructure (CDK stacks) and per-project infrastructure (CodeBuild)
- Cleaned up multiple buildspec files, keeping only the active `buildspec.yml`
- Enhanced INFRASTRUCTURE.md with detailed deployment instructions and troubleshooting
- Updated project structure to show infrastructure components and buildspec configuration

**API Analysis & Optimization (August 2025)**
- Completed comprehensive API usage analysis identifying 30% unused endpoints
- Documented all API Gateway endpoints and their frontend usage
- Identified opportunities for API cleanup and optimization
- Created systematic approach for monitoring API endpoint utilization

**TCO Estimation Enhancements (August 2025)**
- Fixed individual application utilization sizes persistence
- Implemented proper cost aggregation across applications in buckets
- Added edit mode functionality with data restoration
- Resolved React useEffect dependency issues causing unpredictable behavior
- Enhanced cost calculation logic to use saved data instead of recalculating

**DynamoDB Streams Implementation (July 2025)**
- Migrated from SQS-based provisioning to DynamoDB Streams event-driven architecture
- Eliminated project deletion workflow issues (no more stuck "Provisioning" states)
- Implemented reliable project lifecycle management with automatic status updates
- Enhanced Build Monitor Lambda with complete project deletion capabilities
- Improved error handling and reduced infrastructure complexity

**Full-Stack Serverless Backend (2025)**
- Implemented complete serverless backend with API Gateway, Lambda, and DynamoDB
- Added Cognito authentication and user management
- Integrated CodeBuild for project provisioning and infrastructure management
- Event-driven architecture using DynamoDB Streams and EventBridge

**Migration to S3/CloudFront (2025)**
- Migrated from ECS to serverless S3/CloudFront architecture
- Implemented AWS CDK for Infrastructure as Code
- Added automated deployment scripts and CI/CD pipeline
- Achieved 60-85% cost reduction with improved performance

**Performance Optimization (2025)**
- Added `withResizeOptimization` HOC for optimizing component resize handling
- Implemented `resizeUtils.js` utility functions for efficient resize operations
- Enhanced chart components with resize optimization for better performance

**Security Enhancements (2025)**
- Added AWS WAF protection against common web attacks
- Implemented rate limiting and DDoS protection
- Configured HTTPS-only access with security headers

---

## Contributing

We welcome contributions to App-ModEx! Here's how you can help:

### Getting Started

1. **Fork the repository** on GitLab
2. **Clone your fork** locally:
   ```bash
   git clone https://gitlab.aws.dev/YOUR-USERNAME/app-modex-project.git
   cd app-modex-project
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/aws-solutions-library-samples/guidance-for-intelligent-application-modernization-explorer.git
   ```

### Development Workflow

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/amazing-feature
   ```

2. **Make your changes**:
   - Follow existing code style and conventions
   - Add comments for complex logic
   - Update documentation as needed
   - Add tests for new functionality

3. **Test your changes**:
   ```bash
   # Run frontend tests
   cd app-modex-ui
   npm test
   
   # Run linter
   npm run lint
   
   # Build to check for errors
   npm run build
   ```

4. **Commit your changes**:
   ```bash
   git add .
   git commit -m 'Add some amazing feature'
   ```
   
   **Commit Message Guidelines:**
   - Use present tense ("Add feature" not "Added feature")
   - Use imperative mood ("Move cursor to..." not "Moves cursor to...")
   - Limit first line to 72 characters
   - Reference issues and pull requests liberally

5. **Push to your fork**:
   ```bash
   git push origin feature/amazing-feature
   ```

6. **Open a Merge Request** on GitLab:
   - Provide a clear description of the changes
   - Reference any related issues
   - Include screenshots for UI changes
   - Ensure all CI/CD checks pass

### Code Style Guidelines

**JavaScript/React:**
- Use functional components with hooks (no class components)
- Use arrow functions for component definitions
- Destructure props and state
- Use meaningful variable and function names
- Keep components small and focused (single responsibility)
- Extract reusable logic into custom hooks
- Use PropTypes or TypeScript for type checking

**Example:**
```javascript
import React, { useState, useEffect } from 'react';
import { Button, Container } from '@cloudscape-design/components';

const MyComponent = ({ title, onSave }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await fetchData();
      setData(result);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container header={title}>
      {/* Component content */}
    </Container>
  );
};

export default MyComponent;
```

**CDK/TypeScript:**
- Use TypeScript for all CDK code
- Define interfaces for stack props
- Use descriptive construct IDs
- Add comments for complex configurations
- Follow AWS CDK best practices
- Use environment variables for configuration

**Lambda Functions:**
- Use async/await for asynchronous operations
- Implement proper error handling
- Log important events and errors
- Keep functions focused and small
- Use environment variables for configuration
- Return consistent response formats

### Testing Guidelines

**Unit Tests:**
- Write tests for all new components and functions
- Use Jest and React Testing Library
- Test user interactions, not implementation details
- Aim for >80% code coverage
- Mock external dependencies

**Integration Tests:**
- Test API integrations
- Test Step Functions workflows
- Test Lambda function integrations
- Use test events for Lambda testing

**Example Test:**
```javascript
import { render, screen, fireEvent } from '@testing-library/react';
import MyComponent from './MyComponent';

describe('MyComponent', () => {
  it('renders title correctly', () => {
    render(<MyComponent title="Test Title" />);
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('calls onSave when button clicked', () => {
    const mockOnSave = jest.fn();
    render(<MyComponent onSave={mockOnSave} />);
    
    fireEvent.click(screen.getByText('Save'));
    expect(mockOnSave).toHaveBeenCalled();
  });
});
```

### Pull Request Guidelines

**Before Submitting:**
- [ ] Code follows style guidelines
- [ ] Tests pass locally
- [ ] Linter passes without errors
- [ ] Documentation updated
- [ ] Commit messages are clear
- [ ] Branch is up to date with main

**PR Description Should Include:**
- Summary of changes
- Motivation and context
- Related issues
- Screenshots (for UI changes)
- Testing performed
- Deployment notes (if applicable)

### Areas for Contribution

**High Priority:**
- Bug fixes
- Performance improvements
- Documentation improvements
- Test coverage improvements
- Accessibility enhancements

**Feature Requests:**
- Email notifications for project sharing
- Advanced analytics and reporting
- Multi-cloud support (Azure, GCP)
- Mobile application
- Custom export templates
- Integration with enterprise tools

**Code Quality:**
- Refactoring for better maintainability
- Reducing technical debt
- Improving error handling
- Adding TypeScript types
- Optimizing bundle size

---

## Lambda Runtime Lifecycle Policy

### Current Runtimes

All Lambda functions use current, supported runtimes:
- **Node.js 22.x**: Supported until April 2027
- **Python 3.12**: Supported until October 2028

### Periodic Update Schedule

**Quarterly Review (Every 3 months):**
1. Check AWS Lambda runtime deprecation announcements
2. Review runtime end-of-life dates
3. Plan updates 6 months before deprecation

**Update Process:**

1. **Monitor AWS Announcements**
   - Subscribe to AWS Lambda runtime deprecation notifications
   - Check: https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html

2. **Update Procedure (6 months before EOL)**
   - Update `lambda.Runtime.NODEJS_XX_X` in `infrastructure/lib/app-modex-backend-stack.ts`
   - Update `lambda.Runtime.PYTHON_X_XX` in buildspec.yml
   - Update `compatibleRuntimes` in Lambda layers
   - Test all functions in development environment
   - Deploy to staging for validation
   - Deploy to production

3. **Testing Requirements**
   - Run all Lambda function tests
   - Verify API Gateway integrations
   - Test Step Functions workflows
   - Validate Bedrock model invocations

4. **Rollback Plan**
   - Keep previous runtime version in git history
   - Document rollback procedure in deployment scripts
   - Maintain backward compatibility for 1 release cycle

### Responsibility

**Owner:** Platform Team  
**Review Frequency:** Quarterly (January, April, July, October)  
**Next Review:** April 2026

---

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

### MIT License Summary

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

---

## Acknowledgments

### Open Source Libraries

**Frontend:**
- **React** (MIT License) - JavaScript library for building user interfaces
- **AWS Cloudscape Design System** (Apache 2.0) - AWS-themed UI component library
- **D3.js** (ISC License) - Data visualization library
- **AWS Amplify** (Apache 2.0) - AWS integration library
- **React Router** (MIT License) - Declarative routing for React
- **i18next** (MIT License) - Internationalization framework

**Backend:**
- **AWS CDK** (Apache 2.0) - Infrastructure as Code framework
- **AWS SDK for JavaScript** (Apache 2.0) - AWS service integration

**Lambda Function Dependencies:**
- **@aws-sdk/client-*** (Apache 2.0) - AWS service clients (S3, DynamoDB, Athena, Bedrock, Step Functions, CloudFormation, Glue, CloudWatch, SNS)
- **nanoid** (MIT License) - Unique ID generator
- **uuid** (MIT License) - UUID generator
- **exceljs** (MIT License) - Excel file generation
- **archiver** (MIT License) - ZIP file creation

**Development Tools:**
- **Create React App** (MIT License) - React application bootstrapping
- **Jest** (MIT License) - JavaScript testing framework
- **ESLint** (MIT License) - JavaScript linting utility

### AWS Services

- **Amazon Bedrock** - AI model hosting and inference
- **AWS Lambda** - Serverless compute
- **Amazon DynamoDB** - NoSQL database
- **Amazon S3** - Object storage
- **Amazon CloudFront** - Content delivery network
- **Amazon API Gateway** - API management
- **AWS Step Functions** - Workflow orchestration
- **Amazon Cognito** - Authentication and authorization
- **Amazon Athena** - Serverless query service
- **AWS Glue** - Data catalog and ETL
- **Amazon CloudWatch** - Monitoring and logging
- **AWS CodeBuild** - Build automation
- **Amazon EventBridge** - Event bus

### Inspiration

- **Zalando Tech Radar** - Inspiration for the technology radar visualization
- **AWS Well-Architected Framework** - Architecture best practices
- **AWS Solutions Library** - Reference architectures and patterns

### Contributors

Thank you to all the developers who have contributed to this project!

---

**Document Version:** 1.0  
**Last Updated:** February 2026  
**Maintained By:** App-ModEx Development Team

For questions or support, please open an issue on GitLab or contact the development team.
