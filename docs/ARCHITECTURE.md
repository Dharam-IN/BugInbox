# Architecture

## Components

```
                    browser (host website, any origin)
                             │
                 ┌───────────┴────────────┐
                 │  widget bundle (IIFE)  │  shadow DOM, no framework shipped
                 └───────────┬────────────┘
                             │  GET  /api/v1/widget/:key/config
                             │  POST /api/v1/widget/:key/reports
                             ▼
  browser (owner) ──▶ nginx (web) ──▶ Fastify API ──▶ Postgres  (source of truth)
       dashboard SPA      :80          :3000        ├▶ Redis    (rate limits, queue)
                                                    └▶ /data/uploads (private volume)
                                                          ▲
                             worker (same image, worker.js)│
                               • BullMQ notification jobs  │
                               • outbox recovery sweep     │
                               • retention and orphan sweep┘
                                          │
                                          ▼
                                   Mailpit (local SMTP)
```

| Component | What it is | Where |
| --- | --- | --- |
| `web` | nginx: serves the public site and dashboard build and the widget bundle, proxies `/api/` | `infra/nginx/default.conf` |
| `api` | Fastify HTTP API | `apps/server/src/api.ts` |
| `worker` | Same image and codebase, different entrypoint | `apps/server/src/worker.ts` |
| `postgres` | Owners, projects, reports, attachments metadata, outbox | `apps/server/migrations` |
| `redis` | Rate-limit counters and job dispatch only | `apps/server/src/lib/redis.ts` |
| `mailpit` | Local mail sink for development and tests | compose service |
| `fixture` | Integration host website on a separate origin | `fixtures/host-site` |

The API and the worker share one codebase so routes, queries and email
templates cannot drift apart. They are the same container image started with a
different command.

## Data flow: one report

1. The widget fetches `/api/v1/widget/:key/config`. The response is public and
   carries no owner data. It is cacheable for `WIDGET_CONFIG_CACHE_S` (300 s).
2. The widget evaluates eligibility locally (`packages/shared/src/matching.ts`)
   and renders the launcher if the page qualifies.
3. The reporter submits a `multipart/form-data` request to
   `/api/v1/widget/:key/reports`. It is a CORS-simple request, so no preflight
   is needed; the widget sends no cookies (`credentials: 'omit'`).
4. The API, in order: per-IP rate limit → project lookup → **exact** origin
   allowlist check → **project pause check** → per-project rate limit → stored
   report and storage caps → schema validation → page-eligibility re-check →
   screenshot decode/re-encode → file write → transaction.
5. One transaction inserts the attachment row, the report row and the
   notification outbox row, and bumps `project_usage`. If any part fails, the
   uploaded file is removed.
6. After commit, a BullMQ job is enqueued with `jobId = outbox id`. A failure
   here is logged and ignored, because the outbox row already exists.
7. The worker (queue job, or the 15-second recovery sweep) claims the outbox
   row, sends the email through SMTP and marks it `sent`.

## Recovery model

**Transactional outbox.** The report and the intent to notify are written
together. There is no window where a report exists with no record that an email
is owed.

**Leases, not deletes.** `processNotification` claims a row by bumping
`attempts` and pushing `next_attempt_at` 120 seconds into the future. A crash
mid-send leaves the row `pending` with an expired lease, and the next sweep
retries it. Retries back off exponentially (30 s doubling to a 1 hour cap) and
stop after `NOTIFICATION_MAX_ATTEMPTS`, at which point the row is marked
`failed` with its last error.

**Delivery guarantee.** At-least-once. If the process dies between the SMTP
handover and the `sent` update, the email is sent twice. BugInbox does not claim
exactly-once delivery.

**Redis is disposable.** Its two jobs are rate limiting and job dispatch. If it
is unavailable:

