import React from 'react';
import { Button, Box } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

function InfoButton({ onClick, toolsOpen }) {
  const { t } = useTranslation(['components', 'common']);
  
  return (
    <Box textAlign="right">
      <Button
        variant="icon"
        iconName={toolsOpen ? "close" : "status-info"}
        onClick={onClick}
        ariaLabel={toolsOpen ? t('components:infoButton.closeInformationPanel') : t('components:infoButton.openInformationPanel')}
      />
    </Box>
  );
}

export default InfoButton;
