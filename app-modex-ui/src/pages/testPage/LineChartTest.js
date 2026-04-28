import React, { useState, useEffect } from 'react';
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
  ColumnLayout,
  SegmentedControl
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import { LineChart } from '../../components/charts';

/**
 * Test component for the LineChart
 */
const LineChartTest = () => {
  const { t } = useTranslation(['components', 'common']);
  // Sample data for the chart - timeseries data for multiple series
  const generateSampleData = (days = 120) => {
    const now = new Date();
    const series = [
      {
        name: t('components:lineChartTest.cpuUtilization'),
        values: []
      },
      {
        name: t('components:lineChartTest.memoryUsage'),
        values: []
      },
      {
        name: t('components:lineChartTest.networkTraffic'),
        values: []
      }
    ];

    // Generate data points for each day
    for (let i = days; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      // CPU data with some randomness and trend
      series[0].values.push({
        date: date.toISOString(),
        value: Math.round(40 + 20 * Math.sin(i / 10) + Math.random() * 15)
      });
      
      // Memory data with different pattern
      series[1].values.push({
        date: date.toISOString(),
        value: Math.round(60 + 15 * Math.cos(i / 15) + Math.random() * 10)
      });
      
      // Network data with spikes
      series[2].values.push({
        date: date.toISOString(),
        value: Math.round(30 + (i % 7 === 0 ? 40 : 0) + Math.random() * 20)
      });
    }

    return { series };
  };

  const [data] = useState(generateSampleData());
  const [showLegend, setShowLegend] = useState(true);
  const [legendPosition, setLegendPosition] = useState({ value: 'E' });
  const [colorPalette, setColorPalette] = useState({ value: 'soft' });
  const [showAxis, setShowAxis] = useState(true);
  const [timeframe, setTimeframe] = useState({ value: 'all' });
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [showTimeframeControl, setShowTimeframeControl] = useState(true);

  // Check if we have enough data for timeframe controls
  useEffect(() => {
    if (data && data.series && data.series.length > 0) {
      const firstSeries = data.series[0];
      if (firstSeries.values.length < 7) {
        setShowTimeframeControl(false);
        setTimeframe({ value: 'all' });
      }
    }
  }, [data]);

  // Legend position options
  const legendPositions = [
    { value: 'N', label: t('components:lineChartTest.north') },
    { value: 'NE', label: t('components:lineChartTest.northEast') },
    { value: 'E', label: t('components:lineChartTest.east') },
    { value: 'SE', label: t('components:lineChartTest.southEast') },
    { value: 'S', label: t('components:lineChartTest.south') },
    { value: 'SW', label: t('components:lineChartTest.southWest') },
    { value: 'W', label: t('components:lineChartTest.west') },
    { value: 'NW', label: t('components:lineChartTest.northWest') }
  ];

  // Color palette options
  const colorPalettes = [
    { value: 'soft', label: t('components:lineChartTest.softColors') },
    { value: 'bright', label: t('components:lineChartTest.brightColors') }
  ];

  // Timeframe options
  const timeframeOptions = [
    { value: 'all', label: t('components:lineChartTest.allData') },
    { value: '7d', label: t('components:lineChartTest.last7Days') },
    { value: '30d', label: t('components:lineChartTest.last30Days') },
    { value: '90d', label: t('components:lineChartTest.last90Days') }
  ];

  // Handle point click
  const handlePointClick = (point, series) => {
    setSelectedPoint({ ...point, seriesName: series.name });
  };

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <Container>
      <Header variant="h2">{t('components:lineChartTest.title')}</Header>
      <SpaceBetween size="l">
        {showTimeframeControl && (
          <Box padding="s">
            <SegmentedControl
              selectedId={timeframe.value}
              onChange={({ detail }) => setTimeframe({ value: detail.selectedId })}
              options={timeframeOptions.map(option => ({
                id: option.value,
                text: option.label
              }))}
            />
          </Box>
        )}
        
        <Grid
          gridDefinition={[
            { colspan: { default: 8, xxs: 12 } },
            { colspan: { default: 4, xxs: 12 } }
          ]}
        >
          {/* Chart Container */}
          <Box padding="l" textAlign="center">
            <LineChart
              data={data}
              width={700}
              height={400}
              margin={{ top: 40, right: 80, bottom: 60, left: 60 }}
              showLegend={showLegend}
              legendPosition={legendPosition.value}
              colorPalette={colorPalette.value}
              showAxis={showAxis}
              title={t('components:lineChartTest.chartTitle')}
              xAxisLabel={t('components:lineChartTest.date')}
              yAxisLabel={t('components:lineChartTest.percentage')}
              timeframe={timeframe.value}
              onPointClick={handlePointClick}
            />
          </Box>

          {/* Controls Container */}
          <Box padding="l">
            <SpaceBetween size="l">
              <Header variant="h3">{t('components:lineChartTest.chartControls')}</Header>
              
              <FormField label={t('components:lineChartTest.showLegend')}>
                <Toggle
                  checked={showLegend}
                  onChange={({ detail }) => setShowLegend(detail.checked)}
                />
              </FormField>

              <FormField label={t('components:lineChartTest.legendPosition')}>
                <Select
                  selectedOption={legendPosition}
                  onChange={({ detail }) => setLegendPosition(detail.selectedOption)}
                  options={legendPositions}
                  disabled={!showLegend}
                />
              </FormField>

              <FormField label={t('components:lineChartTest.showAxis')}>
                <Toggle
                  checked={showAxis}
                  onChange={({ detail }) => setShowAxis(detail.checked)}
                />
              </FormField>

              <FormField label={t('components:lineChartTest.colorPalette')}>
                <Select
                  selectedOption={colorPalette}
                  onChange={({ detail }) => setColorPalette(detail.selectedOption)}
                  options={colorPalettes}
                />
              </FormField>

              {selectedPoint && (
                <Box variant="awsui-key-label">
                  <Header variant="h3">{t('components:lineChartTest.selectedPoint')}</Header>
                  <ColumnLayout columns={1} variant="text-grid">
                    <div>
                      <Box variant="awsui-key-label">{t('components:lineChartTest.series')}</Box>
                      <div>{selectedPoint.seriesName}</div>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{t('components:lineChartTest.date')}</Box>
                      <div>{formatDate(selectedPoint.date)}</div>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{t('components:lineChartTest.value')}</Box>
                      <div>{selectedPoint.value}%</div>
                    </div>
                  </ColumnLayout>
                </Box>
              )}

              <Button
                onClick={() => setSelectedPoint(null)}
                disabled={!selectedPoint}
              >
                {t('components:lineChartTest.clearSelection')}
              </Button>
            </SpaceBetween>
          </Box>
        </Grid>

        <Box>
          <Header variant="h3">{t('components:lineChartTest.componentFeatures')}</Header>
          <ul>
            <li>{t('components:lineChartTest.feature1')}</li>
            <li>{t('components:lineChartTest.feature2')}</li>
            <li>{t('components:lineChartTest.feature3')}</li>
            <li>{t('components:lineChartTest.feature4')}</li>
            <li>{t('components:lineChartTest.feature5')}</li>
            <li>{t('components:lineChartTest.feature6')}</li>
            <li>{t('components:lineChartTest.feature7')}</li>
            <li>{t('components:lineChartTest.feature8')}</li>
            <li>{t('components:lineChartTest.feature9')}</li>
            <li>{t('components:lineChartTest.feature10')}</li>
          </ul>
        </Box>
      </SpaceBetween>
    </Container>
  );
};

export default LineChartTest;
