import { describe, expect, it } from 'vitest';
import { legalActions } from '../src/index.js';
import { riggedDeck, tableWith } from './helpers.js';

describe('pot limit', () => {
  it('caps the raise at the pot after the call', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 1000, { variantMode: { kind: 'locked', variantId: 'omaha' } });
    t.apply({ type: 'start-hand', deck: riggedDeck(['3c']) });
    expect(t.state.hand!.betting).toBe('pot-limit');
    // Blinds 5/10, UTG faces 10: pot after call is 5+10+10 = 25 → raise to 35.
    expect(legalActions(t.state, 0)!.raise).toEqual({ kind: 'raise', min: 20, max: 35, fixed: false });
    t.act(0, { type: 'raise', to: 35 });
    // SB has 5 in, faces 30 more; pot after call 35+35+10 = 80 → raise to 115.
    expect(legalActions(t.state, 1)!.raise!.max).toBe(115);
    t.act(1, { type: 'fold' });
    // BB has 10 in, faces 25; pot after call 5+35+35 = 75 → 110.
    expect(legalActions(t.state, 2)!.raise!.max).toBe(110);
  });
});

describe('fixed limit', () => {
  it('uses fixed bet sizes and caps raises at four', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 1000, { betting: 'fixed-limit', fixedLimit: { small: 10, big: 20 } });
    t.apply({ type: 'start-hand', deck: riggedDeck(['3c']) });
    expect(t.state.hand!.betting).toBe('fixed-limit');
    // Preflop the big blind counts as the first bet: raise to 20.
    expect(legalActions(t.state, 0)!.raise).toEqual({ kind: 'raise', min: 20, max: 20, fixed: true });
    t.act(0, { type: 'raise', to: 20 }); // bet 2
    t.act(1, { type: 'raise', to: 30 }); // bet 3
    t.act(2, { type: 'raise', to: 40 }); // bet 4: capped
    expect(legalActions(t.state, 0)!.raise).toBeNull();
    t.act(0, { type: 'call' });
    t.act(1, { type: 'call' });
    // Flop: small bet again, no bet yet.
    expect(t.state.hand!.streetIndex).toBe(1);
    expect(legalActions(t.state, 1)!.raise).toEqual({ kind: 'bet', min: 10, max: 10, fixed: true });
    t.act(1, { type: 'check' });
    t.act(2, { type: 'check' });
    t.act(0, { type: 'check' });
    // Turn: big bet.
    expect(legalActions(t.state, 1)!.raise).toEqual({ kind: 'bet', min: 20, max: 20, fixed: true });
  });

  it('lifts the cap heads-up', () => {
    const t = tableWith(['Ann', 'Bob'], 10000, { betting: 'fixed-limit', fixedLimit: { small: 10, big: 20 } });
    t.apply({ type: 'start-hand', deck: riggedDeck(['4c']) });
    for (let i = 0; i < 6; i++) {
      const seat = t.actor()!;
      const legal = legalActions(t.state, seat)!;
      expect(legal.raise).not.toBeNull();
      t.act(seat, { type: 'raise', to: legal.raise!.min });
    }
    expect(t.state.hand!.round.currentBet).toBe(70);
  });
});
