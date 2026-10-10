import { describe, expect, it } from 'vitest';
import { bestBadugi, bestDeuceSeven, getVariant, legalActions, seededDeck, wildTest, type HandRank } from '../src/index.js';
import { tableWith } from './helpers.js';

const d27 = (cards: string[]): HandRank => bestDeuceSeven(cards);
const bad = (cards: string[]): HandRank => bestBadugi(cards);

describe('deuce-to-seven low', () => {
  it('makes 7-5-4-3-2 the nuts and reads from the top card down', () => {
    expect(d27(['7c', '5d', '4h', '3s', '2c']).value).toBeGreaterThan(d27(['7c', '6d', '4h', '3s', '2c']).value);
    expect(d27(['7c', '6d', '5h', '4s', '2c']).value).toBeGreaterThan(d27(['8c', '5d', '4h', '3s', '2c']).value);
    expect(d27(['7c', '5d', '4h', '3s', '2c']).label).toBe('Seven low, 7-5-4-3-2');
  });

  it('counts straights and flushes against you', () => {
    const kingLow = d27(['Kc', 'Qd', 'Jh', '9s', '8c']);
    const straight = d27(['7c', '6d', '5h', '4s', '3c']);
    const flush = d27(['7h', '5h', '4h', '3h', '2h']);
    expect(kingLow.value).toBeGreaterThan(straight.value);
    expect(kingLow.value).toBeGreaterThan(flush.value);
    expect(straight.label).toBe('Straight, seven high');
  });

  it('plays aces high, so A-5-4-3-2 is no straight, just ace high', () => {
    const aceHigh = d27(['Ac', '5d', '4h', '3s', '2c']);
    expect(aceHigh.category).toBe(0);
    expect(d27(['Kc', 'Qd', 'Jh', '9s', '8c']).value).toBeGreaterThan(aceHigh.value);
    expect(aceHigh.value).toBeGreaterThan(d27(['2c', '2d', '3h', '4s', '5c']).value);
  });

  it('lets a wild card make the lowest hand, never a flush', () => {
    const deuces = wildTest({ kind: 'deuces' })!;
    expect(bestDeuceSeven(['2c', '7d', '5h', '4s', '3c'], deuces).label).toBe('Seven low, 7-5-4-3-2');
    const jokers = wildTest({ kind: 'jokers' })!;
    const h = bestDeuceSeven(['*1', '7h', '5h', '4h', '3h'], jokers);
    expect(h.category).toBe(0);
    expect(h.label).toBe('Seven low, 7-5-4-3-2');
    expect(bestDeuceSeven(['*1', '*2', '8h', '8d', '8s'], jokers).label).toBe('Three of a kind, eights');
  });
});

describe('badugi', () => {
  it('makes A-2-3-4 of four suits the nuts', () => {
    const nuts = bad(['As', '2h', '3d', '4c']);
    expect(nuts.label).toBe('Badugi, 4-3-2-A');
    expect(nuts.category).toBe(0);
    expect(nuts.value).toBeGreaterThan(bad(['5s', '2h', '3d', '4c']).value);
  });

  it('plays only cards of different suits and ranks, and more cards always win', () => {
    const suited = bad(['As', '2s', '3d', '4c']);
    expect(suited.label).toBe('Three cards, 4-3-A');
    const paired = bad(['As', 'Ah', '2d', '3c']);
    expect(paired.label).toBe('Three cards, 3-2-A');
    expect(bad(['Ks', 'Qh', 'Jd', 'Tc']).value).toBeGreaterThan(suited.value);
    expect(bad(['2s', '3s', '4s', '5s']).label).toBe('One card, 2');
  });

  it('compares hands of a size from the top card down', () => {
    expect(bad(['6s', '4h', '3d', '2c']).value).toBeGreaterThan(bad(['6s', '5h', '2d', 'Ac']).value);
    expect(bad(['7s', '6h', '5d', '4c']).value).toBeGreaterThan(bad(['8s', '3h', '2d', 'Ac']).value);
  });

  it('lets a wild card take a missing suit and the lowest missing rank', () => {
    const jokers = wildTest({ kind: 'jokers' })!;
    expect(bestBadugi(['*1', 'Ks', 'Qs', '2h'], jokers).label).toBe('Three cards, Q-2-A');
    expect(bestBadugi(['*1', '*2', '3s', '5h'], jokers).label).toBe('Badugi, 5-3-2-A');
  });
});

describe.each([
  ['draw27', 5, 5],
  ['badugi', 4, 4],
])('%s at the table', (variantId, cards, max) => {
  const config = { variantMode: { kind: 'locked' as const, variantId }, fixedLimit: { small: 10, big: 20 } };

  it('deals the cards, stops for three draws, and gives the pot to the lowest hand', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 1000, config);
    t.apply({ type: 'start-hand', deck: seededDeck(11) });
    for (const p of t.state.hand!.players.filter(Boolean)) expect(p!.holeDown).toHaveLength(cards);
    let draws = 0;
    let guard = 0;
    while (t.state.hand!.stage !== 'settled' && guard++ < 100) {
      const h = t.state.hand!;
      const seat = h.round.actor!;
      if (h.stage === 'discarding') {
        draws++;
        expect(t.effects.at(-1)).toMatchObject({ type: 'await-discard', min: 0, max, replace: true });
        // Throw the highest card each time, so the hand changes.
        const hole = h.players[seat]!.holeDown;
        t.apply({ type: 'discard', seat, cards: [hole[0]!] });
        expect(t.state.hand!.players[seat]!.holeDown).toHaveLength(cards);
      } else {
        const legal = legalActions(t.state, seat)!;
        t.act(seat, legal.canCheck ? { type: 'check' } : { type: 'call' });
      }
    }
    const h = t.state.hand!;
    expect(h.stage).toBe('settled');
    expect(draws).toBe(9); // three players, three draws
    const v = getVariant(variantId);
    const values = h.players.map((p) => (p ? v.evaluate(p.holeDown, []).value : -1));
    const best = Math.max(...values);
    expect([...h.results!.winners].sort()).toEqual(values.flatMap((x, i) => (x === best ? [i] : [])));
  });
});
