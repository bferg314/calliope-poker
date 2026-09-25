import { randomInt, randomUUID } from 'node:crypto';
import {
  EngineError, eligibleSeats, fullDeck, listVariants, reduce, shuffle, summaryFor, viewFor,
  type HandSummary, type TableEvent, type TableState,
} from '@calliope/engine';
import { chooseDiscards, chooseVariant, decideAction, pickBotName } from '@calliope/bots';
import {
  roomSettingsSchema, sameStakes, type ActiveRoom, type ClientMessage, type HostCommand, type LevelSchedule,
  type MemberView, type NightReport, type RoomSettings, type RoomView, type ServerMessage, type VariantInfo,
} from '@calliope/shared';
import {
  absorbDowntime, buildReport, currentStakes, elapsedPlayingMs, emptyLedger, endsAtOf, levelViewOf, migrateClock,
  newRoom, nightIsUp, randomRoomCode, remainingMs, seatOf, stakeConfigFrom, stakesAtLevel,
  nonStakeConfigFrom, targetLevel, type RoomQuota, type RoomRecord,
} from './room.js';

/** How long a finished table stays live, so people can read the report and grab tickets. */
export const ENDED_RETENTION_MS = 6 * 60 * 60 * 1000;

/** Why the server, rather than the table's host, is shutting a table down. */
export type CloseReason = 'limit' | 'idle' | 'abandoned' | 'admin';

const CLOSE_MESSAGES: Record<CloseReason, string> = {
  limit: 'This table reached the server\'s time limit.',
  idle: 'This table was closed because nobody was using it.',
  abandoned: 'This table was closed because nobody had been at it for a long time.',
  admin: 'Whoever runs this server closed this table.',
};

export class RoomError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'RoomError';
    this.code = code;
  }
}

export interface Client {
  userId: string;
  send(msg: ServerMessage): void;
  /** Hang up on this client. The manager has no other handle on the socket. */
  close?(code: number, reason: string): void;
}

export interface RoomRuntime {
  record: RoomRecord;
  clients: Set<Client>;
  timer: NodeJS.Timeout | null;
  deadline: number | null;
  /** Consecutive timeouts per seat, to sit out absent players. */
  timeouts: Record<number, number>;
  /** The table has been cancelled; this runtime is dead and must not persist. */
  cancelled: boolean;
  /** Since when no person has been connected, or null while someone is. */
  humansAwaySince: number | null;
  /** The report on its way to Postgres. The room may not be evicted before it lands. */
  reportWrite: Promise<void> | null;
}

export interface ManagerDeps {
  persist(record: RoomRecord): Promise<void>;
  /** The exact inverse of persist. Must succeed, or the table comes back. */
  forget(record: RoomRecord): Promise<void>;
  onRoomCancelled(record: RoomRecord): Promise<void>;
  onRoomCreated(record: RoomRecord): Promise<void>;
  onRoomStarted(record: RoomRecord): Promise<void>;
  onHandSettled(record: RoomRecord, summary: HandSummary): Promise<void>;
  onNightEnded(record: RoomRecord, report: NightReport): Promise<void>;
  /** When the server will close this table, or null if it never will. */
  expiresAt?(record: RoomRecord): number | null;
  publicUrl: string;
  log: (msg: string, extra?: unknown) => void;
}

const rng = (): number => randomInt(1_000_000) / 1_000_000;

export class RoomManager {
  readonly rooms = new Map<string, RoomRuntime>();
  constructor(private readonly deps: ManagerDeps) {}

  // ---------- lifecycle ----------

  restore(records: RoomRecord[]): void {
    const now = Date.now();
    for (const record of records) {
      // Finished long enough ago that Postgres is the only place it lives now.
      if (record.phase === 'ended' && record.endedAt !== null && now - record.endedAt > ENDED_RETENTION_MS) {
        void this.deps.forget(record).catch((e) => this.deps.log(`could not drop finished room ${record.code}`, e));
        continue;
      }
      try {
        migrateClock(record, now);
      } catch (e) {
        this.deps.log(`could not restore room ${record.code}`, e);
        continue;
      }
      const slept = absorbDowntime(record, now);
      if (slept) this.deps.log(`room ${record.code} came back paused after downtime`);
      const rt = this.runtime(record);
      this.rooms.set(record.code, rt);
      if (record.phase !== 'ended') this.armTimers(rt);
    }
  }

  private runtime(record: RoomRecord): RoomRuntime {
    // Counted as away from the start, so a table nobody ever opens is not kept forever.
    return { record, clients: new Set(), timer: null, deadline: null, timeouts: {}, cancelled: false, humansAwaySince: Date.now(), reportWrite: null };
  }

