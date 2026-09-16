import type { PoolClient } from 'pg';
import { query } from '../db/pool.ts';
import { notFound } from './errors.ts';
import type {
  Appearance,
  LauncherIcon,
  LauncherPosition,
  PathRule,
  ProjectStatus,
  TriggerMode,
  WidgetConfig,
} from '@buginbox/shared';
import { MESSAGE_MAX_LENGTH } from '@buginbox/shared';
import { config } from '../config.ts';

export interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  public_key: string;
  status: ProjectStatus;
  notify_email_enabled: boolean;
  notify_email: string | null;
  collect_page_url: boolean;
  retention_days: number;
  launcher_enabled: boolean;
  launcher_text: string;
  accent_color: string;
  appearance: Appearance;
  icon: LauncherIcon;
  position: LauncherPosition;
  offset_x: number;
  offset_y: number;
  mobile_enabled: boolean;
  mobile_offset_x: number;
  mobile_offset_y: number;
  trigger_mode: TriggerMode;
  trigger_delay_ms: number;
  config_version: number;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectDetail {
  project: ProjectRow;
  origins: string[];
  rules: PathRule[];
  usage: { reportCount: number; storageBytes: number };
}

/** Load a project, enforcing owner scoping in the query itself. */
export async function loadOwnedProject(projectId: string, ownerId: string): Promise<ProjectDetail> {
  const { rows } = await query<ProjectRow>('SELECT * FROM projects WHERE id = $1 AND owner_id = $2', [
    projectId,
    ownerId,
  ]);
  const project = rows[0];
  if (!project) throw notFound('That project does not exist.');
  const [origins, rules, usage] = await Promise.all([loadOrigins(project.id), loadRules(project.id), loadUsage(project.id)]);
  return { project, origins, rules, usage };
}

export async function loadOrigins(projectId: string): Promise<string[]> {
  const { rows } = await query<{ origin: string }>(
    'SELECT origin FROM project_origins WHERE project_id = $1 ORDER BY origin',
    [projectId],
  );
  return rows.map((r) => r.origin);
}

export async function loadRules(projectId: string): Promise<PathRule[]> {
  const { rows } = await query<{ kind: 'include' | 'exclude'; pattern: string }>(
    'SELECT kind, pattern FROM project_path_rules WHERE project_id = $1 ORDER BY kind, sort_order, pattern',
    [projectId],
  );
  return rows.map((r) => ({ kind: r.kind, pattern: r.pattern }));
}

export async function loadUsage(projectId: string): Promise<{ reportCount: number; storageBytes: number }> {
  const { rows } = await query<{ report_count: number; storage_bytes: number }>(
    'SELECT report_count, storage_bytes FROM project_usage WHERE project_id = $1',
    [projectId],
  );
  const row = rows[0];
  return { reportCount: row?.report_count ?? 0, storageBytes: row?.storage_bytes ?? 0 };
}

export async function replaceOrigins(client: PoolClient, projectId: string, origins: string[]): Promise<void> {
  await client.query('DELETE FROM project_origins WHERE project_id = $1', [projectId]);
  for (const origin of origins) {
    await client.query(
      'INSERT INTO project_origins (project_id, origin) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [projectId, origin],
    );
  }
}

export async function replaceRules(client: PoolClient, projectId: string, rules: PathRule[]): Promise<void> {
  await client.query('DELETE FROM project_path_rules WHERE project_id = $1', [projectId]);
  let order = 0;
  for (const rule of rules) {
    await client.query(
      'INSERT INTO project_path_rules (project_id, kind, pattern, sort_order) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [projectId, rule.kind, rule.pattern, order],
    );
    order += 1;
  }
}

/** Shape sent to the dashboard. */
export function serialiseProject(detail: ProjectDetail) {
  const p = detail.project;
  return {
    id: p.id,
    name: p.name,
    publicKey: p.public_key,
    status: p.status,
    notifyEmailEnabled: p.notify_email_enabled,
    notifyEmail: p.notify_email,
    collectPageUrl: p.collect_page_url,
    retentionDays: p.retention_days,
    configVersion: p.config_version,
    createdAt: p.created_at.toISOString(),
    updatedAt: p.updated_at.toISOString(),
    appearance: {
      launcherEnabled: p.launcher_enabled,
      launcherText: p.launcher_text,
      accentColor: p.accent_color,
      theme: p.appearance,
      icon: p.icon,
      position: p.position,
      offsetX: p.offset_x,
      offsetY: p.offset_y,
      mobileEnabled: p.mobile_enabled,
      mobileOffsetX: p.mobile_offset_x,
      mobileOffsetY: p.mobile_offset_y,
    },
    trigger: { mode: p.trigger_mode, delayMs: p.trigger_delay_ms },
    origins: detail.origins,
    rules: detail.rules,
    usage: detail.usage,
  };
}

/** Public configuration handed to widget clients. Contains no owner data. */
export function serialiseWidgetConfig(project: ProjectRow, rules: PathRule[]): WidgetConfig {
  const cfg = config();
  return {
    projectKey: project.public_key,
    status: project.status,
    configVersion: project.config_version,
    collectPageUrl: project.collect_page_url,
    messageMaxLength: MESSAGE_MAX_LENGTH,
    maxUploadBytes: cfg.MAX_UPLOAD_BYTES,
    cacheSeconds: cfg.WIDGET_CONFIG_CACHE_S,
    appearance: {
      launcherEnabled: project.launcher_enabled,
      launcherText: project.launcher_text,
      accentColor: project.accent_color,
      theme: project.appearance,
      icon: project.icon,
      position: project.position,
      offsetX: project.offset_x,
      offsetY: project.offset_y,
      mobileEnabled: project.mobile_enabled,
      mobileOffsetX: project.mobile_offset_x,
      mobileOffsetY: project.mobile_offset_y,
    },
    trigger: { mode: project.trigger_mode, delayMs: project.trigger_delay_ms },
    rules,
  };
}
