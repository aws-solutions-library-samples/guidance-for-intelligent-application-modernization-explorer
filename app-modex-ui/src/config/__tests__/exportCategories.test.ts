/**
 * Tests for export categories configuration
 */

import {
  ALL_CATEGORIES,
  DATA_CATEGORIES,
  INSIGHTS_CATEGORIES,
  PLANNING_CATEGORIES,
  CATEGORY_TREE,
  getCategoryById,
  getCategoriesByType,
  getAllDependencies,
  validateDependencies,
  convertLegacyCategories
} from '../exportCategories';

describe('Export Categories Configuration', () => {
  describe('Category Arrays', () => {
    it('should have all categories combined correctly', () => {
      const expectedLength = DATA_CATEGORIES.length + INSIGHTS_CATEGORIES.length + PLANNING_CATEGORIES.length;
      expect(ALL_CATEGORIES).toHaveLength(expectedLength);
    });

    it('should have unique category IDs', () => {
      const categoryIds = ALL_CATEGORIES.map(cat => cat.id);
      const uniqueIds = new Set(categoryIds);
      expect(uniqueIds.size).toBe(categoryIds.length);
    });

    it('should have valid category types', () => {
      const validTypes = ['data', 'insights', 'planning'];
      ALL_CATEGORIES.forEach(category => {
        expect(validTypes).toContain(category.type);
      });
    });
  });

  describe('getCategoryById', () => {
    it('should return category for valid ID', () => {
      const category = getCategoryById('skills');
      expect(category).toBeDefined();
      expect(category?.name).toBe('Skills');
      expect(category?.type).toBe('data');
    });

    it('should return undefined for invalid ID', () => {
      const category = getCategoryById('invalid-id');
      expect(category).toBeUndefined();
    });
  });

  describe('getCategoriesByType', () => {
    it('should return data categories', () => {
      const categories = getCategoriesByType('data');
      expect(categories).toHaveLength(DATA_CATEGORIES.length);
      categories.forEach(cat => {
        expect(cat.type).toBe('data');
      });
    });

    it('should return insights categories', () => {
      const categories = getCategoriesByType('insights');
      expect(categories).toHaveLength(INSIGHTS_CATEGORIES.length);
      categories.forEach(cat => {
        expect(cat.type).toBe('insights');
      });
    });

    it('should return planning categories', () => {
      const categories = getCategoriesByType('planning');
      expect(categories).toHaveLength(PLANNING_CATEGORIES.length);
      categories.forEach(cat => {
        expect(cat.type).toBe('planning');
      });
    });
  });

  describe('getAllDependencies', () => {
    it('should return all dependencies for skills-analysis', () => {
      const dependencies = getAllDependencies(['skills-analysis']);
      expect(dependencies).toContain('skills-analysis');
      expect(dependencies).toContain('skills');
    });

    it('should handle multiple categories with dependencies', () => {
      const dependencies = getAllDependencies(['skills-analysis', 'team-analysis']);
      expect(dependencies).toContain('skills-analysis');
      expect(dependencies).toContain('team-analysis');
      expect(dependencies).toContain('skills');
      expect(dependencies).toContain('application-portfolio');
    });

    it('should handle categories without dependencies', () => {
      const dependencies = getAllDependencies(['skills']);
      expect(dependencies).toEqual(['skills']);
    });
  });

  describe('validateDependencies', () => {
    it('should validate when all dependencies are present', () => {
      const result = validateDependencies(['skills', 'skills-analysis']);
      expect(result.isValid).toBe(true);
      expect(result.missingDependencies).toHaveLength(0);
    });

    it('should detect missing dependencies', () => {
      const result = validateDependencies(['skills-analysis']);
      expect(result.isValid).toBe(false);
      expect(result.missingDependencies).toContain('skills');
    });

    it('should handle categories without dependencies', () => {
      const result = validateDependencies(['skills', 'technology-vision']);
      expect(result.isValid).toBe(true);
      expect(result.missingDependencies).toHaveLength(0);
    });
  });

  describe('convertLegacyCategories', () => {
    it('should convert legacy category keys to new IDs', () => {
      const legacyKeys = ['skills', 'technologyVision', 'applicationPortfolio'];
      const converted = convertLegacyCategories(legacyKeys);
      expect(converted).toEqual(['skills', 'technology-vision', 'application-portfolio']);
    });

    it('should handle unknown keys by returning them unchanged', () => {
      const legacyKeys = ['skills', 'unknown-key'];
      const converted = convertLegacyCategories(legacyKeys);
      expect(converted).toEqual(['skills', 'unknown-key']);
    });
  });

  describe('Category Tree Structure', () => {
    it('should have correct tree structure', () => {
      expect(CATEGORY_TREE).toHaveLength(3);
      
      const dataTree = CATEGORY_TREE.find(tree => tree.type === 'data');
      const insightsTree = CATEGORY_TREE.find(tree => tree.type === 'insights');
      const planningTree = CATEGORY_TREE.find(tree => tree.type === 'planning');

      expect(dataTree).toBeDefined();
      expect(insightsTree).toBeDefined();
      expect(planningTree).toBeDefined();

      expect(dataTree?.name).toBe('Data Sections');
      expect(insightsTree?.name).toBe('Insights Sections');
      expect(planningTree?.name).toBe('Planning Sections');
    });

    it('should have subcategories for data and planning sections', () => {
      const dataTree = CATEGORY_TREE.find(tree => tree.type === 'data');
      const planningTree = CATEGORY_TREE.find(tree => tree.type === 'planning');

      expect(dataTree?.subcategories).toBeDefined();
      expect(dataTree?.subcategories).toHaveLength(1);
      expect(dataTree?.subcategories?.[0].name).toBe('Applications');

      expect(planningTree?.subcategories).toBeDefined();
      expect(planningTree?.subcategories).toHaveLength(1);
      expect(planningTree?.subcategories?.[0].name).toBe('Estimates');
    });
  });

  describe('Data Integrity', () => {
    it('should have all required fields for each category', () => {
      ALL_CATEGORIES.forEach(category => {
        expect(category.id).toBeTruthy();
        expect(category.name).toBeTruthy();
        expect(category.type).toBeTruthy();
        expect(category.dataSource).toBeTruthy();
        expect(category.excelTemplate).toBeTruthy();
      });
    });

    it('should have valid dependency references', () => {
      const allCategoryIds = ALL_CATEGORIES.map(cat => cat.id);
      
      const categoriesWithDependencies = ALL_CATEGORIES.filter(cat => cat.dependencies);
      
      categoriesWithDependencies.forEach(category => {
        category.dependencies!.forEach(depId => {
          expect(allCategoryIds).toContain(depId);
        });
      });
    });
  });
});