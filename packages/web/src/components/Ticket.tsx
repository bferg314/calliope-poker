import { useState } from 'react';

export function Ticket({ words, name }: { words: string[]; name: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(`${name}: ${words.join(' ')}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
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
        {copied ? 'Copied' : 'Copy'}
      </button>
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
