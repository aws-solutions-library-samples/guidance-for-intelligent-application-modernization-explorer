import React, { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  Table,
  Box,
  SpaceBetween,
  StatusIndicator,
  Header,
  Multiselect,
  Pagination,
  CollectionPreferences,
  Popover,
  Icon
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

/**
 * Component to display detailed information about team skill gaps
 */
const SkillGapDetails = ({ 
  teamDetails, 
  allTeamsDetails, 
  loading, 
  teamName, 
  selectedTeams: propSelectedTeams, 
  setSelectedTeams: propSetSelectedTeams, 
  setSelectedTeam: propSetSelectedTeam,
  isVision = false 
}) => {
  const { t } = useTranslation(['components', 'common']);
  // Extract unique team names from allTeamsDetails
  const teamOptions = useMemo(() => {
    if (!allTeamsDetails) return [];
    
    const uniqueTeams = [...new Set(allTeamsDetails.map(item => item.team))];
    return uniqueTeams.map(team => ({ label: team, value: team }));
  }, [allTeamsDetails]);
  
  // State for selected teams in the dropdown
  const [selectedTeams, setSelectedTeams] = useState(
    propSelectedTeams || (teamName ? [{ label: teamName, value: teamName }] : [])
  );
  
  // Pagination and preferences state with updated default columns based on analysis type
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const [preferences, setPreferences] = useState({
    pageSize: 10,
    visibleContent: isVision 
      ? ['team', 'skill', 'category', 'quadrant', 'phase', 'actual', 'expected', 'gap', 'status', 'needsUpskilling']
      : ['team', 'skill', 'category', 'actual', 'expected', 'categoryWeight', 'gap', 'status', 'needsUpskilling']
  });
  
  // Sorting state
  const [sortingColumn, setSortingColumn] = useState({ sortingField: 'team' });
  const [sortingDescending, setSortingDescending] = useState(false);
  
  // Update selected teams when props change
  React.useEffect(() => {
    if (propSelectedTeams && propSelectedTeams.length > 0) {
      setSelectedTeams(propSelectedTeams);
    } else if (teamName) {
      setSelectedTeams([{ label: teamName, value: teamName }]);
    }
  }, [propSelectedTeams, teamName]);
  
  // Filter and sort items based on selected teams and sorting preferences
  const processedItems = useMemo(() => {
    // First filter items
    let result = [];
    
    if (!allTeamsDetails || allTeamsDetails.length === 0) {
      result = teamDetails ? [...teamDetails.details] : [];
    } else if (selectedTeams.length === 0) {
      result = [...allTeamsDetails];
    } else {
      const selectedTeamValues = selectedTeams.map(team => team.value);
      result = allTeamsDetails.filter(item => selectedTeamValues.includes(item.team));
    }
    
    // Then sort items
    if (sortingColumn && sortingColumn.sortingField) {
      result.sort((a, b) => {
        const fieldA = a[sortingColumn.sortingField];
        const fieldB = b[sortingColumn.sortingField];
        
        // Handle numeric sorting
        if (typeof fieldA === 'number' && typeof fieldB === 'number') {
          return sortingDescending ? fieldB - fieldA : fieldA - fieldB;
        }
        
        // Handle string sorting
        const stringA = String(fieldA || '').toLowerCase();
        const stringB = String(fieldB || '').toLowerCase();
        
        return sortingDescending 
          ? stringB.localeCompare(stringA) 
          : stringA.localeCompare(stringB);
      });
    }
    
    return result;
  }, [allTeamsDetails, teamDetails, selectedTeams, sortingColumn, sortingDescending]);

  // Define column definitions with updated field names and vision-specific fields
  const columnDefinitions = [
    {
      id: 'team',
      header: t('components:skillGapDetails.team'),
      cell: item => {
        // Check both expected and required fields for backward compatibility
        const expectedValue = item.expected !== undefined ? item.expected : item.required;
        const hasNoTeamWeights = expectedValue === null || expectedValue === undefined || expectedValue === 'N/A' || Number.isNaN(expectedValue);
        
        if (hasNoTeamWeights) {
          return (
            <Popover
              dismissButton={false}
              position="top"
              size="small"
              triggerType="custom"
              content={
                <Box padding="s">
                  <SpaceBetween size="xs">
                    <Box variant="strong">Team weights not configured</Box>
                    <Box variant="p">
                      This team has not configured category weights. Configure weights to calculate expected proficiency levels and skill gaps.
                    </Box>
                  </SpaceBetween>
                </Box>
              }
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', color: 'var(--color-text-status-warning)' }}>
                <Icon name="status-warning" size="small" />
                <span>{item.team}</span>
              </span>
            </Popover>
          );
        }
        return item.team;
      },
      sortingField: 'team',
      width: 150
    },
    {
      id: 'skill',
      header: t('components:skillGapDetails.skill'),
      cell: item => item.skill,
      sortingField: 'skill',
      width: 150
    },
    {
      id: 'category',
      header: t('components:skillGapDetails.category'),
      cell: item => item.category,
      sortingField: 'category',
      width: 120
    },
    // Vision-specific columns (only show for vision analysis)
    ...(isVision ? [
      {
        id: 'quadrant',
        header: t('components:skillGapDetails.quadrant'),
        cell: item => item.quadrant || '-',
        sortingField: 'quadrant',
        width: 120
      },
      {
        id: 'phase',
        header: t('components:skillGapDetails.phase'),
        cell: item => {
          const phase = item.phase;
          switch (phase) {
            case 'Adopt':
              return <StatusIndicator type="success">{t('components:skillGapDetails.adopt')}</StatusIndicator>;
            case 'Trial':
              return <StatusIndicator type="info">{t('components:skillGapDetails.trial')}</StatusIndicator>;
            case 'Assess':
              return <StatusIndicator type="warning">{t('components:skillGapDetails.assess')}</StatusIndicator>;
            case 'Hold':
              return <StatusIndicator type="error">{t('components:skillGapDetails.hold')}</StatusIndicator>;
            default:
              return phase || '-';
          }
        },
        sortingField: 'phase',
        width: 100
      }
    ] : []),
    {
      id: 'actual',
      header: t('components:skillGapDetails.actualLevel'),
      cell: item => item.actual,
      sortingField: 'actual',
      width: 100
    },
    {
      id: 'expected',
      header: isVision ? t('components:skillGapDetails.visionExpected') : t('components:skillGapDetails.expectedLevel'),
      cell: item => {
        const expected = item.expected || item.required;
        return expected !== null && expected !== undefined ? expected : 'N/A';
      },
      sortingField: 'expected',
      width: 120
    },
    // Only show category weight for non-vision analysis
    ...(!isVision ? [
      {
        id: 'categoryWeight',
        header: t('components:skillGapDetails.categoryWeight'),
        cell: item => {
          // Check both expected and required fields for backward compatibility
          const expectedValue = item.expected !== undefined ? item.expected : item.required;
          const hasNoTeamWeights = expectedValue === null || expectedValue === undefined || expectedValue === 'N/A' || Number.isNaN(expectedValue);
          
          if (hasNoTeamWeights) {
            return 'N/A';
          }
          return item.categoryWeight ? `${item.categoryWeight}%` : '0%';
        },
        sortingField: 'categoryWeight',
        width: 120
      }
    ] : []),
    {
      id: 'gap',
      header: isVision ? t('components:skillGapDetails.visionGap') : t('components:skillGapDetails.gap'),
      cell: item => {
        const gap = item.gap;
        if (gap === null || gap === undefined) {
          return 'N/A';
        } else if (gap === 0) {
          return <StatusIndicator type="success">0</StatusIndicator>;
        } else if (gap > 0) {
          return <StatusIndicator type="error">{`+${gap}`}</StatusIndicator>;
        } else {
          return <StatusIndicator type="info">{gap}</StatusIndicator>;
        }
      },
      sortingField: 'gap',
      width: 80
    },
    {
      id: 'status',
      header: t('components:skillGapDetails.gapSeverity'),
      cell: item => {
        // Handle both old and new status values
        const status = item.status;
        if (status === null || status === undefined) {
          return <StatusIndicator>N/A</StatusIndicator>;
        }
        switch (status) {
          case 'Critical':
            return <StatusIndicator type="error">{t('components:skillGapDetails.critical')}</StatusIndicator>;
          case 'High':
            return <StatusIndicator type="warning">{t('components:skillGapDetails.high')}</StatusIndicator>;
          case 'Medium':
            return <StatusIndicator type="info">{t('components:skillGapDetails.medium')}</StatusIndicator>;
          case 'Low':
            return <StatusIndicator type="success">{t('components:skillGapDetails.low')}</StatusIndicator>;
          case 'Aligned':
            return <StatusIndicator type="success">{t('components:skillGapDetails.aligned')}</StatusIndicator>;
          case 'Exceeds':
            return <StatusIndicator type="info">{t('components:skillGapDetails.exceeds')}</StatusIndicator>;
          // Backward compatibility with old status values
          case 'Needs Improvement':
            return <StatusIndicator type="warning">{t('components:skillGapDetails.needsImprovement')}</StatusIndicator>;
          default:
            return <StatusIndicator>{status}</StatusIndicator>;
        }
      },
      sortingField: 'status',
      width: 150
    },
    {
      id: 'needsUpskilling',
      header: isVision ? t('components:skillGapDetails.strategicTraining') : t('components:skillGapDetails.upskillingRequired'),
      cell: item => {
        const needsUpskilling = item.needsUpskilling;
        if (needsUpskilling === null || needsUpskilling === undefined) {
          return <StatusIndicator>N/A</StatusIndicator>;
        }
        // For vision analysis, use different threshold
        const calculatedNeed = needsUpskilling || (item.gap !== null && item.gap > (isVision ? 1.0 : 0.5));
        return calculatedNeed ? 
          <StatusIndicator type="warning">{t('common:yes')}</StatusIndicator> : 
          <StatusIndicator type="success">{t('common:no')}</StatusIndicator>;
      },
      sortingField: 'needsUpskilling',
      width: 130
    }
  ];

  // Handle clearing all team filters
  const handleClearAll = () => {
    setSelectedTeams([]);
    if (propSetSelectedTeams) {
      propSetSelectedTeams([]);
    }
    if (propSetSelectedTeam) {
      propSetSelectedTeam(null);
    }
  };
  
  // Handle preferences change
  const handlePreferencesChange = ({ detail }) => {
    setPreferences(detail);
    if (detail.pageSize !== preferences.pageSize) {
      setCurrentPageIndex(1); // Reset to first page when changing page size
    }
  };
  
  // Handle sorting change
  const handleSortingChange = ({ detail }) => {
    setSortingColumn(detail.sortingColumn);
    setSortingDescending(detail.isDescending);
  };
  
  // Calculate pagination values
  const pageSize = preferences.pageSize;
  const totalItemCount = processedItems.length;
  const pagesCount = Math.ceil(totalItemCount / pageSize);
  const startIndex = (currentPageIndex - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItemCount);
  const paginatedItems = processedItems.slice(startIndex, endIndex);

  return (
    <Box padding="l">
      <SpaceBetween size="l">
        <Header variant="h2">
          {t('components:skillGapDetails.teamSkillDetails')}
        </Header>
        
        <div style={{ width: '300px' }}>
          <Multiselect
            selectedOptions={selectedTeams}
            onChange={({ detail }) => {
              setSelectedTeams(detail.selectedOptions);
              // Update parent component state
              if (propSetSelectedTeams) {
                propSetSelectedTeams(detail.selectedOptions);
              }
              
              // If a single team is selected, update the selectedTeam state in parent
              if (detail.selectedOptions.length === 1 && propSetSelectedTeam) {
                propSetSelectedTeam(detail.selectedOptions[0].value);
              } else if (detail.selectedOptions.length === 0 && propSetSelectedTeam) {
                propSetSelectedTeam(null);
              }
            }}
            options={teamOptions}
            placeholder={t('components:skillGapDetails.selectTeams')}
            filteringType="auto"
            deselectAriaLabel={option => t('components:skillGapDetails.removeTeam', { team: option.label })}
            tokenLimit={3}
            i18nStrings={{
              limitShowMore: t('components:skillGapDetails.showMore'),
              limitShowFewer: t('components:skillGapDetails.showFewer')
            }}
            showClearFilter={selectedTeams.length > 0}
            onClearFilter={handleClearAll}
          />
        </div>
        
        <Table
          columnDefinitions={columnDefinitions}
          items={paginatedItems}
          loading={loading}
          loadingText={t('components:skillGapDetails.loadingSkillDetails')}
          sortingColumn={sortingColumn}
          sortingDescending={sortingDescending}
          onSortingChange={handleSortingChange}
          variant="embedded"
          stickyHeader={true}
          empty={
            <Box textAlign="center" color="inherit">
              <b>{t('components:skillGapDetails.noDataAvailable')}</b>
              <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                {t('components:skillGapDetails.noMatchingSkills')}
              </Box>
            </Box>
          }
          pagination={
            <Pagination
              currentPageIndex={currentPageIndex}
              onChange={({ detail }) => setCurrentPageIndex(detail.currentPageIndex)}
              pagesCount={pagesCount}
              ariaLabels={{
                nextPageLabel: t('common:nextPage'),
                previousPageLabel: t('common:previousPage'),
                pageLabel: pageNumber => t('common:pageLabel', { pageNumber })
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
                  { value: 10, label: t('components:skillGapDetails.tenItems') },
                  { value: 20, label: t('components:skillGapDetails.twentyItems') },
                  { value: 50, label: t('components:skillGapDetails.fiftyItems') },
                  { value: 100, label: t('components:skillGapDetails.hundredItems') }
                ]
              }}
              visibleContentPreference={{
                title: t('common:selectVisibleColumns'),
                options: [
                  {
                    label: t('components:skillGapDetails.skillProperties'),
                    options: [
                      { id: "team", label: t('components:skillGapDetails.team') },
                      { id: "skill", label: t('components:skillGapDetails.skill') },
                      { id: "category", label: t('components:skillGapDetails.category') },
                      // Vision-specific columns
                      ...(isVision ? [
                        { id: "quadrant", label: t('components:skillGapDetails.quadrant') },
                        { id: "phase", label: t('components:skillGapDetails.phase') }
                      ] : []),
                      { id: "actual", label: t('components:skillGapDetails.actualLevel') },
                      { id: "expected", label: isVision ? t('components:skillGapDetails.visionExpected') : t('components:skillGapDetails.expectedLevel') },
                      // Regular skill gap specific columns
                      ...(!isVision ? [
                        { id: "categoryWeight", label: t('components:skillGapDetails.categoryWeight') }
                      ] : []),
                      { id: "gap", label: isVision ? t('components:skillGapDetails.visionGap') : t('components:skillGapDetails.gap') },
                      { id: "status", label: t('components:skillGapDetails.gapSeverity') },
                      { id: "needsUpskilling", label: isVision ? t('components:skillGapDetails.strategicTraining') : t('components:skillGapDetails.upskillingRequired') }
                    ]
                  }
                ]
              }}
              onConfirm={handlePreferencesChange}
            />
          }
          visibleColumns={preferences.visibleContent}
        />
      </SpaceBetween>
    </Box>
  );
};

