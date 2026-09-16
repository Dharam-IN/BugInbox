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
apps/dashboard      React + Vite owner dashboard (static build)
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
npm run typecheck
npm test                      # vitest integration tests (needs containers running)
npm run test:e2e              # Playwright browser verification
```

Local URLs (all bound to 127.0.0.1):

| What | URL |
| --- | --- |
| Dashboard + API + widget script | http://localhost:58080 |
| Integration fixture host site | http://localhost:58081 |
| Mailpit (all local email) | http://localhost:58025 |
| Postgres / Redis (tests only) | 127.0.0.1:55432 / 127.0.0.1:56379 |

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
