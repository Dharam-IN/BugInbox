import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, resources, type Owner } from './api.ts';

interface AuthValue {
  owner: Owner | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * A session always sets a readable `bi_csrf` cookie alongside the httpOnly
 * session cookie. If it is absent there is definitely no session, so the public
 * pages can skip the request entirely instead of provoking a 401 that browsers
 * log as a console error. A stale cookie simply falls through to the request.
 */
function hasSessionCookie(): boolean {
  try {
    return /(?:^|;\s*)bi_csrf=/.test(document.cookie);
  } catch {
    return true;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();

  const query = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      if (!hasSessionCookie()) return null;
      try {
        return (await resources.me()).owner;
      } catch (error) {
        // 401 is the normal signed-out state, not a failure to report.
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
    staleTime: 30_000,
  });

  const refresh = useCallback(async () => {
    await client.invalidateQueries({ queryKey: ['me'] });
  }, [client]);

  const signOut = useCallback(async () => {
    await resources.logout().catch(() => undefined);
    // Publish the signed-out state to the mounted observer first. Calling
    // `client.clear()` here instead would remove the query object this
    // observer is bound to, so the update never reached it and the interface
    // kept looking signed in until the next manual reload.
    client.setQueryData(['me'], null);
    // Then drop every other cached query so nothing from the previous session
    // is still in memory if someone signs in again in this tab.
    client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
  }, [client]);

  // Stable identity, so components may safely depend on the whole context value.
  const value = useMemo<AuthValue>(
    () => ({ owner: query.data ?? null, loading: query.isLoading, refresh, signOut }),
    [query.data, query.isLoading, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
