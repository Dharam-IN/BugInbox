import { NavLink, Outlet, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { resources, type Project } from '../api.ts';
import { ErrorNotice, Loading } from '../components/ui.tsx';
import { createContext, useContext } from 'react';

const ProjectContext = createContext<Project | null>(null);

export function useProject(): Project {
  const project = useContext(ProjectContext);
  if (!project) throw new Error('useProject must be used inside ProjectLayout');
  return project;
}

export function useProjectQuery(id: string) {
  return useQuery({ queryKey: ['project', id], queryFn: () => resources.project(id) });
}

export function ProjectLayout() {
  const { projectId = '' } = useParams();
  const query = useProjectQuery(projectId);

  if (query.isLoading) {
    return (
      <div className="content">
        <Loading label="Loading project" rows={4} />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="content">
        <ErrorNotice error={query.error ?? new Error('That project could not be loaded.')} />
      </div>
    );
  }

  const project = query.data.project;

  return (
    <ProjectContext.Provider value={project}>
      <div className="content">
        <header className="page-header">
          <div>
            <h1>{project.name}</h1>
            <p className="subtitle">
              <span className={`badge ${project.status}`}>{project.status === 'active' ? 'Active' : 'Paused'}</span>{' '}
              {project.usage.reportCount} stored report{project.usage.reportCount === 1 ? '' : 's'} · reports are deleted
              after {project.retentionDays} days
            </p>
          </div>
        </header>

        <nav className="segmented" aria-label="Project sections" style={{ marginBottom: 18 }}>
          <NavLink className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`} to={`/projects/${project.id}/reports`}>
            Reports
          </NavLink>
          <NavLink className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`} to={`/projects/${project.id}/install`}>
            Install
          </NavLink>
          <NavLink className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`} to={`/projects/${project.id}/settings`}>
            Widget settings
          </NavLink>
        </nav>

        <Outlet />
      </div>
    </ProjectContext.Provider>
  );
}
