import { describe, expect, it } from 'vitest';
import { legalActions, summarizeHand, summaryFor } from '../src/index.js';
import { riggedDeck, tableWith } from './helpers.js';

/** Ann folds, Bob and Cid check it down to a showdown. */
function playedHand() {
  const t = tableWith(['Ann', 'Bob', 'Cid'], 1000);
  t.apply({ type: 'start-hand', deck: riggedDeck(['3c']) });
  let guard = 0;
  while (t.state.hand!.stage !== 'settled' && guard++ < 60) {
    const seat = t.actor()!;
    const legal = legalActions(t.state, seat)!;
    if (seat === 0 && !t.state.hand!.players[0]!.folded) t.act(seat, { type: 'fold' });
    else t.act(seat, legal.canCheck ? { type: 'check' } : { type: 'call' });
  }
  return summarizeHand(t.state);
}

describe('reviewing a hand', () => {
  it('keeps each pot as it was paid', () => {
    const s = playedHand();
    expect(s.pots).toBeDefined();
    expect(s.pots!.reduce((a, p) => a + p.amount, 0)).toBe(s.potTotal);
    for (const pot of s.pots!) {
      expect(Object.values(pot.payouts).reduce((a, b) => a + b, 0)).toBe(pot.amount);
    }
  });

  it('keeps a folded hand in the muck, except for its owner', () => {
    const s = playedHand();
    const ann = s.players.find((p) => p.name === 'Ann')!;
    expect(ann.folded).toBe(true);
    expect(ann.holeDown).toHaveLength(2);

    const toBob = summaryFor(s, 'p1');
    expect(toBob.players.find((p) => p.name === 'Ann')!.holeDown).toEqual([null, null]);
    // Hands that were shown down stay shown.
    expect(toBob.players.find((p) => p.name === 'Cid')!.holeDown.every((c) => c !== null)).toBe(true);

    const toAnn = summaryFor(s, 'p0');
    expect(toAnn.players.find((p) => p.name === 'Ann')!.holeDown).toEqual(ann.holeDown);

    const toRail = summaryFor(s, null);
    expect(toRail.players.find((p) => p.name === 'Ann')!.holeDown).toEqual([null, null]);
  });

  it('names the wild cards, when there were any', () => {
    const t = tableWith(['Ann', 'Bob'], 1000, { wild: { kind: 'deuces' } });
    t.apply({ type: 'start-hand', deck: riggedDeck(['3c']) });
    let guard = 0;
    while (t.state.hand!.stage !== 'settled' && guard++ < 60) {
      const seat = t.actor()!;
      t.act(seat, legalActions(t.state, seat)!.canCheck ? { type: 'check' } : { type: 'call' });
    }
    expect(summarizeHand(t.state).wild).toEqual({ kind: 'deuces' });
    expect(playedHand().wild).toBeUndefined();
  });
});
