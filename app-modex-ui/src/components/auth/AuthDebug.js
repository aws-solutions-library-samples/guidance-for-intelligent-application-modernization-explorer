/**
 * Authentication Debug Component
 * Shows current authentication state for debugging
 */

import React from 'react';
import {
  Box,
  ExpandableSection,
  StatusIndicator,
  SpaceBetween,
  TextContent,
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import { useSimpleAuth } from '../../contexts/SimpleAuthContext';

const AuthDebug = () => {
  const { t } = useTranslation(['components', 'common']);
  const { user, isAuthenticated, loading } = useSimpleAuth();

  if (process.env.REACT_APP_DEBUG_MODE !== 'true') {
    return null;
  }

  return (
    <Box margin={{ top: 'l' }}>
      <ExpandableSection headerText={t('components:auth.authDebugHeader')} variant="footer">
        <SpaceBetween size="m">
          <Box>
            <TextContent>
              <h4>{t('components:auth.authenticationState')}</h4>
              <p>
                <StatusIndicator 
                  type={isAuthenticated ? 'success' : 'error'}
                >
                  {isAuthenticated ? t('components:auth.authenticated') : t('components:auth.notAuthenticated')}
                </StatusIndicator>
              </p>
              <p><strong>{t('components:auth.loading')}:</strong> {loading ? t('common:yes') : t('common:no')}</p>
            </TextContent>
          </Box>

          {user && (
            <Box>
              <TextContent>
                <h4>{t('components:auth.userInformation')}</h4>
                <p><strong>{t('components:auth.username')}:</strong> {user.username}</p>
                <p><strong>{t('components:auth.userId')}:</strong> {user.userId}</p>
                {user.attributes && (
                  <>
                    <p><strong>{t('components:auth.email')}:</strong> {user.attributes.email}</p>
                    <p><strong>{t('components:auth.emailVerified')}:</strong> {user.attributes.email_verified}</p>
                    {user.attributes.given_name && (
                      <p><strong>{t('components:auth.firstName')}:</strong> {user.attributes.given_name}</p>
                    )}
                    {user.attributes.family_name && (
                      <p><strong>{t('components:auth.lastName')}:</strong> {user.attributes.family_name}</p>
                    )}
                  </>
                )}
              </TextContent>
            </Box>
          )}

          <Box>
            <TextContent>
              <h4>{t('components:auth.environmentConfiguration')}</h4>
              <p><strong>{t('components:auth.userPoolId')}</strong> {process.env.REACT_APP_USER_POOL_ID}</p>
              <p><strong>{t('components:auth.clientId')}</strong> {process.env.REACT_APP_USER_POOL_CLIENT_ID}</p>
              <p><strong>{t('components:auth.region')}:</strong> {process.env.REACT_APP_AWS_REGION}</p>
              <p><strong>{t('components:auth.apiUrl')}:</strong> {process.env.REACT_APP_API_URL}</p>
              <p><strong>{t('components:auth.cognitoDomain')}:</strong> {process.env.REACT_APP_COGNITO_DOMAIN_URL}</p>
              <p><strong>{t('components:auth.useHostedUI')}:</strong> {process.env.REACT_APP_USE_HOSTED_UI}</p>
            </TextContent>
          </Box>

          <Box>
            <TextContent>
              <h4>{t('components:auth.authenticationMethod')}</h4>
              <p>
                <StatusIndicator type="success">
                  {t('components:auth.cognitoHostedUI')}
                </StatusIndicator>
              </p>
              <p><strong>{t('components:auth.benefits')}</strong></p>
              <ul>
                <li>✅ {t('components:auth.noComplexChallengeHandling')}</li>
                <li>✅ {t('components:auth.professionalAwsManagedUI')}</li>
                <li>✅ {t('components:auth.builtInPasswordReset')}</li>
                <li>✅ {t('components:auth.automaticValidation')}</li>
                <li>✅ {t('components:auth.oauthSecurityStandards')}</li>
              </ul>
            </TextContent>
          </Box>
        </SpaceBetween>
      </ExpandableSection>
    </Box>
  );
};

export default AuthDebug;
