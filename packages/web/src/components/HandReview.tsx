import { type HandSummaryView, wildLabel, wildTest } from '@calliope/engine';
import { stakesLabel } from '@calliope/shared';
import { fmt } from '../format.js';
import { Card } from './Card.js';

const BETTING: Record<string, string> = { 'no-limit': 'no limit', 'pot-limit': 'pot limit', 'fixed-limit': 'fixed limit' };

/** "Ann", "Ann and Bob", "Ann, Bob and Cid". */
function names(list: string[]): string {
  return list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/**
 * A settled hand laid out to be read at leisure: the board, what everyone held
 * (folded hands stay face down, as they would at a real table), who won each
 * pot and by how much, and every action in order. Built for the payout that
 * went by too fast, so the pots are spelled out one by one.
 */
export function HandReview({ hand, variantName }: { hand: HandSummaryView; variantName: string }): JSX.Element {
  const isWild = wildTest(hand.wild);
  const wild = wildLabel(hand.wild);
  const nameOf = (seat: number): string => hand.players.find((p) => p.seat === seat)?.name ?? '?';
  const pots = hand.pots ?? [];
  const potName = (i: number): string => (pots.length > 1 ? (i === 0 ? 'Main pot' : `Side pot ${i}`) : 'Pot');

  return (
    <div className="hand-review">
      <p className="micro hand-review-sub">
        {variantName} · {BETTING[hand.betting] ?? hand.betting}
        {hand.stakes && ` · ${stakesLabel(hand.stakes)}`}
        {wild && ` · ${wild}`}
      </p>

      {hand.board.length > 0 && (
        <div className="hand-review-board" aria-label="The board">
          {hand.board.map((c) => <Card key={c} card={c} width={36} mode="tile" wild={!!isWild?.(c)} />)}
        </div>
      )}

      <ul className="hand-review-players">
        {hand.players.map((p) => {
          const cards = [...p.holeDown, ...p.holeUp];
          const won = hand.winners.some((w) => w.seat === p.seat);
          return (
            <li key={p.seat} className={`${won ? 'won' : ''} ${p.folded ? 'folded' : ''}`}>
              <span className="who">
                <span className="name">{p.name}</span>
                {hand.button === p.seat && <span className="dealer-button" title="Dealer">D</span>}
              </span>
              <span className="cards">
                {cards.map((c, i) => (
                  <Card key={`${c ?? 'x'}${i}`} card={c} width={c ? 30 : 26} mode="tile" wild={!!c && !!isWild?.(c)} title={c ? undefined : 'Not shown'} />
                ))}
              </span>
              <span className="what micro">{p.folded ? 'folded' : p.handLabel ?? (hand.showdown ? '' : 'the rest folded')}</span>
              <span className={`net num ${p.net > 0 ? 'up' : p.net < 0 ? 'down' : ''}`}>
                {p.net > 0 ? `+${fmt(p.net)}` : p.net < 0 ? `−${fmt(-p.net)}` : '±0'}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="hand-review-pots">
        {pots.length > 0
          ? pots.map((pot, i) => {
            const paid = Object.entries(pot.payouts).filter(([, a]) => a > 0);
            const split = paid.length > 1;
            return (
              <p key={i}>
                <strong>{potName(i)} {fmt(pot.amount)}</strong>
                {' · '}
                {split
                  ? `${names(paid.map(([s]) => nameOf(Number(s))))} split it: ${paid.map(([s, a]) => `${nameOf(Number(s))} ${fmt(a)}`).join(', ')}`
                  : paid.length === 1 ? `${nameOf(Number(paid[0]![0]))} takes it` : 'nobody'}
                {pots.length > 1 && <span className="micro"> (between {names(pot.eligible.map(nameOf))})</span>}
              </p>
            );
          })
          : hand.winners.map((w) => (
            <p key={w.seat}><strong>{nameOf(w.seat)}</strong> won {fmt(w.amount)}{w.handLabel ? ` with ${w.handLabel.toLowerCase()}` : ''}</p>
          ))}
      </div>

      <details className="hand-review-log">
        <summary>Every action</summary>
        <ol>
          {hand.log.map((l, i) => <li key={i} className={l.kind === 'result' ? 'result' : ''}>{l.text}</li>)}
        </ol>
      </details>
    </div>
  );
}
