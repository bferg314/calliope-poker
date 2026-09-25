/**
 * Cards are two-character strings: rank then suit.
 * Ranks: 2-9, T, J, Q, K, A. Suits: c, d, h, s. Example: "As", "Td", "9c".
 * The two jokers are "*1" and "*2"; they have no rank or suit, and are only
 * ever dealt when jokers are wild (see wild.ts).
 * Strings keep snapshots small and JSON-friendly; helpers below decode them.
 */
export type Suit = 'c' | 'd' | 'h' | 's';
export type Card = string;

export const SUITS: readonly Suit[] = ['c', 'd', 'h', 's'];
export const RANK_CHARS = '23456789TJQKA';
/** Suit order used only to break ties for the stud bring-in (clubs lowest). */
export const SUIT_ORDER: Record<Suit, number> = { c: 0, d: 1, h: 2, s: 3 };

export const RANK_NAMES: Record<number, string> = {
  2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight',
  9: 'nine', 10: 'ten', 11: 'jack', 12: 'queen', 13: 'king', 14: 'ace',
};
export const RANK_PLURALS: Record<number, string> = {
  2: 'twos', 3: 'threes', 4: 'fours', 5: 'fives', 6: 'sixes', 7: 'sevens', 8: 'eights',
  9: 'nines', 10: 'tens', 11: 'jacks', 12: 'queens', 13: 'kings', 14: 'aces',
};
export const SUIT_NAMES: Record<Suit, string> = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
export const SUIT_SYMBOLS: Record<Suit, string> = { c: '♣', d: '♦', h: '♥', s: '♠' };

export const JOKERS: readonly Card[] = ['*1', '*2'];

export function isJoker(card: Card): boolean {
  return card === '*1' || card === '*2';
}

export function isCard(x: unknown): x is Card {
  if (typeof x === 'string' && isJoker(x)) return true;
  return (
    typeof x === 'string' &&
    x.length === 2 &&
    RANK_CHARS.includes(x.charAt(0)) &&
    (SUITS as readonly string[]).includes(x.charAt(1))
  );
}

export function rankOf(card: Card): number {
  const i = RANK_CHARS.indexOf(card.charAt(0));
  if (i < 0) throw new Error(`Invalid card: ${card}`);
  return i + 2;
}

export function suitOf(card: Card): Suit {
  const s = card.charAt(1) as Suit;
  if (!(s in SUIT_ORDER)) throw new Error(`Invalid card: ${card}`);
  return s;
}

export function makeCard(rank: number, suit: Suit): Card {
  if (rank < 2 || rank > 14) throw new Error(`Invalid rank: ${rank}`);
  return `${RANK_CHARS.charAt(rank - 2)}${suit}`;
}

export function cardLabel(card: Card): string {
  if (isJoker(card)) return 'Joker';
  const name = RANK_NAMES[rankOf(card)] ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} of ${SUIT_NAMES[suitOf(card)]}`;
}

/**
 * The 52-card deck in a fixed order (clubs 2..A, diamonds, hearts, spades),
 * with up to two jokers after it.
 */
export function fullDeck(jokers = 0): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (let r = 2; r <= 14; r++) deck.push(makeCard(r, s));
  deck.push(...JOKERS.slice(0, jokers));
  return deck;
}

/** A whole pack: all 52 cards once each, and at most the two jokers. */
export function isFullDeck(cards: readonly unknown[]): cards is Card[] {
  if (cards.length < 52 || cards.length > 52 + JOKERS.length) return false;
  const seen = new Set<string>();
  for (const c of cards) {
    if (!isCard(c) || seen.has(c)) return false;
    seen.add(c);
  }
  return true;
}

/** Returns an integer in [0, n). The server supplies a crypto-backed one; tests use mulberry32. */
export type Rng = (n: number) => number;

/** Fisher-Yates. Returns a new array; the input is not modified. */
export function shuffle(cards: readonly Card[], rng: Rng): Card[] {
  const a = cards.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

/** Small, fast seeded PRNG. Only for tests and bots; never for real shuffles. */
export function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return (n: number) => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    const r = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    return Math.floor(r * n);
  };
}

export function seededDeck(seed: number): Card[] {
  return shuffle(fullDeck(), mulberry32(seed));
}
