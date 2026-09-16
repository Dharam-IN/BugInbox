import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config.ts';
import { query } from '../db/pool.ts';
import { AppError, forbidden, unauthorised } from '../lib/errors.ts';
import { hashToken, randomToken, safeEqual } from '../lib/tokens.ts';

export const SESSION_COOKIE = 'bi_session';
export const CSRF_COOKIE = 'bi_csrf';
export const CSRF_HEADER = 'x-buginbox-csrf';

export interface OwnerIdentity {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
}

export interface SessionContext {
  sessionId: string;
  csrfToken: string;
  owner: OwnerIdentity;
}

declare module 'fastify' {
  interface FastifyRequest {
    session: SessionContext | null;
  }
  interface FastifyInstance {
    requireOwner(request: FastifyRequest): SessionContext;
    requireVerifiedOwner(request: FastifyRequest): SessionContext;
  }
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: config().COOKIE_SECURE,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export async function createSession(reply: FastifyReply, ownerId: string): Promise<void> {
  const cfg = config();
  const token = randomToken();
  const csrf = randomToken(24);
  const ttlSeconds = cfg.SESSION_TTL_HOURS * 3600;
  await query(
    `INSERT INTO sessions (owner_id, token_hash, csrf_token, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' seconds')::interval)`,
    [ownerId, hashToken(token), csrf, ttlSeconds],
  );
  reply.setCookie(SESSION_COOKIE, token, cookieOptions(ttlSeconds));
  // Readable by the dashboard so it can echo the value back in a header.
  reply.setCookie(CSRF_COOKIE, csrf, { ...cookieOptions(ttlSeconds), httpOnly: false });
}

export async function destroySession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies[SESSION_COOKIE];
  if (token) await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
  reply.clearCookie(CSRF_COOKIE, { path: '/' });
}

/** Invalidate every session for an owner, e.g. after a password change. */
export async function destroyAllSessions(ownerId: string): Promise<void> {
  await query('DELETE FROM sessions WHERE owner_id = $1', [ownerId]);
}

async function loadSession(token: string): Promise<SessionContext | null> {
  const { rows } = await query<{
    id: string;
    csrf_token: string;
    owner_id: string;
    email: string;
    email_verified_at: Date | null;
  }>(
    `SELECT s.id, s.csrf_token, s.owner_id, o.email, o.email_verified_at
       FROM sessions s JOIN owners o ON o.id = s.owner_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    sessionId: row.id,
    csrfToken: row.csrf_token,
    owner: { id: row.owner_id, email: row.email, emailVerifiedAt: row.email_verified_at },
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export default fp(async function authPlugin(app: FastifyInstance) {
  app.decorateRequest('session', null);

  app.decorate('requireOwner', (request: FastifyRequest): SessionContext => {
    if (!request.session) throw unauthorised();
    return request.session;
  });

  app.decorate('requireVerifiedOwner', (request: FastifyRequest): SessionContext => {
    const session = app.requireOwner(request);
    if (!session.owner.emailVerifiedAt) {
      throw new AppError(403, 'email_unverified', 'Confirm your email address before using this feature.');
    }
    return session;
  });

  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    request.session = token ? await loadSession(token) : null;
  });

  // CSRF: double-submit token plus an Origin check on every state-changing
  // request. Session cookies are SameSite=Lax, so this is defence in depth.
  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method)) return;
    if (!request.url.startsWith('/api/v1/') || request.url.startsWith('/api/v1/widget/')) return;
    if (!request.session) return; // unauthenticated writes are rejected by route guards

    const appOrigin = new URL(config().APP_BASE_URL).origin;
    const origin = request.headers.origin;
    if (origin && origin !== appOrigin) {
      throw forbidden('This request came from an unexpected origin.');
    }
    const provided = request.headers[CSRF_HEADER];
    if (typeof provided !== 'string' || !safeEqual(provided, request.session.csrfToken)) {
      throw forbidden('Your session token is missing or stale. Reload the page and try again.');
    }
  });

  app.addHook('onResponse', async (request) => {
    if (request.session) {
      await query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [request.session.sessionId]).catch(
        () => {},
      );
    }
  });
});
