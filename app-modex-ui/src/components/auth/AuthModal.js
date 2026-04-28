import React, { useState } from 'react';
import LoginModal from './LoginModal';
import ChangePasswordModal from './ChangePasswordModal';

const AuthModal = ({
  visible,
  onDismiss,
  onAuthSuccess,
}) => {
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [tempCredentials, setTempCredentials] = useState({ username: '', password: '' });

  const handleLoginSuccess = () => {
    onAuthSuccess?.();
  };

  const handleNeedPasswordChange = (username, tempPassword) => {
    setTempCredentials({ username, password: tempPassword });
    setShowPasswordChange(true);
  };

  const handlePasswordChanged = () => {
    setShowPasswordChange(false);
    setTempCredentials({ username: '', password: '' });
    onAuthSuccess?.();
  };

  const handleDismiss = () => {
    setShowPasswordChange(false);
    setTempCredentials({ username: '', password: '' });
    onDismiss();
  };

  if (showPasswordChange) {
    return (
      <ChangePasswordModal
        visible={visible}
        onDismiss={handleDismiss}
        username={tempCredentials.username}
        tempPassword={tempCredentials.password}
        onPasswordChanged={handlePasswordChanged}
      />
    );
  }

  return (
    <LoginModal
      visible={visible}
      onDismiss={handleDismiss}
      onLoginSuccess={handleLoginSuccess}
      onNeedPasswordChange={handleNeedPasswordChange}
    />
  );
};

export default AuthModal;