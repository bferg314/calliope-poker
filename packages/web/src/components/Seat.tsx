import type { HandPlayerView, Seat as SeatState, WildTest } from '@calliope/engine';
import type { ChipDenomination } from '@calliope/shared';
import { fmt } from '../format.js';
import { Card } from './Card.js';
import { ChipStack } from './Chip.js';

interface SeatCardProps {
  seat: SeatState;
  player: HandPlayerView | null;
  isButton: boolean;
  toAct: boolean;
  timerFraction: number | null;
  connected: boolean;
  isWinner: boolean;
  winAmount: number;
  handLabel: string | null;
  denoms: ChipDenomination[];
  /** Width of a face-up card's tile. Face-down backs are drawn a little narrower. */
  cardWidth: number;
  /** Which cards are wild this hand, if any. */
  isWild?: WildTest;
}

/**
 * An opponent at the table (docs/design.md §4.2). Name, then stack with this
 * street's bet beside it, then their cards: face-down ones as a fan of backs,
 * face-up ones (stud up-cards, a showdown) as index tiles you can read at a glance.
 */
export function SeatCard(p: SeatCardProps): JSX.Element {
  const s = p.seat;
  const hp = p.player;
  const folded = !!hp?.folded;
  const cls = ['seat-card', p.toAct && 'to-act', folded && 'folded', s.sittingOut && !hp && 'sitting-out', p.isWinner && 'winner']
    .filter(Boolean)
    .join(' ');
  const cards = hp && !folded ? [...hp.holeDown, ...hp.holeUp] : [];
  const down = cards.filter((c) => c === null).length;
  const up = cards.filter((c): c is string => c !== null);
  // Down cards shown at the end are turned over where they lie, not dealt again.
  const turned = new Set(hp && !folded ? hp.holeDown.filter((c): c is string => c !== null) : []);
  const backWidth = Math.round(p.cardWidth * 0.8);
  return (
    <div className={cls} aria-label={`${s.name}, ${fmt(s.stack)} chips`}>
      <div className="name">
        <span>
          {s.name}
          {!p.connected && s.kind === 'human' && <span className="morse"> ·· ··</span>}
        </span>
        {p.isButton && <span className="dealer-button" title="Dealer">D</span>}
      </div>
      {p.toAct && p.timerFraction !== null && (
        <div className="timer" aria-hidden="true">
          <i style={{ width: `${Math.max(0, Math.min(100, p.timerFraction * 100))}%` }} />
        </div>
      )}
      <div className="seat-line">
        <span className="num">{fmt(s.stack)}</span>
        {hp?.allIn && <span className="allin">all in</span>}
        <span className="grow" />
        {p.isWinner && p.winAmount > 0 ? (
          <span className="win-delta">+{fmt(p.winAmount)}</span>
        ) : p.handLabel ? (
          <span className="micro italic hand">{p.handLabel}</span>
        ) : hp && hp.streetBet > 0 ? (
          // Keyed on the amount, so every bet and raise puts its chips down afresh.
          <span className="bet" key={hp.streetBet}>
            {/* Two chips at most: a seat's line must not grow taller with the bet. */}
            <ChipStack amount={hp.streetBet} denoms={p.denoms} size={14} max={2} />
            <span className="num">{fmt(hp.streetBet)}</span>
          </span>
        ) : hp && hp.drew > 0 ? (
          <span className="micro">drew {hp.drew}</span>
        ) : null}
      </div>
      {cards.length > 0 && (
        <div className="cards">
          {down > 0 && (
            <span className="fan" title={`${down} face down`}>
              {Array.from({ length: down }, (_, i) => (
                <Card key={`d${i}`} card={null} width={backWidth} delay={i * 60} />
              ))}
            </span>
          )}
          {up.length > 0 && (
            <span className="up">
              {up.map((c, i) => (
                <span key={c} className="up-slot">
                  <Card card={c} width={p.cardWidth} delay={turned.has(c) ? 0 : (down + i) * 60} mode="tile" className={turned.has(c) ? 'flip-in' : ''} wild={!!p.isWild?.(c)} />
                </span>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
