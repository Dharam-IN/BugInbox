import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { resources, type ReportStatus } from '../api.ts';
import { AppShell } from '../components/AppShell.tsx';
import { ErrorNotice, Loading, StatusBadge, formatDateTime, formatRelative } from '../components/ui.tsx';
import { ImageIcon, InboxIcon } from '../components/icons.tsx';
import { ProjectTabs, useProjectContext } from './ProjectLayout.tsx';

type Filter = 'all' | ReportStatus;

const TABS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
];

const PAGE_SIZE = 25;

/** Shorten a page URL for the list, keeping the host and the path. */
function pageLabel(url: string | null, context: string | null): string | null {
  if (context) return context;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return url;
  }
}

function ReportRows({ projectId, status, showProject }: { projectId?: string; status?: ReportStatus; showProject: boolean }) {
  const query = useInfiniteQuery({
    queryKey: ['reports', projectId ?? 'all', status ?? 'all'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => resources.reports({ projectId, status, before: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (lastPage) => lastPage.nextBefore ?? undefined,
  });

  const reports = useMemo(() => query.data?.pages.flatMap((page) => page.reports) ?? [], [query.data]);

  if (query.isLoading) {
    return (
      <div className="panel-body">
        <Loading label="Loading reports" rows={5} />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="panel-body">
        <ErrorNotice error={query.error} />
        <button type="button" className="button secondary" style={{ marginTop: 12 }} onClick={() => void query.refetch()}>
          Try again
        </button>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="empty-state">
        <span className="icon" aria-hidden="true">
          <InboxIcon />
        </span>
        {status ? (
          <>
            <h3>No matching reports</h3>
            <p>Nothing here has that status right now. Try another tab.</p>
          </>
        ) : (
          <>
            <h3>No reports yet</h3>
            <p>Reports appear here as soon as someone sends one from your website.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="report-list">
        {reports.map((report) => {
          const page = pageLabel(report.pageUrl, report.pageContext);
          return (
            <Link key={report.id} className="report-row" to={`/reports/${report.id}`}>
              <div style={{ minWidth: 0 }}>
                <div className="message truncate">{report.excerpt}</div>
                <div className="meta">
                  {showProject ? <span>{report.projectName}</span> : null}
                  {page ? <span className="truncate">{page}</span> : <span>Page not collected</span>}
                  {report.reporterEmail ? <span>Contact given</span> : null}
                </div>
              </div>

              <div className="col">
                <span className="col-label">Attachment</span>
                {report.hasScreenshot ? (
                  <span className="attach-chip">
                    <ImageIcon />
                    Screenshot
                  </span>
                ) : (
                  <span className="muted" style={{ fontSize: 12.5 }}>
                    —
                  </span>
                )}
              </div>

              <div className="col nowrap muted" style={{ fontSize: 12.5 }}>
                <span className="col-label">Received</span>
                <time dateTime={report.createdAt} title={formatDateTime(report.createdAt)}>
                  {formatRelative(report.createdAt)}
                </time>
              </div>

              <div className="col status-col">
                <StatusBadge status={report.status} />
              </div>
            </Link>
          );
        })}
      </div>

      <div className="panel-body" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 12.5 }}>
          Showing {reports.length} report{reports.length === 1 ? '' : 's'}
        </span>
        <span style={{ marginLeft: 'auto' }} />
        {query.hasNextPage ? (
          <button
            type="button"
            className="button secondary"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        ) : (
          <span className="muted" style={{ fontSize: 12.5 }}>
            End of the list
          </span>
        )}
      </div>
    </>
  );
}

export function ReportsPage({ scope }: { scope: 'project' | 'all' }) {
  const { projectId } = useParams();
  // Filters live in the URL, so Back returns to the tab you were on and links
  // can be shared.
  const [params, setParams] = useSearchParams();

  const filter = (params.get('status') as Filter | null) ?? 'all';
  const projectFilter = scope === 'project' ? projectId : (params.get('projectId') ?? '') || undefined;

  const projects = useQuery({ queryKey: ['projects'], queryFn: resources.projects, enabled: scope === 'all' });
  const counts = useQuery({
    queryKey: ['report-counts', projectFilter ?? 'all'],
    queryFn: () => resources.reportCounts(projectFilter),
  });

  const countFor = (value: Filter): number | null => {
    if (!counts.data) return null;
    if (value === 'all') return counts.data.counts.total;
    return counts.data.counts[value];
  };

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value === '' || value === 'all') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  const body = (
    <>
      <div className="toolbar">
        {scope === 'all' ? (
          <>
            <label className="visually-hidden" htmlFor="inbox-project">
              Filter by project
            </label>
            <select
              id="inbox-project"
              className="inline-select"
              value={params.get('projectId') ?? ''}
              onChange={(event) => setParam('projectId', event.target.value)}
            >
              <option value="">All projects</option>
              {projects.data?.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </>
        ) : null}
      </div>

      <div className="panel">
        <div className="tabs" role="tablist" aria-label="Filter by status">
          {TABS.map((tab) => {
            const count = countFor(tab.value);
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={filter === tab.value}
                className="tab"
                onClick={() => setParam('status', tab.value)}
              >
                {tab.label}
                {count !== null ? <span className="count">{count}</span> : null}
              </button>
            );
          })}
        </div>

        <ReportRows
          key={`${projectFilter ?? 'all'}-${filter}`}
          projectId={projectFilter}
          status={filter === 'all' ? undefined : filter}
          showProject={scope === 'all'}
        />
      </div>

      <p className="muted" style={{ fontSize: 12.5 }}>
        Counts describe every stored report in this scope, not just the ones loaded below. Reports are removed
        automatically once they pass their project&apos;s retention window.
      </p>
    </>
  );

  if (scope === 'project') {
    return <ProjectScopedReports>{body}</ProjectScopedReports>;
  }

  return (
    <AppShell header={{ title: 'All reports' }}>
      <div className="page-body">
        <div className="page-intro">
          <h2>All reports</h2>
          <p>Everything from every project you own, newest first.</p>
        </div>
        {body}
      </div>
    </AppShell>
  );
}

function ProjectScopedReports({ children }: { children: React.ReactNode }) {
  const project = useProjectContext();
  return (
    <AppShell
      header={{
        title: project.name,
        breadcrumbs: [{ label: 'Projects', to: '/projects' }, { label: project.name }],
        actions: (
          <Link className="button secondary small" to={`/projects/${project.id}/install`}>
            Install
          </Link>
        ),
      }}
    >
      <div className="page-body">
        <ProjectTabs project={project} />
        {children}
      </div>
    </AppShell>
  );
}
