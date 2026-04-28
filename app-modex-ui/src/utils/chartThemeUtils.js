/**
 * Chart Theme Utilities
 * 
 * Provides theme-aware colors and styles for D3 charts
 */

/**
 * Get theme-aware colors for charts
 * @param {boolean} isDark - Whether dark mode is active
 * @returns {Object} Color configuration for charts
 */
export const getChartColors = (isDark) => {
  return {
    // Text colors
    text: isDark ? '#e9ebed' : '#000716',
    textSecondary: isDark ? '#9ba7b6' : '#5f6b7a',
    
    // Axis colors
    axis: isDark ? '#414d5c' : '#d1d5db',
    axisText: isDark ? '#9ba7b6' : '#5f6b7a',
    
    // Grid colors
    grid: isDark ? '#2a2e33' : '#e9ecef',
    
    // Stroke colors
    stroke: isDark ? '#414d5c' : '#ffffff',
    strokeHover: isDark ? '#687078' : '#000000',
    
    // Background colors
    background: isDark ? '#0f1b2a' : '#ffffff',
    backgroundSecondary: isDark ? '#16191f' : '#f9fafb',
    
    // Tooltip colors
    tooltipBackground: isDark ? 'rgba(35, 47, 62, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    tooltipText: isDark ? '#ffffff' : '#000716',
    tooltipBorder: isDark ? '#414d5c' : '#d1d5db',
    
    // Status colors (from Cloudscape)
    success: isDark ? '#037f0c' : '#037f0c',
    warning: isDark ? '#f89256' : '#f89256',
    error: isDark ? '#d91515' : '#d91515',
    info: isDark ? '#0972d3' : '#0972d3',
    
    // Chart-specific colors
    primary: isDark ? '#539fe5' : '#0073bb',
    secondary: isDark ? '#9ba7b6' : '#5f6b7a'
  };
};

/**
 * Get text color based on background brightness
 * Useful for determining if text should be light or dark on colored backgrounds
 * @param {string} backgroundColor - Hex color code
 * @param {boolean} isDark - Whether dark mode is active
 * @returns {string} Text color (light or dark)
 */
export const getContrastTextColor = (backgroundColor, isDark) => {
  // Remove # if present
  const hex = backgroundColor.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return dark text for light backgrounds, light text for dark backgrounds
  return luminance > 0.5 ? '#000000' : '#ffffff';
};

/**
 * Apply theme-aware styles to D3 SVG elements
 * @param {Object} svg - D3 selection of SVG element
 * @param {boolean} isDark - Whether dark mode is active
 */
export const applyChartTheme = (svg, isDark) => {
  const colors = getChartColors(isDark);
  
  // Apply text color to all text elements
  svg.selectAll('text')
    .style('fill', colors.text);
  
  // Apply axis colors
  svg.selectAll('.domain, .tick line')
    .style('stroke', colors.axis);
  
  svg.selectAll('.tick text')
    .style('fill', colors.axisText);
};

/**
 * Get D3 color scheme based on theme
 * @param {boolean} isDark - Whether dark mode is active
 * @param {string} scheme - Color scheme name ('category', 'sequential', 'diverging')
 * @returns {Array} Array of colors
 */
export const getD3ColorScheme = (isDark, scheme = 'category') => {
  // For categorical data (default D3 schemes work well in both modes)
  if (scheme === 'category') {
    return [
      '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
      '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
    ];
  }
  
  // For sequential data
  if (scheme === 'sequential') {
    return isDark 
      ? ['#0f1b2a', '#1d3557', '#457b9d', '#a8dadc', '#f1faee']
      : ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'];
  }
  
  // For diverging data
  if (scheme === 'diverging') {
    return isDark
      ? ['#d91515', '#f89256', '#e9ebed', '#539fe5', '#0972d3']
      : ['#d62728', '#fc8d59', '#ffffbf', '#91bfdb', '#4575b4'];
  }
  
  return [];
};

/**
 * Create theme-aware tooltip styles
 * @param {boolean} isDark - Whether dark mode is active
 * @returns {Object} CSS styles for tooltip
 */
export const getTooltipStyles = (isDark) => {
  const colors = getChartColors(isDark);
  
  return {
    position: 'absolute',
    visibility: 'hidden',
    backgroundColor: colors.tooltipBackground,
    color: colors.tooltipText,
    border: `1px solid ${colors.tooltipBorder}`,
    borderRadius: '4px',
    padding: '12px',
    boxShadow: isDark 
      ? '0 2px 10px rgba(0, 0, 0, 0.5)' 
      : '0 2px 10px rgba(0, 0, 0, 0.2)',
    fontSize: '13px',
    zIndex: 1000,
    maxWidth: '220px',
    pointerEvents: 'none',
    fontFamily: "'Amazon Ember', 'Helvetica Neue', Roboto, Arial, sans-serif"
  };
};
