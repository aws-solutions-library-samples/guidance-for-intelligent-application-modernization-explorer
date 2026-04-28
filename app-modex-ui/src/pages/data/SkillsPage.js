import React, { useState } from 'react';
import { Header, Container, ContentLayout, SpaceBetween, Box } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import Layout from '../../layouts/AppLayout';
import SkillsInfoContent from '../../components/info/SkillsInfoContent';
import SkillsTable from '../../components/SkillsTable';
import DataSourcesSection from '../../components/DataSourcesSection';

function SkillsPage() {
  const { t } = useTranslation(['pages', 'common']);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const toggleTools = () => {
    setToolsOpen(!toolsOpen);
  };
  
  const handleDataProcessingComplete = () => {
    console.log('🔔 Data processing completed, triggering Skills table refresh');
    setRefreshTrigger(prev => prev + 1);
  };
  
  const handleDataChanged = () => {
    console.log('🔔 Files list data changed, triggering Skills table refresh');
    setRefreshTrigger(prev => prev + 1);
  };
  
  return (
    <Layout 
      activeHref="/data/skills"
      infoContent={<SkillsInfoContent />}
      toolsOpen={toolsOpen}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
    >
      <ContentLayout
        header={
          <Header
            variant="h1"
            actions={
              <button 
                onClick={toggleTools}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0 10px'
                }}
                aria-label={toolsOpen ? t('pages:skills.closeInformationPanel') : t('pages:skills.openInformationPanel')}
              >
                <span className="awsui-icon awsui-icon-size-normal awsui-icon-variant-normal">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" focusable="false">
                    {toolsOpen ? (
                      <path d="M9.414 8l4.293-4.293a1 1 0 00-1.414-1.414L8 6.586 3.707 2.293a1 1 0 00-1.414 1.414L6.586 8l-4.293 4.293a1 1 0 101.414 1.414L8 9.414l4.293 4.293a1 1 0 001.414-1.414L9.414 8z" />
                    ) : (
                      <path d="M8 1C4.14 1 1 4.14 1 8s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7zm1 10.5H7v-5h2v5zm0-6.5H7V3h2v2z" />
                    )}
                  </svg>
                </span>
              </button>
            }
          >
            {t('pages:skills.title')}
          </Header>
        }
      >
        <SpaceBetween size="l">
          <Container>
            <SpaceBetween size="l">
              <Box>
                <h2>{t('pages:skills.skillsInventory')}</h2>
                <p>
                  {t('pages:skills.skillsInventoryDescription')}
                </p>
              </Box>
              
              <SkillsTable externalRefreshTrigger={refreshTrigger} />
            </SpaceBetween>
          </Container>
          
          <DataSourcesSection 
            dataSourceType="team-skills" 
            onDataProcessingComplete={handleDataProcessingComplete}
            onDataChanged={handleDataChanged}
          />
        </SpaceBetween>
      </ContentLayout>
    </Layout>
  );
}

export default SkillsPage;
