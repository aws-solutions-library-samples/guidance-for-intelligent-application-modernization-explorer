import React, { useState } from 'react';
import {
  Container,
  Header,
  Box,
  SpaceBetween,
  Alert,
  Cards,
  Badge,
  ExpandableSection,
  ColumnLayout,
  Button,
  Modal,
  Table
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

/**
 * Component Clusters Visualization
 * 
 * Displays groups of components with similar technology stacks
 */
const ComponentClusters = ({ data, loading }) => {
  const { t } = useTranslation(['components', 'common']);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [showClusterModal, setShowClusterModal] = useState(false);

  const handleClusterClick = (cluster) => {
    setSelectedCluster(cluster);
    setShowClusterModal(true);
  };

  const formatTechList = (techList) => {
    if (!techList || techList.length === 0) {
      return <span style={{ color: '#8a8a8a', fontStyle: 'italic' }}>{t('common:none')}</span>;
    }
    return techList.join(', ');
  };

  const getClusterColor = (index) => {
    const colors = ['blue', 'green', 'red', 'grey', 'orange'];
    return colors[index % colors.length];
  };

  if (loading) {
    return (
      <Container>
        <Box textAlign="center" padding="xl">
          {t('components:componentClusters.loadingClusters')}
        </Box>
      </Container>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Container>
        <Alert type="info">
          {t('components:componentClusters.noClustersFound')}
        </Alert>
      </Container>
    );
  }

  const clusterTableColumns = [
    {
      id: 'componentName',
      header: t('components:componentClusters.componentName'),
      cell: item => item.componentName
    },
    {
      id: 'applicationName',
      header: t('components:componentClusters.application'),
      cell: item => item.applicationName
    },
    {
      id: 'runtime',
      header: t('components:componentClusters.runtime'),
      cell: item => item.runtime
    },
    {
      id: 'framework',
      header: t('components:componentClusters.framework'),
      cell: item => item.framework
    },
    {
      id: 'databases',
      header: t('components:componentClusters.databases'),
      cell: item => formatTechList(item.databases)
    }
  ];

  return (
    <Container
      header={
        <Header
          variant="h3"
          description={t('components:componentClusters.foundClustersDescription', { count: data.length })}
        >
          {t('components:componentClusters.componentClustersTitle', { count: data.length })}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Box variant="p">
          {t('components:componentClusters.clustersDescription')}
        </Box>

        <Cards
          cardDefinition={{
            header: item => (
              <SpaceBetween direction="horizontal" size="s">
                <Header variant="h4">{item.name}</Header>
                <Badge color={getClusterColor(data.indexOf(item))}>
                  {t('components:componentClusters.componentsCount', { count: item.components.length })}
                </Badge>
                <Badge color="grey">
                  {t('components:componentClusters.avgSimilarity', { similarity: (item.avgSimilarity * 100).toFixed(1) })}
                </Badge>
              </SpaceBetween>
            ),
            sections: [
              {
                id: "commonTech",
                header: t('components:componentClusters.commonTechnologies'),
                content: item => (
                  <ColumnLayout columns={2} variant="text-grid">
                    <div>
                      <Box variant="awsui-key-label">{t('components:componentClusters.runtime')}</Box>
                      <div>{item.commonTechnologies.runtime || t('components:componentClusters.mixed')}</div>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{t('components:componentClusters.framework')}</Box>
                      <div>{item.commonTechnologies.framework || t('components:componentClusters.mixed')}</div>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{t('components:componentClusters.databases')}</Box>
                      <div>{formatTechList(item.commonTechnologies.databases)}</div>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{t('components:componentClusters.integrations')}</Box>
                      <div>{formatTechList(item.commonTechnologies.integrations)}</div>
                    </div>
                  </ColumnLayout>
                )
              },
              {
                id: "components",
                header: t('components:componentClusters.componentsInCluster'),
                content: item => (
                  <ExpandableSection headerText={t('components:componentClusters.viewComponents', { count: item.components.length })}>
                    <SpaceBetween size="xs">
                      {item.components.map((component, index) => (
                        <Box key={index} variant="p">
                          <strong>{component.componentName}</strong> ({component.applicationName})
                        </Box>
                      ))}
                    </SpaceBetween>
                  </ExpandableSection>
                )
              }
            ]
          }}
          cardsPerRow={[
            { cards: 1 },
            { minWidth: 500, cards: 2 }
          ]}
          items={data}
          loadingText={t('components:componentClusters.loadingClusters')}
          empty={
            <Box textAlign="center" color="inherit">
              <b>{t('components:componentClusters.noClustersFoundTitle')}</b>
              <Box variant="p" color="inherit">
                {t('components:componentClusters.noClustersFoundDescription')}
              </Box>
            </Box>
          }
          header={
            <Header
              actions={
                <Button
                  variant="primary"
                  onClick={() => {
                    // Export clusters data
                    const exportData = data.map(cluster => ({
                      clusterName: cluster.name,
                      componentCount: cluster.components.length,
                      avgSimilarity: cluster.avgSimilarity,
                      commonRuntime: cluster.commonTechnologies.runtime,
                      commonFramework: cluster.commonTechnologies.framework,
                      commonDatabases: cluster.commonTechnologies.databases.join(', '),
                      components: cluster.components.map(c => `${c.componentName} (${c.applicationName})`).join('; ')
                    }));
                    
                    const csv = [
                      Object.keys(exportData[0]).join(','),
                      ...exportData.map(row => Object.values(row).join(','))
                    ].join('\n');
                    
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'component-clusters.csv';
                    a.click();
                    window.URL.revokeObjectURL(url);
                  }}
                >
                  {t('components:componentClusters.exportClusters')}
                </Button>
              }
            >
              {t('components:componentClusters.componentClustersHeader')}
            </Header>
          }
        />

        {/* Cluster Detail Modal */}
        <Modal
          visible={showClusterModal}
          onDismiss={() => setShowClusterModal(false)}
          header={selectedCluster?.name || t('components:componentClusters.clusterDetails')}
          size="large"
        >
          {selectedCluster && (
            <SpaceBetween size="l">
              <ColumnLayout columns={3} variant="text-grid">
                <div>
                  <Box variant="awsui-key-label">{t('components:componentClusters.components')}</Box>
                  <Badge color="blue">{selectedCluster.components.length}</Badge>
                </div>
                <div>
                  <Box variant="awsui-key-label">{t('components:componentClusters.avgSimilarityLabel')}</Box>
                  <Badge color="green">{(selectedCluster.avgSimilarity * 100).toFixed(1)}%</Badge>
                </div>
                <div>
                  <Box variant="awsui-key-label">{t('components:componentClusters.applications')}</Box>
                  <Badge color="grey">
                    {new Set(selectedCluster.components.map(c => c.applicationName)).size}
                  </Badge>
                </div>
              </ColumnLayout>

              <Container header={<Header variant="h4">{t('components:componentClusters.commonTechnologies')}</Header>}>
                <ColumnLayout columns={2} variant="text-grid">
                  <div>
                    <Box variant="awsui-key-label">{t('components:componentClusters.runtime')}</Box>
                    <div>{selectedCluster.commonTechnologies.runtime || t('components:componentClusters.mixedRuntimes')}</div>
                  </div>
                  <div>
                    <Box variant="awsui-key-label">{t('components:componentClusters.framework')}</Box>
                    <div>{selectedCluster.commonTechnologies.framework || t('components:componentClusters.mixedFrameworks')}</div>
                  </div>
                  <div>
                    <Box variant="awsui-key-label">{t('components:componentClusters.databases')}</Box>
                    <div>{formatTechList(selectedCluster.commonTechnologies.databases)}</div>
                  </div>
                  <div>
                    <Box variant="awsui-key-label">{t('components:componentClusters.integrations')}</Box>
                    <div>{formatTechList(selectedCluster.commonTechnologies.integrations)}</div>
                  </div>
                  <div>
                    <Box variant="awsui-key-label">{t('components:componentClusters.storage')}</Box>
                    <div>{formatTechList(selectedCluster.commonTechnologies.storages)}</div>
                  </div>
                </ColumnLayout>
              </Container>

              <Table
                columnDefinitions={clusterTableColumns}
                items={selectedCluster.components}
                loadingText={t('components:componentClusters.loadingComponents')}
                empty={
                  <Box textAlign="center" color="inherit">
                    {t('components:componentClusters.noComponentsInCluster')}
                  </Box>
                }
                header={<Header variant="h4">{t('components:componentClusters.componentsInCluster')}</Header>}
              />
            </SpaceBetween>
          )}
        </Modal>
      </SpaceBetween>
    </Container>
  );
};

export default ComponentClusters;
