import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface RouterValue {
  path: string;
  navigate: (to: string, replace?: boolean) => void;
}

const RouterContext = createContext<RouterValue>({ path: '/', navigate: () => undefined });

export function RouterProvider({ children }: { children: ReactNode }): JSX.Element {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = (): void => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((to: string, replace = false) => {
    if (replace) window.history.replaceState(null, '', to);
    else window.history.pushState(null, '', to);
    setPath(to);
    window.scrollTo(0, 0);
  }, []);
  const value = useMemo(() => ({ path, navigate }), [path, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterValue {
  return useContext(RouterContext);
}

export type Route = { name: 'landing' } | { name: 'room'; code: string } | { name: 'me' } | { name: 'not-found' };

export function parseRoute(path: string): Route {
  if (path === '/' || path === '') return { name: 'landing' };
  const room = /^\/r\/([A-Za-z0-9]{4,8})\/?$/.exec(path);
  if (room) return { name: 'room', code: room[1]!.toUpperCase() };
  if (path === '/me' || path === '/me/') return { name: 'me' };
  return { name: 'not-found' };
}

export function Link({ to, children, className }: { to: string; children: ReactNode; className?: string }): JSX.Element {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
