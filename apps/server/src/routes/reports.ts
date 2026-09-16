import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.ts';
import { notFound } from '../lib/errors.ts';
import { logger } from '../lib/logger.ts';
import { getStorage } from '../storage/index.ts';

interface ReportRow {
  id: string;
  project_id: string;
  project_name: string;
  status: 'new' | 'in_progress' | 'resolved';
  message: string;
  reporter_email: string | null;
  page_url: string | null;
  page_context: string | null;
  browser: Record<string, unknown>;
  attachment_id: string | null;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
}

function serialise(row: ReportRow, summary = false) {
  const base = {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    status: row.status,
    reporterEmail: row.reporter_email,
    pageUrl: row.page_url,
    pageContext: row.page_context,
    hasScreenshot: row.attachment_id !== null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
  };
  if (summary) {
    return {
      ...base,
      excerpt: row.message.length > 180 ? `${row.message.slice(0, 180)}...` : row.message,
    };
  }
  return { ...base, message: row.message, browser: row.browser };
}

export default async function reportRoutes(app: FastifyInstance) {
  app.get('/', async (request) => {
    const session = app.requireOwner(request);
    const params = z
      .object({
        projectId: z.string().uuid().optional(),
        status: z.enum(['new', 'in_progress', 'resolved']).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
        before: z.string().datetime().optional(),
      })
      .parse(request.query);

    const values: unknown[] = [session.owner.id];
    const where = ['p.owner_id = $1'];
    if (params.projectId) {
      values.push(params.projectId);
      where.push(`r.project_id = $${values.length}`);
    }
    if (params.status) {
      values.push(params.status);
      where.push(`r.status = $${values.length}`);
    }
    if (params.before) {
      values.push(params.before);
      where.push(`r.created_at < $${values.length}`);
    }
    values.push(params.limit + 1);

    const { rows } = await query<ReportRow>(
      `SELECT r.*, p.name AS project_name
         FROM reports r JOIN projects p ON p.id = r.project_id
        WHERE ${where.join(' AND ')}
        ORDER BY r.created_at DESC
        LIMIT $${values.length}`,
      values,
    );

    const page = rows.slice(0, params.limit);
    return {
      reports: page.map((row) => serialise(row, true)),
      nextBefore: rows.length > params.limit ? page.at(-1)?.created_at.toISOString() ?? null : null,
    };
  });

  app.get('/counts', async (request) => {
    const session = app.requireOwner(request);
    const params = z.object({ projectId: z.string().uuid().optional() }).parse(request.query);
    const values: unknown[] = [session.owner.id];
    let filter = '';
    if (params.projectId) {
      values.push(params.projectId);
      filter = ` AND r.project_id = $${values.length}`;
    }
    const { rows } = await query<{ status: string; count: number }>(
      `SELECT r.status, count(*)::int AS count
         FROM reports r JOIN projects p ON p.id = r.project_id
        WHERE p.owner_id = $1${filter}
        GROUP BY r.status`,
      values,
    );
    const counts = { new: 0, in_progress: 0, resolved: 0, total: 0 };
    for (const row of rows) {
      counts[row.status as keyof typeof counts] = row.count;
      counts.total += row.count;
    }
    return { counts };
  });

  app.get('/:id', async (request) => {
    const session = app.requireOwner(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { rows } = await query<ReportRow>(
      `SELECT r.*, p.name AS project_name
         FROM reports r JOIN projects p ON p.id = r.project_id
        WHERE r.id = $1 AND p.owner_id = $2`,
      [id, session.owner.id],
    );
    const row = rows[0];
    if (!row) throw notFound('That report does not exist.');
    return { report: serialise(row) };
  });

  app.patch('/:id', async (request) => {
    const session = app.requireOwner(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ status: z.enum(['new', 'in_progress', 'resolved']) }).parse(request.body);
    const { rows } = await query<{ id: string }>(
      `UPDATE reports r SET status = $3, updated_at = now()
         FROM projects p
        WHERE r.id = $1 AND p.id = r.project_id AND p.owner_id = $2
        RETURNING r.id`,
      [id, session.owner.id, body.status],
    );
    if (!rows[0]) throw notFound('That report does not exist.');
    return { ok: true, status: body.status };
  });

  app.delete('/:id', async (request) => {
    const session = app.requireOwner(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const removed = await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string; project_id: string; attachment_id: string | null }>(
        `DELETE FROM reports r
          USING projects p
          WHERE r.id = $1 AND p.id = r.project_id AND p.owner_id = $2
          RETURNING r.id, r.project_id, r.attachment_id`,
        [id, session.owner.id],
      );
      const report = rows[0];
      if (!report) return null;

      await client.query(
        `UPDATE project_usage SET report_count = GREATEST(0, report_count - 1), updated_at = now()
          WHERE project_id = $1`,
        [report.project_id],
      );

      let storageKey: string | null = null;
      if (report.attachment_id) {
        const { rows: attachments } = await client.query<{ storage_key: string; byte_size: number }>(
          'DELETE FROM attachments WHERE id = $1 RETURNING storage_key, byte_size',
          [report.attachment_id],
        );
        const attachment = attachments[0];
        if (attachment) {
          storageKey = attachment.storage_key;
          await client.query(
            `UPDATE project_usage SET storage_bytes = GREATEST(0, storage_bytes - $2), updated_at = now()
              WHERE project_id = $1`,
            [report.project_id, attachment.byte_size],
          );
        }
      }
      return { storageKey, projectId: report.project_id };
    });

    if (!removed) throw notFound('That report does not exist.');
    if (removed.storageKey) {
      await getStorage()
        .remove(removed.storageKey)
        .catch((err) => logger.warn({ msg: 'could not remove attachment file', err: String(err) }));
    }
    logger.info({ msg: 'report deleted', reportId: id, ownerId: session.owner.id });
    return { ok: true };
  });

  app.get('/:id/screenshot', async (request, reply) => {
    const session = app.requireOwner(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { rows } = await query<{ storage_key: string; mime_type: string; byte_size: number }>(
      `SELECT a.storage_key, a.mime_type, a.byte_size
         FROM reports r
         JOIN projects p ON p.id = r.project_id
         JOIN attachments a ON a.id = r.attachment_id
        WHERE r.id = $1 AND p.owner_id = $2`,
      [id, session.owner.id],
    );
    const attachment = rows[0];
    if (!attachment) throw notFound('That screenshot does not exist.');
    if (!(await getStorage().exists(attachment.storage_key))) {
      throw notFound('That screenshot is no longer stored.');
    }

    return reply
      .header('content-type', attachment.mime_type)
      .header('content-length', String(attachment.byte_size))
      .header('content-disposition', `inline; filename="screenshot-${id}.${attachment.mime_type === 'image/png' ? 'png' : 'jpg'}"`)
      .header('cache-control', 'private, max-age=0, no-store')
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; sandbox")
      .send(getStorage().createReadStream(attachment.storage_key));
  });
}
