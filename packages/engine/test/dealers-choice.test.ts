import { describe, expect, it } from 'vitest';
import { EngineError, seededDeck } from '../src/index.js';
import { tableWith } from './helpers.js';

describe("dealer's choice", () => {
  const config = { variantMode: { kind: 'dealers-choice' as const, allowed: ['holdem', 'omaha', 'stud7'] }, ante: 1 };

  it('waits for the button to choose, then deals that game', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 500, config);
    t.apply({ type: 'start-hand', deck: seededDeck(11) });
    const h = t.state.hand!;
    expect(h.stage).toBe('choosing');
    expect(h.chooser).toBe(h.button);
    expect(t.effects).toEqual([{ type: 'await-choice', seat: h.button }]);
    const other = (h.button + 1) % 3;
    expect(() => t.apply({ type: 'choose-variant', seat: other, variantId: 'omaha' })).toThrow(EngineError);
    expect(() => t.apply({ type: 'choose-variant', seat: h.button, variantId: 'stud5' })).toThrow(EngineError);
    t.apply({ type: 'choose-variant', seat: h.button, variantId: 'omaha' });
    expect(t.state.hand!.variantId).toBe('omaha');
    expect(t.state.hand!.stage).toBe('betting');
    expect(t.state.hand!.players[0]!.holeDown).toHaveLength(4);
    expect(t.state.lastVariantId).toBe('omaha');
  });

  it('falls back to the last game on timeout', () => {
    const t = tableWith(['Ann', 'Bob'], 500, config);
    t.apply({ type: 'start-hand', deck: seededDeck(12) });
    t.apply({ type: 'choose-variant', seat: t.state.hand!.chooser!, variantId: 'stud7' });
    t.act(t.actor()!, { type: 'fold' });
    t.apply({ type: 'finish-hand' });
    t.apply({ type: 'start-hand', deck: seededDeck(13) });
    t.apply({ type: 'timeout', seat: t.state.hand!.chooser! });
    expect(t.state.hand!.variantId).toBe('stud7');
  });

  it('can be started with the variant already chosen', () => {
    const t = tableWith(['Ann', 'Bob'], 500, config);
    t.apply({ type: 'start-hand', deck: seededDeck(14), variantId: 'holdem' });
    expect(t.state.hand!.stage).toBe('betting');
    expect(t.state.hand!.variantId).toBe('holdem');
  });
});
