import type { HandRank } from './evaluator.js';
import type { HandPlayer, PotAward, SeatIndex } from './types.js';

export interface Pot {
  amount: number;
  eligible: SeatIndex[];
}

function sameSet(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/**
 * Build main and side pots from each player's committed chips.
 * Folded players' chips stay in the pots they contributed to but they are not eligible.
 */
export function buildPots(players: readonly (HandPlayer | null)[]): Pot[] {
  const contributors = players.filter((p): p is HandPlayer => p !== null && p.committed > 0);
  const levels = [...new Set(contributors.map((p) => p.committed))].sort((a, b) => a - b);
  const layers: Pot[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    const eligible: SeatIndex[] = [];
    for (const p of contributors) {
      if (p.committed >= level) {
        amount += level - prev;
        if (!p.folded) eligible.push(p.seat);
      }
    }
    layers.push({ amount, eligible });
    prev = level;
  }
  // Merge layers with identical eligibility. A layer nobody can win (only folded
  // players reached it) is folded into the previous pot.
  const pots: Pot[] = [];
  for (const layer of layers) {
    const last = pots[pots.length - 1];
    if (last && (layer.eligible.length === 0 || sameSet(last.eligible, layer.eligible))) {
      last.amount += layer.amount;
    } else {
      pots.push({ amount: layer.amount, eligible: [...layer.eligible] });
    }
  }
  return pots;
}

/**
 * Award pots to the best eligible hand(s). Odd chips go to the first winner
 * clockwise from the button.
 */
export function awardPots(
  pots: readonly Pot[],
  ranks: ReadonlyMap<SeatIndex, HandRank>,
  button: SeatIndex,
  seatCount: number,
): PotAward[] {
  const distance = (s: SeatIndex): number => (s - button - 1 + seatCount) % seatCount;
  const clockwiseFromButton = (seats: readonly SeatIndex[]): SeatIndex[] =>
    [...seats].sort((a, b) => distance(a) - distance(b));

  return pots.map((pot) => {
    const contenders = pot.eligible.filter((s) => ranks.has(s));
    let best = -Infinity;
    for (const s of contenders) best = Math.max(best, ranks.get(s)!.value);
    const winners = clockwiseFromButton(contenders.filter((s) => ranks.get(s)!.value === best));
    const payouts: Record<SeatIndex, number> = {};
    if (winners.length > 0) {
      const share = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount - share * winners.length;
      for (const w of winners) {
        payouts[w] = share + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
      }
    }
    return { amount: pot.amount, eligible: [...pot.eligible], winners, payouts };
  });
}
