# Project status

_Last updated: 2026-09-17. V1 is complete and verified locally, plus a public
website, a full light/dark theme, an interface redesign, and a quality and
reliability pass that fixed nine defects and added cross-browser and
accessibility coverage._

## Current state

All six V1 milestones are done: repository inspection and continuity documents,
the complete report flow, the owner dashboard and widget controls, screenshots
and recoverable notifications, hardening plus tests plus containerisation, and
documentation.

Three additions have since been implemented and verified: a light/dark/system
theme across the whole product, a public homepage at `/`, and an interface
redesign that replaced the centred-column screens with a proper application
shell, a real overview, a guided project setup and a structured inbox.

A quality and reliability pass on 2026-09-17 then reproduced and fixed nine
defects in recovery paths and accessibility, and extended browser verification
from Chromium alone to Chromium, Firefox and WebKit with an automated
accessibility scan. The findings are recorded below, including the checks that
passed and needed no change.

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
| `/dashboard` | protected | Overview: summary cards, charts, recent reports |
| `/projects` | protected | Projects list: table on desktop, cards on mobile |
| `/projects/new` | protected | Guided setup: Website → Appearance → Install |
| `/projects/:id/{reports,install,settings}` | protected | Project sections |
| `/projects/:id/reports/:reportId`, `/reports`, `/reports/:id` | protected | Reports |
| `/account` | protected | Account settings |
| anything else | public | Redirects to `/` |

Protected paths redirect a signed-out visitor to `/login`. Emailed verification,
reset and report links were not changed and still work.

## Overview metric definitions

One endpoint, `GET /api/v1/stats/overview?projectId=&days=7|30`, backed by SQL
aggregates with owner scoping in every query.

- The **cohort** is every retained report created in the selected range, in the
  selected project scope.
- **Reports received** is the size of that cohort.
- **New / In progress / Resolved** are the cohort's *current* status. They
  partition it exactly, so cards and chart always agree. They are not "resolved
  during this period" — there is no status history table, so that figure cannot
  be produced honestly and is neither shown nor implied. The interface says so
  in plain text under the cards.
- Days are **UTC** calendar days, displayed in the interface. A range of N days
  covers the last N days including today.
- Deleted and retention-expired reports are absent, which is why only 7 and 30
  day ranges are offered — a longer range than the 90 day retention window would
  under-report.
- A `projectId` the owner does not own returns 404, not an empty chart.
- Status changes and deletions invalidate the overview, so figures refresh.
- No growth percentage, response time, visitor or conversion metric exists,
  because none can be computed from what is stored.

## Theme behaviour and storage

- Light, Dark and System, selectable from the public navigation, the dashboard
  top bar and the authentication pages. Built as a radio group, so it is
  announced as one control and arrow keys move between the options, carrying
  focus with the selection as a roving-tabindex group must.
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
- `--accent` and `--accent-text` are separate on purpose. `--accent` fills
  buttons and draws borders and focus rings, which are non-text and need 3:1.
  `--accent-text` is what every text rule reads and is darker in light mode so
  it clears 4.5:1 on the tinted and sunken surfaces it sits on. In dark mode the
  two are the same value, which already passes.
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

## Quality and reliability pass, 2026-09-17

Scope: the fresh-owner journey and setup recovery, cross-browser and
accessibility behaviour, failure handling and privacy, and the accuracy of the
public website. No feature was added and nothing in `docs/PRODUCT_SCOPE.md`
changed. Every defect below was reproduced before it was changed and re-checked
afterwards.

### Defects found and fixed

**1. Retrying an interrupted setup created a second project.** *High.*
The guided setup writes the project, then saves the appearance in a second
request. Nothing was recorded until both had succeeded, so when only the second
failed the owner saw an error beside a still-enabled **Create project** button
and their natural retry created a duplicate. Reproduced by failing the
appearance `PATCH` and pressing the button twice: two projects named "Duplicate
Probe". Now the project is remembered the instant the `POST` returns, a retry
reuses it, and a notice says plainly that the project was created and only the
appearance failed, with a link straight to its install page. Regression test:
`tests/e2e/dashboard.spec.ts` — "retrying an interrupted setup does not create a
second project", which fails two appearance saves, presses the button three
times and asserts exactly one project exists.

**2. Deleting a report opened from a link stranded the browser.** *High.*
Deletion called `navigate(-1)`. Notification emails link to
`/projects/:id/reports/:reportId`, which an owner opens in a tab with no history
behind it, so after deleting they landed on `about:blank` with the application
gone. Reproduced in a fresh tab; the URL afterwards was literally `about:blank`.
Deletion now returns to the inbox the report was opened from. Regression test:
`tests/e2e/dashboard.spec.ts` — "a report opened from a link is deleted without
stranding the browser", covering both `/reports/:id` and the emailed
`/projects/:id/reports/:reportId` shape.