  /**
   * Open a table. Everything up to adding it to `rooms` is synchronous, so a
   * caller that checked the limits just before cannot be overtaken.
   */
  async create(
    host: { id: string; name: string },
    opts: { name?: string; passwordHash?: string | null; settings?: Partial<RoomSettings>; code?: string; quota?: RoomQuota | null },
  ): Promise<RoomRecord> {
    let code = opts.code && !this.rooms.has(opts.code) ? opts.code : randomRoomCode();
    while (this.rooms.has(code)) code = randomRoomCode();
    if (opts.settings) roomSettingsSchema.partial().parse(opts.settings);
    const record = newRoom({ code, host, name: opts.name, passwordHash: opts.passwordHash ?? null, settings: opts.settings, quota: opts.quota ?? null, now: Date.now() });
    const rt = this.runtime(record);
    this.rooms.set(code, rt);
    await this.deps.onRoomCreated(record);
    await this.deps.persist(record);
    return record;
  }

  get(code: string): RoomRuntime | undefined {
    return this.rooms.get(code);
  }

  join(rt: RoomRuntime, user: { id: string; name: string }): void {
    if (rt.cancelled) throw new RoomError('cancelled', 'That table was cancelled.');
    const r = rt.record;
    if (!r.members[user.id]) {
      r.members[user.id] = { id: user.id, name: user.name, kind: 'human', joinedAt: Date.now() };
      this.afterChange(rt);
    } else if (r.members[user.id]!.name !== user.name) {
      r.members[user.id]!.name = user.name;
      const seat = seatOf(r, user.id);
      if (seat !== -1) this.dispatch(rt, { type: 'rename', seat, name: user.name });
      else this.afterChange(rt);
    }
  }

  connect(rt: RoomRuntime, client: Client): void {
    rt.clients.add(client);
    rt.humansAwaySince = null;
    client.send({ type: 'snapshot', room: this.view(rt, client.userId) });
    this.broadcast(rt); // others see the connection state change
  }

  disconnect(rt: RoomRuntime, client: Client): void {
    rt.clients.delete(client);
    if (rt.clients.size === 0) rt.humansAwaySince = Date.now();
    if (rt.cancelled) return; // there is no room left to describe
    this.broadcast(rt);
  }

  // ---------- messages ----------

  handle(rt: RoomRuntime, userId: string, msg: ClientMessage, client: Client): void | Promise<void> {
    const r = rt.record;
    if (rt.cancelled) throw new RoomError('cancelled', 'The host cancelled this table.');
    if (!r.members[userId]) throw new RoomError('not-a-member', 'Join the room first');
    switch (msg.type) {
      case 'ping':
        client.send({ type: 'pong', now: Date.now() });
        return;
      case 'action': {
        const seat = this.requireSeat(r, userId);
        this.dispatch(rt, { type: 'action', seat, action: msg.action });
        return;
      }
      case 'choose-variant': {
        const seat = this.requireSeat(r, userId);
        this.dispatch(rt, { type: 'choose-variant', seat, variantId: msg.variantId, wild: msg.wild });
        return;
      }
      case 'discard': {
        const seat = this.requireSeat(r, userId);
        this.dispatch(rt, { type: 'discard', seat, cards: msg.cards });
        return;
      }
      case 'sit':
        this.sit(rt, userId, msg.seat);
        return;
      case 'stand':
        this.stand(rt, userId);
        return;
      case 'sit-out': {
        const seat = this.requireSeat(r, userId);
        this.dispatch(rt, { type: 'sit-out', seat, out: msg.out });
        return;
      }
      case 'rebuy':
        this.rebuy(rt, userId);
        return;
      case 'host':
        if (r.hostId !== userId) throw new RoomError('not-host', 'Only the host can do that');
        return this.host(rt, msg.command);
      default:
        throw new RoomError('bad-message', 'Unknown message');
    }
  }

  private requireSeat(r: RoomRecord, userId: string): number {
    const seat = seatOf(r, userId);
    if (seat === -1) throw new RoomError('not-seated', 'Take a seat first');
    return seat;
  }

  private sit(rt: RoomRuntime, playerId: string, seat: number): void {
    const r = rt.record;
    if (r.phase === 'ended') throw new RoomError('ended', 'The night is over');
    if (seatOf(r, playerId) !== -1) throw new RoomError('already-seated', 'You already have a seat');
    const m = r.members[playerId]!;
    const ledger = r.ledger[playerId] ?? emptyLedger();
    const chips = r.settings.chips.buyInChips;
    const isRebuy = ledger.buyIns > 0;
    if (isRebuy && !this.rebuyAllowed(r, ledger)) throw new RoomError('no-rebuy', 'Re-buys are closed');
    this.dispatch(rt, { type: 'sit', seat, player: { id: playerId, name: m.name, kind: m.kind }, stack: chips }, false);
    if (isRebuy) ledger.rebuys++; else ledger.buyIns++;
    ledger.totalIn += chips;
    r.ledger[playerId] = ledger;
    this.afterChange(rt);
  }

