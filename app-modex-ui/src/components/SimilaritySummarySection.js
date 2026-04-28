import React from 'react';
import {
  Box,
  ColumnLayout,
  Container,
  Header,
  SpaceBetween,
  StatusIndicator
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

/**
 * Similarity Summary Section Component
 * 
 * Displays summary metrics about application similarity clusters
 * 
 * @param {Object} props - Component props
 * @param {Array} props.clusterData - Array of cluster data objects
 */
const SimilaritySummarySection = ({ clusterData }) => {
  const { t } = useTranslation(['components', 'common']);
  if (!clusterData || clusterData.length === 0) {
    return null;
  }

  // Calculate summary metrics
  const totalPairs = clusterData.reduce((sum, cluster) => sum + cluster.count, 0);
  
  // Find largest cluster
  const largestCluster = clusterData.reduce(
    (largest, current) => current.count > largest.count ? current : largest,
    clusterData[0]
  );
  
  // Count clusters with less than 100K pairs
  const smallClustersCount = clusterData.filter(cluster => cluster.count < 100000).length;
  
  // Count clusters with more than 500K pairs
  const largeClustersCount = clusterData.filter(cluster => cluster.count > 500000).length;
  
  // Calculate average similarity (weighted by count)
  const weightedSimilaritySum = clusterData.reduce((sum, cluster) => {
    const midpoint = (cluster.lowerBound + cluster.upperBound) / 2;
    return sum + (midpoint * cluster.count);
  }, 0);
  const averageSimilarity = (weightedSimilaritySum / totalPairs).toFixed(2);
  
  // Estimate number of applications (assuming each app is compared with every other app)
  // Using the formula: n(n-1)/2 = totalPairs, solving for n
  const estimatedApps = Math.round(
    (1 + Math.sqrt(1 + 8 * totalPairs)) / 2
  );

  return (
    <Container>
      <SpaceBetween size="l">
        <Header variant="h2">
          {t('components:similaritySummary.summaryMetrics')}
        </Header>
        
        <ColumnLayout columns={3} variant="text-grid">
          <div>
            <Box variant="awsui-key-label">{t('components:similaritySummary.totalApplicationPairs')}</Box>
            <Box variant="awsui-value-large">{totalPairs.toLocaleString()}</Box>
          </div>
          <div>
            <Box variant="awsui-key-label">{t('components:similaritySummary.estimatedApplications')}</Box>
            <Box variant="awsui-value-large">{estimatedApps.toLocaleString()}</Box>
          </div>
          <div>
            <Box variant="awsui-key-label">{t('components:similaritySummary.averageSimilarity')}</Box>
            <Box variant="awsui-value-large">
              <StatusIndicator
                type={
                  parseFloat(averageSimilarity) >= 75 ? 'success' :
                  parseFloat(averageSimilarity) >= 50 ? 'info' : 
                  parseFloat(averageSimilarity) >= 25 ? 'warning' : 'error'
                }
              >
                {averageSimilarity}%
              </StatusIndicator>
            </Box>
          </div>
        </ColumnLayout>
        
        <ColumnLayout columns={3} variant="text-grid">
          <div>
            <Box variant="awsui-key-label">{t('components:similaritySummary.largestCluster')}</Box>
            <Box variant="awsui-value-large">
              {largestCluster.range} ({largestCluster.count.toLocaleString()} {t('components:similaritySummary.pairs')})
            </Box>
          </div>
          <div>
            <Box variant="awsui-key-label">{t('components:similaritySummary.smallClusters')}</Box>
            <Box variant="awsui-value-large">{smallClustersCount} {t('components:similaritySummary.clusters')}</Box>
          </div>
          <div>
            <Box variant="awsui-key-label">{t('components:similaritySummary.largeClusters')}</Box>
            <Box variant="awsui-value-large">{largeClustersCount} {t('components:similaritySummary.clusters')}</Box>
          </div>
        </ColumnLayout>
        
        <Box variant="p">
          {t('components:similaritySummary.summaryDescription')}
        </Box>
      </SpaceBetween>
    </Container>
  );
};

export default SimilaritySummarySection;
