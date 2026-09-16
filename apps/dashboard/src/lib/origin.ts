/**
 * Client-side helpers for the guided setup.
 *
 * These only decide what to *show* and what to submit. The server still parses
 * and enforces exact origins (`apps/server/src/lib/origin.ts`); nothing here
 * widens what is permitted.
 */

export interface OriginResult {
  ok: boolean;
  /** The exact origin that will be saved, when parsing succeeded. */
  origin?: string;
  /** Shown when the entered value carried more than an origin. */
  note?: string;
  error?: string;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

/**
 * Turn what someone typed into the single origin that will be authorised.
 *
 * - A bare domain is assumed to be HTTPS, and the result is shown back to them.
 * - A full page URL keeps only its origin, and says so.
 * - localhost keeps whatever scheme and port was given.
 * - Credentials, wildcards and non-HTTP protocols are refused.
 *
 * www and non-www are deliberately NOT treated as equivalent: authorising a
 * host the owner did not type would silently broaden permissions.
 */
export function resolveOrigin(input: string): OriginResult {
  const raw = input.trim();
  if (raw === '') return { ok: false, error: 'Enter the website address.' };
  if (/\s/.test(raw)) return { ok: false, error: 'A website address cannot contain spaces.' };
  if (raw.includes('*')) {
    return { ok: false, error: 'Wildcards are not supported. Add each website address separately.' };
  }

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw);
  if (!hasScheme && /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
    return { ok: false, error: 'Only http:// and https:// addresses are supported.' };
  }

  let candidate = raw;
  let assumedHttps = false;
  if (!hasScheme) {
    // A bare host: default to HTTPS, except for local development hosts where
    // http is the norm and guessing https would break the setup.
    const host = raw.split('/')[0]?.split(':')[0] ?? '';
    const local = LOCAL_HOSTS.has(host.toLowerCase());
    candidate = `${local ? 'http' : 'https'}://${raw}`;
    assumedHttps = !local;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: 'That does not look like a website address. Try example.com or https://example.com.' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Only http:// and https:// addresses are supported.' };
  }
  if (url.username || url.password) {
    return { ok: false, error: 'Remove the username and password from the address.' };
  }
  if (url.hostname === '') {
    return { ok: false, error: 'Enter a host name, for example example.com.' };
  }

  const carriedPath = (url.pathname !== '/' && url.pathname !== '') || url.search !== '' || url.hash !== '';

  const notes: string[] = [];
  if (assumedHttps) notes.push('Assumed https.');
  if (carriedPath) notes.push('Permission applies to the whole website address, not just that page.');

  return {
    ok: true,
    origin: url.origin,
    note: notes.length > 0 ? notes.join(' ') : undefined,
  };
}

/** Does this origin look like a local development address? */
export function isLocalOrigin(origin: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(origin).hostname.toLowerCase());
  } catch {
    return false;
  }
}
