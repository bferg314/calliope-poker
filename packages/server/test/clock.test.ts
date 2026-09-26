import { describe, expect, it } from 'vitest';
import {
  absorbDowntime, DOWNTIME_GRACE_MS, elapsedPlayingMs, endsAtOf, levelViewOf, migrateClock,
  newRoom, nightIsUp, remainingMs, targetLevel, type RoomRecord,
} from '../src/room.js';

const MIN = 60_000;

function room(now = 1_000_000): RoomRecord {
  return newRoom({ code: 'ABCDEF', host: { id: 'h', name: 'Host' }, now });
}

/** Start the night at `at`, with an optional time limit in minutes. */
function start(r: RoomRecord, at: number, limitMinutes?: number): void {
  r.phase = 'playing';
  r.clock.startedAt = at;
  r.clock.pausedAt = null;
  r.clock.pausedMs = 0;
  r.clock.bonusMs = 0;
  r.clock.limitMs = limitMinutes === undefined ? null : limitMinutes * MIN;
  r.clock.tickedAt = at;
}

const pause = (r: RoomRecord, at: number): void => { r.clock.pausedAt = at; r.phase = 'paused'; };
const resume = (r: RoomRecord, at: number): void => {
  r.clock.pausedMs += at - r.clock.pausedAt!;
  r.clock.pausedAt = null;
  r.phase = 'playing';
};

describe('elapsedPlayingMs', () => {
  it('is zero before the night starts', () => {
    expect(elapsedPlayingMs(room(), 9_999_999)).toBe(0);
  });

  it('counts only the running intervals across three pause cycles', () => {
    const r = room();
    const t0 = 1_000_000;
    start(r, t0);
    // run 10, pause 5, run 10, pause 30, run 10, pause 2, run 10
    pause(r, t0 + 10 * MIN);
    resume(r, t0 + 15 * MIN);
    pause(r, t0 + 25 * MIN);
    resume(r, t0 + 55 * MIN);
    pause(r, t0 + 65 * MIN);
    resume(r, t0 + 67 * MIN);
    expect(elapsedPlayingMs(r, t0 + 77 * MIN)).toBe(40 * MIN);
    expect(r.clock.pausedMs).toBe(37 * MIN);
  });

  it('freezes while paused and never goes backwards', () => {
    const r = room();
    const t0 = 1_000_000;
    start(r, t0);
    pause(r, t0 + 10 * MIN);
    expect(elapsedPlayingMs(r, t0 + 10 * MIN)).toBe(10 * MIN);
    expect(elapsedPlayingMs(r, t0 + 60 * MIN)).toBe(10 * MIN);
    expect(elapsedPlayingMs(r, t0 + 600 * MIN)).toBe(10 * MIN);
    resume(r, t0 + 600 * MIN);
    expect(elapsedPlayingMs(r, t0 + 601 * MIN)).toBe(11 * MIN);
  });

  it('keeps the night clock alive across a long pause', () => {
    const r = room();
    const t0 = 1_000_000;
    start(r, t0, 60);
    pause(r, t0 + 30 * MIN);
    // Two hours of pizza. Under the old wall-clock rule the night would be over.
    const later = t0 + 150 * MIN;
    expect(nightIsUp(r, later)).toBe(false);
    expect(remainingMs(r, later)).toBe(30 * MIN);
    expect(endsAtOf(r, later)).toBeNull(); // no deadline while paused
    resume(r, later);
    expect(remainingMs(r, later + 10 * MIN)).toBe(20 * MIN);
    expect(endsAtOf(r, later + 10 * MIN)).toBe(later + 30 * MIN);
    expect(nightIsUp(r, later + 31 * MIN)).toBe(true);
  });
});

describe('restoring from Redis', () => {
  it('turns an old absolute deadline into a playing-time budget', () => {
    const t0 = 1_000_000;
    const legacy = room(t0);
    legacy.phase = 'playing';
    // The shape rooms were saved with before the clock rework.
    (legacy as unknown as { clock: unknown }).clock = { startedAt: t0, endsAt: t0 + 90 * MIN };
    delete (legacy.settings as Partial<typeof legacy.settings>).levels;

    migrateClock(legacy, t0 + 30 * MIN);
    expect(legacy.clock.limitMs).toBe(90 * MIN);
    expect(legacy.clock.pausedMs).toBe(0);
    expect(legacy.clock.appliedLevel).toBe(0);
    expect(legacy.settings.levels).toEqual({ kind: 'off' });
    expect('endsAt' in (legacy.clock as object)).toBe(false);
    expect(remainingMs(legacy, t0 + 30 * MIN)).toBe(60 * MIN);
  });

  it('absorbs server downtime and comes back paused', () => {
    const r = room();
    const t0 = 1_000_000;
    start(r, t0, 60);
    r.clock.tickedAt = t0 + 10 * MIN;
    const back = t0 + 40 * MIN; // thirty minutes of downtime

    expect(absorbDowntime(r, back)).toBe(true);
    expect(r.phase).toBe('paused');
    expect(elapsedPlayingMs(r, back)).toBe(10 * MIN);
    expect(remainingMs(r, back)).toBe(50 * MIN);
  });

  it('ignores a gap shorter than the grace period', () => {
    const r = room();
    const t0 = 1_000_000;
    start(r, t0, 60);
    r.clock.tickedAt = t0 + 10 * MIN;
    const back = t0 + 10 * MIN + DOWNTIME_GRACE_MS - 1;

    expect(absorbDowntime(r, back)).toBe(false);
    expect(r.phase).toBe('playing');
    expect(r.clock.pausedAt).toBeNull();
  });

  it('leaves an already paused room alone', () => {
    const r = room();
    const t0 = 1_000_000;
    start(r, t0, 60);
    pause(r, t0 + 10 * MIN);
    r.clock.tickedAt = t0 + 10 * MIN;

    expect(absorbDowntime(r, t0 + 200 * MIN)).toBe(false);
    expect(elapsedPlayingMs(r, t0 + 200 * MIN)).toBe(10 * MIN);
  });
});

