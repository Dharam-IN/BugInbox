import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../db/pool.ts';
import { authHeaders, createOwner, createProject, resetDatabase, testApp, type OwnerSession, type TestProject } from './helpers.ts';

/**
 * Aggregates are checked against fixtures inserted at known UTC offsets from
 * today, so the assertions are exact rather than "looks about right".
 */
async function seedReport(
  project: TestProject,
  options: { daysAgo: number; status?: 'new' | 'in_progress' | 'resolved'; message?: string },
): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO reports (project_id, status, message, created_at, expires_at)
     VALUES ($1, $2, $3,
             date_trunc('day', now() AT TIME ZONE 'UTC') - make_interval(days => $4::int) + interval '9 hours',
             now() + interval '90 days')
     RETURNING id`,
    [project.id, options.status ?? 'new', options.message ?? `Seeded report ${options.daysAgo} days ago`, options.daysAgo],
  );
  return rows[0]!.id;
}

async function overview(session: OwnerSession, search = '') {
  const app = await testApp();
  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/stats/overview${search}`,
    headers: authHeaders(session),
  });
  return response;
}

describe('overview aggregates', () => {
  let owner: OwnerSession;
  let project: TestProject;
  let other: TestProject;

  beforeEach(async () => {
    await resetDatabase();
    owner = await createOwner('stats@owner.test');
    project = await createProject(owner, 'Stats site');
    other = await createProject(owner, 'Other site');
  });

  it('counts the cohort by current status, and cards agree with the chart', async () => {
    await seedReport(project, { daysAgo: 0, status: 'new' });
    await seedReport(project, { daysAgo: 0, status: 'resolved' });
    await seedReport(project, { daysAgo: 2, status: 'in_progress' });
    await seedReport(project, { daysAgo: 6, status: 'new' });
    // Outside a 7 day window (which covers today plus the previous six days).
    await seedReport(project, { daysAgo: 7, status: 'new' });

    const response = await overview(owner, '?days=7');
    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body.totals).toEqual({ received: 4, new: 2, inProgress: 1, resolved: 1 });
    // The status cards partition the cohort exactly.
    expect(body.totals.new + body.totals.inProgress + body.totals.resolved).toBe(body.totals.received);
    // And the chart sums to the same number the cards show.
    const charted = body.daily.reduce((sum: number, day: { count: number }) => sum + day.count, 0);
    expect(charted).toBe(body.totals.received);
  });

  it('zero-fills every day in the range and reports UTC boundaries', async () => {
    await seedReport(project, { daysAgo: 3 });

    const body = (await overview(owner, '?days=7')).json();
    expect(body.daily).toHaveLength(7);
    expect(body.range).toMatchObject({ days: 7, timezone: 'UTC' });
    expect(body.range.from).toBe(body.daily[0].date);
    expect(body.range.to).toBe(body.daily[6].date);

    const withReports = body.daily.filter((day: { count: number }) => day.count > 0);
    expect(withReports).toHaveLength(1);
    expect(body.daily.every((day: { count: number }) => Number.isInteger(day.count))).toBe(true);

    const thirty = (await overview(owner, '?days=30')).json();
    expect(thirty.daily).toHaveLength(30);
    expect(thirty.totals.received).toBe(1);
  });

  it('includes the boundary day and excludes the day before it', async () => {
    await seedReport(project, { daysAgo: 6, message: 'Exactly on the boundary' });
    await seedReport(project, { daysAgo: 7, message: 'One day too old' });

    const body = (await overview(owner, '?days=7')).json();
    expect(body.totals.received).toBe(1);
    expect(body.daily[0]?.count).toBe(1);

    const thirty = (await overview(owner, '?days=30')).json();
    expect(thirty.totals.received).toBe(2);
  });

  it('filters by project and keeps the totals consistent', async () => {
    await seedReport(project, { daysAgo: 1 });
    await seedReport(project, { daysAgo: 1 });
    await seedReport(other, { daysAgo: 1 });

    expect((await overview(owner, '?days=7')).json().totals.received).toBe(3);
    expect((await overview(owner, `?days=7&projectId=${project.id}`)).json().totals.received).toBe(2);
    expect((await overview(owner, `?days=7&projectId=${other.id}`)).json().totals.received).toBe(1);
  });

  it('reflects a status change immediately', async () => {
    const app = await testApp();
    const reportId = await seedReport(project, { daysAgo: 0, status: 'new' });

    expect((await overview(owner, '?days=7')).json().totals).toMatchObject({ new: 1, resolved: 0 });

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/reports/${reportId}`,
      headers: authHeaders(owner),
      payload: { status: 'resolved' },
    });

    const after = (await overview(owner, '?days=7')).json();
    expect(after.totals).toMatchObject({ received: 1, new: 0, resolved: 1 });
  });

  it('drops a deleted report from every aggregate', async () => {
    const app = await testApp();
    const reportId = await seedReport(project, { daysAgo: 0 });
    await seedReport(project, { daysAgo: 0 });

    expect((await overview(owner, '?days=7')).json().totals.received).toBe(2);

    await app.inject({ method: 'DELETE', url: `/api/v1/reports/${reportId}`, headers: authHeaders(owner) });

    const after = (await overview(owner, '?days=7')).json();
    expect(after.totals.received).toBe(1);
    expect(after.daily.reduce((sum: number, day: { count: number }) => sum + day.count, 0)).toBe(1);
  });

  it('never leaks another owner data', async () => {
    const stranger = await createOwner('stats-stranger@owner.test');
    const strangerProject = await createProject(stranger, 'Stranger site');
    await seedReport(strangerProject, { daysAgo: 0 });
    await seedReport(project, { daysAgo: 0 });

    // Own scope sees only its own report.
    expect((await overview(owner, '?days=7')).json().totals.received).toBe(1);
    expect((await overview(stranger, '?days=7')).json().totals.received).toBe(1);

    // Filtering by someone else's project id is a 404, not an empty chart.
    const cross = await overview(owner, `?days=7&projectId=${strangerProject.id}`);
    expect(cross.statusCode).toBe(404);
  });

  it('rejects an unsupported range and an invalid project id', async () => {
    expect((await overview(owner, '?days=365')).statusCode).toBe(400);
    expect((await overview(owner, '?days=0')).statusCode).toBe(400);
    expect((await overview(owner, '?projectId=not-a-uuid')).statusCode).toBe(400);
  });

  it('requires a session', async () => {
    const app = await testApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/stats/overview' });
    expect(response.statusCode).toBe(401);
  });

  it('returns truthful zeroes and lifetime context for an empty account', async () => {
    const body = (await overview(owner, '?days=7')).json();
    expect(body.totals).toEqual({ received: 0, new: 0, inProgress: 0, resolved: 0 });
    expect(body.daily).toHaveLength(7);
    expect(body.daily.every((day: { count: number }) => day.count === 0)).toBe(true);
    expect(body.recent).toEqual([]);
    // Two projects exist but nothing has ever been reported.
    expect(body.lifetime).toEqual({ reports: 0, projects: 2 });
  });

  it('distinguishes "nothing ever" from "nothing in this window"', async () => {
    await seedReport(project, { daysAgo: 20 });

    const week = (await overview(owner, '?days=7')).json();
    expect(week.totals.received).toBe(0);
    expect(week.lifetime.reports).toBe(1);

    const month = (await overview(owner, '?days=30')).json();
    expect(month.totals.received).toBe(1);
  });
});

describe('projects list metadata', () => {
  beforeEach(resetDatabase);

  it('exposes the primary website and the latest report time', async () => {
    const app = await testApp();
    const owner = await createOwner('projectmeta@owner.test');
    const project = await createProject(owner, 'Meta site', ['https://first.test', 'https://second.test']);

    const before = await app.inject({ method: 'GET', url: '/api/v1/projects', headers: authHeaders(owner) });
    expect(before.json().projects[0]).toMatchObject({
      primaryOrigin: 'https://first.test',
      latestReportAt: null,
    });

    await seedReport(project, { daysAgo: 0 });

    const after = await app.inject({ method: 'GET', url: '/api/v1/projects', headers: authHeaders(owner) });
    expect(after.json().projects[0].latestReportAt).toBeTruthy();
  });
});

describe('report pagination', () => {
  beforeEach(resetDatabase);

  it('reaches reports beyond the first page with the cursor', async () => {
    const app = await testApp();
    const owner = await createOwner('paging@owner.test');
    const project = await createProject(owner, 'Paging site');

    // More than one page, each with a distinct timestamp so ordering is stable.
    for (let index = 0; index < 60; index += 1) {
      await query(
        `INSERT INTO reports (project_id, message, created_at, expires_at)
         VALUES ($1, $2, now() - make_interval(mins => $3::int), now() + interval '90 days')`,
        [project.id, `Paged report number ${index}`, index],
      );
    }

    const first = await app.inject({
      method: 'GET',
      url: `/api/v1/reports?projectId=${project.id}&limit=25`,
      headers: authHeaders(owner),
    });
    expect(first.json().reports).toHaveLength(25);
    expect(first.json().nextBefore).toBeTruthy();

    const seen = new Set<string>(first.json().reports.map((r: { id: string }) => r.id));
    let cursor: string | null = first.json().nextBefore;
    let pages = 1;

    while (cursor && pages < 10) {
      const next = await app.inject({
        method: 'GET',
        url: `/api/v1/reports?projectId=${project.id}&limit=25&before=${encodeURIComponent(cursor)}`,
        headers: authHeaders(owner),
      });
      for (const report of next.json().reports as Array<{ id: string }>) seen.add(report.id);
      cursor = next.json().nextBefore;
      pages += 1;
    }

    // Every seeded report is reachable, with no duplicates across pages.
    expect(seen.size).toBe(60);
  });
});
