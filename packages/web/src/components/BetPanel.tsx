import { useEffect, useRef, useState } from 'react';
import type { LegalActions } from '@calliope/engine';
import { fmt } from '../format.js';

interface BetPanelProps {
  legal: LegalActions;
  onConfirm: (to: number) => void;
  onCancel: () => void;
}

export function BetPanel({ legal, onConfirm, onCancel }: BetPanelProps): JSX.Element {
  const raise = legal.raise!;
  const { min, max, kind } = raise;
  const step = Math.max(1, legal.step);
  const [value, setValue] = useState(min);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(min);
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [min, max]);

  const clamp = (n: number): number => Math.max(min, Math.min(max, Math.round(n)));
  const potAfterCall = legal.potTotal + legal.toCall;
  // Preset "to" amounts: the current bet matched plus a fraction of the pot after calling.
  const currentTo = min - Math.max(legal.step, 0); // approximate the matched level
  const preset = (fraction: number): number => clamp(currentTo + Math.round((potAfterCall * fraction) / step) * step);
  const valid = Number.isInteger(value) && value >= min && value <= max;

  const submit = (): void => {
    if (valid) onConfirm(value);
  };

  return (
    <div
      className="bet-panel"
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }}
    >
      <div className="amount-row">
        <span className="label">{kind === 'bet' ? 'bet' : 'raise to'}</span>
        <input
          ref={inputRef}
          className="input num"
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          aria-label="Amount"
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.max(min, Math.min(max, value))}
        onChange={(e) => setValue(Number(e.target.value))}
        aria-label="Amount slider"
      />
      <div className="presets">
        <button className="btn" onClick={() => setValue(min)}>Min</button>
        <button className="btn" onClick={() => setValue(preset(0.5))}>½ pot</button>
        <button className="btn" onClick={() => setValue(preset(1))}>Pot</button>
        <button className="btn" onClick={() => setValue(max)}>All in</button>
      </div>
      <div className="confirm-row">
        <button className="btn btn-red" onClick={submit} disabled={!valid}>
          {kind === 'bet' ? 'Bet' : 'Raise to'} {valid ? fmt(value) : `${fmt(min)}–${fmt(max)}`}
          {valid && value === max ? ' · all in' : ''}
        </button>
        <button className="btn btn-quiet" onClick={onCancel}>cancel</button>
      </div>
    </div>
  );
}