  private stand(rt: RoomRuntime, playerId: string): void {
    const r = rt.record;
    const seat = this.requireSeat(r, playerId);
    const stack = r.table.seats[seat]!.stack;
    this.dispatch(rt, { type: 'stand', seat }, false);
    const ledger = r.ledger[playerId] ?? emptyLedger();
    ledger.cashedOut += stack;
    r.ledger[playerId] = ledger;
    this.afterChange(rt);
  }

  /**
   * Draw the seats: the same seats stay filled, so the host's spacing of the
   * table holds, but who sits in which is shuffled. Done once, as the first
   * hand is dealt; from then on moving seats means leaving the table.
   */
  private shuffleSeats(rt: RoomRuntime): void {
    const seats = rt.record.table.seats;
    const filled = seats.map((s, i) => (s ? i : -1)).filter((i) => i !== -1);
    const drawn = [...filled];
    for (let i = drawn.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [drawn[i], drawn[j]] = [drawn[j]!, drawn[i]!];
    }
    const order = seats.map((_, i) => i);
    filled.forEach((seat, k) => { order[seat] = drawn[k]!; });
    this.dispatch(rt, { type: 'arrange-seats', order }, false);
    rt.timeouts = {};
  }

  private rebuyAllowed(r: RoomRecord, ledger: { rebuys: number }): boolean {
    const rb = r.settings.rebuys;
    if (!rb.allowed) return false;
    if (rb.maxCount !== null && ledger.rebuys >= rb.maxCount) return false;
    if (rb.untilMinutes !== null && r.clock.startedAt !== null && elapsedPlayingMs(r, Date.now()) > rb.untilMinutes * 60_000) return false;
    return true;
  }

  canRebuy(r: RoomRecord, playerId: string): boolean {
    if (r.phase === 'ended' || r.phase === 'lobby') return false;
    const seat = seatOf(r, playerId);
    if (seat === -1) return false;
    const st = r.table.seats[seat]!;
    if (st.stack >= r.settings.chips.buyInChips) return false;
    const ledger = r.ledger[playerId] ?? emptyLedger();
    if (!this.rebuyAllowed(r, ledger)) return false;
    const h = r.table.hand;
    if (h && h.stage !== 'settled' && h.players[seat] && !h.players[seat]!.folded) return false;
    return true;
  }

  private rebuy(rt: RoomRuntime, playerId: string): void {
    const r = rt.record;
    if (!this.canRebuy(r, playerId)) throw new RoomError('no-rebuy', 'You cannot re-buy right now');
    const seat = seatOf(r, playerId);
    const chips = r.settings.chips.buyInChips;
    this.dispatch(rt, { type: 'add-chips', seat, amount: chips }, false);
    const ledger = r.ledger[playerId]!;
    ledger.rebuys++;
    ledger.totalIn += chips;
    this.afterChange(rt);
  }

