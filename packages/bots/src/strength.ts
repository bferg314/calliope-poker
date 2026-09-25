import {
  bestHand, bestHandOmaha, dealsJokers, evaluateCards, evaluateThree, fullDeck, getVariant, rankOf, suitOf, wildTest,
  type Card, type HandRank, type TableState, type WildTest,
} from '@calliope/engine';

const clamp = (x: number): number => Math.max(0, Math.min(1, x));

/**
 * The rule-of-thumb helpers below read ranks and suits, and a joker has
 * neither. To them a wild card is an ace of spades: a fair guess at what it
 * will be, and never an error. The hand itself is still ranked properly.
 */
function natural(cards: readonly Card[], isWild: WildTest | undefined): Card[] {
  return isWild ? cards.map((c) => (isWild(c) ? 'As' : c)) : [...cards];
}

/** Chen formula for two hold'em cards, mapped to 0..1. */
export function chenStrength(a: Card, b: Card): number {
  const ra = rankOf(a);
  const rb = rankOf(b);
  const hi = Math.max(ra, rb);
  const lo = Math.min(ra, rb);
  const score = (r: number): number => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);
  let pts = score(hi);
  if (ra === rb) pts = Math.max(5, pts * 2);
  else {
    if (suitOf(a) === suitOf(b)) pts += 2;
    const gap = hi - lo - 1;
    pts -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
    if (gap <= 1 && hi < 12) pts += 1;
  }
  return clamp((pts + 1) / 21);
}

function preflopStrength(hole: readonly Card[], variantId: string): number {
  if (hole.length === 2) return chenStrength(hole[0]!, hole[1]!);
  // Omaha and friends: average of the best three two-card combinations, with a small
  // bonus for being double suited.
  const scores: number[] = [];
  for (let i = 0; i < hole.length; i++) for (let j = i + 1; j < hole.length; j++) scores.push(chenStrength(hole[i]!, hole[j]!));
  scores.sort((a, b) => b - a);
  const top = scores.slice(0, 3);
  let s = top.reduce((a, b) => a + b, 0) / top.length;
  const suits = new Map<string, number>();
  for (const c of hole) suits.set(suitOf(c), (suits.get(suitOf(c)) ?? 0) + 1);
  const suitedPairs = [...suits.values()].filter((n) => n >= 2).length;
  if (suitedPairs >= 2) s += 0.06;
  if (variantId === 'omaha') s *= 0.9; // four cards make everyone look good preflop
  return clamp(s);
}

function usesHole(made: HandRank, hole: readonly Card[]): boolean {
  return made.cards.some((c) => hole.includes(c));
}

function madeStrength(made: HandRank, hole: readonly Card[], board: readonly Card[]): number {
  const boardRanks = board.map(rankOf);
  const topBoard = boardRanks.length ? Math.max(...boardRanks) : 0;
  const holeRanks = hole.map(rankOf);
  switch (made.category) {
    case 0: {
      const high = Math.max(...holeRanks);
      return 0.08 + ((high - 2) / 12) * 0.17;
    }
    case 1: {
      const pair = made.ranks[0]!;
      const inHole = holeRanks.filter((r) => r === pair).length;
      if (inHole === 0) return 0.22; // the pair is on the board
      if (inHole === 2) return pair > topBoard ? 0.58 : 0.42; // pocket pair
      return pair >= topBoard ? 0.52 : 0.36;
    }
    case 2: return usesHole(made, hole) ? 0.64 : 0.3;
    case 3: return usesHole(made, hole) ? 0.76 : 0.34;
    case 4: return usesHole(made, hole) ? 0.83 : 0.4;
    case 5: return usesHole(made, hole) ? 0.88 : 0.42;
    case 6: return usesHole(made, hole) ? 0.94 : 0.5;
    case 7: return 0.98;
    default: return 0.995;
  }
}

function drawStrength(hole: readonly Card[], board: readonly Card[], omaha: boolean): number {
  const all = [...hole, ...board];
  let best = 0;
  // Flush draw: four of a suit, using at least one (two in Omaha) hole card.
  const need = omaha ? 2 : 1;
  for (const s of ['c', 'd', 'h', 's']) {
    const total = all.filter((c) => suitOf(c) === s).length;
    const mine = hole.filter((c) => suitOf(c) === s).length;
    if (total >= 4 && mine >= need) best = Math.max(best, 0.46);
  }
  // Straight draw: four ranks inside a five-rank window, using a hole card.
  const ranks = new Set(all.map(rankOf));
  if (ranks.has(14)) ranks.add(1);
  const holeRanks = new Set(hole.map(rankOf));
  if (holeRanks.has(14)) holeRanks.add(1);
  for (let low = 1; low <= 10; low++) {
    let count = 0;
    let usesMine = false;
    for (let r = low; r < low + 5; r++) {
      if (ranks.has(r)) { count++; if (holeRanks.has(r)) usesMine = true; }
    }
    if (count === 4 && usesMine) best = Math.max(best, low > 1 && low + 4 < 14 ? 0.42 : 0.3);
  }
  return best;
}

