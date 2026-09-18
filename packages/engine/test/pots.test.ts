import { describe, expect, it } from 'vitest';
import { awardPots, buildPots, evaluateCards, type HandPlayer } from '../src/index.js';

function player(seat: number, committed: number, folded = false): HandPlayer {
  return {
    seat, playerId: `p${seat}`, name: `P${seat}`, kind: 'human', holeDown: [], holeUp: [],
    streetBet: 0, committed, folded, allIn: false, acted: true, revealed: false, vpip: false, pfr: false,
    discarded: [], drew: 0, startStack: 0,
  };
}

describe('buildPots', () => {
  it('builds a single pot when everyone matched', () => {
    expect(buildPots([player(0, 100), player(1, 100), null, player(3, 100)])).toEqual([
      { amount: 300, eligible: [0, 1, 3] },
    ]);
  });

  it('builds side pots for short all-ins', () => {
    const pots = buildPots([player(0, 50), player(1, 200), player(2, 200), player(3, 120)]);
    expect(pots).toEqual([
      { amount: 200, eligible: [0, 1, 2, 3] },
      { amount: 210, eligible: [1, 2, 3] },
      { amount: 160, eligible: [1, 2] },
    ]);
  });

  it('keeps folded chips in the pot but not the folder', () => {
    const pots = buildPots([player(0, 100, true), player(1, 100), player(2, 40)]);
    expect(pots).toEqual([
      { amount: 120, eligible: [1, 2] },
      { amount: 120, eligible: [1] },
    ]);
  });
});

describe('awardPots', () => {
  const hi = evaluateCards(['Ah', 'Ad', 'Kc', 'Kd', '2s']);
  const lo = evaluateCards(['2h', '3d', '5c', '7d', '9s']);

  it('gives each pot to the best eligible hand', () => {
    const pots = [
      { amount: 200, eligible: [0, 1, 2] },
      { amount: 100, eligible: [1, 2] },
    ];
    const ranks = new Map([[0, hi], [1, lo], [2, lo]]);
    const awards = awardPots(pots, ranks, 2, 8);
    expect(awards[0]!.winners).toEqual([0]);
    expect(awards[0]!.payouts).toEqual({ 0: 200 });
    // seat 1 and 2 tie the side pot; 1 is first clockwise from the button at seat 2? No: seat 0 is, then 1, then 2.
    expect(awards[1]!.winners).toEqual([1, 2]);
    expect(awards[1]!.payouts).toEqual({ 1: 50, 2: 50 });
  });

  it('gives odd chips to the first winner left of the button', () => {
    const pots = [{ amount: 101, eligible: [0, 3] }];
    const ranks = new Map([[0, hi], [3, hi]]);
    // Button at seat 2: seat 3 is first clockwise.
    expect(awardPots(pots, ranks, 2, 8)[0]!.payouts).toEqual({ 3: 51, 0: 50 });
    // Button at seat 5: seat 0 comes before 3.
    expect(awardPots(pots, ranks, 5, 8)[0]!.payouts).toEqual({ 0: 51, 3: 50 });
  });
});
