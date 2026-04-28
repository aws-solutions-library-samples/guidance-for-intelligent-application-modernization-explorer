/**
 * Category configuration with data source mappings for Advanced Data Export System
 * Defines all available export categories and their data sources
 */

import { CategoryDefinition, CategoryTree } from '../types/export';

/**
 * Data section categories
 */
export const DATA_CATEGORIES: CategoryDefinition[] = [
  {
    id: 'skills',
    name: 'Skills',
    type: 'data',
    dataSource: 'skills_inventory',
    excelTemplate: 'skills_template'
  },
  {
    id: 'technology-vision',
    name: 'Technology Vision',
    type: 'data',
    dataSource: 'technology_radar',
    excelTemplate: 'tech_vision_template'
  },
  {
    id: 'application-portfolio',
    name: 'Application Portfolio',
    type: 'data',
    dataSource: 'application_inventory',
    excelTemplate: 'app_portfolio_template'
  },
  {
    id: 'application-tech-stack',
    name: 'Application Tech Stack',
    type: 'data',
    dataSource: 'technology_components',
    excelTemplate: 'tech_stack_template'
  },
  {
    id: 'application-infrastructure',
    name: 'Application Infrastructure',
    type: 'data',
    dataSource: 'infrastructure_resources',
    excelTemplate: 'infrastructure_template'
  },
  {
    id: 'application-utilization',
    name: 'Application Utilization',
    type: 'data',
    dataSource: 'resource_utilization',
    excelTemplate: 'utilization_template'
  }
];

/**
 * Insights section categories
 */
export const INSIGHTS_CATEGORIES: CategoryDefinition[] = [
  {
    id: 'skills-analysis',
    name: 'Skills Analysis',
    type: 'insights',
    dataSource: 'skills_analysis_view',
    excelTemplate: 'skills_analysis_template',
    dependencies: ['skills']
  },
  {
    id: 'vision-analysis',
    name: 'Vision Analysis',
    type: 'insights',
    dataSource: 'vision_analysis_view',
    excelTemplate: 'vision_analysis_template',
    dependencies: ['technology-vision']
  },
  {
    id: 'tech-stack-analysis',
    name: 'Tech Stack Analysis',
    type: 'insights',
    dataSource: 'tech_stack_analysis_view',
    excelTemplate: 'tech_stack_analysis_template',
    dependencies: ['application-tech-stack']
  },
  {
    id: 'infrastructure-analysis',
    name: 'Infrastructure Analysis',
    type: 'insights',
    dataSource: 'infrastructure_analysis_view',
    excelTemplate: 'infrastructure_analysis_template',
    dependencies: ['application-infrastructure']
  },
  {
    id: 'utilization-analysis',
    name: 'Utilization Analysis',
    type: 'insights',
    dataSource: 'utilization_analysis_view',
    excelTemplate: 'utilization_analysis_template',
    dependencies: ['application-utilization']
  },
  {
    id: 'team-analysis',
    name: 'Team Analysis',
    type: 'insights',
    dataSource: 'team_analysis_view',
    excelTemplate: 'team_analysis_template',
    dependencies: ['skills', 'application-portfolio']
  }
];

/**
 * Planning section categories
 */
export const PLANNING_CATEGORIES: CategoryDefinition[] = [
  {
    id: 'pilot-identification',
    name: 'Pilot Identification',
    type: 'planning',
    dataSource: 'pilot_identification_results',
    excelTemplate: 'pilot_identification_template',
    dependencies: ['application-portfolio', 'tech-stack-analysis']
  },
  {
    id: 'application-grouping',
    name: 'Application Buckets',
    type: 'planning',
    dataSource: 'application_buckets',
    excelTemplate: 'app_grouping_template',
    dependencies: ['application-portfolio']
  },
  {
    id: 'tco-estimates',
    name: 'TCO Estimates',
    type: 'planning',
    dataSource: 'tco_estimates',
    excelTemplate: 'tco_estimates_template',
    dependencies: ['application-portfolio', 'infrastructure-analysis']
  },
  {
    id: 'team-estimates',
    name: 'Team Estimates',
    type: 'planning',
    dataSource: 'team_estimates',
    excelTemplate: 'team_estimates_template',
    dependencies: ['skills-analysis', 'application-portfolio']
  }
];

/**
 * All available categories combined
 */
