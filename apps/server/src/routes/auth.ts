import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.ts';
import { query, withTransaction } from '../db/pool.ts';
import { AppError, badRequest, tooManyRequests, unauthorised } from '../lib/errors.ts';
import { hashPassword, verifyPassword } from '../lib/password.ts';
import { hashToken, randomToken } from '../lib/tokens.ts';
import { consume, ingestSpecs } from '../lib/rateLimit.ts';
import { sendMail } from '../lib/mail.ts';
import { passwordResetMail, verifyEmailMail } from '../lib/emails.ts';
import { logger } from '../lib/logger.ts';
import { clientIp } from '../lib/request.ts';
import { createSession, destroyAllSessions, destroySession } from '../plugins/auth.ts';

const VERIFY_TTL_HOURS = 24;
const RESET_TTL_HOURS = 1;

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters.')
  .max(200, 'Use at most 200 characters.');

const credentials = z.object({ email: emailSchema, password: passwordSchema });

async function issueToken(ownerId: string, kind: 'verify_email' | 'password_reset', ttlHours: number) {
  const token = randomToken();
  await query(
    `INSERT INTO owner_tokens (owner_id, kind, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' hours')::interval)`,
    [ownerId, kind, hashToken(token), ttlHours],
  );
  return token;
}

/** Email failures must not fail signup: the owner can ask for a new link. */
async function trySend(mail: Parameters<typeof sendMail>[0], context: string): Promise<void> {
  try {
    await sendMail(mail);
  } catch (err) {
    logger.warn({ msg: 'auth email could not be sent', context, err: err instanceof Error ? err.message : String(err) });
  }
}

