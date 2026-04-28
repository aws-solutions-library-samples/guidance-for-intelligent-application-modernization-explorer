import React from 'react';
import { Box, Header, SpaceBetween } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

function InfrastructureInfoContent() {
  const { t } = useTranslation(['info', 'common']);

  return (
    <Box padding="l">
      <SpaceBetween size="l">
        <Header variant="h2">{t('infrastructure.title')}</Header>
        <Box variant="p">
          {t('infrastructure.description')}
        </Box>
        <Header variant="h3">{t('infrastructure.keyInformation')}</Header>
        <ul>
          <li><strong>{t('infrastructure.applicationName')}</strong> {t('infrastructure.applicationNameDescription')}</li>
          <li><strong>{t('infrastructure.serverName')}</strong> {t('infrastructure.serverNameDescription')}</li>
          <li><strong>{t('infrastructure.serverType')}</strong> {t('infrastructure.serverTypeDescription')}</li>
          <li><strong>{t('infrastructure.cpu')}</strong> {t('infrastructure.cpuDescription')}</li>
          <li><strong>{t('infrastructure.memory')}</strong> {t('infrastructure.memoryDescription')}</li>
          <li><strong>{t('infrastructure.storage')}</strong> {t('infrastructure.storageDescription')}</li>
          <li><strong>{t('infrastructure.regionLocation')}</strong> {t('infrastructure.regionLocationDescription')}</li>
          <li><strong>{t('infrastructure.environment')}</strong> {t('infrastructure.environmentDescription')}</li>
          <li><strong>{t('infrastructure.notes')}</strong> {t('infrastructure.notesDescription')}</li>
        </ul>
        <Header variant="h3">{t('infrastructure.bestPractices')}</Header>
        <ul>
          <li>{t('infrastructure.bestPractice1')}</li>
          <li>{t('infrastructure.bestPractice2')}</li>
          <li>{t('infrastructure.bestPractice3')}</li>
          <li>{t('infrastructure.bestPractice4')}</li>
          <li>{t('infrastructure.bestPractice5')}</li>
        </ul>
      </SpaceBetween>
    </Box>
  );
}

export default InfrastructureInfoContent;
