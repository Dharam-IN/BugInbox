import { Redis } from 'ioredis';

/**
 * Browser verification signs up several owners in a row, which would otherwise
 * trip the per-IP authentication limit that the API test suite asserts on.
 * Clearing only the limiter keys keeps that protection real in production while
 * letting the suite be re-run locally.
 */
export default async function globalSetup(): Promise<void> {
  const url = process.env.BUGINBOX_REDIS_URL ?? 'redis://127.0.0.1:56379';
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    for (const prefix of ['auth:ip', 'ingest:ip', 'ingest:project', 'config:ip']) {
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length > 0) await redis.del(...keys);
    }
  } catch (error) {
    console.warn(`Could not clear rate limiters (${String(error)}). Start the compose stack first.`);
  } finally {
    redis.disconnect();
  }
}
