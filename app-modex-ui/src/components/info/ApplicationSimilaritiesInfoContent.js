import React from 'react';
import {
  Box,
  SpaceBetween,
  Header
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

/**
 * Info content for the Application Similarities page
 */
const ApplicationSimilaritiesInfoContent = () => {
  const { t } = useTranslation(['info', 'common']);
  
  return (
    <SpaceBetween size="l">
      <Header variant="h2">
        {t('info:applicationSimilarities.title')}
      </Header>

      <Box variant="p">
        {t('info:applicationSimilarities.description')}
      </Box>

      <Header variant="h3">
        {t('info:applicationSimilarities.benefits')}
      </Header>

      <Box variant="p">
        {t('info:applicationSimilarities.benefitsDescription')}
      </Box>

      <ul>
        <li>{t('info:applicationSimilarities.benefit1')}</li>
        <li>{t('info:applicationSimilarities.benefit2')}</li>
        <li>{t('info:applicationSimilarities.benefit3')}</li>
        <li>{t('info:applicationSimilarities.benefit4')}</li>
        <li>{t('info:applicationSimilarities.benefit5')}</li>
      </ul>
    </SpaceBetween>
  );
};

export default ApplicationSimilaritiesInfoContent;
