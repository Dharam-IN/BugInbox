import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { resources } from '../api.ts';
import { useProject } from './ProjectLayout.tsx';
import { Card, CardHeader, ErrorNotice, Notice } from '../components/ui.tsx';

function CopyBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack">
      <div className="spread">
        <span className="field-label">{label}</span>
        <button
          type="button"
          className="button secondary small"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1800);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="snippet">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function InstallPage() {
  const project = useProject();
  const client = useQueryClient();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<unknown>(null);

  const snippet = useQuery({ queryKey: ['snippet', project.id], queryFn: () => resources.snippet(project.id) });
  const scriptUrl = snippet.data?.scriptUrl ?? `${window.location.origin}/widget/v1/buginbox.js`;

  const saveOrigins = useMutation({
    mutationFn: (origins: string[]) => resources.updateProject(project.id, { origins }),
    onSuccess: async () => {
      setDraft('');
      setError(null);
      await client.invalidateQueries({ queryKey: ['project', project.id] });
    },
    onError: (err) => setError(err),
  });

  function addOrigin(event: FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (value === '') return;
    if (project.origins.includes(value)) {
      setError(new Error('That origin is already allowed.'));
      return;
    }
    saveOrigins.mutate([...project.origins, value]);
  }

  function addLocalDevelopmentOrigins() {
    const suggestions = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'];
    const merged = [...new Set([...project.origins, ...suggestions])];
    saveOrigins.mutate(merged);
  }

  const installSnippet = `<script src="${scriptUrl}"\n        data-buginbox-key="${project.publicKey}" defer></script>`;

  const customButtonSnippet = `<!-- 1. Load the bundle without the data attribute, so it does not start itself -->
<script src="${scriptUrl}" defer></script>

<!-- 2. Start it yourself and open the form from your own button -->
<button type="button" id="report-a-problem">Report a problem</button>
<script>
  window.addEventListener('load', function () {
    BugInbox.init({ projectKey: '${project.publicKey}' });
    document.getElementById('report-a-problem')
      .addEventListener('click', function () { BugInbox.open(); });
  });
</script>`;

  const spaSnippet = `// React / Vue / Svelte: start it once, and tear it down on sign-out.
import { useEffect } from 'react';

export function BugInboxWidget({ enabled }) {
  useEffect(() => {
    if (!enabled) return;
    window.BugInbox?.init({
      projectKey: '${project.publicKey}',
      // Optional: send a safe label instead of relying on the URL path.
      pageContext: 'Customer dashboard',
    });
    return () => window.BugInbox?.destroy();
  }, [enabled]);
  return null;
}`;

  const cspSnippet = `Content-Security-Policy:
  script-src 'self' ${new URL(scriptUrl).origin};
  connect-src 'self' ${new URL(scriptUrl).origin};
  img-src 'self' data: blob:;`;

  return (
    <div className="stack">
      {project.origins.length === 0 ? (
        <Notice kind="warning">
          This project has no allowed origins, so every report is rejected. Add the origin of the website you are
          installing on.
        </Notice>
      ) : null}

      <Card>
        <CardHeader
          title="Install the widget"
          subtitle="Paste this into the HTML of every page you want the widget on, just before </body>."
        />
        <CopyBlock label="Standard snippet" code={installSnippet} />
        <p className="field-hint" style={{ marginTop: 10 }}>
          The project key is a public identifier, not a secret — it is visible in the page source of any site you install
          on. What protects the project is the origin allowlist below, plus the rate limits.
        </p>
      </Card>

      <Card>
        <CardHeader
          title="Allowed website origins"
          subtitle="Reports are only accepted from these exact origins. Scheme, host and port; no paths, no wildcards."
        />
        <ErrorNotice error={error ?? saveOrigins.error} />

        {project.origins.length > 0 ? (
          <ul className="tag-list" style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
            {project.origins.map((origin) => (
              <li className="tag" key={origin}>
                <span className="mono">{origin}</span>
                <button
                  type="button"
                  aria-label={`Remove ${origin}`}
                  disabled={saveOrigins.isPending}
                  onClick={() => saveOrigins.mutate(project.origins.filter((o) => o !== origin))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <form className="inline-form" onSubmit={addOrigin}>
          <label className="field">
            <span className="field-label">Add an origin</span>
            <input
              type="text"
              value={draft}
              placeholder="https://acme.example"
              onChange={(e) => setDraft(e.target.value)}
            />
          </label>
          <button className="button" type="submit" disabled={saveOrigins.isPending}>
            Add
          </button>
          <button className="button secondary" type="button" onClick={addLocalDevelopmentOrigins} disabled={saveOrigins.isPending}>
            Add local development origins
          </button>
        </form>
        <p className="field-hint" style={{ marginTop: 8 }}>
          Local development needs its own entries because <code>http://localhost:5173</code> and
          <code> http://127.0.0.1:5173</code> are different origins, and a different port is a different origin again.
        </p>
      </Card>

      <Card>
        <CardHeader
          title="Open the form from your own button"
          subtitle="Useful when the floating launcher is turned off, or when you already have a support menu."
        />
        <CopyBlock label="Custom trigger" code={customButtonSnippet} />
      </Card>

      <Card>
        <CardHeader
          title="Single-page applications"
          subtitle="Initialise once. The widget re-checks its page rules on every route change on its own."
        />
        <CopyBlock label="React example" code={spaSnippet} />
        <p className="field-hint" style={{ marginTop: 10 }}>
          BugInbox never inspects your application's login state. If the widget should only appear for signed-in users,
          call <code>init</code> and <code>destroy</code> from your own code, as above.
        </p>
      </Card>

      <Card>
        <CardHeader title="Content Security Policy" subtitle="If your site sends a CSP, allow the widget's origin." />
        <CopyBlock label="Directives to add" code={cspSnippet} />
        <p className="field-hint" style={{ marginTop: 10 }}>
          The widget renders inside a shadow root with its own stylesheet, so no <code>style-src</code> change is needed
          beyond what your site already allows. <code>blob:</code> in <code>img-src</code> is only needed for the
          screenshot preview shown before sending.
        </p>
      </Card>

      <Card>
        <CardHeader title="Versioning and caching" />
        <div className="stack">
          <p className="field-hint">
            The bundle is published at a major-version path (<code className="mono">/widget/v1/buginbox.js</code>). That
            URL is intentionally mutable: republishing it is how fixes reach installed websites without anyone editing
            their HTML. Because it can change, BugInbox makes no immutability or integrity claim about it, and the
            snippet deliberately carries no <code>integrity</code> attribute.
          </p>
          <p className="field-hint">
            Project configuration is fetched when the widget starts and may be cached by the browser for up to 5 minutes.
            Appearance and rule changes therefore reach visitors within about 5 minutes, or immediately on a hard reload.
            Pausing is different: it is enforced by the server on every submission, so a paused project stops accepting
            reports at once even from a browser holding cached configuration.
          </p>
          <p className="field-hint">
            Current configuration version: <code className="mono">{project.configVersion}</code>
          </p>
        </div>
      </Card>
    </div>
  );
}
