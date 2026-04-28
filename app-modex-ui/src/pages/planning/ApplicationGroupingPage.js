import React, { useState, useEffect } from 'react';
import {
  ContentLayout,
  Header,
  Box,
  Table,
  Button,
  SpaceBetween,
  TextFilter,
  Pagination,
  CollectionPreferences,
  Modal,
  Alert,
  ButtonDropdown,
  Container,
  ColumnLayout,
  FormField,
  Slider,
  Input,
  Select
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { navigateToExportWithCategory } from '../../utils/exportNavigationUtils';

// Layouts
import Layout from '../../layouts/AppLayout';

// Components
import ApplicationGroupingInfoContent from '../../components/info/ApplicationGroupingInfoContent';

// Services
import { fetchApplicationBuckets, deleteBucket, createBucket, updateBucket } from '../../services/applicationBucketsApi';
import { fetchPilotIdentificationResults, getSimilarApplications } from '../../services/pilotIdentificationApi';
import { getAuthHeaders } from '../../services/authService';

// Hooks
import useProjectPermissions from '../../hooks/useProjectPermissions';

/**
 * Application Buckets Page Component
 * 
 * This page displays application buckets information for planning purposes.
 * It allows users to view, filter, sort, create, and delete application buckets.
 */
const ApplicationGroupingPage = () => {
  const { t } = useTranslation(['pages', 'common']);
  const navigate = useNavigate();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [buckets, setBuckets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pilotApplications, setPilotApplications] = useState([]);
  const [allApplications, setAllApplications] = useState([]);
  const [filterText, setFilterText] = useState('');
  const [selectedItems, setSelectedItems] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortingColumn, setSortingColumn] = useState({ sortingField: 'name' });
  const [sortingDescending, setSortingDescending] = useState(false);
  const [preferences, setPreferences] = useState({
    pageSize: 10,
    visibleContent: ['name', 'pilotApplicationName', 'similarityThreshold', 'applicationCount', 'actions']
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [bucketToDelete, setBucketToDelete] = useState(null);
  
  // Messages
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // State for applications detail view
  const [selectedBucket, setSelectedBucket] = useState(null);
  const [appFilterText, setAppFilterText] = useState('');
  const [appCurrentPageIndex, setAppCurrentPageIndex] = useState(1);
  const [appPageSize, setAppPageSize] = useState(10);
  const [appSortingColumn, setAppSortingColumn] = useState({ sortingField: 'name' });
  const [appSortingDescending, setAppSortingDescending] = useState(false);
  const [appPreferences, setAppPreferences] = useState({
    pageSize: 10,
    visibleContent: ['name', 'component', 'runtime', 'framework', 'databases', 'integrations', 'storage']
  });
  
  // State for edit mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedSimilarityThreshold, setEditedSimilarityThreshold] = useState(0);
  const [loadingBucketData, setLoadingBucketData] = useState(false);
  
  // State for create bucket
  const [newBucketName, setNewBucketName] = useState('');
  const [selectedPilotId, setSelectedPilotId] = useState('');
  const [manualApplicationName, setManualApplicationName] = useState('');
  const [bucketNameError, setBucketNameError] = useState('');
  const [isCreatingBucket, setIsCreatingBucket] = useState(false);
  const [appSearchText, setAppSearchText] = useState('');
  const [dataFetchError, setDataFetchError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  // Fetch portfolio applications using the same API as the portfolio page
  const fetchPortfolioApplications = async (projectId) => {
    const API_BASE_URL = process.env.REACT_APP_API_URL;

    try {
      const headers = await getAuthHeaders();
      
      const response = await fetch(`${API_BASE_URL}/projects/${projectId}/athena-query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          templateId: 'application-portfolio-all',
          projectId
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to retrieve application portfolio data');
      }

      return { items: result.data || [] };
    } catch (error) {
      console.error('❌ Error fetching portfolio applications:', error);
      throw error;
    }
  };

  // Retry utility function with exponential backoff
  const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Attempt ${attempt}/${maxRetries}`);
        const result = await fn();
        
        // If we got a result (even empty array), consider it successful
        if (result !== undefined) {
          console.log(`✅ Attempt ${attempt} succeeded`);
          return result;
        }
      } catch (error) {
        lastError = error;
        console.error(`❌ Attempt ${attempt} failed:`, error);
        
        // Don't wait after the last attempt
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // All retries failed
    throw lastError || new Error('All retry attempts failed');
  };

  // Fetch complete application data including tech stack
  const fetchCompleteApplicationData = async (applicationNames) => {
    if (!applicationNames || applicationNames.length === 0) return [];
    
    const API_BASE_URL = process.env.REACT_APP_API_URL;

    try {
      const headers = await getAuthHeaders();
      
      const response = await fetch(`${API_BASE_URL}projects/${projectId}/athena-query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          templateId: 'tech-stack-by-applications',
          parameters: {
            applicationNames: applicationNames
          },
          projectId
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to retrieve tech stack data');
      }

      return result.data || [];
    } catch (error) {
      console.error('❌ Error fetching complete application data:', error);
      throw error; // Re-throw to allow retry logic to handle it
    }
  };

  // Get project ID from localStorage
  const projectData = localStorage.getItem('selectedProject');
  const projectId = projectData ? JSON.parse(projectData).projectId : null;
  
  // Check project permissions
  const { hasWriteAccess, loading: permissionsLoading } = useProjectPermissions(projectId);

  // Fetch data on component mount
  useEffect(() => {
    const fetchData = async () => {
      if (!projectId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // Load data independently to avoid one failure blocking others
        const [bucketsResult, candidatesResult, portfolioResult] = await Promise.allSettled([
          fetchApplicationBuckets(projectId),
          fetchPilotIdentificationResults(projectId),
          fetchPortfolioApplications(projectId)
        ]);
        
        // Handle buckets
        if (bucketsResult.status === 'fulfilled') {
          const transformedBuckets = bucketsResult.value.map(bucket => ({
            ...bucket,
            applicationCount: bucket.applications.length
          }));
          setBuckets(transformedBuckets);
        } else {
          console.error('❌ Failed to load buckets:', bucketsResult.reason);
          setBuckets([]);
        }
        
        // Handle pilot candidates
        if (candidatesResult.status === 'fulfilled') {
          // Support both new format (consolidated/ruleBased/aiEnhanced) and old format (candidates)
          const results = candidatesResult.value;
          let pilotApps = [];
          
          if (results?.consolidated && results.consolidated.length > 0) {
            // New format - use consolidated results
            pilotApps = results.consolidated;
          } else if (results?.candidates && results.candidates.length > 0) {
            // Old format - use candidates array
            pilotApps = results.candidates;
          }
          
          setPilotApplications(pilotApps);
          console.log('📊 Loaded pilot applications:', pilotApps.length);
        } else {
          console.error('❌ Failed to load pilot candidates:', candidatesResult.reason);
          setPilotApplications([]);
        }
        
        // Handle portfolio applications
        if (portfolioResult.status === 'fulfilled') {
          setAllApplications(portfolioResult.value?.items || []);
          console.log('📊 Loaded portfolio applications:', portfolioResult.value?.items?.length || 0);
        } else {
          console.error('❌ Failed to load portfolio applications:', portfolioResult.reason);
          setAllApplications([]);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [projectId]);
  
  // Check for pilot data from Pilot Identification page on component mount
  useEffect(() => {
    const pilotData = localStorage.getItem('createBucketPilot');
    
    if (pilotData) {
      try {
        const { id, name, threshold } = JSON.parse(pilotData);
        
        // Clear the localStorage item to prevent it from being used again
        localStorage.removeItem('createBucketPilot');
        
        // Set up the new bucket form
        setNewBucketName(`Bucket created from Pilot ${name}`);
        setSelectedPilotId(name);
        
        // Store the threshold for later use in handleCreateBucketSubmit
        localStorage.setItem('tempThreshold', threshold);
        
        // Open the create modal
        setShowCreateModal(true);
      } catch (error) {
        console.error('Error parsing pilot data:', error);
      }
    }
  }, []);

  // Set edited similarity threshold when a bucket is selected for editing
  useEffect(() => {
    if (selectedBucket && isEditMode) {
      setEditedSimilarityThreshold(selectedBucket.similarityThreshold);
    }
  }, [selectedBucket, isEditMode]);
  
  // Fetch similar applications when pilot is selected in create modal
  useEffect(() => {
    const fetchSimilarAppsForCreate = async () => {
      const pilotName = selectedPilotId || manualApplicationName;
      
      if (!pilotName || !projectId || !showCreateModal) {
        return;
      }
      
      try {
        console.log('🔍 Fetching similar applications for create modal:', pilotName, 'project:', projectId);
        const similarAppsData = await getSimilarApplications(projectId, pilotName, 0);
        
        // Get application names for tech stack lookup
        const appNames = similarAppsData.similarApplications?.map(app => app.applicationName || app.name) || [];
        
        // Fetch complete tech stack data
        const techStackData = await fetchCompleteApplicationData(appNames);
        
        // Merge similarity data with tech stack data
        const enhancedSimilarApps = similarAppsData.similarApplications?.map(app => {
          const techStack = techStackData.find(ts => ts.applicationName === (app.applicationName || app.name));
          return {
            ...app,
            applicationName: app.applicationName || app.name,
            runtime: techStack?.runtime || 'Not specified',
            framework: techStack?.framework || 'Not specified',
            databases: techStack?.databases || 'Not specified',
            integrations: techStack?.integrations || 'Not specified',
            storages: techStack?.storages || 'Not specified'
          };
        }) || [];
        
        console.log(`✅ Fetched ${enhancedSimilarApps.length} similar applications for create modal`);
        
        // Store similar apps in a temporary state that can be used when creating the bucket
        // We'll create a temporary bucket object to hold this data
        setSelectedBucket({
          name: newBucketName,
          pilotApplicationName: pilotName,
          similarApps: enhancedSimilarApps,
          similarityThreshold: 85 // Default threshold
        });
      } catch (error) {
        console.error('❌ Error fetching similar applications for create modal:', error);
      }
    };
    
    fetchSimilarAppsForCreate();
  }, [selectedPilotId, manualApplicationName, projectId, showCreateModal]);

  // Filter buckets based on filter text
  const filteredBuckets = buckets.filter(bucket => {
    const filterTextLower = filterText.toLowerCase();
    
    // Check if bucket name or pilot application name matches filter text
    if (bucket.name.toLowerCase().includes(filterTextLower) || 
        bucket.pilotApplicationName.toLowerCase().includes(filterTextLower)) {
      return true;
    }
    
    // Check if any application in the bucket matches filter text
    return bucket.applications.some(app => 
      app.name.toLowerCase().includes(filterTextLower)
    );
  });

  // Sort and paginate buckets
  const sortedBuckets = [...filteredBuckets].sort((a, b) => {
    const sortingField = sortingColumn.sortingField;
    
    if (sortingField === 'name') {
      return sortingDescending 
        ? b.name.localeCompare(a.name) 
        : a.name.localeCompare(b.name);
    } else if (sortingField === 'pilotApplicationName') {
      return sortingDescending 
        ? b.pilotApplicationName.localeCompare(a.pilotApplicationName) 
        : a.pilotApplicationName.localeCompare(b.pilotApplicationName);
    } else if (sortingField === 'similarityThreshold') {
      return sortingDescending 
        ? b.similarityThreshold - a.similarityThreshold 
        : a.similarityThreshold - b.similarityThreshold;
    } else if (sortingField === 'applicationCount') {
      return sortingDescending 
        ? b.applicationCount - a.applicationCount 
        : a.applicationCount - b.applicationCount;
    }
    
    return 0;
  });

  const paginatedBuckets = sortedBuckets.slice(
    (currentPageIndex - 1) * pageSize,
    currentPageIndex * pageSize
  );

  // Handle delete bucket
  const handleDeleteBucket = async () => {
    console.log('🗑️ Delete button clicked, bucketToDelete:', bucketToDelete, 'projectId:', projectId);
    
    if (!bucketToDelete || !projectId) {
      console.log('❌ Missing bucketToDelete or projectId');
      return;
    }
    
    try {
      console.log('🗑️ Calling deleteBucket API...');
      await deleteBucket(bucketToDelete.bucketId, projectId);
      
      console.log('✅ Delete successful, updating buckets list');
      // Update buckets list
      setBuckets(buckets.filter(bucket => bucket.bucketId !== bucketToDelete.bucketId));
      setBucketToDelete(null);
      setShowDeleteModal(false);
    } catch (error) {
      console.error('❌ Error deleting bucket:', error);
    }
  };

  // Handle export bucket (placeholder for future implementation)
  const handleExportBucket = (bucket) => {
    console.log('Export bucket:', bucket);
    // TODO: Implement export functionality
    // This could export to PDF, Excel, CSV, etc.
    alert(`Export functionality for "${bucket.name}" will be implemented in the future.`);
  };

  // Handle edit bucket
  const handleEditBucket = async (bucket) => {
    setSelectedBucket(bucket);
    setIsEditMode(true);
    setAppCurrentPageIndex(1);
    setAppFilterText('');
    
    // Fetch similar applications for the pilot in this bucket
    if (bucket.pilotApplicationName && projectId) {
      try {
        console.log('🔍 Fetching similar applications for edit:', bucket.pilotApplicationName, 'project:', projectId);
        const similarAppsData = await getSimilarApplications(projectId, bucket.pilotApplicationName, 0);
        
        // Get application names for tech stack lookup
        const appNames = similarAppsData.similarApplications?.map(app => app.applicationName || app.name) || [];
        
        // Fetch complete tech stack data
        const techStackData = await fetchCompleteApplicationData(appNames);
        
        // Merge similarity data with tech stack data
        const enhancedSimilarApps = similarAppsData.similarApplications?.map(app => {
          const techStack = techStackData.find(ts => ts.applicationName === (app.applicationName || app.name));
          return {
            ...app,
            runtime: techStack?.runtime || 'Not specified',
            framework: techStack?.framework || 'Not specified',
            databases: techStack?.databases || 'Not specified',
            integrations: techStack?.integrations || 'Not specified',
            storages: techStack?.storages || 'Not specified'
          };
        }) || [];
        
        // Update the bucket with enhanced similar applications
        const updatedBucket = {
          ...bucket,
          similarApps: enhancedSimilarApps
        };
        setSelectedBucket(updatedBucket);
      } catch (error) {
        console.error('❌ Error fetching similar applications for edit:', error);
      }
    }
  };

  // Handle save bucket changes
  const handleSaveBucket = async () => {
    console.log('🔍 Project ID for save:', projectId);
    
    if (!projectId) {
      setError('No project selected. Please select a project first.');
      return;
    }
    
    try {
      if (isCreatingBucket) {
        // For new buckets - create via API
        const bucketData = {
          name: selectedBucket.name,
          pilotApplicationId: selectedBucket.pilotApplicationName, // Use the application name as ID
          pilotApplicationName: selectedBucket.pilotApplicationName,
          similarityThreshold: editedSimilarityThreshold,
          applications: getEnhancedApplications()
        };
        
        const createdBucket = await createBucket(bucketData, projectId);
        
        // Add the new bucket to the list
        setBuckets([...buckets, {
          ...createdBucket,
          applicationCount: bucketData.applications.length
        }]);
        
        setSuccess(`Created new bucket: ${createdBucket.name} with similarity threshold: ${editedSimilarityThreshold}%`);
      } else {
        // For existing buckets - update via API
        const bucketData = {
          name: selectedBucket.name,
          pilotApplicationId: selectedBucket.pilotApplicationName, // Use the application name as ID
          pilotApplicationName: selectedBucket.pilotApplicationName,
          similarityThreshold: editedSimilarityThreshold,
          applications: getEnhancedApplications()
        };
        
        const updatedBucket = await updateBucket(selectedBucket.bucketId, bucketData, projectId);
        
        // Update the bucket in the list
        const updatedBuckets = buckets.map(bucket => 
          bucket.bucketId === selectedBucket.bucketId 
            ? { ...updatedBucket, applicationCount: bucketData.applications.length }
            : bucket
        );
        setBuckets(updatedBuckets);
        
        setSuccess(`Updated bucket: ${updatedBucket.name} with similarity threshold: ${editedSimilarityThreshold}%`);
      }
      
      // Reset state
      setIsEditMode(false);
      setSelectedBucket(null);
      setIsCreatingBucket(false);
    } catch (error) {
      console.error('Error saving bucket:', error);
      setError(`Error saving bucket: ${error.message}`);
    }
  };

  // Handle cancel bucket edit
  const handleCancelEdit = () => {
    setIsEditMode(false);
    setSelectedBucket(null);
    setIsCreatingBucket(false);
  };

  // Handle create bucket
  const handleCreateBucket = () => {
    setNewBucketName('');
    setSelectedPilotId('');
    setManualApplicationName('');
    setAppSearchText('');
    setBucketNameError('');
    setShowCreateModal(true);
  };

  // Filter applications based on search text
  const getFilteredApplications = () => {
    if (!appSearchText) return allApplications.slice(0, 50); // Show first 50 if no search
    
    return allApplications
      .filter(app => 
        app.applicationName.toLowerCase().includes(appSearchText.toLowerCase())
      )
      .slice(0, 50); // Limit to 50 results for performance
  };
  
  // Handle create bucket submit
  const handleCreateBucketSubmit = async () => {
    // Validate bucket name
    if (!newBucketName.trim()) {
      setBucketNameError('Bucket name is required');
      return;
    }
    
    // Check if bucket name is unique
    const bucketNameExists = buckets.some(bucket => 
      bucket.name.toLowerCase() === newBucketName.toLowerCase()
    );
    
    if (bucketNameExists) {
      setBucketNameError('Bucket name already exists');
      return;
    }
    
    // Validate pilot selection
    const pilotApplicationName = selectedPilotId || manualApplicationName.trim();
    if (!pilotApplicationName) {
      return;
    }
    
    // Get the threshold from localStorage if available
    const tempThreshold = localStorage.getItem('tempThreshold');
    let initialThreshold = 85; // Default threshold
    
    if (tempThreshold) {
      initialThreshold = parseInt(tempThreshold, 10);
      // Remove the temporary threshold from localStorage
      localStorage.removeItem('tempThreshold');
    }
    
    // Create a new bucket object
    const newBucket = {
      id: `bucket-${Date.now()}`,
      name: newBucketName,
      pilotApplicationId: selectedPilotId || manualApplicationName.trim(),
      pilotApplicationName: selectedPilotId || manualApplicationName.trim(),
      similarityThreshold: initialThreshold,
      applications: [],
      similarApps: [] // Will be populated when we fetch similar applications
    };
    
    // Close the modal
    setShowCreateModal(false);
    
    // Set the new bucket as selected and enter edit mode
    setSelectedBucket(newBucket);
    setEditedSimilarityThreshold(initialThreshold);
    setIsEditMode(true);
    setIsCreatingBucket(true);
    
    // Set loading state and clear any previous errors
    setLoadingBucketData(true);
    setDataFetchError(null);
    setRetryCount(0);
    
    // Fetch similar applications for the selected application (pilot or manual)
    const applicationName = selectedPilotId || manualApplicationName.trim();
    if (applicationName && projectId) {
      try {
        console.log('🔍 Fetching similar applications for:', applicationName, 'project:', projectId);
        
        // Fetch pilot application's tech stack data with retry
        console.log('🔍 Fetching pilot tech stack for:', applicationName);
        const pilotTechStack = await retryWithBackoff(
          () => fetchCompleteApplicationData([applicationName]),
          3,
          1000
        );
        const pilotData = pilotTechStack[0] || {};
        console.log('📊 Pilot tech stack data:', pilotData);
        
        // Fetch similar applications
        const similarAppsData = await getSimilarApplications(projectId, applicationName, 0);
        console.log('📊 getSimilarApplications response:', similarAppsData);
        console.log('📊 First similar app structure:', similarAppsData.similarApplications?.[0]);
        
        // Get application names for tech stack lookup
        const appNames = similarAppsData.similarApplications?.map(app => app.applicationName || app.name) || [];
        
        // Fetch complete tech stack data with retry
        const techStackData = await retryWithBackoff(
          () => fetchCompleteApplicationData(appNames),
          3,
          1000
        );
        console.log('📊 Tech stack data:', techStackData);
        
        // Merge similarity data with tech stack data
        const enhancedSimilarApps = similarAppsData.similarApplications?.map(app => {
          const techStack = techStackData.find(ts => ts.applicationName === (app.applicationName || app.name));
          return {
            ...app,
            runtime: techStack?.runtime || 'Not specified',
            framework: techStack?.framework || 'Not specified',
            databases: techStack?.databases || 'Not specified',
            integrations: techStack?.integrations || 'Not specified',
            storages: techStack?.storages || 'Not specified'
          };
        }) || [];
        
        // Update the bucket with enhanced similar applications AND pilot tech stack
        const updatedBucket = {
          ...newBucket,
          similarApps: enhancedSimilarApps,
          pilotTechStack: {
            runtime: pilotData.runtime || 'Not specified',
            framework: pilotData.framework || 'Not specified',
            databases: pilotData.databases || 'Not specified',
            integrations: pilotData.integrations || 'Not specified',
            storages: pilotData.storages || 'Not specified'
          }
        };
        console.log('📊 Updated bucket similarApps count:', updatedBucket.similarApps.length);
        setSelectedBucket(updatedBucket);
        setDataFetchError(null); // Clear any previous errors on success
      } catch (error) {
        console.error('❌ Error fetching similar applications after retries:', error);
        
        // Set error state to show warning with retry button
        setDataFetchError({
          message: error.message || 'Failed to fetch application data after multiple attempts',
          applicationName: applicationName
        });
        
        // Still show the bucket with empty similar apps and "Not specified" data
        setSelectedBucket({
          ...newBucket,
          similarApps: []
        });
      } finally {
        // Clear loading state
        setLoadingBucketData(false);
      }
    } else {
      setLoadingBucketData(false);
    }
  };

  // Handle manual retry of data fetch
  const handleRetryDataFetch = async () => {
    if (!selectedBucket || !dataFetchError) return;
    
    const applicationName = dataFetchError.applicationName;
    const currentRetry = retryCount + 1;
    setRetryCount(currentRetry);
    
    console.log(`🔄 Manual retry attempt ${currentRetry} for:`, applicationName);
    
    // Set loading state and clear error
    setLoadingBucketData(true);
    setDataFetchError(null);
    
    try {
      // Fetch pilot application's tech stack data with retry
      const pilotTechStack = await retryWithBackoff(
        () => fetchCompleteApplicationData([applicationName]),
        3,
        1000
      );
      const pilotData = pilotTechStack[0] || {};
      
      // Fetch similar applications
      const similarAppsData = await getSimilarApplications(projectId, applicationName, 0);
      
      // Get application names for tech stack lookup
      const appNames = similarAppsData.similarApplications?.map(app => app.applicationName || app.name) || [];
      
      // Fetch complete tech stack data with retry
      const techStackData = await retryWithBackoff(
        () => fetchCompleteApplicationData(appNames),
        3,
        1000
      );
      
      // Merge similarity data with tech stack data
      const enhancedSimilarApps = similarAppsData.similarApplications?.map(app => {
        const techStack = techStackData.find(ts => ts.applicationName === (app.applicationName || app.name));
        return {
          ...app,
          runtime: techStack?.runtime || 'Not specified',
          framework: techStack?.framework || 'Not specified',
          databases: techStack?.databases || 'Not specified',
          integrations: techStack?.integrations || 'Not specified',
          storages: techStack?.storages || 'Not specified'
        };
      }) || [];
      
      // Update the bucket with enhanced similar applications AND pilot tech stack
      const updatedBucket = {
        ...selectedBucket,
        similarApps: enhancedSimilarApps,
        pilotTechStack: {
          runtime: pilotData.runtime || 'Not specified',
          framework: pilotData.framework || 'Not specified',
          databases: pilotData.databases || 'Not specified',
          integrations: pilotData.integrations || 'Not specified',
          storages: pilotData.storages || 'Not specified'
        }
      };
      
      setSelectedBucket(updatedBucket);
      setDataFetchError(null);
      console.log('✅ Manual retry succeeded');
    } catch (error) {
      console.error('❌ Manual retry failed:', error);
      setDataFetchError({
        message: error.message || 'Failed to fetch application data',
        applicationName: applicationName
      });
    } finally {
      setLoadingBucketData(false);
    }
  };

  // Handle view bucket applications
  const handleViewBucketApplications = async (bucket) => {
    setSelectedBucket(bucket);
    setIsEditMode(false);
    setAppCurrentPageIndex(1);
    setAppFilterText('');
    
    // Fetch similar applications for the pilot in this bucket
    if (bucket.pilotApplicationName && projectId) {
      try {
        console.log('🔍 Fetching similar applications for view:', bucket.pilotApplicationName, 'project:', projectId);
        const similarAppsData = await getSimilarApplications(projectId, bucket.pilotApplicationName, 0);
        
        // Get application names for tech stack lookup
        const appNames = similarAppsData.similarApplications?.map(app => app.applicationName || app.name) || [];
        
        // Fetch complete tech stack data
        const techStackData = await fetchCompleteApplicationData(appNames);
        
        // Merge similarity data with tech stack data
        const enhancedSimilarApps = similarAppsData.similarApplications?.map(app => {
          const techStack = techStackData.find(ts => ts.applicationName === (app.applicationName || app.name));
          return {
            ...app,
            runtime: techStack?.runtime || 'Not specified',
            framework: techStack?.framework || 'Not specified',
            databases: techStack?.databases || 'Not specified',
            integrations: techStack?.integrations || 'Not specified',
            storages: techStack?.storages || 'Not specified'
          };
        }) || [];
        
        // Update the bucket with enhanced similar applications
        const updatedBucket = {
          ...bucket,
          similarApps: enhancedSimilarApps
        };
        setSelectedBucket(updatedBucket);
      } catch (error) {
        console.error('❌ Error fetching similar applications for view:', error);
      }
    }
  };

  // Get the pilot application data (from pilot results or portfolio)
  const getPilotApplicationData = () => {
    if (!selectedBucket) return null;
    
    // If we have pilot tech stack data from the bucket, use it
    if (selectedBucket.pilotTechStack) {
      return {
        applicationName: selectedBucket.pilotApplicationName,
        runtime: selectedBucket.pilotTechStack.runtime,
        framework: selectedBucket.pilotTechStack.framework,
        databases: selectedBucket.pilotTechStack.databases,
        integrations: selectedBucket.pilotTechStack.integrations,
        storages: selectedBucket.pilotTechStack.storages
      };
    }
    
    // First try to find in pilot applications
    const pilotApp = pilotApplications.find(app => app.applicationName === selectedBucket.pilotApplicationName);
    if (pilotApp) return pilotApp;
    
    // If not found in pilot results, try to find in all applications (portfolio)
    const portfolioApp = allApplications.find(app => app.applicationName === selectedBucket.pilotApplicationName);
    if (portfolioApp) {
      // Return portfolio app with default tech stack values
      return {
        applicationName: portfolioApp.applicationName,
        department: portfolioApp.department,
        criticality: portfolioApp.criticality,
        purpose: portfolioApp.purpose,
        runtime: 'Not specified',
        framework: 'Not specified',
        databases: 'Not specified'
      };
    }
    
    return null;
  };

  // Get enhanced application data with tech stack details
  const getEnhancedApplications = () => {
    if (!selectedBucket) return [];
    
    // Get similar apps from the bucket
    const similarApps = selectedBucket.similarApps || selectedBucket.applications || [];
    
    // If we have similar apps, filter based on similarity threshold
    if (similarApps.length > 0) {
      // Convert percentage to decimal for comparison (85% -> 0.85)
      const thresholdDecimal = (isEditMode ? editedSimilarityThreshold : selectedBucket.similarityThreshold) / 100;
      return similarApps.filter(app => (app.similarityScore || 0) >= thresholdDecimal);
    }
    
    return [];
  };

  // Filter applications based on filter text
  const filteredApplications = getEnhancedApplications().filter(app => {
    if (!appFilterText) return true;
    
    const filterTextLower = appFilterText.toLowerCase();
    
    // Check if application name matches filter text
    if ((app.applicationName && app.applicationName.toLowerCase().includes(filterTextLower)) ||
        (app.name && app.name.toLowerCase().includes(filterTextLower))) {
      return true;
    }
    
    // Check if department matches filter text
    if (app.department && app.department.toLowerCase().includes(filterTextLower)) {
      return true;
    }
    
    return false;
  });

  // Sort and paginate applications
  const sortedApplications = [...filteredApplications].sort((a, b) => {
    const sortingField = appSortingColumn.sortingField;
    
    if (sortingField === 'applicationName') {
      const nameA = a.applicationName || a.name || '';
      const nameB = b.applicationName || b.name || '';
      return appSortingDescending 
        ? nameB.localeCompare(nameA) 
        : nameA.localeCompare(nameB);
    } else if (sortingField === 'similarity') {
      return appSortingDescending 
        ? (b.similarityScore || 0) - (a.similarityScore || 0)
        : (a.similarityScore || 0) - (b.similarityScore || 0);
    } else if (sortingField === 'department') {
      const deptA = a.department || '';
      const deptB = b.department || '';
      return appSortingDescending 
        ? deptB.localeCompare(deptA) 
        : deptA.localeCompare(deptB);
    }
    
    return 0;
  });

  const paginatedApplications = sortedApplications.slice(
    (appCurrentPageIndex - 1) * appPageSize,
    appCurrentPageIndex * appPageSize
  );

  return (
    <Layout
      activeHref="/planning/application-grouping"
      toolsOpen={toolsOpen}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
      infoContent={
        <Box padding="l">
          <ApplicationGroupingInfoContent />
        </Box>
      }
    >
      <ContentLayout
        header={
          <Header 
            variant="h1"
            actions={
              <Button 
                iconName="download"
                onClick={() => navigateToExportWithCategory('application-grouping', navigate)}
              >
                {t('common:buttons.export')}
              </Button>
            }
          >
            {t('pages:applicationBuckets.title')}
          </Header>
        }
      >
        <SpaceBetween size="l">
          {error && (
            <Alert
              statusIconAriaLabel={t('components:common.error')}
              type="error"
              onDismiss={() => setError('')}
              dismissAriaLabel={t('components:common.closeAlert')}
              dismissible
            >
              {error}
            </Alert>
          )}

          {success && (
            <Alert
              statusIconAriaLabel={t('components:common.success')}
              type="success"
              onDismiss={() => setSuccess('')}
              dismissAriaLabel={t('components:common.closeAlert')}
              dismissible
            >
              {success}
            </Alert>
          )}

          <Table
          loading={loading}
          items={paginatedBuckets}
          selectedItems={selectedItems}
          onSelectionChange={({ detail }) => setSelectedItems(detail.selectedItems)}
          ariaLabels={{
            selectionGroupLabel: "Selection group",
            allItemsSelectionLabel: "Select all buckets",
            itemSelectionLabel: ({ name }) => `Select ${name}`
          }}
          columnDefinitions={[
            {
              id: "name",
              header: t('pages:applicationBuckets.bucketName'),
              cell: item => item.name,
              sortingField: "name"
            },
            {
              id: "pilotApplicationName",
              header: t('pages:applicationBuckets.pilotApplication'),
              cell: item => item.pilotApplicationName,
              sortingField: "pilotApplicationName"
            },
            {
              id: "similarityThreshold",
              header: t('pages:applicationBuckets.similarityThreshold'),
              cell: item => `${item.similarityThreshold}%`,
              sortingField: "similarityThreshold"
            },
            {
              id: "applicationCount",
              header: t('pages:applicationBuckets.applications'),
              cell: item => item.applicationCount,
              sortingField: "applicationCount"
            },
            {
              id: "actions",
              header: t('pages:applicationBuckets.actions'),
              cell: item => (
                <SpaceBetween direction="horizontal" size="xs">
                  <Button
                    iconName="edit"
                    variant="icon"
                    onClick={() => handleEditBucket(item)}
                    ariaLabel={`Edit ${item.name}`}
                  />
                  <Button
                    iconName="download"
                    variant="icon"
                    onClick={() => handleExportBucket(item)}
                    ariaLabel={`Export ${item.name} to CSV`}
                  />
                  <Button
                    iconName="remove"
                    variant="icon"
                    onClick={() => {
                      setBucketToDelete(item);
                      setShowDeleteModal(true);
                    }}
                    ariaLabel={`Delete ${item.name}`}
                  />
                </SpaceBetween>
              )
            }
          ]}
          filter={
            <TextFilter
              filteringText={filterText}
              filteringPlaceholder={t('pages:applicationBuckets.findBucketsOrApplications')}
              filteringAriaLabel={t('pages:applicationBuckets.filterBuckets')}
              onChange={({ detail }) => {
                setFilterText(detail.filteringText);
                setCurrentPageIndex(1);
              }}
            />
          }
          pagination={
            <Pagination
              currentPageIndex={currentPageIndex}
              onChange={({ detail }) => setCurrentPageIndex(detail.currentPageIndex)}
              pagesCount={Math.ceil(filteredBuckets.length / pageSize)}
              ariaLabels={{
                nextPageLabel: t('pages:applicationBuckets.nextPage'),
                previousPageLabel: t('pages:applicationBuckets.previousPage'),
                pageLabel: pageNumber => t('pages:applicationBuckets.pageOf', { pageNumber, totalPages: Math.ceil(filteredBuckets.length / pageSize) })
              }}
            />
          }
          preferences={
            <CollectionPreferences
              title={t('pages:applicationBuckets.preferences')}
              confirmLabel={t('pages:applicationBuckets.confirm')}
              cancelLabel={t('pages:applicationBuckets.cancel')}
              preferences={preferences}
              onConfirm={({ detail }) => setPreferences(detail)}
              pageSizePreference={{
                title: t('pages:applicationBuckets.pageSize'),
                options: [
                  { value: 10, label: t('pages:applicationBuckets.bucketsCount', { count: 10 }) },
                  { value: 20, label: t('pages:applicationBuckets.bucketsCount', { count: 20 }) },
                  { value: 50, label: t('pages:applicationBuckets.bucketsCount', { count: 50 }) }
                ]
              }}
              visibleContentPreference={{
                title: t('pages:applicationBuckets.selectVisibleColumns'),
                options: [
                  {
                    label: t('pages:applicationBuckets.bucketInformation'),
                    options: [
                      { id: "name", label: t('pages:applicationBuckets.bucketName') },
                      { id: "pilotApplicationName", label: t('pages:applicationBuckets.pilotApplication') },
                      { id: "similarityThreshold", label: t('pages:applicationBuckets.similarityThreshold') },
                      { id: "applicationCount", label: t('pages:applicationBuckets.applications') },
                      { id: "actions", label: t('pages:applicationBuckets.actions') }
                    ]
                  }
                ]
              }}
            />
          }
          sortingColumn={sortingColumn}
          sortingDescending={sortingDescending}
          onSortingChange={({ detail }) => {
            setSortingColumn(detail.sortingColumn);
            setSortingDescending(detail.isDescending);
          }}
          empty={
            <Box textAlign="center" color="inherit">
              <b>{t('pages:applicationBuckets.noBuckets')}</b>
              <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                {t('pages:applicationBuckets.noBucketsToDisplay')}
              </Box>
              <Button onClick={handleCreateBucket}>{t('pages:applicationBuckets.createBucket')}</Button>
            </Box>
          }
          header={
            <Header counter={`(${filteredBuckets.length})`}>
              {t('pages:applicationBuckets.applicationBuckets')}
            </Header>
          }
        />
        
        <Box textAlign="right" padding={{ top: "l" }}>
          <Button variant="primary" onClick={handleCreateBucket} disabled={!hasWriteAccess}>
            {t('pages:applicationBuckets.createBucket')}
          </Button>
        </Box>
        
        {/* Applications detail view */}
        {selectedBucket && (
          <Box padding={{ top: "xl" }}>
            <Container 
              header={
                <Header 
                  variant="h2"
                  actions={
                    <Button 
                      iconName="close" 
                      variant="icon" 
                      onClick={() => {
                        setSelectedBucket(null);
                        setIsEditMode(false);
                      }}
                      ariaLabel={t('components:common.closeApplicationsView')}
                    />
                  }
                >
                  {isEditMode ? t('pages:applicationBuckets.editBucket', { name: selectedBucket.name }) : t('pages:applicationBuckets.applicationsIn', { name: selectedBucket.name })}
                </Header>
              }
              footer={
                filteredApplications.length > 0 ? (
                  <Box textAlign="center">
                    <span>
                      {t('pages:applicationBuckets.showingApplications', { count: paginatedApplications.length, total: filteredApplications.length })}
                    </span>
                  </Box>
                ) : null
              }
            >
              {/* Data Fetch Error Alert */}
              {dataFetchError && (
                <Box padding={{ bottom: "l" }}>
                  <Alert
                    type="warning"
                    dismissible
                    onDismiss={() => setDataFetchError(null)}
                    action={
                      <Button
                        onClick={handleRetryDataFetch}
                        loading={loadingBucketData}
                      >
                        Retry
                      </Button>
                    }
                  >
                    <Box>
                      <Box variant="strong">Failed to fetch application data</Box>
                      <Box variant="p">
                        {dataFetchError.message}. The application details may be incomplete. 
                        Click "Retry" to attempt fetching the data again.
                      </Box>
                    </Box>
                  </Alert>
                </Box>
              )}
              
              {/* Pilot Application Table */}
              <Box padding={{ bottom: "l" }}>
                <Table
                  loading={loadingBucketData}
                  items={[getPilotApplicationData()].filter(Boolean)}
                  columnDefinitions={[
                    {
                      id: "applicationName",
                      header: t('pages:applicationBuckets.applicationName'),
                      cell: item => item.applicationName
                    },
                    {
                      id: "runtime",
                      header: t('pages:applicationBuckets.runtime'),
                      cell: item => item.runtime || t('pages:applicationBuckets.notSpecified')
                    },
                    {
                      id: "framework",
                      header: t('pages:applicationBuckets.framework'),
                      cell: item => item.framework || t('pages:applicationBuckets.notSpecified')
                    },
                    {
                      id: "databases",
                      header: t('pages:applicationBuckets.databases'),
                      cell: item => item.databases || t('pages:applicationBuckets.notSpecified')
                    },
                    {
                      id: "integrations",
                      header: t('pages:applicationBuckets.integrations'),
                      cell: item => item.integrations || t('pages:applicationBuckets.notSpecified')
                    },
                    {
                      id: "storage",
                      header: t('pages:applicationBuckets.storage'),
                      cell: item => item.storages || t('pages:applicationBuckets.notSpecified')
                    }
                  ]}
                  empty={
                    <Box textAlign="center" color="inherit">
                      <b>{t('pages:applicationBuckets.pilotApplicationNotFound')}</b>
                    </Box>
                  }
                  header={
                    <Header>
                      {t('pages:applicationBuckets.pilotApplicationDetails')}
                    </Header>
                  }
                  variant="embedded"
                />
              </Box>
              
              {/* Similarity Threshold Slider (only in edit mode) */}
              {isEditMode && (
                <Box padding={{ bottom: "l" }}>
                  <FormField
                    label={t('pages:applicationBuckets.similarityThresholdLabel')}
                    description={t('pages:applicationBuckets.similarityThresholdDescription')}
                  >
                    <Slider
                      value={editedSimilarityThreshold}
                      onChange={({ detail }) => setEditedSimilarityThreshold(detail.value)}
                      min={0}
                      max={100}
                      step={1}
                      formatLabel={value => `${value}%`}
                    />
                  </FormField>
                </Box>
              )}
              
              {/* Applications Table */}
              <Table
                loading={loadingBucketData}
                items={paginatedApplications}
                columnDefinitions={[
                  {
                    id: "applicationName",
                    header: t('pages:applicationBuckets.applicationName'),
                    cell: item => item.applicationName || item.name,
                    sortingField: "applicationName"
                  },
                  {
                    id: "runtime",
                    header: t('pages:applicationBuckets.runtime'),
                    cell: item => item.runtime || t('pages:applicationBuckets.notSpecified')
                  },
                  {
                    id: "framework",
                    header: t('pages:applicationBuckets.framework'),
                    cell: item => item.framework || t('pages:applicationBuckets.notSpecified')
                  },
                  {
                    id: "databases",
                    header: t('pages:applicationBuckets.databases'),
                    cell: item => item.databases || t('pages:applicationBuckets.notSpecified')
                  },
                  {
                    id: "integrations",
                    header: t('pages:applicationBuckets.integrations'),
                    cell: item => item.integrations
                  },
                  {
                    id: "storage",
                    header: t('pages:applicationBuckets.storage'),
                    cell: item => item.storages
                  },
                  {
                    id: "similarity",
                    header: t('pages:applicationBuckets.similarity'),
                    cell: item => `${Math.round((item.similarityScore || 0) * 100)}%`,
                    sortingField: "similarity"
                  }
                ]}
                filter={
                  <TextFilter
                    filteringText={appFilterText}
                    filteringPlaceholder={t('pages:applicationBuckets.findApplications')}
                    filteringAriaLabel={t('pages:applicationBuckets.filterApplications')}
                    onChange={({ detail }) => {
                      setAppFilterText(detail.filteringText);
                      setAppCurrentPageIndex(1);
                    }}
                  />
                }
                pagination={
                  <Pagination
                    currentPageIndex={appCurrentPageIndex}
                    onChange={({ detail }) => setAppCurrentPageIndex(detail.currentPageIndex)}
                    pagesCount={Math.ceil(filteredApplications.length / appPageSize)}
                    ariaLabels={{
                      nextPageLabel: t('pages:applicationBuckets.nextPage'),
                      previousPageLabel: t('pages:applicationBuckets.previousPage'),
                      pageLabel: pageNumber => t('pages:applicationBuckets.pageOf', { pageNumber, totalPages: Math.ceil(filteredApplications.length / appPageSize) })
                    }}
                  />
                }
                preferences={
                  <CollectionPreferences
                    title={t('common:general.preferences')}
                    confirmLabel={t('common:general.confirm')}
                    cancelLabel={t('common:general.cancel')}
                    preferences={appPreferences}
                    onConfirm={({ detail }) => setAppPreferences(detail)}
                    pageSizePreference={{
                      title: "Page size",
                      options: [
                        { value: 10, label: "10 applications" },
                        { value: 20, label: "20 applications" },
                        { value: 50, label: "50 applications" }
                      ]
                    }}
                    visibleContentPreference={{
                      title: "Select visible columns",
                      options: [
                        {
                          label: "Application information",
                          options: [
                            { id: "name", label: "Application name" },
                            { id: "component", label: "Component name" },
                            { id: "runtime", label: "Runtime" },
                            { id: "framework", label: "Framework" },
                            { id: "databases", label: "Databases" },
                            { id: "integrations", label: "Integrations" },
                            { id: "storage", label: "Storage" }
                          ]
                        }
                      ]
                    }}
                  />
                }
                sortingColumn={appSortingColumn}
                sortingDescending={appSortingDescending}
                onSortingChange={({ detail }) => {
                  setAppSortingColumn(detail.sortingColumn);
                  setAppSortingDescending(detail.isDescending);
                }}
                empty={
                  <Box textAlign="center" color="inherit">
                    <b>{t('pages:applicationBuckets.noApplications')}</b>
                    <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                      {t('pages:applicationBuckets.noApplicationsToDisplay')}
                    </Box>
                  </Box>
                }
                header={
                  <Header counter={`(${filteredApplications.length})`}>
                    {t('pages:applicationBuckets.applications')}
                  </Header>
                }
              />
            </Container>
            
            {/* Edit mode buttons */}
            {isEditMode && (
              <Box textAlign="right" padding={{ top: "l" }}>
                <Box float="right">
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button variant="primary" onClick={handleSaveBucket} disabled={!hasWriteAccess}>
                      {t('pages:applicationBuckets.save')}
                    </Button>
                    <Button variant="link" onClick={handleCancelEdit}>
                      {t('pages:applicationBuckets.cancel')}
                    </Button>
                  </SpaceBetween>
                </Box>
              </Box>
            )}
          </Box>
        )}
        </SpaceBetween>
        
        {/* Delete confirmation modal */}
        <Modal
          visible={showDeleteModal}
          onDismiss={() => {
            setShowDeleteModal(false);
            setBucketToDelete(null);
          }}
          header={t('pages:applicationBuckets.deleteBucket')}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => {
                  setShowDeleteModal(false);
                  setBucketToDelete(null);
                }}>
                  {t('pages:applicationBuckets.cancel')}
                </Button>
                <Button variant="primary" onClick={handleDeleteBucket} disabled={!hasWriteAccess}>
                  {t('pages:applicationBuckets.delete')}
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          {bucketToDelete && (
            <Box>
              {t('pages:applicationBuckets.confirmDeleteBucket', { name: bucketToDelete.name })}
              <br />
              {t('pages:applicationBuckets.actionCannotBeUndone')}
            </Box>
          )}
        </Modal>
        
        {/* Create bucket modal */}
        <Modal
          visible={showCreateModal}
          onDismiss={() => setShowCreateModal(false)}
          header={t('pages:applicationBuckets.createNewBucket')}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setShowCreateModal(false)}>
                  {t('pages:applicationBuckets.cancel')}
                </Button>
                <Button 
                  variant="primary" 
                  onClick={handleCreateBucketSubmit}
                  disabled={!newBucketName.trim() || (!selectedPilotId && !manualApplicationName.trim())}
                >
                  {t('pages:applicationBuckets.create')}
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="l">
            <FormField
              label={t('pages:applicationBuckets.bucketNameLabel')}
              description={t('pages:applicationBuckets.enterUniqueName')}
              errorText={bucketNameError}
            >
              <Input
                value={newBucketName}
                onChange={({ detail }) => {
                  setNewBucketName(detail.value);
                  setBucketNameError('');
                }}
                placeholder={t('pages:applicationBuckets.enterBucketName')}
              />
            </FormField>
            
            <FormField
              label={t('pages:applicationBuckets.pilotApplicationLabel')}
              description={t('pages:applicationBuckets.selectFromCandidates')}
            >
              <SpaceBetween size="s">
                <Select
                  selectedOption={
                    selectedPilotId 
                      ? { 
                          value: selectedPilotId, 
                          label: selectedPilotId
                        } 
                      : null
                  }
                  onChange={({ detail }) => {
                    setSelectedPilotId(detail.selectedOption?.value || '');
                    setManualApplicationName(''); // Clear manual input when selecting from dropdown
                  }}
                  options={pilotApplications.map(app => ({
                    value: app.applicationName,
                    label: app.applicationName
                  }))}
                  placeholder={t('pages:applicationBuckets.selectFromPilotCandidates', { count: pilotApplications.length })}
                />
                
                <Box>
                  <strong>{t('pages:applicationBuckets.orSearchAllApplications')}</strong>
                </Box>
                
                <Select
                  selectedOption={
                    manualApplicationName 
                      ? { 
                          value: manualApplicationName, 
                          label: manualApplicationName
                        } 
                      : null
                  }
                  onChange={({ detail }) => {
                    setManualApplicationName(detail.selectedOption?.value || '');
                    setSelectedPilotId(''); // Clear pilot selection when selecting from all apps
                  }}
                  options={allApplications
                    .filter(app => !pilotApplications.some(pilot => pilot.applicationName === app.applicationName))
                    .map(app => ({
                      value: app.applicationName,
                      label: app.applicationName
                    }))}
                  placeholder={t('pages:applicationBuckets.searchApplications', { count: allApplications.filter(app => !pilotApplications.some(pilot => pilot.applicationName === app.applicationName)).length })}
                  filteringType="auto"
                  filteringPlaceholder={t('pages:applicationBuckets.typeToSearchApplications')}
                  filteringAriaLabel={t('pages:applicationBuckets.filterApplicationsAriaLabel')}
                  empty={t('pages:applicationBuckets.noApplicationsFound')}
                />
              </SpaceBetween>
            </FormField>
            
            <Box color="text-body-secondary">
              <p>
                {t('pages:applicationBuckets.adjustSimilarityThreshold')}
              </p>
            </Box>
          </SpaceBetween>
        </Modal>
      </ContentLayout>
    </Layout>
  );
};

export default ApplicationGroupingPage;
