import React, { useState, useMemo } from 'react';
import {
  Table,
  Box,
  SpaceBetween,
  Badge,
  Header,
  Pagination,
  TextFilter,
  Select,
  StatusIndicator,
  ColumnLayout,
  Container,
  CollectionPreferences,
  Button
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

/**
 * Vision Gaps Table Component
 * 
 * Displays technologies from the technology vision that have no corresponding
 * skill proficiency in any team, representing strategic capability gaps.
 */
const VisionGapsTable = ({ 
  loading = false, 
  visionGapsData = [], 
  error = null 
}) => {
  const { t } = useTranslation(['components', 'common']);
  const [selectedItems, setSelectedItems] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filteringText, setFilteringText] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState({ value: 'all' });
  const [selectedPhase, setSelectedPhase] = useState({ value: 'all' });
  const [selectedQuadrant, setSelectedQuadrant] = useState({ value: 'all' });
  
  // Column visibility preferences
  const [preferences, setPreferences] = useState({
    pageSize: 10,
    visibleContent: ['technology', 'quadrant', 'phase', 'expected_proficiency', 'gap_severity', 'strategic_impact', 'recommendation'],
    wrapLines: false,
    stripedRows: false,
    contentDensity: 'comfortable'
  });

  // Page size options
  const pageSizeOptions = [
    { label: t('components:visionGaps.ten'), value: 10 },
    { label: t('components:visionGaps.twentyFive'), value: 25 },
    { label: t('components:visionGaps.fifty'), value: 50 },
    { label: t('components:visionGaps.hundred'), value: 100 }
  ];

  // Filter options
  const severityOptions = [
    { label: t('components:visionGaps.allSeverities'), value: 'all' },
    { label: t('components:visionGaps.critical'), value: 'Critical' },
    { label: t('components:visionGaps.high'), value: 'High' },
    { label: t('components:visionGaps.medium'), value: 'Medium' },
    { label: t('components:visionGaps.low'), value: 'Low' }
  ];

  const phaseOptions = [
    { label: t('components:visionGaps.allPhases'), value: 'all' },
    { label: t('components:visionGaps.adopt'), value: 'Adopt' },
    { label: t('components:visionGaps.trial'), value: 'Trial' },
    { label: t('components:visionGaps.assess'), value: 'Assess' },
    { label: t('components:visionGaps.hold'), value: 'Hold' }
  ];

  const quadrantOptions = [
    { label: t('components:visionGaps.allQuadrants'), value: 'all' },
    { label: t('components:visionGaps.techniques'), value: 'Techniques' },
    { label: t('components:visionGaps.tools'), value: 'Tools' },
    { label: t('components:visionGaps.platforms'), value: 'Platforms' },
    { label: t('components:visionGaps.languagesFrameworks'), value: 'Languages & Frameworks' }
  ];

  // Get severity badge variant
  const getSeverityBadgeVariant = (severity) => {
    switch (severity) {
      case 'Critical': return 'red';
      case 'High': return 'orange';
      case 'Medium': return 'yellow';
      case 'Low': return 'blue';
      default: return 'grey';
    }
  };

  // Get phase badge variant
  const getPhaseBadgeVariant = (phase) => {
    switch (phase) {
      case 'Adopt': return 'green';
      case 'Trial': return 'blue';
      case 'Assess': return 'orange';
      case 'Hold': return 'red';
      default: return 'grey';
    }
  };

  // Get strategic impact indicator
  const getStrategicImpactIndicator = (impact) => {
    switch (impact) {
      case 'High Impact': return <StatusIndicator type="error">{t('components:visionGaps.highImpact')}</StatusIndicator>;
      case 'Medium Impact': return <StatusIndicator type="warning">{t('components:visionGaps.mediumImpact')}</StatusIndicator>;
      case 'Low Impact': return <StatusIndicator type="info">{t('components:visionGaps.lowImpact')}</StatusIndicator>;
      default: return <StatusIndicator type="stopped">{t('components:visionGaps.unknown')}</StatusIndicator>;
    }
  };

  // Filter and paginate data
  const filteredData = useMemo(() => {
    if (!visionGapsData) return [];
    
    return visionGapsData.filter(item => {
      const matchesText = !filteringText || 
        item.technology?.toLowerCase().includes(filteringText.toLowerCase()) ||
        item.recommendation?.toLowerCase().includes(filteringText.toLowerCase());
      
      const matchesSeverity = selectedSeverity.value === 'all' || 
        item.gap_severity === selectedSeverity.value;
      
      const matchesPhase = selectedPhase.value === 'all' || 
        item.phase === selectedPhase.value;
      
      const matchesQuadrant = selectedQuadrant.value === 'all' || 
        item.quadrant === selectedQuadrant.value;
      
      return matchesText && matchesSeverity && matchesPhase && matchesQuadrant;
    });
  }, [visionGapsData, filteringText, selectedSeverity, selectedPhase, selectedQuadrant]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPageIndex - 1) * preferences.pageSize;
    return filteredData.slice(startIndex, startIndex + preferences.pageSize);
  }, [filteredData, currentPageIndex, preferences.pageSize]);

  // Summary statistics
  const summaryStats = useMemo(() => {
    if (!visionGapsData || visionGapsData.length === 0) return null;
    
    const stats = {
      total: visionGapsData.length,
      critical: visionGapsData.filter(item => item.gap_severity === 'Critical').length,
      high: visionGapsData.filter(item => item.gap_severity === 'High').length,
      medium: visionGapsData.filter(item => item.gap_severity === 'Medium').length,
      low: visionGapsData.filter(item => item.gap_severity === 'Low').length
    };
    
    return stats;
  }, [visionGapsData]);

  // Table columns definition
  const columnDefinitions = [
    {
      id: 'technology',
      header: t('components:visionGaps.technology'),
      cell: item => <strong>{item.technology}</strong>,
      sortingField: 'technology',
      isRowHeader: true,
      width: 150
    },
    {
      id: 'quadrant',
      header: t('components:visionGaps.quadrant'),
      cell: item => item.quadrant || '-',
      sortingField: 'quadrant',
      width: 120
    },
    {
      id: 'phase',
      header: t('components:visionGaps.phase'),
      cell: item => (
        <Badge color={getPhaseBadgeVariant(item.phase)}>
          {item.phase}
        </Badge>
      ),
      sortingField: 'phase',
      width: 100
    },
    {
      id: 'expected_proficiency',
      header: t('components:visionGaps.expectedProficiency'),
      cell: item => (
        <Box textAlign="center">
          <strong>{item.expected_proficiency}</strong>
        </Box>
      ),
      sortingField: 'expected_proficiency',
      width: 120
    },
    {
      id: 'gap_severity',
      header: t('components:visionGaps.gapSeverity'),
      cell: item => (
        <Badge color={getSeverityBadgeVariant(item.gap_severity)}>
          {item.gap_severity}
        </Badge>
      ),
      sortingField: 'gap_severity',
      width: 110
    },
    {
      id: 'strategic_impact',
      header: t('components:visionGaps.strategicImpact'),
      cell: item => getStrategicImpactIndicator(item.strategic_impact),
      sortingField: 'strategic_impact',
      width: 130
    },
    {
      id: 'recommendation',
      header: t('components:visionGaps.recommendation'),
      cell: item => (
        <Box fontSize="body-s">
          {item.recommendation}
        </Box>
      ),
      sortingField: 'recommendation',
      width: 250
    }
  ];

  // Collection preferences configuration
  const collectionPreferencesProps = {
    title: t('common:preferences'),
    confirmLabel: t('common:confirm'),
    cancelLabel: t('common:cancel'),
    preferences,
    onConfirm: ({ detail }) => {
      setPreferences(detail);
      setCurrentPageIndex(1); // Reset to first page when changing preferences
    },
    pageSizePreference: {
      title: t('common:pageSize'),
      options: pageSizeOptions
    },
    wrapLinesPreference: {
      label: t('components:visionGaps.wrapLines'),
      description: t('components:visionGaps.wrapTextDescription')
    },
    stripedRowsPreference: {
      label: t('components:visionGaps.stripedRows'),
      description: t('components:visionGaps.stripedRowsDescription')
    },
    contentDensityPreference: {
      label: t('components:visionGaps.compactMode'),
      description: t('components:visionGaps.compactModeDescription')
    },
    visibleContentPreference: {
      title: t('common:selectVisibleColumns'),
      options: [
        {
          label: t('components:visionGaps.technology'),
          value: 'technology',
          editable: false // Always visible
        },
        {
          label: t('components:visionGaps.quadrant'),
          value: 'quadrant'
        },
        {
          label: t('components:visionGaps.phase'),
          value: 'phase'
        },
        {
          label: t('components:visionGaps.expectedProficiency'),
          value: 'expected_proficiency'
        },
        {
          label: t('components:visionGaps.gapSeverity'),
          value: 'gap_severity'
        },
        {
          label: t('components:visionGaps.strategicImpact'),
          value: 'strategic_impact'
        },
        {
          label: t('components:visionGaps.recommendation'),
          value: 'recommendation'
        }
      ]
    }
  };

  if (error) {
    return (
      <Container>
        <StatusIndicator type="error">
          {t('components:visionGaps.errorLoadingData', { error })}
        </StatusIndicator>
      </Container>
    );
  }

  return (
    <SpaceBetween size="l">
      {/* Summary Statistics */}
      {summaryStats && (
        <Container>
          <ColumnLayout columns={5} variant="text-grid">
            <div>
              <Box variant="awsui-key-label">{t('components:visionGaps.totalGaps')}</Box>
              <Box variant="awsui-value-large">{summaryStats.total}</Box>
            </div>
            <div>
              <Box variant="awsui-key-label">{t('components:visionGaps.critical')}</Box>
              <Box variant="awsui-value-large" color="text-status-error">
                {summaryStats.critical}
              </Box>
            </div>
            <div>
              <Box variant="awsui-key-label">{t('components:visionGaps.high')}</Box>
              <Box variant="awsui-value-large" color="text-status-warning">
                {summaryStats.high}
              </Box>
            </div>
            <div>
              <Box variant="awsui-key-label">{t('components:visionGaps.medium')}</Box>
              <Box variant="awsui-value-large" color="text-status-info">
                {summaryStats.medium}
              </Box>
            </div>
            <div>
              <Box variant="awsui-key-label">{t('components:visionGaps.low')}</Box>
              <Box variant="awsui-value-large">{summaryStats.low}</Box>
            </div>
          </ColumnLayout>
        </Container>
      )}

      {/* Filters */}
      <Container>
        <SpaceBetween size="l">
          <ColumnLayout columns={4}>
            <TextFilter
              filteringText={filteringText}
              filteringPlaceholder={t('components:visionGaps.searchPlaceholder')}
              onChange={({ detail }) => setFilteringText(detail.filteringText)}
            />
            <Select
              selectedOption={selectedSeverity}
              onChange={({ detail }) => setSelectedSeverity(detail.selectedOption)}
              options={severityOptions}
              placeholder={t('components:visionGaps.filterBySeverity')}
            />
            <Select
              selectedOption={selectedPhase}
              onChange={({ detail }) => setSelectedPhase(detail.selectedOption)}
              options={phaseOptions}
              placeholder={t('components:visionGaps.filterByPhase')}
            />
            <Select
              selectedOption={selectedQuadrant}
              onChange={({ detail }) => setSelectedQuadrant(detail.selectedOption)}
              options={quadrantOptions}
              placeholder={t('components:visionGaps.filterByQuadrant')}
            />
          </ColumnLayout>
        </SpaceBetween>
      </Container>

      {/* Table */}
      <Table
        columnDefinitions={columnDefinitions}
        columnDisplay={preferences.visibleContent.map(id => ({ id, visible: true }))}
        items={paginatedData}
        loading={loading}
        loadingText={t('components:visionGaps.loadingData')}
        selectedItems={selectedItems}
        onSelectionChange={({ detail }) => setSelectedItems(detail.selectedItems)}
        selectionType="multi"
        ariaLabels={{
          selectionGroupLabel: t('components:visionGaps.itemsSelection'),
          allItemsSelectionLabel: ({ selectedItems }) =>
            t('components:visionGaps.itemsSelected', { count: selectedItems.length }),
          itemSelectionLabel: ({ selectedItems }, item) => {
            const isItemSelected = selectedItems.filter(i => i.technology === item.technology).length;
            return t('components:visionGaps.itemSelectionLabel', { 
              technology: item.technology, 
              selected: isItemSelected ? t('common:selected') : t('common:notSelected') 
            });
          }
        }}
        wrapLines={preferences.wrapLines}
        stripedRows={preferences.stripedRows}
        contentDensity={preferences.contentDensity}
        empty={
          <Box textAlign="center" color="inherit">
            <b>{t('components:visionGaps.noVisionGapsFound')}</b>
            <Box
              padding={{ bottom: "s" }}
              variant="p"
              color="inherit"
            >
              {filteredData.length === 0 && visionGapsData.length > 0
                ? t('components:visionGaps.noGapsMatchFilter')
                : t('components:visionGaps.allTechnologiesHaveSkills')}
            </Box>
          </Box>
        }
        filter={
          <Header
            counter={`(${filteredData.length})`}
            description={t('components:visionGaps.tableDescription')}
          >
            {t('components:visionGaps.visionGaps')}
          </Header>
        }
        pagination={
          <Pagination
            currentPageIndex={currentPageIndex}
            onChange={({ detail }) => setCurrentPageIndex(detail.currentPageIndex)}
            pagesCount={Math.ceil(filteredData.length / preferences.pageSize)}
            ariaLabels={{
              nextPageLabel: t('common:nextPage'),
              previousPageLabel: t('common:previousPage'),
              pageLabel: pageNumber => t('common:pageLabel', { pageNumber })
            }}
          />
        }
        preferences={
          <CollectionPreferences {...collectionPreferencesProps} />
        }
      />
    </SpaceBetween>
  );
};

export default VisionGapsTable;
