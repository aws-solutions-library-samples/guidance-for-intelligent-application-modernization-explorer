import React, { useState, useEffect } from 'react';
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
  Alert,
  Button,
  Input,
  FormField,
  ProgressBar,
  StatusIndicator,
  Modal,
  Grid
} from '@cloudscape-design/components';
import { 
  getTeamAnalysisData, 
  getAllCategories, 
  saveAllTeamWeights, 
  validateWeights, 
  validateAllTeamWeights 
} from '../services/teamWeightsService';

function TeamWeightsTable() {
  const { t } = useTranslation(['components', 'common']);
  const [allTeams, setAllTeams] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [filteredTeams, setFilteredTeams] = useState([]);
  const [displayedTeams, setDisplayedTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [filterColumn, setFilterColumn] = useState({ value: 'all', label: 'All columns' });
  const [sortingColumn, setSortingColumn] = useState({ sortingField: 'teamName' });
  const [sortingDescending, setSortingDescending] = useState(false);
  const [preferences, setPreferences] = useState({
    pageSize: 10,
    visibleContent: ['teamName', 'memberCount', 'skillCount', 'weightStatus', 'actions']
  });
  
  // Modal state for editing weights
  const [editingTeam, setEditingTeam] = useState(null);
  const [editingWeights, setEditingWeights] = useState({});
  const [savingWeights, setSavingWeights] = useState(false);
  
  // Dirty state tracking
  const [isDirty, setIsDirty] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(new Map());

  // Column definitions for the table
  const columnDefinitions = [
    {
      id: 'teamName',
      header: t('components:teamWeights.teamName'),
      cell: item => item.teamName,
      sortingField: 'teamName',
      isRowHeader: true
    },
    {
      id: 'memberCount',
      header: t('components:teamWeights.members'),
      cell: item => item.memberCount,
      sortingField: 'memberCount'
    },
    {
      id: 'skillCount',
      header: t('components:teamWeights.skills'),
      cell: item => item.skillCount,
      sortingField: 'skillCount'
    },
    {
      id: 'weightStatus',
      header: t('components:teamWeights.weightAllocation'),
      cell: item => {
        const totalWeight = item.totalWeight;
        if (totalWeight === 0) {
          return <StatusIndicator type="warning">{t('components:teamWeights.notConfigured')}</StatusIndicator>;
        } else if (totalWeight < 100) {
          return (
            <Box>
              <StatusIndicator type="info">{t('components:teamWeights.percentAllocated', { percent: totalWeight })}</StatusIndicator>
              <ProgressBar value={totalWeight} />
            </Box>
          );
        } else if (totalWeight === 100) {
          return (
            <Box>
              <StatusIndicator type="success">{t('components:teamWeights.hundredPercentAllocated')}</StatusIndicator>
              <ProgressBar value={100} status="success" />
            </Box>
          );
        } else {
          return (
            <Box>
              <StatusIndicator type="error">{t('components:teamWeights.exceedsHundredPercent', { percent: totalWeight })}</StatusIndicator>
              <ProgressBar value={100} status="error" />
            </Box>
          );
        }
      },
      sortingField: 'totalWeight'
    },
    {
      id: 'actions',
      header: t('common:actions'),
      cell: item => (
        <Button
          iconName="edit"
          variant="normal" 
          size="small"
          onClick={() => handleEditWeights(item)}
        >
          {t('components:teamWeights.editWeights')}
        </Button>
      )
    }
  ];

  // Filter column options
  const filterOptions = [
    { value: 'all', label: t('components:teamWeights.allColumns') },
    { value: 'teamName', label: t('components:teamWeights.teamName') },
    { value: 'weightStatus', label: t('components:teamWeights.weightStatus') }
  ];

  // Load and process team data
  useEffect(() => {
    const loadTeamData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Load teams data which now includes categories
        const teamsData = await getTeamAnalysisData();
        
        // Extract unique categories from team data
        const categoriesSet = new Set();
        teamsData.forEach(team => {
          if (team.categories && Array.isArray(team.categories)) {
            team.categories.forEach(category => {
              if (category) categoriesSet.add(category);
            });
          }
        });
        const categoriesData = Array.from(categoriesSet).sort();
        
        setAllCategories(categoriesData);
        setAllTeams(teamsData);
        setFilteredTeams(teamsData);
        setTotalItems(teamsData.length);
        
        // Clear any pending changes on fresh load
        setPendingChanges(new Map());
        setIsDirty(false);
        
      } catch (err) {
        console.error('Error loading team data:', err);
        setError(t('components:teamWeights.failedToLoadTeamData'));
        setAllTeams([]);
        setFilteredTeams([]);
        setTotalItems(0);
      } finally {
        setLoading(false);
      }
    };
    
    loadTeamData();
  }, []);

  // Handle edit weights
  const handleEditWeights = (team) => {
    console.log('🔍 Editing team:', team);
    console.log('🔍 Team weights:', team.weights);
    console.log('🔍 Pending changes:', pendingChanges);
    
    setEditingTeam(team);
    
    // Use pending changes if available, otherwise use saved weights
    let currentWeights = {};
    
    if (pendingChanges.has(team.teamName)) {
      currentWeights = pendingChanges.get(team.teamName);
    } else if (team.weights) {
      // Handle weights object
      if (typeof team.weights === 'object' && !Array.isArray(team.weights)) {
        currentWeights = { ...team.weights };
      }
    }
    
    console.log('🔍 Current weights for editing:', currentWeights);
    setEditingWeights(currentWeights);
  };

  // Handle weight input change
  const handleWeightChange = (category, value) => {
    const numValue = parseFloat(value) || 0;
    setEditingWeights(prev => ({
      ...prev,
      [category]: numValue
    }));
  };

  // Handle save weights (individual team)
  const handleSaveWeights = async () => {
    if (!editingTeam) return;
    
    // Add to pending changes
    const newPendingChanges = new Map(pendingChanges);
    newPendingChanges.set(editingTeam.teamName, { ...editingWeights });
    setPendingChanges(newPendingChanges);
    setIsDirty(true);
    
    setEditingTeam(null);
    setEditingWeights({});
    setSuccess(t('components:teamWeights.weightsUpdated', { teamName: editingTeam.teamName }));
    
    // Clear success message after 3 seconds
    setTimeout(() => setSuccess(null), 3000);
  };

  // Handle save all changes (batch save to S3)
  const handleSaveAllChanges = async () => {
    setSavingWeights(true);
    setError(null);
    
    try {
      // Create updated teams array with pending changes
      const updatedTeams = allTeams.map(team => {
        // Get weights from pending changes or existing weights
        const teamWeights = pendingChanges.get(team.teamName) || team.weights || {};
        
        // Ensure weights is a proper object with numeric values
        const processedWeights = {};
        Object.entries(teamWeights).forEach(([key, value]) => {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            processedWeights[key] = numValue;
          }
        });
        
        return {
          teamName: team.teamName,
          weights: processedWeights,
          memberCount: team.memberCount,
          skillCount: team.skillCount
        };
      });
      
      // Validate all teams before saving
      const validation = validateAllTeamWeights(updatedTeams);
      if (!validation.isValid) {
        const invalidTeamNames = validation.invalidTeams.map(t => t.teamName).join(', ');
        throw new Error(t('components:teamWeights.invalidWeightAllocation', { teamNames: invalidTeamNames }));
      }
      
      await saveAllTeamWeights(updatedTeams);
      
      // Update local state with saved data
      const newTeams = allTeams.map(team => {
        const pendingWeights = pendingChanges.get(team.teamName);
        if (pendingWeights) {
          const validation = validateWeights(pendingWeights);
          return {
            ...team,
            weights: pendingWeights,
            totalWeight: validation.totalWeight
          };
        }
        return team;
      });
      
      setAllTeams(newTeams);
      setFilteredTeams(newTeams);
      setPendingChanges(new Map());
      setIsDirty(false);
      setSuccess(t('components:teamWeights.allTeamWeightsSaved'));
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
      
    } catch (err) {
      console.error('Error saving team weights:', err);
      setError(t('components:teamWeights.failedToSaveWeights', { error: err.message }));
    } finally {
      setSavingWeights(false);
    }
  };

  // Handle discard changes
  const handleDiscardChanges = () => {
    setPendingChanges(new Map());
    setIsDirty(false);
    setSuccess(t('components:teamWeights.changesDiscarded'));
    
    // Clear success message after 3 seconds
    setTimeout(() => setSuccess(null), 3000);
  };

  // Apply filtering and sorting
  useEffect(() => {
    let result = [...allTeams];
    
    // Apply filtering
    if (filterText) {
      result = result.filter(item => {
        if (filterColumn.value === 'all') {
          return (
            item.teamName.toLowerCase().includes(filterText.toLowerCase()) ||
            item.totalWeight.toString().includes(filterText)
          );
        } else if (filterColumn.value === 'teamName') {
          return item.teamName.toLowerCase().includes(filterText.toLowerCase());
        } else if (filterColumn.value === 'weightStatus') {
          return item.totalWeight.toString().includes(filterText);
        }
        return true;
      });
    }
    
    // Apply sorting
    if (sortingColumn) {
      const { sortingField } = sortingColumn;
      result.sort((a, b) => {
        const aValue = a[sortingField];
        const bValue = b[sortingField];
        
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortingDescending 
            ? bValue.localeCompare(aValue) 
            : aValue.localeCompare(bValue);
        } else {
          return sortingDescending 
            ? bValue - aValue 
            : aValue - bValue;
        }
      });
    }
    
    setFilteredTeams(result);
    setTotalItems(result.length);
    setCurrentPage(1); // Reset to first page when filtering changes
  }, [allTeams, filterText, filterColumn, sortingColumn, sortingDescending]);

  // Apply pagination
  useEffect(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filteredTeams.length);
    setDisplayedTeams(filteredTeams.slice(startIndex, endIndex));
  }, [filteredTeams, currentPage, pageSize]);

  // Handle pagination change
  const handlePaginationChange = event => {
    setCurrentPage(event.detail.currentPageIndex);
  };

  // Handle filter change
  const handleFilterChange = event => {
    setFilterText(event.detail.filteringText);
  };

  // Handle filter column change
  const handleFilterColumnChange = event => {
    setFilterColumn(event.detail.selectedOption);
  };

  // Handle preferences change
  const handlePreferencesChange = event => {
    setPreferences(event.detail);
    setPageSize(event.detail.pageSize);
  };

  // Handle sorting change
  const handleSortingChange = event => {
    const { detail } = event;
    if (detail.sortingColumn) {
      setSortingDescending(detail.isDescending);
      setSortingColumn(detail.sortingColumn);
    }
  };

  // Calculate validation for editing weights
  const editingValidation = validateWeights(editingWeights);

  // Calculate total pages
  const totalPages = Math.ceil(totalItems / pageSize);

  return (
    <>
      {error && (
        <Alert type="error" dismissible onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      
      {success && (
        <Alert type="success" dismissible onDismiss={() => setSuccess(null)}>
          {success}
        </Alert>
      )}
      
      <Table
        columnDefinitions={columnDefinitions}
        items={displayedTeams}
        loading={loading}
        loadingText={t('components:teamWeights.loadingTeams')}
        selectionType="single"
        trackBy="teamName"
        empty={
          <Box textAlign="center" color="inherit">
            <b>{t('components:teamWeights.noTeams')}</b>
            <Box padding={{ bottom: "s" }} variant="p" color="inherit">
              {t('components:teamWeights.noTeamsToDisplay')}
            </Box>
          </Box>
        }
        header={
          <Header
            counter={`(${totalItems})`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" onClick={() => window.location.reload()}>
                  {t('common:refresh')}
                </Button>
              </SpaceBetween>
            }
          >
            {t('components:teamWeights.teamSkillCategoryWeights')}
          </Header>
        }
        filter={
          <TextFilter
            filteringText={filterText}
            filteringPlaceholder={t('components:teamWeights.findTeams')}
            filteringAriaLabel={t('components:teamWeights.filterTeams')}
            onChange={handleFilterChange}
            countText={t('components:teamWeights.matchesCount', { count: totalItems })}
            filteringClearAriaLabel={t('components:teamWeights.clearFilter')}
          />
        }
        pagination={
          <Pagination
            currentPageIndex={currentPage}
            pagesCount={totalPages}
            onChange={handlePaginationChange}
            ariaLabels={{
              nextPageLabel: t('common:nextPage'),
              previousPageLabel: t('common:previousPage'),
              pageLabel: pageNumber => t('common:pageLabel', { pageNumber, totalPages })
            }}
          />
        }
        preferences={
          <CollectionPreferences
            title={t('common:preferences')}
            confirmLabel={t('common:confirm')}
            cancelLabel={t('common:cancel')}
            preferences={preferences}
            pageSizePreference={{
              title: t('common:pageSize'),
              options: [
                { value: 10, label: t('components:teamWeights.tenTeams') },
                { value: 25, label: t('components:teamWeights.twentyFiveTeams') },
                { value: 50, label: t('components:teamWeights.fiftyTeams') }
              ]
            }}
            visibleContentPreference={{
              title: t('common:selectVisibleColumns'),
              options: [
                {
                  label: t('components:teamWeights.teamInformation'),
                  options: [
                    { id: "teamName", label: t('components:teamWeights.teamName') },
                    { id: "memberCount", label: t('components:teamWeights.members') },
                    { id: "skillCount", label: t('components:teamWeights.skills') },
                    { id: "weightStatus", label: t('components:teamWeights.weightAllocation') },
                    { id: "actions", label: t('common:actions') }
                  ]
                }
              ]
            }}
            onConfirm={handlePreferencesChange}
          />
        }
        visibleColumns={preferences.visibleContent}
      />
      
      {/* Save/Discard Buttons - Always visible but disabled when no changes */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'flex-end',
        marginTop: '20px'
      }}>
        <SpaceBetween direction="horizontal" size="xs">
          <Button 
            variant="normal" 
            onClick={handleDiscardChanges}
            disabled={!isDirty || savingWeights}
          >
            {t('components:teamWeights.discardChanges')}
          </Button>
          <Button 
            variant="primary" 
            onClick={handleSaveAllChanges}
            loading={savingWeights}
            disabled={!isDirty}
          >
            {t('components:teamWeights.saveAllChanges')}
          </Button>
        </SpaceBetween>
      </div>

      {/* Edit Weights Modal */}
      <Modal
        onDismiss={() => setEditingTeam(null)}
        visible={!!editingTeam}
        size="large"
        header={`${t('components:teamWeights.editSkillCategoryWeights')} - ${editingTeam?.teamName}`}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setEditingTeam(null)}>
                {t('common:cancel')}
              </Button>
              <Button 
                variant="primary" 
                onClick={handleSaveWeights}
                loading={savingWeights}
                disabled={!editingValidation.isValid}
              >
                {t('components:teamWeights.updateWeights')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="l">
          <Box>
            <SpaceBetween direction="horizontal" size="m">
              <Box>
                <strong>{t('components:teamWeights.totalAllocated')}:</strong> {editingValidation.totalWeight}%
              </Box>
              <Box>
                <strong>{t('components:teamWeights.remaining')}:</strong> {editingValidation.remainingWeight}%
              </Box>
              {!editingValidation.isValid && (
                <StatusIndicator type="error">
                  {t('components:teamWeights.totalExceedsHundred')}
                </StatusIndicator>
              )}
            </SpaceBetween>
            <ProgressBar 
              value={Math.min(editingValidation.totalWeight, 100)} 
              status={editingValidation.isValid ? "success" : "error"}
            />
          </Box>
          
          {/* Debug info */}
          <Box>
            <details>
              <summary>{t('components:teamWeights.debugInfo')}</summary>
              <pre style={{ fontSize: '12px', background: '#f5f5f5', padding: '10px', overflow: 'auto' }}>
                {JSON.stringify({ 
                  editingTeam: editingTeam,
                  editingWeights: editingWeights,
                  pendingChanges: Object.fromEntries(pendingChanges),
                  validation: editingValidation
                }, null, 2)}
              </pre>
            </details>
          </Box>
          
          <Grid gridDefinition={[{ colspan: 6 }, { colspan: 6 }]}>
            {allCategories.map((category, index) => {
              // Force lowercase for category keys to ensure matching
              const categoryLower = category.toLowerCase();
              const weightValue = Object.entries(editingWeights).find(
                ([key, value]) => key.toLowerCase() === categoryLower
              )?.[1] || '';
              
              console.log(`🔍 Rendering input for category ${category}:`, weightValue);
              
              return (
                <FormField
                  key={category}
                  label={category}
                  description={t('components:teamWeights.weightForCategory', { category })}
                >
                  <Input
                    type="number"
                    value={weightValue}
                    onChange={({ detail }) => handleWeightChange(category, detail.value)}
                    placeholder="0"
                    step="0.1"
                    min="0"
                    max="100"
                  />
                </FormField>
              );
            })}
          </Grid>
        </SpaceBetween>
      </Modal>
    </>
  );
}

export default TeamWeightsTable;
