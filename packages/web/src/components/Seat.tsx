import type { HandPlayerView, Seat as SeatState } from '@calliope/engine';
import type { ChipDenomination } from '@calliope/shared';
import { fmt } from '../format.js';
import { Card } from './Card.js';
import { ChipStack } from './Chip.js';

interface SeatCardProps {
  seat: SeatState | null;
  player: HandPlayerView | null;
  index: number;
  isButton: boolean;
  toAct: boolean;
  timerFraction: number | null;
  connected: boolean;
  isWinner: boolean;
  winAmount: number;
  handLabel: string | null;
  denoms: ChipDenomination[];
  cardWidth: number;
  onSit?: () => void;
  onAddBot?: () => void;
}

export function SeatCard(p: SeatCardProps): JSX.Element {
  if (!p.seat) {
    return (
      <div className="seat-card empty">
        {p.onSit ? <button onClick={p.onSit}>sit here</button> : p.onAddBot ? <button onClick={p.onAddBot}>+ bot</button> : <span>open</span>}
      </div>
    );
  }
  const s = p.seat;
  const hp = p.player;
  const folded = !!hp?.folded;
  const cls = ['seat-card', p.toAct && 'to-act', folded && 'folded', s.sittingOut && !hp && 'sitting-out', p.isWinner && 'winner']
    .filter(Boolean)
    .join(' ');
  const cards = hp && !folded ? [...hp.holeDown.map((c, i) => ({ c, k: `d${i}` })), ...hp.holeUp.map((c, i) => ({ c, k: `u${i}` }))] : [];
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
      <div className="stack">
        <span className="num">{fmt(s.stack)}</span>
        {hp?.allIn && <span className="allin">all in</span>}
        {p.isWinner && p.winAmount > 0 && <span className="win-delta">+{fmt(p.winAmount)}</span>}
      </div>
      {cards.length > 0 && (
        <div className="cards">
          {cards.map(({ c, k }, i) => (
            <Card key={k} card={c} width={p.cardWidth} delay={i * 60} />
          ))}
        </div>
      )}
      {hp && hp.drew > 0 && <div className="micro">drew {hp.drew}</div>}
      {p.handLabel && <div className="micro italic">{p.handLabel}</div>}
      {hp && hp.streetBet > 0 && (
        <div className="bet">
          <ChipStack amount={hp.streetBet} denoms={p.denoms} size={16} />
          <span className="num">{fmt(hp.streetBet)}</span>
        </div>
      )}
    </div>
  );
}
