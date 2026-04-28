/**
 * Utility functions for navigating to the export page with pre-selected categories
 */

/**
 * Navigate to export page with a pre-selected category
 * @param {string} categoryId - The category ID to pre-select (e.g., 'skills-analysis')
 * @param {Function} navigate - React Router navigate function
 */
export const navigateToExportWithCategory = (categoryId, navigate) => {
  // Store the category in localStorage for one-time use
  localStorage.setItem('exportPreselection', categoryId);
  
  // Navigate to the export page
  navigate('/project/export');
};
