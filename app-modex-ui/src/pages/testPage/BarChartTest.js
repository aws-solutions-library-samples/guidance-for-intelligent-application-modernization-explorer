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
import { BarChart } from '../../components/charts';

/**
 * Test component for the BarChart
 */
const BarChartTest = () => {
  const { t } = useTranslation(['components', 'common']);
  
  // Sample data for the chart
  const initialData = [
    { label: t('components:barChartTest.jan'), value: 45 },
    { label: t('components:barChartTest.feb'), value: 32 },
    { label: t('components:barChartTest.mar'), value: 58 },
    { label: t('components:barChartTest.apr'), value: 40 },
    { label: t('components:barChartTest.may'), value: 65 },
    { label: t('components:barChartTest.jun'), value: 78 }
  ];

  // State for chart configuration
  const [showLegend, setShowLegend] = useState(true);
  const [legendPosition, setLegendPosition] = useState({ value: 'E' });
  const [showValues, setShowValues] = useState(true);
  const [valuesPosition, setValuesPosition] = useState({ value: 'outside' });
  const [colorPalette, setColorPalette] = useState({ value: 'soft' });
  const [showAxis, setShowAxis] = useState(true);
  const [selectedBar, setSelectedBar] = useState(null);

  // Legend position options
  const legendPositions = [
    { value: 'N', label: t('components:barChartTest.north') },
    { value: 'NE', label: t('components:barChartTest.northEast') },
    { value: 'E', label: t('components:barChartTest.east') },
    { value: 'SE', label: t('components:barChartTest.southEast') },
    { value: 'S', label: t('components:barChartTest.south') },
    { value: 'SW', label: t('components:barChartTest.southWest') },
    { value: 'W', label: t('components:barChartTest.west') },
    { value: 'NW', label: t('components:barChartTest.northWest') }
  ];

  // Values position options
  const valuesPositions = [
    { value: 'inside', label: t('components:barChartTest.insideBars') },
    { value: 'outside', label: t('components:barChartTest.outsideBars') }
  ];

  // Color palette options
  const colorPalettes = [
    { value: 'soft', label: t('components:barChartTest.softColors') },
    { value: 'bright', label: t('components:barChartTest.brightColors') }
  ];

  // Handle bar click
  const handleBarClick = (data) => {
    setSelectedBar(data);
  };

  return (
    <Container>
      <Header variant="h2">{t('components:barChartTest.title')}</Header>
      <SpaceBetween size="l">
        <Grid
          gridDefinition={[
            { colspan: { default: 8, xxs: 12 } },
            { colspan: { default: 4, xxs: 12 } }
          ]}
        >
          {/* Chart Container */}
          <Box padding="l" textAlign="center">
            <BarChart
              data={initialData}
              width={600}
              height={400}
              margin={{ top: 40, right: 30, bottom: 60, left: 60 }}
              showLegend={showLegend}
              legendPosition={legendPosition.value}
              showValues={showValues}
              valuesPosition={valuesPosition.value}
              colorPalette={colorPalette.value}
              showAxis={showAxis}
              title={t('components:barChartTest.chartTitle')}
              xAxisLabel={t('components:barChartTest.month')}
              yAxisLabel={t('components:barChartTest.sales')}
              onBarClick={handleBarClick}
            />
          </Box>

          {/* Controls Container */}
          <Box padding="l">
            <SpaceBetween size="l">
              <Header variant="h3">{t('components:barChartTest.chartControls')}</Header>
              
              <FormField label={t('components:barChartTest.showLegend')}>
                <Toggle
                  checked={showLegend}
                  onChange={({ detail }) => setShowLegend(detail.checked)}
                />
              </FormField>

              <FormField label={t('components:barChartTest.legendPosition')}>
                <Select
                  selectedOption={legendPosition}
                  onChange={({ detail }) => setLegendPosition(detail.selectedOption)}
                  options={legendPositions}
                  disabled={!showLegend}
                />
              </FormField>

              <FormField label={t('components:barChartTest.showValues')}>
                <Toggle
                  checked={showValues}
                  onChange={({ detail }) => setShowValues(detail.checked)}
                />
              </FormField>

              <FormField label={t('components:barChartTest.valuesPosition')}>
                <Select
                  selectedOption={valuesPosition}
                  onChange={({ detail }) => setValuesPosition(detail.selectedOption)}
                  options={valuesPositions}
                  disabled={!showValues}
                />
              </FormField>

              <FormField label={t('components:barChartTest.showAxis')}>
                <Toggle
                  checked={showAxis}
                  onChange={({ detail }) => setShowAxis(detail.checked)}
                />
              </FormField>

              <FormField label={t('components:barChartTest.colorPalette')}>
                <Select
                  selectedOption={colorPalette}
                  onChange={({ detail }) => setColorPalette(detail.selectedOption)}
                  options={colorPalettes}
                />
              </FormField>

              {selectedBar && (
                <Box variant="awsui-key-label">
                  <Header variant="h3">{t('components:barChartTest.selectedBar')}</Header>
                  <ColumnLayout columns={2} variant="text-grid">
                    <div>
                      <Box variant="awsui-key-label">{t('components:barChartTest.label')}</Box>
                      <div>{selectedBar.label}</div>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{t('components:barChartTest.value')}</Box>
                      <div>{selectedBar.value}</div>
                    </div>
                  </ColumnLayout>
                </Box>
              )}

              <Button
                onClick={() => setSelectedBar(null)}
                disabled={!selectedBar}
              >
                {t('components:barChartTest.clearSelection')}
              </Button>
            </SpaceBetween>
          </Box>
        </Grid>

        <Box>
          <Header variant="h3">{t('components:barChartTest.componentFeatures')}</Header>
          <ul>
            <li>{t('components:barChartTest.feature1')}</li>
            <li>{t('components:barChartTest.feature2')}</li>
            <li>{t('components:barChartTest.feature3')}</li>
            <li>{t('components:barChartTest.feature4')}</li>
            <li>{t('components:barChartTest.feature5')}</li>
            <li>{t('components:barChartTest.feature6')}</li>
            <li>{t('components:barChartTest.feature7')}</li>
            <li>{t('components:barChartTest.feature8')}</li>
            <li>{t('components:barChartTest.feature9')}</li>
            <li>{t('components:barChartTest.feature10')}</li>
          </ul>
        </Box>
      </SpaceBetween>
    </Container>
  );
};

export default BarChartTest;
