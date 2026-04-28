import React, { useState } from 'react';
import {
  Container,
  Header,
  SpaceBetween,
  Box,
  Button,
  Checkbox,
  ColumnLayout,
  ExpandableSection,
  Alert
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

// Define category data directly in the component for now
// This will be replaced with proper imports once the TypeScript config is resolved
const CATEGORY_TREE = [
  {
    type: 'data',
    name: 'Data Sections',
    categories: [
      { id: 'skills', name: 'Skills', type: 'data', dataSource: 'skills_inventory', excelTemplate: 'skills_template' },
      { id: 'technology-vision', name: 'Technology Vision', type: 'data', dataSource: 'technology_radar', excelTemplate: 'tech_vision_template' }
    ],
    subcategories: [
      {
        type: 'data',
        name: 'Applications',
        categories: [
          { id: 'application-portfolio', name: 'Application Portfolio', type: 'data', dataSource: 'application_inventory', excelTemplate: 'app_portfolio_template' },
          { id: 'application-tech-stack', name: 'Application Tech Stack', type: 'data', dataSource: 'technology_components', excelTemplate: 'tech_stack_template' },
          { id: 'application-infrastructure', name: 'Application Infrastructure', type: 'data', dataSource: 'infrastructure_resources', excelTemplate: 'infrastructure_template' },
          { id: 'application-utilization', name: 'Application Utilization', type: 'data', dataSource: 'resource_utilization', excelTemplate: 'utilization_template' }
        ]
      }
    ]
  },
  {
    type: 'insights',
    name: 'Insights Sections',
    categories: [
      { id: 'skills-analysis', name: 'Skills Analysis', type: 'insights', dataSource: 'skills_analysis_view', excelTemplate: 'skills_analysis_template', dependencies: ['skills'] },
      { id: 'vision-analysis', name: 'Vision Analysis', type: 'insights', dataSource: 'vision_analysis_view', excelTemplate: 'vision_analysis_template', dependencies: ['technology-vision'] },
      { id: 'tech-stack-analysis', name: 'Tech Stack Analysis', type: 'insights', dataSource: 'tech_stack_analysis_view', excelTemplate: 'tech_stack_analysis_template', dependencies: ['application-tech-stack'] },
      { id: 'infrastructure-analysis', name: 'Infrastructure Analysis', type: 'insights', dataSource: 'infrastructure_analysis_view', excelTemplate: 'infrastructure_analysis_template', dependencies: ['application-infrastructure'] },
      { id: 'utilization-analysis', name: 'Utilization Analysis', type: 'insights', dataSource: 'utilization_analysis_view', excelTemplate: 'utilization_analysis_template', dependencies: ['application-utilization'] },
      { id: 'team-analysis', name: 'Team Analysis', type: 'insights', dataSource: 'team_analysis_view', excelTemplate: 'team_analysis_template', dependencies: ['skills', 'application-portfolio'] }
    ]
  },
  {
    type: 'planning',
    name: 'Planning Sections',
    categories: [
      { id: 'pilot-identification', name: 'Pilot Identification', type: 'planning', dataSource: 'pilot_identification_results', excelTemplate: 'pilot_identification_template', dependencies: ['application-portfolio', 'tech-stack-analysis'] },
      { id: 'application-grouping', name: 'Application Buckets', type: 'planning', dataSource: 'application_buckets', excelTemplate: 'app_grouping_template', dependencies: ['application-portfolio'] }
    ],
    subcategories: [
      {
        type: 'planning',
        name: 'Estimates',
        categories: [
          { id: 'tco-estimates', name: 'TCO Estimates', type: 'planning', dataSource: 'tco_estimates', excelTemplate: 'tco_estimates_template', dependencies: ['application-portfolio', 'infrastructure-analysis'] },
          { id: 'team-estimates', name: 'Team Estimates', type: 'planning', dataSource: 'team_estimates', excelTemplate: 'team_estimates_template', dependencies: ['skills-analysis', 'application-portfolio'] }
        ]
      }
    ]
  }
];

// Helper functions
const getAllCategories = () => {
  return CATEGORY_TREE.flatMap(tree => 
    [...tree.categories, ...(tree.subcategories?.flatMap(sub => sub.categories) || [])]
  );
};

const getCategoryById = (categoryId) => {
  return getAllCategories().find(category => category.id === categoryId);
};

const validateDependencies = (selectedCategoryIds) => {
  const selectedSet = new Set(selectedCategoryIds);
  const missingDependencies = [];

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
};

/**
 * ExportCategorySelector Component
 * 
 * Provides hierarchical category selection UI with checkboxes for the Advanced Data Export System.
 * Features:
 * - Hierarchical display with expand/collapse functionality
 * - Select all/none functionality for each section and globally
 * - Validation for minimum category selection
 * - Dependency validation and automatic selection
 */
const ExportCategorySelector = ({ 
  selectedCategories = [], 
  onSelectionChange, 
  disabled = false,
  hideSelectionWarning = false
}) => {
  const { t } = useTranslation(['components', 'common']);
  // State for expanded sections
  const [expandedSections, setExpandedSections] = useState({
    'data': true,
    'insights': true,
    'planning': true
  });

  // State for validation errors
  const [validationError, setValidationError] = useState('');
  
  // State for dismissed alerts
  const [selectionWarningDismissed, setSelectionWarningDismissed] = useState(false);

  // Check if any categories are selected for validation
  const hasSelection = selectedCategories.length > 0;

  // Auto-close timer for selection warning
  React.useEffect(() => {
    if (!hasSelection && !selectionWarningDismissed) {
      console.log('Setting auto-close timer for selection warning');
      const timer = setTimeout(() => {
        console.log('Auto-closing selection warning');
        setSelectionWarningDismissed(true);
      }, 5000); // Auto-close after 5 seconds
      
      return () => {
        console.log('Clearing selection warning timer');
        clearTimeout(timer);
      };
    }
  }, [hasSelection, selectionWarningDismissed]);

  // Convert selectedCategories to a Set for faster lookups
  const selectedSet = new Set(selectedCategories);

  /**
   * Handle individual category selection
   */
  const handleCategoryChange = (categoryId, checked) => {
    let newSelection = [...selectedCategories];
    
    if (checked) {
      // Add category if not already selected
      if (!selectedSet.has(categoryId)) {
        newSelection.push(categoryId);
      }
      
      // Auto-select dependencies
      const category = getCategoryById(categoryId);
      if (category && category.dependencies) {
        for (const depId of category.dependencies) {
          if (!selectedSet.has(depId)) {
            newSelection.push(depId);
          }
        }
      }
    } else {
      // Remove category
      newSelection = newSelection.filter(id => id !== categoryId);
      
      // Remove categories that depend on this one
      const dependentCategories = getAllCategories()
        .filter(cat => cat.dependencies && cat.dependencies.includes(categoryId))
        .map(cat => cat.id);
      
      newSelection = newSelection.filter(id => !dependentCategories.includes(id));
    }

    // Validate dependencies
    const validation = validateDependencies(newSelection);
    if (!validation.isValid) {
      setValidationError(`Missing required dependencies: ${validation.missingDependencies.map(id => getCategoryById(id)?.name || id).join(', ')}`);
    } else {
      setValidationError('');
    }

    onSelectionChange(newSelection);
    
    // Reset dismissed warning if user makes a selection
    if (newSelection.length > 0) {
      setSelectionWarningDismissed(false);
    }
  };

  /**
   * Handle section-level select all/none
   */
  const handleSectionSelectAll = (sectionType) => {
    const sectionTree = CATEGORY_TREE.find(tree => tree.type === sectionType);
    if (!sectionTree) return;

    // Get all categories in this section (including subcategories)
    const sectionCategories = [
      ...sectionTree.categories,
      ...(sectionTree.subcategories?.flatMap(sub => sub.categories) || [])
    ];
    
    const sectionCategoryIds = sectionCategories.map(cat => cat.id);
    
    // Check if all categories in this section are selected
    const allSectionSelected = sectionCategoryIds.every(id => selectedSet.has(id));
    
    let newSelection = [...selectedCategories];
    
    if (allSectionSelected) {
      // Deselect all categories in this section
      newSelection = newSelection.filter(id => !sectionCategoryIds.includes(id));
      
      // Also remove any categories from other sections that depend on these
      const allCategories = getAllCategories();
      
      const dependentCategories = allCategories
        .filter(cat => cat.dependencies && cat.dependencies.some(depId => sectionCategoryIds.includes(depId)))
        .map(cat => cat.id);
      
      newSelection = newSelection.filter(id => !dependentCategories.includes(id));
    } else {
      // Select all categories in this section
      for (const categoryId of sectionCategoryIds) {
        if (!selectedSet.has(categoryId)) {
          newSelection.push(categoryId);
        }
      }
      
      // Auto-select dependencies from other sections
      const allDependencies = new Set();
      for (const category of sectionCategories) {
        if (category.dependencies) {
          category.dependencies.forEach(depId => allDependencies.add(depId));
        }
      }
      
      for (const depId of allDependencies) {
        if (!selectedSet.has(depId)) {
          newSelection.push(depId);
        }
      }
    }

    onSelectionChange(newSelection);
  };

  /**
   * Handle global select all/none
   */
  const handleGlobalSelectAll = () => {
    const allCategories = getAllCategories();
    const allCategoryIds = allCategories.map(cat => cat.id);
    
    // Check if all categories are selected
    const allSelected = allCategoryIds.every(id => selectedSet.has(id));
    
    if (allSelected) {
      // Deselect all
      onSelectionChange([]);
    } else {
      // Select all
      onSelectionChange(allCategoryIds);
    }
  };

  /**
   * Toggle section expansion
   */
  const toggleSection = (sectionType) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionType]: !prev[sectionType]
    }));
  };

  /**
   * Check if a category is selected
   */
  const isCategorySelected = (categoryId) => {
    return selectedSet.has(categoryId);
  };

  /**
   * Check if all categories in a section are selected
   */
  const isSectionFullySelected = (sectionType) => {
    const sectionTree = CATEGORY_TREE.find(tree => tree.type === sectionType);
    if (!sectionTree) return false;

    const sectionCategories = [
      ...sectionTree.categories,
      ...(sectionTree.subcategories?.flatMap(sub => sub.categories) || [])
    ];
    
    return sectionCategories.every(cat => selectedSet.has(cat.id));
  };

  /**
   * Check if any categories in a section are selected
   */
  const isSectionPartiallySelected = (sectionType) => {
    const sectionTree = CATEGORY_TREE.find(tree => tree.type === sectionType);
    if (!sectionTree) return false;

    const sectionCategories = [
      ...sectionTree.categories,
      ...(sectionTree.subcategories?.flatMap(sub => sub.categories) || [])
    ];
    
    return sectionCategories.some(cat => selectedSet.has(cat.id));
  };

  /**
   * Render a category checkbox
   */
  const renderCategoryCheckbox = (category) => (
    <Checkbox
      key={category.id}
      checked={isCategorySelected(category.id)}
      onChange={({ detail }) => handleCategoryChange(category.id, detail.checked)}
      disabled={disabled}
      description={category.dependencies ? `Requires: ${category.dependencies.map(id => getCategoryById(id)?.name || id).join(', ')}` : undefined}
    >
      {category.name}
    </Checkbox>
  );

  /**
   * Render a category section
   */
  const renderSection = (tree) => {
    const isExpanded = expandedSections[tree.type];
    const isFullySelected = isSectionFullySelected(tree.type);
    const isPartiallySelected = isSectionPartiallySelected(tree.type);
    
    return (
      <div key={tree.type}>
        <Container
          header={
            <Header
              variant="h2"
              actions={
                <Button
                  onClick={() => handleSectionSelectAll(tree.type)}
                  disabled={disabled}
                  variant="link"
                >
                  {isFullySelected ? t('components:exportCategory.deselectAll') : t('components:exportCategory.selectAll')}
                </Button>
              }
            >
              {tree.name}
              {isPartiallySelected && !isFullySelected && (
                <Box variant="small" color="text-status-info" display="inline" margin={{ left: 'xs' }}>
                  ({t('components:exportCategory.partiallySelected')})
                </Box>
              )}
            </Header>
          }
        >
          <ExpandableSection
            headerText={t('components:exportCategory.expandCollapseSection', { 
              action: isExpanded ? t('components:exportCategory.collapse') : t('components:exportCategory.expand'), 
              sectionName: tree.name 
            })}
            expanded={isExpanded}
            onChange={() => toggleSection(tree.type)}
            variant="container"
          >
            <SpaceBetween size="m">
              {/* Direct categories */}
              {tree.categories.filter(cat => !tree.subcategories?.some(sub => sub.categories.includes(cat))).length > 0 && (
                <ColumnLayout columns={2} variant="text-grid">
                  {tree.categories
                    .filter(cat => !tree.subcategories?.some(sub => sub.categories.includes(cat)))
                    .map(renderCategoryCheckbox)}
                </ColumnLayout>
              )}
              
              {/* Subcategories */}
              {tree.subcategories?.map(subcategory => (
                <div key={`${tree.type}-${subcategory.name}`}>
                  <Container
                    header={<Header variant="h3">{subcategory.name}</Header>}
                  >
                    <ColumnLayout columns={2} variant="text-grid">
                      {subcategory.categories.map(renderCategoryCheckbox)}
                    </ColumnLayout>
                  </Container>
                </div>
              ))}
            </SpaceBetween>
          </ExpandableSection>
        </Container>
      </div>
    );
  };

  const allCategories = getAllCategories();
  const allSelected = allCategories.every(cat => selectedSet.has(cat.id));

  return (
    <SpaceBetween size="l">
      {/* Global controls */}
      <Container
        header={
          <Header
            variant="h1"
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button
                  onClick={handleGlobalSelectAll}
                  disabled={disabled}
                  variant="link"
                >
                  {allSelected ? t('components:exportCategory.deselectAll') : t('components:exportCategory.selectAll')}
                </Button>
              </SpaceBetween>
            }
          >
            {t('components:exportCategory.exportCategories')}
          </Header>
        }
      >
        <Box>
          {t('components:exportCategory.selectCategoriesDescription')}
        </Box>
      </Container>

      {/* Validation error */}
      {validationError && (
        <Alert type="error" dismissible onDismiss={() => setValidationError('')}>
          {validationError}
        </Alert>
      )}

      {/* Selection validation */}
      {!hasSelection && !selectionWarningDismissed && !hideSelectionWarning && (
        <Alert 
          type="warning" 
          dismissible 
          onDismiss={() => {
            console.log('Category selection warning dismissed');
            setSelectionWarningDismissed(true);
          }}
        >
          {t('components:exportCategory.selectAtLeastOneCategory')}
        </Alert>
      )}

      {/* Category sections */}
      {CATEGORY_TREE.map(renderSection)}

      {/* Selection summary */}
      {hasSelection && (
        <Container header={<Header variant="h3">{t('components:exportCategory.selectionSummary')}</Header>}>
          <Box>
            <strong>{selectedCategories.length}</strong> {t('components:exportCategory.categoriesSelected')}:
            <Box margin={{ top: 'xs' }}>
              {selectedCategories
                .map(id => getCategoryById(id)?.name || id)
                .sort()
                .join(', ')}
            </Box>
          </Box>
        </Container>
      )}
    </SpaceBetween>
  );
};

export default ExportCategorySelector;