import React from 'react';
import { Box, SpaceBetween } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

function DefaultInfoContent() {
  const { t } = useTranslation(['info', 'common']);

  return (
    <Box padding="l">
      <SpaceBetween size="l">
        <Header variant="h2">{t('default.title')}</Header>
        <Box variant="p">
          {t('default.description')}
        </Box>
      </SpaceBetween>
    </Box>
  );
}

export default DefaultInfoContent;
