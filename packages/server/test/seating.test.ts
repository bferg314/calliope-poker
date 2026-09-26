import { describe, expect, it } from 'vitest';
import { RoomManager, type Client, type ManagerDeps } from '../src/manager.js';

const deps: ManagerDeps = {
  persist: async () => undefined,
  forget: async () => undefined,
  onRoomCancelled: async () => undefined,
  onRoomCreated: async () => undefined,
  onRoomStarted: async () => undefined,
  onHandSettled: async () => undefined,
  onNightEnded: async () => undefined,
  publicUrl: 'http://test',
  log: () => undefined,
};
const host: Client = { userId: 'host', send: () => undefined };

/** Bots in seats 0, 2, 5 and 6, then the night started. Returns who sat where, before and after. */
async function deal(shuffleSeats: boolean): Promise<{ before: (string | null)[]; after: (string | null)[] }> {
  const manager = new RoomManager(deps);
  const record = await manager.create({ id: 'host', name: 'Host' }, { settings: { shuffleSeats, autoDeal: true } });
  const rt = manager.get(record.code)!;
  for (const seat of [0, 2, 5, 6]) manager.handle(rt, 'host', { type: 'host', command: { kind: 'add-bot', seat } }, host);
  const who = () => rt.record.table.seats.map((s) => s?.playerId ?? null);
  const before = who();
  manager.handle(rt, 'host', { type: 'host', command: { kind: 'start' } }, host);
  return { before, after: who() };
}

describe('shuffling the seats', () => {
  it('draws who sits where as the first hand is dealt, in the same seats', async () => {
    let moved = 0;
    for (let i = 0; i < 20; i++) {
      const { before, after } = await deal(true);
      // The same seats are filled, by the same players.
      expect(after.map((p) => p !== null)).toEqual(before.map((p) => p !== null));
      expect([...after].filter(Boolean).sort()).toEqual([...before].filter(Boolean).sort());
      if (after.join() !== before.join()) moved++;
    }
    // Four players have 24 orders; twenty draws that all come out unchanged would be a broken shuffle.
    expect(moved).toBeGreaterThan(10);
  });

  it('leaves everyone where they sat when it is off', async () => {
    const { before, after } = await deal(false);
    expect(after).toEqual(before);
  });
});

describe('filling the seats with bots', () => {
  async function table(): Promise<{ manager: RoomManager; rt: NonNullable<ReturnType<RoomManager['get']>> }> {
    const manager = new RoomManager(deps);
    const record = await manager.create({ id: 'host', name: 'Host' }, {});
    return { manager, rt: manager.get(record.code)! };
  }
  const bots = (rt: { record: { table: { seats: ({ kind: string } | null)[] } } }): number =>
    rt.record.table.seats.filter((s) => s?.kind === 'bot').length;

  it('seats as many bots as asked, in the open seats', async () => {
    const { manager, rt } = await table();
    manager.handle(rt, 'host', { type: 'host', command: { kind: 'add-bot', seat: 0 } }, host);
    manager.handle(rt, 'host', { type: 'host', command: { kind: 'fill-bots', count: 3 } }, host);
    expect(bots(rt)).toBe(4);
    expect(rt.record.table.seats.slice(0, 4).every(Boolean)).toBe(true);
    const styles = Object.values(rt.record.members).filter((m) => m.kind === 'bot').map((m) => m.personality);
    expect(styles.every(Boolean)).toBe(true);
  });

  it('stops at a full table when asked for more than there is room for', async () => {
    const { manager, rt } = await table();
    const seats = rt.record.table.seats.length;
    manager.handle(rt, 'host', { type: 'host', command: { kind: 'fill-bots', count: 10 } }, host);
    expect(bots(rt)).toBe(seats);
  });
});
