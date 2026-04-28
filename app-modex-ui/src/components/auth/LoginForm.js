import React, { useState } from 'react';
import {
  Container,
  Header,
  Form,
  FormField,
  Input,
  Button,
  Alert,
  SpaceBetween,
  Box,
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import { signIn } from 'aws-amplify/auth';
import { useSimpleAuth } from '../../contexts/SimpleAuthContext';

const LoginForm = ({
  onLoginSuccess,
  onNeedPasswordChange,
}) => {
  const { t } = useTranslation(['components', 'common']);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { checkAuthState } = useSimpleAuth();

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    // Basic validation
    if (!username.trim() || !password.trim()) {
      setError(t('components:auth.pleaseEnterCredentials'));
      return;
    }
    
    setIsLoading(true);
    setError('');

    try {
      const signInInput = {
        username,
        password,
      };

      const result = await signIn(signInInput);

      if (result.isSignedIn) {
        await checkAuthState();
        onLoginSuccess?.();
      } else if (result.nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        onNeedPasswordChange?.(username, password);
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || t('components:auth.loginError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container>
      <Box textAlign="center" padding="l">
        <Header variant="h1">{t('components:auth.signInToAppModEx')}</Header>
      </Box>
      
      <form onSubmit={handleSubmit}>
        <Form>
          <SpaceBetween direction="vertical" size="l">
            {error && (
              <Alert type="error" dismissible onDismiss={() => setError('')}>
                {error}
              </Alert>
            )}

            <FormField label={t('components:auth.usernameOrEmail')}>
              <Input
                value={username}
                onChange={({ detail }) => setUsername(detail.value)}
                placeholder={t('components:auth.enterUsernameOrEmail')}
                type="text"
                autoComplete="username"
              />
            </FormField>

            <FormField label={t('components:auth.password')}>
              <Input
                value={password}
                onChange={({ detail }) => setPassword(detail.value)}
                placeholder={t('components:auth.enterPassword')}
                type="password"
                autoComplete="current-password"
              />
            </FormField>

            <Button
              variant="primary"
              loading={isLoading}
              formAction="submit"
              fullWidth
            >
              {t('components:auth.signIn')}
            </Button>
          </SpaceBetween>
        </Form>
      </form>
    </Container>
  );
};

export default LoginForm;
