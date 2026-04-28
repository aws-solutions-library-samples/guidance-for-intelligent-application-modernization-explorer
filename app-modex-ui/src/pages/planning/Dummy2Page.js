import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Container,
  Header
} from '@cloudscape-design/components';
import Layout from '../../layouts/AppLayout';

const Dummy2Page = () => {
  const location = useLocation();
  const { t } = useTranslation(['pages']);
  const [toolsOpen, setToolsOpen] = useState(false);

  return (
    <Layout
      activeHref={location.pathname}
      toolsOpen={toolsOpen}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
    >
      <Container>
        <Header variant="h1">
          {t('pages:planning.planningPage')}
        </Header>
      </Container>
    </Layout>
  );
};

export default Dummy2Page;
