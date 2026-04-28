import React, { useState } from 'react';
import {
  Container,
  Header,
  SpaceBetween,
  Box,
  Grid,
  FormField,
  Select,
  Toggle,
  Button,
  ColumnLayout
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import { BubbleChart } from '../../components/charts';

/**
 * Test component for the BubbleChart
 */
const BubbleChartTest = () => {
  const { t } = useTranslation(['components', 'common']);
  // Sample data for the chart
  const initialData = [
    { x: 10, y: 20, size: 15, label: t('components:bubbleChartTest.projectA'), category: t('components:bubbleChartTest.development') },
    { x: 25, y: 40, size: 30, label: t('components:bubbleChartTest.projectB'), category: t('components:bubbleChartTest.development') },
    { x: 40, y: 10, size: 20, label: t('components:bubbleChartTest.projectC'), category: t('components:bubbleChartTest.design') },
    { x: 60, y: 30, size: 45, label: t('components:bubbleChartTest.projectD'), category: t('components:bubbleChartTest.design') },
    { x: 80, y: 15, size: 25, label: t('components:bubbleChartTest.projectE'), category: t('components:bubbleChartTest.marketing') },
    { x: 50, y: 50, size: 50, label: t('components:bubbleChartTest.projectF'), category: t('components:bubbleChartTest.marketing') },
    { x: 70, y: 70, size: 35, label: t('components:bubbleChartTest.projectG'), category: t('components:bubbleChartTest.sales') },
    { x: 30, y: 60, size: 40, label: t('components:bubbleChartTest.projectH'), category: t('components:bubbleChartTest.sales') },
    { x: 20, y: 80, size: 15, label: t('components:bubbleChartTest.projectI'), category: t('components:bubbleChartTest.support') },
    { x: 90, y: 90, size: 30, label: t('components:bubbleChartTest.projectJ'), category: t('components:bubbleChartTest.support') }
  ];

  // State for chart configuration
  const [showLegend, setShowLegend] = useState(true);
  const [legendPosition, setLegendPosition] = useState({ value: 'E' });
  const [colorPalette, setColorPalette] = useState({ value: 'soft' });
  const [showAxis, setShowAxis] = useState(true);
  const [selectedBubble, setSelectedBubble] = useState(null);

  // Legend position options
  const legendPositions = [
    { value: 'N', label: t('components:bubbleChartTest.north') },
    { value: 'NE', label: t('components:bubbleChartTest.northEast') },
    { value: 'E', label: t('components:bubbleChartTest.east') },
    { value: 'SE', label: t('components:bubbleChartTest.southEast') },
    { value: 'S', label: t('components:bubbleChartTest.south') },
    { value: 'SW', label: t('components:bubbleChartTest.southWest') },
    { value: 'W', label: t('components:bubbleChartTest.west') },
    { value: 'NW', label: t('components:bubbleChartTest.northWest') }
  ];

  // Color palette options
  const colorPalettes = [
    { value: 'soft', label: t('components:bubbleChartTest.softColors') },
    { value: 'bright', label: t('components:bubbleChartTest.brightColors') }
  ];

  // Handle bubble click
  const handleBubbleClick = (data) => {
    setSelectedBubble(data);
  };

  return (
    <Container>
      <Header variant="h2">{t('components:bubbleChartTest.title')}</Header>
      <SpaceBetween size="l">
        <Grid
          gridDefinition={[
            { colspan: { default: 8, xxs: 12 } },
            { colspan: { default: 4, xxs: 12 } }
          ]}
        >
          {/* Chart Container */}
          <Box padding="l" textAlign="center">
            <BubbleChart
              data={initialData}
              width={700}
              height={500}
              margin={{ top: 40, right: 80, bottom: 60, left: 60 }}
              showLegend={showLegend}
              legendPosition={legendPosition.value}
              colorPalette={colorPalette.value}
              showAxis={showAxis}
              title={t('components:bubbleChartTest.chartTitle')}
              xAxisLabel={t('components:bubbleChartTest.complexity')}
              yAxisLabel={t('components:bubbleChartTest.businessValue')}
              onBubbleClick={handleBubbleClick}
            />
          </Box>

          {/* Controls Container */}
          <Box padding="l">
            <SpaceBetween size="l">
              <Header variant="h3">{t('components:bubbleChartTest.chartControls')}</Header>
              
              <FormField label={t('components:bubbleChartTest.showLegend')}>
                <Toggle
                  checked={showLegend}
                  onChange={({ detail }) => setShowLegend(detail.checked)}
                />
              </FormField>

              <FormField label={t('components:bubbleChartTest.legendPosition')}>
                <Select
                  selectedOption={legendPosition}
                  onChange={({ detail }) => setLegendPosition(detail.selectedOption)}
                  options={legendPositions}
                  disabled={!showLegend}
                />
              </FormField>

              <FormField label={t('components:bubbleChartTest.showAxis')}>
                <Toggle
                  checked={showAxis}
                  onChange={({ detail }) => setShowAxis(detail.checked)}
                />
              </FormField>

              <FormField label={t('components:bubbleChartTest.colorPalette')}>
                <Select
                  selectedOption={colorPalette}
                  onChange={({ detail }) => setColorPalette(detail.selectedOption)}
                  options={colorPalettes}
                />
              </FormField>

              {selectedBubble && (
                <Box variant="awsui-key-label">
                  <Header variant="h3">{t('components:bubbleChartTest.selectedBubble')}</Header>
                  <ColumnLayout columns={2} variant="text-grid">
                    <div>
                      <Box variant="awsui-key-label">{t('components:bubbleChartTest.project')}</Box>
                      <div>{selectedBubble.label}</div>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{t('components:bubbleChartTest.category')}</Box>
                      <div>{selectedBubble.category}</div>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{t('components:bubbleChartTest.complexity')}</Box>
                      <div>{selectedBubble.x}</div>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{t('components:bubbleChartTest.businessValue')}</Box>
                      <div>{selectedBubble.y}</div>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{t('components:bubbleChartTest.sizeBudget')}</Box>
                      <div>{selectedBubble.size}</div>
                    </div>
                  </ColumnLayout>
                </Box>
              )}

              <Button
                onClick={() => setSelectedBubble(null)}
                disabled={!selectedBubble}
              >
                {t('components:bubbleChartTest.clearSelection')}
              </Button>
            </SpaceBetween>
          </Box>
        </Grid>

        <Box>
          <Header variant="h3">{t('components:bubbleChartTest.componentFeatures')}</Header>
          <ul>
            <li>{t('components:bubbleChartTest.feature1')}</li>
            <li>{t('components:bubbleChartTest.feature2')}</li>
            <li>{t('components:bubbleChartTest.feature3')}</li>
            <li>{t('components:bubbleChartTest.feature4')}</li>
            <li>{t('components:bubbleChartTest.feature5')}</li>
            <li>{t('components:bubbleChartTest.feature6')}</li>
            <li>{t('components:bubbleChartTest.feature7')}</li>
            <li>{t('components:bubbleChartTest.feature8')}</li>
            <li>{t('components:bubbleChartTest.feature9')}</li>
            <li>{t('components:bubbleChartTest.feature10')}</li>
          </ul>
        </Box>
      </SpaceBetween>
    </Container>
  );
};

export default BubbleChartTest;
