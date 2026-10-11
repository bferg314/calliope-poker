import { useEffect, useRef } from 'react';
import type { Card } from '@calliope/engine';
import { drawCommandFor, stepCard } from '../drawKeys.js';
import { usingPad } from '../gamepad.js';

interface DrawBarProps {
  /** The rules for this street's draw. */
  spec: { min: number; max: number; replace: boolean };
  selected: Card[];
  onConfirm: (cards: Card[]) => void;
  onClear: () => void;
}

/** The player's own cards as they are drawn, left to right, while they may be picked. */
function cardButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>('.own-seat .cards.selectable .card-pick:enabled')];
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

  // With a controller, the draw coming round puts you on your first card, so
  // A throws it and the D-pad walks the hand, as Check/Call does for a bet.
  useEffect(() => {
    if (usingPad()) cardButtons()[0]?.focus({ preventScroll: true });
  }, []);

  // From the keyboard: a digit picks that card, the arrows walk the hand
  // (Space picks the one you are on, as on any button), Enter does what the
  // button says, and Escape puts everything back. Listened for once, reading
  // the latest render through a ref, so no keypress lands while the listener
  // is being swapped (see ActionBar).
  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => onKeyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  onKeyRef.current = (e: KeyboardEvent): void => {
    if (document.querySelector('dialog[open]')) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    const cards = cardButtons();
    const cmd = drawCommandFor(e, cards.length);
    if (!cmd) return;
    // Enter on some other button (Put back, the menu) is that button's.
    const onOther = t instanceof HTMLButtonElement && !cards.includes(t) && !t.classList.contains('draw-go');
    if (cmd.kind === 'confirm' && onOther) return;
    e.preventDefault();
    if (cmd.kind === 'toggle') cards[cmd.index]!.click();
    else if (cmd.kind === 'move') {
      const i = stepCard(cards.indexOf(t as HTMLButtonElement), cmd.by, cards.length);
      cards[i]?.focus({ preventScroll: true });
    } else if (cmd.kind === 'confirm') {
      if (valid) onConfirm(selected);
    } else onClear();
  };

  return (
    <div className="action-bar">
      <div className="draw-hint"><strong>{spec.replace ? 'Your draw:' : 'Your discard:'}</strong> {hint}</div>
      <div className="draw-buttons">
        {n > 0 && (
          <button className="btn" onClick={onClear}>
            Put back <kbd>esc</kbd>
          </button>
        )}
        <button className={`btn draw-go grow ${loud ? 'btn-red' : ''}`} disabled={!valid} onClick={() => onConfirm(selected)}>
          {label} {valid && <kbd>enter</kbd>}
        </button>
      </div>
    </div>
  );
}
