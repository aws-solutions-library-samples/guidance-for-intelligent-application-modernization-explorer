import React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Box, Link } from '@cloudscape-design/components';

/**
 * Component to display when required data sources are missing
 */
const MissingDataAlert = ({ missingDataSources = [] }) => {
  const { t } = useTranslation(['components', 'common']);
  // Map data source types to friendly names and upload pages
  const dataSourceInfo = {
    'team-skills': {
      name: 'Team Skills',
      uploadPage: '/data/skills'
    },
    'technology-vision': {
      name: 'Technology Vision',
      uploadPage: '/data/vision'
    },
    'applications-portfolio': {
      name: 'Application Portfolio',
      uploadPage: '/data/applications/portfolio'
    },
    'applications-tech-stack': {
      name: 'Technology Stack',
      uploadPage: '/data/applications/tech-stack'
    },
    'applications-infrastructure': {
      name: 'Infrastructure Resources',
      uploadPage: '/data/applications/infrastructure'
    },
    'applications-utilization': {
      name: 'Resource Utilization',
      uploadPage: '/data/applications/utilization'
    }
  };

  if (!missingDataSources || missingDataSources.length === 0) {
    return null;
  }

  return (
    <Alert
      type="warning"
      header="Required data not available"
    >
      <Box>
        <p>
          {t('components:missingDataAlert.thisPageRequiresDataFromFollowingSources')}
        </p>
        <ul style={{ marginTop: '8px', marginBottom: '8px' }}>
          {missingDataSources.map(dsType => {
            const info = dataSourceInfo[dsType] || { name: dsType, uploadPage: '/data' };
            return (
              <li key={dsType}>
                <Link href={info.uploadPage}>{info.name}</Link>
              </li>
            );
          })}
        </ul>
        <p>
          {t('components:missingDataAlert.pleaseUploadRequiredDataFiles')}
        </p>
      </Box>
    </Alert>
  );
};

export default MissingDataAlert;
