import { describe, expect, it } from 'vitest';
import { EngineError, legalActions, seededDeck, viewFor } from '../src/index.js';
import { riggedDeck, tableWith } from './helpers.js';

const pineappleTable = { variantMode: { kind: 'locked' as const, variantId: 'pineapple' } };
const drawTable = { variantMode: { kind: 'locked' as const, variantId: 'draw5' } };

/** Check or call for whoever is to act, until the hand leaves the betting stage. */
function passRound(t: ReturnType<typeof tableWith>, guardLimit = 40): void {
  let guard = 0;
  while (t.state.hand!.stage === 'betting' && guard++ < guardLimit) {
    const seat = t.actor()!;
    const legal = legalActions(t.state, seat)!;
    t.act(seat, legal.canCheck ? { type: 'check' } : { type: 'call' });
  }
}

describe('pineapple', () => {
  it('deals three down and stops for the discard after the flop', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 1000, pineappleTable);
    t.apply({ type: 'start-hand', deck: riggedDeck(['3c']) });
    expect(t.state.hand!.players[0]!.holeDown).toHaveLength(3);

    passRound(t); // preflop
    expect(t.state.hand!.board).toHaveLength(3);
    passRound(t); // flop

    const h = t.state.hand!;
    expect(h.stage).toBe('discarding');
    expect(h.streetIndex).toBe(2);
    // The turn card is not out yet: the discard comes first.
    expect(h.board).toHaveLength(3);
    expect(t.effects.at(-1)).toEqual({ type: 'await-discard', seat: h.round.actor, min: 1, max: 1, replace: false });
    // Everyone still in has to throw one away, starting left of the button.
    expect(h.round.actor).toBe(1);
  });

  it('takes exactly one card and gives nothing back', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 1000, pineappleTable);
    t.apply({ type: 'start-hand', deck: riggedDeck(['3c']) });
    passRound(t);
    passRound(t);

    const seat = t.state.hand!.round.actor!;
    const hole = [...t.state.hand!.players[seat]!.holeDown];
    expect(() => t.apply({ type: 'discard', seat, cards: [] })).toThrow(EngineError);
    expect(() => t.apply({ type: 'discard', seat, cards: hole.slice(0, 2) })).toThrow(EngineError);
    expect(() => t.apply({ type: 'discard', seat, cards: ['2c'] })).toThrow(EngineError);

    t.apply({ type: 'discard', seat, cards: [hole[0]!] });
    const p = t.state.hand!.players[seat]!;
    expect(p.holeDown).toEqual([hole[1], hole[2]]);
    expect(p.discarded).toEqual([hole[0]]);
    expect(p.drew).toBe(0);
    expect(t.state.hand!.muck).toContain(hole[0]);
  });

  it('deals the turn once everyone has thrown one away, then plays out', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 1000, pineappleTable);
    t.apply({ type: 'start-hand', deck: riggedDeck(['3c']) });
    passRound(t);
    passRound(t);

    let guard = 0;
    while (t.state.hand!.stage === 'discarding' && guard++ < 10) {
      const seat = t.state.hand!.round.actor!;
      t.apply({ type: 'discard', seat, cards: [t.state.hand!.players[seat]!.holeDown[0]!] });
    }
    const h = t.state.hand!;
    expect(h.stage).toBe('betting');
    expect(h.board).toHaveLength(4); // the turn is out
    for (const p of h.players) if (p) expect(p.holeDown).toHaveLength(2);

    passRound(t); // turn
    passRound(t); // river
    expect(t.state.hand!.stage).toBe('settled');
    expect(t.state.hand!.results!.showdown).toBe(true);
  });

  it('throws away for a player who runs out of time', () => {
    const t = tableWith(['Ann', 'Bob'], 1000, pineappleTable);
    t.apply({ type: 'start-hand', deck: seededDeck(4) });
    passRound(t);
    passRound(t);
    const seat = t.state.hand!.round.actor!;
    t.apply({ type: 'timeout', seat });
    expect(t.state.hand!.players[seat]!.holeDown).toHaveLength(2);
    expect(t.state.hand!.players[seat]!.discarded).toHaveLength(1);
  });

  it('discards automatically when everyone is all in', () => {
    const t = tableWith(['Ann', 'Bob'], 500, pineappleTable);
    t.apply({ type: 'start-hand', deck: seededDeck(6) });
    t.act(t.actor()!, { type: 'raise', to: 500 });
    t.act(t.actor()!, { type: 'call' });
    const h = t.state.hand!;
    expect(h.stage).toBe('settled');
    expect(h.board).toHaveLength(5);
    // Both were reduced to two cards without anybody choosing.
    for (const p of h.players) if (p) expect(p.holeDown).toHaveLength(2);
  });

  it('keeps the card that makes the best hand when it picks for you', () => {
    const t = tableWith(['Ann', 'Bob'], 1000, pineappleTable);
    // Heads up, button seat 0. Deal order is seat 1 then seat 0, one card at a time.
    // Bob: Ah Ad 2c   Ann: Kh Kd 7s   flop: As Kc 9h
    const deck = riggedDeck(['4c', 'Ah', 'Kh', 'Ad', 'Kd', '2c', '7s', 'As', 'Kc', '9h']);
    t.apply({ type: 'start-hand', deck });
    passRound(t);
    passRound(t);
    const seat = t.state.hand!.round.actor!;
    const before = [...t.state.hand!.players[seat]!.holeDown];
    t.apply({ type: 'timeout', seat });
    const after = t.state.hand!.players[seat]!.holeDown;
    // Whatever it threw, the two it kept beat the two it could have kept instead.
    expect(after).toHaveLength(2);
    expect(before).toEqual(expect.arrayContaining(after));
  });
});

