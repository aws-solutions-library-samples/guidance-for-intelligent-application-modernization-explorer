import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, SpaceBetween, Link, Header } from '@cloudscape-design/components';

/**
 * Information content for the Infrastructure Analysis page
 */
function InfrastructureAnalysisInfoContent() {
  const { t } = useTranslation('info');

  return (
    <Box>
      <SpaceBetween size="l">
        <div>
          <Header variant="h2">{t('infrastructureAnalysis.title')}</Header>
          <Box variant="p">
            {t('infrastructureAnalysis.description')}
          </Box>
        </div>
        
        <div>
          <Header variant="h3">{t('infrastructureAnalysis.keyInsights')}</Header>
          <ul>
            <li>
              <strong>{t('infrastructureAnalysis.resourceDistribution')}:</strong> {t('infrastructureAnalysis.resourceDistributionDescription')}
            </li>
            <li>
              <strong>{t('infrastructureAnalysis.environmentAnalysis')}:</strong> {t('infrastructureAnalysis.environmentAnalysisDescription')}
            </li>
            <li>
              <strong>{t('infrastructureAnalysis.regionalDistribution')}:</strong> {t('infrastructureAnalysis.regionalDistributionDescription')}
            </li>
          </ul>
        </div>
        
        <div>
          <Header variant="h3">{t('infrastructureAnalysis.usingThisPage')}</Header>
          <ul>
            <li>
              <strong>{t('infrastructureAnalysis.filters')}:</strong> {t('infrastructureAnalysis.filtersDescription')}
            </li>
            <li>
              <strong>{t('infrastructureAnalysis.interactiveCharts')}:</strong> {t('infrastructureAnalysis.interactiveChartsDescription')}
            </li>
            <li>
              <strong>{t('infrastructureAnalysis.summaryMetrics')}:</strong> {t('infrastructureAnalysis.summaryMetricsDescription')}
            </li>
          </ul>
        </div>
      </SpaceBetween>
    </Box>
  );
}

export default InfrastructureAnalysisInfoContent;
