/**
 * Mock Data Generators for Advanced Data Export System
 * 
 * This module provides realistic mock data generators for all export categories
 * that respect AppModEx data structures and include edge cases and large datasets.
 * 
 * Features:
 * - Realistic data generation with proper relationships
 * - Configurable dataset sizes for testing
 * - Edge cases and boundary conditions
 * - Consistent data across related categories
 * - Large dataset support for performance testing
 */

// Configuration for mock data generation
const MOCK_CONFIG = {
  // Default dataset sizes
  defaultSizes: {
    small: 50,
    medium: 200,
    large: 1000,
    xlarge: 5000
  },
  
  // Date ranges for realistic timestamps
  dateRanges: {
    recent: 30, // days
    medium: 90, // days
    long: 365 // days
  },
  
  // Enable/disable mock data (can be controlled via environment)
  enabled: process.env.REACT_APP_USE_MOCK_DATA === 'true'
};

// Utility functions for data generation
const generateId = (prefix = 'id') => `${prefix}-${Math.random().toString(36).substr(2, 9)}`;

const generateTimestamp = (daysBack = 30) => {
  const now = new Date();
  const randomDays = Math.floor(Math.random() * daysBack);
  const randomHours = Math.floor(Math.random() * 24);
  const randomMinutes = Math.floor(Math.random() * 60);
  
  const date = new Date(now);
  date.setDate(date.getDate() - randomDays);
  date.setHours(randomHours, randomMinutes, 0, 0);
  
  return date.toISOString();
};

const randomChoice = (array) => array[Math.floor(Math.random() * array.length)];

const randomNumber = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const randomFloat = (min, max, decimals = 1) => 
  parseFloat((Math.random() * (max - min) + min).toFixed(decimals));

// Base data for realistic generation
const MOCK_DATA_SEEDS = {
  skills: [
    'React', 'Angular', 'Vue.js', 'Node.js', 'Python', 'Java', 'C#', 'TypeScript', 'JavaScript',
    'AWS Lambda', 'AWS S3', 'AWS DynamoDB', 'AWS CloudFormation', 'Docker', 'Kubernetes',
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'GraphQL', 'REST API', 'Microservices',
    'DevOps', 'CI/CD', 'Jenkins', 'GitHub Actions', 'Terraform', 'Ansible', 'Prometheus',
    'Grafana', 'ELK Stack', 'Jest', 'Cypress', 'Selenium', 'JUnit', 'Spring Boot',
    'Django', 'Flask', 'Express.js', 'Laravel', 'Ruby on Rails', 'Go', 'Rust', 'Kotlin',
    'Swift', 'Flutter', 'React Native', 'Machine Learning', 'Data Science', 'AI/ML'
  ],
  
  categories: [
    'Frontend', 'Backend', 'Database', 'Cloud', 'DevOps', 'Testing', 'Mobile', 'API',
    'Security', 'Analytics', 'AI/ML', 'Infrastructure', 'Monitoring', 'Automation'
  ],
  
  teams: [
    'UI Team', 'API Team', 'Data Team', 'DevOps Team', 'QA Team', 'Mobile Team',
    'Analytics Team', 'Security Team', 'Platform Team', 'Infrastructure Team',
    'Product Team', 'Architecture Team', 'Integration Team', 'Support Team'
  ],
  
  applications: [
    'Customer Portal', 'Admin Dashboard', 'Mobile App', 'API Gateway', 'Data Warehouse',
    'Analytics Platform', 'Payment System', 'Inventory Management', 'Order Processing',
    'User Management', 'Notification Service', 'Reporting Tool', 'Content Management',
    'Document Management', 'Workflow Engine', 'Integration Hub', 'Monitoring Dashboard',
    'Security Console', 'Backup System', 'Configuration Manager', 'Log Aggregator',
    'Message Queue', 'Cache Layer', 'Search Engine', 'File Storage', 'Email Service',
    'SMS Service', 'Push Notification', 'Authentication Service', 'Authorization Service',
    'Audit System', 'Compliance Tool', 'Risk Management', 'Asset Tracker', 'Help Desk'
  ],
  
  departments: [
    'Engineering', 'Product', 'Sales', 'Marketing', 'Finance', 'HR', 'Operations',
    'Customer Success', 'Legal', 'Security', 'IT', 'Data', 'Analytics', 'DevOps'
  ],
  
  criticality: ['High', 'Medium', 'Low'],
  
  environments: ['Production', 'Staging', 'Development', 'Testing', 'DR'],
  
  serverTypes: [
    't3.micro', 't3.small', 't3.medium', 't3.large', 't3.xlarge',
    'm5.large', 'm5.xlarge', 'm5.2xlarge', 'm5.4xlarge',
    'c5.large', 'c5.xlarge', 'c5.2xlarge', 'c5.4xlarge',
    'r5.large', 'r5.xlarge', 'r5.2xlarge', 'r5.4xlarge',
    'i3.large', 'i3.xlarge', 'i3.2xlarge', 'i3.4xlarge'
  ],
  
  regions: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'],
  
  osTypes: ['Linux', 'Windows'],
  osVersions: {
    'Linux': ['Ubuntu 20.04', 'Ubuntu 22.04', 'Amazon Linux 2', 'Amazon Linux 2023', 'CentOS 7', 'RHEL 8'],
    'Windows': ['Windows Server 2019', 'Windows Server 2022']
  },
  
  databases: ['PostgreSQL', 'MySQL', 'MongoDB', 'DynamoDB', 'Redis', 'Elasticsearch', 'Aurora MySQL', 'Aurora PostgreSQL', 'Redshift'],
  
  frameworks: ['React', 'Angular', 'Vue.js', 'Spring Boot', 'Django', 'Flask', 'Express.js', 'Laravel', 'Ruby on Rails', 'ASP.NET Core'],
  
  runtimes: ['Node.js 16', 'Node.js 18', 'Java 11', 'Java 17', 'Python 3.8', 'Python 3.9', 'Python 3.10', '.NET 6', '.NET 7'],
  
  storages: ['S3', 'EBS', 'EFS', 'Glacier', 'CloudFront'],
  
  integrations: ['REST API', 'GraphQL', 'Kafka', 'SQS', 'SNS', 'Step Functions', 'Lambda', 'Cognito', 'SES'],
  
  orchestrationPlatforms: ['Kubernetes', 'EKS', 'Docker Swarm', 'None'],
  
  technologyQuadrants: ['Techniques', 'Tools', 'Platforms', 'Languages & Frameworks'],
  technologyPhases: ['Adopt', 'Trial', 'Assess', 'Hold']
};

