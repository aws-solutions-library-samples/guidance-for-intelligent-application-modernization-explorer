import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Container,
  Header,
  Box,
  SpaceBetween,
  Alert,
  Table,
  Badge,
  Button,
  Modal,
  ExpandableSection,
  ColumnLayout,
  Pagination,
  CollectionPreferences
} from '@cloudscape-design/components';

/**
 * Repeated Patterns Table Component
 * 
 * Displays technology patterns that appear multiple times across components,
 * helping identify quick wins and standardization opportunities
 */
const RepeatedPatternsTable = ({ data, loading }) => {
  const { t } = useTranslation(['components', 'common']);
  const [selectedPattern, setSelectedPattern] = useState(null);
  const [showPatternModal, setShowPatternModal] = useState(false);
  
  // Pagination state
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  // Preferences state
  const [preferences, setPreferences] = useState({
    pageSize: 10,
    visibleContent: ['patternName', 'frequency', 'runtime', 'framework', 'databases', 'integrations', 'storages', 'applications']
  });

  const formatTechList = (techList) => {
    if (!techList || techList.length === 0) {
      return <Box color="text-body-secondary" fontStyle="italic">{t('common.none')}</Box>;
    }
    return techList.join(', ');
  };

  // All available columns
  const allColumnDefinitions = [
    {
      id: 'patternName',
      header: t('components:repeatedPatterns.pattern'),
      cell: item => (
        <Button
          variant="link"
          onClick={() => {
            setSelectedPattern(item);
            setShowPatternModal(true);
          }}
        >
          {item.patternName}
        </Button>
      ),
      sortingField: 'patternName'
    },
    {
      id: 'frequency',
      header: t('components:repeatedPatterns.frequency'),
      cell: item => (
        <Box fontWeight="bold">
          {t('components:repeatedPatterns.componentsCount', { count: item.frequency })}
        </Box>
      ),
      sortingField: 'frequency'
    },
    {
      id: 'runtime',
      header: t('components:repeatedPatterns.runtime'),
      cell: item => item.pattern.runtime || t('common.notSpecified'),
      sortingField: 'runtime'
    },
    {
      id: 'framework',
      header: t('components:repeatedPatterns.framework'),
      cell: item => item.pattern.framework || t('common.notSpecified'),
      sortingField: 'framework'
    },
    {
      id: 'databases',
      header: t('components:repeatedPatterns.databases'),
      cell: item => formatTechList(item.pattern.databases),
      sortingField: 'databases'
    },
    {
      id: 'integrations',
      header: t('components:repeatedPatterns.integrations'),
      cell: item => formatTechList(item.pattern.integrations),
      sortingField: 'integrations'
    },
    {
      id: 'storages',
      header: t('components:repeatedPatterns.storage'),
      cell: item => formatTechList(item.pattern.storages),
      sortingField: 'storages'
    },
    {
      id: 'applications',
      header: t('components:repeatedPatterns.applications'),
      cell: item => {
        const uniqueApps = new Set(item.components.map(c => c.applicationName));
        return (
          <Badge color="grey">
            {t('components:repeatedPatterns.appsCount', { count: uniqueApps.size })}
          </Badge>
        );
      }
    }
  ];

  // Filter columns based on preferences
  const columnDefinitions = allColumnDefinitions.filter(col => 
    preferences.visibleContent.includes(col.id)
  );

  // Pagination logic
  const startIndex = (currentPageIndex - 1) * preferences.pageSize;
  const endIndex = startIndex + preferences.pageSize;
  const paginatedData = data ? data.slice(startIndex, endIndex) : [];

  // Collection preferences configuration
  const collectionPreferencesProps = {
    title: t('components:repeatedPatterns.preferences'),
    confirmLabel: t('common.confirm'),
    cancelLabel: t('common.cancel'),
    preferences: preferences,
    onConfirm: ({ detail }) => {
      setPreferences(detail);
      setCurrentPageIndex(1); // Reset to first page when changing preferences
    },
    pageSizePreference: {
      title: t('components:repeatedPatterns.pageSize'),
      options: [
        { value: 10, label: t('components:repeatedPatterns.patternsCount', { count: 10 }) },
        { value: 20, label: t('components:repeatedPatterns.patternsCount', { count: 20 }) },
        { value: 50, label: t('components:repeatedPatterns.patternsCount', { count: 50 }) },
        { value: 100, label: t('components:repeatedPatterns.patternsCount', { count: 100 }) }
      ]
    },
    visibleContentPreference: {
      title: t('components:repeatedPatterns.selectVisibleColumns'),
      options: [
        {
          label: t('components:repeatedPatterns.patternProperties'),
          options: [
            { id: 'patternName', label: t('components:repeatedPatterns.patternName'), editable: false },
            { id: 'frequency', label: t('components:repeatedPatterns.frequency'), editable: false },
            { id: 'runtime', label: t('components:repeatedPatterns.runtime') },
            { id: 'framework', label: t('components:repeatedPatterns.framework') },
            { id: 'databases', label: t('components:repeatedPatterns.databases') },
            { id: 'integrations', label: t('components:repeatedPatterns.integrations') },
            { id: 'storages', label: t('components:repeatedPatterns.storage') },
            { id: 'applications', label: t('components:repeatedPatterns.applications') }
          ]
        }
      ]
    }
  };

  const componentTableColumns = [
    {
      id: 'componentName',
      header: t('components:repeatedPatterns.componentName'),
      cell: item => item.componentName
    },
    {
      id: 'applicationName',
      header: t('components:repeatedPatterns.application'),
      cell: item => item.applicationName
    }
  ];

  if (loading) {
    return (
      <Container>
        <Box textAlign="center" padding="xl">
          {t('components:repeatedPatterns.loadingPatterns')}
        </Box>
      </Container>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Container>
        <Alert type="info">
          {t('components:repeatedPatterns.noPatternsFound')}
        </Alert>
      </Container>
    );
  }

  return (
    <Container
      header={
        <Header
          variant="h3"
          description={t('components:repeatedPatterns.foundPatternsDescription', { count: data.length })}
          actions={
            <Button
              variant="primary"
              onClick={() => {
                // Export patterns data
                const exportData = data.map(pattern => ({
                  patternName: pattern.patternName,
                  frequency: pattern.frequency,
                  runtime: pattern.pattern.runtime || '',
                  framework: pattern.pattern.framework || '',
                  databases: pattern.pattern.databases.join('; '),
                  integrations: pattern.pattern.integrations.join('; '),
                  storages: pattern.pattern.storages.join('; '),
                  applications: [...new Set(pattern.components.map(c => c.applicationName))].join('; '),
                  components: pattern.components.map(c => `${c.componentName} (${c.applicationName})`).join('; ')
                }));
                
                const csv = [
                  Object.keys(exportData[0]).join(','),
                  ...exportData.map(row => Object.values(row).map(val => `"${val}"`).join(','))
                ].join('\n');
                
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'repeated-patterns.csv';
                a.click();
                window.URL.revokeObjectURL(url);
              }}
            >
              {t('components:repeatedPatterns.exportPatterns')}
            </Button>
          }
        >
          {t('components:repeatedPatterns.title', { count: data.length })}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Box variant="p">
          {t('components:repeatedPatterns.description')}
        </Box>

        <Alert type="success" header={t('components:repeatedPatterns.quickWinOpportunities')}>
          {t('components:repeatedPatterns.quickWinDescription')}
          <ul>
            <li>{t('components:repeatedPatterns.quickWin1')}</li>
            <li>{t('components:repeatedPatterns.quickWin2')}</li>
            <li>{t('components:repeatedPatterns.quickWin3')}</li>
            <li>{t('components:repeatedPatterns.quickWin4')}</li>
          </ul>
        </Alert>

        <Table
          columnDefinitions={columnDefinitions}
          items={paginatedData}
          loadingText={t('components:repeatedPatterns.loadingPatterns')}
          sortingDisabled={false}
          empty={
            <Box textAlign="center" color="inherit">
              <b>{t('components:repeatedPatterns.noRepeatedPatternsFound')}</b>
              <Box variant="p" color="inherit">
                {t('components:repeatedPatterns.uniqueTechStackMessage')}
              </Box>
            </Box>
          }
          header={
            <Header
              counter={`(${data?.length || 0})`}
              description={t('components:repeatedPatterns.tableDescription')}
            >
              {t('components:repeatedPatterns.repeatedPatterns')}
            </Header>
          }
          preferences={<CollectionPreferences {...collectionPreferencesProps} />}
          pagination={
            <Pagination
              currentPageIndex={currentPageIndex}
              pagesCount={Math.ceil((data?.length || 0) / preferences.pageSize)}
              onChange={({ detail }) => setCurrentPageIndex(detail.currentPageIndex)}
            />
          }
        />

        {/* Pattern Detail Modal */}
        <Modal
          visible={showPatternModal}
          onDismiss={() => setShowPatternModal(false)}
          header={selectedPattern?.patternName || t('components:repeatedPatterns.patternDetails')}
          size="large"
        >
          {selectedPattern && (
            <SpaceBetween size="l">
              <ColumnLayout columns={3} variant="text-grid">
                <div>
                  <Box variant="awsui-key-label">{t('components:repeatedPatterns.frequency')}</Box>
                  <Box fontWeight="bold" fontSize="heading-m">
                    {t('components:repeatedPatterns.componentsCount', { count: selectedPattern.frequency })}
                  </Box>
                </div>
                <div>
                  <Box variant="awsui-key-label">{t('components:repeatedPatterns.applications')}</Box>
                  <Badge color="grey">
                    {t('components:repeatedPatterns.applicationsCount', { count: new Set(selectedPattern.components.map(c => c.applicationName)).size })}
                  </Badge>
                </div>
                <div>
                  <Box variant="awsui-key-label">{t('components:repeatedPatterns.patternId')}</Box>
                  <Badge color="blue">{selectedPattern.id}</Badge>
                </div>
              </ColumnLayout>

              <Container header={<Header variant="h4">{t('components:repeatedPatterns.technologyStackPattern')}</Header>}>
                <ColumnLayout columns={2} variant="text-grid">
                  <div>
                    <Box variant="awsui-key-label">{t('components:repeatedPatterns.runtime')}</Box>
                    <div>{selectedPattern.pattern.runtime || t('common.notSpecified')}</div>
                  </div>
                  <div>
                    <Box variant="awsui-key-label">{t('components:repeatedPatterns.framework')}</Box>
                    <div>{selectedPattern.pattern.framework || t('common.notSpecified')}</div>
                  </div>
                  <div>
                    <Box variant="awsui-key-label">{t('components:repeatedPatterns.databases')}</Box>
                    <div>{formatTechList(selectedPattern.pattern.databases)}</div>
                  </div>
                  <div>
                    <Box variant="awsui-key-label">{t('components:repeatedPatterns.integrations')}</Box>
                    <div>{formatTechList(selectedPattern.pattern.integrations)}</div>
                  </div>
                  <div>
                    <Box variant="awsui-key-label">{t('components:repeatedPatterns.storage')}</Box>
                    <div>{formatTechList(selectedPattern.pattern.storages)}</div>
                  </div>
                </ColumnLayout>
              </Container>

              <Container header={<Header variant="h4">{t('components:repeatedPatterns.modernizationRecommendations')}</Header>}>
                <SpaceBetween size="s">
                  <Alert type="success" header={t('components:repeatedPatterns.quickWinOpportunity')}>
                    {t('components:repeatedPatterns.quickWinOpportunityDescription', { 
                      frequency: selectedPattern.frequency,
                      applications: new Set(selectedPattern.components.map(c => c.applicationName)).size 
                    })}
                  </Alert>
                  
                  <ExpandableSection headerText={t('components:repeatedPatterns.recommendedActions')}>
                    <ul>
                      <li>{t('components:repeatedPatterns.recommendation1')}</li>
                      <li>{t('components:repeatedPatterns.recommendation2')}</li>
                      <li>{t('components:repeatedPatterns.recommendation3')}</li>
                      <li>{t('components:repeatedPatterns.recommendation4')}</li>
                      <li>{t('components:repeatedPatterns.recommendation5')}</li>
                    </ul>
                  </ExpandableSection>
                </SpaceBetween>
              </Container>

              <Table
                columnDefinitions={componentTableColumns}
                items={selectedPattern.components}
                loadingText={t('components:repeatedPatterns.loadingComponents')}
                empty={
                  <Box textAlign="center" color="inherit">
                    {t('components:repeatedPatterns.noComponentsFound')}
                  </Box>
                }
                header={
                  <Header 
                    variant="h4"
                    counter={`(${selectedPattern.components.length})`}
                  >
                    {t('components:repeatedPatterns.componentsUsingPattern')}
                  </Header>
                }
              />
            </SpaceBetween>
          )}
        </Modal>
      </SpaceBetween>
    </Container>
  );
};

export default RepeatedPatternsTable;
