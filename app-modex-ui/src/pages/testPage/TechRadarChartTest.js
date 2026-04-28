import React, { useState } from 'react';
import {
  Container,
  Header,
  Box,
  Grid,
  SpaceBetween,
  Alert,
  Button,
  Modal
} from '@cloudscape-design/components';
import { useTranslation } from 'react-i18next';
import TechRadarChart from '../../components/charts/TechRadarChart';

/**
 * Test component for the TechRadarChart
 */
const TechRadarChartTest = () => {
  const { t } = useTranslation(['components', 'common']);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  // Sample data for the tech radar
  const techRadarData = [
    // Techniques
    { name: 'Domain-Driven Design', quadrant: 'Techniques', ring: 'Adopt', description: 'An approach to software development that centers the development on programming a domain model.' },
    { name: 'Microservices', quadrant: 'Techniques', ring: 'Adopt', description: 'An architectural style that structures an application as a collection of services.' },
    { name: 'Event Sourcing', quadrant: 'Techniques', ring: 'Trial', description: 'Capturing all changes to an application state as a sequence of events.' },
    { name: 'CQRS', quadrant: 'Techniques', ring: 'Trial', description: 'Command Query Responsibility Segregation - separating read and write operations.' },
    { name: 'API-First Design', quadrant: 'Techniques', ring: 'Assess', description: 'Developing APIs that are consistent and reusable.' },
    { name: 'Zero Trust Security', quadrant: 'Techniques', ring: 'Assess', description: 'Security concept centered on the belief that organizations should not trust anything inside or outside its perimeters.' },
    { name: 'Chaos Engineering', quadrant: 'Techniques', ring: 'Hold', description: 'The discipline of experimenting on a system to build confidence in its capability to withstand turbulent conditions in production.' },
    
    // Tools
    { name: 'Docker', quadrant: 'Tools', ring: 'Adopt', description: 'A platform for developing, shipping, and running applications in containers.' },
    { name: 'Kubernetes', quadrant: 'Tools', ring: 'Adopt', description: 'An open-source system for automating deployment, scaling, and management of containerized applications.' },
    { name: 'Terraform', quadrant: 'Tools', ring: 'Trial', description: 'An open-source infrastructure as code software tool.' },
    { name: 'Jenkins', quadrant: 'Tools', ring: 'Trial', description: 'An open source automation server for building, testing, and deploying code.' },
    { name: 'Prometheus', quadrant: 'Tools', ring: 'Assess', description: 'An open-source monitoring and alerting toolkit.' },
    { name: 'Istio', quadrant: 'Tools', ring: 'Assess', description: 'An open platform to connect, manage, and secure microservices.' },
    { name: 'Ansible', quadrant: 'Tools', ring: 'Hold', description: 'An open-source software provisioning, configuration management, and application-deployment tool.' },
    
    // Platforms
    { name: 'AWS', quadrant: 'Platforms', ring: 'Adopt', description: 'Amazon Web Services - a cloud computing platform.' },
    { name: 'Azure', quadrant: 'Platforms', ring: 'Adopt', description: 'Microsoft Azure - a cloud computing service.' },
    { name: 'Google Cloud', quadrant: 'Platforms', ring: 'Trial', description: 'Google Cloud Platform - a suite of cloud computing services.' },
    { name: 'Snowflake', quadrant: 'Platforms', ring: 'Trial', description: 'A cloud-based data warehousing company.' },
    { name: 'Databricks', quadrant: 'Platforms', ring: 'Assess', description: 'A data analytics platform founded by the creators of Apache Spark.' },
    { name: 'Heroku', quadrant: 'Platforms', ring: 'Assess', description: 'A cloud platform as a service supporting several programming languages.' },
    { name: 'OpenShift', quadrant: 'Platforms', ring: 'Hold', description: 'A family of containerization software products developed by Red Hat.' },
    
    // Languages & Frameworks
    { name: 'React', quadrant: 'Languages & Frameworks', ring: 'Adopt', description: 'A JavaScript library for building user interfaces.' },
    { name: 'TypeScript', quadrant: 'Languages & Frameworks', ring: 'Adopt', description: 'A strongly typed programming language that builds on JavaScript.' },
    { name: 'Node.js', quadrant: 'Languages & Frameworks', ring: 'Trial', description: 'A JavaScript runtime built on Chrome\'s V8 JavaScript engine.' },
    { name: 'GraphQL', quadrant: 'Languages & Frameworks', ring: 'Trial', description: 'A query language for APIs and a runtime for executing those queries.' },
    { name: 'Rust', quadrant: 'Languages & Frameworks', ring: 'Assess', description: 'A multi-paradigm programming language focused on performance and safety.' },
    { name: 'Go', quadrant: 'Languages & Frameworks', ring: 'Assess', description: 'A statically typed, compiled programming language designed at Google.' },
    { name: 'Ruby on Rails', quadrant: 'Languages & Frameworks', ring: 'Hold', description: 'A server-side web application framework written in Ruby.' }
  ];

  // Handle item click
  const handleItemClick = (item) => {
    setSelectedItem(item);
    setIsModalVisible(true);
  };

  return (
    <Container>
      <SpaceBetween size="l">
        <Header variant="h2">{t('components:techRadarChartTest.title')}</Header>
        
        <Alert type="info">
          {t('components:techRadarChartTest.infoMessage')}
        </Alert>
        
        <Box padding="l">
          <Grid
            gridDefinition={[
              { colspan: { default: 12, xxs: 12 } }
            ]}
          >
            <Box textAlign="center">
              <TechRadarChart
                data={techRadarData}
                width={800}
                height={800}
                onItemClick={handleItemClick}
              />
            </Box>
          </Grid>
        </Box>
        
        <Modal
          visible={isModalVisible}
          onDismiss={() => setIsModalVisible(false)}
          header={selectedItem ? selectedItem.name : t('common:technologyDetails')}
          footer={
            <Box float="right">
              <Button variant="primary" onClick={() => setIsModalVisible(false)}>{t('common:close')}</Button>
            </Box>
          }
        >
          {selectedItem && (
            <SpaceBetween size="m">
              <div>
                <strong>{t('common:quadrant')}:</strong> {selectedItem.quadrant}
              </div>
              <div>
                <strong>{t('common:ring')}:</strong> {selectedItem.ring}
              </div>
              {selectedItem.description && (
                <div>
                  <strong>{t('common:description')}:</strong> {selectedItem.description}
                </div>
              )}
            </SpaceBetween>
          )}
        </Modal>
      </SpaceBetween>
    </Container>
  );
};

export default TechRadarChartTest;
