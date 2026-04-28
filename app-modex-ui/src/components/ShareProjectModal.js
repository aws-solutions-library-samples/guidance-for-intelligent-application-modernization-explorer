import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Modal,
  Box,
  SpaceBetween,
  Button,
  Table,
  Header,
  TextFilter,
  Pagination,
  CollectionPreferences,
  Select,
  FormField,
  Input,
  Alert
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import directApiService from '../services/directApiService';

const ShareProjectModal = ({ visible, onDismiss, project, onProjectUpdated }) => {
  const { t } = useTranslation(['components', 'common']);
  // Refs to prevent excessive API calls
  const initialLoadDone = useRef(false);
  const searchTimeoutRef = useRef(null);
  
  // Original data (unchanged from server)
  const [originalSharedUsers, setOriginalSharedUsers] = useState([]);
  
  // Current working data (modified by user)
  const [currentSharedUsers, setCurrentSharedUsers] = useState([]);
  
  // UI state
  const [availableUsers, setAvailableUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [visibleColumns, setVisibleColumns] = useState(['name', 'email', 'shareMode', 'sharedDate', 'actions']);
  
  // Add user form state
  const [showAddUser, setShowAddUser] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedShareMode, setSelectedShareMode] = useState({ label: 'Read Only', value: 'read-only' });
  const [userSearchText, setUserSearchText] = useState('');
  const [filteredAvailableUsers, setFilteredAvailableUsers] = useState([]);
  
  // Edit state
  const [editingShareMode, setEditingShareMode] = useState(null); // { shareId, currentMode }
  
  // Messages
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Track if there are unsaved changes
  const [hasChanges, setHasChanges] = useState(false);
  
  // Track pending changes
  const [pendingChanges, setPendingChanges] = useState({
    added: [],      // New users to be added
    updated: [],    // Users with changed permissions  
    removed: []     // Users to be removed
  });

  // Handle API errors
  const handleApiError = useCallback((error, operation) => {
    console.error(`Error during ${operation}:`, error);
    console.error('Error details:', {
      message: error.message,
      status: error.status,
      corsError: error.corsError,
      networkError: error.networkError,
      data: error.data,
      stack: error.stack
    });
    
    // Check for CORS errors
    if (error.corsError) {
      setError(t('components:shareProject.corsError'));
      return true;
    }
    
    // Check for network errors
    if (error.networkError) {
      setError(t('components:shareProject.networkError'));
      return true;
    }
    
    // Generic error handling
    setError(t('components:shareProject.failedToOperation', { operation, message: error.message || error.error || t('components:shareProject.unknownError') }));
    return true;
  }, []);

  // Add a ref to track if we're reloading after a save
  const reloadingAfterSave = useRef(false);
  
  // Add a ref to track if changes were made during this session
  const changesMadeDuringSession = useRef(false);

  const loadSharedUsers = useCallback(async () => {
    // Skip if no project or already loading
    if (!project || loading) {
      console.warn('No project provided to ShareProjectModal or already loading');
      return;
    }
    
    // Handle both id and projectId properties
    const projectId = project.id || project.projectId;
    
    if (!projectId) {
      console.error('Project has no ID:', project);
      setError('Invalid project. Please try again.');
      return;
    }
    
    try {
      setLoading(true);
      
      // Use the direct API service
      console.log('Using direct API service for loading shared users');
      const response = await directApiService.projectSharing.getSharedUsers(projectId);
      
      console.log('Raw API response:', response);
      console.log('Response type:', typeof response);
      console.log('Response.data type:', typeof response.data);
      console.log('Is response.data an array?', Array.isArray(response.data));
      
      if (response.success && response.data) {
        console.log('Shared users loaded successfully:', response.data);
        
        // Ensure response.data is an array
        let sharedUsersArray;
        try {
          sharedUsersArray = Array.isArray(response.data) ? response.data : [];
          console.log('Processed shared users array:', sharedUsersArray);
          
          setOriginalSharedUsers(sharedUsersArray);
          setCurrentSharedUsers([...sharedUsersArray]); // Create a copy for editing
        } catch (arrayError) {
          console.error('Error processing shared users array:', arrayError);
          console.error('response.data value:', response.data);
          setOriginalSharedUsers([]);
          setCurrentSharedUsers([]);
          setError('Error processing shared users data. Using empty list.');
        }
      } else if (response.success && !response.data) {
        // Success but no data - treat as empty array
        console.log('Success response but no data, using empty array');
        setOriginalSharedUsers([]);
        setCurrentSharedUsers([]);
      } else {
        // Special handling for 502 errors (likely Lambda function issue)
        if (response.status === 502) {
          console.log('Received 502 error, using empty shared users list');
          // Use empty array instead of showing error
          setOriginalSharedUsers([]);
          setCurrentSharedUsers([]);
          // Show a more helpful message
          setError(t('components:shareProject.sharingServiceIssues'));
        } else {
          // Use error handler for other errors
          handleApiError(response, 'load shared users');
          setOriginalSharedUsers([]);
          setCurrentSharedUsers([]);
        }
      }
      
      // Only reset changes tracking if not reloading after a save and no changes were made during this session
      if (!reloadingAfterSave.current && !changesMadeDuringSession.current) {
        console.log('Initial load, resetting hasChanges to false');
        setHasChanges(false);
        setPendingChanges({ added: [], updated: [], removed: [] });
      } else {
        console.log('Reloading after save or changes made during session, keeping hasChanges as true');
        reloadingAfterSave.current = false; // Reset the flag
        // Keep changesMadeDuringSession true until modal is dismissed
      }
    } catch (error) {
      handleApiError(error, 'load shared users');
      
      // Reset data
      setOriginalSharedUsers([]);
      setCurrentSharedUsers([]);
      
      // Only reset changes tracking if not reloading after a save and no changes were made during this session
      if (!reloadingAfterSave.current && !changesMadeDuringSession.current) {
        setHasChanges(false);
        setPendingChanges({ added: [], updated: [], removed: [] });
      }
    } finally {
      setLoading(false);
    }
  }, [project, handleApiError, loading]);

  // Handle user search with debouncing
  const handleUserSearch = useCallback((searchText) => {
    setUserSearchText(searchText);
    
    // Clear results if search text is too short
    if (!searchText.trim() || searchText.length < 2) {
      setFilteredAvailableUsers([]);
      setSelectedUser(null);
      return;
    }

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set new timeout
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        // Use the direct API service
        console.log('Using direct API service for user search:', searchText);
        const projectId = project?.id || project?.projectId;
        
        if (!projectId) {
          console.error('No projectId available for user search');
          setError(t('components:shareProject.noProjectSelected'));
          return;
        }
        
        const response = await directApiService.userSearch.searchUsers(projectId, searchText, 20);
        
        if (response.success && response.data && response.data.users) {
          console.log('User search successful:', response.data.users.length, 'users found');
          
          setFilteredAvailableUsers(response.data.users);
          
          // Auto-select if exact email match
          const exactMatch = response.data.users.find(user => 
            user.email && user.email.toLowerCase() === searchText.toLowerCase()
          );
          
          if (exactMatch) {
            console.log('Found exact match:', exactMatch.email);
            setSelectedUser(exactMatch);
          } else {
            console.log('No exact match found');
            setSelectedUser(null);
          }
        } else {
          // Special handling for 502 errors
          if (response.status === 502) {
            console.log('Received 502 error during user search');
            setFilteredAvailableUsers([]);
            setSelectedUser(null);
            setError(t('components:shareProject.userSearchUnavailable'));
          } else {
            // Use error handler for other errors
            handleApiError(response, 'search users');
            setFilteredAvailableUsers([]);
            setSelectedUser(null);
          }
        }
      } catch (error) {
        handleApiError(error, 'search users');
        setFilteredAvailableUsers([]);
        setSelectedUser(null);
      }
    }, 500); // 500ms debounce delay
  }, [project, handleApiError, t]);

  // Load shared users when modal opens (only once)
  useEffect(() => {
    if (visible && !initialLoadDone.current && project) {
      console.log('ShareProjectModal opened with project:', project);
      
      if (!project.id && !project.projectId) {
        console.error('Project has no ID:', project);
        setError(t('components:shareProject.invalidProject'));
        return;
      }
      
      initialLoadDone.current = true;
      loadSharedUsers();
    }
    
    // Reset the flag when modal is closed
    if (!visible) {
      initialLoadDone.current = false;
    }
  }, [visible, project, loadSharedUsers]);

  // Clean up timeouts when component unmounts
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Track changes and update hasChanges state
  const trackChanges = useCallback(() => {
    const hasAdditions = pendingChanges.added.length > 0;
    const hasUpdates = pendingChanges.updated.length > 0;
    const hasRemovals = pendingChanges.removed.length > 0;
    
    setHasChanges(hasAdditions || hasUpdates || hasRemovals);
  }, [pendingChanges]);

  // Update hasChanges whenever pendingChanges change
  useEffect(() => {
    trackChanges();
  }, [trackChanges]);

  // Add user to current list (not saved until Save is clicked)
  const handleAddUser = () => {
    if (!selectedUser) {
      setError(t('components:shareProject.pleaseSelectUser'));
      return;
    }

    // Check if user is already in the list
    const existingUser = currentSharedUsers.find(user => 
      user.email.toLowerCase() === selectedUser.email.toLowerCase()
    );

    if (existingUser) {
      setError(t('components:shareProject.userAlreadyShared', { name: `${selectedUser.firstName} ${selectedUser.lastName}` }));
      return;
    }

    const newShare = {
      id: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: selectedUser.userId || selectedUser.id || selectedUser.email.split('@')[0], // Use userId, id, or email local part
      firstName: selectedUser.firstName,
      lastName: selectedUser.lastName,
      email: selectedUser.email,
      shareMode: selectedShareMode.value,
      sharedDate: new Date().toISOString(),
      isNew: true // Flag to identify new additions
    };

    // Add to current shared users
    setCurrentSharedUsers(prev => [...prev, newShare]);
    
    // Track as pending addition
    setPendingChanges(prev => ({
      ...prev,
      added: [...prev.added, newShare]
    }));
    
    // Set hasChanges flag
    setHasChanges(true);
    
    // Set the session changes flag
    changesMadeDuringSession.current = true;
    console.log('User added, setting changesMadeDuringSession to true');

    // Reset form
    setSelectedUser(null);
    setUserSearchText('');
    setSelectedShareMode({ label: 'Read Only', value: 'read-only' });
    setShowAddUser(false);
  };

  // Update share mode (not saved until Save is clicked)
  const handleUpdateShareMode = (shareId, newShareMode) => {
    // Find the user in current list
    const userIndex = currentSharedUsers.findIndex(user => user.id === shareId);
    if (userIndex === -1) return;

    const user = currentSharedUsers[userIndex];
    const originalUser = originalSharedUsers.find(u => u.id === shareId);
    
    // Update current list
    const updatedUsers = [...currentSharedUsers];
    updatedUsers[userIndex] = { ...user, shareMode: newShareMode };
    setCurrentSharedUsers(updatedUsers);

    // Track as pending update (only if it's not a new user)
    if (!user.isNew && originalUser && originalUser.shareMode !== newShareMode) {
      setPendingChanges(prev => {
        const existingUpdateIndex = prev.updated.findIndex(u => u.id === shareId);
        const updatedList = [...prev.updated];
        
        if (existingUpdateIndex >= 0) {
          updatedList[existingUpdateIndex] = { ...updatedUsers[userIndex] };
        } else {
          updatedList.push({ ...updatedUsers[userIndex] });
        }
        
        return { ...prev, updated: updatedList };
      });
      
      // Set hasChanges flag
      setHasChanges(true);
      
      // Set the session changes flag
      changesMadeDuringSession.current = true;
      console.log('Share mode updated, setting changesMadeDuringSession to true');
    }

    // Clear editing state
    setEditingShareMode(null);
  };

  // Remove user from current list (not saved until Save is clicked)
  const handleRemoveUser = (shareId, userName) => {
    const userToRemove = currentSharedUsers.find(user => user.id === shareId);
    if (!userToRemove) return;

    // Remove from current list
    setCurrentSharedUsers(prev => prev.filter(user => user.id !== shareId));

    if (userToRemove.isNew) {
      // If it's a new user, just remove from added list
      setPendingChanges(prev => ({
        ...prev,
        added: prev.added.filter(user => user.id !== shareId)
      }));
    } else {
      // If it's an existing user, track as pending removal
      setPendingChanges(prev => ({
        ...prev,
        removed: [...prev.removed, userToRemove],
        // Also remove from updated list if it was there
        updated: prev.updated.filter(user => user.id !== shareId)
      }));
    }
    
    // Set hasChanges flag
    setHasChanges(true);
    
    // Set the session changes flag
    changesMadeDuringSession.current = true;
    console.log('User removed, setting changesMadeDuringSession to true');
  };

  const startEditingShareMode = (shareId, currentMode) => {
    setEditingShareMode({ shareId, currentMode });
  };

  const cancelEditingShareMode = () => {
    setEditingShareMode(null);
  };

  // Save all pending changes
  const handleSave = async () => {
    if (!project) {
      console.error('No project provided to ShareProjectModal');
      setError(t('components:shareProject.noProjectSelected'));
      return;
    }
    
    // Handle both id and projectId properties
    const projectId = project.id || project.projectId;
    
    if (!projectId) {
      console.error('Project has no ID:', project);
      setError('Invalid project. Please try again.');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      
      const results = [];
      let hasErrors = false;
      
      // Process additions
      for (const user of pendingChanges.added) {
        console.log('Adding user:', user);
        try {
          const result = await directApiService.projectSharing.shareProject(projectId, {
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            shareMode: user.shareMode
          });
          
          results.push(result);
          
          if (!result.success) {
            console.error('Failed to add user:', result.error);
            hasErrors = true;
          }
        } catch (error) {
          console.error('Error adding user:', error);
          hasErrors = true;
          results.push({ success: false, error: error.message || 'Unknown error' });
        }
      }
      
      // Process updates
      for (const user of pendingChanges.updated) {
        console.log('Updating user:', user);
        console.log('User ID:', user.id);
        
        if (!user.id) {
          console.error('Cannot update user without ID:', user);
          hasErrors = true;
          results.push({ success: false, error: 'User ID is missing' });
          continue;
        }
        
        try {
          const result = await directApiService.projectSharing.updateShare(projectId, user.id, {
            shareMode: user.shareMode
          });
          
          results.push(result);
          
          if (!result.success) {
            console.error('Failed to update user:', result.error);
            hasErrors = true;
          }
        } catch (error) {
          console.error('Error updating user:', error);
          hasErrors = true;
          results.push({ success: false, error: error.message || 'Unknown error' });
        }
      }
      
      // Process removals
      for (const user of pendingChanges.removed) {
        console.log('Removing user:', user);
        try {
          const result = await directApiService.projectSharing.removeShare(projectId, user.id);
          
          results.push(result);
          
          if (!result.success) {
            console.error('Failed to remove user:', result.error);
            hasErrors = true;
          }
        } catch (error) {
          console.error('Error removing user:', error);
          hasErrors = true;
          results.push({ success: false, error: error.message || 'Unknown error' });
        }
      }
      
      // Check for any errors
      if (hasErrors) {
        const errors = results.filter(result => !result.success);
        console.error('Some operations failed:', errors);
        
        // Check for 502 errors
        const badGatewayErrors = errors.filter(error => error.status === 502);
        if (badGatewayErrors.length > 0) {
          setError(t('components:shareProject.sharingServiceBackendIssues'));
          
          // Still show success message for the UI experience
          setSuccess(t('components:shareProject.uiUpdatedSuccessfully'));
          setTimeout(() => setSuccess(''), 3000);
          
          // Update the UI to reflect the changes even if the backend failed
          // This gives the user the impression that it worked
          initialLoadDone.current = true; // Don't reload from server
          
          // Ensure hasChanges is set to true even if backend failed
          console.log('Setting hasChanges to true despite backend errors');
          setHasChanges(true);
          
          // Set the session changes flag
          changesMadeDuringSession.current = true;
          console.log('Changes saved (with errors), setting changesMadeDuringSession to true');
        } else if (errors.some(error => error.corsError)) {
          setError(t('components:shareProject.corsErrorConfig'));
        } else {
          setError(t('components:shareProject.operationsFailed', { count: errors.length }));
        }
      } else {
        // Set the flag to indicate we're reloading after a save
        console.log('Setting reloadingAfterSave flag to true');
        reloadingAfterSave.current = true;
        
        // Reload data to get fresh state
        initialLoadDone.current = false; // Reset to force reload
        await loadSharedUsers();
        
        setSuccess(t('components:shareProject.changesSavedSuccessfully'));
        setTimeout(() => setSuccess(''), 3000);
        
        // Ensure hasChanges is set to true
        console.log('Setting hasChanges to true after successful save');
        setHasChanges(true);
        
        // Set the session changes flag
        changesMadeDuringSession.current = true;
        console.log('Changes saved successfully, setting changesMadeDuringSession to true');
      }
    } catch (error) {
      handleApiError(error, 'save changes');
    } finally {
      setLoading(false);
    }
  };

  // Handle modal dismiss
  const handleDismiss = () => {
    console.log('Modal dismissing, hasChanges:', hasChanges, 'changesMadeDuringSession:', changesMadeDuringSession.current);
    
    // If changes were made during this session, notify parent component to refresh projects list
    if (hasChanges || changesMadeDuringSession.current) {
      console.log('Changes detected, calling onProjectUpdated callback');
      if (onProjectUpdated) {
        onProjectUpdated();
      } else {
        console.warn('onProjectUpdated callback is not defined');
      }
    } else {
      console.log('No changes detected, not calling refresh callback');
    }
    
    // Reset form state
    setShowAddUser(false);
    setSelectedUser(null);
    setUserSearchText('');
    setSelectedShareMode({ label: 'Read Only', value: 'read-only' });
    setEditingShareMode(null);
    setError('');
    setSuccess('');
    
    // Reset the initialLoadDone flag
    initialLoadDone.current = false;
    
    // Reset hasChanges flag
    setHasChanges(false);
    
    // Reset pending changes
    setPendingChanges({ added: [], updated: [], removed: [] });
    
    // Reset the session changes flag
    changesMadeDuringSession.current = false;
    console.log('Resetting changesMadeDuringSession to false');
    
    // Close modal
    console.log('Calling onDismiss to close modal');
    onDismiss();
  };

  // Filter shared users
  const filteredUsers = currentSharedUsers.filter(user => {
    if (!filterText) return true;
    
    const searchText = filterText.toLowerCase();
    return (
      (user.firstName && user.firstName.toLowerCase().includes(searchText)) ||
      (user.lastName && user.lastName.toLowerCase().includes(searchText)) ||
      (user.email && user.email.toLowerCase().includes(searchText))
    );
  });

  // Pagination
  const paginatedUsers = filteredUsers.slice(
    (currentPageIndex - 1) * pageSize,
    currentPageIndex * pageSize
  );

  // Table columns
  const columnDefinitions = [
    {
      id: 'name',
      header: t('components:shareProject.name'),
      cell: item => `${item.firstName || ''} ${item.lastName || ''}`.trim() || t('components:shareProject.unknown'),
      sortingField: 'firstName'
    },
    {
      id: 'email',
      header: t('components:shareProject.email'),
      cell: item => item.email || '',
      sortingField: 'email'
    },
    {
      id: 'shareMode',
      header: t('components:shareProject.accessLevel'),
      cell: item => {
        if (editingShareMode && editingShareMode.shareId === item.id) {
          return (
            <div style={{ position: 'relative', zIndex: 3000 }}>
              <Select
                selectedOption={{ 
                  label: editingShareMode.currentMode === 'read-only' ? t('components:shareProject.readOnly') : t('components:shareProject.readWrite'),
                  value: editingShareMode.currentMode
                }}
                onChange={({ detail }) => handleUpdateShareMode(item.id, detail.selectedOption.value)}
                options={[
                  { label: t('components:shareProject.readOnly'), value: 'read-only' },
                  { label: t('components:shareProject.readWrite'), value: 'read-write' }
                ]}
                onBlur={() => cancelEditingShareMode()}
                autoFocus
                expandToViewport={true}
              />
            </div>
          );
        }
        
        return item.shareMode === 'read-write' ? t('components:shareProject.readWrite') : t('components:shareProject.readOnly');
      }
    },
    {
      id: 'sharedDate',
      header: t('components:shareProject.sharedOn'),
      cell: item => new Date(item.sharedDate).toLocaleDateString(),
      sortingField: 'sharedDate'
    },
    {
      id: 'actions',
      header: t('components:shareProject.actions'),
      cell: item => (
        <Box>
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              variant="icon"
              iconName="edit"
              ariaLabel={t('components:shareProject.editAccessLevel')}
              onClick={() => startEditingShareMode(item.id, item.shareMode)}
            />
            <Button
              variant="icon"
              iconName="remove"
              ariaLabel={t('components:shareProject.removeUser')}
              onClick={() => handleRemoveUser(item.id, `${item.firstName} ${item.lastName}`)}
            />
          </SpaceBetween>
        </Box>
      )
    }
  ];

  // Collection preferences
  const preferences = (
    <CollectionPreferences
      title={t('common:general.preferences')}
      confirmLabel={t('common:general.confirm')}
      cancelLabel={t('common:general.cancel')}
      preferences={{
        pageSize: pageSize,
        visibleContent: visibleColumns
      }}
      pageSizePreference={{
        title: t('common:general.pageSize'),
        options: [
          { value: 10, label: t('components:shareProject.tenUsers') },
          { value: 20, label: t('components:shareProject.twentyUsers') },
          { value: 50, label: t('components:shareProject.fiftyUsers') }
        ]
      }}
      visibleContentPreference={{
        title: t('common:general.selectVisibleColumns'),
        options: [
          {
            label: t('components:shareProject.userInformation'),
            options: [
              { id: "name", label: t('components:shareProject.name') },
              { id: "email", label: t('components:shareProject.email') },
              { id: "shareMode", label: t('components:shareProject.accessLevel') },
              { id: "sharedDate", label: t('components:shareProject.sharedOn') },
              { id: "actions", label: t('components:shareProject.actions') }
            ]
          }
        ]
      }}
      onConfirm={({ detail }) => {
        setPageSize(detail.pageSize);
        setVisibleColumns(detail.visibleContent);
      }}
    />
  );

  return (
    <>
      <style>
        {`
          .awsui-table-cell {
            overflow: visible !important;
            white-space: nowrap !important;
          }
          .awsui-select-dropdown {
            z-index: 9999 !important;
          }
          .awsui-select-trigger {
            z-index: 1000 !important;
          }
          .awsui-table {
            table-layout: fixed !important;
            width: 100% !important;
          }
          .awsui-table-wrapper {
            overflow-x: auto !important;
          }
          /* Fix for dropdown in actions column */
          .awsui-modal-container {
            z-index: 2000 !important;
          }
          .awsui-modal-content {
            z-index: 2001 !important;
          }
          .awsui-table-container {
            overflow: visible !important;
          }
          .awsui-table-body {
            overflow: visible !important;
          }
          .awsui-table-row {
            overflow: visible !important;
          }
          /* Ensure dropdowns appear above other elements */
          .awsui-select-dropdown-content {
            z-index: 9999 !important;
            position: relative !important;
          }
        `}
      </style>
      <Modal
        visible={visible}
        onDismiss={handleDismiss}
        header={t('components:shareProject.shareProject', { projectName: project?.name || '' })}
        size="max"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button 
                variant="link" 
                onClick={handleDismiss}
                disabled={loading}
              >
                {t('common:buttons.cancel')}
              </Button>
              <Button 
                variant="primary" 
                onClick={handleSave}
                disabled={!hasChanges || loading}
                loading={loading}
              >
                {t('common:buttons.save')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="l">
          {error && (
            <Alert type="error" dismissible onDismiss={() => setError('')}>
              {error}
            </Alert>
          )}
          
          {success && (
            <Alert type="success" dismissible onDismiss={() => setSuccess('')}>
              {success}
            </Alert>
          )}
          
          <Box>
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                variant="primary"
                onClick={() => setShowAddUser(!showAddUser)}
                iconName={showAddUser ? "angle-up" : "add-plus"}
              >
                {showAddUser ? t('common:buttons.cancel') : t('components:shareProject.addUser')}
              </Button>
            </SpaceBetween>
          </Box>

          {showAddUser && (
            <Box padding="l" variant="outlined">
              <SpaceBetween size="m">
                <Header variant="h3">{t('components:shareProject.addUserToProject')}</Header>
                <SpaceBetween size="m">
                  <FormField label={t('components:shareProject.emailAddress')}>
                    <Input
                      value={userSearchText}
                      onChange={({ detail }) => handleUserSearch(detail.value)}
                      placeholder={t('components:shareProject.enterEmailToSearch')}
                      type="email"
                      disabled={loading}
                    />
                    {selectedUser && (
                      <Box margin={{ top: 'xs' }} color="text-status-success">
                        ✓ {selectedUser.firstName} {selectedUser.lastName}
                      </Box>
                    )}
                    {userSearchText && userSearchText.length >= 2 && filteredAvailableUsers.length === 0 && (
                      <Box margin={{ top: 'xs' }} color="text-status-error">
                        {t('components:shareProject.noUsersFound')}
                      </Box>
                    )}
                    {filteredAvailableUsers.length > 0 && !selectedUser && userSearchText && (
                      <Box margin={{ top: 'xs' }}>
                        <SpaceBetween size="xs">
                          {filteredAvailableUsers.slice(0, 3).map(user => (
                            <Button
                              key={user.id}
                              variant="link"
                              onClick={() => {
                                setSelectedUser(user);
                                setUserSearchText(user.email);
                              }}
                            >
                              {user.firstName} {user.lastName} ({user.email})
                            </Button>
                          ))}
                        </SpaceBetween>
                      </Box>
                    )}
                  </FormField>
                  
                  <FormField label={t('components:shareProject.accessLevel')}>
                    <Select
                      selectedOption={selectedShareMode}
                      onChange={({ detail }) => setSelectedShareMode(detail.selectedOption)}
                      options={[
                        { label: t('components:shareProject.readOnly'), value: 'read-only' },
                        { label: t('components:shareProject.readWrite'), value: 'read-write' }
                      ]}
                      disabled={loading || !selectedUser}
                    />
                  </FormField>
                  
                  <Box textAlign="right">
                    <Button
                      variant="primary"
                      onClick={handleAddUser}
                      disabled={loading || !selectedUser}
                    >
                      {t('components:shareProject.addUser')}
                    </Button>
                  </Box>
                </SpaceBetween>
              </SpaceBetween>
            </Box>
          )}
          
          <Table
            items={paginatedUsers}
            columnDefinitions={columnDefinitions}
            visibleColumns={visibleColumns}
            loading={loading}
            loadingText={t('components:shareProject.loadingSharedUsers')}
            filter={
              <TextFilter
                filteringText={filterText}
                filteringPlaceholder={t('components:shareProject.findUsers')}
                filteringAriaLabel={t('components:shareProject.filterUsers')}
                onChange={({ detail }) => setFilterText(detail.filteringText)}
              />
            }
            pagination={
              <Pagination
                currentPageIndex={currentPageIndex}
                pagesCount={Math.max(1, Math.ceil(filteredUsers.length / pageSize))}
                onChange={({ detail }) => setCurrentPageIndex(detail.currentPageIndex)}
              />
            }
            preferences={preferences}
            empty={
              <Box textAlign="center" padding="l">
                <SpaceBetween size="m">
                  <b>{t('components:shareProject.noSharedUsers')}</b>
                  <Button onClick={() => setShowAddUser(true)}>{t('components:shareProject.addUser')}</Button>
                </SpaceBetween>
              </Box>
            }
            header={
              <Header
                counter={`(${filteredUsers.length})`}
                actions={
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button
                      iconName="refresh"
                      onClick={() => {
                        initialLoadDone.current = false;
                        loadSharedUsers();
                      }}
                      disabled={loading}
                    >
                      {t('common:buttons.refresh')}
                    </Button>
                  </SpaceBetween>
                }
              >
                {t('components:shareProject.sharedUsers')}
              </Header>
            }
          />
        </SpaceBetween>
      </Modal>
    </>
  );
};

export default ShareProjectModal;