**3. Failed saves on the project settings screen were invisible.** *High.*
**Save settings** sits in the sticky page bar, but the result was rendered in a
card at the bottom of a form several screens long. Measured: with a 900 px
viewport the error notice was at y ≈ 2190, so an owner pressed Save, saw
nothing change and reasonably assumed it had worked. The header now carries a
**Not saved** or **Saved** badge beside the button, and a failure scrolls the
explanation into view and moves focus to it. The duplicate badge at the bottom
of the form was removed.

**4. An ended session gave no way back.** *Medium.*
A 401 mid-edit rendered "You need to sign in to do that." with no link, while
the shell still showed the signed-in navigation. `ErrorNotice` now offers
"Sign in again in a new tab" for a 401 and for the stale-CSRF 403, and says that
nothing typed on the page has been lost — signing in in the other tab restores
the cookie and the same button then works. This covers every form in the
application, since they all render through `ErrorNotice`. Verified: typed text
survives, the link is present, and the notice is on screen.

**5. An expired password-reset link was a dead end.** *Medium.*
Reset links last one hour and confirmation links 24 hours, so arriving with a
stale one is ordinary. The reset page showed "That reset link is invalid or has
expired." and offered no links at all; a link truncated by a mail client
produced the same dead end. It now offers "Send me a new reset link" and "Back
to sign in". The confirmation page previously only suggested opening the account
page, which is useless when signed out, and now sends a signed-out reader to
sign in first. Regression test: `tests/e2e/site.spec.ts` — "an expired reset or
confirmation link offers a way forward".

**6. Light-theme accent text failed WCAG AA contrast.** *Serious (axe).*
`#2f6df6` gave 3.96:1 on the tinted `--accent-soft` background and 4.18:1 on
`--surface-sunken`, both under the 4.5:1 threshold for body text. It affected
the active sidebar item, the active project tab, the New badge, segmented
controls, the setup step pill, project avatars and the links under the
authentication forms. A new `--accent-text` token is darker (`#2359d6`, ≥5.3:1
on every surface it is used on) and is now what every text rule reads; `--accent`
is unchanged for fills, borders and focus rings, which are non-text and only
need 3:1. Dark mode already passed and keeps its own value.

**7. No `main` landmark anywhere but the homepage.** *Moderate (axe).*
Every dashboard and authentication screen reported its content as sitting
outside any landmark, so landmark navigation and "skip to main content" had
nothing to target. `AppShell` now renders `<main id="main">` around the page
body and carries its own skip link, and the authentication layout does the
same. Regression test: `tests/e2e/site.spec.ts` — "every screen has one main
landmark to skip to".

**8. The enlarged screenshot was not a real dialog.** *Moderate.*
It declared `role="dialog" aria-modal="true"`, but Tab walked straight out of it
— measured: the first Tab reached `<body>` and the next four reached the sidebar
links and the theme control underneath the overlay — and closing it dropped
focus to the document. It now keeps focus on its close button and returns focus
to the control that opened it. Escape already worked and still does. Asserted in
the existing `dashboard.spec.ts` lightbox test, now extended.

**9. Arrow keys in the theme selector left focus behind.** *Moderate.*
The selector is a roving-tabindex radio group. Pressing Arrow Right changed the
selection but never moved focus, so the focused option was left
`aria-checked="false"` and `tabindex="-1"`: a screen reader announced the wrong
state and the next Tab re-entered the group somewhere else. Confirmed
identically in Chromium, Firefox and WebKit. Focus now follows the selection.
This also resolved the one pre-existing Firefox test failure, where the focus
ring was absent because the element had never received a keyboard focus event.
Regression test: `tests/e2e/site.spec.ts` — "arrow keys move focus with the
selection in the theme group".

### Smaller corrections

- **Bare domains on the install page.** The guided setup turned `acme.example`
  into `https://acme.example`, while the install page rejected the same input.
  Both now use the same `resolveOrigin` helper, the field previews what will be
  saved, and Add is disabled until the value parses. The previous complaint also
  stayed on screen while the owner typed a corrected value; it now clears.
- **Silent copy buttons.** A refused clipboard API left the button doing
  nothing at all. It now says "Select it and copy"; the snippet is on the page
  either way.
- **Heading order on report detail.** That screen has no page introduction, so
  its panels jumped from `h1` to `h3`. They are `h2` now, which is what axe
  flagged.
- **Document titles.** Every route in the application kept the marketing title
  from `index.html`, so browser tabs and history entries were all identical.
  Each screen now sets `"<screen> · BugInbox"`, and the homepage still sets its
  own. Regression test: "each screen names itself in the document title".

### Checked and found correct — no change made

These were examined or actively exercised and needed no fix. They are recorded
so the next pass does not repeat them.

