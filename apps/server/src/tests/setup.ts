import { beforeAll, afterAll } from 'vitest';

// Environment must be in place before any module calls config().
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://buginbox:buginbox@127.0.0.1:55432/buginbox_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:56379/1';
process.env.APP_BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:58080';
process.env.SMTP_HOST = process.env.SMTP_HOST ?? '127.0.0.1';
process.env.SMTP_PORT = process.env.SMTP_PORT ?? '51025';
process.env.MAIL_FROM = process.env.MAIL_FROM ?? 'BugInbox <no-reply@buginbox.test>';
process.env.TRUSTED_PROXIES = '';
process.env.COOKIE_SECURE = 'false';

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const storageDir = await mkdtemp(join(tmpdir(), 'buginbox-test-'));
process.env.STORAGE_DIR = storageDir;

const { runMigrations } = await import('../db/migrate.ts');
const { waitForDatabase, closePool, query } = await import('../db/pool.ts');
const { closeRedis, getRedis } = await import('../lib/redis.ts');

beforeAll(async () => {
  await waitForDatabase(20, 500);
  await runMigrations(() => {});
  // A clean slate, and a clean rate-limit namespace, for every file.
  await query('TRUNCATE owners, projects, reports, attachments, notification_outbox, sessions, owner_tokens RESTART IDENTITY CASCADE');
  await getRedis().flushdb().catch(() => {});
});

afterAll(async () => {
  await closeRedis();
  await closePool();
  await rm(storageDir, { recursive: true, force: true });
});
