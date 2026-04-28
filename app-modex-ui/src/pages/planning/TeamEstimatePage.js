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
  Textarea,
  Checkbox
} from '@cloudscape-design/components';

// Layouts
import Layout from '../../layouts/AppLayout';

// Components
import TeamEstimateInfoContent from '../../components/info/TeamEstimateInfoContent';

// Services
import {
  fetchTeamEstimates,
  fetchBucketsWithoutTeamEstimate,
  createTeamEstimate,
  deleteTeamEstimate,
  updateTeamEstimate
} from '../../services/teamEstimateApi';
import { fetchApplicationBuckets, fetchBucketById } from '../../services/applicationBucketsApi';
import { getTeamSkills } from '../../services/athenaQueryService';

// Hooks
import useProjectPermissions from '../../hooks/useProjectPermissions';

// Wrapper function to match expected interface
const getSkills = async () => {
  return await getTeamSkills();
};

// Parallelization constraint functions
const applyParallelizationConstraints = {
  developers: (rawCount) => {
    // Optimal range: 1-6 developers, diminishing returns after
    if (rawCount <= 6) return rawCount;
    return 6 + (rawCount - 6) * 0.5;
  },
  devops: (rawCount) => {
    // Optimal range: 1-3 DevOps, diminishing returns after
    if (rawCount <= 3) return rawCount;
    return 3 + (rawCount - 3) * 0.3;
  },
  architects: (rawCount) => {
    // Minimal benefit beyond 2 architects
    return Math.min(rawCount, 2);
  },
  testers: (rawCount) => {
    // Optimal range: 1-3 testers, diminishing returns after
    if (rawCount <= 3) return rawCount;
    return 3 + (rawCount - 3) * 0.4;
  }
};

/**
 * Team Estimate Page Component
 * 
 * This page displays Human Team Estimate information for planning purposes.
 */