describe('level resolution', () => {
  const rising = { kind: 'time' as const, everyMinutes: 10, growth: 1.5, maxLevel: 5 };

  it('stays put when the schedule is off', () => {
    const r = room();
    start(r, 1_000_000);
    expect(targetLevel(r, 1_000_000 + 500 * MIN)).toBe(0);
    expect(levelViewOf(r, 1_000_000).rising).toBe(false);
  });

  it('climbs on the clock and stops at the cap', () => {
    const r = room();
    const t0 = 1_000_000;
    r.settings = { ...r.settings, levels: rising };
    start(r, t0);
    expect(targetLevel(r, t0 + 9 * MIN)).toBe(0);
    expect(targetLevel(r, t0 + 10 * MIN)).toBe(1);
    expect(targetLevel(r, t0 + 35 * MIN)).toBe(3);
    expect(targetLevel(r, t0 + 999 * MIN)).toBe(5); // maxLevel
  });

  it('does not count paused time towards the next level', () => {
    const r = room();
    const t0 = 1_000_000;
    r.settings = { ...r.settings, levels: rising };
    start(r, t0);
    pause(r, t0 + 5 * MIN);
    expect(targetLevel(r, t0 + 120 * MIN)).toBe(0);
    expect(levelViewOf(r, t0 + 120 * MIN).frozen).toBe(true);
    resume(r, t0 + 120 * MIN);
    expect(targetLevel(r, t0 + 125 * MIN)).toBe(1);
  });

  it('counts hands on a hands cadence', () => {
    const r = room();
    const t0 = 1_000_000;
    r.settings = { ...r.settings, levels: { kind: 'hands', everyHands: 3, growth: 1.5, maxLevel: 5 } };
    start(r, t0);
    const fakeHand = (): never => ({}) as never;
    expect(targetLevel(r, t0)).toBe(0);
    r.hands.push(fakeHand(), fakeHand());
    expect(targetLevel(r, t0 + 999 * MIN)).toBe(0); // time is irrelevant here
    r.hands.push(fakeHand());
    expect(targetLevel(r, t0)).toBe(1);
    // Due now, but not applied until the next hand is dealt.
    expect(levelViewOf(r, t0).handsUntilNext).toBe(0);
    r.clock.appliedLevel = 1;
    expect(levelViewOf(r, t0).handsUntilNext).toBe(3);
  });

  it('re-anchors instead of walking the level backwards', () => {
    const r = room();
    const t0 = 1_000_000;
    r.settings = { ...r.settings, levels: rising };
    start(r, t0);
    r.clock.appliedLevel = 3;
    // At minute 35 the host doubles the level length. Re-anchoring pins level 3.
    r.clock.levelAnchor = { atMs: 35 * MIN, atHands: 0, level: 3 };
    r.settings = { ...r.settings, levels: { ...rising, everyMinutes: 20 } };
    expect(targetLevel(r, t0 + 35 * MIN)).toBe(3);
    expect(targetLevel(r, t0 + 54 * MIN)).toBe(3);
    expect(targetLevel(r, t0 + 55 * MIN)).toBe(4);
  });

  it('reports the stakes actually in play, not a recomputed guess', () => {
    const r = room();
    const t0 = 1_000_000;
    r.settings = { ...r.settings, levels: rising };
    start(r, t0);
    const view = levelViewOf(r, t0);
    expect(view.stakes.blinds).toEqual({ small: 5, big: 10 });
    expect(view.next?.blinds.big).toBeGreaterThan(10);
    expect(view.msUntilNext).toBe(10 * MIN);
    expect(view.nextAt).toBe(t0 + 10 * MIN);
  });
});

describe('a night that ends at a clock time', () => {
  const at = (r: RoomRecord, deadline: number): void => { r.settings = { ...r.settings, end: { kind: 'at', at: deadline } }; };

  it('counts down in wall time, straight through a pause', () => {
    const r = room();
    const t0 = 1_000_000;
    start(r, t0);
    at(r, t0 + 60 * MIN);
    expect(remainingMs(r, t0 + 10 * MIN)).toBe(50 * MIN);
    pause(r, t0 + 10 * MIN);
    expect(remainingMs(r, t0 + 40 * MIN)).toBe(20 * MIN);
    // The deadline stays fixed while paused, unlike a playing-time limit.
    expect(endsAtOf(r, t0 + 40 * MIN)).toBe(t0 + 60 * MIN);
    expect(nightIsUp(r, t0 + 59 * MIN)).toBe(false);
    expect(nightIsUp(r, t0 + 60 * MIN)).toBe(true);
  });

  it('moves later by whatever the host adds', () => {
    const r = room();
    const t0 = 1_000_000;
    start(r, t0);
    at(r, t0 + 60 * MIN);
    r.clock.bonusMs = 15 * MIN;
    expect(endsAtOf(r, t0)).toBe(t0 + 75 * MIN);
    expect(nightIsUp(r, t0 + 70 * MIN)).toBe(false);
  });
});
