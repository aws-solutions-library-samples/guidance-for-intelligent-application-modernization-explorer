import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppLayout,
  Button
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import CustomSideNavigation from '../components/CustomSideNavigation';
import AuthenticatedTopNav from '../components/auth/AuthenticatedTopNav';
import './AppLayout.css';

function Layout({ children, activeHref, infoContent, toolsOpen, onToolsChange }) {
  const { t } = useTranslation(['components', 'common']);
  const navigate = useNavigate();
  const location = useLocation();
  const [navigationOpen, setNavigationOpen] = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);
  
  // Check if we're on the projects list page or login page
  const isProjectsListPage = location.pathname === '/projects';
  const isLoginPage = location.pathname === '/login';
  
  // Load selected project from localStorage
  useEffect(() => {
    const projectData = localStorage.getItem('selectedProject');
    if (projectData) {
      setSelectedProject(JSON.parse(projectData));
    }
  }, [location.pathname]);

  // Close navigation when on projects list page
  useEffect(() => {
    if (isProjectsListPage) {
      setNavigationOpen(false);
    } else {
      setNavigationOpen(true);
    }
  }, [isProjectsListPage]);

  // Don't render the layout for the login page or landing page
  if (isLoginPage || location.pathname === '/landing') {
    return children;
  }

  // Get the title for the top navigation
  const getTopNavTitle = () => {
    // Never show project name on the projects list page
    if (isProjectsListPage) {
      return t('components:layout.appName');
    }
    if (selectedProject) {
      return `${t('components:layout.appName')} - ${selectedProject.name}`;
    }
    return t('components:layout.appName');
  };

  return (
    <>
      <AuthenticatedTopNav title={getTopNavTitle()} />
      
      <AppLayout
        navigation={
          <CustomSideNavigation 
            activeHref={activeHref || location.pathname} 
            onNavigate={(e) => {
              e.preventDefault();
              navigate(e.detail.href);
            }}
            selectedProject={selectedProject}
          />
        }
        navigationOpen={navigationOpen}
        navigationHide={isProjectsListPage}
        onNavigationChange={({ detail }) => setNavigationOpen(detail.open)}
        toolsOpen={toolsOpen}
        onToolsChange={onToolsChange}
        tools={infoContent}
        content={children}
      />
    </>
  );
}

export default Layout;
