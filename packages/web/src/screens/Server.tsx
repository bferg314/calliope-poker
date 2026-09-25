import { useCallback, useEffect, useState } from 'react';
import type { AdminKeyView, InstancePolicy, ServerTable } from '@calliope/shared';
import { api, ApiError } from '../api.js';
import { copyText } from '../clipboard.js';
import { Icon } from '../components/Icon.js';
import { useConfirm } from '../components/Modal.js';
import { TopBar } from '../components/TopBar.js';
import { fmtDate, fmtTime } from '../format.js';
import { Link } from '../router.js';
import { useSession } from '../session.js';
import { Num, Section } from './Settings.js';

const PHASE_LABEL: Record<string, string> = {
  lobby: 'lobby',
  playing: 'playing',
  paused: 'paused',
  'final-hand': 'last hand',
};

/** A limit that can be switched off, which the policy stores as null. */
function Limit({ label, value, fallback, onChange, unit }: {
  label: string;
  value: number | null;
  fallback: number;
  onChange: (n: number | null) => void;
  unit?: string;
}): JSX.Element {
  const on = value !== null;
  return (
    <div className="field">
      <label className="row" style={{ gap: 'var(--s-2)', flexWrap: 'nowrap' }}>
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked ? fallback : null)} />
        <span className="label" style={{ whiteSpace: 'nowrap' }}>{label}</span>
      </label>
      {on ? (
        <div className="row" style={{ flexWrap: 'nowrap', gap: 'var(--s-2)' }}>
          <input className="input num" style={{ maxWidth: 140 }} type="number" inputMode="numeric" min={1} value={value} onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))} />
          {unit && <span className="micro">{unit}</span>}
        </div>
      ) : (
        <span className="micro">no limit</span>
      )}
    </div>
  );
}