  private host(rt: RoomRuntime, cmd: HostCommand): void | Promise<void> {
    const r = rt.record;
    if (r.phase === 'ended' && cmd.kind !== 'rename-room') throw new RoomError('ended', 'The night is over');
    switch (cmd.kind) {
      case 'start': {
        const now = Date.now();
        if (r.phase === 'lobby') {
          if (eligibleSeats(r.table).length < 2) throw new RoomError('not-enough-players', 'Two players with chips are needed');
          r.clock.startedAt = now;
          r.clock.pausedAt = null;
          r.clock.pausedMs = 0;
          r.clock.bonusMs = 0;
          r.clock.limitMs = r.settings.end.kind === 'time' ? r.settings.end.minutes * 60_000 : null;
          r.clock.appliedLevel = 0;
          r.clock.levelAnchor = { atMs: 0, atHands: r.hands.length, level: 0 };
          if (r.settings.shuffleSeats) this.shuffleSeats(rt);
          void this.deps.onRoomStarted(r).catch((e) => this.deps.log('onRoomStarted failed', e));
        } else if (r.phase === 'paused' && r.clock.pausedAt !== null) {
          // Fold the closed pause into the total, then reopen the clock.
          r.clock.pausedMs += Math.max(0, now - r.clock.pausedAt);
          r.clock.pausedAt = null;
        }
        if (r.phase === 'lobby' || r.phase === 'paused') r.phase = 'playing';
        this.afterChange(rt);
        return;
      }
      case 'deal': {
        if (r.phase === 'paused') throw new RoomError('paused', 'Resume dealing first');
        if (r.phase !== 'playing') throw new RoomError('not-playing', 'The table is not playing');
        if (r.table.hand) throw new RoomError('hand-in-progress', 'A hand is already in progress');
        this.maybeStartHand(rt);
        return;
      }
      case 'pause':
        if (r.phase === 'playing' || r.phase === 'final-hand') {
          r.phase = 'paused';
          // The button promises "pause after this hand", so the clock keeps
          // running until that hand is done; afterHand closes it.
          if (r.table.hand === null) this.freezeClock(r);
        }
        this.afterChange(rt);
        return;
      case 'set-settings': {
        const next = roomSettingsSchema.parse({ ...r.settings, ...cmd.settings });
        for (const id of next.variantMode.kind === 'locked' ? [next.variantMode.variantId] : next.variantMode.allowed) {
          if (!listVariants().some((v) => v.id === id)) throw new RoomError('bad-variant', `Unknown game ${id}`);
        }
        const prev = r.settings;
        r.settings = next;
        // Stakes are deliberately left out here: they move only between hands,
        // through applyLevel, so a settings edit cannot change a live bet size.
        this.dispatch(rt, { type: 'set-config', config: nonStakeConfigFrom(next) }, false);
        // A duration, not an absolute deadline, so an extension survives the edit.
        r.clock.limitMs = next.end.kind === 'time' ? next.end.minutes * 60_000 : null;
        if (cadenceChanged(prev.levels, next.levels)) {
          r.clock.levelAnchor = {
            atMs: elapsedPlayingMs(r, Date.now()),
            atHands: r.hands.length,
            level: r.clock.appliedLevel,
          };
        }
        this.applyLevel(rt, Date.now());
        this.afterChange(rt);
        return;
      }
      case 'add-bot': {
        const taken = Object.values(r.members).map((m) => m.name);
        const id = `bot:${randomUUID().slice(0, 8)}`;
        const personality = cmd.personality ?? (['tight', 'loose', 'aggressive', 'station'] as const)[randomInt(4)]!;
        r.members[id] = { id, name: pickBotName(taken, rng), kind: 'bot', personality, joinedAt: Date.now() };
        try {
          this.sit(rt, id, cmd.seat);
        } catch (e) {
          delete r.members[id];
          throw e;
        }
        return;
      }
      case 'remove-player': {
        const m = r.members[cmd.playerId];
        if (!m) throw new RoomError('no-such-player', 'No such player');
        if (m.id === r.hostId) throw new RoomError('cannot-remove-host', 'The host cannot be removed');
        if (seatOf(r, m.id) !== -1) this.stand(rt, m.id);
        if (m.kind === 'bot') { delete r.members[m.id]; delete r.ledger[m.id]; }
        for (const c of rt.clients) if (c.userId === m.id && m.kind === 'human') c.send({ type: 'error', code: 'removed', message: 'The host removed you from the table' });
        this.afterChange(rt);
        return;
      }
      case 'extend': {
        const now = Date.now();
        const add = cmd.minutes * 60_000;
        const elapsed = elapsedPlayingMs(r, now);
        if (r.clock.limitMs === null) {
          // An open-ended night becomes a timed one, running from now.
          r.settings = { ...r.settings, end: { kind: 'time', minutes: cmd.minutes } };
          r.clock.limitMs = add;
          r.clock.bonusMs = elapsed;
        } else {
          // Adding time after the clock already ran out still means a full N minutes.
          const overrun = Math.max(0, elapsed - (r.clock.limitMs + r.clock.bonusMs));
          r.clock.bonusMs += add + overrun;
        }
        if (r.phase === 'final-hand') r.phase = 'playing';
        this.afterChange(rt);
        return;
      }
      case 'cancel-room':
        return this.cancelRoom(rt, 'cancelled', 'The host cancelled this table.');
      case 'end-night':
        this.requestEnd(rt);
        return;
      case 'transfer-host': {
        const m = r.members[cmd.playerId];
        if (!m || m.kind !== 'human') throw new RoomError('no-such-player', 'Pick a person at the table');
        r.hostId = m.id;
        this.afterChange(rt);
        return;
      }
      case 'rename-room':
        r.name = cmd.name;
        this.afterChange(rt);
        return;
    }
  }

  // ---------- engine ----------

