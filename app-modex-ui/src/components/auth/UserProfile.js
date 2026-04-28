/**
 * User Profile Component
 * Displays authenticated user information and provides logout functionality
 */

import React, { useState } from 'react';
import {
  Box,
  Button,
  SpaceBetween,
  Popover,
  StatusIndicator,
  TextContent,
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const UserProfile = () => {
  const { user, signOut, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation(['components']);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!isAuthenticated() || !user) {
    return null;
  }

  const handleSignOut = async () => {
    setIsSigningOut(true);
    setIsPopoverOpen(false);
    
    const result = await signOut();
    
    if (result.success) {
      // Clear any local storage
      localStorage.removeItem('selectedProject');
      localStorage.removeItem('username');
      
      // Navigate to landing page
      navigate('/landing');
    } else {
      console.error('Sign out failed:', result.error);
    }
    
    setIsSigningOut(false);
  };

  // Get user display information
  const getDisplayName = () => {
    if (user.attributes?.given_name && user.attributes?.family_name) {
      return `${user.attributes.given_name} ${user.attributes.family_name}`;
    }
    if (user.attributes?.name) {
      return user.attributes.name;
    }
    return user.username || 'User';
  };

  const getEmail = () => {
    return user.attributes?.email || '';
  };

  const getUserInitials = () => {
    const name = getDisplayName();
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <Box>
      <Popover
        size="medium"
        position="top"
        triggerType="custom"
        dismissButton={false}
        content={
          <SpaceBetween size="m">
            <Box>
              <TextContent>
                <h4>{t('components:userProfile.signedInAs')}</h4>
                <p><strong>{getDisplayName()}</strong></p>
                {getEmail() && <p>{getEmail()}</p>}
              </TextContent>
            </Box>
            
            <Box>
              <StatusIndicator type="success">
                {t('components:userProfile.authenticated')}
              </StatusIndicator>
            </Box>
            
            <Button
              variant="primary"
              onClick={handleSignOut}
              loading={isSigningOut}
              fullWidth
            >
              {t('components:userProfile.signOut')}
            </Button>
          </SpaceBetween>
        }
      >
        <Button
          variant="icon"
          iconName="user-profile"
          onClick={() => setIsPopoverOpen(!isPopoverOpen)}
          ariaLabel={`User profile for ${getDisplayName()}`}
        >
          <Box
            display="inline-block"
            backgroundColor="background-status-info"
            color="text-status-info"
            borderRadius="50%"
            padding="xs"
            fontSize="body-s"
            fontWeight="bold"
            textAlign="center"
            minWidth="32px"
            minHeight="32px"
            lineHeight="1.2"
          >
            {getUserInitials()}
          </Box>
        </Button>
      </Popover>
    </Box>
  );
};

export default UserProfile;
