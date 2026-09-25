import type { ReactNode } from 'react';
import { Link } from '../router.js';
import { useSession } from '../session.js';
import { Icon } from './Icon.js';

export function TopBar({ right }: { right?: ReactNode }): JSX.Element {
  const { user } = useSession();
  return (
    <header className="topbar">
      <Link to="/" className="brand">Calliope Poker</Link>
      <div className="row">
        {right}
        {user?.serverRole && (
          <Link to="/server" className="btn btn-quiet btn-small" aria-label="Run this server">
            <Icon name="key" />
          </Link>
        )}
        {user && (
          <Link to="/me" className="btn btn-quiet btn-small">
            <Icon name="person" />
            <span className="topbar-name">{user.name}</span>
          </Link>
        )}
      </div>
    </header>
  );
}
