import { config } from '../config.ts';
import { closePool, query, waitForDatabase, withTransaction } from './pool.ts';
import { runMigrations } from './migrate.ts';
import { hashPassword } from '../lib/password.ts';
import { generateProjectKey } from '../lib/tokens.ts';

/**
 * Synthetic demo data for local development.
 *
 * Everything here is fictional and uses reserved .test addresses, so seeding can
 * never send mail to a real person. Re-running the seed is safe: it reuses the
 * demo owner and project instead of duplicating them.
 */
const DEMO_EMAIL = 'owner@buginbox.test';
const DEMO_PASSWORD = 'demo-password-2026';
const DEMO_PROJECT = 'Demo Marketing Site';

const SAMPLE_REPORTS = [
  {
    message: 'The pricing page cards overlap the footer when I make the window narrow.',
    reporterEmail: 'sam@reporter.test',
    path: '/pricing',
    status: 'new',
  },
  {
    message: 'Clicking "Start free trial" does nothing on the second click. No error appears.',
    reporterEmail: null,
    path: '/signup',
    status: 'new',
  },
  {
    message: 'Typo on the about page: "recieve" should be "receive".',
    reporterEmail: 'lee@reporter.test',
    path: '/about',
    status: 'in_progress',
  },
  {
    message: 'The contact form said it failed but the message arrived twice.',
    reporterEmail: 'kai@reporter.test',
    path: '/contact',
    status: 'resolved',
  },
];

async function main(): Promise<void> {
  const cfg = config();
  await waitForDatabase();
  await runMigrations(() => {});

  const ownerId = await withTransaction(async (client) => {
    const existing = await client.query<{ id: string }>('SELECT id FROM owners WHERE email = $1', [DEMO_EMAIL]);
    if (existing.rows[0]) return existing.rows[0].id;
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO owners (email, password_hash, email_verified_at)
       VALUES ($1, $2, now()) RETURNING id`,
      [DEMO_EMAIL, await hashPassword(DEMO_PASSWORD)],
    );
    return rows[0]!.id;
  });

  const projectId = await withTransaction(async (client) => {
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM projects WHERE owner_id = $1 AND name = $2',
      [ownerId, DEMO_PROJECT],
    );
    if (existing.rows[0]) return existing.rows[0].id;

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO projects (owner_id, name, public_key, retention_days, launcher_text, accent_color)
       VALUES ($1, $2, $3, $4, 'Report a problem', '#2f6df6') RETURNING id`,
      [ownerId, DEMO_PROJECT, generateProjectKey(), cfg.DEFAULT_RETENTION_DAYS],
    );
    const id = rows[0]!.id;
    await client.query('INSERT INTO project_usage (project_id) VALUES ($1)', [id]);
    for (const origin of ['http://localhost:58081', 'http://127.0.0.1:58081']) {
      await client.query('INSERT INTO project_origins (project_id, origin) VALUES ($1, $2)', [id, origin]);
    }
    for (const rule of [{ kind: 'exclude', pattern: '/admin/*' }]) {
      await client.query('INSERT INTO project_path_rules (project_id, kind, pattern) VALUES ($1, $2, $3)', [
        id,
        rule.kind,
        rule.pattern,
      ]);
    }
    return id;
  });

  const { rows: existingReports } = await query<{ count: number }>(
    'SELECT count(*)::int AS count FROM reports WHERE project_id = $1',
    [projectId],
  );
  if ((existingReports[0]?.count ?? 0) === 0) {
    await withTransaction(async (client) => {
      for (const sample of SAMPLE_REPORTS) {
        await client.query(
          `INSERT INTO reports (project_id, status, message, reporter_email, page_url, browser, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, now() + ($7 || ' days')::interval)`,
          [
            projectId,
            sample.status,
            sample.message,
            sample.reporterEmail,
            `http://localhost:58081${sample.path}`,
            JSON.stringify({
              userAgent: 'Mozilla/5.0 (seed data)',
              viewportWidth: 1440,
              viewportHeight: 900,
              devicePixelRatio: 2,
              language: 'en-GB',
              device: 'desktop',
            }),
            cfg.DEFAULT_RETENTION_DAYS,
          ],
        );
      }
      await client.query(
        `UPDATE project_usage SET report_count = $2, updated_at = now() WHERE project_id = $1`,
        [projectId, SAMPLE_REPORTS.length],
      );
    });
  }

  const { rows } = await query<{ public_key: string }>('SELECT public_key FROM projects WHERE id = $1', [projectId]);

  console.log('Seeded demo data:');
  console.log(`  Dashboard   ${cfg.publicBaseUrl}`);
  console.log(`  Owner       ${DEMO_EMAIL}`);
  console.log(`  Password    ${DEMO_PASSWORD}`);
  console.log(`  Project     ${DEMO_PROJECT}`);
  console.log(`  Project key ${rows[0]?.public_key}`);
  console.log('These are synthetic local-only credentials. Do not reuse them anywhere else.');
}

await main();
await closePool();
