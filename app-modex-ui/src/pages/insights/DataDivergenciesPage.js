import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Container,
  ContentLayout,
  Header,
  SpaceBetween,
  Tabs,
  Alert,
  Button,
  ColumnLayout,
  StatusIndicator,
  Table,
  Pagination,
  CollectionPreferences,
  ProgressBar,
  Badge
} from '@cloudscape-design/components';

// Layouts
import Layout from '../../layouts/AppLayout';

// Components
import DataDivergenciesInfoContent from '../../components/info/DataDivergenciesInfoContent';

// API services
import { 
  getApplicationPortfolioData,
  getTechStackData,
  getInfrastructureData,
  getUtilizationData
} from '../../services/athenaQueryService';

/**
 * Data Divergencies Page Component
 * 
 * This page analyzes and displays divergencies between different data sources
 * using 5 different visualization approaches for comprehensive analysis.
 */
const DataDivergenciesPage = () => {
  const { t } = useTranslation(['pages', 'common']);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [activeTabId, setActiveTabId] = useState('matrix-heatmap');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;
  
  // Data states
  const [portfolioData, setPortfolioData] = useState([]);
  const [techStackData, setTechStackData] = useState([]);
  const [infrastructureData, setInfrastructureData] = useState([]);
  const [utilizationData, setUtilizationData] = useState([]);
  
  // Processed data states
  const [allApplications, setAllApplications] = useState([]);
  const [dataSourceSets, setDataSourceSets] = useState({});
  const [matrixData, setMatrixData] = useState([]);
  const [completenessStats, setCompletenessStats] = useState({});
  
  // Table states for legacy view
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [visibleColumns, setVisibleColumns] = useState([
    'applicationName', 'portfolio', 'techStack', 'infrastructure', 'utilization', 'completeness'
  ]);

  // Fetch all data
  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        console.log(`🔄 Fetching all data for divergency analysis... (Attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
        
        // Fetch data from all sources
        const [portfolioResult, techStackResult, infrastructureResult, utilizationResult] = await Promise.all([
          getApplicationPortfolioData(),
          getTechStackData(),
          getInfrastructureData(),
          getUtilizationData()
        ]);
        
        console.log('✅ All data fetched successfully');
        
        // Set data
        const portfolio = portfolioResult.items || [];
        const techStack = techStackResult.items || [];
        const infrastructure = infrastructureResult.items || [];
        const utilization = utilizationResult.items || [];
        
        setPortfolioData(portfolio);
        setTechStackData(techStack);
        setInfrastructureData(infrastructure);
        setUtilizationData(utilization);
        
        // Process data for visualizations
        processDataForVisualizations(portfolio, techStack, infrastructure, utilization);
        
      } catch (error) {
        console.error('❌ Error fetching data for divergency analysis:', error);
        
        // Check if error is due to missing view/table (no data uploaded yet)
        if (error.message && (
          error.message.includes('does not exist') || 
          error.message.includes('FAILED') ||
          error.message.includes('Table not found') ||
          error.message.includes('View not found')
        )) {
          // Don't show error for missing data - just show empty state
          console.log('No data uploaded yet for divergency analysis');
          setError(null);
        } else if (retryCount < MAX_RETRIES) {
          // If we haven't reached max retries, increment retry count
          console.log(`🔄 Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
          setRetryCount(retryCount + 1);
        } else {
          setError(`Failed to fetch data after ${MAX_RETRIES + 1} attempts: ${error.message}`);
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchAllData();
  }, [retryCount]);
  
  // Process data for all visualizations
  const processDataForVisualizations = (portfolio, techStack, infrastructure, utilization) => {
    // Extract application names from each data source
    const portfolioApps = new Set(portfolio.map(item => item.applicationName).filter(Boolean));
    const techStackApps = new Set(techStack.map(item => item.applicationName).filter(Boolean));
    const infrastructureApps = new Set(infrastructure.map(item => item.applicationName).filter(Boolean));
    const utilizationApps = new Set(utilization.map(item => item.applicationName).filter(Boolean));
    
    // Get all unique applications
    const allApps = new Set([...portfolioApps, ...techStackApps, ...infrastructureApps, ...utilizationApps]);
    const allApplicationsList = Array.from(allApps).sort();
    
    console.log('📊 Application counts by source:');
    console.log(`- Portfolio: ${portfolioApps.size}`);
    console.log(`- Tech Stack: ${techStackApps.size}`);
    console.log(`- Infrastructure: ${infrastructureApps.size}`);
    console.log(`- Utilization: ${utilizationApps.size}`);
    console.log(`- Total Unique: ${allApplicationsList.length}`);
    
    setAllApplications(allApplicationsList);
    setDataSourceSets({
      portfolio: portfolioApps,
      techStack: techStackApps,
      infrastructure: infrastructureApps,
      utilization: utilizationApps
    });
    
    // Create matrix data for heatmap
    const matrix = allApplicationsList.map(app => ({
      applicationName: app,
      portfolio: portfolioApps.has(app),
      techStack: techStackApps.has(app),
      infrastructure: infrastructureApps.has(app),
      utilization: utilizationApps.has(app),
      completeness: [
        portfolioApps.has(app),
        techStackApps.has(app),
        infrastructureApps.has(app),
        utilizationApps.has(app)
      ].filter(Boolean).length
    }));
    
    setMatrixData(matrix);
    
    // Calculate completeness statistics
    const stats = {
      total: allApplicationsList.length,
      complete: matrix.filter(app => app.completeness === 4).length,
      partial: matrix.filter(app => app.completeness > 1 && app.completeness < 4).length,
      minimal: matrix.filter(app => app.completeness === 1).length,
      portfolioOnly: matrix.filter(app => app.portfolio && !app.techStack && !app.infrastructure && !app.utilization).length,
      techStackOnly: matrix.filter(app => !app.portfolio && app.techStack && !app.infrastructure && !app.utilization).length,
      infrastructureOnly: matrix.filter(app => !app.portfolio && !app.techStack && app.infrastructure && !app.utilization).length,
      utilizationOnly: matrix.filter(app => !app.portfolio && !app.techStack && !app.infrastructure && app.utilization).length
    };
    
    setCompletenessStats(stats);
  };

  // Helper functions for visualizations
  const getCompletenessColor = (completeness) => {
    switch (completeness) {
      case 4: return '#1d8102'; // Green - Complete
      case 3: return '#8d6e00'; // Yellow - Good
      case 2: return '#d13212'; // Orange - Partial
      case 1: return '#d13212'; // Red - Minimal
      default: return '#687078'; // Gray - None
    }
  };
  
  const getCompletenessLabel = (completeness) => {
    switch (completeness) {
      case 4: return 'Complete (4/4)';
      case 3: return 'Good (3/4)';
      case 2: return 'Partial (2/4)';
      case 1: return 'Minimal (1/4)';
      default: return 'None (0/4)';
    }
  };

  // Matrix/Heatmap Visualization Component
  const MatrixHeatmapView = () => (
    <Box padding="l">
      <SpaceBetween size="l">
        <Header variant="h3">{t('pages:insights.applicationCoverageMatrix')}</Header>
        
        {/* Legend */}
        <Box>
          <ColumnLayout columns={4} variant="text-grid">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '16px', height: '16px', backgroundColor: '#1d8102', borderRadius: '2px' }}></div>
              <span>{t('pages:insights.completeFourFour')}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '16px', height: '16px', backgroundColor: '#8d6e00', borderRadius: '2px' }}></div>
              <span>{t('pages:insights.goodThreeFour')}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '16px', height: '16px', backgroundColor: '#d13212', borderRadius: '2px' }}></div>
              <span>{t('pages:insights.partialTwoFour')}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '16px', height: '16px', backgroundColor: '#d13212', borderRadius: '2px' }}></div>
              <span>{t('pages:insights.minimalOneFour')}</span>
            </div>
          </ColumnLayout>
        </Box>
        
        {/* Matrix Table */}
        <Table
          columnDefinitions={[
            {
              id: 'applicationName',
              header: 'Application',
              cell: item => item.applicationName,
              sortingField: 'applicationName',
              width: 200
            },
            {
              id: 'portfolio',
              header: 'Portfolio',
              cell: item => (
                <div style={{ textAlign: 'center' }}>
                  {item.portfolio ? '✅' : '❌'}
                </div>
              ),
              width: 100
            },
            {
              id: 'techStack',
              header: 'Tech Stack',
              cell: item => (
                <div style={{ textAlign: 'center' }}>
                  {item.techStack ? '✅' : '❌'}
                </div>
              ),
              width: 100
            },
            {
              id: 'infrastructure',
              header: 'Infrastructure',
              cell: item => (
                <div style={{ textAlign: 'center' }}>
                  {item.infrastructure ? '✅' : '❌'}
                </div>
              ),
              width: 120
            },
            {
              id: 'utilization',
              header: 'Utilization',
              cell: item => (
                <div style={{ textAlign: 'center' }}>
                  {item.utilization ? '✅' : '❌'}
                </div>
              ),
              width: 100
            },
            {
              id: 'completeness',
              header: 'Completeness',
              cell: item => (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div 
                    style={{ 
                      width: '12px', 
                      height: '12px', 
                      backgroundColor: getCompletenessColor(item.completeness),
                      borderRadius: '2px'
                    }}
                  ></div>
                  <span>{getCompletenessLabel(item.completeness)}</span>
                </div>
              ),
              sortingField: 'completeness'
            }
          ]}
          items={matrixData.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
          loading={loading}
          loadingText={t('common:messages.loading')}
          empty={
            <Box textAlign="center" color="inherit">
              <b>{t('common:messages.noData')}</b>
              <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                {t('pages:insights.noApplicationData')}
              </Box>
            </Box>
          }
          header={
            <Header counter={`(${matrixData.length})`}>
              {t('pages:insights.applicationCoverageMatrix')}
            </Header>
          }
          pagination={
            <Pagination
              currentPageIndex={currentPage}
              pagesCount={Math.ceil(matrixData.length / pageSize)}
              ariaLabels={{
                nextPageLabel: 'Next page',
                previousPageLabel: 'Previous page',
                pageLabel: pageNumber => `Page ${pageNumber} of all pages`
              }}
              onChange={({ detail }) => setCurrentPage(detail.currentPageIndex)}
            />
          }
          preferences={
            <CollectionPreferences
              title={t('common:preferences')}
              confirmLabel={t('common:confirm')}
              cancelLabel={t('common:cancel')}
              preferences={{
                pageSize: pageSize,
                visibleContent: visibleColumns
              }}
              pageSizePreference={{
                title: t('common:pageSize'),
                options: [
                  { value: 10, label: t('pages:insights.tenApplications') },
                  { value: 20, label: t('pages:insights.twentyApplications') },
                  { value: 50, label: t('pages:insights.fiftyApplications') }
                ]
              }}
              visibleContentPreference={{
                title: t('common:selectVisibleColumns'),
                options: [
                  {
                    label: t('pages:insights.applicationProperties'),
                    options: [
                      { id: "applicationName", label: t('pages:insights.application') },
                      { id: "portfolio", label: t('pages:insights.portfolio') },
                      { id: "techStack", label: t('pages:insights.techStack') },
                      { id: "infrastructure", label: t('pages:insights.infrastructure') },
                      { id: "utilization", label: t('pages:insights.utilization') },
                      { id: "completeness", label: t('pages:insights.completeness') }
                    ]
                  }
                ]
              }}
              onConfirm={({ detail }) => {
                setPageSize(detail.pageSize);
                setVisibleColumns(detail.visibleContent);
              }}
            />
          }
          visibleColumns={visibleColumns}
          sortingDisabled={false}
        />
      </SpaceBetween>
    </Box>
  );

  // Venn Diagram Visualization Component with actual SVG diagram
  const VennDiagramView = () => {
    const calculateIntersections = () => {
      const { portfolio, techStack, infrastructure, utilization } = dataSourceSets;
      
      return {
        portfolioOnly: allApplications.filter(app => 
          portfolio.has(app) && !techStack.has(app) && !infrastructure.has(app) && !utilization.has(app)
        ),
        techStackOnly: allApplications.filter(app => 
          !portfolio.has(app) && techStack.has(app) && !infrastructure.has(app) && !utilization.has(app)
        ),
        infrastructureOnly: allApplications.filter(app => 
          !portfolio.has(app) && !techStack.has(app) && infrastructure.has(app) && !utilization.has(app)
        ),
        utilizationOnly: allApplications.filter(app => 
          !portfolio.has(app) && !techStack.has(app) && !infrastructure.has(app) && utilization.has(app)
        ),
        allFour: allApplications.filter(app => 
          portfolio.has(app) && techStack.has(app) && infrastructure.has(app) && utilization.has(app)
        ),
        portfolioTechStack: allApplications.filter(app => 
          portfolio.has(app) && techStack.has(app) && !infrastructure.has(app) && !utilization.has(app)
        ),
        portfolioInfrastructure: allApplications.filter(app => 
          portfolio.has(app) && !techStack.has(app) && infrastructure.has(app) && !utilization.has(app)
        ),
        portfolioUtilization: allApplications.filter(app => 
          portfolio.has(app) && !techStack.has(app) && !infrastructure.has(app) && utilization.has(app)
        ),
        techStackInfrastructure: allApplications.filter(app => 
          !portfolio.has(app) && techStack.has(app) && infrastructure.has(app) && !utilization.has(app)
        ),
        techStackUtilization: allApplications.filter(app => 
          !portfolio.has(app) && techStack.has(app) && !infrastructure.has(app) && utilization.has(app)
        ),
        infrastructureUtilization: allApplications.filter(app => 
          !portfolio.has(app) && !techStack.has(app) && infrastructure.has(app) && utilization.has(app)
        )
      };
    };
    
    const intersections = calculateIntersections();
    
    return (
      <Box padding="l">
        <SpaceBetween size="l">
          <Header variant="h3">{t('pages:insights.dataSourceOverlaps')}</Header>
          
          <ColumnLayout columns={2}>
            {/* Left side - Visual Venn Diagram */}
            <div>
              <Header variant="h4">{t('pages:insights.visualOverlapDiagram')}</Header>
              <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                <svg width="400" height="300" viewBox="0 0 400 300">
                  {/* Portfolio Circle */}
                  <circle cx="150" cy="120" r="80" fill="rgba(33, 150, 243, 0.3)" stroke="#2196F3" strokeWidth="2"/>
                  <text x="100" y="80" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#1976D2">{t('pages:insights.portfolio')}</text>
                  <text x="100" y="95" textAnchor="middle" fontSize="10" fill="#1976D2">{dataSourceSets.portfolio?.size || 0}</text>
                  
                  {/* Tech Stack Circle */}
                  <circle cx="250" cy="120" r="80" fill="rgba(156, 39, 176, 0.3)" stroke="#9C27B0" strokeWidth="2"/>
                  <text x="300" y="80" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#7B1FA2">{t('pages:insights.techStack')}</text>
                  <text x="300" y="95" textAnchor="middle" fontSize="10" fill="#7B1FA2">{dataSourceSets.techStack?.size || 0}</text>
                  
                  {/* Infrastructure Circle */}
                  <circle cx="150" cy="200" r="80" fill="rgba(76, 175, 80, 0.3)" stroke="#4CAF50" strokeWidth="2"/>
                  <text x="100" y="260" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#388E3C">{t('pages:insights.infrastructure')}</text>
                  <text x="100" y="275" textAnchor="middle" fontSize="10" fill="#388E3C">{dataSourceSets.infrastructure?.size || 0}</text>
                  
                  {/* Utilization Circle */}
                  <circle cx="250" cy="200" r="80" fill="rgba(255, 152, 0, 0.3)" stroke="#FF9800" strokeWidth="2"/>
                  <text x="300" y="260" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#F57C00">{t('pages:insights.utilization')}</text>
                  <text x="300" y="275" textAnchor="middle" fontSize="10" fill="#F57C00">{dataSourceSets.utilization?.size || 0}</text>
                  
                  {/* Center intersection - All Four */}
                  <text x="200" y="160" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#333">
                    {intersections.allFour.length}
                  </text>
                  <text x="200" y="175" textAnchor="middle" fontSize="10" fill="#666">{t('pages:insights.allSources')}</text>
                  
                  {/* Two-way intersections */}
                  <text x="200" y="100" textAnchor="middle" fontSize="11" fill="#333">{intersections.portfolioTechStack.length}</text>
                  <text x="125" y="160" textAnchor="middle" fontSize="11" fill="#333">{intersections.portfolioInfrastructure.length}</text>
                  <text x="275" y="160" textAnchor="middle" fontSize="11" fill="#333">{intersections.techStackUtilization.length}</text>
                  <text x="200" y="220" textAnchor="middle" fontSize="11" fill="#333">{intersections.infrastructureUtilization.length}</text>
                </svg>
              </div>
            </div>
            
            {/* Right side - Detailed Breakdown */}
            <SpaceBetween size="m">
              <Header variant="h4">{t('pages:insights.detailedBreakdown')}</Header>
              
              <Container>
                <SpaceBetween size="s">
                  <Header variant="h5">{t('pages:insights.completeCoverage')}</Header>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t('pages:insights.allFourSources')}:</span>
                    <Badge color="green">{intersections.allFour.length} {t('pages:insights.apps')}</Badge>
                  </div>
                  {intersections.allFour.length > 0 && (
                    <Box variant="small" color="text-body-secondary">
                      {intersections.allFour.slice(0, 3).join(', ')}
                      {intersections.allFour.length > 3 && ` +${intersections.allFour.length - 3} more`}
                    </Box>
                  )}
                </SpaceBetween>
              </Container>
              
              <Container>
                <SpaceBetween size="s">
                  <Header variant="h5">{t('pages:dataDivergencies.partialCoverage')}</Header>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t('pages:dataDivergencies.portfolioTechStack')}</span>
                    <Badge>{intersections.portfolioTechStack.length}</Badge>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t('pages:dataDivergencies.portfolioInfrastructure')}</span>
                    <Badge>{intersections.portfolioInfrastructure.length}</Badge>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t('pages:dataDivergencies.techStackUtilization')}</span>
                    <Badge>{intersections.techStackUtilization.length}</Badge>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t('pages:dataDivergencies.infrastructureUtilization')}</span>
                    <Badge>{intersections.infrastructureUtilization.length}</Badge>
                  </div>
                </SpaceBetween>
              </Container>
              
              <Container>
                <SpaceBetween size="s">
                  <Header variant="h5">{t('pages:dataDivergencies.isolatedApplications')}</Header>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t('pages:dataDivergencies.portfolioOnly')}</span>
                    <Badge color={intersections.portfolioOnly.length > 0 ? 'red' : 'green'}>
                      {intersections.portfolioOnly.length}
                    </Badge>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t('pages:dataDivergencies.techStackOnly')}</span>
                    <Badge color={intersections.techStackOnly.length > 0 ? 'red' : 'green'}>
                      {intersections.techStackOnly.length}
                    </Badge>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t('pages:dataDivergencies.infrastructureOnly')}</span>
                    <Badge color={intersections.infrastructureOnly.length > 0 ? 'red' : 'green'}>
                      {intersections.infrastructureOnly.length}
                    </Badge>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t('pages:dataDivergencies.utilizationOnly')}</span>
                    <Badge color={intersections.utilizationOnly.length > 0 ? 'red' : 'green'}>
                      {intersections.utilizationOnly.length}
                    </Badge>
                  </div>
                </SpaceBetween>
              </Container>
            </SpaceBetween>
          </ColumnLayout>
        </SpaceBetween>
      </Box>
    );
  };

  // Action Items Visualization Component - More actionable than abstract dashboard
  const ActionItemsView = () => {
    const getActionItems = () => {
      const actions = [];
      
      // Find applications that need attention
      matrixData.forEach(app => {
        if (app.completeness === 1) {
          // Critical: App exists in only one source
          const source = app.portfolio ? 'Portfolio' : 
                        app.techStack ? 'Tech Stack' : 
                        app.infrastructure ? 'Infrastructure' : 'Utilization';
          actions.push({
            priority: 'High',
            type: 'Missing Data',
            application: app.applicationName,
            issue: `Only exists in ${source}`,
            action: `Add ${app.applicationName} to other data sources`,
            impact: 'Critical - Incomplete application view',
            sources: [source]
          });
        } else if (app.completeness === 2) {
          // Medium: App missing from 2 sources
          const presentSources = [];
          const missingSources = [];
          if (app.portfolio) presentSources.push('Portfolio'); else missingSources.push('Portfolio');
          if (app.techStack) presentSources.push('Tech Stack'); else missingSources.push('Tech Stack');
          if (app.infrastructure) presentSources.push('Infrastructure'); else missingSources.push('Infrastructure');
          if (app.utilization) presentSources.push('Utilization'); else missingSources.push('Utilization');
          
          actions.push({
            priority: 'Medium',
            type: 'Partial Data',
            application: app.applicationName,
            issue: `Missing from ${missingSources.join(', ')}`,
            action: `Complete data for ${app.applicationName}`,
            impact: 'Medium - Partial application view',
            sources: presentSources
          });
        } else if (!app.portfolio) {
          // App not in Portfolio is concerning
          actions.push({
            priority: 'High',
            type: 'Portfolio Gap',
            application: app.applicationName,
            issue: 'Not in Portfolio but exists elsewhere',
            action: `Add ${app.applicationName} to Portfolio`,
            impact: 'High - Portfolio completeness issue',
            sources: [
              ...(app.techStack ? ['Tech Stack'] : []),
              ...(app.infrastructure ? ['Infrastructure'] : []),
              ...(app.utilization ? ['Utilization'] : [])
            ]
          });
        }
      });
      
      return actions.sort((a, b) => {
        const priorityOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });
    };
    
    const actionItems = getActionItems();
    const highPriorityCount = actionItems.filter(item => item.priority === 'High').length;
    const mediumPriorityCount = actionItems.filter(item => item.priority === 'Medium').length;
    
    return (
      <Box padding="l">
        <SpaceBetween size="l">
          <Header variant="h3">{t('pages:insights.actionItems')}</Header>
          
          {/* Summary Cards */}
          <ColumnLayout columns={3} variant="text-grid">
            <div>
              <Box variant="awsui-key-label">{t('pages:insights.highPriorityIssues')}</Box>
              <Box variant="awsui-value-large" color="text-status-error">{highPriorityCount}</Box>
              <Box variant="small">{t('pages:insights.requireImmediateAttention')}</Box>
            </div>
            <div>
              <Box variant="awsui-key-label">{t('pages:insights.mediumPriorityIssues')}</Box>
              <Box variant="awsui-value-large" color="text-status-warning">{mediumPriorityCount}</Box>
              <Box variant="small">{t('pages:insights.shouldBeAddressedSoon')}</Box>
            </div>
            <div>
              <Box variant="awsui-key-label">{t('pages:insights.dataQualityScore')}</Box>
              <Box variant="awsui-value-large">
                {completenessStats.total > 0 ? 
                  `${Math.round(((completenessStats.complete * 4 + completenessStats.partial * 2 + completenessStats.minimal * 1) / (completenessStats.total * 4)) * 100)}%` : 
                  '0%'
                }
              </Box>
              <Box variant="small">{t('pages:insights.overallCompleteness')}</Box>
            </div>
          </ColumnLayout>
          
          {/* Action Items Table */}
          <Table
            columnDefinitions={[
              {
                id: 'priority',
                header: 'Priority',
                cell: item => (
                  <Badge color={
                    item.priority === 'High' ? 'red' : 
                    item.priority === 'Medium' ? 'yellow' : 'blue'
                  }>
                    {item.priority}
                  </Badge>
                ),
                sortingField: 'priority',
                width: 100
              },
              {
                id: 'application',
                header: 'Application',
                cell: item => <Box variant="strong">{item.application}</Box>,
                sortingField: 'application',
                width: 150
              },
              {
                id: 'issue',
                header: 'Issue',
                cell: item => item.issue,
                width: 200
              },
              {
                id: 'action',
                header: 'Recommended Action',
                cell: item => (
                  <Box variant="span" color="text-status-info">
                    {item.action}
                  </Box>
                ),
                width: 250
              },
              {
                id: 'impact',
                header: 'Impact',
                cell: item => item.impact,
                width: 200
              },
              {
                id: 'sources',
                header: 'Present In',
                cell: item => (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {item.sources.map(source => (
                      <Badge key={source} color="blue">{source}</Badge>
                    ))}
                  </div>
                ),
                width: 150
              }
            ]}
            items={actionItems.slice((currentPage - 1) * pageSize, currentPage * pageSize)}
            loading={loading}
            loadingText={t('common:messages.loading')}
            empty={
              <Box textAlign="center" color="inherit">
                <b>{t('pages:insights.noActionItems')}</b>
                <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                  {t('pages:insights.dataSourcesAligned')}
                </Box>
              </Box>
            }
            header={
              <Header 
                counter={`(${actionItems.length})`}
                description={t('pages:insights.actionItemsDescription')}
              >
                {t('pages:insights.actionItems')}
              </Header>
            }
            pagination={
              actionItems.length > pageSize ? (
                <Pagination
                  currentPageIndex={currentPage}
                  pagesCount={Math.ceil(actionItems.length / pageSize)}
                  ariaLabels={{
                    nextPageLabel: 'Next page',
                    previousPageLabel: 'Previous page',
                    pageLabel: pageNumber => `Page ${pageNumber} of all pages`
                  }}
                  onChange={({ detail }) => setCurrentPage(detail.currentPageIndex)}
                />
              ) : null
            }
            sortingDisabled={false}
          />
          
          {/* Quick Stats */}
          <Container>
            <SpaceBetween size="m">
              <Header variant="h4">{t('pages:insights.quickStatistics')}</Header>
              <ColumnLayout columns={4} variant="text-grid">
                <div>
                  <Box variant="awsui-key-label">{t('pages:insights.applicationsNeedingPortfolioEntry')}</Box>
                  <Box variant="awsui-value-large" color="text-status-error">
                    {actionItems.filter(item => item.type === 'Portfolio Gap').length}
                  </Box>
                </div>
                <div>
                  <Box variant="awsui-key-label">{t('pages:insights.orphanedApplications')}</Box>
                  <Box variant="awsui-value-large" color="text-status-error">
                    {actionItems.filter(item => item.type === 'Missing Data').length}
                  </Box>
                </div>
                <div>
                  <Box variant="awsui-key-label">{t('pages:insights.partiallyComplete')}</Box>
                  <Box variant="awsui-value-large" color="text-status-warning">
                    {actionItems.filter(item => item.type === 'Partial Data').length}
                  </Box>
                </div>
                <div>
                  <Box variant="awsui-key-label">{t('pages:insights.completeApplications')}</Box>
                  <Box variant="awsui-value-large" color="text-status-success">
                    {completenessStats.complete || 0}
                  </Box>
                </div>
              </ColumnLayout>
            </SpaceBetween>
          </Container>
        </SpaceBetween>
      </Box>
    );
  };

  // Sankey Diagram Visualization Component - Shows data flow patterns
  const SankeyDiagramView = () => {
    const getSankeyData = () => {
      const flows = [];
      
      // Calculate flows between data sources
      allApplications.forEach(app => {
        const sources = [];
        if (dataSourceSets.portfolio?.has(app)) sources.push('Portfolio');
        if (dataSourceSets.techStack?.has(app)) sources.push('Tech Stack');
        if (dataSourceSets.infrastructure?.has(app)) sources.push('Infrastructure');
        if (dataSourceSets.utilization?.has(app)) sources.push('Utilization');
        
        // Create flow representation
        if (sources.length > 1) {
          flows.push({
            applicationName: app,
            sources: sources,
            flow: sources.join(' → '),
            pattern: sources.sort().join('-')
          });
        } else if (sources.length === 1) {
          flows.push({
            applicationName: app,
            sources: sources,
            flow: `${sources[0]} (Isolated)`,
            pattern: `${sources[0]}-Only`
          });
        }
      });
      
      // Group by flow pattern
      const flowGroups = {};
      flows.forEach(flow => {
        const pattern = flow.pattern;
        if (!flowGroups[pattern]) {
          flowGroups[pattern] = {
            pattern: flow.flow,
            count: 0,
            applications: [],
            isIsolated: flow.flow.includes('Isolated'),
            isComplete: false,
            sources: flow.sources
          };
        }
        flowGroups[pattern].count++;
        flowGroups[pattern].applications.push(flow.applicationName);
        flowGroups[pattern].isComplete = flow.sources.length === 4;
      });
      
      return Object.values(flowGroups)
        .sort((a, b) => b.count - a.count);
    };
    
    const sankeyData = getSankeyData();
    const maxCount = Math.max(...sankeyData.map(d => d.count));
    
    return (
      <Box padding="l">
        <SpaceBetween size="l">
          <Header variant="h3">{t('pages:insights.dataFlowAnalysis')}</Header>
          
          {/* Visual Flow Representation */}
          <Container>
            <SpaceBetween size="m">
              <Header variant="h4">{t('pages:insights.applicationFlowPatterns')}</Header>
              
              <div style={{ padding: '20px', backgroundColor: '#fafafa', borderRadius: '8px' }}>
                <svg width="100%" height="400" viewBox="0 0 800 400">
                  {/* Source nodes */}
                  <g>
                    <rect x="50" y="50" width="120" height="60" fill="#2196F3" rx="5"/>
                    <text x="110" y="75" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">{t('pages:insights.portfolio')}</text>
                    <text x="110" y="90" textAnchor="middle" fill="white" fontSize="10">{dataSourceSets.portfolio?.size || 0} {t('pages:insights.applications')}</text>
                    
                    <rect x="50" y="130" width="120" height="60" fill="#9C27B0" rx="5"/>
                    <text x="110" y="155" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">{t('pages:insights.techStack')}</text>
                    <text x="110" y="170" textAnchor="middle" fill="white" fontSize="10">{dataSourceSets.techStack?.size || 0} {t('pages:insights.applications')}</text>
                    
                    <rect x="50" y="210" width="120" height="60" fill="#4CAF50" rx="5"/>
                    <text x="110" y="235" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">{t('pages:insights.infrastructure')}</text>
                    <text x="110" y="250" textAnchor="middle" fill="white" fontSize="10">{dataSourceSets.infrastructure?.size || 0} {t('pages:insights.applications')}</text>
                    
                    <rect x="50" y="290" width="120" height="60" fill="#FF9800" rx="5"/>
                    <text x="110" y="315" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">{t('pages:insights.utilization')}</text>
                    <text x="110" y="330" textAnchor="middle" fill="white" fontSize="10">{dataSourceSets.utilization?.size || 0} {t('pages:insights.applications')}</text>
                  </g>
                  
                  {/* Flow patterns */}
                  <g>
                    {sankeyData.slice(0, 6).map((flow, index) => {
                      const y = 60 + (index * 50);
                      const width = Math.max(20, (flow.count / maxCount) * 200);
                      const color = flow.isComplete ? '#4CAF50' : flow.isIsolated ? '#F44336' : '#FF9800';
                      
                      return (
                        <g key={index}>
                          <rect x="250" y={y} width={width} height="30" fill={color} opacity="0.7" rx="15"/>
                          <text x={250 + width/2} y={y + 20} textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">
                            {flow.count}
                          </text>
                          <text x="470" y={y + 15} fontSize="12" fill="#333">
                            {flow.pattern}
                          </text>
                          <text x="470" y={y + 30} fontSize="10" fill="#666">
                            {flow.applications.slice(0, 2).join(', ')}
                            {flow.applications.length > 2 && ` +${flow.applications.length - 2} more`}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                  
                  {/* Legend */}
                  <g>
                    <text x="600" y="30" fontSize="14" fontWeight="bold" fill="#333">{t('pages:insights.flowTypes')}</text>
                    <rect x="600" y="40" width="15" height="15" fill="#4CAF50" opacity="0.7"/>
                    <text x="620" y="52" fontSize="12" fill="#333">{t('pages:insights.completeAllFour')}</text>
                    <rect x="600" y="60" width="15" height="15" fill="#FF9800" opacity="0.7"/>
                    <text x="620" y="72" fontSize="12" fill="#333">{t('pages:insights.partialTwoThree')}</text>
                    <rect x="600" y="80" width="15" height="15" fill="#F44336" opacity="0.7"/>
                    <text x="620" y="92" fontSize="12" fill="#333">{t('pages:insights.isolatedOne')}</text>
                  </g>
                </svg>
              </div>
            </SpaceBetween>
          </Container>
          
          {/* Detailed Flow Table */}
          <Table
            columnDefinitions={[
              {
                id: 'pattern',
                header: t('pages:insights.dataFlowPattern'),
                cell: item => (
                  <div>
                    <Box variant="strong">{item.pattern}</Box>
                    <div style={{ marginTop: '4px' }}>
                      {item.isComplete && <Badge color="green">{t('pages:insights.completeFlow')}</Badge>}
                      {item.isIsolated && <Badge color="red">{t('pages:insights.isolated')}</Badge>}
                      {!item.isComplete && !item.isIsolated && <Badge color="blue">{t('pages:insights.partialFlow')}</Badge>}
                    </div>
                  </div>
                ),
                width: 300
              },
              {
                id: 'count',
                header: t('pages:insights.applications'),
                cell: item => (
                  <div style={{ textAlign: 'center' }}>
                    <Box variant="h4">{item.count}</Box>
                  </div>
                ),
                sortingField: 'count',
                width: 120
              },
              {
                id: 'percentage',
                header: t('pages:insights.percentage'),
                cell: item => (
                  <div>
                    <ProgressBar
                      value={Math.round((item.count / allApplications.length) * 100)}
                      additionalInfo={`${Math.round((item.count / allApplications.length) * 100)}%`}
                      variant={item.isComplete ? 'success' : item.isIsolated ? 'error' : 'warning'}
                    />
                  </div>
                ),
                width: 200
              },
              {
                id: 'applications',
                header: t('pages:insights.sampleApplications'),
                cell: item => (
                  <Box variant="small">
                    {item.applications.slice(0, 3).join(', ')}
                    {item.applications.length > 3 && ` +${item.applications.length - 3} more`}
                  </Box>
                )
              }
            ]}
            items={sankeyData}
            loading={loading}
            loadingText={t('common:messages.loading')}
            empty={
              <Box textAlign="center" color="inherit">
                <b>{t('pages:insights.noFlowDataAvailable')}</b>
                <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                  {t('pages:insights.noApplicationFlowPatterns')}
                </Box>
              </Box>
            }
            header={
              <Header counter={`(${sankeyData.length} patterns)`}>
                {t('pages:insights.applicationDataFlowPatterns')}
              </Header>
            }
            sortingDisabled={false}
          />
        </SpaceBetween>
      </Box>
    );
  };

  // Network Graph Visualization Component - Shows connections between data sources
  const NetworkGraphView = () => {
    const getNetworkData = () => {
      const nodes = [
        { id: 'portfolio', label: 'Portfolio', type: 'source', count: dataSourceSets.portfolio?.size || 0 },
        { id: 'techStack', label: 'Tech Stack', type: 'source', count: dataSourceSets.techStack?.size || 0 },
        { id: 'infrastructure', label: 'Infrastructure', type: 'source', count: dataSourceSets.infrastructure?.size || 0 },
        { id: 'utilization', label: 'Utilization', type: 'source', count: dataSourceSets.utilization?.size || 0 }
      ];
      
      const connections = [];
      
      // Calculate connections between sources
      const sources = ['portfolio', 'techStack', 'infrastructure', 'utilization'];
      for (let i = 0; i < sources.length; i++) {
        for (let j = i + 1; j < sources.length; j++) {
          const source1 = sources[i];
          const source2 = sources[j];
          
          const commonApps = allApplications.filter(app => 
            dataSourceSets[source1]?.has(app) && dataSourceSets[source2]?.has(app)
          );
          
          if (commonApps.length > 0) {
            connections.push({
              from: source1,
              to: source2,
              strength: commonApps.length,
              applications: commonApps
            });
          }
        }
      }
      
      return { nodes, connections };
    };
    
    const { nodes, connections } = getNetworkData();
    const maxStrength = Math.max(...connections.map(c => c.strength), 1);
    
    return (
      <Box padding="l">
        <SpaceBetween size="l">
          <Header variant="h3">{t('pages:insights.dataSourceNetworkAnalysis')}</Header>
          
          {/* Visual Network Graph */}
          <Container>
            <SpaceBetween size="m">
              <Header variant="h4">{t('pages:insights.networkVisualization')}</Header>
              
              <div style={{ padding: '20px', backgroundColor: '#fafafa', borderRadius: '8px' }}>
                <svg width="100%" height="400" viewBox="0 0 600 400">
                  {/* Connection lines */}
                  <g>
                    {connections.map((conn, index) => {
                      const fromNode = nodes.find(n => n.id === conn.from);
                      const toNode = nodes.find(n => n.id === conn.to);
                      
                      // Position nodes in a square
                      const positions = {
                        portfolio: { x: 150, y: 100 },
                        techStack: { x: 450, y: 100 },
                        infrastructure: { x: 150, y: 300 },
                        utilization: { x: 450, y: 300 }
                      };
                      
                      const fromPos = positions[conn.from];
                      const toPos = positions[conn.to];
                      const strokeWidth = Math.max(2, (conn.strength / maxStrength) * 10);
                      
                      return (
                        <g key={index}>
                          <line 
                            x1={fromPos.x} y1={fromPos.y} 
                            x2={toPos.x} y2={toPos.y}
                            stroke="#2196F3" 
                            strokeWidth={strokeWidth}
                            opacity="0.6"
                          />
                          <text 
                            x={(fromPos.x + toPos.x) / 2} 
                            y={(fromPos.y + toPos.y) / 2} 
                            textAnchor="middle" 
                            fontSize="12" 
                            fill="#333"
                            fontWeight="bold"
                          >
                            {conn.strength}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                  
                  {/* Nodes */}
                  <g>
                    {nodes.map((node, index) => {
                      const positions = {
                        portfolio: { x: 150, y: 100, color: '#2196F3' },
                        techStack: { x: 450, y: 100, color: '#9C27B0' },
                        infrastructure: { x: 150, y: 300, color: '#4CAF50' },
                        utilization: { x: 450, y: 300, color: '#FF9800' }
                      };
                      
                      const pos = positions[node.id];
                      const radius = Math.max(30, Math.min(60, (node.count / Math.max(...nodes.map(n => n.count))) * 50));
                      
                      return (
                        <g key={index}>
                          <circle 
                            cx={pos.x} cy={pos.y} r={radius} 
                            fill={pos.color} 
                            opacity="0.8"
                            stroke="white"
                            strokeWidth="3"
                          />
                          <text 
                            x={pos.x} y={pos.y - 5} 
                            textAnchor="middle" 
                            fill="white" 
                            fontSize="12" 
                            fontWeight="bold"
                          >
                            {node.label}
                          </text>
                          <text 
                            x={pos.x} y={pos.y + 10} 
                            textAnchor="middle" 
                            fill="white" 
                            fontSize="11"
                          >
                            {node.count} {t('pages:insights.apps')}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                </svg>
              </div>
            </SpaceBetween>
          </Container>
          
          {/* Connections Table */}
          <Container>
            <SpaceBetween size="m">
              <Header variant="h4">{t('pages:insights.sourceConnections')}</Header>
              <Table
                columnDefinitions={[
                  {
                    id: 'connection',
                    header: t('pages:insights.connection'),
                    cell: item => (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Badge>{nodes.find(n => n.id === item.from)?.label}</Badge>
                        <span>↔</span>
                        <Badge>{nodes.find(n => n.id === item.to)?.label}</Badge>
                      </div>
                    )
                  },
                  {
                    id: 'strength',
                    header: t('pages:insights.sharedApplications'),
                    cell: item => (
                      <div style={{ textAlign: 'center' }}>
                        <Box variant="h4">{item.strength}</Box>
                      </div>
                    ),
                    sortingField: 'strength'
                  },
                  {
                    id: 'strengthBar',
                    header: t('pages:insights.connectionStrength'),
                    cell: item => (
                      <ProgressBar
                        value={Math.round((item.strength / maxStrength) * 100)}
                        additionalInfo={`${item.strength} ${t('pages:insights.sharedApps')}`}
                        variant={item.strength > maxStrength * 0.7 ? 'success' : 'info'}
                      />
                    )
                  },
                  {
                    id: 'samples',
                    header: t('pages:insights.sampleApplications'),
                    cell: item => (
                      <Box variant="small">
                        {item.applications.slice(0, 3).join(', ')}
                        {item.applications.length > 3 && ` +${item.applications.length - 3} more`}
                      </Box>
                    )
                  }
                ]}
                items={connections.sort((a, b) => b.strength - a.strength)}
                loading={loading}
                loadingText={t('common:messages.loading')}
                empty={
                  <Box textAlign="center" color="inherit">
                    <b>{t('pages:insights.noConnectionsFound')}</b>
                    <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                      {t('pages:insights.noSharedApplications')}
                    </Box>
                  </Box>
                }
                header={
                  <Header counter={`(${connections.length})`}>
                    {t('pages:insights.dataSourceConnections')}
                  </Header>
                }
                sortingDisabled={false}
              />
            </SpaceBetween>
          </Container>
        </SpaceBetween>
      </Box>
    );
  };

  return (
    <Layout
      activeHref="/insights/data-divergencies"
      infoContent={
        <Box padding="l">
          <DataDivergenciesInfoContent />
        </Box>
      }
      toolsOpen={toolsOpen}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
    >
      <ContentLayout
        header={
          <Header variant="h1"
            actions={
              <Button
                iconName="refresh"
                loading={loading}
                onClick={() => {
                  setError(null);
                  setRetryCount(retryCount + 1);
                }}
              >
                {t('pages:insights.refresh')}
              </Button>
            }
          >
            {t('pages:insights.dataDivergenciesAnalysis')}
          </Header>
        }
      >
        <SpaceBetween size="l">
          {/* Summary Section */}
          <Container>
            <SpaceBetween size="l">
              <Header variant="h2">
                {t('pages:insights.summary')}
              </Header>
              
              {error && (
                <Alert
                  type="error"
                  header={t('pages:insights.errorFetchingData')}
                  dismissible
                  onDismiss={() => setError(null)}
                  action={
                    <Button 
                      onClick={() => {
                        setError(null);
                        setRetryCount(retryCount + 1);
                      }}
                    >
                      {t('pages:insights.retry')}
                    </Button>
                  }
                >
                  {error}
                  <Box variant="p" padding={{ top: 's' }}>
                    {t('pages:insights.networkError')}
                  </Box>
                </Alert>
              )}
              
              <ColumnLayout columns={4} variant="text-grid">
                <div>
                  <Box variant="awsui-key-label">{t('pages:insights.totalApplications')}</Box>
                  <Box variant="awsui-value-large">{allApplications.length}</Box>
                </div>
                <div>
                  <Box variant="awsui-key-label">{t('pages:insights.completeCoverage')}</Box>
                  <Box variant="awsui-value-large" color="text-status-success">
                    {completenessStats.complete || 0}
                  </Box>
                </div>
                <div>
                  <Box variant="awsui-key-label">{t('pages:insights.partialCoverage')}</Box>
                  <Box variant="awsui-value-large" color="text-status-warning">
                    {completenessStats.partial || 0}
                  </Box>
                </div>
                <div>
                  <Box variant="awsui-key-label">{t('pages:insights.dataQualityScore')}</Box>
                  <Box variant="awsui-value-large">
                    {completenessStats.total > 0 ? 
                      `${Math.round(((completenessStats.complete * 4 + completenessStats.partial * 2 + completenessStats.minimal * 1) / (completenessStats.total * 4)) * 100)}%` : 
                      '0%'
                    }
                  </Box>
                </div>
              </ColumnLayout>
            </SpaceBetween>
          </Container>
          
          {/* Visualization Tabs */}
          <Container>
            <Tabs
              activeTabId={activeTabId}
              onChange={({ detail }) => {
                setActiveTabId(detail.activeTabId);
                setCurrentPage(1); // Reset to first page when changing tabs
              }}
              tabs={[
                {
                  id: 'matrix-heatmap',
                  label: t('pages:insights.matrixHeatmap'),
                  content: <MatrixHeatmapView />
                },
                {
                  id: 'action-items',
                  label: t('pages:insights.actionItems'),
                  content: <ActionItemsView />
                }
              ]}
            />
          </Container>
        </SpaceBetween>
      </ContentLayout>
    </Layout>
  );
};

export default DataDivergenciesPage;