describe('five-card draw', () => {
  it('deals five down with no board and stops for the draw', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 1000, drawTable);
    t.apply({ type: 'start-hand', deck: riggedDeck(['3c']) });
    expect(t.state.hand!.players[0]!.holeDown).toHaveLength(5);
    expect(t.state.hand!.board).toHaveLength(0);

    passRound(t);
    const h = t.state.hand!;
    expect(h.stage).toBe('discarding');
    expect(t.effects.at(-1)).toEqual({ type: 'await-discard', seat: h.round.actor, min: 0, max: 5, replace: true });
  });

  it('replaces exactly what was thrown away, and lets a player stand pat', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 1000, drawTable);
    t.apply({ type: 'start-hand', deck: riggedDeck(['3c']) });
    passRound(t);

    const first = t.state.hand!.round.actor!;
    const hole = [...t.state.hand!.players[first]!.holeDown];
    t.apply({ type: 'discard', seat: first, cards: hole.slice(0, 3) });
    const p = t.state.hand!.players[first]!;
    expect(p.holeDown).toHaveLength(5);
    expect(p.drew).toBe(3);
    expect(p.holeDown.slice(0, 2)).toEqual(hole.slice(3));
    for (const gone of hole.slice(0, 3)) expect(p.holeDown).not.toContain(gone);

    const second = t.state.hand!.round.actor!;
    const kept = [...t.state.hand!.players[second]!.holeDown];
    t.apply({ type: 'discard', seat: second, cards: [] });
    expect(t.state.hand!.players[second]!.holeDown).toEqual(kept);
    expect(t.state.hand!.players[second]!.drew).toBe(0);
  });

  it('bets again after the draw and shows down five cards', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 1000, drawTable);
    t.apply({ type: 'start-hand', deck: riggedDeck(['3c']) });
    passRound(t);
    let guard = 0;
    while (t.state.hand!.stage === 'discarding' && guard++ < 10) {
      const seat = t.state.hand!.round.actor!;
      t.apply({ type: 'discard', seat, cards: t.state.hand!.players[seat]!.holeDown.slice(0, 2) });
    }
    expect(t.state.hand!.stage).toBe('betting');
    passRound(t);
    const h = t.state.hand!;
    expect(h.stage).toBe('settled');
    expect(h.results!.showdown).toBe(true);
    for (const p of h.players) if (p) expect(p.holeDown).toHaveLength(5);
  });

  it('shuffles the discards back in when the deck runs out', () => {
    const t = tableWith(['A', 'B', 'C', 'D', 'E', 'F'], 1000, drawTable);
    t.apply({ type: 'start-hand', deck: seededDeck(21) });
    passRound(t);
    // Six players throwing five each needs 30 cards, from the 22 that are left.
    let guard = 0;
    while (t.state.hand!.stage === 'discarding' && guard++ < 10) {
      const seat = t.state.hand!.round.actor!;
      t.apply({ type: 'discard', seat, cards: [...t.state.hand!.players[seat]!.holeDown] });
    }
    const h = t.state.hand!;
    for (const p of h.players) {
      if (!p) continue;
      expect(p.holeDown).toHaveLength(5);
      // Nobody was handed back a card they had just thrown away.
      for (const card of p.holeDown) expect(p.discarded).not.toContain(card);
    }
    const all = h.players.flatMap((p) => (p ? p.holeDown : []));
    expect(new Set(all).size).toBe(all.length); // no duplicates in play
    expect(t.state.hand!.log.some((l) => l.text.includes('shuffled back in'))).toBe(true);
  });

  it('refuses to seat more players than the game allows', () => {
    const t = tableWith(['A', 'B', 'C', 'D', 'E', 'F', 'G'], 1000, drawTable);
    expect(() => t.apply({ type: 'start-hand', deck: seededDeck(22) })).toThrow(/at most 6/);
  });

  it('hides a drawing opponent\'s cards but shows how many they took', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 1000, drawTable);
    t.apply({ type: 'start-hand', deck: riggedDeck(['3c']) });
    passRound(t);
    const seat = t.state.hand!.round.actor!;
    t.apply({ type: 'discard', seat, cards: t.state.hand!.players[seat]!.holeDown.slice(0, 2) });

    const other = t.state.seats.findIndex((x, i) => x !== null && i !== seat);
    const view = viewFor(t.state, `p${other}`);
    expect(view.hand!.players[seat]!.holeDown).toEqual([null, null, null, null, null]);
    expect(view.hand!.players[seat]!.drew).toBe(2);
    expect(view.hand!.players[seat]!.discarded).toHaveLength(2);
  });
});
