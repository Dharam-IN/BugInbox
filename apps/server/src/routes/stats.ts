import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.ts';
import { notFound } from '../lib/errors.ts';

/**
 * Overview aggregates for the dashboard.
 *
 * Every figure is a SQL aggregate over the owner's reports, not a count of a
 * page of rows. Owner scoping is in each query's WHERE clause.
 *
 * Definitions, which the interface repeats to the owner:
 *
 * - The **cohort** is every retained report created within the selected range,
 *   in the selected project scope.
 * - "Reports received" is the size of that cohort.
 * - New / In progress / Resolved are the *current* status of that same cohort.
 *   They are not "resolved during this period"; without status history that
 *   would be a fabrication, so it is neither shown nor implied.
 * - Days are UTC calendar days. A range of N days covers the last N days
 *   including today: from `date_trunc('day', now())::date - (N - 1)` up to now.
 * - Reports deleted by the owner, or removed by the 90-day retention sweep, are
 *   simply absent. Ranges longer than the retention window would therefore
 *   under-report, which is why only 7 and 30 days are offered.
 */
const RANGE_DAYS = [7, 30] as const;

const paramsSchema = z.object({
  projectId: z.string().uuid().optional(),
  days: z.coerce
    .number()
    .int()
    .refine((value): value is (typeof RANGE_DAYS)[number] => RANGE_DAYS.includes(value as 7 | 30), {
      message: `days must be one of ${RANGE_DAYS.join(', ')}`,
    })
    .default(7),
});

interface TotalsRow {
  received: number;
  new_count: number;
  in_progress_count: number;
  resolved_count: number;
}

export default async function statsRoutes(app: FastifyInstance) {
  app.get('/overview', async (request) => {
    const session = app.requireOwner(request);
    const params = paramsSchema.parse(request.query);

    // Validate the project filter against this owner before using it, so an
    // unknown or someone else's id is a 404 rather than a silent empty chart.
    if (params.projectId) {
      const owned = await query('SELECT 1 FROM projects WHERE id = $1 AND owner_id = $2', [
        params.projectId,
        session.owner.id,
      ]);
      if (owned.rowCount === 0) throw notFound('That project does not exist.');
    }

    const values: unknown[] = [session.owner.id, params.days];
    let projectFilter = '';
    if (params.projectId) {
      values.push(params.projectId);
      projectFilter = ` AND r.project_id = $${values.length}`;
    }

    // One shared expression for the window, so cards, chart and breakdown can
    // never disagree about where the range starts.
    const rangeStart = `(date_trunc('day', now() AT TIME ZONE 'UTC') - make_interval(days => $2::int - 1))`;
    const scope = `FROM reports r JOIN projects p ON p.id = r.project_id
       WHERE p.owner_id = $1 AND r.created_at >= ${rangeStart}${projectFilter}`;

    const [totals, daily, recent, lifetime] = await Promise.all([
      query<TotalsRow>(
        `SELECT count(*)::int AS received,
                count(*) FILTER (WHERE r.status = 'new')::int AS new_count,
                count(*) FILTER (WHERE r.status = 'in_progress')::int AS in_progress_count,
                count(*) FILTER (WHERE r.status = 'resolved')::int AS resolved_count
         ${scope}`,
        values,
      ),
      // Zero-filled: generate_series produces every day in the window, and the
      // left join supplies 0 for days with no reports.
      query<{ day: string; count: number }>(
        `WITH days AS (
           SELECT generate_series(
             ${rangeStart},
             date_trunc('day', now() AT TIME ZONE 'UTC'),
             interval '1 day'
           )::date AS day
         ),
         counted AS (
           SELECT date_trunc('day', r.created_at AT TIME ZONE 'UTC')::date AS day, count(*)::int AS count
           ${scope}
           GROUP BY 1
         )
         SELECT to_char(days.day, 'YYYY-MM-DD') AS day, COALESCE(counted.count, 0)::int AS count
           FROM days LEFT JOIN counted ON counted.day = days.day
          ORDER BY days.day`,
        values,
      ),
      query<{
        id: string;
        project_id: string;
        project_name: string;
        status: string;
        message: string;
        page_url: string | null;
        page_context: string | null;
        attachment_id: string | null;
        created_at: Date;
      }>(
        `SELECT r.id, r.project_id, p.name AS project_name, r.status, r.message,
                r.page_url, r.page_context, r.attachment_id, r.created_at
         ${scope}
         ORDER BY r.created_at DESC
         LIMIT 6`,
        values,
      ),
      // Lifetime figures are deliberately separate from the range cohort, so
      // the empty state can tell "no reports ever" from "none in this window".
      // This query has its own parameter list because it does not use the range.
      query<{ total: number; projects: number }>(
        `SELECT
           (SELECT count(*)::int FROM reports r2 JOIN projects p2 ON p2.id = r2.project_id
             WHERE p2.owner_id = $1${params.projectId ? ' AND r2.project_id = $2' : ''}) AS total,
           (SELECT count(*)::int FROM projects p3 WHERE p3.owner_id = $1) AS projects`,
        params.projectId ? [session.owner.id, params.projectId] : [session.owner.id],
      ),
    ]);

    const totalsRow = totals.rows[0] ?? { received: 0, new_count: 0, in_progress_count: 0, resolved_count: 0 };
    const series = daily.rows.map((row) => ({ date: row.day, count: Number(row.count) }));

    return {
      range: {
        days: params.days,
        // Inclusive first and last UTC day of the window.
        from: series[0]?.date ?? null,
        to: series.at(-1)?.date ?? null,
        timezone: 'UTC',
      },
      projectId: params.projectId ?? null,
      totals: {
        received: Number(totalsRow.received),
        new: Number(totalsRow.new_count),
        inProgress: Number(totalsRow.in_progress_count),
        resolved: Number(totalsRow.resolved_count),
      },
      daily: series,
      lifetime: {
        reports: Number(lifetime.rows[0]?.total ?? 0),
        projects: Number(lifetime.rows[0]?.projects ?? 0),
      },
      recent: recent.rows.map((row) => ({
        id: row.id,
        projectId: row.project_id,
        projectName: row.project_name,
        status: row.status,
        excerpt: row.message.length > 140 ? `${row.message.slice(0, 140)}...` : row.message,
        pageUrl: row.page_url,
        pageContext: row.page_context,
        hasScreenshot: row.attachment_id !== null,
        createdAt: row.created_at.toISOString(),
      })),
    };
  });
}
