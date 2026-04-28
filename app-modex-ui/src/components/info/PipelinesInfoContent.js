import React from 'react';
import { Box, SpaceBetween, Link, Header } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

/**
 * Information content for the Pipelines page
 */
function PipelinesInfoContent() {
  const { t } = useTranslation(['info', 'common']);
  
  return (
    <Box>
      <SpaceBetween size="l">
        <div>
          <Header variant="h2">{t('info:pipelines.title')}</Header>
          <Box variant="p">
            {t('info:pipelines.description')}
          </Box>
        </div>
        
        <div>
          <Header variant="h3">{t('info:pipelines.keyBenefits')}</Header>
          <ul>
            <li>
              <strong>{t('info:pipelines.automation')}:</strong> {t('info:pipelines.automationDesc')}
            </li>
            <li>
              <strong>{t('info:pipelines.consistency')}:</strong> {t('info:pipelines.consistencyDesc')}
            </li>
            <li>
              <strong>{t('info:pipelines.reliability')}:</strong> {t('info:pipelines.reliabilityDesc')}
            </li>
            <li>
              <strong>{t('info:pipelines.visibility')}:</strong> {t('info:pipelines.visibilityDesc')}
            </li>
            <li>
              <strong>{t('info:pipelines.governance')}:</strong> {t('info:pipelines.governanceDesc')}
            </li>
          </ul>
        </div>
        
        <div>
          <Header variant="h3">{t('info:pipelines.commonStages')}</Header>
          <ul>
            <li>
              <strong>{t('info:pipelines.source')}:</strong> {t('info:pipelines.sourceDesc')}
            </li>
            <li>
              <strong>{t('info:pipelines.build')}:</strong> {t('info:pipelines.buildDesc')}
            </li>
            <li>
              <strong>{t('info:pipelines.test')}:</strong> {t('info:pipelines.testDesc')}
            </li>
            <li>
              <strong>{t('info:pipelines.securityScan')}:</strong> {t('info:pipelines.securityScanDesc')}
            </li>
            <li>
              <strong>{t('info:pipelines.deploy')}:</strong> {t('info:pipelines.deployDesc')}
            </li>
            <li>
              <strong>{t('info:pipelines.validation')}:</strong> {t('info:pipelines.validationDesc')}
            </li>
          </ul>
        </div>
      </SpaceBetween>
    </Box>
  );
}

export default PipelinesInfoContent;
