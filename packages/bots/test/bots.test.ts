import { describe, expect, it } from 'vitest';
import { createTable, fullDeck, legalActions, mulberry32, reduce, seededDeck, shuffle, type TableState, type Wild } from '@calliope/engine';
import { BOT_PERSONALITIES } from '@calliope/shared';
import { blindStrength, chenStrength, chooseDiscards, decideAction, drawKeep, drawKeepThree, estimateStrength } from '../src/index.js';

function table(names: string[], config = {}): TableState {
  let s = createTable(config);
  names.forEach((name, i) => {
    s = reduce(s, { type: 'sit', seat: i, player: { id: `b${i}`, name, kind: 'bot' }, stack: 1000 }).state;
  });
  return s;
}

describe('strength', () => {
  it('rates premium hands above junk', () => {
    expect(chenStrength('Ah', 'Ad')).toBeGreaterThan(chenStrength('Kh', 'Qd'));
    expect(chenStrength('Kh', 'Qd')).toBeGreaterThan(chenStrength('7h', '2d'));
    expect(chenStrength('Jh', 'Th')).toBeGreaterThan(chenStrength('Jh', 'Td'));
  });

  it('is between 0 and 1 during a hand', () => {
    const s = reduce(table(['A', 'B', 'C']), { type: 'start-hand', deck: seededDeck(3) }).state;
    for (let seat = 0; seat < 3; seat++) {
      const v = estimateStrength(s, seat);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('decideAction', () => {
  const wilds: Wild[] = [{ kind: 'none' }, { kind: 'jokers' }, { kind: 'deuces' }];
  const cases = BOT_PERSONALITIES.flatMap((personality) => wilds.map((wild) => [personality, wild] as const));
  for (const variantId of ['holdem', 'omaha', 'stud7', 'stud5', 'pineapple', 'draw5', 'three', 'draw3', 'bluff']) {
    for (const [personality, wild] of cases) {
      const named = wild.kind === 'none' ? '' : ` with ${wild.kind} wild`;
      it(`plays ${variantId} legally as ${personality}${named}`, () => {
        const r = mulberry32(7);
        const rng = () => r(1_000_000) / 1_000_000;
        let s = table(['A', 'B', 'C', 'D'], { variantMode: { kind: 'locked', variantId }, ante: 1, wild });
        for (let hand = 0; hand < 15; hand++) {
          if (s.seats.filter((x) => x && x.stack > 0).length < 2) break;
          // The server always shuffles both jokers in; the engine keeps them only when they are wild.
          const deck = wild.kind === 'none' ? seededDeck(100 + hand) : shuffle(fullDeck(2), mulberry32(100 + hand));
          s = reduce(s, { type: 'start-hand', deck }).state;
          let guard = 0;
          while ((s.hand!.stage === 'betting' || s.hand!.stage === 'discarding') && guard++ < 300) {
            const seat = s.hand!.round.actor!;
            if (s.hand!.stage === 'discarding') {
              const cards = chooseDiscards(s, seat);
              s = reduce(s, { type: 'discard', seat, cards }).state;
              continue;
            }
            const action = decideAction(s, seat, personality, rng);
            const legal = legalActions(s, seat)!;
            if (action.type === 'bet' || action.type === 'raise') {
              expect(legal.raise).not.toBeNull();
              expect(action.to).toBeGreaterThanOrEqual(legal.raise!.min);
              expect(action.to).toBeLessThanOrEqual(legal.raise!.max);
            }
            s = reduce(s, { type: 'action', seat, action }).state;
          }
          expect(s.hand!.stage).toBe('settled');
          s = reduce(s, { type: 'finish-hand' }).state;
        }
        const total = s.seats.reduce((a, x) => a + (x?.stack ?? 0), 0);
        expect(total).toBe(4000);
      });
    }
  }
});

describe('wild cards', () => {
  it('are never thrown away in a draw', () => {
    let s = table(['A', 'B'], { variantMode: { kind: 'locked', variantId: 'draw5' }, wild: { kind: 'deuces' } });
    s = reduce(s, { type: 'start-hand', deck: seededDeck(3) }).state;
    const h = s.hand!;
    for (const p of h.players) if (p) p.holeDown = ['2c', '7d', '9h', 'Js', '4c'];
    h.stage = 'discarding';
    h.streetIndex = 1;
    const toss = chooseDiscards(s, h.players.find(Boolean)!.seat);
    expect(toss).not.toContain('2c');
  });
});

describe("Blind Man's Bluff", () => {
  /** Three seated, a hand dealt, with seat 0's own card set to `own`. */
  function dealt(own: string, others: [string, string]): TableState {
    let s = createTable({ variantMode: { kind: 'locked', variantId: 'bluff' } });
    ['A', 'B', 'C'].forEach((name, i) => {
      s = reduce(s, { type: 'sit', seat: i, player: { id: `p${i}`, name, kind: 'bot' }, stack: 1000 }).state;
    });
    s = reduce(s, { type: 'start-hand', deck: seededDeck(1) }).state;
    const h = s.hand!;
    h.players[0]!.holeUp = [own];
    h.players[1]!.holeUp = [others[0]];
    h.players[2]!.holeUp = [others[1]];
    return s;
  }

  it('never reads its own card', () => {
    for (const own of ['2c', 'Ah', '7d']) {
      expect(estimateStrength(dealt(own, ['Ks', '4d']), 0)).toBeCloseTo(estimateStrength(dealt('Qc', ['Ks', '4d']), 0));
    }
  });

  it('reads the table: low cards showing mean yours is likely best', () => {
    expect(blindStrength(dealt('2c', ['3s', '4d']), 0)).toBeGreaterThan(0.8);
    expect(blindStrength(dealt('2c', ['As', '4d']), 0)).toBeLessThan(0.05);
  });

  it('decides the same whatever its own card is', () => {
    const act = (own: string) => {
      const s = dealt('5h', ['Ts', '9d']);
      const seat = s.hand!.round.actor!;
      s.hand!.players[seat]!.holeUp = [own];
      const rng = mulberry32(7);
      return decideAction(s, seat, 'tight', () => rng(1_000_000) / 1_000_000);
    };
    expect(act('2c')).toEqual(act('Ac'));
  });
});

describe('drawKeepThree', () => {
  const hand = (t: string): string[] => t.split(' ');
  it('stands pat on a flush or better', () => {
    expect(drawKeepThree(hand('Kh 9h 2h'))).toHaveLength(3);
    expect(drawKeepThree(hand('9h 8d 7s'))).toHaveLength(3);
    expect(drawKeepThree(hand('7h 7d 7s'))).toHaveLength(3);
  });
  it('keeps a pair, two to a straight flush, or a queen or better', () => {
    expect(drawKeepThree(hand('Jh Jd 4s'))).toEqual(['Jh', 'Jd']);
    expect(drawKeepThree(hand('8s 9s 2d'))).toEqual(['8s', '9s']);
    expect(drawKeepThree(hand('Ks 7d 2c'))).toEqual(['Ks']);
    expect(drawKeepThree(hand('Ts 7d 2c'))).toEqual([]);
  });
});

describe('drawKeep', () => {
  const hand = (t: string): string[] => t.split(' ');

  it('stands pat on a made hand', () => {
    expect(drawKeep(hand('Ah Kh Qh Jh Th'))).toHaveLength(5); // straight flush
    expect(drawKeep(hand('9h 9d 9s 2c 2h'))).toHaveLength(5); // full house
    expect(drawKeep(hand('Th 9d 8s 7c 6h'))).toHaveLength(5); // straight
  });

  it('keeps the trips and draws two', () => {
    expect(drawKeep(hand('9h 9d 9s Kc 2h'))).toHaveLength(3);
  });

  it('keeps two pair and draws one', () => {
    expect(drawKeep(hand('9h 9d 4s 4c Kh'))).toHaveLength(4);
  });

  it('keeps a pair and draws three', () => {
    const keep = drawKeep(hand('9h 9d 4s 7c Kh'));
    expect(keep).toHaveLength(2);
    expect(keep.every((c) => c.startsWith('9'))).toBe(true);
  });

  it('keeps four to a flush or a straight over a bare pair', () => {
    expect(drawKeep(hand('Ah 9h 7h 4h 2c'))).toEqual(hand('Ah 9h 7h 4h'));
    expect(drawKeep(hand('Th 9d 8s 7c 2h'))).toHaveLength(4);
  });

  it('keeps an ace out of nothing', () => {
    expect(drawKeep(hand('Ah Kd 8s 5c 3h'))).toEqual(['Ah']);
    expect(drawKeep(hand('Qh Jd 8s 5c 3h'))).toEqual([]);
  });
});
