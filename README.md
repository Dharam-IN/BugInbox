# BugInbox

Website feedback and bug reporting for people who look after several websites.

An owner signs up, creates a project per website, copies a one-line script tag,
and visitors, clients or testers can report a problem without an account. The
owner gets an email and works the report in a dashboard.

BugInbox runs entirely on your own machine. Nothing here talks to a paid or
external service.

- Works on ordinary multi-page sites and on React-style single-page apps.
- The widget ships as a small standalone bundle inside a shadow root, so it
  cannot break — or be broken by — the host page's styles.
- It collects only what the reporter typed, a sanitised page address, limited
  browser context and an image they chose to upload. Nothing else.

## Requirements

- Docker with Compose v2
- Node.js 22 or newer (for tests and local tooling)

## Install and run

```bash
git clone git@github.com-dharam-in:Dharam-IN/BugInbox.git
cd BugInbox

cp .env.example .env
# Set POSTGRES_PASSWORD to any value; it is only used by your local container.
# Change the BUGINBOX_*_PORT values if any of them are already taken.

npm install
npm run up            # build the images and start everything
npm run seed          # optional: synthetic demo owner, project and reports
```

Everything binds to loopback only:

| Service | URL |
| --- | --- |
| Dashboard, API and widget script | http://localhost:58080 |
| Integration fixture website | http://localhost:58081 |
| Mailpit — every email BugInbox sends locally | http://localhost:58025 |
| Postgres (for host-run tests) | 127.0.0.1:55432 |
| Redis (for host-run tests) | 127.0.0.1:56379 |

Stop with `npm run down` (data is kept) and follow logs with `npm run logs`.

## Try it in two minutes

1. `npm run seed` prints a demo owner, password and project key. They are
   synthetic and `.test`-only; do not reuse them anywhere.
2. Sign in at http://localhost:58080 with the printed credentials.
3. Open the fixture website once with the project key so it remembers it:
   `http://localhost:58081/?key=<the printed project key>`
4. The launcher appears in the corner. Send a report, with or without an image.
5. The report shows up under **All reports**, and the notification email shows
   up in Mailpit at http://localhost:58025.

The fixture also has a pricing page, an excluded `/admin/` area, a single-page
app at `/app/` with the website's own trigger button, and `/offline.html`, which
points the widget at a dead port to show the host page is unaffected when
BugInbox is unreachable.

Prefer to start from scratch? Sign up at http://localhost:58080/signup, open the
confirmation email in Mailpit, create a project, and use the snippet its install
page gives you.

## Installing the widget on your own site

The standard snippet, just before `</body>`:

```html
<script src="http://localhost:58080/widget/v1/buginbox.js"
        data-buginbox-key="bi_pub_your_project_key" defer></script>
```

Opening the form from a button you already have:

```html
<script src="http://localhost:58080/widget/v1/buginbox.js" defer></script>

<button type="button" id="report-a-problem">Report a problem</button>
<script>
  window.addEventListener('load', function () {
    BugInbox.init({ projectKey: 'bi_pub_your_project_key' });
    document.getElementById('report-a-problem')
      .addEventListener('click', function () { BugInbox.open(); });
  });
</script>
```

In a single-page app, initialise once and tear down when you want it gone:

```jsx
useEffect(() => {
  if (!signedIn) return;
  window.BugInbox?.init({
    projectKey: 'bi_pub_your_project_key',
    pageContext: 'Customer dashboard',   // optional, used instead of the URL path
  });
  return () => window.BugInbox?.destroy();
}, [signedIn]);
```

BugInbox never inspects your application's login state. If the widget should
only appear for certain users, your code decides and calls `init` or `destroy`.

### Host API

| Call | What it does |
| --- | --- |
| `BugInbox.init(options)` | Starts the widget. Re-initialising replaces the previous instance rather than stacking two |
| `BugInbox.open()` | Opens the form. Bypasses the launcher delay, but still respects page rules, device rules and project pause |
| `BugInbox.close()` | Dismisses the form. The launcher is unaffected |
| `BugInbox.show()` | Shows the launcher |
| `BugInbox.hide()` | Hides the launcher. An open form is not closed |
| `BugInbox.destroy()` | Removes the UI, every listener and every timer, and aborts an in-flight submission. Reports already accepted are not affected |
| `BugInbox.setPageContext(text)` | Sets a short, safe label for the current page |
| `BugInbox.version` | The bundle version |

`init` options: `projectKey` (required), `apiBaseUrl`, `pageContext`, `onReady`,
`onSubmitted`.

If your site sends a Content Security Policy, allow the widget's origin:

```
script-src  'self' http://localhost:58080;
connect-src 'self' http://localhost:58080;
img-src     'self' data: blob:;
```

`blob:` is only needed for the screenshot preview shown before sending.

The bundle lives at a major-version path and is deliberately mutable:
republishing it is how fixes reach installed sites. No immutability or integrity
claim is made about that URL, so the snippet carries no `integrity` attribute.

## Tests

The suites run against the Compose stack, so start it first.

```bash
npm run up
source scripts/host-env.sh   # points host tooling at the published loopback ports

npm run lint
npm run typecheck
npm test                     # 64 API and integration tests (vitest)
npm run test:e2e             # 5 browser journeys (Playwright, real Chromium)
```

`npm test` uses a separate `buginbox_test` database, created on first run, so it
never touches your development data. `npm run test:e2e` drives the real stack:
signup, confirmation in Mailpit, project creation, a report with a screenshot
from a different origin, the inbox, a status change, and the notification email.

## Backups

```bash
./scripts/backup.sh ./backups
./scripts/restore.sh ./backups/buginbox-<stamp>.sql.gz ./backups/uploads-<stamp>.tar.gz
```

Reports live in Postgres and screenshots live in a Docker volume, so a usable
backup needs both files. `restore.sh` asks for confirmation before overwriting
anything. Rehearse it with disposable data before relying on it.

## Retention

Reports and their screenshots are deleted 90 days after they arrive, by default.
The window is configurable per project, the dashboard shows the current policy
and each report shows its own deletion date.

## Documentation

| File | What it covers |
| --- | --- |
| `CLAUDE.md` | Working context: purpose, commands, repository map, local-only boundaries |
| `docs/PRODUCT_SCOPE.md` | What V1 includes, what it excludes, what data is collected |
| `docs/ARCHITECTURE.md` | Components, data flow, recovery model, security, rule matching |
| `docs/DECISIONS.md` | Material decisions and the reasoning behind them |
| `docs/PROJECT_STATUS.md` | Current state, verification evidence, known gaps, next steps |

## Local-only boundaries

Mailpit is the only mail destination. Do not configure a real email provider
here, and do not send mail to a real address without deciding to do so
explicitly. Seed and test data use `.test` addresses. `.env` is git-ignored;
`.env.example` holds placeholders only. Published ports bind to loopback, and
the containers, volumes and network are namespaced to this project.

Deployment is not automated here. `docs/ARCHITECTURE.md` lists what a real
deployment would need. Local success does not demonstrate production readiness.