  /** Apply an engine event. Throws RoomError on illegal events. */
  private dispatch(rt: RoomRuntime, event: TableEvent, settle = true): void {
    const r = rt.record;
    let result;
    try {
      result = reduce(r.table, event);
    } catch (e) {
      if (e instanceof EngineError) throw new RoomError(e.code, e.message);
      throw e;
    }
    r.table = result.state;
    for (const effect of result.effects) {
      if (effect.type === 'hand-settled') {
        r.hands.push(effect.summary);
        r.lastHand = effect.summary;
        void this.deps.onHandSettled(r, effect.summary).catch((e) => this.deps.log('onHandSettled failed', e));
      }
    }
    if (event.type === 'action' || event.type === 'choose-variant' || event.type === 'discard') rt.timeouts[event.seat] = 0;
    if (settle) this.afterChange(rt);
  }

  /** Close the clock at this instant. Idempotent. */
  private freezeClock(r: RoomRecord): void {
    if (r.clock.startedAt !== null && r.clock.pausedAt === null) r.clock.pausedAt = Date.now();
  }

  /**
   * Move the table to the level the schedule calls for. The only place stakes
   * ever change. Returns true if they moved.
   */
  private applyLevel(rt: RoomRuntime, now: number): boolean {
    const r = rt.record;
    if (r.table.hand !== null) return false; // never mid-hand
    if (r.clock.startedAt === null) return false;
    const target = targetLevel(r, now);
    const stakes = stakesAtLevel(r, target);
    if (target === r.clock.appliedLevel && sameStakes(stakes, currentStakes(r))) return false;
    try {
      this.dispatch(rt, { type: 'set-config', config: stakeConfigFrom(stakes) }, false);
    } catch (e) {
      this.deps.log(`level ${target} rejected in ${r.code}`, e);
      return false; // appliedLevel untouched, so the next hand retries
    }
    r.clock.appliedLevel = target;
    return true;
  }

  private afterChange(rt: RoomRuntime): void {
    if (rt.cancelled) return; // never write a cancelled table back to Redis
    rt.record.clock.tickedAt = Date.now();
    this.armTimers(rt);
    void this.deps.persist(rt.record).catch((e) => this.deps.log('persist failed', e));
    this.broadcast(rt);
  }

  private schedule(rt: RoomRuntime, ms: number, fn: () => void): void {
    if (rt.timer) clearTimeout(rt.timer);
    rt.timer = setTimeout(() => {
      rt.timer = null;
      try { fn(); } catch (e) { this.deps.log(`timer failed in ${rt.record.code}`, e); }
    }, Math.max(0, ms));
  }

  private armTimers(rt: RoomRuntime): void {
    if (rt.cancelled) return;
    const r = rt.record;
    const t = r.table;
    const h = t.hand;
    if (rt.timer) { clearTimeout(rt.timer); rt.timer = null; }
    rt.deadline = null;
    if (r.phase === 'ended') return;
    const now = Date.now();

    if (h && h.stage === 'choosing' && h.chooser !== null) {
      const seat = h.chooser;
      const st = t.seats[seat];
      if (st?.kind === 'bot') {
        this.schedule(rt, 600 + randomInt(900), () => {
          const allowed = r.settings.variantMode.kind === 'dealers-choice' ? r.settings.variantMode.allowed : [r.settings.variantMode.variantId];
          this.safeDispatch(rt, { type: 'choose-variant', seat, variantId: chooseVariant(allowed, rng) });
        });
      } else {
        rt.deadline = now + r.settings.actionSeconds * 1000;
        this.schedule(rt, rt.deadline - now, () => this.safeDispatch(rt, { type: 'timeout', seat }));
      }
      return;
    }

    if (h && h.stage === 'discarding' && h.round.actor !== null) {
      const seat = h.round.actor;
      const st = t.seats[seat];
      if (st?.kind === 'bot') {
        this.schedule(rt, 600 + randomInt(1200), () => this.botDiscard(rt, seat));
      } else {
        rt.deadline = now + r.settings.actionSeconds * 1000;
        this.schedule(rt, rt.deadline - now, () => this.safeDispatch(rt, { type: 'timeout', seat }));
      }
      return;
    }

    if (h && h.stage === 'betting' && h.round.actor !== null) {
      const seat = h.round.actor;
      const st = t.seats[seat];
      if (st?.kind === 'bot') {
        this.schedule(rt, 700 + randomInt(1600), () => this.botAct(rt, seat));
      } else {
        rt.deadline = now + r.settings.actionSeconds * 1000;
        this.schedule(rt, rt.deadline - now, () => this.humanTimeout(rt, seat));
      }
      return;
    }

    if (h && h.stage === 'settled') {
      this.schedule(rt, r.settings.settleSeconds * 1000, () => {
        this.dispatch(rt, { type: 'finish-hand' }, false);
        this.afterHand(rt);
      });
      return;
    }

    if (!h && (r.phase === 'playing' || r.phase === 'final-hand')) {
      if (r.phase === 'final-hand') { this.endNight(rt); return; }
      // With autoDeal off the host deals each hand by hand, via the `deal` command.
      if (r.settings.autoDeal) this.schedule(rt, 900, () => this.maybeStartHand(rt));
    }
  }

