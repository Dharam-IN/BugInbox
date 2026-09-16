import { buildApp } from './app.ts';
import { config } from './config.ts';
import { closePool, waitForDatabase } from './db/pool.ts';
import { runMigrations } from './db/migrate.ts';
import { logger } from './lib/logger.ts';
import { closeRedis } from './lib/redis.ts';
import { closeQueue } from './queue.ts';
import { ensureStorageReady } from './storage/index.ts';

const cfg = config();

await waitForDatabase();
await runMigrations((msg) => logger.info({ msg }));
await ensureStorageReady();

const app = await buildApp();
await app.listen({ host: cfg.HOST, port: cfg.PORT });
logger.info({ msg: 'api listening', port: cfg.PORT, env: cfg.NODE_ENV });

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ msg: 'api shutting down', signal });
    void (async () => {
      await app.close().catch(() => {});
      await closeQueue();
      await closeRedis();
      await closePool();
      process.exit(0);
    })();
  });
}
