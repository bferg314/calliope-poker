import { bestHand, evaluateCards, evaluateThree, getVariant, rankOf, suitOf, wildTest, type Card, type TableState } from '@calliope/engine';

/** Ranks that appear more than once, most repeated first. */
function groups(cards: readonly Card[]): { rank: number; cards: Card[] }[] {
  const byRank = new Map<number, Card[]>();
  for (const c of cards) {
    const r = rankOf(c);
    byRank.set(r, [...(byRank.get(r) ?? []), c]);
  }
  return [...byRank.entries()]
    .map(([rank, cs]) => ({ rank, cards: cs }))
    .sort((a, b) => b.cards.length - a.cards.length || b.rank - a.rank);
}

/** Four cards of one suit, if there are any. */
function fourFlush(cards: readonly Card[]): Card[] | null {
  for (const suit of ['c', 'd', 'h', 's']) {
    const of = cards.filter((c) => suitOf(c) === suit);
    if (of.length === 4) return of;
  }
  return null;
}

/** Four cards inside a five-rank window, if there are any. */
function fourStraight(cards: readonly Card[]): Card[] | null {
  const byRank = new Map<number, Card>();
  for (const c of cards) {
    byRank.set(rankOf(c), c);
    if (rankOf(c) === 14) byRank.set(1, c); // the wheel
  }
  for (let low = 1; low <= 10; low++) {
    const run: Card[] = [];
    for (let r = low; r < low + 5; r++) {
      const card = byRank.get(r);
      if (card) run.push(card);
    }
    if (run.length === 4) return [...new Set(run)];
  }
  return null;
}

/**
 * Classic five-card draw practice: keep anything already made, keep four to a
 * flush or a straight, otherwise keep the pair or the trips and take fresh cards
 * for the rest. With nothing at all, keep an ace if there is one.
 */
export function drawKeep(hole: readonly Card[]): Card[] {
  if (hole.length < 5) return [...hole];
  const made = evaluateCards(hole.slice(0, 5));
  // Straight or better is worth standing pat on.
  if (made.category >= 4) return [...hole];
  if (made.category === 3) return groups(hole)[0]!.cards; // trips: draw two
  if (made.category === 2) {
    const g = groups(hole);
    return [...g[0]!.cards, ...g[1]!.cards]; // two pair: draw one
  }

  const flush = fourFlush(hole);
  if (flush) return flush;
  const straight = fourStraight(hole);
  if (straight) return straight;

  if (made.category === 1) return groups(hole)[0]!.cards; // a pair: draw three
  const ace = hole.find((c) => rankOf(c) === 14);
  return ace ? [ace] : [];
}

/**
 * Three-card draw: stand pat on a flush or better, keep a pair, keep two to a
 * straight flush, otherwise keep a queen or better and draw to it.
 */
export function drawKeepThree(hole: readonly Card[]): Card[] {
  const made = evaluateThree(hole);
  if (made.category >= 3) return [...hole];
  if (made.category === 1) return groups(hole)[0]!.cards;
  for (let i = 0; i < hole.length; i++) {
    for (let j = i + 1; j < hole.length; j++) {
      const a = hole[i]!;
      const b = hole[j]!;
      const gap = Math.abs(rankOf(a) - rankOf(b));
      if (suitOf(a) === suitOf(b) && gap >= 1 && gap <= 2) return [a, b];
    }
  }
  const high = [...hole].sort((a, b) => rankOf(b) - rankOf(a))[0]!;
  return rankOf(high) >= 12 ? [high] : [];
}

/**
 * Which cards a bot throws away. Returns an empty list when the street has no
 * draw, or when standing pat is allowed and best.
 */
export function chooseDiscards(state: TableState, seat: number): Card[] {
  const h = state.hand;
  if (!h || h.stage !== 'discarding') return [];
  const p = h.players[seat];
  if (!p) return [];
  const spec = getVariant(h.variantId).streets[h.streetIndex]?.draw;
  if (!spec) return [];

  const hole = p.holeDown;
  // A wild card is never thrown away. To the keep rules it reads as an ace.
  const isWild = wildTest(h.wild);
  if (spec.replace) {
    const shown = hole.map((c) => (isWild?.(c) ? 'As' : c));
    const keep = hole.length === 3 ? drawKeepThree(shown) : drawKeep(shown);
    const left = [...keep];
    const kept = new Set<number>();
    shown.forEach((c, i) => {
      const at = left.indexOf(c);
      if (at >= 0) { left.splice(at, 1); kept.add(i); }
    });
    const toss = hole.filter((c, i) => !kept.has(i) && !isWild?.(c));
    return toss.slice(0, spec.max);
  }

  // Pineapple: throw whichever card leaves the best hand against the board.
  let best: { card: Card; value: number } | null = null;
  for (const card of hole) {
    if (isWild?.(card)) continue;
    const kept = hole.filter((c) => c !== card);
    const pool = [...kept, ...h.board];
    const value = pool.length ? bestHand(pool, isWild).value : -rankOf(card);
    if (!best || value > best.value) best = { card, value };
  }
  return best ? [best.card] : hole.slice(0, spec.min);
}
