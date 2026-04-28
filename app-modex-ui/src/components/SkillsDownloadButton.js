import React, { useState } from 'react';
import {
  Button,
  Modal,
  Box,
  SpaceBetween
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

const SkillsDownloadButton = ({ skills, allSkills, filteredSkills }) => {
  const { t } = useTranslation(['components', 'common']);
  const [isModalVisible, setModalVisible] = useState(false);
  const [downloadType, setDownloadType] = useState(null);

  // Use the appropriate data source based on props provided
  const skillsData = skills || [];
  const allSkillsData = allSkills || skills || [];
  const filteredSkillsData = filteredSkills || skills || [];

  const handleDownload = (type) => {
    setDownloadType(type);
    setModalVisible(true);
  };

  const confirmDownload = () => {
    // Determine which data to download
    const dataToDownload = downloadType === 'filtered' ? filteredSkillsData : allSkillsData;
    
    if (!dataToDownload || !Array.isArray(dataToDownload) || dataToDownload.length === 0) {
      console.error('No data to download');
      setModalVisible(false);
      return;
    }
    
    try {
      // Create CSV content
      const headers = [
        t('components:skillsDownload.skill'),
        t('components:skillsDownload.category'),
        t('components:skillsDownload.proficiency'),
        t('components:skillsDownload.teamPersona'),
        t('components:skillsDownload.members'),
        t('components:skillsDownload.notes')
      ];
      const csvContent = [
        headers.join(','),
        ...dataToDownload.map(skill => [
          skill.skill ? `"${skill.skill.replace(/"/g, '""')}"` : '""',
          skill.category ? `"${skill.category.replace(/"/g, '""')}"` : '""',
          skill.proficiency || '',
          skill.team ? `"${skill.team.replace(/"/g, '""')}"` : '""',
          skill.members || '',
          skill.notes ? `"${skill.notes.replace(/"/g, '""')}"` : '""'
        ].join(','))
      ].join('\n');
      
      // Create a blob and download it
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `skills_${downloadType === 'filtered' ? 'filtered' : 'all'}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating CSV:', error);
    }
    
    setModalVisible(false);
  };

  // Determine the count of skills to download
  const skillsCount = downloadType === 'filtered' 
    ? (filteredSkillsData ? filteredSkillsData.length : 0)
    : (allSkillsData ? allSkillsData.length : 0);

  return (
    <>
      <Button
        iconName="download"
        ariaLabel={t('components:skillsDownload.downloadSkillsData')}
        onClick={() => handleDownload('filtered')}
      >
        {t('common:buttons.download')}
      </Button>
      
      <Modal
        visible={isModalVisible}
        onDismiss={() => setModalVisible(false)}
        header={t('components:skillsDownload.downloadSkillsData')}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setModalVisible(false)}>
                {t('common:buttons.cancel')}
              </Button>
              <Button variant="primary" onClick={confirmDownload}>
                {t('common:buttons.download')}
              </Button>
            </SpaceBetween>
          </Box>
        }
      >
        <p>
          {downloadType === 'filtered' 
            ? t('components:skillsDownload.downloadFilteredSkills', { count: skillsCount })
            : t('components:skillsDownload.downloadAllSkills')}
        </p>
      </Modal>
    </>
  );
};

export default SkillsDownloadButton;