/**
 * Generate Skills Inventory Mock Data
 */
export const generateSkillsInventory = (size = MOCK_CONFIG.defaultSizes.medium) => {
  const skills = [];
  
  for (let i = 1; i <= size; i++) {
    const skill = randomChoice(MOCK_DATA_SEEDS.skills);
    const category = randomChoice(MOCK_DATA_SEEDS.categories);
    const team = randomChoice(MOCK_DATA_SEEDS.teams);
    
    skills.push({
      id: i,
      skill: `${skill}${i > MOCK_DATA_SEEDS.skills.length ? ` v${randomNumber(1, 5)}` : ''}`,
      category,
      proficiency: randomNumber(1, 5),
      team,
      members: randomNumber(1, 15),
      notes: i % 10 === 0 ? `${skill} expertise with ${randomNumber(2, 8)} years experience` : 
             i % 7 === 0 ? `Currently learning ${skill} through training program` :
             i % 5 === 0 ? `${skill} used in ${randomNumber(2, 6)} production projects` : ''
    });
  }
  
  return skills;
};

/**
 * Generate Technology Radar Mock Data
 */
export const generateTechnologyRadar = (size = MOCK_CONFIG.defaultSizes.medium) => {
  const technologies = [];
  const usedTechnologies = new Set();
  
  for (let i = 1; i <= size; i++) {
    let technology;
    let attempts = 0;
    
    // Try to generate unique technology names
    do {
      const baseTech = randomChoice([
        ...MOCK_DATA_SEEDS.skills,
        ...MOCK_DATA_SEEDS.frameworks,
        ...MOCK_DATA_SEEDS.databases,
        'Microservices', 'Serverless', 'Event Sourcing', 'CQRS', 'Domain-Driven Design',
        'Continuous Integration', 'Infrastructure as Code', 'GitOps', 'DataOps',
        'Chaos Engineering', 'Zero Trust Security', 'API-First Design'
      ]);
      
      technology = `${baseTech}${attempts > 0 ? ` ${attempts + 1}` : ''}`;
      attempts++;
    } while (usedTechnologies.has(technology) && attempts < 5);
    
    usedTechnologies.add(technology);
    
    technologies.push({
      id: `tech-${i}`,
      technology,
      quadrant: randomChoice(MOCK_DATA_SEEDS.technologyQuadrants),
      phase: randomChoice(MOCK_DATA_SEEDS.technologyPhases)
    });
  }
  
  return technologies;
};

