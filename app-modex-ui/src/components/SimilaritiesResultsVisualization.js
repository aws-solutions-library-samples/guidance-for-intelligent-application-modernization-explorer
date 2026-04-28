/**
 * Similarities Results Visualization Component
 * 
 * This component displays the results of the similarities analysis in multiple formats:
 * - Network diagram showing application relationships
 * - Distribution chart showing similarity score ranges
 * - Top similar pairs table
 * - Summary statistics
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Container,
  Header,
  SpaceBetween,
  Box,
  Grid,
  ColumnLayout,
  KeyValuePairs,
  Table,
  Badge,
  Tabs,
  Alert,
  Spinner,
  Button
} from '@cloudscape-design/components';
import * as d3 from 'd3';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { getChartColors } from '../utils/chartThemeUtils';
import { 
  fetchSimilaritiesResults, 
  processSimilaritiesForVisualization, 
  getTopSimilarPairs
} from '../services/similaritiesResultsApi';

const SimilaritiesResultsVisualization = ({ projectId }) => {
  const { t } = useTranslation(['components', 'common']);
  const { isDark } = useTheme();
  const [data, setData] = useState(null);
  const [processedData, setProcessedData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('network');
  const [retryCount, setRetryCount] = useState(0);
  
  const networkRef = useRef();
  const distributionRef = useRef();

  // Retry function
  const retryLoadData = () => {
    setRetryCount(prev => prev + 1);
    setError(null);
  };

  // Fetch and process data
  useEffect(() => {
    const loadData = async () => {
      if (!projectId) {
        setError('No project ID provided');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        console.log(`Loading similarities data for project: ${projectId} (attempt ${retryCount + 1})`);
        
        const rawData = await fetchSimilaritiesResults(projectId);
        console.log('Loaded similarities data:', rawData.length, 'pairs');
        
        if (!rawData || rawData.length === 0) {
          setError('No similarities analysis results found. Please run the similarities analysis first.');
          return;
        }
        
        const processed = processSimilaritiesForVisualization(rawData);
        
        setData(rawData);
        setProcessedData(processed);
        
      } catch (err) {
        console.error('Error loading similarities data:', err);
        
        // Check if this is expected "no data" behavior
        if (err.type === 'NO_DATA') {
          // This is expected - show info instead of error
          setProcessedData(null); // This will trigger the "no results" info state
          return;
        }
        
        // Provide specific error messages based on error type
        let errorMessage = 'Failed to load similarities analysis results.';
        
        if (err.message.includes('Authentication')) {
          errorMessage = 'Authentication failed. Please log in again.';
        } else if (err.message.includes('404')) {
          errorMessage = 'No similarities analysis results found for this project. Please run the analysis first.';
        } else if (err.message.includes('403')) {
          errorMessage = 'You do not have permission to access this project\'s data.';
        } else if (err.message.includes('500')) {
          errorMessage = 'Server error occurred while loading results. Please try again later.';
        } else if (err.message) {
          errorMessage = err.message;
        }
        
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [projectId, retryCount]);

  // Create network diagram
  useEffect(() => {
    if (!processedData?.networkData || !networkRef.current) return;

    const container = d3.select(networkRef.current);
    container.selectAll('*').remove();

    const width = 800;
    const height = 600;
    const margin = { top: 20, right: 20, bottom: 20, left: 20 };

    const svg = container
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('border', '1px solid #e0e0e0')
      .style('border-radius', '8px');

    const { nodes, links } = processedData.networkData;

    // Create force simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(d => 100 * (1 - d.strength)))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Color scale for groups
    const colorScale = d3.scaleOrdinal()
      .domain(['frontend', 'backend', 'data', 'integration', 'other'])
      .range(['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6']);

    // Create links
    const link = svg.append('g')
      .selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', d => Math.sqrt(d.strength * 5));

    // Create nodes
    const node = svg.append('g')
      .selectAll('circle')
      .data(nodes)
      .enter().append('circle')
      .attr('r', d => Math.sqrt(d.connections) * 3 + 8)
      .attr('fill', d => colorScale(d.group))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    // Add labels
    const label = svg.append('g')
      .selectAll('text')
      .data(nodes)
      .enter().append('text')
      .text(d => d.name.length > 20 ? d.name.substring(0, 17) + '...' : d.name)
      .attr('font-size', '10px')
      .attr('font-family', 'Arial, sans-serif')
      .attr('text-anchor', 'middle')
      .attr('dy', '.35em')
      .attr('fill', '#333');

    // Add tooltips
    node.append('title')
      .text(d => `${d.name}\nGroup: ${d.group}\nConnections: ${d.connections}`);

    link.append('title')
      .text(d => `${d.source.name} ↔ ${d.target.name}\nSimilarity: ${(d.similarity * 100).toFixed(1)}%`);

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);

      label
        .attr('x', d => d.x)
        .attr('y', d => d.y);
    });

    // Drag functions
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Add legend
    const legend = svg.append('g')
      .attr('transform', `translate(${width - 150}, 20)`);

    const legendItems = ['frontend', 'backend', 'data', 'integration', 'other'];
    
    legend.selectAll('rect')
      .data(legendItems)
      .enter().append('rect')
      .attr('x', 0)
      .attr('y', (d, i) => i * 20)
      .attr('width', 15)
      .attr('height', 15)
      .attr('fill', d => colorScale(d));

    legend.selectAll('text')
      .data(legendItems)
      .enter().append('text')
      .attr('x', 20)
      .attr('y', (d, i) => i * 20 + 12)
      .text(d => d.charAt(0).toUpperCase() + d.slice(1))
      .attr('font-size', '12px')
      .attr('font-family', 'Arial, sans-serif');

  }, [processedData]);

  // Create distribution chart
  useEffect(() => {
    if (!processedData?.distributionData || !distributionRef.current) return;

    const container = d3.select(distributionRef.current);
    container.selectAll('*').remove();

    const width = 600;
    const height = 400;
    const margin = { top: 20, right: 20, bottom: 60, left: 60 };

    const svg = container
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('border', '1px solid #e0e0e0')
      .style('border-radius', '8px');

    const data = processedData.distributionData;

    // Scales
    const xScale = d3.scaleBand()
      .domain(data.map(d => d.range))
      .range([margin.left, width - margin.right])
      .padding(0.1);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.count)])
      .range([height - margin.bottom, margin.top]);

    // Color scale
    const colorScale = d3.scaleSequential()
      .domain([0, d3.max(data, d => d.count)])
      .interpolator(d3.interpolateBlues);

    // Bars
    svg.selectAll('rect')
      .data(data)
      .enter().append('rect')
      .attr('x', d => xScale(d.range))
      .attr('y', d => yScale(d.count))
      .attr('width', xScale.bandwidth())
      .attr('height', d => yScale(0) - yScale(d.count))
      .attr('fill', d => colorScale(d.count))
      .attr('stroke', '#333')
      .attr('stroke-width', 1);

    // Add value labels on bars
    svg.selectAll('.bar-label')
      .data(data)
      .enter().append('text')
      .attr('class', 'bar-label')
      .attr('x', d => xScale(d.range) + xScale.bandwidth() / 2)
      .attr('y', d => yScale(d.count) - 5)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('font-family', 'Arial, sans-serif')
      .text(d => d.count);

    // X axis
    svg.append('g')
      .attr('transform', `translate(0, ${height - margin.bottom})`)
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');

    // Y axis
    svg.append('g')
      .attr('transform', `translate(${margin.left}, 0)`)
      .call(d3.axisLeft(yScale));

    // Axis labels
    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', 0 - margin.left)
      .attr('x', 0 - (height / 2))
      .attr('dy', '1em')
      .style('text-anchor', 'middle')
      .text('Number of Application Pairs');

    svg.append('text')
      .attr('transform', `translate(${width / 2}, ${height - 10})`)
      .style('text-anchor', 'middle')
      .text('Similarity Score Range');

  }, [processedData]);

  if (loading) {
    return (
      <Container>
        <Box textAlign="center" padding="xl">
          <Spinner size="large" />
          <Box variant="p" padding={{ top: 'm' }}>
            {t('components:similaritiesVisualization.loadingResults')}
          </Box>
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <SpaceBetween size="m">
          <Alert 
            type="error" 
            header={t('components:errors.failedToLoadSimilaritiesResults')}
            action={
              <Button 
                onClick={retryLoadData}
                iconName="refresh"
                loading={loading}
              >
                {t('common.retry')}
              </Button>
            }
          >
            <SpaceBetween size="s">
              <Box>{error}</Box>
              {retryCount > 0 && (
                <Box variant="small" color="text-body-secondary">
                  {t('components:similaritiesVisualization.retryAttempts', { count: retryCount })}
                </Box>
              )}
              <Box variant="small" color="text-body-secondary">
                <strong>{t('components:similaritiesVisualization.troubleshootingTips')}</strong>
                <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                  <li>{t('components:similaritiesVisualization.tip1')}</li>
                  <li>{t('components:similaritiesVisualization.tip2')}</li>
                  <li>{t('components:similaritiesVisualization.tip3')}</li>
                  <li>{t('components:similaritiesVisualization.tip4')}</li>
                </ul>
              </Box>
            </SpaceBetween>
          </Alert>
          
          {/* Debug information for development */}
          {process.env.NODE_ENV === 'development' && (
            <Alert type="info" header={t('components:similaritiesVisualization.debugInformation')}>
              <SpaceBetween size="xs">
                <Box variant="small">{t('components:similaritiesVisualization.projectId')} {projectId || t('components:similaritiesVisualization.notProvided')}</Box>
                <Box variant="small">{t('components:similaritiesVisualization.apiUrl')} {process.env.REACT_APP_API_URL || t('components:similaritiesVisualization.notConfigured')}</Box>
                <Box variant="small">{t('components:similaritiesVisualization.authentication')}</Box>
              </SpaceBetween>
            </Alert>
          )}
        </SpaceBetween>
      </Container>
    );
  }

  if (!processedData) {
    return (
      <Container>
        <SpaceBetween size="m">
          <Alert 
            type="info" 
            header={t('components:similaritiesVisualization.noResultsAvailable')}
            action={
              <Button 
                onClick={retryLoadData}
                iconName="refresh"
                variant="primary"
              >
                {t('components:similaritiesVisualization.checkAgain')}
              </Button>
            }
          >
            <SpaceBetween size="s">
              <Box>
                {t('components:similaritiesVisualization.noResultsMessage')}
              </Box>
              <Box variant="small">
                <strong>{t('components:similaritiesVisualization.nextSteps')}</strong>
                <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                  <li>{t('components:similaritiesVisualization.step1')}</li>
                  <li>{t('components:similaritiesVisualization.step2')}</li>
                  <li>{t('components:similaritiesVisualization.step3')}</li>
                </ul>
              </Box>
            </SpaceBetween>
          </Alert>
        </SpaceBetween>
      </Container>
    );
  }

  const topPairs = getTopSimilarPairs(data, 10);

  return (
    <Container>
      <SpaceBetween size="l">
        <Header variant="h2">
          {t('components:similaritiesVisualization.title')}
        </Header>

        {/* Summary Statistics */}
        <Grid gridDefinition={[{ colspan: 3 }, { colspan: 3 }, { colspan: 3 }, { colspan: 3 }]}>
          <Box textAlign="center" padding="m">
            <Box variant="h1" color="text-status-info">
              {processedData.summaryStats.totalPairs}
            </Box>
            <Box variant="small">{t('components:similaritiesVisualization.totalApplicationPairs')}</Box>
          </Box>
          <Box textAlign="center" padding="m">
            <Box variant="h1" color="text-status-success">
              {processedData.summaryStats.uniqueApplications}
            </Box>
            <Box variant="small">{t('components:similaritiesVisualization.uniqueApplications')}</Box>
          </Box>
          <Box textAlign="center" padding="m">
            <Box variant="h1" color="text-status-warning">
              {(processedData.summaryStats.averageSimilarity * 100).toFixed(1)}%
            </Box>
            <Box variant="small">{t('components:similaritiesVisualization.averageSimilarity')}</Box>
          </Box>
          <Box textAlign="center" padding="m">
            <Box variant="h1" color="text-status-error">
              {(processedData.summaryStats.maxSimilarity * 100).toFixed(1)}%
            </Box>
            <Box variant="small">{t('components:similaritiesVisualization.highestSimilarity')}</Box>
          </Box>
        </Grid>

        {/* Visualization Tabs */}
        <Tabs
          activeTabId={activeTab}
          onChange={({ detail }) => setActiveTab(detail.activeTabId)}
          tabs={[
            {
              id: 'network',
              label: t('components:similaritiesVisualization.networkDiagram'),
              content: (
                <SpaceBetween size="m">
                  <Box variant="p">
                    {t('components:similaritiesVisualization.networkDescription')}
                  </Box>
                  <div ref={networkRef} style={{ textAlign: 'center' }} />
                </SpaceBetween>
              )
            },
            {
              id: 'distribution',
              label: t('components:similaritiesVisualization.similarityDistribution'),
              content: (
                <SpaceBetween size="m">
                  <Box variant="p">
                    {t('components:similaritiesVisualization.distributionDescription')}
                  </Box>
                  <div ref={distributionRef} style={{ textAlign: 'center' }} />
                </SpaceBetween>
              )
            },
            {
              id: 'top-pairs',
              label: t('components:similaritiesVisualization.topSimilarPairs'),
              content: (
                <Table
                  columnDefinitions={[
                    {
                      id: 'rank',
                      header: t('components:similaritiesVisualization.rank'),
                      cell: (item, index) => index + 1,
                      width: 60
                    },
                    {
                      id: 'app1',
                      header: t('components:similaritiesVisualization.application1'),
                      cell: item => item.app1
                    },
                    {
                      id: 'app2',
                      header: t('components:similaritiesVisualization.application2'),
                      cell: item => item.app2
                    },
                    {
                      id: 'similarity',
                      header: t('components:similaritiesVisualization.similarityScore'),
                      cell: item => (
                        <Badge 
                          color={item.similarity > 70 ? 'green' : item.similarity > 50 ? 'blue' : 'grey'}
                        >
                          {item.similarity}%
                        </Badge>
                      )
                    }
                  ]}
                  items={topPairs}
                  loadingText={t('components:similaritiesVisualization.loadingSimilarPairs')}
                  empty={
                    <Box textAlign="center" color="inherit">
                      <b>{t('components:similaritiesVisualization.noSimilarPairsFound')}</b>
                      <Box variant="p" color="inherit">
                        {t('components:similaritiesVisualization.noSimilarPairsMessage')}
                      </Box>
                    </Box>
                  }
                />
              )
            }
          ]}
        />

        {/* Detailed Statistics */}
        <ColumnLayout columns={2}>
          <Container>
            <Header variant="h3">{t('components:similaritiesVisualization.analysisSummary')}</Header>
            <KeyValuePairs
              columns={1}
              items={[
                { label: t('components:similaritiesVisualization.totalApplicationPairs'), value: processedData.summaryStats.totalPairs },
                { label: t('components:similaritiesVisualization.uniqueApplications'), value: processedData.summaryStats.uniqueApplications },
                { label: t('components:similaritiesVisualization.averageSimilarity'), value: `${(processedData.summaryStats.averageSimilarity * 100).toFixed(2)}%` },
                { label: t('components:similaritiesVisualization.highestSimilarity'), value: `${(processedData.summaryStats.maxSimilarity * 100).toFixed(2)}%` },
                { label: t('components:similaritiesVisualization.lowestSimilarity'), value: `${(processedData.summaryStats.minSimilarity * 100).toFixed(2)}%` }
              ]}
            />
          </Container>
          
          <Container>
            <Header variant="h3">{t('components:similaritiesVisualization.distributionBreakdown')}</Header>
            <Table
              columnDefinitions={[
                {
                  id: 'range',
                  header: t('components:similaritiesVisualization.similarityRange'),
                  cell: item => item.range
                },
                {
                  id: 'count',
                  header: t('components:similaritiesVisualization.pairsCount'),
                  cell: item => item.count
                },
                {
                  id: 'percentage',
                  header: t('components:similaritiesVisualization.percentage'),
                  cell: item => `${item.percentage}%`
                }
              ]}
              items={processedData.distributionData.filter(item => item.count > 0)}
              variant="embedded"
            />
          </Container>
        </ColumnLayout>
      </SpaceBetween>
    </Container>
  );
};

export default SimilaritiesResultsVisualization;
