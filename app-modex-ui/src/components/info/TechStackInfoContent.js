import React from 'react';
import { Box, Header, SpaceBetween } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

function TechStackInfoContent() {
  const { t } = useTranslation(['info', 'common']);

  return (
    <Box padding="l">
      <SpaceBetween size="l">
        <Header variant="h2">{t('techStack.title')}</Header>
        <Box variant="p">
          {t('techStack.description')}
        </Box>
        <Header variant="h3">{t('techStack.keyInformation')}</Header>
        <ul>
          <li><strong>{t('techStack.applicationName')}</strong> {t('techStack.applicationNameDescription')}</li>
          <li><strong>{t('techStack.componentName')}</strong> {t('techStack.componentNameDescription')}</li>
          <li><strong>{t('techStack.runtime')}</strong> {t('techStack.runtimeDescription')}</li>
          <li><strong>{t('techStack.database')}</strong> {t('techStack.databaseDescription')}</li>
          <li><strong>{t('techStack.integration')}</strong> {t('techStack.integrationDescription')}</li>
          <li><strong>{t('techStack.storage')}</strong> {t('techStack.storageDescription')}</li>
        </ul>
        <Header variant="h3">{t('techStack.bestPractices')}</Header>
        <ul>
          <li>{t('techStack.bestPractice1')}</li>
          <li>{t('techStack.bestPractice2')}</li>
          <li>{t('techStack.bestPractice3')}</li>
          <li>{t('techStack.bestPractice4')}</li>
        </ul>
      </SpaceBetween>
    </Box>
  );
}

export default TechStackInfoContent;
