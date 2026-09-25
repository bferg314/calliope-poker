import { describe, expect, it } from 'vitest';
import {
  bestHand, compareHands, evaluateCards, evaluateThree, fullDeck, isFullDeck, legalActions, shuffle, mulberry32, viewFor, wildLabel, wildTest,
} from '../src/index.js';
import { tableWith } from './helpers.js';

const deuces = wildTest({ kind: 'deuces' })!;
const jokers = wildTest({ kind: 'jokers' })!;
const ev = (s: string, w = deuces) => evaluateCards(s.split(' '), w);

describe('wild cards in a hand', () => {
  it('make every category, up to five of a kind', () => {
    expect(ev('As Ah Ad Ac 2s').label).toBe('Five of a kind, aces');
    expect(ev('9h 8h 7h 6h 2c').label).toBe('Straight flush, ten high');
    expect(ev('Kh Qh Jh Th 2c').label).toBe('Royal flush');
    expect(ev('9h 9d 9s 2c 2h').label).toBe('Five of a kind, nines');
    expect(ev('9h 9d 2s 2c 5h').label).toBe('Four of a kind, nines');
    expect(ev('9h 9d 2s 4c 5h').label).toBe('Three of a kind, nines');
    expect(ev('Qh Qd 7s 7c 2h').label).toBe('Full house, queens full of sevens');
    expect(ev('Th 9d 8s 7c 2h').label).toBe('Straight, jack high');
    expect(ev('Kh 9d 5s 3c 2h').label).toBe('Pair of kings');
  });

  it('let anything go: a wild can repeat a card already held', () => {
    // A-K-9-6 of hearts and a deuce: the deuce is a second ace of hearts, not the queen.
    const h = ev('Ah Kh 9h 6h 2c');
    expect(h.label).toBe('Flush, ace high');
    expect(h.ranks).toEqual([14, 14, 13, 9, 6]);
    expect(compareHands(h, evaluateCards(['Ah', 'Kh', 'Qh', '9h', '6h']))).toBeGreaterThan(0);
  });

  it('beat a straight flush with five of a kind', () => {
    expect(compareHands(ev('2s 2h 2d 2c Ah'), evaluateCards(['As', 'Ks', 'Qs', 'Js', 'Ts']))).toBeGreaterThan(0);
    expect(ev('2s 2h 2d 2c 2s').label).toBe('Five of a kind, aces');
  });

  it('keep the real cards on the hand', () => {
    expect(ev('As Ah Ad Ac 2s').cards).toEqual(['As', 'Ah', 'Ad', 'Ac', '2s']);
  });

  it('tie with the same natural hand', () => {
    expect(compareHands(ev('Ah Ad Kc 2s 7h'), ev('As Ac Kd 2h 7c'))).toBe(0);
  });

  it('play the jokers, and nothing else, when jokers are wild', () => {
    expect(evaluateCards(['*1', '*2', 'Kh', 'Kd', '4c'], jokers).label).toBe('Four of a kind, kings');
    expect(evaluateCards(['2h', '2d', 'Kh', '9c', '4s'], jokers).label).toBe('Pair of twos');
  });

  it('pick the best five of seven, and stay quick with many wilds', () => {
    expect(bestHand(['2h', '2d', '2c', 'Ah', '3s', '7d', '9c'], deuces).label).toBe('Four of a kind, aces');
    const start = Date.now();
    bestHand(['2h', '2d', '2c', '2s', '*1', '*2', 'Kd'], (c) => deuces(c) || jokers(c));
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('play in three-card hands, and in stud showing hands', () => {
    expect(evaluateThree(['Ah', 'Kh', '2c'], deuces).label).toBe('Straight flush, ace high');
    expect(evaluateThree(['9h', '9d', '2c'], deuces).label).toBe('Three of a kind, nines');
    expect(ev('Kh 2c').label).toBe('Pair of kings');
  });

  it('are named for the table', () => {
    expect(wildLabel({ kind: 'deuces' })).toBe('deuces wild');
    expect(wildLabel({ kind: 'one-eyed-jacks' })).toBe('one-eyed jacks wild');
    expect(wildLabel({ kind: 'rank', rank: 7 })).toBe('sevens wild');
    expect(wildLabel({ kind: 'none' })).toBeNull();
    expect(wildTest({ kind: 'one-eyed-jacks' })!('Jh')).toBe(true);
    expect(wildTest({ kind: 'one-eyed-jacks' })!('Jd')).toBe(false);
  });
});

describe('wild cards at the table', () => {
  const deck54 = () => shuffle(fullDeck(2), mulberry32(5));

  it('takes a 54-card deck, and keeps the jokers only when jokers are wild', () => {
    expect(isFullDeck(fullDeck(2))).toBe(true);
    const plain = tableWith(['Ann', 'Bob'], 1000, { variantMode: { kind: 'locked', variantId: 'holdem' } });
    plain.apply({ type: 'start-hand', deck: deck54() });
    expect(plain.state.hand!.deck.some((c) => c.startsWith('*'))).toBe(false);
    expect(plain.state.hand!.deck.length + 4).toBe(52);

    const wild = tableWith(['Ann', 'Bob'], 1000, { variantMode: { kind: 'locked', variantId: 'holdem' }, wild: { kind: 'jokers' } });
    wild.apply({ type: 'start-hand', deck: deck54() });
    const h = wild.state.hand!;
    const all = [...h.deck, ...h.players.flatMap((p) => (p ? p.holeDown : []))];
    expect(all.filter((c) => c.startsWith('*')).sort()).toEqual(['*1', '*2']);
    expect(h.wild).toEqual({ kind: 'jokers' });
    expect(h.log.some((l) => l.text === 'Jokers wild')).toBe(true);
  });

  it('names a joker in the log rather than printing its code', () => {
    const t = tableWith(['Ann', 'Bob'], 1000, { variantMode: { kind: 'locked', variantId: 'holdem' }, wild: { kind: 'jokers' } });
    // Four hole cards, then a flop that includes the first joker.
    t.apply({ type: 'start-hand', deck: ['9h', 'Ks', '8d', '2s', '*1', '7c', '5s', ...fullDeck(2).filter((c) => !['9h', 'Ks', '8d', '2s', '*1', '7c', '5s'].includes(c))] });
    let guard = 0;
    while (t.state.hand!.board.length === 0 && guard++ < 10) {
      const seat = t.actor()!;
      t.act(seat, legalActions(t.state, seat)!.canCheck ? { type: 'check' } : { type: 'call' });
    }
    expect(t.state.hand!.log.some((l) => l.text === 'Flop: Joker 7c 5s')).toBe(true);
  });

  it('lets the dealer pick the wild cards with the game', () => {
    const t = tableWith(['Ann', 'Bob'], 1000, { variantMode: { kind: 'dealers-choice', allowed: ['holdem', 'stud7'] } });
    t.apply({ type: 'start-hand', deck: deck54() });
    const chooser = t.state.hand!.chooser!;
    expect(() => t.apply({ type: 'choose-variant', seat: chooser, variantId: 'stud7', wild: { kind: 'rank', rank: 1 } as never })).toThrow();
    t.apply({ type: 'choose-variant', seat: chooser, variantId: 'stud7', wild: { kind: 'deuces' } });
    expect(t.state.hand!.wild).toEqual({ kind: 'deuces' });
    expect(t.state.hand!.deck.some((c) => c.startsWith('*'))).toBe(false);
    // The view carries the wild cards, so every screen can mark them.
    expect(viewFor(t.state, 'p0').hand!.wild).toEqual({ kind: 'deuces' });
  });

  it('plays a jokers-wild hand to the showdown', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const t = tableWith(['Ann', 'Bob', 'Cid'], 1000, { variantMode: { kind: 'locked', variantId: 'stud7' }, wild: { kind: 'jokers' } });
      t.apply({ type: 'start-hand', deck: shuffle(fullDeck(2), mulberry32(seed)) });
      let guard = 0;
      while (t.state.hand!.stage !== 'settled' && guard++ < 200) {
        const seat = t.actor();
        if (seat === null) break;
        t.act(seat, legalActions(t.state, seat)!.canCheck ? { type: 'check' } : { type: 'call' });
      }
      expect(t.state.hand!.stage).toBe('settled');
      const total = t.state.seats.reduce((a, x) => a + (x?.stack ?? 0), 0);
      expect(total).toBe(3000);
    }
  });
});
