/**
 * Authenticated Top Navigation Component
 * Shows user profile and logout functionality for authenticated users
 */

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  TopNavigation,
} from '@cloudscape-design/components';
import { useSimpleAuth } from '../../contexts/SimpleAuthContext';
import { useTheme } from '../../contexts/ThemeContext';

const AuthenticatedTopNav = ({ title = "App-ModEx" }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut, isAuthenticated } = useSimpleAuth();
  const { theme, toggleTheme } = useTheme();

  const handleSignOut = () => {
    signOut();
  };

  // Get user display information
  const getDisplayName = () => {
    if (!user) return 'User';
    
    if (user.attributes?.given_name && user.attributes?.family_name) {
      return `${user.attributes.given_name} ${user.attributes.family_name}`;
    }
    if (user.attributes?.name) {
      return user.attributes.name;
    }
    return user.username || 'User';
  };

  const getEmail = () => {
    return user?.attributes?.email || '';
  };

  // Determine navigation href based on current context
  const getNavigationHref = () => {
    const selectedProject = localStorage.getItem('selectedProject');
    if (selectedProject && location.pathname !== '/projects') {
      return '/home';
    }
    return '/projects';
  };

  const handleNavigation = (e) => {
    e.preventDefault();
    const href = getNavigationHref();
    navigate(href);
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <TopNavigation
      identity={{
        href: getNavigationHref(),
        title: title,
        logo: {
          src: "/logo.svg",
          alt: "App-ModEx"
        },
        onFollow: handleNavigation
      }}
      utilities={[
        {
          type: "button",
          iconName: theme === 'dark' ? 'view-full' : 'view-horizontal',
          title: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
          ariaLabel: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
          onClick: toggleTheme
        },
        {
          type: "menu-dropdown",
          text: getDisplayName(),
          description: getEmail(),
          iconName: "user-profile",
          items: [
            {
              id: "profile",
              text: "Profile",
              disabled: true
            },
            {
              id: "settings",
              text: "Settings",
              disabled: true
            },
            {
              id: "divider",
              itemType: "divider"
            },
            {
              id: "signout",
              text: "Sign out"
            }
          ],
          onItemClick: ({ detail }) => {
            if (detail.id === 'signout') {
              handleSignOut();
            }
          }
        }
      ]}
    />
  );
};

export default AuthenticatedTopNav;
