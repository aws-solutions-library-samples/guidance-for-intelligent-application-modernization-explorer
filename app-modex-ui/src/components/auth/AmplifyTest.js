/**
 * Amplify Test Component
 * Tests Amplify configuration for Hosted UI
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  SpaceBetween,
  Alert,
  TextContent,
  ExpandableSection,
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import { Amplify } from 'aws-amplify';
import { getCurrentUser } from 'aws-amplify/auth';

const AmplifyTest = () => {
  const { t } = useTranslation(['components', 'common']);
  const [testResults, setTestResults] = useState({});
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    runBasicTests();
  }, []);

  const runBasicTests = async () => {
    setTesting(true);
    const results = {};

    // Test 1: Check Amplify configuration
    try {
      const config = Amplify.getConfig();
      results.amplifyConfig = {
        success: true,
        data: {
          userPoolId: config.Auth?.Cognito?.userPoolId,
          userPoolClientId: config.Auth?.Cognito?.userPoolClientId,
          region: config.Auth?.Cognito?.region,
          oauthDomain: config.Auth?.Cognito?.loginWith?.oauth?.domain,
          redirectSignIn: config.Auth?.Cognito?.loginWith?.oauth?.redirectSignIn,
          redirectSignOut: config.Auth?.Cognito?.loginWith?.oauth?.redirectSignOut,
        },
        message: t('components:auth.amplifyConfigLoaded')
      };
    } catch (error) {
      results.amplifyConfig = {
        success: false,
        error: error.message,
        message: t('components:auth.failedToGetAmplifyConfig')
      };
    }

    // Test 2: Check OAuth configuration
    try {
      const config = Amplify.getConfig();
      const oauthConfig = config.Auth?.Cognito?.loginWith?.oauth;
      
      if (oauthConfig && oauthConfig.domain && oauthConfig.redirectSignIn) {
        results.oauthConfig = {
          success: true,
          data: {
            domain: oauthConfig.domain,
            scopes: oauthConfig.scopes,
            redirectSignIn: oauthConfig.redirectSignIn,
            redirectSignOut: oauthConfig.redirectSignOut,
            responseType: oauthConfig.responseType,
          },
          message: 'OAuth configuration is valid for Hosted UI'
        };
      } else {
        results.oauthConfig = {
          success: false,
          message: 'OAuth configuration is missing or invalid',
          data: oauthConfig
        };
      }
    } catch (error) {
      results.oauthConfig = {
        success: false,
        error: error.message,
        message: 'Failed to check OAuth configuration'
      };
    }

    // Test 3: Check current user (should fail if not authenticated)
    try {
      const user = await getCurrentUser();
      results.currentUser = {
        success: true,
        data: {
          username: user.username,
          userId: user.userId,
          attributes: user.attributes
        },
        message: 'User is currently authenticated'
      };
    } catch (error) {
      results.currentUser = {
        success: false,
        error: error.message,
        message: 'No user currently authenticated (this is expected if not signed in)'
      };
    }

    setTestResults(results);
    setTesting(false);
  };

  const renderTestResult = (testName, result) => {
    return (
      <Box key={testName} margin={{ bottom: 'm' }}>
        <Alert
          type={result.success ? 'success' : 'error'}
          header={`${testName}: ${result.message}`}
        >
          {result.error && <p><strong>{t('common:error')}:</strong> {result.error}</p>}
          {result.data && (
            <ExpandableSection headerText={t('components:auth.details')} variant="footer">
              <pre style={{ fontSize: '12px', overflow: 'auto' }}>
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </ExpandableSection>
          )}
        </Alert>
      </Box>
    );
  };

  if (process.env.REACT_APP_DEBUG_MODE !== 'true') {
    return null;
  }

  return (
    <Box margin={{ top: 'l' }}>
      <ExpandableSection headerText={t('components:auth.amplifyTestHeader')} variant="footer">
        <SpaceBetween size="m">
          <Box>
            <TextContent>
              <h4>{t('components:auth.amplifyTestTitle')}</h4>
              <p>{t('components:auth.amplifyTestDescription')}</p>
            </TextContent>
          </Box>

          <Button
            onClick={runBasicTests}
            loading={testing}
            variant="primary"
          >
            {t('components:auth.runTests')}
          </Button>

          {Object.keys(testResults).length > 0 && (
            <Box>
              {Object.entries(testResults).map(([testName, result]) =>
                renderTestResult(testName, result)
              )}
            </Box>
          )}
        </SpaceBetween>
      </ExpandableSection>
    </Box>
  );
};

export default AmplifyTest;
