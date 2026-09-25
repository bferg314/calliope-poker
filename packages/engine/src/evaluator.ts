import { type Card, RANK_NAMES, RANK_PLURALS, rankOf, suitOf } from './cards.js';

/** 0 high card … 8 straight flush. */
export type HandCategory = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const CATEGORY_NAMES: readonly string[] = [
  'High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight',
  'Flush', 'Full house', 'Four of a kind', 'Straight flush',
];

export interface HandRank {
  category: HandCategory;
  /** Tiebreak ranks, most significant first. */
  ranks: number[];
  /** Higher wins; equal is a tie. */
  value: number;
  /** Human label, e.g. "Two pair, kings and fours". */
  label: string;
  /** The cards that make the hand. */
  cards: Card[];
}

function encode(category: number, ranks: readonly number[]): number {
  let v = category;
  for (let i = 0; i < 5; i++) v = v * 15 + (ranks[i] ?? 0);
  return v;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function handLabel(category: HandCategory, ranks: readonly number[]): string {
  const r = (i: number): number => ranks[i] ?? 2;
  const name = (i: number): string => RANK_NAMES[r(i)] ?? '';
  const plural = (i: number): string => RANK_PLURALS[r(i)] ?? '';
  switch (category) {
    case 8: return r(0) === 14 ? 'Royal flush' : `Straight flush, ${name(0)} high`;
    case 7: return `Four of a kind, ${plural(0)}`;
    case 6: return `Full house, ${plural(0)} full of ${plural(1)}`;
    case 5: return `Flush, ${name(0)} high`;
    case 4: return `Straight, ${name(0)} high`;
    case 3: return `Three of a kind, ${plural(0)}`;
    case 2: return `Two pair, ${plural(0)} and ${plural(1)}`;
    case 1: return `Pair of ${plural(0)}`;
    default: return `${cap(name(0))} high`;
  }
}

/**
 * Evaluate 1 to 5 cards as a poker hand. Straights and flushes only exist with
 * exactly 5 cards; with fewer cards only pairs/trips/quads/high cards are ranked.
 * Used directly for stud "showing" hands and via bestHand for full hands.
 */
export function evaluateCards(cards: readonly Card[]): HandRank {
  if (cards.length < 1 || cards.length > 5) throw new Error('evaluateCards takes 1 to 5 cards');
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const isFive = cards.length === 5;
  const firstSuit = suitOf(cards[0]!);
  const flush = isFive && cards.every((c) => suitOf(c) === firstSuit);
  let straightHigh = 0;
  if (isFive && counts.size === 5) {
    if (ranks[0]! - ranks[4]! === 4) straightHigh = ranks[0]!;
    else if (ranks[0] === 14 && ranks[1] === 5 && ranks[4] === 2) straightHigh = 5;
  }
  const g0 = groups[0]!;
  const g1 = groups[1];
  const rest = (from: number): number[] => groups.slice(from).map((g) => g[0]);

  let category: HandCategory;
  let tb: number[];
  if (straightHigh && flush) { category = 8; tb = [straightHigh]; }
  else if (g0[1] === 4) { category = 7; tb = [g0[0], ...rest(1)]; }
  else if (g0[1] === 3 && g1 && g1[1] >= 2) { category = 6; tb = [g0[0], g1[0]]; }
  else if (flush) { category = 5; tb = ranks; }
  else if (straightHigh) { category = 4; tb = [straightHigh]; }
  else if (g0[1] === 3) { category = 3; tb = [g0[0], ...rest(1)]; }
  else if (g0[1] === 2 && g1 && g1[1] === 2) { category = 2; tb = [g0[0], g1[0], ...rest(2)]; }
  else if (g0[1] === 2) { category = 1; tb = [g0[0], ...rest(1)]; }
  else { category = 0; tb = ranks; }

  return { category, ranks: tb, value: encode(category, tb), label: handLabel(category, tb), cards: [...cards] };
}

export function combinations<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const pick: T[] = [];
  const walk = (start: number): void => {
    if (pick.length === k) { out.push(pick.slice()); return; }
    for (let i = start; i <= items.length - (k - pick.length); i++) {
      pick.push(items[i]!);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  return out;
}

/** Best 5-card hand from any number of cards (1 or more). */
export function bestHand(cards: readonly Card[]): HandRank {
  if (cards.length === 0) throw new Error('bestHand needs at least one card');
  if (cards.length <= 5) return evaluateCards(cards);
  let best: HandRank | null = null;
  for (const combo of combinations(cards, 5)) {
    const h = evaluateCards(combo);
    if (!best || h.value > best.value) best = h;
  }
  return best!;
}

/** Omaha rule: exactly two hole cards and exactly three board cards. */
export function bestHandOmaha(hole: readonly Card[], board: readonly Card[]): HandRank {
  if (hole.length < 2) throw new Error('Omaha needs at least two hole cards');
  if (board.length < 3) throw new Error('Omaha needs at least three board cards');
  let best: HandRank | null = null;
  for (const h2 of combinations(hole, 2)) {
    for (const b3 of combinations(board, 3)) {
      const h = evaluateCards([...h2, ...b3]);
      if (!best || h.value > best.value) best = h;
    }
  }
  return best!;
}

/**
 * Three-card poker order, strongest last. With three cards a straight is rarer
 * than a flush and trips rarer than a straight, so they rank the other way round
 * from five-card poker. Each maps to the five-card category of the same name,
 * which is what the hand is called; `value` carries this order.
 */
const THREE_CARD_ORDER: readonly HandCategory[] = [0, 1, 5, 4, 3, 8];

/**
 * Evaluate exactly three cards by three-card rules: straight flush, three of a
 * kind, straight, flush, pair, high card. A-2-3 is the lowest straight, A-K-Q
 * the highest. Values compare only with other three-card hands.
 */
export function evaluateThree(cards: readonly Card[]): HandRank {
  if (cards.length !== 3) throw new Error('evaluateThree takes exactly 3 cards');
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]!));
  const distinct = new Set(ranks).size;
  let straightHigh = 0;
  if (distinct === 3) {
    if (ranks[0]! - ranks[2]! === 2) straightHigh = ranks[0]!;
    else if (ranks[0] === 14 && ranks[1] === 3 && ranks[2] === 2) straightHigh = 3;
  }
  let category: HandCategory;
  let tb: number[];
  if (straightHigh && flush) { category = 8; tb = [straightHigh]; }
  else if (distinct === 1) { category = 3; tb = [ranks[0]!]; }
  else if (straightHigh) { category = 4; tb = [straightHigh]; }
  else if (flush) { category = 5; tb = ranks; }
  else if (distinct === 2) {
    const pair = ranks[0] === ranks[1] ? ranks[0]! : ranks[1]!;
    category = 1;
    tb = [pair, ranks.find((r) => r !== pair)!];
  } else { category = 0; tb = ranks; }
  // A straight flush that is the top of the deck is not "royal" with three cards.
  const label = category === 8 ? `Straight flush, ${RANK_NAMES[tb[0]!]} high` : handLabel(category, tb);
  return { category, ranks: tb, value: encode(THREE_CARD_ORDER.indexOf(category), tb), label, cards: [...cards] };
}

/** Positive if a beats b, negative if b beats a, zero on a tie. */
export function compareHands(a: HandRank, b: HandRank): number {
  return a.value - b.value;
}
