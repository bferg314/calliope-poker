import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_INSTANCE_POLICY, type InstancePolicy } from '@calliope/shared';
import type { PublicUser } from '../src/auth.js';
import { ENDED_RETENTION_MS, RoomManager, type Client, type ManagerDeps, type RoomRuntime } from '../src/manager.js';
import { TablePolicy, type PolicyStore } from '../src/policy.js';
import type { RoomRecord } from '../src/room.js';

const MIN = 60_000;

function memoryStore(): PolicyStore & { saved: InstancePolicy | null } {
  const s = {
    saved: null as InstancePolicy | null,
    async getPolicy() { return s.saved; },
    async savePolicy(p: InstancePolicy) { s.saved = p; },
  };
  return s;
}

interface Harness {
  manager: RoomManager;
  policy: TablePolicy;
  forgotten: string[];
  ended: string[];
  /** Resolves the report writes, which the test holds back when it wants to. */
  releaseReports: () => void;
}

function harness(policyOverrides: Partial<InstancePolicy> = {}, opts: { holdReports?: boolean; owned?: boolean } = {}): Harness {
  const forgotten: string[] = [];
  const ended: string[] = [];
  let release: () => void = () => undefined;
  const held = new Promise<void>((r) => { release = r; });
  const policy = new TablePolicy(memoryStore(), opts.owned ?? true, { ...DEFAULT_INSTANCE_POLICY, openTo: 'anyone', ...policyOverrides });
  const deps: ManagerDeps = {
    persist: async () => undefined,
    forget: async (r) => { forgotten.push(r.code); },
    onRoomCancelled: async () => undefined,
    onRoomCreated: async () => undefined,
    onRoomStarted: async () => undefined,
    onHandSettled: async () => undefined,
    onNightEnded: async (r) => { ended.push(r.code); if (opts.holdReports) await held; },
    expiresAt: (r) => policy.expiresAt(r),
    publicUrl: 'http://test',
    log: () => undefined,
  };
  return { manager: new RoomManager(deps), policy, forgotten, ended, releaseReports: () => release() };
}

function user(id: string, serverRole: PublicUser['serverRole'] = null): PublicUser {
  return { id, name: id, recovered: false, createdAt: 0, serverRole };
}

/** Open a table the way the HTTP route does: admit, then create with no await between. */
async function open(h: Harness, u: PublicUser, ip = '1.1.1.1'): Promise<RoomRuntime | string> {
  const admitted = h.policy.admit(u, ip, h.manager.rooms.values());
  if (typeof admitted === 'string') return admitted;
  const record = await h.manager.create(u, { quota: admitted.quota });
  return h.manager.get(record.code)!;
}

const sweep = (h: Harness): Promise<void> => h.policy.sweep(h.manager, Date.now(), () => undefined);
const client = (userId: string): Client => ({ userId, send: () => undefined });

