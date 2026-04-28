import { useState, useEffect } from 'react';
import { useSimpleAuth } from '../contexts/SimpleAuthContext';
import { projectSharingApi } from '../services/directApiService';
import { getProject } from '../services/projectsApi';

/**
 * Hook to check user permissions for a project
 * @param {string} projectId - The ID of the project to check permissions for
 * @returns {Object} - Object containing permission information
 */
const useProjectPermissions = (projectId) => {
  const { user, isAuthenticated } = useSimpleAuth();
  const [hasWriteAccess, setHasWriteAccess] = useState(false);
  const [hasReadAccess, setHasReadAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkPermissions = async () => {
      if (!isAuthenticated || !user || !projectId) {
        setHasWriteAccess(false);
        setHasReadAccess(false);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Get the user ID from the user object
        const userId = user.userId || user.username || user.attributes?.email;
        
        console.log('🔍 Checking permissions for user:', userId, 'on project:', projectId);
        
        // Always fetch fresh project data from backend
        const freshProjectData = await getProject(projectId);
        
        if (!freshProjectData) {
          console.log('❌ Project not found:', projectId);
          setHasWriteAccess(false);
          setHasReadAccess(false);
          setLoading(false);
          return;
        }
        
        console.log('📊 Fresh project data:', freshProjectData);
        
        // Check if user is the project owner
        const projectOwner = freshProjectData.createdBy || 
                           freshProjectData.owner || 
                           freshProjectData.createdByName || 
                           freshProjectData.createdByEmail ||
                           freshProjectData.ownerEmail;
        
        const isProjectOwner = userId === projectOwner || 
                             (user.attributes?.email && user.attributes.email === projectOwner) ||
                             (freshProjectData.createdById && freshProjectData.createdById === userId);
        
        console.log('👤 Ownership check:', { userId, projectOwner, isProjectOwner });
        
        if (isProjectOwner) {
          // Project owner has full access
          console.log('✅ User is project owner - granting full access');
          setHasWriteAccess(true);
          setHasReadAccess(true);
          setLoading(false);
          return;
        }
        
        // Check if user is in sharedUsers array with current permissions
        if (freshProjectData.sharedUsers && Array.isArray(freshProjectData.sharedUsers)) {
          const sharedUser = freshProjectData.sharedUsers.find(user => 
            user.userId === userId || 
            (user.email && user.email === (user.attributes?.email || userId))
          );
          
          if (sharedUser) {
            console.log('✅ Found shared user access:', sharedUser);
            setHasReadAccess(true);
            setHasWriteAccess(sharedUser.shareMode === 'read-write');
            console.log('🔐 Permissions set:', { 
              hasReadAccess: true, 
              hasWriteAccess: sharedUser.shareMode === 'read-write',
              shareMode: sharedUser.shareMode 
            });
          } else {
            console.log('❌ User not found in sharedUsers array');
            setHasReadAccess(false);
            setHasWriteAccess(false);
          }
        } else {
          console.log('❌ No sharedUsers array found in project data');
          setHasReadAccess(false);
          setHasWriteAccess(false);
        }
      } catch (error) {
        console.error('Error checking project permissions:', error);
        setHasWriteAccess(false);
        setHasReadAccess(false);
      } finally {
        setLoading(false);
      }
    };

    checkPermissions();
  }, [projectId, user, isAuthenticated]);

  return {
    hasWriteAccess,
    hasReadAccess,
    loading
  };
};

export default useProjectPermissions;
