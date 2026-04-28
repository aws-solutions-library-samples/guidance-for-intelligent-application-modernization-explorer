import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  SpaceBetween,
  Header,
  ColumnLayout,
  ExpandableSection
} from '@cloudscape-design/components';

/**
 * Information panel content for the Vision Analysis page
 */
const VisionAnalysisInfoContent = () => {
  const { t } = useTranslation(['info', 'common']);
  
  return (
    <Box>
      <SpaceBetween size="l">
        <div>
          <Header variant="h3">{t('info:visionAnalysis.aboutVisionAnalysis')}</Header>
          <Box variant="p">
            {t('info:visionAnalysis.description')}
          </Box>
        </div>

        <ExpandableSection headerText={t('info:visionAnalysis.understandingTechRadar')}>
          <Box variant="p">
            {t('info:visionAnalysis.techRadarDescription')}
          </Box>
          <Header variant="h4">{t('info:visionAnalysis.quadrants')}</Header>
          <ul>
            <li><strong>{t('info:visionAnalysis.techniques')}:</strong> {t('info:visionAnalysis.techniquesDescription')}</li>
            <li><strong>{t('info:visionAnalysis.tools')}:</strong> {t('info:visionAnalysis.toolsDescription')}</li>
            <li><strong>{t('info:visionAnalysis.platforms')}:</strong> {t('info:visionAnalysis.platformsDescription')}</li>
            <li><strong>{t('info:visionAnalysis.languagesFrameworks')}:</strong> {t('info:visionAnalysis.languagesFrameworksDescription')}</li>
          </ul>
          <Header variant="h4">{t('info:visionAnalysis.rings')}</Header>
          <ul>
            <li><strong>{t('info:visionAnalysis.adopt')} ({t('info:visionAnalysis.green')}):</strong> {t('info:visionAnalysis.adoptDescription')}</li>
            <li><strong>{t('info:visionAnalysis.trial')} ({t('info:visionAnalysis.blue')}):</strong> {t('info:visionAnalysis.trialDescription')}</li>
            <li><strong>{t('info:visionAnalysis.assess')} ({t('info:visionAnalysis.orange')}):</strong> {t('info:visionAnalysis.assessDescription')}</li>
            <li><strong>{t('info:visionAnalysis.hold')} ({t('info:visionAnalysis.red')}):</strong> {t('info:visionAnalysis.holdDescription')}</li>
          </ul>
          <Box variant="p">
            {t('info:visionAnalysis.clickTechnologyDescription')}
          </Box>
        </ExpandableSection>

        <ExpandableSection headerText={t('info:visionAnalysis.usingThisInformation')}>
          <ColumnLayout columns={1} variant="text-grid">
            <div>
              <Header variant="h4">{t('info:visionAnalysis.strategicPlanning')}</Header>
              <Box variant="p">
                {t('info:visionAnalysis.strategicPlanningDescription')}
              </Box>
            </div>

            <div>
              <Header variant="h4">{t('info:visionAnalysis.skillsDevelopment')}</Header>
              <Box variant="p">
                {t('info:visionAnalysis.skillsDevelopmentDescription')}
              </Box>
            </div>

            <div>
              <Header variant="h4">{t('info:visionAnalysis.technologyGovernance')}</Header>
              <Box variant="p">
                {t('info:visionAnalysis.technologyGovernanceDescription')}
              </Box>
            </div>
          </ColumnLayout>
        </ExpandableSection>

        <ExpandableSection headerText={t('info:visionAnalysis.maintainingTechRadar')}>
          <Box variant="p">
            {t('info:visionAnalysis.maintainingDescription')}
          </Box>
          <ul>
            <li><strong>{t('info:visionAnalysis.regularReviews')}:</strong> {t('info:visionAnalysis.regularReviewsDescription')}</li>
            <li><strong>{t('info:visionAnalysis.collaborativeProcess')}:</strong> {t('info:visionAnalysis.collaborativeProcessDescription')}</li>
            <li><strong>{t('info:visionAnalysis.evidenceBased')}:</strong> {t('info:visionAnalysis.evidenceBasedDescription')}</li>
            <li><strong>{t('info:visionAnalysis.clearCriteria')}:</strong> {t('info:visionAnalysis.clearCriteriaDescription')}</li>
            <li><strong>{t('info:visionAnalysis.communicateChanges')}:</strong> {t('info:visionAnalysis.communicateChangesDescription')}</li>
          </ul>
        </ExpandableSection>
      </SpaceBetween>
    </Box>
  );
};

export default VisionAnalysisInfoContent;
