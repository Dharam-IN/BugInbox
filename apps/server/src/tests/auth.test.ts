import { beforeEach, describe, expect, it } from 'vitest';
import { query } from '../db/pool.ts';
import { hashToken } from '../lib/tokens.ts';
import { authHeaders, createOwner, resetDatabase, signIn, testApp } from './helpers.ts';

const PASSWORD = 'correct-horse-battery';

describe('owner authentication lifecycle', () => {
  beforeEach(resetDatabase);

  it('signs up, issues a session, and starts unverified', async () => {
    const app = await testApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: { email: 'new@owner.test', password: PASSWORD },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ owner: { email: 'new@owner.test', emailVerified: false } });

    const cookies = response.headers['set-cookie'] as string[];
    expect(cookies.some((c) => c.startsWith('bi_session=') && c.includes('HttpOnly'))).toBe(true);
    // The CSRF cookie must be readable by the dashboard, so it is not HttpOnly.
    expect(cookies.some((c) => c.startsWith('bi_csrf=') && !c.includes('HttpOnly'))).toBe(true);
  });

  it('never reveals whether an address is already registered', async () => {
    const app = await testApp();
    await createOwner('taken@owner.test');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: { email: 'taken@owner.test', password: PASSWORD },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).not.toMatch(/already|exists|registered/i);
  });

  it('requires a verified address before a project can be created', async () => {
    const app = await testApp();
    const signup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: { email: 'unverified@owner.test', password: PASSWORD },
    });
    const cookies = (signup.headers['set-cookie'] as string[]).map((c) => c.split(';')[0]).join('; ');
    const csrf = decodeURIComponent(
      (signup.headers['set-cookie'] as string[]).find((c) => c.startsWith('bi_csrf='))!.split(';')[0]!.slice(8),
    );

    const blocked = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { cookie: cookies, 'x-buginbox-csrf': csrf, origin: 'http://localhost:58080' },
      payload: { name: 'Blocked', origins: ['https://site.test'] },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('email_unverified');
  });

  it('verifies an email address with a single-use token', async () => {
    const app = await testApp();
    const signup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: { email: 'verify@owner.test', password: PASSWORD },
    });
    const ownerId = signup.json().owner.id;

    // Read the token the way the recipient would: only its hash is stored, so
    // the test issues its own and checks the hash lookup path.
    const token = 'a'.repeat(40);
    await query(
      `INSERT INTO owner_tokens (owner_id, kind, token_hash, expires_at)
       VALUES ($1, 'verify_email', $2, now() + interval '1 hour')`,
      [ownerId, hashToken(token)],
    );

    const ok = await app.inject({ method: 'POST', url: '/api/v1/auth/verify-email', payload: { token } });
    expect(ok.statusCode).toBe(200);

    const again = await app.inject({ method: 'POST', url: '/api/v1/auth/verify-email', payload: { token } });
    expect(again.statusCode).toBe(400);
    expect(again.json().error.code).toBe('invalid_token');
  });

  it('rejects a wrong password and accepts the right one', async () => {
    const app = await testApp();
    await createOwner('login@owner.test');

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'login@owner.test', password: 'not-the-password' },
    });
    expect(wrong.statusCode).toBe(401);

    const right = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'login@owner.test', password: PASSWORD },
    });
    expect(right.statusCode).toBe(200);
  });

  it('ends the session on logout', async () => {
    const app = await testApp();
    const session = await createOwner('logout@owner.test');

    const before = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: session.cookies } });
    expect(before.statusCode).toBe(200);

    await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: authHeaders(session) });

    const after = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: session.cookies } });
    expect(after.statusCode).toBe(401);
  });

  it('answers a password reset request identically for known and unknown addresses', async () => {
    const app = await testApp();
    await createOwner('known@owner.test');

    const known = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/request-password-reset',
      payload: { email: 'known@owner.test' },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/request-password-reset',
      payload: { email: 'nobody@owner.test' },
    });

    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(200);
    expect(known.body).toBe(unknown.body);
  });

  it('resets the password and invalidates every existing session', async () => {
    const app = await testApp();
    const session = await createOwner('reset@owner.test');

    const token = 'b'.repeat(40);
    await query(
      `INSERT INTO owner_tokens (owner_id, kind, token_hash, expires_at)
       VALUES ($1, 'password_reset', $2, now() + interval '1 hour')`,
      [session.ownerId, hashToken(token)],
    );

    const reset = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token, password: 'a-brand-new-password' },
    });
    expect(reset.statusCode).toBe(200);

    const stale = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: session.cookies } });
    expect(stale.statusCode).toBe(401);

    const fresh = await signIn('reset@owner.test', 'a-brand-new-password');
    expect(fresh.ownerId).toBe(session.ownerId);
  });

  it('refuses a short password', async () => {
    const app = await testApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: { email: 'short@owner.test', password: 'short' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('validation_failed');
  });
});

describe('CSRF and origin protection', () => {
  beforeEach(resetDatabase);

  it('refuses a state-changing request without the CSRF header', async () => {
    const app = await testApp();
    const session = await createOwner('csrf@owner.test');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { cookie: session.cookies, origin: 'http://localhost:58080' },
      payload: { name: 'No token', origins: ['https://site.test'] },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('forbidden');
  });

  it('refuses a state-changing request from another origin', async () => {
    const app = await testApp();
    const session = await createOwner('origin@owner.test');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { cookie: session.cookies, 'x-buginbox-csrf': session.csrf, origin: 'https://evil.test' },
      payload: { name: 'Cross origin', origins: ['https://site.test'] },
    });
    expect(response.statusCode).toBe(403);
  });
});
