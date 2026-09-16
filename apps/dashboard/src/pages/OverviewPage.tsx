import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { resources, type RangeDays } from '../api.ts';
import { AppShell } from '../components/AppShell.tsx';
import { DailyBarChart, StatusBreakdown } from '../components/charts.tsx';
import { ErrorNotice, Loading, StatusBadge, formatDateTime, formatRelative } from '../components/ui.tsx';
import { InboxIcon, PlusIcon } from '../components/icons.tsx';

const RANGES: Array<{ value: RangeDays; label: string }> = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
];

function StatCard({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: number;
  tone: 'received' | 'new' | 'in_progress' | 'resolved';
  note: string;
}) {
  return (
    <div className="stat">
      <span className="stat-label">
        <span className={`dot ${tone}`} aria-hidden="true" />
        {label}
      </span>
      <span className="stat-value">{value}</span>
      <span className="stat-note">{note}</span>
    </div>
  );
}

export function OverviewPage() {
  const [days, setDays] = useState<RangeDays>(7);
  const [projectId, setProjectId] = useState<string>('');

  const projects = useQuery({ queryKey: ['projects'], queryFn: resources.projects });
  const scope = projectId === '' ? undefined : projectId;

  const stats = useQuery({
    queryKey: ['overview', scope ?? 'all', days],
    queryFn: () => resources.overview({ projectId: scope, days }),
  });

  const data = stats.data;
  const rangeLabel = RANGES.find((range) => range.value === days)?.label.toLowerCase() ?? '';
  const hasProjects = (projects.data?.projects.length ?? 0) > 0;

  return (
    <AppShell
      header={{
        title: 'Overview',
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
          <h2>Overview</h2>
          <p>
            What arrived in the selected period, and where those reports stand now. Days are counted in UTC and only
            reports still stored are included — reports are removed after their project&apos;s retention window.
          </p>
        </div>

        <div className="toolbar">
          <label className="visually-hidden" htmlFor="overview-project">
            Project
          </label>
          <select
            id="overview-project"
            className="inline-select"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">All projects</option>
            {projects.data?.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          <label className="visually-hidden" htmlFor="overview-range">
            Date range
          </label>
          <select
            id="overview-range"
            className="inline-select"
            value={days}
            onChange={(event) => setDays(Number(event.target.value) as RangeDays)}
          >
            {RANGES.map((range) => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </select>

          {data?.range.from && data.range.to ? (
            <span className="muted" style={{ fontSize: 12.5 }}>
              {data.range.from} to {data.range.to} ({data.range.timezone})
            </span>
          ) : null}
        </div>

        {stats.isError ? (
          <div className="panel">
            <div className="panel-body">
              <ErrorNotice error={stats.error} />
              <button type="button" className="button secondary" onClick={() => void stats.refetch()} style={{ marginTop: 12 }}>
                Try again
              </button>
            </div>
          </div>
        ) : null}

        {stats.isLoading || !data ? (
          <div className="panel">
            <div className="panel-body">
              <Loading label="Loading your overview" rows={5} />
            </div>
          </div>
        ) : (
          <>
            <div className="stat-grid">
              <StatCard label="Reports received" value={data.totals.received} tone="received" note={`Created in the ${rangeLabel}`} />
              <StatCard label="New" value={data.totals.new} tone="new" note="Current status of those reports" />
              <StatCard label="In progress" value={data.totals.inProgress} tone="in_progress" note="Current status of those reports" />
              <StatCard label="Resolved" value={data.totals.resolved} tone="resolved" note="Current status of those reports" />
            </div>

            <p className="muted" style={{ fontSize: 12.5, marginTop: -8 }}>
              All four figures describe the same set of reports: the ones created in this period. The three status
              figures are their status <strong>right now</strong>, not the number resolved during the period.
            </p>

            {data.totals.received === 0 ? (
              <div className="panel">
                <div className="empty-state">
                  <span className="icon" aria-hidden="true">
                    <InboxIcon />
                  </span>
                  {data.lifetime.reports === 0 ? (
                    <>
                      <h3>{hasProjects ? 'No reports yet' : 'Create your first project'}</h3>
                      <p>
                        {hasProjects
                          ? 'Once the widget is installed on your website and someone sends a report, it will appear here.'
                          : 'A project holds the widget settings and the inbox for one website. Setting one up takes a couple of minutes.'}
                      </p>
                      <Link className="button" to={hasProjects ? '/projects' : '/projects/new'}>
                        {hasProjects ? 'Finish installing the widget' : 'Create a project'}
                      </Link>
                    </>
                  ) : (
                    <>
                      <h3>Nothing in this period</h3>
                      <p>
                        No reports were created in the {rangeLabel}. You have {data.lifetime.reports} report
                        {data.lifetime.reports === 1 ? '' : 's'} in total — try a longer range or open the inbox.
                      </p>
                      <Link className="button secondary" to="/reports">
                        Open the inbox
                      </Link>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <h3>Reports received per day</h3>
                      <p>Each bar is one UTC day in the selected period.</p>
                    </div>
                  </div>
                  <div className="panel-body">
                    <DailyBarChart data={data.daily} timezone={data.range.timezone} />
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-head">
                    <div>
                      <h3>Where those reports stand now</h3>
                      <p>Current status of the {data.totals.received} reports created in this period.</p>
                    </div>
                  </div>
                  <div className="panel-body">
                    <StatusBreakdown
                      total={data.totals.received}
                      slices={[
                        { key: 'new', label: 'New', count: data.totals.new },
                        { key: 'in_progress', label: 'In progress', count: data.totals.inProgress },
                        { key: 'resolved', label: 'Resolved', count: data.totals.resolved },
                      ]}
                    />
                  </div>
                </div>
              </>
            )}

            {data.recent.length > 0 ? (
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Recent reports</h3>
                    <p>The newest reports in this period.</p>
                  </div>
                  <Link className="button secondary small" to={scope ? `/projects/${scope}/reports` : '/reports'}>
                    View all
                  </Link>
                </div>
                <div className="panel-body flush">
                  <div className="report-list compact">
                    {data.recent.map((report) => (
                      <Link key={report.id} className="report-row" to={`/reports/${report.id}`}>
                        <div>
                          <div className="message truncate">{report.excerpt}</div>
                          <div className="meta">
                            <span>{report.projectName}</span>
                            {report.pageContext ?? report.pageUrl ? (
                              <span className="truncate">{report.pageContext ?? report.pageUrl}</span>
                            ) : null}
                            {report.hasScreenshot ? <span className="attach-chip">Screenshot</span> : null}
                          </div>
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
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
