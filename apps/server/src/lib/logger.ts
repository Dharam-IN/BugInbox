import { config } from '../config.ts';

type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const level = (process.env.LOG_LEVEL ?? 'info') as Level;
  return ORDER[level] ?? ORDER.info;
}

function emit(level: Level, payload: Record<string, unknown>): void {
  if (ORDER[level] < threshold()) return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), ...payload });
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

/**
 * Structured logger. Report bodies, reporter emails, screenshot contents,
 * passwords, session tokens and verification tokens are never passed to it.
 */
export const logger = {
  debug: (payload: Record<string, unknown>) => emit('debug', payload),
  info: (payload: Record<string, unknown>) => emit('info', payload),
  warn: (payload: Record<string, unknown>) => emit('warn', payload),
  error: (payload: Record<string, unknown>) => emit('error', payload),
};

export function isProduction(): boolean {
  return config().NODE_ENV === 'production';
}
