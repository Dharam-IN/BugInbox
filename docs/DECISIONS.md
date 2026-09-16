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

## D13 — The fixture host site uses external scripts under a strict CSP
The fixture sends a restrictive `Content-Security-Policy` with no
`'unsafe-inline'`, which initially blocked its own inline `<script>` blocks.
Rather than loosening the policy, the page scripts were moved to separate files.
The strict policy stays, so the fixture proves the widget works on a site that
actually has one.

## D14 — nginx re-resolves the API upstream per request
`proxy_pass http://api:3000` resolves once at start-up, so rebuilding the API
container left the proxy serving 502s against a stale address. The proxy now
uses Docker's embedded resolver with a variable upstream, which matters in a
development loop where containers are rebuilt constantly.

## D15 — Browser tests clear rate-limit counters before running
The suite signs up several owners in a row, which trips the per-IP
authentication limit that the API tests assert on. Playwright's global setup
deletes only the limiter keys from Redis. The limit stays real; the suite stays
re-runnable.

## D16 — Widget bundle size and no framework on host pages
The bundle is ~28 KiB minified with no framework. React is a dashboard
dependency only; nothing of it reaches a host website.

## D17 — Screenshots are bounded by pixels as well as by bytes
A 5 MiB byte limit alone does not stop a highly compressible image that decodes
to an enormous bitmap. Dimensions (10,000 px per side) and total pixels
(40 million) are checked from decoded metadata, and sharp's `limitInputPixels`
guards the decode itself.

## D18 — Compose is parameterised enough to run a second isolated stack
Verifying a genuinely fresh setup meant standing the whole stack up beside the
running one. That exposed two hardcoded values: the network range and, more
importantly, `env_file: [.env]`, which ignores `--env-file` and made a second
stack send emails pointing at the first one's URL. The network range, the proxy
address and the service env file are now variables with the previous values as
defaults, so the ordinary single-stack workflow is unchanged.

## D19 — The fixture's CSP is templated, not relaxed
The fixture names the widget's origin in its `Content-Security-Policy`. Rather
than widening the policy so a second stack could work, nginx's entrypoint expands
`${BUGINBOX_WIDGET_ORIGIN}` into the template. The fixture keeps a strict,
realistic policy, and it is the policy the installation instructions tell owners
to use.
