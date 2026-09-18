import type { Card } from '@calliope/engine';

interface DrawBarProps {
  /** The rules for this street's draw. */
  spec: { min: number; max: number; replace: boolean };
  selected: Card[];
  onConfirm: (cards: Card[]) => void;
  onClear: () => void;
}

/** Replaces the action bar while it is this player's turn to throw cards away. */
export function DrawBar({ spec, selected, onConfirm, onClear }: DrawBarProps): JSX.Element {
  const n = selected.length;
  const valid = n >= spec.min && n <= spec.max;
  const hint = spec.replace
    ? 'Tap the cards you want to throw away, then draw.'
    : spec.min === 1 && spec.max === 1
      ? 'Tap the card you are throwing away.'
      : `Tap ${spec.min} to ${spec.max} cards to throw away.`;

  const label = spec.replace
    ? n === 0 ? 'Stand pat' : `Draw ${n}`
    : n === 0 ? 'Pick a card' : 'Throw it away';

  return (
    <div className="action-bar">
      <div className="draw-hint">{hint}</div>
      <div className="draw-buttons">
        {n > 0 && (
          <button className="btn" onClick={onClear}>
            Put back
          </button>
        )}
        <button className="btn btn-red grow" disabled={!valid} onClick={() => onConfirm(selected)}>
          {label}
        </button>
      </div>
    </div>
  );
}
