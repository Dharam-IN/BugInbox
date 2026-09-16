import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { resources, type ReportStatus } from '../api.ts';
import { AppShell } from '../components/AppShell.tsx';
import { ErrorNotice, Loading, Segmented, StatusBadge, formatDateTime } from '../components/ui.tsx';
import { BackIcon, CloseIcon } from '../components/icons.tsx';

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Screenshot" onClick={onClose}>
      <div className="lightbox-bar">
        <button type="button" className="icon-button" aria-label="Close screenshot" onClick={onClose} autoFocus>
          <CloseIcon />
        </button>
      </div>
      <img src={src} alt="Screenshot attached by the reporter, enlarged" onClick={(event) => event.stopPropagation()} />
    </div>
  );
}

export function ReportDetailPage() {
  const { reportId = '' } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  const query = useQuery({ queryKey: ['report', reportId], queryFn: () => resources.report(reportId) });

  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['report', reportId] }),
      client.invalidateQueries({ queryKey: ['reports'] }),
      client.invalidateQueries({ queryKey: ['report-counts'] }),
      client.invalidateQueries({ queryKey: ['overview'] }),
      client.invalidateQueries({ queryKey: ['projects'] }),
    ]);
  };

  const setStatus = useMutation({
    mutationFn: (status: ReportStatus) => resources.setReportStatus(reportId, status),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: () => resources.deleteReport(reportId),
    onSuccess: async () => {
      await invalidate();
      navigate(-1);
    },
  });

  if (query.isLoading) {
    return (
      <AppShell header={{ title: 'Report' }}>
        <div className="page-body">
          <Loading label="Loading report" rows={6} />
        </div>
      </AppShell>
    );
  }

  if (query.isError || !query.data) {
    return (
      <AppShell header={{ title: 'Report' }}>
        <div className="page-body">
          <ErrorNotice error={query.error ?? new Error('That report could not be loaded.')} />
        </div>
      </AppShell>
    );
  }

  const report = query.data.report;
  const browser = report.browser ?? {};
  const screenshotUrl = resources.screenshotUrl(report.id);

  return (
    <AppShell
      header={{
        title: 'Report',
        breadcrumbs: [
          { label: 'Projects', to: '/projects' },
          { label: report.projectName, to: `/projects/${report.projectId}/reports` },
          { label: 'Report' },
        ],
        actions: (
          <>
            <StatusBadge status={report.status} />
            <Link className="button secondary small" to={`/projects/${report.projectId}/reports`}>
              <BackIcon />
              Back to inbox
            </Link>
          </>
        ),
      }}
    >
      <div className="page-body">
        <div className="detail-grid">
          <div style={{ display: 'grid', gap: 20 }}>
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h3>What the reporter said</h3>
                  <p>Received {formatDateTime(report.createdAt)}</p>
                </div>
              </div>
              <div className="panel-body">
                <p className="message-body">{report.message}</p>
              </div>
            </div>

            {report.hasScreenshot ? (
              <div className="panel">
                <div className="panel-head">
                  <div>
                    <h3>Screenshot</h3>
                    <p>Attached by the reporter. Only you can open this file.</p>
                  </div>
                </div>
                <div className="panel-body">
                  <button
                    type="button"
                    className="shot-button"
                    onClick={() => setZoomed(true)}
                    aria-label="Enlarge the screenshot"
                  >
                    <img src={screenshotUrl} alt="Screenshot attached by the reporter" />
                  </button>
                  <p className="field-hint" style={{ marginTop: 8 }}>
                    Select the image to enlarge it. Press Escape to close.
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ display: 'grid', gap: 20 }}>
            <div className="panel">
              <div className="panel-head">
                <h3>Status</h3>
              </div>
              <div className="panel-body">
                <ErrorNotice error={setStatus.error} />
                <Segmented
                  label="Report status"
                  value={report.status}
                  onChange={(status) => setStatus.mutate(status)}
                  options={[
                    { value: 'new' as const, label: 'New' },
                    { value: 'in_progress' as const, label: 'In progress' },
                    { value: 'resolved' as const, label: 'Resolved' },
                  ]}
                />
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <div>
                  <h3>Context</h3>
                  <p>Everything BugInbox collected, and nothing else.</p>
                </div>
              </div>
              <div className="panel-body">
                <dl className="meta-list">
                  <div className="meta-row">
                    <dt>Project</dt>
                    <dd>
                      <Link to={`/projects/${report.projectId}/reports`}>{report.projectName}</Link>
                    </dd>
                  </div>
                  <div className="meta-row">
                    <dt>Page</dt>
                    <dd>
                      {report.pageUrl ? (
                        <a
                          className="break-anywhere"
                          href={report.pageUrl}
                          target="_blank"
                          rel="noreferrer noopener external"
                        >
                          {report.pageUrl}
                        </a>
                      ) : (
                        <span className="muted">Not collected</span>
                      )}
                    </dd>
                  </div>
                  <div className="meta-row">
                    <dt>Page context</dt>
                    <dd>{report.pageContext ?? <span className="muted">Not provided by the website</span>}</dd>
                  </div>
                  <div className="meta-row">
                    <dt>Contact</dt>
                    <dd>
                      {report.reporterEmail ? (
                        <a className="break-anywhere" href={`mailto:${report.reporterEmail}`}>
                          {report.reporterEmail}
                        </a>
                      ) : (
                        <span className="muted">Not provided</span>
                      )}
                    </dd>
                  </div>
                  <div className="meta-row">
                    <dt>Received</dt>
                    <dd>{formatDateTime(report.createdAt)}</dd>
                  </div>
                  <div className="meta-row">
                    <dt>Deleted on</dt>
                    <dd>{formatDateTime(report.expiresAt)}</dd>
                  </div>
                  <div className="meta-row">
                    <dt>Device</dt>
                    <dd>{browser.device ?? <span className="muted">Unknown</span>}</dd>
                  </div>
                  <div className="meta-row">
                    <dt>Viewport</dt>
                    <dd>
                      {browser.viewportWidth && browser.viewportHeight ? (
                        `${browser.viewportWidth} × ${browser.viewportHeight}${browser.devicePixelRatio ? ` at ${browser.devicePixelRatio}×` : ''}`
                      ) : (
                        <span className="muted">Unknown</span>
                      )}
                    </dd>
                  </div>
                  <div className="meta-row">
                    <dt>Language</dt>
                    <dd>{browser.language ?? <span className="muted">Unknown</span>}</dd>
                  </div>
                  <div className="meta-row">
                    <dt>Time zone</dt>
                    <dd>{browser.timezone ?? <span className="muted">Unknown</span>}</dd>
                  </div>
                  <div className="meta-row">
                    <dt>Browser</dt>
                    <dd className="break-anywhere">{browser.userAgent ?? <span className="muted">Unknown</span>}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="panel">
              <div className="panel-body" style={{ display: 'grid', gap: 10 }}>
                <ErrorNotice error={remove.error} />
                {confirmDelete ? (
                  <>
                    <p className="field-hint">
                      This removes the report and any screenshot immediately. It cannot be undone.
                    </p>
                    <div className="toolbar">
                      <button type="button" className="button danger small" onClick={() => remove.mutate()} disabled={remove.isPending}>
                        {remove.isPending ? 'Deleting…' : 'Yes, delete it'}
                      </button>
                      <button type="button" className="button ghost small" onClick={() => setConfirmDelete(false)}>
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <button type="button" className="button ghost small" onClick={() => setConfirmDelete(true)} style={{ justifySelf: 'start' }}>
                    Delete this report…
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {zoomed ? <Lightbox src={screenshotUrl} onClose={() => setZoomed(false)} /> : null}
    </AppShell>
  );
}
