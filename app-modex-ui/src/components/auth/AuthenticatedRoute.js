import React, { useState } from 'react';
import { useSimpleAuth } from '../../contexts/SimpleAuthContext';
import LoginForm from './LoginForm';
import ChangePasswordForm from './ChangePasswordForm';
import { Spinner, Box } from '@cloudscape-design/components';

const AuthenticatedRoute = ({ children }) => {
  const { user, loading, isAuthenticated } = useSimpleAuth();
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [tempCredentials, setTempCredentials] = useState(null);

  const handleNeedPasswordChange = (username, tempPassword) => {
    setTempCredentials({ username, tempPassword });
    setShowPasswordChange(true);
  };

  const handlePasswordChanged = () => {
    setShowPasswordChange(false);
    setTempCredentials(null);
  };

  const handleCancelPasswordChange = () => {
    setShowPasswordChange(false);
    setTempCredentials(null);
  };

  if (loading) {
    return (
      <Box textAlign="center" padding="xxl">
        <Spinner size="large" />
      </Box>
    );
  }

  if (!isAuthenticated) {
    if (showPasswordChange && tempCredentials) {
      return (
        <ChangePasswordForm
          username={tempCredentials.username}
          tempPassword={tempCredentials.tempPassword}
          onPasswordChanged={handlePasswordChanged}
          onCancel={handleCancelPasswordChange}
        />
      );
    }

    return (
      <LoginForm
        onNeedPasswordChange={handleNeedPasswordChange}
      />
    );
  }

  return <>{children}</>;
};

export default AuthenticatedRoute;
