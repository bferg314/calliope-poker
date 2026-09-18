import { describe, expect, it } from 'vitest';
import { bestHand, bestHandOmaha, compareHands, evaluateCards, fullDeck, isFullDeck, seededDeck } from '../src/index.js';

const ev = (s: string) => evaluateCards(s.split(' '));
const best = (s: string) => bestHand(s.split(' '));

describe('evaluateCards', () => {
  it('names every category', () => {
    expect(ev('As Ks Qs Js Ts').label).toBe('Royal flush');
    expect(ev('9h 8h 7h 6h 5h').label).toBe('Straight flush, nine high');
    expect(ev('9h 9d 9s 9c 2h').label).toBe('Four of a kind, nines');
    expect(ev('Qh Qd Qs 7c 7h').label).toBe('Full house, queens full of sevens');
    expect(ev('Ah 9h 7h 4h 2h').label).toBe('Flush, ace high');
    expect(ev('Th 9d 8s 7c 6h').label).toBe('Straight, ten high');
    expect(ev('5h 4d 3s 2c Ah').label).toBe('Straight, five high');
    expect(ev('8h 8d 8s Kc 2h').label).toBe('Three of a kind, eights');
    expect(ev('Kh Kd 4s 4c 9h').label).toBe('Two pair, kings and fours');
    expect(ev('Jh Jd 4s 7c 9h').label).toBe('Pair of jacks');
    expect(ev('Ah Jd 4s 7c 9h').label).toBe('Ace high');
  });

  it('orders categories and kickers', () => {
    const order = [
      'Ah Jd 4s 7c 9h', 'Jh Jd 4s 7c 9h', 'Kh Kd 4s 4c 9h', '8h 8d 8s Kc 2h', '5h 4d 3s 2c Ah',
      'Th 9d 8s 7c 6h', 'Ah 9h 7h 4h 2h', 'Qh Qd Qs 7c 7h', '9h 9d 9s 9c 2h', '9h 8h 7h 6h 5h', 'As Ks Qs Js Ts',
    ].map(ev);
    for (let i = 1; i < order.length; i++) expect(compareHands(order[i]!, order[i - 1]!)).toBeGreaterThan(0);
    // kicker
    expect(compareHands(ev('Ah Kd 4s 7c 9h'), ev('Ah Qd 4s 7c 9h'))).toBeGreaterThan(0);
    // two pair: higher top pair wins, then low pair, then kicker
    expect(compareHands(ev('Ah Ad 2s 2c 3h'), ev('Kh Kd Qs Qc Jh'))).toBeGreaterThan(0);
    expect(compareHands(ev('Kh Kd 4s 4c 9h'), ev('Kh Kd 3s 3c Ah'))).toBeGreaterThan(0);
    expect(compareHands(ev('Kh Kd 4s 4c 9h'), ev('Kc Ks 4d 4h 8h'))).toBeGreaterThan(0);
    // wheel loses to six-high straight
    expect(compareHands(ev('6h 5d 4s 3c 2h'), ev('5h 4d 3s 2c Ah'))).toBeGreaterThan(0);
    // ties
    expect(compareHands(ev('Ah Kd 4s 7c 9h'), ev('Ac Ks 4d 7h 9c'))).toBe(0);
  });

  it('ranks partial (stud showing) hands without straights or flushes', () => {
    expect(ev('Ah Kh Qh Jh').category).toBe(0);
    expect(ev('9h 9d').label).toBe('Pair of nines');
    expect(compareHands(ev('2h 2d'), ev('Ah Kd Qc'))).toBeGreaterThan(0);
  });
});

describe('bestHand', () => {
  it('picks the best five of seven', () => {
    expect(best('Ah Kh 2c 7d Qh Jh Th').label).toBe('Royal flush');
    expect(best('9h 9d 2c 2d 9s Kh 2h').label).toBe('Full house, nines full of twos');
    expect(best('Ah Ad 2c 7d Qh Jh Th').label).toBe('Pair of aces');
  });
});

describe('bestHandOmaha', () => {
  it('uses exactly two hole cards', () => {
    // Board flush; only one heart in hand: no flush.
    const h = bestHandOmaha(['Ah', '2c', '3d', '4s'], ['Kh', 'Qh', 'Jh', '9h', '2d']);
    expect(h.category).toBeLessThan(5);
    // Four of a kind in hand only counts as a pair.
    const q = bestHandOmaha(['Ah', 'Ad', 'Ac', 'As'], ['Kh', 'Qd', 'Jc', '9s', '2d']);
    expect(q.label).toBe('Pair of aces');
    // Straight using two hole cards
    const s = bestHandOmaha(['Th', '9d', '2c', '2s'], ['8h', '7d', '6c', 'Ks', 'Kd']);
    expect(s.label).toBe('Straight, ten high');
  });
});

describe('deck', () => {
  it('has 52 distinct cards and shuffles deterministically', () => {
    expect(isFullDeck(fullDeck())).toBe(true);
    expect(isFullDeck(seededDeck(7))).toBe(true);
    expect(seededDeck(7)).toEqual(seededDeck(7));
    expect(seededDeck(7)).not.toEqual(seededDeck(8));
  });
});
