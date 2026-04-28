import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * A simple fallback component for the DataProcessingPage
 * This component doesn't use any complex components that might trigger ResizeObserver errors
 */
const SimpleFallback = ({ onRetry }) => {
  const { t } = useTranslation(['components', 'common']);
  
  const containerStyle = {
    padding: '20px',
    maxWidth: '800px',
    margin: '0 auto',
    fontFamily: 'Amazon Ember, Helvetica, Arial, sans-serif'
  };
  
  const headerStyle = {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '16px',
    color: '#16191f'
  };
  
  const messageStyle = {
    fontSize: '16px',
    lineHeight: '1.5',
    marginBottom: '24px',
    color: '#16191f'
  };
  
  const buttonStyle = {
    backgroundColor: '#0972d3',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    padding: '8px 16px',
    fontSize: '14px',
    cursor: 'pointer',
    fontWeight: 'bold'
  };
  
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };
  
  return (
    <div style={containerStyle}>
      <div style={headerStyle}>{t('components:simpleFallback.dataProcessing')}</div>
      <div style={messageStyle}>
        {t('components:simpleFallback.pageUnavailable')}
      </div>
      <button style={buttonStyle} onClick={handleRetry}>
        {t('components:simpleFallback.reloadPage')}
      </button>
    </div>
  );
};

export default SimpleFallback;
