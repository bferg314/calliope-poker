import { useState } from 'react';
import { api, ApiError } from '../api.js';
import { ResumeBanner } from '../components/ResumeBanner.js';
import { TopBar } from '../components/TopBar.js';
import { useRouter } from '../router.js';
import { useSession } from '../session.js';

export function Landing(): JSX.Element {
  const { navigate } = useRouter();
  const { user, restricted, canOpenTables, claimHost } = useSession();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [hostKey, setHostKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ code: string }>('POST', '/api/rooms', {
        name: name.trim() || undefined,
        password: password || undefined,
      });
      navigate(`/r/${r.code}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create a table');
    } finally {
      setBusy(false);
    }
  };

  const claim = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await claimHost(hostKey.trim());
      setClaiming(false);
      setHostKey('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not unlock');
    } finally {
      setBusy(false);
    }
  };

  const join = (): void => {
    const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length < 4) return;
    navigate(`/r/${c}`);
  };

  return (
    <div className="page page-narrow">
      <TopBar />
      <ResumeBanner />
      <div className="stack" style={{ flex: 1, justifyContent: 'center', padding: 'var(--s-6) 0' }}>
        <div className="ornament">
          <span className="italic">est. tonight</span>
        </div>
        <h1 className="display" style={{ textAlign: 'center' }}>Calliope Poker</h1>
        <p className="muted" style={{ textAlign: 'center' }}>
          Rooms are private. No accounts, just a name for the evening.
          {user && (
            <>
              {' '}You're <strong>{user.name}</strong>.
            </>
          )}
        </p>
        <hr className="rule-double" />
        {creating ? (
          <div className="stack">
            <h2>Deal a new table</h2>
            <div className="field">
              <span className="label">table name (optional)</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={`${user?.name ?? 'Someone'}'s table`} maxLength={24} />
            </div>
            <div className="field">
              <span className="label">password (optional)</span>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
            </div>
            {error && <div className="error">{error}</div>}
            <div className="row">
              <button className="btn btn-red" disabled={busy} onClick={() => void create()}>Open the table</button>
              <button className="btn btn-quiet" onClick={() => setCreating(false)}>back</button>
            </div>
          </div>
        ) : (
          <div className="stack">
            {canOpenTables ? (
              <button className="btn btn-red" style={{ minHeight: 56 }} onClick={() => setCreating(true)}>
                Deal a new table
              </button>
            ) : claiming ? (
              <div className="panel stack">
                <div className="label">the host key</div>
                <p className="micro" style={{ margin: 0 }}>
                  It is the <strong>HOST_KEY</strong> from the <code>.env</code> file on the machine running this server.
                </p>
                <input
                  className="input"
                  type="password"
                  value={hostKey}
                  autoFocus
                  autoComplete="off"
                  onChange={(e) => setHostKey(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void claim(); }}
                  aria-label="Host key"
                />
                {error && <div className="error">{error}</div>}
                <div className="row">
                  <button className="btn btn-ink" disabled={busy || !hostKey} onClick={() => void claim()}>Unlock</button>
                  <button className="btn btn-quiet" onClick={() => { setClaiming(false); setError(null); }}>never mind</button>
                </div>
              </div>
            ) : (
              <div className="panel stack">
                <p style={{ margin: 0 }}>
                  Tables on this server are opened by whoever runs it. Ask them for a room code or a link, and you can
                  sit down and play.
                </p>
                <button className="btn btn-quiet btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => setClaiming(true)}>
                  I run this server
                </button>
              </div>
            )}
            <div className="ornament">
              <span className="micro">{canOpenTables ? 'or' : 'join a table'}</span>
            </div>
            <div className="field">
              <span className="label">join with a code</span>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input
                  className="input code-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  onKeyDown={(e) => { if (e.key === 'Enter') join(); }}
                  placeholder="K7Q2M4"
                  maxLength={6}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="Room code"
                />
                <button className="btn btn-ink" onClick={join} disabled={code.length < 4}>Join</button>
              </div>
            </div>
          </div>
        )}
      </div>
      {restricted && canOpenTables && (
        <p className="micro" style={{ textAlign: 'center' }}>
          This server is set to host only. Other people can join your tables but cannot open their own.
        </p>
      )}
      <p className="folio" style={{ textAlign: 'center' }}>
        Hold'em · Omaha · Pineapple · Seven-card stud · Five-card stud · Five-card draw · Dealer's choice
      </p>
    </div>
  );
}
