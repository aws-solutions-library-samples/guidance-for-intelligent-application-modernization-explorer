import React from 'react';
import { Box, SpaceBetween, Link, Header } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

/**
 * Information content for the Technology Vision page
 */
function TechnologyVisionInfoContent() {
  const { t } = useTranslation(['info', 'common']);
  return (
    <Box>
      <SpaceBetween size="l">
        <div>
          <Header variant="h2">{t('info:technologyVision.title')}</Header>
          <Box variant="p">
            {t('info:technologyVision.description')}
          </Box>
        </div>
        
        <div>
          <Header variant="h3">{t('info:technologyVision.quadrants')}</Header>
          <ul>
            <li><strong>{t('info:technologyVision.techniques')}:</strong> {t('info:technologyVision.techniquesDescription')}</li>
            <li><strong>{t('info:technologyVision.tools')}:</strong> {t('info:technologyVision.toolsDescription')}</li>
            <li><strong>{t('info:technologyVision.platforms')}:</strong> {t('info:technologyVision.platformsDescription')}</li>
            <li><strong>{t('info:technologyVision.languagesFrameworks')}:</strong> {t('info:technologyVision.languagesFrameworksDescription')}</li>
          </ul>
        </div>
        
        <div>
          <Header variant="h3">{t('info:technologyVision.adoptionPhases')}</Header>
          <ul>
            <li><strong>{t('info:technologyVision.adopt')}:</strong> {t('info:technologyVision.adoptDescription')}</li>
            <li><strong>{t('info:technologyVision.trial')}:</strong> {t('info:technologyVision.trialDescription')}</li>
            <li><strong>{t('info:technologyVision.assess')}:</strong> {t('info:technologyVision.assessDescription')}</li>
            <li><strong>{t('info:technologyVision.hold')}:</strong> {t('info:technologyVision.holdDescription')}</li>
          </ul>
        </div>
        
        <div>
          <Header variant="h3">{t('info:technologyVision.howToUse')}</Header>
          <ol>
            <li>{t('info:technologyVision.step1')}</li>
            <li>{t('info:technologyVision.step2')}</li>
            <li>{t('info:technologyVision.step3')}</li>
            <li>{t('info:technologyVision.step4')}</li>
            <li>{t('info:technologyVision.step5')}</li>
            <li>{t('info:technologyVision.step6')}</li>
          </ol>
        </div>
        
        <div>
          <Header variant="h3">{t('info:technologyVision.bestPractices')}</Header>
          <ul>
            <li><strong>{t('info:technologyVision.regularUpdates')}:</strong> {t('info:technologyVision.regularUpdatesDescription')}</li>
            <li><strong>{t('info:technologyVision.teamInput')}:</strong> {t('info:technologyVision.teamInputDescription')}</li>
            <li><strong>{t('info:technologyVision.clearCriteria')}:</strong> {t('info:technologyVision.clearCriteriaDescription')}</li>
            <li><strong>{t('info:technologyVision.documentation')}:</strong> {t('info:technologyVision.documentationDescription')}</li>
          </ul>
        </div>
      </SpaceBetween>
    </Box>
  );
}

export default TechnologyVisionInfoContent;
