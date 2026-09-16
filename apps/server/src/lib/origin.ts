/**
 * Exact origin handling. An allowed origin is scheme + host + optional port -
 * never a path, never a wildcard, never a suffix match.
 */

export interface ParsedOrigin {
  origin: string;
  hostname: string;
  protocol: string;
  port: string;
}

/** Parse an origin string, returning null when it is not exactly one origin. */
export function parseOrigin(value: string): ParsedOrigin | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (raw === '' || raw.length > 255 || /\s/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  // Reject anything carrying a path, query or fragment: "https://a.test/x" is not an origin.
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) return null;
  if (raw.replace(/\/+$/, '') !== url.origin) return null;
  return { origin: url.origin, hostname: url.hostname, protocol: url.protocol, port: url.port };
}

/** Normalise for storage; throws for invalid input so callers surface a 400. */
export function normaliseOrigin(value: string): string {
  const parsed = parseOrigin(value);
  if (!parsed) throw new Error(`Not a valid origin: ${value}`);
  return parsed.origin;
}

/** Exact, case-sensitive membership test against the project's allowlist. */
export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return false;
  const parsed = parseOrigin(origin);
  if (!parsed) return false;
  return allowed.includes(parsed.origin);
}