export const ALL_CATEGORIES: CategoryDefinition[] = [
  ...DATA_CATEGORIES,
  ...INSIGHTS_CATEGORIES,
  ...PLANNING_CATEGORIES
];

/**
 * Category tree structure for hierarchical display
 */
export const CATEGORY_TREE: CategoryTree[] = [
  {
    type: 'data',
    name: 'Data Sections',
    categories: DATA_CATEGORIES,
    subcategories: [
      {
        type: 'data',
        name: 'Applications',
        categories: DATA_CATEGORIES.filter(cat => cat.id.startsWith('application-'))
      }
    ]
  },
  {
    type: 'insights',
    name: 'Insights Sections',
    categories: INSIGHTS_CATEGORIES
  },
  {
    type: 'planning',
    name: 'Planning Sections',
    categories: PLANNING_CATEGORIES,
    subcategories: [
      {
        type: 'planning',
        name: 'Estimates',
        categories: PLANNING_CATEGORIES.filter(cat => cat.id.includes('estimates'))
      }
    ]
  }
];

/**
 * Get category by ID
 * @param categoryId - The category ID to find
 * @returns The category definition or undefined if not found
 */
export function getCategoryById(categoryId: string): CategoryDefinition | undefined {
  return ALL_CATEGORIES.find(category => category.id === categoryId);
}

/**
 * Get categories by type
 * @param type - The category type to filter by
 * @returns Array of categories matching the type
 */
export function getCategoriesByType(type: 'data' | 'insights' | 'planning'): CategoryDefinition[] {
  return ALL_CATEGORIES.filter(category => category.type === type);
}

/**
 * Get all dependencies for a set of categories (recursive)
 * @param categoryIds - Array of category IDs
 * @returns Array of all required category IDs including dependencies
 */
export function getAllDependencies(categoryIds: string[]): string[] {
  const allDependencies = new Set<string>();
  const processed = new Set<string>();

  function addDependencies(categoryId: string) {
    if (processed.has(categoryId)) {
      return;
    }
    processed.add(categoryId);

    const category = getCategoryById(categoryId);
    if (category && category.dependencies) {
      for (const depId of category.dependencies) {
        allDependencies.add(depId);
        addDependencies(depId);
      }
    }
  }

  for (const categoryId of categoryIds) {
    allDependencies.add(categoryId);
    addDependencies(categoryId);
  }

  return Array.from(allDependencies);
}

/**
 * Validate that all dependencies are satisfied for selected categories
 * @param selectedCategoryIds - Array of selected category IDs
 * @returns Object with validation result and missing dependencies
 */
export function validateDependencies(selectedCategoryIds: string[]): {
  isValid: boolean;
  missingDependencies: string[];
} {
  const selectedSet = new Set(selectedCategoryIds);
  const missingDependencies: string[] = [];

  for (const categoryId of selectedCategoryIds) {
    const category = getCategoryById(categoryId);
    if (category && category.dependencies) {
      for (const depId of category.dependencies) {
        if (!selectedSet.has(depId)) {
          missingDependencies.push(depId);
        }
      }
    }
  }

  return {
    isValid: missingDependencies.length === 0,
    missingDependencies: [...new Set(missingDependencies)]
  };
}

/**
 * Get display name mapping for legacy category keys
 * Used for backward compatibility with existing ExportDataPage component
 */
export const LEGACY_CATEGORY_MAPPING: Record<string, string> = {
  skills: 'skills',
  technologyVision: 'technology-vision',
  applicationPortfolio: 'application-portfolio',
  applicationTechStack: 'application-tech-stack',
  applicationInfrastructure: 'application-infrastructure',
  applicationUtilization: 'application-utilization',
  skillsAnalysis: 'skills-analysis',
  visionAnalysis: 'vision-analysis',
  techStackAnalysis: 'tech-stack-analysis',
  infrastructureAnalysis: 'infrastructure-analysis',
  utilizationAnalysis: 'utilization-analysis',
  teamAnalysis: 'team-analysis',
  pilotIdentification: 'pilot-identification',
  applicationGrouping: 'application-grouping',
  tcoEstimates: 'tco-estimates',
  teamEstimates: 'team-estimates'
};

/**
 * Convert legacy category keys to new category IDs
 * @param legacyKeys - Array of legacy category keys
 * @returns Array of new category IDs
 */
export function convertLegacyCategories(legacyKeys: string[]): string[] {
  return legacyKeys.map(key => LEGACY_CATEGORY_MAPPING[key] || key);
}