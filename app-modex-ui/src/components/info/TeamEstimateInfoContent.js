import React from 'react';
import { SpaceBetween, Box, Header } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

/**
 * Team Estimate Info Content Component
 * 
 * This component provides information about the Team Estimate page.
 */
const TeamEstimateInfoContent = () => {
  const { t } = useTranslation(['info', 'common']);

  return (
    <SpaceBetween size="l">
      <Box>
        <Header variant="h3">{t('teamEstimate.title')}</Header>
        <Box variant="p">
          {t('teamEstimate.description')}
        </Box>
      </Box>
      
      <Box>
        <Header variant="h4">{t('teamEstimate.keyFeatures')}</Header>
        <Box variant="p">
          <ul>
            <li><strong>{t('teamEstimate.peoplePlanning')}</strong> {t('teamEstimate.peoplePlanningDescription')}</li>
            <li><strong>{t('teamEstimate.skillsAssessment')}</strong> {t('teamEstimate.skillsAssessmentDescription')}</li>
            <li><strong>{t('teamEstimate.timeEstimation')}</strong> {t('teamEstimate.timeEstimationDescription')}</li>
            <li><strong>{t('teamEstimate.bucketBasedEstimates')}</strong> {t('teamEstimate.bucketBasedEstimatesDescription')}</li>
            <li><strong>{t('teamEstimate.roleBasedPlanning')}</strong> {t('teamEstimate.roleBasedPlanningDescription')}</li>
            <li><strong>{t('teamEstimate.applicationScaling')}</strong> {t('teamEstimate.applicationScalingDescription')}</li>
          </ul>
        </Box>
      </Box>
      
      <Box>
        <Header variant="h4">{t('teamEstimate.howToUse')}</Header>
        <Box variant="p">
          <ol>
            <li>{t('teamEstimate.step1')}</li>
            <li>{t('teamEstimate.step2')}</li>
            <li>{t('teamEstimate.step3')}</li>
            <li>{t('teamEstimate.step4')}</li>
            <li>{t('teamEstimate.step5')}</li>
            <li>{t('teamEstimate.step6')}</li>
            <li>{t('teamEstimate.step7')}</li>
          </ol>
        </Box>
      </Box>
      
      <Box>
        <Header variant="h4">{t('teamEstimate.resourceTypes')}</Header>
        <Box variant="p">
          <ul>
            <li><strong>{t('teamEstimate.developers')}</strong> {t('teamEstimate.developersDescription')}</li>
            <li><strong>{t('teamEstimate.architects')}</strong> {t('teamEstimate.architectsDescription')}</li>
            <li><strong>{t('teamEstimate.testers')}</strong> {t('teamEstimate.testersDescription')}</li>
            <li><strong>{t('teamEstimate.devops')}</strong> {t('teamEstimate.devopsDescription')}</li>
            <li><strong>{t('teamEstimate.projectDuration')}</strong> {t('teamEstimate.projectDurationDescription')}</li>
            <li><strong>{t('teamEstimate.totalEffort')}</strong> {t('teamEstimate.totalEffortDescription')}</li>
          </ul>
        </Box>
      </Box>
    </SpaceBetween>
  );
};

export default TeamEstimateInfoContent;