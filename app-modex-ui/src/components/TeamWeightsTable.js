import React, { useState, useEffect } from 'react';
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
import { useTranslation } from 'react-i18next';
import { 
  getTeamAnalysisData, 
  getAllCategories, 
  saveAllTeamWeights, 
  validateWeights, 
  validateAllTeamWeights 
} from '../services/teamWeightsService';
import EditableWeightInput from './EditableWeightInput';

function TeamWeightsTable({ onAnalysisStarted, hasWriteAccess = true }) {
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
  const [filterColumn, setFilterColumn] = useState({ value: 'all', label: t('components:teamWeights.allColumns') });
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
        // Check for pending changes first, then fall back to saved data
        const pendingWeights = pendingChanges.get(item.teamName);
        let totalWeight = item.totalWeight;
        
        if (pendingWeights) {
          // Calculate total from pending changes
          totalWeight = Object.values(pendingWeights).reduce((sum, weight) => {
            return sum + (parseFloat(weight) || 0);
          }, 0);
        }
        
        if (totalWeight === 0) {
          return <StatusIndicator type="warning">{t('components:teamWeights.notConfigured')}</StatusIndicator>;
        } else if (totalWeight < 100) {
          return (
            <Box>
              <StatusIndicator type="info">
                {t('components:teamWeights.percentAllocated', { percent: totalWeight })}{pendingWeights ? ` (${t('components:teamWeights.pending')})` : ''}
              </StatusIndicator>
              <ProgressBar value={totalWeight} />
            </Box>
          );
        } else if (totalWeight === 100) {
          return (
            <Box>
              <StatusIndicator type="success">
                {t('components:teamWeights.hundredPercentAllocated')}{pendingWeights ? ` (${t('components:teamWeights.pending')})` : ''}
              </StatusIndicator>
              <ProgressBar value={100} />
            </Box>
          );
        } else {
          return (
            <Box>
              <StatusIndicator type="error">
                {t('components:teamWeights.exceedsHundredPercent', { percent: totalWeight })}{pendingWeights ? ` (${t('components:teamWeights.pending')})` : ''}
              </StatusIndicator>
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
        <SpaceBetween direction="horizontal" size="xs">
          <Button
            iconName="edit"
            variant="normal" 
            size="small"
            onClick={() => handleEditWeights(item)}
            disabled={!hasWriteAccess}
          >
            {t('components:teamWeights.editWeights')}
          </Button>
          <Button 
            variant="normal" 
            size="small"
            onClick={() => handleResetWeights(item.teamName)}
            disabled={!hasWriteAccess || !pendingChanges.has(item.teamName)}
          >
            {t('common:reset')}
          </Button>
        </SpaceBetween>
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
        
        console.log('🔍 Teams data loaded:', teamsData);
        console.log('🔍 API Team data:', teamsData.find(t => t.teamName === 'API Team'));
        
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
    console.log('Editing team:', team);
    console.log('Team weights:', team.weights);
    
    // Create a new object with string values for the weights
    const initialWeights = {};
    
    // If there are pending changes, use those values
    if (pendingChanges.has(team.teamName)) {
      const pendingWeightsObj = pendingChanges.get(team.teamName);
      Object.entries(pendingWeightsObj).forEach(([key, value]) => {
        initialWeights[key] = String(value);
      });
      console.log('Using pending changes:', initialWeights);
    } 
    // Otherwise, if there are weights in the team object, use those
    else if (team.weights && typeof team.weights === 'object') {
      Object.entries(team.weights).forEach(([key, value]) => {
        initialWeights[key] = String(value);
      });
      console.log('Using team weights:', initialWeights);
    }
    
    setEditingTeam(team);
    setEditingWeights(initialWeights);
  };

  // Handle weight input change
  const handleWeightChange = (category, value) => {
    console.log(`Changing weight for ${category} to ${value}`);
    
    setEditingWeights(prev => ({
      ...prev,
      [category]: value
    }));
  };

  // Handle save weights (individual team)
  const handleSaveWeights = async () => {
    if (!editingTeam) return;
    
    // Process weights to ensure all values are valid numbers
    const processedWeights = {};
    Object.entries(editingWeights).forEach(([key, value]) => {
      if (value !== '') {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          processedWeights[key] = numValue;
        }
      }
    });
    
    // Add to pending changes
    const newPendingChanges = new Map(pendingChanges);
    newPendingChanges.set(editingTeam.teamName, processedWeights);
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
      
      const result = await saveAllTeamWeights(updatedTeams);
      
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
      
      // Check if skill importance analysis was triggered
      if (result && result.data && result.data.executionArn) {
        console.log('✅ Skill importance analysis started:', result.data.executionArn);
        
        // Notify parent component
        if (onAnalysisStarted) {
          onAnalysisStarted(result.data.executionArn);
        }
      }
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error saving team weights:', err);
      setError(t('components:teamWeights.failedToSaveWeights', { error: err.message }));
    } finally {
      setSavingWeights(false);
    }
  };

  // Handle reset weights
  const handleResetWeights = (teamName) => {
    // Find the team in allTeams
    const team = allTeams.find(t => t.teamName === teamName);
    
    if (team && pendingChanges.has(teamName)) {
      // Remove pending changes to revert to original weights
      const newPendingChanges = new Map(pendingChanges);
      newPendingChanges.delete(teamName);
      setPendingChanges(newPendingChanges);
      
      // Only set isDirty to false if there are no more pending changes
      if (newPendingChanges.size === 0) {
        setIsDirty(false);
      }
      
      setSuccess(t('components:teamWeights.weightsReset', { teamName }));
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
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

  // Calculate total weight from editingWeights state
  const calculateTotalWeight = () => {
    let total = 0;
    Object.values(editingWeights).forEach(value => {
      const numValue = parseFloat(value) || 0;
      total += numValue;
    });
    return Math.round(total * 10) / 10;
  };
  
  const totalWeight = calculateTotalWeight();
  const remainingWeight = Math.max(0, Math.round((100 - totalWeight) * 10) / 10);
  const isWeightValid = totalWeight <= 100;

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
              pageLabel: pageNumber => t('common:pageOfPages', { pageNumber, totalPages })
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
            disabled={!hasWriteAccess || !isDirty || savingWeights}
          >
            {t('components:teamWeights.discardChanges')}
          </Button>
          <Button 
            variant="primary" 
            onClick={handleSaveAllChanges}
            loading={savingWeights}
            disabled={!hasWriteAccess || !isDirty}
          >
            {t('components:teamWeights.saveAllChanges')}
          </Button>
        </SpaceBetween>
      </div>

      {/* Edit Weights Modal */}
      <Modal
        visible={!!editingTeam}
        onDismiss={() => setEditingTeam(null)}
        header={editingTeam ? `${t('components:teamWeights.editSkillCategoryWeights')} - ${editingTeam.teamName}` : ''}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button 
                variant="link"
                onClick={() => setEditingTeam(null)}
              >
                {t('modals.cancel')}
              </Button>
              <Button 
                variant="primary"
                onClick={handleSaveWeights}
                disabled={!isWeightValid}
              >
                {t('components:teamWeights.updateWeights')}
              </Button>
            </SpaceBetween>
          </Box>
        }
        size="large"
      >
        <SpaceBetween size="l">
          {/* Weight Summary */}
          <Box>
            <SpaceBetween size="s">
              <Box>
                <SpaceBetween direction="horizontal" size="l">
                  <Box>
                    <Box variant="awsui-key-label">{t('components:teamWeights.totalAllocated')}</Box>
                    <Box variant="h3">{totalWeight}%</Box>
                  </Box>
                  <Box>
                    <Box variant="awsui-key-label">{t('components:teamWeights.remaining')}</Box>
                    <Box variant="h3">{remainingWeight}%</Box>
                  </Box>
                </SpaceBetween>
              </Box>
              
              {!isWeightValid && (
                <Alert type="error">
                  {t('components:teamWeights.totalExceedsHundred')}
                </Alert>
              )}
              
              <ProgressBar
                value={totalWeight}
                status={isWeightValid ? (totalWeight === 100 ? "success" : "in-progress") : "error"}
                additionalInfo={`${totalWeight}% ${t('components:teamWeights.allocated')}`}
              />
            </SpaceBetween>
          </Box>
          
          {/* Weight Inputs */}
          <Grid gridDefinition={[
            { colspan: { default: 12, xs: 6, s: 4 } },
            { colspan: { default: 12, xs: 6, s: 4 } },
            { colspan: { default: 12, xs: 6, s: 4 } }
          ]}>
            {allCategories.map((category) => {
              const categoryLower = category.toLowerCase();
              const weightEntry = Object.entries(editingWeights).find(
                ([key]) => key.toLowerCase() === categoryLower
              );
              const weightValue = weightEntry ? weightEntry[1] : '';
              
              return (
                <FormField
                  key={category}
                  label={category}
                  description={t('components:teamWeights.weightForCategory', { category })}
                >
                  <Input
                    type="text"
                    value={weightValue}
                    onChange={({ detail }) => handleWeightChange(category, detail.value)}
                    placeholder="0"
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
