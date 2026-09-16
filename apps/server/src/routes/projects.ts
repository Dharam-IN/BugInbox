import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ACCENT_COLOR_PATTERN,
  LAUNCHER_ICONS,
  LAUNCHER_POSITIONS,
  MAX_RULE_LENGTH,
  validateRulePattern,
} from '@buginbox/shared';
import { config } from '../config.ts';
import { query, withTransaction } from '../db/pool.ts';
import { AppError, badRequest, notFound } from '../lib/errors.ts';
import { logger } from '../lib/logger.ts';
import { parseOrigin } from '../lib/origin.ts';
import {
  loadOwnedProject,
  replaceOrigins,
  replaceRules,
  serialiseProject,
  type ProjectRow,
} from '../lib/projects.ts';
import { generateProjectKey } from '../lib/tokens.ts';
import { getStorage } from '../storage/index.ts';

const originSchema = z
  .string()
  .trim()
  .max(255)
  .superRefine((value, ctx) => {
    if (!parseOrigin(value)) {
      ctx.addIssue({
        code: 'custom',
        message: `"${value}" is not a valid origin. Use scheme://host[:port], for example https://example.com or http://localhost:5173.`,
      });
    }
  })
  .transform((value) => parseOrigin(value)!.origin);

const ruleSchema = z
  .object({
    kind: z.enum(['include', 'exclude']),
    pattern: z.string().trim().max(MAX_RULE_LENGTH),
  })
  .superRefine((rule, ctx) => {
    const result = validateRulePattern(rule.pattern);
    if (!result.valid) ctx.addIssue({ code: 'custom', message: `"${rule.pattern}": ${result.reason}` });
  });

const appearanceSchema = z.object({
  launcherEnabled: z.boolean(),
  launcherText: z.string().trim().min(1).max(40),
  accentColor: z.string().regex(ACCENT_COLOR_PATTERN, 'Use a 6-digit hex colour such as #2f6df6.'),
  theme: z.enum(['light', 'dark', 'system']),
  icon: z.enum(LAUNCHER_ICONS as [string, ...string[]]),
  position: z.enum(LAUNCHER_POSITIONS as [string, ...string[]]),
  offsetX: z.number().int().min(0).max(200),
  offsetY: z.number().int().min(0).max(200),
  mobileEnabled: z.boolean(),
  mobileOffsetX: z.number().int().min(0).max(200),
  mobileOffsetY: z.number().int().min(0).max(200),
});

const triggerSchema = z
  .object({
    mode: z.enum(['immediate', 'delay', 'manual']),
    delayMs: z.number().int().min(0).max(60_000),
  })
  .refine((t) => t.mode !== 'delay' || t.delayMs > 0, {
    message: 'Choose a delay greater than 0 ms, or use immediate mode.',
  });

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  origins: z.array(originSchema).min(1, 'Add at least one website origin.').max(20),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  status: z.enum(['active', 'paused']).optional(),
  notifyEmailEnabled: z.boolean().optional(),
  notifyEmail: z.union([z.string().trim().toLowerCase().email().max(254), z.null()]).optional(),
  collectPageUrl: z.boolean().optional(),
  retentionDays: z.number().int().min(1).max(3650).optional(),
  origins: z.array(originSchema).max(20).optional(),
  rules: z.array(ruleSchema).max(50).optional(),
  appearance: appearanceSchema.partial().optional(),
  trigger: triggerSchema.optional(),
});

const APPEARANCE_COLUMNS: Record<string, string> = {
  launcherEnabled: 'launcher_enabled',
  launcherText: 'launcher_text',
  accentColor: 'accent_color',
  theme: 'appearance',
  icon: 'icon',
  position: 'position',
  offsetX: 'offset_x',
  offsetY: 'offset_y',
  mobileEnabled: 'mobile_enabled',
  mobileOffsetX: 'mobile_offset_x',
  mobileOffsetY: 'mobile_offset_y',
};

