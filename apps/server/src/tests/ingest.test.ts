import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../db/pool.ts';
import {
  authHeaders,
  createOwner,
  createProject,
  makeJpeg,
  makePng,
  multipart,
  resetDatabase,
  testApp,
  type OwnerSession,
  type TestProject,
} from './helpers.ts';

const ORIGIN = 'https://site.test';

async function submit(
  project: TestProject,
  fields: Record<string, string>,
  options: { origin?: string | null; file?: { filename: string; contentType: string; data: Buffer } } = {},
) {
  const app = await testApp();
  const body = multipart(
    fields,
    options.file ? { field: 'screenshot', ...options.file } : undefined,
  );
  const headers: Record<string, string> = { ...body.headers };
  const origin = options.origin === undefined ? ORIGIN : options.origin;
  if (origin) headers.origin = origin;
  return app.inject({
    method: 'POST',
    url: `/api/v1/widget/${project.publicKey}/reports`,
    headers,
    payload: body.payload,
  });
}

describe('widget configuration endpoint', () => {
  let owner: OwnerSession;
  let project: TestProject;

  beforeEach(async () => {
    await resetDatabase();
    owner = await createOwner('config@owner.test');
    project = await createProject(owner, 'Config site', [ORIGIN]);
  });

  it('serves public configuration and no owner data', async () => {
    const app = await testApp();
    const response = await app.inject({ method: 'GET', url: `/api/v1/widget/${project.publicKey}/config` });
    expect(response.statusCode).toBe(200);

    const config = response.json().config;
    expect(config.projectKey).toBe(project.publicKey);
    expect(config.status).toBe('active');
    expect(config.appearance.launcherText).toBe('Report a problem');
    expect(JSON.stringify(config)).not.toContain('config@owner.test');
    expect(response.headers['cache-control']).toMatch(/max-age=\d+/);
    expect(response.headers.etag).toBeTruthy();
  });

  it('returns 404 for an unknown key and 400 for a malformed one', async () => {
    const app = await testApp();
    const unknown = await app.inject({
      method: 'GET',
      url: '/api/v1/widget/bi_pub_00000000000000000000000000000000/config',
    });
    expect(unknown.statusCode).toBe(404);

    const malformed = await app.inject({ method: 'GET', url: '/api/v1/widget/not-a-key/config' });
    expect(malformed.statusCode).toBe(400);
  });

  it('reflects configuration changes and bumps the version', async () => {
    const app = await testApp();
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${project.id}`,
      headers: authHeaders(owner),
      payload: { appearance: { launcherText: 'Found a bug?', accentColor: '#112233' } },
    });

    const response = await app.inject({ method: 'GET', url: `/api/v1/widget/${project.publicKey}/config` });
    const config = response.json().config;
    expect(config.appearance.launcherText).toBe('Found a bug?');
    expect(config.appearance.accentColor).toBe('#112233');
    expect(config.configVersion).toBeGreaterThan(1);
  });
});

describe('report ingestion', () => {
  let owner: OwnerSession;
  let project: TestProject;

  beforeEach(async () => {
    await resetDatabase();
    owner = await createOwner('ingest@owner.test');
    project = await createProject(owner, 'Ingest site', [ORIGIN]);
  });

  it('accepts a report and records notification intent in the same transaction', async () => {
    const response = await submit(project, {
      message: 'The pricing table overlaps the footer on a narrow window.',
      email: 'reporter@reporter.test',
      pageUrl: 'https://site.test/pricing?token=secret#section',
      browser: JSON.stringify({ userAgent: 'test', viewportWidth: 1200, viewportHeight: 800, device: 'desktop' }),
    });

    expect(response.statusCode).toBe(201);
    const reportId = response.json().id as string;

    const { rows } = await query<{ page_url: string; reporter_email: string; message: string }>(
      'SELECT page_url, reporter_email, message FROM reports WHERE id = $1',
      [reportId],
    );
    // Query string and fragment are stripped before storage.
    expect(rows[0]?.page_url).toBe('https://site.test/pricing');
    expect(rows[0]?.reporter_email).toBe('reporter@reporter.test');

    const outbox = await query('SELECT status FROM notification_outbox WHERE report_id = $1', [reportId]);
    expect(outbox.rowCount).toBe(1);
    expect(outbox.rows[0]?.status).toBe('pending');
  });

  it('refuses a report with no Origin header or a disallowed one', async () => {
    const missing = await submit(project, { message: 'No origin header at all here' }, { origin: null });
    expect(missing.statusCode).toBe(403);
    expect(missing.json().error.code).toBe('origin_missing');

    const wrong = await submit(project, { message: 'Wrong origin on this request' }, { origin: 'https://evil.test' });
    expect(wrong.statusCode).toBe(403);
    expect(wrong.json().error.code).toBe('origin_not_allowed');
  });

  it('treats a different port as a different origin', async () => {
    const app = await testApp();
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${project.id}`,
      headers: authHeaders(owner),
      payload: { origins: ['http://localhost:5173'] },
    });

    const other = await submit(project, { message: 'From a different local port' }, { origin: 'http://localhost:3000' });
    expect(other.statusCode).toBe(403);

    const exact = await submit(project, { message: 'From the configured local port' }, { origin: 'http://localhost:5173' });
    expect(exact.statusCode).toBe(201);
  });

  it('rejects submissions while the project is paused, whatever the client believes', async () => {
    const app = await testApp();
    // A client caches this configuration while the project is still active.
    const cached = await app.inject({ method: 'GET', url: `/api/v1/widget/${project.publicKey}/config` });
    expect(cached.json().config.status).toBe('active');

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${project.id}`,
      headers: authHeaders(owner),
      payload: { status: 'paused' },
    });

    const response = await submit(project, { message: 'Submitted with stale cached configuration' });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('project_paused');

    const stored = await query('SELECT count(*)::int AS count FROM reports WHERE project_id = $1', [project.id]);
    expect(stored.rows[0]?.count).toBe(0);
  });

  it('rejects a report from an excluded page', async () => {
    const app = await testApp();
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${project.id}`,
      headers: authHeaders(owner),
      payload: { rules: [{ kind: 'exclude', pattern: '/admin/*' }] },
    });

    const blocked = await submit(project, {
      message: 'Trying to report from the admin area',
      pageUrl: 'https://site.test/admin/users',
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('page_not_eligible');

    const allowed = await submit(project, {
      message: 'Reporting from an ordinary page instead',
      pageUrl: 'https://site.test/pricing',
    });
    expect(allowed.statusCode).toBe(201);
  });

  it('collapses duplicate submissions that share a dedupe key', async () => {
    const fields = { message: 'Double click sends this twice', dedupeKey: 'dedupe-abc-123' };
    const first = await submit(project, fields);
    const second = await submit(project, fields);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().duplicate).toBe(true);
    expect(second.json().id).toBe(first.json().id);

    const count = await query('SELECT count(*)::int AS count FROM reports WHERE project_id = $1', [project.id]);
    expect(count.rows[0]?.count).toBe(1);

    const outbox = await query('SELECT count(*)::int AS count FROM notification_outbox');
    expect(outbox.rows[0]?.count).toBe(1);
  });

  it('does not collect a page URL when the owner turned that off', async () => {
    const app = await testApp();
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${project.id}`,
      headers: authHeaders(owner),
      payload: { collectPageUrl: false },
    });

    const response = await submit(project, {
      message: 'The URL should not be stored for this one',
      pageUrl: 'https://site.test/invoices/secret-slug',
      pageContext: 'Invoice screen',
    });
    expect(response.statusCode).toBe(201);

    const { rows } = await query<{ page_url: string | null; page_context: string | null }>(
      'SELECT page_url, page_context FROM reports WHERE id = $1',
      [response.json().id],
    );
    expect(rows[0]?.page_url).toBeNull();
    expect(rows[0]?.page_context).toBe('Invoice screen');
  });

  it('validates the message and the optional email', async () => {
    const tooShort = await submit(project, { message: 'hi' });
    expect(tooShort.statusCode).toBe(400);

    const badEmail = await submit(project, { message: 'A perfectly fine description', email: 'not-an-email' });
    expect(badEmail.statusCode).toBe(400);

    const tooLong = await submit(project, { message: 'x'.repeat(9000) });
    expect(tooLong.statusCode).toBe(400);
  });

  it('rejects an oversized JSON body', async () => {
    const app = await testApp();
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/widget/${project.publicKey}/reports`,
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      payload: JSON.stringify({ message: 'x'.repeat(64 * 1024) }),
    });
    expect([400, 413]).toContain(response.statusCode);
  });

  it('applies a per-IP rate limit and says when to retry', async () => {
    const responses = [];
    for (let i = 0; i < 12; i += 1) {
      responses.push(await submit(project, { message: `Rate limit probe number ${i}` }));
    }
    const limited = responses.filter((r) => r.statusCode === 429);
    expect(limited.length).toBeGreaterThan(0);
    expect(limited[0]?.headers['retry-after']).toBeTruthy();
    expect(limited[0]?.json().error.code).toBe('rate_limited');
  });
});

