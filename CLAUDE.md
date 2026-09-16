# BugInbox — working context

BugInbox is a standalone website feedback and bug-reporting product. A solo
developer (the **owner**) signs up, creates a **project** per website, installs a
small script, and a **reporter** (visitor, client or tester) submits a problem
without needing a BugInbox account. The owner gets an email and works the report
in the dashboard.

Read this file and `docs/PROJECT_STATUS.md` first, then compare both against the
actual working tree. These documents are continuity aids; they are not proof
that tests are still passing.

## Scope

V1 is deliberately small. `docs/PRODUCT_SCOPE.md` is authoritative for what is in
and out. Notable exclusions: teams/roles, billing, comments/chat, AI summaries,
session/console/network recording, automatic screenshots or DOM capture,
annotation, third-party integrations, public roadmaps, custom JS/CSS editors,
Kubernetes, cloud provisioning.

Do not add excluded features. Do not invent customer counts, testimonials or
compliance claims anywhere in the product or docs.

## Repository map

```
apps/server         Fastify API + BullMQ worker (one codebase, two entrypoints)
  src/api.ts        API entrypoint
  src/worker.ts     Worker entrypoint: notification sweeper + maintenance
  src/routes/       auth, projects, reports (owner) and widget (public ingest)
  src/lib/          password, tokens, origins, URL sanitising, image, mail, limits
  migrations/       plain SQL, applied by src/db/migrate.ts
apps/dashboard      React + Vite public website and owner dashboard (static build)
  public/theme-init.js  Applies the saved theme before the first paint
  src/theme.tsx     Light/Dark/System preference, storage and OS listener
  src/styles.css    Semantic colour tokens and base primitives
  src/app.css       Application shell and redesigned screen primitives
  src/site.css      Public website styles (same tokens as the interface)
  src/components/AppShell.tsx  Sidebar, page header and mobile drawer
  src/components/charts.tsx    Daily SVG bar chart and status breakdown
  src/lib/origin.ts            Setup-time URL normalisation (display only)
  src/pages/         HomePage, Overview, Projects, NewProject (guided setup),
                     Reports, ReportDetail, Install, Settings, Account, Auth
packages/widget     TypeScript widget bundle (esbuild IIFE, Shadow DOM, no React)
packages/shared     Path/eligibility matching + widget config types, used by both
fixtures/host-site  Local integration fixture: plain HTML, SPA routes, custom button
infra/nginx         Reverse proxy config (web tier) and fixture host config
tests/e2e           Playwright browser verification
docs/               scope, architecture, decisions, status
```

## Local commands

Everything runs locally with Docker Compose. Nothing here talks to a paid or
external service.

```bash
cp .env.example .env          # then set POSTGRES_PASSWORD to any local value
npm install
npm run up                    # build + start all containers
npm run seed                  # synthetic demo owner/project/reports
npm run logs                  # follow container logs
npm run down                  # stop (volumes are preserved)

source scripts/host-env.sh    # point host tooling at the published loopback ports
npm run lint
npm run typecheck
npm test                      # vitest integration tests (needs containers running)
npm run test:e2e              # Playwright browser verification

./scripts/backup.sh ./backups # database dump plus the screenshot volume
./scripts/restore.sh <sql.gz> <tar.gz>
```

Local URLs (all bound to 127.0.0.1):

| What | URL |
| --- | --- |
| Public website | http://localhost:58080/ |
| Owner dashboard (projects) | http://localhost:58080/dashboard |
| API + widget script | http://localhost:58080 |
| Integration fixture host site | http://localhost:58081 |
| Mailpit (all local email) | http://localhost:58025 |
| Postgres / Redis (tests only) | 127.0.0.1:55432 / 127.0.0.1:56379 |

## Routes

Public, no session required: `/` (homepage), `/login`, `/signup`,
`/forgot-password`, `/reset-password`, `/verify-email`. An unrecognised path
redirects to `/`.

Protected, redirect to `/login` without a session: `/dashboard` (overview),
`/projects` (projects list), `/projects/new` (guided setup),
`/projects/:id/{reports,install,settings}`, `/projects/:id/reports/:reportId`,
`/reports`, `/reports/:id`, `/account`.

`/dashboard` is the overview, not the projects list. Every `/projects/:id/...`
path, and the links in verification, reset and report-notification emails, are
unchanged.

## Overview metrics

`GET /api/v1/stats/overview` is the only source for the overview. Its figures
all describe one cohort — reports created inside the selected range, in the
selected project scope — and the status figures are that cohort's **current**
status, never "resolved during this period". Days are UTC.
`docs/ARCHITECTURE.md` has the full definitions and limits; do not add a metric
that cannot be computed from what is stored.

## Theme

Light, Dark and System, chosen from the selector in the public nav, the
dashboard top bar and the authentication pages. System is the default when
nothing is saved. The preference is stored in `localStorage` under
`buginbox.theme` and every read and write is wrapped in try/catch, so blocked
storage degrades to "applies now, resets on reload" rather than breaking.

`apps/dashboard/public/theme-init.js` applies the theme before the first paint.
It is a separate file rather than an inline script because the app is served
under `script-src 'self'`. The stylesheet still resolves correctly without it,
falling back to the OS preference.

All colours come from semantic tokens in `apps/dashboard/src/styles.css`. Dark
values live in two adjacent blocks: `@media (prefers-color-scheme: dark)`
scoped to `:root:not([data-theme='light'])`, and `:root[data-theme='dark']`.

**The interface theme and a project's widget theme are separate.** The widget's
appearance lives in the database per project (`projects.appearance`) and is
served to customer websites; the interface theme is a per-browser preference in
`localStorage`. Changing one never changes the other, and the widget preview in
project settings deliberately resolves "system" against the operating system,
not against the dashboard theme.

## Local-only boundaries

- Mailpit is the only mail destination. Never configure Resend/SES/Postmark
  credentials here, and never send real email to anyone without explicit,
  separate authorisation.
- Seed and test data use `.test` / `example` addresses only.
- Secrets stay out of Git, logs, screenshots and these documents. `.env` is
  git-ignored; `.env.example` holds placeholders only.
- Published ports bind to loopback. Do not stop or modify unrelated containers,
  and do not touch the Pingexa project, repository, credentials or data.
- Deployment is the owner's job later. Do not provision infrastructure, change
  DNS or publish anything.

## Git identity and publishing

Repository-local config only (already set; do not change global config):

```
user.name  = Dharam-IN
user.email = dharamdotin@gmail.com
```

Verify author **and** committer (including `GIT_*` environment overrides) before
each commit. Do not use a Claude/bot identity and do not add generated-by or
co-author trailers.

Nothing is pushed until the repository owner explicitly asks. When they do:
verify the remote is `git@github.com-dharam-in:Dharam-IN/BugInbox.git`, confirm
SSH authenticates as `Dharam-IN` (GitHub's success greeting exits non-zero), and
stop if the account differs. Never force-push or rewrite history.

The `feat/front` branch holds an unrelated weather app from the repository
template. Leave it alone.

## How to resume

1. Read `docs/PROJECT_STATUS.md` for the current state and next steps.
2. `git status` and `git log --oneline -10` to see what is committed.
3. `docker compose ps` to see whether local services are running.
4. Re-run `npm run typecheck && npm test` rather than trusting recorded results.
