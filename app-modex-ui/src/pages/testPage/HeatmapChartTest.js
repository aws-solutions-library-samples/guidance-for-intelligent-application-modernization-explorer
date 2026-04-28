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
import { HeatmapChart } from '../../components/charts';

/**
 * Test component for the HeatmapChart
 */
const HeatmapChartTest = () => {
  const { t } = useTranslation(['components', 'common']);
  
  // Sample data for the chart - representing differences between metrics (0-5)
  const initialData = {
    rows: [t('components:heatmapChartTest.teamA'), t('components:heatmapChartTest.teamB'), t('components:heatmapChartTest.teamC'), t('components:heatmapChartTest.teamD'), t('components:heatmapChartTest.teamE'), t('components:heatmapChartTest.teamF')],
    columns: [t('components:heatmapChartTest.java'), t('components:heatmapChartTest.python'), t('components:heatmapChartTest.javascript'), t('components:heatmapChartTest.csharp'), t('components:heatmapChartTest.go'), t('components:heatmapChartTest.rust'), t('components:heatmapChartTest.typescript')],
    values: [
      [4, 2, 3, 1, 0, 0, 2], // Team A
      [1, 5, 2, 0, 3, 1, 0], // Team B
      [0, 3, 5, 2, 1, 0, 4], // Team C
      [2, 1, 0, 5, 0, 0, 3], // Team D
      [3, 0, 4, 0, 5, 2, 1], // Team E
      [0, 4, 1, 3, 2, 5, 0]  // Team F
    ]
  };

  // State for chart configuration
  const [showLegend, setShowLegend] = useState(true);
  const [legendPosition, setLegendPosition] = useState({ value: 'E' });
  const [colorPalette, setColorPalette] = useState({ value: 'soft' });
  const [showAxis, setShowAxis] = useState(true);
  const [showValues, setShowValues] = useState(true);
  const [selectedCell, setSelectedCell] = useState(null);

  // Legend position options
  const legendPositions = [
    { value: 'N', label: t('components:heatmapChartTest.north') },
    { value: 'NE', label: t('components:heatmapChartTest.northEast') },
    { value: 'E', label: t('components:heatmapChartTest.east') },
    { value: 'SE', label: t('components:heatmapChartTest.southEast') },
    { value: 'S', label: t('components:heatmapChartTest.south') },
    { value: 'SW', label: t('components:heatmapChartTest.southWest') },
    { value: 'W', label: t('components:heatmapChartTest.west') },
    { value: 'NW', label: t('components:heatmapChartTest.northWest') }
  ];

  // Color palette options
  const colorPalettes = [
    { value: 'soft', label: t('components:heatmapChartTest.softColorsBlue') },
    { value: 'bright', label: t('components:heatmapChartTest.brightColorsRed') }
  ];

  // Handle cell click
  const handleCellClick = (data) => {
    setSelectedCell(data);
  };

  return (
    <Container>
      <Header variant="h2">{t('components:heatmapChartTest.title')}</Header>
      <SpaceBetween size="l">
        <Grid
          gridDefinition={[
            { colspan: { default: 8, xxs: 12 } },
            { colspan: { default: 4, xxs: 12 } }
          ]}
        >
          {/* Chart Container */}
          <Box padding="l" textAlign="center">
            <HeatmapChart
              data={initialData}
              width={700}
              height={500}
              margin={{ top: 40, right: 80, bottom: 60, left: 100 }}
              showLegend={showLegend}
              legendPosition={legendPosition.value}
              colorPalette={colorPalette.value}
              showAxis={showAxis}
              showValues={showValues}
              title={t('components:heatmapChartTest.chartTitle')}
              xAxisLabel={t('components:heatmapChartTest.technologies')}
              yAxisLabel={t('components:heatmapChartTest.teams')}
              onCellClick={handleCellClick}
            />
          </Box>

          {/* Controls Container */}
          <Box padding="l">
            <SpaceBetween size="l">
              <Header variant="h3">{t('components:heatmapChartTest.chartControls')}</Header>
              
              <FormField label={t('components:heatmapChartTest.showLegend')}>
                <Toggle
                  checked={showLegend}
                  onChange={({ detail }) => setShowLegend(detail.checked)}
                />
              </FormField>

              <FormField label={t('components:heatmapChartTest.legendPosition')}>
                <Select
                  selectedOption={legendPosition}
                  onChange={({ detail }) => setLegendPosition(detail.selectedOption)}
                  options={legendPositions}
                  disabled={!showLegend}
                />
              </FormField>

              <FormField label={t('components:heatmapChartTest.showAxis')}>
                <Toggle
                  checked={showAxis}
                  onChange={({ detail }) => setShowAxis(detail.checked)}
                />
              </FormField>

              <FormField label={t('components:heatmapChartTest.showValues')}>
                <Toggle
                  checked={showValues}
                  onChange={({ detail }) => setShowValues(detail.checked)}
                />
              </FormField>

              <FormField label={t('components:heatmapChartTest.colorPalette')}>
                <Select
                  selectedOption={colorPalette}
                  onChange={({ detail }) => setColorPalette(detail.selectedOption)}
                  options={colorPalettes}
                />
              </FormField>

              {selectedCell && (
                <Box variant="awsui-key-label">
                  <Header variant="h3">{t('components:heatmapChartTest.selectedCell')}</Header>
                  <ColumnLayout columns={2} variant="text-grid">
                    <div>
                      <Box variant="awsui-key-label">{t('components:heatmapChartTest.team')}</Box>
                      <div>{selectedCell.row}</div>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{t('components:heatmapChartTest.technology')}</Box>
                      <div>{selectedCell.col}</div>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{t('components:heatmapChartTest.difference')}</Box>
                      <div>{selectedCell.value}</div>
                    </div>
                  </ColumnLayout>
                </Box>
              )}

              <Button
                onClick={() => setSelectedCell(null)}
                disabled={!selectedCell}
              >
                {t('components:heatmapChartTest.clearSelection')}
              </Button>
            </SpaceBetween>
          </Box>
        </Grid>

        <Box>
          <Header variant="h3">{t('components:heatmapChartTest.componentFeatures')}</Header>
          <ul>
            <li>{t('components:heatmapChartTest.feature1')}</li>
            <li>{t('components:heatmapChartTest.feature2')}</li>
            <li>{t('components:heatmapChartTest.feature3')}</li>
            <li>{t('components:heatmapChartTest.feature4')}</li>
            <li>{t('components:heatmapChartTest.feature5')}</li>
            <li>{t('components:heatmapChartTest.feature6')}</li>
            <li>{t('components:heatmapChartTest.feature7')}</li>
            <li>{t('components:heatmapChartTest.feature8')}</li>
            <li>{t('components:heatmapChartTest.feature9')}</li>
            <li>{t('components:heatmapChartTest.feature10')}</li>
            <li>{t('components:heatmapChartTest.feature11')}</li>
          </ul>
        </Box>
      </SpaceBetween>
    </Container>
  );
};

export default HeatmapChartTest;
