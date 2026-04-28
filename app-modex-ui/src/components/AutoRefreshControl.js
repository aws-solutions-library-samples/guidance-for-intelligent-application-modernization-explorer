import React from 'react';
import { SpaceBetween, Button, StatusIndicator } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

/**
 * Auto-refresh control component
 * Displays pause/resume and manual refresh buttons
 * Auto-refresh runs at fixed 30-second intervals with smart refresh to prevent flickering
 */
const AutoRefreshControl = ({
  isRefreshing,
  onManualRefresh,
  isPaused,
  onTogglePause
}) => {
  const { t } = useTranslation(['components', 'common']);

  return (
    <SpaceBetween direction="horizontal" size="xs">
      {isRefreshing && (
        <StatusIndicator type="in-progress">Refreshing...</StatusIndicator>
      )}
      
      <Button
        iconName={isPaused ? 'caret-right-filled' : 'pause-filled'}
        variant="icon"
        onClick={onTogglePause}
        ariaLabel={isPaused ? 'Resume auto-refresh' : 'Pause auto-refresh'}
      />
      
      <Button
        iconName="refresh"
        onClick={onManualRefresh}
        loading={isRefreshing}
        ariaLabel="Refresh"
      >
        Refresh
      </Button>
    </SpaceBetween>
  );
};

export default AutoRefreshControl;
