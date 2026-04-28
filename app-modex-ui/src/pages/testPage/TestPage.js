import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Container,
  Header,
  SpaceBetween,
  Tabs,
  Box,
  ContentLayout,
  Grid
} from '@cloudscape-design/components';
import DoughnutChartTest from './DoughnutChartTest';
import BarChartTest from './BarChartTest';
import LineChartTest from './LineChartTest';
import BubbleChartTest from './BubbleChartTest';
import HeatmapChartTest from './HeatmapChartTest';
import TechRadarChartTest from './TechRadarChartTest';

/**
 * TestPage component for testing new components and features
 * Use this page to experiment with new components before integrating them into the main application
 */
const TestPage = () => {
  const { t } = useTranslation(['pages', 'common']);
  const [activeTabId, setActiveTabId] = useState('doughnutChart');

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={t('pages:testPage.description')}
        >
          {t('pages:testPage.title')}
        </Header>
      }
    >
      <SpaceBetween size="l">
        <Tabs
          activeTabId={activeTabId}
          onChange={({ detail }) => setActiveTabId(detail.activeTabId)}
          tabs={[
            {
              label: t('pages:testPage.doughnutChart'),
              id: "doughnutChart",
              content: <DoughnutChartTest />
            },
            {
              label: t('pages:testPage.barChart'),
              id: "barChart",
              content: <BarChartTest />
            },
            {
              label: t('pages:testPage.lineChart'),
              id: "lineChart",
              content: <LineChartTest />
            },
            {
              label: t('pages:testPage.bubbleChart'),
              id: "bubbleChart",
              content: <BubbleChartTest />
            },
            {
              label: t('pages:testPage.heatmapChart'),
              id: "heatmapChart",
              content: <HeatmapChartTest />
            },
            {
              label: t('pages:testPage.techRadarChart'),
              id: "techRadarChart",
              content: <TechRadarChartTest />
            },
            {
              label: t('pages:testPage.testArea1'),
              id: "tab1",
              content: (
                <Container>
                  <Box padding="l">
                    <Grid
                      gridDefinition={[
                        { colspan: { default: 12, xxs: 12 } }
                      ]}
                    >
                      <Box>
                        <Header variant="h2">{t('pages:testPage.testComponentArea1')}</Header>
                        <p>{t('pages:testPage.addTestComponentsHere')}</p>
                        {/* Add your test components here */}
                      </Box>
                    </Grid>
                  </Box>
                </Container>
              )
            },
            {
              label: t('pages:testPage.testArea2'),
              id: "tab2",
              content: (
                <Container>
                  <Box padding="l">
                    <Grid
                      gridDefinition={[
                        { colspan: { default: 12, xxs: 12 } }
                      ]}
                    >
                      <Box>
                        <Header variant="h2">{t('pages:testPage.testComponentArea2')}</Header>
                        <p>{t('pages:testPage.addAlternativeTestComponentsHere')}</p>
                        {/* Add your alternative test components here */}
                      </Box>
                    </Grid>
                  </Box>
                </Container>
              )
            }
          ]}
        />
      </SpaceBetween>
    </ContentLayout>
  );
};

export default TestPage;
