import React from 'react';
import { Box, Header, SpaceBetween, Link } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

function VisionInfoContent() {
  const { t } = useTranslation(['info', 'common']);

  return (
    <Box padding="l">
      <SpaceBetween size="l">
        <Header variant="h2">{t('vision.title')}</Header>
        <Box variant="p">
          {t('vision.description')}
        </Box>
        <Header variant="h3">{t('vision.technologyRadar')}</Header>
        <Box variant="p">{t('vision.keyInformation')}</Box>
        <ul>
          <li><strong>{t('vision.technology')}</strong> {t('vision.technologyDescription')}</li>
          <li><strong>{t('vision.quadrant')}</strong> {t('vision.quadrantDescription')}</li>
          <li><strong>{t('vision.phase')}</strong> {t('vision.phaseDescription')}</li>
        </ul>
        
        <Header variant="h3">{t('vision.quadrants')}</Header>
        <ul>
          <li><strong>{t('vision.techniques')}</strong> {t('vision.techniquesDescription')}</li>
          <li><strong>{t('vision.tools')}</strong> {t('vision.toolsDescription')}</li>
          <li><strong>{t('vision.platforms')}</strong> {t('vision.platformsDescription')}</li>
          <li><strong>{t('vision.languagesFrameworks')}</strong> {t('vision.languagesFrameworksDescription')}</li>
        </ul>
        
        <Header variant="h3">{t('vision.adoptionPhases')}</Header>
        <ul>
          <li><strong>{t('vision.adopt')}</strong> {t('vision.adoptDescription')}</li>
          <li><strong>{t('vision.trial')}</strong> {t('vision.trialDescription')}</li>
          <li><strong>{t('vision.assess')}</strong> {t('vision.assessDescription')}</li>
          <li><strong>{t('vision.hold')}</strong> {t('vision.holdDescription')}</li>
        </ul>
      </SpaceBetween>
    </Box>
  );
}

export default VisionInfoContent;