/** Seat two bots and start dealing. */
async function startNight(h: Harness, rt: RoomRuntime): Promise<void> {
  const host = rt.record.hostId;
  await h.manager.handle(rt, host, { type: 'host', command: { kind: 'add-bot', seat: 0 } }, client(host));
  await h.manager.handle(rt, host, { type: 'host', command: { kind: 'add-bot', seat: 1 } }, client(host));
  await h.manager.handle(rt, host, { type: 'host', command: { kind: 'start' } }, client(host));
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('who may open a table', () => {
  it('keeps a host-only server to the owner and admins', async () => {
    const h = harness({ openTo: 'hosts' });
    expect(await open(h, user('stranger'))).toBe('not-allowed');
    expect(typeof await open(h, user('boss', 'owner'))).toBe('object');
    expect(typeof await open(h, user('sam', 'admin'))).toBe('object');
  });

  it('lets anybody open one on a server with no owner, with no limits', async () => {
    const h = harness({}, { owned: false });
    for (let i = 0; i < 8; i++) {
      const rt = await open(h, user(`p${i}`), '1.1.1.1');
      expect(typeof rt).toBe('object');
      expect((rt as RoomRuntime).record.quota).toBeNull();
    }
    expect(h.policy.info(h.manager.rooms.values())).toEqual({ restricted: false, limits: null });
  });

  it('caps the public tables live at once, and says how many are in use', async () => {
    const h = harness({ maxTables: 2 });
    await open(h, user('a'), '1.0.0.1');
    await open(h, user('b'), '1.0.0.2');
    expect(await open(h, user('c'), '1.0.0.3')).toBe('server-full');
    expect(h.policy.info(h.manager.rooms.values()).limits?.inUse).toBe(2);
    expect(h.policy.refusalMessage('server-full')).toBe('All 2 public tables are in use. Try again later.');
  });

  it('does not count the owner and admins against the cap', async () => {
    const h = harness({ maxTables: 1 });
    const mine = await open(h, user('boss', 'owner'));
    expect((mine as RoomRuntime).record.quota).toBeNull();
    expect(typeof await open(h, user('a'), '1.0.0.1')).toBe('object');
  });

  it('allows one table per person, and per address', async () => {
    const h = harness({ maxTablesPerPerson: 1 });
    expect(typeof await open(h, user('a'), '1.0.0.1')).toBe('object');
    expect(await open(h, user('a'), '1.0.0.2')).toBe('too-many-tables');
    expect(await open(h, user('b'), '1.0.0.1')).toBe('too-many-tables');
    expect(typeof await open(h, user('b'), '1.0.0.2')).toBe('object');
  });

  it('frees the slot once a table is over', async () => {
    const h = harness({ maxTables: 1 });
    const rt = (await open(h, user('a'))) as RoomRuntime;
    rt.record.phase = 'ended';
    expect(typeof await open(h, user('b'), '1.0.0.2')).toBe('object');
  });
});

describe('the sweep', () => {
  it('cancels a public lobby that reached its lifetime', async () => {
    const h = harness({ maxTableMinutes: 60, lobbyIdleMinutes: null, emptyIdleMinutes: null });
    const rt = (await open(h, user('a'))) as RoomRuntime;
    vi.advanceTimersByTime(59 * MIN);
    await sweep(h);
    expect(h.manager.rooms.has(rt.record.code)).toBe(true);
    vi.advanceTimersByTime(2 * MIN);
    await sweep(h);
    expect(h.manager.rooms.has(rt.record.code)).toBe(false);
    expect(rt.cancelled).toBe(true);
  });

  it('lets a night past its lifetime finish the hand, then ends it with a report', async () => {
    const h = harness({ maxTableMinutes: 60, lobbyIdleMinutes: null, emptyIdleMinutes: null });
    const rt = (await open(h, user('a'))) as RoomRuntime;
    await startNight(h, rt);
    vi.advanceTimersByTime(1000); // the first hand is dealt
    expect(rt.record.table.hand).not.toBeNull();
    vi.setSystemTime(Date.now() + 61 * MIN);
    await sweep(h);
    expect(rt.record.phase).toBe('final-hand');
    await vi.runAllTimersAsync(); // the bots play the hand out
    expect(rt.record.phase).toBe('ended');
    expect(rt.record.report).not.toBeNull();
    expect(h.ended).toEqual([rt.record.code]);
  });

  it('catches running tables when the lifetime is lowered', async () => {
    const h = harness({ maxTableMinutes: 240, lobbyIdleMinutes: null, emptyIdleMinutes: null });
    const rt = (await open(h, user('a'))) as RoomRuntime;
    vi.advanceTimersByTime(90 * MIN);
    await sweep(h);
    expect(h.manager.rooms.has(rt.record.code)).toBe(true);
    await h.policy.update({ ...h.policy.policy, maxTableMinutes: 60 });
    await sweep(h);
    expect(h.manager.rooms.has(rt.record.code)).toBe(false);
  });

  it('cancels a lobby nobody started', async () => {
    const h = harness({ maxTableMinutes: null, lobbyIdleMinutes: 30, emptyIdleMinutes: null });
    const rt = (await open(h, user('a'))) as RoomRuntime;
    h.manager.connect(rt, client('a'));
    vi.advanceTimersByTime(31 * MIN);
    await sweep(h);
    expect(rt.cancelled).toBe(true);
  });

  it('ends a table once nobody has been connected for a while', async () => {
    const h = harness({ maxTableMinutes: null, lobbyIdleMinutes: null, emptyIdleMinutes: 15 });
    const rt = (await open(h, user('a'))) as RoomRuntime;
    const c = client('a');
    h.manager.connect(rt, c);
    await startNight(h, rt);
    vi.advanceTimersByTime(20 * MIN);
    await sweep(h);
    expect(['playing', 'paused']).toContain(rt.record.phase); // still someone there
    h.manager.disconnect(rt, c);
    vi.advanceTimersByTime(16 * MIN);
    await sweep(h);
    expect(['final-hand', 'ended']).toContain(rt.record.phase);
  });

  it('never touches the owner\'s or an admin\'s tables', async () => {
    const h = harness({ maxTableMinutes: 1, lobbyIdleMinutes: 1, emptyIdleMinutes: 1, abandonedHours: null });
    const rt = (await open(h, user('boss', 'owner'))) as RoomRuntime;
    vi.advanceTimersByTime(24 * 60 * MIN);
    await sweep(h);
    expect(h.manager.rooms.has(rt.record.code)).toBe(true);
    expect(rt.record.phase).toBe('lobby');
    expect(h.manager.view(rt, 'boss').serverLimit).toBeNull();
  });

  it('tells a public table when it closes', async () => {
    const h = harness({ maxTableMinutes: 60 });
    const rt = (await open(h, user('a'))) as RoomRuntime;
    expect(h.manager.view(rt, 'a').serverLimit).toEqual({ expiresAt: rt.record.createdAt + 60 * MIN });
  });
});

describe('abandoned tables', () => {
  it('are ended whoever opened them, once nobody has been there long enough', async () => {
    const h = harness({ abandonedHours: 24 });
    const rt = (await open(h, user('boss', 'owner'))) as RoomRuntime;
    await startNight(h, rt);
    await h.manager.handle(rt, 'boss', { type: 'host', command: { kind: 'pause' } }, client('boss'));
    await vi.runAllTimersAsync(); // the hand in progress finishes, then the table rests
    expect(rt.record.phase).toBe('paused');
    vi.setSystemTime(Date.now() + 23 * 60 * MIN);
    await sweep(h);
    expect(rt.record.phase).toBe('paused');
    vi.setSystemTime(Date.now() + 2 * 60 * MIN);
    await sweep(h);
    expect(rt.record.phase).toBe('ended');
    expect(rt.record.report).not.toBeNull();
  });

  it('are left alone while someone has them open', async () => {
    const h = harness({ abandonedHours: 1 });
    const rt = (await open(h, user('boss', 'owner'))) as RoomRuntime;
    h.manager.connect(rt, client('boss'));
    vi.setSystemTime(Date.now() + 5 * 60 * MIN);
    await sweep(h);
    expect(h.manager.rooms.has(rt.record.code)).toBe(true);
  });

  it('can all be closed at once, sparing the tables someone is at', async () => {
    const h = harness({ abandonedHours: null, maxTablesPerPerson: 5 });
    const empty = (await open(h, user('boss', 'owner'))) as RoomRuntime;
    const playing = (await open(h, user('boss', 'owner'))) as RoomRuntime;
    await startNight(h, playing);
    const watched = (await open(h, user('sam', 'admin'))) as RoomRuntime;
    h.manager.connect(watched, client('sam'));
    expect(await h.policy.closeEmpty(h.manager)).toBe(2);
    expect(empty.cancelled).toBe(true);
    expect(['final-hand', 'ended']).toContain(playing.record.phase);
    expect(h.manager.rooms.has(watched.record.code)).toBe(true);
    expect(watched.record.phase).toBe('lobby');
  });
});

describe('finished tables', () => {
  async function finished(h: Harness): Promise<RoomRuntime> {
    const rt = (await open(h, user('boss', 'owner'))) as RoomRuntime;
    await startNight(h, rt);
    await h.manager.handle(rt, 'boss', { type: 'host', command: { kind: 'end-night' } }, client('boss'));
    await vi.runAllTimersAsync();
    expect(rt.record.phase).toBe('ended');
    return rt;
  }

  it('are let go once the retention window has passed', async () => {
    const h = harness();
    const rt = await finished(h);
    await sweep(h);
    expect(h.manager.rooms.has(rt.record.code)).toBe(true);
    vi.setSystemTime(Date.now() + ENDED_RETENTION_MS + MIN);
    await sweep(h);
    expect(h.manager.rooms.has(rt.record.code)).toBe(false);
    expect(h.forgotten).toContain(rt.record.code);
  });

  it('are kept until the report is safely written', async () => {
    const h = harness({}, { holdReports: true });
    const rt = await finished(h);
    vi.setSystemTime(Date.now() + ENDED_RETENTION_MS + MIN);
    const pending = sweep(h);
    await Promise.resolve();
    expect(h.manager.rooms.has(rt.record.code)).toBe(true);
    h.releaseReports();
    await pending;
    expect(h.manager.rooms.has(rt.record.code)).toBe(false);
  });

  it('are dropped on restore when they finished long ago', () => {
    const h = harness();
    const now = Date.now();
    const old = { code: 'OLD111', phase: 'ended', endedAt: now - ENDED_RETENTION_MS - MIN } as RoomRecord;
    h.manager.restore([old]);
    expect(h.manager.rooms.has('OLD111')).toBe(false);
    expect(h.forgotten).toEqual(['OLD111']);
  });
});
