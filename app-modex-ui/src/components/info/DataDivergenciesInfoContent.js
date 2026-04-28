import React from 'react';
import { SpaceBetween, Box, Link } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

/**
 * Information content for the Data Divergencies page
 */
const DataDivergenciesInfoContent = () => {
  const { t } = useTranslation(['info', 'common']);
  
  return (
    <SpaceBetween size="l">
      <div>
        <Box variant="h2">{t('info:dataDivergencies.title')}</Box>
        <Box variant="p">
          {t('info:dataDivergencies.description')}
        </Box>
      </div>
      
      <div>
        <Box variant="h3">{t('info:dataDivergencies.whyImportant')}</Box>
        <Box variant="p">
          {t('info:dataDivergencies.whyImportantDesc')}
        </Box>
        <ul>
          <li>{t('info:dataDivergencies.incompleteAssessments')}</li>
          <li>{t('info:dataDivergencies.missingApplications')}</li>
          <li>{t('info:dataDivergencies.inaccurateCosts')}</li>
          <li>{t('info:dataDivergencies.portfolioGaps')}</li>
        </ul>
      </div>
      
      <div>
        <Box variant="h3">{t('info:dataDivergencies.statusIndicators')}</Box>
        <ul>
          <li><strong>{t('info:dataDivergencies.error')}:</strong> {t('info:dataDivergencies.errorDesc')}</li>
          <li><strong>{t('info:dataDivergencies.warning')}:</strong> {t('info:dataDivergencies.warningDesc')}</li>
        </ul>
      </div>
      
      <div>
        <Box variant="h3">{t('info:dataDivergencies.howToResolve')}</Box>
        <ol>
          <li><strong>{t('info:dataDivergencies.portfolioDivergencies')}:</strong> {t('info:dataDivergencies.portfolioDivergenciesDesc')}</li>
          <li><strong>{t('info:dataDivergencies.techStackDivergencies')}:</strong> {t('info:dataDivergencies.techStackDivergenciesDesc')}</li>
          <li><strong>{t('info:dataDivergencies.infrastructureDivergencies')}:</strong> {t('info:dataDivergencies.infrastructureDivergenciesDesc')}</li>
          <li><strong>{t('info:dataDivergencies.utilizationDivergencies')}:</strong> {t('info:dataDivergencies.utilizationDivergenciesDesc')}</li>
        </ol>
      </div>
      
      <div>
        <Box variant="h3">{t('info:dataDivergencies.bestPractices')}</Box>
        <ul>
          <li>{t('info:dataDivergencies.regularReview')}</li>
          <li>{t('info:dataDivergencies.prioritizePortfolio')}</li>
          <li>{t('info:dataDivergencies.establishProcess')}</li>
          <li>{t('info:dataDivergencies.documentReasons')}</li>
        </ul>
      </div>
      
      <div>
        <Box variant="h3">{t('info:dataDivergencies.needHelp')}</Box>
        <Box variant="p">
          {t('info:dataDivergencies.needHelpDesc')}{' '}
          {t('info:dataDivergencies.contactAdmin')}
        </Box>
      </div>
    </SpaceBetween>
  );
};

export default DataDivergenciesInfoContent;
