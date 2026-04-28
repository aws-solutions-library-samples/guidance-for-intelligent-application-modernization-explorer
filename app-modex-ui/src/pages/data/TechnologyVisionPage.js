import React from 'react';
import { 
  Container, 
  Header, 
  SpaceBetween, 
  Box
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import TechRadarTable from '../../components/TechRadarTable';
import InfoPanel from '../../components/info/InfoPanel';
import TechnologyVisionInfoContent from '../../components/info/TechnologyVisionInfoContent';

const TechnologyVisionPage = ({ externalRefreshTrigger }) => {
  const { t } = useTranslation(['pages', 'common']);
  
  return (
    <Container>
      <SpaceBetween size="l">
        <Header
          variant="h1"
          description={t('pages:technologyVision.description')}
          info={<InfoPanel title={t('pages:technologyVision.title')} content={<TechnologyVisionInfoContent />} />}
        >
          {t('pages:technologyVision.title')}
        </Header>
        
        <Box padding={{ top: 'l' }}>
          <TechRadarTable externalRefreshTrigger={externalRefreshTrigger} />
        </Box>
      </SpaceBetween>
    </Container>
  );
};

export default TechnologyVisionPage;