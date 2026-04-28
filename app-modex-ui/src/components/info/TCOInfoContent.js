import React from 'react';
import { Box, SpaceBetween, Link, Header } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

/**
 * Information content for the TCO (Total Cost of Ownership) page
 */
function TCOInfoContent() {
  const { t } = useTranslation(['info', 'common']);
  return (
    <Box>
      <SpaceBetween size="l">
        <div>
          <Header variant="h2">{t('info:tco.title')}</Header>
          <Box variant="p">
            {t('info:tco.description')}
          </Box>
        </div>
        
        <div>
          <Header variant="h3">{t('info:tco.keyBenefits')}</Header>
          <ul>
            <li>
              <strong>{t('info:tco.costComparison')}</strong> {t('info:tco.costComparisonDescription')}
            </li>
            <li>
              <strong>{t('info:tco.roiAnalysis')}</strong> {t('info:tco.roiAnalysisDescription')}
            </li>
            <li>
              <strong>{t('info:tco.budgetPlanning')}</strong> {t('info:tco.budgetPlanningDescription')}
            </li>
            <li>
              <strong>{t('info:tco.costOptimization')}</strong> {t('info:tco.costOptimizationDescription')}
            </li>
          </ul>
        </div>
        
        <div>
          <Header variant="h3">{t('info:tco.tcoComponents')}</Header>
          <ul>
            <li>
              <strong>{t('info:tco.computeCosts')}</strong> {t('info:tco.computeCostsDescription')}
            </li>
            <li>
              <strong>{t('info:tco.databaseCosts')}</strong> {t('info:tco.databaseCostsDescription')}
            </li>
            <li>
              <strong>{t('info:tco.integrationCosts')}</strong> {t('info:tco.integrationCostsDescription')}
            </li>
            <li>
              <strong>{t('info:tco.storageCosts')}</strong> {t('info:tco.storageCostsDescription')}
            </li>
            <li>
              <strong>{t('info:tco.utilizationSize')}</strong> {t('info:tco.utilizationSizeDescription')}
            </li>
            <li>
              <strong>{t('info:tco.timePeriod')}</strong> {t('info:tco.timePeriodDescription')}
            </li>
          </ul>
        </div>
        
        <div>
          <Header variant="h3">{t('info:tco.howToUse')}</Header>
          <ol>
            <li>{t('info:tco.step1')}</li>
            <li>{t('info:tco.step2')}</li>
            <li>{t('info:tco.step3')}</li>
            <li>{t('info:tco.step4')}</li>
            <li>{t('info:tco.step5')}</li>
            <li>{t('info:tco.step6')}</li>
            <li>{t('info:tco.step7')}</li>
            <li>{t('info:tco.step8')}</li>
            <li>{t('info:tco.step9')}</li>
            <li>{t('info:tco.step10')}</li>
          </ol>
        </div>
        
        <div>
          <Header variant="h3">{t('info:tco.costCalculation')}</Header>
          <Box variant="p">
            {t('info:tco.costCalculationDescription')}
          </Box>
          <ul>
            <li>
              <strong>{t('info:tco.pilotApplicationCosts')}</strong> {t('info:tco.pilotApplicationCostsDescription')}
            </li>
            <li>
              <strong>{t('info:tco.similarityScores')}</strong> {t('info:tco.similarityScoresDescription')}
            </li>
            <li>
              <strong>{t('info:tco.aggregatedCosts')}</strong> {t('info:tco.aggregatedCostsDescription')}
            </li>
          </ul>
        </div>
      </SpaceBetween>
    </Box>
  );
}

export default TCOInfoContent;
