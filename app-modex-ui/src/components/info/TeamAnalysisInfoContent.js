import React from 'react';
import { SpaceBetween, Box, Header } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

function TeamAnalysisInfoContent() {
  const { t } = useTranslation(['info', 'common']);
  return (
    <Box padding="l">
      <SpaceBetween size="l">
        <Header variant="h2">{t('info:teamAnalysis.title')}</Header>
        <Box variant="p">
          {t('info:teamAnalysis.description')}
        </Box>

        <Header variant="h3">{t('info:teamAnalysis.weightAllocationRules')}</Header>
        <ul>
          <li><strong>{t('info:teamAnalysis.percentageBased')}</strong> {t('info:teamAnalysis.percentageBasedDescription')}</li>
          <li><strong>{t('info:teamAnalysis.hundredPercentMaximum')}</strong> {t('info:teamAnalysis.hundredPercentMaximumDescription')}</li>
          <li><strong>{t('info:teamAnalysis.flexibleDistribution')}</strong> {t('info:teamAnalysis.flexibleDistributionDescription')}</li>
          <li><strong>{t('info:teamAnalysis.nullEmptyValues')}</strong> {t('info:teamAnalysis.nullEmptyValuesDescription')}</li>
          <li><strong>{t('info:teamAnalysis.decimalPrecision')}</strong> {t('info:teamAnalysis.decimalPrecisionDescription')}</li>
        </ul>

        <Header variant="h3">{t('info:teamAnalysis.understandingInterface')}</Header>
        <Box variant="p">
          <strong>{t('info:teamAnalysis.weightAllocationColumn')}</strong> {t('info:teamAnalysis.weightAllocationColumnDescription')}
        </Box>
        <ul>
          <li><strong>{t('info:teamAnalysis.notConfigured')}</strong> {t('info:teamAnalysis.notConfiguredDescription')}</li>
          <li><strong>{t('info:teamAnalysis.percentageExample')}</strong> {t('info:teamAnalysis.percentageExampleDescription')}</li>
          <li><strong>{t('info:teamAnalysis.complete')}</strong> {t('info:teamAnalysis.completeDescription')}</li>
          <li><strong>{t('info:teamAnalysis.overHundredPercent')}</strong> {t('info:teamAnalysis.overHundredPercentDescription')}</li>
        </ul>
        <Box variant="p">
          <strong>{t('info:teamAnalysis.progressBar')}</strong> {t('info:teamAnalysis.progressBarDescription')}
        </Box>

        <Header variant="h3">{t('info:teamAnalysis.howToUse')}</Header>
        <ol>
          <li><strong>{t('info:teamAnalysis.editWeights')}</strong> {t('info:teamAnalysis.editWeightsDescription')}</li>
          <li><strong>{t('info:teamAnalysis.assignPercentages')}</strong> {t('info:teamAnalysis.assignPercentagesDescription')}</li>
          <li><strong>{t('info:teamAnalysis.monitorTotal')}</strong> {t('info:teamAnalysis.monitorTotalDescription')}</li>
          <li><strong>{t('info:teamAnalysis.validate')}</strong> {t('info:teamAnalysis.validateDescription')}</li>
          <li><strong>{t('info:teamAnalysis.saveChanges')}</strong> {t('info:teamAnalysis.saveChangesDescription')}</li>
          <li><strong>{t('info:teamAnalysis.clearWeights')}</strong> {t('info:teamAnalysis.clearWeightsDescription')}</li>
        </ol>

        <Header variant="h3">{t('info:teamAnalysis.strategicBenefits')}</Header>
        <ul>
          <li><strong>{t('info:teamAnalysis.priorityIdentification')}</strong> {t('info:teamAnalysis.priorityIdentificationDescription')}</li>
          <li><strong>{t('info:teamAnalysis.resourcePlanning')}</strong> {t('info:teamAnalysis.resourcePlanningDescription')}</li>
          <li><strong>{t('info:teamAnalysis.teamComparison')}</strong> {t('info:teamAnalysis.teamComparisonDescription')}</li>
          <li><strong>{t('info:teamAnalysis.skillGapAnalysis')}</strong> {t('info:teamAnalysis.skillGapAnalysisDescription')}</li>
          <li><strong>{t('info:teamAnalysis.performanceMetrics')}</strong> {t('info:teamAnalysis.performanceMetricsDescription')}</li>
        </ul>

        <Header variant="h3">{t('info:teamAnalysis.exampleScenarios')}</Header>
        <Box variant="p">
          <strong>{t('info:teamAnalysis.developmentTeam')}</strong> {t('info:teamAnalysis.developmentTeamExample')}
        </Box>
        <Box variant="p">
          <strong>{t('info:teamAnalysis.dataTeam')}</strong> {t('info:teamAnalysis.dataTeamExample')}
        </Box>
        <Box variant="p">
          <strong>{t('info:teamAnalysis.infrastructureTeam')}</strong> {t('info:teamAnalysis.infrastructureTeamExample')}
        </Box>

        <Header variant="h3">{t('info:teamAnalysis.dataPersistence')}</Header>
        <Box variant="p">
          {t('info:teamAnalysis.dataPersistenceDescription')}
        </Box>
      </SpaceBetween>
    </Box>
  );
}

export default TeamAnalysisInfoContent;
