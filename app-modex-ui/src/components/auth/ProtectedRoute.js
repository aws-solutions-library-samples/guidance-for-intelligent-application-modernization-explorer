import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getCurrentUser } from 'aws-amplify/auth';
import { Spinner, Box } from '@cloudscape-design/components';

const ProtectedRoute = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation(['components']);
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        console.log('🔐 ProtectedRoute: Checking authentication...', location.pathname);
        
        // Direct check with Cognito - this will fail if user was signed out server-side
        const user = await getCurrentUser();
        
        if (user) {
          console.log('🔐 ProtectedRoute: User authenticated:', user.username, 'for path:', location.pathname);
          setIsAuthenticated(true);
        } else {
          console.log('🔐 ProtectedRoute: No user found for path:', location.pathname);
          setIsAuthenticated(false);
        }
        
      } catch (error) {
        console.log('🔐 ProtectedRoute: Authentication failed:', error.message, 'for path:', location.pathname);
        
        // Clear any stale local storage
        localStorage.clear();
        sessionStorage.clear();
        
        setIsAuthenticated(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkAuth();
  }, [location.pathname]);

  // Redirect to landing if not authenticated
  useEffect(() => {
    if (!isChecking && !isAuthenticated) {
      console.log('🔐 ProtectedRoute: Redirecting to landing page from path:', location.pathname);
      navigate('/landing', { replace: true });
    }
  }, [isChecking, isAuthenticated, navigate, location.pathname]);

  // Show loading while checking
  if (isChecking) {
    return (
      <Box textAlign="center" padding="xxl">
        <Spinner size="large" />
        <Box margin={{ top: 's' }}>{t('components:protectedRoute.verifyingAuthenticationForPath')} {location.pathname}...</Box>
      </Box>
    );
  }

  // Show content only if authenticated
  if (isAuthenticated) {
    console.log('🔐 ProtectedRoute: Rendering children for path:', location.pathname);
    return children;
  }

  // Show nothing while redirecting
  console.log('🔐 ProtectedRoute: Not authenticated, returning null for path:', location.pathname);
  return null;
};

export default ProtectedRoute;