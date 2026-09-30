import { describe, expect, it } from 'vitest';
import { legalActions, seededDeck } from '../src/index.js';
import { riggedDeck, tableWith } from './helpers.js';

const cincinnatiTable = { variantMode: { kind: 'locked' as const, variantId: 'cincinnati' } };

/** Check or call for whoever is to act, until this street's betting is over. */
function passRound(t: ReturnType<typeof tableWith>): void {
  const street = t.state.hand!.streetIndex;
  let guard = 0;
  while (t.state.hand!.stage === 'betting' && t.state.hand!.streetIndex === street && guard++ < 40) {
    const seat = t.actor()!;
    const legal = legalActions(t.state, seat)!;
    t.act(seat, legal.canCheck ? { type: 'check' } : { type: 'call' });
  }
}

describe('cincinnati', () => {
  it('deals five down, then turns the shared cards over one at a time with a bet after each', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 1000, cincinnatiTable);
    t.apply({ type: 'start-hand', deck: seededDeck(41) });
    for (const p of t.state.hand!.players) if (p) expect(p.holeDown).toHaveLength(5);
    expect(t.state.hand!.board).toHaveLength(0);

    for (let shared = 1; shared <= 5; shared++) {
      passRound(t);
      expect(t.state.hand!.stage).toBe('betting');
      expect(t.state.hand!.board).toHaveLength(shared);
    }
    passRound(t);
    expect(t.state.hand!.stage).toBe('settled');
    expect(t.state.hand!.results!.showdown).toBe(true);
  });

  it('plays the best five of all ten cards', () => {
    const t = tableWith(['Ann', 'Bob'], 1000, cincinnatiTable);
    // Heads up, button seat 0: deal order is seat 1 then seat 0, one card at a time.
    // Bob: Ah Kh 2c 3d 4s   Ann: 7c 7d 8s 9c Jd   board: Qh Jh Th 5c 6c
    const deck = riggedDeck(['Ah', '7c', 'Kh', '7d', '2c', '8s', '3d', '9c', '4s', 'Jd', 'Qh', 'Jh', 'Th', '5c', '6c']);
    t.apply({ type: 'start-hand', deck });
    for (let i = 0; i < 6; i++) passRound(t);
    const h = t.state.hand!;
    expect(h.stage).toBe('settled');
    // Bob's two hearts and three shared make a royal flush.
    expect(h.results!.pots[0]!.winners).toEqual([1]);
  });

  it('seats at most nine, so the deck lasts', () => {
    const t = tableWith(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], 1000, { ...cincinnatiTable, maxSeats: 10 });
    expect(() => t.apply({ type: 'start-hand', deck: seededDeck(42) })).toThrow(/at most 9/);
  });
});