  private safeDispatch(rt: RoomRuntime, event: TableEvent): void {
    try {
      this.dispatch(rt, event);
    } catch (e) {
      this.deps.log(`event ${event.type} failed in ${rt.record.code}`, e);
      this.afterChange(rt);
    }
  }

  private humanTimeout(rt: RoomRuntime, seat: number): void {
    const r = rt.record;
    rt.timeouts[seat] = (rt.timeouts[seat] ?? 0) + 1;
    const st = r.table.seats[seat];
    const connected = st ? [...rt.clients].some((c) => c.userId === st.playerId) : false;
    this.dispatch(rt, { type: 'timeout', seat }, false);
    if (st && !connected && (rt.timeouts[seat] ?? 0) >= 2) {
      try { this.dispatch(rt, { type: 'sit-out', seat, out: true }, false); } catch { /* seat may be gone */ }
    }
    this.afterChange(rt);
  }

  private botAct(rt: RoomRuntime, seat: number): void {
    const r = rt.record;
    const h = r.table.hand;
    if (!h || h.stage !== 'betting' || h.round.actor !== seat) return;
    const st = r.table.seats[seat];
    const member = st ? r.members[st.playerId] : undefined;
    const personality = member?.personality ?? 'tight';
    try {
      const action = decideAction(r.table, seat, personality, rng);
      this.dispatch(rt, { type: 'action', seat, action });
    } catch (e) {
      this.deps.log(`bot failed in ${r.code}`, e);
      this.safeDispatch(rt, { type: 'timeout', seat });
    }
  }

  private botDiscard(rt: RoomRuntime, seat: number): void {
    const r = rt.record;
    const h = r.table.hand;
    if (!h || h.stage !== 'discarding' || h.round.actor !== seat) return;
    try {
      this.dispatch(rt, { type: 'discard', seat, cards: chooseDiscards(r.table, seat) });
    } catch (e) {
      this.deps.log(`bot draw failed in ${r.code}`, e);
      this.safeDispatch(rt, { type: 'timeout', seat });
    }
  }

  private afterHand(rt: RoomRuntime): void {
    const r = rt.record;
    // A pause requested mid-hand takes hold now the hand is done.
    if (r.phase === 'paused') this.freezeClock(r);
    // Bots re-buy on their own when allowed.
    for (const st of r.table.seats) {
      if (st && st.kind === 'bot' && st.stack === 0 && this.canRebuy(r, st.playerId)) {
        const seat = seatOf(r, st.playerId);
        const chips = r.settings.chips.buyInChips;
        this.dispatch(rt, { type: 'add-chips', seat, amount: chips }, false);
        const ledger = r.ledger[st.playerId] ?? emptyLedger();
        ledger.rebuys++;
        ledger.totalIn += chips;
        r.ledger[st.playerId] = ledger;
      }
    }
    if (r.phase === 'final-hand') { this.endNight(rt); return; }
    if (r.phase === 'playing' && this.nobodyLeftToPlay(r)) { this.endNight(rt); return; }
    this.afterChange(rt);
  }

  /** True when fewer than two players have chips and nobody could re-buy. */
  private nobodyLeftToPlay(r: RoomRecord): boolean {
    const withChips = r.table.seats.filter((s) => s && s.stack > 0).length;
    if (withChips >= 2) return false;
    const busted = r.table.seats.filter((s) => s && s.stack === 0);
    return !busted.some((s) => this.canRebuy(r, s!.playerId));
  }

  private maybeStartHand(rt: RoomRuntime): void {
    const r = rt.record;
    if (r.phase !== 'playing' || r.table.hand) return;
    if (eligibleSeats(r.table).length < 2) {
      if (this.nobodyLeftToPlay(r)) this.endNight(rt);
      return;
    }
    const now = Date.now();
    if (nightIsUp(r, now)) r.phase = 'final-hand';
    this.applyLevel(rt, now);
    // Both jokers go in every time; the engine takes them out unless jokers are wild.
    const deck = shuffle(fullDeck(2), (n) => randomInt(n));
    this.safeDispatch(rt, { type: 'start-hand', deck });
  }

