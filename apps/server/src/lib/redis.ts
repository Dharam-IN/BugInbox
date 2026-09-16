import { Redis } from 'ioredis';
import { config } from '../config.ts';

let client: Redis | null = null;

/**
 * Shared Redis connection. Redis is best-effort infrastructure: it backs rate
 * limiting and job dispatch, but never holds the only copy of accepted data.
 * `maxRetriesPerRequest: null` is required by BullMQ.
 */
export function getRedis(): Redis {
  if (!client) {
    client = new Redis(config().REDIS_URL, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });
    client.on('error', (err) => {
      console.error(JSON.stringify({ level: 'warn', msg: 'redis error', err: err.message }));
    });
  }
  return client;
}

export async function redisHealthy(): Promise<boolean> {
  try {
    const pong = await getRedis().ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (client) {
    const c = client;
    client = null;
    await c.quit().catch(() => c.disconnect());
  }
}
