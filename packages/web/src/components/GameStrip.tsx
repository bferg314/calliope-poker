import { wildLabel } from '@calliope/engine';
import type { RoomView } from '@calliope/shared';
import { Icon } from './Icon.js';

const BETTING: Record<string, string> = {
  'no-limit': 'no limit',
  'pot-limit': 'pot limit',
  'fixed-limit': 'fixed limit',
};

/**
 * What game is being played, printed across the table like a chapter heading.
 * In dealer's choice this changes hand to hand, so it is never assumed.
 *
 * It also carries what the table is waiting on (the draw, shuffling, a pause,
 * the last hand), always on one line, so the table under it never moves.
 */
export function GameStrip({ room, note, alert = false, onHelp }: {
  room: RoomView;
  note?: string | null;
  alert?: boolean;
  /** Open how to play: a "?" right after the game's name, for the game nobody at the table has played before. */
  onHelp?: () => void;
}): JSX.Element | null {
  const hand = room.table.hand;
  const mode = room.settings.variantMode;
  const dealersChoice = mode.kind === 'dealers-choice';
  const nameOf = (id: string): string => room.variants.find((v) => v.id === id)?.name ?? id;

  let title: string;
  let sub: string | null;

  // The wild cards change what every hand is worth, so they get a badge of
  // their own right after the game, for as long as the hand lasts.
  let wild: string | null;

  if (hand && hand.variantId) {
    title = nameOf(hand.variantId);
    sub = BETTING[hand.betting] ?? hand.betting;
    wild = wildLabel(hand.wild);
  } else if (hand && hand.stage === 'choosing') {
    const chooser = hand.chooser !== null ? room.table.seats[hand.chooser]?.name : null;
    title = "Dealer's choice";
    sub = chooser ? `${chooser} is picking the game` : 'picking the game';
    wild = null;
  } else if (dealersChoice) {
    title = "Dealer's choice";
    // A few games read well by name; past that the strip would run off the
    // table, so it counts them (the lobby lists them all).
    sub = mode.allowed.length <= 3 ? mode.allowed.map(nameOf).join(' · ') : `${mode.allowed.length} games`;
    wild = wildLabel(room.settings.wild);
  } else {
    title = nameOf(mode.variantId);
    sub = BETTING[room.settings.betting] ?? null;
    wild = wildLabel(room.settings.wild);
  }

  return (
    <div className="game-strip" aria-live="polite">
      <span className="game-name">{title}</span>
      {onHelp && (
        <button type="button" className="game-help hit" onClick={onHelp} aria-label={`How to play ${title}`} title="How to play">
          <Icon name="help" size={20} />
        </button>
      )}
      {wild && (
        <span className="wild-badge">
          <span className="wild-star" aria-hidden="true" />
          {wild}
        </span>
      )}
      {(note ?? sub) && <span className={`game-sub ${note && alert ? 'alert' : ''}`}>{note ?? sub}</span>}
    </div>
  );
}
