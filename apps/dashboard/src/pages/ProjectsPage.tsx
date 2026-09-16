import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { resources } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { Card, Empty, ErrorNotice, Loading, Notice, formatBytes, formatRelative } from '../components/ui.tsx';

export function ProjectsPage() {
  const query = useQuery({ queryKey: ['projects'], queryFn: resources.projects });

  return (
    <div className="content">
      <header className="page-header">
        <div>
          <h1>Projects</h1>
          <p className="subtitle">One project per website you collect feedback for.</p>
        </div>
        <Link className="button" to="/projects/new">
          New project
        </Link>
      </header>

      {query.isLoading ? <Loading label="Loading projects" rows={3} /> : null}
      {query.isError ? <ErrorNotice error={query.error} /> : null}

      {query.data ? (
        query.data.projects.length === 0 ? (
          <Card>
            <Empty
              title="No projects yet"
              action={
                <Link className="button" to="/projects/new">
                  Create your first project
                </Link>
              }
            >
              A project holds the widget settings and the reports for one website.
            </Empty>
          </Card>
        ) : (
          <div className="list">
            {query.data.projects.map((project) => (
              <Link key={project.id} className="list-item" to={`/projects/${project.id}/reports`}>
                <div className="spread">
                  <div>
                    <h2>{project.name}</h2>
                    <p className="meta">
                      Created {formatRelative(project.createdAt)} · {project.reportCount} report
                      {project.reportCount === 1 ? '' : 's'} · {formatBytes(project.storageBytes)} of screenshots
                    </p>
                  </div>
                  <div className="row tight">
                    {project.newReportCount > 0 ? (
                      <span className="badge new">
                        {project.newReportCount} new
                      </span>
                    ) : null}
                    <span className={`badge ${project.status}`}>{project.status === 'active' ? 'Active' : 'Paused'}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

export function NewProjectPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const { owner } = useAuth();
  const [name, setName] = useState('');
  const [origins, setOrigins] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      resources.createProject(
        name.trim(),
        origins
          .split(/[\n,]/)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    onSuccess: async ({ project }) => {
      await client.invalidateQueries({ queryKey: ['projects'] });
      navigate(`/projects/${project.id}/install`);
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <div className="content narrow">
      <header className="page-header">
        <div>
          <h1>New project</h1>
          <p className="subtitle">You can change everything later.</p>
        </div>
      </header>

      {owner && !owner.emailVerified ? (
        <Notice kind="warning">
          Confirm your email address before creating a project. Open <Link to="/account">your account</Link> to send a
          fresh confirmation link.
        </Notice>
      ) : null}

      <Card>
        <form className="stack" onSubmit={onSubmit}>
          <ErrorNotice error={mutation.error} />
          <label className="field">
            <span className="field-label">Project name</span>
            <input
              type="text"
              required
              maxLength={80}
              value={name}
              placeholder="Acme marketing site"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Allowed website origins</span>
            <textarea
              required
              value={origins}
              placeholder={'https://acme.example\nhttp://localhost:5173'}
              onChange={(e) => setOrigins(e.target.value)}
            />
            <span className="field-hint">
              One per line. Scheme, host and port only — no paths and no wildcards. Reports are only accepted from these
              exact origins. Add your local development origin too, for example <code>http://localhost:5173</code>.
            </span>
          </label>
          <button className="button" type="submit" disabled={mutation.isPending || !owner?.emailVerified}>
            {mutation.isPending ? 'Creating…' : 'Create project'}
          </button>
        </form>
      </Card>
    </div>
  );
}