/**
 * Generate Application Inventory Mock Data
 */
export const generateApplicationInventory = (size = MOCK_CONFIG.defaultSizes.medium) => {
  const applications = [];
  const usedNames = new Set();
  
  for (let i = 1; i <= size; i++) {
    let applicationName;
    let attempts = 0;
    
    // Generate unique application names
    do {
      const baseName = randomChoice(MOCK_DATA_SEEDS.applications);
      applicationName = `${baseName}${attempts > 0 ? ` ${attempts + 1}` : ''}`;
      attempts++;
    } while (usedNames.has(applicationName) && attempts < 5);
    
    usedNames.add(applicationName);
    
    const department = randomChoice(MOCK_DATA_SEEDS.departments);
    const criticality = randomChoice(MOCK_DATA_SEEDS.criticality);
    
    // Generate realistic purposes based on application type and department
    const purposes = {
      'Customer Portal': 'Customer-facing application for account management and self-service',
      'Admin Dashboard': 'Internal administrative interface for system management',
      'Mobile App': 'Mobile application for customer engagement and services',
      'API Gateway': 'Central API management and routing service',
      'Data Warehouse': 'Centralized data storage and analytics platform'
    };
    
    const baseName = applicationName.split(' ')[0] + ' ' + (applicationName.split(' ')[1] || '');
    const defaultPurpose = purposes[baseName] || 
      `${department} system for ${applicationName.toLowerCase()} operations and management`;
    
    applications.push({
      id: i,
      applicationName,
      department,
      criticality,
      purpose: defaultPurpose
    });
  }
  
  return applications;
};

/**
 * Generate Technology Components Mock Data
 */
export const generateTechnologyComponents = (applications, size = null) => {
  const components = [];
  const appsToUse = applications || generateApplicationInventory(50);
  const targetSize = size || Math.min(appsToUse.length * 2, MOCK_CONFIG.defaultSizes.large);
  
  for (let i = 1; i <= targetSize; i++) {
    const app = randomChoice(appsToUse);
    const componentTypes = ['Frontend', 'Backend', 'API', 'Database', 'Cache', 'Queue', 'Storage'];
    const componentType = randomChoice(componentTypes);
    
    components.push({
      id: `tech-${i}`,
      applicationName: app.applicationName,
      componentName: `${app.applicationName} ${componentType}`,
      runtime: randomChoice(MOCK_DATA_SEEDS.runtimes),
      framework: randomChoice(MOCK_DATA_SEEDS.frameworks),
      databases: Array.from({ length: randomNumber(0, 3) }, () => randomChoice(MOCK_DATA_SEEDS.databases)).join(','),
      integrations: Array.from({ length: randomNumber(1, 4) }, () => randomChoice(MOCK_DATA_SEEDS.integrations)).join(','),
      storages: Array.from({ length: randomNumber(1, 3) }, () => randomChoice(MOCK_DATA_SEEDS.storages)).join(',')
    });
  }
  
  return components;
};

/**
 * Generate Infrastructure Resources Mock Data
 */
