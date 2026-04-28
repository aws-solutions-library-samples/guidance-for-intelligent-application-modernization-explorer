/**
 * Utility functions for project management
 */

/**
 * Check if a project is ready for use (active status)
 * @param {Object} project - The project object
 * @returns {boolean} - True if the project is ready for use
 */
export const isProjectReady = (project) => {
  if (!project) return false;
  
  // Project is ready if status is 'active'
  return project.status === 'active';
};

/**
 * Get a user-friendly message based on project status
 * @param {Object} project - The project object
 * @returns {Object} - Object with message and severity
 */
export const getProjectStatusMessage = (project) => {
  if (!project) {
    return {
      message: 'No project selected',
      severity: 'warning'
    };
  }
  
  switch (project.status) {
    case 'active':
      return {
        message: 'Project is ready for use',
        severity: 'success'
      };
    case 'provisioning':
      return {
        message: 'Project is being provisioned. Some features may not be available yet.',
        severity: 'info'
      };
    case 'failed-to-provision':
      return {
        message: 'Project provisioning failed. Please contact support.',
        severity: 'error'
      };
    case 'deleting':
      return {
        message: 'Project is being deleted.',
        severity: 'warning'
      };
    case 'failed-to-delete':
      return {
        message: 'Project deletion failed. Please contact support.',
        severity: 'error'
      };
    default:
      return {
        message: `Project status: ${project.status}`,
        severity: 'warning'
      };
  }
};
