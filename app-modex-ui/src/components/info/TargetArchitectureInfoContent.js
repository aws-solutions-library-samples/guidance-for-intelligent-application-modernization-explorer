import React from 'react';
import { Box, SpaceBetween, Link, Header } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

/**
 * Information content for the Target Architecture page
 */
function TargetArchitectureInfoContent() {
  const { t } = useTranslation(['info', 'common']);
  
  return (
    <Box>
      <SpaceBetween size="l">
        <div>
          <Header variant="h2">{t('info:targetArchitecture.title')}</Header>
          <Box variant="p">
            {t('info:targetArchitecture.description')}
          </Box>
        </div>
        
        <div>
          <Header variant="h3">{t('info:targetArchitecture.keyBenefits')}</Header>
          <ul>
            <li>
              <strong>{t('info:targetArchitecture.architectureDocumentation')}:</strong> {t('info:targetArchitecture.architectureDocumentationDesc')}
            </li>
            <li>
              <strong>{t('info:targetArchitecture.implementationTracking')}:</strong> {t('info:targetArchitecture.implementationTrackingDesc')}
            </li>
            <li>
              <strong>{t('info:targetArchitecture.referenceArchitecture')}:</strong> {t('info:targetArchitecture.referenceArchitectureDesc')}
            </li>
            <li>
              <strong>{t('info:targetArchitecture.governance')}:</strong> {t('info:targetArchitecture.governanceDesc')}
            </li>
          </ul>
        </div>
      </SpaceBetween>
    </Box>
  );
}

export default TargetArchitectureInfoContent;
