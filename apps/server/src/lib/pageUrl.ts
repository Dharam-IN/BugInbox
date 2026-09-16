import { PAGE_CONTEXT_MAX_LENGTH } from '@buginbox/shared';

export const PAGE_URL_MAX_LENGTH = 2048;

/**
 * Sanitise a reporter's page URL for storage.
 *
 * Query strings and fragments are always removed because they routinely carry
 * tokens, emails and search terms. Paths are kept as-is: they can still contain
 * sensitive values (for example /invoices/secret-slug), which is why owners can
 * turn URL collection off entirely or send their own page context instead.
 * This reduces exposure; it is not a guarantee that no secret survives.
 */
export function sanitisePageUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  url.search = '';
  url.hash = '';
  url.username = '';
  url.password = '';
  const out = url.toString();
  return out.length > PAGE_URL_MAX_LENGTH ? out.slice(0, PAGE_URL_MAX_LENGTH) : out;
}

/** Strip C0/C1 control characters, which have no place in stored text fields. */
export function stripControlCharacters(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl = code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f);
    out += isControl && ch !== '\n' && ch !== '\t' ? ' ' : ch;
  }
  return out;
}

/** Host-supplied label used instead of, or alongside, the URL. */
export function sanitisePageContext(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = stripControlCharacters(raw).replace(/\s+/g, ' ').trim();
  if (trimmed === '') return null;
  return trimmed.slice(0, PAGE_CONTEXT_MAX_LENGTH);
}

/** Reporter message: keep newlines, drop other control characters, cap length. */
export function sanitiseMessage(raw: string, maxLength: number): string {
  return stripControlCharacters(raw).replace(/\r\n?/g, '\n').trim().slice(0, maxLength);
}
