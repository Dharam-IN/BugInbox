import { RateLimiterMemory, RateLimiterRedis, type RateLimiterAbstract } from 'rate-limiter-flexible';
import { config } from '../config.ts';
import { getRedis } from './redis.ts';

export interface LimiterSpec {
  key: string;
  points: number;
  durationSeconds: number;
}

const limiters = new Map<string, RateLimiterAbstract>();

/**
 * Redis-backed limiter with an in-process insurance limiter. If Redis is
 * unavailable the limiter falls back to per-instance memory counters, so
 * public ingestion is never left unlimited - it just becomes less precise.
 */
function build(spec: LimiterSpec): RateLimiterAbstract {
  const insurance = new RateLimiterMemory({
    keyPrefix: `${spec.key}:mem`,
    points: spec.points,
    duration: spec.durationSeconds,
  });
  try {
    return new RateLimiterRedis({
      storeClient: getRedis(),
      keyPrefix: spec.key,
      points: spec.points,
      duration: spec.durationSeconds,
      insuranceLimiter: insurance,
    });
  } catch {
    return insurance;
  }
}

export function limiter(spec: LimiterSpec): RateLimiterAbstract {
  let found = limiters.get(spec.key);
  if (!found) {
    found = build(spec);
    limiters.set(spec.key, found);
  }
  return found;
}

export interface ConsumeResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function consume(spec: LimiterSpec, identifier: string, points = 1): Promise<ConsumeResult> {
  try {
    await limiter(spec).consume(identifier, points);
    return { allowed: true, retryAfterSeconds: 0 };
  } catch (err) {
    const ms = (err as { msBeforeNext?: number }).msBeforeNext;
    if (typeof ms === 'number') {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(ms / 1000)) };
    }
    // Unexpected limiter failure: fail closed for public endpoints.
    return { allowed: false, retryAfterSeconds: 60 };
  }
}

export function ingestSpecs() {
  const cfg = config();
  return {
    perIp: {
      key: 'ingest:ip',
      points: cfg.INGEST_RATE_PER_IP,
      durationSeconds: cfg.INGEST_RATE_PER_IP_WINDOW_S,
    } satisfies LimiterSpec,
    perProject: {
      key: 'ingest:project',
      points: cfg.INGEST_RATE_PER_PROJECT,
      durationSeconds: cfg.INGEST_RATE_PER_PROJECT_WINDOW_S,
    } satisfies LimiterSpec,
    config: {
      key: 'config:ip',
      points: cfg.CONFIG_RATE_PER_IP,
      durationSeconds: cfg.CONFIG_RATE_PER_IP_WINDOW_S,
    } satisfies LimiterSpec,
    auth: {
      key: 'auth:ip',
      points: cfg.AUTH_RATE_PER_IP,
      durationSeconds: cfg.AUTH_RATE_PER_IP_WINDOW_S,
    } satisfies LimiterSpec,
  };
}
