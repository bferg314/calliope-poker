import { useEffect, useState } from 'react';
import { currentKeys, isActionKey, presetOf, PRESETS, setKeys, type KeyMap, type TableAction } from '../keys.js';

const ACTIONS: { id: TableAction; name: string }[] = [
  { id: 'fold', name: 'Fold' },
  { id: 'call', name: 'Check or call' },
  { id: 'raise', name: 'Bet or raise' },
];

/**
 * Which keys act at the table. Three sets to pick from (the left hand's home
 * row, the right hand's, and the letters of the words), or any three of your
 * own: pick an action, then press its key.
 */
export function KeysPicker(): JSX.Element {
  const [keys, setLocal] = useState<KeyMap>(currentKeys);
  const [listening, setListening] = useState<TableAction | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const preset = presetOf(keys);

  const choose = (next: KeyMap): void => {
    setLocal(next);
    setKeys(next);
  };

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.key === 'Tab') return;
      e.preventDefault();
      if (e.key === 'Escape') { setListening(null); setNote(null); return; }
      const k = e.key.toLowerCase();
      if (!isActionKey(k)) { setNote('Use a letter or a number.'); return; }
      const clash = ACTIONS.find((a) => a.id !== listening && keys[a.id] === k);
      if (clash) { setNote(`${k.toUpperCase()} already means ${clash.name.toLowerCase()}.`); return; }
      choose({ ...keys, [listening]: k });
      setListening(null);
      setNote(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listening, keys]);

  return (
    <div className="keys-picker">
      <div className="keys-presets" role="radiogroup" aria-label="Keys">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={preset === p.id}
            className={`btn ${preset === p.id ? 'btn-ink' : ''}`}
            onClick={() => { choose(p.keys); setListening(null); setNote(null); }}
          >
            <span className="keys-letters">{p.id}</span>
          </button>
        ))}
        <span className={`keys-custom micro ${preset === 'custom' ? 'on' : ''}`}>{preset === 'custom' ? 'your own' : 'or your own:'}</span>
      </div>
      <div className="keys-actions">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`keys-action ${listening === a.id ? 'listening' : ''}`}
            onClick={() => { setListening(listening === a.id ? null : a.id); setNote(null); }}
            aria-label={`${a.name}: ${keys[a.id].toUpperCase()}. Press to change.`}
          >
            <kbd>{listening === a.id ? '…' : keys[a.id]}</kbd>
            <span className="micro">{listening === a.id ? 'press a key' : a.name}</span>
          </button>
        ))}
      </div>
      <p className="micro" role="status">{note ?? 'At the table, these act when it is your turn. Kept on this device.'}</p>
    </div>
  );
}
