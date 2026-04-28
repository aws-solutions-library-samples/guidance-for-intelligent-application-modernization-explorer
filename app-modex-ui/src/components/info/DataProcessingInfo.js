import React from 'react';
import { Box, SpaceBetween, Link } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

const DataProcessingInfo = () => {
  const { t } = useTranslation(['info', 'common']);
  return (
    <Box padding="l">
      <SpaceBetween size="l">
        <Box variant="h2">{t('info:dataProcessing.title')}</Box>
      
      <Box variant="p">
        {t('info:dataProcessing.description')}
      </Box>
      
      <Box variant="h3">{t('info:dataProcessing.keyFeatures')}</Box>
      
      <SpaceBetween size="s">
        <Box variant="p">
          <strong>{t('info:dataProcessing.processTracking')}:</strong> {t('info:dataProcessing.processTrackingDescription')}
        </Box>
        
        <Box variant="p">
          <strong>{t('info:dataProcessing.filtering')}:</strong> {t('info:dataProcessing.filteringDescription')}
        </Box>
        
        <Box variant="p">
          <strong>{t('info:dataProcessing.historicalData')}:</strong> {t('info:dataProcessing.historicalDataDescription')}
        </Box>
        
        <Box variant="p">
          <strong>{t('info:dataProcessing.errorHandling')}:</strong> {t('info:dataProcessing.errorHandlingDescription')}
        </Box>
      </SpaceBetween>
      
      <Box variant="h3">{t('info:dataProcessing.processTypes')}</Box>
      
      <SpaceBetween size="s">
        <Box variant="p">
          <strong>{t('info:dataProcessing.fileUpload')}:</strong> {t('info:dataProcessing.fileUploadDescription')}
        </Box>
        
        <Box variant="p">
          <strong>{t('info:dataProcessing.dataTransformation')}:</strong> {t('info:dataProcessing.dataTransformationDescription')}
        </Box>
        
        <Box variant="p">
          <strong>{t('info:dataProcessing.dataImport')}:</strong> {t('info:dataProcessing.dataImportDescription')}
        </Box>
        
        <Box variant="p">
          <strong>{t('info:dataProcessing.dataExport')}:</strong> {t('info:dataProcessing.dataExportDescription')}
        </Box>
        
        <Box variant="p">
          <strong>{t('info:dataProcessing.dataValidation')}:</strong> {t('info:dataProcessing.dataValidationDescription')}
        </Box>
      </SpaceBetween>
      
      <Box variant="h3">{t('info:dataProcessing.processStatus')}</Box>
      
      <SpaceBetween size="s">
        <Box variant="p">
          <strong>{t('info:dataProcessing.initiated')}:</strong> {t('info:dataProcessing.initiatedDescription')}
        </Box>
        
        <Box variant="p">
          <strong>{t('info:dataProcessing.processing')}:</strong> {t('info:dataProcessing.processingDescription')}
        </Box>
        
        <Box variant="p">
          <strong>{t('info:dataProcessing.completed')}:</strong> {t('info:dataProcessing.completedDescription')}
        </Box>
        
        <Box variant="p">
          <strong>{t('info:dataProcessing.failed')}:</strong> {t('info:dataProcessing.failedDescription')}
        </Box>
        
        <Box variant="p">
          <strong>{t('info:dataProcessing.cancelled')}:</strong> {t('info:dataProcessing.cancelledDescription')}
        </Box>
      </SpaceBetween>
      
      <Box variant="h3">{t('info:dataProcessing.bestPractices')}</Box>
      
      <SpaceBetween size="s">
        <Box variant="p">
          <strong>{t('info:dataProcessing.regularMonitoring')}:</strong> {t('info:dataProcessing.regularMonitoringDescription')}
        </Box>
        
        <Box variant="p">
          <strong>{t('info:dataProcessing.errorInvestigation')}:</strong> {t('info:dataProcessing.errorInvestigationDescription')}
        </Box>
        
        <Box variant="p">
          <strong>{t('info:dataProcessing.historicalAnalysis')}:</strong> {t('info:dataProcessing.historicalAnalysisDescription')}
        </Box>
      </SpaceBetween>
      </SpaceBetween>
    </Box>
  );
};

export default DataProcessingInfo;
