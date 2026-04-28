import React from 'react';
import { Box, SpaceBetween, Link, Header } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

/**
 * Information content for the Infrastructure as Code (IaC) page
 */
function IaCInfoContent() {
  const { t } = useTranslation(['info', 'common']);
  
  return (
    <Box>
      <SpaceBetween size="l">
        <div>
          <Header variant="h2">{t('info:iac.title')}</Header>
          <Box variant="p">
            {t('info:iac.description')}
          </Box>
        </div>
        
        <div>
          <Header variant="h3">{t('info:iac.keyBenefits')}</Header>
          <ul>
            <li>
              <strong>{t('info:iac.consistency')}:</strong> {t('info:iac.consistencyDesc')}
            </li>
            <li>
              <strong>{t('info:iac.versionControl')}:</strong> {t('info:iac.versionControlDesc')}
            </li>
            <li>
              <strong>{t('info:iac.automation')}:</strong> {t('info:iac.automationDesc')}
            </li>
            <li>
              <strong>{t('info:iac.documentation')}:</strong> {t('info:iac.documentationDesc')}
            </li>
            <li>
              <strong>{t('info:iac.compliance')}:</strong> {t('info:iac.complianceDesc')}
            </li>
          </ul>
        </div>
        
        <div>
          <Header variant="h3">{t('info:iac.commonTools')}</Header>
          <ul>
            <li>
              <strong>{t('info:iac.cloudFormation')}:</strong> {t('info:iac.cloudFormationDesc')}
            </li>
            <li>
              <strong>{t('info:iac.awsCdk')}:</strong> {t('info:iac.awsCdkDesc')}
            </li>
            <li>
              <strong>{t('info:iac.terraform')}:</strong> {t('info:iac.terraformDesc')}
            </li>
            <li>
              <strong>{t('info:iac.pulumi')}:</strong> {t('info:iac.pulumiDesc')}
            </li>
            <li>
              <strong>{t('info:iac.ansible')}:</strong> {t('info:iac.ansibleDesc')}
            </li>
          </ul>
        </div>
      </SpaceBetween>
    </Box>
  );
}

export default IaCInfoContent;