export const generateInfrastructureResources = (applications, size = null) => {
  const resources = [];
  const appsToUse = applications || generateApplicationInventory(30);
  const targetSize = size || Math.min(appsToUse.length * 3, MOCK_CONFIG.defaultSizes.large);
  
  for (let i = 1; i <= targetSize; i++) {
    const app = randomChoice(appsToUse);
    const serverType = randomChoice(MOCK_DATA_SEEDS.serverTypes);
    const environment = randomChoice(MOCK_DATA_SEEDS.environments);
    const region = randomChoice(MOCK_DATA_SEEDS.regions);
    const osType = randomChoice(MOCK_DATA_SEEDS.osTypes);
    const osVersion = randomChoice(MOCK_DATA_SEEDS.osVersions[osType]);
    
    // Generate realistic server specs based on server type
    const specs = {
      't3.micro': { cpu: '1 vCPU', memory: '1 GB', storage: '20 GB SSD' },
      't3.small': { cpu: '2 vCPU', memory: '2 GB', storage: '40 GB SSD' },
      't3.medium': { cpu: '2 vCPU', memory: '4 GB', storage: '80 GB SSD' },
      't3.large': { cpu: '2 vCPU', memory: '8 GB', storage: '100 GB SSD' },
      'm5.large': { cpu: '4 vCPU', memory: '16 GB', storage: '100 GB SSD' },
      'm5.xlarge': { cpu: '8 vCPU', memory: '32 GB', storage: '250 GB SSD' },
      'c5.large': { cpu: '4 vCPU', memory: '8 GB', storage: '100 GB SSD' },
      'c5.xlarge': { cpu: '8 vCPU', memory: '16 GB', storage: '250 GB SSD' },
      'r5.large': { cpu: '4 vCPU', memory: '16 GB', storage: '100 GB SSD' },
      'r5.xlarge': { cpu: '8 vCPU', memory: '32 GB', storage: '500 GB SSD' },
      'i3.large': { cpu: '8 vCPU', memory: '16 GB', storage: '500 GB SSD' },
      'i3.xlarge': { cpu: '16 vCPU', memory: '32 GB', storage: '1 TB SSD' }
    };
    
    const spec = specs[serverType] || { cpu: '2 vCPU', memory: '4 GB', storage: '80 GB SSD' };
    
    resources.push({
      id: `infra-${i}`,
      applicationName: app.applicationName,
      serverName: `${app.applicationName.toLowerCase().replace(/\s+/g, '-')}-srv-${i}`,
      serverType,
      cpu: spec.cpu,
      memory: spec.memory,
      storage: spec.storage,
      region,
      environment,
      notes: i % 15 === 0 ? 'Primary instance' : 
             i % 12 === 0 ? 'Backup instance' : 
             i % 8 === 0 ? 'High availability cluster' : '',
      osType,
      osVersion,
      dbEngineVersion: randomChoice(MOCK_DATA_SEEDS.databases) + ' ' + randomNumber(8, 15),
      dbClusterId: `db-cluster-${randomNumber(100, 999)}`,
      dbClusterType: randomChoice(['Single Instance', 'Multi-AZ', 'Active/Active', 'Active/Backup']),
      orchestrationPlatform: randomChoice(MOCK_DATA_SEEDS.orchestrationPlatforms)
    });
  }
  
  return resources;
};

/**
 * Generate Resource Utilization Mock Data
 */
export const generateResourceUtilization = (resources, size = null) => {
  const utilization = [];
  const resourcesToUse = resources || generateInfrastructureResources(null, 50);
  const targetSize = size || Math.min(resourcesToUse.length * 10, MOCK_CONFIG.defaultSizes.xlarge);
  
  for (let i = 1; i <= targetSize; i++) {
    const resource = randomChoice(resourcesToUse);
    
    // Generate realistic utilization patterns
    const baseUtilization = {
      cpu: randomFloat(15, 85, 1),
      memory: randomFloat(20, 90, 1),
      storage: randomFloat(25, 80, 1)
    };
    
    // Add some correlation between metrics
    const cpuUtilization = baseUtilization.cpu;
    const memoryUtilization = Math.min(95, baseUtilization.memory + (cpuUtilization > 70 ? randomFloat(5, 15) : 0));
    const storageUtilization = baseUtilization.storage;
    
    // Generate network and IOPS based on utilization
    const networkIn = randomFloat(2, 20, 1);
    const networkOut = randomFloat(3, 35, 1);
    const iops = Math.floor(randomNumber(500, 7000));
    
    // Generate notes for high utilization
    const notes = cpuUtilization > 75 ? 'Investigating high CPU usage' :
                  cpuUtilization > 70 ? 'Consider scaling up/out' :
                  memoryUtilization > 80 ? 'Peak traffic period' :
                  cpuUtilization < 25 ? 'Consider downsizing' :
                  cpuUtilization < 20 ? 'Underutilized resource' :
                  i % 20 === 0 ? 'Recently scaled up' :
                  i % 25 === 0 ? 'Backup/standby system' :
                  i % 30 === 0 ? 'Resource contention detected' : '';
    
    utilization.push({
      id: `util-${i}`,
      applicationName: resource.applicationName,
      serverName: resource.serverName,
      timestamp: generateTimestamp(MOCK_CONFIG.dateRanges.recent),
      cpuUtilization,
      memoryUtilization,
      storageUtilization,
      networkIn,
      networkOut,
      iops,
      notes
    });
  }
  
  return utilization;
};

