import React from 'react';
import { withTranslation } from 'react-i18next';

/**
 * Error Boundary specifically for ResizeObserver errors
 * This component catches and suppresses ResizeObserver-related errors
 */
class ResizeObserverErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    // Check if this is a ResizeObserver error
    if (error && error.message && 
        (error.message.includes('ResizeObserver loop') ||
         error.message.includes('handleError') ||
         error.message.includes('deliverResizeLoopError'))) {
      // Don't update state for ResizeObserver errors - just ignore them
      return null;
    }
    
    // For other errors, update state to show fallback UI and store the error
    return { hasError: true, error: error };
  }

  componentDidCatch(error, errorInfo) {
    // Check if this is a ResizeObserver error
    if (error && error.message && 
        (error.message.includes('ResizeObserver loop') ||
         error.message.includes('handleError') ||
         error.message.includes('deliverResizeLoopError'))) {
      // Silently ignore ResizeObserver errors
      return;
    }
    
    // Log other errors
    console.error('Error caught by ResizeObserverErrorBoundary:', error, errorInfo);
  }

  render() {
    const { t } = this.props;
    
    if (this.state.hasError) {
      // Fallback UI for non-ResizeObserver errors
      return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <h3>{t('components:errorBoundary.somethingWentWrong')}</h3>
          <p>{t('components:errorBoundary.pleaseRefresh')}</p>
          <details style={{ marginTop: '10px', textAlign: 'left' }}>
            <summary>{t('components:errorBoundary.errorDetails')}</summary>
            <pre style={{ background: '#f5f5f5', padding: '10px', overflow: 'auto' }}>
              {this.state.error ? this.state.error.toString() : t('components:errorBoundary.noErrorDetails')}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

export default withTranslation(['components', 'common'])(ResizeObserverErrorBoundary);
