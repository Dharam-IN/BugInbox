import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ACCENT_COLOR_PATTERN, LAUNCHER_POSITIONS, type LauncherPosition } from '@buginbox/shared';
import { resources, type Project } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { AppShell } from '../components/AppShell.tsx';
import { ErrorNotice, Notice, Segmented } from '../components/ui.tsx';
import { CheckIcon } from '../components/icons.tsx';
import { isLocalOrigin, resolveOrigin } from '../lib/origin.ts';
import { useSystemPrefersDark } from '../theme.tsx';

type Step = 'website' | 'appearance' | 'install';

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'website', label: 'Website' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'install', label: 'Install and test' },
];

const POSITION_LABELS: Record<LauncherPosition, string> = {
  'bottom-right': 'Bottom right',
  'bottom-left': 'Bottom left',
  'top-right': 'Top right',
  'top-left': 'Top left',
};

interface AppearanceDraft {
  launcherText: string;
  accentColor: string;
  theme: 'light' | 'dark' | 'system';
  position: LauncherPosition;
}

const DEFAULT_APPEARANCE: AppearanceDraft = {
  launcherText: 'Report a problem',
  accentColor: '#2f6df6',
  theme: 'system',
  position: 'bottom-right',
};

function Stepper({ current }: { current: Step }) {
  const index = STEPS.findIndex((step) => step.id === current);
  return (
    <ol className="stepper" aria-label="Setup progress" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {STEPS.map((step, position) => {
        const state = position < index ? 'done' : position === index ? 'current' : 'todo';
        return (
          <li key={step.id} style={{ display: 'contents' }}>
            <span className={`step-pill ${state}`} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="num" aria-hidden="true">
                {state === 'done' ? '✓' : position + 1}
              </span>
              {step.label}
              {state === 'done' ? <span className="visually-hidden"> (completed)</span> : null}
            </span>
            {position < STEPS.length - 1 ? (
              <span className="step-sep" aria-hidden="true">
                ›
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Small live preview, mirroring the widget's own palette rather than the interface theme. */
function MiniPreview({
  launcherText,
  accentColor,
  theme,
  position,
}: {
  launcherText: string;
  accentColor: string;
  theme: 'light' | 'dark' | 'system';
  position: LauncherPosition;
}) {
  const prefersDark = useSystemPrefersDark();
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  const [vertical, horizontal] = position.split('-') as ['top' | 'bottom', 'left' | 'right'];

  return (
    <div className="preview-stage" style={{ height: 230 }}>
      <div
        className={`preview-panel ${dark ? 'dark' : 'light'}`}
        style={{ [vertical]: 68, [horizontal]: 16, width: 210 }}
      >
        <strong>{launcherText || 'Report a problem'}</strong>
        <div className="fake-input" style={{ height: 38 }} />
        <div className="fake-input" />
        <div className="fake-button" style={{ background: accentColor }}>
          Send report
        </div>
      </div>
      <div className="preview-launcher" style={{ [vertical]: 16, [horizontal]: 16, background: accentColor }}>
        <span aria-hidden="true">●</span>
        <span>{launcherText || 'Report a problem'}</span>
      </div>
    </div>
  );
}

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  // The clipboard API is refused outright in some browsers and configurations.
  // Saying so beats a button that silently does nothing; the snippet is on the
  // page either way, so selecting it by hand always works.
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <button
      type="button"
      className="button secondary small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState('copied');
        } catch {
          setState('failed');
        }
        window.setTimeout(() => setState('idle'), 2500);
      }}
    >
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Select it and copy' : label}
    </button>
  );
}

export function NewProjectPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const { owner } = useAuth();

  const [step, setStep] = useState<Step>('website');

  // Step A
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [extraOrigins, setExtraOrigins] = useState('');
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  // Step B
  const [appearance, setAppearance] = useState<AppearanceDraft>(DEFAULT_APPEARANCE);

  // Step C
  const [project, setProject] = useState<Project | null>(null);
  // The project the server has already accepted, recorded the instant the POST
  // returns. Everything after that point is a retryable follow-up, and this is
  // what stops a retry creating a second project.
  const createdRef = useRef<Project | null>(null);
  const [savedProject, setSavedProject] = useState<Project | null>(null);

  const resolved = useMemo(() => (website.trim() === '' ? null : resolveOrigin(website)), [website]);
  const extras = useMemo(
    () =>
      extraOrigins
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => ({ input: value, result: resolveOrigin(value) })),
    [extraOrigins],
  );
  const extraErrors = extras.filter((entry) => !entry.result.ok);

  const dirty = name.trim() !== '' || website.trim() !== '';

  // Warn before a reload or tab close would discard unsaved setup input.
  useEffect(() => {
    if (!dirty || project || savedProject) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, project, savedProject]);

  const create = useMutation({
    mutationFn: async () => {
      // Creation and appearance are two calls. Only the first one is allowed to
      // run once: if it has already succeeded, a retry must reuse that project
      // instead of creating a second one. The previous version kept no record
      // until both calls had succeeded, so a failed appearance save turned the
      // owner's natural "try again" into a duplicate project.
      let base = createdRef.current;
      if (!base) {
        const origins = [resolved!.origin!, ...extras.map((entry) => entry.result.origin!)];
        base = (await resources.createProject(name.trim(), [...new Set(origins)])).project;
        createdRef.current = base;
        setSavedProject(base);
        await client.invalidateQueries({ queryKey: ['projects'] });
      }

      const updated = await resources.updateProject(base.id, {
        appearance: {
          ...base.appearance,
          launcherText: appearance.launcherText.trim() || DEFAULT_APPEARANCE.launcherText,
          accentColor: appearance.accentColor,
          theme: appearance.theme,
          position: appearance.position,
        },
      });
      createdRef.current = updated.project;
      return updated.project;
    },
    onSuccess: async (created) => {
      setProject(created);
      setStep('install');
      await client.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  function submitWebsite(event: FormEvent) {
    event.preventDefault();
    let valid = true;

    if (name.trim() === '') {
      setNameError('Give the project a name so you can recognise it later.');
      valid = false;
    } else {
      setNameError(null);
    }

    if (!resolved || !resolved.ok) {
      setWebsiteError(resolved?.error ?? 'Enter the website address.');
      valid = false;
    } else {
      setWebsiteError(null);
    }

    if (extraErrors.length > 0) valid = false;
    if (valid) setStep('appearance');
  }

  function createProject() {
    // A second click while the first is still in flight is ignored, and once
    // the install step has the finished project there is nothing left to do
    // but show it. Anything else — including a retry after a failure — goes
    // through the mutation, which reuses the project the server already has.
    if (create.isPending) return;
    if (project) {
      setStep('install');
      return;
    }
    create.mutate();
  }

  const header = {
    title: 'New project',
    breadcrumbs: [{ label: 'Projects', to: '/projects' }, { label: 'New project' }],
  };

  if (owner && !owner.emailVerified) {
    return (
      <AppShell header={header}>
        <div className="page-body narrow">
          <div className="page-intro">
            <h2>New project</h2>
          </div>
          <Notice kind="warning">
            Confirm your email address before creating a project. Open <Link to="/account">your account</Link> to send a
            fresh confirmation link.
          </Notice>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell header={header}>
      <div className="page-body narrow">
        <div className="page-intro">
          <h2>Set up a new project</h2>
          <p>Three short steps: tell us where the widget goes, choose how it looks, then install it.</p>
        </div>

        <Stepper current={step} />

        {step === 'website' ? (
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3>Where will you collect feedback?</h3>
                <p>Reports are only accepted from the website addresses you list here.</p>
              </div>
            </div>
            <div className="panel-body">
              <form className="form-grid" onSubmit={submitWebsite} noValidate>
                {/* Explicit label/for and aria-describedby, so the accessible
                    name is just the label and the hint is a description. */}
                <div className="field">
                  <label className="field-label" htmlFor="project-name">
                    Project name
                  </label>
                  <input
                    id="project-name"
                    type="text"
                    maxLength={80}
                    value={name}
                    placeholder="Acme marketing site"
                    aria-invalid={nameError !== null}
                    aria-describedby={nameError ? 'project-name-error' : undefined}
                    onChange={(event) => {
                      setName(event.target.value);
                      if (nameError) setNameError(null);
                    }}
                  />
                  {nameError ? (
                    <span className="field-error" id="project-name-error">
                      {nameError}
                    </span>
                  ) : null}
                </div>

                <div className="field">
                  <label className="field-label" htmlFor="website-address">
                    Website address
                  </label>
                  <input
                    id="website-address"
                    type="text"
                    value={website}
                    placeholder="example.com"
                    aria-invalid={websiteError !== null}
                    aria-describedby={`website-help${websiteError ? ' website-error' : ''}`}
                    onChange={(event) => {
                      setWebsite(event.target.value);
                      if (websiteError) setWebsiteError(null);
                    }}
                  />
                  <span className="field-hint" id="website-help">
                    Just the address is enough — <code>example.com</code>, <code>https://app.example.com</code> or{' '}
                    <code>http://localhost:5173</code>.
                  </span>
                  {websiteError ? (
                    <span className="field-error" id="website-error">
                      {websiteError}
                    </span>
                  ) : null}
                </div>

                {resolved?.ok && resolved.origin ? (
                  <div className="resolved-origin">
                    <CheckIcon />
                    <span>
                      Will be saved as <code>{resolved.origin}</code>
                    </span>
                    {resolved.note ? <span>{resolved.note}</span> : null}
                    {isLocalOrigin(resolved.origin) ? (
                      <span>
                        This is a local development address, so reports will only be accepted while you are working on
                        this machine. Add the public address too when you are ready.
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <details className="advanced">
                  <summary>Additional websites and local development</summary>
                  <div className="advanced-body">
                    <div className="field">
                      <label className="field-label" htmlFor="extra-origins">
                        More website addresses
                      </label>
                      <textarea
                        id="extra-origins"
                        value={extraOrigins}
                        rows={3}
                        aria-describedby="extra-origins-help"
                        placeholder={'http://localhost:5173\nhttps://staging.example.com'}
                        onChange={(event) => setExtraOrigins(event.target.value)}
                      />
                      <span className="field-hint" id="extra-origins-help">
                        One per line. A different port or a different host is a different website address, so
                        <code> localhost:5173</code> and <code>127.0.0.1:5173</code> both need listing if you use both.
                        <code> www.example.com</code> is not added automatically.
                      </span>
                    </div>
                    {extras.length > 0 ? (
                      <ul className="tag-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {extras.map((entry) => (
                          <li className="tag" key={entry.input}>
                            {entry.result.ok ? (
                              <span className="mono">{entry.result.origin}</span>
                            ) : (
                              <span className="field-error">
                                {entry.input}: {entry.result.error}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </details>

                <div className="step-actions">
                  <Link className="button ghost" to="/projects">
                    Cancel
                  </Link>
                  <span className="spacer" />
                  <button className="button" type="submit">
                    Continue
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {step === 'appearance' ? (
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3>How should it look?</h3>
                <p>The essentials now; everything else is in the project&apos;s widget settings afterwards.</p>
              </div>
              <button
                type="button"
                className="button ghost small"
                onClick={() => setAppearance(DEFAULT_APPEARANCE)}
              >
                Use defaults
              </button>
            </div>
            <div className="panel-body">
              <div className="form-grid two">
                <div className="form-grid">
                  <div className="field">
                    <label className="field-label" htmlFor="launcher-label">
                      Launcher label
                    </label>
                    <input
                      id="launcher-label"
                      type="text"
                      maxLength={40}
                      value={appearance.launcherText}
                      onChange={(event) => setAppearance({ ...appearance, launcherText: event.target.value })}
                    />
                  </div>

                  <label className="field">
                    <span className="field-label">Accent colour</span>
                    <span className="row">
                      <input
                        type="color"
                        aria-label="Accent colour"
                        value={appearance.accentColor}
                        onChange={(event) => setAppearance({ ...appearance, accentColor: event.target.value })}
                      />
                      <input
                        type="text"
                        aria-label="Accent colour hex value"
                        style={{ maxWidth: 130 }}
                        value={appearance.accentColor}
                        onChange={(event) => setAppearance({ ...appearance, accentColor: event.target.value })}
                      />
                    </span>
                    {!ACCENT_COLOR_PATTERN.test(appearance.accentColor) ? (
                      <span className="field-error">Use a 6-digit hex colour such as #2f6df6.</span>
                    ) : null}
                  </label>

                  <fieldset>
                    <legend>Widget appearance</legend>
                    <Segmented
                      label="Widget appearance"
                      value={appearance.theme}
                      onChange={(theme) => setAppearance({ ...appearance, theme })}
                      options={[
                        { value: 'light' as const, label: 'Light' },
                        { value: 'dark' as const, label: 'Dark' },
                        { value: 'system' as const, label: 'System' },
                      ]}
                    />
                    <span className="field-hint">
                      This is what visitors to your website see. It is separate from your own dashboard theme.
                    </span>
                  </fieldset>

                  <fieldset>
                    <legend>Position</legend>
                    <Segmented
                      label="Launcher position"
                      value={appearance.position}
                      onChange={(position) => setAppearance({ ...appearance, position })}
                      options={LAUNCHER_POSITIONS.map((value) => ({ value, label: POSITION_LABELS[value] }))}
                    />
                  </fieldset>
                </div>

                <div className="form-grid">
                  <span className="field-label">Preview</span>
                  <MiniPreview {...appearance} />
                  <p className="field-hint">
                    Icon, offsets, mobile visibility, page rules and trigger timing are all available in widget settings
                    once the project exists.
                  </p>
                </div>
              </div>

              <ErrorNotice error={create.error} />

              {/* The project row is written before the appearance is. If only
                  the second call failed the project already exists, so say so
                  and offer the way on rather than letting the owner think
                  nothing was saved. */}
              {create.isError && savedProject ? (
                <Notice kind="warning">
                  <strong>{savedProject.name}</strong> was created — only the appearance could not be saved, so it is
                  using the defaults. Trying again saves the appearance to the same project; it will not create a second
                  one. You can also{' '}
                  <Link to={`/projects/${savedProject.id}/install`}>go straight to installing it</Link> and change the
                  appearance later in its settings.
                </Notice>
              ) : null}

              <div className="step-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setStep('website')}
                  disabled={create.isPending || savedProject !== null}
                >
                  Back
                </button>
                <span className="spacer" />
                <button
                  type="button"
                  className="button"
                  onClick={createProject}
                  disabled={create.isPending || !ACCENT_COLOR_PATTERN.test(appearance.accentColor)}
                >
                  {create.isPending
                    ? 'Creating…'
                    : savedProject
                      ? 'Save the appearance and continue'
                      : 'Create project'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {step === 'install' && project ? <InstallStep project={project} onFinish={() => navigate('/projects')} /> : null}
      </div>
    </AppShell>
  );
}

function InstallStep({ project, onFinish }: { project: Project; onFinish: () => void }) {
  const snippetQuery = useQuery({ queryKey: ['snippet', project.id], queryFn: () => resources.snippet(project.id) });
  const scriptUrl = snippetQuery.data?.scriptUrl ?? `${window.location.origin}/widget/v1/buginbox.js`;

  const [checked, setChecked] = useState(false);
  const reports = useQuery({
    queryKey: ['setup-check', project.id],
    queryFn: () => resources.reports({ projectId: project.id, limit: 1 }),
    enabled: false,
  });

  const received = (reports.data?.reports.length ?? 0) > 0;
  const primary = project.origins[0] ?? 'your website';

  const snippet = `<script src="${scriptUrl}"\n        data-buginbox-key="${project.publicKey}" defer></script>`;
  const spaSnippet = `// React, Vue or Svelte: start it once, and tear it down when you want it gone.
import { useEffect } from 'react';

useEffect(() => {
  window.BugInbox?.init({ projectKey: '${project.publicKey}' });
  return () => window.BugInbox?.destroy();
}, []);`;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Install it on {primary}</h3>
          <p>Your project is saved. You can come back to this page at any time.</p>
        </div>
        <span className="badge resolved">Project created</span>
      </div>
      <div className="panel-body" style={{ display: 'grid', gap: 20 }}>
        <div className="form-grid">
          <div className="toolbar">
            <span className="field-label">Paste this before &lt;/body&gt;</span>
            <span className="spacer" />
            <CopyButton value={snippet} />
          </div>
          <pre className="snippet">
            <code>{snippet}</code>
          </pre>
          <p className="field-hint">
            This snippet is for <strong>{primary}</strong>. Reports are only accepted from the website addresses saved
            on this project, so the same key on a different website will be rejected.
          </p>
        </div>

        <details className="advanced">
          <summary>Single-page application (React, Vue, Svelte)</summary>
          <div className="advanced-body">
            <div className="toolbar">
              <span className="field-hint">Load the bundle without the data attribute, then start it yourself.</span>
              <span className="spacer" />
              <CopyButton value={spaSnippet} />
            </div>
            <pre className="snippet">
              <code>{spaSnippet}</code>
            </pre>
          </div>
        </details>

        <div className="panel" style={{ background: 'var(--surface-sunken)' }}>
          <div className="panel-body" style={{ display: 'grid', gap: 12 }}>
            <div>
              <h3 style={{ fontSize: 15 }}>Send a test report</h3>
              <p className="field-hint" style={{ marginTop: 4 }}>
                Open {primary} with the snippet in place, click the launcher and send a report. Then check for it here.
              </p>
            </div>

            {received ? (
              <Notice kind="success">
                Report received. Ingestion works for this project. This confirms a report reached the server — it is not
                a check of your site&apos;s layout, CSP or security.
              </Notice>
            ) : checked ? (
              <Notice kind="info">
                Nothing has arrived yet. Make sure the snippet is on a page of {primary} and that the page was reloaded,
                then check again.
              </Notice>
            ) : null}

            <div className="toolbar">
              <button
                type="button"
                className="button secondary"
                disabled={reports.isFetching}
                onClick={async () => {
                  await reports.refetch();
                  setChecked(true);
                }}
              >
                {reports.isFetching ? 'Checking…' : 'Check for a report'}
              </button>
              {received ? (
                <Link className="button" to={`/projects/${project.id}/reports`}>
                  Open the inbox
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        <div className="step-actions">
          <Link className="button ghost" to={`/projects/${project.id}/settings`}>
            Widget settings
          </Link>
          <span className="spacer" />
          <button type="button" className="button secondary" onClick={onFinish}>
            Finish setup later
          </button>
          <Link className="button" to={`/projects/${project.id}/reports`}>
            Go to the inbox
          </Link>
        </div>
      </div>
    </div>
  );
}
