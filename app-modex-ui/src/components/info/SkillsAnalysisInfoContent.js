import React from 'react';
import {
  Box,
  SpaceBetween,
  Header,
  ColumnLayout,
  ExpandableSection
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

/**
 * Information panel content for the Skills Analysis page
 */
const SkillsAnalysisInfoContent = () => {
  const { t } = useTranslation(['info', 'common']);

  return (
    <Box>
      <SpaceBetween size="l">
        <div>
          <Header variant="h3">{t('skillsAnalysis.aboutTitle')}</Header>
          <Box variant="p">
            {t('skillsAnalysis.aboutDescription')}
          </Box>
        </div>

        <ExpandableSection headerText={t('skillsAnalysis.understandingHeatmap')}>
          <Box variant="p">
            {t('skillsAnalysis.heatmapDescription')}
          </Box>
          <ul>
            <li><strong>{t('skillsAnalysis.heatmapLevel0')}</strong> {t('skillsAnalysis.heatmapLevel0Description')}</li>
            <li><strong>{t('skillsAnalysis.heatmapLevel1')}</strong> {t('skillsAnalysis.heatmapLevel1Description')}</li>
            <li><strong>{t('skillsAnalysis.heatmapLevel2')}</strong> {t('skillsAnalysis.heatmapLevel2Description')}</li>
            <li><strong>{t('skillsAnalysis.heatmapLevel3')}</strong> {t('skillsAnalysis.heatmapLevel3Description')}</li>
          </ul>
          <Box variant="p">
            {t('skillsAnalysis.heatmapUsage')}
          </Box>
        </ExpandableSection>

        <ExpandableSection headerText={t('skillsAnalysis.usingInformation')}>
          <ColumnLayout columns={1} variant="text-grid">
            <div>
              <Header variant="h4">{t('skillsAnalysis.identifyTrainingNeeds')}</Header>
              <Box variant="p">
                {t('skillsAnalysis.identifyTrainingNeedsDescription')}
              </Box>
            </div>

            <div>
              <Header variant="h4">{t('skillsAnalysis.resourceAllocation')}</Header>
              <Box variant="p">
                {t('skillsAnalysis.resourceAllocationDescription')}
              </Box>
            </div>

            <div>
              <Header variant="h4">{t('skillsAnalysis.strategicPlanning')}</Header>
              <Box variant="p">
                {t('skillsAnalysis.strategicPlanningDescription')}
              </Box>
            </div>
          </ColumnLayout>
        </ExpandableSection>

        <ExpandableSection headerText={t('skillsAnalysis.teamSkillDetailsTable')}>
          <Box variant="p">
            {t('skillsAnalysis.tableDescription')}
          </Box>
          <ul>
            <li><strong>{t('skillsAnalysis.team')}</strong> {t('skillsAnalysis.teamDescription')}</li>
            <li><strong>{t('skillsAnalysis.skill')}</strong> {t('skillsAnalysis.skillDescription')}</li>
            <li><strong>{t('skillsAnalysis.category')}</strong> {t('skillsAnalysis.categoryDescription')}</li>
            <li><strong>{t('skillsAnalysis.actualLevel')}</strong> {t('skillsAnalysis.actualLevelDescription')}</li>
            <li><strong>{t('skillsAnalysis.requiredLevel')}</strong> {t('skillsAnalysis.requiredLevelDescription')}</li>
            <li><strong>{t('skillsAnalysis.gap')}</strong> {t('skillsAnalysis.gapDescription')}</li>
            <li><strong>{t('skillsAnalysis.status')}</strong> {t('skillsAnalysis.statusDescription')}</li>
          </ul>
          <Box variant="p">
            {t('skillsAnalysis.filteringDescription')}
          </Box>
        </ExpandableSection>

        <ExpandableSection headerText={t('skillsAnalysis.proficiencyLevelScale')}>
          <ul>
            <li><strong>{t('skillsAnalysis.novice')}</strong> {t('skillsAnalysis.noviceDescription')}</li>
            <li><strong>{t('skillsAnalysis.beginner')}</strong> {t('skillsAnalysis.beginnerDescription')}</li>
            <li><strong>{t('skillsAnalysis.intermediate')}</strong> {t('skillsAnalysis.intermediateDescription')}</li>
            <li><strong>{t('skillsAnalysis.advanced')}</strong> {t('skillsAnalysis.advancedDescription')}</li>
            <li><strong>{t('skillsAnalysis.expert')}</strong> {t('skillsAnalysis.expertDescription')}</li>
          </ul>
        </ExpandableSection>
      </SpaceBetween>
    </Box>
  );
};

export default SkillsAnalysisInfoContent;
