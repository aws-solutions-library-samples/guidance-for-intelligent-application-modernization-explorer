import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Container,
  Grid,
  Header,
  SpaceBetween,
  Cards,
  Link,
  TextContent,
  TopNavigation,
  Modal,
  FormField,
  Input,
  Alert
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import { useSimpleAuth } from '../contexts/SimpleAuthContext';
import { useTheme } from '../contexts/ThemeContext';
import AuthModal from '../components/auth/AuthModal';

const LandingPage = () => {
  const { t } = useTranslation(['pages', 'common']);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useSimpleAuth();
  const { setForceLight } = useTheme();
  const [redirectMessage, setRedirectMessage] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Force light theme on landing page
  useEffect(() => {
    setForceLight(true);
    return () => setForceLight(false);
  }, [setForceLight]);

  // Check if user was redirected here from a protected route
  useEffect(() => {
    if (location.state?.from) {
      setRedirectMessage(t('pages:landing.pleaseSignIn'));
    }
  }, [location.state]);

  // Redirect authenticated users to projects
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/projects');
    }
  }, [isAuthenticated, navigate]);

  const handleSignIn = () => {
    setShowAuthModal(true);
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    navigate('/projects');
  };



  // Original landing page UI with proper layout
  return (
    <Box>
      {/* Top Navigation */}
      <TopNavigation
        identity={{
          href: "/landing",
          title: "App-ModEx",
          logo: {
            src: "/logo.svg",
            alt: "App-ModEx"
          }
        }}
        utilities={[
          {
            type: "button",
            text: t('pages:landing.signIn'),
            onClick: handleSignIn
          }
        ]}
      />

      {/* Hero Section */}
      <Box
        padding="xxl"
        color="text-body-secondary"
        backgroundColor="background-paper"
        textAlign="center"
      >
        <Container>
          <SpaceBetween size="xl">
            <Box margin={{ bottom: 'l' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
                <img 
                  src="/logo.svg" 
                  alt="App-ModEx Logo" 
                  style={{ height: '60px', marginRight: '20px' }} 
                />
                <div style={{ textAlign: 'left' }}>
                  <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold' }}>
                    {t('pages:landing.appTitle')}
                  </h1>
                  <p style={{ margin: '8px 0 0 0', color: '#5f6b7a' }}>
                    {t('pages:landing.appDescription')}
                  </p>
                </div>
              </div>
              
              {redirectMessage && (
                <Alert type="info" dismissible onDismiss={() => setRedirectMessage('')}>
                  {redirectMessage}
                </Alert>
              )}
            </Box>
            
            <SpaceBetween size="m" direction="horizontal">
              <Button variant="primary" size="large" onClick={handleSignIn}>
                {t('pages:landing.getStarted')}
              </Button>
              <Button variant="normal" size="large">
                {t('pages:landing.learnMore')}
              </Button>
            </SpaceBetween>
          </SpaceBetween>
        </Container>
      </Box>

      {/* Features Section */}
      <Box padding={{ horizontal: 'xxl' }}>
        <Container>
          <SpaceBetween size="xxl">
            <Box textAlign="center">
              <Header
                variant="h2"
                description={t('pages:landing.keyFeaturesDescription')}
              >
                {t('pages:landing.keyFeatures')}
              </Header>
            </Box>
            
            <Cards
              trackBy="id"
              ariaLabels={{
                itemSelectionLabel: (e, t) => `select ${t.name}`,
                selectionGroupLabel: t('pages:landing.itemSelection')
              }}
              cardDefinition={{
                header: e => e.name,
                sections: [
                  {
                    id: "description",
                    content: e => e.description
                  },
                  {
                    id: "features",
                    content: e => (
                      <ul>
                        {e.features.map((feature, index) => (
                          <li key={index}>{feature}</li>
                        ))}
                      </ul>
                    )
                  }
                ]
              }}
              cardsPerRow={[
                { cards: 1 },
                { minWidth: 500, cards: 2 },
                { minWidth: 800, cards: 4 }
              ]}
              items={[
                {
                  id: 'data-collection',
                  name: t('pages:landing.dataCollection'),
                  description: t('pages:landing.dataCollectionDesc'),
                  features: [
                    t('pages:landing.skillsInventory'),
                    t('pages:landing.technologyVision'), 
                    t('pages:landing.applicationPortfolio'),
                    t('pages:landing.infrastructureMapping')
                  ]
                },
                {
                  id: 'insights-analysis',
                  name: t('pages:landing.insightsAnalysis'), 
                  description: t('pages:landing.insightsAnalysisDesc'),
                  features: [
                    t('pages:landing.skillGapsAnalysis'),
                    t('pages:landing.techStackAssessment'),
                    t('pages:landing.infrastructureInsights'),
                    t('pages:landing.utilizationPatterns')
                  ]
                },
                {
                  id: 'planning-strategy',
                  name: t('pages:landing.planningStrategy'),
                  description: t('pages:landing.planningStrategyDesc'), 
                  features: [
                    t('pages:landing.pilotIdentification'),
                    t('pages:landing.applicationGrouping'),
                    t('pages:landing.tcoEstimates'),
                    t('pages:landing.riskAssessment')
                  ]
                }
              ]}
              loadingText={t('pages:landing.loadingFeatures')}
              empty={
                <Box textAlign="center" color="inherit">
                  <b>{t('pages:landing.noFeaturesAvailable')}</b>
                </Box>
              }
            />
          </SpaceBetween>
        </Container>
      </Box>

      {/* Benefits Section */}
      <Box backgroundColor="background-container-content" padding={{ horizontal: 'xxl', top: 'xxl', bottom: 'xxl' }}>
        <Container>
          <SpaceBetween size="xxl">
            <Box textAlign="center">
              <Header variant="h2">{t('pages:landing.whyChooseAppModEx')}</Header>
            </Box>
            
            <Grid
              gridDefinition={[
                { colspan: { default: 12, xs: 6 } },
                { colspan: { default: 12, xs: 6 } }
              ]}
            >
              <Box>
                <SpaceBetween size="l">
                  <TextContent>
                    <h3>🚀 {t('pages:landing.acceleratedModernization')}</h3>
                    <p>{t('pages:landing.acceleratedModernizationDesc')}</p>
                  </TextContent>
                  
                  <TextContent>
                    <h3>📊 {t('pages:landing.dataDrivenDecisions')}</h3>
                    <p>{t('pages:landing.dataDrivenDecisionsDesc')}</p>
                  </TextContent>
                </SpaceBetween>
              </Box>
              
              <Box>
                <SpaceBetween size="l">
                  <TextContent>
                    <h3>🛡️ {t('pages:landing.riskMitigation')}</h3>
                    <p>{t('pages:landing.riskMitigationDesc')}</p>
                  </TextContent>
                  
                  <TextContent>
                    <h3>💰 {t('pages:landing.costOptimization')}</h3>
                    <p>{t('pages:landing.costOptimizationDesc')}</p>
                  </TextContent>
                </SpaceBetween>
              </Box>
            </Grid>
          </SpaceBetween>
        </Container>
      </Box>

      {/* Authentication Modal */}
      <AuthModal
        visible={showAuthModal}
        onDismiss={() => setShowAuthModal(false)}
        onAuthSuccess={handleAuthSuccess}
      />
    </Box>
  );
};

export default LandingPage;
