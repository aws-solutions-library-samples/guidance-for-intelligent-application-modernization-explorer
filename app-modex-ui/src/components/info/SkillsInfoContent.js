import React from 'react';
import {
  Box,
  SpaceBetween,
  Header,
  ExpandableSection
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

const SkillsInfoContent = () => {
  const { t } = useTranslation(['info', 'common']);

  return (
    <Box padding="l">
      <SpaceBetween size="l">
        <Header variant="h2">{t('skills.title')}</Header>
        
        <div>
          <Box variant="p">
            {t('skills.description')}
          </Box>
        </div>
        
        <ExpandableSection header={t('skills.howToUse')}>
          <SpaceBetween size="m">
            <Box variant="p">
              {t('skills.useThisPageTo')}
            </Box>
            <ul>
              <li>{t('skills.viewAllSkills')}</li>
              <li>{t('skills.filterSkills')}</li>
              <li>{t('skills.downloadSkillsData')}</li>
              <li>{t('skills.uploadNewSkillsData')}</li>
            </ul>
            <Box variant="p">
              {t('skills.proficiencyLevelsDescription')}
            </Box>
            <ul>
              <li><strong style={{ color: '#1d8102' }}>{t('skills.expert')}</strong> {t('skills.expertDescription')}</li>
              <li><strong style={{ color: '#0972d3' }}>{t('skills.advanced')}</strong> {t('skills.advancedDescription')}</li>
              <li><strong style={{ color: '#d69300' }}>{t('skills.intermediate')}</strong> {t('skills.intermediateDescription')}</li>
              <li><strong style={{ color: '#d91515' }}>{t('skills.beginner')}</strong> {t('skills.beginnerDescription')}</li>
              <li><strong style={{ color: '#d91515' }}>{t('skills.novice')}</strong> {t('skills.noviceDescription')}</li>
            </ul>
          </SpaceBetween>
        </ExpandableSection>
        
        <ExpandableSection header={t('skills.bestPractices')}>
          <SpaceBetween size="m">
            <Box variant="p">
              {t('skills.bestPracticesDescription')}
            </Box>
            <ul>
              <li>{t('skills.bestPractice1')}</li>
              <li>{t('skills.bestPractice2')}</li>
              <li>{t('skills.bestPractice3')}</li>
              <li>{t('skills.bestPractice4')}</li>
              <li>{t('skills.bestPractice5')}</li>
            </ul>
          </SpaceBetween>
        </ExpandableSection>
      </SpaceBetween>
    </Box>
  );
};

export default SkillsInfoContent;
