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

export async function redisHealthy(timeoutMs = 1500): Promise<boolean> {
  const client = getRedis();
  // Offline queueing is disabled, so a PING issued mid-handshake fails even
  // though Redis is fine. Give the connection a moment to reach "ready" first.
  if (client.status !== 'ready') {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(finish, timeoutMs);
      function finish() {
        clearTimeout(timer);
        client.off('ready', finish);
        resolve();
      }
      client.once('ready', finish);
    });
  }
  try {
    return (await client.ping()) === 'PONG';
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
