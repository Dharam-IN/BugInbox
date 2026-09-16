import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { buildApp } from '../app.ts';
import { query } from '../db/pool.ts';
import { getRedis } from '../lib/redis.ts';

let cached: FastifyInstance | null = null;

export async function testApp(): Promise<FastifyInstance> {
  if (!cached) {
    cached = await buildApp();
    await cached.ready();
  }
  return cached;
}

export async function resetDatabase(): Promise<void> {
  await query(
    'TRUNCATE owners, projects, reports, attachments, notification_outbox, sessions, owner_tokens, project_usage, project_origins, project_path_rules RESTART IDENTITY CASCADE',
  );
  // Rate limiters are keyed per IP/project; clearing them keeps tests independent.
  await getRedis().flushdb().catch(() => {});
}

export interface OwnerSession {
  ownerId: string;
  email: string;
  cookies: string;
  csrf: string;
}

function parseCookies(setCookie: string[] | string | undefined): { header: string; csrf: string } {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const pairs = list.map((raw) => raw.split(';')[0] ?? '').filter(Boolean);
  const csrfPair = pairs.find((pair) => pair.startsWith('bi_csrf='));
  return {
    header: pairs.join('; '),
    csrf: csrfPair ? decodeURIComponent(csrfPair.slice('bi_csrf='.length)) : '',
  };
}

/** Create a verified owner and return an authenticated session. */
export async function createOwner(email: string, password = 'correct-horse-battery'): Promise<OwnerSession> {
  const app = await testApp();
  const signup = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/signup',
    payload: { email, password },
  });
  if (signup.statusCode !== 201) throw new Error(`signup failed: ${signup.body}`);

  const ownerId = (signup.json() as { owner: { id: string } }).owner.id;
  await query('UPDATE owners SET email_verified_at = now() WHERE id = $1', [ownerId]);

  const { header, csrf } = parseCookies(signup.headers['set-cookie'] as string[] | string | undefined);
  return { ownerId, email, cookies: header, csrf };
}

export async function signIn(email: string, password = 'correct-horse-battery'): Promise<OwnerSession> {
  const app = await testApp();
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });
  if (response.statusCode !== 200) throw new Error(`login failed: ${response.body}`);
  const { header, csrf } = parseCookies(response.headers['set-cookie'] as string[] | string | undefined);
  const ownerId = (response.json() as { owner: { id: string } }).owner.id;
  return { ownerId, email, cookies: header, csrf };
}

export function authHeaders(session: OwnerSession): Record<string, string> {
  return {
    cookie: session.cookies,
    'x-buginbox-csrf': session.csrf,
    origin: process.env.APP_BASE_URL ?? 'http://localhost:58080',
  };
}

export interface TestProject {
  id: string;
  publicKey: string;
  name: string;
}

export async function createProject(
  session: OwnerSession,
  name: string,
  origins: string[] = ['https://site.test'],
): Promise<TestProject> {
  const app = await testApp();
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/projects',
    headers: authHeaders(session),
    payload: { name, origins },
  });
  if (response.statusCode !== 201) throw new Error(`create project failed: ${response.body}`);
  const project = (response.json() as { project: { id: string; publicKey: string; name: string } }).project;
  return { id: project.id, publicKey: project.publicKey, name: project.name };
}

/** Build a multipart body by hand so tests exercise the real parser. */
export function multipart(
  fields: Record<string, string>,
  file?: { field: string; filename: string; contentType: string; data: Buffer },
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = `----buginboxtest${Math.random().toString(36).slice(2)}`;
  const chunks: Buffer[] = [];

  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`, 'utf8'),
    );
  }
  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\n` +
          `Content-Type: ${file.contentType}\r\n\r\n`,
        'utf8',
      ),
      file.data,
      Buffer.from('\r\n', 'utf8'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));

  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

export async function makePng(width = 40, height = 30): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 90, b: 200 } },
  })
    .png()
    .toBuffer();
}

export async function makeJpeg(width = 40, height = 30): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 90, b: 30 } },
  })
    .jpeg()
    .toBuffer();
}
