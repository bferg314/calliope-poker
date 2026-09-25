import { describe, expect, it } from 'vitest';
import { legalActions, viewFor } from '../src/index.js';
import { riggedDeck, tableWith } from './helpers.js';

const bluffTable = { variantMode: { kind: 'locked' as const, variantId: 'bluff' } };

function checkDown(t: ReturnType<typeof tableWith>): void {
  let guard = 0;
  while (t.state.hand!.stage === 'betting' && guard++ < 20) {
    const seat = t.actor()!;
    t.act(seat, legalActions(t.state, seat)!.canCheck ? { type: 'check' } : { type: 'call' });
  }
}

describe("Blind Man's Bluff", () => {
  // 9h on top of a three-handed deck puts the button on seat 0, so seat 1 is dealt first.
  const deck = () => riggedDeck(['9h', 'Kd', '4c']);

  it('deals one card each, face up to everyone but its owner', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 1000, bluffTable);
    t.apply({ type: 'start-hand', deck: deck() });
    const h = t.state.hand!;
    const seated = h.players.slice(0, 3);
    expect(seated.map((p) => p!.holeUp)).toEqual([['4c'], ['9h'], ['Kd']]);
    expect(seated.every((p) => p!.holeDown.length === 0)).toBe(true);

    const ann = viewFor(t.state, 'p0').hand!;
    expect(ann.players[0]!.holeUp).toEqual([null]);
    expect(ann.players[1]!.holeUp).toEqual(['9h']);
    expect(ann.players[2]!.holeUp).toEqual(['Kd']);

    const bob = viewFor(t.state, 'p1').hand!;
    expect(bob.players[0]!.holeUp).toEqual(['4c']);
    expect(bob.players[1]!.holeUp).toEqual([null]);

    // Someone watching is not holding anything, so sees every card.
    const rail = viewFor(t.state, null).hand!;
    expect(rail.players.slice(0, 3).map((p) => p!.holeUp)).toEqual([['4c'], ['9h'], ['Kd']]);
  });

  it('shows you your card at the showdown, and the highest card wins', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 1000, bluffTable);
    t.apply({ type: 'start-hand', deck: deck() });
    checkDown(t);
    const r = t.state.hand!.results!;
    expect(r.showdown).toBe(true);
    expect(r.winners).toEqual([2]);
    expect(r.hands[2]!.label).toBe('King high');
    expect(viewFor(t.state, 'p0').hand!.players[0]!.holeUp).toEqual(['4c']);
  });

  it('splits the pot between equal cards, whatever their suits', () => {
    const t = tableWith(['Ann', 'Bob'], 1000, bluffTable);
    t.apply({ type: 'start-hand', deck: riggedDeck(['Qh', 'Qs']) });
    checkDown(t);
    expect([...t.state.hand!.results!.winners].sort()).toEqual([0, 1]);
    expect(t.stack(0)).toBe(1000);
    expect(t.stack(1)).toBe(1000);
  });
});
