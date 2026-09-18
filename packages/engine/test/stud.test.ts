import { describe, expect, it } from 'vitest';
import { legalActions, seededDeck } from '../src/index.js';
import { riggedDeck, tableWith } from './helpers.js';

const studConfig = {
  variantMode: { kind: 'locked' as const, variantId: 'stud7' },
  ante: 2,
  bringIn: 5,
  fixedLimit: { small: 10, big: 20 },
};

describe('seven-card stud', () => {
  it('takes antes, deals two down and one up, and the lowest up card brings it in', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 500, studConfig);
    // Button seat 0 (3c % 3 = 0). Deal order Bob, Cid, Ann. Down: 3c 4d 5h / 6s 7c 8d. Up: Kh 2s 9d → Cid (2s) brings in.
    t.apply({ type: 'start-hand', deck: riggedDeck(['3c', '4d', '5h', '6s', '7c', '8d', 'Kh', '2s', '9d']) });
    const h = t.state.hand!;
    expect(h.betting).toBe('fixed-limit');
    expect(h.players.every((p) => !p || p.committed === 2)).toBe(true);
    expect(h.players[1]!.holeDown).toEqual(['3c', '6s']);
    expect(h.players[1]!.holeUp).toEqual(['Kh']);
    expect(h.players[2]!.holeUp).toEqual(['2s']);
    expect(h.players[2]!.streetBet).toBe(5);
    expect(t.stack(2)).toBe(493);
    // Action continues left of the bring-in: Ann (seat 0).
    expect(t.actor()).toBe(0);
    const legal = legalActions(t.state, 0)!;
    expect(legal.toCall).toBe(5);
    // Completing the bring-in goes to the small bet.
    expect(legal.raise).toEqual({ kind: 'raise', min: 10, max: 10, fixed: true });
  });

  it('lets the best showing hand act first on later streets and deals seven cards', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 500, studConfig);
    t.apply({ type: 'start-hand', deck: riggedDeck(['3c', '4d', '5h', '6s', '7c', '8d', 'Kh', '2s', '9d', 'Kd', 'Ah', 'As']) });
    t.act(0, { type: 'call' });
    t.act(1, { type: 'call' });
    // Bring-in player has no option; the round ends and fourth street is dealt.
    expect(t.state.hand!.streetIndex).toBe(1);
    // Fourth street up cards in deal order (Bob, Cid, Ann): Kd, Ah, As → Bob shows KK, Ann shows 9 A, Cid shows 2 A. Bob acts first.
    expect(t.state.hand!.players[1]!.holeUp).toEqual(['Kh', 'Kd']);
    expect(t.actor()).toBe(1);
    // Play to the end with checks.
    let guard = 0;
    while (t.state.hand!.stage === 'betting' && guard++ < 40) {
      const seat = t.actor()!;
      const legal = legalActions(t.state, seat)!;
      t.act(seat, legal.canCheck ? { type: 'check' } : { type: 'call' });
    }
    const h = t.state.hand!;
    expect(h.stage).toBe('settled');
    expect(h.results!.showdown).toBe(true);
    for (const p of h.players) if (p) expect(p.holeDown.length + p.holeUp.length).toBe(7);
    expect(h.players.filter(Boolean).every((p) => p!.holeDown.length === 3 && p!.holeUp.length === 4)).toBe(true);
  });

  it('deals a shared card when eight players run the deck out', () => {
    const t = tableWith(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], 500, studConfig);
    t.apply({ type: 'start-hand', deck: seededDeck(5) });
    let guard = 0;
    while (t.state.hand!.stage === 'betting' && guard++ < 200) {
      const seat = t.actor()!;
      const legal = legalActions(t.state, seat)!;
      t.act(seat, legal.canCheck ? { type: 'check' } : { type: 'call' });
    }
    const h = t.state.hand!;
    expect(h.stage).toBe('settled');
    expect(h.board).toHaveLength(1);
    expect(h.deck).toHaveLength(52 - 8 * 6 - 1);
  });
});

describe('five-card stud', () => {
  it('deals one down and four up', () => {
    const t = tableWith(['Ann', 'Bob'], 500, { ...studConfig, variantMode: { kind: 'locked', variantId: 'stud5' } });
    t.apply({ type: 'start-hand', deck: seededDeck(9) });
    let guard = 0;
    while (t.state.hand!.stage === 'betting' && guard++ < 40) {
      const seat = t.actor()!;
      const legal = legalActions(t.state, seat)!;
      t.act(seat, legal.canCheck ? { type: 'check' } : { type: 'call' });
    }
    const h = t.state.hand!;
    expect(h.stage).toBe('settled');
    for (const p of h.players) if (p) { expect(p.holeDown).toHaveLength(1); expect(p.holeUp).toHaveLength(4); }
  });
});
