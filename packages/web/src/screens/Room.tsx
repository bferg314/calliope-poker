import { useEffect, useState } from 'react';
import { api, ApiError } from '../api.js';
import { TopBar } from '../components/TopBar.js';
import { useRouter } from '../router.js';
import { useSession } from '../session.js';
import { useRoomSocket } from '../ws.js';
import { Lobby } from './Lobby.js';
import { Report } from './Report.js';
import { Table } from './Table.js';

interface PublicInfo {
  code: string;
  name: string;
  hasPassword: boolean;
  phase: string;
  players: number;
  hostName: string;
  isMember: boolean;
}

export function Room({ code }: { code: string }): JSX.Element {
  const { navigate } = useRouter();
  const { user } = useSession();
  const [info, setInfo] = useState<PublicInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [member, setMember] = useState(false);
  const [password, setPassword] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setInfo(null);
    setMember(false);
    api<PublicInfo>('GET', `/api/rooms/${code}`)
      .then((r) => {
        setInfo(r);
        setMember(r.isMember);
      })
      .catch((e) => setInfoError(e instanceof ApiError ? e.message : 'Could not reach the table'));
  }, [code, user?.id]);

  const socket = useRoomSocket(code, member);

  const join = async (): Promise<void> => {
    setBusy(true);
    setJoinError(null);
    try {
      await api('POST', `/api/rooms/${code}/join`, password ? { password } : {});
      setMember(true);
    } catch (e) {
      setJoinError(e instanceof ApiError ? e.message : 'Could not join');
    } finally {
      setBusy(false);
    }
  };

  if (infoError) {
    return (
      <div className="page page-narrow stack">
        <TopBar />
        <h1>No table here</h1>
        <p className="muted">
          {infoError} It may have been cancelled by whoever opened it.
        </p>
        <button className="btn" onClick={() => navigate('/')}>Back to the start</button>
      </div>
    );
  }

  if (socket.fatal?.code === 'cancelled') {
    return (
      <div className="page page-narrow stack">
        <TopBar />
        <div className="stack" style={{ flex: 1, justifyContent: 'center' }}>
          <div className="ornament">
            <span className="italic">called off</span>
          </div>
          <h1>The host cancelled this table</h1>
          <p className="muted">
            Nothing was dealt and nobody is out of pocket. Ask them for a new link when they open another one.
          </p>
          <div className="row">
            <button className="btn btn-ink" onClick={() => navigate('/')}>Back to the start</button>
          </div>
        </div>
      </div>
    );
  }

  if (!info) return <div className="page page-narrow"><TopBar /></div>;

  if (!member || socket.fatal) {
    return (
      <div className="page page-narrow stack">
        <TopBar />
        <div className="stack" style={{ flex: 1, justifyContent: 'center' }}>
          <div className="label">table {info.code}</div>
          <h1>{info.name}</h1>
          <p className="muted">
            Hosted by {info.hostName}. {info.players} at the table.
            {info.phase === 'ended' && ' This night has ended.'}
          </p>
          {socket.fatal && <div className="error">{socket.fatal.message}</div>}
          {info.phase !== 'ended' && (
            <>
              {info.hasPassword && (
                <div className="field">
                  <span className="label">password</span>
                  <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') void join(); }} />
                </div>
              )}
              {joinError && <div className="error">{joinError}</div>}
              <div className="row">
                <button className="btn btn-red" disabled={busy} onClick={() => void join()}>
                  Sit down at this table
                </button>
                <button className="btn btn-quiet" onClick={() => navigate('/')}>not now</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const room = socket.room;
  if (!room) {
    return (
      <div className="page page-narrow">
        <TopBar />
        <p className="muted" style={{ padding: 'var(--s-6) 0' }}>{socket.status === 'closed' ? 'Reconnecting…' : 'Taking your seat…'}</p>
      </div>
    );
  }

  if (room.phase === 'lobby') return <Lobby room={room} socket={socket} />;
  if (room.phase === 'ended') return <Report room={room} />;
  return <Table room={room} socket={socket} />;
}
