import type { RoomView } from '@calliope/shared';

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
export function GameStrip({ room, note, alert = false }: { room: RoomView; note?: string | null; alert?: boolean }): JSX.Element | null {
  const hand = room.table.hand;
  const mode = room.settings.variantMode;
  const dealersChoice = mode.kind === 'dealers-choice';
  const nameOf = (id: string): string => room.variants.find((v) => v.id === id)?.name ?? id;

  let title: string;
  let sub: string | null;

  if (hand && hand.variantId) {
    title = nameOf(hand.variantId);
    sub = BETTING[hand.betting] ?? hand.betting;
  } else if (hand && hand.stage === 'choosing') {
    const chooser = hand.chooser !== null ? room.table.seats[hand.chooser]?.name : null;
    title = "Dealer's choice";
    sub = chooser ? `${chooser} is picking the game` : 'picking the game';
  } else if (dealersChoice) {
    title = "Dealer's choice";
    sub = mode.allowed.map(nameOf).join(' · ');
  } else {
    title = nameOf(mode.variantId);
    sub = BETTING[room.settings.betting] ?? null;
  }

  return (
    <div className="game-strip" aria-live="polite">
      <span className="game-name">{title}</span>
      {(note ?? sub) && <span className={`game-sub ${note && alert ? 'alert' : ''}`}>{note ?? sub}</span>}
    </div>
  );
}
