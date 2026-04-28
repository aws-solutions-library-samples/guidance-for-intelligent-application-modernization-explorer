import React, { useState } from 'react';
import {
  ButtonDropdown,
  Modal,
  Box,
  SpaceBetween,
  Button
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

/**
 * Generic dropdown button for downloading data with a confirmation modal
 * Maintains the original UI pattern with dropdown menu and confirmation dialog
 */
function DownloadDropdownButton({ 
  data = [], 
  filteredData = [], 
  columns = [],
  filename = 'download',
  dataType = 'dataset'
}) {
  const { t } = useTranslation(['components', 'common']);
  const [showModal, setShowModal] = useState(false);
  const [downloadType, setDownloadType] = useState('');
  
  // Ensure data and filteredData are arrays
  const safeData = Array.isArray(data) ? data : [];
  const safeFilteredData = Array.isArray(filteredData) ? filteredData : [];
  
  const handleDownloadClick = ({ detail }) => {
    setDownloadType(detail.id);
    setShowModal(true);
  };
  
  const handleDownload = () => {
    const dataToDownload = downloadType === 'filtered' ? safeFilteredData : safeData;
    const dataTypeLabel = downloadType === 'filtered' ? 'filtered' : 'complete';
    const count = dataToDownload.length;
    
    try {
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
      link.setAttribute('download', `${filename}_${dataTypeLabel}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating CSV:', error);
      alert(t('components:downloadDropdown.errorDownloading', { dataTypeLabel, dataType }));
    }
    
    setShowModal(false);
  };
  
  const handleCancel = () => {
    setShowModal(false);
  };
  
  const dropdownItems = [
    {
      id: 'filtered',
      text: t('components:downloadDropdown.downloadFilteredData'),
      disabled: !safeFilteredData || safeFilteredData.length === 0
    },
    {
      id: 'all',
      text: t('components:downloadDropdown.downloadCompleteDataset'),
      disabled: !safeData || safeData.length === 0
    }
  ];
  
  return (
    <>
      <Box float="right">
        <ButtonDropdown
          items={dropdownItems}
          onItemClick={handleDownloadClick}
          expandToViewport
        >
          {t('common:buttons.download')}
        </ButtonDropdown>
      </Box>
      
      <Modal
        visible={showModal}
        header={downloadType === 'filtered' ? t('components:downloadDropdown.downloadFilteredData') : t('components:downloadDropdown.downloadCompleteDataset')}
        onDismiss={handleCancel}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={handleCancel}>{t('common:buttons.cancel')}</Button>
              <Button variant="primary" onClick={handleDownload}>{t('common:buttons.download')}</Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <Box>
            {downloadType === 'filtered' ? (
              <>
                <p>{t('components:downloadDropdown.downloadFilteredDescription', { dataType })}</p>
                <p><strong>{t('components:downloadDropdown.numberOfRecords')}</strong> {safeFilteredData.length}</p>
              </>
            ) : (
              <>
                <p>{t('components:downloadDropdown.downloadCompleteDescription', { dataType })}</p>
                <p><strong>{t('components:downloadDropdown.numberOfRecords')}</strong> {safeData.length}</p>
              </>
            )}
          </Box>
          <Box>
            <p>{t('components:downloadDropdown.csvFileDescription')}</p>
          </Box>
        </SpaceBetween>
      </Modal>
    </>
  );
}

export default DownloadDropdownButton;