export default async function projectRoutes(app: FastifyInstance) {
  app.get('/', async (request) => {
    const session = app.requireOwner(request);
    const { rows } = await query<
      ProjectRow & {
        report_count: number;
        new_report_count: number;
        storage_bytes: number;
        primary_origin: string | null;
        latest_report_at: Date | null;
      }
    >(
      `SELECT p.*,
              COALESCE(u.report_count, 0) AS report_count,
              COALESCE(u.storage_bytes, 0) AS storage_bytes,
              (SELECT count(*) FROM reports r WHERE r.project_id = p.id AND r.status = 'new') AS new_report_count,
              (SELECT max(r.created_at) FROM reports r WHERE r.project_id = p.id) AS latest_report_at,
              -- The first origin the owner configured, used as the project's
              -- primary website in the list. Ordering is stable by insertion.
              (SELECT o.origin FROM project_origins o
                WHERE o.project_id = p.id
                ORDER BY o.created_at, o.origin
                LIMIT 1) AS primary_origin
         FROM projects p
         LEFT JOIN project_usage u ON u.project_id = p.id
        WHERE p.owner_id = $1
        ORDER BY p.created_at DESC`,
      [session.owner.id],
    );
    return {
      projects: rows.map((row) => ({
        id: row.id,
        name: row.name,
        publicKey: row.public_key,
        status: row.status,
        createdAt: row.created_at.toISOString(),
        reportCount: Number(row.report_count),
        newReportCount: Number(row.new_report_count),
        storageBytes: Number(row.storage_bytes),
        primaryOrigin: row.primary_origin,
        latestReportAt: row.latest_report_at ? row.latest_report_at.toISOString() : null,
      })),
    };
  });

  app.post('/', async (request, reply) => {
    const session = app.requireVerifiedOwner(request);
    const body = createSchema.parse(request.body);

    const { rows: countRows } = await query<{ count: number }>(
      'SELECT count(*)::int AS count FROM projects WHERE owner_id = $1',
      [session.owner.id],
    );
    if ((countRows[0]?.count ?? 0) >= config().MAX_PROJECTS_PER_OWNER) {
      throw new AppError(409, 'project_limit', `You can have at most ${config().MAX_PROJECTS_PER_OWNER} projects.`);
    }

    const detail = await withTransaction(async (client) => {
      const { rows } = await client.query<ProjectRow>(
        `INSERT INTO projects (owner_id, name, public_key, retention_days)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [session.owner.id, body.name, generateProjectKey(), config().DEFAULT_RETENTION_DAYS],
      );
      const project = rows[0]!;
      await client.query('INSERT INTO project_usage (project_id) VALUES ($1)', [project.id]);
      await replaceOrigins(client, project.id, [...new Set(body.origins)]);
      return project;
    });

    logger.info({ msg: 'project created', projectId: detail.id, ownerId: session.owner.id });
    const full = await loadOwnedProject(detail.id, session.owner.id);
    return reply.code(201).send({ project: serialiseProject(full) });
  });

  app.get('/:id', async (request) => {
    const session = app.requireOwner(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { project: serialiseProject(await loadOwnedProject(id, session.owner.id)) };
  });

  app.patch('/:id', async (request) => {
    const session = app.requireOwner(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = updateSchema.parse(request.body);
    await loadOwnedProject(id, session.owner.id); // ownership check

    if (body.rules) {
      const includes = body.rules.filter((r) => r.kind === 'include').length;
      if (includes > 25 || body.rules.length - includes > 25) {
        throw badRequest('too_many_rules', 'Use at most 25 include rules and 25 exclude rules.');
      }
    }

    await withTransaction(async (client) => {
      const sets: string[] = [];
      const values: unknown[] = [];
      const push = (column: string, value: unknown) => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };

      if (body.name !== undefined) push('name', body.name);
      if (body.status !== undefined) push('status', body.status);
      if (body.notifyEmailEnabled !== undefined) push('notify_email_enabled', body.notifyEmailEnabled);
      if (body.notifyEmail !== undefined) push('notify_email', body.notifyEmail);
      if (body.collectPageUrl !== undefined) push('collect_page_url', body.collectPageUrl);
      if (body.retentionDays !== undefined) push('retention_days', body.retentionDays);
      if (body.trigger) {
        push('trigger_mode', body.trigger.mode);
        push('trigger_delay_ms', body.trigger.mode === 'delay' ? body.trigger.delayMs : 0);
      }
      for (const [key, column] of Object.entries(APPEARANCE_COLUMNS)) {
        const value = body.appearance?.[key as keyof typeof body.appearance];
        if (value !== undefined) push(column, value);
      }

      // Any change bumps config_version so clients can tell configurations apart.
      sets.push('updated_at = now()', 'config_version = config_version + 1');
      values.push(id);
      await client.query(`UPDATE projects SET ${sets.join(', ')} WHERE id = $${values.length}`, values);

      if (body.origins) await replaceOrigins(client, id, [...new Set(body.origins)]);
      if (body.rules) await replaceRules(client, id, body.rules);
    });

    return { project: serialiseProject(await loadOwnedProject(id, session.owner.id)) };
  });

  app.delete('/:id', async (request) => {
    const session = app.requireOwner(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ confirmName: z.string() }).parse(request.body ?? {});
    const detail = await loadOwnedProject(id, session.owner.id);
    if (body.confirmName.trim() !== detail.project.name) {
      throw badRequest('confirmation_mismatch', 'Type the project name exactly to confirm deletion.');
    }

    // Collect storage keys first; rows cascade away with the project.
    const { rows: attachments } = await query<{ storage_key: string }>(
      'SELECT storage_key FROM attachments WHERE project_id = $1',
      [id],
    );
    await query('DELETE FROM projects WHERE id = $1 AND owner_id = $2', [id, session.owner.id]);
    for (const attachment of attachments) {
      await getStorage()
        .remove(attachment.storage_key)
        .catch((err) => logger.warn({ msg: 'could not remove file for deleted project', err: String(err) }));
    }
    logger.info({ msg: 'project deleted', projectId: id, ownerId: session.owner.id, files: attachments.length });
    return { ok: true, deletedAttachments: attachments.length };
  });

  app.get('/:id/snippet', async (request) => {
    const session = app.requireOwner(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const detail = await loadOwnedProject(id, session.owner.id);
    if (!detail) throw notFound();
    const base = config().publicBaseUrl;
    return {
      scriptUrl: `${base}/widget/v1/buginbox.js`,
      projectKey: detail.project.public_key,
    };
  });
}
