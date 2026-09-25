import { type Card, isJoker, RANK_PLURALS, rankOf } from './cards.js';

/**
 * Which cards are wild this hand. "Anything goes": a wild card stands for any
 * card at all, even one already in the hand, so two aces of spades make a
 * flush and five of a kind beats a straight flush.
 */
export type Wild =
  | { kind: 'none' }
  | { kind: 'jokers' }
  | { kind: 'deuces' }
  | { kind: 'one-eyed-jacks' }
  | { kind: 'rank'; rank: number };

export type WildTest = (card: Card) => boolean;

export const NO_WILD: Wild = { kind: 'none' };

export function isWildSpec(x: unknown): x is Wild {
  if (typeof x !== 'object' || x === null) return false;
  const w = x as { kind?: unknown; rank?: unknown };
  if (w.kind === 'rank') return Number.isInteger(w.rank) && (w.rank as number) >= 2 && (w.rank as number) <= 14;
  return w.kind === 'none' || w.kind === 'jokers' || w.kind === 'deuces' || w.kind === 'one-eyed-jacks';
}

/** Jokers are only ever in the deck when they are the wild cards. */
export function dealsJokers(w: Wild | null | undefined): boolean {
  return w?.kind === 'jokers';
}

/** A test for wild cards, or undefined when nothing is wild. Jokers are always wild when dealt. */
export function wildTest(w: Wild | null | undefined): WildTest | undefined {
  switch (w?.kind) {
    case 'jokers': return isJoker;
    case 'deuces': return (c) => isJoker(c) || rankOf(c) === 2;
    case 'one-eyed-jacks': return (c) => isJoker(c) || c === 'Jh' || c === 'Js';
    case 'rank': { const r = w.rank; return (c) => isJoker(c) || rankOf(c) === r; }
    default: return undefined;
  }
}

/** "deuces wild", "one-eyed jacks wild", "sevens wild"; null when nothing is. */
export function wildLabel(w: Wild | null | undefined): string | null {
  switch (w?.kind) {
    case 'jokers': return 'jokers wild';
    case 'deuces': return 'deuces wild';
    case 'one-eyed-jacks': return 'one-eyed jacks wild';
    case 'rank': return `${RANK_PLURALS[w.rank] ?? 'cards'} wild`;
    default: return null;
  }
}
