import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { resources, type ProjectSummary } from '../api.ts';
import { AppShell } from '../components/AppShell.tsx';
import { ErrorNotice, Loading, formatDateTime, formatRelative } from '../components/ui.tsx';
import { PlusIcon, ProjectsIcon } from '../components/icons.tsx';

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
}

/** Strip the scheme so the website reads as a domain, keeping any port. */
function websiteLabel(origin: string | null): string {
  if (!origin) return 'No website configured';
  try {
    const url = new URL(origin);
    return `${url.host}${url.protocol === 'http:' ? ' (http)' : ''}`;
  } catch {
    return origin;
  }
}

function StateBadge({ status }: { status: ProjectSummary['status'] }) {
  return (
    <span
      className={`badge ${status}`}
      title={
        status === 'active'
          ? 'Accepting submissions. This does not confirm the script is installed.'
          : 'Not accepting submissions. The server rejects new reports.'
      }
    >
      {status === 'active' ? 'Active' : 'Paused'}
    </span>
  );
}

function RowActions({ project }: { project: ProjectSummary }) {
  return (
    <>
      <Link className="button secondary small" to={`/projects/${project.id}/reports`}>
        View reports
      </Link>
      <Link className="button ghost small" to={`/projects/${project.id}/install`}>
        Install
      </Link>
      <Link className="button ghost small" to={`/projects/${project.id}/settings`}>
        Settings
      </Link>
    </>
  );
}

export function ProjectsPage() {
  const [search, setSearch] = useState('');
  const query = useQuery({ queryKey: ['projects'], queryFn: resources.projects });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = query.data?.projects ?? [];
    if (term === '') return all;
    return all.filter(
      (project) =>
        project.name.toLowerCase().includes(term) || (project.primaryOrigin ?? '').toLowerCase().includes(term),
    );
  }, [query.data, search]);

  const total = query.data?.projects.length ?? 0;

  return (
    <AppShell
      header={{
        title: 'Projects',
        actions: (
          <Link className="button" to="/projects/new">
            <PlusIcon />
            New project
          </Link>
        ),
      }}
    >
      <div className="page-body">
        <div className="page-intro">
          <h2>Projects</h2>
          <p>One project per website. Each has its own widget settings, allowed websites and inbox.</p>
        </div>

        {query.isLoading ? (
          <div className="panel">
            <div className="panel-body">
              <Loading label="Loading projects" rows={4} />
            </div>
          </div>
        ) : null}

        {query.isError ? (
          <div className="panel">
            <div className="panel-body">
              <ErrorNotice error={query.error} />
              <button type="button" className="button secondary" style={{ marginTop: 12 }} onClick={() => void query.refetch()}>
                Try again
              </button>
            </div>
          </div>
        ) : null}

        {query.data ? (
          total === 0 ? (
            <div className="panel">
              <div className="empty-state">
                <span className="icon" aria-hidden="true">
                  <ProjectsIcon />
                </span>
                <h3>No projects yet</h3>
                <p>
                  A project holds the widget settings and the reports for one website. The setup walks you from naming
                  it to a working snippet.
                </p>
                <Link className="button" to="/projects/new">
                  Create your first project
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="toolbar">
                <label className="visually-hidden" htmlFor="project-search">
                  Search projects
                </label>
                <input
                  id="project-search"
                  className="search-input"
                  type="search"
                  placeholder="Search by name or website"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {filtered.length} of {total} project{total === 1 ? '' : 's'}
                </span>
              </div>

              {filtered.length === 0 ? (
                <div className="panel">
                  <div className="empty-state">
                    <h3>No matching projects</h3>
                    <p>Nothing matches “{search.trim()}”. Try a different name or website.</p>
                    <button type="button" className="button secondary" onClick={() => setSearch('')}>
                      Clear search
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Desktop: a scannable table. */}
                  <div className="panel desktop-table">
                    <div className="panel-body flush">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th scope="col">Project</th>
                            <th scope="col">State</th>
                            <th scope="col">New</th>
                            <th scope="col">Latest report</th>
                            <th scope="col">
                              <span className="visually-hidden">Actions</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((project) => (
                            <tr key={project.id}>
                              <td>
                                <div className="cell-primary">
                                  <span className="avatar" aria-hidden="true">
                                    {initials(project.name)}
                                  </span>
                                  <span className="truncate">
                                    <Link className="name" to={`/projects/${project.id}/reports`}>
                                      {project.name}
                                    </Link>
                                    <span className="sub truncate" style={{ display: 'block' }}>
                                      {websiteLabel(project.primaryOrigin)}
                                    </span>
                                  </span>
                                </div>
                              </td>
                              <td>
                                <StateBadge status={project.status} />
                              </td>
                              <td className="numeric">
                                {project.newReportCount > 0 ? (
                                  <span className="badge new">{project.newReportCount}</span>
                                ) : (
                                  <span className="muted">0</span>
                                )}
                              </td>
                              <td className="nowrap muted">
                                {project.latestReportAt ? (
                                  <time dateTime={project.latestReportAt} title={formatDateTime(project.latestReportAt)}>
                                    {formatRelative(project.latestReportAt)}
                                  </time>
                                ) : (
                                  'No reports yet'
                                )}
                              </td>
                              <td className="actions">
                                <RowActions project={project} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mobile: the same information as compact cards. */}
                  <div className="mobile-cards">
                    {filtered.map((project) => (
                      <div className="panel" key={project.id} style={{ marginBottom: 12 }}>
                        <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
                          <div className="cell-primary">
                            <span className="avatar" aria-hidden="true">
                              {initials(project.name)}
                            </span>
                            <span className="truncate" style={{ flex: 1 }}>
                              <Link className="name" to={`/projects/${project.id}/reports`}>
                                {project.name}
                              </Link>
                              <span className="sub truncate" style={{ display: 'block' }}>
                                {websiteLabel(project.primaryOrigin)}
                              </span>
                            </span>
                            <StateBadge status={project.status} />
                          </div>
                          <div className="toolbar" style={{ fontSize: 12.5 }}>
                            <span className="muted">
                              {project.newReportCount} new ·{' '}
                              {project.latestReportAt ? formatRelative(project.latestReportAt) : 'No reports yet'}
                            </span>
                          </div>
                          <div className="toolbar">
                            <RowActions project={project} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )
        ) : null}
      </div>
    </AppShell>
  );
}