  /**
   * Throw a table away before it has dealt a hand. Ordering matters: Redis is
   * what makes a room real, because `restore` rebuilds everything it holds at
   * boot. So the runtime is marked dead first, Redis has to go before the room
   * leaves memory, and Postgres is a best-effort footnote afterwards.
   *
   * If Redis refuses, nothing has changed and the host can simply try again.
   */
  private async cancelRoom(rt: RoomRuntime, code: string, message: string): Promise<void> {
    const r = rt.record;
    if (rt.cancelled) return;
    if (r.phase !== 'lobby') {
      throw new RoomError('already-started', 'The night has already started. End the night instead.');
    }

    // Before the first await, so nothing that runs during it can persist the
    // room back into Redis through afterChange.
    rt.cancelled = true;
    if (rt.timer) { clearTimeout(rt.timer); rt.timer = null; }

    try {
      await this.deps.forget(r);
    } catch (e) {
      rt.cancelled = false;
      this.armTimers(rt);
      this.deps.log(`could not cancel ${r.code}`, e);
      throw new RoomError('cancel-failed', 'Could not cancel the table. Try again.');
    }

    this.rooms.delete(r.code);
    for (const c of rt.clients) {
      try {
        c.send({ type: 'error', code, message });
        c.close?.(4005, 'cancelled');
      } catch (e) {
        this.deps.log('could not tell a client the table was cancelled', e);
      }
    }
    rt.clients.clear();

    void this.deps.onRoomCancelled(r).catch((e) => this.deps.log('onRoomCancelled failed', e));
  }

  /** End the night: at once between hands, or after the hand being played. */
  private requestEnd(rt: RoomRuntime): void {
    const r = rt.record;
    const h = r.table.hand;
    if (h && h.stage !== 'settled') { r.phase = 'final-hand'; this.afterChange(rt); }
    else this.endNight(rt);
  }

  /**
   * The server shutting a table down: over a limit, idle, or by hand from the
   * Server page. A lobby is cancelled outright; a night in progress finishes
   * its hand and ends normally, so everyone still gets the report.
   */
  async close(rt: RoomRuntime, reason: CloseReason): Promise<void> {
    const r = rt.record;
    if (rt.cancelled || r.phase === 'ended' || r.phase === 'final-hand') return;
    const message = CLOSE_MESSAGES[reason];
    this.deps.log(`closing ${r.code}: ${reason}`);
    if (r.phase === 'lobby') return this.cancelRoom(rt, 'closed', message);
    for (const c of rt.clients) {
      try { c.send({ type: 'error', code: 'closing', message: `${message} The hand being played will finish.` }); } catch { /* gone */ }
    }
    this.requestEnd(rt);
  }

  /**
   * Let go of a finished table once its report is safely in Postgres, which is
   * where the report link reads it from after this. Anyone still looking is
   * disconnected, and their page falls back to that copy.
   */
  async evict(rt: RoomRuntime): Promise<boolean> {
    const r = rt.record;
    if (r.phase !== 'ended' || !this.rooms.has(r.code)) return false;
    if (rt.reportWrite) {
      try { await rt.reportWrite; } catch { return false; } // not saved, so keep it
    }
    await this.deps.forget(r);
    this.rooms.delete(r.code);
    for (const c of rt.clients) {
      try {
        c.send({ type: 'error', code: 'no-room', message: 'This night is over and filed away.' });
        c.close?.(4006, 'ended');
      } catch { /* gone */ }
    }
    rt.clients.clear();
    return true;
  }

  private endNight(rt: RoomRuntime): void {
    const r = rt.record;
    if (r.phase === 'ended') return;
    if (rt.timer) { clearTimeout(rt.timer); rt.timer = null; }
    const endedAt = Date.now();
    this.freezeClock(r); // so the report's elapsed time stops moving
    r.phase = 'ended';
    r.endedAt = endedAt;
    r.report = buildReport(r, endedAt);
    rt.reportWrite = this.deps.onNightEnded(r, r.report);
    rt.reportWrite.catch((e) => this.deps.log('onNightEnded failed', e));
    this.afterChange(rt);
  }

  // ---------- views ----------

  variants(r: RoomRecord): VariantInfo[] {
    const allowed = r.settings.variantMode.kind === 'locked' ? [r.settings.variantMode.variantId] : r.settings.variantMode.allowed;
    return listVariants()
      .map((v) => ({
        id: v.id,
        name: v.name,
        description: v.description,
        defaultBetting: v.defaultBetting,
        forcedBets: v.forcedBets,
        players: { ...v.players },
        hasDraw: v.streets.some((street) => street.draw !== undefined),
      }))
      .sort((a, b) => Number(allowed.includes(b.id)) - Number(allowed.includes(a.id)));
  }

