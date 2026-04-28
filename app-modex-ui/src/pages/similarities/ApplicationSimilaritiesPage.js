import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ContentLayout,
  Header,
  Box,
  SpaceBetween,
  Alert,
  Container,
  Tabs,
  Grid,
  Spinner,
  Table,
  Badge,
  Pagination,
  CollectionPreferences,
  TextFilter,
  Button,
  Modal,
  Icon,
  Multiselect,
  Slider,
  FormField
} from '@cloudscape-design/components';

// Layouts
import Layout from '../../layouts/AppLayout';

// Components
import ApplicationSimilaritiesInfoContent from '../../components/info/ApplicationSimilaritiesInfoContent';
import SimilaritiesAnalysisTrigger from '../../components/SimilaritiesAnalysisTrigger';
import MissingDataAlert from '../../components/MissingDataAlert';

// Hooks
import useDataSourceCheck from '../../hooks/useDataSourceCheck';

// Services
import { fetchApplicationSimilarityResults } from '../../services/applicationSimilarityApi';

/**
 * Application Similarities Page Component
 * 
 * This page displays application similarities for planning purposes.
 * Layout is consistent with ComponentSimilaritiesPage for better UX.
 */
const ApplicationSimilaritiesPage = () => {
  const { t } = useTranslation(['pages', 'common']);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [error, setError] = useState(null);
  const [analysisCompleted, setAnalysisCompleted] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Execution state - lifted from Trigger component
  const [executionStatus, setExecutionStatus] = useState(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  // Check for required data sources
  const { hasData, loading: checkingData, missingDataSources } = useDataSourceCheck(['applications-portfolio', 'applications-tech-stack']);

  // Pagination and table state
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const [filterText, setFilterText] = useState('');
  const [selectedSimilarityPair, setSelectedSimilarityPair] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [activeTab, setActiveTab] = useState('pairs');
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [networkFilters, setNetworkFilters] = useState({
    runtime: [],
    framework: [],
    databases: [],
    integrations: [],
    storages: [],
    minSimilarity: 0.5
  });
  const [preferences, setPreferences] = useState({
    pageSize: 10,
    visibleContent: ['application1', 'application2', 'similarity', 'actions']
  });

  // Network graph ref
  const networkGraphRef = useRef(null);
  const clusterChartRef = useRef(null);

  // Get project ID from localStorage - use same key as component similarities
  const projectData = localStorage.getItem('selectedProject');
  const projectId = projectData ? JSON.parse(projectData).projectId : null;

  // Load existing results on component mount
  useEffect(() => {
    const loadExistingResults = async () => {
      if (!projectId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        // FIRST: Check localStorage for in-flight execution
        const executionKey = `applicationSimilarityExecution_${projectId}`;
        const savedExecution = localStorage.getItem(executionKey);
        
        if (savedExecution) {
          const execution = JSON.parse(savedExecution);
          console.log('🔄 Found in-flight application similarity execution:', execution);
          
          // Check if execution is still potentially running (started within last 30 minutes)
          const startTime = new Date(execution.startTime);
          const now = new Date();
          const minutesElapsed = (now - startTime) / 1000 / 60;
          
          if (minutesElapsed < 30 && execution.status === 'RUNNING') {
            console.log('✅ In-flight execution found - skipping DynamoDB check');
            setExecutionStatus(execution);
            setAnalysisProgress(execution.progress || 0);
            setLoading(false);
            // Don't check DynamoDB - analysis is still running
            return;
          } else {
            console.log('⏰ Execution too old or not running, clearing from localStorage');
            localStorage.removeItem(executionKey);
          }
        }
        
        // SECOND: No in-flight execution, check DynamoDB for completed results
        console.log('🔍 Loading existing application similarity results for project:', projectId);
        
        const existingResults = await fetchApplicationSimilarityResults(projectId);
        
        // Check if results actually have data (not just empty structure)
        if (existingResults && (existingResults.similarityMatrix?.length > 0 || existingResults.applications?.length > 0)) {
          console.log('✅ Found existing application similarity results with data');
          setAnalysisData(existingResults);
          setAnalysisCompleted(true);
        } else {
          console.log('📭 No existing application similarity results found or empty data');
          setAnalysisData(null);
          setAnalysisCompleted(false);
        }
        
      } catch (err) {
        console.error('❌ Error loading existing application similarity results:', err);
        
        // Only show error for serious issues
        if (!err.message.includes('404') && 
            !err.message.includes('405') &&
            !err.message.includes('403') &&
            !err.message.includes('Failed to fetch') &&
            !err.message.includes('No data') &&
            !err.message.includes('not found') &&
            !err.message.includes('not available')) {
          setError(`Failed to load existing results: ${err.message}`);
        } else {
          console.log('⚠️ Application similarity results endpoint not yet available, continuing normally');
        }
      } finally {
        setLoading(false);
      }
    };

    loadExistingResults();
  }, [projectId]);

  // Handle analysis completion
  const handleAnalysisComplete = async (results) => {
    if (results === null) {
      // Clear results
      setAnalysisCompleted(false);
      setAnalysisData(null);
      return;
    }

    console.log('🎉 Application analysis completed:', results);
    
    // Fetch the actual similarity results from DynamoDB with retry mechanism
    const fetchWithRetry = async (retryCount = 0, maxRetries = 5) => {
      try {
        console.log(`📥 Fetching application similarity results (attempt ${retryCount + 1}/${maxRetries + 1})...`);
        const actualResults = await fetchApplicationSimilarityResults(projectId);
        
        // Check if results actually have data
        if (actualResults && (actualResults.similarityMatrix?.length > 0 || actualResults.applications?.length > 0)) {
          console.log('✅ Successfully loaded application similarity results after completion');
          setAnalysisCompleted(true);
          setAnalysisData(actualResults);
          return true;
        } else if (retryCount < maxRetries) {
          console.log(`⏳ No results found, retrying in ${(retryCount + 1) * 2} seconds...`);
          setTimeout(() => fetchWithRetry(retryCount + 1, maxRetries), (retryCount + 1) * 2000);
          return false;
        } else {
          console.warn('⚠️ No application similarity results found after all retries');
          // Don't set analysisCompleted if there's no actual data
          setAnalysisCompleted(false);
          setAnalysisData(null);
          return false;
        }
      } catch (error) {
        console.error(`❌ Error fetching results (attempt ${retryCount + 1}):`, error);
        if (retryCount < maxRetries) {
          console.log(`⏳ Retrying in ${(retryCount + 1) * 2} seconds...`);
          setTimeout(() => fetchWithRetry(retryCount + 1, maxRetries), (retryCount + 1) * 2000);
          return false;
        } else {
          console.error('❌ All retry attempts failed');
          setAnalysisCompleted(false);
          setAnalysisData(null);
          return false;
        }
      }
    };

    // Start the retry process
    await fetchWithRetry();
  };

  // Handle view details click
  const handleViewDetails = (similarityPair) => {
    setSelectedSimilarityPair(similarityPair);
    setShowDetailsModal(true);
  };

  // Generate similarity clusters by 5% ranges
  const generateSimilarityClusters = (similarityMatrix) => {
    if (!similarityMatrix || similarityMatrix.length === 0) return [];

    const clusters = {};
    
    similarityMatrix.forEach(pair => {
      const percentage = pair.similarity_score * 100;
      const rangeStart = Math.floor(percentage / 5) * 5;
      
      // Handle the edge case where similarity is exactly 100%
      let rangeKey;
      if (rangeStart >= 100) {
        rangeKey = '100%';
      } else {
        const rangeEnd = rangeStart + 5;
        rangeKey = `${rangeStart}%-${rangeEnd}%`;
      }
      
      if (!clusters[rangeKey]) {
        clusters[rangeKey] = {
          range: rangeKey,
          rangeStart: rangeStart >= 100 ? 100 : rangeStart,
          rangeEnd: rangeStart >= 100 ? 100 : rangeStart + 5,
          pairs: [],
          count: 0
        };
      }
      
      clusters[rangeKey].pairs.push(pair);
      clusters[rangeKey].count++;
    });

    // Convert to array and sort by range (highest first)
    return Object.values(clusters).sort((a, b) => b.rangeStart - a.rangeStart);
  };

  // Handle cluster selection
  const handleClusterSelect = (cluster) => {
    setSelectedCluster(cluster);
    setCurrentPageIndex(1); // Reset pagination
  };

  // Handle cluster dismissal
  const handleClusterDismiss = () => {
    setSelectedCluster(null);
    setCurrentPageIndex(1);
  };

  // Export network graph as PNG
  const exportNetworkAsPNG = () => {
    const container = networkGraphRef.current;
    if (!container) return;

    const svg = container.querySelector('svg');
    if (!svg) return;

    // Create a canvas element
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size to match SVG
    const svgRect = svg.getBoundingClientRect();
    canvas.width = 1200;
    canvas.height = 700;
    
    // Convert SVG to data URL
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    
    // Create image and draw to canvas
    const img = new Image();
    img.onload = () => {
      // Fill white background
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw SVG
      ctx.drawImage(img, 0, 0);
      
      // Download as PNG
      const link = document.createElement('a');
      link.download = `application-similarity-network-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      
      // Cleanup
      URL.revokeObjectURL(svgUrl);
    };
    img.src = svgUrl;
  };

  // Export network graph as PDF
  const exportNetworkAsPDF = () => {
    const container = networkGraphRef.current;
    if (!container) return;

    const svg = container.querySelector('svg');
    if (!svg) return;

    // Create a new window for PDF generation
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Get SVG content
    const svgData = new XMLSerializer().serializeToString(svg);
    
    // Create HTML for PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>{t('components:export.applicationSimilarityNetwork')}</title>
          <style>
            body { 
              margin: 0; 
              padding: 20px; 
              font-family: Arial, sans-serif;
            }
            .header {
              text-align: center;
              margin-bottom: 20px;
            }
            .network-container {
              display: flex;
              justify-content: center;
              align-items: center;
            }
            svg {
              max-width: 100%;
              height: auto;
            }
            @media print {
              body { margin: 0; padding: 10px; }
              .header { margin-bottom: 10px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>{t('components:export.applicationSimilarityNetwork')}</h1>
            <p>Generated on ${new Date().toLocaleDateString()}</p>
            <p>
              <strong>Legend:</strong>
              <span style="color: #dc2626;">■</span> Very High Similarity (≥80%) |
              <span style="color: #ea580c;">■</span> High Similarity (60-79%) |
              <span style="color: #f59e0b;">■</span> Medium Similarity (40-59%) |
              <span style="color: #eab308;">■</span> Low-Medium Similarity (20-39%) |
              <span style="color: #d1d5db;">■</span> Low Similarity (<20%)
            </p>
          </div>
          <div class="network-container">
            ${svgData}
          </div>
        </body>
      </html>
    `;

    // Write content and trigger print
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    // Wait for content to load, then print
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    };
  };

  // Extract unique filter values from analysis data
  const extractFilterOptions = (analysisData) => {
    if (!analysisData?.applications) return {};

    const options = {
      runtime: new Set(),
      framework: new Set(),
      databases: new Set(),
      integrations: new Set(),
      storages: new Set()
    };

    // This would need to be populated from the original application data
    // For now, we'll create mock data based on the Step Function input structure
    const mockAppData = {
      'API Gateway': { runtime: ['node.js 16'], framework: ['express.js'], databases: ['dynamodb'], integrations: ['rest api', 'graphql'], storages: ['s3'] },
      'Admin Console': { runtime: ['java 17', 'node.js 16'], framework: ['spring boot', 'react'], databases: ['mysql'], integrations: ['rest api'], storages: ['ebs', 's3', 'cloudfront'] },
      // Add more as needed...
    };

    Object.values(mockAppData).forEach(app => {
      app.runtime?.forEach(r => options.runtime.add(r));
      app.framework?.forEach(f => options.framework.add(f));
      app.databases?.forEach(d => options.databases.add(d));
      app.integrations?.forEach(i => options.integrations.add(i));
      app.storages?.forEach(s => options.storages.add(s));
    });

    return {
      runtime: Array.from(options.runtime).map(value => ({ label: value, value })),
      framework: Array.from(options.framework).map(value => ({ label: value, value })),
      databases: Array.from(options.databases).map(value => ({ label: value, value })),
      integrations: Array.from(options.integrations).map(value => ({ label: value, value })),
      storages: Array.from(options.storages).map(value => ({ label: value, value }))
    };
  };

  // Create network graph visualization
  const createNetworkGraph = (analysisData, filters) => {
    if (!networkGraphRef.current || !analysisData?.similarityMatrix) return;

    // Clear previous graph and cleanup event listeners
    const container = networkGraphRef.current;
    // Cleanup previous event listeners if they exist
    if (container.currentNodes) {
      container.currentNodes.forEach(node => {
        if (node.cleanup) node.cleanup();
      });
    }
    if (container.cleanupZoomPan) {
      container.cleanupZoomPan();
    }
    container.innerHTML = '';

    const width = 1200;
    const height = 700;

    // Create SVG with zoom/pan capabilities
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.border = '1px solid #e5e7eb';
    svg.style.borderRadius = '8px';
    svg.style.cursor = 'grab';
    container.appendChild(svg);

    // Create main group for zoom/pan transformations
    const mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(mainGroup);

    // Zoom and pan state
    let currentZoom = 1;
    let currentPanX = 0;
    let currentPanY = 0;
    let isPanning = false;
    let lastPanX = 0;
    let lastPanY = 0;

    // Filter similarity data based on filters and minimum similarity
    const filteredPairs = analysisData.similarityMatrix.filter(pair => 
      pair.similarity_score >= filters.minSimilarity
    );

    // Create nodes (unique applications) with better initial positioning
    const nodesMap = new Map();
    filteredPairs.forEach(pair => {
      if (!nodesMap.has(pair.application_id)) {
        nodesMap.set(pair.application_id, {
          id: pair.application_id,
          name: pair.application_id || 'Unknown',
          x: Math.random() * (width * 2) + width * 0.5, // Spread over larger area
          y: Math.random() * (height * 2) + height * 0.5
        });
      }
      if (!nodesMap.has(pair.similar_application_id)) {
        nodesMap.set(pair.similar_application_id, {
          id: pair.similar_application_id,
          name: pair.similar_application_id || 'Unknown',
          x: Math.random() * (width * 2) + width * 0.5,
          y: Math.random() * (height * 2) + height * 0.5
        });
      }
    });

    const nodes = Array.from(nodesMap.values());

    // Calculate bounds for fit-to-view
    const calculateBounds = () => {
      if (nodes.length === 0) return { minX: 0, maxX: width, minY: 0, maxY: height };
      
      const minX = Math.min(...nodes.map(n => n.x)) - 50;
      const maxX = Math.max(...nodes.map(n => n.x)) + 50;
      const minY = Math.min(...nodes.map(n => n.y)) - 50;
      const maxY = Math.max(...nodes.map(n => n.y)) + 50;
      
      return { minX, maxX, minY, maxY };
    };

    // Fit view to show all nodes
    const fitToView = () => {
      const bounds = calculateBounds();
      const boundsWidth = bounds.maxX - bounds.minX;
      const boundsHeight = bounds.maxY - bounds.minY;
      
      const scaleX = width / boundsWidth;
      const scaleY = height / boundsHeight;
      currentZoom = Math.min(scaleX, scaleY, 1) * 0.9; // 90% to add some padding
      
      currentPanX = (width / 2) - ((bounds.minX + bounds.maxX) / 2) * currentZoom;
      currentPanY = (height / 2) - ((bounds.minY + bounds.maxY) / 2) * currentZoom;
      
      updateTransform();
    };

    // Update transform
    const updateTransform = () => {
      mainGroup.setAttribute('transform', `translate(${currentPanX}, ${currentPanY}) scale(${currentZoom})`);
    };

    // Zoom functionality
    const handleWheel = (e) => {
      e.preventDefault();
      
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(5, currentZoom * zoomFactor));
      
      // Zoom towards mouse position
      const zoomRatio = newZoom / currentZoom;
      currentPanX = mouseX - (mouseX - currentPanX) * zoomRatio;
      currentPanY = mouseY - (mouseY - currentPanY) * zoomRatio;
      currentZoom = newZoom;
      
      updateTransform();
    };

    // Pan functionality
    const handleMouseDown = (e) => {
      if (e.target === svg || e.target === mainGroup) {
        isPanning = true;
        svg.style.cursor = 'grabbing';
        lastPanX = e.clientX;
        lastPanY = e.clientY;
        e.preventDefault();
      }
    };

    const handleMouseMove = (e) => {
      if (isPanning) {
        const deltaX = e.clientX - lastPanX;
        const deltaY = e.clientY - lastPanY;
        
        currentPanX += deltaX;
        currentPanY += deltaY;
        
        lastPanX = e.clientX;
        lastPanY = e.clientY;
        
        updateTransform();
        e.preventDefault();
      }
    };

    const handleMouseUp = () => {
      isPanning = false;
      svg.style.cursor = 'grab';
    };

    // Add zoom/pan event listeners
    svg.addEventListener('wheel', handleWheel);
    svg.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Create links with similarity-based styling
    const links = filteredPairs.map(pair => {
      // High-contrast color gradient from light to dark based on similarity
      const getLineColor = (similarity) => {
        if (similarity >= 0.8) return '#dc2626'; // Dark red for very high similarity
        if (similarity >= 0.6) return '#ea580c'; // Orange-red for high similarity
        if (similarity >= 0.4) return '#f59e0b'; // Orange for medium similarity
        if (similarity >= 0.2) return '#eab308'; // Yellow for low-medium similarity
        return '#d1d5db'; // Light gray for very low similarity
      };

      return {
        source: pair.application_id,
        target: pair.similar_application_id,
        similarity: pair.similarity_score,
        strokeWidth: 2, // Uniform thickness for all lines
        color: getLineColor(pair.similarity_score)
      };
    });

    // Simple force simulation (basic implementation)
    const simulation = {
      nodes: nodes,
      links: links,
      tick: 0
    };

    // Draw links
    const linkGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    mainGroup.appendChild(linkGroup);

    links.forEach(link => {
      const sourceNode = nodes.find(n => n.id === link.source);
      const targetNode = nodes.find(n => n.id === link.target);
      
      if (sourceNode && targetNode) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', sourceNode.x);
        line.setAttribute('y1', sourceNode.y);
        line.setAttribute('x2', targetNode.x);
        line.setAttribute('y2', targetNode.y);
        line.setAttribute('stroke', link.color);
        line.setAttribute('stroke-width', link.strokeWidth);
        line.setAttribute('opacity', '0.8');
        linkGroup.appendChild(line);
      }
    });

    // Draw nodes with drag functionality
    const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    mainGroup.appendChild(nodeGroup);

    nodes.forEach(node => {
      // Create node group for circle and text
      const nodeContainer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      nodeContainer.setAttribute('class', 'node-container');
      nodeGroup.appendChild(nodeContainer);

      // Node circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', node.x);
      circle.setAttribute('cy', node.y);
      circle.setAttribute('r', 20);
      circle.setAttribute('fill', '#e5e7eb');
      circle.setAttribute('stroke', '#6b7280');
      circle.setAttribute('stroke-width', '2');
      circle.style.cursor = 'grab';
      nodeContainer.appendChild(circle);

      // Node label
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', node.x);
      text.setAttribute('y', node.y + 35);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '12');
      text.setAttribute('font-weight', 'bold');
      text.setAttribute('fill', '#1f2937');
      text.setAttribute('pointer-events', 'none'); // Prevent text from interfering with drag
      text.textContent = (node.name || 'Unknown').length > 15 ? (node.name || 'Unknown').substring(0, 15) + '...' : (node.name || 'Unknown');
      nodeContainer.appendChild(text);

      // Drag functionality (updated for zoom/pan)
      let isDragging = false;
      let startX, startY, initialNodeX, initialNodeY;

      const handleMouseDown = (e) => {
        isDragging = true;
        circle.style.cursor = 'grabbing';
        
        const rect = svg.getBoundingClientRect();
        const svgX = (e.clientX - rect.left - currentPanX) / currentZoom;
        const svgY = (e.clientY - rect.top - currentPanY) / currentZoom;
        
        startX = svgX;
        startY = svgY;
        initialNodeX = node.x;
        initialNodeY = node.y;
        
        e.stopPropagation(); // Prevent pan from starting
        e.preventDefault();
      };

      const handleMouseMove = (e) => {
        if (!isDragging) return;
        
        const rect = svg.getBoundingClientRect();
        const svgX = (e.clientX - rect.left - currentPanX) / currentZoom;
        const svgY = (e.clientY - rect.top - currentPanY) / currentZoom;
        
        const deltaX = svgX - startX;
        const deltaY = svgY - startY;
        
        // Update node position
        node.x = initialNodeX + deltaX;
        node.y = initialNodeY + deltaY;
        
        // Update circle position
        circle.setAttribute('cx', node.x);
        circle.setAttribute('cy', node.y);
        
        // Update text position
        text.setAttribute('x', node.x);
        text.setAttribute('y', node.y + 35);
        
        // Update connected lines
        updateConnectedLines(node.id);
        
        e.preventDefault();
      };

      const handleMouseUp = () => {
        isDragging = false;
        circle.style.cursor = 'grab';
      };

      // Add event listeners
      circle.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      // Store references for cleanup
      node.cleanup = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    });

    // Function to update lines connected to a dragged node
    const updateConnectedLines = (nodeId) => {
      const lines = linkGroup.querySelectorAll('line');
      links.forEach((link, index) => {
        if (link.source === nodeId || link.target === nodeId) {
          const line = lines[index];
          if (line) {
            const sourceNode = nodes.find(n => n.id === link.source);
            const targetNode = nodes.find(n => n.id === link.target);
            
            if (sourceNode && targetNode) {
              line.setAttribute('x1', sourceNode.x);
              line.setAttribute('y1', sourceNode.y);
              line.setAttribute('x2', targetNode.x);
              line.setAttribute('y2', targetNode.y);
            }
          }
        }
      });
    };
    
    // Store nodes and cleanup functions for cleanup
    container.currentNodes = nodes;
    container.cleanupZoomPan = () => {
      svg.removeEventListener('wheel', handleWheel);
      svg.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    // Initial fit to view
    fitToView();
  };

  // Create cluster visualization
  const createClusterVisualization = (clusters) => {
    if (!clusterChartRef.current || !clusters.length) return;

    // Clear previous chart
    const svg = clusterChartRef.current;
    svg.innerHTML = '';

    const width = 1200;
    const height = 500;
    const margin = { top: 40, right: 40, bottom: 80, left: 40 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Create SVG
    const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgElement.setAttribute('width', width);
    svgElement.setAttribute('height', height);
    svgElement.style.background = '#ffffff';
    svgElement.style.border = '1px solid #e5e7eb';
    svgElement.style.borderRadius = '8px';
    svg.appendChild(svgElement);

    // Create chart group
    const chartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    chartGroup.setAttribute('transform', `translate(${margin.left}, ${margin.top})`);
    svgElement.appendChild(chartGroup);

    // Sort clusters by similarity range (lowest to highest)
    const sortedClusters = [...clusters].sort((a, b) => a.rangeStart - b.rangeStart);

    // Calculate scales - bigger circles now that we have more space
    const maxCount = Math.max(...sortedClusters.map(c => c.count));
    const radiusScale = (count) => Math.sqrt(count / maxCount) * 70 + 25;

    // Calculate all radii first
    const clustersWithRadii = sortedClusters.map(cluster => ({
      ...cluster,
      radius: radiusScale(cluster.count)
    }));

    // Smart horizontal positioning that accounts for circle sizes
    const minSpacing = 20; // Minimum space between circle edges
    let currentX = 0;
    
    clustersWithRadii.forEach((cluster, index) => {
      // For first circle, start with its radius plus margin
      if (index === 0) {
        currentX = margin.left + cluster.radius;
      } else {
        // For subsequent circles, add previous radius + spacing + current radius
        const prevRadius = clustersWithRadii[index - 1].radius;
        currentX += prevRadius + minSpacing + cluster.radius;
      }
      
      cluster.x = currentX;
    });

    // Scale positions to fit within chart width if needed
    const totalWidth = currentX + clustersWithRadii[clustersWithRadii.length - 1].radius;
    const availableWidth = chartWidth;
    const scaleFactor = totalWidth > availableWidth ? availableWidth / totalWidth : 1;
    
    if (scaleFactor < 1) {
      // Rescale positions to fit
      clustersWithRadii.forEach(cluster => {
        cluster.x = (cluster.x - margin.left) * scaleFactor + cluster.radius;
      });
    }
    
    clustersWithRadii.forEach((cluster, index) => {
      const x = cluster.x;
      // Use more vertical levels to spread circles better
      const verticalLevels = 4;
      const levelIndex = index % verticalLevels;
      const yPositions = [
        chartHeight * 0.2,  // Top level
        chartHeight * 0.4,  // Upper middle
        chartHeight * 0.6,  // Lower middle  
        chartHeight * 0.8   // Bottom level
      ];
      const y = yPositions[levelIndex];
      const radius = cluster.radius;

      // Determine color based on similarity range
      const getColor = (rangeStart) => {
        if (rangeStart >= 80) return '#10b981'; // Green for high similarity
        if (rangeStart >= 60) return '#3b82f6'; // Blue for medium-high
        if (rangeStart >= 40) return '#f59e0b'; // Orange for medium
        return '#ef4444'; // Red for low similarity
      };

      const color = getColor(cluster.rangeStart);
      const isSelected = selectedCluster?.range === cluster.range;

      // Create cluster circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', radius);
      circle.setAttribute('fill', color);
      circle.setAttribute('fill-opacity', '0.8');
      circle.setAttribute('stroke', isSelected ? '#374151' : color);
      circle.setAttribute('stroke-width', isSelected ? '3' : '1');
      circle.style.cursor = 'pointer';
      circle.style.transition = 'all 0.2s ease';

      // Add hover effects
      circle.addEventListener('mouseenter', () => {
        circle.setAttribute('fill-opacity', '1');
        circle.setAttribute('stroke-width', '2');
      });

      circle.addEventListener('mouseleave', () => {
        if (!isSelected) {
          circle.setAttribute('fill-opacity', '0.8');
          circle.setAttribute('stroke-width', '1');
        }
      });

      // Add click handler
      circle.addEventListener('click', () => {
        handleClusterSelect(cluster);
      });

      chartGroup.appendChild(circle);

      // Add range label - now with better sizing for larger circles
      const rangeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      rangeText.setAttribute('x', x);
      rangeText.setAttribute('y', y - 8);
      rangeText.setAttribute('text-anchor', 'middle');
      rangeText.setAttribute('font-size', '14');
      rangeText.setAttribute('font-weight', 'bold');
      rangeText.setAttribute('fill', '#fff');
      rangeText.textContent = cluster.range;
      chartGroup.appendChild(rangeText);

      // Add count label - now fits better in larger circles
      const countText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      countText.setAttribute('x', x);
      countText.setAttribute('y', y + 12);
      countText.setAttribute('text-anchor', 'middle');
      countText.setAttribute('font-size', '12');
      countText.setAttribute('fill', '#fff');
      countText.textContent = `${cluster.count} pairs`;
      chartGroup.appendChild(countText);

      // Add percentage below circle
      const percentText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      percentText.setAttribute('x', x);
      percentText.setAttribute('y', y + radius + 20);
      percentText.setAttribute('text-anchor', 'middle');
      percentText.setAttribute('font-size', '11');
      percentText.setAttribute('fill', '#6b7280');
      percentText.textContent = `${((cluster.count / analysisData.similarityMatrix.length) * 100).toFixed(1)}%`;
      chartGroup.appendChild(percentText);
    });

    // Add title
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', chartWidth / 2);
    title.setAttribute('y', -15);
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('font-size', '16');
    title.setAttribute('font-weight', 'bold');
    title.setAttribute('fill', '#374151');
    title.textContent = 'Application Similarity Distribution (Low → High)';
    chartGroup.appendChild(title);
  };

  // Update visualization when clusters change
  useEffect(() => {
    if (analysisData?.similarityMatrix && activeTab === 'clusters') {
      const clusters = generateSimilarityClusters(analysisData.similarityMatrix);
      createClusterVisualization(clusters);
    }
  }, [analysisData, activeTab, selectedCluster]);

  // Update network graph when filters change
  useEffect(() => {
    if (analysisData?.similarityMatrix && activeTab === 'network') {
      createNetworkGraph(analysisData, networkFilters);
    }
  }, [analysisData, activeTab, networkFilters]);

  return (
    <Layout
      activeHref="/similarities/applications"
      toolsOpen={toolsOpen}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
      infoContent={
        <Box padding="l">
          <ApplicationSimilaritiesInfoContent />
        </Box>
      }
    >
      <ContentLayout
        header={
          <Header variant="h1">
            {t('pages:applicationSimilarities.title')}
          </Header>
        }
      >
        <SpaceBetween size="l">
          {/* Show missing data alert if required data sources are not available */}
          {!checkingData && !hasData && (
            <MissingDataAlert missingDataSources={missingDataSources} />
          )}

          <div style={{ position: 'relative' }}>
            {/* Semi-transparent overlay when data is missing */}
            {!checkingData && !hasData && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(255, 255, 255, 0.7)',
                zIndex: 10,
                pointerEvents: 'all',
                cursor: 'not-allowed'
              }} />
            )}

          {error && (
            <Alert type="error" header="Error">
              {error}
            </Alert>
          )}

          {/* Loading State */}
          {loading && (
            <Container>
              <Box textAlign="center" padding="xl">
                <SpaceBetween size="m">
                  <Spinner size="large" />
                  <Box variant="h3" color="text-body-secondary">
                    {t('pages:applicationSimilarities.loadingResults')}
                  </Box>
                  <Box variant="p" color="text-body-secondary">
                    {t('pages:applicationSimilarities.checkingExistingResults')}
                  </Box>
                </SpaceBetween>
              </Box>
            </Container>
          )}

          {/* Application Similarities Analysis Trigger Section */}
          {!loading && (
            <SpaceBetween size="l">
              <SimilaritiesAnalysisTrigger 
                onAnalysisComplete={handleAnalysisComplete}
                analysisData={analysisData}
                executionStatus={executionStatus}
                setExecutionStatus={setExecutionStatus}
                analysisProgress={analysisProgress}
                setAnalysisProgress={setAnalysisProgress}
              />

              {/* Application Similarity Analysis Results Summary */}
              {analysisData && analysisCompleted && (
                <Container>
                  <Header variant="h2">{t('pages:applicationSimilarities.analysisResults')}</Header>
                  <div style={{ marginTop: '20px' }}>
                    <Grid gridDefinition={[{ colspan: 3 }, { colspan: 3 }, { colspan: 3 }, { colspan: 3 }]}>
                      <Box>
                        <Box variant="awsui-key-label">{t('pages:applicationSimilarities.totalApplications')}</Box>
                        <Box variant="awsui-value-large">{analysisData.totalApplications || analysisData.applications?.length || 0}</Box>
                      </Box>
                      <Box>
                        <Box variant="awsui-key-label">{t('pages:applicationSimilarities.similarPairs')}</Box>
                        <Box variant="awsui-value-large">{analysisData.similarPairs || analysisData.similarityMatrix?.length || 0}</Box>
                      </Box>
                      <Box>
                        <Box variant="awsui-key-label">
                          {t('pages:applicationSimilarities.maxSimilarity')}
                          {analysisData.similarityMatrix?.length > 0 && (() => {
                            const maxScore = Math.max(...analysisData.similarityMatrix.map(pair => pair.similarity_score));
                            const maxCount = analysisData.similarityMatrix.filter(pair => pair.similarity_score === maxScore).length;
                            return ` (${maxCount} ${t('pages:applicationSimilarities.pairs', { count: maxCount })})`;
                          })()}
                        </Box>
                        <Box variant="awsui-value-large">
                          {analysisData.similarityMatrix?.length > 0 ? 
                           `${(Math.max(...analysisData.similarityMatrix.map(pair => pair.similarity_score)) * 100).toFixed(1)}%` : 
                           '0%'}
                        </Box>
                      </Box>
                      <Box>
                        <Box variant="awsui-key-label">
                          {t('pages:applicationSimilarities.mostCommonRange')}
                          {analysisData.similarityMatrix?.length > 0 && (() => {
                            // Group similarities into 10% ranges
                            const ranges = {};
                            analysisData.similarityMatrix.forEach(pair => {
                              const percentage = pair.similarity_score * 100;
                              const rangeStart = Math.floor(percentage / 10) * 10;
                              const rangeEnd = rangeStart + 10;
                              const rangeKey = `${rangeStart}%-${rangeEnd}%`;
                              ranges[rangeKey] = (ranges[rangeKey] || 0) + 1;
                            });
                            
                            // Find the range with most pairs
                            const maxRange = Object.entries(ranges).reduce((max, [range, count]) => 
                              count > max.count ? { range, count } : max, { range: '', count: 0 });
                            
                            return maxRange.count > 0 ? ` (${maxRange.count} ${t('pages:applicationSimilarities.pairs', { count: maxRange.count })})` : '';
                          })()}
                        </Box>
                        <Box variant="awsui-value-large">
                          {analysisData.similarityMatrix?.length > 0 ? (() => {
                            // Group similarities into 10% ranges
                            const ranges = {};
                            analysisData.similarityMatrix.forEach(pair => {
                              const percentage = pair.similarity_score * 100;
                              const rangeStart = Math.floor(percentage / 10) * 10;
                              const rangeEnd = rangeStart + 10;
                              const rangeKey = `${rangeStart}%-${rangeEnd}%`;
                              ranges[rangeKey] = (ranges[rangeKey] || 0) + 1;
                            });
                            
                            // Find the range with most pairs
                            const maxRange = Object.entries(ranges).reduce((max, [range, count]) => 
                              count > max.count ? { range, count } : max, { range: '0%-10%', count: 0 });
                            
                            return maxRange.range;
                          })() : '0%-10%'}
                        </Box>
                      </Box>
                    </Grid>
                  </div>
                </Container>
              )}

              {/* Application Similarity Analysis Results Container - Always Visible */}
              <Container>
                {!analysisData || !analysisCompleted ? (
                  <Box textAlign="center" padding="xl">
                    <SpaceBetween size="m">
                      <Box variant="h3" color="text-body-secondary">
                        {t('pages:applicationSimilarities.noAnalysisResults')}
                      </Box>
                      <Box variant="p" color="text-body-secondary">
                        {t('pages:applicationSimilarities.startAnalysisDescription')}
                      </Box>
                    </SpaceBetween>
                  </Box>
                ) : (
                  <SpaceBetween size="l">
                    <Header variant="h2">{t('pages:applicationSimilarities.similarityDetails')}</Header>
                    
                    {/* Tabs for different views */}
                    <Tabs
                      activeTabId={activeTab}
                      onChange={({ detail }) => {
                        setActiveTab(detail.activeTabId);
                        setSelectedCluster(null); // Reset cluster selection when switching tabs
                        setCurrentPageIndex(1); // Reset pagination
                      }}
                      tabs={[
                        {
                          id: 'pairs',
                        label: t('pages:applicationSimilarities.similarityMatrix'),
                        content: (
                          /* Application Similarity Pairs Table */
                          analysisData.similarityMatrix && analysisData.similarityMatrix.length > 0 && (
                            <Table
                              columnDefinitions={[
                                {
                                  id: 'application1',
                                  header: t('pages:applicationSimilarities.application1'),
                                  cell: item => item.application_id,
                                  sortingField: 'application_id'
                                },
                                {
                                  id: 'application2', 
                                  header: t('pages:applicationSimilarities.application2'),
                                  cell: item => item.similar_application_id,
                                  sortingField: 'similar_application_id'
                                },
                                {
                                  id: 'similarity',
                                  header: t('pages:applicationSimilarities.similarityScore'),
                                  cell: item => (
                                    <Badge 
                                      color={
                                        item.similarity_score >= 0.8 ? 'green' :
                                        item.similarity_score >= 0.6 ? 'blue' :
                                        item.similarity_score >= 0.4 ? 'grey' : 'red'
                                      }
                                    >
                                      {(item.similarity_score * 100).toFixed(1)}%
                                    </Badge>
                                  ),
                                  sortingField: 'similarity_score'
                                },
                                {
                                  id: 'actions',
                                  header: t('common:general.actions'),
                                  cell: item => (
                                    <Button
                                      variant="inline-icon"
                                      iconName="external"
                                      onClick={() => handleViewDetails(item)}
                                      ariaLabel={t('pages:applicationSimilarities.viewDetailsAriaLabel', { 
                                        app1: item.application_id,
                                        app2: item.similar_application_id
                                      })}
                                    />
                                  )
                                }
                              ].filter(col => preferences.visibleContent.includes(col.id))}
                              items={(() => {
                                // Filter by application name (searches both app1 and app2)
                                let filteredItems = analysisData.similarityMatrix;
                                if (filterText) {
                                  const searchText = filterText.toLowerCase();
                                  filteredItems = analysisData.similarityMatrix.filter(item => {
                                    const app1Name = (item.application_id || '').toLowerCase();
                                    const app2Name = (item.similar_application_id || '').toLowerCase();
                                    return app1Name.includes(searchText) || app2Name.includes(searchText);
                                  });
                                }
                                
                                // Sort by similarity score (highest first)
                                const sortedItems = filteredItems.sort((a, b) => b.similarity_score - a.similarity_score);
                                
                                // Apply pagination
                                const startIndex = (currentPageIndex - 1) * preferences.pageSize;
                                const endIndex = startIndex + preferences.pageSize;
                                return sortedItems.slice(startIndex, endIndex);
                              })()}
                              loadingText={t('pages:applicationSimilarities.loadingSimilarityResults')}
                              sortingDisabled={false}
                              empty={
                                <Box textAlign="center" color="inherit">
                                  <b>{t('pages:applicationSimilarities.noSimilarityPairsFound')}</b>
                                  <Box variant="p" color="inherit">
                                    {filterText ? t('pages:applicationSimilarities.noMatchingPairs') : t('pages:applicationSimilarities.noSimilarityDataAvailable')}
                                  </Box>
                                </Box>
                              }
                              filter={
                                <TextFilter
                                  filteringText={filterText}
                                  onChange={({ detail }) => {
                                    setFilterText(detail.filteringText);
                                    setCurrentPageIndex(1); // Reset to first page when filtering
                                  }}
                                  filteringPlaceholder={t('pages:applicationSimilarities.searchApplicationsPlaceholder')}
                                  filteringAriaLabel={t('pages:applicationSimilarities.filterApplicationsAriaLabel')}
                                />
                              }
                              header={
                                <Header
                                  counter={(() => {
                                    if (!filterText) {
                                      return `(${analysisData.similarityMatrix?.length || 0})`;
                                    }
                                    // Count filtered items
                                    const searchText = filterText.toLowerCase();
                                    const filteredCount = analysisData.similarityMatrix.filter(item => {
                                      const app1Name = (item.application_id || '').toLowerCase();
                                      const app2Name = (item.similar_application_id || '').toLowerCase();
                                      return app1Name.includes(searchText) || app2Name.includes(searchText);
                                    }).length;
                                    return `(${filteredCount}/${analysisData.similarityMatrix?.length || 0})`;
                                  })()}
                                  description={t('pages:applicationSimilarities.pairsRankedBySimilarity')}
                                >
                                  {t('pages:applicationSimilarities.applicationSimilarityPairs')}
                                </Header>
                              }
                              preferences={
                                <CollectionPreferences
                                  title={t('common:general.preferences')}
                                  confirmLabel={t('common:buttons.confirm')}
                                  cancelLabel={t('common:buttons.cancel')}
                                  preferences={preferences}
                                  onConfirm={({ detail }) => {
                                    setPreferences(detail);
                                    setCurrentPageIndex(1);
                                  }}
                                  pageSizePreference={{
                                    title: t('common:general.pageSize'),
                                    options: [
                                      { value: 10, label: t('pages:applicationSimilarities.pairsCount', { count: 10 }) },
                                      { value: 20, label: t('pages:applicationSimilarities.pairsCount', { count: 20 }) },
                                      { value: 50, label: t('pages:applicationSimilarities.pairsCount', { count: 50 }) },
                                      { value: 100, label: t('pages:applicationSimilarities.pairsCount', { count: 100 }) }
                                    ]
                                  }}
                                  visibleContentPreference={{
                                    title: t('common:general.selectVisibleColumns'),
                                    options: [
                                      {
                                        label: t('pages:applicationSimilarities.applicationSimilarityProperties'),
                                        options: [
                                          { id: 'application1', label: t('pages:applicationSimilarities.application1'), editable: false },
                                          { id: 'application2', label: t('pages:applicationSimilarities.application2'), editable: false },
                                          { id: 'similarity', label: t('pages:applicationSimilarities.similarityScore'), editable: false },
                                          { id: 'actions', label: t('common:general.actions') }
                                        ]
                                      }
                                    ]
                                  }}
                                />
                              }
                              pagination={
                                <Pagination
                                  currentPageIndex={currentPageIndex}
                                  pagesCount={(() => {
                                    if (!filterText) {
                                      return Math.ceil((analysisData.similarityMatrix?.length || 0) / preferences.pageSize);
                                    }
                                    // Calculate pages for filtered items
                                    const searchText = filterText.toLowerCase();
                                    const filteredCount = analysisData.similarityMatrix.filter(item => {
                                      const app1Name = (item.application_id || '').toLowerCase();
                                      const app2Name = (item.similar_application_id || '').toLowerCase();
                                      return app1Name.includes(searchText) || app2Name.includes(searchText);
                                    }).length;
                                    return Math.ceil(filteredCount / preferences.pageSize);
                                  })()}
                                  onChange={({ detail }) => setCurrentPageIndex(detail.currentPageIndex)}
                                />
                              }
                            />
                          )
                        )
                      },
                      {
                        id: 'clusters',
                        label: t('pages:applicationSimilarities.similarityClusters'),
                        content: (
                          <SpaceBetween size="l">
                            {/* Visual Cluster Diagram */}
                            <Container>
                              <Header variant="h3">{t('pages:applicationSimilarities.similarityDistribution')}</Header>
                              <Box textAlign="center">
                                <div ref={clusterChartRef} style={{ display: 'inline-block' }}></div>
                              </Box>
                              <Box variant="p" color="text-body-secondary" textAlign="center" margin={{ top: 's' }}>
                                {t('pages:applicationSimilarities.clusterInstructions')}
                              </Box>
                            </Container>

                            {/* Selected Cluster Details */}
                            {selectedCluster && (
                              <Table
                                columnDefinitions={[
                                  {
                                    id: 'application1',
                                    header: t('pages:applicationSimilarities.application1'),
                                    cell: item => item.application1_name || item.application1_id,
                                    sortingField: 'application1_name'
                                  },
                                  {
                                    id: 'application2', 
                                    header: t('pages:applicationSimilarities.application2'),
                                    cell: item => item.application2_name || item.application2_id,
                                    sortingField: 'application2_name'
                                  },
                                  {
                                    id: 'similarity',
                                    header: t('pages:applicationSimilarities.similarityScore'),
                                    cell: item => (
                                      <Badge 
                                        color={
                                          item.similarity_score >= 0.8 ? 'green' :
                                          item.similarity_score >= 0.6 ? 'blue' :
                                          item.similarity_score >= 0.4 ? 'grey' : 'red'
                                        }
                                      >
                                        {(item.similarity_score * 100).toFixed(1)}%
                                      </Badge>
                                    ),
                                    sortingField: 'similarity_score'
                                  },
                                  {
                                    id: 'actions',
                                    header: t('common.labels.actions'),
                                    cell: item => (
                                      <Button
                                        variant="inline-icon"
                                        iconName="external"
                                        onClick={() => handleViewDetails(item)}
                                        ariaLabel={t('pages:applicationSimilarities.viewDetailsAriaLabel', { 
                                          app1: item.application1_name || item.application1_id,
                                          app2: item.application2_name || item.application2_id
                                        })}
                                      />
                                    )
                                  }
                                ]}
                                items={(() => {
                                  // Sort cluster pairs by similarity score (highest first)
                                  const sortedItems = selectedCluster.pairs.sort((a, b) => b.similarity_score - a.similarity_score);
                                  
                                  // Apply pagination
                                  const startIndex = (currentPageIndex - 1) * preferences.pageSize;
                                  const endIndex = startIndex + preferences.pageSize;
                                  return sortedItems.slice(startIndex, endIndex);
                                })()}
                                loadingText={t('pages:applicationSimilarities.loadingClusterResults')}
                                sortingDisabled={false}
                                empty={
                                  <Box textAlign="center" color="inherit">
                                    <b>{t('pages:applicationSimilarities.noPairsInCluster')}</b>
                                  </Box>
                                }
                                header={
                                  <Header
                                    variant="h3"
                                    counter={`(${selectedCluster.count})`}
                                    description={t('pages:applicationSimilarities.clusterDescription', { range: selectedCluster.range })}
                                    actions={
                                      <Button
                                        variant="icon"
                                        iconName="close"
                                        onClick={handleClusterDismiss}
                                        ariaLabel={t('pages:applicationSimilarities.closeClusterDetails')}
                                      />
                                    }
                                  >
                                    {t('pages:applicationSimilarities.similarityClusterTitle', { range: selectedCluster.range })}
                                  </Header>
                                }
                                pagination={
                                  <Pagination
                                    currentPageIndex={currentPageIndex}
                                    pagesCount={Math.ceil(selectedCluster.count / preferences.pageSize)}
                                    onChange={({ detail }) => setCurrentPageIndex(detail.currentPageIndex)}
                                  />
                                }
                              />
                            )}
                          </SpaceBetween>
                        )
                      },
                      {
                        id: 'network',
                        label: t('pages:applicationSimilarities.networkDiagram'),
                        content: (
                          <SpaceBetween size="l">
                            {/* Filter Controls */}
                            <Container>
                              <Header variant="h3">{t('pages:applicationSimilarities.filterApplications')}</Header>
                              <Grid gridDefinition={[{ colspan: 4 }, { colspan: 4 }, { colspan: 4 }]}>
                                <FormField label={t('pages:applicationSimilarities.runtimeTechnologies')}>
                                  <Multiselect
                                    selectedOptions={networkFilters.runtime}
                                    onChange={({ detail }) => 
                                      setNetworkFilters(prev => ({ ...prev, runtime: detail.selectedOptions }))
                                    }
                                    options={extractFilterOptions(analysisData).runtime || []}
                                    placeholder={t('pages:applicationSimilarities.selectRuntimes')}
                                    filteringType="auto"
                                  />
                                </FormField>
                                <FormField label={t('pages:applicationSimilarities.frameworkTechnologies')}>
                                  <Multiselect
                                    selectedOptions={networkFilters.framework}
                                    onChange={({ detail }) => 
                                      setNetworkFilters(prev => ({ ...prev, framework: detail.selectedOptions }))
                                    }
                                    options={extractFilterOptions(analysisData).framework || []}
                                    placeholder={t('pages:applicationSimilarities.selectFrameworks')}
                                    filteringType="auto"
                                  />
                                </FormField>
                                <FormField label={t('pages:applicationSimilarities.databaseTechnologies')}>
                                  <Multiselect
                                    selectedOptions={networkFilters.databases}
                                    onChange={({ detail }) => 
                                      setNetworkFilters(prev => ({ ...prev, databases: detail.selectedOptions }))
                                    }
                                    options={extractFilterOptions(analysisData).databases || []}
                                    placeholder={t('pages:applicationSimilarities.selectDatabases')}
                                    filteringType="auto"
                                  />
                                </FormField>
                              </Grid>
                              <Grid gridDefinition={[{ colspan: 4 }, { colspan: 4 }, { colspan: 4 }]} style={{ marginTop: '16px' }}>
                                <FormField label={t('pages:applicationSimilarities.integrationTechnologies')}>
                                  <Multiselect
                                    selectedOptions={networkFilters.integrations}
                                    onChange={({ detail }) => 
                                      setNetworkFilters(prev => ({ ...prev, integrations: detail.selectedOptions }))
                                    }
                                    options={extractFilterOptions(analysisData).integrations || []}
                                    placeholder={t('pages:applicationSimilarities.selectIntegrations')}
                                    filteringType="auto"
                                  />
                                </FormField>
                                <FormField label={t('pages:applicationSimilarities.storageTechnologies')}>
                                  <Multiselect
                                    selectedOptions={networkFilters.storages}
                                    onChange={({ detail }) => 
                                      setNetworkFilters(prev => ({ ...prev, storages: detail.selectedOptions }))
                                    }
                                    options={extractFilterOptions(analysisData).storages || []}
                                    placeholder={t('pages:applicationSimilarities.selectStorages')}
                                    filteringType="auto"
                                  />
                                </FormField>
                                <FormField label={t('pages:applicationSimilarities.minimumSimilarity')}>
                                  <Slider
                                    value={networkFilters.minSimilarity}
                                    onChange={({ detail }) => 
                                      setNetworkFilters(prev => ({ ...prev, minSimilarity: detail.value }))
                                    }
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    tickMarks
                                    hideFillLine={false}
                                    valueFormatter={value => `${(value * 100).toFixed(0)}%`}
                                  />
                                </FormField>
                              </Grid>
                            </Container>

                            {/* Network Graph */}
                            <Container>
                              <Header 
                                variant="h3"
                                actions={
                                  <SpaceBetween direction="horizontal" size="xs">
                                    <Button
                                      variant="normal"
                                      iconName="download"
                                      onClick={exportNetworkAsPNG}
                                    >
                                      {t('pages:applicationSimilarities.exportPNG')}
                                    </Button>
                                    <Button
                                      variant="normal"
                                      iconName="file"
                                      onClick={exportNetworkAsPDF}
                                    >
                                      {t('pages:applicationSimilarities.exportPDF')}
                                    </Button>
                                  </SpaceBetween>
                                }
                              >
                                {t('pages:applicationSimilarities.applicationSimilarityNetwork')}
                              </Header>
                              <Box textAlign="center" margin={{ top: 'l' }}>
                                <div ref={networkGraphRef} style={{ display: 'inline-block' }}></div>
                              </Box>
                              <Box variant="p" color="text-body-secondary" textAlign="center" margin={{ top: 's' }}>
                                <strong>{t('pages:applicationSimilarities.controls')}</strong> {t('pages:applicationSimilarities.controlsDescription')}
                                <br />
                                <strong>{t('pages:applicationSimilarities.colors')}</strong> {t('pages:applicationSimilarities.colorsDescription')}
                              </Box>
                            </Container>
                          </SpaceBetween>
                        )
                      }
                    ]}
                  />
                </SpaceBetween>
              )}
            </Container>
            </SpaceBetween>
          )}
          </div>
        </SpaceBetween>

        {/* Similarity Details Modal */}
        <Modal
          onDismiss={() => setShowDetailsModal(false)}
          visible={showDetailsModal}
          header={t('pages:applicationSimilarities.applicationSimilarityDetails')}
          size="large"
          footer={
            <Box float="right">
              <Button variant="primary" onClick={() => setShowDetailsModal(false)}>
                {t('common.buttons.close')}
              </Button>
            </Box>
          }
        >
          {selectedSimilarityPair && (
            <SpaceBetween size="l">
              <Grid gridDefinition={[{ colspan: 6 }, { colspan: 6 }]}>
                <Box>
                  <Box variant="awsui-key-label">{t('pages:applicationSimilarities.application1')}</Box>
                  <Box variant="h3">{selectedSimilarityPair.application1_name || selectedSimilarityPair.application1_id}</Box>
                </Box>
                <Box>
                  <Box variant="awsui-key-label">{t('pages:applicationSimilarities.application2')}</Box>
                  <Box variant="h3">{selectedSimilarityPair.application2_name || selectedSimilarityPair.application2_id}</Box>
                </Box>
              </Grid>

              <Box>
                <Box variant="awsui-key-label">{t('pages:applicationSimilarities.similarityScore')}</Box>
                <SpaceBetween direction="horizontal" size="s" alignItems="center">
                  <Badge 
                    color={
                      selectedSimilarityPair.similarity_score >= 0.8 ? 'green' :
                      selectedSimilarityPair.similarity_score >= 0.6 ? 'blue' :
                      selectedSimilarityPair.similarity_score >= 0.4 ? 'grey' : 'red'
                    }
                    size="large"
                  >
                    {(selectedSimilarityPair.similarity_score * 100).toFixed(1)}%
                  </Badge>
                  <Box variant="p" color="text-body-secondary">
                    {selectedSimilarityPair.similarity_score >= 0.8 ? t('pages:applicationSimilarities.veryHighSimilarity') :
                     selectedSimilarityPair.similarity_score >= 0.6 ? t('pages:applicationSimilarities.highSimilarity') :
                     selectedSimilarityPair.similarity_score >= 0.4 ? t('pages:applicationSimilarities.moderateSimilarity') : 
                     t('pages:applicationSimilarities.lowSimilarity')}
                  </Box>
                </SpaceBetween>
              </Box>

              {selectedSimilarityPair.cluster_id && (
                <Box>
                  <Box variant="awsui-key-label">{t('pages:applicationSimilarities.clusterId')}</Box>
                  <Badge color="grey">{selectedSimilarityPair.cluster_id}</Badge>
                </Box>
              )}

              <Box>
                <Box variant="awsui-key-label">{t('pages:applicationSimilarities.recommendations')}</Box>
                <Box variant="p">
                  {selectedSimilarityPair.similarity_score >= 0.8 ? (
                    <SpaceBetween size="xs">
                      <Box>• <strong>{t('pages:applicationSimilarities.highPriority')}</strong> {t('pages:applicationSimilarities.highPriorityDescription')}</Box>
                      <Box>• {t('pages:applicationSimilarities.reviewDuplicateFunctionality')}</Box>
                      <Box>• {t('pages:applicationSimilarities.evaluateCostSavings')}</Box>
                    </SpaceBetween>
                  ) : selectedSimilarityPair.similarity_score >= 0.6 ? (
                    <SpaceBetween size="xs">
                      <Box>• <strong>{t('pages:applicationSimilarities.mediumPriority')}</strong> {t('pages:applicationSimilarities.mediumPriorityDescription')}</Box>
                      <Box>• {t('pages:applicationSimilarities.standardizeTechnology')}</Box>
                      <Box>• {t('pages:applicationSimilarities.considerSharedLibraries')}</Box>
                    </SpaceBetween>
                  ) : (
                    <SpaceBetween size="xs">
                      <Box>• <strong>{t('pages:applicationSimilarities.lowPriority')}</strong> {t('pages:applicationSimilarities.lowPriorityDescription')}</Box>
                      <Box>• {t('pages:applicationSimilarities.differentTechStacks')}</Box>
                      <Box>• {t('pages:applicationSimilarities.focusOnHigherSimilarity')}</Box>
                    </SpaceBetween>
                  )}
                </Box>
              </Box>
            </SpaceBetween>
          )}
        </Modal>
      </ContentLayout>
    </Layout>
  );
};

export default ApplicationSimilaritiesPage;