/** "12 min", "3 h", "2 d": how long a table has sat empty. */
function fmtAgo(since: number): string {
  const min = Math.max(0, Math.floor((Date.now() - since) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

function limitSummary(p: InstancePolicy): string {
  const parts = [
    p.maxTables === null ? 'no cap' : `${p.maxTables} at once`,
    `${p.maxTablesPerPerson} each`,
    p.maxTableMinutes === null ? 'no time limit' : `${p.maxTableMinutes} min each`,
  ];
  return parts.join(' · ');
}

/**
 * For the owner and admins: who may open tables, the limits on public ones,
 * every live table, and (owner only) the admin keys.
 */
export function Server(): JSX.Element {
  const { user, refreshInstance } = useSession();
  const confirm = useConfirm();
  const [policy, setPolicy] = useState<InstancePolicy | null>(null);
  const [draft, setDraft] = useState<InstancePolicy | null>(null);
  const [owned, setOwned] = useState(true);
  const [tables, setTables] = useState<ServerTable[]>([]);
  const [keys, setKeys] = useState<AdminKeyView[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [freshKey, setFreshKey] = useState<{ label: string; key: string } | null>(null);
  const [copied, setCopied] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const isOwner = user?.serverRole === 'owner';

  const load = useCallback(async () => {
    try {
      const r = await api<{ owned: boolean; policy: InstancePolicy; tables: ServerTable[] }>('GET', '/api/server');
      setOwned(r.owned);
      setPolicy(r.policy);
      setDraft((d) => d ?? r.policy);
      setTables(r.tables);
      if (isOwner) setKeys((await api<{ keys: AdminKeyView[] }>('GET', '/api/server/admins')).keys);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the server');
    }
  }, [isOwner]);

  useEffect(() => { void load(); }, [load]);

  if (!user?.serverRole) {
    return (
      <div className="page page-narrow stack">
        <TopBar />
        <h1>Running this server</h1>
        <p className="muted">This page is for the people who run this server. Enter your key on the start page first.</p>
        <Link to="/" className="btn">Back to the start</Link>
      </div>
    );
  }

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const dirty = !!draft && !!policy && JSON.stringify(draft) !== JSON.stringify(policy);
  const set = <K extends keyof InstancePolicy>(k: K, v: InstancePolicy[K]): void => {
    setSaved(false);
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  };

  const save = (): Promise<void> => run(async () => {
    const r = await api<{ policy: InstancePolicy }>('PUT', '/api/server/policy', draft);
    setPolicy(r.policy);
    setDraft(r.policy);
    setSaved(true);
    refreshInstance();
    await load();
  });

  const closeTable = async (t: ServerTable): Promise<void> => {
    const ok = await confirm({
      title: `Close ${t.name}?`,
      body: t.phase === 'lobby'
        ? 'Nothing has been dealt, so the table is simply cancelled.'
        : 'The hand being played finishes, then the night ends and everyone gets the report.',
      confirmLabel: 'Close the table',
      tone: 'danger',
    });
    if (ok) await run(async () => { await api('POST', `/api/server/rooms/${t.code}/close`); await load(); });
  };

  const makeKey = (): Promise<void> => run(async () => {
    const label = newLabel.trim();
    const r = await api<{ key: string }>('POST', '/api/server/admins', { label });
    setFreshKey({ label, key: r.key });
    setCopied(null);
    setNewLabel('');
    await load();
  });

  const revoke = async (k: AdminKeyView | null): Promise<void> => {
    const ok = await confirm({
      title: k ? `Revoke ${k.label}'s key?` : 'Revoke every admin key?',
      body: k
        ? 'Whoever entered it stops being an admin straight away, on every device.'
        : 'Every admin stops being one straight away. You can make new keys afterwards.',
      confirmLabel: 'Revoke',
      tone: 'danger',
    });
    if (!ok) return;
    await run(async () => {
      await api('DELETE', k ? `/api/server/admins/${k.id}` : '/api/server/admins');
      if (freshKey) setFreshKey(null);
      await load();
    });
  };

  const liveKeys = keys.filter((k) => k.revokedAt === null);
  const empty = tables.filter((t) => t.connected === 0 && t.phase !== 'final-hand');

  const closeEmpty = async (): Promise<void> => {
    const ok = await confirm({
      title: `Close ${empty.length === 1 ? 'the table' : `all ${empty.length} tables`} nobody is at?`,
      body: 'Tables in the lobby are cancelled. Nights in progress end with their report. Tables someone has open are left alone.',
      confirmLabel: 'Close them',
      tone: 'danger',
    });
    if (ok) await run(async () => { await api('POST', '/api/server/close-empty'); await load(); });
  };

  return (
    <div className="page page-narrow stack" style={{ maxWidth: 760 }}>
      <TopBar />
      <div className="stack">
        <h1>Running this server</h1>
        <p className="muted" style={{ margin: 0 }}>
          {isOwner ? 'You own this server.' : 'You are an admin on this server.'} Tables you open are never limited.
        </p>
      </div>
      {error && <div className="error">{error}</div>}

      {!owned && (
        <p className="panel" style={{ margin: 0 }}>
          This server has no <strong>HOST_KEY</strong>, so it is open to everyone with no limits.
        </p>
      )}

      {draft && owned && (
        <div className="settings-form">
          <Section title="Who can open tables" summary={draft.openTo === 'hosts' ? 'only the owner and admins' : 'anyone'} open>
            <label className="row" style={{ gap: 'var(--s-2)' }}>
              <input type="radio" name="openTo" checked={draft.openTo === 'hosts'} onChange={() => set('openTo', 'hosts')} />
              <span>Only the owner and admins. Everyone else joins by code or link.</span>
            </label>
            <label className="row" style={{ gap: 'var(--s-2)' }}>
              <input type="radio" name="openTo" checked={draft.openTo === 'anyone'} onChange={() => set('openTo', 'anyone')} />
              <span>Anyone, within the limits below.</span>
            </label>
          </Section>

          <Section title="Limits on public tables" summary={limitSummary(draft)} open={draft.openTo === 'anyone'}>
            <p className="micro" style={{ margin: 0 }}>
              These apply to tables opened by people without a key. A table past its time limit plays out the hand
              in progress, then ends with its report. Lowering a limit applies to tables already open. A table is
              unstarted until its first hand is dealt, and empty when nobody has it open in a browser.
            </p>
            <div className="settings-grid">
              <Limit label="tables at once" value={draft.maxTables} fallback={6} onChange={(n) => set('maxTables', n)} />
              <Num label="tables per person" value={draft.maxTablesPerPerson} min={1} disabled={false} onChange={(n) => set('maxTablesPerPerson', Math.max(1, n))} />
              <Limit label="each table lasts" value={draft.maxTableMinutes} fallback={240} unit="minutes" onChange={(n) => set('maxTableMinutes', n)} />
              <Limit label="unstarted, closes after" value={draft.lobbyIdleMinutes} fallback={30} unit="minutes" onChange={(n) => set('lobbyIdleMinutes', n)} />
              <Limit label="empty, closes after" value={draft.emptyIdleMinutes} fallback={15} unit="minutes" onChange={(n) => set('emptyIdleMinutes', n)} />
            </div>
          </Section>
          <Section
            title="Every table"
            summary={draft.abandonedHours === null ? 'kept until ended' : `ends after ${draft.abandonedHours} h with nobody there`}
          >
            <p className="micro" style={{ margin: 0 }}>
              Applies to all tables, yours and your admins&apos; included, so a table everyone walked away from is not
              kept forever. The night ends with its report, as if the host had ended it.
            </p>
            <div className="settings-grid">
              <Limit label="abandoned, ends after" value={draft.abandonedHours} fallback={24} unit="hours" onChange={(n) => set('abandonedHours', n)} />
            </div>
          </Section>
          <div className="row">
            <button className="btn btn-red" disabled={!dirty || busy} onClick={() => void save()}>Save</button>
            {dirty && <button className="btn btn-quiet" onClick={() => setDraft(policy)}>undo changes</button>}
            {saved && !dirty && <span className="micro"><Icon name="check" /> saved</span>}
          </div>
        </div>
      )}

      <div className="stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Live tables</h2>
          <div className="row">
            {empty.length > 0 && (
              <button className="btn btn-quiet btn-small" disabled={busy} onClick={() => void closeEmpty()}>
                close {empty.length === 1 ? 'the empty table' : `${empty.length} empty tables`}
              </button>
            )}
            <button className="btn btn-quiet btn-small" disabled={busy} onClick={() => void load()}>refresh</button>
          </div>
        </div>
        {tables.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No tables are open.</p>
        ) : (
          <div className="ledger-scroll">
            <table className="ledger">
              <thead>
                <tr>
                  <th>table</th>
                  <th>host</th>
                  <th>state</th>
                  <th className="num">people</th>
                  <th>closes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tables.map((t) => (
                  <tr key={t.code}>
                    <td>
                      <Link to={`/r/${t.code}`}>{t.name}</Link>
                      <div className="micro smallcaps">{t.code}{t.public ? ' · public' : ''}</div>
                    </td>
                    <td>{t.hostName}</td>
                    <td>{PHASE_LABEL[t.phase] ?? t.phase}</td>
                    <td className="num">
                      {t.connected}/{t.humans}{t.bots > 0 && <span className="micro"> +{t.bots} bot{t.bots === 1 ? '' : 's'}</span>}
                      {t.emptySince !== null && <div className="micro">empty {fmtAgo(t.emptySince)}</div>}
                    </td>
                    <td>{t.expiresAt === null ? <span className="micro">never</span> : fmtTime(t.expiresAt)}</td>
                    <td>
                      {t.phase !== 'final-hand' && (
                        <button className="btn btn-quiet btn-small" disabled={busy} onClick={() => void closeTable(t)}>close</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="micro" style={{ margin: 0 }}>People are connected / at the table.</p>
      </div>

      {isOwner && owned && (
        <div className="stack">
          <h2 style={{ margin: 0 }}>Admins</h2>
          <p className="muted" style={{ margin: 0 }}>
            Admins can do everything on this page except manage these keys. They are optional: without any, only you
            run the server. Give each person their own key, so you can revoke one without the others.
          </p>

          {freshKey && (
            <div className="panel stack">
              <div className="label">{freshKey.label}&apos;s key</div>
              <code style={{ wordBreak: 'break-all', userSelect: 'all' }}>{freshKey.key}</code>
              <p className="micro" style={{ margin: 0 }}>
                This is the only time it is shown. They enter it under <strong>I help run this server</strong> on the start page.
              </p>
              <div className="row">
                <button className="btn btn-ink btn-small" onClick={() => void copyText(freshKey.key).then(setCopied)}>
                  <Icon name="copy" /> {copied ? 'copied' : 'copy'}
                </button>
                <button className="btn btn-quiet btn-small" onClick={() => setFreshKey(null)}>done</button>
              </div>
              {copied === false && <p className="micro" style={{ margin: 0 }}>Could not copy. Select the key and copy it by hand.</p>}
            </div>
          )}

          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input
              className="input"
              value={newLabel}
              maxLength={40}
              placeholder="Who is it for?"
              aria-label="Name for the new admin key"
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newLabel.trim()) void makeKey(); }}
            />
            <button className="btn btn-ink" style={{ whiteSpace: 'nowrap' }} disabled={busy || !newLabel.trim()} onClick={() => void makeKey()}>
              <Icon name="key" /> New admin key
            </button>
          </div>

          {keys.length > 0 && (
            <div className="ledger-scroll">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>for</th>
                    <th>made</th>
                    <th>last used</th>
                    <th className="num">people</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id} style={k.revokedAt ? { opacity: 0.5 } : undefined}>
                      <td>{k.label}</td>
                      <td>{fmtDate(k.createdAt)}</td>
                      <td>{k.lastUsedAt ? fmtDate(k.lastUsedAt) : <span className="micro">never</span>}</td>
                      <td className="num">{k.holders}</td>
                      <td>
                        {k.revokedAt ? (
                          <span className="micro">revoked</span>
                        ) : (
                          <button className="btn btn-quiet btn-small" disabled={busy} onClick={() => void revoke(k)}>revoke</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {liveKeys.length > 1 && (
            <button className="btn btn-quiet btn-small" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => void revoke(null)}>
              revoke every admin key
            </button>
          )}
        </div>
      )}
    </div>
  );
}
