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
  ExpandableSection,
  Badge
} from '@cloudscape-design/components';
import { getTeamSkills } from '../services/athenaQueryService';
import DownloadDropdownButton from './DownloadDropdownButton';

function TeamDetailsTable() {
  const { t } = useTranslation(['components', 'common']);
  const [allTeams, setAllTeams] = useState([]);
  const [filteredTeams, setFilteredTeams] = useState([]);
  const [displayedTeams, setDisplayedTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [filterColumn, setFilterColumn] = useState({ value: 'all', label: 'All columns' });
  const [sortingColumn, setSortingColumn] = useState({ sortingField: 'teamName' });
  const [sortingDescending, setSortingDescending] = useState(false);
  const [preferences, setPreferences] = useState({
    pageSize: 10,
    visibleContent: ['teamName', 'memberCount', 'totalSkills', 'categories']
  });

  // Column definitions for the table
  const columnDefinitions = [
    {
      id: 'teamName',
      header: 'Team Name',
      cell: item => item.teamName,
      sortingField: 'teamName'
    },
    {
      id: 'memberCount',
      header: 'Number of Members',
      cell: item => item.memberCount,
      sortingField: 'memberCount'
    },
    {
      id: 'totalSkills',
      header: 'Total Skills',
      cell: item => item.totalSkills,
      sortingField: 'totalSkills'
    },
    {
      id: 'categories',
      header: 'Skill Categories',
      cell: item => (
        <ExpandableSection
          headerText={`${item.categories.length} categories`}
          variant="footer"
        >
          <SpaceBetween direction="horizontal" size="xs">
            {item.categories.map((category, index) => (
              <Badge key={index} color="blue">
                {category}
              </Badge>
            ))}
          </SpaceBetween>
        </ExpandableSection>
      ),
      sortingField: 'categoriesCount'
    }
  ];

  // Download columns (same as table columns but without rendering functions)
  const downloadColumns = [
    { id: 'teamName', header: 'Team Name' },
    { id: 'memberCount', header: 'Number of Members' },
    { id: 'totalSkills', header: 'Total Skills' },
    { id: 'categories', header: 'Skill Categories' }
  ];

  // Filter column options
  const filterColumnOptions = [
    { value: 'all', label: 'All columns' },
    { value: 'teamName', label: 'Team Name' },
    { value: 'memberCount', label: 'Number of Members' },
    { value: 'totalSkills', label: 'Total Skills' },
    { value: 'categories', label: 'Skill Categories' }
  ];

  // Load and process team data
  useEffect(() => {
    const loadTeamData = async () => {
      setLoading(true);
      setError(null);
      try {
        const skillsData = await getTeamSkills();
        
        // First, get all unique categories from the entire skills inventory
        const allCategories = [...new Set(skillsData.map(skill => skill.category).filter(Boolean))].sort();
        
        // Process the data to get distinct teams with their details
        const teamMap = new Map();
        
        skillsData.forEach(skill => {
          const teamName = skill.team;
          if (!teamMap.has(teamName)) {
            teamMap.set(teamName, {
              teamName: teamName,
              memberCount: skill.members || 0, // Use the members field from the data
              skills: [],
              categories: allCategories // Show ALL categories for every team
            });
          }
          
          const team = teamMap.get(teamName);
          team.skills.push(skill.skill);
        });
        
        // Convert map to array and calculate additional metrics
        const teamsArray = Array.from(teamMap.values()).map(team => ({
          id: team.teamName, // Use team name as ID for table tracking
          teamName: team.teamName,
          memberCount: team.memberCount,
          totalSkills: team.skills.length,
          categories: team.categories, // All categories from skills inventory
          categoriesCount: team.categories.length // For sorting purposes
        }));
        
        setAllTeams(teamsArray);
        setFilteredTeams(teamsArray);
        setTotalItems(teamsArray.length);
      } catch (err) {
        console.error('Error loading team data:', err);
        setError('Failed to load team data. Please try again later.');
        setAllTeams([]);
        setFilteredTeams([]);
        setTotalItems(0);
      } finally {
        setLoading(false);
      }
    };
    
    loadTeamData();
  }, []);

  // Apply filtering and sorting whenever filter or sort parameters change
  useEffect(() => {
    // Apply filtering
    let result = [...allTeams];
    
    if (filterText) {
      if (filterColumn.value === 'all') {
        result = result.filter(item => 
          item.teamName?.toLowerCase().includes(filterText.toLowerCase()) ||
          String(item.memberCount || '').includes(filterText) ||
          String(item.totalSkills || '').includes(filterText) ||
          item.categories.some(category => 
            category.toLowerCase().includes(filterText.toLowerCase())
          )
        );
      } else if (filterColumn.value === 'categories') {
        // Special handling for categories filtering
        result = result.filter(item => 
          item.categories.some(category => 
            category.toLowerCase().includes(filterText.toLowerCase())
          )
        );
      } else if (filterColumn.value === 'memberCount' || filterColumn.value === 'totalSkills') {
        // Special handling for numeric filtering
        result = result.filter(item => 
          String(item[filterColumn.value] || '').includes(filterText)
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
        if (sortingColumn.sortingField === 'memberCount' || 
            sortingColumn.sortingField === 'totalSkills' || 
            sortingColumn.sortingField === 'categoriesCount') {
          const numA = parseFloat(valueA) || 0;
          const numB = parseFloat(valueB) || 0;
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
    
    setFilteredTeams(result);
    setTotalItems(result.length);
    
    // Reset to first page when filtering changes
    if (filterText !== '') {
      setCurrentPage(1);
    }
  }, [allTeams, filterText, filterColumn, sortingColumn, sortingDescending]);

  // Apply pagination whenever filtered data or pagination parameters change
  useEffect(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filteredTeams.length);
    setDisplayedTeams(filteredTeams.slice(startIndex, endIndex));
  }, [filteredTeams, currentPage, pageSize]);

  // Handle page change
  const handlePageChange = ({ detail }) => {
    setCurrentPage(detail.currentPageIndex);
  };

  // Handle preferences change
  const handlePreferencesChange = ({ detail }) => {
    setPreferences(detail);
    if (detail.pageSize !== pageSize) {
      setPageSize(detail.pageSize);
      setCurrentPage(1); // Reset to first page when changing page size
    }
  };

  // Handle filter change
  const handleFilterChange = ({ detail }) => {
    setFilterText(detail.filteringText);
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
      const skillsData = await getTeamSkills();
      
      // First, get all unique categories from the entire skills inventory
      const allCategories = [...new Set(skillsData.map(skill => skill.category).filter(Boolean))].sort();
      
      // Process the data to get distinct teams with their details
      const teamMap = new Map();
      
      skillsData.forEach(skill => {
        const teamName = skill.team;
        if (!teamMap.has(teamName)) {
          teamMap.set(teamName, {
            teamName: teamName,
            memberCount: skill.members || 0,
            skills: [],
            categories: allCategories // Show ALL categories for every team
          });
        }
        
        const team = teamMap.get(teamName);
        team.skills.push(skill.skill);
      });
      
      // Convert map to array and calculate additional metrics
      const teamsArray = Array.from(teamMap.values()).map(team => ({
        id: team.teamName,
        teamName: team.teamName,
        memberCount: team.memberCount,
        totalSkills: team.skills.length,
        categories: team.categories, // All categories from skills inventory
        categoriesCount: team.categories.length
      }));
      
      setAllTeams(teamsArray);
      setFilteredTeams(teamsArray);
      setTotalItems(teamsArray.length);
    } catch (err) {
      console.error('Error refreshing team data:', err);
      setError('Failed to refresh team data. Please try again later.');
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
        items={displayedTeams}
        loading={loading}
        loadingText={t('components:tables.loadingTeams')}
        selectionType="single"
        trackBy="id"
        sortingColumn={sortingColumn}
        sortingDescending={sortingDescending}
        onSortingChange={handleSortingChange}
        empty={
          <Box textAlign="center" color="inherit">
            <b>{t('components:emptyStates.noTeams')}</b>
            <Box padding={{ bottom: "s" }} variant="p" color="inherit">
              {t('components:emptyStates.noTeamsToDisplay')}
            </Box>
          </Box>
        }
        header={
          <Header
            counter={totalItems > 0 ? `(${totalItems})` : undefined}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button onClick={handleRefresh} iconName="refresh">
                  {t('components:teamDetailsTable.refresh')}
                </Button>
              </SpaceBetween>
            }
          >
            {t('components:teamDetailsTable.teams')}
          </Header>
        }
        filter={
          <SpaceBetween direction="horizontal" size="xs">
            <Select
              selectedOption={filterColumn}
              onChange={handleFilterColumnChange}
              options={filterColumnOptions}
              ariaLabel={t('components:tables.filterColumn')}
            />
            <div style={{ width: '300px' }}>
              <TextFilter
                filteringText={filterText}
                filteringPlaceholder={`Find by ${filterColumn.label.toLowerCase()}`}
                filteringAriaLabel={`Find by ${filterColumn.label.toLowerCase()}`}
                onChange={handleFilterChange}
              />
            </div>
          </SpaceBetween>
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
              title: "Page size",
              options: [
                { value: 10, label: "10 teams" },
                { value: 20, label: "20 teams" },
                { value: 50, label: "50 teams" }
              ]
            }}
            visibleContentPreference={{
              title: "Select visible columns",
              options: [
                {
                  label: "Team properties",
                  options: [
                    { id: "teamName", label: "Team Name" },
                    { id: "memberCount", label: "Number of Members" },
                    { id: "totalSkills", label: "Total Skills" },
                    { id: "categories", label: "Skill Categories" }
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
          data={allTeams.map(team => ({
            ...team,
            categories: team.categories.join(', ') // Convert array to comma-separated string for download
          }))}
          filteredData={filteredTeams.map(team => ({
            ...team,
            categories: team.categories.join(', ') // Convert array to comma-separated string for download
          }))}
          columns={downloadColumns}
          filename="team_details"
          dataType="team details dataset"
        />
      </Box>
    </>
  );
}

export default TeamDetailsTable;
