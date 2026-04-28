import React, { useState } from 'react';
import {
  ButtonDropdown,
  Modal,
  Box,
  SpaceBetween,
  Button
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

function PortfolioDownloadButton({ allApplications, filteredApplications }) {
  const { t } = useTranslation(['components', 'common']);
  const [showModal, setShowModal] = useState(false);
  const [downloadType, setDownloadType] = useState('');
  
  const handleDownloadClick = ({ detail }) => {
    setDownloadType(detail.id);
    setShowModal(true);
  };
  
  const handleDownload = () => {
    // Trigger file download
    const dataToDownload = downloadType === 'filtered' ? filteredApplications : allApplications;
    const dataType = downloadType === 'filtered' ? 'filtered' : 'complete';
    const count = dataToDownload.length;
    
    alert(t('components:portfolioDownload.downloadingDataset', { dataType, count }));
    setShowModal(false);
    
    // In a real application, you would do something like:
    // const jsonData = JSON.stringify(dataToDownload);
    // const blob = new Blob([jsonData], { type: 'application/json' });
    // const url = URL.createObjectURL(blob);
    // const a = document.createElement('a');
    // a.href = url;
    // a.download = `application_portfolio_${dataType}_dataset.json`;
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
      text: t('components:portfolioDownload.downloadFilteredData'),
      disabled: filteredApplications.length === 0
    },
    {
      id: 'all',
      text: t('components:portfolioDownload.downloadCompleteDataset'),
      disabled: allApplications.length === 0
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
        header={downloadType === 'filtered' ? t('components:portfolioDownload.downloadFilteredData') : t('components:portfolioDownload.downloadCompleteDataset')}
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
                <p>{t('components:portfolioDownload.downloadFilteredDescription')}</p>
                <p><strong>{t('components:portfolioDownload.numberOfRecords')}</strong> {filteredApplications.length}</p>
              </>
            ) : (
              <>
                <p>{t('components:portfolioDownload.downloadCompleteDescription')}</p>
                <p><strong>{t('components:portfolioDownload.numberOfRecords')}</strong> {allApplications.length}</p>
              </>
            )}
          </Box>
          <Box>
            <p>{t('components:portfolioDownload.jsonFileDescription')}</p>
          </Box>
        </SpaceBetween>
      </Modal>
    </>
  );
}

export default PortfolioDownloadButton;
