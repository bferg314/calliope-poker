import { describe, expect, it } from 'vitest';
import {
  baseStakesOf, chipUnitOf, DEFAULT_ROOM_SETTINGS, ladderOptsOf, levelLadder, levelScheduleSchema,
  roomSettingsSchema, sameStakes, stakesForLevel, type LevelStakes,
} from '../src/index.js';

const base: LevelStakes = {
  blinds: { small: 5, big: 10 },
  ante: 0,
  bringIn: 5,
  fixedLimit: { small: 10, big: 20 },
};

const opts = { growth: 1.5, chipUnit: 1 };

describe('levelLadder', () => {
  it('leaves level 0 exactly as the host set it', () => {
    expect(levelLadder(base, opts, 4)[0]).toEqual(base);
    expect(sameStakes(stakesForLevel(base, opts, 0), base)).toBe(true);
  });

  it('agrees with stakesForLevel at every level', () => {
    const ladder = levelLadder(base, opts, 8);
    for (let i = 0; i < ladder.length; i++) expect(stakesForLevel(base, opts, i)).toEqual(ladder[i]);
  });

  it('climbs strictly, even at the lowest growth and coarsest chips', () => {
    const coarse = { blinds: { small: 25, big: 50 }, ante: 5, bringIn: 25, fixedLimit: { small: 50, big: 100 } };
    for (const growth of [1.05, 1.1, 1.25, 1.5, 2, 3]) {
      for (const chipUnit of [1, 5, 25, 100]) {
        const ladder = levelLadder(coarse, { growth, chipUnit }, 20);
        for (let i = 1; i < ladder.length; i++) {
          const prev = ladder[i - 1]!;
          const cur = ladder[i]!;
          const where = `growth ${growth}, unit ${chipUnit}, level ${i}`;
          expect(cur.blinds.big, where).toBeGreaterThan(prev.blinds.big);
          expect(cur.blinds.small, where).toBeGreaterThan(prev.blinds.small);
          expect(cur.fixedLimit.big, where).toBeGreaterThan(prev.fixedLimit.big);
          expect(cur.fixedLimit.small, where).toBeGreaterThan(prev.fixedLimit.small);
          expect(cur.ante, where).toBeGreaterThan(prev.ante);
        }
      }
    }
  });

  it('keeps every value a whole number of chips', () => {
    const ladder = levelLadder(base, { growth: 1.5, chipUnit: 5 }, 12);
    for (const l of ladder.slice(1)) {
      for (const v of [l.blinds.small, l.blinds.big, l.ante, l.bringIn, l.fixedLimit.small, l.fixedLimit.big]) {
        expect(Number.isInteger(v)).toBe(true);
        if (v > 0) expect(v % 5).toBe(0);
      }
    }
  });

  it('never invents a forced bet the game does not use', () => {
    const noAnte = levelLadder(base, opts, 12);
    expect(noAnte.every((l) => l.ante === 0)).toBe(true);
    const noBringIn = levelLadder({ ...base, bringIn: 0 }, opts, 12);
    expect(noBringIn.every((l) => l.bringIn === 0)).toBe(true);
    const noSmall = levelLadder({ ...base, blinds: { small: 0, big: 10 } }, opts, 12);
    expect(noSmall.every((l) => l.blinds.small === 0)).toBe(true);
  });

  it('grows a non-zero ante', () => {
    const stud = { blinds: { small: 0, big: 10 }, ante: 1, bringIn: 5, fixedLimit: { small: 10, big: 20 } };
    const ladder = levelLadder(stud, opts, 8);
    expect(ladder[7]!.ante).toBeGreaterThan(stud.ante);
    expect(ladder.every((l) => l.bringIn <= l.fixedLimit.small)).toBe(true);
  });

  it('keeps the orderings that held at level 0', () => {
    for (const growth of [1.05, 1.5, 3]) {
      const ladder = levelLadder(base, { growth, chipUnit: 1 }, 20);
      for (const l of ladder) {
        expect(l.blinds.small).toBeLessThanOrEqual(l.blinds.big);
        expect(l.fixedLimit.small).toBeLessThanOrEqual(l.fixedLimit.big);
        expect(l.bringIn).toBeLessThanOrEqual(l.fixedLimit.small);
      }
    }
  });

  it('gives the same answer however many levels are asked for', () => {
    // The server resolves one level at a time; the lobby previews many at once.
    for (const growth of [1.05, 1.25, 1.5, 2, 3]) {
      for (const chipUnit of [1, 5, 25]) {
        const o = { growth, chipUnit };
        const many = levelLadder(base, o, 20);
        for (let i = 0; i < many.length; i++) {
          expect(stakesForLevel(base, o, i), `growth ${growth}, unit ${chipUnit}, level ${i}`).toEqual(many[i]);
          expect(levelLadder(base, o, i + 1)[i]).toEqual(many[i]);
        }
      }
    }
  });

  it('reads like a blind structure somebody wrote down', () => {
    const ladder = levelLadder(base, { growth: 1.5, chipUnit: 1 }, 8);
    expect(ladder.map((l) => `${l.blinds.small}/${l.blinds.big}`)).toEqual([
      '5/10', '8/15', '10/20', '15/30', '25/50', '40/80', '50/100', '75/150',
    ]);
  });

  it('roughly tracks the growth factor', () => {
    const ladder = levelLadder(base, { growth: 2, chipUnit: 1 }, 5);
    expect(ladder[1]!.blinds.big).toBe(20);
    expect(ladder[2]!.blinds.big).toBe(40);
    expect(ladder[4]!.blinds.big).toBeGreaterThanOrEqual(150);
    expect(ladder[3]!.blinds.big).toBe(80);
  });
});

