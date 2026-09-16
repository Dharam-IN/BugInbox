import type { FastifyInstance, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import {
  MESSAGE_MAX_LENGTH,
  MESSAGE_MIN_LENGTH,
  REPORTER_EMAIL_MAX_LENGTH,
  evaluateEligibility,
  type PathRule,
} from '@buginbox/shared';
import { config } from '../config.ts';
import { query, withTransaction } from '../db/pool.ts';
import { AppError, badRequest, notFound, tooLarge, tooManyRequests } from '../lib/errors.ts';
import { ImageRejected, processScreenshot } from '../lib/image.ts';
import { logger } from '../lib/logger.ts';
import { sanitiseMessage, sanitisePageContext, sanitisePageUrl } from '../lib/pageUrl.ts';
import { allowedOriginsForKey, extractProjectKey } from '../lib/projectCache.ts';
import { loadRules, serialiseWidgetConfig, type ProjectRow } from '../lib/projects.ts';
import { consume, ingestSpecs } from '../lib/rateLimit.ts';
import { clientIp } from '../lib/request.ts';
import { enqueueNotification } from '../queue.ts';
import { generateStorageKey, getStorage } from '../storage/index.ts';

const keySchema = z.object({ key: z.string().regex(/^bi_pub_[0-9a-f]{32}$/) });

const browserSchema = z
  .object({
    userAgent: z.string().max(400).optional(),
    viewportWidth: z.number().int().min(0).max(20000).optional(),
    viewportHeight: z.number().int().min(0).max(20000).optional(),
    devicePixelRatio: z.number().min(0).max(10).optional(),
    language: z.string().max(35).optional(),
    timezone: z.string().max(60).optional(),
    device: z.enum(['desktop', 'mobile']).optional(),
  })
  .strict();

const submissionSchema = z.object({
  message: z.string().min(MESSAGE_MIN_LENGTH).max(MESSAGE_MAX_LENGTH * 2),
  email: z.string().trim().toLowerCase().email().max(REPORTER_EMAIL_MAX_LENGTH).optional(),
  pageUrl: z.string().max(4096).optional(),
  pageContext: z.string().max(400).optional(),
  dedupeKey: z
    .string()
    .regex(/^[0-9a-zA-Z_-]{8,64}$/, 'Invalid submission key.')
    .optional(),
  browser: browserSchema.optional(),
});

interface ProjectLookup {
  project: ProjectRow;
  origins: string[];
  rules: PathRule[];
  reportCount: number;
  storageBytes: number;
}

async function lookupProject(publicKey: string): Promise<ProjectLookup | null> {
  const { rows } = await query<ProjectRow & { report_count: number | null; storage_bytes: number | null }>(
    `SELECT p.*, u.report_count, u.storage_bytes
       FROM projects p LEFT JOIN project_usage u ON u.project_id = p.id
      WHERE p.public_key = $1`,
    [publicKey],
  );
  const project = rows[0];
  if (!project) return null;
  const [origins, rules] = await Promise.all([
    query<{ origin: string }>('SELECT origin FROM project_origins WHERE project_id = $1', [project.id]),
    loadRules(project.id),
  ]);
  return {
    project,
    origins: origins.rows.map((r) => r.origin),
    rules,
    reportCount: Number(project.report_count ?? 0),
    storageBytes: Number(project.storage_bytes ?? 0),
  };
}

function requireAllowedOrigin(request: FastifyRequest, origins: string[]): void {
  const origin = request.headers.origin;
  if (!origin) {
    throw new AppError(
      403,
      'origin_missing',
      'Reports must be submitted from a browser page on an allowed website origin.',
    );
  }
  if (!origins.includes(origin)) {
    throw new AppError(403, 'origin_not_allowed', 'This website origin is not allowed for this project.');
  }
}

/** Collect multipart fields and the single optional screenshot into memory. */
async function readMultipart(
  request: FastifyRequest,
): Promise<{ fields: Record<string, string>; file: Buffer | null; fileTruncated: boolean }> {
  const fields: Record<string, string> = {};
  let file: Buffer | null = null;
  let fileTruncated = false;

  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (part.fieldname !== 'screenshot' || file !== null) {
        await part.toBuffer().catch(() => undefined);
        continue;
      }
      const buffer = await part.toBuffer();
      if (part.file.truncated) fileTruncated = true;
      file = buffer;
    } else if (typeof part.value === 'string' && part.value.length <= 8192) {
      fields[part.fieldname] = part.value;
    }
  }
  return { fields, file, fileTruncated };
}

