import { useState } from 'react';
import { ApiError } from '../api.js';
import { Ticket, WordSlots } from '../components/Ticket.js';
import { useSession } from '../session.js';

/**
 * First visit: a name for the evening and the five-word ticket.
 * Also shown after a phrase change so the new words are seen once.
 */
export function Identity(): JSX.Element {
  const { user, freshPhrase, create, recover, acknowledgePhrase, rename, setPhrase } = useSession();
  const [mode, setMode] = useState<'new' | 'recover' | 'custom'>('new');
  const [name, setName] = useState('');
  const [words, setWords] = useState<string[]>(['', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');

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

  if (user && freshPhrase) {
    return (
      <div className="page page-narrow stack" style={{ justifyContent: 'center' }}>
        <div className="ornament">
          <span className="italic">tonight</span>
        </div>
        <h1 style={{ textAlign: 'center' }}>
          You're{' '}
          {editingName ? (
            <input
              className="input"
              style={{ display: 'inline-block', width: 220, fontFamily: 'var(--font-display)', fontSize: '1.5rem' }}
              value={newName}
              autoFocus
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) void run(async () => { await rename(newName.trim()); setEditingName(false); });
                if (e.key === 'Escape') setEditingName(false);
              }}
              onBlur={() => { if (newName.trim() && newName.trim() !== user.name) void run(async () => { await rename(newName.trim()); setEditingName(false); }); else setEditingName(false); }}
              aria-label="Your name"
            />
          ) : (
            <button
              className="btn btn-quiet"
              style={{ fontFamily: 'var(--font-display)', fontSize: 'inherit', fontStyle: 'italic', color: 'var(--ink)', padding: '0 6px' }}
              onClick={() => { setNewName(user.name); setEditingName(true); }}
              title="Change your name"
            >
              {user.name} ✎
            </button>
          )}
        </h1>
        <Ticket words={freshPhrase} name={user.name} />
        {mode === 'custom' ? (
          <div className="stack">
            <div className="label">choose your own five words</div>
            <WordSlots value={words} onChange={setWords} />
            <div className="micro">Five different words, each at least three letters.</div>
            {error && <div className="error">{error}</div>}
            <div className="row">
              <button
                className="btn btn-ink"
                disabled={busy}
                onClick={() => void run(async () => { await setPhrase(words.map((w) => w.trim())); setMode('new'); })}
              >
                Use these words
              </button>
              <button className="btn btn-quiet" onClick={() => setMode('new')}>never mind</button>
            </div>
          </div>
        ) : (
          <div className="row">
            <button className="btn btn-ink" onClick={acknowledgePhrase}>Got it</button>
            <button className="btn" disabled={busy} onClick={() => void run(async () => { await setPhrase(null); })}>Different words</button>
            <button className="btn btn-quiet" onClick={() => setMode('custom')}>Choose my own</button>
          </div>
        )}
        {error && mode !== 'custom' && <div className="error">{error}</div>}
      </div>
    );
  }

  return (
    <div className="page page-narrow stack" style={{ justifyContent: 'center' }}>
      <div className="ornament">
        <span className="italic">Calliope Poker</span>
      </div>
      {mode === 'recover' ? (
        <>
          <h1>Welcome back</h1>
          <p className="muted">Your name from last time and the five words on your ticket.</p>
          <div className="field">
            <span className="label">name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Quiet Heron" />
          </div>
          <div className="field">
            <span className="label">five words</span>
            <WordSlots value={words} onChange={setWords} />
          </div>
          {error && <div className="error">{error}</div>}
          <div className="row">
            <button
              className="btn btn-ink"
              disabled={busy || !name.trim() || words.some((w) => w.trim().length < 3)}
              onClick={() => void run(() => recover(name.trim(), words.map((w) => w.trim())))}
            >
              Recover
            </button>
            <button className="btn btn-quiet" onClick={() => { setMode('new'); setError(null); }}>I'm new here</button>
          </div>
        </>
      ) : (
        <>
          <h1>A name for the evening</h1>
          <p className="muted">No accounts. We'll give you a name and a five-word ticket that gets your history back another night.</p>
          <div className="field">
            <span className="label">name (optional)</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Leave blank and we'll pick one" maxLength={24} />
          </div>
          {error && <div className="error">{error}</div>}
          <div className="row">
            <button className="btn btn-ink" disabled={busy} onClick={() => void run(() => create(name.trim() || undefined))}>
              Sit down
            </button>
            <button className="btn btn-quiet" onClick={() => { setMode('recover'); setError(null); }}>I have a ticket</button>
          </div>
        </>
      )}
    </div>
  );
}
