import React from 'react';
import {
  Box,
  SpaceBetween,
  Header
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

/**
 * Info content for the Component Similarities page
 */
const ComponentSimilaritiesInfoContent = () => {
  const { t } = useTranslation(['info', 'common']);
  return (
    <SpaceBetween size="l">
      <Header variant="h2">
        {t('info:componentSimilarities.title')}
      </Header>

      <Box variant="p">
        {t('info:componentSimilarities.description')}
      </Box>

      <Header variant="h3">
        {t('info:componentSimilarities.analysisFeatures')}
      </Header>

      <ul>
        <li><strong>{t('info:componentSimilarities.similarityMatrix')}:</strong> {t('info:componentSimilarities.similarityMatrixDescription')}</li>
        <li><strong>{t('info:componentSimilarities.componentClusters')}:</strong> {t('info:componentSimilarities.componentClustersDescription')}</li>
        <li><strong>{t('info:componentSimilarities.repeatedPatterns')}:</strong> {t('info:componentSimilarities.repeatedPatternsDescription')}</li>
        <li><strong>{t('info:componentSimilarities.configurableScoring')}:</strong> {t('info:componentSimilarities.configurableScoringDescription')}</li>
      </ul>

      <Header variant="h3">
        {t('info:componentSimilarities.similarityScoring')}
      </Header>

      <Box variant="p">
        {t('info:componentSimilarities.scoringDescription')}
      </Box>

      <ul>
        <li><strong>{t('info:componentSimilarities.runtimeMatch')}:</strong> {t('info:componentSimilarities.runtimeMatchDescription')}</li>
        <li><strong>{t('info:componentSimilarities.frameworkMatch')}:</strong> {t('info:componentSimilarities.frameworkMatchDescription')}</li>
        <li><strong>{t('info:componentSimilarities.databaseOverlap')}:</strong> {t('info:componentSimilarities.databaseOverlapDescription')}</li>
        <li><strong>{t('info:componentSimilarities.integrationOverlap')}:</strong> {t('info:componentSimilarities.integrationOverlapDescription')}</li>
        <li><strong>{t('info:componentSimilarities.storageOverlap')}:</strong> {t('info:componentSimilarities.storageOverlapDescription')}</li>
      </ul>

      <Header variant="h3">
        {t('info:componentSimilarities.quickWinsIdentification')}
      </Header>

      <Box variant="p">
        {t('info:componentSimilarities.quickWinsDescription')}
      </Box>

      <ul>
        <li>{t('info:componentSimilarities.quickWin1')}</li>
        <li>{t('info:componentSimilarities.quickWin2')}</li>
        <li>{t('info:componentSimilarities.quickWin3')}</li>
        <li>{t('info:componentSimilarities.quickWin4')}</li>
        <li>{t('info:componentSimilarities.quickWin5')}</li>
      </ul>
    </SpaceBetween>
  );
};

export default ComponentSimilaritiesInfoContent;
