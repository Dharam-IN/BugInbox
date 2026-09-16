import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const int = (def: number) =>
  z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : Number(v)))
    .pipe(z.number().int());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  HOST: z.string().default('0.0.0.0'),
  PORT: int(3000),

  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: int(10),
  REDIS_URL: z.string().min(1),

  /** Public base URL the dashboard and widget script are served from. */
  APP_BASE_URL: z.string().url(),
  /** Base URL used inside emails; defaults to APP_BASE_URL. */
  PUBLIC_BASE_URL: z.string().url().optional(),

  SESSION_TTL_HOURS: int(24 * 14),
  COOKIE_SECURE: bool.default(false),

  SMTP_HOST: z.string().default('mailpit'),
  SMTP_PORT: int(1025),
  SMTP_SECURE: bool.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('BugInbox <no-reply@buginbox.test>'),

  STORAGE_DIR: z.string().default('/data/uploads'),
  MAX_UPLOAD_BYTES: int(5 * 1024 * 1024),
  MAX_IMAGE_PIXELS: int(40_000_000),
  MAX_IMAGE_DIMENSION: int(10_000),

  DEFAULT_RETENTION_DAYS: int(90),
  PROJECT_REPORT_CAP: int(5000),
  PROJECT_STORAGE_CAP_BYTES: int(250 * 1024 * 1024),
  MAX_PROJECTS_PER_OWNER: int(25),

  /** Comma separated list of trusted proxy IPs/CIDRs. Empty means trust nothing. */
  TRUSTED_PROXIES: z.string().default(''),

  INGEST_RATE_PER_IP: int(10),
  INGEST_RATE_PER_IP_WINDOW_S: int(600),
  INGEST_RATE_PER_PROJECT: int(120),
  INGEST_RATE_PER_PROJECT_WINDOW_S: int(3600),
  CONFIG_RATE_PER_IP: int(120),
  CONFIG_RATE_PER_IP_WINDOW_S: int(60),
  AUTH_RATE_PER_IP: int(20),
  AUTH_RATE_PER_IP_WINDOW_S: int(900),

  /** How long widget clients may cache project configuration, in seconds. */
  WIDGET_CONFIG_CACHE_S: int(300),

  WORKER_POLL_INTERVAL_MS: int(15_000),
  NOTIFICATION_MAX_ATTEMPTS: int(8),
});

export type Config = z.infer<typeof schema> & {
  publicBaseUrl: string;
  trustProxy: string[] | false;
};

let cached: Config | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Invalid environment configuration:\n  ${issues}`);
  }
  const trusted = parsed.data.TRUSTED_PROXIES.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    ...parsed.data,
    publicBaseUrl: (parsed.data.PUBLIC_BASE_URL ?? parsed.data.APP_BASE_URL).replace(/\/+$/, ''),
    trustProxy: trusted.length > 0 ? trusted : false,
  };
}

export function config(): Config {
  cached ??= loadConfig();
  return cached;
}