SkillGapDetails.propTypes = {
  teamDetails: PropTypes.shape({
    team: PropTypes.string.isRequired,
    details: PropTypes.arrayOf(
      PropTypes.shape({
        skill: PropTypes.string.isRequired,
        category: PropTypes.string.isRequired,
        actual: PropTypes.number.isRequired,
        expected: PropTypes.number, // New field name
        required: PropTypes.number, // Backward compatibility
        gap: PropTypes.number.isRequired,
        status: PropTypes.string.isRequired, // Now includes Critical, High, Medium, Low, Aligned, Exceeds
        needsUpskilling: PropTypes.bool, // New field
        categoryWeight: PropTypes.number, // New field (regular skills only)
        // Vision-specific fields
        quadrant: PropTypes.string, // Technology quadrant
        phase: PropTypes.string // Technology phase (Adopt, Trial, Assess, Hold)
      })
    ).isRequired
  }),
  allTeamsDetails: PropTypes.arrayOf(
    PropTypes.shape({
      team: PropTypes.string.isRequired,
      skill: PropTypes.string.isRequired,
      category: PropTypes.string.isRequired,
      actual: PropTypes.number.isRequired,
      expected: PropTypes.number, // New field name
      required: PropTypes.number, // Backward compatibility
      gap: PropTypes.number.isRequired,
      status: PropTypes.string.isRequired, // Now includes Critical, High, Medium, Low, Aligned, Exceeds
      needsUpskilling: PropTypes.bool, // New field
      categoryWeight: PropTypes.number, // New field (regular skills only)
      // Vision-specific fields
      quadrant: PropTypes.string, // Technology quadrant
      phase: PropTypes.string // Technology phase (Adopt, Trial, Assess, Hold)
    })
  ),
  loading: PropTypes.bool,
  teamName: PropTypes.string,
  selectedTeams: PropTypes.array,
  setSelectedTeams: PropTypes.func,
  setSelectedTeam: PropTypes.func,
  isVision: PropTypes.bool
};

export default SkillGapDetails;
