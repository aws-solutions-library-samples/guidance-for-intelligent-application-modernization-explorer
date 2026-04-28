import React, { useState, useEffect } from 'react';
import {
  Box,
  SpaceBetween,
  Header,
  Table,
  Pagination,
  TextFilter,
  Button,
  ColumnLayout,
  StatusIndicator,
  Badge,
  Spinner,
  CollectionPreferences
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import { fetchSimilarityResults } from '../services/similaritiesResultsApi';

/**
 * Similarity Cluster Details Component
 * 
 * Displays detailed information about application pairs in a specific similarity cluster
 * 
 * @param {Object} props - Component props
 * @param {string} props.clusterId - ID of the selected cluster
 * @param {Function} props.onClose - Function to call when the close button is clicked
 */
const SimilarityClusterDetails = ({ clusterId, onClose }) => {
  const { t } = useTranslation(['common']);
  const [clusterDetails, setClusterDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [preferences, setPreferences] = useState({
    pageSize: 10,
    visibleContent: ['application1', 'application2', 'similarityScore', 'technologies']
  });

  // Column definitions for the table
  const columnDefinitions = [
    {
      id: 'application1',
      header: 'Application 1',
      cell: item => item.application1,
      sortingField: 'application1'
    },
    {
      id: 'application2',
      header: 'Application 2',
      cell: item => item.application2,
      sortingField: 'application2'
    },
    {
      id: 'similarityScore',
      header: 'Similarity Score',
      cell: item => (
        <StatusIndicator
          type={
            parseFloat(item.similarityScore) >= 75 ? 'success' :
            parseFloat(item.similarityScore) >= 50 ? 'info' : 
            parseFloat(item.similarityScore) >= 25 ? 'warning' : 'error'
          }
        >
          {item.similarityScore}%
        </StatusIndicator>
      ),
      sortingField: 'similarityScore'
    },
    {
      id: 'technologies',
      header: 'Common Technologies',
      cell: item => item.technologies.map((tech, index) => (
        <Badge key={index} color="blue">{tech}</Badge>
      ))
    }
  ];

  // Fetch cluster details when clusterId changes
  useEffect(() => {
    if (clusterId) {
      setLoading(true);
      fetchClusterDetails(clusterId)
        .then(data => {
          setClusterDetails(data);
          setLoading(false);
        })
        .catch(error => {
          console.error('Error fetching cluster details:', error);
          setLoading(false);
        });
    }
  }, [clusterId]);

  // Handle preferences change
  const handlePreferencesChange = ({ detail }) => {
    setPreferences(detail);
    if (detail.pageSize !== pageSize) {
      setPageSize(detail.pageSize);
      setCurrentPage(1); // Reset to first page when changing page size
    }
  };

  if (!clusterId || !clusterDetails) {
    return loading ? (
      <Box textAlign="center" padding="l">
        <Spinner size="large" />
        <Box variant="p" padding={{ top: "s" }}>
          {t('components:clusterDetails.loadingClusterDetails')}
        </Box>
      </Box>
    ) : null;
  }

  // Filter application pairs based on search text - only filter by Application 1
  const filteredPairs = clusterDetails.pairs.filter(pair => 
    pair.application1.toLowerCase().includes(filterText.toLowerCase())
  );

  // Paginate application pairs
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedPairs = filteredPairs.slice(startIndex, startIndex + pageSize);

  // Get visible columns based on preferences
  const visibleColumns = columnDefinitions.filter(column => 
    preferences.visibleContent.includes(column.id)
  );

  return (
    <Box padding="l">
      <SpaceBetween size="l">
        <Header
          variant="h2"
          actions={
            <Button onClick={onClose}>{t('components:buttons.close')}</Button>
          }
        >
          {t('components:clusterDetails.similarityCluster')} {clusterDetails.range}
        </Header>

        <ColumnLayout columns={2} variant="text-grid">
          <div>
            <Box variant="awsui-key-label">{t('components:clusterDetails.totalApplicationPairs')}</Box>
            <Box variant="awsui-value-large">{clusterDetails.totalPairs.toLocaleString()}</Box>
          </div>
          <div>
            <Box variant="awsui-key-label">{t('components:clusterDetails.similarityRange')}</Box>
            <Box variant="awsui-value-large">{clusterDetails.range}</Box>
          </div>
        </ColumnLayout>

        <Table
          columnDefinitions={visibleColumns}
          items={paginatedPairs}
          loading={loading}
          loadingText="Loading application pairs"
          empty={
            <Box textAlign="center" color="inherit">
              <b>{t('components:clusterDetails.noApplicationPairsFound')}</b>
              <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                {t('components:clusterDetails.noApplicationPairsMatch')}
              </Box>
            </Box>
          }
          header={
            <Header
              counter={`(${filteredPairs.length})`}
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <TextFilter
                    filteringText={filterText}
                    filteringPlaceholder="Filter by Application 1"
                    filteringAriaLabel="Filter by Application 1"
                    onChange={({ detail }) => {
                      setFilterText(detail.filteringText);
                      setCurrentPage(1);
                    }}
                  />
                </SpaceBetween>
              }
            >
              {t('components:clusterDetails.applicationPairsInThisSimilarityRange')}
            </Header>
          }
          pagination={
            <Pagination
              currentPageIndex={currentPage}
              pagesCount={Math.max(1, Math.ceil(filteredPairs.length / pageSize))}
              onChange={({ detail }) => setCurrentPage(detail.currentPageIndex)}
            />
          }
          preferences={
            <CollectionPreferences
              title={t('common:general.preferences')}
              confirmLabel={t('common:general.confirm')}
              cancelLabel={t('common:general.cancel')}
              preferences={preferences}
              onConfirm={handlePreferencesChange}
              pageSizePreference={{
                title: "Page size",
                options: [
                  { value: 10, label: "10 pairs" },
                  { value: 20, label: "20 pairs" },
                  { value: 50, label: "50 pairs" },
                  { value: 100, label: "100 pairs" }
                ]
              }}
              visibleContentPreference={{
                title: "Select visible columns",
                options: [
                  {
                    label: "Application pair details",
                    options: [
                      { id: "application1", label: "Application 1" },
                      { id: "application2", label: "Application 2" },
                      { id: "similarityScore", label: "Similarity Score" },
                      { id: "technologies", label: "Common Technologies" }
                    ]
                  }
                ]
              }}
            />
          }
        />
      </SpaceBetween>
    </Box>
  );
};

export default SimilarityClusterDetails;
