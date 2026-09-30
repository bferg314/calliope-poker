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
    ? 'tap cards to swap, then draw.'
    : spec.min === 1 && spec.max === 1
      ? 'tap the card you are throwing away.'
      : `tap ${spec.min} to ${spec.max} cards to throw away.`;

  // Standing pat is a choice, not the default: until a card is picked the
  // button says what it keeps, and only turns red once it will draw.
  const label = spec.replace
    ? n === 0 ? `Keep all ${spec.max}` : `Draw ${n}`
    : n === 0 ? 'Pick a card' : 'Throw it away';
  const loud = !spec.replace || n > 0;

  return (
    <div className="action-bar">
      <div className="draw-hint"><strong>{spec.replace ? 'Your draw:' : 'Your discard:'}</strong> {hint}</div>
      <div className="draw-buttons">
        {n > 0 && (
          <button className="btn" onClick={onClear}>
            Put back
          </button>
        )}
        <button className={`btn draw-go grow ${loud ? 'btn-red' : ''}`} disabled={!valid} onClick={() => onConfirm(selected)}>
          {label}
        </button>
      </div>
    </div>
  );
}
