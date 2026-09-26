import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HandSummary } from '@calliope/engine';
import type { LevelSchedule, RoomSettings } from '@calliope/shared';
import { RoomManager, type Client, type ManagerDeps, type RoomRuntime } from '../src/manager.js';

const silentDeps = (onHand?: (s: HandSummary) => void): ManagerDeps => ({
  persist: async () => undefined,
  forget: async () => undefined,
  onRoomCancelled: async () => undefined,
  onRoomCreated: async () => undefined,
  onRoomStarted: async () => undefined,
  onHandSettled: async (_r, summary) => { onHand?.(summary); },
  onNightEnded: async () => undefined,
  publicUrl: 'http://test',
  log: () => undefined,
});

const host: Client = { userId: 'host', send: () => undefined };

/** A room with three bots seated and the first hand dealt. */
async function tableWithBots(
  levels: LevelSchedule,
  extra: Partial<RoomSettings> = {},
  onHand?: (s: HandSummary) => void,
): Promise<{ manager: RoomManager; rt: RoomRuntime }> {
  const manager = new RoomManager(silentDeps(onHand));
  const record = await manager.create(
    { id: 'host', name: 'Host' },
    { settings: { levels, settleSeconds: 2, actionSeconds: 10, ...extra } },
  );
  const rt = manager.get(record.code)!;
  for (const seat of [0, 1, 2]) {
    manager.handle(rt, 'host', { type: 'host', command: { kind: 'add-bot', seat } }, host);
  }
  manager.handle(rt, 'host', { type: 'host', command: { kind: 'start' } }, host);
  return { manager, rt };
}

/**
 * Step the clock forward, watching the table after every step. Returns the set of
 * big-blind values seen inside each hand, so a mid-hand change is detectable.
 */
async function play(rt: RoomRuntime, totalMs: number, stepMs = 250): Promise<Map<number, Set<number>>> {
  const seen = new Map<number, Set<number>>();
  for (let t = 0; t < totalMs; t += stepMs) {
    await vi.advanceTimersByTimeAsync(stepMs);
    const hand = rt.record.table.hand;
    if (hand && hand.stage !== 'settled') {
      const set = seen.get(hand.number) ?? new Set<number>();
      set.add(rt.record.table.config.blinds.big);
      seen.set(hand.number, set);
    }
  }
  return seen;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('rising stakes in a real game', () => {
  it('never changes the stakes in the middle of a hand', async () => {
    const { rt } = await tableWithBots({ kind: 'time', everyMinutes: 1, growth: 1.5, maxLevel: 8 });
    const seen = await play(rt, 6 * 60_000);

    expect(seen.size).toBeGreaterThan(2);
    for (const [handNumber, values] of seen) {
      expect(values.size, `hand ${handNumber} saw blinds ${[...values].join(' and ')}`).toBe(1);
    }
    // And they really did climb over six minutes.
    expect(rt.record.clock.appliedLevel).toBeGreaterThan(0);
    expect(rt.record.table.config.blinds.big).toBeGreaterThan(10);
  });

  it('holds the stakes still when the schedule is off', async () => {
    const { rt } = await tableWithBots({ kind: 'off' });
    await play(rt, 4 * 60_000);

    expect(rt.record.hands.length).toBeGreaterThan(0);
    expect(rt.record.clock.appliedLevel).toBe(0);
    expect(rt.record.table.config.blinds).toEqual({ small: 5, big: 10 });
    for (const h of rt.record.hands) expect(h.stakes.blinds).toEqual({ small: 5, big: 10 });
  });

  it('climbs on a hands cadence and records the stakes on each hand', async () => {
    const settled: HandSummary[] = [];
    const { rt } = await tableWithBots(
      { kind: 'hands', everyHands: 2, growth: 1.5, maxLevel: 8 },
      {},
      (s) => settled.push(s),
    );
    await play(rt, 5 * 60_000);

    expect(settled.length).toBeGreaterThanOrEqual(5);
    const bigs = settled.map((h) => h.stakes.blinds.big);
    // Never goes down, and the level has moved by the fifth hand.
    for (let i = 1; i < bigs.length; i++) expect(bigs[i]!).toBeGreaterThanOrEqual(bigs[i - 1]!);
    expect(bigs[4]!).toBeGreaterThan(bigs[0]!);
    // The first two hands are level 0, so they share the base stakes.
    expect(bigs[0]).toBe(10);
    expect(bigs[1]).toBe(10);
  });

  it('stops climbing while paused and picks up again on resume', async () => {
    const { manager, rt } = await tableWithBots({ kind: 'time', everyMinutes: 1, growth: 1.5, maxLevel: 8 });
    await play(rt, 90_000);
    const levelBefore = rt.record.clock.appliedLevel;
    expect(levelBefore).toBeGreaterThan(0);

    manager.handle(rt, 'host', { type: 'host', command: { kind: 'pause' } }, host);
    await play(rt, 10 * 60_000); // ten minutes of nothing
    expect(rt.record.clock.appliedLevel).toBe(levelBefore);
    expect(rt.record.phase).toBe('paused');

    manager.handle(rt, 'host', { type: 'host', command: { kind: 'start' } }, host);
    await play(rt, 3 * 60_000);
    expect(rt.record.clock.appliedLevel).toBeGreaterThan(levelBefore);
  });

  it('keeps an extension when the host edits other settings', async () => {
    const { manager, rt } = await tableWithBots({ kind: 'off' }, { end: { kind: 'time', minutes: 60 } });
    manager.handle(rt, 'host', { type: 'host', command: { kind: 'extend', minutes: 30 } }, host);
    expect(rt.record.clock.bonusMs).toBe(30 * 60_000);

    manager.handle(rt, 'host', { type: 'host', command: { kind: 'set-settings', settings: { actionSeconds: 45 } } }, host);
    expect(rt.record.clock.bonusMs).toBe(30 * 60_000);
    expect(rt.record.clock.limitMs).toBe(60 * 60_000);
  });

  it('pushes a clock-time end later, and drops extensions when the kind of end changes', async () => {
    const at = Date.now() + 60 * 60_000;
    const { manager, rt } = await tableWithBots({ kind: 'off' }, { end: { kind: 'at', at } });
    expect(rt.record.clock.limitMs).toBeNull();
    manager.handle(rt, 'host', { type: 'host', command: { kind: 'extend', minutes: 15 } }, host);
    expect(rt.record.clock.bonusMs).toBe(15 * 60_000);

    manager.handle(rt, 'host', { type: 'host', command: { kind: 'set-settings', settings: { end: { kind: 'time', minutes: 90 } } } }, host);
    expect(rt.record.clock.bonusMs).toBe(0);
    expect(rt.record.clock.limitMs).toBe(90 * 60_000);
  });

  it('deals only on request when autoDeal is off', async () => {
    const { manager, rt } = await tableWithBots({ kind: 'off' }, { autoDeal: false });
    await play(rt, 60_000);
    const dealt = rt.record.hands.length;

    manager.handle(rt, 'host', { type: 'host', command: { kind: 'deal' } }, host);
    await play(rt, 60_000);
    expect(rt.record.hands.length).toBe(dealt + 1);
  });
});
