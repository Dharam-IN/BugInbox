# Project status

_Last updated: 2026-09-16 (milestone 1 of 6)._

## Where things stand

Milestone 1 (inspect repository, continuity docs) and the backbone of milestone 2
(one complete report flow) are done. The API accepts a report from an allowed
origin, persists it with notification intent in the same transaction, and the
outbox delivers email to Mailpit.

Still to do: widget bundle, owner dashboard, screenshot end-to-end, hardening,
automated tests, containerised build, browser verification, final docs.

## Repository at the start

`main` contained only `.gitignore` and a stale `weatherxpert` README; there was
no existing application to preserve or adapt. Branch `origin/feat/front` holds an
unrelated weather app from the repository template and is left untouched.

## Completed

- Workspace scaffold: npm workspaces, TypeScript, four packages.
- Postgres schema (`apps/server/migrations/001_init.sql`) with owners, sessions,
  tokens, projects, origins, path rules, reports, attachments, notification
  outbox and per-project usage counters.
- API: auth (signup/login/logout/verify/reset/change), projects CRUD with widget
  settings, reports inbox/detail/status/delete, private screenshot download,
  public widget config and ingestion endpoints.
- Security: argon2id passwords, DB-backed sessions, double-submit CSRF + origin
  check, exact origin allowlist, Redis rate limits with in-memory insurance,
  bounded bodies, trusted-proxy configuration, owner scoping in every query.
- Notifications: transactional outbox, BullMQ fast path, worker sweeper recovery.
- Local environment: Docker Compose (Postgres, Redis, Mailpit, API, worker, web
  proxy, fixture host), all ports bound to loopback.
- Seed script with synthetic `.test` data.

## Verification evidence so far

Run from the host against the containers (`source scripts/host-env.sh`):

- `npx tsc -p apps/server/tsconfig.json --noEmit` — passed.
- `node --experimental-strip-types apps/server/src/db/migrate.ts` — applied 001.
- `node --experimental-strip-types apps/server/src/db/seed.ts` — seeded demo data.
- `GET /api/health` → `{"status":"ok"}`; `GET /api/health/ready` → database and
  redis both true.
- `POST /api/v1/widget/<key>/reports` from `http://localhost:58081`:
  - accepted (201), query string and fragment stripped from the stored page URL
  - repeat with the same `dedupeKey` → 200 `duplicate: true`, no second row
  - disallowed origin → 403 `origin_not_allowed`
  - excluded path `/admin/users` → 403 `page_not_eligible`
- Outbox sweep delivered the notification; Mailpit shows one message to
  `owner@buginbox.test`.

No automated test suite exists yet — these were manual curl checks.

## Local services

Running at the time of writing: `postgres`, `redis`, `mailpit` (compose project
`buginbox`). The `api`, `worker`, `web` and `fixture` containers have not been
built yet; the API was exercised from the host on port 3000.

## Known gaps

- Widget bundle, dashboard UI and fixture host site are not written.
- No vitest or Playwright suites yet.
- Docker image build not yet exercised.

## Next steps

1. Build the widget bundle (`packages/widget`) and the fixture host site.
2. Build the owner dashboard.
3. Wire the screenshot path end to end and verify it in a browser.
4. Add vitest integration tests and Playwright browser verification.
5. Build and run the full Compose stack; verify restart persistence and backup.
6. Finish documentation and commit.
