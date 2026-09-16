# Project status

_Last updated: 2026-09-16. V1 is complete and verified locally, plus a public
website and a full light/dark theme._

## Current state

All six V1 milestones are done: repository inspection and continuity documents,
the complete report flow, the owner dashboard and widget controls, screenshots
and recoverable notifications, hardening plus tests plus containerisation, and
documentation.

Two additions have since been implemented and verified: a light/dark/system
theme across the whole product, and a public homepage at `/`.

Nothing has been pushed to any remote, nothing has been deployed, and no email
has left the machine — Mailpit is the only mail destination.

## Repository at the start

`main` contained only `.gitignore` and a stale `weatherxpert` README; there was
no BugInbox application to preserve or adapt. Branch `origin/feat/front` holds an
unrelated weather app from the repository template and has not been touched.

## Routes

| Path | Access | What it is |
| --- | --- | --- |
| `/` | public | Public homepage (also available signed in) |
| `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email` | public | Authentication |
| `/dashboard` | protected | Projects list (this used to be `/`) |
| `/projects` | protected | Redirects to `/dashboard` |
| `/projects/new` | protected | Create a project |
| `/projects/:id/{reports,install,settings}` | protected | Project sections |
| `/projects/:id/reports/:reportId`, `/reports`, `/reports/:id` | protected | Reports |
| `/account` | protected | Account settings |
| anything else | public | Redirects to `/` |

Protected paths redirect a signed-out visitor to `/login`. Emailed verification,
reset and report links were not changed and still work.

## Theme behaviour and storage

- Light, Dark and System, selectable from the public navigation, the dashboard
  top bar and the authentication pages. Built as a radio group, so it is
  announced as one control and arrow keys move between the options.
- System is the default when nothing has been saved.
- Stored per browser in `localStorage` under `buginbox.theme`. Every read and
  write is wrapped in try/catch; with storage blocked the choice still applies
  to the current page and simply resets on reload.
- The OS preference is only followed while System is selected. An explicit
  choice ignores OS changes.
- `apps/dashboard/public/theme-init.js` applies the theme before the first
  paint. It is a file rather than an inline script because the app is served
  under `script-src 'self'`. Without it the stylesheet still resolves correctly
  from the OS preference.
- Colours come from semantic tokens in `apps/dashboard/src/styles.css`, used by
  both the interface and the public site. No per-component overrides and no
  CSS-filter inversion, so reporters' screenshots render untouched.
- **Interface theme and widget theme are independent.** A project's widget
  appearance lives in the database and describes what visitors to a customer's
  website see; the interface theme is a per-browser preference. Neither affects
  the other, and the widget preview in project settings resolves "system"
  against the operating system rather than the dashboard theme.

## What is implemented

**Owner application** — signup, login, logout, email verification, password
reset and password change; projects list, create, edit, pause/resume and delete
with typed-name confirmation; installation page with the snippet, a custom-button
example, an SPA example, CSP directives and caching notes; widget settings with a
live preview and a sample URL/device rule tester; reports inbox filtered by
project and status; report detail with message, contact email, sanitised page
URL, host-provided page context, browser and viewport context, timestamps,
deletion date and screenshot; statuses New / In progress / Resolved; report
deletion; per-project email notification toggle and URL-collection toggle.

**Widget** — standalone TypeScript bundle (~28 KiB minified, no framework),
rendered in a shadow root. Required description (5–2000 characters), optional
email, optional single PNG/JPEG up to 5 MiB with preview and removal, success
shown only after the server durably accepts the report, draft preserved on
failure, duplicate submissions prevented by a per-form key plus a disabled submit
button. Host API: `init`, `open`, `close`, `show`, `hide`, `destroy`,
`setPageContext`, `version`. Keyboard operable with focus trapping, Escape
handling and focus restoration.

**Owner control of when and where** — launcher on/off, text, accent colour,
light/dark/system, five preset icons, four corners, bounded offsets, mobile
visibility with its own offsets, include/exclude path rules (exact and trailing
wildcard), immediate/delay/manual triggering, pause, notification toggle and
URL-collection toggle.

**Safety** — argon2id passwords, DB-backed revocable sessions, double-submit CSRF
with an origin check, owner scoping in every query, Zod validation with body and
multipart limits, exact-origin allowlists, per-IP and per-project rate limits
with an in-memory fallback, per-project report and storage caps, image validation
by decoding with re-encoding to strip metadata, private non-executable storage
with authorised downloads, trusted-proxy configuration and a 90-day default
retention policy.

