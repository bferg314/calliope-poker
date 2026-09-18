import { useState } from 'react';
import { copyText } from '../clipboard.js';

export function Ticket({ words, name }: { words: string[]; name: string }): JSX.Element {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const copy = async (): Promise<void> => {
    if (await copyText(`${name}: ${words.join(' ')}`)) {
      setState('copied');
      setTimeout(() => setState('idle'), 1500);
    } else {
      // Blocked on a plain http address, so tell them rather than doing nothing.
      setState('manual');
    }
  };
  return (
    <div className="ticket">
      <div className="label">keep this ticket</div>
      <div className="words">
        {words.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <p className="micro" style={{ marginBottom: 8 }}>
        Type these five words with the name <strong>{name}</strong> to get your history back another night. Nobody can recover them for you.
      </p>
      <button className="btn btn-small" onClick={() => void copy()}>
        {state === 'copied' ? 'Copied' : 'Copy'}
      </button>
      {state === 'manual' && (
        <p className="micro" style={{ marginTop: 8, marginBottom: 0 }}>
          This browser will not let the page reach the clipboard. Write the words down instead.
        </p>
      )}
    </div>
  );
}

export function WordSlots({ value, onChange }: { value: string[]; onChange: (words: string[]) => void }): JSX.Element {
  return (
    <div className="word-slots">
      {Array.from({ length: 5 }, (_, i) => (
        <input
          key={i}
          className="input"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={`word ${i + 1}`}
          value={value[i] ?? ''}
          onChange={(e) => {
            const next = [...value];
            next[i] = e.target.value.toLowerCase().replace(/[^a-z-]/g, '');
            onChange(next);
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            const parts = text.toLowerCase().split(/[^a-z-]+/).filter(Boolean);
            if (parts.length >= 2) {
              e.preventDefault();
              const next = [...value];
              parts.slice(0, 5 - i).forEach((w, k) => { next[i + k] = w; });
              onChange(next);
            }
          }}
        />
      ))}
    </div>
  );
}
