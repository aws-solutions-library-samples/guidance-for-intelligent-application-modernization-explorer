import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, SpaceBetween, Link, Header } from '@cloudscape-design/components';

/**
 * Information content for the Utilization Analysis page
 */
function UtilizationAnalysisInfoContent() {
  const { t } = useTranslation('info');

  return (
    <Box>
      <SpaceBetween size="l">
        <div>
          <Header variant="h2">{t('utilizationAnalysis.title')}</Header>
          <Box variant="p">
            {t('utilizationAnalysis.description')}
          </Box>
        </div>
        
        <div>
          <Header variant="h3">{t('utilizationAnalysis.keyInsights')}</Header>
          <ul>
            <li>
              <strong>{t('utilizationAnalysis.utilizationTrends')}:</strong> {t('utilizationAnalysis.utilizationTrendsDescription')}
            </li>
            <li>
              <strong>{t('utilizationAnalysis.resourceOptimization')}:</strong> {t('utilizationAnalysis.resourceOptimizationDescription')}
            </li>
            <li>
              <strong>{t('utilizationAnalysis.capacityPlanning')}:</strong> {t('utilizationAnalysis.capacityPlanningDescription')}
            </li>
            <li>
              <strong>{t('utilizationAnalysis.performanceAnalysis')}:</strong> {t('utilizationAnalysis.performanceAnalysisDescription')}
            </li>
          </ul>
        </div>
        
        <div>
          <Header variant="h3">{t('utilizationAnalysis.usingThisPage')}</Header>
          <ul>
            <li>
              <strong>{t('utilizationAnalysis.metricSelection')}:</strong> {t('utilizationAnalysis.metricSelectionDescription')}
            </li>
            <li>
              <strong>{t('utilizationAnalysis.timePeriod')}:</strong> {t('utilizationAnalysis.timePeriodDescription')}
            </li>
            <li>
              <strong>{t('utilizationAnalysis.applicationSelection')}:</strong> {t('utilizationAnalysis.applicationSelectionDescription')}
            </li>
            <li>
              <strong>{t('utilizationAnalysis.interactiveCharts')}:</strong> {t('utilizationAnalysis.interactiveChartsDescription')}
            </li>
          </ul>
        </div>
      </SpaceBetween>
    </Box>
  );
}

export default UtilizationAnalysisInfoContent;
