import React, { useState } from 'react';
import {
  Button,
  Modal,
  Box,
  SpaceBetween
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

function TechStackDownloadButton({ allComponents, filteredComponents }) {
  const { t } = useTranslation(['components', 'common']);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [downloadType, setDownloadType] = useState(null);

  // Ensure components arrays are defined
  const safeAllComponents = allComponents || [];
  const safeFilteredComponents = filteredComponents || safeAllComponents;

  // Function to prepare data for download
  const prepareDataForDownload = (data) => {
    // Convert the data to CSV format
    const headers = [
      t('components:techStackDownload.application'),
      t('components:techStackDownload.component'),
      t('components:techStackDownload.runtime'),
      t('components:techStackDownload.framework'),
      t('components:techStackDownload.databases'),
      t('components:techStackDownload.integrations'),
      t('components:techStackDownload.storage')
    ];
    
    const rows = data.map(item => [
      item.applicationName || '',
      item.componentName || '',
      Array.isArray(item.runtime) ? item.runtime.join('; ') : (item.runtime || ''),
      Array.isArray(item.framework) ? item.framework.join('; ') : (item.framework || ''),
      Array.isArray(item.databases) ? item.databases.join('; ') : (item.databases || ''),
      Array.isArray(item.integrations) ? item.integrations.join('; ') : (item.integrations || ''),
      Array.isArray(item.storages) ? item.storages.join('; ') : (item.storages || '')
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    return csvContent;
  };

  // Function to trigger the download
  const downloadData = () => {
    const data = downloadType === 'filtered' ? safeFilteredComponents : safeAllComponents;
    const csvContent = prepareDataForDownload(data);
    
    // Create a Blob and download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `tech-stack-${downloadType}-${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Close the modal
    setIsModalVisible(false);
  };

  return (
    <>
      <Button
        iconName="download"
        onClick={() => setIsModalVisible(true)}
      >
        {t('common:buttons.download')}
      </Button>
      
      <Modal
        visible={isModalVisible}
        onDismiss={() => setIsModalVisible(false)}
        header={t('components:techStackDownload.downloadTechStackData')}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setIsModalVisible(false)}>{t('common:buttons.cancel')}</Button>
              <Button variant="primary" onClick={downloadData} disabled={!downloadType}>{t('common:buttons.download')}</Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="l">
          <Box variant="p">
            {t('components:techStackDownload.chooseDataToDownload')}
          </Box>
          
          <SpaceBetween direction="horizontal" size="xs">
            <Button
              onClick={() => setDownloadType('filtered')}
              variant={downloadType === 'filtered' ? 'primary' : 'normal'}
            >
              {t('components:techStackDownload.filteredData', { count: safeFilteredComponents.length })}
            </Button>
            
            <Button
              onClick={() => setDownloadType('all')}
              variant={downloadType === 'all' ? 'primary' : 'normal'}
            >
              {t('components:techStackDownload.allData', { count: safeAllComponents.length })}
            </Button>
          </SpaceBetween>
        </SpaceBetween>
      </Modal>
    </>
  );
}

export default TechStackDownloadButton;
