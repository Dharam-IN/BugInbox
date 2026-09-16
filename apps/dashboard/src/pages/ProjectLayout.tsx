import { createContext, useContext } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { resources, type Project } from '../api.ts';
import { AppShell } from '../components/AppShell.tsx';
import { ErrorNotice, Loading } from '../components/ui.tsx';

const ProjectContext = createContext<Project | null>(null);

export function useProjectContext(): Project {
  const project = useContext(ProjectContext);
  if (!project) throw new Error('useProjectContext must be used inside ProjectProvider');
  return project;
}

/** Kept for the pages that already imported it under this name. */
export const useProject = useProjectContext;

export function useProjectQuery(id: string) {
  return useQuery({ queryKey: ['project', id], queryFn: () => resources.project(id) });
}

/** Section navigation shown on every project screen. */
export function ProjectTabs({ project }: { project: Project }) {
  const sections = [
    { to: `/projects/${project.id}/reports`, label: 'Reports' },
    { to: `/projects/${project.id}/install`, label: 'Install' },
    { to: `/projects/${project.id}/settings`, label: 'Settings' },
  ];

  // Plain links rather than ARIA tabs: they change the URL, and nesting a tab
  // role inside a link would give the row two conflicting interactive meanings.
  return (
    <div className="toolbar" style={{ gap: 4 }}>
      <nav className="tabs" aria-label="Project sections" style={{ flex: 1 }}>
        {sections.map((section) => (
          <NavLink
            key={section.to}
            to={section.to}
            className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}
          >
            {section.label}
          </NavLink>
        ))}
      </nav>
      <span className={`badge ${project.status}`}>{project.status === 'active' ? 'Active' : 'Paused'}</span>
    </div>
  );
}

/**
 * Loads the project once and shares it with every project screen. Each screen
 * renders its own AppShell so it can set its own header action.
 */
export function ProjectProvider() {
  const { projectId = '' } = useParams();
  const query = useProjectQuery(projectId);

  if (query.isLoading) {
    return (
      <AppShell header={{ title: 'Project' }}>
        <div className="page-body">
          <Loading label="Loading project" rows={5} />
        </div>
      </AppShell>
    );
  }

  if (query.isError || !query.data) {
    return (
      <AppShell header={{ title: 'Project' }}>
        <div className="page-body">
          <ErrorNotice error={query.error ?? new Error('That project could not be loaded.')} />
        </div>
      </AppShell>
    );
  }

  return (
    <ProjectContext.Provider value={query.data.project}>
      <Outlet />
    </ProjectContext.Provider>
  );
}
