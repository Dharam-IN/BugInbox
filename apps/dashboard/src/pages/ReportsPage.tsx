import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { resources, type ReportStatus } from '../api.ts';
import {
  Card,
  CardHeader,
  Empty,
  ErrorNotice,
  Loading,
  Notice,
  Segmented,
  StatusBadge,
  formatDateTime,
  formatRelative,
} from '../components/ui.tsx';

type Filter = 'all' | ReportStatus;

export function ReportsPage({ scope }: { scope: 'project' | 'all' }) {
  const { projectId } = useParams();
  const [filter, setFilter] = useState<Filter>('all');

  const listQuery = useQuery({
    queryKey: ['reports', projectId ?? 'all', filter],
    queryFn: () =>
      resources.reports({
        projectId: scope === 'project' ? projectId : undefined,
        status: filter === 'all' ? undefined : filter,
        limit: 50,
      }),
  });

  const countsQuery = useQuery({
    queryKey: ['report-counts', projectId ?? 'all'],
    queryFn: () => resources.reportCounts(scope === 'project' ? projectId : undefined),
  });

  const counts = countsQuery.data?.counts;

  const body = (
    <>
      <div className="filters">
        <Segmented
          label="Filter by status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: counts ? `All (${counts.total})` : 'All' },
            { value: 'new', label: counts ? `New (${counts.new})` : 'New' },
            { value: 'in_progress', label: counts ? `In progress (${counts.in_progress})` : 'In progress' },
            { value: 'resolved', label: counts ? `Resolved (${counts.resolved})` : 'Resolved' },
          ]}
        />
      </div>

      {listQuery.isLoading ? <Loading label="Loading reports" rows={4} /> : null}
      {listQuery.isError ? <ErrorNotice error={listQuery.error} /> : null}

      {listQuery.data ? (
        listQuery.data.reports.length === 0 ? (
          <Card>
            <Empty title={filter === 'all' ? 'No reports yet' : 'Nothing with that status'}>
              {filter === 'all'
                ? 'Reports appear here as soon as someone submits one from your website.'
                : 'Try a different status filter.'}
            </Empty>
          </Card>
        ) : (
          <div className="list">
            {listQuery.data.reports.map((report) => (
              <Link key={report.id} className="list-item" to={`/reports/${report.id}`}>
                <div className="spread" style={{ alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 560 }}>{report.excerpt}</p>
                    <p className="meta">
                      {scope === 'all' ? `${report.projectName} · ` : ''}
                      {formatRelative(report.createdAt)}
                      {report.pageContext ? ` · ${report.pageContext}` : report.pageUrl ? ` · ${report.pageUrl}` : ''}
                      {report.hasScreenshot ? ' · screenshot' : ''}
                      {report.reporterEmail ? ' · contact given' : ''}
                    </p>
                  </div>
                  <StatusBadge status={report.status} />
                </div>
              </Link>
            ))}
          </div>
        )
      ) : null}

      {listQuery.data?.nextBefore ? (
        <p className="field-hint" style={{ marginTop: 12 }}>
          Showing the 50 most recent reports for this filter.
        </p>
      ) : null}
    </>
  );

  if (scope === 'project') return <div className="stack">{body}</div>;

  return (
    <div className="content">
      <header className="page-header">
        <div>
          <h1>All reports</h1>
          <p className="subtitle">Everything from every project you own.</p>
        </div>
      </header>
      {body}
    </div>
  );
}

