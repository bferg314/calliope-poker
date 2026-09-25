import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { HandView } from '@calliope/engine';
import type { ChipDenomination } from '@calliope/shared';
import { Chip, chipsFor } from './components/Chip.js';

/*
 * The table's motion (docs/design.md §2, Motion): cards dealt from the deck to
 * the seat, chips swept into the pot when a street ends, and the pot pushed to
 * whoever won it. All of it is read off the view the server sends; nothing
 * here decides anything, so a missed animation is only a missed animation.
 */

const reducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

interface Point { x: number; y: number }

const centre = (el: Element): Point => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/**
 * Deal every newly drawn card from the middle of the felt. Cards are plain
 * components used on other screens too, so rather than each one looking for a
 * deck, the table finds its own new cards after each render and hands them the
 * vector to fly in along (--deal-x/--deal-y); anywhere else a card keeps the
 * short drop it always had. Measured with the animation off, because the first
 * keyframe's transform is already on the card by the time it can be measured.
 *
 * A card can also be drawn afresh without being dealt: a resize that swaps a
 * picture for an index tile remounts it. So each place a card can sit (a seat
 * or the board, and its position there) is remembered for the hand, and a card
 * that turns up in a place already dealt to is simply shown.
 */
export function useDealFromDeck(root: RefObject<HTMLElement>, handNumber: number | null): void {
  const dealt = useRef({ hand: null as number | null, places: new Set<string>() });
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    if (dealt.current.hand !== handNumber) dealt.current = { hand: handNumber, places: new Set() };
    const fresh = el.querySelectorAll<HTMLElement>('.card:not([data-dealt])');
    if (fresh.length === 0) return;
    const deck = el.querySelector('.table-surface');
    const from = deck && !reducedMotion() ? centre(deck) : null;
    for (const card of fresh) {
      card.setAttribute('data-dealt', '');
      // A card turned over at the end flips where it lies; it is never dealt.
      if (card.classList.contains('flip-in')) continue;
      const holder = card.closest('[data-seat], .board');
      if (!holder) continue;
      // Backs and faces are counted apart, so stud's last down card, which
      // lands among the backs, is not taken for an up card already dealt.
      const kind = card.classList.contains('card-back') ? '.card-back' : '.card:not(.card-back)';
      const place = `${holder.getAttribute('data-seat') ?? 'board'}${kind}:${[...holder.querySelectorAll(kind)].indexOf(card)}`;
      if (dealt.current.places.has(place)) {
        card.style.animation = 'none';
        continue;
      }
      dealt.current.places.add(place);
      if (!from) continue;
      // Clearing the shorthand clears the stagger React set with it, so keep that.
      const delay = card.style.animationDelay;
      card.style.animation = 'none';
      const at = centre(card);
      card.style.setProperty('--deal-x', `${Math.round(from.x - at.x)}px`);
      card.style.setProperty('--deal-y', `${Math.round(from.y - at.y)}px`);
      card.style.animation = '';
      card.style.animationDelay = delay;
    }
  });
}

interface Flight {
  id: number;
  denom: ChipDenomination;
  from: Point;
  to: Point;
  delay: number;
  slow: boolean;
}

const CHIP = 18;
/** --d-base, which the sweep into the pot runs for before the pot is pushed. */
const SWEEP_MS = 200;

/**
 * Chips in flight: a street's bets swept into the pot when the street ends, and
 * the pot pushed to the winners when the hand settles. Where each bet sat is
 * remembered from the render before, since by the time the street has moved on
 * the bet is no longer drawn. Seats are found by `data-seat`, bets by `.bet`
 * inside them, and the pot by `.pot .amount`.
 */
export function useChipFlights(
  root: RefObject<HTMLElement>,
  hand: HandView | null,
  winAmounts: Record<number, number>,
  denoms: ChipDenomination[],
): JSX.Element | null {
  const [flights, setFlights] = useState<Flight[]>([]);
  const betAt = useRef(new Map<number, Point>());
  const prev = useRef<{ number: number; street: number; settled: boolean; bets: number[] } | null>(null);
  const nextId = useRef(0);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const was = prev.current;
    const settled = hand?.stage === 'settled';
    const bets = hand ? hand.players.map((p) => p?.streetBet ?? 0) : [];
    const pot = el.querySelector('.pot .amount');
    const added: Flight[] = [];
    const chipFor = (amount: number): ChipDenomination | undefined => chipsFor(amount, denoms, 1)[0] ?? denoms[0];

    if (hand && was && was.number === hand.number && pot && !reducedMotion()) {
      const potAt = centre(pot);
      const streetEnded = hand.streetIndex !== was.street || (settled && !was.settled);
      let swept = false;
      if (streetEnded) {
        was.bets.forEach((amount, seat) => {
          const from = betAt.current.get(seat);
          const denom = chipFor(amount);
          if (amount <= 0 || !from || !denom || (bets[seat] ?? 0) >= amount) return;
          added.push({ id: nextId.current++, denom, from, to: potAt, delay: 0, slow: false });
          swept = true;
        });
      }
      if (settled && !was.settled) {
        for (const [seat, amount] of Object.entries(winAmounts)) {
          const stack = el.querySelector(`[data-seat="${seat}"] .seat-line .num, [data-seat="${seat}"] .own-stack`);
          if (!stack || amount <= 0) continue;
          const to = centre(stack);
          chipsFor(amount, denoms, 3).forEach((denom, i) => {
            added.push({ id: nextId.current++, denom, from: potAt, to, delay: (swept ? SWEEP_MS : 0) + i * 60, slow: true });
          });
        }
      }
    }

    if (!hand || hand.number !== was?.number) betAt.current.clear();
    for (const bet of el.querySelectorAll('[data-seat] .bet')) {
      const seat = Number(bet.closest('[data-seat]')!.getAttribute('data-seat'));
      betAt.current.set(seat, centre(bet));
    }
    prev.current = hand ? { number: hand.number, street: hand.streetIndex, settled, bets } : null;
    if (added.length) setFlights((cur) => [...cur, ...added]);
  });

  if (flights.length === 0) return null;
  const land = (id: number): void => setFlights((cur) => cur.filter((f) => f.id !== id));
  return (
    <div className="chip-flights" aria-hidden="true">
      {flights.map((f) => (
        <span
          key={f.id}
          className={`chip-flight ${f.slow ? 'slow' : ''}`}
          style={{
            left: f.from.x - CHIP / 2,
            top: f.from.y - CHIP / 2,
            '--fly-x': `${Math.round(f.to.x - f.from.x)}px`,
            '--fly-y': `${Math.round(f.to.y - f.from.y)}px`,
            animationDelay: `${f.delay}ms`,
          } as CSSProperties}
          onAnimationEnd={() => land(f.id)}
        >
          <Chip denom={f.denom} size={CHIP} />
        </span>
      ))}
    </div>
  );
}
