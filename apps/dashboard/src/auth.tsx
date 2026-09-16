import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, resources, type Owner } from './api.ts';

interface AuthValue {
  owner: Owner | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();

  const query = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
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

  const value: AuthValue = {
    owner: query.data ?? null,
    loading: query.isLoading,
    refresh: async () => {
      await client.invalidateQueries({ queryKey: ['me'] });
    },
    signOut: async () => {
      await resources.logout().catch(() => undefined);
      client.clear();
      await client.invalidateQueries({ queryKey: ['me'] });
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
