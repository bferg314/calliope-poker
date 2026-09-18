import { ErrorBoundary } from './components/ErrorBoundary.js';
import { ConfirmProvider } from './components/Modal.js';
import { parseRoute, RouterProvider, useRouter } from './router.js';
import { SessionProvider, useSession } from './session.js';
import { Identity } from './screens/Identity.js';
import { Landing } from './screens/Landing.js';
import { Profile } from './screens/Profile.js';
import { Room } from './screens/Room.js';

function Shell(): JSX.Element {
  const { path } = useRouter();
  const { user, loading, freshPhrase } = useSession();
  const route = parseRoute(path);
  if (loading) return <div className="page" />;
  if (!user || freshPhrase) return <Identity />;
  switch (route.name) {
    case 'landing':
      return <Landing />;
    case 'room':
      return <Room code={route.code} />;
    case 'me':
      return <Profile />;
    default:
      return (
        <div className="page page-narrow stack">
          <h1>Nothing here</h1>
          <p className="muted">That page does not exist.</p>
          <a className="btn" href="/">Back to the start</a>
        </div>
      );
  }
}

export function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <RouterProvider>
        <SessionProvider>
          <ConfirmProvider>
            <Shell />
          </ConfirmProvider>
        </SessionProvider>
      </RouterProvider>
    </ErrorBoundary>
  );
}
