import { useEffect, useState } from 'react';
import { type HandView, wildTest } from '@calliope/engine';
import type { ChipDenomination } from '@calliope/shared';
import { fmt } from '../format.js';
import { reducedMotion, SWEEP_MS } from '../tableMotion.js';
import { Card } from './Card.js';
import { ChipPile } from './Chip.js';

/** The shared cards, dealt left to right into fixed slots. Games without a board draw nothing. */
export function Board({ hand, slots, cardWidth }: { hand: HandView | null; slots: number; cardWidth: number }): JSX.Element | null {
  if (slots === 0) return null;
  const board = hand?.board ?? [];
  const isWild = wildTest(hand?.wild);
  return (
    <div className="board">
      <div className="cards">
        {Array.from({ length: slots }, (_, i) => {
          const c = board[i];
          return c ? <Card key={c} card={c} width={cardWidth} delay={i * 60} wild={!!isWild?.(c)} /> : <div key={`slot${i}`} className="slot" />;
        })}
      </div>
    </div>
  );
}

/**
 * What is in the middle: a small caps label over a large number, side pots
 * under it. The chips already swept in lie beside the number until the pot is
 * pushed to whoever won it.
 */
export function Pot({ hand, denoms }: { hand: HandView | null; denoms: ChipDenomination[] }): JSX.Element | null {
  let pot = 0;
  let street = 0;
  for (const p of hand?.players ?? []) if (p) { pot += p.committed; street += p.streetBet; }
  const settled = hand?.stage === 'settled';
  const pile = useLanded(settled ? 0 : pot);
  if (!hand) return null;
  const sidePots = hand.results?.pots.length ? hand.results.pots : null;
  return (
    <div className="pot">
      <div className="label">pot</div>
      <div className="pot-line">
        <ChipPile amount={pile} denoms={denoms} />
        <div className="amount num">{fmt(pot + street)}</div>
      </div>
      {sidePots && sidePots.length > 1 && <div className="side">{sidePots.map((p) => fmt(p.amount)).join(' · ')}</div>}
      {!sidePots && street > 0 && pot > 0 && <div className="side">{fmt(street)} on the table</div>}
    </div>
  );
}

/**
 * The pile's amount, raised only once the chips swept in at a street's end
 * have landed on it. Emptying it (the pot pushed, a new hand) is immediate.
 */
function useLanded(amount: number): number {
  const [shown, setShown] = useState(amount);
  useEffect(() => {
    if (amount <= shown || reducedMotion()) {
      setShown(amount);
      return;
    }
    const t = window.setTimeout(() => setShown(amount), SWEEP_MS);
    return () => window.clearTimeout(t);
  }, [amount, shown]);
  return amount < shown ? amount : shown;
}
