import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { navigateToExportWithCategory } from '../../utils/exportNavigationUtils';
import withResizeOptimization from '../../hoc/withResizeOptimization';
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
  FormField,
  Select,
  Input,
  ExpandableSection,
  ColumnLayout,
  Container,
  Alert,
  ButtonDropdown,
  Icon
} from '@cloudscape-design/components';

// Layouts
import Layout from '../../layouts/AppLayout';

// Components
import TCOInfoContent from '../../components/info/TCOInfoContent';

// Services
import { 
  fetchTCOEstimates, 
  fetchBucketsWithoutTCO, 
  createTCOEstimate, 
  deleteTCOEstimate,
  updateTCOEstimate
} from '../../services/tcoApi';
import { fetchApplicationBuckets, fetchBucketById } from '../../services/applicationBucketsApi';

// Hooks
import useProjectPermissions from '../../hooks/useProjectPermissions';

/**
 * TCO (Total Cost of Ownership) Page Component
 * 
 * This page displays TCO information for planning purposes.
 */
const TCOPage = () => {
  const { t } = useTranslation(['pages', 'common']);
  const navigate = useNavigate();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tcoEstimates, setTcoEstimates] = useState([]);
  const [bucketsWithoutTCO, setBucketsWithoutTCO] = useState([]);
  const [filterText, setFilterText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Helper function to get project ID
  const getProjectId = () => {
    try {
      const projectData = localStorage.getItem('selectedProject');
      if (projectData) {
        const project = JSON.parse(projectData);
        return project.projectId;
      }
    } catch (err) {
      console.error('Error loading project data:', err);
    }
    return null;
  };
  
  // Check project permissions
  const { hasWriteAccess, loading: permissionsLoading } = useProjectPermissions(getProjectId());
  
  const [selectedItems, setSelectedItems] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortingColumn, setSortingColumn] = useState({ sortingField: 'bucketName' });
  const [sortingDescending, setSortingDescending] = useState(false);
  const [preferences, setPreferences] = useState({
    pageSize: 10,
    visibleContent: ['bucketName', 'pilotApplicationName', 'period', 'utilizationSize', 'totalCost']
  });
  
  // State for create/edit TCO modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false); // New state for form section
  const [isEditMode, setIsEditMode] = useState(false); // Track if we're in edit mode
  const [editingTCO, setEditingTCO] = useState(null); // Store the TCO being edited
  const [selectedBucket, setSelectedBucket] = useState(null);
  const [utilizationSize, setUtilizationSize] = useState({ value: 'M', label: 'M' });
  const [periodType, setPeriodType] = useState({ value: 'days', label: 'Days' });
  const [periodValue, setPeriodValue] = useState('30');
  const [computeCost, setComputeCost] = useState('');
  const [databaseCost, setDatabaseCost] = useState('');
  const [integrationCost, setIntegrationCost] = useState('');
  const [storageCost, setStorageCost] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [bucketApplications, setBucketApplications] = useState([]);
  const [applicationCosts, setApplicationCosts] = useState({});
  const [isRestoringData, setIsRestoringData] = useState(false);
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [applicationsError, setApplicationsError] = useState('');

  // T-shirt size options
  const tShirtSizeOptions = [
    { value: 'XS', label: 'XS' },
    { value: 'S', label: 'S' },
    { value: 'M', label: 'M' },
    { value: 'L', label: 'L' },
    { value: 'XL', label: 'XL' },
    { value: 'XXL', label: 'XXL' }
  ];

  // Utilization size factors
  const utilizationFactors = {
    'XS': 0.5,
    'S': 0.75,
    'M': 1.0,
    'L': 1.5,
    'XL': 2.0,
    'XXL': 2.5
  };

  // Period type options
  const periodTypeOptions = [
    { value: 'hours', label: 'Hours' },
    { value: 'days', label: 'Days' }
  ];

  // Effect to fetch data on component mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const projectId = getProjectId();
        if (!projectId) {
          throw new Error('No project selected');
        }

        const [tcoData, bucketsData] = await Promise.all([
          fetchTCOEstimates(projectId),
          fetchBucketsWithoutTCO(projectId)
        ]);
        
        // Add minimal required fields for table rendering
        const processedTCOPromises = (tcoData || []).map(async tco => {
          // Use the saved totalCost from DynamoDB, don't recalculate
          const totalCost = tco.totalCost || 0;
          
          return {
            ...tco,
            id: tco.tcoId, // Table expects 'id' field
            bucketName: tco.bucketName || 'Unknown Bucket',
            pilotApplicationName: tco.pilotApplicationName || 'Unknown Pilot',
            totalCost: totalCost, // Use saved value
            period: `${tco.periodValue || 0} ${tco.periodType || 'days'}`
          };
        });
        
        const processedTCO = await Promise.all(processedTCOPromises);
        
        setTcoEstimates(processedTCO);
        setBucketsWithoutTCO(bucketsData || []);
      } catch (error) {
        console.error('Error fetching data:', error);
        setErrorMessage('Failed to load TCO data. Please try again.');
        setTcoEstimates([]);
        setBucketsWithoutTCO([]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  // Calculate total cost from cost components for a single application
  const calculateTotalCost = (costs) => {
    return costs.compute + costs.database + costs.integration + costs.storage;
  };
  
  // Calculate aggregated costs for all applications in a TCO
  const calculateAggregatedCosts = async (bucketId, pilotCosts, appCostsState = null) => {
    try {
      // Get all applications in the bucket
      const bucket = await fetchBucketById(bucketId, getProjectId());
      
      console.log('🔍 calculateAggregatedCosts - bucket:', bucket);
      console.log('🔍 calculateAggregatedCosts - bucket.applications:', bucket.applications);
      console.log('🔍 calculateAggregatedCosts - pilotCosts:', pilotCosts);
      
      // Start with the pilot costs
      const aggregatedCosts = { ...pilotCosts };
      
      // Use provided appCostsState or fall back to current state
      const currentAppCosts = appCostsState || applicationCosts;
      
      console.log('🔍 calculateAggregatedCosts - currentAppCosts:', currentAppCosts);
      
      // Add costs for each application based on similarity
      bucket.applications.forEach(app => {
        try {
          console.log('🔍 Processing app:', app);
          
          // Handle both decimal (0.87) and percentage (87) formats
          const similarity = app.similarityScore || app.similarity || 0;
          const similarityRatio = similarity > 1 ? similarity / 100 : similarity;
          
          console.log(`🔍 App similarity: ${similarity}, ratio: ${similarityRatio}`);
          
          // Get utilization factors
          const pilotUtilizationFactor = utilizationFactors[utilizationSize.value] || 1.0;
          const appKey = app.applicationName || app.name;
          const appUtilizationFactor = utilizationFactors[currentAppCosts[appKey]?.utilizationSize || utilizationSize.value] || 1.0;
          const utilizationRatio = appUtilizationFactor / pilotUtilizationFactor;
          
          console.log(`🔍 Utilization - pilot: ${pilotUtilizationFactor}, app: ${appUtilizationFactor}, ratio: ${utilizationRatio}`);
          
          // Calculate each application's full costs and add to aggregated total
          const computeAdd = (pilotCosts.compute || 0) * similarityRatio * utilizationRatio;
          const databaseAdd = (pilotCosts.database || 0) * similarityRatio * utilizationRatio;
          const integrationAdd = (pilotCosts.integration || 0) * similarityRatio * utilizationRatio;
          const storageAdd = (pilotCosts.storage || 0) * similarityRatio * utilizationRatio;
          
          console.log(`🔍 Adding costs - compute: ${computeAdd}, database: ${databaseAdd}, integration: ${integrationAdd}, storage: ${storageAdd}`);
          
          aggregatedCosts.compute += computeAdd;
          aggregatedCosts.database += databaseAdd;
          aggregatedCosts.integration += integrationAdd;
          aggregatedCosts.storage += storageAdd;
          
          console.log(`🔍 Aggregated costs after ${appKey}:`, aggregatedCosts);
        } catch (error) {
          const appKey = app.applicationName || app.name;
          console.error('Error calculating costs for app:', appKey, error);
        }
      });
      
      console.log('🔍 Final aggregated costs:', aggregatedCosts);
      
      return aggregatedCosts;
    } catch (error) {
      console.error('Error calculating aggregated costs:', error);
      return pilotCosts; // Fall back to pilot costs if there's an error
    }
  };

  // Filter TCO estimates based on filter text - temporarily disabled to prevent crashes
  const filteredTCO = tcoEstimates || [];
  
  /* TODO: Fix filtering logic - causing crashes
  const filteredTCO = (() => {
    try {
      return tcoEstimates.filter(tco => {
        if (!filterText) return true;
        
        const filterTextLower = filterText.toLowerCase();
        
        // Check if bucket name or pilot application name matches filter text
        if ((tco?.bucketName && tco.bucketName.toLowerCase().includes(filterTextLower)) || 
            (tco?.pilotApplicationName && tco.pilotApplicationName.toLowerCase().includes(filterTextLower))) {
          return true;
        }
        
        return false;
      });
    } catch (error) {
      console.error('Error filtering TCO data:', error);
      return [];
    }
  })();
  */

  // Sort and paginate TCO estimates
  const sortedTCO = [...filteredTCO].sort((a, b) => {
    const sortingField = sortingColumn.sortingField;
    
    if (sortingField === 'bucketName') {
      return sortingDescending 
        ? b.bucketName.localeCompare(a.bucketName) 
        : a.bucketName.localeCompare(b.bucketName);
    } else if (sortingField === 'pilotApplicationName') {
      return sortingDescending 
        ? b.pilotApplicationName.localeCompare(a.pilotApplicationName) 
        : a.pilotApplicationName.localeCompare(b.pilotApplicationName);
    } else if (sortingField === 'utilizationSize') {
      const sizeOrder = { 'XS': 1, 'S': 2, 'M': 3, 'L': 4, 'XL': 5, 'XXL': 6 };
      return sortingDescending 
        ? sizeOrder[b.utilizationSize] - sizeOrder[a.utilizationSize] 
        : sizeOrder[a.utilizationSize] - sizeOrder[b.utilizationSize];
    } else if (sortingField === 'totalCost') {
      return sortingDescending 
        ? b.totalCost - a.totalCost 
        : a.totalCost - b.totalCost;
    } else if (sortingField === 'period') {
      // Sort by period value first, then by period type
      if (a.periodType === b.periodType) {
        return sortingDescending 
          ? b.periodValue - a.periodValue 
          : a.periodValue - b.periodValue;
      } else {
        // Days are "larger" than hours
        return sortingDescending 
          ? (b.periodType === 'days' ? 1 : -1) 
          : (a.periodType === 'days' ? 1 : -1);
      }
    }
    
    return 0;
  });

  const paginatedTCO = sortedTCO.slice(
    (currentPageIndex - 1) * pageSize,
    currentPageIndex * pageSize
  );

  // Handle create TCO button click
  const handleCreateTCO = () => {
    // Reset form state
    setSelectedBucket(null);
    setUtilizationSize({ value: 'M', label: 'M' });
    setPeriodType({ value: 'days', label: 'Days' });
    setPeriodValue('30');
    setComputeCost('');
    setDatabaseCost('');
    setIntegrationCost('');
    setStorageCost('');
    setFormErrors({});
    
    // Show form section instead of modal
    setShowCreateForm(true);
  };

  // Retry helper for fetching bucket details
  const fetchBucketWithRetry = async (bucketId, projectId, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const bucket = await fetchBucketById(bucketId, projectId);
        return bucket;
      } catch (error) {
        console.warn(`⚠️ fetchBucketById attempt ${attempt}/${maxRetries} failed:`, error.message);
        if (attempt === maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  };

  // Handle bucket selection change
  const handleBucketChange = async ({ detail }) => {
    console.log('🔍 Selected option:', detail.selectedOption);
    setSelectedBucket(detail.selectedOption);
    setApplicationsError('');
    
    if (detail.selectedOption) {
      setLoadingApplications(true);
      setBucketApplications([]);
      setApplicationCosts({});
      try {
        // Fetch bucket details to get applications with retry
        const bucket = await fetchBucketWithRetry(detail.selectedOption.value, getProjectId());
        console.log('🔍 Bucket details:', bucket);
        
        // Sort applications by similarity score (descending)
        const sortedApps = [...(bucket.applications || [])].sort((a, b) => b.similarity - a.similarity);
        console.log('🔍 Sorted applications:', sortedApps);
        setBucketApplications(sortedApps);
        
        // Initialize application costs with default values
        const initialCosts = {};
        sortedApps.forEach(app => {
          const appKey = app.applicationName || app.name;
          initialCosts[appKey] = {
            utilizationSize: utilizationSize.value,
            periodType: periodType.value,
            periodValue: periodValue,
            costs: {
              compute: '',
              database: '',
              integration: '',
              storage: ''
            }
          };
        });
        setApplicationCosts(initialCosts);
      } catch (error) {
        console.error('Error fetching bucket details after retries:', error);
        setApplicationsError('Failed to load applications for this bucket. Please re-select the bucket to try again.');
      } finally {
        setLoadingApplications(false);
      }
    } else {
      setBucketApplications([]);
      setApplicationCosts({});
    }
  };
  
  // Check if all pilot costs are filled
  const arePilotCostsFilled = () => {
    return computeCost !== '' && 
           databaseCost !== '' && 
           integrationCost !== '' && 
           storageCost !== '';
  };

  // Calculate application costs based on similarity score
  const calculateApplicationCosts = () => {
    if (!arePilotCostsFilled() || !selectedBucket || bucketApplications.length === 0) {
      return;
    }

    const newCosts = { ...applicationCosts };
    
    console.log('🔍 Pilot costs:', { computeCost, databaseCost, integrationCost, storageCost });
    
    bucketApplications.forEach(app => {
      const appKey = app.applicationName || app.name;
      
      // Handle both decimal (0.87) and percentage (87) formats
      const similarity = app.similarityScore || app.similarity || 0;
      const similarityRatio = similarity > 1 ? similarity / 100 : similarity;
      
      console.log(`🔍 App ${appKey}: similarity ${similarity}, ratio ${similarityRatio}`);
      console.log(`🔍 App object:`, app);
      
      // Get utilization factors - use existing utilization size from newCosts if available
      const pilotUtilizationFactor = utilizationFactors[utilizationSize.value] || 1.0;
      const existingUtilizationSize = newCosts[appKey]?.utilizationSize || utilizationSize.value;
      const appUtilizationFactor = utilizationFactors[existingUtilizationSize] || 1.0;
      const utilizationRatio = appUtilizationFactor / pilotUtilizationFactor;
      
      console.log(`🔍 Utilization - Pilot: ${utilizationSize.value} (${pilotUtilizationFactor}), App: ${existingUtilizationSize} (${appUtilizationFactor}), Ratio: ${utilizationRatio}`);
      
      const calculatedCosts = {
        compute: (parseFloat(computeCost) * similarityRatio * utilizationRatio).toFixed(2),
        database: (parseFloat(databaseCost) * similarityRatio * utilizationRatio).toFixed(2),
        integration: (parseFloat(integrationCost) * similarityRatio * utilizationRatio).toFixed(2),
        storage: (parseFloat(storageCost) * similarityRatio * utilizationRatio).toFixed(2)
      };
      
      console.log(`🔍 Calculated costs for ${appKey}:`, calculatedCosts);
      
      newCosts[appKey] = {
        ...newCosts[appKey],
        costs: calculatedCosts
      };
    });
    
    console.log('🔍 Final newCosts:', newCosts);
    setApplicationCosts(newCosts);
  };

  // Effect to calculate application costs when pilot costs change
  useEffect(() => {
    // Only auto-calculate for new estimates, not when editing
    if (!isEditMode) {
      calculateApplicationCosts();
    }
  }, [computeCost, databaseCost, integrationCost, storageCost, bucketApplications, selectedBucket, utilizationSize]);

  // Effect to recalculate when ANY utilization size changes (pilot or similar apps)
  useEffect(() => {
    if (Object.keys(applicationCosts).length > 0) {
      calculateApplicationCosts();
    }
  }, [utilizationSize.value, JSON.stringify(Object.fromEntries(
    Object.entries(applicationCosts)
      .filter(([key, value]) => key !== 'undefined' && value?.utilizationSize)
      .map(([key, value]) => [key, value.utilizationSize])
  ))]);

  // Handle application cost change
  const handleApplicationCostChange = (appId, field, value) => {
    console.log('🔍 Changing', field, 'for', appId, 'to', value);
    
    setApplicationCosts(prevCosts => {
      const newCosts = { ...prevCosts };
      
      if (field === 'utilizationSize') {
        // Ensure the app object exists
        if (!newCosts[appId]) {
          newCosts[appId] = { costs: {} };
        }
        newCosts[appId] = {
          ...newCosts[appId],
          utilizationSize: value
        };
        
        console.log('🔍 Updated applicationCosts:', newCosts);
        
        // Let useEffect handle the recalculation
      } else if (field === 'periodType') {
        newCosts[appId] = {
          ...newCosts[appId],
          periodType: value
        };
      } else if (field === 'periodValue') {
        newCosts[appId] = {
          ...newCosts[appId],
          periodValue: value
        };
      } else {
        // Handle cost fields
        newCosts[appId] = {
          ...newCosts[appId],
          costs: {
            ...newCosts[appId].costs,
            [field]: value
          }
        };
      }
      
      return newCosts;
    });
  };

  // Handle form submission
  const handleSubmitTCO = async () => {
    console.log('🔍 Submitting TCO - isEditMode:', isEditMode, 'editingTCO:', editingTCO);
    
    // Validate form
    const errors = {};
    
    if (!selectedBucket) {
      errors.bucket = 'Please select a bucket';
    }
    
    if (!periodValue || isNaN(periodValue) || parseInt(periodValue) <= 0) {
      errors.periodValue = 'Please enter a valid period value';
    }
    
    if (!computeCost || isNaN(computeCost) || parseFloat(computeCost) < 0) {
      errors.computeCost = 'Please enter a valid compute cost';
    }
    
    if (!databaseCost || isNaN(databaseCost) || parseFloat(databaseCost) < 0) {
      errors.databaseCost = 'Please enter a valid database cost';
    }
    
    if (!integrationCost || isNaN(integrationCost) || parseFloat(integrationCost) < 0) {
      errors.integrationCost = 'Please enter a valid integration cost';
    }
    
    if (!storageCost || isNaN(storageCost) || parseFloat(storageCost) < 0) {
      errors.storageCost = 'Please enter a valid storage cost';
    }
    
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    
    try {
      let tcoData;
      
      if (isEditMode && editingTCO) {
        // Update existing TCO estimate
        const projectId = getProjectId();
        if (!projectId) {
          throw new Error('No project selected');
        }

        // Calculate aggregated costs for all applications in the bucket
        const aggregatedCosts = await calculateAggregatedCosts(
          editingTCO.bucketId, 
          {
            compute: parseFloat(computeCost),
            database: parseFloat(databaseCost),
            integration: parseFloat(integrationCost),
            storage: parseFloat(storageCost)
          },
          applicationCosts
        );
        
        const totalCost = calculateTotalCost(aggregatedCosts);
        const totalCostDetails = {
          compute: aggregatedCosts.compute,
          database: aggregatedCosts.database,
          integration: aggregatedCosts.integration,
          storage: aggregatedCosts.storage
        };

        // Filter applicationCosts to only include similar applications (not pilot or undefined)
        const filteredAppCosts = {};
        bucketApplications.forEach(app => {
          const appKey = app.applicationName || app.name;
          if (applicationCosts[appKey]) {
            filteredAppCosts[appKey] = applicationCosts[appKey];
          }
        });

        tcoData = await updateTCOEstimate(editingTCO.tcoId, {
          bucketId: editingTCO.bucketId,
          bucketName: editingTCO.bucketName,
          pilotApplicationId: editingTCO.pilotApplicationId,
          pilotApplicationName: editingTCO.pilotApplicationName,
          utilizationSize: utilizationSize.value,
          periodType: periodType.value,
          periodValue: parseInt(periodValue),
          totalCost: totalCost,
          totalCostDetails: totalCostDetails,
          applicationCosts: filteredAppCosts, // Only similar applications
          costs: {
            compute: parseFloat(computeCost),
            database: parseFloat(databaseCost),
            integration: parseFloat(integrationCost),
            storage: parseFloat(storageCost)
          }
        }, projectId);
        
        // Update the TCO in the list
        setTcoEstimates(prevTCOs => 
          prevTCOs.map(tco => 
            tco.tcoId === editingTCO.tcoId 
              ? { 
                  ...tcoData, 
                  totalCost: totalCost,
                  period: `${tcoData.periodValue} ${tcoData.periodType}`,
                  aggregatedCosts
                } 
              : tco
          )
        );
      } else {
        // Create new TCO estimate
        const projectId = getProjectId();
        if (!projectId) {
          throw new Error('No project selected');
        }

        // Calculate aggregated costs for all applications in the bucket
        const aggregatedCosts = await calculateAggregatedCosts(
          selectedBucket.value, 
          {
            compute: parseFloat(computeCost),
            database: parseFloat(databaseCost),
            integration: parseFloat(integrationCost),
            storage: parseFloat(storageCost)
          },
          applicationCosts
        );
        
        const totalCost = calculateTotalCost(aggregatedCosts);
        const totalCostDetails = {
          compute: aggregatedCosts.compute,
          database: aggregatedCosts.database,
          integration: aggregatedCosts.integration,
          storage: aggregatedCosts.storage
        };
        
        // Filter applicationCosts to only include similar applications (not pilot or undefined)
        const filteredAppCosts = {};
        bucketApplications.forEach(app => {
          const appKey = app.applicationName || app.name;
          if (applicationCosts[appKey]) {
            filteredAppCosts[appKey] = applicationCosts[appKey];
          }
        });
        
        tcoData = await createTCOEstimate({
          bucketId: selectedBucket.value,
          bucketName: selectedBucket.label,
          pilotApplicationId: selectedBucket.pilotApplicationId,
          pilotApplicationName: selectedBucket.pilotApplicationName,
          utilizationSize: utilizationSize.value,
          periodType: periodType.value,
          periodValue: parseInt(periodValue),
          totalCost: totalCost,
          totalCostDetails: totalCostDetails,
          applicationCosts: filteredAppCosts, // Only similar applications
          costs: {
            compute: parseFloat(computeCost),
            database: parseFloat(databaseCost),
            integration: parseFloat(integrationCost),
            storage: parseFloat(storageCost)
          }
        }, projectId);
        
        // Add calculated fields to the new TCO
        tcoData.totalCost = totalCost;
        tcoData.period = `${tcoData.periodValue} ${tcoData.periodType}`;
        tcoData.aggregatedCosts = aggregatedCosts;
        
        // Update state
        setTcoEstimates([...tcoEstimates, tcoData]);
        setBucketsWithoutTCO(bucketsWithoutTCO.filter(bucket => bucket.id !== selectedBucket.value));
      }
      
      
      // Hide form
      setShowCreateForm(false);
    } catch (error) {
      console.error('Error saving TCO estimate:', error);
      setFormErrors({ submit: error.message });
    }
  };

  // Handle delete TCO
  const handleDeleteTCO = async () => {
    if (selectedItems.length === 0) return;
    
    try {
      const projectId = getProjectId();
      if (!projectId) {
        throw new Error('No project selected');
      }

      await deleteTCOEstimate(selectedItems[0].tcoId, projectId);
      
      // Update state
      setTcoEstimates(tcoEstimates.filter(tco => tco.tcoId !== selectedItems[0].tcoId));
      setBucketsWithoutTCO([...bucketsWithoutTCO, {
        id: selectedItems[0].bucketId,
        name: selectedItems[0].bucketName,
        pilotApplicationId: selectedItems[0].pilotApplicationId,
        pilotApplicationName: selectedItems[0].pilotApplicationName
      }]);
      
      setSelectedItems([]);
      setShowDeleteModal(false);
    } catch (error) {
      console.error('Error deleting TCO estimate:', error);
    }
  };

  // Format currency
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  // Handle edit TCO
  const handleEditTCO = (item) => {
    console.log('🔍 Editing TCO item:', item);
    
    // Set edit mode
    setIsEditMode(true);
    setEditingTCO(item);
    
    // Populate form with item data
    setSelectedBucket({
      value: item.bucketId,
      label: item.bucketName,
      description: `Pilot: ${item.pilotApplicationName}`,
      pilotApplicationId: item.pilotApplicationId,
      pilotApplicationName: item.pilotApplicationName
    });
    
    // Restore application costs if they exist - use exactly what API returns
    if (item.applicationCosts) {
      setApplicationCosts(item.applicationCosts);
    }
    setUtilizationSize({ value: item.utilizationSize, label: item.utilizationSize });
    setPeriodType({ value: item.periodType, label: item.periodType === 'days' ? 'Days' : 'Hours' });
    setPeriodValue(item.periodValue.toString());
    setComputeCost(item.costs.compute.toString());
    setDatabaseCost(item.costs.database.toString());
    setIntegrationCost(item.costs.integration.toString());
    setStorageCost(item.costs.storage.toString());
    
    // Reset errors
    setFormErrors({});
    
    // Show form
    setShowCreateForm(true);
    
    // Fetch bucket applications
    setLoadingApplications(true);
    setApplicationsError('');
    fetchBucketWithRetry(item.bucketId, getProjectId())
      .then(bucket => {
        // Sort applications by similarity score (descending)
        const sortedApps = [...bucket.applications].sort((a, b) => b.similarity - a.similarity);
        setBucketApplications(sortedApps);
        
        // Initialize application costs
        const initialCosts = {};
        sortedApps.forEach(app => {
          initialCosts[app.id] = {
            utilizationSize: item.utilizationSize,
            periodType: item.periodType,
            periodValue: item.periodValue.toString(),
            costs: {
              compute: '',
              database: '',
              integration: '',
              storage: ''
            }
          };
        });
        setApplicationCosts(initialCosts);
        
        // Calculate application costs based on similarity
        calculateApplicationCosts();
      })
      .catch(error => {
        console.error('Error fetching bucket details after retries:', error);
        setApplicationsError('Failed to load applications for this bucket. Please try editing again.');
      })
      .finally(() => {
        setLoadingApplications(false);
      });
  };

  // Handle export TCO (placeholder for future implementation)
  const handleExportTCO = (item) => {
    console.log('Export TCO:', item);
    // TODO: Implement export functionality
    // This could export to PDF, Excel, CSV, etc.
    alert(`Export functionality for "${item.bucketName}" will be implemented in the future.`);
  };

  // Handle delete TCO from action column
  const handleDeleteTCOAction = (item) => {
    setSelectedItems([item]);
    setShowDeleteModal(true);
  };

  return (
    <Layout
      activeHref="/planning/tco-estimates"
      toolsOpen={toolsOpen}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
      infoContent={
        <Box padding="l">
          <TCOInfoContent />
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
                onClick={() => navigateToExportWithCategory('tco-estimates', navigate)}
              >
                {t('common:buttons.export')}
              </Button>
            }
          >
            {t('pages:tco.tcoEstimates')}
          </Header>
        }
      >
        <SpaceBetween size="l">
          <Table
            loading={loading}
            items={paginatedTCO}
            selectedItems={selectedItems}
            onSelectionChange={({ detail }) => setSelectedItems(detail.selectedItems)}
            ariaLabels={{
              selectionGroupLabel: "Selection group",
              allItemsSelectionLabel: "Select all TCO estimates",
              itemSelectionLabel: ({ bucketName }) => `Select ${bucketName}`
            }}
            columnDefinitions={[
              {
                id: "bucketName",
                header: "Bucket name",
                cell: item => item.bucketName,
                sortingField: "bucketName"
              },
              {
                id: "pilotApplicationName",
                header: "Pilot application",
                cell: item => item.pilotApplicationName,
                sortingField: "pilotApplicationName"
              },
              {
                id: "period",
                header: "Period",
                cell: item => `${item.periodValue} ${item.periodType}`,
                sortingField: "period"
              },
              {
                id: "utilizationSize",
                header: "Utilization size",
                cell: item => item.utilizationSize,
                sortingField: "utilizationSize"
              },
              {
                id: "totalCost",
                header: "Total cost",
                cell: item => (
                  <ExpandableSection
                    headerText={formatCurrency(item.totalCost)}
                    variant="footer"
                  >
                    <ColumnLayout columns={2} variant="text-grid">
                      <div>
                        <Box variant="awsui-key-label" fontSize="body-s">{t('pages:tco.compute')}</Box>
                        <Box fontSize="body-m">{formatCurrency(item.aggregatedCosts?.compute || item.costs.compute)}</Box>
                      </div>
                      <div>
                        <Box variant="awsui-key-label" fontSize="body-s">{t('pages:tco.database')}</Box>
                        <Box fontSize="body-m">{formatCurrency(item.aggregatedCosts?.database || item.costs.database)}</Box>
                      </div>
                      <div>
                        <Box variant="awsui-key-label" fontSize="body-s">{t('pages:tco.integration')}</Box>
                        <Box fontSize="body-m">{formatCurrency(item.aggregatedCosts?.integration || item.costs.integration)}</Box>
                      </div>
                      <div>
                        <Box variant="awsui-key-label" fontSize="body-s">{t('pages:tco.storage')}</Box>
                        <Box fontSize="body-m">{formatCurrency(item.aggregatedCosts?.storage || item.costs.storage)}</Box>
                      </div>
                    </ColumnLayout>
                  </ExpandableSection>
                ),
                sortingField: "totalCost"
              },
              {
                id: "actions",
                header: t('common.actions'),
                cell: item => (
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button
                      iconName="edit"
                      variant="icon"
                      onClick={() => handleEditTCO(item)}
                      ariaLabel={`Edit ${item.bucketName}`}
                    />
                    <Button
                      iconName="download"
                      variant="icon"
                      onClick={() => handleExportTCO(item)}
                      ariaLabel={`Export ${item.bucketName}`}
                    />
                    <Button
                      iconName="remove"
                      variant="icon"
                      onClick={() => handleDeleteTCOAction(item)}
                      ariaLabel={`Delete ${item.bucketName}`}
                    />
                  </SpaceBetween>
                )
              }
            ]}
            filter={
              <TextFilter
                filteringText={filterText}
                filteringPlaceholder={t('pages:tco.findTCOEstimates')}
                filteringAriaLabel={t('pages:tco.filterTCOEstimates')}
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
                pagesCount={Math.ceil(filteredTCO.length / pageSize)}
                ariaLabels={{
                  nextPageLabel: t('common.nextPage'),
                  previousPageLabel: t('common.previousPage'),
                  pageLabel: pageNumber => t('common.pageLabel', { pageNumber, totalPages: Math.ceil(filteredTCO.length / pageSize) })
                }}
              />
            }
            preferences={
              <CollectionPreferences
                title={t('common:preferences.title')}
                confirmLabel={t('common:buttons.confirm')}
                cancelLabel={t('common:buttons.cancel')}
                preferences={preferences}
                onConfirm={({ detail }) => setPreferences(detail)}
                pageSizePreference={{
                  title: t('common:preferences.pageSize'),
                  options: [
                    { value: 10, label: t('pages:tco.tenTCOEstimates') },
                    { value: 20, label: t('pages:tco.twentyTCOEstimates') },
                    { value: 50, label: t('pages:tco.fiftyTCOEstimates') }
                  ]
                }}
                visibleContentPreference={{
                  title: t('common:preferences.selectVisibleColumns'),
                  options: [
                    {
                      label: t('pages:tco.tcoInformation'),
                      options: [
                        { id: "bucketName", label: t('pages:tco.bucketName') },
                        { id: "pilotApplicationName", label: t('pages:tco.pilotApplication') },
                        { id: "period", label: t('pages:tco.period') },
                        { id: "utilizationSize", label: t('pages:tco.utilizationSize') },
                        { id: "totalCost", label: t('pages:tco.totalCost') },
                        { id: "actions", label: t('common.actions') }
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
            selectionType="single"
            empty={
              <Box textAlign="center" color="inherit">
                <b>{t('pages:tco.noTCOEstimates')}</b>
                <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                  {t('pages:tco.noTCOEstimatesToDisplay')}
                </Box>
              </Box>
            }
            header={
              <Header
                counter={`(${filteredTCO.length})`}
              >
                {t('pages:tco.tcoEstimates')}
              </Header>
            }
          />
          
          {/* Create TCO button below the table, aligned to the right */}
          <Box textAlign="right" padding={{ top: "l" }}>
            <Button 
              variant="primary" 
              onClick={handleCreateTCO}
              disabled={bucketsWithoutTCO.length === 0}
            >
              {t('pages:tco.createTCOEstimate')}
            </Button>
          </Box>
          
          {/* Create TCO Form Section */}
          {showCreateForm && (
            <Container 
              header={<Header variant="h2">{isEditMode ? t('pages:tco.editTCOEstimate') : t('pages:tco.createTCOEstimate')}</Header>}
              footer={
                <Box float="right">
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button variant="link" onClick={() => setShowCreateForm(false)}>
                      {t('common:buttons.cancel')}
                    </Button>
                    <Button 
                      variant="primary" 
                      onClick={handleSubmitTCO}
                      disabled={!hasWriteAccess}
                    >
                      {isEditMode ? t('common:buttons.saveChanges') : t('common:buttons.create')}
                    </Button>
                  </SpaceBetween>
                </Box>
              }
            >
              <SpaceBetween size="l">
                {formErrors.submit && (
                  <Alert type="error">
                    {formErrors.submit}
                  </Alert>
                )}
                
                <Container header={<Header variant="h3">{t('pages:tco.selectBucket')}</Header>}>
                  <FormField
                    label={t('pages:tco.applicationBucket')}
                    description={t('pages:tco.selectApplicationBucketDescription')}
                    errorText={formErrors.bucket}
                  >
                    <Select
                      selectedOption={selectedBucket}
                      onChange={handleBucketChange}
                      options={bucketsWithoutTCO.map(bucket => ({
                        value: bucket.bucketId,
                        label: bucket.name,
                        description: `${t('pages:tco.pilot')}: ${bucket.pilotApplicationName}`,
                        pilotApplicationId: bucket.pilotApplicationId,
                        pilotApplicationName: bucket.pilotApplicationName
                      }))}
                      placeholder={t('pages:tco.selectABucket')}
                      disabled={isEditMode} /* Disable bucket selection in edit mode */
                      empty={
                        <Box textAlign="center" color="inherit">
                          <b>{t('pages:tco.noBucketsAvailable')}</b>
                          <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                            {t('pages:tco.allBucketsHaveTCO')}
                          </Box>
                        </Box>
                      }
                    />
                    {selectedBucket && (
                      <div style={{ marginTop: '16px' }}>
                        <FormField label={t('pages:tco.pilotApplication')}>
                          <Box>{selectedBucket.pilotApplicationName || t('common.unknown')}</Box>
                        </FormField>
                      </div>
                    )}
                  </FormField>
                </Container>
                
                <Container header={<Header variant="h3">{t('pages:tco.utilizationInformation')}</Header>}>
                  <SpaceBetween size="l">
                    <FormField
                      label={t('pages:tco.utilizationSize')}
                      description={t('pages:tco.selectTShirtSize')}
                    >
                      <Select
                        selectedOption={utilizationSize}
                        onChange={({ detail }) => setUtilizationSize(detail.selectedOption)}
                        options={tShirtSizeOptions}
                      />
                    </FormField>
                    
                    <ColumnLayout columns={2}>
                      <FormField
                        label={t('pages:tco.periodType')}
                        description={t('pages:tco.selectPeriodType')}
                      >
                        <Select
                          selectedOption={periodType}
                          onChange={({ detail }) => setPeriodType(detail.selectedOption)}
                          options={periodTypeOptions}
                        />
                      </FormField>
                      
                      <FormField
                        label={t('pages:tco.periodValue')}
                        description={t('pages:tco.enterNumberOf', { periodType: periodType.value })}
                        errorText={formErrors.periodValue}
                      >
                        <Input
                          value={periodValue}
                          onChange={({ detail }) => setPeriodValue(detail.value)}
                          type="number"
                          placeholder={t('pages:tco.enterNumberOf', { periodType: periodType.value })}
                        />
                      </FormField>
                    </ColumnLayout>
                  </SpaceBetween>
                </Container>
                
                <Container header={<Header variant="h3">{t('pages:tco.costInformation')}</Header>}>
                  <ColumnLayout columns={2}>
                    <FormField
                      label={t('pages:tco.computeCost')}
                      description={t('pages:tco.enterComputeCost')}
                      errorText={formErrors.computeCost}
                    >
                      <Input
                        value={computeCost}
                        onChange={({ detail }) => setComputeCost(detail.value)}
                        type="number"
                        placeholder={t('pages:tco.enterComputeCost')}
                        inputMode="decimal"
                      />
                    </FormField>
                    
                    <FormField
                      label={t('pages:tco.databaseCost')}
                      description={t('pages:tco.enterDatabaseCost')}
                      errorText={formErrors.databaseCost}
                    >
                      <Input
                        value={databaseCost}
                        onChange={({ detail }) => setDatabaseCost(detail.value)}
                        type="number"
                        placeholder={t('pages:tco.enterDatabaseCost')}
                        inputMode="decimal"
                      />
                    </FormField>
                    
                    <FormField
                      label={t('pages:tco.integrationCost')}
                      description={t('pages:tco.enterIntegrationCost')}
                      errorText={formErrors.integrationCost}
                    >
                      <Input
                        value={integrationCost}
                        onChange={({ detail }) => setIntegrationCost(detail.value)}
                        type="number"
                        placeholder={t('pages:tco.enterIntegrationCost')}
                        inputMode="decimal"
                      />
                    </FormField>
                    
                    <FormField
                      label={t('pages:tco.storageCost')}
                      description={t('pages:tco.enterStorageCost')}
                      errorText={formErrors.storageCost}
                    >
                      <Input
                        value={storageCost}
                        onChange={({ detail }) => setStorageCost(detail.value)}
                        type="number"
                        placeholder={t('pages:tco.enterStorageCost')}
                        inputMode="decimal"
                      />
                    </FormField>
                  </ColumnLayout>
                  
                  {(computeCost || databaseCost || integrationCost || storageCost) && (
                    <Box padding={{ top: "l" }}>
                      <Header variant="h3">{t('pages:tco.totalCost')}</Header>
                      <Box variant="awsui-value-large">
                        {formatCurrency(
                          (parseFloat(computeCost) || 0) +
                          (parseFloat(databaseCost) || 0) +
                          (parseFloat(integrationCost) || 0) +
                          (parseFloat(storageCost) || 0)
                        )}
                      </Box>
                    </Box>
                  )}
                </Container>
              </SpaceBetween>
              
              {/* Applications in bucket table */}
              {loadingApplications && (
                <Container header={<Header variant="h3">{t('pages:tco.applicationsInBucket')}</Header>}>
                  <Box textAlign="center" padding="l">
                    <Box variant="p" color="text-body-secondary">Loading applications...</Box>
                  </Box>
                </Container>
              )}
              {applicationsError && (
                <Alert type="error" dismissible onDismiss={() => setApplicationsError('')}>
                  {applicationsError}
                </Alert>
              )}
              {!loadingApplications && bucketApplications.length > 0 && (
                <Container header={<Header variant="h3">{t('pages:tco.applicationsInBucket')}</Header>}>
                  <Box padding={{ bottom: "s" }}>
                    {!arePilotCostsFilled() ? (
                      <Alert type="info">
                        {t('pages:tco.fillCostFieldsMessage')}
                      </Alert>
                    ) : (
                      <Alert type="success">
                        {t('pages:tco.costsCalculatedMessage')}
                      </Alert>
                    )}
                  </Box>
                  <div style={{ overflow: 'visible', zIndex: 1 }}>
                    <Table
                      items={bucketApplications}
                      columnDefinitions={[
                      {
                        id: "name",
                        header: t('pages:tco.applicationName'),
                        cell: item => item.applicationName || item.name
                      },
                      {
                        id: "similarity",
                        header: t('pages:tco.similarityScore'),
                        cell: item => {
                          const similarity = item.similarityScore || item.similarity || 0;
                          return `${(similarity > 1 ? similarity : similarity * 100).toFixed(1)}%`;
                        }
                      },
                      {
                        id: "utilizationSize",
                        header: t('pages:tco.utilizationSize'),
                        cell: item => {
                          const appKey = item.applicationName || item.name;
                          return (
                            <Select
                              selectedOption={{ 
                                value: applicationCosts[appKey]?.utilizationSize || editingTCO?.applicationCosts?.[appKey]?.utilizationSize || utilizationSize.value, 
                                label: applicationCosts[appKey]?.utilizationSize || editingTCO?.applicationCosts?.[appKey]?.utilizationSize || utilizationSize.value 
                              }}
                              onChange={({ detail }) => handleApplicationCostChange(
                                appKey, 
                                'utilizationSize', 
                                detail.selectedOption.value
                              )}
                              options={tShirtSizeOptions}
                              disabled={!arePilotCostsFilled()}
                              expandToViewport={true}
                            />
                          );
                        }
                      },
                      {
                        id: "computeCost",
                        header: t('pages:tco.computeCost'),
                        cell: item => {
                          const appKey = item.applicationName || item.name;
                          return <Box>{formatCurrency(applicationCosts[appKey]?.costs?.compute || editingTCO?.applicationCosts?.[appKey]?.costs?.compute || 0)}</Box>;
                        }
                      },
                      {
                        id: "databaseCost",
                        header: t('pages:tco.databaseCost'),
                        cell: item => {
                          const appKey = item.applicationName || item.name;
                          return <Box>{formatCurrency(applicationCosts[appKey]?.costs?.database || editingTCO?.applicationCosts?.[appKey]?.costs?.database || 0)}</Box>;
                        }
                      },
                      {
                        id: "integrationCost",
                        header: t('pages:tco.integrationCost'),
                        cell: item => {
                          const appKey = item.applicationName || item.name;
                          return <Box>{formatCurrency(applicationCosts[appKey]?.costs?.integration || editingTCO?.applicationCosts?.[appKey]?.costs?.integration || 0)}</Box>;
                        }
                      },
                      {
                        id: "storageCost",
                        header: t('pages:tco.storageCost'),
                        cell: item => {
                          const appKey = item.applicationName || item.name;
                          return <Box>{formatCurrency(applicationCosts[appKey]?.costs?.storage || editingTCO?.applicationCosts?.[appKey]?.costs?.storage || 0)}</Box>;
                        }
                      }
                    ]}
                    sortingDisabled={true}
                    variant="embedded"
                    empty={
                      <Box textAlign="center" color="inherit">
                        <b>{t('pages:tco.noApplications')}</b>
                        <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                          {t('pages:tco.noApplicationsInBucket')}
                        </Box>
                      </Box>
                    }
                  />
                  </div>
                </Container>
              )}
              
              {/* Subtotal section for application costs */}
              {bucketApplications.length > 0 && arePilotCostsFilled() && (
                <Container header={<Header variant="h3">{t('pages:tco.costSummary')}</Header>}>
                  <ColumnLayout columns={2} variant="text-grid">
                    <div>
                      <Box variant="awsui-key-label">{t('pages:tco.totalComputeCost')}</Box>
                      <Box variant="awsui-value-large">
                        {formatCurrency(
                          Object.values(applicationCosts).reduce(
                            (sum, app) => sum + (parseFloat(app.costs.compute) || 0), 
                            parseFloat(computeCost) || 0
                          )
                        )}
                      </Box>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{t('pages:tco.totalDatabaseCost')}</Box>
                      <Box variant="awsui-value-large">
                        {formatCurrency(
                          Object.values(applicationCosts).reduce(
                            (sum, app) => sum + (parseFloat(app.costs.database) || 0), 
                            parseFloat(databaseCost) || 0
                          )
                        )}
                      </Box>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{t('pages:tco.totalIntegrationCost')}</Box>
                      <Box variant="awsui-value-large">
                        {formatCurrency(
                          Object.values(applicationCosts).reduce(
                            (sum, app) => sum + (parseFloat(app.costs.integration) || 0), 
                            parseFloat(integrationCost) || 0
                          )
                        )}
                      </Box>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{t('pages:tco.totalStorageCost')}</Box>
                      <Box variant="awsui-value-large">
                        {formatCurrency(
                          Object.values(applicationCosts).reduce(
                            (sum, app) => sum + (parseFloat(app.costs.storage) || 0), 
                            parseFloat(storageCost) || 0
                          )
                        )}
                      </Box>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">{t('pages:tco.grandTotal')}</Box>
                      <Box variant="awsui-value-large" color="text-status-success">
                        {formatCurrency(
                          Object.values(applicationCosts).reduce(
                            (sum, app) => sum + 
                              (parseFloat(app.costs.compute) || 0) + 
                              (parseFloat(app.costs.database) || 0) + 
                              (parseFloat(app.costs.integration) || 0) + 
                              (parseFloat(app.costs.storage) || 0), 
                            (parseFloat(computeCost) || 0) + 
                            (parseFloat(databaseCost) || 0) + 
                            (parseFloat(integrationCost) || 0) + 
                            (parseFloat(storageCost) || 0)
                          )
                        )}
                      </Box>
                    </div>
                  </ColumnLayout>
                </Container>
              )}
            </Container>
          )}
          
          {/* Delete confirmation modal */}
          <Modal
            visible={showDeleteModal}
            onDismiss={() => setShowDeleteModal(false)}
            header={t('pages:tco.deleteTCOEstimate')}
            footer={
              <Box float="right">
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" onClick={() => setShowDeleteModal(false)}>
                    {t('common:buttons.cancel')}
                  </Button>
                  <Button variant="primary" onClick={handleDeleteTCO} disabled={!hasWriteAccess}>
                    {t('common:buttons.delete')}
                  </Button>
                </SpaceBetween>
              </Box>
            }
          >
            {selectedItems.length > 0 && (
              <Box>
                {t('pages:tco.confirmDeleteMessage', { bucketName: selectedItems[0].bucketName })}
                <br />
                {t('pages:tco.actionCannotBeUndone')}
              </Box>
            )}
          </Modal>
        </SpaceBetween>
      </ContentLayout>
    </Layout>
  );
};

export default withResizeOptimization(TCOPage);
