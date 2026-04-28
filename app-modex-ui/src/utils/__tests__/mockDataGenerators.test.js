/**
 * Tests for Mock Data Generators
 * 
 * Comprehensive test suite for all mock data generation functions
 * including data structure validation, edge cases, and performance testing.
 */

import {
  generateSkillsInventory,
  generateTechnologyRadar,
  generateApplicationInventory,
  generateTechnologyComponents,
  generateInfrastructureResources,
  generateResourceUtilization,
  generateExportHistory,
  generateAnalysisData,
  generatePlanningData,
  generateAllMockData,
  getMockConfig,
  isMockDataEnabled,
  setMockDataEnabled
} from '../mockDataGenerators';

describe('Mock Data Generators', () => {
  
  describe('Configuration', () => {
    test('should get mock configuration', () => {
      const config = getMockConfig();
      
      expect(config).toBeDefined();
      expect(config.defaultSizes).toBeDefined();
      expect(config.dateRanges).toBeDefined();
      expect(typeof config.enabled).toBe('boolean');
    });

    test('should enable/disable mock data', () => {
      const originalState = isMockDataEnabled();
      
      setMockDataEnabled(true);
      expect(isMockDataEnabled()).toBe(true);
      
      setMockDataEnabled(false);
      expect(isMockDataEnabled()).toBe(false);
      
      // Restore original state
      setMockDataEnabled(originalState);
    });
  });

  describe('Skills Inventory Generator', () => {
    test('should generate skills inventory with default size', () => {
      const skills = generateSkillsInventory();
      
      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBeGreaterThan(0);
      expect(skills.length).toBeLessThanOrEqual(200); // Default medium size
    });

    test('should generate skills inventory with custom size', () => {
      const customSize = 50;
      const skills = generateSkillsInventory(customSize);
      
      expect(skills).toHaveLength(customSize);
    });

    test('should generate valid skills inventory structure', () => {
      const skills = generateSkillsInventory(10);
      
      skills.forEach(skill => {
        expect(skill).toHaveProperty('id');
        expect(skill).toHaveProperty('skill');
        expect(skill).toHaveProperty('category');
        expect(skill).toHaveProperty('proficiency');
        expect(skill).toHaveProperty('team');
        expect(skill).toHaveProperty('members');
        expect(skill).toHaveProperty('notes');
        
        expect(typeof skill.id).toBe('number');
        expect(typeof skill.skill).toBe('string');
        expect(typeof skill.category).toBe('string');
        expect(typeof skill.proficiency).toBe('number');
        expect(typeof skill.team).toBe('string');
        expect(typeof skill.members).toBe('number');
        expect(typeof skill.notes).toBe('string');
        
        expect(skill.proficiency).toBeGreaterThanOrEqual(1);
        expect(skill.proficiency).toBeLessThanOrEqual(5);
        expect(skill.members).toBeGreaterThanOrEqual(1);
        expect(skill.members).toBeLessThanOrEqual(15);
      });
    });

    test('should handle edge cases', () => {
      expect(() => generateSkillsInventory(0)).not.toThrow();
      expect(() => generateSkillsInventory(1)).not.toThrow();
      expect(() => generateSkillsInventory(1000)).not.toThrow();
      
      const emptySkills = generateSkillsInventory(0);
      expect(emptySkills).toHaveLength(0);
      
      const singleSkill = generateSkillsInventory(1);
      expect(singleSkill).toHaveLength(1);
    });
  });

  describe('Technology Radar Generator', () => {
    test('should generate technology radar with valid structure', () => {
      const technologies = generateTechnologyRadar(20);
      
      expect(technologies).toHaveLength(20);
      
      technologies.forEach(tech => {
        expect(tech).toHaveProperty('id');
        expect(tech).toHaveProperty('technology');
        expect(tech).toHaveProperty('quadrant');
        expect(tech).toHaveProperty('phase');
        
        expect(typeof tech.id).toBe('string');
        expect(tech.id).toMatch(/^tech-\d+$/);
        expect(typeof tech.technology).toBe('string');
        expect(['Techniques', 'Tools', 'Platforms', 'Languages & Frameworks']).toContain(tech.quadrant);
        expect(['Adopt', 'Trial', 'Assess', 'Hold']).toContain(tech.phase);
      });
    });

    test('should generate unique technology names', () => {
      const technologies = generateTechnologyRadar(50);
      const names = technologies.map(tech => tech.technology);
      const uniqueNames = new Set(names);
      
      // Should have reasonable uniqueness (allowing some duplicates for large datasets)
      expect(uniqueNames.size).toBeGreaterThan(names.length * 0.8);
    });
  });

  describe('Application Inventory Generator', () => {
    test('should generate application inventory with valid structure', () => {
      const applications = generateApplicationInventory(15);
      
      expect(applications).toHaveLength(15);
      
      applications.forEach(app => {
        expect(app).toHaveProperty('id');
        expect(app).toHaveProperty('applicationName');
        expect(app).toHaveProperty('department');
        expect(app).toHaveProperty('criticality');
        expect(app).toHaveProperty('purpose');
        
        expect(typeof app.id).toBe('number');
        expect(typeof app.applicationName).toBe('string');
        expect(typeof app.department).toBe('string');
        expect(['High', 'Medium', 'Low']).toContain(app.criticality);
        expect(typeof app.purpose).toBe('string');
        expect(app.purpose.length).toBeGreaterThan(10); // Should have meaningful purpose
      });
    });

    test('should generate unique application names', () => {
      const applications = generateApplicationInventory(30);
      const names = applications.map(app => app.applicationName);
      const uniqueNames = new Set(names);
      
      expect(uniqueNames.size).toBeGreaterThan(names.length * 0.8);
    });
  });

  describe('Technology Components Generator', () => {
    test('should generate technology components with valid structure', () => {
      const applications = generateApplicationInventory(5);
      const components = generateTechnologyComponents(applications, 10);
      
      expect(components).toHaveLength(10);
      
      components.forEach(comp => {
        expect(comp).toHaveProperty('id');
        expect(comp).toHaveProperty('applicationName');
        expect(comp).toHaveProperty('componentName');
        expect(comp).toHaveProperty('runtime');
        expect(comp).toHaveProperty('framework');
        expect(comp).toHaveProperty('databases');
        expect(comp).toHaveProperty('integrations');
        expect(comp).toHaveProperty('storages');
        
        expect(typeof comp.id).toBe('string');
        expect(comp.id).toMatch(/^tech-\d+$/);
        expect(typeof comp.applicationName).toBe('string');
        expect(typeof comp.componentName).toBe('string');
        expect(typeof comp.runtime).toBe('string');
        expect(typeof comp.framework).toBe('string');
        expect(typeof comp.databases).toBe('string');
        expect(typeof comp.integrations).toBe('string');
        expect(typeof comp.storages).toBe('string');
        
        // Should reference existing applications
        const appNames = applications.map(app => app.applicationName);
        expect(appNames).toContain(comp.applicationName);
      });
    });

    test('should work without provided applications', () => {
      const components = generateTechnologyComponents(null, 5);
      
      expect(components).toHaveLength(5);
      expect(components[0]).toHaveProperty('applicationName');
    });
  });

  describe('Infrastructure Resources Generator', () => {
    test('should generate infrastructure resources with valid structure', () => {
      const applications = generateApplicationInventory(3);
      const resources = generateInfrastructureResources(applications, 8);
      
      expect(resources).toHaveLength(8);
      
      resources.forEach(resource => {
        expect(resource).toHaveProperty('id');
        expect(resource).toHaveProperty('applicationName');
        expect(resource).toHaveProperty('serverName');
        expect(resource).toHaveProperty('serverType');
        expect(resource).toHaveProperty('cpu');
        expect(resource).toHaveProperty('memory');
        expect(resource).toHaveProperty('storage');
        expect(resource).toHaveProperty('region');
        expect(resource).toHaveProperty('environment');
        expect(resource).toHaveProperty('osType');
        expect(resource).toHaveProperty('osVersion');
        
        expect(typeof resource.id).toBe('string');
        expect(resource.id).toMatch(/^infra-\d+$/);
        expect(typeof resource.serverName).toBe('string');
        expect(['Production', 'Staging', 'Development', 'Testing', 'DR']).toContain(resource.environment);
        expect(['Linux', 'Windows']).toContain(resource.osType);
        expect(['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1']).toContain(resource.region);
      });
    });

    test('should generate realistic server specifications', () => {
      const resources = generateInfrastructureResources(null, 10);
      
      resources.forEach(resource => {
        expect(resource.cpu).toMatch(/^\d+ vCPU$/);
        expect(resource.memory).toMatch(/^\d+ GB$/);
        expect(resource.storage).toMatch(/^\d+ (GB|TB) SSD$/);
      });
    });
  });

  describe('Resource Utilization Generator', () => {
    test('should generate resource utilization with valid structure', () => {
      const resources = generateInfrastructureResources(null, 3);
      const utilization = generateResourceUtilization(resources, 10);
      
      expect(utilization).toHaveLength(10);
      
      utilization.forEach(util => {
        expect(util).toHaveProperty('id');
        expect(util).toHaveProperty('applicationName');
        expect(util).toHaveProperty('serverName');
        expect(util).toHaveProperty('timestamp');
        expect(util).toHaveProperty('cpuUtilization');
        expect(util).toHaveProperty('memoryUtilization');
        expect(util).toHaveProperty('storageUtilization');
        expect(util).toHaveProperty('networkIn');
        expect(util).toHaveProperty('networkOut');
        expect(util).toHaveProperty('iops');
        expect(util).toHaveProperty('notes');
        
        expect(typeof util.id).toBe('string');
        expect(util.id).toMatch(/^util-\d+$/);
        expect(typeof util.timestamp).toBe('string');
        expect(new Date(util.timestamp)).toBeInstanceOf(Date);
        
        // Validate utilization ranges
        expect(util.cpuUtilization).toBeGreaterThanOrEqual(0);
        expect(util.cpuUtilization).toBeLessThanOrEqual(100);
        expect(util.memoryUtilization).toBeGreaterThanOrEqual(0);
        expect(util.memoryUtilization).toBeLessThanOrEqual(100);
        expect(util.storageUtilization).toBeGreaterThanOrEqual(0);
        expect(util.storageUtilization).toBeLessThanOrEqual(100);
        
        expect(util.networkIn).toBeGreaterThanOrEqual(0);
        expect(util.networkOut).toBeGreaterThanOrEqual(0);
        expect(util.iops).toBeGreaterThanOrEqual(0);
      });
    });

    test('should generate realistic timestamps', () => {
      const utilization = generateResourceUtilization(null, 5);
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      utilization.forEach(util => {
        const timestamp = new Date(util.timestamp);
        expect(timestamp).toBeInstanceOf(Date);
        expect(timestamp.getTime()).toBeGreaterThanOrEqual(thirtyDaysAgo.getTime());
        expect(timestamp.getTime()).toBeLessThanOrEqual(now.getTime());
      });
    });
  });

  describe('Export History Generator', () => {
    test('should generate export history with valid structure', () => {
      const history = generateExportHistory(10);
      
      expect(history).toHaveLength(10);
      
      history.forEach(record => {
        expect(record).toHaveProperty('exportId');
        expect(record).toHaveProperty('projectId');
        expect(record).toHaveProperty('userId');
        expect(record).toHaveProperty('userName');
        expect(record).toHaveProperty('selectedCategories');
        expect(record).toHaveProperty('status');
        expect(record).toHaveProperty('createdAt');
        expect(record).toHaveProperty('fileSizeMB');
        expect(record).toHaveProperty('downloadCount');
        
        expect(typeof record.exportId).toBe('string');
        expect(record.exportId).toMatch(/^export-/);
        expect(Array.isArray(record.selectedCategories)).toBe(true);
        expect(record.selectedCategories.length).toBeGreaterThan(0);
        expect(['COMPLETED', 'FAILED', 'PROCESSING', 'INITIATED']).toContain(record.status);
        expect(new Date(record.createdAt)).toBeInstanceOf(Date);
        
        if (record.status === 'COMPLETED') {
          expect(record.fileSizeMB).toBeGreaterThan(0);
          expect(record.completedAt).toBeDefined();
        }
      });
    });

    test('should sort export history by creation date', () => {
      const history = generateExportHistory(5);
      
      for (let i = 1; i < history.length; i++) {
        const prevDate = new Date(history[i - 1].createdAt);
        const currDate = new Date(history[i].createdAt);
        expect(prevDate.getTime()).toBeGreaterThanOrEqual(currDate.getTime());
      }
    });
  });

  describe('Analysis Data Generator', () => {
    test('should generate skills analysis data', () => {
      const analysisData = generateAnalysisData('skills-analysis', null, 10);
      
      expect(analysisData).toHaveLength(10);
      
      analysisData.forEach(item => {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('skill');
        expect(item).toHaveProperty('team');
        expect(item).toHaveProperty('currentProficiency');
        expect(item).toHaveProperty('targetProficiency');
        expect(item).toHaveProperty('gap');
        expect(item).toHaveProperty('priority');
        expect(item).toHaveProperty('recommendedAction');
        expect(item).toHaveProperty('timeline');
        expect(item).toHaveProperty('cost');
        
        expect(item.currentProficiency).toBeGreaterThanOrEqual(1);
        expect(item.currentProficiency).toBeLessThanOrEqual(5);
        expect(item.targetProficiency).toBeGreaterThanOrEqual(3);
        expect(item.targetProficiency).toBeLessThanOrEqual(5);
        expect(['High', 'Medium', 'Low']).toContain(item.priority);
      });
    });

    test('should generate vision analysis data', () => {
      const analysisData = generateAnalysisData('vision-analysis', null, 5);
      
      expect(analysisData).toHaveLength(5);
      
      analysisData.forEach(item => {
        expect(item).toHaveProperty('technology');
        expect(item).toHaveProperty('currentPhase');
        expect(item).toHaveProperty('recommendedPhase');
        expect(item).toHaveProperty('adoptionRisk');
        expect(item).toHaveProperty('businessValue');
        expect(item).toHaveProperty('technicalComplexity');
        
        expect(['Adopt', 'Trial', 'Assess', 'Hold']).toContain(item.currentPhase);
        expect(['Adopt', 'Trial', 'Assess', 'Hold']).toContain(item.recommendedPhase);
        expect(['Low', 'Medium', 'High']).toContain(item.adoptionRisk);
      });
    });

    test('should generate generic analysis data for unknown categories', () => {
      const analysisData = generateAnalysisData('unknown-category', null, 3);
      
      expect(analysisData).toHaveLength(3);
      
      analysisData.forEach(item => {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('category');
        expect(item).toHaveProperty('metric');
        expect(item).toHaveProperty('value');
        expect(item).toHaveProperty('trend');
        expect(item).toHaveProperty('recommendation');
        expect(item).toHaveProperty('priority');
        
        expect(item.category).toBe('unknown-category');
        expect(['Increasing', 'Decreasing', 'Stable']).toContain(item.trend);
      });
    });
  });

  describe('Planning Data Generator', () => {
    test('should generate pilot identification data', () => {
      const planningData = generatePlanningData('pilot-identification', null, 8);
      
      expect(planningData).toHaveLength(8);
      
      planningData.forEach(item => {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('application');
        expect(item).toHaveProperty('pilotScore');
        expect(item).toHaveProperty('complexity');
        expect(item).toHaveProperty('businessImpact');
        expect(item).toHaveProperty('technicalRisk');
        expect(item).toHaveProperty('estimatedEffort');
        expect(item).toHaveProperty('estimatedCost');
        
        expect(item.pilotScore).toBeGreaterThanOrEqual(1);
        expect(item.pilotScore).toBeLessThanOrEqual(10);
        expect(['Low', 'Medium', 'High']).toContain(item.complexity);
        expect(['Low', 'Medium', 'High']).toContain(item.businessImpact);
        expect(['Low', 'Medium', 'High']).toContain(item.technicalRisk);
        expect(item.estimatedEffort).toBeGreaterThanOrEqual(2);
        expect(item.estimatedEffort).toBeLessThanOrEqual(24);
      });
    });

    test('should generate TCO estimates data', () => {
      const planningData = generatePlanningData('tco-estimates', null, 5);
      
      expect(planningData).toHaveLength(5);
      
      planningData.forEach(item => {
        expect(item).toHaveProperty('application');
        expect(item).toHaveProperty('currentTCO');
        expect(item).toHaveProperty('projectedTCO');
        expect(item).toHaveProperty('savings');
        expect(item).toHaveProperty('migrationCost');
        expect(item).toHaveProperty('paybackPeriod');
        expect(item).toHaveProperty('riskFactor');
        expect(item).toHaveProperty('confidence');
        
        expect(item.currentTCO).toBeGreaterThan(0);
        expect(item.projectedTCO).toBeGreaterThan(0);
        expect(item.paybackPeriod).toBeGreaterThanOrEqual(6);
        expect(item.paybackPeriod).toBeLessThanOrEqual(36);
        expect(['High', 'Medium', 'Low']).toContain(item.confidence);
      });
    });
  });

  describe('Generate All Mock Data', () => {
    test('should generate all mock data with default sizes', () => {
      const mockData = generateAllMockData();
      
      expect(mockData).toHaveProperty('skills');
      expect(mockData).toHaveProperty('technologyRadar');
      expect(mockData).toHaveProperty('applications');
      expect(mockData).toHaveProperty('components');
      expect(mockData).toHaveProperty('infrastructure');
      expect(mockData).toHaveProperty('utilization');
      expect(mockData).toHaveProperty('exportHistory');
      expect(mockData).toHaveProperty('skillsAnalysis');
      expect(mockData).toHaveProperty('visionAnalysis');
      expect(mockData).toHaveProperty('infrastructureAnalysis');
      expect(mockData).toHaveProperty('pilotIdentification');
      expect(mockData).toHaveProperty('tcoEstimates');
      expect(mockData).toHaveProperty('teamEstimates');
      expect(mockData).toHaveProperty('generatedAt');
      expect(mockData).toHaveProperty('config');
      expect(mockData).toHaveProperty('totalRecords');
      
      expect(Array.isArray(mockData.skills)).toBe(true);
      expect(Array.isArray(mockData.technologyRadar)).toBe(true);
      expect(Array.isArray(mockData.applications)).toBe(true);
      expect(mockData.skills.length).toBeGreaterThan(0);
      expect(mockData.totalRecords).toBeGreaterThan(0);
      expect(new Date(mockData.generatedAt)).toBeInstanceOf(Date);
    });

    test('should generate all mock data with custom sizes', () => {
      const customSizes = {
        skills: 10,
        applications: 5,
        exportHistory: 3
      };
      
      const mockData = generateAllMockData(customSizes);
      
      expect(mockData.skills).toHaveLength(10);
      expect(mockData.applications).toHaveLength(5);
      expect(mockData.exportHistory).toHaveLength(3);
      expect(mockData.config).toEqual(expect.objectContaining(customSizes));
    });

    test('should maintain data relationships', () => {
      const mockData = generateAllMockData({
        applications: 5,
        components: 10,
        infrastructure: 8
      });
      
      // Components should reference existing applications
      const appNames = mockData.applications.map(app => app.applicationName);
      mockData.components.forEach(comp => {
        expect(appNames).toContain(comp.applicationName);
      });
      
      // Infrastructure should reference existing applications
      mockData.infrastructure.forEach(infra => {
        expect(appNames).toContain(infra.applicationName);
      });
    });
  });

  describe('Performance Tests', () => {
    test('should generate large datasets efficiently', () => {
      const startTime = Date.now();
      
      const mockData = generateAllMockData({
        skills: 1000,
        applications: 500,
        components: 2000,
        infrastructure: 1500,
        utilization: 5000
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(mockData.totalRecords).toBeGreaterThan(10000);
    });

    test('should handle edge case sizes', () => {
      expect(() => generateAllMockData({
        skills: 0,
        applications: 1,
        exportHistory: 0
      })).not.toThrow();
      
      const mockData = generateAllMockData({
        skills: 0,
        applications: 1,
        exportHistory: 0
      });
      
      expect(mockData.skills).toHaveLength(0);
      expect(mockData.applications).toHaveLength(1);
      expect(mockData.exportHistory).toHaveLength(0);
    });
  });

  describe('Data Quality Tests', () => {
    test('should generate realistic data values', () => {
      const mockData = generateAllMockData({ skills: 50 });
      
      // Check for realistic skill names
      const skillNames = mockData.skills.map(skill => skill.skill);
      expect(skillNames.some(name => name.includes('React'))).toBe(true);
      expect(skillNames.some(name => name.includes('AWS'))).toBe(true);
      
      // Check for realistic team names
      const teamNames = mockData.skills.map(skill => skill.team);
      expect(teamNames.some(name => name.includes('Team'))).toBe(true);
    });

    test('should generate consistent timestamps', () => {
      const utilization = generateResourceUtilization(null, 100);
      const now = new Date();
      
      utilization.forEach(util => {
        const timestamp = new Date(util.timestamp);
        expect(timestamp.getTime()).toBeLessThanOrEqual(now.getTime());
        expect(timestamp.getFullYear()).toBeGreaterThanOrEqual(now.getFullYear() - 1);
      });
    });

    test('should generate valid export categories', () => {
      const history = generateExportHistory(20);
      const validCategories = [
        'skills', 'technology-vision', 'application-portfolio', 'application-tech-stack',
        'application-infrastructure', 'application-utilization', 'skills-analysis',
        'vision-analysis', 'tech-stack-analysis', 'infrastructure-analysis',
        'utilization-analysis', 'team-analysis', 'pilot-identification',
        'application-grouping', 'tco-estimates', 'team-estimates'
      ];
      
      history.forEach(record => {
        record.selectedCategories.forEach(category => {
          expect(validCategories).toContain(category);
        });
      });
    });
  });
});