# App-ModEx UI

This is the user interface component of the App-ModEx (Intelligent Applications Modernization Explorer) project, a comprehensive dashboard for assessing, planning, and executing application modernization initiatives.

## Table of Contents

- [Architecture](#architecture)
- [Project Overview](#project-overview)
- [Technology Stack](#technology-stack)
- [Backend Integration](#backend-integration)
- [Features](#features)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Key Components](#key-components)
- [Available Scripts](#available-scripts)
- [Deployment](#deployment)
- [Development Guidelines](#development-guidelines)
- [Recent Updates](#recent-updates)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Learn More](#learn-more)

## Architecture

The App-ModEx UI is a React-based single-page application (SPA) that connects to a serverless backend infrastructure. The application is deployed as a static website on Amazon S3 with CloudFront distribution for global content delivery.

## Project Overview

App-ModEx provides a structured approach to application modernization through four main sections:

1. **Data**: Collect and visualize information about your current state
   - Skills inventory with detailed team capabilities
   - Technology vision with interactive radar visualization
   - Application portfolio with criticality assessment
   - Technology stack with component breakdown
   - Infrastructure resources with environment details
   - Resource utilization metrics with performance indicators

2. **Insights**: Analyze data to identify modernization opportunities
   - Skill gaps analysis with interactive heatmaps
   - Technology stack assessment with doughnut charts
   - Infrastructure insights (compute, database, storage) with distribution analysis
   - Resource utilization patterns

3. **Planning**: Organize and prioritize modernization initiatives
   - Pilot identification for selecting ideal POC candidates
   - Application buckets for grouping similar applications
   - Total Cost of Ownership (TCO) Estimate with cost aggregation across applications
   - Team Estimates for resource allocation and timeline planning based on pilot applications

4. **Execution**: Track and manage implementation
   - Architecture implementation
   - Infrastructure as Code (IaC)
   - CI/CD pipelines
   - Data Processing

## Technology Stack

- **Frontend Framework**: React 19.1.0
- **UI Components**: AWS Cloudscape Design System
- **Data Visualization**: D3.js for interactive visualizations (radar, heatmaps, doughnut charts)
- **Routing**: React Router for client-side navigation
- **State Management**: React Hooks and Context API
- **Build Tool**: Create React App (react-scripts)
- **Authentication**: AWS Cognito integration
- **API Integration**: RESTful API calls to serverless backend
- **Data Management**: Centralized data files for consistent data across components

## Backend Integration

The UI connects to a serverless backend infrastructure that includes:
- **API Gateway**: RESTful APIs for backend services
- **Lambda Functions**: Serverless functions for business logic
- **DynamoDB**: NoSQL database for application data with DynamoDB Streams
- **S3**: File storage for project artifacts
- **Cognito**: User authentication and authorization
- **CodeBuild**: Project provisioning and infrastructure management
- **EventBridge**: Event-driven architecture for build monitoring

## Features

### Project Management
- **Interactive Dashboard**: Clean, intuitive interface built with AWS Cloudscape Design System
- **Project Lifecycle**: Create, edit, and delete modernization projects with real-time status tracking
- **Project Sharing**: Share projects with team members with granular access control (read-only/read-write)
- **User Management**: Search and manage project collaborators with confirmation dialogs
- **Status Tracking**: Real-time project status updates (pending → provisioning → active → deleting)

### Data Management
- **Data Tables**: Comprehensive tables for all data sections with filtering, sorting, and download capabilities
- **Visual Indicators**: Status and criticality indicators with color coding
- **Data Export**: Download functionality for filtered or complete datasets
- **CRUD Operations**: Full create, read, update, delete operations for all data types

### Visualizations
- **Technology Radar**: Visual representation of technology adoption phases across domains
- **Interactive Heatmaps**: Visualize correlations between skills, teams, and technologies
- **Doughnut Charts**: Analyze technology stack and infrastructure distribution with interactive tooltips
- **Similarity Bubble Charts**: Application clustering analysis for grouping decisions

### Advanced Features
- **Advanced Filtering**: Cross-filtering capability with disabled options based on selections
- **Data Processing Dashboard**: Monitor and manage data processing operations with status tracking
- **Contextual Help**: Page-specific information panels with guidance and best practices
- **Performance Optimization**: Resize optimization HOC for better chart performance

### Planning Tools
- **Pilot Identification**: Identify ideal POC candidates based on business drivers and technical feasibility
- **Application Buckets**: Group applications based on tech stack similarity to a pilot application
- **TCO Estimation**: Calculate and compare total cost of ownership across application buckets
  - Cost calculation based on similarity scores between applications
  - Aggregated cost summaries across all applications in a bucket
  - Editable cost components for detailed financial planning
  - Cost summary section showing total costs by category

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm or yarn
- AWS account with appropriate permissions (for backend integration)

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables (create `.env.local`):
   ```bash
   REACT_APP_API_URL=https://your-api-gateway-url
   REACT_APP_USER_POOL_ID=your-cognito-user-pool-id
   REACT_APP_USER_POOL_CLIENT_ID=your-cognito-client-id
   REACT_APP_IDENTITY_POOL_ID=your-cognito-identity-pool-id
   REACT_APP_REGION=your-aws-region
   ```

3. Start the development server:
   ```bash
   npm start
   ```

4. Open your browser and navigate to `http://localhost:3000`

## Project Structure

The project follows a modular structure:

```
src/
├── components/           # Reusable UI components
│   ├── info/            # Page-specific info panels
│   ├── charts/          # D3.js-based visualization components
│   ├── dataProcessing/  # Data processing related components
│   └── CustomSideNavigation.js
├── pages/               # Page components for each section
│   ├── data/           # Data collection pages
│   ├── insights/       # Analytics and insights pages
│   ├── planning/       # Planning section pages
│   └── execution/      # Implementation tracking pages
├── services/           # API services and mock data
├── data/              # Centralized data files
├── layouts/           # Layout components
├── hoc/               # Higher-order components
├── utils/             # Utility functions
└── App.js             # Main application component
```

## Key Components

### Navigation and Layout
- **CustomSideNavigation**: Collapsible sidebar with hierarchical navigation
- **Top Navigation**: Project name display and user controls
- **Responsive Design**: Adapts to different screen sizes
- **Quick Access Buttons**: Common actions accessible from sidebar

### Project Management
- **Project Creation**: Form-based project creation with validation
- **Project Sharing**: Modal-based sharing with user search and permission management
- **Status Indicators**: Visual status representation throughout the UI
- **Real-time Updates**: Automatic refresh of project status

### Data Visualization Components
- **TechRadarChart**: Interactive technology adoption radar
- **HeatmapChart**: Correlation heatmaps with hover interactions
- **SimilarityBubbleChart**: Application clustering visualization
- **Doughnut Charts**: Distribution analysis with tooltips

### Planning Tools
- **Pilot Identification**: Multi-criteria selection interface
- **Application Buckets**: Drag-and-drop grouping interface
- **TCO Calculator**: Interactive cost estimation forms

## Available Scripts

- `npm start`: Runs the app in development mode
- `npm test`: Launches the test runner in interactive watch mode
- `npm run build`: Builds the app for production to the `build` folder
- `npm run eject`: Ejects from Create React App configuration (one-way operation)

## Deployment

The UI is deployed as part of the overall App-ModEx infrastructure. See the [infrastructure README](../infrastructure/README.md) for deployment instructions.

### Production Build

```bash
npm run build
```

This creates an optimized production build in the `build` folder, ready for deployment to S3.

## Development Guidelines

### Code Style
- Use functional components with hooks
- Follow AWS Cloudscape Design System patterns
- Implement proper error handling and loading states
- Use TypeScript for type safety (when applicable)

### Performance
- Utilize the `withResizeOptimization` HOC for chart components
- Implement proper memoization for expensive calculations
- Use React.memo for component optimization where appropriate

### Testing
- Write unit tests for utility functions
- Test component rendering and user interactions
- Mock API calls for consistent testing

## Recent Updates

### DynamoDB Streams Integration (July 2025)
- Updated project status tracking to work with new event-driven backend
- Enhanced real-time status updates for project lifecycle management
- Improved error handling for project operations

### Performance Optimizations
- Added `withResizeOptimization` HOC for chart components
- Implemented `resizeUtils.js` utility functions
- Enhanced chart components with resize optimization

### Feature Enhancements
- **TCO Estimation**: Cost aggregation and similarity-based calculations
- **Application Buckets**: Enhanced grouping with similarity thresholds
- **Project Sharing**: Improved user management and permissions
- **Data Processing**: Real-time monitoring dashboard

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify Cognito configuration in environment variables
   - Check user pool and identity pool settings
   - Ensure proper CORS configuration

2. **API Connection Issues**
   - Verify API Gateway URL in environment variables
   - Check network connectivity and CORS settings
   - Review CloudWatch logs for backend errors

3. **Build Errors**
   - Clear node_modules and reinstall dependencies
   - Check for version conflicts in package.json
   - Verify environment variables are properly set

### Debug Mode

Set `REACT_APP_DEBUG=true` in your environment to enable additional logging and debug information.

## Contributing

1. Follow the existing code structure and patterns
2. Write tests for new features
3. Update documentation for significant changes
4. Use meaningful commit messages
5. Test thoroughly before submitting changes

## Learn More

- [AWS Cloudscape Design System](https://cloudscape.design/)
- [React Documentation](https://reactjs.org/)
- [D3.js Documentation](https://d3js.org/)
- [Main Project README](../README.md)
- [Infrastructure Documentation](../infrastructure/README.md)
