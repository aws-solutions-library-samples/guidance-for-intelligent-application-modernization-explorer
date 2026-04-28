import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Table,
  Box,
  Pagination,
  TextFilter,
  CollectionPreferences,
  SpaceBetween,
  Header,
  Select,
  StatusIndicator,
  Icon,
  Alert,
  Button
} from '@cloudscape-design/components';
import { getTeamSkills } from '../services/athenaQueryService';
import DownloadDropdownButton from './DownloadDropdownButton';
import AutoRefreshControl from './AutoRefreshControl';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { hasDataChanged } from '../utils/dataComparisonUtils';

function SkillsTable({ externalRefreshTrigger }) {
  const { t } = useTranslation(['components', 'common']);
  const [allSkills, setAllSkills] = useState([]);
  const [filteredSkills, setFilteredSkills] = useState([]);
  const [displayedSkills, setDisplayedSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [filterColumn, setFilterColumn] = useState({ value: 'all', label: 'All columns' });
  const [sortingColumn, setSortingColumn] = useState({ sortingField: 'skill' });
  const [sortingDescending, setSortingDescending] = useState(false);
  const [preferences, setPreferences] = useState({
    pageSize: 10,
    visibleContent: ['skill', 'category', 'proficiency', 'team', 'members', 'notes']
  });

  // Render proficiency indicator based on numeric value (1-5)
  const renderProficiency = (proficiencyLevel) => {
    const level = parseInt(proficiencyLevel, 10);
    switch (level) {
      case 5:
        return <StatusIndicator type="success">{t('components:skillsTable.expert')}</StatusIndicator>;
      case 4:
        return <StatusIndicator type="info">{t('components:skillsTable.advanced')}</StatusIndicator>;
      case 3:
        return <StatusIndicator type="warning">{t('components:skillsTable.intermediate')}</StatusIndicator>;
      case 2:
        return <StatusIndicator type="error">{t('components:skillsTable.beginner')}</StatusIndicator>;
      case 1:
        return <StatusIndicator type="error">{t('components:skillsTable.novice')}</StatusIndicator>;
      default:
        return <StatusIndicator type="stopped">{t('components:emptyStates.unknown')}</StatusIndicator>;
    }
  };

  // Render notes as an icon with tooltip
  const renderNotes = (notes) => {
    if (!notes) return null;
    
    return (
      <div className="custom-tooltip" style={{ cursor: 'help', textAlign: 'center' }}>
        <Icon name="status-info" size="normal" />
        <span className="tooltip-text">{notes}</span>
      </div>
    );
  };

  // Column definitions for the table
  const columnDefinitions = [
    {
      id: 'skill',
      header: t('components:skillsTable.skill'),
      cell: item => item.skill,
      sortingField: 'skill'
    },
    {
      id: 'category',
      header: t('components:skillsTable.category'),
      cell: item => item.category,
      sortingField: 'category'
    },
    {
      id: 'proficiency',
      header: t('components:skillsTable.proficiency'),
      cell: item => renderProficiency(item.proficiency),
      sortingField: 'proficiency'
    },
    {
      id: 'team',
      header: t('components:skillsTable.team'),
      cell: item => item.team,
      sortingField: 'team'
    },
    {
      id: 'members',
      header: t('components:skillsTable.members'),
      cell: item => item.members,
      sortingField: 'members'
    },
    {
      id: 'notes',
      header: t('components:skillsTable.notes'),
      cell: item => item.notes,
      sortingField: 'notes'
    }
  ];

  // Download columns (same as table columns but without rendering functions)
  const downloadColumns = [
    { id: 'skill', header: t('components:skillsTable.skill') },
    { id: 'category', header: t('components:skillsTable.category') },
    { id: 'proficiency', header: t('components:skillsTable.proficiency') },
    { id: 'team', header: t('components:skillsTable.team') },
    { id: 'members', header: t('components:skillsTable.members') },
    { id: 'notes', header: t('components:skillsTable.notes') }
  ];

  // Filter column options
  const filterColumnOptions = [
    { value: 'all', label: t('components:skillsTable.allColumns') },
    { value: 'skill', label: t('components:skillsTable.skill') },
    { value: 'category', label: t('components:skillsTable.category') },
    { value: 'proficiency', label: t('components:skillsTable.proficiency') },
    { value: 'team', label: t('components:skillsTable.team') },
    { value: 'members', label: t('components:skillsTable.members') },
    { value: 'notes', label: t('components:skillsTable.notes') }
  ];

  // Store current data for comparison
  const currentDataRef = useRef(null);
  
  // Load all skills data when component mounts
  const loadAllSkills = useCallback(async () => {
    console.log('🔄 Loading skills data (DISTINCT)...');
    setLoading(true);
    setError(null);
    try {
      const data = await getTeamSkills(true);
      console.log(`✅ Loaded ${data.length} skills records`);
      
      // Generate unique IDs for each record to avoid React key conflicts
      const dataWithUniqueIds = data.map((item, index) => ({
        ...item,
        uniqueId: `${item.id || 'no-id'}-${index}`
      }));
      
      // Smart refresh: only update if data actually changed
      if (hasDataChanged(currentDataRef.current, dataWithUniqueIds)) {
        console.log('📊 Data changed, updating UI');
        currentDataRef.current = dataWithUniqueIds;
        setAllSkills(dataWithUniqueIds);
      } else {
        console.log('✓ Data unchanged, skipping UI update');
      }
    } catch (err) {
      console.error('Error loading skills data:', err);
      setError('Failed to load team skills data. Please try again later.');
      setAllSkills([]);
      setFilteredSkills([]);
      setTotalItems(0);
    } finally {
      setLoading(false);
    }
  }, []);

  // Set up auto-refresh (fixed 30-second interval)
  const autoRefresh = useAutoRefresh(loadAllSkills, {
    enabled: true
  });

  // Initial load
  useEffect(() => {
    loadAllSkills();
  }, [loadAllSkills]);

  // Handle external refresh trigger (from DataSourcesTable)
  const prevExternalTrigger = useRef(externalRefreshTrigger);
  useEffect(() => {
    if (externalRefreshTrigger && externalRefreshTrigger !== prevExternalTrigger.current) {
      console.log('🔔 External refresh triggered for SkillsTable');
      autoRefresh.triggerRefresh();
      prevExternalTrigger.current = externalRefreshTrigger;
    }
  }, [externalRefreshTrigger, autoRefresh]);

  // Apply filtering and sorting whenever filter or sort parameters change
  useEffect(() => {
    console.log('🔄 Applying filters and sorting. allSkills count:', allSkills.length);
    
    // Apply filtering
    let result = [...allSkills];
    
    if (filterText) {
      if (filterColumn.value === 'all') {
        result = result.filter(item => 
          item.skill?.toLowerCase().includes(filterText.toLowerCase()) ||
          item.category?.toLowerCase().includes(filterText.toLowerCase()) ||
          // For proficiency, convert number to text representation for filtering
          getProficiencyText(item.proficiency).toLowerCase().includes(filterText.toLowerCase()) ||
          item.team?.toLowerCase().includes(filterText.toLowerCase()) ||
          String(item.members || '').includes(filterText) ||
          (item.notes && item.notes.toLowerCase().includes(filterText.toLowerCase()))
        );
      } else if (filterColumn.value === 'proficiency') {
        // Special handling for proficiency filtering
        result = result.filter(item => 
          getProficiencyText(item.proficiency).toLowerCase().includes(filterText.toLowerCase()) ||
          String(item.proficiency || '').includes(filterText)
        );
      } else if (filterColumn.value === 'members') {
        // Special handling for members filtering (numeric)
        result = result.filter(item => 
          String(item.members || '').includes(filterText)
        );
      } else {
        result = result.filter(item => {
          const value = item[filterColumn.value];
          return value && String(value).toLowerCase().includes(filterText.toLowerCase());
        });
      }
    }
    
    // Apply sorting
    if (sortingColumn) {
      result.sort((a, b) => {
        const valueA = a[sortingColumn.sortingField];
        const valueB = b[sortingColumn.sortingField];
        
        // Handle numeric sorting
        if (sortingColumn.sortingField === 'proficiency' || sortingColumn.sortingField === 'members') {
          const numA = parseInt(valueA, 10) || 0;
          const numB = parseInt(valueB, 10) || 0;
          return sortingDescending ? numB - numA : numA - numB;
        }
        
        // Handle string sorting
        const stringA = String(valueA || '').toLowerCase();
        const stringB = String(valueB || '').toLowerCase();
        
        if (sortingDescending) {
          return stringB.localeCompare(stringA);
        }
        return stringA.localeCompare(stringB);
      });
    }
    
    console.log('✅ Filtered result count:', result.length);
    setFilteredSkills(result);
    setTotalItems(result.length);
    
    // Reset to first page when filtering changes
    if (filterText !== '') {
      setCurrentPage(1);
    }
  }, [allSkills, filterText, filterColumn, sortingColumn, sortingDescending]);

  // Helper function to get text representation of proficiency level
  function getProficiencyText(level) {
    const profLevel = parseInt(level, 10);
    switch (profLevel) {
      case 5: return 'Expert';
      case 4: return 'Advanced';
      case 3: return 'Intermediate';
      case 2: return 'Beginner';
      case 1: return 'Novice';
      default: return 'Unknown';
    }
  }

  // Apply pagination whenever filtered data or pagination parameters change
  useEffect(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filteredSkills.length);
    const paginated = filteredSkills.slice(startIndex, endIndex);
    console.log(`📄 Pagination: Page ${currentPage}, Size ${pageSize}, Showing ${paginated.length} items (${startIndex}-${endIndex} of ${filteredSkills.length})`);
    console.log('📄 Paginated items being displayed:', paginated.map(p => ({ skill: p.skill, uniqueId: p.uniqueId })));
    setDisplayedSkills(paginated);
  }, [filteredSkills, currentPage, pageSize]);

  // Handle page change
  const handlePageChange = ({ detail }) => {
    setCurrentPage(detail.currentPageIndex);
  };

  // Handle preferences change
  const handlePreferencesChange = ({ detail }) => {
    const newPreferences = {
      ...detail,
      pageSize: detail.pageSize || preferences.pageSize
    };
    setPreferences(newPreferences);
    if (newPreferences.pageSize !== pageSize) {
      setPageSize(newPreferences.pageSize);
      setCurrentPage(1); // Reset to first page when changing page size
    }
  };

  // Handle filter change
  const handleFilterChange = ({ detail }) => {
    setFilterText(detail.filteringText);
    // Pause auto-refresh while user is typing
    autoRefresh.pauseTemporarily(5000);
  };

  // Handle filter column change
  const handleFilterColumnChange = ({ detail }) => {
    setFilterColumn(detail.selectedOption);
  };

  // Handle sorting change
  const handleSortingChange = ({ detail }) => {
    if (detail.sortingColumn) {
      setSortingColumn(detail.sortingColumn);
      setSortingDescending(detail.isDescending);
    }
  };

  // Handle refresh
  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTeamSkills(true);
      setAllSkills(data);
      setFilteredSkills(data);
      setTotalItems(data.length);
    } catch (err) {
      console.error('Error refreshing skills data:', err);
      setError('Failed to refresh team skills data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };



  // Calculate total pages
  const totalPages = Math.ceil(totalItems / pageSize);

  return (
    <>
      {error && (
        <Alert type="error" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      
      <Table
        columnDefinitions={columnDefinitions}
        items={displayedSkills}
        loading={loading}
        loadingText={t('components:skillsTable.loadingSkills')}
        selectionType="single"
        trackBy="uniqueId"
        sortingColumn={sortingColumn}
        sortingDescending={sortingDescending}
        onSortingChange={handleSortingChange}
        empty={
          <Box textAlign="center" color="inherit">
            <b>{t('components:emptyStates.noSkills')}</b>
            <Box padding={{ bottom: "s" }} variant="p" color="inherit">
              {t('components:emptyStates.noSkillsToDisplay')}
            </Box>
          </Box>
        }
        header={
          <Header
            counter={totalItems > 0 ? `(${totalItems})` : undefined}
            actions={
              <AutoRefreshControl
                isRefreshing={autoRefresh.isRefreshing}
                onManualRefresh={autoRefresh.triggerRefresh}
                isPaused={autoRefresh.isPaused}
                onTogglePause={autoRefresh.togglePause}
              />
            }
          >
            {t('components:skillsTable.skillsHeader')}
          </Header>
        }
        filter={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Select
              selectedOption={filterColumn}
              onChange={handleFilterColumnChange}
              options={filterColumnOptions}
              ariaLabel={t('components:common.filterColumn')}
            />
            <div style={{ width: '300px' }}>
              <TextFilter
                filteringText={filterText}
                filteringPlaceholder={t('components:skillsTable.findByPlaceholder', { column: filterColumn.label.toLowerCase() })}
                filteringAriaLabel={t('components:skillsTable.findByPlaceholder', { column: filterColumn.label.toLowerCase() })}
                onChange={handleFilterChange}
              />
            </div>

          </div>
        }
        pagination={
          <Pagination
            currentPageIndex={currentPage}
            pagesCount={totalPages}
            ariaLabels={{
              nextPageLabel: 'Next page',
              previousPageLabel: 'Previous page',
              pageLabel: pageNumber => `Page ${pageNumber} of all pages`
            }}
            onChange={handlePageChange}
          />
        }
        preferences={
          <CollectionPreferences
            title={t('components:tables.preferences')}
            confirmLabel={t('components:tables.confirm')}
            cancelLabel={t('components:tables.cancel')}
            preferences={preferences}
            pageSizePreference={{
              title: t('components:tables.pagination.pageSize'),
              options: [
                { value: 10, label: t('components:skillsTable.tenSkills') },
                { value: 20, label: t('components:skillsTable.twentySkills') },
                { value: 50, label: t('components:skillsTable.fiftySkills') }
              ]
            }}
            visibleContentPreference={{
              title: t('components:tables.selectVisibleColumns'),
              options: [
                {
                  label: t('components:skillsTable.skillProperties'),
                  options: [
                    { id: "skill", label: t('components:skillsTable.skill') },
                    { id: "category", label: t('components:skillsTable.category') },
                    { id: "proficiency", label: t('components:skillsTable.proficiency') },
                    { id: "team", label: t('components:skillsTable.team') },
                    { id: "members", label: t('components:skillsTable.members') },
                    { id: "notes", label: t('components:skillsTable.notes') }
                  ]
                }
              ]
            }}
            onConfirm={handlePreferencesChange}
          />
        }
        visibleColumns={preferences.visibleContent}
      />
      
      <Box padding={{ top: 'l' }}>
        <DownloadDropdownButton
          data={allSkills}
          filteredData={filteredSkills}
          columns={downloadColumns}
          filename="team_skills"
          dataType="skills dataset"
        />
      </Box>
    </>
  );
}

export default SkillsTable;
