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
import { confirmSignIn } from 'aws-amplify/auth';
import { useSimpleAuth } from '../../contexts/SimpleAuthContext';
import { useTheme } from '../../contexts/ThemeContext';

const ChangePasswordModal = ({
  visible,
  onDismiss,
  username,
  tempPassword,
  onPasswordChanged,
}) => {
  const { t } = useTranslation(['components', 'common']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
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

  const validatePassword = (password) => {
    const errors = [];
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    return errors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    // Basic validation
    if (!newPassword.trim() || !confirmPassword.trim()) {
      setError('Please fill in both password fields');
      return;
    }

    if (!firstName.trim() || !lastName.trim()) {
      setError('Please fill in your first and last name');
      return;
    }
    
    setIsLoading(true);
    setError('');

    // Validate password
    const passwordErrors = validatePassword(newPassword);
    if (passwordErrors.length > 0) {
      setError(passwordErrors.join('. '));
      setIsLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      const result = await confirmSignIn({
        challengeResponse: newPassword,
        options: {
          userAttributes: {
            given_name: firstName.trim(),
            family_name: lastName.trim(),
          },
        },
      });

      if (result.isSignedIn) {
        await checkAuthState();
        onPasswordChanged?.();
      }
    } catch (err) {
      console.error('Password change error:', err);
      setError(err.message || 'An error occurred while changing password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    if (!isLoading) {
      setNewPassword('');
      setConfirmPassword('');
      setFirstName('');
      setLastName('');
      setError('');
      onDismiss();
    }
  };

  return (
    <Modal
      visible={visible}
      onDismiss={handleDismiss}
      size="medium"
      header={<Header variant="h1">{t('components:auth.completeYourProfile')}</Header>}
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
              {t('components:auth.completeSetup')}
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <form onSubmit={handleSubmit}>
        <Form>
          <SpaceBetween direction="vertical" size="l">
            <Box variant="p" color="text-body-secondary">
              {t('components:auth.changePasswordDescription')}
            </Box>

            {error && (
              <Alert type="error" dismissible onDismiss={() => setError('')}>
                {error}
              </Alert>
            )}

            <Alert type="info">
              <Box variant="h4">{t('components:auth.passwordRequirements')}</Box>
              <ul>
                <li>{t('components:auth.passwordMinLength')}</li>
                <li>{t('components:auth.passwordUpperLower')}</li>
                <li>{t('components:auth.passwordNumber')}</li>
                <li>{t('components:auth.passwordSpecialChar')}</li>
              </ul>
            </Alert>

            <FormField label={t('components:auth.firstName')}>
              <Input
                value={firstName}
                onChange={({ detail }) => setFirstName(detail.value)}
                placeholder={t('components:auth.enterFirstName')}
                type="text"
                autoComplete="given-name"
                disabled={isLoading}
              />
            </FormField>

            <FormField label={t('components:auth.lastName')}>
              <Input
                value={lastName}
                onChange={({ detail }) => setLastName(detail.value)}
                placeholder={t('components:auth.enterLastName')}
                type="text"
                autoComplete="family-name"
                disabled={isLoading}
              />
            </FormField>

            <FormField label={t('components:auth.newPassword')}>
              <Input
                value={newPassword}
                onChange={({ detail }) => setNewPassword(detail.value)}
                placeholder={t('components:auth.enterNewPassword')}
                type="password"
                autoComplete="new-password"
                disabled={isLoading}
              />
            </FormField>

            <FormField label={t('components:auth.confirmNewPassword')}>
              <Input
                value={confirmPassword}
                onChange={({ detail }) => setConfirmPassword(detail.value)}
                placeholder={t('components:auth.confirmNewPassword')}
                type="password"
                autoComplete="new-password"
                disabled={isLoading}
              />
            </FormField>
          </SpaceBetween>
        </Form>
      </form>
    </Modal>
  );
};

export default ChangePasswordModal;