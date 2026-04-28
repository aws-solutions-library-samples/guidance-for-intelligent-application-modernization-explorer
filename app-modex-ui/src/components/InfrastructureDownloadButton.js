import React, { useState } from 'react';
import {
  ButtonDropdown,
  Modal,
  Box,
  SpaceBetween,
  Button
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

function InfrastructureDownloadButton({ allResources, filteredResources }) {
  const { t } = useTranslation(['components', 'common']);
  const [showModal, setShowModal] = useState(false);
  const [downloadType, setDownloadType] = useState('');
  
  const handleDownloadClick = ({ detail }) => {
    setDownloadType(detail.id);
    setShowModal(true);
  };
  
  const handleDownload = () => {
    // Trigger file download
    const dataToDownload = downloadType === 'filtered' ? filteredResources : allResources;
    const dataType = downloadType === 'filtered' ? 'filtered' : 'complete';
    const count = dataToDownload.length;
    
    alert(t('components:infrastructureDownload.downloadingDataset', { dataType, count }));
    setShowModal(false);
    
    // In a real application, you would do something like:
    // const jsonData = JSON.stringify(dataToDownload);
    // const blob = new Blob([jsonData], { type: 'application/json' });
    // const url = URL.createObjectURL(blob);
    // const a = document.createElement('a');
    // a.href = url;
    // a.download = `infrastructure_${dataType}_dataset.json`;
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
      text: t('components:infrastructureDownload.downloadFilteredData'),
      disabled: filteredResources.length === 0
    },
    {
      id: 'all',
      text: t('components:infrastructureDownload.downloadCompleteDataset'),
      disabled: allResources.length === 0
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
          {t('common:download')}
        </ButtonDropdown>
      </Box>
      
      <Modal
        visible={showModal}
        header={downloadType === 'filtered' ? t('components:infrastructureDownload.downloadFilteredData') : t('components:infrastructureDownload.downloadCompleteDataset')}
        onDismiss={handleCancel}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={handleCancel}>{t('common:cancel')}</Button>
              <Button variant="primary" onClick={handleDownload}>{t('common:download')}</Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <Box>
            {downloadType === 'filtered' ? (
              <>
                <p>{t('components:infrastructureDownload.downloadFilteredDescription')}</p>
                <p><strong>{t('components:infrastructureDownload.numberOfRecords')}</strong> {filteredResources.length}</p>
              </>
            ) : (
              <>
                <p>{t('components:infrastructureDownload.downloadCompleteDescription')}</p>
                <p><strong>{t('components:infrastructureDownload.numberOfRecords')}</strong> {allResources.length}</p>
              </>
            )}
          </Box>
          <Box>
            <p>{t('components:infrastructureDownload.jsonFileDescription')}</p>
          </Box>
        </SpaceBetween>
      </Modal>
    </>
  );
}

export default InfrastructureDownloadButton;
