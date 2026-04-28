import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Container,
  Header,
  Table,
  Box,
  Button,
  SpaceBetween,
  Pagination,
  TextFilter,
  CollectionPreferences,
  Modal,
  FormField,
  Input,
  Icon,
  Popover,
  StatusIndicator,
  Alert,
  Badge,
  Select,
  ColumnLayout
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import { getProjects, createProject, deleteProject } from '../services/projectsApi';
import ShareProjectModal from '../components/ShareProjectModal';
import StackStatusModal from '../components/modals/StackStatusModal';
import ProjectStatusInfo from '../components/info/ProjectStatusInfo';
import Layout from '../layouts/AppLayout';
import AuthenticatedTopNav from '../components/auth/AuthenticatedTopNav';
import { useSimpleAuth } from '../contexts/SimpleAuthContext';
import useProjectPermissions from '../hooks/useProjectPermissions';

const ProjectsListPage = () => {
  const { t } = useTranslation(['pages', 'common']);
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filteredProjects, setFilteredProjects] = useState([]);
  const [filterText, setFilterText] = useState('');
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectNotes, setNewProjectNotes] = useState('');
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [selectedProjectForSharing, setSelectedProjectForSharing] = useState(null);
  const [stackModalVisible, setStackModalVisible] = useState(false);
  const [projectWithStack, setProjectWithStack] = useState(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState(''); // Separate error state for create modal
  const [statusFilter, setStatusFilter] = useState({ label: 'All Statuses', value: '' });
  const [preferences, setPreferences] = useState({
    pageSize: 10,
    visibleContent: ['name', 'createdBy', 'createdDate', 'sharedUsers', 'actions']
  });

  const { user } = useSimpleAuth();

  // Component for project action buttons with permission checking
  const ProjectActionButtons = ({ project }) => {
    const { hasWriteAccess, loading: permissionsLoading } = useProjectPermissions(project.projectId);
    
    // Determine if project can be deleted based on status
    const canDelete = ['active', 'failed', 'failed-to-provision', 'failed-to-delete', 'failed-with-stack'].includes(project.status);
    const deleteTooltip = canDelete 
      ? (hasWriteAccess ? t('pages:projectsList.deleteProject', { name: project.name }) : t('pages:projectsList.noDeletePermission'))
      : t('pages:projectsList.cannotDeleteStatus', { status: project.status });

    // Check if user can share (only project owners should be able to manage sharing)
    const userId = user?.userId || user?.username || user?.attributes?.email;
    const isProjectOwner = project.createdBy === userId || 
                          (user?.attributes?.email && user.attributes.email === project.createdByName) ||
                          (project.createdById && project.createdById === userId);
    
    const canShare = isProjectOwner;
    const shareTooltip = canShare 
      ? t('pages:projectsList.shareProject', { name: project.name })
      : t('pages:projectsList.onlyOwnersCanShare');

    return (
      <SpaceBetween direction="horizontal" size="xs">
        {project.notes && (
          <Popover
            dismissButton={false}
            position="top"
            size="medium"
            triggerType="custom"
            content={
              <Box padding="s">
                <Box variant="strong">{t('pages:projectsList.projectNotes')}</Box>
                <Box padding={{ top: 'xs' }}>
                  {project.notes}
                </Box>
              </Box>
            }
          >
            <Button
              variant="icon"
              iconName="status-info"
              ariaLabel={`${t('pages:projectsList.viewNotesFor')} ${project.name}`}
            />
          </Popover>
        )}
        
        {/* Share Button */}
        {canShare ? (
          <Button
            variant="icon"
            iconName="share"
            onClick={() => handleShareProject(project)}
            ariaLabel={shareTooltip}
            disabled={permissionsLoading}
          />
        ) : (
          <Popover
            dismissButton={false}
            position="top"
            size="medium"
            triggerType="custom"
            content={
              <Box padding="s">
                <Box variant="strong">{t('pages:projectsList.cannotShareProject')}</Box>
                <Box padding={{ top: 'xs' }}>
                  {shareTooltip}
                </Box>
              </Box>
            }
          >
            <Button
              variant="icon"
              iconName="share"
              disabled={true}
              ariaLabel={shareTooltip}
            />
          </Popover>
        )}
        
        {/* Delete Button */}
        {canDelete && hasWriteAccess ? (
          <Button
            variant="icon"
            iconName="remove"
            onClick={() => setProjectToDelete(project)}
            ariaLabel={deleteTooltip}
            disabled={permissionsLoading}
          />
        ) : (
          <Popover
            dismissButton={false}
            position="top"
            size="medium"
            triggerType="custom"
            content={
              <Box padding="s">
                <Box variant="strong">{t('pages:projectsList.cannotDeleteProject')}</Box>
                <Box padding={{ top: 'xs' }}>
                  {!canDelete 
                    ? t('pages:projectsList.canOnlyDeleteActiveOrFailed')
                    : t('pages:projectsList.noWritePermissions')
                  }
                </Box>
                <Box padding={{ top: 'xs' }}>
                  {!canDelete && (
                    <>{t('pages:projectsList.currentStatus')} <Badge color="grey">{project.status}</Badge></>
                  )}
                </Box>
              </Box>
            }
          >
            <Button
              variant="icon"
              iconName="remove"
              disabled={true}
              ariaLabel={deleteTooltip}
            />
          </Popover>
        )}
      </SpaceBetween>
    );
  };

  // State for refreshing projects list
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  
  // State for status message from navigation
  const [statusMessage, setStatusMessage] = useState(null);

  // Check for status message in location state
  useEffect(() => {
    if (location.state?.message) {
      setStatusMessage({
        message: location.state.message,
        severity: location.state.severity || 'info',
        projectId: location.state.projectId
      });
      
      // If there's a projectId in the state, set the status filter to show that project's status
      if (location.state.projectId && projects.length > 0) {
        const project = projects.find(p => p.projectId === location.state.projectId);
        if (project) {
          setStatusFilter({ label: `Status: ${project.status}`, value: project.status });
        }
      }
      
      // Clear the location state to prevent showing the message again on refresh
      navigate(location.pathname, { replace: true });
    }
  }, [location, navigate, projects]);

  // Handle project updated (called when sharing modal is closed with changes)
  const handleProjectUpdated = () => {
    console.log('Project sharing updated, refreshing projects list');
    
    // Call loadProjects directly to ensure immediate refresh
    loadProjects();
    
    // Also update the trigger for the useEffect
    setRefreshTrigger(prev => prev + 1);
  };

  // Load projects on component mount and when refresh is triggered
  useEffect(() => {
    console.log('Projects useEffect triggered, refreshTrigger:', refreshTrigger);
    loadProjects();
  }, [refreshTrigger]);

  // Filter projects when search text or status filter changes
  useEffect(() => {
    filterProjects();
  }, [projects, filterText, statusFilter]);

  // Monitor for projects with "failed-with-stack" status to show stack modal
  useEffect(() => {
    const projectWithStackInfo = projects.find(p => p.status === 'failed-with-stack' && p.stackInfo);
    if (projectWithStackInfo && !stackModalVisible) {
      console.log('Found project with stack info, showing modal:', projectWithStackInfo);
      setProjectWithStack(projectWithStackInfo);
      setStackModalVisible(true);
    }
  }, [projects, stackModalVisible]);

  // Auto-refresh projects to show status changes
  // Refresh more frequently when there are projects in transitional states
  useEffect(() => {
    // Check if any projects are in transitional states
    const hasTransitionalProjects = projects.some(project => 
      ['deleting', 'provisioning', 'pending'].includes(project.status)
    );
    
    // Use shorter interval for transitional states, longer for stable states
    const refreshInterval = hasTransitionalProjects ? 5000 : 15000; // 5s vs 15s
    
    const interval = setInterval(() => {
      // Only auto-refresh if we're not currently loading
      if (!loading) {
        console.log(`🔄 Auto-refreshing projects (${hasTransitionalProjects ? 'fast' : 'normal'} mode)...`);
        loadProjects();
      }
    }, refreshInterval);

    // Cleanup interval on component unmount
    return () => clearInterval(interval);
  }, [loading, projects]); // Re-setup interval when projects change to adjust refresh rate

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError('');
      console.log('🔄 Loading projects from DynamoDB... (timestamp:', new Date().toISOString(), ')');
      
      const projectsData = await getProjects();
      console.log('✅ Projects loaded:', projectsData.length, 'projects');
      console.log('Projects data:', projectsData);
      
      setProjects(projectsData);
      setLastRefreshTime(new Date());
    } catch (error) {
      console.error('❌ Error loading projects:', error);
      setError(`${t('pages:projectsList.failedToLoadProjects')} ${error.message}`);
      setProjects([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  const filterProjects = () => {
    let filtered = projects;

    // Apply text filter
    if (filterText.trim()) {
      const searchText = filterText.toLowerCase();
      filtered = filtered.filter(project => (
        project.name.toLowerCase().includes(searchText) ||
        project.createdBy.toLowerCase().includes(searchText) ||
        project.createdByName?.toLowerCase().includes(searchText) ||
        project.notes?.toLowerCase().includes(searchText)
      ));
    }

    // Apply status filter
    if (statusFilter.value) {
      filtered = filtered.filter(project => project.status === statusFilter.value);
    }

    setFilteredProjects(filtered);
    setCurrentPageIndex(1); // Reset to first page when filtering
  };

  // Calculate summary statistics
  const totalProjects = projects.length;
  const deletableProjects = projects.filter(p => ['active', 'failed', 'failed-to-provision', 'failed-to-delete', 'failed-with-stack'].includes(p.status)).length;
  const activeProjects = projects.filter(p => p.status === 'active').length;
  const failedProjects = projects.filter(p => ['failed', 'failed-to-provision', 'failed-to-delete', 'failed-with-stack'].includes(p.status)).length;
  const inProgressProjects = projects.filter(p => ['pending', 'provisioning', 'deleting'].includes(p.status)).length;
  // Calculate paginated projects
  const startIndex = (currentPageIndex - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedProjects = filteredProjects.slice(startIndex, endIndex);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Handle project selection
  const handleSelectProject = (project) => {
    console.log('🔄 Selecting project:', project.projectId);
    
    // Check if project is active before navigating
    if (project.status !== 'active') {
      // Set status message based on project status
      let message = '';
      let severity = 'warning';
      
      switch (project.status) {
        case 'provisioning':
          message = t('pages:projectsList.projectProvisioning', { name: project.name });
          severity = 'info';
          break;
        case 'deleting':
          message = t('pages:projectsList.projectDeleting', { name: project.name });
          severity = 'warning';
          break;
        case 'failed':
        case 'failed-to-provision':
        case 'failed-with-stack':
        case 'failed-to-delete':
          message = t('pages:projectsList.projectFailed', { name: project.name });
          severity = 'error';
          break;
        default:
          message = t('pages:projectsList.projectNotActive', { name: project.name, status: project.status });
          severity = 'warning';
      }
      
      setStatusMessage({
        message,
        severity,
        projectId: project.projectId
      });
      
      return;
    }
    
    // If project is active, proceed with navigation
    localStorage.setItem('selectedProject', JSON.stringify(project));
    navigate('/home');
  };

  // Handle project creation
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    try {
      setError('');
      setModalError(''); // Clear modal error before attempting
      console.log('🔄 Creating project:', newProjectName);
      
      const newProject = await createProject({
        name: newProjectName.trim(),
        notes: newProjectNotes.trim(),
      });

      console.log('✅ Project created:', newProject.projectId);
      
      // Add to local state
      setProjects(prev => [newProject, ...prev]);
      
      // Reset form
      setCreateModalVisible(false);
      setNewProjectName('');
      setNewProjectNotes('');
      
    } catch (error) {
      console.error('❌ Error creating project:', error);
      
      // Check if it's a duplicate name error
      if (error.isDuplicate) {
        setModalError(t('pages:projectsList.duplicateProjectName', { 
          name: newProjectName.trim(),
          defaultValue: `A project with the name "${newProjectName.trim()}" already exists. Please choose a different name.`
        }));
      } else {
        setModalError(`${t('pages:projectsList.failedToCreateProject')} ${error.message}`);
      }
    }
  };

  // Handle project deletion
  const handleDeleteProject = async () => {
    if (!projectToDelete) return;

    try {
      setError('');
      console.log('🔄 Deleting project:', projectToDelete.projectId);
      
      // First update the project status to "deleting" in local state
      setProjects(prev => prev.map(p => 
        p.projectId === projectToDelete.projectId 
          ? { ...p, status: 'deleting' }
          : p
      ));
      
      const response = await deleteProject(projectToDelete.projectId);
      
      console.log('✅ Project deletion initiated:', projectToDelete.projectId);
      setProjectToDelete(null);
      
      // Note: The project will be removed from the list when the backend
      // completes the deletion process and the periodic refresh detects it's gone
      
    } catch (error) {
      console.error('❌ Error deleting project:', error);
      
      // Check if this is a failed project with existing stack
      if (error.message && error.message.includes('stack')) {
        // This might be a case where we need to show the stack modal
        // For now, just show the error - the stack modal will be triggered
        // by the status change to "failed-with-stack"
        setError(`${t('pages:projectsList.failedToDeleteProject')} ${error.message}`);
      } else {
        // Revert the status back to original if deletion failed
        setProjects(prev => prev.map(p => 
          p.projectId === projectToDelete.projectId 
            ? { ...p, status: projectToDelete.status } // Revert to original status
            : p
        ));
        
        setError(`${t('pages:projectsList.failedToDeleteProject')} ${error.message}`);
      }
    }
  };

  // Handle stack modal confirmation (delete project anyway)
  const handleConfirmDeleteWithStack = async () => {
    if (!projectWithStack) return;

    try {
      setError('');
      console.log('🔄 Force deleting project with stack:', projectWithStack.projectId);
      
      // Update status to deleting
      setProjects(prev => prev.map(p => 
        p.projectId === projectWithStack.projectId 
          ? { ...p, status: 'deleting' }
          : p
      ));
      
      // Force delete the project (this will delete the record even with existing stack)
      await deleteProject(projectWithStack.projectId, { force: true });
      
      console.log('✅ Project force deletion initiated:', projectWithStack.projectId);
      
      // Close modals
      setStackModalVisible(false);
      setProjectWithStack(null);
      
    } catch (error) {
      console.error('❌ Error force deleting project:', error);
      
      // Revert the status back to failed-with-stack
      setProjects(prev => prev.map(p => 
        p.projectId === projectWithStack.projectId 
          ? { ...p, status: 'failed-with-stack' }
          : p
      ));
      
      setError(`${t('pages:projectsList.failedToDeleteProject')} ${error.message}`);
    }
  };

  // Handle share project
  const handleShareProject = (project) => {
    if (!project || !project.projectId) {
      console.error('Invalid project:', project);
      setError(t('pages:projectsList.cannotShareInvalidProject'));
      return;
    }
    
    console.log('Opening share modal for project:', project);
    setSelectedProjectForSharing(project);
    setShareModalVisible(true);
  };

  const columnDefinitions = [
    {
      id: 'name',
      header: t('pages:projectsList.projectName'),
      cell: item => {
        const isActive = item.status === 'active';
        
        return (
          <Box>
            <Button
              variant="link"
              onClick={() => handleSelectProject(item)}
              disabled={!isActive}
            >
              {item.name}
            </Button>
            {!isActive && (
              <Popover
                dismissButton={false}
                position="right"
                size="medium"
                triggerType="custom"
                content={
                  <Box padding="s">
                    <Box variant="strong">{t('pages:projectsList.projectNotAccessible')}</Box>
                    <Box padding={{ top: 'xs' }}>
                      {t('pages:projectsList.projectNotActiveMessage')}
                    </Box>
                    <Box padding={{ top: 'xs' }}>
                      {t('pages:projectsList.currentStatus')} <Badge color="grey">{item.status}</Badge>
                    </Box>
                  </Box>
                }
              >
                <Box color="text-status-inactive" fontSize="body-s" padding={{ top: 'xxs' }}>
                  <Icon name="status-warning" size="small" /> {t('pages:projectsList.notAccessible')}
                </Box>
              </Popover>
            )}
          </Box>
        );
      },
      sortingField: 'name'
    },
    {
      id: 'createdBy',
      header: t('pages:projectsList.createdBy'),
      cell: item => item.createdByName || item.createdBy,
      sortingField: 'createdByName'
    },
    {
      id: 'createdDate',
      header: t('pages:projectsList.createdDate'),
      cell: item => formatDate(item.createdDate),
      sortingField: 'createdDate'
    },
    {
      id: 'sharedUsers',
      header: t('pages:projectsList.sharing'),
      cell: item => {
        const sharedCount = item.sharedUsers?.length || 0;
        const isPrivate = sharedCount === 0;
        
        return (
          <Popover
            dismissButton={false}
            position="top"
            size="large"
            triggerType="custom"
            content={
              <Box padding="s">
                <SpaceBetween size="xs">
                  <Box variant="strong">
                    {isPrivate ? t('pages:projectsList.notShared') : t('pages:projectsList.sharedWith')}
                  </Box>
                  {!isPrivate && (
                    <Box>
                      {item.sharedUsers.map((user, index) => (
                        <div key={index} style={{ padding: '4px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {user.email || `${user.firstName} ${user.lastName}`}
                          </span>
                          <span style={{ flexShrink: 0 }}>
                            <Icon 
                              name={user.shareMode === 'read-write' ? "unlocked" : "lock-private"} 
                              size="small" 
                              variant="subtle" 
                            />
                          </span>
                        </div>
                      ))}
                    </Box>
                  )}
                  {isPrivate && (
                    <Box color="text-body-secondary">
                      {t('pages:projectsList.onlyYouHaveAccess')}
                    </Box>
                  )}
                </SpaceBetween>
              </Box>
            }
          >
            <Box display="flex" alignItems="center" style={{ cursor: 'pointer' }}>
              <Icon
                name={isPrivate ? "lock-private" : "user-profile"}
                size="small"
                variant="subtle"
              />
              <span style={{ marginLeft: '8px' }}>
                {isPrivate ? t('pages:projectsList.private') : t('pages:projectsList.usersCount', { count: sharedCount })}
              </span>
            </Box>
          </Popover>
        );
      },
      sortingField: 'sharedUsers'
    },
    {
      id: 'status',
      header: t('pages:projectsList.status'),
      cell: item => {
        const status = item.status || 'pending';
        let statusIcon = 'status-pending';
        let statusText = 'Pending';
        let statusColor = 'text-status-info';
        
        switch (status) {
          case 'provisioned':
          case 'active':  // Handle both 'provisioned' and 'active' status
            statusIcon = 'status-positive';
            statusText = t('pages:projectsList.statusActive');
            statusColor = 'text-status-success';
            break;
          case 'provisioning':
            statusIcon = 'status-in-progress';
            statusText = t('pages:projectsList.statusProvisioning');
            statusColor = 'text-status-info';
            break;
          case 'deleting':
            statusIcon = 'status-in-progress';
            statusText = t('pages:projectsList.statusDeleting');
            statusColor = 'text-status-warning';
            break;
          case 'failed':
            statusIcon = 'status-negative';
            statusText = t('pages:projectsList.statusFailed');
            statusColor = 'text-status-error';
            break;
          case 'failed-to-provision':
            statusIcon = 'status-negative';
            statusText = t('pages:projectsList.statusFailedToProvision');
            statusColor = 'text-status-error';
            break;
          case 'failed-to-delete':
            statusIcon = 'status-negative';
            statusText = t('pages:projectsList.statusFailedToDelete');
            statusColor = 'text-status-error';
            break;
          case 'failed-with-stack':
            statusIcon = 'status-warning';
            statusText = t('pages:projectsList.statusFailedWithStack');
            statusColor = 'text-status-warning';
            break;
          case 'pending':
          default:
            statusIcon = 'status-pending';
            statusText = t('pages:projectsList.statusPending');
            statusColor = 'text-status-warning';
            break;
        }
        
        return (
          <Box display="flex" alignItems="center">
            <Icon
              name={statusIcon}
              size="small"
              variant="subtle"
            />
            <span style={{ marginLeft: '8px', color: `var(--${statusColor})` }}>
              {statusText}
            </span>
          </Box>
        );
      },
      sortingField: 'status'
    },
    {
      id: 'actions',
      header: t('pages:projectsList.actions'),
      cell: item => <ProjectActionButtons project={item} />
    }
  ];

  return (
    <Layout
      activeHref="/projects"
      toolsOpen={toolsOpen}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
      infoContent={
        <Box padding="l">
          <ProjectStatusInfo />
        </Box>
      }
    >
      <Container>
        <SpaceBetween size="l">
          {error && (
            <Alert
              type="error"
              dismissible
              onDismiss={() => setError('')}
              header={t('pages:projectsList.error')}
            >
              {error}
            </Alert>
          )}
          
          {statusMessage && (
            <Alert
              type={statusMessage.severity}
              dismissible
              onDismiss={() => setStatusMessage(null)}
              header={statusMessage.severity === 'error' ? t('pages:projectsList.error') : 
                     statusMessage.severity === 'warning' ? t('pages:projectsList.warning') : 
                     statusMessage.severity === 'success' ? t('pages:projectsList.success') : t('pages:projectsList.information')}
            >
              {statusMessage.message}
            </Alert>
          )}
          
          <Header
            variant="h1"
            description={
              <SpaceBetween size="xs">
                <Box>{t('pages:projectsList.selectExistingOrCreate')}</Box>
                {totalProjects > 0 && (
                  <Box color="text-body-secondary" fontSize="body-s">
                    {t('pages:projectsList.projectStats', { 
                      total: totalProjects, 
                      active: activeProjects, 
                      failed: failedProjects, 
                      inProgress: inProgressProjects, 
                      deletable: deletableProjects 
                    })}
                  </Box>
                )}
              </SpaceBetween>
            }
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button 
                  variant="normal"
                  iconName="refresh"
                  onClick={() => {
                    console.log('🔄 Manual refresh triggered');
                    loadProjects();
                  }}
                  disabled={loading}
                >
                  {t('common:buttons.refresh')}
                </Button>
                <Button 
                  variant="primary" 
                  onClick={() => setCreateModalVisible(true)}
                  disabled={loading}
                >
                  {t('pages:projectsList.createProject')}
                </Button>
              </SpaceBetween>
            }
          >
            {t('pages:projectsList.appModExProjects')}
          </Header>

          <Table
            columnDefinitions={columnDefinitions}
            items={paginatedProjects}
            loading={loading}
            loadingText={t('pages:projectsList.loadingProjects')}
            sortingDisabled
            empty={
              <Box textAlign="center" padding="l">
                <b>{t('pages:projectsList.noProjects')}</b>
                <Box padding={{ top: 's' }}>
                  {filterText ? t('pages:projectsList.noProjectsMatchFilter') : t('pages:projectsList.createFirstProject')}
                </Box>
              </Box>
            }
            filter={
              <SpaceBetween size="s">
                <ColumnLayout columns={2}>
                  <TextFilter
                    filteringText={filterText}
                    filteringPlaceholder={t('pages:projectsList.findProjects')}
                    filteringAriaLabel={t('pages:projectsList.filterProjects')}
                    onChange={({ detail }) => setFilterText(detail.filteringText)}
                  />
                  <Select
                    selectedOption={statusFilter}
                    onChange={({ detail }) => setStatusFilter(detail.selectedOption)}
                    options={[
                      { label: t('pages:projectsList.allStatuses'), value: '' },
                      { label: t('pages:projectsList.statusPending'), value: 'pending' },
                      { label: t('pages:projectsList.statusProvisioning'), value: 'provisioning' },
                      { label: t('pages:projectsList.statusActive'), value: 'active' },
                      { label: t('pages:projectsList.statusFailed'), value: 'failed' },
                      { label: t('pages:projectsList.statusFailedToProvision'), value: 'failed-to-provision' },
                      { label: t('pages:projectsList.statusFailedToDelete'), value: 'failed-to-delete' },
                      { label: t('pages:projectsList.statusFailedWithStack'), value: 'failed-with-stack' },
                      { label: t('pages:projectsList.statusDeleting'), value: 'deleting' }
                    ]}
                    placeholder={t('pages:projectsList.filterByStatus')}
                    expandToViewport
                  />
                </ColumnLayout>
              </SpaceBetween>
            }
            header={
              <Header
                counter={`(${filteredProjects.length})`}
                description={lastRefreshTime ? t('pages:projectsList.lastUpdated', { time: lastRefreshTime.toLocaleTimeString() }) : ''}
                info={
                  <Box color="text-body-secondary" fontSize="body-s">
                    {t('pages:projectsList.onlyActiveOrFailedCanBeDeleted')}
                  </Box>
                }
              >
                {t('pages:projectsList.projects')}
              </Header>
            }
            pagination={
              <Pagination
                currentPageIndex={currentPageIndex}
                pagesCount={Math.ceil(filteredProjects.length / pageSize)}
                onChange={({ detail }) => setCurrentPageIndex(detail.currentPageIndex)}
              />
            }
            preferences={
              <CollectionPreferences
                title={t('common:general.preferences')}
                confirmLabel={t('common:general.confirm')}
                cancelLabel={t('common:general.cancel')}
                preferences={preferences}
                onConfirm={({ detail }) => setPreferences(detail)}
                pageSizePreference={{
                  title: t('common:general.pageSize'),
                  options: [
                    { value: 10, label: t('pages:projectsList.tenProjects') },
                    { value: 20, label: t('pages:projectsList.twentyProjects') },
                    { value: 50, label: t('pages:projectsList.fiftyProjects') }
                  ]
                }}
                visibleContentPreference={{
                  title: t('common:general.selectVisibleColumns'),
                  options: [
                    {
                      label: t('pages:projectsList.projectProperties'),
                      options: [
                        { id: "name", label: t('pages:projectsList.projectName') },
                        { id: "createdBy", label: t('pages:projectsList.createdBy') },
                        { id: "createdDate", label: t('pages:projectsList.createdDate') },
                        { id: "sharedUsers", label: t('pages:projectsList.sharing') },
                        { id: "actions", label: t('pages:projectsList.actions') }
                      ]
                    }
                  ]
                }}
              />
            }
          />
        </SpaceBetween>
      </Container>

      {/* Create Project Modal */}
      <Modal
        visible={isCreateModalVisible}
        onDismiss={() => {
          setCreateModalVisible(false);
          setModalError(''); // Clear modal error when modal is dismissed
          setNewProjectName(''); // Clear project name
          setNewProjectNotes(''); // Clear project notes
        }}
        header={t('pages:projectsList.createNewProject')}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => {
                setCreateModalVisible(false);
                setModalError(''); // Clear modal error when cancelled
                setNewProjectName(''); // Clear project name
                setNewProjectNotes(''); // Clear project notes
              }}>
                {t('common:buttons.cancel')}
              </Button>
              <Button variant="primary" onClick={handleCreateProject} disabled={!newProjectName.trim()}>
                {t('common:buttons.create')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="l">
          {modalError && (
            <Alert type="error" dismissible onDismiss={() => setModalError('')}>
              {modalError}
            </Alert>
          )}
          <FormField label={t('pages:projectsList.projectName')} errorText={!newProjectName.trim() && t('pages:projectsList.projectNameRequired')}>
            <Input
              value={newProjectName}
              onChange={({ detail }) => {
                setNewProjectName(detail.value);
                setModalError(''); // Clear error when user changes the project name
              }}
              placeholder={t('pages:projectsList.enterProjectName')}
            />
          </FormField>
          <FormField label={t('pages:projectsList.notesOptional')}>
            <Input
              value={newProjectNotes}
              onChange={({ detail }) => setNewProjectNotes(detail.value)}
              placeholder={t('pages:projectsList.enterProjectNotes')}
            />
          </FormField>
        </SpaceBetween>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={!!projectToDelete}
        onDismiss={() => setProjectToDelete(null)}
        header={t('pages:projectsList.deleteProject')}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setProjectToDelete(null)}>
                {t('common:buttons.cancel')}
              </Button>
              <Button variant="primary" onClick={handleDeleteProject}>
                {t('common:buttons.delete')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <Box>
            {t('pages:projectsList.confirmDeleteMessage', { name: projectToDelete?.name })}
          </Box>
          
          {projectToDelete && (
            <Box>
              <Box variant="awsui-key-label">{t('pages:projectsList.projectStatus')}</Box>
              <StatusIndicator 
                type={projectToDelete.status === 'active' ? 'success' : 'error'}
              >
                {projectToDelete.status === 'active' ? t('pages:projectsList.statusActive') : 
                 projectToDelete.status === 'failed' ? t('pages:projectsList.statusFailed') : 
                 projectToDelete.status === 'failed-to-provision' ? t('pages:projectsList.statusFailedToProvision') :
                 projectToDelete.status === 'failed-to-delete' ? t('pages:projectsList.statusFailedToDelete') :
                 projectToDelete.status === 'failed-with-stack' ? t('pages:projectsList.statusFailedWithStack') : 
                 projectToDelete.status}
              </StatusIndicator>
            </Box>
          )}

          {projectToDelete?.status === 'active' && (
            <Alert type="warning" header={t('pages:projectsList.infrastructureWillBeDestroyed')}>
              {t('pages:projectsList.infrastructureDestroyedMessage', { stackName: `App-ModEx-Project-${projectToDelete.projectId}` })}
            </Alert>
          )}

          {projectToDelete?.status === 'failed' && (
            <Alert type="info" header={t('pages:projectsList.failedProjectDeletion')}>
              {t('pages:projectsList.failedProjectDeletionMessage')}
            </Alert>
          )}

          {projectToDelete?.status === 'failed-to-provision' && (
            <Alert type="info" header={t('pages:projectsList.provisioningFailed')}>
              {t('pages:projectsList.provisioningFailedMessage')}
            </Alert>
          )}

          {projectToDelete?.status === 'failed-to-delete' && (
            <Alert type="warning" header={t('pages:projectsList.deletionFailed')}>
              {t('pages:projectsList.deletionFailedMessage')}
            </Alert>
          )}

          {projectToDelete?.status === 'failed-with-stack' && (
            <Alert type="warning" header={t('pages:projectsList.infrastructureFound')}>
              {t('pages:projectsList.infrastructureFoundMessage')}
            </Alert>
          )}
        </SpaceBetween>
      </Modal>

      {/* Share Project Modal */}
      <ShareProjectModal
        visible={shareModalVisible}
        project={selectedProjectForSharing}
        onDismiss={() => {
          console.log('Share modal dismissed from ProjectsListPage');
          setShareModalVisible(false);
          setSelectedProjectForSharing(null);
        }}
        onProjectUpdated={() => {
          console.log('onProjectUpdated called from ShareProjectModal');
          handleProjectUpdated();
        }}
      />

      {/* Stack Status Modal */}
      <StackStatusModal
        visible={stackModalVisible}
        stackInfo={projectWithStack?.stackInfo}
        projectName={projectWithStack?.name}
        onClose={() => {
          console.log('Stack modal dismissed');
          setStackModalVisible(false);
          setProjectWithStack(null);
        }}
        onConfirmDelete={handleConfirmDeleteWithStack}
        loading={false}
      />
    </Layout>
  );
};

export default ProjectsListPage;
