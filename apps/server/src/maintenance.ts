import { query, withTransaction } from './db/pool.ts';
import { getStorage } from './storage/index.ts';
import { logger } from './lib/logger.ts';

export interface MaintenanceSummary {
  expiredReports: number;
  deletedAttachments: number;
  orphanFiles: number;
  expiredSessions: number;
  expiredTokens: number;
}

/**
 * Delete attachment rows plus their files, keeping project usage counters in
 * step. Files are removed after the transaction commits, so a crash leaves an
 * orphan file (cleaned by `sweepOrphanFiles`) rather than a dangling row.
 */
async function deleteAttachments(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const removed = await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string; project_id: string; storage_key: string; byte_size: number }>(
      `DELETE FROM attachments WHERE id = ANY($1::uuid[])
       RETURNING id, project_id, storage_key, byte_size`,
      [ids],
    );
    for (const row of rows) {
      await client.query(
        `UPDATE project_usage
            SET storage_bytes = GREATEST(0, storage_bytes - $2), updated_at = now()
          WHERE project_id = $1`,
        [row.project_id, row.byte_size],
      );
    }
    return rows;
  });

  for (const row of removed) {
    await getStorage()
      .remove(row.storage_key)
      .catch((err) => logger.warn({ msg: 'could not remove attachment file', err: String(err) }));
  }
  return removed.length;
}

/** Enforce the documented retention window. */
export async function purgeExpiredReports(limit = 500): Promise<{ reports: number; attachments: number }> {
  const { rows } = await query<{ id: string; attachment_id: string | null; project_id: string }>(
    `SELECT id, attachment_id, project_id FROM reports WHERE expires_at <= now() ORDER BY expires_at LIMIT $1`,
    [limit],
  );
  if (rows.length === 0) return { reports: 0, attachments: 0 };

  const attachmentIds = rows.map((r) => r.attachment_id).filter((id): id is string => id !== null);
  await withTransaction(async (client) => {
    const deleted = await client.query<{ project_id: string }>(
      `DELETE FROM reports WHERE id = ANY($1::uuid[]) RETURNING project_id`,
      [rows.map((r) => r.id)],
    );
    const counts = new Map<string, number>();
    for (const row of deleted.rows) counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
    for (const [projectId, count] of counts) {
      await client.query(
        `UPDATE project_usage SET report_count = GREATEST(0, report_count - $2), updated_at = now()
          WHERE project_id = $1`,
        [projectId, count],
      );
    }
  });

  const attachments = await deleteAttachments(attachmentIds);
  return { reports: rows.length, attachments };
}

/** Remove files on disk that no attachment row references. */
export async function sweepOrphanFiles(): Promise<number> {
  const keys = await getStorage().list();
  if (keys.length === 0) return 0;
  const { rows } = await query<{ storage_key: string }>(
    `SELECT storage_key FROM attachments WHERE storage_key = ANY($1::text[])`,
    [keys],
  );
  const known = new Set(rows.map((r) => r.storage_key));
  let removed = 0;
  for (const key of keys) {
    if (known.has(key)) continue;
    await getStorage().remove(key).catch(() => {});
    removed += 1;
  }
  if (removed > 0) logger.info({ msg: 'removed orphan attachment files', count: removed });
  return removed;
}

export async function purgeExpiredAuthRows(): Promise<{ sessions: number; tokens: number }> {
  const sessions = await query(`DELETE FROM sessions WHERE expires_at <= now()`);
  const tokens = await query(`DELETE FROM owner_tokens WHERE expires_at <= now() OR used_at IS NOT NULL`);
  return { sessions: sessions.rowCount ?? 0, tokens: tokens.rowCount ?? 0 };
}

/** Remove attachments whose report is gone (report deletion sets attachment_id to NULL). */
export async function sweepDetachedAttachments(limit = 500): Promise<number> {
  const { rows } = await query<{ id: string }>(
    `SELECT a.id FROM attachments a
      LEFT JOIN reports r ON r.attachment_id = a.id
      WHERE r.id IS NULL AND a.created_at < now() - interval '1 hour'
      LIMIT $1`,
    [limit],
  );
  return deleteAttachments(rows.map((r) => r.id));
}

export async function runMaintenance(): Promise<MaintenanceSummary> {
  const expired = await purgeExpiredReports();
  const detached = await sweepDetachedAttachments();
  const orphans = await sweepOrphanFiles();
  const auth = await purgeExpiredAuthRows();
  const summary: MaintenanceSummary = {
    expiredReports: expired.reports,
    deletedAttachments: expired.attachments + detached,
    orphanFiles: orphans,
    expiredSessions: auth.sessions,
    expiredTokens: auth.tokens,
  };
  logger.info({ msg: 'maintenance sweep complete', ...summary });
  return summary;
}
