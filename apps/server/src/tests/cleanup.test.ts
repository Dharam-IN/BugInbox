import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../db/pool.ts';
import { purgeExpiredReports, sweepDetachedAttachments, sweepOrphanFiles } from '../maintenance.ts';
import { getStorage } from '../storage/index.ts';
import {
  authHeaders,
  createOwner,
  createProject,
  makePng,
  multipart,
  resetDatabase,
  testApp,
  type OwnerSession,
  type TestProject,
} from './helpers.ts';

async function submitWithScreenshot(project: TestProject, message: string, dedupeKey: string) {
  const app = await testApp();
  const body = multipart(
    { message, dedupeKey },
    { field: 'screenshot', filename: 'shot.png', contentType: 'image/png', data: await makePng() },
  );
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/widget/${project.publicKey}/reports`,
    headers: { ...body.headers, origin: 'https://site.test' },
    payload: body.payload,
  });
  if (response.statusCode !== 201) throw new Error(`ingest failed: ${response.body}`);
  return response.json().id as string;
}

async function storageKeyFor(reportId: string): Promise<string> {
  const { rows } = await query<{ storage_key: string }>(
    'SELECT a.storage_key FROM reports r JOIN attachments a ON a.id = r.attachment_id WHERE r.id = $1',
    [reportId],
  );
  return rows[0]!.storage_key;
}

describe('deletion and cleanup', () => {
  let owner: OwnerSession;
  let project: TestProject;

  beforeEach(async () => {
    await resetDatabase();
    owner = await createOwner('cleanup@owner.test');
    project = await createProject(owner, 'Cleanup site');
  });

  it('removes the screenshot file when a report is deleted', async () => {
    const app = await testApp();
    const reportId = await submitWithScreenshot(project, 'A report with a screenshot to delete', 'cleanup-0001');
    const key = await storageKeyFor(reportId);
    expect(await getStorage().exists(key)).toBe(true);

    const usageBefore = await query<{ report_count: number; storage_bytes: number }>(
      'SELECT report_count, storage_bytes FROM project_usage WHERE project_id = $1',
      [project.id],
    );
    expect(usageBefore.rows[0]?.report_count).toBe(1);
    expect(usageBefore.rows[0]?.storage_bytes).toBeGreaterThan(0);

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/reports/${reportId}`,
      headers: authHeaders(owner),
    });
    expect(response.statusCode).toBe(200);

    expect(await getStorage().exists(key)).toBe(false);
    const attachments = await query('SELECT count(*)::int AS count FROM attachments');
    expect(attachments.rows[0]?.count).toBe(0);

    const usageAfter = await query<{ report_count: number; storage_bytes: number }>(
      'SELECT report_count, storage_bytes FROM project_usage WHERE project_id = $1',
      [project.id],
    );
    expect(usageAfter.rows[0]?.report_count).toBe(0);
    expect(usageAfter.rows[0]?.storage_bytes).toBe(0);
  });

  it('removes every report, attachment and file when a project is deleted', async () => {
    const app = await testApp();
    const first = await submitWithScreenshot(project, 'First report in a project being deleted', 'cleanup-0002');
    const second = await submitWithScreenshot(project, 'Second report in a project being deleted', 'cleanup-0003');
    const keys = [await storageKeyFor(first), await storageKeyFor(second)];

    const wrongName = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${project.id}`,
      headers: authHeaders(owner),
      payload: { confirmName: 'not the name' },
    });
    expect(wrongName.statusCode).toBe(400);
    expect(wrongName.json().error.code).toBe('confirmation_mismatch');

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${project.id}`,
      headers: authHeaders(owner),
      payload: { confirmName: project.name },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().deletedAttachments).toBe(2);

    for (const key of keys) expect(await getStorage().exists(key)).toBe(false);
    for (const table of ['reports', 'attachments', 'notification_outbox', 'project_origins', 'project_path_rules']) {
      const { rows } = await query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`);
      expect(rows[0]?.count, table).toBe(0);
    }
  });

  it('purges reports past their retention window, with their files', async () => {
    const reportId = await submitWithScreenshot(project, 'An old report past its retention window', 'cleanup-0004');
    const key = await storageKeyFor(reportId);

    await query(`UPDATE reports SET expires_at = now() - interval '1 day' WHERE id = $1`, [reportId]);

    const result = await purgeExpiredReports();
    expect(result.reports).toBe(1);
    expect(result.attachments).toBe(1);
    expect(await getStorage().exists(key)).toBe(false);

    const remaining = await query('SELECT count(*)::int AS count FROM reports');
    expect(remaining.rows[0]?.count).toBe(0);
  });

  it('removes files on disk that no attachment row references', async () => {
    const storage = getStorage();
    const orphanKey = `${project.id}/209901/${'a'.repeat(32)}.png`;
    await storage.put(orphanKey, await makePng(10, 10));
    expect(await storage.exists(orphanKey)).toBe(true);

    const removed = await sweepOrphanFiles();
    expect(removed).toBe(1);
    expect(await storage.exists(orphanKey)).toBe(false);
  });

  it('removes attachments whose report has gone', async () => {
    const reportId = await submitWithScreenshot(project, 'A report about to lose its row', 'cleanup-0005');
    const key = await storageKeyFor(reportId);

    // Simulate a report row disappearing without going through the API.
    await query('DELETE FROM reports WHERE id = $1', [reportId]);
    await query(`UPDATE attachments SET created_at = now() - interval '2 hours'`);

    const removed = await sweepDetachedAttachments();
    expect(removed).toBe(1);
    expect(await getStorage().exists(key)).toBe(false);
  });

  it('keeps storage keys inside the storage root', async () => {
    const storage = getStorage();
    await expect(storage.put('../escape.png', Buffer.from('x'))).rejects.toThrow();
    expect(() => storage.createReadStream('../../etc/passwd')).toThrow();
  });
});

describe('report management', () => {
  let owner: OwnerSession;
  let project: TestProject;

  beforeEach(async () => {
    await resetDatabase();
    owner = await createOwner('manage@owner.test');
    project = await createProject(owner, 'Manage site');
  });

  it('moves a report through the three statuses', async () => {
    const app = await testApp();
    const reportId = await submitWithScreenshot(project, 'A report to move through its statuses', 'manage-0001');

    for (const status of ['in_progress', 'resolved', 'new'] as const) {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/reports/${reportId}`,
        headers: authHeaders(owner),
        payload: { status },
      });
      expect(response.statusCode).toBe(200);

      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/reports/${reportId}`,
        headers: authHeaders(owner),
      });
      expect(detail.json().report.status).toBe(status);
    }
  });

  it('rejects an unknown status', async () => {
    const app = await testApp();
    const reportId = await submitWithScreenshot(project, 'A report used to check status validation', 'manage-0002');
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/reports/${reportId}`,
      headers: authHeaders(owner),
      payload: { status: 'wontfix' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('filters the inbox by status and counts each bucket', async () => {
    const app = await testApp();
    const first = await submitWithScreenshot(project, 'First report for the inbox filter test', 'manage-0003');
    await submitWithScreenshot(project, 'Second report for the inbox filter test', 'manage-0004');
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/reports/${first}`,
      headers: authHeaders(owner),
      payload: { status: 'resolved' },
    });

    const resolved = await app.inject({
      method: 'GET',
      url: `/api/v1/reports?projectId=${project.id}&status=resolved`,
      headers: authHeaders(owner),
    });
    expect(resolved.json().reports).toHaveLength(1);

    const counts = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/counts?projectId=${project.id}`,
      headers: authHeaders(owner),
    });
    expect(counts.json().counts).toMatchObject({ new: 1, resolved: 1, total: 2 });
  });
});
