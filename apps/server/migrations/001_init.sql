-- BugInbox initial schema.
-- Postgres is the source of truth for owners, projects, reports and notification intent.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE owners (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           citext NOT NULL UNIQUE,
  password_hash   text NOT NULL,
  email_verified_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Single-use tokens for email verification and password reset. Only the hash is stored.
CREATE TABLE owner_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('verify_email', 'password_reset')),
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX owner_tokens_owner_kind_idx ON owner_tokens (owner_id, kind);

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  csrf_token  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX sessions_owner_idx ON sessions (owner_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE projects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          uuid NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name              text NOT NULL,
  public_key        text NOT NULL UNIQUE,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  notify_email_enabled boolean NOT NULL DEFAULT true,
  notify_email       citext,
  collect_page_url  boolean NOT NULL DEFAULT true,
  retention_days    integer NOT NULL DEFAULT 90 CHECK (retention_days BETWEEN 1 AND 3650),

  -- Widget appearance and placement
  launcher_enabled  boolean NOT NULL DEFAULT true,
  launcher_text     text NOT NULL DEFAULT 'Report a problem',
  accent_color      text NOT NULL DEFAULT '#2f6df6',
  appearance        text NOT NULL DEFAULT 'system' CHECK (appearance IN ('light', 'dark', 'system')),
  icon              text NOT NULL DEFAULT 'bug' CHECK (icon IN ('bug', 'chat', 'flag', 'help', 'megaphone')),
  position          text NOT NULL DEFAULT 'bottom-right'
                      CHECK (position IN ('bottom-right', 'bottom-left', 'top-right', 'top-left')),
  offset_x          integer NOT NULL DEFAULT 20 CHECK (offset_x BETWEEN 0 AND 200),
  offset_y          integer NOT NULL DEFAULT 20 CHECK (offset_y BETWEEN 0 AND 200),
  mobile_enabled    boolean NOT NULL DEFAULT true,
  mobile_offset_x   integer NOT NULL DEFAULT 12 CHECK (mobile_offset_x BETWEEN 0 AND 200),
  mobile_offset_y   integer NOT NULL DEFAULT 12 CHECK (mobile_offset_y BETWEEN 0 AND 200),
  trigger_mode      text NOT NULL DEFAULT 'immediate' CHECK (trigger_mode IN ('immediate', 'delay', 'manual')),
  trigger_delay_ms  integer NOT NULL DEFAULT 0 CHECK (trigger_delay_ms BETWEEN 0 AND 60000),

  config_version    integer NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_owner_idx ON projects (owner_id);

CREATE TABLE project_origins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  origin      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, origin)
);

CREATE TABLE project_path_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('include', 'exclude')),
  pattern     text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, kind, pattern)
);
CREATE INDEX project_path_rules_project_idx ON project_path_rules (project_id);

CREATE TABLE attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  mime_type   text NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg')),
  byte_size   bigint NOT NULL,
  width       integer NOT NULL,
  height      integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attachments_project_idx ON attachments (project_id);

CREATE TABLE reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved')),
  message       text NOT NULL,
  reporter_email citext,
  page_url      text,
  page_context  text,
  browser       jsonb NOT NULL DEFAULT '{}'::jsonb,
  attachment_id uuid REFERENCES attachments(id) ON DELETE SET NULL,
  dedupe_key    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);
CREATE INDEX reports_project_created_idx ON reports (project_id, created_at DESC);
CREATE INDEX reports_project_status_idx ON reports (project_id, status);
CREATE INDEX reports_expires_idx ON reports (expires_at);
-- Idempotency for widget retries / double clicks.
CREATE UNIQUE INDEX reports_dedupe_idx ON reports (project_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Notification intent, written in the same transaction as the report (transactional outbox).
CREATE TABLE notification_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts        integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  UNIQUE (report_id)
);
CREATE INDEX notification_outbox_due_idx ON notification_outbox (status, next_attempt_at);

-- Per-project usage counters maintained transactionally so caps are enforceable cheaply.
CREATE TABLE project_usage (
  project_id    uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  report_count  integer NOT NULL DEFAULT 0,
  storage_bytes bigint NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
