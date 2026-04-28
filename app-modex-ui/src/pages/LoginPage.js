import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Form,
  Header,
  SpaceBetween,
  Button,
  Input,
  FormField,
  Box,
  Alert
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

function LoginPage() {
  const { t } = useTranslation(['pages', 'common']);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      // For demo purposes, accept any non-empty username/password
      if (username.trim() && password.trim()) {
        // Store authentication state and username
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('username', username);
        
        // Navigate to projects list
        navigate('/projects');
      } else {
        setError(t('pages:login.invalidCredentials'));
      }
      setLoading(false);
    }, 1000);
  };

  return (
    <Box padding="xxl" textAlign="center">
      <Container>
        <form onSubmit={handleLogin}>
          <SpaceBetween size="l">
            <Header 
              variant="h1"
              description={t('pages:login.appDescription')}
            >
              {t('pages:login.appModExLogin')}
            </Header>
            
            {error && <Alert type="error" header={t('pages:login.error')}>{error}</Alert>}
            
            <FormField label={t('pages:login.username')}>
              <Input
                type="text"
                value={username}
                onChange={({ detail }) => setUsername(detail.value)}
                placeholder={t('pages:login.enterUsername')}
                disabled={loading}
              />
            </FormField>
            
            <FormField label={t('pages:login.password')}>
              <Input
                type="password"
                value={password}
                onChange={({ detail }) => setPassword(detail.value)}
                placeholder={t('pages:login.enterPassword')}
                disabled={loading}
              />
            </FormField>
            
            <Button 
              variant="primary" 
              formAction="submit"
              loading={loading}
            >
              {t('pages:login.login')}
            </Button>
          </SpaceBetween>
        </form>
      </Container>
    </Box>
  );
}

export default LoginPage;
