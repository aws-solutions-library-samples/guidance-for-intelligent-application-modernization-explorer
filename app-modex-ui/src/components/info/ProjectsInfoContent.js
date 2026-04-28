import React from 'react';
import {
  Box,
  SpaceBetween,
  Header,
  Link,
  ExpandableSection
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

const ProjectsInfoContent = () => {
  const { t } = useTranslation(['info', 'common']);

  return (
    <Box padding="l">
      <SpaceBetween size="l">
        <Header variant="h2">{t('projects.title')}</Header>
        
        <div>
          <Box variant="p">
            {t('projects.description')}
          </Box>
        </div>
        
        <ExpandableSection header={t('projects.workingWithProjects')}>
          <SpaceBetween size="m">
            <div>
              <Header variant="h4">{t('projects.creatingProject')}</Header>
              <Box variant="p">
                {t('projects.creatingProjectDescription')}
              </Box>
            </div>
            
            <div>
              <Header variant="h4">{t('projects.selectingProject')}</Header>
              <Box variant="p">
                {t('projects.selectingProjectDescription')}
              </Box>
            </div>
            
            <div>
              <Header variant="h4">{t('projects.deletingProject')}</Header>
              <Box variant="p">
                {t('projects.deletingProjectDescription')}
              </Box>
            </div>
            
            <div>
              <Header variant="h4">{t('projects.switchingProjects')}</Header>
              <Box variant="p">
                {t('projects.switchingProjectsDescription')}
              </Box>
            </div>
          </SpaceBetween>
        </ExpandableSection>
        
        <ExpandableSection header={t('projects.projectData')}>
          <Box variant="p">
            {t('projects.projectDataDescription')}
          </Box>
          <ul>
            <li><strong>{t('projects.teamSkills')}</strong> - {t('projects.teamSkillsDescription')}</li>
            <li><strong>{t('projects.technologyVision')}</strong> - {t('projects.technologyVisionDescription')}</li>
            <li><strong>{t('projects.applicationPortfolio')}</strong> - {t('projects.applicationPortfolioDescription')}</li>
            <li><strong>{t('projects.technologyStack')}</strong> - {t('projects.technologyStackDescription')}</li>
            <li><strong>{t('projects.infrastructure')}</strong> - {t('projects.infrastructureDescription')}</li>
            <li><strong>{t('projects.resourceUtilization')}</strong> - {t('projects.resourceUtilizationDescription')}</li>
          </ul>
        </ExpandableSection>
        
        <ExpandableSection header={t('projects.bestPractices')}>
          <ul>
            <li>{t('projects.bestPractice1')}</li>
            <li>{t('projects.bestPractice2')}</li>
            <li>{t('projects.bestPractice3')}</li>
            <li>{t('projects.bestPractice4')}</li>
          </ul>
        </ExpandableSection>
        
        <div>
          <Header variant="h4">{t('projects.learnMore')}</Header>
          <Box variant="p">
            {t('projects.learnMoreDescription', 'For additional guidance on managing projects, please refer to the documentation provided by your administrator or contact your project team.')}
          </Box>
        </div>
      </SpaceBetween>
    </Box>
  );
};

export default ProjectsInfoContent;
