import { describe, expect, it } from 'vitest';
import { RoomManager, RoomError, type Client, type ManagerDeps, type RoomRuntime } from '../src/manager.js';
import type { RoomRecord } from '../src/room.js';

interface Spy {
  deps: ManagerDeps;
  persisted: string[];
  forgotten: string[];
  cancelled: string[];
  failForget: boolean;
}

function spyDeps(): Spy {
  const spy: Spy = { deps: null as unknown as ManagerDeps, persisted: [], forgotten: [], cancelled: [], failForget: false };
  spy.deps = {
    persist: async (r) => { spy.persisted.push(r.code); },
    forget: async (r) => {
      if (spy.failForget) throw new Error('redis is down');
      spy.forgotten.push(r.code);
    },
    onRoomCancelled: async (r) => { spy.cancelled.push(r.code); },
    onRoomCreated: async () => undefined,
    onRoomStarted: async () => undefined,
    onHandSettled: async () => undefined,
    onNightEnded: async () => undefined,
    publicUrl: 'http://test',
    log: () => undefined,
  };
  return spy;
}

interface Watcher extends Client {
  got: { code: string; message: string }[];
  closedWith: number | null;
}

function watcher(userId: string): Watcher {
  const w: Watcher = {
    userId,
    got: [],
    closedWith: null,
    send: (msg) => { if (msg.type === 'error') w.got.push({ code: msg.code, message: msg.message }); },
    close: (code) => { w.closedWith = code; },
  };
  return w;
}

const host = (): Client => ({ userId: 'host', send: () => undefined });

async function lobby(spy: Spy): Promise<{ manager: RoomManager; rt: RoomRuntime; record: RoomRecord }> {
  const manager = new RoomManager(spy.deps);
  const record = await manager.create({ id: 'host', name: 'Host' }, {});
  return { manager, rt: manager.get(record.code)!, record };
}

/** Send a host command and await it, since cancelling is asynchronous. */
async function send(manager: RoomManager, rt: RoomRuntime, kind: 'cancel-room' | 'start', client: Client): Promise<void> {
  await manager.handle(rt, 'host', { type: 'host', command: { kind } }, client);
}

describe('cancelling a table', () => {
  it('forgets it everywhere and tells the people watching', async () => {
    const spy = spyDeps();
    const { manager, rt, record } = await lobby(spy);
    const guest = watcher('guest');
    manager.join(rt, { id: 'guest', name: 'Guest' });
    manager.connect(rt, guest);

    await send(manager, rt, 'cancel-room', host());

    expect(manager.rooms.has(record.code)).toBe(false);
    expect(spy.forgotten).toEqual([record.code]);
    expect(spy.cancelled).toEqual([record.code]);
    expect(guest.got.at(-1)).toEqual({ code: 'cancelled', message: 'The host cancelled this table.' });
    expect(guest.closedWith).toBe(4005);
    expect(rt.cancelled).toBe(true);
  });

  it('drops out of the list of rooms a player could go back to', async () => {
    const spy = spyDeps();
    const { manager, rt } = await lobby(spy);
    manager.join(rt, { id: 'guest', name: 'Guest' });
    expect(manager.activeRoomsFor('guest')).toHaveLength(1);

    await send(manager, rt, 'cancel-room', host());
    expect(manager.activeRoomsFor('guest')).toHaveLength(0);
    expect(manager.activeRoomsFor('host')).toHaveLength(0);
  });

  it('refuses once the night has started', async () => {
    const spy = spyDeps();
    const { manager, rt, record } = await lobby(spy);
    for (const seat of [0, 1]) {
      manager.handle(rt, 'host', { type: 'host', command: { kind: 'add-bot', seat } }, host());
    }
    await send(manager, rt, 'start', host());
    expect(rt.record.phase).toBe('playing');

    await expect(send(manager, rt, 'cancel-room', host())).rejects.toThrow(RoomError);
    expect(manager.rooms.has(record.code)).toBe(true);
    expect(spy.forgotten).toEqual([]);
  });

  /**
   * Redis is what makes a room real, so a failed delete must leave the table
   * completely intact rather than half gone.
   */
  it('leaves the table untouched and retryable when Redis refuses', async () => {
    const spy = spyDeps();
    const { manager, rt, record } = await lobby(spy);
    spy.failForget = true;

    await expect(send(manager, rt, 'cancel-room', host())).rejects.toThrow(/Try again/);

    expect(manager.rooms.has(record.code)).toBe(true);
    expect(rt.cancelled).toBe(false);
    expect(spy.cancelled).toEqual([]);
    // And the host can simply try again once Redis is back.
    spy.failForget = false;
    await send(manager, rt, 'cancel-room', host());
    expect(manager.rooms.has(record.code)).toBe(false);
    expect(spy.forgotten).toEqual([record.code]);
  });

  it('never writes a cancelled table back to Redis', async () => {
    const spy = spyDeps();
    const { manager, rt, record } = await lobby(spy);
    await send(manager, rt, 'cancel-room', host());
    const writesBefore = spy.persisted.filter((c) => c === record.code).length;

    // Anything still holding the runtime must not be able to resurrect it.
    expect(() => manager.join(rt, { id: 'late', name: 'Late' })).toThrow(RoomError);
    expect(() => manager.handle(rt, 'host', { type: 'sit', seat: 0 }, host())).toThrow(/cancelled/i);
    manager.disconnect(rt, watcher('guest'));

    expect(spy.persisted.filter((c) => c === record.code).length).toBe(writesBefore);
  });

  it('tells a member it was cancelled rather than that they are a stranger', async () => {
    const spy = spyDeps();
    const { manager, rt } = await lobby(spy);
    manager.join(rt, { id: 'guest', name: 'Guest' });
    await send(manager, rt, 'cancel-room', host());

    expect(() => manager.handle(rt, 'guest', { type: 'ping' }, watcher('guest'))).toThrow(/cancelled/i);
  });

  it('refuses a second attempt instead of deleting twice', async () => {
    const spy = spyDeps();
    const { manager, rt } = await lobby(spy);
    await send(manager, rt, 'cancel-room', host());

    await expect(send(manager, rt, 'cancel-room', host())).rejects.toThrow(/cancelled/i);
    expect(spy.forgotten).toHaveLength(1);
    expect(spy.cancelled).toHaveLength(1);
  });
});
