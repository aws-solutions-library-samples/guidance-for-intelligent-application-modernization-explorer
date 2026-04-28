import React, { useState } from 'react';
import {
  ButtonDropdown,
  Modal,
  Box,
  SpaceBetween,
  Button
} from '@cloudscape-design/components';

function UtilizationDownloadButton({ allMetrics, filteredMetrics }) {
  const [showModal, setShowModal] = useState(false);
  const [downloadType, setDownloadType] = useState('');
  
  const handleDownloadClick = ({ detail }) => {
    setDownloadType(detail.id);
    setShowModal(true);
  };
  
  const handleDownload = () => {
    // In a real application, this would trigger a file download
    // For this mock, we'll just show an alert
    const dataToDownload = downloadType === 'filtered' ? filteredMetrics : allMetrics;
    const dataType = downloadType === 'filtered' ? 'filtered' : 'complete';
    const count = dataToDownload.length;
    
    alert(`Downloading ${dataType} utilization metrics dataset with ${count} records...`);
    setShowModal(false);
    
    // In a real application, you would do something like:
    // const jsonData = JSON.stringify(dataToDownload);
    // const blob = new Blob([jsonData], { type: 'application/json' });
    // const url = URL.createObjectURL(blob);
    // const a = document.createElement('a');
    // a.href = url;
    // a.download = `utilization_metrics_${dataType}_dataset.json`;
    // document.body.appendChild(a);
    // a.click();
    // document.body.removeChild(a);
    // URL.revokeObjectURL(url);
  };
  
  const handleCancel = () => {
    setShowModal(false);
  };
  
  const dropdownItems = [
    {
      id: 'filtered',
      text: t('components:downloads.downloadFilteredData'),
      disabled: filteredMetrics.length === 0
    },
    {
      id: 'all',
      text: t('components:downloads.downloadCompleteDataset'),
      disabled: allMetrics.length === 0
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
          {t('components:downloads.download')}
        </ButtonDropdown>
      </Box>
      
      <Modal
        visible={showModal}
        header={downloadType === 'filtered' ? t('components:downloads.downloadFilteredData') : t('components:downloads.downloadCompleteDataset')}
        onDismiss={handleCancel}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={handleCancel}>{t('components:buttons.cancel')}</Button>
              <Button variant="primary" onClick={handleDownload}>{t('components:buttons.download')}</Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <Box>
            {downloadType === 'filtered' ? (
              <>
                <p>{t('components:downloads.youAreAboutToDownloadCurrentlyFilteredUtilization')}</p>
                <p><strong>{t('components:downloads.numberOfRecords')}</strong> {filteredMetrics.length}</p>
              </>
            ) : (
              <>
                <p>{t('components:downloads.youAreAboutToDownloadCompleteUtilization')}</p>
                <p><strong>{t('components:downloads.numberOfRecords')}</strong> {allMetrics.length}</p>
              </>
            )}
          </Box>
          <Box>
            <p>{t('components:downloads.theDataWillBeDownloadedAsJsonFile')}</p>
          </Box>
        </SpaceBetween>
      </Modal>
    </>
  );
}

export default UtilizationDownloadButton;
