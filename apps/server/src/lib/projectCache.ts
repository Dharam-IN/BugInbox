import { query } from '../db/pool.ts';

interface CachedOrigins {
  origins: string[];
  expiresAt: number;
}

const TTL_MS = 30_000;
const cache = new Map<string, CachedOrigins>();

/**
 * Short-lived cache of a project's allowed origins, used by the CORS decision
 * on every widget request. Only the CORS check reads it; ingestion re-reads the
 * project row from Postgres so pause takes effect immediately.
 */
export async function allowedOriginsForKey(publicKey: string): Promise<string[]> {
  const now = Date.now();
  const hit = cache.get(publicKey);
  if (hit && hit.expiresAt > now) return hit.origins;

  const { rows } = await query<{ origin: string }>(
    `SELECT o.origin FROM project_origins o
       JOIN projects p ON p.id = o.project_id
      WHERE p.public_key = $1`,
    [publicKey],
  );
  const origins = rows.map((r) => r.origin);
  cache.set(publicKey, { origins, expiresAt: now + TTL_MS });
  return origins;
}

export function clearProjectCache(): void {
  cache.clear();
}

/** Public project keys have a fixed shape; anything else is rejected early. */
export function extractProjectKey(url: string): string | null {
  const match = /^\/api\/v1\/widget\/(bi_pub_[0-9a-f]{32})\//.exec(url.split('?')[0] ?? '');
  return match?.[1] ?? null;
}