/** How promising a stud starting hand is before it has five cards. */
function studEarlyBonus(hole: readonly Card[]): number {
  const suits = new Map<string, number>();
  for (const c of hole) suits.set(suitOf(c), (suits.get(suitOf(c)) ?? 0) + 1);
  const suited = Math.max(...suits.values());
  const ranks = [...new Set(hole.map(rankOf))].sort((a, b) => a - b);
  const connected = ranks.length >= 3 && ranks[ranks.length - 1]! - ranks[0]! <= 4;
  let bonus = 0;
  if (suited >= 3) bonus = Math.max(bonus, 0.4);
  if (connected) bonus = Math.max(bonus, 0.34);
  if (hole.some((c) => rankOf(c) === 14)) bonus = Math.max(bonus, 0.3);
  return bonus;
}

/**
 * A three-card hand, by three-card order: trips and straights are the monsters,
 * a pair is well above the middle, and a queen high is about average.
 */
function threeStrength(hole: readonly Card[], isWild?: WildTest): number {
  const made = evaluateThree(hole, isWild);
  switch (made.category) {
    case 8: return 0.98;
    case 3: return 0.95;
    case 4: return 0.86;
    case 5: return 0.76;
    case 1: return 0.45 + ((made.ranks[0]! - 2) / 12) * 0.25;
    default: return 0.04 + ((made.ranks[0]! - 2) / 12) * 0.3;
  }
}

/**
 * Blind Man's Bluff: the bot's own card is the one card it cannot see, so this
 * never looks at it. Of the cards it might be holding (the deck less every card
 * on anyone else's forehead), the share that beats the best card showing, with
 * a tie counted as half. That is already the chance of beating the whole
 * table, so it is not discounted again for more opponents.
 */
export function blindStrength(state: TableState, seat: number): number {
  const h = state.hand;
  if (!h) return 0;
  // A wild card on a forehead plays as an ace.
  const isWild = wildTest(h.wild);
  const rank = (c: Card): number => (isWild?.(c) ? 14 : rankOf(c));
  const seen = new Set<Card>(h.board);
  let best = 0;
  for (const p of h.players) {
    if (!p || p.seat === seat) continue;
    for (const c of p.holeUp) seen.add(c);
    if (!p.folded) for (const c of p.holeUp) best = Math.max(best, rank(c));
  }
  const pool = fullDeck(dealsJokers(h.wild) ? 2 : 0).filter((c) => !seen.has(c));
  if (pool.length === 0) return 0.5;
  let wins = 0;
  for (const c of pool) {
    const r = rank(c);
    if (r > best) wins += 1;
    else if (r === best) wins += 0.5;
  }
  return wins / pool.length;
}

/** 0..1 estimate of how strong the seat's hand is right now, from what the bot can see. */
export function estimateStrength(state: TableState, seat: number): number {
  const h = state.hand;
  if (!h) return 0;
  const p = h.players[seat];
  if (!p) return 0;
  const v = getVariant(h.variantId);
  if (v.ownUpCardsHidden) return blindStrength(state, seat);
  const isWild = wildTest(h.wild);
  const realHole = [...p.holeDown, ...p.holeUp];
  const hole = natural(realHole, isWild);
  const board = natural(h.board, isWild);
  const community = v.streets.some((s) => (s.deal.community ?? 0) > 0);
  if (community && board.length === 0) return preflopStrength(hole, v.id);
  // Three-card games: no board, no up cards, three in the hand.
  if (!community && hole.length === 3 && p.holeUp.length === 0 && v.streets.every((s) => (s.deal.holeUp ?? 0) === 0)) {
    return threeStrength(realHole, isWild);
  }

  const all = [...realHole, ...h.board];
  let made: HandRank;
  if (v.id === 'omaha' && board.length >= 3) made = bestHandOmaha(realHole, h.board, isWild);
  else if (all.length <= 5) made = evaluateCards(all, isWild);
  else made = bestHand(all, isWild);
  made = { ...made, cards: natural(made.cards, isWild) };

  let s = madeStrength(made, hole, board);
  const streetsLeft = v.streets.length - 1 - h.streetIndex;
  if (streetsLeft > 0) {
    if (community) s = Math.max(s, drawStrength(hole, board, v.id === 'omaha'));
    else if (all.length < 5) s = Math.max(s, studEarlyBonus(hole));
  }
  return clamp(s);
}
