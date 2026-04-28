import React, { useState } from 'react';
import {
  ButtonDropdown,
  Modal,
  Box,
  SpaceBetween,
  Button
} from '@cloudscape-design/components';

function TechRadarDownloadButton({ allTechnologies = [], filteredTechnologies = [] }) {
  const [showModal, setShowModal] = useState(false);
  const [downloadType, setDownloadType] = useState('');
  
  const handleDownloadClick = ({ detail }) => {
    setDownloadType(detail.id);
    setShowModal(true);
  };
  
  const handleDownload = () => {
    // In a real application, this would trigger a file download
    // For this mock, we'll just show an alert
    const dataToDownload = downloadType === 'filtered' ? filteredTechnologies : allTechnologies;
    const dataType = downloadType === 'filtered' ? 'filtered' : 'complete';
    const count = dataToDownload ? dataToDownload.length : 0;
    
    alert(`Downloading ${dataType} technology radar dataset with ${count} records...`);
    setShowModal(false);
    
    // In a real application, you would do something like:
    // const jsonData = JSON.stringify(dataToDownload);
    // const blob = new Blob([jsonData], { type: 'application/json' });
    // const url = URL.createObjectURL(blob);
    // const a = document.createElement('a');
    // a.href = url;
    // a.download = `tech_radar_${dataType}_dataset.json`;
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
      disabled: !filteredTechnologies || filteredTechnologies.length === 0
    },
    {
      id: 'all',
      text: t('components:downloads.downloadCompleteDataset'),
      disabled: !allTechnologies || allTechnologies.length === 0
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
                <p>{t('components:downloads.youAreAboutToDownloadCurrentlyFilteredTechRadar')}</p>
                <p><strong>{t('components:downloads.numberOfRecords')}</strong> {filteredTechnologies ? filteredTechnologies.length : 0}</p>
              </>
            ) : (
              <>
                <p>{t('components:downloads.youAreAboutToDownloadCompleteTechRadar')}</p>
                <p><strong>{t('components:downloads.numberOfRecords')}</strong> {allTechnologies ? allTechnologies.length : 0}</p>
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

export default TechRadarDownloadButton;
