import React from 'react';
import { Alert, Box, Button, Container, SpaceBetween, StatusIndicator } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

/**
 * Hook to provide translations for error boundary
 */
const useErrorBoundaryTranslations = () => {
  const { t } = useTranslation(['components', 'common']);
  return { t };
};

/**
 * Wrapper component to provide translations to class component
 */
const ExportErrorBoundaryWrapper = (props) => {
  const { t } = useErrorBoundaryTranslations();
  return <ExportErrorBoundaryClass {...props} t={t} />;
};

/**
 * Error boundary component specifically for export functionality
 * Catches errors that occur in export components and displays user-friendly error messages
 * with appropriate recovery suggestions based on error type
 */
class ExportErrorBoundaryClass extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error for monitoring and debugging
    this.logError(error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
      hasError: true
    });
  }

  /**
   * Log error details for monitoring and debugging
   */
  logError = (error, errorInfo) => {
    const errorDetails = {
      message: error?.message || 'Unknown error',
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      retryCount: this.state.retryCount,
      exportContext: this.props.context || 'unknown'
    };

    // Log to console for development
    console.error('Export Error Boundary caught an error:', errorDetails);

    // In production, this would send to monitoring service
    if (process.env.NODE_ENV === 'production') {
      // Example: Send to monitoring service
      // monitoringService.logError('export_error_boundary', errorDetails);
    }

    // Store error in session storage for debugging
    try {
      const existingErrors = JSON.parse(sessionStorage.getItem('export_errors') || '[]');
      existingErrors.push(errorDetails);
      // Keep only last 10 errors
      if (existingErrors.length > 10) {
        existingErrors.splice(0, existingErrors.length - 10);
      }
      sessionStorage.setItem('export_errors', JSON.stringify(existingErrors));
    } catch (storageError) {
      console.warn('Failed to store error in session storage:', storageError);
    }
  };

  /**
   * Determine error type and appropriate recovery action
   */
  getErrorType = (error) => {
    const message = error?.message?.toLowerCase() || '';
    
    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      return 'network';
    }
    if (message.includes('auth') || message.includes('unauthorized') || message.includes('forbidden')) {
      return 'auth';
    }
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'timeout';
    }
    if (message.includes('resizeobserver') || message.includes('resize')) {
      return 'resize';
    }
    if (message.includes('permission') || message.includes('access denied')) {
      return 'permission';
    }
    if (message.includes('quota') || message.includes('limit exceeded')) {
      return 'quota';
    }
    
    return 'generic';
  };

  /**
   * Get user-friendly error message and recovery suggestions
   */
  getErrorMessage = (errorType, error) => {
    const { t } = this.props;
    const messages = {
      network: {
        title: t('components:exportErrorBoundary.networkError.title'),
        message: t('components:exportErrorBoundary.networkError.message'),
        suggestions: [
          t('components:exportErrorBoundary.networkError.suggestion1'),
          t('components:exportErrorBoundary.networkError.suggestion2'),
          t('components:exportErrorBoundary.networkError.suggestion3')
        ],
        action: t('components:exportErrorBoundary.networkError.action')
      },
      auth: {
        title: t('components:exportErrorBoundary.authError.title'),
        message: t('components:exportErrorBoundary.authError.message'),
        suggestions: [
          t('components:exportErrorBoundary.authError.suggestion1'),
          t('components:exportErrorBoundary.authError.suggestion2'),
          t('components:exportErrorBoundary.authError.suggestion3')
        ],
        action: t('components:exportErrorBoundary.authError.action')
      },
      timeout: {
        title: t('components:exportErrorBoundary.timeoutError.title'),
        message: t('components:exportErrorBoundary.timeoutError.message'),
        suggestions: [
          t('components:exportErrorBoundary.timeoutError.suggestion1'),
          t('components:exportErrorBoundary.timeoutError.suggestion2'),
          t('components:exportErrorBoundary.timeoutError.suggestion3')
        ],
        action: t('components:exportErrorBoundary.timeoutError.action')
      },
      resize: {
        title: t('components:exportErrorBoundary.resizeError.title'),
        message: t('components:exportErrorBoundary.resizeError.message'),
        suggestions: [
          t('components:exportErrorBoundary.resizeError.suggestion1'),
          t('components:exportErrorBoundary.resizeError.suggestion2')
        ],
        action: t('components:exportErrorBoundary.resizeError.action')
      },
      permission: {
        title: t('components:exportErrorBoundary.permissionError.title'),
        message: t('components:exportErrorBoundary.permissionError.message'),
        suggestions: [
          t('components:exportErrorBoundary.permissionError.suggestion1'),
          t('components:exportErrorBoundary.permissionError.suggestion2'),
          t('components:exportErrorBoundary.permissionError.suggestion3')
        ],
        action: t('components:exportErrorBoundary.permissionError.action')
      },
      quota: {
        title: t('components:exportErrorBoundary.quotaError.title'),
        message: t('components:exportErrorBoundary.quotaError.message'),
        suggestions: [
          t('components:exportErrorBoundary.quotaError.suggestion1'),
          t('components:exportErrorBoundary.quotaError.suggestion2'),
          t('components:exportErrorBoundary.quotaError.suggestion3')
        ],
        action: t('components:exportErrorBoundary.quotaError.action')
      },
      generic: {
        title: t('components:exportErrorBoundary.genericError.title'),
        message: t('components:exportErrorBoundary.genericError.message'),
        suggestions: [
          t('components:exportErrorBoundary.genericError.suggestion1'),
          t('components:exportErrorBoundary.genericError.suggestion2'),
          t('components:exportErrorBoundary.genericError.suggestion3')
        ],
        action: t('components:exportErrorBoundary.genericError.action')
      }
    };

    return messages[errorType] || messages.generic;
  };

  /**
   * Handle retry action based on error type
   */
  handleRetry = () => {
    const errorType = this.getErrorType(this.state.error);
    
    this.setState(prevState => ({
      retryCount: prevState.retryCount + 1
    }));

    if (errorType === 'auth' || errorType === 'resize') {
      // For auth and resize errors, refresh the page
      window.location.reload();
    } else {
      // For other errors, reset the error boundary state
      this.setState({ 
        hasError: false, 
        error: null, 
        errorInfo: null 
      });
      
      // Call parent retry handler if provided
      if (this.props.onRetry) {
        this.props.onRetry();
      }
    }
  };

  /**
   * Handle contact support action
   */
  handleContactSupport = () => {
    const errorDetails = {
      error: this.state.error?.message,
      timestamp: new Date().toISOString(),
      context: this.props.context,
      retryCount: this.state.retryCount
    };

    // In a real application, this would open a support ticket or email
    const supportEmail = 'support@example.com';
    const subject = encodeURIComponent('Export Error - Need Assistance');
    const body = encodeURIComponent(`
I encountered an error while using the export functionality:

Error: ${errorDetails.error}
Time: ${errorDetails.timestamp}
Context: ${errorDetails.context}
Retry Attempts: ${errorDetails.retryCount}

Please assist me with resolving this issue.
    `);

    window.open(`mailto:${supportEmail}?subject=${subject}&body=${body}`);
  };

  render() {
    const { t } = this.props;
    
    if (this.state.hasError) {
      const errorType = this.getErrorType(this.state.error);
      const errorMessage = this.getErrorMessage(errorType, this.state.error);
      
      // If a custom fallback component is provided, use it
      if (this.props.fallback) {
        return React.cloneElement(this.props.fallback, {
          onRetry: this.handleRetry,
          onContactSupport: this.handleContactSupport,
          error: this.state.error,
          errorType,
          errorMessage
        });
      }

      // Default fallback UI
      return (
        <Container>
          <Box padding="l">
            <SpaceBetween size="l">
              <Alert
                type="error"
                header={errorMessage.title}
                action={
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button 
                      onClick={this.handleRetry}
                      variant="primary"
                    >
                      {errorMessage.action}
                    </Button>
                    {errorType === 'permission' || errorType === 'quota' ? (
                      <Button 
                        onClick={this.handleContactSupport}
                        variant="normal"
                      >
                        {t('components:exportErrorBoundary.contactSupport')}
                      </Button>
                    ) : null}
                  </SpaceBetween>
                }
              >
                <SpaceBetween size="m">
                  <Box>{errorMessage.message}</Box>
                  
                  <Box>
                    <Box variant="h5" margin={{ bottom: 'xs' }}>
                      {t('components:exportErrorBoundary.whatYouCanTry')}
                    </Box>
                    <ul>
                      {errorMessage.suggestions.map((suggestion, index) => (
                        <li key={index}>{suggestion}</li>
                      ))}
                    </ul>
                  </Box>

                  {this.state.retryCount > 0 && (
                    <Box>
                      <StatusIndicator type="info">
                        {t('components:exportErrorBoundary.retryAttempts', { count: this.state.retryCount })}
                      </StatusIndicator>
                    </Box>
                  )}

                  {process.env.NODE_ENV === 'development' && (
                    <Box>
                      <Box variant="h5" margin={{ bottom: 'xs' }}>
                        {t('components:exportErrorBoundary.errorDetailsDevelopment')}
                      </Box>
                      <Box variant="code" fontSize="body-s">
                        {this.state.error?.message}
                      </Box>
                    </Box>
                  )}
                </SpaceBetween>
              </Alert>
            </SpaceBetween>
          </Box>
        </Container>
      );
    }

    // If there's no error, render children normally
    return this.props.children;
  }
}

export default ExportErrorBoundaryWrapper;