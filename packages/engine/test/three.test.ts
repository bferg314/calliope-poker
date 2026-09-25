import { describe, expect, it } from 'vitest';
import { compareHands, evaluateThree, legalActions } from '../src/index.js';
import { riggedDeck, tableWith } from './helpers.js';

const ev = (s: string) => evaluateThree(s.split(' '));

describe('evaluateThree', () => {
  it('names every category', () => {
    expect(ev('Qh Jh Th').label).toBe('Straight flush, queen high');
    expect(ev('Ah Kh Qh').label).toBe('Straight flush, ace high');
    expect(ev('7h 7d 7s').label).toBe('Three of a kind, sevens');
    expect(ev('9h 8d 7s').label).toBe('Straight, nine high');
    expect(ev('Ah 2d 3s').label).toBe('Straight, three high');
    expect(ev('Kh 9h 2h').label).toBe('Flush, king high');
    expect(ev('Jh Jd 4s').label).toBe('Pair of jacks');
    expect(ev('Ah Jd 4s').label).toBe('Ace high');
  });

  it('ranks a straight over a flush, and trips over both', () => {
    const order = ['Ah Jd 4s', '2h 2d 3s', 'Ah Kh 9h', 'Ah 2d 3s', 'Ah Kd Qs', '2h 2d 2s', 'Ah 2h 3h', 'Ah Kh Qh'].map(ev);
    for (let i = 1; i < order.length; i++) expect(compareHands(order[i]!, order[i - 1]!)).toBeGreaterThan(0);
  });

  it('breaks ties on the pair, then the kicker, and splits the rest', () => {
    expect(compareHands(ev('Kh Kd 2s'), ev('Qh Qd As'))).toBeGreaterThan(0);
    expect(compareHands(ev('Kh Kd 9s'), ev('Kc Ks 8d'))).toBeGreaterThan(0);
    expect(compareHands(ev('Ah Jd 4s'), ev('Ac Js 4d'))).toBe(0);
    expect(compareHands(ev('Ah Kd Qs'), ev('Kh Qd Js'))).toBeGreaterThan(0);
  });

  it('takes exactly three cards', () => {
    expect(() => evaluateThree(['Ah', 'Kd'])).toThrow();
  });
});

describe('three-card poker at the table', () => {
  it('deals three down, bets once, and pays the straight over the flush', () => {
    const t = tableWith(['Ann', 'Bob'], 1000, { variantMode: { kind: 'locked', variantId: 'three' } });
    // 9h on top gives Bob the button, so Ann is dealt first: 9h 8d 7c against Ks 2s 5s.
    t.apply({ type: 'start-hand', deck: riggedDeck(['9h', 'Ks', '8d', '2s', '7c', '5s']) });
    expect(t.state.hand!.players[0]!.holeDown).toEqual(['9h', '8d', '7c']);
    expect(t.state.hand!.players[1]!.holeDown).toEqual(['Ks', '2s', '5s']);
    let guard = 0;
    while (t.state.hand!.stage === 'betting' && guard++ < 10) {
      const seat = t.actor()!;
      t.act(seat, legalActions(t.state, seat)!.canCheck ? { type: 'check' } : { type: 'call' });
    }
    const r = t.state.hand!.results!;
    expect(r.showdown).toBe(true);
    expect(r.winners).toEqual([0]);
    expect(r.hands[0]!.label).toBe('Straight, nine high');
    expect(r.hands[1]!.label).toBe('Flush, king high');
  });

  it('three-card draw stops for a draw of up to three', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 1000, { variantMode: { kind: 'locked', variantId: 'draw3' } });
    t.apply({ type: 'start-hand', deck: riggedDeck(['3c']) });
    let guard = 0;
    while (t.state.hand!.stage === 'betting' && guard++ < 10) {
      const seat = t.actor()!;
      t.act(seat, legalActions(t.state, seat)!.canCheck ? { type: 'check' } : { type: 'call' });
    }
    expect(t.state.hand!.stage).toBe('discarding');
    expect(t.effects.at(-1)).toMatchObject({ type: 'await-discard', min: 0, max: 3, replace: true });
  });
});
