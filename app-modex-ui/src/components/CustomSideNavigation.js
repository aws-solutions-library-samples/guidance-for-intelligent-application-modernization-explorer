import React from 'react';
import { SideNavigation } from '@cloudscape-design/components';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function CustomSideNavigation({ activeHref, onNavigate }) {
  const { t } = useTranslation(['components', 'common']);
  const location = useLocation();
  const isProjectsListPage = location.pathname === '/projects';
  const isProjectSelected = !!localStorage.getItem('selectedProject');
  const selectedProject = localStorage.getItem('selectedProject');
  
  // If on projects list page or no project selected, show limited navigation
  if (isProjectsListPage || !isProjectSelected) {
    const navigationItems = [
      {
        type: "link",
        text: t('components:navigation.projects'),
        href: "/projects"
      }
    ];

    return (
      <SideNavigation
        activeHref={activeHref}
        onFollow={onNavigate}
        items={navigationItems}
      />
    );
  }

  // Full navigation when a project is selected
  // Get projectId for Process Dashboard link
  const projectData = selectedProject ? JSON.parse(selectedProject) : null;
  const projectId = projectData?.projectId;

  const navigationItems = [
    {
      type: "link",
      text: t('components:navigation.switchProject'),
      href: "/projects"
    },
    { type: "divider" },
    {
      type: "section",
      text: t('components:navigation.project'),
      items: [
        { type: "link", text: t('components:navigation.overview'), href: "/home" },
        { type: "link", text: t('components:navigation.exportData'), href: "/project/export" },
        { type: "link", text: t('components:navigation.processDashboard'), href: `/projects/${projectId}/processes` }
      ]
    },
    { type: "divider" },
    {
      type: "section",
      text: t('components:navigation.data'),
      items: [
        { type: "link", text: t('components:navigation.teamSkills'), href: "/data/skills" },
        { type: "link", text: t('components:navigation.technologyVision'), href: "/data/vision" },
        {
          type: "section",
          text: t('components:navigation.applications'),
          items: [
            { type: "link", text: t('components:navigation.portfolio'), href: "/data/applications/portfolio" },
            { type: "link", text: t('components:navigation.techStack'), href: "/data/applications/tech-stack" },
            { type: "link", text: t('components:navigation.infrastructure'), href: "/data/applications/infrastructure" },
            { type: "link", text: t('components:navigation.utilization'), href: "/data/applications/utilization" }
          ]
        }
      ]
    },
    {
      type: "section",
      text: t('components:navigation.insights'),
      items: [
        { type: "link", text: t('components:navigation.teamAnalysis'), href: "/insights/team-analysis" },
        { type: "link", text: t('components:navigation.skillsAnalysis'), href: "/insights/skills" },
        { type: "link", text: t('components:navigation.visionAnalysis'), href: "/insights/vision" },
        { type: "link", text: t('components:navigation.techStackAnalysis'), href: "/insights/tech-stack" },
        { type: "link", text: t('components:navigation.infrastructureAnalysis'), href: "/insights/infrastructure" },
        { type: "link", text: t('components:navigation.utilizationAnalysis'), href: "/insights/utilization" },
        { type: "link", text: t('components:navigation.dataDivergencies'), href: "/insights/data-divergencies" }
      ]
    },
    {
      type: "section",
      text: t('components:navigation.techStackSimilarities'),
      items: [
        { type: "link", text: t('components:navigation.applicationSimilarities'), href: "/similarities/applications" },
        { type: "link", text: t('components:navigation.componentSimilarities'), href: "/similarities/components" }
      ]
    },
    {
      type: "section",
      text: t('components:navigation.planning'),
      items: [
        { type: "link", text: t('components:navigation.pilotIdentification'), href: "/planning/pilot-identification" },
        { type: "link", text: t('components:navigation.applicationBuckets'), href: "/planning/application-grouping" },
        {
          type: "section",
          text: t('components:navigation.estimates'),
          items: [
            { type: "link", text: t('components:navigation.tcoEstimates'), href: "/planning/tco-estimates" },
            { type: "link", text: t('components:navigation.teamEstimates'), href: "/planning/team-estimates" }
          ]
        }
      ]
    },

  ];

  return (
    <SideNavigation
      activeHref={activeHref}
      onFollow={onNavigate}
      items={navigationItems}
    />
  );
}

export default CustomSideNavigation;
