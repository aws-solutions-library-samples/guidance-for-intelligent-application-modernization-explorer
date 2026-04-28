import React from 'react';
import {
  Box,
  SpaceBetween,
  Header,
  Link,
  ExpandableSection
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

const ProjectHomeInfoContent = () => {
  const { t } = useTranslation(['info', 'common']);

  return (
    <Box padding="l">
      <SpaceBetween size="l">
        <Header variant="h2">{t('projectHome.title')}</Header>
        
        <div>
          <Box variant="p">
            {t('projectHome.description')}
          </Box>
        </div>
        
        <ExpandableSection header={t('projectHome.projectSections')}>
          <SpaceBetween size="m">
            <div>
              <Header variant="h4">{t('projectHome.dataCollection')}</Header>
              <Box variant="p">
                {t('projectHome.dataCollectionDescription')}
              </Box>
            </div>
            
            <div>
              <Header variant="h4">{t('projectHome.insights')}</Header>
              <Box variant="p">
                {t('projectHome.insightsDescription')}
              </Box>
            </div>
            
            <div>
              <Header variant="h4">{t('projectHome.planning')}</Header>
              <Box variant="p">
                {t('projectHome.planningDescription')}
              </Box>
            </div>
          </SpaceBetween>
        </ExpandableSection>
        
        <ExpandableSection header={t('projectHome.navigationTips')}>
          <ul>
            <li>{t('projectHome.navigationTip1')}</li>
            <li>{t('projectHome.navigationTip2')}</li>
            <li>{t('projectHome.navigationTip3')}</li>
            <li>{t('projectHome.navigationTip4')}</li>
          </ul>
        </ExpandableSection>
        
        <ExpandableSection header={t('projectHome.bestPractices')}>
          <ul>
            <li>{t('projectHome.bestPractice1')}</li>
            <li>{t('projectHome.bestPractice2')}</li>
            <li>{t('projectHome.bestPractice3')}</li>
            <li>{t('projectHome.bestPractice5')}</li>
          </ul>
        </ExpandableSection>
        
        <div>
          <Header variant="h4">{t('projectHome.learnMore')}</Header>
          <Box variant="p">
            {t('projectHome.learnMoreDescription', 'For additional guidance on using this application, please refer to the documentation provided by your administrator or contact your project team.')}
          </Box>
        </div>
      </SpaceBetween>
    </Box>
  );
};

export default ProjectHomeInfoContent;
