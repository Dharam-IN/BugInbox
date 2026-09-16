import { config } from './config.ts';
import { query } from './db/pool.ts';
import { newReportMail } from './lib/emails.ts';
import { sendMail } from './lib/mail.ts';
import { logger } from './lib/logger.ts';

/** Lease held while a notification is being sent, after which it becomes claimable again. */
const LEASE_SECONDS = 120;

interface OutboxJoinRow {
  id: string;
  report_id: string;
  project_id: string;
  attempts: number;
  project_name: string;
  notify_email_enabled: boolean;
  recipient: string;
  message: string;
  reporter_email: string | null;
  page_url: string | null;
  page_context: string | null;
  created_at: Date;
  attachment_id: string | null;
}

function backoffSeconds(attempts: number): number {
  return Math.min(30 * 2 ** Math.max(0, attempts - 1), 3600);
}

/**
 * Take exclusive ownership of one pending notification.
 *
 * The row is leased rather than deleted, so a crash mid-send leaves work that a
 * later sweep picks up. Because the lease can expire while an SMTP handover is
 * in flight, delivery is at-least-once: a duplicate email is possible, an
 * unsent one is not silently dropped. This is not exactly-once delivery.
 */
async function claim(id: string): Promise<OutboxJoinRow | null> {
  const { rows } = await query<OutboxJoinRow>(
    `UPDATE notification_outbox o
        SET attempts = o.attempts + 1,
            next_attempt_at = now() + ($2 || ' seconds')::interval
      FROM reports r
      JOIN projects p ON p.id = r.project_id
      JOIN owners ow ON ow.id = p.owner_id
     WHERE o.id = $1
       AND o.status = 'pending'
       AND o.next_attempt_at <= now()
       AND r.id = o.report_id
     RETURNING o.id, o.report_id, o.project_id, o.attempts,
               p.name AS project_name, p.notify_email_enabled,
               COALESCE(p.notify_email, ow.email) AS recipient,
               r.message, r.reporter_email, r.page_url, r.page_context,
               r.created_at, r.attachment_id`,
    [id, LEASE_SECONDS],
  );
  return rows[0] ?? null;
}

async function markSent(id: string): Promise<void> {
  await query(`UPDATE notification_outbox SET status = 'sent', sent_at = now(), last_error = NULL WHERE id = $1`, [id]);
}

async function markRetry(id: string, attempts: number, error: string): Promise<void> {
  const cfg = config();
  if (attempts >= cfg.NOTIFICATION_MAX_ATTEMPTS) {
    await query(`UPDATE notification_outbox SET status = 'failed', last_error = $2 WHERE id = $1`, [
      id,
      error.slice(0, 500),
    ]);
    logger.warn({ msg: 'notification permanently failed', outboxId: id, attempts });
    return;
  }
  await query(
    `UPDATE notification_outbox
        SET next_attempt_at = now() + ($2 || ' seconds')::interval,
            last_error = $3
      WHERE id = $1`,
    [id, backoffSeconds(attempts), error.slice(0, 500)],
  );
}

export type NotificationOutcome = 'sent' | 'skipped' | 'not_claimable' | 'retry_scheduled' | 'failed';

/** Process a single outbox entry. Safe to call concurrently and repeatedly. */
export async function processNotification(id: string): Promise<NotificationOutcome> {
  const row = await claim(id);
  if (!row) return 'not_claimable';

  if (!row.notify_email_enabled) {
    await markSent(row.id);
    return 'skipped';
  }

  try {
    await sendMail(
      newReportMail({
        to: row.recipient,
        projectName: row.project_name,
        projectId: row.project_id,
        reportId: row.report_id,
        message: row.message,
        reporterEmail: row.reporter_email,
        pageUrl: row.page_url,
        pageContext: row.page_context,
        createdAt: row.created_at,
        hasScreenshot: row.attachment_id !== null,
      }),
    );
    await markSent(row.id);
    // Report body is never logged.
    logger.info({ msg: 'report notification sent', outboxId: row.id, projectId: row.project_id });
    return 'sent';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markRetry(row.id, row.attempts, message);
    logger.warn({ msg: 'report notification failed', outboxId: row.id, attempts: row.attempts, err: message });
    return row.attempts >= config().NOTIFICATION_MAX_ATTEMPTS ? 'failed' : 'retry_scheduled';
  }
}

/** Ids of notifications that are due now. Used by the recovery sweeper. */
export async function dueNotificationIds(limit = 50): Promise<string[]> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM notification_outbox
      WHERE status = 'pending' AND next_attempt_at <= now()
      ORDER BY next_attempt_at
      LIMIT $1`,
    [limit],
  );
  return rows.map((r) => r.id);
}

/** Drain everything currently due. Returns the number processed. */
export async function sweepNotifications(limit = 50): Promise<number> {
  const ids = await dueNotificationIds(limit);
  let handled = 0;
  for (const id of ids) {
    const outcome = await processNotification(id);
    if (outcome !== 'not_claimable') handled += 1;
  }
  return handled;
}
