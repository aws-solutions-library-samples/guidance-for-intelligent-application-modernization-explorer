import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Container,
  Header
} from '@cloudscape-design/components';
import Layout from '../../layouts/AppLayout';

const Dummy3Page = () => {
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
          {t('pages:execution.executionPage')}
        </Header>
      </Container>
    </Layout>
  );
};

export default Dummy3Page;