- **Unsaved settings survive a background refetch.** Typing into the settings
  form and then firing a reconnect, which React Query refetches on, left the
  draft intact.
- **Widget failure handling.** With the ingest request aborted mid-submit, the
  reporter saw "The report could not be sent. Check your connection and try
  again.", the typed description and the attachment were kept, the submit button
  was re-enabled, the host page logged no errors and stayed usable, and the
  retry produced exactly **one** report, not two.
- **Owner isolation across a sign-out.** A confidential report belonging to one
  owner was not reachable, in markup or in cache, after signing out and signing
  up as a different owner in the same tab.
- **Rate limiting with Redis unavailable.** Exercised in isolation against a
  dead Redis port, touching no running service: a 3-point limiter allowed
  exactly 3 of 6 attempts, so the in-memory fallback really is bounded.
- **200% zoom and phone width.** Every public and signed-in screen at 640×450
  (equivalent to 200% zoom of 1280) and at 390 px wide, in both themes and in
  all three engines: no horizontal overflow and no clipped control. The only
  element reported off-canvas is the skip link, which is placed there
  deliberately until it is focused.
- **Install status evidence.** "Check for a report" queries the reports API for
  that project. It reports what actually arrived and is not influenced by the
  copy button, and its wording already says it confirms ingestion and not the
  host site's layout, CSP or security.
- **Sensitive URLs and external links.** `sanitisePageUrl` accepts only `http`
  and `https`, strips query, fragment and credentials, so a `javascript:` URL
  can never reach the anchor on the report screen; that anchor already carries
  `rel="noreferrer noopener external"` and `target="_blank"`.
- **Public website accuracy.** Every claim on the homepage was re-checked
  against the implementation. There are no prices, testimonials, customer
  counts, compliance or uptime claims, no invented production domain, canonical
  URL or contact details, no dead call to action or placeholder link, and the
  illustrative preview is labelled "Example — illustrative, not real reports"
  and uses `example.com` addresses only. `index.html` already carries a useful
  title and description that do not depend on JavaScript.
- **Auth pages reached directly.** `/login`, `/signup`, `/forgot-password`,
  `/reset-password` and `/verify-email` all work on a direct hit, and every
  protected path still redirects a signed-out visitor to `/login`.

### Browser and accessibility coverage

`npm run test:e2e` now runs four projects — Chromium desktop, an emulated
Pixel 7, Firefox and WebKit — and **83 tests pass in all of them**. Firefox and
WebKit run the same desktop suite as Chromium: the full signup-to-notification
journey, page rules and pause, SPA navigation and host resilience,
keyboard-only operation of the widget, the redesigned dashboard screens, the
public website and the theme.

`tests/e2e/a11y.spec.ts` runs axe-core over the homepage, all five
authentication screens, the overview, projects, guided setup, inbox, report
detail, install, settings and account, **in both themes**, plus the enlarged
screenshot dialog. It asserts zero violations at `wcag2a`, `wcag2aa`, `wcag21a`
and `wcag21aa`, and it runs in all three engines.

**What this does not establish.** An automated scan finds a subset of problems
and is not a compliance claim; axe cannot judge whether a label is meaningful,
whether a reading order makes sense, or whether a screen reader can complete a
task. No assistive technology was used. Driving WebKit's Linux build is not
evidence about Safari on a real Mac or iPhone, and the Pixel 7 project is an
emulated viewport and user agent, not a real Android device. Contrast was
measured by axe on rendered pages in both themes; nothing was checked for
colour-blind legibility. Keyboard operation, focus trapping and focus return are
asserted by hand-written tests rather than by the scanner.

Running WebKit on this machine needed one system library that was missing
(`libavif13`). It is a host dependency, not a project one; `npx playwright
install-deps webkit` installs it where root is available.

## Verification evidence

Re-run on 2026-09-17 against the Compose stack, from the repository root with
`source scripts/host-env.sh`:

| Check | Command | Result |
| --- | --- | --- |
| Lint | `npx eslint .` | passed, 0 problems |
| Types | `npm run typecheck` | passed (shared, widget, server, dashboard) |
| Build | `npm run build` | passed; widget 27.9 KiB minified, dashboard 416 KiB |
| API and integration tests | `npm test` | **77 passed**, 7 files |
| Browser verification | `npm run test:e2e` | **83 passed** — 27 Chromium desktop, 2 Pixel 7, 27 Firefox, 27 WebKit |
| Accessibility scan | `tests/e2e/a11y.spec.ts` | 0 axe violations on 13 screens × 2 themes, in all three engines |
| Images | `docker compose build` | api, worker and web rebuilt and running |
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

