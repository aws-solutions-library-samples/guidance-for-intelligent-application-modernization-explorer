import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Header, SpaceBetween } from '@cloudscape-design/components';

function UtilizationInfoContent() {
  const { t } = useTranslation(['info', 'common']);
  
  return (
    <Box padding="l">
      <SpaceBetween size="l">
        <Header variant="h2">{t('info:utilizationInfo.title')}</Header>
        <Box variant="p">
          {t('info:utilizationInfo.description')}
        </Box>
        <Header variant="h3">{t('info:utilizationInfo.keyMetrics')}</Header>
        <ul>
          <li><strong>{t('info:utilizationInfo.applicationName')}:</strong> {t('info:utilizationInfo.applicationNameDescription')}</li>
          <li><strong>{t('info:utilizationInfo.timestamp')}:</strong> {t('info:utilizationInfo.timestampDescription')}</li>
          <li><strong>{t('info:utilizationInfo.cpuUtilization')}:</strong> {t('info:utilizationInfo.cpuUtilizationDescription')}</li>
          <li><strong>{t('info:utilizationInfo.memoryUtilization')}:</strong> {t('info:utilizationInfo.memoryUtilizationDescription')}</li>
          <li><strong>{t('info:utilizationInfo.storageUtilization')}:</strong> {t('info:utilizationInfo.storageUtilizationDescription')}</li>
          <li><strong>{t('info:utilizationInfo.networkIn')}:</strong> {t('info:utilizationInfo.networkInDescription')}</li>
          <li><strong>{t('info:utilizationInfo.networkOut')}:</strong> {t('info:utilizationInfo.networkOutDescription')}</li>
          <li><strong>{t('info:utilizationInfo.iops')}:</strong> {t('info:utilizationInfo.iopsDescription')}</li>
          <li><strong>{t('info:utilizationInfo.notes')}:</strong> {t('info:utilizationInfo.notesDescription')}</li>
        </ul>
        <Header variant="h3">{t('info:utilizationInfo.utilizationIndicators')}</Header>
        <ul>
          <li><span style={{ color: '#d13212' }}>●</span> <strong>{t('info:utilizationInfo.high')}:</strong> {t('info:utilizationInfo.highDescription')}</li>
          <li><span style={{ color: '#ff9900' }}>●</span> <strong>{t('info:utilizationInfo.mediumHigh')}:</strong> {t('info:utilizationInfo.mediumHighDescription')}</li>
          <li><span style={{ color: '#0073bb' }}>●</span> <strong>{t('info:utilizationInfo.medium')}:</strong> {t('info:utilizationInfo.mediumDescription')}</li>
          <li><span style={{ color: '#2e7d32' }}>●</span> <strong>{t('info:utilizationInfo.low')}:</strong> {t('info:utilizationInfo.lowDescription')}</li>
        </ul>
        <Header variant="h3">{t('info:utilizationInfo.bestPractices')}</Header>
        <ul>
          <li>{t('info:utilizationInfo.bestPractice1')}</li>
          <li>{t('info:utilizationInfo.bestPractice2')}</li>
          <li>{t('info:utilizationInfo.bestPractice3')}</li>
          <li>{t('info:utilizationInfo.bestPractice4')}</li>
          <li>{t('info:utilizationInfo.bestPractice5')}</li>
        </ul>
      </SpaceBetween>
    </Box>
  );
}

export default UtilizationInfoContent;
