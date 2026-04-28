import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  SpaceBetween,
  StatusIndicator,
  ColumnLayout,
  Header
} from '@cloudscape-design/components';

const ProjectStatusInfo = () => {
  const { t } = useTranslation(['info', 'common']);
  
  const statusDefinitions = [
    {
      status: 'pending',
      indicator: <StatusIndicator type="pending">{t('info:projectStatus.pending')}</StatusIndicator>,
      description: t('info:projectStatus.pendingDescription'),
      canDelete: false
    },
    {
      status: 'provisioning',
      indicator: <StatusIndicator type="in-progress">{t('info:projectStatus.provisioning')}</StatusIndicator>,
      description: t('info:projectStatus.provisioningDescription'),
      canDelete: false
    },
    {
      status: 'active',
      indicator: <StatusIndicator type="success">{t('info:projectStatus.active')}</StatusIndicator>,
      description: t('info:projectStatus.activeDescription'),
      canDelete: true
    },
    {
      status: 'failed',
      indicator: <StatusIndicator type="error">{t('info:projectStatus.failed')}</StatusIndicator>,
      description: t('info:projectStatus.failedDescription'),
      canDelete: true
    },
    {
      status: 'failed-to-provision',
      indicator: <StatusIndicator type="error">{t('info:projectStatus.failedToProvision')}</StatusIndicator>,
      description: t('info:projectStatus.failedToProvisionDescription'),
      canDelete: true
    },
    {
      status: 'failed-to-delete',
      indicator: <StatusIndicator type="error">{t('info:projectStatus.failedToDelete')}</StatusIndicator>,
      description: t('info:projectStatus.failedToDeleteDescription'),
      canDelete: true
    },
    {
      status: 'failed-with-stack',
      indicator: <StatusIndicator type="warning">{t('info:projectStatus.failedWithStack')}</StatusIndicator>,
      description: t('info:projectStatus.failedWithStackDescription'),
      canDelete: true
    },
    {
      status: 'deleting',
      indicator: <StatusIndicator type="in-progress">{t('info:projectStatus.deleting')}</StatusIndicator>,
      description: t('info:projectStatus.deletingDescription'),
      canDelete: false
    }
  ];

  return (
    <SpaceBetween size="l">
      <Header variant="h3">{t('info:projectStatus.projectStatusGuide')}</Header>
      
      <Box>
        {t('info:projectStatus.projectLifecycleDescription')}
      </Box>

      <ColumnLayout columns={1}>
        {statusDefinitions.map((item, index) => (
          <Box key={index} padding="s" variant="div">
            <SpaceBetween size="xs">
              <Box display="flex" alignItems="center">
                {item.indicator}
                {item.canDelete && (
                  <Box marginLeft="s">
                    <Box variant="span" color="text-status-success" fontSize="body-s">
                      ✓ {t('info:projectStatus.canDelete')}
                    </Box>
                  </Box>
                )}
                {!item.canDelete && (
                  <Box marginLeft="s">
                    <Box variant="span" color="text-status-error" fontSize="body-s">
                      ✗ {t('info:projectStatus.cannotDelete')}
                    </Box>
                  </Box>
                )}
              </Box>
              <Box color="text-body-secondary" fontSize="body-s">
                {item.description}
              </Box>
            </SpaceBetween>
          </Box>
        ))}
      </ColumnLayout>

      <Header variant="h4">{t('info:projectStatus.deletionRules')}</Header>
      
      <SpaceBetween size="s">
        <Box>
          <Box variant="strong">✅ {t('info:projectStatus.activeProjects')}:</Box>
          <Box>{t('info:projectStatus.activeProjectsDescription')}</Box>
        </Box>
        
        <Box>
          <Box variant="strong">✅ {t('info:projectStatus.failedToProvision')}:</Box>
          <Box>{t('info:projectStatus.failedToProvisionRuleDescription')}</Box>
        </Box>
        
        <Box>
          <Box variant="strong">✅ {t('info:projectStatus.failedToDelete')}:</Box>
          <Box>{t('info:projectStatus.failedToDeleteRuleDescription')}</Box>
        </Box>
        
        <Box>
          <Box variant="strong">✅ {t('info:projectStatus.failedWithStack')}:</Box>
          <Box>{t('info:projectStatus.failedWithStackRuleDescription')}</Box>
        </Box>
        
        <Box>
          <Box variant="strong">❌ {t('info:projectStatus.pendingProvisioningProjects')}:</Box>
          <Box>{t('info:projectStatus.pendingProvisioningProjectsDescription')}</Box>
        </Box>
        
        <Box>
          <Box variant="strong">❌ {t('info:projectStatus.deletingProjects')}:</Box>
          <Box>{t('info:projectStatus.deletingProjectsDescription')}</Box>
        </Box>
      </SpaceBetween>

      <Header variant="h4">{t('info:projectStatus.additionalInformation')}</Header>
      
      <Box>
        {t('info:projectStatus.additionalInformationDescription', 'Project resources are automatically managed by the system. If you encounter any issues with project provisioning or deletion, please contact your administrator for assistance.')}
      </Box>
    </SpaceBetween>
  );
};

export default ProjectStatusInfo;