**Public website** — one responsive homepage at `/` built from the existing
React app and design tokens: hero with working Get started and Sign in actions
(or Open dashboard when signed in), a labelled illustrative preview of the
widget and the inbox, a three-step "How it works", who it helps, the six
capabilities that actually exist, an explanation of the widget's page, device,
timing and appearance controls, a seven-question FAQ, a final call to action and
a simple footer. Accessible mobile menu, skip link, and section links in the
navigation. Every claim on the page was checked against the implementation; the
page states plainly that BugInbox is self-hosted and early, and makes no pricing,
compliance, uptime, customer or testimonial claims.

**Operations** — Docker Compose with Postgres, Redis, Mailpit, API, worker, nginx
and the fixture site, all ports on loopback; health checks and start-up retries;
transactional outbox with a recovery sweep; hourly maintenance sweep for
retention, orphan files and expired sessions/tokens; backup and restore scripts.

## Verification evidence

Run on 2026-09-16 against the Compose stack, from the repository root with
`source scripts/host-env.sh`:

| Check | Command | Result |
| --- | --- | --- |
| Lint | `npx eslint .` | passed, 0 problems |
| Types | `npm run typecheck` | passed (shared, widget, server, dashboard) |
| Build | `npm run build` | passed; widget 27.9 KiB minified, dashboard 373 KiB |
| API and integration tests | `npm test` | **64 passed**, 6 files |
| Browser verification | `npm run test:e2e` | **15 passed** (13 desktop, 2 mobile) |
| Images | `docker compose build` | api, worker and web built |
| Health | `GET /api/health/ready` | `{"status":"ok","checks":{"database":true,"redis":true}}` |

`npm test` covers: authentication lifecycle including verification, reset and
session invalidation; CSRF and cross-origin rejection; cross-owner isolation of
projects, reports and screenshot downloads (404, not 403); path and device
matching including `/checkout` versus `/checkout/*`, trailing slashes, query
strings, segment boundaries, case sensitivity and hash fragments; invalid rules
ignored; origin allowlist including port differences and a missing `Origin`
header; project pause enforced against cached configuration; excluded-page
rejection; duplicate submissions collapsed to one report and one notification;
per-IP rate limiting with `Retry-After`; malformed and oversized payloads;
non-image content rejected despite a PNG filename and Content-Type; unsupported
formats rejected; oversized uploads rejected; EXIF stripped by re-encoding;
notification intent written in the report transaction; lease preventing
concurrent double-processing; recovery of entries a crashed dispatcher left
behind; report and project deletion removing files and adjusting usage counters;
retention purge; orphan-file and detached-attachment sweeps; storage keys
confined to the storage root.

`npm run test:e2e` drives real Chromium against the running stack and covers the
full journey — signup, confirmation link read from Mailpit, project creation,
snippet shown with the key, a report with an image submitted from the fixture
site on a **different origin**, appearance in the inbox with the query string
stripped, a status change, and the notification email in Mailpit — plus page
rules and pause with cached configuration, SPA `pushState`/`popstate` navigation,
the form closing when a route becomes ineligible, `destroy`/`init` from the host,
the host page remaining fully usable with no script errors when BugInbox is
unreachable, keyboard-only operation with focus restoration, and phone-width
layout for both the dashboard and the widget.

The browser suite additionally covers the public website and the theme:
the signed-out homepage with its sections, marked example preview, no owner data
and no console errors; Get started and Sign in reaching the real forms; every
protected path redirecting to `/login` while signed out and an unknown path
landing on `/`; the signed-in homepage showing Open dashboard and reaching
`/dashboard`; `/projects` still redirecting; Light, Dark and System selection;
persistence across reload, route changes and sign-out/sign-in; System following
an emulated OS change while an explicit choice ignores it; the theme applied
before the application bundle has run; changing the interface theme leaving a
project's saved widget theme untouched and vice versa; keyboard operation with a
skip link, arrow-key theme selection and a visible focus ring; and the
phone-width homepage with its menu, Escape handling and no horizontal overflow.

Manually verified in addition:

- **Restart persistence.** `docker compose restart`, then report, attachment and
  owner counts and the files in `/data/uploads` were unchanged.
- **Backup and restore.** `./scripts/backup.sh` then `./scripts/restore.sh` with a
  disposable marker report: after the restore the marker was gone and the counts
  matched the backup (14 reports, 5 attachments, 5 files on disk), with health
  back to `ok`.