export default async function widgetRoutes(app: FastifyInstance) {
  const specs = ingestSpecs();

  // CORS is decided per request from the project's exact origin allowlist.
  // No credentials are ever involved: the widget sends no cookies.
  await app.register(cors, () => async (request: FastifyRequest, done: (err: Error | null, options?: unknown) => void) => {
    const key = extractProjectKey(request.url);
    const origins = key ? await allowedOriginsForKey(key) : [];
    done(null, {
      origin: origins.length > 0 ? origins : false,
      credentials: false,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['content-type'],
      maxAge: 600,
    });
  });

  app.get('/:key/config', async (request, reply) => {
    const { key } = keySchema.parse(request.params);
    const limit = await consume(specs.config, clientIp(request));
    if (!limit.allowed) throw tooManyRequests('Too many requests.', limit.retryAfterSeconds);

    const found = await lookupProject(key);
    if (!found) throw notFound('Unknown project key.');

    const body = serialiseWidgetConfig(found.project, found.rules);
    return reply
      .header('cache-control', `public, max-age=${config().WIDGET_CONFIG_CACHE_S}`)
      .header('etag', `W/"${found.project.id}-${found.project.config_version}"`)
      .send({ config: body });
  });

  app.post('/:key/reports', async (request, reply) => {
    const { key } = keySchema.parse(request.params);
    const cfg = config();
    const ip = clientIp(request);

    const ipLimit = await consume(specs.perIp, `${key}:${ip}`);
    if (!ipLimit.allowed) {
      reply.header('retry-after', String(ipLimit.retryAfterSeconds));
      throw tooManyRequests('You have sent several reports already. Please try again later.', ipLimit.retryAfterSeconds);
    }

    const found = await lookupProject(key);
    if (!found) throw notFound('Unknown project key.');
    requireAllowedOrigin(request, found.origins);

    // Pause is enforced here, on the server, even when a browser still holds a
    // cached configuration that says the project is active.
    if (found.project.status !== 'active') {
      throw new AppError(409, 'project_paused', 'This project is not accepting reports right now.');
    }

    const projectLimit = await consume(specs.perProject, key);
    if (!projectLimit.allowed) {
      reply.header('retry-after', String(projectLimit.retryAfterSeconds));
      throw tooManyRequests('This project is receiving too many reports right now.', projectLimit.retryAfterSeconds);
    }

    if (found.reportCount >= cfg.PROJECT_REPORT_CAP) {
      throw new AppError(
        507,
        'project_report_cap',
        'This project has reached its stored report limit. The site owner needs to remove older reports.',
      );
    }

    const isMultipart = request.isMultipart();
    let raw: Record<string, unknown>;
    let screenshot: Buffer | null = null;

    if (isMultipart) {
      const parsed = await readMultipart(request);
      if (parsed.fileTruncated) throw tooLarge('The screenshot is larger than the 5 MiB limit.');
      screenshot = parsed.file;
      raw = { ...parsed.fields };
      if (typeof parsed.fields.browser === 'string') {
        try {
          raw.browser = JSON.parse(parsed.fields.browser);
        } catch {
          delete raw.browser;
        }
      }
    } else {
      raw = (request.body ?? {}) as Record<string, unknown>;
    }

    const body = submissionSchema.parse(raw);
    const message = sanitiseMessage(body.message, MESSAGE_MAX_LENGTH);
    if (message.length < MESSAGE_MIN_LENGTH) {
      throw badRequest('message_too_short', `Describe the problem in at least ${MESSAGE_MIN_LENGTH} characters.`);
    }

    const pageUrl = found.project.collect_page_url ? sanitisePageUrl(body.pageUrl) : null;
    const pageContext = sanitisePageContext(body.pageContext);

    // Re-check page eligibility server-side when a URL was collected, so a
    // report cannot be submitted from a page the owner excluded.
    if (pageUrl) {
      const verdict = evaluateEligibility({
        projectStatus: found.project.status,
        mobileEnabled: found.project.mobile_enabled,
        device: body.browser?.device === 'mobile' ? 'mobile' : 'desktop',
        path: pageUrl,
        rules: found.rules,
      });
      if (!verdict.eligible && (verdict.code === 'excluded' || verdict.code === 'not_included')) {
        throw new AppError(403, 'page_not_eligible', 'Reports are not accepted from this page.');
      }
    }

    let stored: { key: string; mime: 'image/png' | 'image/jpeg'; bytes: number; width: number; height: number } | null =
      null;
    if (screenshot && screenshot.byteLength > 0) {
      if (found.storageBytes + screenshot.byteLength > cfg.PROJECT_STORAGE_CAP_BYTES) {
        throw new AppError(507, 'project_storage_cap', 'This project has reached its screenshot storage limit.');
      }
      let processed;
      try {
        processed = await processScreenshot(screenshot);
      } catch (err) {
        if (err instanceof ImageRejected) throw badRequest(`image_${err.code}`, err.message);
        throw err;
      }
      const storageKey = generateStorageKey(found.project.id, processed.extension);
      await getStorage().put(storageKey, processed.data);
      stored = {
        key: storageKey,
        mime: processed.mimeType,
        bytes: processed.byteSize,
        width: processed.width,
        height: processed.height,
      };
    }

    let outboxId: string | null = null;
    let duplicate = false;
    let reportId: string;

    try {
      const result = await withTransaction(async (client) => {
        if (body.dedupeKey) {
          const { rows } = await client.query<{ id: string }>(
            'SELECT id FROM reports WHERE project_id = $1 AND dedupe_key = $2',
            [found.project.id, body.dedupeKey],
          );
          if (rows[0]) return { reportId: rows[0].id, outboxId: null, duplicate: true };
        }

        let attachmentId: string | null = null;
        if (stored) {
          const { rows } = await client.query<{ id: string }>(
            `INSERT INTO attachments (project_id, storage_key, mime_type, byte_size, width, height)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [found.project.id, stored.key, stored.mime, stored.bytes, stored.width, stored.height],
          );
          attachmentId = rows[0]!.id;
        }

        const { rows: reportRows } = await client.query<{ id: string }>(
          `INSERT INTO reports (project_id, message, reporter_email, page_url, page_context, browser,
                                attachment_id, dedupe_key, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, now() + ($9 || ' days')::interval)
           ON CONFLICT (project_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
           RETURNING id`,
          [
            found.project.id,
            message,
            body.email ?? null,
            pageUrl,
            pageContext,
            JSON.stringify(body.browser ?? {}),
            attachmentId,
            body.dedupeKey ?? null,
            found.project.retention_days,
          ],
        );

        const inserted = reportRows[0];
        if (!inserted) {
          const { rows } = await client.query<{ id: string }>(
            'SELECT id FROM reports WHERE project_id = $1 AND dedupe_key = $2',
            [found.project.id, body.dedupeKey],
          );
          return { reportId: rows[0]!.id, outboxId: null, duplicate: true };
        }

        // Notification intent is written in the same transaction as the report,
        // so an accepted report always has recoverable pending work.
        let createdOutboxId: string | null = null;
        if (found.project.notify_email_enabled) {
          const { rows } = await client.query<{ id: string }>(
            'INSERT INTO notification_outbox (report_id, project_id) VALUES ($1, $2) RETURNING id',
            [inserted.id, found.project.id],
          );
          createdOutboxId = rows[0]!.id;
        }

        await client.query(
          `INSERT INTO project_usage (project_id, report_count, storage_bytes)
           VALUES ($1, 1, $2)
           ON CONFLICT (project_id) DO UPDATE
             SET report_count = project_usage.report_count + 1,
                 storage_bytes = project_usage.storage_bytes + $2,
                 updated_at = now()`,
          [found.project.id, stored?.bytes ?? 0],
        );

        return { reportId: inserted.id, outboxId: createdOutboxId, duplicate: false };
      });

      reportId = result.reportId;
      outboxId = result.outboxId;
      duplicate = result.duplicate;
    } catch (err) {
      // The report was not persisted; do not leave the uploaded file behind.
      if (stored) await getStorage().remove(stored.key).catch(() => {});
      throw err;
    }

    if (duplicate && stored) {
      await getStorage().remove(stored.key).catch(() => {});
    }

    if (outboxId) await enqueueNotification(outboxId);

    logger.info({
      msg: duplicate ? 'duplicate report ignored' : 'report accepted',
      projectId: found.project.id,
      reportId,
      hasScreenshot: stored !== null,
    });

    return reply.code(duplicate ? 200 : 201).send({ id: reportId, status: 'accepted', duplicate });
  });
}
