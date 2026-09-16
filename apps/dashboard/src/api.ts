import type { Appearance, LauncherIcon, LauncherPosition, PathRule, TriggerMode } from '@buginbox/shared';

export interface ApiErrorBody {
  code: string;
  message: string;
  fields?: Array<{ path: string; message: string }>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Array<{ path: string; message: string }>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.fields = body.fields ?? [];
  }

  fieldMessage(path: string): string | undefined {
    return this.fields.find((f) => f.path === path || f.path.startsWith(`${path}.`))?.message;
  }
}

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)bi_csrf=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
  // Double-submit CSRF token; the cookie is readable, the header is not forgeable cross-origin.
  if (method !== 'GET' && method !== 'HEAD') headers.set('x-buginbox-csrf', csrfToken());

  const response = await fetch(`/api/v1${path}`, { ...init, headers, credentials: 'same-origin' });

  if (response.status === 204) return undefined as T;

  const payload = (await response.json().catch(() => null)) as { error?: ApiErrorBody } | T | null;
  if (!response.ok) {
    const error = (payload as { error?: ApiErrorBody } | null)?.error;
    throw new ApiError(response.status, error ?? { code: 'request_failed', message: 'The request failed.' });
  }
  return payload as T;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T,>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) }),
};

// ------------------------------------------------------------------ resources

export interface Owner {
  id: string;
  email: string;
  emailVerified: boolean;
}

export interface ProjectSummary {
  id: string;
  name: string;
  publicKey: string;
  status: 'active' | 'paused';
  createdAt: string;
  reportCount: number;
  newReportCount: number;
  storageBytes: number;
  /** First configured origin, shown as the project's primary website. */
  primaryOrigin: string | null;
  latestReportAt: string | null;
}

export type RangeDays = 7 | 30;

export interface OverviewStats {
  range: { days: RangeDays; from: string | null; to: string | null; timezone: string };
  projectId: string | null;
  /** Reports created in the range; the status figures are the cohort's CURRENT status. */
  totals: { received: number; new: number; inProgress: number; resolved: number };
  daily: Array<{ date: string; count: number }>;
  lifetime: { reports: number; projects: number };
  recent: Array<{
    id: string;
    projectId: string;
    projectName: string;
    status: ReportStatus;
    excerpt: string;
    pageUrl: string | null;
    pageContext: string | null;
    hasScreenshot: boolean;
    createdAt: string;
  }>;
}

export interface ProjectAppearance {
  launcherEnabled: boolean;
  launcherText: string;
  accentColor: string;
  theme: Appearance;
  icon: LauncherIcon;
  position: LauncherPosition;
  offsetX: number;
  offsetY: number;
  mobileEnabled: boolean;
  mobileOffsetX: number;
  mobileOffsetY: number;
}

export interface Project {
  id: string;
  name: string;
  publicKey: string;
  status: 'active' | 'paused';
  notifyEmailEnabled: boolean;
  notifyEmail: string | null;
  collectPageUrl: boolean;
  retentionDays: number;
  configVersion: number;
  createdAt: string;
  updatedAt: string;
  appearance: ProjectAppearance;
  trigger: { mode: TriggerMode; delayMs: number };
  origins: string[];
  rules: PathRule[];
  usage: { reportCount: number; storageBytes: number };
}

export type ReportStatus = 'new' | 'in_progress' | 'resolved';

export interface ReportSummary {
  id: string;
  projectId: string;
  projectName: string;
  status: ReportStatus;
  excerpt: string;
  reporterEmail: string | null;
  pageUrl: string | null;
  pageContext: string | null;
  hasScreenshot: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface ReportDetail extends Omit<ReportSummary, 'excerpt'> {
  message: string;
  browser: {
    userAgent?: string;
    viewportWidth?: number;
    viewportHeight?: number;
    devicePixelRatio?: number;
    language?: string;
    timezone?: string;
    device?: 'desktop' | 'mobile';
  };
}

export const resources = {
  me: () => api.get<{ owner: Owner }>('/auth/me'),
  login: (email: string, password: string) => api.post<{ owner: Owner }>('/auth/login', { email, password }),
  signup: (email: string, password: string) => api.post<{ owner: Owner }>('/auth/signup', { email, password }),
  logout: () => api.post<{ ok: true }>('/auth/logout'),
  verifyEmail: (token: string) => api.post<{ ok: true }>('/auth/verify-email', { token }),
  resendVerification: () => api.post<{ ok: true }>('/auth/resend-verification'),
  requestPasswordReset: (email: string) => api.post<{ ok: true }>('/auth/request-password-reset', { email }),
  resetPassword: (token: string, password: string) => api.post<{ ok: true }>('/auth/reset-password', { token, password }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ ok: true }>('/auth/change-password', { currentPassword, newPassword }),

  projects: () => api.get<{ projects: ProjectSummary[] }>('/projects'),
  overview: (params: { projectId?: string; days: RangeDays }) => {
    const query = new URLSearchParams({ days: String(params.days) });
    if (params.projectId) query.set('projectId', params.projectId);
    return api.get<OverviewStats>(`/stats/overview?${query.toString()}`);
  },
  project: (id: string) => api.get<{ project: Project }>(`/projects/${id}`),
  createProject: (name: string, origins: string[]) => api.post<{ project: Project }>('/projects', { name, origins }),
  updateProject: (id: string, patch: Record<string, unknown>) =>
    api.patch<{ project: Project }>(`/projects/${id}`, patch),
  deleteProject: (id: string, confirmName: string) =>
    api.delete<{ ok: true; deletedAttachments: number }>(`/projects/${id}`, { confirmName }),
  snippet: (id: string) => api.get<{ scriptUrl: string; projectKey: string }>(`/projects/${id}/snippet`),

  reports: (params: { projectId?: string; status?: ReportStatus; before?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params.projectId) query.set('projectId', params.projectId);
    if (params.status) query.set('status', params.status);
    if (params.before) query.set('before', params.before);
    if (params.limit) query.set('limit', String(params.limit));
    const suffix = query.toString();
    return api.get<{ reports: ReportSummary[]; nextBefore: string | null }>(`/reports${suffix ? `?${suffix}` : ''}`);
  },
  reportCounts: (projectId?: string) =>
    api.get<{ counts: { new: number; in_progress: number; resolved: number; total: number } }>(
      `/reports/counts${projectId ? `?projectId=${projectId}` : ''}`,
    ),
  report: (id: string) => api.get<{ report: ReportDetail }>(`/reports/${id}`),
  setReportStatus: (id: string, status: ReportStatus) => api.patch<{ ok: true }>(`/reports/${id}`, { status }),
  deleteReport: (id: string) => api.delete<{ ok: true }>(`/reports/${id}`),
  screenshotUrl: (id: string) => `/api/v1/reports/${id}/screenshot`,
};