- **Theme inspection of rendered pages.** Sign-in, projects, report detail,
  project settings, the delete-confirmation flow and the install page were
  rendered and inspected at 1280 px in both Light and Dark, plus the homepage in
  both themes and at 390 px. Text, borders, inputs, focus rings, icons, status
  badges, notices and code blocks are readable in both; no horizontal overflow;
  zero console errors on any of them. Reporters' screenshots render untouched —
  no inversion or filtering is applied to images. The widget preview in project
  settings correctly showed the project's own light widget while the dashboard
  was dark.
- **Visual check.** The widget renders correctly on the fixture page whose CSS
  deliberately forces `button { background: hotpink !important }`,
  `svg { width: 64px !important }` and similar; the shadow root keeps it intact,
  and the host page's own controls keep the host's styling.
- **Fresh setup from empty volumes.** A second, fully isolated stack
  (`docker compose -p buginbox-fresh`, its own ports, network, volumes and env
  file) was built and started from nothing. Migrations applied automatically, the
  database started empty, and the whole Playwright suite — all 5 tests —
  passed against it. It was then removed with `down -v`; only the main stack's
  volumes remain. This exposed two real defects, now fixed: `env_file: [.env]`
  ignored `--env-file`, so the fresh stack emailed links pointing at the original
  stack; and the fixture's CSP hardcoded the widget origin.

## Unverified areas

- No cross-browser testing. Only Chromium was driven; Firefox and WebKit are
  untested, as are real iOS and Android devices. Theme behaviour in particular
  has only been exercised in Chromium.
- Contrast was checked by inspecting rendered pages, not with an automated
  contrast auditing tool.
- The public homepage is client-rendered. Its title and description are set from
  JavaScript, so a crawler that does not run scripts sees only the defaults in
  `index.html`. No canonical or social-share URL is set, because that depends on
  a deployment domain that does not exist yet.
- No screen-reader testing. Keyboard operation, labelling and focus management
  are covered, but no assistive technology was used.
- No load or soak testing. Rate limits and caps are correct by test, not by
  measurement under sustained load.
- No production deployment. Nothing was provisioned, no DNS was changed and no
  real email provider was contacted. Local success does not demonstrate
  production readiness.
- Email deliverability is untested by definition; Mailpit accepts everything.

## Known limitations

- Delivery is at-least-once. A crash between the SMTP handover and the database
  update can send a duplicate notification.
- Widget configuration is cached by browsers for up to five minutes, so
  appearance and rule changes are not instant. Pause is exempt and takes effect
  immediately, server-side.
- Hash-router routes cannot be matched by path rules, because fragments are never
  inspected. Such apps should use manual trigger mode plus the host API.
- Screenshots live on a local Docker volume, so backups must cover the volume as
  well as the database.
- The inbox shows the 50 most recent reports per filter; there is no older-page
  control yet, though the API returns a cursor.
- Rate limiting falls back to per-process in-memory counters when Redis is down,
  which is less precise across multiple API processes.

## Local services

At the time of writing the compose project `buginbox` is running: `postgres`,
`redis`, `mailpit`, `api`, `worker`, `web` and `fixture`, all healthy.

- Public website: http://localhost:58080/
- Owner dashboard: http://localhost:58080/dashboard
- Fixture host website: http://localhost:58081
- Mailpit: http://localhost:58025

Stop with `npm run down` (volumes are preserved); start again with `npm run up`.

## Git

Branch `main`. Commits, all authored and committed as
`Dharam-IN <dharamdotin@gmail.com>`:

- `593505c` — API, schema and local environment
- `470916e` — widget bundle, owner dashboard, fixture site and test suite
- `4917450` — browser verification, backups, lint and full documentation
- `7444d74` — parameterised compose so a second isolated stack can run, and the
  fresh-setup fixes it uncovered
- `ca43303` — light/dark/system theme and the public homepage

Nothing has been pushed. Pushing waits for an explicit request, after verifying
the remote and that SSH authenticates as `Dharam-IN`.

## Deployment-dependent configuration

Still outstanding for a real deployment, in addition to everything in
`docs/ARCHITECTURE.md`:

- A canonical URL and social-share metadata for the homepage. Nothing is set
  today because inventing a domain would be wrong.
- Server-rendered or pre-rendered metadata if search engines matter; the page is
  currently client-rendered.
- The `script-src 'self'` policy in `infra/nginx/default.conf` already covers
  `theme-init.js`. A deployment that moves static assets to another origin must
  add that origin to `script-src`.

## Possible next steps

None are required. If the work continues:

1. Pagination controls in the inbox, using the cursor the API already returns.
2. Cross-browser and assistive-technology verification.
3. A deployment runbook based on the requirements in `docs/ARCHITECTURE.md`.
