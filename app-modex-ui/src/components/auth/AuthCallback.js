/**
 * Auth Callback Component
 * Manual OAuth token exchange for Cognito Hosted UI
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Spinner,
  Alert,
  Container,
  Header,
  SpaceBetween,
  Button,
} from '@cloudscape-design/components';

const AuthCallback = () => {
  const navigate = useNavigate();
  const { t } = useTranslation(['components', 'common']);
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        console.log('🔐 Starting manual OAuth token exchange...');
        setDebugInfo('Checking URL parameters...');
        
        // Check URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');
        const state = urlParams.get('state');
        
        console.log('🔐 URL params:', { code: code?.substring(0, 10) + '...', error, state });
        setDebugInfo(`Code: ${code ? 'Present' : 'Missing'}, Error: ${error || 'None'}`);
        
        if (error) {
          console.error('🔐 OAuth error in URL:', error);
          setStatus('error');
          setError(`OAuth error: ${error}`);
          return;
        }
        
        if (!code) {
          console.error('🔐 No authorization code in URL');
          setStatus('error');
          setError('No authorization code received from Cognito');
          return;
        }
        
        console.log('🔐 Authorization code found, performing manual token exchange...');
        setDebugInfo('Exchanging authorization code for tokens...');
        
        // Manual token exchange with Cognito
        const tokenResponse = await exchangeCodeForTokens(code);
        
        if (tokenResponse.access_token) {
          console.log('🔐 Token exchange successful!');
          setDebugInfo('Tokens received, storing in session...');
          
          // Store tokens in localStorage for now (in production, use secure storage)
          localStorage.setItem('access_token', tokenResponse.access_token);
          localStorage.setItem('id_token', tokenResponse.id_token);
          localStorage.setItem('refresh_token', tokenResponse.refresh_token);
          localStorage.setItem('auth_timestamp', Date.now().toString());
          
          setStatus('success');
          setDebugInfo('Authentication successful!');
          
          // Redirect to projects
          setTimeout(() => {
            console.log('🔐 Redirecting to projects...');
            navigate('/projects');
          }, 1000);
          
        } else {
          console.error('🔐 Token exchange failed - no access token');
          setStatus('error');
          setError('Token exchange failed - no access token received');
          setDebugInfo('Token exchange returned no access token');
        }
        
      } catch (error) {
        console.error('🔐 OAuth callback error:', error);
        setStatus('error');
        setError(`Authentication error: ${error.message}`);
        setDebugInfo(`Error: ${error.message}`);
      }
    };

    handleCallback();
  }, [navigate]);

  const exchangeCodeForTokens = async (code) => {
    const tokenEndpoint = `https://${process.env.REACT_APP_COGNITO_DOMAIN_URL?.replace('https://', '')}/oauth2/token`;
    
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.REACT_APP_USER_POOL_CLIENT_ID,
      code: code,
      redirect_uri: `${window.location.origin}/callback`,
    });
    
    console.log('🔐 Token exchange request:', {
      endpoint: tokenEndpoint,
      client_id: process.env.REACT_APP_USER_POOL_CLIENT_ID,
      redirect_uri: `${window.location.origin}/callback`,
    });
    
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('🔐 Token exchange failed:', response.status, errorText);
      throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
    }
    
    const tokenData = await response.json();
    console.log('🔐 Token exchange response:', {
      access_token: tokenData.access_token ? 'Present' : 'Missing',
      id_token: tokenData.id_token ? 'Present' : 'Missing',
      refresh_token: tokenData.refresh_token ? 'Present' : 'Missing',
    });
    
    return tokenData;
  };

  const renderContent = () => {
    switch (status) {
      case 'processing':
        return (
          <SpaceBetween size="l" alignItems="center">
            <Spinner size="large" />
            <Header variant="h2">{t('components:authCallback.completingAuthentication')}</Header>
            <Box color="text-body-secondary">
              {debugInfo || t('components:authCallback.processingSignIn')}
            </Box>
          </SpaceBetween>
        );
      
      case 'success':
        return (
          <SpaceBetween size="l" alignItems="center">
            <Box color="text-status-success" fontSize="display-l">
              ✅
            </Box>
            <Header variant="h2">{t('components:authCallback.authenticationSuccessful')}</Header>
            <Box color="text-body-secondary">
              {debugInfo}
            </Box>
            <Box color="text-body-secondary">
              {t('components:authCallback.redirectingToProjects')}
            </Box>
          </SpaceBetween>
        );
      
      case 'error':
        return (
          <SpaceBetween size="l">
            <Alert
              type="error"
              header={t('components:authCallback.authenticationFailed')}
              action={
                <Button onClick={() => navigate('/landing')}>
                  {t('components:authCallback.tryAgain')}
                </Button>
              }
            >
              {error}
            </Alert>
            <Box textAlign="center">
              <Box color="text-body-secondary">
                {t('components:authCallback.debugInfo')}: {debugInfo}
              </Box>
              <Box color="text-body-secondary" margin={{ top: 's' }}>
                {t('components:authCallback.checkConsoleForDetails')}
              </Box>
            </Box>
          </SpaceBetween>
        );
      
      default:
        return null;
    }
  };

  return (
    <Box padding="xxl" textAlign="center">
      <Container>
        {renderContent()}
      </Container>
    </Box>
  );
};

export default AuthCallback;
