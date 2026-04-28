import React, { useState, useEffect } from 'react';
import {
  Modal,
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
import { useTheme } from '../../contexts/ThemeContext';

const LoginModal = ({
  visible,
  onDismiss,
  onLoginSuccess,
  onNeedPasswordChange,
}) => {
  const { t } = useTranslation(['components', 'common']);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { checkAuthState } = useSimpleAuth();
  const { setForceLight } = useTheme();

  // Force light theme when modal is visible
  useEffect(() => {
    if (visible) {
      setForceLight(true);
    } else {
      setForceLight(false);
    }
  }, [visible, setForceLight]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    // Basic validation
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password');
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
      setError(err.message || 'An error occurred during login');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    if (!isLoading) {
      setUsername('');
      setPassword('');
      setError('');
      onDismiss();
    }
  };

  return (
    <Modal
      visible={visible}
      onDismiss={handleDismiss}
      header={<Header variant="h1">{t('components:auth.signInToAppModEx')}</Header>}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={handleDismiss} disabled={isLoading}>
              {t('components:auth.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={isLoading}
              onClick={handleSubmit}
            >
              {t('components:auth.signIn')}
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
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
                disabled={isLoading}
              />
            </FormField>

            <FormField label={t('components:auth.password')}>
              <Input
                value={password}
                onChange={({ detail }) => setPassword(detail.value)}
                placeholder={t('components:auth.enterPassword')}
                type="password"
                autoComplete="current-password"
                disabled={isLoading}
              />
            </FormField>
          </SpaceBetween>
        </Form>
      </form>
    </Modal>
  );
};

export default LoginModal;