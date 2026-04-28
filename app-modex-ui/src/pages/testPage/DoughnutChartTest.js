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
import { DoughnutChart } from '../../components/charts';

/**
 * Test component for the DoughnutChart
 */
const DoughnutChartTest = () => {
  const { t } = useTranslation(['components', 'common']);
  
  // Sample data for the chart
  const initialData = [
    { label: t('components:doughnutChartTest.java'), value: 35 },
    { label: t('components:doughnutChartTest.python'), value: 25 },
    { label: t('components:doughnutChartTest.javascript'), value: 20 },
    { label: t('components:doughnutChartTest.csharp'), value: 15 },
    { label: t('components:doughnutChartTest.go'), value: 5 }
  ];

  // State for chart configuration
  const [showLegend, setShowLegend] = useState(true);
  const [legendPosition, setLegendPosition] = useState({ value: 'E' });
  const [showValues, setShowValues] = useState(true);
  const [colorPalette, setColorPalette] = useState({ value: 'soft' });
  const [totalDisplay, setTotalDisplay] = useState({ value: 'chart' });
  const [selectedSlice, setSelectedSlice] = useState(null);

  // Legend position options
  const legendPositions = [
    { value: 'N', label: t('components:doughnutChartTest.north') },
    { value: 'NE', label: t('components:doughnutChartTest.northEast') },
    { value: 'E', label: t('components:doughnutChartTest.east') },
    { value: 'SE', label: t('components:doughnutChartTest.southEast') },
    { value: 'S', label: t('components:doughnutChartTest.south') },
    { value: 'SW', label: t('components:doughnutChartTest.southWest') },
    { value: 'W', label: t('components:doughnutChartTest.west') },
    { value: 'NW', label: t('components:doughnutChartTest.northWest') }
  ];

  // Color palette options
  const colorPalettes = [
    { value: 'soft', label: t('components:doughnutChartTest.softColors') },
    { value: 'bright', label: t('components:doughnutChartTest.brightColors') }
  ];

  // Total display options
  const totalDisplayOptions = [
    { value: 'chart', label: t('components:doughnutChartTest.inChartCenter') },
    { value: 'title', label: t('components:doughnutChartTest.inTitleParentheses') }
  ];

  // Handle slice click
  const handleSliceClick = (data) => {
    setSelectedSlice(data);
  };

  return (
    <Container>
      <Header variant="h2">{t('components:doughnutChartTest.title')}</Header>
      <SpaceBetween size="l">
        <Grid
          gridDefinition={[
            { colspan: { default: 8, xxs: 12 } },
            { colspan: { default: 4, xxs: 12 } }
          ]}
        >
          {/* Chart Container */}
          <Box padding="l" textAlign="center">
            <DoughnutChart
              data={initialData}
              width={500}
              height={400}
              innerRadius={60}
              outerRadius={120}
              showLegend={showLegend}
              legendPosition={legendPosition.value}
              showValues={showValues}
              colorPalette={colorPalette.value}
              title={t('components:doughnutChartTest.chartTitle')}
              onSliceClick={handleSliceClick}
              totalDisplay={totalDisplay.value}
            />
          </Box>

          {/* Controls Container */}
          <Box padding="l">
            <SpaceBetween size="l">
              <Header variant="h3">{t('components:doughnutChartTest.chartControls')}</Header>
              
              <FormField label={t('components:doughnutChartTest.showLegend')}>
                <Toggle
                  checked={showLegend}
                  onChange={({ detail }) => setShowLegend(detail.checked)}
                />
              </FormField>

              <FormField label={t('components:doughnutChartTest.legendPosition')}>
                <Select
                  selectedOption={legendPosition}
                  onChange={({ detail }) => setLegendPosition(detail.selectedOption)}
                  options={legendPositions}
                  disabled={!showLegend}
                />
              </FormField>

              <FormField label={t('components:doughnutChartTest.showValues')}>
                <Toggle
                  checked={showValues}
                  onChange={({ detail }) => setShowValues(detail.checked)}
                />
              </FormField>

              <FormField label={t('components:doughnutChartTest.colorPalette')}>
                <Select
                  selectedOption={colorPalette}
                  onChange={({ detail }) => setColorPalette(detail.selectedOption)}
                  options={colorPalettes}
                />
              </FormField>

              <FormField label={t('components:doughnutChartTest.totalDisplayLocation')}>
                <Select
                  selectedOption={totalDisplay}
                  onChange={({ detail }) => setTotalDisplay(detail.selectedOption)}
                  options={totalDisplayOptions}
                />
              </FormField>

              {selectedSlice && (
                <Box variant="awsui-key-label">
                  <Header variant="h3">{t('components:doughnutChartTest.selectedSlice')}</Header>
                  <ColumnLayout columns={2} variant="text-grid">
                    <div>
                      <Box variant="awsui-key-label">{t('components:doughnutChartTest.label')}</Box>
                      <div>{selectedSlice.label}</div>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{t('components:doughnutChartTest.value')}</Box>
                      <div>{selectedSlice.value}</div>
                    </div>
                  </ColumnLayout>
                </Box>
              )}

              <Button
                onClick={() => setSelectedSlice(null)}
                disabled={!selectedSlice}
              >
                {t('components:doughnutChartTest.clearSelection')}
              </Button>
            </SpaceBetween>
          </Box>
        </Grid>

        <Box>
          <Header variant="h3">{t('components:doughnutChartTest.componentFeatures')}</Header>
          <ul>
            <li>{t('components:doughnutChartTest.feature1')}</li>
            <li>{t('components:doughnutChartTest.feature2')}</li>
            <li>{t('components:doughnutChartTest.feature3')}</li>
            <li>{t('components:doughnutChartTest.feature4')}</li>
            <li>{t('components:doughnutChartTest.feature5')}</li>
            <li>{t('components:doughnutChartTest.feature6')}</li>
            <li>{t('components:doughnutChartTest.feature7')}</li>
            <li>{t('components:doughnutChartTest.feature8')}</li>
            <li>{t('components:doughnutChartTest.feature9')}</li>
          </ul>
        </Box>
      </SpaceBetween>
    </Container>
  );
};

export default DoughnutChartTest;
