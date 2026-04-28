/**
 * Comprehensive Similarity Analysis Component
 * 
 * Provides multiple views for exploring similarity analysis results:
 * - Detailed sortable table with all similarity pairs
 * - Interactive heatmap showing app-to-app similarities
 * - Cluster analysis grouping similar applications
 * - Network diagram with improved persistence
 * - Search and filtering capabilities
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Container,
  Header,
  SpaceBetween,
  Box,
  Grid,
  ColumnLayout,
  Table,
  Badge,
  Tabs,
  Alert,
  Spinner,
  Button,
  TextFilter,
  Pagination,
  CollectionPreferences,
  PropertyFilter,
  Select,
  FormField,
  Slider,
  Input
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import * as d3 from 'd3';
import { useTheme } from '../contexts/ThemeContext';
import { getChartColors } from '../utils/chartThemeUtils';
import { 
  fetchSimilaritiesResults, 
  processSimilaritiesForVisualization, 
  getTopSimilarPairs
} from '../services/similaritiesResultsApi';

const ComprehensiveSimilarityAnalysis = ({ projectId }) => {
  const { t } = useTranslation(['common']);
  const { isDark } = useTheme();
  const [data, setData] = useState(null);
  const [processedData, setProcessedData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('table');
  const [retryCount, setRetryCount] = useState(0);
  
  // Table state
  const [selectedItems, setSelectedItems] = useState([]);
  const [filteringText, setFilteringText] = useState('');
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortingColumn, setSortingColumn] = useState({ sortingField: 'similarity_score', sortingDescending: true });
  
  // Filter state
  const [similarityThreshold, setSimilarityThreshold] = useState({ label: 'All similarities', value: 0 });
  const [customThreshold, setCustomThreshold] = useState(0.5);
  const [useCustomThreshold, setUseCustomThreshold] = useState(false);
  const [selectedApps, setSelectedApps] = useState([]);
  
  const networkRef = useRef();
  const heatmapRef = useRef();

  // Similarity threshold options
  const thresholdOptions = [
    { label: 'All similarities', value: 0 },
    { label: 'High similarity (≥ 70%)', value: 0.7 },
    { label: 'Medium similarity (≥ 50%)', value: 0.5 },
    { label: 'Low similarity (≥ 30%)', value: 0.3 },
    { label: 'Custom threshold', value: 'custom' }
  ];

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
        
        if (err.type === 'NO_DATA') {
          setProcessedData(null);
          return;
        }
        
        let errorMessage = 'Failed to load similarities analysis results.';
        if (err.message.includes('Authentication')) {
          errorMessage = 'Authentication failed. Please log in again.';
        } else if (err.message.includes('404')) {
          errorMessage = 'No similarities analysis results found for this project. Please run the analysis first.';
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

  // Get unique applications for filtering
  const uniqueApps = useMemo(() => {
    if (!data) return [];
    const apps = new Set();
    data.forEach(pair => {
      apps.add(pair.app1);
      apps.add(pair.app2);
    });
    return Array.from(apps).sort().map(app => ({ label: app, value: app }));
  }, [data]);

  // Filter and sort data for table
  const filteredData = useMemo(() => {
    if (!data) return [];
    
    let filtered = data.filter(pair => {
      // Apply similarity threshold
      const thresholdValue = similarityThreshold.value === 'custom' ? customThreshold : similarityThreshold.value;
      if (pair.similarity_score < thresholdValue) return false;
      
      // Apply app filter
      if (selectedApps.length > 0) {
        const appValues = selectedApps.map(app => app.value);
        if (!appValues.includes(pair.app1) && !appValues.includes(pair.app2)) return false;
      }
      
      // Apply text filter
      if (filteringText) {
        const searchText = filteringText.toLowerCase();
        return pair.app1.toLowerCase().includes(searchText) || 
               pair.app2.toLowerCase().includes(searchText);
      }
      
      return true;
    });

    // Apply sorting
    if (sortingColumn.sortingField) {
      filtered.sort((a, b) => {
        const aVal = a[sortingColumn.sortingField];
        const bVal = b[sortingColumn.sortingField];
        
        let comparison = 0;
        if (typeof aVal === 'string') {
          comparison = aVal.localeCompare(bVal);
        } else {
          comparison = aVal - bVal;
        }
        
        return sortingColumn.sortingDescending ? -comparison : comparison;
      });
    }

    return filtered;
  }, [data, similarityThreshold, customThreshold, selectedApps, filteringText, sortingColumn]);

  // Paginated data
  const paginatedData = useMemo(() => {
    const startIndex = (currentPageIndex - 1) * pageSize;
    return filteredData.slice(startIndex, startIndex + pageSize);
  }, [filteredData, currentPageIndex, pageSize]);

  // Create network diagram - now depends on activeTab
  useEffect(() => {
    if (!processedData?.networkData || !networkRef.current || activeTab !== 'network') return;

    const container = d3.select(networkRef.current);
    container.selectAll('*').remove();

    // Get container dimensions and use most of the available space
    const containerWidth = networkRef.current.clientWidth || 1000;
    const containerHeight = 700; // Fixed height for consistency
    
    // Use 90% of available width for better space utilization
    const width = containerWidth * 0.9;
    const height = containerHeight;

    // Create wrapper div for centering
    const wrapper = container
      .append('div')
      .style('width', '100%')
      .style('display', 'flex')
      .style('justify-content', 'center')
      .style('align-items', 'center')
      .style('min-height', `${height}px`);

    const svg = wrapper
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .style('border', '1px solid #e0e0e0')
      .style('border-radius', '8px')
      .style('background-color', '#fafafa');

    const { nodes, links } = processedData.networkData;

    // Initialize nodes with better starting positions to encourage spreading
    const radius = Math.min(width, height) * 0.25;
    nodes.forEach((node, i) => {
      const angle = (i / nodes.length) * 2 * Math.PI;
      node.x = width / 2 + radius * Math.cos(angle) + (Math.random() - 0.5) * 50;
      node.y = height / 2 + radius * Math.sin(angle) + (Math.random() - 0.5) * 50;
    });

    // Create force simulation optimized for spreading nodes across the available space
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(d => {
        // Scale link distance based on container size and similarity strength
        const baseDistance = Math.min(width, height) * 0.15; // 15% of smaller dimension
        return Math.max(baseDistance * 0.8, baseDistance * (1.5 - d.strength));
      }))
      .force('charge', d3.forceManyBody().strength(d => {
        // Stronger repulsion for larger spaces, scaled by node importance
        const baseStrength = -Math.min(width, height) * 0.8;
        return baseStrength * (1 + d.connections * 0.1);
      }))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => {
        // Larger collision radius to prevent overlap
        return Math.sqrt(d.connections * 8) + Math.min(width, height) * 0.025;
      }))
      .force('x', d3.forceX(width / 2).strength(0.05)) // Weaker centering force
      .force('y', d3.forceY(height / 2).strength(0.05)) // Weaker centering force
      .force('radial', d3.forceRadial(Math.min(width, height) * 0.3, width / 2, height / 2).strength(0.02)) // Gentle radial spread
      .alphaDecay(0.01) // Slower decay for longer simulation
      .velocityDecay(0.3); // Lower velocity decay for more movement

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
      .attr('stroke-width', d => Math.sqrt(d.strength * 12) + 1);

    // Create nodes with better sizing for larger space
    const node = svg.append('g')
      .selectAll('circle')
      .data(nodes)
      .enter().append('circle')
      .attr('r', d => Math.sqrt(d.connections * 8) + 8)
      .attr('fill', d => colorScale(d.group))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended));

    // Add labels with better font sizing
    const label = svg.append('g')
      .selectAll('text')
      .data(nodes)
      .enter().append('text')
      .text(d => d.id.length > 15 ? d.id.substring(0, 12) + '...' : d.id)
      .style('font-size', '13px')
      .style('font-family', 'Arial, sans-serif')
      .style('font-weight', '500')
      .style('text-anchor', 'middle')
      .style('dominant-baseline', 'middle')
      .style('pointer-events', 'none')
      .style('fill', '#333');

    // Add tooltips
    node.append('title')
      .text(d => `${d.id}\nConnections: ${d.connections}\nGroup: ${d.group}`);

    // Update positions on simulation tick
    simulation.on('tick', () => {
      // Keep nodes within bounds with better space utilization
      const padding = Math.min(width, height) * 0.08; // Dynamic padding based on size
      node
        .attr('cx', d => d.x = Math.max(padding, Math.min(width - padding, d.x)))
        .attr('cy', d => d.y = Math.max(padding, Math.min(height - padding, d.y)));

      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

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

  }, [processedData?.networkData, activeTab]); // Added activeTab dependency

  // Cleanup tooltips on unmount
  useEffect(() => {
    return () => {
      d3.selectAll('.heatmap-tooltip').remove();
    };
  }, []);

  // Create heatmap
  useEffect(() => {
    if (!data || !heatmapRef.current || activeTab !== 'heatmap') return;

    const container = d3.select(heatmapRef.current);
    container.selectAll('*').remove();

    // Remove any existing tooltips
    d3.selectAll('.heatmap-tooltip').remove();

    // Get unique applications
    const apps = Array.from(new Set([...data.map(d => d.app1), ...data.map(d => d.app2)])).sort();
    
    // Create similarity matrix
    const matrix = {};
    apps.forEach(app1 => {
      matrix[app1] = {};
      apps.forEach(app2 => {
        matrix[app1][app2] = 0;
      });
    });

    // Fill matrix with similarity scores
    data.forEach(pair => {
      matrix[pair.app1][pair.app2] = pair.similarity_score;
      matrix[pair.app2][pair.app1] = pair.similarity_score; // Make symmetric
    });

    // Set diagonal to 1 (self-similarity)
    apps.forEach(app => {
      matrix[app][app] = 1;
    });

    // Get container dimensions
    const containerWidth = heatmapRef.current.clientWidth || 1000;
    const margin = { top: 120, right: 80, bottom: 120, left: 200 };
    
    // Calculate optimal cell size to use most of the available space
    const availableWidth = containerWidth - margin.left - margin.right;
    const availableHeight = 700; // Increased height for better visibility
    
    // Use much more of the available space - aim for 85% width utilization
    const targetWidth = availableWidth * 0.85;
    const cellSizeFromWidth = targetWidth / apps.length;
    const cellSizeFromHeight = availableHeight / apps.length;
    
    // Use the smaller of the two, but with a much higher minimum and maximum
    const cellSize = Math.max(Math.min(cellSizeFromWidth, cellSizeFromHeight, 60), 25);
    
    const matrixWidth = apps.length * cellSize;
    const matrixHeight = apps.length * cellSize;
    const totalWidth = matrixWidth + margin.left + margin.right;
    const totalHeight = matrixHeight + margin.top + margin.bottom;

    // Create wrapper div for centering
    const wrapper = container
      .append('div')
      .style('width', '100%')
      .style('display', 'flex')
      .style('justify-content', 'center')
      .style('overflow-x', 'auto');

    const svg = wrapper
      .append('svg')
      .attr('width', totalWidth)
      .attr('height', totalHeight);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Color scale
    const colorScale = d3.scaleSequential(d3.interpolateBlues)
      .domain([0, 1]);

    // Create tooltip div
    const tooltip = d3.select('body').append('div')
      .attr('class', 'heatmap-tooltip')
      .style('position', 'absolute')
      .style('visibility', 'hidden')
      .style('background-color', 'rgba(0, 0, 0, 0.8)')
      .style('color', 'white')
      .style('padding', '8px 12px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('font-family', 'Arial, sans-serif')
      .style('pointer-events', 'none')
      .style('z-index', '1000')
      .style('box-shadow', '0 2px 4px rgba(0,0,0,0.2)');

    // Create cells with interactive tooltips
    apps.forEach((app1, i) => {
      apps.forEach((app2, j) => {
        const similarityScore = matrix[app1][app2];
        const cell = g.append('rect')
          .attr('x', j * cellSize)
          .attr('y', i * cellSize)
          .attr('width', cellSize)
          .attr('height', cellSize)
          .attr('fill', colorScale(similarityScore))
          .attr('stroke', '#fff')
          .attr('stroke-width', 1)
          .style('cursor', 'pointer')
          .on('mouseover', function(event) {
            // Highlight the cell
            d3.select(this)
              .attr('stroke', '#333')
              .attr('stroke-width', 2);
            
            // Show tooltip
            tooltip
              .style('visibility', 'visible')
              .html(`
                <div><strong>${app1}</strong> ↔ <strong>${app2}</strong></div>
                <div>Similarity: <strong>${(similarityScore * 100).toFixed(1)}%</strong></div>
                <div>Level: <strong>${
                  similarityScore >= 0.7 ? 'High' : 
                  similarityScore >= 0.5 ? 'Medium' : 
                  similarityScore >= 0.3 ? 'Low' : 'Very Low'
                }</strong></div>
              `);
          })
          .on('mousemove', function(event) {
            // Update tooltip position
            tooltip
              .style('top', (event.pageY - 10) + 'px')
              .style('left', (event.pageX + 10) + 'px');
          })
          .on('mouseout', function() {
            // Remove highlight
            d3.select(this)
              .attr('stroke', '#fff')
              .attr('stroke-width', 1);
            
            // Hide tooltip
            tooltip.style('visibility', 'hidden');
          });
      });
    });

    // Add row labels
    g.selectAll('.row-label')
      .data(apps)
      .enter().append('text')
      .attr('class', 'row-label')
      .attr('x', -15)
      .attr('y', (d, i) => i * cellSize + cellSize / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .style('font-size', `${Math.min(Math.max(cellSize * 0.3, 10), 14)}px`)
      .style('font-family', 'Arial, sans-serif')
      .style('font-weight', '500')
      .text(d => d.length > 25 ? d.substring(0, 22) + '...' : d);

    // Add column labels
    g.selectAll('.col-label')
      .data(apps)
      .enter().append('text')
      .attr('class', 'col-label')
      .attr('x', (d, i) => i * cellSize + cellSize / 2)
      .attr('y', -15)
      .attr('text-anchor', 'start')
      .attr('dominant-baseline', 'middle')
      .style('font-size', `${Math.min(Math.max(cellSize * 0.3, 10), 14)}px`)
      .style('font-family', 'Arial, sans-serif')
      .style('font-weight', '500')
      .attr('transform', (d, i) => `rotate(-45, ${i * cellSize + cellSize / 2}, -15)`)
      .text(d => d.length > 25 ? d.substring(0, 22) + '...' : d);

    // Add color legend
    const legendWidth = 200;
    const legendHeight = 20;
    const legendX = matrixWidth - legendWidth;
    const legendY = matrixHeight + 40;

    // Legend gradient
    const defs = svg.append('defs');
    const gradient = defs.append('linearGradient')
      .attr('id', 'heatmap-legend')
      .attr('x1', '0%')
      .attr('x2', '100%');

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', colorScale(0));

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', colorScale(1));

    // Legend rectangle
    g.append('rect')
      .attr('x', legendX)
      .attr('y', legendY)
      .attr('width', legendWidth)
      .attr('height', legendHeight)
      .style('fill', 'url(#heatmap-legend)')
      .attr('stroke', '#ccc');

    // Legend labels
    g.append('text')
      .attr('x', legendX)
      .attr('y', legendY + legendHeight + 15)
      .attr('text-anchor', 'start')
      .style('font-size', '12px')
      .text('0%');

    g.append('text')
      .attr('x', legendX + legendWidth)
      .attr('y', legendY + legendHeight + 15)
      .attr('text-anchor', 'end')
      .style('font-size', '12px')
      .text('100%');

    g.append('text')
      .attr('x', legendX + legendWidth / 2)
      .attr('y', legendY - 5)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('font-weight', 'bold')
      .text('Similarity Score');

  }, [data, activeTab]); // Added activeTab dependency

  // Table columns
  const tableColumns = [
    {
      id: 'app1',
      header: 'Application 1',
      cell: item => item.app1,
      sortingField: 'app1',
      isRowHeader: true
    },
    {
      id: 'app2',
      header: 'Application 2', 
      cell: item => item.app2,
      sortingField: 'app2'
    },
    {
      id: 'similarity_score',
      header: 'Similarity Score',
      cell: item => (
        <Badge 
          color={item.similarity_score >= 0.7 ? 'green' : item.similarity_score >= 0.5 ? 'blue' : 'grey'}
        >
          {(item.similarity_score * 100).toFixed(1)}%
        </Badge>
      ),
      sortingField: 'similarity_score'
    },
    {
      id: 'similarity_category',
      header: 'Similarity Level',
      cell: item => {
        if (item.similarity_score >= 0.7) return <Badge color="green">{t('components:similarity.high')}</Badge>;
        if (item.similarity_score >= 0.5) return <Badge color="blue">{t('components:similarity.medium')}</Badge>;
        if (item.similarity_score >= 0.3) return <Badge color="grey">{t('components:similarity.low')}</Badge>;
        return <Badge color="red">{t('components:badges.veryLow')}</Badge>;
      }
    },
    {
      id: 'timestamp',
      header: 'Analysis Date',
      cell: item => item.timestamp ? new Date(item.timestamp).toLocaleDateString() : 'N/A'
    }
  ];

  const retryLoadData = () => {
    setRetryCount(prev => prev + 1);
    setError(null);
  };

  if (loading) {
    return (
      <Container>
        <Box textAlign="center" padding="xxl">
          <Spinner size="large" />
          <Box variant="p" color="text-body-secondary">
            Loading similarity analysis results...
          </Box>
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Alert
          statusIconAriaLabel={t('components:errors.statusIconAriaLabel')}
          type="error"
          header={t('components:similarity.failedToLoadSimilaritiesResults')}
          action={
            <Button onClick={retryLoadData}>
              Check again
            </Button>
          }
        >
          {error}
          <br />
          <strong>Retry attempts:</strong> {retryCount}
          <br />
          <strong>{t('components:troubleshooting.tips')}</strong>
          <ul>
            <li>{t('components:troubleshooting.ensureAnalysisRun')}</li>
            <li>{t('components:troubleshooting.checkPermissions')}</li>
            <li>{t('components:troubleshooting.verifyToken')}</li>
            <li>{t('components:troubleshooting.tryRefreshing')}</li>
          </ul>
        </Alert>
      </Container>
    );
  }

  if (!processedData) {
    return (
      <Container>
        <Alert
          statusIconAriaLabel={t('components:errors.statusIconAriaLabel')}
          type="info"
          header={t('components:similarity.noSimilarityAnalysisResults')}
        >
          {t('components:similarity.noSimilarityResultsMessage')}
        </Alert>
      </Container>
    );
  }

  return (
    <SpaceBetween size="l">
      {/* Summary Statistics */}
      <Container>
        <Header variant="h2">{t('components:analysisResults.similarityAnalysisResults')}</Header>
        <Grid gridDefinition={[{ colspan: 3 }, { colspan: 3 }, { colspan: 3 }, { colspan: 3 }]}>
          <Box>
            <Box variant="awsui-key-label">{t('components:analysisResults.totalSimilarityPairs')}</Box>
            <Box variant="awsui-value-large">{data?.length || 0}</Box>
          </Box>
          <Box>
            <Box variant="awsui-key-label">{t('components:analysisResults.uniqueApplications')}</Box>
            <Box variant="awsui-value-large">{uniqueApps.length}</Box>
          </Box>
          <Box>
            <Box variant="awsui-key-label">High Similarity (≥70%)</Box>
            <Box variant="awsui-value-large">
              {data?.filter(pair => pair.similarity_score >= 0.7).length || 0}
            </Box>
          </Box>
          <Box>
            <Box variant="awsui-key-label">{t('components:analysisResults.averageSimilarity')}</Box>
            <Box variant="awsui-value-large">
              {data?.length ? ((data.reduce((sum, pair) => sum + pair.similarity_score, 0) / data.length) * 100).toFixed(1) + '%' : '0%'}
            </Box>
          </Box>
        </Grid>
      </Container>

      {/* Visualization Tabs */}
      <Container>
        <Tabs
          activeTabId={activeTab}
          onChange={({ detail }) => setActiveTab(detail.activeTabId)}
          tabs={[
            {
              id: 'table',
              label: 'Detailed Table',
              content: (
                <SpaceBetween size="l">
                  {/* Filters */}
                  <SpaceBetween size="m">
                    <ColumnLayout columns={3}>
                      <FormField label={t('components:similarity.similarityThreshold')}
                        <Select
                          selectedOption={similarityThreshold}
                          onChange={({ detail }) => {
                            setSimilarityThreshold(detail.selectedOption);
                            setUseCustomThreshold(detail.selectedOption.value === 'custom');
                          }}
                          options={thresholdOptions}
                        />
                      </FormField>
                      <FormField label={t('components:similarity.filterByApplications')}
                        <Select
                          selectedOption={null}
                          onChange={({ detail }) => {
                            if (detail.selectedOption && !selectedApps.find(app => app.value === detail.selectedOption.value)) {
                              setSelectedApps([...selectedApps, detail.selectedOption]);
                            }
                          }}
                          options={uniqueApps}
                          placeholder="Select applications..."
                        />
                      </FormField>
                      <FormField label={t('components:similarity.search')}
                        <TextFilter
                          filteringText={filteringText}
                          onChange={({ detail }) => setFilteringText(detail.filteringText)}
                          placeholder="Search applications..."
                        />
                      </FormField>
                    </ColumnLayout>

                    {/* Custom Threshold Controls */}
                    {similarityThreshold.value === 'custom' && (
                      <Container>
                        <SpaceBetween size="s">
                          <Header variant="h4">{t('components:analysisResults.customSimilarityThreshold')}</Header>
                          <ColumnLayout columns={2}>
                            <FormField 
                              label={t('components:similarity.thresholdValue')}
                              description="Enter a value between 0 and 100"
                            >
                              <div style={{ width: '120px' }}>
                                <Input
                                  value={Math.round(customThreshold * 100).toString()}
                                  onChange={({ detail }) => {
                                    const numValue = parseInt(detail.value) || 0;
                                    const clampedValue = Math.max(0, Math.min(100, numValue));
                                    setCustomThreshold(clampedValue / 100);
                                  }}
                                  type="number"
                                  inputMode="numeric"
                                  placeholder="50"
                                  step={1}
                                  min={0}
                                  max={100}
                                />
                              </div>
                            </FormField>
                            <FormField 
                              label="Visual Slider"
                              description="Drag to adjust threshold visually"
                            >
                              <Box padding={{ top: 's' }}>
                                <Slider
                                  value={customThreshold * 100}
                                  onChange={({ detail }) => setCustomThreshold(detail.value / 100)}
                                  min={0}
                                  max={100}
                                  step={1}
                                  valueFormatter={(value) => `${Math.round(value)}%`}
                                />
                              </Box>
                            </FormField>
                          </ColumnLayout>
                          <Box variant="small" color="text-body-secondary">
                            Current threshold: <strong>{(customThreshold * 100).toFixed(1)}%</strong> 
                            {' '}({filteredData.length} pairs match this threshold)
                          </Box>
                        </SpaceBetween>
                      </Container>
                    )}
                  </SpaceBetween>

                  {/* Selected Apps */}
                  {selectedApps.length > 0 && (
                    <Box>
                      <SpaceBetween direction="horizontal" size="xs">
                        <Box variant="awsui-key-label">Filtered apps:</Box>
                        {selectedApps.map(app => (
                          <Badge 
                            key={app.value}
                            color="blue"
                            onDismiss={() => setSelectedApps(selectedApps.filter(a => a.value !== app.value))}
                          >
                            {app.label}
                          </Badge>
                        ))}
                      </SpaceBetween>
                    </Box>
                  )}

                  {/* Table */}
                  <Table
                    columnDefinitions={tableColumns}
                    items={paginatedData}
                    selectedItems={selectedItems}
                    onSelectionChange={({ detail }) => setSelectedItems(detail.selectedItems)}
                    sortingColumn={sortingColumn}
                    onSortingChange={({ detail }) => setSortingColumn(detail)}
                    header={
                      <Header
                        counter={`(${filteredData.length})`}
                        description="All similarity pairs with detailed information"
                      >
                        Similarity Pairs
                      </Header>
                    }
                    pagination={
                      <Pagination
                        currentPageIndex={currentPageIndex}
                        onChange={({ detail }) => setCurrentPageIndex(detail.currentPageIndex)}
                        pagesCount={Math.ceil(filteredData.length / pageSize)}
                      />
                    }
                    preferences={
                      <CollectionPreferences
                        title={t('common:general.preferences')}
                        confirmLabel={t('common:general.confirm')}
                        cancelLabel={t('common:general.cancel')}
                        preferences={{
                          pageSize: pageSize,
                          visibleContent: ['app1', 'app2', 'similarity_score', 'similarity_category', 'timestamp']
                        }}
                        pageSizePreference={{
                          title: 'Page size',
                          options: [
                            { value: 10, label: '10 items' },
                            { value: 25, label: '25 items' },
                            { value: 50, label: '50 items' },
                            { value: 100, label: '100 items' }
                          ]
                        }}
                        onConfirm={({ detail }) => {
                          setPageSize(detail.pageSize);
                        }}
                      />
                    }
                    empty={
                      <Box textAlign="center" color="inherit">
                        <b>{t('components:analysisResults.noSimilarityPairsFound')}</b>
                        <Box padding={{ bottom: 's' }} variant="p" color="inherit">
                          {t('components:analysisResults.adjustFilters')}
                        </Box>
                      </Box>
                    }
                  />
                </SpaceBetween>
              )
            },
            {
              id: 'heatmap',
              label: 'Similarity Heatmap',
              content: (
                <Box>
                  <Box variant="p" color="text-body-secondary" padding={{ bottom: 'm' }}>
                    Interactive heatmap showing similarity scores between all applications. 
                    Darker colors indicate higher similarity. Hover over cells for details.
                  </Box>
                  <div ref={heatmapRef} style={{ overflowX: 'auto' }} />
                </Box>
              )
            },
            {
              id: 'network',
              label: 'Network Diagram',
              content: (
                <Box>
                  <Box variant="p" color="text-body-secondary" padding={{ bottom: 'm' }}>
                    Network diagram showing application relationships. Node size indicates number of connections,
                    link thickness shows similarity strength. Drag nodes to explore the network.
                  </Box>
                  <div ref={networkRef} />
                </Box>
              )
            }
          ]}
        />
      </Container>
    </SpaceBetween>
  );
};

export default ComprehensiveSimilarityAnalysis;
