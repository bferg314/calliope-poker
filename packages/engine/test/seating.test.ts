import { describe, expect, it } from 'vitest';
import { EngineError, seededDeck } from '../src/index.js';
import { tableWith } from './helpers.js';

describe('arrange-seats', () => {
  it('moves each player, with their chips, to the seat named for them', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 1000);
    t.state.seats[1]!.stack = 700;
    // Seat 0 takes Cid, seat 1 takes Ann, seat 2 takes Bob; the rest stay empty.
    t.apply({ type: 'arrange-seats', order: [2, 0, 1, 3, 4, 5, 6, 7] });
    expect(t.state.seats.map((s) => s?.name ?? null)).toEqual(['Cid', 'Ann', 'Bob', null, null, null, null, null]);
    expect(t.state.seats[2]!.stack).toBe(700);
  });

  it('refuses an order that does not name every seat once', () => {
    const t = tableWith(['Ann', 'Bob'], 1000);
    expect(() => t.apply({ type: 'arrange-seats', order: [1, 0] })).toThrow(EngineError);
    expect(() => t.apply({ type: 'arrange-seats', order: [0, 0, 2, 3, 4, 5, 6, 7] })).toThrow(EngineError);
  });

  it('waits for the hand to finish', () => {
    const t = tableWith(['Ann', 'Bob'], 1000);
    t.apply({ type: 'start-hand', deck: seededDeck(1) });
    expect(() => t.apply({ type: 'arrange-seats', order: [1, 0, 2, 3, 4, 5, 6, 7] })).toThrow(EngineError);
  });
});
