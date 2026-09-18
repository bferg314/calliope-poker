import type { HandView } from '@calliope/engine';
import { fmt } from '../format.js';
import { Card } from './Card.js';

export function Board({ hand, slots, cardWidth }: { hand: HandView | null; slots: number; cardWidth: number }): JSX.Element {
  const board = hand?.board ?? [];
  let pot = 0;
  let street = 0;
  if (hand) {
    for (const p of hand.players) if (p) { pot += p.committed; street += p.streetBet; }
  }
  const sidePots = hand?.results?.pots.length ? hand.results.pots : null;
  return (
    <div className="board">
      {slots > 0 && (
        <div className="cards">
          {Array.from({ length: slots }, (_, i) => {
            const c = board[i];
            return c ? <Card key={c} card={c} width={cardWidth} delay={i * 60} /> : <div key={`slot${i}`} className="slot" />;
          })}
        </div>
      )}
      {hand && (
        <div className="pot">
          <div className="label">pot</div>
          <div className="amount num">{fmt(pot + street)}</div>
          {sidePots && sidePots.length > 1 && (
            <div className="side">{sidePots.map((p) => fmt(p.amount)).join(' · ')}</div>
          )}
          {!sidePots && street > 0 && pot > 0 && <div className="side">{fmt(street)} on the table</div>}
        </div>
      )}
    </div>
  );
}
