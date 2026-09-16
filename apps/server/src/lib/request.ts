import type { FastifyRequest } from 'fastify';

/**
 * Client IP for rate limiting.
 *
 * Fastify only populates `request.ips` from forwarding headers when trustProxy
 * is configured with the proxies we actually run behind; otherwise the socket
 * address is used. Arbitrary X-Forwarded-For values from the public internet are
 * therefore never trusted.
 */
export function clientIp(request: FastifyRequest): string {
  return request.ip || 'unknown';
}

/** Limited, non-identifying browser context supplied by the widget. */
export interface BrowserContext {
  userAgent?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  devicePixelRatio?: number;
  language?: string;
  timezone?: string;
  device?: 'desktop' | 'mobile';
}
