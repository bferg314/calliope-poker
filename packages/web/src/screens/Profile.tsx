import { useEffect, useState } from 'react';
import { api, ApiError } from '../api.js';
import { DeckPicker } from '../components/DeckPicker.js';
import { useConfirm } from '../components/Modal.js';
import { ResumeBanner } from '../components/ResumeBanner.js';
import { ThemePicker } from '../components/ThemePicker.js';
import { KeysPicker } from '../components/KeysPicker.js';
import { TopBar } from '../components/TopBar.js';
import { fmt, fmtDate, fmtSigned } from '../format.js';
import { useRouter } from '../router.js';
import { useSession } from '../session.js';

interface Stats {
  nights: { code: string; name: string; endedAt: string; net: number; finalStack: number; totalIn: number; handsPlayed: number }[];
  totals: { nights: number; net: number; handsPlayed: number; handsWon: number; showdownsSeen: number; showdownsWon: number; vpipHands: number; biggestPotWon: number };
}

export function Profile(): JSX.Element {
  const { user, rename, setPhrase, logout } = useSession();
  const confirm = useConfirm();
  const { navigate } = useRouter();
  const [name, setName] = useState(user?.name ?? '');
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Stats>('GET', '/api/stats/me').then(setStats).catch(() => setStats(null));
  }, []);

  if (!user) return <div className="page" />;

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

  const t = stats?.totals;
  return (
    <div className="page page-narrow" style={{ maxWidth: 720 }}>
      <TopBar />
      <ResumeBanner />
      <div className="stack" style={{ paddingTop: 'var(--s-4)' }}>
        <div className="label">your record</div>
        <h1>{user.name}</h1>
        {!user.recovered && (
          <p className="muted">
            Your stats will follow you between nights once you recover this name with your ticket at least once. Until then they live on this device.
          </p>
        )}

        <div className="settings-section">
          <h3>Name</h3>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
            <button className="btn" disabled={busy || !name.trim() || name.trim() === user.name} onClick={() => void run(() => rename(name.trim()))}>Rename</button>
          </div>
          <p className="micro">Your ticket words stay the same. Recover with the new name next time.</p>
        </div>

        <div className="settings-section">
          <h3>Ticket</h3>
          <p className="muted" style={{ margin: 0 }}>Five words that bring this record back on another device. New words are shown once, and you can choose your own from there.</p>
          <div className="row">
            <button
              className="btn"
              disabled={busy}
              onClick={() => void run(async () => {
                const ok = await confirm({
                  title: 'New ticket words?',
                  body: <p>Your old five words stop working the moment these are made. Write the new ones down before you close the page.</p>,
                  confirmLabel: 'Make new words',
                  tone: 'danger',
                });
                if (ok) await setPhrase(null);
              })}
            >
              New ticket words
            </button>
          </div>
        </div>

        <div className="settings-section">
          <h3>Look</h3>
          <ThemePicker />
          <h4 className="label deck-heading">deck</h4>
          <DeckPicker />
        </div>

        <div className="settings-section">
          <h3>Keys</h3>
          <KeysPicker />
        </div>

        <div className="settings-section">
          <h3>Lifetime</h3>
          {t && t.nights > 0 ? (
            <>
              <div className="report-cards">
                <div className="report-card"><div className="label">nights</div><div className="big num">{t.nights}</div></div>
                <div className="report-card"><div className="label">net chips</div><div className={`big num ${t.net > 0 ? 'pos' : t.net < 0 ? 'neg' : ''}`}>{fmtSigned(t.net)}</div></div>
                <div className="report-card"><div className="label">hands</div><div className="big num">{fmt(t.handsPlayed)}</div><div className="micro">{t.handsWon} won · played {t.handsPlayed ? Math.round((t.vpipHands / t.handsPlayed) * 100) : 0}%</div></div>
                <div className="report-card"><div className="label">showdowns</div><div className="big num">{t.showdownsWon}/{t.showdownsSeen}</div><div className="micro">biggest pot {fmt(t.biggestPotWon)}</div></div>
              </div>
              <table className="ledger">
                <thead>
                  <tr><th>night</th><th>table</th><th className="num">hands</th><th className="num">net</th></tr>
                </thead>
                <tbody>
                  {stats!.nights.map((n) => (
                    <tr key={n.code}>
                      <td>{fmtDate(new Date(n.endedAt).getTime())}</td>
                      <td><a href={`/r/${n.code}`} onClick={(e) => { e.preventDefault(); navigate(`/r/${n.code}`); }}>{n.name}</a></td>
                      <td className="num">{n.handsPlayed}</td>
                      <td className={`num ${n.net > 0 ? 'pos' : n.net < 0 ? 'neg' : ''}`}>{fmtSigned(n.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="muted">No finished nights yet.</p>
          )}
        </div>

        {error && <div className="error">{error}</div>}
        <div className="settings-section">
          <button
            className="btn btn-quiet"
            onClick={() => void run(async () => {
              const ok = await confirm({
                title: 'Forget you on this device?',
                body: <p>Your record stays, but the only way back to it is your name and the five ticket words. Nobody can recover them for you.</p>,
                confirmLabel: 'Forget me',
                tone: 'danger',
              });
              if (ok) { await logout(); navigate('/'); }
            })}
          >
            Forget me on this device
          </button>
        </div>
      </div>
    </div>
  );
}
