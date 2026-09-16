# Project status

_Last updated: 2026-09-16. V1 is complete and verified locally._

## Current state

All six milestones are done: repository inspection and continuity documents, the
complete report flow, the owner dashboard and widget controls, screenshots and
recoverable notifications, hardening plus tests plus containerisation, and
documentation.

Nothing has been pushed to any remote, nothing has been deployed, and no email
has left the machine — Mailpit is the only mail destination.

## Repository at the start

`main` contained only `.gitignore` and a stale `weatherxpert` README; there was
no BugInbox application to preserve or adapt. Branch `origin/feat/front` holds an
unrelated weather app from the repository template and has not been touched.

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
| Build | `npm run build` | passed; widget 27.9 KiB minified, dashboard 349.6 KiB |
| API and integration tests | `npm test` | **64 passed**, 6 files, 8.3 s |
| Browser verification | `npm run test:e2e` | **5 passed** (4 desktop, 1 mobile), 8.3 s |
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

Manually verified in addition:

- **Restart persistence.** `docker compose restart`, then report, attachment and
  owner counts and the files in `/data/uploads` were unchanged.
- **Backup and restore.** `./scripts/backup.sh` then `./scripts/restore.sh` with a
  disposable marker report: after the restore the marker was gone and the counts
  matched the backup (14 reports, 5 attachments, 5 files on disk), with health
  back to `ok`.
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
  untested, as are real iOS and Android devices.
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

- Dashboard, API and widget: http://localhost:58080
- Fixture host website: http://localhost:58081
- Mailpit: http://localhost:58025

Stop with `npm run down` (volumes are preserved); start again with `npm run up`.

## Git

Branch `main`. Commits, all authored and committed as
`Dharam-IN <dharamdotin@gmail.com>`:

- `593505c` — API, schema and local environment
- `470916e` — widget bundle, owner dashboard, fixture site and test suite
- `4917450` — browser verification, backups, lint and full documentation
- (this commit) — parameterised compose so a second isolated stack can run, and
  the fresh-setup fixes it uncovered

Nothing has been pushed. Pushing waits for an explicit request, after verifying
the remote and that SSH authenticates as `Dharam-IN`.

## Possible next steps

None are required for V1. If the work continues:

1. Pagination controls in the inbox, using the cursor the API already returns.
2. Cross-browser and assistive-technology verification.
3. A deployment runbook based on the requirements in `docs/ARCHITECTURE.md`.