  view(rt: RoomRuntime, viewerId: string | null): RoomView {
    const r = rt.record;
    const now = Date.now();
    const connected = new Set([...rt.clients].map((c) => c.userId));
    const members: MemberView[] = Object.values(r.members).map((m) => {
      const seat = seatOf(r, m.id);
      return { id: m.id, name: m.name, kind: m.kind, connected: m.kind === 'bot' || connected.has(m.id), seat: seat === -1 ? null : seat, isHost: m.id === r.hostId };
    });
    const me = viewerId && r.members[viewerId] ? (() => {
      const seat = seatOf(r, viewerId);
      return {
        id: viewerId,
        name: r.members[viewerId]!.name,
        seat: seat === -1 ? null : seat,
        isHost: r.hostId === viewerId,
        canRebuy: this.canRebuy(r, viewerId),
        rebuysUsed: r.ledger[viewerId]?.rebuys ?? 0,
      };
    })() : null;
    const ledger: RoomView['ledger'] = {};
    for (const [id, l] of Object.entries(r.ledger)) ledger[id] = { buyIns: l.buyIns, rebuys: l.rebuys, totalIn: l.totalIn };
    return {
      code: r.code,
      name: r.name,
      hostId: r.hostId,
      hasPassword: r.passwordHash !== null,
      phase: r.phase,
      settings: r.settings,
      table: viewFor(r.table, viewerId),
      me,
      members,
      ledger,
      clock: {
        startedAt: r.clock.startedAt,
        endsAt: endsAtOf(r, now),
        remainingMs: remainingMs(r, now),
        running: r.clock.startedAt !== null && r.clock.pausedAt === null,
        serverNow: now,
      },
      level: levelViewOf(r, now),
      deadline: rt.deadline,
      lastHand: r.lastHand ? summaryFor(r.lastHand, viewerId) : null,
      handCount: r.hands.length,
      report: r.report,
      variants: this.variants(r),
      joinUrl: `${this.deps.publicUrl}/r/${r.code}`,
      serverLimit: (() => {
        const expiresAt = r.phase === 'ended' ? null : this.deps.expiresAt?.(r) ?? null;
        return expiresAt === null ? null : { expiresAt };
      })(),
    };
  }

  broadcast(rt: RoomRuntime): void {
    for (const c of rt.clients) {
      try { c.send({ type: 'snapshot', room: this.view(rt, c.userId) }); } catch (e) { this.deps.log('send failed', e); }
    }
  }

  /**
   * Every room this player is still part of, newest activity first, so the
   * landing and profile pages can offer a way straight back to the table.
   */
  activeRoomsFor(userId: string): ActiveRoom[] {
    const out: ActiveRoom[] = [];
    for (const rt of this.rooms.values()) {
      const r = rt.record;
      if (r.phase === 'ended' || !r.members[userId]) continue;
      const seat = seatOf(r, userId);
      const hand = r.table.hand;
      out.push({
        code: r.code,
        name: r.name,
        phase: r.phase,
        seat: seat === -1 ? null : seat,
        stack: seat === -1 ? 0 : r.table.seats[seat]?.stack ?? 0,
        seated: r.table.seats.filter(Boolean).length,
        handCount: r.hands.length,
        isHost: r.hostId === userId,
        isYourTurn: seat !== -1 && hand?.stage === 'betting' && hand.round.actor === seat,
        isYourChoice: seat !== -1 && hand?.stage === 'choosing' && hand.chooser === seat,
        updatedAt: r.clock.tickedAt,
      });
    }
    // The table waiting on you comes first, then where you are sitting, then the rest.
    return out.sort((a, b) => {
      const urgency = (x: ActiveRoom): number => (x.isYourTurn || x.isYourChoice ? 2 : x.seat !== null ? 1 : 0);
      return urgency(b) - urgency(a) || b.updatedAt - a.updatedAt;
    });
  }

  /** Public info for the join screen. */
  publicInfo(rt: RoomRuntime, viewerId: string | null): { code: string; name: string; hasPassword: boolean; phase: string; players: number; hostName: string; isMember: boolean } {
    const r = rt.record;
    return {
      code: r.code,
      name: r.name,
      hasPassword: r.passwordHash !== null,
      phase: r.phase,
      players: r.table.seats.filter(Boolean).length,
      hostName: r.members[r.hostId]?.name ?? '',
      isMember: viewerId !== null && !!r.members[viewerId],
    };
  }

  tableOf(code: string): TableState | undefined {
    return this.rooms.get(code)?.record.table;
  }
}

/**
 * Only a change of cadence re-bases the ladder. Editing the growth factor or the
 * base stakes moves the numbers without moving the level index, so the blinds
 * can never walk backwards mid-night.
 */
function cadenceChanged(prev: LevelSchedule, next: LevelSchedule): boolean {
  if (prev.kind !== next.kind) return true;
  if (prev.kind === 'time' && next.kind === 'time') return prev.everyMinutes !== next.everyMinutes;
  if (prev.kind === 'hands' && next.kind === 'hands') return prev.everyHands !== next.everyHands;
  return false;
}
