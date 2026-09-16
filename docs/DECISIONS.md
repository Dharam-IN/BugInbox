# Decisions

Material choices and why they were made. Newest last.

## D1 — Build fresh on `main` rather than adapt existing code
`main` held only a `.gitignore` and a stale README from an unrelated template;
`origin/feat/front` is a weather app from the same template. There was no
BugInbox application to preserve, so there was nothing to adapt. The existing
`.gitignore` was kept. `feat/front` is untouched.

## D2 — npm workspaces, no monorepo tooling
Four packages (shared, widget, server, dashboard) with plain npm workspaces and
`package-lock.json`. Turborepo/nx would add a build system for no benefit at this
size.

## D3 — Fastify + plain SQL instead of an ORM
The schema is small and the queries are hand-written so that owner scoping is
visible in each query rather than hidden behind a query builder. Migrations are
plain SQL applied by a 60-line runner under an advisory lock.

## D4 — Postgres is the source of truth; Redis is disposable
Reports and notification intent are written in one transaction (transactional
outbox). Redis only carries rate-limit counters and job dispatch. If Redis is
down: ingestion keeps working, rate limiting falls back to per-process in-memory
counters (`rate-limiter-flexible` insurance limiter) so ingestion is never
unlimited, and pending notifications are delivered by the worker's Postgres
sweeper instead of the queue.

## D5 — At-least-once notification delivery, stated plainly
The outbox row is leased while sending. A crash between SMTP handover and the
`sent` update causes a resend after the lease expires. This is at-least-once; it
is not exactly-once, and the documentation does not claim otherwise.

## D6 — Local disk storage behind an adapter, not object storage
For a single-host V1, a private Docker volume is simpler than adding MinIO or an
S3 dependency. All access goes through `StorageAdapter`, storage keys are
generated (never user-derived), files are `0640` and non-executable, and every
download is authorised against the owning account. The trade-off is recorded in
`docs/ARCHITECTURE.md`: backups must include the volume, and migrating to object
storage means implementing one interface plus a file copy.

## D7 — Session cookies with double-submit CSRF
The dashboard is first-party and same-origin, so httpOnly `SameSite=Lax` session
cookies backed by a `sessions` table are simpler and safer than JWTs, and they
can be revoked. CSRF protection is a readable `bi_csrf` cookie echoed in the
`x-buginbox-csrf` header, plus an `Origin` check on every state-changing request.

## D8 — Argon2id via `@node-rs/argon2`
Prebuilt platform binaries, no compiler at install time, and argon2id parameters
in OWASP's suggested interactive range (19 MiB, t=2, p=1).

## D9 — Path rules are a tiny grammar, not regular expressions
Only exact paths and a trailing `/*` are supported. `/checkout/*` covers the
section root `/checkout` and everything below it, and segment boundaries are
respected so `/checkoutfoo` never matches. The full definition lives in
`docs/ARCHITECTURE.md` and the implementation is shared by the widget and the
dashboard tester (`packages/shared`), so the two can never disagree.

## D10 — Hash fragments are ignored entirely
Matching uses the URL path only. A hash router's route (`#/checkout`) is never
inspected and never stored, which keeps fragment contents out of BugInbox but
means hash-router apps must use manual trigger mode plus the host API to control
where the widget appears.

## D11 — The server re-checks page eligibility on ingest
When a page URL is collected, the ingest endpoint re-evaluates include/exclude
rules and rejects reports from excluded pages. This makes "stop submission from a
now-ineligible page" a server-side guarantee rather than a widget courtesy. It
does not apply when URL collection is switched off, because there is then nothing
to check.

## D12 — Project pause is enforced server-side
Widget configuration is cached by browsers for a documented window, so a paused
project can still look active to a client. Ingestion re-reads the project row on
every submission and rejects reports with `project_paused`. Widget settings are
convenience and presentation; they are never an authorisation boundary.
