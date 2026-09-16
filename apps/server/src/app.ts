import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { config } from './config.ts';
import { AppError } from './lib/errors.ts';
import { logger } from './lib/logger.ts';
import { redisHealthy } from './lib/redis.ts';
import { query } from './db/pool.ts';
import authPlugin from './plugins/auth.ts';
import authRoutes from './routes/auth.ts';
import projectRoutes from './routes/projects.ts';
import reportRoutes from './routes/reports.ts';
import widgetRoutes from './routes/widget.ts';

/** JSON bodies are small by design; screenshots travel as multipart instead. */
const JSON_BODY_LIMIT = 32 * 1024;

export async function buildApp(): Promise<FastifyInstance> {
  const cfg = config();

  const app = Fastify({
    // Only the proxies we actually run behind are trusted, so forwarding
    // headers from the public internet cannot spoof a client address.
    trustProxy: cfg.trustProxy,
    bodyLimit: JSON_BODY_LIMIT,
    logger: false,
    routerOptions: { ignoreTrailingSlash: true },
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('cross-origin-resource-policy', 'same-origin');
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode === 429) {
        const details = error.details as { retryAfterSeconds?: number } | undefined;
        if (details?.retryAfterSeconds) reply.header('retry-after', String(details.retryAfterSeconds));
      }
      return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: 'validation_failed',
          message: 'Some of the information you sent is not valid.',
          fields: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        },
      });
    }
    const code = (error as { code?: string }).code;
    if (code === 'FST_REQ_FILE_TOO_LARGE' || code === 'FST_FILES_LIMIT') {
      return reply.code(413).send({
        error: { code: 'payload_too_large', message: 'The screenshot is larger than the allowed size.' },
      });
    }
    if (code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.code(413).send({ error: { code: 'payload_too_large', message: 'The request body is too large.' } });
    }
    if (code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' || code === 'FST_ERR_CTP_EMPTY_JSON_BODY') {
      return reply.code(415).send({ error: { code: 'unsupported_media_type', message: 'Unsupported request body.' } });
    }

    const status = (error as { statusCode?: number }).statusCode ?? 500;
    const message = error instanceof Error ? error.message : 'Request failed.';
    if (status < 500) {
      return reply.code(status).send({ error: { code: 'bad_request', message } });
    }
    // Never leak internals, and never log report bodies.
    logger.error({ msg: 'unhandled request error', method: request.method, url: request.url, err: message });
    return reply.code(500).send({ error: { code: 'internal_error', message: 'Something went wrong on our side.' } });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: { code: 'not_found', message: 'Not found.' } }),
  );

  await app.register(cookie);
  await app.register(multipart, {
    limits: {
      fileSize: cfg.MAX_UPLOAD_BYTES,
      files: 1,
      fields: 12,
      fieldSize: 8192,
      parts: 20,
    },
    // Truncation is detected explicitly so the reporter gets a clear message.
    throwFileSizeLimit: false,
  });
  await app.register(authPlugin);

  app.get('/api/health', async () => ({ status: 'ok', service: 'buginbox-api' }));

  app.get('/api/health/ready', async (_request, reply) => {
    const [db, redis] = await Promise.all([
      query('SELECT 1')
        .then(() => true)
        .catch(() => false),
      redisHealthy(),
    ]);
    // Redis is degraded-but-usable: ingestion falls back to in-process limits.
    const status = db ? (redis ? 'ok' : 'degraded') : 'unavailable';
    return reply.code(db ? 200 : 503).send({ status, checks: { database: db, redis } });
  });

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(projectRoutes, { prefix: '/api/v1/projects' });
  await app.register(reportRoutes, { prefix: '/api/v1/reports' });
  await app.register(widgetRoutes, { prefix: '/api/v1/widget' });

  return app;
}