export function ReportDetailPage() {
  const { reportId = '' } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const query = useQuery({ queryKey: ['report', reportId], queryFn: () => resources.report(reportId) });

  const setStatus = useMutation({
    mutationFn: (status: ReportStatus) => resources.setReportStatus(reportId, status),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['report', reportId] });
      await client.invalidateQueries({ queryKey: ['reports'] });
      await client.invalidateQueries({ queryKey: ['report-counts'] });
    },
  });

  const remove = useMutation({
    mutationFn: () => resources.deleteReport(reportId),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['reports'] });
      await client.invalidateQueries({ queryKey: ['report-counts'] });
      await client.invalidateQueries({ queryKey: ['projects'] });
      navigate(-1);
    },
  });

  if (query.isLoading) {
    return (
      <div className="content">
        <Loading label="Loading report" rows={5} />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="content">
        <ErrorNotice error={query.error ?? new Error('That report could not be loaded.')} />
      </div>
    );
  }

  const report = query.data.report;
  const browser = report.browser ?? {};

  return (
    <div className="content">
      <header className="page-header">
        <div>
          <h1>Report</h1>
          <p className="subtitle">
            <Link to={`/projects/${report.projectId}/reports`}>{report.projectName}</Link> ·{' '}
            {formatDateTime(report.createdAt)}
          </p>
        </div>
        <div className="row tight">
          <StatusBadge status={report.status} />
        </div>
      </header>

      <Card>
        <CardHeader title="What the reporter said" />
        <p className="report-body">{report.message}</p>
      </Card>

      <Card>
        <CardHeader title="Status" />
        <ErrorNotice error={setStatus.error} />
        <Segmented
          label="Report status"
          value={report.status}
          onChange={(status) => setStatus.mutate(status)}
          options={[
            { value: 'new', label: 'New' },
            { value: 'in_progress', label: 'In progress' },
            { value: 'resolved', label: 'Resolved' },
          ]}
        />
      </Card>

      {report.hasScreenshot ? (
        <Card>
          <CardHeader title="Screenshot" subtitle="Uploaded by the reporter. Only you can open this file." />
          <img className="screenshot" src={resources.screenshotUrl(report.id)} alt="Screenshot attached by the reporter" />
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Context" subtitle="Everything BugInbox collected, and nothing else." />
        <dl className="definition">
          <dt>Contact email</dt>
          <dd>
            {report.reporterEmail ? (
              <a href={`mailto:${report.reporterEmail}`}>{report.reporterEmail}</a>
            ) : (
              <span className="field-hint">Not provided</span>
            )}
          </dd>

          <dt>Page</dt>
          <dd>
            {report.pageUrl ? (
              <span className="mono">{report.pageUrl}</span>
            ) : (
              <span className="field-hint">Not collected</span>
            )}
          </dd>

          <dt>Page context</dt>
          <dd>{report.pageContext ?? <span className="field-hint">Not provided by the website</span>}</dd>

          <dt>Received</dt>
          <dd>{formatDateTime(report.createdAt)}</dd>

          <dt>Deleted on</dt>
          <dd>{formatDateTime(report.expiresAt)}</dd>

          <dt>Device</dt>
          <dd>{browser.device ?? <span className="field-hint">Unknown</span>}</dd>

          <dt>Viewport</dt>
          <dd>
            {browser.viewportWidth && browser.viewportHeight ? (
              `${browser.viewportWidth} × ${browser.viewportHeight}${browser.devicePixelRatio ? ` at ${browser.devicePixelRatio}×` : ''}`
            ) : (
              <span className="field-hint">Unknown</span>
            )}
          </dd>

          <dt>Language</dt>
          <dd>{browser.language ?? <span className="field-hint">Unknown</span>}</dd>

          <dt>Time zone</dt>
          <dd>{browser.timezone ?? <span className="field-hint">Unknown</span>}</dd>

          <dt>Browser</dt>
          <dd style={{ wordBreak: 'break-word' }}>{browser.userAgent ?? <span className="field-hint">Unknown</span>}</dd>
        </dl>
      </Card>

      <Card className="danger-zone">
        <CardHeader title="Delete this report" subtitle="Removes the report and any screenshot immediately." />
        <ErrorNotice error={remove.error} />
        {confirmDelete ? (
          <div className="row">
            <button className="button danger" type="button" onClick={() => remove.mutate()} disabled={remove.isPending}>
              {remove.isPending ? 'Deleting…' : 'Yes, delete it'}
            </button>
            <button className="button ghost" type="button" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="button danger" type="button" onClick={() => setConfirmDelete(true)}>
            Delete report…
          </button>
        )}
      </Card>

      {report.status === 'resolved' ? (
        <Notice kind="info">
          Resolved reports stay here until the retention window ends, then they are deleted automatically.
        </Notice>
      ) : null}
    </div>
  );
}
