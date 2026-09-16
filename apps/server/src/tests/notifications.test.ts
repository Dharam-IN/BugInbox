import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../db/pool.ts';
import { processNotification, sweepNotifications } from '../notifications.ts';
import { authHeaders, createOwner, createProject, multipart, resetDatabase, testApp } from './helpers.ts';

const MAILPIT = `http://127.0.0.1:${process.env.BUGINBOX_MAILPIT_PORT ?? '58025'}`;

interface MailpitMessage {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
  Snippet: string;
}

async function mailpitSearch(query: string): Promise<MailpitMessage[]> {
  const response = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(query)}&limit=50`);
  if (!response.ok) throw new Error(`Mailpit search failed: ${response.status}`);
  return ((await response.json()) as { messages: MailpitMessage[] }).messages ?? [];
}

async function mailpitAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${MAILPIT}/api/v1/info`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function ingest(publicKey: string, message: string, dedupeKey?: string) {
  const app = await testApp();
  const body = multipart(dedupeKey ? { message, dedupeKey } : { message });
  return app.inject({
    method: 'POST',
    url: `/api/v1/widget/${publicKey}/reports`,
    headers: { ...body.headers, origin: 'https://site.test' },
    payload: body.payload,
  });
}

describe('recoverable notifications', () => {
  beforeEach(resetDatabase);

  it('writes the outbox entry inside the report transaction', async () => {
    const owner = await createOwner('notify@owner.test');
    const project = await createProject(owner, 'Notify site');
    const response = await ingest(project.publicKey, 'A report that should produce exactly one notification');
    expect(response.statusCode).toBe(201);

    const { rows } = await query<{ report_id: string; status: string; attempts: number }>(
      'SELECT report_id, status, attempts FROM notification_outbox',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.report_id).toBe(response.json().id);
    expect(rows[0]?.status).toBe('pending');
    expect(rows[0]?.attempts).toBe(0);
  });

  it('writes no notification intent when the owner disabled email', async () => {
    const app = await testApp();
    const owner = await createOwner('quiet@owner.test');
    const project = await createProject(owner, 'Quiet site');
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${project.id}`,
      headers: authHeaders(owner),
      payload: { notifyEmailEnabled: false },
    });

    const response = await ingest(project.publicKey, 'A report for a project with notifications turned off');
    expect(response.statusCode).toBe(201);

    const outbox = await query('SELECT count(*)::int AS count FROM notification_outbox');
    expect(outbox.rows[0]?.count).toBe(0);
  });

  it('will not process the same entry twice concurrently', async () => {
    const owner = await createOwner('once@owner.test');
    const project = await createProject(owner, 'Once site');
    await ingest(project.publicKey, 'A report used to check that the outbox lease holds');

    const { rows } = await query<{ id: string }>('SELECT id FROM notification_outbox');
    const id = rows[0]!.id;

    const outcomes = await Promise.all([processNotification(id), processNotification(id)]);
    // Exactly one worker claims the lease; the other finds nothing to do.
    expect(outcomes.filter((outcome) => outcome === 'not_claimable')).toHaveLength(1);

    const after = await query<{ status: string }>('SELECT status FROM notification_outbox WHERE id = $1', [id]);
    expect(['sent', 'pending']).toContain(after.rows[0]?.status);
  });

  it('marks an entry sent and leaves nothing due, so a re-sweep sends no duplicate', async () => {
    if (!(await mailpitAvailable())) {
      throw new Error('Mailpit is not reachable on 127.0.0.1:58025; start the compose stack before running tests.');
    }

    // A unique address per run keeps this independent of Mailpit's history.
    const address = `deliver-${Date.now()}@owner.test`;
    const owner = await createOwner(address);
    const project = await createProject(owner, 'Delivery site');
    await ingest(project.publicKey, 'A report that should produce exactly one notification email');

    const processed = await sweepNotifications();
    expect(processed).toBe(1);

    const { rows } = await query<{ status: string; attempts: number }>('SELECT status, attempts FROM notification_outbox');
    expect(rows[0]?.status).toBe('sent');

    // A second sweep must find nothing due and send nothing.
    expect(await sweepNotifications()).toBe(0);

    // The address also received a signup confirmation, so filter to the report.
    const messages = await mailpitSearch(address);
    const notifications = messages.filter((message) => message.Subject.startsWith('New report in'));
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.Subject).toContain('Delivery site');
  });

  it('creates only one notification for a de-duplicated submission', async () => {
    const owner = await createOwner('dupe@owner.test');
    const project = await createProject(owner, 'Dupe site');
    const message = 'A report submitted twice because the reporter double clicked';
    await ingest(project.publicKey, message, 'notify-dedupe-001');
    await ingest(project.publicKey, message, 'notify-dedupe-001');

    const outbox = await query('SELECT count(*)::int AS count FROM notification_outbox');
    expect(outbox.rows[0]?.count).toBe(1);
  });

  it('recovers entries left behind by a crashed or offline dispatcher', async () => {
    const owner = await createOwner('recover@owner.test');
    const project = await createProject(owner, 'Recovery site');
    await ingest(project.publicKey, 'A report whose queue dispatch never happened');

    // Simulate an attempt that died after claiming but before sending: the lease
    // is in the past again, so the sweeper must pick it up.
    await query(
      `UPDATE notification_outbox SET attempts = 1, next_attempt_at = now() - interval '5 minutes', last_error = 'simulated crash'`,
    );

    const processed = await sweepNotifications();
    expect(processed).toBe(1);

    const { rows } = await query<{ status: string }>('SELECT status FROM notification_outbox');
    expect(rows[0]?.status).toBe('sent');
  });
});
