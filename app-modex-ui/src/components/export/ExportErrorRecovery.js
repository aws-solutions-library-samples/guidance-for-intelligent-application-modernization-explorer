import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  SpaceBetween,
  StatusIndicator,
  Modal,
  Textarea,
  FormField,
  Link
} from '@cloudscape-design/components';
import { generateErrorReport, getStoredErrorLogs } from '../../utils/exportErrorLogger';

/**
 * Export Error Recovery Component
 * Provides user-friendly error recovery options and support tools
 */
const ExportErrorRecovery = ({ 
  error, 
  onRetry, 
  onDismiss, 
  context = 'export',
  showAdvancedOptions = false 
}) => {
  const { t } = useTranslation(['components', 'common']);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [errorReport, setErrorReport] = useState('');

  // Determine error type and recovery suggestions
  const getErrorInfo = () => {
    if (!error) return null;

    const message = error.message?.toLowerCase() || '';
    const status = error.status;

    // Network connectivity issues
    if (message.includes('network') || message.includes('connection') || status === 0) {
      return {
        type: 'network',
        title: 'Connection Problem',
        description: 'Unable to connect to the export service.',
        suggestions: [
          'Check your internet connection',
          'Try refreshing the page',
          'Disable VPN if you\'re using one',
          'Contact your IT administrator if the problem persists'
        ],
        canRetry: true,
        severity: 'medium'
      };
    }

    // Authentication issues
    if (status === 401 || message.includes('auth') || message.includes('token')) {
      return {
        type: 'auth',
        title: 'Authentication Required',
        description: 'Your session has expired or authentication failed.',
        suggestions: [
          'Log out and log back in',
          'Refresh the page to renew your session',
          'Clear your browser cache and cookies',
          'Contact support if you continue having login issues'
        ],
        canRetry: false,
        severity: 'high'
      };
    }

    // Permission issues
    if (status === 403 || message.includes('permission') || message.includes('forbidden')) {
      return {
        type: 'permission',
        title: 'Access Denied',
        description: 'You don\'t have permission to perform this export operation.',
        suggestions: [
          'Contact your administrator to request export permissions',
          'Verify you\'re logged in with the correct account',
          'Try selecting different export categories you have access to'
        ],
        canRetry: false,
        severity: 'high'
      };
    }

    // Rate limiting
    if (status === 429 || message.includes('rate limit') || message.includes('too many')) {
      return {
        type: 'rate_limit',
        title: 'Too Many Requests',
        description: 'You\'ve made too many export requests in a short time.',
        suggestions: [
          'Wait a few minutes before trying again',
          'Reduce the number of categories in your export',
          'Contact support if you need higher rate limits'
        ],
        canRetry: true,
        severity: 'medium'
      };
    }

    // Server errors
    if (status >= 500) {
      return {
        type: 'server',
        title: 'Service Unavailable',
        description: 'The export service is temporarily unavailable.',
        suggestions: [
          'Wait a few minutes and try again',
          'Check the system status page',
          'Contact support if the problem persists',
          'Try again during off-peak hours'
        ],
        canRetry: true,
        severity: 'high'
      };
    }

    // Timeout issues
    if (status === 408 || message.includes('timeout')) {
      return {
        type: 'timeout',
        title: 'Request Timeout',
        description: 'The export request took too long to process.',
        suggestions: [
          'Try selecting fewer categories to reduce export size',
          'Wait a moment and try again',
          'Check your internet connection speed',
          'Contact support for large dataset exports'
        ],
        canRetry: true,
        severity: 'medium'
      };
    }

    // Generic error
    return {
      type: 'generic',
      title: 'Export Error',
      description: 'An unexpected error occurred during the export process.',
      suggestions: [
        'Try refreshing the page and attempting the export again',
        'Clear your browser cache and try again',
        'Try using a different browser',
        'Contact support if the problem continues'
      ],
      canRetry: true,
      severity: 'medium'
    };
  };

  const errorInfo = getErrorInfo();

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    }
  };

  const handleShowSupport = () => {
    // Generate error report
    const logs = getStoredErrorLogs();
    const latestError = logs[logs.length - 1];
    
    if (latestError) {
      const report = generateErrorReport(latestError.metadata.errorId);
      setErrorReport(report);
    } else {
      setErrorReport(`
Export Error Report
==================

Error: ${error.message || 'Unknown error'}
Context: ${context}
Timestamp: ${new Date().toISOString()}
URL: ${window.location.href}

Please include this information when contacting support.
      `.trim());
    }
    
    setShowSupportModal(true);
  };

  const handleContactSupport = () => {
    const subject = encodeURIComponent(`Export Error - ${errorInfo?.title || 'Need Assistance'}`);
    const body = encodeURIComponent(errorReport);
    const supportEmail = 'support@example.com';
    
    window.open(`mailto:${supportEmail}?subject=${subject}&body=${body}`);
  };

  const copyErrorReport = async () => {
    try {
      await navigator.clipboard.writeText(errorReport);
      // Could show a toast notification here
      console.log('Error report copied to clipboard');
    } catch (err) {
      console.warn('Failed to copy to clipboard:', err);
      // Fallback: select the text
      const textarea = document.querySelector('#error-report-textarea');
      if (textarea) {
        textarea.select();
      }
    }
  };

  if (!errorInfo) return null;

  return (
    <>
      <Alert
        type="error"
        header={errorInfo.title}
        action={
          <SpaceBetween direction="horizontal" size="xs">
            {errorInfo.canRetry && (
              <Button onClick={handleRetry} variant="primary">
                {t('components:exportError.tryAgain')}
              </Button>
            )}
            <Button onClick={handleShowSupport} variant="normal">
              {t('components:exportError.getHelp')}
            </Button>
            {onDismiss && (
              <Button onClick={onDismiss} variant="link">
                {t('components:exportError.dismiss')}
              </Button>
            )}
          </SpaceBetween>
        }
      >
        <SpaceBetween size="m">
          <Box>{errorInfo.description}</Box>
          
          <Box>
            <Box variant="h5" margin={{ bottom: 'xs' }}>
              {t('components:exportError.whatYouCanTry')}
            </Box>
            <ul>
              {errorInfo.suggestions.map((suggestion, index) => (
                <li key={index}>{suggestion}</li>
              ))}
            </ul>
          </Box>

          <SpaceBetween direction="horizontal" size="xs" alignItems="center">
            <StatusIndicator type="error">
              {t('components:exportError.errorType')}: {errorInfo.type}
            </StatusIndicator>
            {showAdvancedOptions && (
              <Link
                variant="secondary"
                onFollow={() => setShowErrorDetails(!showErrorDetails)}
              >
                {showErrorDetails ? 'Hide' : 'Show'} technical details
              </Link>
            )}
          </SpaceBetween>

          {showErrorDetails && showAdvancedOptions && (
            <Box>
              <Box variant="h5" margin={{ bottom: 'xs' }}>
                {t('components:exportError.technicalDetails')}
              </Box>
              <Box variant="code" fontSize="body-s">
                <div>{t('components:exportError.message')}: {error.message}</div>
                {error.status && <div>{t('components:exportError.status')}: {error.status}</div>}
                {error.name && <div>{t('components:exportError.type')}: {error.name}</div>}
                {error.context && <div>{t('components:exportError.context')}: {error.context}</div>}
              </Box>
            </Box>
          )}
        </SpaceBetween>
      </Alert>

      <Modal
        visible={showSupportModal}
        onDismiss={() => setShowSupportModal(false)}
        header={t('components:auth.contactSupport')}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button onClick={() => setShowSupportModal(false)}>
                {t('components:exportError.cancel')}
              </Button>
              <Button onClick={copyErrorReport} variant="normal">
                {t('components:exportError.copyReport')}
              </Button>
              <Button onClick={handleContactSupport} variant="primary">
                {t('components:exportError.sendEmail')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <Box>
            {t('components:exportError.weAreHereToHelp')}
          </Box>
          
          <FormField
            label={t('components:auth.errorReport')}
            description={t('components:auth.errorReportDescription')}
          >
            <Textarea
              id="error-report-textarea"
              value={errorReport}
              onChange={({ detail }) => setErrorReport(detail.value)}
              rows={12}
              placeholder="Generating error report..."
            />
          </FormField>
          
          <Box variant="small" color="text-status-info">
            {t('components:exportError.youCanEditThisReport')}
          </Box>
        </SpaceBetween>
      </Modal>
    </>
  );
};

export default ExportErrorRecovery;