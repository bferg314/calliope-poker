import { describe, expect, it } from 'vitest';
import { bestLow, labelInSentence, legalActions, seededDeck, wildTest } from '../src/index.js';
import { riggedDeck, tableWith } from './helpers.js';

const razzConfig = {
  variantMode: { kind: 'locked' as const, variantId: 'razz' },
  ante: 2,
  bringIn: 5,
  fixedLimit: { small: 10, big: 20 },
};

const low = (cards: string[]): number => bestLow(cards).value;

describe('ace-to-five low', () => {
  it('makes the wheel the nuts, and reads from the top card down', () => {
    expect(low(['5c', '4d', '3h', '2s', 'Ac'])).toBeGreaterThan(low(['6c', '4d', '3h', '2s', 'Ac']));
    expect(low(['8c', '6d', '4h', '3s', '2c'])).toBeGreaterThan(low(['8c', '7d', '3h', '2s', 'Ac']));
    expect(low(['7c', '5d', '4h', '3s', '2c'])).toBeGreaterThan(low(['8c', '4d', '3h', '2s', 'Ac']));
    expect(bestLow(['5c', '4d', '3h', '2s', 'Ac']).label).toBe('Wheel, 5-4-3-2-A');
    expect(bestLow(['7c', '5d', '4h', '3s', 'Ac']).label).toBe('Seven low, 7-5-4-3-A');
    expect(labelInSentence('Eight low, 8-6-4-3-A')).toBe('eight low, 8-6-4-3-A');
  });

  it('ignores straights and flushes', () => {
    expect(low(['6h', '5h', '4h', '3h', '2h'])).toBe(low(['6c', '5d', '4h', '3s', '2c']));
    expect(low(['9s', '7s', '5s', '3s', '2s'])).toBe(low(['9c', '7d', '5h', '3s', '2c']));
  });

  it('counts any pair as worse than any five different cards', () => {
    expect(low(['Kc', 'Qd', 'Jh', 'Ts', '9c'])).toBeGreaterThan(low(['Ac', 'Ad', '2h', '3s', '4c']));
    expect(low(['2c', '2d', '3h', '4s', '5c'])).toBeGreaterThan(low(['3c', '3d', '2h', '4s', '5c']));
    expect(low(['Ac', 'Ad', '2h', '3s', '4c'])).toBeGreaterThan(low(['Ac', 'Ad', '2h', '2s', '4c']));
    expect(bestLow(['9c', '9d', '2h', '3s', '4c']).label).toBe('Pair of nines');
  });

  it('takes the best five of seven, pairing as little as it can', () => {
    const h = bestLow(['Kc', '7d', '5h', '4s', '3c', '2d', '7h']);
    expect(h.label).toBe('Seven low, 7-5-4-3-2');
    expect(h.cards).toHaveLength(5);
    // Four ranks among seven cards: a pair has to play, and the lowest one.
    expect(bestLow(['Ac', 'Ad', '2h', '2s', '3c', '3d', '4h']).label).toBe('Pair of aces');
  });

  it('ranks the cards showing, however few', () => {
    expect(low(['3c', '2d'])).toBeGreaterThan(low(['Kc', 'Ad']));
    expect(low(['Kc', 'Ad'])).toBeGreaterThan(low(['2c', '2d']));
    expect(bestLow(['Kd']).label).toBe('King low');
  });

  it('lets a wild card be the lowest rank not already held', () => {
    const deuces = wildTest({ kind: 'deuces' })!;
    expect(bestLow(['2c', 'Ad', '3h', '4s', '6c'], deuces).label).toBe('Six low, 6-4-3-2-A');
    expect(bestLow(['2c', '2d', 'Ad', '3h', '4s', 'Kc'], deuces).label).toBe('Wheel, 5-4-3-2-A');
    const jokers = wildTest({ kind: 'jokers' })!;
    expect(bestLow(['*1', '*2', 'Kc', 'Kd', 'Qh', 'Qs', 'Jc'], jokers).label).toBe('King low, K-Q-J-2-A');
    expect(bestLow(['2c', '2d', '2h', '2s', '*1'], wildTest({ kind: 'deuces' }))).toMatchObject({ category: 0 });
  });
});

describe('razz', () => {
  it('has the highest card showing bring it in, kings worst and aces low', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 500, razzConfig);
    // Button seat 0. Deal order Bob, Cid, Ann. Up: Kh Ac Ks: the higher suit brings it in, so Ann.
    t.apply({ type: 'start-hand', deck: riggedDeck(['3c', '4d', '5h', '6s', '7c', '8d', 'Kh', 'Ac', 'Ks']) });
    const h = t.state.hand!;
    expect(h.players[0]!.streetBet).toBe(5);
    expect(t.actor()).toBe(1);
    expect(legalActions(t.state, 1)!.toCall).toBe(5);
  });

  it('lets the lowest hand showing act first, and gives the pot to the lowest hand', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 500, razzConfig);
    // Bob ends 9-7-6-3-A, Cid 7-5-4-3-2, Ann Q-8-5-4-2.
    t.apply({
      type: 'start-hand',
      deck: riggedDeck([
        '3c', '4d', '5h', '6s', '7c', '8d', 'Kh', '2s', 'Ks', // third street; Ann brings it in
        'Ad', '3h', 'Kc', // fourth: Bob K-A, Cid 3-2, Ann a pair of kings
        '9c', '5c', '4c', '9d', 'Ts', '2h', '7h', 'Jh', 'Qd',
      ]),
    });
    t.act(1, { type: 'call' });
    t.act(2, { type: 'call' });
    expect(t.state.hand!.streetIndex).toBe(1);
    expect(t.actor()).toBe(2);
    expect(t.state.hand!.log.some((l) => l.text === 'Cid shows the lowest hand and acts first')).toBe(true);
    let guard = 0;
    while (t.state.hand!.stage === 'betting' && guard++ < 40) {
      const seat = t.actor()!;
      const legal = legalActions(t.state, seat)!;
      t.act(seat, legal.canCheck ? { type: 'check' } : { type: 'call' });
    }
    const h = t.state.hand!;
    expect(h.stage).toBe('settled');
    expect(h.results!.showdown).toBe(true);
    expect(h.results!.winners).toEqual([2]);
    expect(h.log.some((l) => l.text.endsWith('with seven low, 7-5-4-3-2'))).toBe(true);
    expect(t.stack(2)).toBe(500 + 2 * 7);
  });

  it('deals a shared card when eight players run the deck out', () => {
    const t = tableWith(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], 500, razzConfig);
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
  });
});
