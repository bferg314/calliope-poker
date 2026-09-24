import {
  DEFAULT_INSTANCE_POLICY, OPEN_INSTANCE_POLICY, instancePolicySchema,
  type InstanceInfo, type InstancePolicy, type ServerTable,
} from '@calliope/shared';
import { Limiter, type PublicUser } from './auth.js';
import { ENDED_RETENTION_MS, type RoomManager, type RoomRuntime } from './manager.js';
import type { RoomQuota, RoomRecord } from './room.js';

const MINUTE = 60_000;
/** Re-save a quiet live table this often, so its Redis copy never expires under it. */
const REFRESH_AFTER_MS = 24 * 60 * MINUTE;

export type Refusal = 'not-allowed' | 'server-full' | 'too-many-tables' | 'too-fast';

export const REFUSAL_STATUS: Record<Refusal, number> = {
  'not-allowed': 403,
  'server-full': 429,
  'too-many-tables': 429,
  'too-fast': 429,
};

export interface PolicyStore {
  getPolicy(): Promise<Partial<InstancePolicy> | null>;
  savePolicy(policy: InstancePolicy): Promise<void>;
}

/** A live table that counts against the limits. */
function isPublicLive(r: RoomRecord): r is RoomRecord & { quota: RoomQuota } {
  return !!r.quota && r.phase !== 'ended';
}

/**
 * Who may open tables, and what happens to tables opened by people who do not
 * run the server. A server without an owner has no policy to speak of: it is
 * open, with no limits, exactly as before limits existed.
 */
export class TablePolicy {
  private current: InstancePolicy;
  /** Stops a stranger opening and cancelling tables in a loop. */
  private readonly openLimiter = new Limiter(10, 60 * MINUTE);

  constructor(
    private readonly store: PolicyStore,
    /** The server has an owner (HOST_KEY is set), so the policy applies. */
    readonly owned: boolean,
    initial: InstancePolicy = DEFAULT_INSTANCE_POLICY,
  ) {
    this.current = owned ? initial : OPEN_INSTANCE_POLICY;
  }

  /** Load the saved policy, filling anything missing with the defaults. */
  static async load(store: PolicyStore, owned: boolean): Promise<TablePolicy> {
    if (!owned) return new TablePolicy(store, false);
    const saved = await store.getPolicy();
    const parsed = instancePolicySchema.safeParse({ ...DEFAULT_INSTANCE_POLICY, ...(saved ?? {}) });
    return new TablePolicy(store, true, parsed.success ? parsed.data : DEFAULT_INSTANCE_POLICY);
  }

  get policy(): InstancePolicy {
    return this.current;
  }

  async update(next: InstancePolicy): Promise<void> {
    if (!this.owned) throw new Error('A server without HOST_KEY has no policy to change');
    const parsed = instancePolicySchema.parse(next);
    await this.store.savePolicy(parsed);
    this.current = parsed;
  }

  /**
   * May this person open a table, and does it count against the limits?
   * Synchronous on purpose: the caller creates the room straight after, with
   * no await in between, so two requests cannot both take the last slot.
   */
  admit(user: PublicUser, ip: string, rooms: Iterable<RoomRuntime>): { quota: RoomQuota | null } | Refusal {
    if (user.serverRole !== null || !this.owned) return { quota: null };
    const p = this.current;
    if (p.openTo === 'hosts') return 'not-allowed';
    let live = 0;
    let mine = 0;
    let fromHere = 0;
    for (const rt of rooms) {
      const r = rt.record;
      if (!isPublicLive(r)) continue;
      live++;
      if (r.quota.openedBy === user.id) mine++;
      if (r.quota.ip === ip) fromHere++;
    }
    if (p.maxTables !== null && live >= p.maxTables) return 'server-full';
    if (mine >= p.maxTablesPerPerson || fromHere >= p.maxTablesPerPerson) return 'too-many-tables';
    if (!this.openLimiter.allow(`ip:${ip}`)) return 'too-fast';
    return { quota: { openedBy: user.id, ip } };
  }

