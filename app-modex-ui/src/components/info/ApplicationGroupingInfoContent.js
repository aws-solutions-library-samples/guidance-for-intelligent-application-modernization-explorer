import React from 'react';
import { Box, SpaceBetween, Link, Header } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

/**
 * Information content for the Application Buckets page
 */
function ApplicationGroupingInfoContent() {
  const { t } = useTranslation(['info', 'common']);
  
  return (
    <Box>
      <SpaceBetween size="l">
        <div>
          <Header variant="h2">{t('info:applicationGrouping.title')}</Header>
          <Box variant="p">
            {t('info:applicationGrouping.description')}
          </Box>
        </div>
        
        <div>
          <Header variant="h3">{t('info:applicationGrouping.howBucketsWork')}</Header>
          <Box variant="p">
            {t('info:applicationGrouping.eachBucketDefinedBy')}
          </Box>
          <ul>
            <li><strong>{t('info:applicationGrouping.bucketName')}</strong> {t('info:applicationGrouping.bucketNameDescription')}</li>
            <li><strong>{t('info:applicationGrouping.pilotApplication')}</strong> {t('info:applicationGrouping.pilotApplicationDescription')}</li>
            <li><strong>{t('info:applicationGrouping.similarityThreshold')}</strong> {t('info:applicationGrouping.similarityThresholdDescription')}</li>
          </ul>
          <Box variant="p">
            {t('info:applicationGrouping.applicationsWithSimilarity')}
          </Box>
        </div>
        
        <div>
          <Header variant="h3">{t('info:applicationGrouping.keyBenefits')}</Header>
          <ul>
            <li>
              <strong>{t('info:applicationGrouping.prioritization')}</strong> {t('info:applicationGrouping.prioritizationDescription')}
            </li>
            <li>
              <strong>{t('info:applicationGrouping.resourceAllocation')}</strong> {t('info:applicationGrouping.resourceAllocationDescription')}
            </li>
            <li>
              <strong>{t('info:applicationGrouping.riskManagement')}</strong> {t('info:applicationGrouping.riskManagementDescription')}
            </li>
            <li>
              <strong>{t('info:applicationGrouping.dependencyManagement')}</strong> {t('info:applicationGrouping.dependencyManagementDescription')}
            </li>
          </ul>
        </div>
        
        <div>
          <Header variant="h3">{t('info:applicationGrouping.commonBucketingCriteria')}</Header>
          <ul>
            <li>
              <strong>{t('info:applicationGrouping.technologyStackSimilarity')}</strong> {t('info:applicationGrouping.technologyStackSimilarityDescription')}
            </li>
            <li>
              <strong>{t('info:applicationGrouping.businessValue')}</strong> {t('info:applicationGrouping.businessValueDescription')}
            </li>
            <li>
              <strong>{t('info:applicationGrouping.technicalComplexity')}</strong> {t('info:applicationGrouping.technicalComplexityDescription')}
            </li>
            <li>
              <strong>{t('info:applicationGrouping.modernizationApproach')}</strong> {t('info:applicationGrouping.modernizationApproachDescription')}
            </li>
            <li>
              <strong>{t('info:applicationGrouping.dependencies')}</strong> {t('info:applicationGrouping.dependenciesDescription')}
            </li>
            <li>
              <strong>{t('info:applicationGrouping.teamCapabilities')}</strong> {t('info:applicationGrouping.teamCapabilitiesDescription')}
            </li>
          </ul>
        </div>
        
        <div>
          <Header variant="h3">{t('info:applicationGrouping.howToUse')}</Header>
          <ol>
            <li>{t('info:applicationGrouping.step1')}</li>
            <li>{t('info:applicationGrouping.step2')}</li>
            <li>{t('info:applicationGrouping.step3')}</li>
            <li>{t('info:applicationGrouping.step4')}</li>
            <li>{t('info:applicationGrouping.step5')}</li>
            <li>{t('info:applicationGrouping.step6')}</li>
            <li>{t('info:applicationGrouping.step7')}</li>
            <li>{t('info:applicationGrouping.step8')}</li>
          </ol>
        </div>
      </SpaceBetween>
    </Box>
  );
}

export default ApplicationGroupingInfoContent;
