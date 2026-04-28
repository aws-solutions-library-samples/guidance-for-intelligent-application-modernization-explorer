import React from 'react';
import { useTranslation } from 'react-i18next';
import { SpaceBetween, Button } from '@cloudscape-design/components';

/**
 * Generic component for download buttons (All data and Filtered data)
 * Used across all pages for consistent download functionality
 */
const DownloadButtons = ({ 
  data = [], 
  filteredData = [], 
  columns = [], 
  filename = 'download', 
  disabled = false 
}) => {
  const { t } = useTranslation(['components', 'common']);
  // Ensure data and filteredData are arrays
  const safeData = Array.isArray(data) ? data : [];
  const safeFilteredData = Array.isArray(filteredData) ? filteredData : [];
  
  // Handle download with safety checks
  const handleDownload = (dataToDownload, isFiltered) => {
    if (!dataToDownload || !Array.isArray(dataToDownload) || dataToDownload.length === 0) {
      console.error('No data to download');
      return;
    }
    
    if (!columns || !Array.isArray(columns) || columns.length === 0) {
      console.error('No columns defined for download');
      return;
    }
    
    // Create CSV content
    const headerRow = columns.map(col => {
      if (!col || (!col.header && !col.id)) {
        return '""';
      }
      return `"${(col.header || col.id || '').replace(/"/g, '""')}"`;
    }).join(',');
    
    // Create data rows
    const dataRows = dataToDownload.map(item => {
      if (!item) return columns.map(() => '""').join(',');
      
      return columns.map(col => {
        if (!col || !col.id) return '""';
        
        // Handle different data types appropriately
        const value = item[col.id];
        if (value === null || value === undefined) {
          return '""';
        } else if (typeof value === 'string') {
          // Escape quotes in strings
          return `"${value.replace(/"/g, '""')}"`;
        } else if (typeof value === 'object') {
          try {
            // Convert objects to JSON strings
            return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
          } catch (e) {
            console.error('Error converting object to JSON:', e);
            return '""';
          }
        }
        return `"${value}"`;
      }).join(',');
    }).join('\n');
    
    // Combine header and data
    const csvContent = `${headerRow}\n${dataRows}`;
    
    // Create a blob and download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename || 'download'}${isFiltered ? '_filtered' : ''}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
  return (
    <SpaceBetween direction="horizontal" size="xs">
      <Button 
        iconName="download"
        disabled={disabled || !safeData || safeData.length === 0}
        onClick={() => handleDownload(safeData, false)}
      >
        {t('components:downloadButtons.downloadAll')}
      </Button>
      <Button 
        iconName="filter"
        disabled={disabled || !safeFilteredData || safeFilteredData.length === 0}
        onClick={() => handleDownload(safeFilteredData, true)}
      >
        {t('components:downloadButtons.downloadFiltered')}
      </Button>
    </SpaceBetween>
  );
};

export default DownloadButtons;
