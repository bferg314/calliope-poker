import { isJoker, rankOf, type Card } from '@calliope/engine';

/**
 * A made hand in the order a player reads it: the cards that make it first
 * (the three eights before the kickers, the pair before the high cards), then
 * the rest, each high to low. Wild cards go last, since they stand in for
 * whatever the hand needs.
 */
export function readingOrder(cards: readonly Card[], isWild?: (c: Card) => boolean): Card[] {
  const wild = (c: Card): boolean => isJoker(c) || !!isWild?.(c);
  const naturals = cards.filter((c) => !wild(c));
  const count = new Map<number, number>();
  for (const c of naturals) count.set(rankOf(c), (count.get(rankOf(c)) ?? 0) + 1);
  const sorted = [...naturals].sort((a, b) => count.get(rankOf(b))! - count.get(rankOf(a))! || rankOf(b) - rankOf(a));
  return [...sorted, ...cards.filter(wild)];
}
