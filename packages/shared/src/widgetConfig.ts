import type { PathRule } from './matching.js';

export type Appearance = 'light' | 'dark' | 'system';
export type LauncherIcon = 'bug' | 'chat' | 'flag' | 'help' | 'megaphone';
export type LauncherPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type TriggerMode = 'immediate' | 'delay' | 'manual';
export type ProjectStatus = 'active' | 'paused';

/** Public configuration served to widget clients. Contains no owner data. */
export interface WidgetConfig {
  projectKey: string;
  status: ProjectStatus;
  configVersion: number;
  collectPageUrl: boolean;
  messageMaxLength: number;
  maxUploadBytes: number;
  cacheSeconds: number;
  appearance: {
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
  };
  trigger: { mode: TriggerMode; delayMs: number };
  rules: PathRule[];
}

export const MESSAGE_MAX_LENGTH = 2000;
export const MESSAGE_MIN_LENGTH = 5;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const REPORTER_EMAIL_MAX_LENGTH = 254;
export const PAGE_CONTEXT_MAX_LENGTH = 200;

export const ACCENT_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
export const LAUNCHER_ICONS: LauncherIcon[] = ['bug', 'chat', 'flag', 'help', 'megaphone'];
export const LAUNCHER_POSITIONS: LauncherPosition[] = [
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
];
