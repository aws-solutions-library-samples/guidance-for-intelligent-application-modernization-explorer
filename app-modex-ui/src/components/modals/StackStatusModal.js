import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Box,
  SpaceBetween,
  Button,
  Alert,
  ColumnLayout,
  StatusIndicator,
  TextContent
} from '@cloudscape-design/components';

const StackStatusModal = ({ 
  visible, 
  stackInfo, 
  projectName,
  onClose, 
  onConfirmDelete,
  loading = false 
}) => {
  const { t } = useTranslation(['components', 'common']);
  
  const getStatusType = (status) => {
    const statusMap = {
      'CREATE_COMPLETE': 'success',
      'UPDATE_COMPLETE': 'success',
      'DELETE_COMPLETE': 'success',
      'CREATE_FAILED': 'error',
      'UPDATE_FAILED': 'error',
      'DELETE_FAILED': 'error',
      'ROLLBACK_COMPLETE': 'warning',
      'ROLLBACK_FAILED': 'error',
      'CREATE_IN_PROGRESS': 'in-progress',
      'UPDATE_IN_PROGRESS': 'in-progress',
      'DELETE_IN_PROGRESS': 'in-progress',
      'ROLLBACK_IN_PROGRESS': 'in-progress'
    };
    return statusMap[status] || 'info';
  };

  const formatDate = (dateString) => {
    if (!dateString) return t('common:notAvailable');
    return new Date(dateString).toLocaleString();
  };

  return (
    <Modal
      visible={visible}
      onDismiss={onClose}
      header={t('components:stackStatusModal.cloudFormationStackFound')}
      size="medium"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button 
              variant="link" 
              onClick={onClose}
              disabled={loading}
            >
              {t('common:cancel')}
            </Button>
            <Button 
              variant="primary" 
              onClick={onConfirmDelete}
              loading={loading}
            >
              {t('components:stackStatusModal.deleteProjectAnyway')}
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <Alert type="warning" header={t('components:stackStatusModal.infrastructureFound')}>
          {t('components:stackStatusModal.infrastructureFoundDescription')}
        </Alert>

        <TextContent>
          <p>
            <strong>{t('components:stackStatusModal.project')}:</strong> {projectName}
          </p>
          <p>
            {t('components:stackStatusModal.deleteProjectDescription')}
          </p>
        </TextContent>

        <ColumnLayout columns={2} variant="text-grid">
          <div>
            <Box variant="awsui-key-label">{t('components:stackStatusModal.stackName')}</Box>
            <div>{stackInfo?.StackName || t('common:notAvailable')}</div>
          </div>
          <div>
            <Box variant="awsui-key-label">{t('components:stackStatusModal.stackStatus')}</Box>
            <StatusIndicator type={getStatusType(stackInfo?.StackStatus)}>
              {stackInfo?.StackStatus || t('common:unknown')}
            </StatusIndicator>
          </div>
          <div>
            <Box variant="awsui-key-label">{t('components:stackStatusModal.created')}</Box>
            <div>{formatDate(stackInfo?.CreationTime)}</div>
          </div>
          <div>
            <Box variant="awsui-key-label">{t('components:stackStatusModal.lastUpdated')}</Box>
            <div>{formatDate(stackInfo?.LastUpdatedTime)}</div>
          </div>
        </ColumnLayout>

        {stackInfo?.StackStatusReason && (
          <div>
            <Box variant="awsui-key-label">{t('components:stackStatusModal.statusReason')}</Box>
            <TextContent>
              <p>{stackInfo.StackStatusReason}</p>
            </TextContent>
          </div>
        )}

        <Alert type="info" header={t('components:stackStatusModal.manualCleanupRequired')}>
          {t('components:stackStatusModal.manualCleanupDescription', { stackName: stackInfo?.StackName })}
        </Alert>
      </SpaceBetween>
    </Modal>
  );
};

export default StackStatusModal;
