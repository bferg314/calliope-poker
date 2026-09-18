import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api.js';

export interface User {
  id: string;
  name: string;
  recovered: boolean;
  createdAt: number;
  /** This identity may open tables on this server. */
  canOpenTables: boolean;
}

interface SessionValue {
  user: User | null;
  loading: boolean;
  /** This server only lets its owner open tables. */
  restricted: boolean;
  /** Whether this person can open a table here. */
  canOpenTables: boolean;
  /** Prove you run this server by entering its host key. */
  claimHost: (key: string) => Promise<void>;
  /** A phrase that was just created or changed and must be shown once. */
  freshPhrase: string[] | null;
  create: (name?: string) => Promise<void>;
  recover: (name: string, words: string[]) => Promise<void>;
  rename: (name: string) => Promise<void>;
  setPhrase: (words: string[] | null) => Promise<string[]>;
  acknowledgePhrase: () => void;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [restricted, setRestricted] = useState(false);
  const [freshPhrase, setFreshPhrase] = useState<string[] | null>(null);

  useEffect(() => {
    api<{ restricted: boolean }>('GET', '/api/instance')
      .then((r) => setRestricted(r.restricted))
      .catch(() => setRestricted(false));
    api<{ user: User }>('GET', '/api/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const create = useCallback(async (name?: string) => {
    const r = await api<{ user: User; phrase: string[] }>('POST', '/api/auth/new', name ? { name } : {});
    setUser(r.user);
    setFreshPhrase(r.phrase);
  }, []);

  const recover = useCallback(async (name: string, words: string[]) => {
    const r = await api<{ user: User }>('POST', '/api/auth/recover', { name, phrase: words });
    setUser(r.user);
    setFreshPhrase(null);
  }, []);

  const rename = useCallback(async (name: string) => {
    const r = await api<{ user: User }>('PATCH', '/api/me', { name });
    setUser(r.user);
  }, []);

  const setPhrase = useCallback(async (words: string[] | null) => {
    const r = await api<{ phrase: string[] }>('POST', '/api/me/phrase', words ? { phrase: words } : {});
    setFreshPhrase(r.phrase);
    return r.phrase;
  }, []);

  const claimHost = useCallback(async (key: string) => {
    const r = await api<{ user: User }>('POST', '/api/auth/claim-host', { key });
    setUser(r.user);
  }, []);

  const acknowledgePhrase = useCallback(() => setFreshPhrase(null), []);

  const logout = useCallback(async () => {
    await api('POST', '/api/auth/logout');
    setUser(null);
    setFreshPhrase(null);
  }, []);

  const canOpenTables = !restricted || !!user?.canOpenTables;
  const value = useMemo(
    () => ({
      user, loading, restricted, canOpenTables, freshPhrase,
      create, recover, rename, setPhrase, claimHost, acknowledgePhrase, logout,
    }),
    [user, loading, restricted, canOpenTables, freshPhrase, create, recover, rename, setPhrase, claimHost, acknowledgePhrase, logout],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}
