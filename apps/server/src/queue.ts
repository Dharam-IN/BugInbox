import { Queue, Worker, type Job } from 'bullmq';
import { config } from './config.ts';
import { getRedis } from './lib/redis.ts';
import { logger } from './lib/logger.ts';
import { processNotification } from './notifications.ts';

export const NOTIFICATION_QUEUE = 'buginbox:notifications';

interface NotificationJob {
  outboxId: string;
}

let queue: Queue<NotificationJob> | null = null;

export function getNotificationQueue(): Queue<NotificationJob> {
  queue ??= new Queue<NotificationJob>(NOTIFICATION_QUEUE, { connection: getRedis() });
  return queue;
}

/**
 * Fast path only. Postgres already holds the notification intent, so a failure
 * here is logged and ignored - the worker's sweeper will pick the row up.
 */
export async function enqueueNotification(outboxId: string): Promise<boolean> {
  try {
    await getNotificationQueue().add(
      'notification',
      { outboxId },
      {
        jobId: outboxId, // de-duplicates repeated enqueues of the same intent
        removeOnComplete: 500,
        removeOnFail: 500,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
    return true;
  } catch (err) {
    logger.warn({
      msg: 'could not enqueue notification, leaving it for the outbox sweeper',
      outboxId,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export function startNotificationWorker(): Worker<NotificationJob> {
  const worker = new Worker<NotificationJob>(
    NOTIFICATION_QUEUE,
    async (job: Job<NotificationJob>) => {
      const outcome = await processNotification(job.data.outboxId);
      if (outcome === 'retry_scheduled') {
        // The outbox owns retry timing; let the job succeed and the sweeper re-run it.
        logger.debug({ msg: 'notification deferred to outbox retry', outboxId: job.data.outboxId });
      }
      return outcome;
    },
    { connection: getRedis(), concurrency: 4 },
  );

  worker.on('failed', (job, err) => {
    logger.warn({ msg: 'notification job failed', jobId: job?.id, err: err.message });
  });
  worker.on('error', (err) => {
    logger.warn({ msg: 'notification worker error', err: err.message });
  });
  return worker;
}

export async function closeQueue(): Promise<void> {
  if (queue) {
    const q = queue;
    queue = null;
    await q.close().catch(() => {});
  }
}

export function pollIntervalMs(): number {
  return config().WORKER_POLL_INTERVAL_MS;
}