  refusalMessage(refusal: Refusal): string {
    const p = this.current;
    switch (refusal) {
      case 'not-allowed':
        return 'Only the people who run this server can open a table here.';
      case 'server-full':
        return p.maxTables === 1
          ? 'The one public table is in use. Try again later.'
          : `All ${p.maxTables} public tables are in use. Try again later.`;
      case 'too-many-tables':
        return p.maxTablesPerPerson === 1
          ? 'You already have a table open. Finish or cancel it first.'
          : `You already have ${p.maxTablesPerPerson} tables open. Finish or cancel one first.`;
      case 'too-fast':
        return 'Too many tables opened from here. Try again later.';
    }
  }

  /** When the server closes this table; null for tables the limits do not cover. */
  expiresAt(r: RoomRecord): number | null {
    if (!this.owned || !r.quota || this.current.maxTableMinutes === null) return null;
    return r.createdAt + this.current.maxTableMinutes * MINUTE;
  }

  info(rooms: Iterable<RoomRuntime>): InstanceInfo {
    const p = this.current;
    const restricted = p.openTo === 'hosts';
    if (!this.owned || restricted) return { restricted, limits: null };
    let inUse = 0;
    for (const rt of rooms) if (isPublicLive(rt.record)) inUse++;
    return {
      restricted,
      limits: { maxTables: p.maxTables, inUse, maxTableMinutes: p.maxTableMinutes, maxTablesPerPerson: p.maxTablesPerPerson },
    };
  }

  tables(manager: RoomManager): ServerTable[] {
    const out: ServerTable[] = [];
    for (const rt of manager.rooms.values()) {
      const r = rt.record;
      if (r.phase === 'ended') continue;
      const members = Object.values(r.members);
      out.push({
        code: r.code,
        name: r.name,
        hostName: r.members[r.hostId]?.name ?? '',
        phase: r.phase,
        humans: members.filter((m) => m.kind === 'human').length,
        bots: members.filter((m) => m.kind === 'bot').length,
        connected: new Set([...rt.clients].map((c) => c.userId)).size,
        createdAt: r.createdAt,
        expiresAt: this.expiresAt(r),
        public: !!r.quota,
        emptySince: rt.humansAwaySince,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Close every live table nobody has open right now, whoever opened it. For
   * clearing out a pile of abandoned tables by hand. Returns how many closed.
   */
  async closeEmpty(manager: RoomManager): Promise<number> {
    let closed = 0;
    for (const rt of [...manager.rooms.values()]) {
      const r = rt.record;
      if (rt.cancelled || rt.clients.size > 0 || r.phase === 'ended' || r.phase === 'final-hand') continue;
      await manager.close(rt, 'admin');
      closed++;
    }
    return closed;
  }

  /**
   * Close the public tables that are over a limit, and let go of finished ones.
   * Runs every half minute; each step is logged and never stops the rest.
   */
  async sweep(manager: RoomManager, now: number, log: (msg: string, extra?: unknown) => void, persist?: (r: RoomRecord) => Promise<void>): Promise<void> {
    const p = this.current;
    for (const rt of [...manager.rooms.values()]) {
      const r = rt.record;
      try {
        if (r.phase === 'ended') {
          if (r.endedAt !== null && now - r.endedAt > ENDED_RETENTION_MS) await manager.evict(rt);
          continue;
        }
        // Any table, exempt or not, once it has been left alone long enough.
        if (p.abandonedHours !== null && rt.humansAwaySince !== null && now - rt.humansAwaySince >= p.abandonedHours * 60 * MINUTE) {
          await manager.close(rt, 'abandoned');
          continue;
        }
        if (this.owned && r.quota) {
          const expiresAt = this.expiresAt(r);
          if (expiresAt !== null && now >= expiresAt) { await manager.close(rt, 'limit'); continue; }
          if (r.phase === 'lobby' && p.lobbyIdleMinutes !== null && now - r.createdAt >= p.lobbyIdleMinutes * MINUTE) {
            await manager.close(rt, 'idle');
            continue;
          }
          if (rt.humansAwaySince !== null && p.emptyIdleMinutes !== null && now - rt.humansAwaySince >= p.emptyIdleMinutes * MINUTE) {
            await manager.close(rt, 'idle');
            continue;
          }
        }
        // A paused table can sit untouched for days; keep its Redis copy alive.
        if (persist && now - r.clock.tickedAt > REFRESH_AFTER_MS) {
          r.clock.tickedAt = now;
          await persist(r);
        }
      } catch (e) {
        log(`sweep failed for ${r.code}`, e);
      }
    }
  }
}
