import React from 'react';
import { withTranslation } from 'react-i18next';
import { Alert, Box, Button, Container, SpaceBetween } from '@cloudscape-design/components';

/**
 * Error boundary component specifically for the DataProcessingPage
 * This component catches errors that occur in the DataProcessingPage component tree
 * and displays a user-friendly error message with a retry button
 */
class DataProcessingErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Check if this is a ResizeObserver or ref-related error
    if (error && error.message && 
        (error.message.includes('ResizeObserver') || 
         error.message.includes('getBoundingClientRect') ||
         error.message.includes('ref.current'))) {
      // For these specific errors, we'll still show the fallback UI
      // but we'll provide more specific guidance
      return { 
        hasError: true, 
        error,
        isResizeError: true 
      };
    }
    
    // For other errors, show the generic fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console
    console.error('DataProcessingPage error:', error, errorInfo);
  }

  handleRetry = () => {
    // Reset the error state to trigger a re-render
    this.setState({ hasError: false, error: null });
    
    // Force a page reload if this was a resize-related error
    if (this.state.isResizeError) {
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      // If a fallback component is provided, use it
      if (this.props.fallback) {
        return React.cloneElement(this.props.fallback, {
          onRetry: this.handleRetry,
          error: this.state.error
        });
      }
      
      // Otherwise, render the default fallback UI
      return (
        <Container>
          <Box padding="l">
            <SpaceBetween size="l">
              <Alert
                type="error"
                header={this.props.t('components:errors.somethingWentWrong')}
                action={
                  <Button onClick={this.handleRetry}>
                    {this.state.isResizeError ? "Reload Page" : "Retry"}
                  </Button>
                }
              >
                {this.state.isResizeError ? 
                  "An error occurred with the page layout. This is often caused by a temporary issue with the browser's rendering engine." :
                  "An error occurred while loading the Data Processing page. Please try again."}
                
                {this.state.error && (
                  <Box variant="p" color="text-status-error">
                    {this.props.t('components:dataProcessingErrorBoundary.errorDetails')} {this.state.error.toString()}
                  </Box>
                )}
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

export default withTranslation()(DataProcessingErrorBoundary);
