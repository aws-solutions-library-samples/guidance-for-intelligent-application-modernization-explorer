import React from 'react';
import { Box, Header, SpaceBetween } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

function PortfolioInfoContent() {
  const { t } = useTranslation(['info', 'common']);
  
  return (
    <Box padding="l">
      <SpaceBetween size="l">
        <Header variant="h2">{t('info:portfolio.title')}</Header>
        <Box variant="p">
          {t('info:portfolio.description')}
        </Box>
        <Header variant="h3">{t('info:portfolio.keyInformation')}</Header>
        <ul>
          <li><strong>{t('info:portfolio.applicationName')}:</strong> {t('info:portfolio.applicationNameDesc')}</li>
          <li><strong>{t('info:portfolio.purpose')}:</strong> {t('info:portfolio.purposeDesc')}</li>
          <li><strong>{t('info:portfolio.criticality')}:</strong> {t('info:portfolio.criticalityDesc')}</li>
          <li><strong>{t('info:portfolio.department')}:</strong> {t('info:portfolio.departmentDesc')}</li>
        </ul>
        <Header variant="h3">{t('info:portfolio.bestPractices')}</Header>
        <ul>
          <li>{t('info:portfolio.practice1')}</li>
          <li>{t('info:portfolio.practice2')}</li>
          <li>{t('info:portfolio.practice3')}</li>
          <li>{t('info:portfolio.practice4')}</li>
        </ul>
      </SpaceBetween>
    </Box>
  );
}

export default PortfolioInfoContent;
