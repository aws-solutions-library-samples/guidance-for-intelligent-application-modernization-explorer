import React from 'react';
import {
  Box,
  SpaceBetween,
  Header
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

/**
 * Information panel content for the Tech Stack Analysis page
 */
const TechStackAnalysisInfoContent = () => {
  const { t } = useTranslation(['info', 'common']);

  return (
    <SpaceBetween size="l">
      <Header variant="h2">
        {t('techStackAnalysis.title')}
      </Header>
      
      <Box variant="p">
        {t('techStackAnalysis.description')}
      </Box>
      
      <SpaceBetween size="m">
        <Header variant="h3">
          {t('techStackAnalysis.componentsPerApplication')}
        </Header>
        <Box variant="p">
          {t('techStackAnalysis.componentsPerApplicationDescription')}
        </Box>
      </SpaceBetween>
      
      <SpaceBetween size="m">
        <Header variant="h3">
          {t('techStackAnalysis.runtimeDistribution')}
        </Header>
        <Box variant="p">
          {t('techStackAnalysis.runtimeDistributionDescription')}
        </Box>
      </SpaceBetween>
      
      <SpaceBetween size="m">
        <Header variant="h3">
          {t('techStackAnalysis.databaseDistribution')}
        </Header>
        <Box variant="p">
          {t('techStackAnalysis.databaseDistributionDescription')}
        </Box>
      </SpaceBetween>
      
      <SpaceBetween size="m">
        <Header variant="h3">
          {t('techStackAnalysis.integrationDistribution')}
        </Header>
        <Box variant="p">
          {t('techStackAnalysis.integrationDistributionDescription')}
        </Box>
      </SpaceBetween>
      
      <SpaceBetween size="m">
        <Header variant="h3">
          {t('techStackAnalysis.storageDistribution')}
        </Header>
        <Box variant="p">
          {t('techStackAnalysis.storageDistributionDescription')}
        </Box>
      </SpaceBetween>
      
      <SpaceBetween size="m">
        <Header variant="h3">
          {t('techStackAnalysis.recommendedActions')}
        </Header>
        <Box variant="p">
          <ul>
            <li>{t('techStackAnalysis.recommendedAction1')}</li>
            <li>{t('techStackAnalysis.recommendedAction2')}</li>
            <li>{t('techStackAnalysis.recommendedAction3')}</li>
            <li>{t('techStackAnalysis.recommendedAction4')}</li>
          </ul>
        </Box>
      </SpaceBetween>
    </SpaceBetween>
  );
};

export default TechStackAnalysisInfoContent;
