import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, SpaceBetween } from '@cloudscape-design/components';

/**
 * Info panel content for the Pilot Identification page
 */
const PilotIdentificationInfoContent = () => {
  const { t } = useTranslation('info');

  return (
    <SpaceBetween size="l">
      <Box variant="h2">{t('pilotIdentification.title')}</Box>
      
      <Box variant="p">
        {t('pilotIdentification.description')}
      </Box>
      
      <Box variant="h3">{t('pilotIdentification.keyFeatures')}</Box>
      
      <SpaceBetween size="s">
        <Box variant="p">
          <strong>{t('pilotIdentification.businessDriverSelection')}</strong> - {t('pilotIdentification.businessDriverSelectionDescription')}
        </Box>
        
        <Box variant="p">
          <strong>{t('pilotIdentification.compellingEventIdentification')}</strong> - {t('pilotIdentification.compellingEventIdentificationDescription')}
        </Box>
        
        <Box variant="p">
          <strong>{t('pilotIdentification.teamCapabilityMatching')}</strong> - {t('pilotIdentification.teamCapabilityMatchingDescription')}
        </Box>
        
        <Box variant="p">
          <strong>{t('pilotIdentification.applicationGrouping')}</strong> - {t('pilotIdentification.applicationGroupingDescription')}
        </Box>
        
        <Box variant="p">
          <strong>{t('pilotIdentification.advancedFiltering')}</strong> - {t('pilotIdentification.advancedFilteringDescription')}
        </Box>
      </SpaceBetween>
      
      <Box variant="h3">{t('pilotIdentification.howToUse')}</Box>
      
      <SpaceBetween size="s">
        <Box variant="p">
          <strong>{t('pilotIdentification.step1')}</strong> - {t('pilotIdentification.step1Description')}
        </Box>
        
        <Box variant="p">
          <strong>{t('pilotIdentification.step2')}</strong> - {t('pilotIdentification.step2Description')}
        </Box>
        
        <Box variant="p">
          <strong>{t('pilotIdentification.step3')}</strong> - {t('pilotIdentification.step3Description')}
        </Box>
        
        <Box variant="p">
          <strong>{t('pilotIdentification.step4')}</strong> - {t('pilotIdentification.step4Description')}
        </Box>
        
        <Box variant="p">
          <strong>{t('pilotIdentification.step5')}</strong> - {t('pilotIdentification.step5Description')}
        </Box>
        
        <Box variant="p">
          <strong>{t('pilotIdentification.step6')}</strong> - {t('pilotIdentification.step6Description')}
        </Box>
      </SpaceBetween>
      
      <Box variant="h3">{t('pilotIdentification.bestPractices')}</Box>
      
      <SpaceBetween size="s">
        <Box variant="p">
          <strong>{t('pilotIdentification.startSmall')}</strong> - {t('pilotIdentification.startSmallDescription')}
        </Box>
        
        <Box variant="p">
          <strong>{t('pilotIdentification.considerDependencies')}</strong> - {t('pilotIdentification.considerDependenciesDescription')}
        </Box>
        
        <Box variant="p">
          <strong>{t('pilotIdentification.balanceFactors')}</strong> - {t('pilotIdentification.balanceFactorsDescription')}
        </Box>
        
        <Box variant="p">
          <strong>{t('pilotIdentification.lookForPatterns')}</strong> - {t('pilotIdentification.lookForPatternsDescription')}
        </Box>
        
        <Box variant="p">
          <strong>{t('pilotIdentification.validateWithStakeholders')}</strong> - {t('pilotIdentification.validateWithStakeholdersDescription')}
        </Box>
      </SpaceBetween>
    </SpaceBetween>
  );
};

export default PilotIdentificationInfoContent;
