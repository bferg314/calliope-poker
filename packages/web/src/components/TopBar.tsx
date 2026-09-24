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
        {user && (
          <Link to="/me" className="btn btn-quiet btn-small">
            <Icon name="person" />
            {user.name}
          </Link>
        )}
      </div>
    </header>
  );
}