export default async function authRoutes(app: FastifyInstance) {
  const specs = ingestSpecs();

  const guard = async (ip: string) => {
    const result = await consume(specs.auth, ip);
    if (!result.allowed) {
      throw tooManyRequests('Too many attempts. Try again later.', result.retryAfterSeconds);
    }
  };

  app.post('/signup', async (request, reply) => {
    await guard(clientIp(request));
    const body = credentials.parse(request.body);

    const existing = await query<{ id: string }>('SELECT id FROM owners WHERE email = $1', [body.email]);
    if (existing.rowCount && existing.rowCount > 0) {
      // Do not reveal whether an address is registered.
      throw badRequest('signup_failed', 'That email address cannot be used. Try signing in or resetting your password.');
    }

    const passwordHash = await hashPassword(body.password);
    const owner = await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string; email: string }>(
        'INSERT INTO owners (email, password_hash) VALUES ($1, $2) RETURNING id, email',
        [body.email, passwordHash],
      );
      return rows[0]!;
    });

    const token = await issueToken(owner.id, 'verify_email', VERIFY_TTL_HOURS);
    await trySend(verifyEmailMail(owner.email, token), 'verify_email');
    await createSession(reply, owner.id);
    logger.info({ msg: 'owner signed up', ownerId: owner.id });
    return reply.code(201).send({ owner: { id: owner.id, email: owner.email, emailVerified: false } });
  });

  app.post('/login', async (request, reply) => {
    await guard(clientIp(request));
    const body = z.object({ email: emailSchema, password: z.string().max(200) }).parse(request.body);

    const { rows } = await query<{ id: string; email: string; password_hash: string; email_verified_at: Date | null }>(
      'SELECT id, email, password_hash, email_verified_at FROM owners WHERE email = $1',
      [body.email],
    );
    const owner = rows[0];
    // Always run a verification so timing does not distinguish unknown accounts.
    const placeholder = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000';
    const ok = await verifyPassword(owner?.password_hash ?? placeholder, body.password);
    if (!owner || !ok) throw unauthorised('That email address and password do not match.');

    await createSession(reply, owner.id);
    return {
      owner: { id: owner.id, email: owner.email, emailVerified: owner.email_verified_at !== null },
    };
  });

  app.post('/logout', async (request, reply) => {
    await destroySession(request, reply);
    return { ok: true };
  });

  app.get('/me', async (request) => {
    const session = app.requireOwner(request);
    return {
      owner: {
        id: session.owner.id,
        email: session.owner.email,
        emailVerified: session.owner.emailVerifiedAt !== null,
      },
    };
  });

  app.post('/verify-email', async (request) => {
    const body = z.object({ token: z.string().min(10).max(200) }).parse(request.body);
    const { rows } = await query<{ id: string; owner_id: string }>(
      `UPDATE owner_tokens SET used_at = now()
        WHERE token_hash = $1 AND kind = 'verify_email' AND used_at IS NULL AND expires_at > now()
        RETURNING id, owner_id`,
      [hashToken(body.token)],
    );
    const row = rows[0];
    if (!row) throw badRequest('invalid_token', 'That confirmation link is invalid or has expired.');
    await query('UPDATE owners SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1', [
      row.owner_id,
    ]);
    logger.info({ msg: 'owner email verified', ownerId: row.owner_id });
    return { ok: true };
  });

  app.post('/resend-verification', async (request) => {
    const session = app.requireOwner(request);
    await guard(clientIp(request));
    if (session.owner.emailVerifiedAt) return { ok: true };
    const token = await issueToken(session.owner.id, 'verify_email', VERIFY_TTL_HOURS);
    await trySend(verifyEmailMail(session.owner.email, token), 'verify_email');
    return { ok: true };
  });

  app.post('/request-password-reset', async (request) => {
    await guard(clientIp(request));
    const body = z.object({ email: emailSchema }).parse(request.body);
    const { rows } = await query<{ id: string; email: string }>('SELECT id, email FROM owners WHERE email = $1', [
      body.email,
    ]);
    const owner = rows[0];
    if (owner) {
      const token = await issueToken(owner.id, 'password_reset', RESET_TTL_HOURS);
      await trySend(passwordResetMail(owner.email, token), 'password_reset');
    }
    // Same response either way, so the endpoint cannot enumerate accounts.
    return { ok: true };
  });

  app.post('/reset-password', async (request, reply) => {
    await guard(clientIp(request));
    const body = z.object({ token: z.string().min(10).max(200), password: passwordSchema }).parse(request.body);
    const { rows } = await query<{ owner_id: string }>(
      `UPDATE owner_tokens SET used_at = now()
        WHERE token_hash = $1 AND kind = 'password_reset' AND used_at IS NULL AND expires_at > now()
        RETURNING owner_id`,
      [hashToken(body.token)],
    );
    const row = rows[0];
    if (!row) throw badRequest('invalid_token', 'That reset link is invalid or has expired.');

    const passwordHash = await hashPassword(body.password);
    await query('UPDATE owners SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, row.owner_id]);
    // Every existing session is invalidated, including the one making this request.
    await destroyAllSessions(row.owner_id);
    await destroySession(request, reply);
    logger.info({ msg: 'owner password reset', ownerId: row.owner_id });
    return { ok: true };
  });

  app.post('/change-password', async (request, reply) => {
    const session = app.requireOwner(request);
    const body = z
      .object({ currentPassword: z.string().max(200), newPassword: passwordSchema })
      .parse(request.body);
    const { rows } = await query<{ password_hash: string }>('SELECT password_hash FROM owners WHERE id = $1', [
      session.owner.id,
    ]);
    const current = rows[0];
    if (!current || !(await verifyPassword(current.password_hash, body.currentPassword))) {
      throw new AppError(400, 'invalid_password', 'Your current password is not correct.');
    }
    await query('UPDATE owners SET password_hash = $1, updated_at = now() WHERE id = $2', [
      await hashPassword(body.newPassword),
      session.owner.id,
    ]);
    await destroyAllSessions(session.owner.id);
    await createSession(reply, session.owner.id);
    return { ok: true };
  });

  app.get('/config', async () => ({
    sessionTtlHours: config().SESSION_TTL_HOURS,
  }));
}