/**
 * Generate Export History Mock Data
 */
export const generateExportHistory = (size = MOCK_CONFIG.defaultSizes.small) => {
  const history = [];
  const statuses = ['COMPLETED', 'FAILED', 'PROCESSING', 'INITIATED'];
  const users = ['john.doe', 'jane.smith', 'bob.wilson', 'alice.johnson', 'mike.brown', 'sarah.davis'];
  
  // Available categories from the category selector
  const availableCategories = [
    'skills', 'technology-vision', 'application-portfolio', 'application-tech-stack',
    'application-infrastructure', 'application-utilization', 'skills-analysis',
    'vision-analysis', 'tech-stack-analysis', 'infrastructure-analysis',
    'utilization-analysis', 'team-analysis', 'pilot-identification',
    'application-grouping', 'tco-estimates', 'team-estimates'
  ];
  
  for (let i = 1; i <= size; i++) {
    const exportId = generateId('export');
    const userId = randomChoice(users);
    const userName = userId.split('.').map(name => 
      name.charAt(0).toUpperCase() + name.slice(1)
    ).join(' ');
    
    // Generate realistic category combinations
    const numCategories = randomNumber(1, 6);
    const selectedCategories = [];
    const shuffledCategories = [...availableCategories].sort(() => 0.5 - Math.random());
    
    for (let j = 0; j < numCategories; j++) {
      selectedCategories.push(shuffledCategories[j]);
    }
    
    const status = randomChoice(statuses);
    const createdAt = generateTimestamp(MOCK_CONFIG.dateRanges.long);
    const completedAt = ['COMPLETED', 'FAILED'].includes(status) ? 
      generateTimestamp(Math.floor((new Date() - new Date(createdAt)) / (1000 * 60 * 60 * 24))) : 
      null;
    
    const fileSizeMB = status === 'COMPLETED' ? randomFloat(0.5, 50, 1) : 0;
    const downloadCount = status === 'COMPLETED' ? randomNumber(0, 10) : 0;
    const lastDownloadAt = downloadCount > 0 ? generateTimestamp(7) : null;
    
    history.push({
      exportId,
      projectId: 'project-123',
      userId,
      userName,
      selectedCategories,
      status,
      createdAt,
      completedAt,
      fileSizeMB,
      downloadCount,
      lastDownloadAt
    });
  }
  
  // Sort by creation date (newest first)
  return history.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

/**
 * Generate Analysis Data (Insights)
 */
export const generateAnalysisData = (category, baseData, size = MOCK_CONFIG.defaultSizes.medium) => {
  const analysisData = [];
  
  switch (category) {
    case 'skills-analysis':
      // Generate skills gap analysis, proficiency trends, team comparisons
      for (let i = 1; i <= size; i++) {
        const skill = randomChoice(MOCK_DATA_SEEDS.skills);
        const team = randomChoice(MOCK_DATA_SEEDS.teams);
        
        analysisData.push({
          id: `skills-analysis-${i}`,
          skill,
          team,
          currentProficiency: randomFloat(1, 5, 1),
          targetProficiency: randomFloat(3, 5, 1),
          gap: randomFloat(0, 3, 1),
          priority: randomChoice(['High', 'Medium', 'Low']),
          recommendedAction: randomChoice([
            'Training Required', 'Mentoring Program', 'External Hiring', 
            'Knowledge Sharing', 'Certification Program'
          ]),
          timeline: randomChoice(['1-3 months', '3-6 months', '6-12 months']),
          cost: randomNumber(1000, 25000)
        });
      }
      break;
      
    case 'vision-analysis':
      // Generate technology adoption trends, risk assessments
      for (let i = 1; i <= size; i++) {
        const technology = randomChoice(MOCK_DATA_SEEDS.skills);
        
        analysisData.push({
          id: `vision-analysis-${i}`,
          technology,
          currentPhase: randomChoice(MOCK_DATA_SEEDS.technologyPhases),
          recommendedPhase: randomChoice(MOCK_DATA_SEEDS.technologyPhases),
          adoptionRisk: randomChoice(['Low', 'Medium', 'High']),
          businessValue: randomChoice(['Low', 'Medium', 'High']),
          technicalComplexity: randomChoice(['Low', 'Medium', 'High']),
          timeToAdopt: randomChoice(['1-3 months', '3-6 months', '6-12 months', '12+ months']),
          dependencies: Array.from({ length: randomNumber(0, 3) }, () => 
            randomChoice(MOCK_DATA_SEEDS.skills)
          ).join(', ')
        });
      }
      break;
      
    case 'infrastructure-analysis':
      // Generate cost optimization, performance analysis
      for (let i = 1; i <= size; i++) {
        const serverType = randomChoice(MOCK_DATA_SEEDS.serverTypes);
        const application = randomChoice(MOCK_DATA_SEEDS.applications);
        
        analysisData.push({
          id: `infra-analysis-${i}`,
          application,
          serverType,
          currentCost: randomNumber(100, 2000),
          optimizedCost: randomNumber(50, 1500),
          savings: randomNumber(10, 800),
          utilizationScore: randomFloat(20, 95, 1),
          recommendation: randomChoice([
            'Right-size instance', 'Move to reserved instances', 'Consider spot instances',
            'Migrate to serverless', 'Consolidate workloads', 'Scale down during off-hours'
          ]),
          priority: randomChoice(['High', 'Medium', 'Low']),
          effort: randomChoice(['Low', 'Medium', 'High'])
        });
      }
      break;
      
    default:
      // Generic analysis data
      for (let i = 1; i <= size; i++) {
        analysisData.push({
          id: `${category}-${i}`,
          category,
          metric: `Metric ${i}`,
          value: randomFloat(0, 100, 2),
          trend: randomChoice(['Increasing', 'Decreasing', 'Stable']),
          recommendation: `Recommendation for ${category} metric ${i}`,
          priority: randomChoice(['High', 'Medium', 'Low'])
        });
      }
  }
  
  return analysisData;
};

/**
 * Generate Planning Data
 */
export const generatePlanningData = (category, baseData, size = MOCK_CONFIG.defaultSizes.medium) => {
  const planningData = [];
  
  switch (category) {
    case 'pilot-identification':
      // Generate pilot project recommendations
      for (let i = 1; i <= size; i++) {
        const application = randomChoice(MOCK_DATA_SEEDS.applications);
        
        planningData.push({
          id: `pilot-${i}`,
          application,
          pilotScore: randomFloat(1, 10, 1),
          complexity: randomChoice(['Low', 'Medium', 'High']),
          businessImpact: randomChoice(['Low', 'Medium', 'High']),
          technicalRisk: randomChoice(['Low', 'Medium', 'High']),
          estimatedEffort: randomNumber(2, 24), // weeks
          estimatedCost: randomNumber(10000, 500000),
          dependencies: Array.from({ length: randomNumber(0, 4) }, () => 
            randomChoice(MOCK_DATA_SEEDS.applications)
          ).join(', '),
          recommendation: randomChoice([
            'Ideal pilot candidate', 'Good pilot candidate', 'Consider for later phase',
            'High risk - proceed with caution', 'Not recommended for pilot'
          ])
        });
      }
      break;
      
    case 'tco-estimates':
      // Generate total cost of ownership estimates
      for (let i = 1; i <= size; i++) {
        const application = randomChoice(MOCK_DATA_SEEDS.applications);
        
        planningData.push({
          id: `tco-${i}`,
          application,
          currentTCO: randomNumber(50000, 2000000),
          projectedTCO: randomNumber(30000, 1500000),
          savings: randomNumber(5000, 800000),
          migrationCost: randomNumber(10000, 300000),
          paybackPeriod: randomNumber(6, 36), // months
          riskFactor: randomFloat(0.1, 0.5, 2),
          confidence: randomChoice(['High', 'Medium', 'Low']),
          assumptions: 'Based on current usage patterns and projected growth'
        });
      }
      break;
      
    case 'team-estimates':
      // Generate team sizing and skill estimates
      for (let i = 1; i <= size; i++) {
        const team = randomChoice(MOCK_DATA_SEEDS.teams);
        
        planningData.push({
          id: `team-est-${i}`,
          team,
          currentSize: randomNumber(3, 15),
          recommendedSize: randomNumber(4, 20),
          skillGaps: Array.from({ length: randomNumber(1, 4) }, () => 
            randomChoice(MOCK_DATA_SEEDS.skills)
          ).join(', '),
          trainingNeeded: randomNumber(20, 200), // hours
          hiringNeeded: randomNumber(0, 5),
          timeline: randomChoice(['3 months', '6 months', '9 months', '12 months']),
          budget: randomNumber(50000, 500000)
        });
      }
      break;
      
    default:
      // Generic planning data
      for (let i = 1; i <= size; i++) {
        planningData.push({
          id: `${category}-${i}`,
          category,
          item: `Planning Item ${i}`,
          priority: randomChoice(['High', 'Medium', 'Low']),
          effort: randomChoice(['Small', 'Medium', 'Large']),
          timeline: randomChoice(['Q1', 'Q2', 'Q3', 'Q4']),
          cost: randomNumber(10000, 200000)
        });
      }
  }
  
  return planningData;
};

/**
 * Main function to generate all mock data with proper relationships
 */
export const generateAllMockData = (sizes = {}) => {
  const config = {
    skills: sizes.skills || MOCK_CONFIG.defaultSizes.medium,
    technologyRadar: sizes.technologyRadar || MOCK_CONFIG.defaultSizes.medium,
    applications: sizes.applications || MOCK_CONFIG.defaultSizes.medium,
    components: sizes.components || MOCK_CONFIG.defaultSizes.large,
    infrastructure: sizes.infrastructure || MOCK_CONFIG.defaultSizes.large,
    utilization: sizes.utilization || MOCK_CONFIG.defaultSizes.xlarge,
    exportHistory: sizes.exportHistory || MOCK_CONFIG.defaultSizes.small,
    analysis: sizes.analysis || MOCK_CONFIG.defaultSizes.medium,
    planning: sizes.planning || MOCK_CONFIG.defaultSizes.medium
  };
  
  console.log('Generating mock data with sizes:', config);
  
  // Generate base data first
  const skills = generateSkillsInventory(config.skills);
  const technologyRadar = generateTechnologyRadar(config.technologyRadar);
  const applications = generateApplicationInventory(config.applications);
  
  // Generate related data using base data for consistency
  const components = generateTechnologyComponents(applications, config.components);
  const infrastructure = generateInfrastructureResources(applications, config.infrastructure);
  const utilization = generateResourceUtilization(infrastructure, config.utilization);
  const exportHistory = generateExportHistory(config.exportHistory);
  
  // Generate analysis data
  const skillsAnalysis = generateAnalysisData('skills-analysis', skills, config.analysis);
  const visionAnalysis = generateAnalysisData('vision-analysis', technologyRadar, config.analysis);
  const infrastructureAnalysis = generateAnalysisData('infrastructure-analysis', infrastructure, config.analysis);
  
  // Generate planning data
  const pilotIdentification = generatePlanningData('pilot-identification', applications, config.planning);
  const tcoEstimates = generatePlanningData('tco-estimates', applications, config.planning);
  const teamEstimates = generatePlanningData('team-estimates', skills, config.planning);
  
  const mockData = {
    // Data sections
    skills,
    technologyRadar,
    applications,
    components,
    infrastructure,
    utilization,
    
    // Export system data
    exportHistory,
    
    // Analysis data (insights)
    skillsAnalysis,
    visionAnalysis,
    infrastructureAnalysis,
    
    // Planning data
    pilotIdentification,
    tcoEstimates,
    teamEstimates,
    
    // Metadata
    generatedAt: new Date().toISOString(),
    config,
    totalRecords: Object.values(config).reduce((sum, size) => sum + size, 0)
  };
  
  console.log(`Generated ${mockData.totalRecords} total mock records across all categories`);
  
  return mockData;
};

/**
 * Configuration utilities
 */
export const getMockConfig = () => MOCK_CONFIG;

export const isMockDataEnabled = () => MOCK_CONFIG.enabled;

export const setMockDataEnabled = (enabled) => {
  MOCK_CONFIG.enabled = enabled;
};

// Functions are already exported individually with 'export const' above