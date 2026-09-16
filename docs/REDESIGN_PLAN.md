# Interface redesign — implementation plan

Status: **complete**. The backend contract, security model and widget are
unchanged except for one additive read-only endpoint and two extra fields on the
projects list. Outcomes and metric definitions live in `docs/PROJECT_STATUS.md`
and `docs/ARCHITECTURE.md`; the reasoning is in `docs/DECISIONS.md` (D27–D33).

## Problems being fixed

1. `/dashboard` is a narrow projects list surrounded by empty space, with no
   overview of what is actually happening.
2. Reports render as repetitive full-width cards with all metadata crushed into
   one sentence, and nothing past the first 50 is reachable.
3. New project drops the owner straight into a technical "allowed origins"
   textarea with no path to a working installation.
4. Authentication pages are generic cards with no product identity.
5. There is no application shell: no persistent navigation, no page header, no
   contextual primary action.

## Work

1. **Server (additive, read-only)**
   - `GET /api/v1/stats/overview` — real SQL aggregates, owner-scoped, project
     and date-range filtered, UTC day buckets, zero-filled.
   - Projects list gains `primaryOrigin` and `latestReportAt`.
   - No migration required; both are derived from existing tables.
2. **Application shell** — persistent 240px sidebar, compact page header with
   title/breadcrumb and contextual action, mobile drawer with focus trap and
   Escape.
3. **Overview** at `/dashboard` — scope + range selectors, four summary cards,
   daily bar chart and status breakdown (hand-drawn SVG, no chart dependency),
   accessible table equivalents, recent reports, truthful zero states.
4. **Projects list** at `/projects` — desktop table, mobile cards, search,
   per-row actions.
5. **Guided setup** at `/projects/new` — Website → Appearance → Install & test.
   Project created once; installation reachable again afterwards.
6. **Reports** — structured rows, status tabs, project filter, Load more.
7. **Report detail** — two-column, screenshot lightbox with keyboard dismissal.
8. **Settings** — grouped into General, Appearance, Behaviour, Notifications and
   privacy, Danger zone. Every existing control and the rule tester preserved.
9. **Auth pages** — branded split composition, accessible password reveal.

## Constraints honoured

- No new runtime dependency; charts are inline SVG so nothing reaches the widget
  bundle or the public homepage.
- Interface theme stays independent of a project's widget appearance.
- Exact-origin backend enforcement is untouched; the setup flow only normalises
  what it shows the owner before saving.
- No billing, teams, AI, chat, integrations, tracking or new services.