describe('settings', () => {
  it('defaults the schedule to off and heals rooms saved before it existed', () => {
    expect(DEFAULT_ROOM_SETTINGS.levels).toEqual({ kind: 'off' });
    const { levels, ...withoutLevels } = DEFAULT_ROOM_SETTINGS;
    expect(levels).toBeDefined();
    const healed = roomSettingsSchema.parse(withoutLevels);
    expect(healed.levels).toEqual({ kind: 'off' });
  });

  it('reads base stakes and the smallest chip out of settings', () => {
    expect(baseStakesOf(DEFAULT_ROOM_SETTINGS)).toEqual({
      blinds: { small: 5, big: 10 },
      ante: 0,
      bringIn: 5,
      fixedLimit: { small: 10, big: 20 },
    });
    expect(chipUnitOf(DEFAULT_ROOM_SETTINGS)).toBe(1);
    expect(chipUnitOf({ ...DEFAULT_ROOM_SETTINGS, chips: { ...DEFAULT_ROOM_SETTINGS.chips, denominations: [{ value: 25, label: 'green', color: '#2E5E4E' }] } })).toBe(25);
  });

  it('rejects a cadence outside its bounds', () => {
    expect(levelScheduleSchema.safeParse({ kind: 'time', everyMinutes: 0, growth: 1.5, maxLevel: 12 }).success).toBe(false);
    expect(levelScheduleSchema.safeParse({ kind: 'time', everyMinutes: 20, growth: 1.5, maxLevel: 12 }).success).toBe(true);
    expect(levelScheduleSchema.safeParse({ kind: 'hands', everyHands: 10, growth: 1.5, maxLevel: 12 }).success).toBe(true);
    expect(levelScheduleSchema.safeParse({ kind: 'hands', everyHands: 10, growth: 9, maxLevel: 12 }).success).toBe(false);
  });

  it('uses the table chips as the finest rounding step', () => {
    const settings = { ...DEFAULT_ROOM_SETTINGS, chips: { ...DEFAULT_ROOM_SETTINGS.chips, denominations: [{ value: 25, label: 'green', color: '#2E5E4E' }] } };
    const ladder = levelLadder(baseStakesOf(settings), ladderOptsOf({ kind: 'time', everyMinutes: 10, growth: 1.5, maxLevel: 12 }, chipUnitOf(settings)), 6);
    for (const l of ladder.slice(1)) expect(l.blinds.big % 25).toBe(0);
  });
});
