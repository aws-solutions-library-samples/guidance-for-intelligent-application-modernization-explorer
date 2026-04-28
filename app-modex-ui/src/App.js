import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import '@cloudscape-design/global-styles/index.css';

// Context providers
import { SimpleAuthProvider } from './contexts/SimpleAuthContext';
import { ThemeProvider } from './contexts/ThemeContext';

// Authentication components
import ProtectedRoute from './components/auth/ProtectedRoute';
import DataProcessingErrorBoundary from './components/dataProcessing/DataProcessingErrorBoundary';
import SimpleFallback from './components/dataProcessing/SimpleFallback';

// Pages - KEEPING ALL ORIGINAL PAGES AND ROUTES
import LandingPage from './pages/LandingPage';
import ProjectsListPage from './pages/ProjectsListPage';
import ProjectHomePage from './pages/ProjectHomePage';
import ExportDataPage from './pages/ExportDataPage';
import DataProcessingPage from './pages/DataProcessingPage';

// Data section pages
import SkillsPage from './pages/data/SkillsPage';
import VisionPage from './pages/data/VisionPage';

// Application pages
import PortfolioPage from './pages/data/applications/PortfolioPage';
import TechStackPage from './pages/data/applications/TechStackPage';
import InfrastructurePage from './pages/data/applications/InfrastructurePage';
import UtilizationPage from './pages/data/applications/UtilizationPage';

// Insights section pages
import SkillsAnalysisPage from './pages/insights/SkillsAnalysisPage';
import TeamAnalysisPage from './pages/insights/TeamAnalysisPage';
import VisionAnalysisPage from './pages/insights/VisionAnalysisPage';
import TechStackAnalysisPage from './pages/insights/TechStackAnalysisPage';
import InfrastructureAnalysisPage from './pages/insights/InfrastructureAnalysisPage';
import UtilizationAnalysisPage from './pages/insights/UtilizationAnalysisPage';
import DataDivergenciesPage from './pages/insights/DataDivergenciesPage';

// Similarities section pages
import ApplicationSimilaritiesPage from './pages/similarities/ApplicationSimilaritiesPage';
import ComponentSimilaritiesPage from './pages/similarities/ComponentSimilaritiesPage';

// Planning section pages
import ApplicationGroupingPage from './pages/planning/ApplicationGroupingPage';
import PilotIdentificationPage from './pages/planning/PilotIdentificationPage';
import TCOPage from './pages/planning/TCOPage';
import TeamEstimatePage from './pages/planning/TeamEstimatePage';

// AWS Configuration
import { configureAmplify } from './config/amplifyConfig';

// Configure Amplify on app start
configureAmplify();

function App() {
  // Global ResizeObserver error suppression
  useEffect(() => {
    const originalError = console.error;
    
    console.error = (...args) => {
      // Suppress ResizeObserver errors globally
      if (args[0] && typeof args[0] === 'string' && args[0].includes('ResizeObserver loop completed with undelivered notifications')) {
        return;
      }
      originalError.apply(console, args);
    };
    
    // Global error handler for ResizeObserver
    const handleError = (event) => {
      if (event.message && event.message.includes('ResizeObserver')) {
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    };
    
    window.addEventListener('error', handleError, true);
    
    return () => {
      console.error = originalError;
      window.removeEventListener('error', handleError, true);
    };
  }, []);

  return (
    <ThemeProvider>
      <SimpleAuthProvider>
        <Router>
          <Routes>
            {/* PUBLIC ROUTES - No authentication required */}
            <Route path="/landing" element={<LandingPage />} />
            
            {/* PROTECTED ROUTES - Authentication required */}
            <Route path="/projects" element={
              <ProtectedRoute>
                <ProjectsListPage />
              </ProtectedRoute>
            } />
            <Route path="/home" element={
              <ProtectedRoute>
                <ProjectHomePage />
              </ProtectedRoute>
            } />
            <Route path="/project/export" element={
              <ProtectedRoute>
                <ExportDataPage />
              </ProtectedRoute>
            } />
          
          {/* Data section routes */}
          <Route path="/data/skills" element={
            <ProtectedRoute>
              <SkillsPage />
            </ProtectedRoute>
          } />
          <Route path="/data/vision" element={
            <ProtectedRoute>
              <VisionPage />
            </ProtectedRoute>
          } />
          
          {/* Application pages routes */}
          <Route path="/data/applications/portfolio" element={
            <ProtectedRoute>
              <PortfolioPage />
            </ProtectedRoute>
          } />
          <Route path="/data/applications/tech-stack" element={
            <ProtectedRoute>
              <TechStackPage />
            </ProtectedRoute>
          } />
          <Route path="/data/applications/infrastructure" element={
            <ProtectedRoute>
              <InfrastructurePage />
            </ProtectedRoute>
          } />
          <Route path="/data/applications/utilization" element={
            <ProtectedRoute>
              <UtilizationPage />
            </ProtectedRoute>
          } />
          
          {/* Insights section routes */}
          <Route path="/insights/skills" element={
            <ProtectedRoute>
              <SkillsAnalysisPage />
            </ProtectedRoute>
          } />
          <Route path="/insights/team-analysis" element={
            <ProtectedRoute>
              <TeamAnalysisPage />
            </ProtectedRoute>
          } />
          <Route path="/insights/vision" element={
            <ProtectedRoute>
              <VisionAnalysisPage />
            </ProtectedRoute>
          } />
          <Route path="/insights/tech-stack" element={
            <ProtectedRoute>
              <TechStackAnalysisPage />
            </ProtectedRoute>
          } />
          <Route path="/insights/infrastructure" element={
            <ProtectedRoute>
              <InfrastructureAnalysisPage />
            </ProtectedRoute>
          } />
          <Route path="/insights/utilization" element={
            <ProtectedRoute>
              <UtilizationAnalysisPage />
            </ProtectedRoute>
          } />
          <Route path="/insights/data-divergencies" element={
            <ProtectedRoute>
              <DataDivergenciesPage />
            </ProtectedRoute>
          } />
          
          {/* Similarities section routes */}
          <Route path="/similarities/applications" element={
            <ProtectedRoute>
              <ApplicationSimilaritiesPage />
            </ProtectedRoute>
          } />
          <Route path="/similarities/components" element={
            <ProtectedRoute>
              <ComponentSimilaritiesPage />
            </ProtectedRoute>
          } />
          
          {/* Planning section routes */}
          <Route path="/planning/application-grouping" element={
            <ProtectedRoute>
              <ApplicationGroupingPage />
            </ProtectedRoute>
          } />
          <Route path="/planning/pilot-identification" element={
            <ProtectedRoute>
              <PilotIdentificationPage />
            </ProtectedRoute>
          } />
          <Route path="/planning/tco-estimates" element={
            <ProtectedRoute>
              <TCOPage />
            </ProtectedRoute>
          } />
          <Route path="/planning/team-estimates" element={
            <ProtectedRoute>
              <TeamEstimatePage />
            </ProtectedRoute>
          } />
          
          {/* Data Processing Page */}
          <Route path="/projects/:projectId/processes" element={
            <ProtectedRoute>
              <DataProcessingErrorBoundary fallback={<SimpleFallback />}>
                <DataProcessingPage />
              </DataProcessingErrorBoundary>
            </ProtectedRoute>
          } />
          
          {/* KEEPING ORIGINAL DEFAULT REDIRECT */}
          <Route path="/" element={<Navigate to="/landing" replace />} />
        </Routes>
      </Router>
      </SimpleAuthProvider>
    </ThemeProvider>
  );
}

export default App;