- Ingestion keeps working. Reports still commit to Postgres.
- Rate limiting falls back to per-process in-memory counters
  (`rate-limiter-flexible`'s insurance limiter), so public ingestion is never
  left unlimited — only less precise across multiple API processes.
- `enqueueNotification` logs a warning and returns. The worker's Postgres sweep
  delivers the email instead, within one poll interval.
- `/api/health/ready` reports `degraded` rather than failing.

If Postgres is unavailable, ingestion fails with a 500 and the reporter's draft
stays in the open form so they can retry. Nothing is silently discarded.

## Storage

Screenshots live on a private Docker volume behind `StorageAdapter`
(`apps/server/src/storage/index.ts`).

- Keys are generated (`<project-uuid>/<yyyymm>/<32 hex>.png`), never derived
  from user input, and are validated against a strict pattern plus a
  path-containment check before any filesystem call.
- Files are written `0640` in directories `0750`, with `flag: 'wx'` so a key
  collision fails rather than overwrites. Nothing is executable.
- There is no public route to a file. `/api/v1/reports/:id/screenshot` joins
  through `projects.owner_id` and serves with `nosniff`, `no-store`,
  `Content-Disposition: inline` and a locked-down CSP.
- There is no general-purpose upload endpoint. An image can only arrive as part
  of a report submission.

**Backup and migration implications.** Reports live in Postgres and screenshots
live in the volume, so a backup needs both (`scripts/backup.sh` writes both, and
`scripts/restore.sh` restores both). Restoring only the database leaves rows
whose files are missing — the screenshot route returns 404 and the maintenance
sweep eventually clears them. Restoring only the volume leaves files with no
rows, which the orphan sweep removes within the hour. Moving to object storage
later means implementing `StorageAdapter` once and copying the volume's
contents; the keys and the authorisation checks stay as they are.

## Security

| Concern | How it is handled |
| --- | --- |
| Passwords | argon2id (`@node-rs/argon2`), 19 MiB / t=2 / p=1 |
| Sessions | Random 256-bit token, stored only as a SHA-256 hash, `HttpOnly` + `SameSite=Lax` cookie, revocable, TTL from `SESSION_TTL_HOURS` |
| CSRF | Readable `bi_csrf` cookie echoed in `x-buginbox-csrf`, plus an `Origin` check on every state-changing owner request |
| Authorisation | Owner scoping is in the SQL of every owner query. Another owner's resource returns 404, not 403, so ids cannot be probed |
| Input validation | Zod schemas on every route; 32 KiB JSON body limit; multipart limited to 1 file, 12 fields, 8 KiB per field |
| Screenshots | Decoded with sharp (content, not extension or declared type), format restricted to PNG/JPEG, dimensions and pixel count bounded independently of byte size, re-encoded so EXIF/ICC and trailing payloads are dropped |
| CORS | Per-request, from the project's exact origin allowlist. No credentials. Unknown key means no CORS headers at all |
| Origins | Parsed with `URL`; scheme + host + port only. A path, a wildcard, credentials or a non-http(s) scheme is rejected. A different port is a different origin |
| Rate limits | Per IP per project, per project, per IP for config reads, per IP for auth |
| Caps | `PROJECT_REPORT_CAP` stored reports and `PROJECT_STORAGE_CAP_BYTES` of screenshots per project |
| Trusted proxy | `TRUSTED_PROXIES` names the proxy's exact address. nginx *replaces* `X-Forwarded-For` with `$remote_addr` rather than appending, so a client-supplied header cannot be smuggled through |
| Untrusted text | React escapes report text in the dashboard; emails escape it explicitly (`apps/server/src/lib/html.ts`) |
| Logging | Report bodies, reporter emails, screenshot contents, passwords and tokens are never passed to the logger |

Public project keys are identifiers, not secrets: they are visible in the page
source of any site the widget is installed on. The origin allowlist and the
abuse limits are what protect a project, and an allowlist is not by itself an
abuse control.

Widget settings are presentation, not authorisation. Anything that must hold
regardless of what a client believes — project pause, ownership, limits — is
enforced server-side on every request.

## Page eligibility

Defined once in `packages/shared`, used by the widget and by the dashboard's
rule tester so they cannot disagree.

```
eligible = project active
        AND device allowed (mobile visibility switch)
        AND (no include rules OR some include rule matches)
        AND no exclude rule matches
```

Normalisation applies to both the page path and the rule pattern: only the path
is considered, a trailing slash is dropped except at the root, matching is case
sensitive, and percent-encoding is compared as written.

| Pattern | Matches | Does not match |
| --- | --- | --- |
| `/checkout` | `/checkout`, `/checkout/` | `/checkout/payment` |
| `/checkout/*` | `/checkout`, `/checkout/`, `/checkout/payment`, `/checkout/a/b` | `/checkoutfoo`, `/checkout-2` |
| `/*` | everything | — |

Any matching exclusion wins over any include. An empty include list means all
paths. Invalid rules are rejected when saved and ignored at runtime; the tester
lists the ones it ignored.

**Query strings and fragments are never inspected.** `?utm_source=x` makes no
difference, and a hash-router route such as `#/checkout` is simply the path `/`.
That keeps fragment contents out of BugInbox entirely, and it means hash-router
applications must use manual trigger mode plus the host API to control where the
widget appears. Paths can still carry sensitive values, which is why URL
collection is switchable and a host-provided page context is supported.

**Navigation.** `packages/widget/src/navigation.ts` wraps `history.pushState`
and `history.replaceState` once per page however many times the widget is
initialised, listens for `popstate`, and restores the originals when the last
listener goes away. The wrappers call through first and never swallow errors, so
the host router is unaffected. Re-evaluation does not re-initialise the widget,
re-fetch configuration or add listeners.

If a route change makes the current page ineligible while the form is open, the
form closes. Submission is re-checked at send time as well, and when a page URL
is collected the server re-evaluates the rules and rejects reports from excluded
pages.

## Overview aggregates

`GET /api/v1/stats/overview?projectId=&days=7|30` is the only endpoint the
dashboard's overview uses. Everything it returns is a SQL aggregate over the
owner's reports (`apps/server/src/routes/stats.ts`); nothing is derived from a
page of rows.

**Definitions, repeated verbatim in the interface.** The *cohort* is every
retained report created inside the selected range, in the selected project
scope.

| Figure | Meaning |
| --- | --- |
| Reports received | The size of the cohort |
| New / In progress / Resolved | The **current** status of that same cohort |
| Daily chart | Cohort grouped by UTC calendar day, zero-filled |
| Lifetime | All stored reports and projects for the owner, ignoring the range |

The three status figures partition the cohort exactly, so the cards and the
chart always agree. They are *not* "resolved during this period": there is no
status history table, so that number cannot be produced honestly and is neither
shown nor implied.

**Boundaries.** Days are UTC calendar days, and the timezone is displayed in the
interface. A range of N days covers the last N days *including today*:
`date_trunc('day', now() AT TIME ZONE 'UTC') - (N - 1 days)` up to now. The
range start is one SQL expression shared by every query in the handler, so the
cards, the chart and the recent list cannot disagree.

**Limits.** Deleted reports and reports removed by the 90-day retention sweep
are simply absent, so a range longer than the retention window would
under-report — which is why only 7 and 30 days are offered. Owner scoping is in
each query's `WHERE` clause, and a `projectId` that the owner does not own is a
404 rather than an empty chart. Status changes and deletions invalidate the
overview query, so the figures refresh without a reload.

No percentage growth, response time, visitor or conversion metric is produced,
because none of them can be computed from what is stored.

## Public site and interface theme

The public homepage and the owner dashboard are the same React bundle and the
same router. `/` is public and renders the homepage whether or not there is a
session; the projects list moved to `/dashboard`; everything else under the
protected layout is unchanged. An unrecognised path redirects to `/`, so a
signed-out visitor is never bounced to the sign-in form by a typo.

Colour is expressed only as semantic custom properties in
`apps/dashboard/src/styles.css`. Dark values appear in two adjacent blocks —
`@media (prefers-color-scheme: dark)` scoped to `:root:not([data-theme='light'])`
and `:root[data-theme='dark']` — so the document is themed correctly with no
JavaScript, and an explicit choice always beats the operating system. Nothing
uses a CSS filter to invert, which is what keeps reporters' screenshots exactly
as they were uploaded.

`apps/dashboard/public/theme-init.js` is a classic script in `<head>` that sets
`data-theme` before the first paint. It is a file, not an inline script, because
the web tier sends `script-src 'self'` with no `'unsafe-inline'`.

The interface theme is a per-browser value in `localStorage` (`buginbox.theme`).
A project's **widget** appearance is a per-project column served to customer
websites through the widget config endpoint. The two never read or write each
other, and the widget preview in project settings deliberately resolves its
"system" option against the operating system rather than the dashboard theme.

## Configuration caching

The config response carries `Cache-Control: public, max-age=300` and a weak
ETag derived from `config_version`. Appearance and rule changes therefore reach
visitors within about five minutes, or immediately on a hard reload. Every
project change bumps `config_version`.

Pause is deliberately not subject to that window: the ingest endpoint re-reads
the project row on every submission, so a paused project rejects reports at once
even from a browser holding cached configuration that still says "active".

## Widget versioning

The bundle is published at `/widget/v1/buginbox.js`. That URL is mutable by
design — republishing it is how fixes reach installed websites without anyone
editing their HTML. Because it can change, no immutability or integrity claim is
made about it and the snippet carries no `integrity` attribute. The build stamps
the exact version into the bundle (`BugInbox.version`) and writes it to
`packages/widget/dist/VERSION`.

## Failure behaviour on the host website

If the bundle fails to load, the config request fails, the key is unknown or the
project is paused, the widget renders nothing and throws nothing. A
misconfigured snippet is ignored rather than raising. `destroy()` removes the
UI, every listener and every timer, and aborts an in-flight submission; it does
not delete reports the server has already accepted.

## Deployment requirements (not performed here)

Everything in this repository runs locally. For a real deployment the operator
would need to: terminate TLS and set `COOKIE_SECURE=true`; set `APP_BASE_URL`
and `PUBLIC_BASE_URL` to the public origin; set `TRUSTED_PROXIES` to the real
proxy addresses; replace Mailpit with a real SMTP provider and complete its
domain authentication; run managed or backed-up Postgres and Redis; schedule
`scripts/backup.sh` and rehearse `scripts/restore.sh`; and provide durable
storage for `/data/uploads`. Local success does not demonstrate production
readiness.
