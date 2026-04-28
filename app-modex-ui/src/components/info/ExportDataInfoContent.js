import React from 'react';
import { SpaceBetween, Box, Header } from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';

function ExportDataInfoContent() {
  const { t } = useTranslation(['info', 'common']);
  
  return (
    <SpaceBetween size="l">
      <Box>
        <Header variant="h3">{t('info:exportData.title')}</Header>
        <Box variant="p">
          {t('info:exportData.description')}
        </Box>
      </Box>

      <Box>
        <Header variant="h4">{t('info:exportData.availableExportSections')}</Header>
        <Box variant="p">
          <strong>{t('info:exportData.dataSections')}</strong> {t('info:exportData.dataSectionsDescription')}
        </Box>
        <ul>
          <li><strong>{t('info:exportData.skills')}</strong> {t('info:exportData.skillsDescription')}</li>
          <li><strong>{t('info:exportData.technologyVision')}</strong> {t('info:exportData.technologyVisionDescription')}</li>
          <li><strong>{t('info:exportData.applications')}</strong> {t('info:exportData.applicationsDescription')}</li>
        </ul>
        <Box variant="p">
          <strong>{t('info:exportData.insightsSections')}</strong> {t('info:exportData.insightsSectionsDescription')}
        </Box>
        <ul>
          <li><strong>{t('info:exportData.skillsAnalysis')}</strong> {t('info:exportData.skillsAnalysisDescription')}</li>
          <li><strong>{t('info:exportData.visionAnalysis')}</strong> {t('info:exportData.visionAnalysisDescription')}</li>
          <li><strong>{t('info:exportData.techStackAnalysis')}</strong> {t('info:exportData.techStackAnalysisDescription')}</li>
          <li><strong>{t('info:exportData.infrastructureAnalysis')}</strong> {t('info:exportData.infrastructureAnalysisDescription')}</li>
          <li><strong>{t('info:exportData.utilizationAnalysis')}</strong> {t('info:exportData.utilizationAnalysisDescription')}</li>
          <li><strong>{t('info:exportData.teamAnalysis')}</strong> {t('info:exportData.teamAnalysisDescription')}</li>
        </ul>
        <Box variant="p">
          <strong>{t('info:exportData.planningSections')}</strong> {t('info:exportData.planningSectionsDescription')}
        </Box>
        <ul>
          <li><strong>{t('info:exportData.pilotIdentification')}</strong> {t('info:exportData.pilotIdentificationDescription')}</li>
          <li><strong>{t('info:exportData.applicationBuckets')}</strong> {t('info:exportData.applicationBucketsDescription')}</li>
          <li><strong>{t('info:exportData.estimates')}</strong> {t('info:exportData.estimatesDescription')}</li>
        </ul>
      </Box>

      <Box>
        <Header variant="h4">{t('info:exportData.howToExport')}</Header>
        <ol>
          <li><strong>{t('info:exportData.selectSections')}</strong> {t('info:exportData.selectSectionsDescription')}</li>
          <li><strong>{t('info:exportData.useQuickActions')}</strong> {t('info:exportData.useQuickActionsDescription')}</li>
          <li><strong>{t('info:exportData.reviewSelection')}</strong> {t('info:exportData.reviewSelectionDescription')}</li>
          <li><strong>{t('info:exportData.export')}</strong> {t('info:exportData.exportDescription')}</li>
        </ol>
      </Box>

      <Box>
        <Header variant="h4">{t('info:exportData.exportFeatures')}</Header>
        <ul>
          <li><strong>{t('info:exportData.selectiveExport')}</strong> {t('info:exportData.selectiveExportDescription')}</li>
          <li><strong>{t('info:exportData.currentFiltersApplied')}</strong> {t('info:exportData.currentFiltersAppliedDescription')}</li>
          <li><strong>{t('info:exportData.projectSpecific')}</strong> {t('info:exportData.projectSpecificDescription')}</li>
          <li><strong>{t('info:exportData.multipleFormats')}</strong> {t('info:exportData.multipleFormatsDescription')}</li>
        </ul>
      </Box>

      <Box>
        <Header variant="h4">{t('info:exportData.useCases')}</Header>
        <ul>
          <li><strong>{t('info:exportData.executiveReports')}</strong> {t('info:exportData.executiveReportsDescription')}</li>
          <li><strong>{t('info:exportData.dataBackup')}</strong> {t('info:exportData.dataBackupDescription')}</li>
          <li><strong>{t('info:exportData.focusedAnalysis')}</strong> {t('info:exportData.focusedAnalysisDescription')}</li>
          <li><strong>{t('info:exportData.teamSharing')}</strong> {t('info:exportData.teamSharingDescription')}</li>
          <li><strong>{t('info:exportData.compliance')}</strong> {t('info:exportData.complianceDescription')}</li>
        </ul>
      </Box>

      <Box>
        <Header variant="h4">{t('info:exportData.tips')}</Header>
        <ul>
          <li>{t('info:exportData.tip1')}</li>
          <li>{t('info:exportData.tip2')}</li>
          <li>{t('info:exportData.tip3')}</li>
          <li>{t('info:exportData.tip4')}</li>
        </ul>
      </Box>
    </SpaceBetween>
  );
}

export default ExportDataInfoContent;