The redesign added `apps/server/src/tests/stats.test.ts` (13 tests) asserting the
aggregates against fixtures inserted at known UTC day offsets: cohort counts by
current status, cards agreeing with the chart total, zero-filled days, the
inclusive boundary day and the day just outside it, project filtering, a status
change and a deletion both moving the figures, cross-owner isolation with a 404
for someone else's project id, rejection of unsupported ranges and malformed
ids, a truthful zero state, and "nothing ever" distinguished from "nothing in
this window". It also asserts cursor pagination reaches all 60 of a seeded set
with no duplicates, and that the projects list exposes the primary website and
latest report time.

`tests/e2e/dashboard.spec.ts` (6 tests) covers the redesigned screens: the empty
overview showing zeroes and an onboarding action; the guided setup refusing to
continue without a name or website, explaining what a bare domain and a full
page URL become, rejecting ftp/wildcard/credential input, creating exactly one
project, saving exactly the origin that was shown, and leaving installation
reachable afterwards; overview figures matching the reports and moving when a
report is resolved; the inbox loading 25, 50 then 60 distinct reports and its
status tabs surviving a reload; project search with a distinct no-results state;
and the report detail screenshot enlarging and closing with Escape.

Manually verified in addition:

- **Restart persistence.** `docker compose restart`, then report, attachment and
  owner counts and the files in `/data/uploads` were unchanged.
- **Backup and restore.** `./scripts/backup.sh` then `./scripts/restore.sh` with a
  disposable marker report: after the restore the marker was gone and the counts
  matched the backup (14 reports, 5 attachments, 5 files on disk), with health
  back to `ok`.
- **Redesign screenshots.** Login, overview, projects, guided setup, inbox and
  report detail were rendered and inspected at 1440px and 390px in both themes,
  plus the mobile drawer. No horizontal overflow at either width, and zero
  console errors on any screen. Inspecting these caught three real defects that
  were then fixed: the daily chart rendered every empty day as a tall block
  because flex overrode the bar height, the status breakdown fill was invisible
  because its track was an inline span, and the overview's recent list had an
  empty fourth column.
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

- **No real-device testing.** Chromium, Firefox and WebKit are all driven, but
  on Linux. WebKit's Linux build is not Safari on a Mac or an iPhone, and the
  Pixel 7 project is an emulated viewport and user agent, not an Android
  handset. Nothing here is evidence about iOS Safari specifically.
- **No screen-reader testing.** Keyboard operation, labelling, landmarks, focus
  trapping and focus return are asserted by tests, and axe-core reports no
  violations, but no assistive technology was used and no compliance claim is
  made. See the pass notes above for what the scan cannot see.
- The public homepage is client-rendered. `index.html` carries a useful title
  and description that need no JavaScript, and each route now sets its own title
  once the bundle runs, but a crawler that does not execute scripts sees only
  the `index.html` defaults for every route. No canonical or social-share URL is
  set, because that depends on a deployment domain that does not exist yet.
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
- The overview offers 7 and 30 day ranges only, because the default retention
  window is 90 days and anything longer would quietly under-report.
- There is no status history, so trends such as "resolved this week" cannot be
  shown and deliberately are not.
- The install step's check confirms that a report reached the server. It does
  not check the host site's layout, CSP or security, and says so.
- Rate limiting falls back to per-process in-memory counters when Redis is down,
  which is less precise across multiple API processes. The fallback is bounded:
  exercised against an unreachable Redis, a 3-point limiter allowed exactly 3 of
  6 attempts.
- An ended session is discovered when a request fails, not before. The interface
  still looks signed in until something is saved; the failure then explains what
  happened and offers a sign-in link in a new tab so nothing typed is lost. There
  is no background session poll, deliberately — it would add a request every few
  seconds to solve a problem the error message already solves.

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
- `7da462d` — recorded that commit's hash in this document
- `9560d69` — interface redesign: application shell, overview with real
  aggregates, guided project setup, structured inbox and report detail
- `0732406` — recorded that commit's hash in this document
- `7b71e13` — quality and reliability pass: nine defects in recovery paths and
  accessibility fixed, regression tests added, and browser verification
  extended to Firefox and WebKit with an axe-core accessibility scan

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
2. Verification with an actual screen reader, and on a real iPhone and Android
   handset. The automated pass cannot substitute for either.
3. A deployment runbook based on the requirements in `docs/ARCHITECTURE.md`.

### Deferred, because it is a product or architecture decision

Recorded rather than done, so the scope of a quality pass stays a quality pass:

- **Pre-rendered or server-rendered metadata.** Route-specific titles now exist,
  but they are set by JavaScript. Making them visible to a crawler that does not
  run scripts means either pre-rendering the routes at build time or moving to a
  server-rendered framework. That is an architectural change and it only matters
  once there is a public deployment with a real domain, which also supplies the
  canonical and social-share URLs that are missing for the same reason.