const TeamEstimatePage = () => {
  const { t } = useTranslation(['pages', 'common']);
  const navigate = useNavigate();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [teamEstimates, setTeamEstimates] = useState([]);
  const [bucketsWithoutTeamEstimate, setBucketsWithoutTeamEstimate] = useState([]);
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
    visibleContent: ['bucketName', 'pilotApplicationName', 'period', 'complexitySize', 'totalResources']
  });

  // State for create/edit Team Estimate modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingTeamEstimate, setEditingTeamEstimate] = useState(null);
  const [selectedBucket, setSelectedBucket] = useState(null);
  const [complexitySize, setComplexitySize] = useState({ value: 'M', label: 'M - Medium' });
  const [periodType, setPeriodType] = useState({ value: 'weeks', label: 'Weeks' });
  const [periodValue, setPeriodValue] = useState('12');
  const [developersCount, setDevelopersCount] = useState('');
  const [architectsCount, setArchitectsCount] = useState('');
  const [testersCount, setTestersCount] = useState('');
  const [devopsCount, setDevopsCount] = useState('');
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [originalSelectedSkills, setOriginalSelectedSkills] = useState([]);
  const [formErrors, setFormErrors] = useState({});
  const [bucketApplications, setBucketApplications] = useState([]);
  const [applicationResources, setApplicationResources] = useState({});
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [applicationsError, setApplicationsError] = useState('');

  // Skills table state
  const [availableSkills, setAvailableSkills] = useState([]);
  const [skillsTableFilterText, setSkillsTableFilterText] = useState('');
  const [skillsTableCurrentPageIndex, setSkillsTableCurrentPageIndex] = useState(1);
  const [skillsTablePageSize, setSkillsTablePageSize] = useState(10);

  // New skill modal state
  const [showNewSkillModal, setShowNewSkillModal] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState('');
  const [newSkillErrors, setNewSkillErrors] = useState({});

  // Complexity size options (for project complexity)
  const complexitySizeOptions = [
    { value: 'XS', label: 'XS - Very Simple' },
    { value: 'S', label: 'S - Simple' },
    { value: 'M', label: 'M - Medium' },
    { value: 'L', label: 'L - Complex' },
    { value: 'XL', label: 'XL - Very Complex' },
    { value: 'XXL', label: 'XXL - Extremely Complex' }
  ];

  // Delivery mode options
  const deliveryModeOptions = [
    { value: 'Faster', label: 'Faster' },
    { value: 'Cheaper', label: 'Cheaper' }
  ];

  // Base resource distribution percentages (based on modernization project analysis)
  const baseResourceDistribution = {
    developers: 0.47,    // 47%
    devops: 0.28,        // 28%
    architects: 0.17,    // 17%
    testers: 0.08        // 8%
  };

  // Delivery mode multipliers
  const deliveryModeMultipliers = {
    Faster: {
      developers: 1.3,
      devops: 1.2,
      architects: 1.1,
      testers: 1.25,
      timeReduction: 0.85  // 15% time reduction
    },
    Cheaper: {
      developers: 0.8,
      devops: 0.85,
      architects: 0.9,
      testers: 0.75,
      timeExtension: 1.25  // 25% time extension
    }
  };

  // Complexity size factors (for scaling resources)
  const complexityFactors = {
    'XS': 0.5,
    'S': 0.75,
    'M': 1.0,
    'L': 1.5,
    'XL': 2.0,
    'XXL': 2.5
  };

  // Period type options
  const periodTypeOptions = [
    { value: 'weeks', label: 'Weeks' },
    { value: 'months', label: 'Months' }
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

        const [teamEstimateData, bucketsData, skillsData] = await Promise.all([
          fetchTeamEstimates(projectId),
          fetchBucketsWithoutTeamEstimate(projectId),
          getTeamSkills()
        ]);
        


        // Add minimal required fields for table rendering
        const processedTeamEstimates = (teamEstimateData || []).map(estimate => {
          const totalResources = calculateTotalResources(estimate.resources || {}, estimate.applicationResources || {});

          return {
            ...estimate,
            id: estimate.teamEstimateId,
            bucketName: estimate.bucketName || 'Unknown Bucket',
            pilotApplicationName: estimate.pilotApplicationName || 'Unknown Pilot',
            totalResources: totalResources,
            period: `${estimate.periodValue || 0} ${estimate.periodType || 'weeks'}`
          };
        });

        setTeamEstimates(processedTeamEstimates);
        setBucketsWithoutTeamEstimate(bucketsData || []);
        setAvailableSkills(skillsData || []);
      } catch (error) {
        console.error('Error fetching data:', error);
        setErrorMessage('Failed to load Team Estimate data. Please try again.');
        setTeamEstimates([]);
        setBucketsWithoutTeamEstimate([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Calculate total resources from resource components and application resources
  const calculateTotalResources = (resources, applicationResources = {}) => {
    // Pilot application resources
    const pilotResources = {
      developers: resources.developers || 0,
      architects: resources.architects || 0,
      testers: resources.testers || 0,
      devops: resources.devops || 0,
      totalPeople: (resources.developers || 0) + (resources.architects || 0) + (resources.testers || 0) + (resources.devops || 0),
      totalEffort: resources.totalEffort || 0
    };

    // Calculate totals across all applications
    let totalHoursAllApps = pilotResources.totalEffort;
    let totalApplications = 1; // Start with pilot application
    let totalDeveloperHours = 0;
    let totalArchitectHours = 0;
    let totalTesterHours = 0;
    let totalDevopsHours = 0;

    // Add application resources if they exist
    if (applicationResources && typeof applicationResources === 'object') {
      Object.values(applicationResources).forEach(appResource => {
        if (appResource && appResource.resources) {
          const appRes = appResource.resources;
          totalApplications++;
          
          // Calculate hours for each role (assuming standard work week)
          const hoursPerWeek = 40;
          const weeksDuration = 12; // Default duration, could be dynamic
          
          totalDeveloperHours += (appRes.developers || 0) * hoursPerWeek * weeksDuration;
          totalArchitectHours += (appRes.architects || 0) * hoursPerWeek * weeksDuration;
          totalTesterHours += (appRes.testers || 0) * hoursPerWeek * weeksDuration;
          totalDevopsHours += (appRes.devops || 0) * hoursPerWeek * weeksDuration;
          
          totalHoursAllApps += (appRes.totalEffort || 0);
        }
      });
    }

    return {
      // Pilot application resources (for expanded view)
      developers: pilotResources.developers,
      architects: pilotResources.architects,
      testers: pilotResources.testers,
      devops: pilotResources.devops,
      totalPeople: pilotResources.totalPeople,
      totalEffort: pilotResources.totalEffort,
      
      // Totals across all applications (for collapsed view)
      totalApplications: totalApplications,
      totalHoursAllApps: totalHoursAllApps,
      totalDeveloperHours: totalDeveloperHours,
      totalArchitectHours: totalArchitectHours,
      totalTesterHours: totalTesterHours,
      totalDevopsHours: totalDevopsHours
    };
  };

  // Filter Team estimates based on filter text
  const filteredTeamEstimates = teamEstimates || [];

  // Sort and paginate Team estimates
  const sortedTeamEstimates = [...filteredTeamEstimates].sort((a, b) => {
    const sortingField = sortingColumn.sortingField;

    if (sortingField === 'bucketName') {
      return sortingDescending
        ? b.bucketName.localeCompare(a.bucketName)
        : a.bucketName.localeCompare(b.bucketName);
    } else if (sortingField === 'pilotApplicationName') {
      return sortingDescending
        ? b.pilotApplicationName.localeCompare(a.pilotApplicationName)
        : a.pilotApplicationName.localeCompare(b.pilotApplicationName);
    } else if (sortingField === 'complexitySize') {
      const sizeOrder = { 'XS': 1, 'S': 2, 'M': 3, 'L': 4, 'XL': 5, 'XXL': 6 };
      return sortingDescending
        ? sizeOrder[b.complexitySize] - sizeOrder[a.complexitySize]
        : sizeOrder[a.complexitySize] - sizeOrder[b.complexitySize];
    } else if (sortingField === 'period') {
      if (a.periodType === b.periodType) {
        return sortingDescending
          ? b.periodValue - a.periodValue
          : a.periodValue - b.periodValue;
      } else {
        return sortingDescending
          ? (b.periodType === 'months' ? 1 : -1)
          : (a.periodType === 'months' ? 1 : -1);
      }
    }

    return 0;
  });

  const paginatedTeamEstimates = sortedTeamEstimates.slice(
    (currentPageIndex - 1) * pageSize,
    currentPageIndex * pageSize
  );

  // Handle create Team Estimate button click
  const handleCreateTeamEstimate = () => {
    // Reset form state
    setSelectedBucket(null);
    setComplexitySize({ value: 'M', label: 'M - Medium' });
    setPeriodType({ value: 'weeks', label: 'Weeks' });
    setPeriodValue('12');
    setDevelopersCount('');
    setArchitectsCount('');
    setTestersCount('');
    setDevopsCount('');
    setSelectedSkills([]);
    setOriginalSelectedSkills([]);
    setFormErrors({});
    setIsEditMode(false);
    setEditingTeamEstimate(null);

    // Show form section
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
    console.log('🔍 Selected bucket option:', detail.selectedOption);
    setSelectedBucket(detail.selectedOption);
    setApplicationsError('');

    if (detail.selectedOption) {
      setLoadingApplications(true);
      setBucketApplications([]);
      setApplicationResources({});
      try {
        // Fetch bucket details to get applications with retry
        console.log('🔍 Fetching bucket with ID:', detail.selectedOption.value);
        const bucket = await fetchBucketWithRetry(detail.selectedOption.value, getProjectId());
        console.log('🔍 Fetched bucket:', bucket);

        // Sort applications by similarity score (descending)
        const sortedApps = [...(bucket.applications || [])].sort((a, b) => b.similarity - a.similarity);
        console.log('🔍 Sorted applications:', sortedApps);
        console.log('🔍 Applications count:', sortedApps.length);
        setBucketApplications(sortedApps);

        // Initialize applicationResources with all applications and default complexity sizes
        const defaultAppResources = {};
        sortedApps.forEach(app => {
          const appKey = app.applicationName || app.name;
          defaultAppResources[appKey] = {
            complexitySize: complexitySize.value,
            deliveryMode: 'Faster', // Default delivery mode
            resources: {}
          };
        });
        setApplicationResources(defaultAppResources);
        console.log('🔍 Set applicationResources:', defaultAppResources);
      } catch (error) {
        console.error('Error fetching bucket details after retries:', error);
        setApplicationsError('Failed to load applications for this bucket. Please re-select the bucket to try again.');
      } finally {
        setLoadingApplications(false);
      }
    } else {
      setBucketApplications([]);
      setApplicationResources({});
    }
  };

  // Check if all pilot resources are filled
  const arePilotResourcesFilled = () => {
    return developersCount !== '' &&
      architectsCount !== '' &&
      testersCount !== '' &&
      devopsCount !== '';
  };

  // Calculate time required for an application based on the new algorithm
  const calculateTimeRequired = (appName) => {
    // Safety check for applicationResources
    if (!applicationResources || typeof applicationResources !== 'object') {
      return 0;
    }
    
    const appData = applicationResources[appName];
    if (!appData) return 0;

    const baseDuration = periodType.value === 'months' ? parseInt(periodValue) * 4 : parseInt(periodValue);
    const appComplexityFactor = complexityFactors[appData.complexitySize || complexitySize.value] || 1.0;
    const appDeliveryMode = appData.deliveryMode || 'Faster';
    
    const timeAdjustmentFactor = appDeliveryMode === 'Faster' 
      ? deliveryModeMultipliers.Faster.timeReduction 
      : deliveryModeMultipliers.Cheaper.timeExtension;

    return Math.ceil(baseDuration * appComplexityFactor * timeAdjustmentFactor);
  };

  // Calculate resources for a single application on-demand
  const calculateSingleApplicationResources = (appName) => {
    if (!arePilotResourcesFilled() || !applicationResources) {
      return null;
    }

    const app = bucketApplications.find(a => (a.applicationName || a.name) === appName);
    if (!app) return null;

    const appData = applicationResources[appName];
    if (!appData) return null;

    // Calculate pilot baseline
    const pilotTotalPeople = parseInt(developersCount) + parseInt(architectsCount) + parseInt(testersCount) + parseInt(devopsCount);
    const pilotDuration = periodType.value === 'months' ? parseInt(periodValue) * 4 : parseInt(periodValue);
    const pilotBaseEffort = pilotTotalPeople * pilotDuration;

    // Get current app settings
    const similarity = app.similarityScore || app.similarity || 0;
    const similarityFactor = similarity > 1 ? similarity / 100 : similarity;
    const appComplexitySize = appData.complexitySize || complexitySize.value;
    const appComplexityFactor = complexityFactors[appComplexitySize] || 1.0;
    const appDeliveryMode = appData.deliveryMode || 'Faster';
    const deliveryMultipliers = deliveryModeMultipliers[appDeliveryMode];

    // Calculate effort
    const applicationBaseEffort = pilotBaseEffort * similarityFactor * appComplexityFactor;
    const timeAdjustmentFactor = appDeliveryMode === 'Faster' 
      ? deliveryMultipliers.timeReduction 
      : deliveryMultipliers.timeExtension;
    const adjustedEffort = applicationBaseEffort * timeAdjustmentFactor;

    // Calculate role-specific resources
    const rawResources = {
      developers: (adjustedEffort * baseResourceDistribution.developers * deliveryMultipliers.developers) / pilotDuration,
      devops: (adjustedEffort * baseResourceDistribution.devops * deliveryMultipliers.devops) / pilotDuration,
      architects: (adjustedEffort * baseResourceDistribution.architects * deliveryMultipliers.architects) / pilotDuration,
      testers: (adjustedEffort * baseResourceDistribution.testers * deliveryMultipliers.testers) / pilotDuration
    };

    // Apply parallelization constraints
    const constrainedResources = {
      developers: Math.max(1, Math.ceil(applyParallelizationConstraints.developers(rawResources.developers))),
      devops: Math.max(1, Math.ceil(applyParallelizationConstraints.devops(rawResources.devops))),
      architects: Math.max(1, Math.ceil(applyParallelizationConstraints.architects(rawResources.architects))),
      testers: Math.max(1, Math.ceil(applyParallelizationConstraints.testers(rawResources.testers)))
    };

    return constrainedResources;
  };

  // Calculate application resources using the new algorithm
  const calculateApplicationResources = () => {
    if (!arePilotResourcesFilled() || !selectedBucket || bucketApplications.length === 0) {
      return;
    }

    const newResources = { ...applicationResources };

    // Calculate pilot baseline
    const pilotTotalPeople = parseInt(developersCount) + parseInt(architectsCount) + parseInt(testersCount) + parseInt(devopsCount);
    const pilotDuration = periodType.value === 'months' ? parseInt(periodValue) * 4 : parseInt(periodValue);
    const pilotBaseEffort = pilotTotalPeople * pilotDuration; // person-weeks

    bucketApplications.forEach(app => {
      // Step 1: Calculate similarity factor
      const similarity = app.similarityScore || app.similarity || 0;
      const similarityFactor = similarity > 1 ? similarity / 100 : similarity;

      // Step 2: Get complexity factor for this application
      const appKey = app.applicationName || app.name;
      const appComplexitySize = newResources[appKey]?.complexitySize || complexitySize.value;
      const appComplexityFactor = complexityFactors[appComplexitySize] || 1.0;

      // Step 3: Get delivery mode
      const appDeliveryMode = newResources[appKey]?.deliveryMode || 'Faster';
      const deliveryMultipliers = deliveryModeMultipliers[appDeliveryMode];



      // Step 4: Calculate base application effort
      const applicationBaseEffort = pilotBaseEffort * similarityFactor * appComplexityFactor;

      // Step 5: Apply delivery mode time adjustment
      const timeAdjustmentFactor = appDeliveryMode === 'Faster' 
        ? deliveryMultipliers.timeReduction 
        : deliveryMultipliers.timeExtension;
      
      const adjustedEffort = applicationBaseEffort * timeAdjustmentFactor;

      // Step 6: Calculate role-specific resources using percentage distribution
      const rawResources = {
        developers: (adjustedEffort * baseResourceDistribution.developers * deliveryMultipliers.developers) / pilotDuration,
        devops: (adjustedEffort * baseResourceDistribution.devops * deliveryMultipliers.devops) / pilotDuration,
        architects: (adjustedEffort * baseResourceDistribution.architects * deliveryMultipliers.architects) / pilotDuration,
        testers: (adjustedEffort * baseResourceDistribution.testers * deliveryMultipliers.testers) / pilotDuration
      };

      // Step 7: Apply parallelization constraints
      const constrainedResources = {
        developers: Math.max(1, Math.ceil(applyParallelizationConstraints.developers(rawResources.developers))),
        devops: Math.max(1, Math.ceil(applyParallelizationConstraints.devops(rawResources.devops))),
        architects: Math.max(1, Math.ceil(applyParallelizationConstraints.architects(rawResources.architects))),
        testers: Math.max(1, Math.ceil(applyParallelizationConstraints.testers(rawResources.testers)))
      };

      // Step 8: Calculate final metrics
      const totalPeople = constrainedResources.developers + constrainedResources.devops + constrainedResources.architects + constrainedResources.testers;
      const totalEffort = totalPeople * pilotDuration * 40; // Convert to person-hours for compatibility

      const calculatedResources = {
        ...constrainedResources,
        totalEffort: totalEffort,
        adjustmentFactors: {
          similarityFactor: similarityFactor,
          complexityFactor: appComplexityFactor,
          deliveryModeFactor: timeAdjustmentFactor
        }
      };

      newResources[appKey] = {
        ...newResources[appKey],
        resources: calculatedResources
      };
    });

    setApplicationResources(newResources);
  };

  // Effect to calculate application resources when pilot resources change
  useEffect(() => {
    if (!isEditMode && arePilotResourcesFilled()) {
      calculateApplicationResources();
    }
  }, [developersCount, architectsCount, testersCount, devopsCount, bucketApplications, selectedBucket, complexitySize]);



  // Handle application resource change
  const handleApplicationResourceChange = (appId, field, value) => {
    setApplicationResources(prevResources => {
      const newResources = { ...prevResources };

      if (field === 'complexitySize') {
        if (!newResources[appId]) {
          newResources[appId] = { resources: {} };
        }
        newResources[appId] = {
          ...newResources[appId],
          complexitySize: value
        };
      } else if (field === 'deliveryMode') {
        if (!newResources[appId]) {
          newResources[appId] = { resources: {} };
        }
        newResources[appId] = {
          ...newResources[appId],
          deliveryMode: value
        };
      } else {
        // Handle resource fields
        newResources[appId] = {
          ...newResources[appId],
          resources: {
            ...newResources[appId].resources,
            [field]: value
          }
        };
      }

      return newResources;
    });

    // Note: Individual app changes don't trigger full recalculation anymore
    // Only pilot resource changes trigger recalculation (via useEffect)
    // Individual app resources will be calculated on-demand when displayed
  };

  // Handle form submission
  const handleSubmitTeamEstimate = async () => {
    // Validate form
    const errors = {};

    if (!selectedBucket) {
      errors.bucket = 'Please select a bucket';
    }

    if (!periodValue || isNaN(periodValue) || parseInt(periodValue) <= 0) {
      errors.periodValue = 'Please enter a valid period value';
    }

    if (!developersCount || isNaN(developersCount) || parseInt(developersCount) < 0) {
      errors.developersCount = 'Please enter a valid number of developers';
    }

    if (!architectsCount || isNaN(architectsCount) || parseInt(architectsCount) < 0) {
      errors.architectsCount = 'Please enter a valid number of architects';
    }

    if (!testersCount || isNaN(testersCount) || parseInt(testersCount) < 0) {
      errors.testersCount = 'Please enter a valid number of testers';
    }

    if (!devopsCount || isNaN(devopsCount) || parseInt(devopsCount) < 0) {
      errors.devopsCount = 'Please enter a valid number of DevOps engineers';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      const projectId = getProjectId();
      if (!projectId) {
        throw new Error('No project selected');
      }

      const teamData = {
        bucketId: selectedBucket.value,
        bucketName: selectedBucket.label,
        pilotApplicationId: selectedBucket.pilotApplicationId,
        pilotApplicationName: selectedBucket.pilotApplicationName,
        complexitySize: complexitySize.value,
        periodType: periodType.value,
        periodValue: parseInt(periodValue),
        resources: {
          developers: parseInt(developersCount),
          architects: parseInt(architectsCount),
          testers: parseInt(testersCount),
          devops: parseInt(devopsCount),
          totalEffort: (parseInt(developersCount) + parseInt(architectsCount) + parseInt(testersCount) + parseInt(devopsCount)) * 40 * (periodType.value === 'months' ? parseInt(periodValue) * 4 : parseInt(periodValue))
        },
        skills: selectedSkills,
        applicationResources: applicationResources
      };

      let teamEstimateData;

      if (isEditMode && editingTeamEstimate) {
        // Update existing Team estimate
        teamEstimateData = await updateTeamEstimate(editingTeamEstimate.id, teamData, projectId);

        // Update the Team estimate in the list
        setTeamEstimates(prevEstimates =>
          prevEstimates.map(estimate =>
            estimate.id === editingTeamEstimate.id
              ? {
                ...teamEstimateData,
                totalResources: calculateTotalResources(teamEstimateData.resources, teamEstimateData.applicationResources),
                period: `${teamEstimateData.periodValue} ${teamEstimateData.periodType}`
              }
              : estimate
          )
        );
      } else {
        // Create new Team estimate
        teamEstimateData = await createTeamEstimate(teamData, projectId);

        // Add calculated fields to the new Team estimate
        teamEstimateData.totalResources = calculateTotalResources(teamEstimateData.resources, teamEstimateData.applicationResources);
        teamEstimateData.period = `${teamEstimateData.periodValue} ${teamEstimateData.periodType}`;

        // Update state
        setTeamEstimates([...teamEstimates, teamEstimateData]);
        setBucketsWithoutTeamEstimate(bucketsWithoutTeamEstimate.filter(bucket => bucket.id !== selectedBucket.value));
      }

      // Hide form
      setShowCreateForm(false);
    } catch (error) {
      console.error('Error saving Team estimate:', error);
      setFormErrors({ submit: error.message });
    }
  };

  // Handle delete Team Estimate
  const handleDeleteTeamEstimate = async () => {
    if (selectedItems.length === 0) return;

    try {
      const projectId = getProjectId();
      if (!projectId) {
        throw new Error('No project selected');
      }

      await deleteTeamEstimate(selectedItems[0].teamEstimateId, projectId);

      // Update state
      setTeamEstimates(teamEstimates.filter(estimate => estimate.teamEstimateId !== selectedItems[0].teamEstimateId));
      setBucketsWithoutTeamEstimate([...bucketsWithoutTeamEstimate, {
        id: selectedItems[0].bucketId,
        name: selectedItems[0].bucketName,
        pilotApplicationId: selectedItems[0].pilotApplicationId,
        pilotApplicationName: selectedItems[0].pilotApplicationName
      }]);

      setSelectedItems([]);
      setShowDeleteModal(false);
    } catch (error) {
      console.error('Error deleting Team estimate:', error);
    }
  };

  // Handle edit Team Estimate
  const handleEditTeamEstimate = (item) => {
    // Set edit mode
    setIsEditMode(true);
    setEditingTeamEstimate(item);

    // Populate form with item data
    setSelectedBucket({
      value: item.bucketId,
      label: item.bucketName,
      description: `Pilot: ${item.pilotApplicationName}`,
      pilotApplicationId: item.pilotApplicationId,
      pilotApplicationName: item.pilotApplicationName
    });

    if (item.applicationResources) {
      setApplicationResources(item.applicationResources);
    }
    setComplexitySize({ value: item.complexitySize, label: `${item.complexitySize} - ${item.complexitySize === 'XS' ? 'Very Simple' : item.complexitySize === 'S' ? 'Simple' : item.complexitySize === 'M' ? 'Medium' : item.complexitySize === 'L' ? 'Complex' : item.complexitySize === 'XL' ? 'Very Complex' : 'Extremely Complex'}` });
    setPeriodType({ value: item.periodType, label: item.periodType === 'weeks' ? 'Weeks' : 'Months' });
    setPeriodValue(item.periodValue.toString());
    setDevelopersCount(item.resources.developers.toString());
    setArchitectsCount(item.resources.architects.toString());
    setTestersCount(item.resources.testers.toString());
    setDevopsCount(item.resources.devops.toString());
    const itemSkills = item.skills || [];
    setSelectedSkills(itemSkills);
    setOriginalSelectedSkills(itemSkills);
    
    // Add any new skills from this estimate to available skills if they're not already there
    const newSkillsFromEstimate = itemSkills.filter(skill => skill.isNewSkill);
    if (newSkillsFromEstimate.length > 0) {
      setAvailableSkills(prevSkills => {
        const existingSkillIds = prevSkills.map(s => s.id);
        const skillsToAdd = newSkillsFromEstimate.filter(skill => !existingSkillIds.includes(skill.id));
        return [...prevSkills, ...skillsToAdd];
      });
    }

    // Reset errors
    setFormErrors({});

    // Show form
    setShowCreateForm(true);

    // Fetch bucket applications
    setLoadingApplications(true);
    setApplicationsError('');
    fetchBucketWithRetry(item.bucketId, getProjectId())
      .then(bucket => {
        const sortedApps = [...bucket.applications].sort((a, b) => b.similarity - a.similarity);
        setBucketApplications(sortedApps);
        
        // Initialize application resources if not already set, ensuring delivery mode is included
        if (!item.applicationResources || Object.keys(item.applicationResources).length === 0) {
          const defaultAppResources = {};
          sortedApps.forEach(app => {
            defaultAppResources[app.name] = {
              complexitySize: item.complexitySize,
              deliveryMode: 'Faster', // Default delivery mode
              resources: {}
            };
          });
          setApplicationResources(defaultAppResources);
        } else {
          // Ensure existing application resources have delivery mode
          const updatedAppResources = { ...item.applicationResources };
          sortedApps.forEach(app => {
            if (updatedAppResources[app.name] && !updatedAppResources[app.name].deliveryMode) {
              updatedAppResources[app.name].deliveryMode = 'Faster';
            }
          });
          setApplicationResources(updatedAppResources);
        }
      })
      .catch(error => {
        console.error('Error fetching bucket details after retries:', error);
        setApplicationsError('Failed to load applications for this bucket. Please try editing again.');
      })
      .finally(() => {
        setLoadingApplications(false);
      });
  };

  // Handle export Team Estimate (placeholder for future implementation)
  const handleExportTeamEstimate = (item) => {
    console.log('Export Team Estimate:', item);
    // TODO: Implement export functionality
    // This could export to PDF, Excel, CSV, etc.
    alert(t('pages:teamEstimate.exportFunctionalityMessage', { bucketName: item.bucketName }));
  };

  // Handle delete Team Estimate from action column
  const handleDeleteTeamEstimateAction = (item) => {
    setSelectedItems([item]);
    setShowDeleteModal(true);
  };

  // Handle skill selection toggle
  const handleSkillToggle = (skill, isSelected) => {
    if (isSelected) {
      setSelectedSkills([...selectedSkills, skill]);
    } else {
      setSelectedSkills(selectedSkills.filter(s => s.id !== skill.id));
    }
  };

  // Calculate changes count
  const calculateChangesCount = () => {
    const originalIds = new Set(originalSelectedSkills.map(s => s.id));
    const currentIds = new Set(selectedSkills.map(s => s.id));

    // Count additions and removals
    const additions = selectedSkills.filter(s => !originalIds.has(s.id)).length;
    const removals = originalSelectedSkills.filter(s => !currentIds.has(s.id)).length;

    return additions + removals;
  };

  // Handle save changes
  const handleSaveSkillChanges = () => {
    setOriginalSelectedSkills([...selectedSkills]);
  };

  // Handle new skill button click
  const handleNewSkill = () => {
    setNewSkillName('');
    setNewSkillCategory('');
    setNewSkillErrors({});
    setShowNewSkillModal(true);
  };

  // Handle new skill modal cancel
  const handleNewSkillCancel = () => {
    setNewSkillName('');
    setNewSkillCategory('');
    setNewSkillErrors({});
    setShowNewSkillModal(false);
  };

  // Handle new skill creation
  const handleCreateNewSkill = async () => {
    // Validate form
    const errors = {};

    if (!newSkillName.trim()) {
      errors.skillName = 'Please enter a skill name';
    }

    if (!newSkillCategory.trim()) {
      errors.skillCategory = 'Please enter a skill category';
    }

    // Check if skill already exists
    const existingSkill = availableSkills.find(skill =>
      skill.skill.toLowerCase() === newSkillName.trim().toLowerCase()
    );
    if (existingSkill) {
      errors.skillName = 'This skill already exists';
    }

    if (Object.keys(errors).length > 0) {
      setNewSkillErrors(errors);
      return;
    }

    // Create new skill locally (no API call)
    const newSkill = {
      id: `new-skill-${Date.now()}`, // Generate a temporary local ID
      skill: newSkillName.trim(),
      category: newSkillCategory.trim(),
      proficiency: 1, // Default to Novice
      team: 'New Skills',
      members: 0,
      notes: 'Newly added skill',
      isNewSkill: true // Flag to highlight this is a new skill not from API
    };

    // Add to available skills (local state only)
    setAvailableSkills([...availableSkills, newSkill]);

    // Automatically select the new skill
    setSelectedSkills([...selectedSkills, newSkill]);

    // Close modal
    handleNewSkillCancel();
  };

  // Filter available skills for table
  const filteredAvailableSkills = availableSkills.filter(skill => {
    if (!skillsTableFilterText) return true;
    const searchText = skillsTableFilterText.toLowerCase();
    return skill.skill.toLowerCase().includes(searchText) ||
      skill.category.toLowerCase().includes(searchText);
  });

  // Paginate available skills for table
  const paginatedAvailableSkills = filteredAvailableSkills.slice(
    (skillsTableCurrentPageIndex - 1) * skillsTablePageSize,
    skillsTableCurrentPageIndex * skillsTablePageSize
  ); return (
    <Layout
      activeHref="/planning/team-estimates"
      toolsOpen={toolsOpen}
      onToolsChange={({ detail }) => setToolsOpen(detail.open)}
      infoContent={
        <Box padding="l">
          <TeamEstimateInfoContent />
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
                onClick={() => navigateToExportWithCategory('team-estimates', navigate)}
              >
                {t('pages:teamEstimate.export')}
              </Button>
            }
          >
            {t('pages:teamEstimate.title')}
          </Header>
        }
      >
        <SpaceBetween size="l">
          <Table
            loading={loading}
            items={paginatedTeamEstimates}
            selectedItems={selectedItems}
            onSelectionChange={({ detail }) => setSelectedItems(detail.selectedItems)}
            ariaLabels={{
              selectionGroupLabel: t('pages:teamEstimate.selectionGroup'),
              allItemsSelectionLabel: t('pages:teamEstimate.selectAllTeamEstimates'),
              itemSelectionLabel: ({ bucketName }) => t('pages:teamEstimate.selectBucket', { bucketName })
            }}
            columnDefinitions={[
              {
                id: "bucketName",
                header: t('pages:teamEstimate.bucketName'),
                cell: item => item.bucketName,
                sortingField: "bucketName"
              },
              {
                id: "pilotApplicationName",
                header: t('pages:teamEstimate.pilotApplication'),
                cell: item => item.pilotApplicationName,
                sortingField: "pilotApplicationName"
              },
              {
                id: "period",
                header: t('pages:teamEstimate.period'),
                cell: item => `${item.periodValue} ${item.periodType}`,
                sortingField: "period"
              },
              {
                id: "complexitySize",
                header: t('pages:teamEstimate.applicationComplexity'),
                cell: item => item.complexitySize,
                sortingField: "complexitySize"
              },
              {
                id: "totalResources",
                header: t('pages:teamEstimate.teamResources'),
                cell: item => (
                  <ExpandableSection
                    headerText={t('pages:teamEstimate.expandableHeader', { hours: Math.round(item.totalResources?.totalHoursAllApps || item.totalResources?.totalEffort || 0).toLocaleString() })}
                    variant="footer"
                  >
                    <SpaceBetween size="s">
                      <div>
                        <Box variant="awsui-key-label" fontSize="body-s">{t('pages:teamEstimate.applicationsInEstimate')}</Box>
                        <Box fontSize="body-m">{item.totalResources?.totalApplications || 1}</Box>
                      </div>
                      
                      <ColumnLayout columns={2} variant="text-grid">
                        <div>
                          <Box variant="awsui-key-label" fontSize="body-s">{t('pages:teamEstimate.developerHours')}</Box>
                          <Box fontSize="body-m">{Math.round(item.totalResources?.totalDeveloperHours || (item.totalResources?.developers || 0) * 40 * 12).toLocaleString()}</Box>
                        </div>
                        <div>
                          <Box variant="awsui-key-label" fontSize="body-s">{t('pages:teamEstimate.architectHours')}</Box>
                          <Box fontSize="body-m">{Math.round(item.totalResources?.totalArchitectHours || (item.totalResources?.architects || 0) * 40 * 12).toLocaleString()}</Box>
                        </div>
                        <div>
                          <Box variant="awsui-key-label" fontSize="body-s">{t('pages:teamEstimate.testerHours')}</Box>
                          <Box fontSize="body-m">{Math.round(item.totalResources?.totalTesterHours || (item.totalResources?.testers || 0) * 40 * 12).toLocaleString()}</Box>
                        </div>
                        <div>
                          <Box variant="awsui-key-label" fontSize="body-s">{t('pages:teamEstimate.devopsHours')}</Box>
                          <Box fontSize="body-m">{Math.round(item.totalResources?.totalDevopsHours || (item.totalResources?.devops || 0) * 40 * 12).toLocaleString()}</Box>
                        </div>
                      </ColumnLayout>
                      
                      <div>
                        <Box variant="awsui-key-label" fontSize="body-s">{t('pages:teamEstimate.totalHoursAllApplications')}</Box>
                        <Box fontSize="body-m">{Math.round(item.totalResources?.totalHoursAllApps || item.totalResources?.totalEffort || 0).toLocaleString()}</Box>
                      </div>
                    </SpaceBetween>
                  </ExpandableSection>
                )
              },
              {
                id: "actions",
                header: t('pages:teamEstimate.actions'),
                cell: item => (
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button
                      iconName="edit"
                      variant="icon"
                      onClick={() => handleEditTeamEstimate(item)}
                      ariaLabel={t('pages:teamEstimate.editAriaLabel', { bucketName: item.bucketName })}
                    />
                    <Button
                      iconName="download"
                      variant="icon"
                      onClick={() => handleExportTeamEstimate(item)}
                      ariaLabel={t('pages:teamEstimate.exportAriaLabel', { bucketName: item.bucketName })}
                    />
                    <Button
                      iconName="remove"
                      variant="icon"
                      onClick={() => handleDeleteTeamEstimateAction(item)}
                      ariaLabel={t('pages:teamEstimate.deleteAriaLabel', { bucketName: item.bucketName })}
                    />
                  </SpaceBetween>
                )
              }
            ]}
            filter={
              <TextFilter
                filteringText={filterText}
                filteringPlaceholder={t('pages:teamEstimate.findTeamEstimates')}
                filteringAriaLabel={t('pages:teamEstimate.filterTeamEstimates')}
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
                pagesCount={Math.ceil(filteredTeamEstimates.length / pageSize)}
                ariaLabels={{
                  nextPageLabel: t('pages:teamEstimate.nextPage'),
                  previousPageLabel: t('pages:teamEstimate.previousPage'),
                  pageLabel: pageNumber => t('pages:teamEstimate.pageOf', { pageNumber, totalPages: Math.ceil(filteredTeamEstimates.length / pageSize) })
                }}
              />
            }
            preferences={
              <CollectionPreferences
                title={t('pages:teamEstimate.preferences')}
                confirmLabel={t('pages:teamEstimate.confirm')}
                cancelLabel={t('pages:teamEstimate.cancel')}
                preferences={preferences}
                onConfirm={({ detail }) => setPreferences(detail)}
                pageSizePreference={{
                  title: t('pages:teamEstimate.pageSize'),
                  options: [
                    { value: 10, label: t('pages:teamEstimate.teamEstimatesCount', { count: 10 }) },
                    { value: 20, label: t('pages:teamEstimate.teamEstimatesCount', { count: 20 }) },
                    { value: 50, label: t('pages:teamEstimate.teamEstimatesCount', { count: 50 }) }
                  ]
                }}
                visibleContentPreference={{
                  title: t('pages:teamEstimate.selectVisibleColumns'),
                  options: [
                    {
                      label: t('pages:teamEstimate.teamEstimateInformation'),
                      options: [
                        { id: "bucketName", label: t('pages:teamEstimate.bucketName') },
                        { id: "pilotApplicationName", label: t('pages:teamEstimate.pilotApplication') },
                        { id: "period", label: t('pages:teamEstimate.period') },
                        { id: "complexitySize", label: t('pages:teamEstimate.applicationComplexity') },
                        { id: "totalResources", label: t('pages:teamEstimate.teamResources') },
                        { id: "actions", label: t('pages:teamEstimate.actions') }
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
                <b>{t('pages:teamEstimate.noTeamEstimates')}</b>
                <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                  {t('pages:teamEstimate.noTeamEstimatesToDisplay')}
                </Box>
              </Box>
            }
            header={
              <Header
                counter={`(${filteredTeamEstimates.length})`}
              >
                {t('pages:teamEstimate.title')}
              </Header>
            }
          />

          {/* Create Team Estimate button below the table, aligned to the right */}
          <Box textAlign="right" padding={{ top: "l" }}>
            <Button
              variant="primary"
              onClick={handleCreateTeamEstimate}
              disabled={bucketsWithoutTeamEstimate.length === 0}
            >
              {t('pages:teamEstimate.createTeamEstimate')}
            </Button>
          </Box>

          {/* Create Team Estimate Form Section */}
          {showCreateForm && (
            <Container
              header={<Header variant="h2">{isEditMode ? t('pages:teamEstimate.editTeamEstimate') : t('pages:teamEstimate.createTeamEstimate')}</Header>}
              footer={
                <Box float="right">
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button variant="link" onClick={() => setShowCreateForm(false)}>
                      {t('pages:teamEstimate.cancel')}
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handleSubmitTeamEstimate}
                    >
                      {isEditMode ? t('pages:teamEstimate.saveChanges') : t('pages:teamEstimate.create')}
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

                <Container header={<Header variant="h3">{t('pages:teamEstimate.selectBucket')}</Header>}>
                  <FormField
                    label={t('pages:teamEstimate.applicationBucket')}
                    description={t('pages:teamEstimate.selectApplicationBucket')}
                    errorText={formErrors.bucket}
                  >
                    <Select
                      selectedOption={selectedBucket}
                      onChange={handleBucketChange}
                      options={bucketsWithoutTeamEstimate.map(bucket => ({
                        value: bucket.bucketId,
                        label: bucket.name,
                        description: `Pilot: ${bucket.pilotApplicationName}`,
                        pilotApplicationId: bucket.pilotApplicationId,
                        pilotApplicationName: bucket.pilotApplicationName
                      }))}
                      placeholder={t('pages:teamEstimate.selectABucket')}
                      disabled={isEditMode}
                      empty={
                        <Box textAlign="center" color="inherit">
                          <b>{t('pages:teamEstimate.noBucketsAvailable')}</b>
                          <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                            {t('pages:teamEstimate.allBucketsHaveEstimates')}
                          </Box>
                        </Box>
                      }
                    />
                    {selectedBucket && (
                      <div style={{ marginTop: '16px' }}>
                        <FormField label={t('pages:teamEstimate.pilotApplicationLabel')}>
                          <Box>{selectedBucket.pilotApplicationName || t('pages:teamEstimate.unknown')}</Box>
                        </FormField>
                      </div>
                    )}
                  </FormField>
                </Container>

                <Container header={<Header variant="h3">{t('pages:teamEstimate.complexityInformation')}</Header>}>
                  <SpaceBetween size="l">
                    <FormField
                      label={t('pages:teamEstimate.applicationComplexityLabel')}
                      description={t('pages:teamEstimate.selectTShirtSize')}
                    >
                      <Select
                        selectedOption={complexitySize}
                        onChange={({ detail }) => setComplexitySize(detail.selectedOption)}
                        options={complexitySizeOptions}
                      />
                    </FormField>

                    <ColumnLayout columns={2}>
                      <FormField
                        label={t('pages:teamEstimate.periodType')}
                        description={t('pages:teamEstimate.selectPeriodType')}
                      >
                        <Select
                          selectedOption={periodType}
                          onChange={({ detail }) => setPeriodType(detail.selectedOption)}
                          options={periodTypeOptions}
                        />
                      </FormField>

                      <FormField
                        label={t('pages:teamEstimate.periodValue')}
                        description={t('pages:teamEstimate.enterNumberOf', { periodType: periodType.value })}
                        errorText={formErrors.periodValue}
                      >
                        <Input
                          value={periodValue}
                          onChange={({ detail }) => setPeriodValue(detail.value)}
                          type="number"
                          placeholder={t('pages:teamEstimate.enterNumberOf', { periodType: periodType.value })}
                        />
                      </FormField>
                    </ColumnLayout>
                  </SpaceBetween>
                </Container>

                <Container header={<Header variant="h3">{t('pages:teamEstimate.teamRequirements')}</Header>}>
                  <ColumnLayout columns={2}>
                    <FormField
                      label={t('pages:teamEstimate.developers')}
                      description={t('pages:teamEstimate.numberOfDevelopers')}
                      errorText={formErrors.developersCount}
                    >
                      <Input
                        value={developersCount}
                        onChange={({ detail }) => setDevelopersCount(detail.value)}
                        type="number"
                        placeholder={t('pages:teamEstimate.enterNumberOfDevelopers')}
                      />
                    </FormField>

                    <FormField
                      label={t('pages:teamEstimate.architects')}
                      description={t('pages:teamEstimate.numberOfArchitects')}
                      errorText={formErrors.architectsCount}
                    >
                      <Input
                        value={architectsCount}
                        onChange={({ detail }) => setArchitectsCount(detail.value)}
                        type="number"
                        placeholder={t('pages:teamEstimate.enterNumberOfArchitects')}
                      />
                    </FormField>

                    <FormField
                      label={t('pages:teamEstimate.testers')}
                      description={t('pages:teamEstimate.numberOfTesters')}
                      errorText={formErrors.testersCount}
                    >
                      <Input
                        value={testersCount}
                        onChange={({ detail }) => setTestersCount(detail.value)}
                        type="number"
                        placeholder={t('pages:teamEstimate.enterNumberOfTesters')}
                      />
                    </FormField>

                    <FormField
                      label={t('pages:teamEstimate.devopsEngineers')}
                      description={t('pages:teamEstimate.numberOfDevopsEngineers')}
                      errorText={formErrors.devopsCount}
                    >
                      <Input
                        value={devopsCount}
                        onChange={({ detail }) => setDevopsCount(detail.value)}
                        type="number"
                        placeholder={t('pages:teamEstimate.enterNumberOfDevopsEngineers')}
                      />
                    </FormField>
                  </ColumnLayout>
                </Container>

                <Container header={<Header variant="h3">{t('pages:teamEstimate.requiredSkills')}</Header>}>
                  <Table
                    items={paginatedAvailableSkills}
                    columnDefinitions={[
                      {
                        id: "selected",
                        header: t('pages:teamEstimate.select'),
                        cell: item => (
                          <Checkbox
                            checked={selectedSkills.some(s => s.id === item.id)}
                            onChange={({ detail }) => handleSkillToggle(item, detail.checked)}
                          />
                        )
                      },
                      {
                        id: "skill",
                        header: t('pages:teamEstimate.skillName'),
                        cell: item => (
                          <Box>
                            {item.skill}
                            {item.isNewSkill && (
                              <Box display="inline" color="text-status-success" fontSize="body-s" fontWeight="bold" marginLeft="xs">
                                • {t('pages:teamEstimate.new')}
                              </Box>
                            )}
                          </Box>
                        )
                      },
                      {
                        id: "category",
                        header: t('pages:teamEstimate.category'),
                        cell: item => item.category
                      }
                    ]}
                    filter={
                      <TextFilter
                        filteringText={skillsTableFilterText}
                        filteringPlaceholder={t('pages:teamEstimate.findSkills')}
                        filteringAriaLabel={t('pages:teamEstimate.filterSkills')}
                        onChange={({ detail }) => {
                          setSkillsTableFilterText(detail.filteringText);
                          setSkillsTableCurrentPageIndex(1);
                        }}
                      />
                    }
                    pagination={
                      <Pagination
                        currentPageIndex={skillsTableCurrentPageIndex}
                        onChange={({ detail }) => setSkillsTableCurrentPageIndex(detail.currentPageIndex)}
                        pagesCount={Math.ceil(filteredAvailableSkills.length / skillsTablePageSize)}
                        ariaLabels={{
                          nextPageLabel: t('pages:teamEstimate.nextPage'),
                          previousPageLabel: t('pages:teamEstimate.previousPage'),
                          pageLabel: pageNumber => t('pages:teamEstimate.pageOf', { pageNumber, totalPages: Math.ceil(filteredAvailableSkills.length / skillsTablePageSize) })
                        }}
                      />
                    }
                    preferences={
                      <CollectionPreferences
                        title={t('pages:teamEstimate.preferences')}
                        confirmLabel={t('pages:teamEstimate.confirm')}
                        cancelLabel={t('pages:teamEstimate.cancel')}
                        preferences={{
                          pageSize: skillsTablePageSize,
                          visibleContent: ['selected', 'skill', 'category']
                        }}
                        onConfirm={({ detail }) => setSkillsTablePageSize(detail.pageSize)}
                        pageSizePreference={{
                          title: t('pages:teamEstimate.pageSize'),
                          options: [
                            { value: 5, label: t('pages:teamEstimate.skillsCount', { count: 5 }) },
                            { value: 10, label: t('pages:teamEstimate.skillsCount', { count: 10 }) },
                            { value: 20, label: t('pages:teamEstimate.skillsCount', { count: 20 }) }
                          ]
                        }}
                        visibleContentPreference={{
                          title: t('pages:teamEstimate.selectVisibleColumns'),
                          options: [
                            {
                              label: t('pages:teamEstimate.skillInformation'),
                              options: [
                                { id: "selected", label: t('pages:teamEstimate.select') },
                                { id: "skill", label: t('pages:teamEstimate.skillName') },
                                { id: "category", label: t('pages:teamEstimate.category') }
                              ]
                            }
                          ]
                        }}
                      />
                    }
                    variant="embedded"
                    empty={
                      <Box textAlign="center" color="inherit">
                        <b>{t('pages:teamEstimate.noSkillsAvailable')}</b>
                        <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                          {t('pages:teamEstimate.noSkillsFound')}
                        </Box>
                      </Box>
                    }
                    header={
                      <Header
                        counter={`(${filteredAvailableSkills.length})`}
                      >
                        {t('pages:teamEstimate.skills')}
                      </Header>
                    }
                  />
                  <Box textAlign="right" padding={{ top: "s" }}>
                    <SpaceBetween direction="horizontal" size="xs">
                      <Button
                        variant="normal"
                        onClick={handleNewSkill}
                      >
                        {t('pages:teamEstimate.newSkill')}
                      </Button>
                      <Button
                        variant="primary"
                        onClick={handleSaveSkillChanges}
                        disabled={calculateChangesCount() === 0 || !hasWriteAccess}
                      >
                        {calculateChangesCount() > 0
                          ? t('pages:teamEstimate.saveChangesCount', { count: calculateChangesCount() })
                          : t('pages:teamEstimate.saveChanges')
                        }
                      </Button>
                    </SpaceBetween>
                  </Box>

                  {(developersCount || architectsCount || testersCount || devopsCount) && (
                    <Box padding={{ top: "l" }}>
                      <Header variant="h3">{t('pages:teamEstimate.teamSummary')}</Header>
                      <ColumnLayout columns={2} variant="text-grid">
                        <div>
                          <Box variant="awsui-key-label">{t('pages:teamEstimate.totalTeamSize')}</Box>
                          <Box variant="awsui-value-large">
                            {(parseInt(developersCount) || 0) +
                              (parseInt(architectsCount) || 0) +
                              (parseInt(testersCount) || 0) +
                              (parseInt(devopsCount) || 0)} {t('pages:teamEstimate.people')}
                          </Box>
                        </div>
                        <div>
                          <Box variant="awsui-key-label">{t('pages:teamEstimate.totalEffort')}</Box>
                          <Box variant="awsui-value-large">
                            {((parseInt(developersCount) || 0) +
                              (parseInt(architectsCount) || 0) +
                              (parseInt(testersCount) || 0) +
                              (parseInt(devopsCount) || 0)) * 40 *
                              (periodType.value === 'months' ? parseInt(periodValue) * 4 : parseInt(periodValue))} {t('pages:teamEstimate.hours')}
                          </Box>
                        </div>
                      </ColumnLayout>
                    </Box>
                  )}
                </Container>

                {/* Applications in bucket table */}

                {loadingApplications && (
                  <Container header={<Header variant="h3">{t('pages:teamEstimate.applicationsInBucketHeader')}</Header>}>
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
                  <Container header={<Header variant="h3">{t('pages:teamEstimate.applicationsInBucketHeader')}</Header>}>
                    <Box padding={{ bottom: "s" }}>
                      {!arePilotResourcesFilled() ? (
                        <Alert type="info">
                          {t('pages:teamEstimate.fillCostFieldsMessage')}
                        </Alert>
                      ) : (
                        <Alert type="success">
                          {t('pages:teamEstimate.costsCalculatedMessage')}
                        </Alert>
                      )}
                    </Box>
                    <div style={{ overflow: 'visible', zIndex: 1 }}>
                      <Table
                        items={bucketApplications}
                        columnDefinitions={[
                          {
                            id: "name",
                            header: t('pages:teamEstimate.applicationNameHeader'),
                            cell: item => item.applicationName || item.name
                          },
                          {
                            id: "similarity",
                            header: t('pages:teamEstimate.similarityScoreHeader'),
                            cell: item => {
                              const similarity = item.similarityScore || item.similarity || 0;
                              return `${(similarity > 1 ? similarity : similarity * 100).toFixed(1)}%`;
                            }
                          },
                          {
                            id: "complexitySize",
                            header: t('pages:teamEstimate.applicationComplexity'),
                            cell: item => {
                              const appKey = item.applicationName || item.name;
                              return (
                                <Select
                                  selectedOption={{
                                    value: applicationResources?.[appKey]?.complexitySize || complexitySize.value,
                                    label: applicationResources?.[appKey]?.complexitySize || complexitySize.value
                                  }}
                                  onChange={({ detail }) => handleApplicationResourceChange(
                                    appKey,
                                    'complexitySize',
                                    detail.selectedOption.value
                                  )}
                                  options={complexitySizeOptions}
                                  disabled={!arePilotResourcesFilled()}
                                  expandToViewport={true}
                                />
                              );
                            }
                          },
                          {
                            id: "deliveryMode",
                            header: t('pages:teamEstimate.deliveryModeHeader'),
                            cell: item => {
                              const appKey = item.applicationName || item.name;
                              return (
                                <Select
                                  selectedOption={{
                                    value: applicationResources?.[appKey]?.deliveryMode || 'Faster',
                                    label: applicationResources?.[appKey]?.deliveryMode || 'Faster'
                                  }}
                                  onChange={({ detail }) => handleApplicationResourceChange(
                                    appKey,
                                    'deliveryMode',
                                    detail.selectedOption.value
                                  )}
                                  options={deliveryModeOptions}
                                  disabled={!arePilotResourcesFilled()}
                                  expandToViewport={true}
                                />
                              );
                            }
                          },
                          {
                            id: "timeRequired",
                            header: t('pages:teamEstimate.timeRequiredHeader'),
                            cell: item => {
                              if (!arePilotResourcesFilled()) {
                                return "---";
                              }
                              
                              const appKey = item.applicationName || item.name;
                              const timeRequired = calculateTimeRequired(appKey);
                              return `${timeRequired} ${timeRequired === 1 ? t('pages:teamEstimate.week') : t('pages:teamEstimate.weeks')}`;
                            }
                          },
                          {
                            id: "calculatedResources",
                            header: t('pages:teamEstimate.calculatedResourcesHeader'),
                            cell: item => {
                              // Show placeholder if pilot resources not filled
                              if (!arePilotResourcesFilled()) {
                                return "---";
                              }
                              
                              // Calculate resources on-demand using current app settings
                              const appKey = item.applicationName || item.name;
                              const resources = calculateSingleApplicationResources(appKey);
                              
                              if (!resources) {
                                return (
                                  <Box color="text-body-secondary" fontSize="body-s">
                                    {t('pages:teamEstimate.calculatingText')}
                                  </Box>
                                );
                              }
                              
                              const totalPeople = resources.developers + resources.architects + resources.testers + resources.devops;
                              
                              return (
                                <ExpandableSection
                                  headerText={`${totalPeople} ${t('pages:teamEstimate.peopleText')}`}
                                  variant="footer"
                                >
                                  <ColumnLayout columns={2} variant="text-grid">
                                    <div>
                                      <Box variant="awsui-key-label">{t('pages:teamEstimate.developersLabel')}</Box>
                                      <Box>{resources.developers}</Box>
                                    </div>
                                    <div>
                                      <Box variant="awsui-key-label">{t('pages:teamEstimate.devopsLabel')}</Box>
                                      <Box>{resources.devops}</Box>
                                    </div>
                                    <div>
                                      <Box variant="awsui-key-label">{t('pages:teamEstimate.architectsLabel')}</Box>
                                      <Box>{resources.architects}</Box>
                                    </div>
                                    <div>
                                      <Box variant="awsui-key-label">{t('pages:teamEstimate.testersLabel')}</Box>
                                      <Box>{resources.testers}</Box>
                                    </div>
                                  </ColumnLayout>
                                  {resources.adjustmentFactors && (
                                    <Box marginTop="s">
                                      <Box variant="awsui-key-label">{t('pages:teamEstimate.adjustmentFactors')}</Box>
                                      <Box fontSize="body-s">
                                        {t('pages:teamEstimate.similarity')}: {(resources.adjustmentFactors.similarityFactor * 100).toFixed(0)}% • 
                                        {t('pages:teamEstimate.complexity')}: {resources.adjustmentFactors.complexityFactor}× • 
                                        {t('pages:teamEstimate.delivery')}: {resources.adjustmentFactors.deliveryModeFactor}×
                                      </Box>
                                    </Box>
                                  )}
                                </ExpandableSection>
                              );
                            }
                          }
                        ]}
                        sortingDisabled={true}
                        variant="embedded"
                        empty={
                          <Box textAlign="center" color="inherit">
                            <b>{t('pages:teamEstimate.noApplicationsHeader')}</b>
                            <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                              {t('pages:teamEstimate.noApplicationsInBucketText')}
                            </Box>
                          </Box>
                        }
                      />
                    </div>
                  </Container>
                )}

                {/* Time Summary section for application resources */}
                {bucketApplications.length > 0 && arePilotResourcesFilled() && (
                  <Container header={<Header variant="h3">{t('pages:teamEstimate.timeSummaryHeader')}</Header>}>
                    <ColumnLayout columns={2} variant="text-grid">
                      <div>
                        <Box variant="awsui-key-label">{t('pages:teamEstimate.totalApplications')}</Box>
                        <Box variant="awsui-value-large">
                          {bucketApplications.length + 1} {/* +1 for pilot */}
                        </Box>
                      </div>
                      <div>
                        <Box variant="awsui-key-label">{t('pages:teamEstimate.totalTeamSizeLabel')}</Box>
                        <Box variant="awsui-value-large">
                          {Object.values(applicationResources || {}).reduce(
                            (sum, app) => sum +
                              (app?.resources?.developers || 0) +
                              (app?.resources?.architects || 0) +
                              (app?.resources?.testers || 0) +
                              (app?.resources?.devops || 0),
                            (parseInt(developersCount) || 0) +
                            (parseInt(architectsCount) || 0) +
                            (parseInt(testersCount) || 0) +
                            (parseInt(devopsCount) || 0)
                          )} {t('pages:teamEstimate.peopleText')}
                        </Box>
                      </div>
                      <div>
                        <Box variant="awsui-key-label">{t('pages:teamEstimate.totalEffort')}</Box>
                        <Box variant="awsui-value-large">
                          {Object.values(applicationResources || {}).reduce(
                            (sum, app) => sum + (app?.resources?.totalEffort || 0),
                            ((parseInt(developersCount) || 0) +
                              (parseInt(architectsCount) || 0) +
                              (parseInt(testersCount) || 0) +
                              (parseInt(devopsCount) || 0)) * 40 *
                            (periodType.value === 'months' ? parseInt(periodValue) * 4 : parseInt(periodValue))
                          )} {t('pages:teamEstimate.hours')}
                        </Box>
                      </div>
                      <div>
                        <Box variant="awsui-key-label">{t('pages:teamEstimate.totalTimeRequired')}</Box>
                        <Box variant="awsui-value-large" color="text-status-success">
                          {(() => {
                            // Calculate pilot application time
                            const pilotDuration = periodType.value === 'months' ? parseInt(periodValue) * 4 : parseInt(periodValue);
                            const pilotComplexityFactor = complexityFactors[complexitySize.value] || 1.0;
                            const pilotTimeRequired = Math.ceil(pilotDuration * pilotComplexityFactor);
                            
                            // Find the maximum time required among all applications
                            const applicationTimes = Object.keys(applicationResources || {}).map(appName => 
                              calculateTimeRequired(appName)
                            );
                            
                            const maxTimeRequired = Math.max(pilotTimeRequired, ...applicationTimes);
                            
                            return `${maxTimeRequired} ${maxTimeRequired === 1 ? t('pages:teamEstimate.week') : t('pages:teamEstimate.weeks')}`;
                          })()}
                        </Box>
                      </div>
                    </ColumnLayout>
                  </Container>
                )}

                {/* Algorithm Summary section */}
                {bucketApplications.length > 0 && arePilotResourcesFilled() && (
                  <Container header={<Header variant="h3">{t('pages:teamEstimate.algorithmSummaryHeader')}</Header>}>
                    <SpaceBetween size="s">
                      <Box>
                        <Box variant="awsui-key-label">{t('pages:teamEstimate.resourceDistribution')}</Box>
                        <Box fontSize="body-s">
                          {t('pages:teamEstimate.resourceDistributionText')}
                        </Box>
                      </Box>
                      <Box>
                        <Box variant="awsui-key-label">{t('pages:teamEstimate.deliveryModeEffects')}</Box>
                        <Box fontSize="body-s">
                          <strong>{t('pages:teamEstimate.faster')}:</strong> +30% Dev, +20% DevOps, +10% Arch, +25% Test, -15% Time<br/>
                          <strong>{t('pages:teamEstimate.cheaper')}:</strong> -20% Dev, -15% DevOps, -10% Arch, -25% Test, +25% Time
                        </Box>
                      </Box>
                      <Box>
                        <Box variant="awsui-key-label">{t('pages:teamEstimate.parallelizationLimits')}</Box>
                        <Box fontSize="body-s">
                          {t('pages:teamEstimate.parallelizationLimitsText')}
                        </Box>
                      </Box>
                    </SpaceBetween>
                  </Container>
                )}
              </SpaceBetween>
            </Container>
          )}
        </SpaceBetween>

        {/* New skill modal */}
        <Modal
          visible={showNewSkillModal}
          onDismiss={handleNewSkillCancel}
          header={t('pages:teamEstimate.createNewSkill')}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={handleNewSkillCancel}>
                  {t('pages:teamEstimate.cancel')}
                </Button>
                <Button variant="primary" onClick={handleCreateNewSkill}>
                  {t('pages:teamEstimate.createSkill')}
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          <SpaceBetween size="l">
            {newSkillErrors.submit && (
              <Alert type="error">
                {newSkillErrors.submit}
              </Alert>
            )}

            <FormField
              label={t('pages:teamEstimate.skillNameModalLabel')}
              description={t('pages:teamEstimate.enterSkillNameDescription')}
              errorText={newSkillErrors.skillName}
            >
              <Input
                value={newSkillName}
                onChange={({ detail }) => setNewSkillName(detail.value)}
                placeholder={t('pages:teamEstimate.skillNamePlaceholder')}
              />
            </FormField>

            <FormField
              label={t('pages:teamEstimate.skillCategoryModalLabel')}
              description={t('pages:teamEstimate.enterSkillCategoryDescription')}
              errorText={newSkillErrors.skillCategory}
            >
              <Input
                value={newSkillCategory}
                onChange={({ detail }) => setNewSkillCategory(detail.value)}
                placeholder={t('pages:teamEstimate.skillCategoryPlaceholder')}
              />
            </FormField>
          </SpaceBetween>
        </Modal>

        {/* Delete confirmation modal */}
        <Modal
          visible={showDeleteModal}
          onDismiss={() => setShowDeleteModal(false)}
          header={t('pages:teamEstimate.deleteTeamEstimate')}
          footer={
            <Box float="right">
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={() => setShowDeleteModal(false)}>
                  {t('pages:teamEstimate.cancel')}
                </Button>
                <Button variant="primary" onClick={handleDeleteTeamEstimate} disabled={!hasWriteAccess}>
                  {t('pages:teamEstimate.delete')}
                </Button>
              </SpaceBetween>
            </Box>
          }
        >
          {selectedItems.length > 0 && (
            <Box>
              {t('pages:teamEstimate.deleteConfirmation', { bucketName: selectedItems[0].bucketName })}
              <br />
              {t('pages:teamEstimate.actionCannotBeUndone')}
            </Box>
          )}
        </Modal>
      </ContentLayout>
    </Layout>
  );
};

export default withResizeOptimization(TeamEstimatePage);