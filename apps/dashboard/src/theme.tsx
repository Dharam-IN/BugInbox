import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/**
 * Storage key for the *interface* theme.
 *
 * This is entirely separate from a project's widget appearance setting, which
 * lives in the database under `projects.appearance`. Changing the dashboard
 * theme never touches a project's widget configuration, and vice versa.
 */
const STORAGE_KEY = 'buginbox.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function readStoredPreference(): ThemePreference {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    // Private mode, blocked cookies or a disabled storage API: use the default.
  }
  return 'system';
}

function writeStoredPreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Persisting is a convenience. The chosen theme still applies to this page.
  }
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

function resolve(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

/** Live "does the operating system ask for dark?" flag. */
export function useSystemPrefersDark(): boolean {
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  useEffect(() => {
    let query: MediaQueryList;
    try {
      query = window.matchMedia(DARK_QUERY);
    } catch {
      return;
    }
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    setPrefersDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return prefersDark;
}

interface ThemeValue {
  /** What the person chose: light, dark, or follow the system. */
  preference: ThemePreference;
  /** What is actually being displayed right now. */
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  /** True when the preference could not be saved for next time. */
  storageUnavailable: boolean;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  // The OS preference is only consulted while "system" is selected, but the
  // listener is always attached so switching back to system is instant.
  const prefersDark = useSystemPrefersDark();

  const resolved = resolve(preference, prefersDark);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', resolved);
    // Tells the browser which palette to use for form controls and scrollbars.
    root.style.colorScheme = resolved;
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writeStoredPreference(next);
    try {
      setStorageUnavailable(window.localStorage.getItem(STORAGE_KEY) !== next);
    } catch {
      setStorageUnavailable(true);
    }
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({ preference, resolved, setPreference, storageUnavailable }),
    [preference, resolved, setPreference, storageUnavailable],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