describe('screenshot handling', () => {
  let owner: OwnerSession;
  let project: TestProject;

  beforeEach(async () => {
    await resetDatabase();
    owner = await createOwner('shots@owner.test');
    project = await createProject(owner, 'Screenshot site', [ORIGIN]);
  });

  it('stores a valid PNG and a valid JPEG', async () => {
    for (const [name, data, contentType] of [
      ['shot.png', await makePng(64, 48), 'image/png'],
      ['shot.jpg', await makeJpeg(64, 48), 'image/jpeg'],
    ] as const) {
      const response = await submit(
        project,
        { message: `Screenshot attached from ${name}`, dedupeKey: `screenshot-${name.replace('.', '-')}` },
        { file: { filename: name, contentType, data } },
      );
      expect(response.statusCode, name).toBe(201);
    }

    const { rows } = await query<{ mime_type: string; width: number; height: number }>(
      'SELECT mime_type, width, height FROM attachments ORDER BY created_at',
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.mime_type).sort()).toEqual(['image/jpeg', 'image/png']);
    expect(rows[0]?.width).toBe(64);
  });

  it('rejects a file whose content is not an image, whatever it claims to be', async () => {
    const response = await submit(
      project,
      { message: 'This attachment is a script pretending to be a PNG' },
      { file: { filename: 'evil.png', contentType: 'image/png', data: Buffer.from('<script>alert(1)</script>') } },
    );
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toMatch(/^image_/);

    const attachments = await query('SELECT count(*)::int AS count FROM attachments');
    expect(attachments.rows[0]?.count).toBe(0);
    const reports = await query('SELECT count(*)::int AS count FROM reports');
    expect(reports.rows[0]?.count).toBe(0);
  });

  it('rejects an unsupported image format', async () => {
    const webp = await (await import('sharp'))
      .default({ create: { width: 20, height: 20, channels: 3, background: '#fff' } })
      .webp()
      .toBuffer();

    const response = await submit(
      project,
      { message: 'A WebP screenshot, which is not accepted' },
      { file: { filename: 'shot.webp', contentType: 'image/webp', data: webp } },
    );
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('image_unsupported_format');
  });

  it('rejects an oversized upload', async () => {
    // Random noise does not compress, so this comfortably exceeds 5 MiB.
    const huge = Buffer.alloc(6 * 1024 * 1024);
    for (let i = 0; i < huge.length; i += 4) huge.writeUInt32LE((Math.random() * 0xffffffff) >>> 0, i);

    const response = await submit(
      project,
      { message: 'An attachment far larger than the documented limit' },
      { file: { filename: 'huge.png', contentType: 'image/png', data: huge } },
    );
    expect([400, 413]).toContain(response.statusCode);

    const attachments = await query('SELECT count(*)::int AS count FROM attachments');
    expect(attachments.rows[0]?.count).toBe(0);
  });

  it('strips image metadata by re-encoding', async () => {
    const sharp = (await import('sharp')).default;
    const withExif = await sharp({ create: { width: 30, height: 30, channels: 3, background: '#0af' } })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'SECRET-LOCATION-MARKER' } } })
      .toBuffer();
    expect(withExif.includes(Buffer.from('SECRET-LOCATION-MARKER'))).toBe(true);

    const response = await submit(
      project,
      { message: 'A screenshot that arrived carrying EXIF metadata' },
      { file: { filename: 'exif.jpg', contentType: 'image/jpeg', data: withExif } },
    );
    expect(response.statusCode).toBe(201);

    const app = await testApp();
    const download = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/${response.json().id}/screenshot`,
      headers: authHeaders(owner),
    });
    expect(download.statusCode).toBe(200);
    expect(download.rawPayload.includes(Buffer.from('SECRET-LOCATION-MARKER'))).toBe(false);
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(download.headers['content-disposition']).toMatch(/^inline;/);
  });
});
