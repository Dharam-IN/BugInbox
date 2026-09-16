import { config } from './config.ts';
import { closePool, waitForDatabase } from './db/pool.ts';
import { runMigrations } from './db/migrate.ts';
import { logger } from './lib/logger.ts';
import { closeMail } from './lib/mail.ts';
import { closeRedis } from './lib/redis.ts';
import { runMaintenance } from './maintenance.ts';
import { sweepNotifications } from './notifications.ts';
import { closeQueue, startNotificationWorker } from './queue.ts';
import { ensureStorageReady } from './storage/index.ts';

const cfg = config();
const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;

await waitForDatabase();
await runMigrations((msg) => logger.info({ msg }));
await ensureStorageReady();

const worker = startNotificationWorker();
logger.info({ msg: 'worker started', pollIntervalMs: cfg.WORKER_POLL_INTERVAL_MS });

/**
 * Recovery sweep. The queue is only a dispatch hint; this loop is what makes
 * pending notifications survive a crash, a restart or a Redis outage.
 */
let sweeping = false;
const sweepTimer = setInterval(() => {
  if (sweeping) return;
  sweeping = true;
  void sweepNotifications()
    .then((count) => {
      if (count > 0) logger.info({ msg: 'outbox sweep processed pending notifications', count });
    })
    .catch((err) => logger.warn({ msg: 'outbox sweep failed', err: err instanceof Error ? err.message : String(err) }))
    .finally(() => {
      sweeping = false;
    });
}, cfg.WORKER_POLL_INTERVAL_MS);

const maintenanceTimer = setInterval(() => {
  void runMaintenance().catch((err) =>
    logger.warn({ msg: 'maintenance failed', err: err instanceof Error ? err.message : String(err) }),
  );
}, MAINTENANCE_INTERVAL_MS);

// Catch up immediately on start-up, then on the interval.
void sweepNotifications().catch(() => {});
void runMaintenance().catch(() => {});

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ msg: 'worker shutting down', signal });
    clearInterval(sweepTimer);
    clearInterval(maintenanceTimer);
    void (async () => {
      await worker.close().catch(() => {});
      await closeQueue();
      await closeRedis();
      closeMail();
      await closePool();
      process.exit(0);
    })();
  });
}
