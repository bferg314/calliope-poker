import { randomInt } from 'node:crypto';
import { createTable, type HandSummary, type TableConfig, type TableState } from '@calliope/engine';
import {
  baseStakesOf, chipUnitOf, DEFAULT_ROOM_SETTINGS, ladderOptsOf, priceNight, roomSettingsSchema,
  ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, stakesForLevel,
  type BotPersonality, type LedgerEntry, type LevelStakes, type LevelView, type NightReport,
  type ReportPlayer, type RoomPhase, type RoomSettings,
} from '@calliope/shared';

export interface Member {
  id: string;
  name: string;
  kind: 'human' | 'bot';
  personality?: BotPersonality;
  joinedAt: number;
}

export interface Ledger extends LedgerEntry {
  /** Chips taken off the table by standing up. */
  cashedOut: number;
}

/**
 * The night's clock, measured in playing time rather than wall time so that a
 * pause (or a server restart) does not burn the night away. Every field is an
 * absolute wall time or a plain duration, so it survives the trip through Redis.
 */
export interface RoomClock {
  /** Wall time the room first left the lobby. */
  startedAt: number | null;
  /** Wall time the current pause began; null while running. */
  pausedAt: number | null;
  /** Milliseconds spent inside completed pause cycles. */
  pausedMs: number;
  /** Night length as playing-ms, from settings.end; null for last-standing. */
  limitMs: number | null;
  /** Playing-ms granted by `extend`, kept apart so set-settings cannot eat it. */
  bonusMs: number;
  /** The level whose stakes are in table.config right now. */
  appliedLevel: number;
  /** Where the ladder was last re-based, so a cadence change cannot lower the level. */
  levelAnchor: { atMs: number; atHands: number; level: number };
  /** Wall time of the last change, used to discount server downtime on restore. */
  tickedAt: number;
}

/** Everything about a room that survives a restart. Timers and sockets are rebuilt. */
export interface RoomRecord {
  code: string;
  name: string;
  hostId: string;
  passwordHash: string | null;
  createdAt: number;
  phase: RoomPhase;
  settings: RoomSettings;
  table: TableState;
  members: Record<string, Member>;
  ledger: Record<string, Ledger>;
  clock: RoomClock;
  hands: HandSummary[];
  lastHand: HandSummary | null;
  endedAt: number | null;
  report: NightReport | null;
  /**
   * Set when someone without a server role opened the table, so the server's
   * limits apply to it. Missing on records from before limits existed, which
   * reads as exempt.
   */
  quota?: RoomQuota | null;
}

/** Who a public table counts against. Stays put when the host role moves. */
export interface RoomQuota {
  openedBy: string;
  ip: string;
}

/** Config that is safe to change at any moment, including mid-hand. */
export function nonStakeConfigFrom(settings: RoomSettings): Partial<TableConfig> {
  return {
    maxSeats: 8,
    variantMode: settings.variantMode,
    wild: settings.wild ?? { kind: 'none' },
    betting: settings.betting,
    actionSeconds: settings.actionSeconds,
  };
}

/** Forced bets. Only ever applied between hands, via RoomManager.applyLevel. */
export function stakeConfigFrom(stakes: LevelStakes): Partial<TableConfig> {
  return {
    blinds: { ...stakes.blinds },
    ante: stakes.ante,
    bringIn: stakes.bringIn,
    fixedLimit: { ...stakes.fixedLimit },
  };
}

export function tableConfigFrom(settings: RoomSettings): Partial<TableConfig> {
  return { ...nonStakeConfigFrom(settings), ...stakeConfigFrom(baseStakesOf(settings)) };
}

export function newClock(): RoomClock {
  return {
    startedAt: null,
    pausedAt: null,
    pausedMs: 0,
    limitMs: null,
    bonusMs: 0,
    appliedLevel: 0,
    levelAnchor: { atMs: 0, atHands: 0, level: 0 },
    tickedAt: Date.now(),
  };
}

export function randomRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

export function newRoom(opts: {
  code: string;
  host: { id: string; name: string };
  name?: string;
  passwordHash?: string | null;
  settings?: Partial<RoomSettings>;
  quota?: RoomQuota | null;
  now: number;
}): RoomRecord {
  const settings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS, ...(opts.settings ?? {}) };
  return {
    code: opts.code,
    name: opts.name?.trim() || `${opts.host.name}'s table`,
    hostId: opts.host.id,
    passwordHash: opts.passwordHash ?? null,
    createdAt: opts.now,
    phase: 'lobby',
    settings,
    table: createTable(tableConfigFrom(settings)),
    members: { [opts.host.id]: { id: opts.host.id, name: opts.host.name, kind: 'human', joinedAt: opts.now } },
    ledger: {},
    clock: newClock(),
    hands: [],
    lastHand: null,
    endedAt: null,
    report: null,
    quota: opts.quota ?? null,
  };
}

export function emptyLedger(): Ledger {
  return { buyIns: 0, rebuys: 0, totalIn: 0, cashedOut: 0 };
}

export function seatOf(r: RoomRecord, playerId: string): number {
  return r.table.seats.findIndex((s) => s !== null && s.playerId === playerId);
}

export function buildReport(r: RoomRecord, endedAt: number): NightReport {
  const players: ReportPlayer[] = [];
  const perPlayer = new Map<string, { played: number; won: number; sdSeen: number; sdWon: number; vpip: number; biggest: number }>();
  const variantsPlayed: Record<string, number> = {};
  const stakesSeen = new Set<string>();
  let biggestPot: NightReport['biggestPot'] = null;
  for (const h of r.hands) {
    variantsPlayed[h.variantId] = (variantsPlayed[h.variantId] ?? 0) + 1;
    if (h.stakes) stakesSeen.add(`${h.stakes.blinds.small}/${h.stakes.blinds.big}/${h.stakes.ante}`);
    if (!biggestPot || h.potTotal > biggestPot.amount) {
      biggestPot = {
        amount: h.potTotal,
        handNumber: h.number,
        winners: h.winners.map((w) => h.players.find((p) => p.seat === w.seat)?.name ?? '?'),
        handLabel: h.winners[0]?.handLabel ?? null,
      };
    }
    for (const p of h.players) {
      const s = perPlayer.get(p.playerId) ?? { played: 0, won: 0, sdSeen: 0, sdWon: 0, vpip: 0, biggest: 0 };
      s.played++;
      if (p.won > 0) s.won++;
      if (p.sawShowdown) s.sdSeen++;
      if (p.wonShowdown) s.sdWon++;
      if (p.vpip) s.vpip++;
      s.biggest = Math.max(s.biggest, p.won);
      perPlayer.set(p.playerId, s);
    }
  }
  for (const m of Object.values(r.members)) {
    const ledger = r.ledger[m.id];
    if (!ledger) continue; // never sat down
    const seat = seatOf(r, m.id);
    const finalStack = seat === -1 ? 0 : r.table.seats[seat]!.stack;
    const st = perPlayer.get(m.id) ?? { played: 0, won: 0, sdSeen: 0, sdWon: 0, vpip: 0, biggest: 0 };
    players.push({
      id: m.id,
      name: m.name,
      kind: m.kind,
      buyIns: ledger.buyIns,
      rebuys: ledger.rebuys,
      totalIn: ledger.totalIn,
      finalStack: finalStack + ledger.cashedOut,
      net: finalStack + ledger.cashedOut - ledger.totalIn,
      handsPlayed: st.played,
      handsWon: st.won,
      showdownsSeen: st.sdSeen,
      showdownsWon: st.sdWon,
      vpipPct: st.played ? Math.round((st.vpip / st.played) * 100) : 0,
      biggestPotWon: st.biggest,
      cashIn: 0,
      cashOut: 0,
      cashNet: 0,
    });
  }
  players.sort((a, b) => b.net - a.net);
  const cash = priceNight(players, r.settings.chips);
  const withHands = players.filter((p) => p.handsPlayed >= 5);
  const most = [...players].sort((a, b) => b.handsWon - a.handsWon)[0];
  const tight = [...withHands].sort((a, b) => a.vpipPct - b.vpipPct)[0];
  const loose = [...withHands].sort((a, b) => b.vpipPct - a.vpipPct)[0];
  return {
    roomCode: r.code,
    roomName: r.name,
    startedAt: r.clock.startedAt,
    endedAt,
    handsPlayed: r.hands.length,
    variantsPlayed,
    players,
    biggestPot,
    mostHandsWon: most && most.handsWon > 0 ? { name: most.name, count: most.handsWon } : null,
    finalStakes: r.hands.length ? r.hands[r.hands.length - 1]!.stakes ?? null : null,
    levelsPlayed: stakesSeen.size,
    tightest: tight ? { name: tight.name, vpipPct: tight.vpipPct } : null,
    loosest: loose && loose !== tight ? { name: loose.name, vpipPct: loose.vpipPct } : null,
    cash,
  };
}

// ---------- the night clock, in playing time ----------

/**
 * Milliseconds of actual play so far, excluding every pause.
 *
 * `pausedAt` is cleared at the same moment its interval folds into `pausedMs`,
 * so no interval is ever counted twice and the value never goes backwards.
 */
export function elapsedPlayingMs(r: RoomRecord, now: number): number {
  const c = r.clock;
  if (c.startedAt === null) return 0;
  return Math.max(0, (c.pausedAt ?? now) - c.startedAt - c.pausedMs);
}

/** Total playing-ms the night is allowed to run, including any extensions. */
export function nightBudgetMs(r: RoomRecord): number | null {
  return r.clock.limitMs === null ? null : r.clock.limitMs + r.clock.bonusMs;
}

/** Ms left tonight; holds its value while paused, unless the night ends at a clock time. */
export function remainingMs(r: RoomRecord, now: number): number | null {
  const end = r.settings.end;
  if (end.kind === 'at') return end.at + r.clock.bonusMs - now;
  const budget = nightBudgetMs(r);
  return budget === null ? null : budget - elapsedPlayingMs(r, now);
}

export function nightIsUp(r: RoomRecord, now: number): boolean {
  const left = remainingMs(r, now);
  return left !== null && left <= 0;
}

/**
 * Wall time the night ends. Null while paused, since a playing-time deadline
 * slides; a clock-time deadline stays put.
 */
export function endsAtOf(r: RoomRecord, now: number): number | null {
  const end = r.settings.end;
  if (end.kind === 'at') return end.at + r.clock.bonusMs;
  const left = remainingMs(r, now);
  if (left === null || r.clock.pausedAt !== null) return null;
  return now + left;
}

// ---------- levels ----------

/** The stakes actually in play, read from the table rather than recomputed. */
export function currentStakes(r: RoomRecord): LevelStakes {
  const c = r.table.config;
  return {
    blinds: { ...c.blinds },
    ante: c.ante,
    bringIn: c.bringIn,
    fixedLimit: { ...c.fixedLimit },
  };
}

/** The level the schedule says we should be at now. Never lower than the anchor. */
export function targetLevel(r: RoomRecord, now: number): number {
  const schedule = r.settings.levels;
  if (schedule.kind === 'off') return r.clock.appliedLevel;
  const anchor = r.clock.levelAnchor;
  const steps = schedule.kind === 'time'
    ? Math.floor((elapsedPlayingMs(r, now) - anchor.atMs) / (schedule.everyMinutes * 60_000))
    : Math.floor((r.hands.length - anchor.atHands) / schedule.everyHands);
  return Math.min(schedule.maxLevel, anchor.level + Math.max(0, steps));
}

export function stakesAtLevel(r: RoomRecord, level: number): LevelStakes {
  const schedule = r.settings.levels;
  return stakesForLevel(baseStakesOf(r.settings), ladderOptsOf(schedule, chipUnitOf(r.settings)), level);
}

export function levelViewOf(r: RoomRecord, now: number): LevelView {
  const schedule = r.settings.levels;
  const index = r.clock.appliedLevel;
  const atTop = schedule.kind === 'off' || index >= schedule.maxLevel;
  const anchor = r.clock.levelAnchor;
  let msUntilNext: number | null = null;
  let handsUntilNext: number | null = null;
  if (!atTop && schedule.kind === 'time') {
    const due = (index - anchor.level + 1) * schedule.everyMinutes * 60_000;
    msUntilNext = Math.max(0, due - (elapsedPlayingMs(r, now) - anchor.atMs));
  } else if (!atTop && schedule.kind === 'hands') {
    const due = (index - anchor.level + 1) * schedule.everyHands;
    handsUntilNext = Math.max(0, due - (r.hands.length - anchor.atHands));
  }
  return {
    index,
    stakes: currentStakes(r),
    next: atTop ? null : stakesAtLevel(r, index + 1),
    msUntilNext,
    nextAt: msUntilNext !== null && r.clock.pausedAt === null ? now + msUntilNext : null,
    handsUntilNext,
    frozen: r.clock.pausedAt !== null,
    rising: schedule.kind !== 'off',
  };
}

// ---------- restoring from Redis ----------

/** How long a gap since the last change counts as the server having been down. */
export const DOWNTIME_GRACE_MS = 60_000;

/**
 * Bring a record loaded from Redis up to the current shape. Rooms saved before
 * the clock rework carry an absolute `endsAt`, which becomes a playing-ms budget;
 * that conversion folds in any extension the old code had already granted.
 */
export function migrateClock(r: RoomRecord, now: number): void {
  const legacy = (r.clock ?? {}) as Partial<RoomClock> & { endsAt?: number | null };
  if (legacy.pausedMs === undefined) {
    legacy.pausedMs = 0;
    legacy.pausedAt = r.phase === 'paused' ? now : null;
    legacy.bonusMs = 0;
    legacy.limitMs = legacy.endsAt != null && legacy.startedAt != null
      ? Math.max(0, legacy.endsAt - legacy.startedAt)
      : null;
    delete (legacy as { endsAt?: unknown }).endsAt;
  }
  legacy.startedAt ??= null;
  legacy.pausedAt ??= null;
  legacy.bonusMs ??= 0;
  legacy.limitMs ??= null;
  legacy.appliedLevel ??= 0;
  legacy.levelAnchor ??= { atMs: 0, atHands: r.hands?.length ?? 0, level: legacy.appliedLevel };
  legacy.tickedAt ??= now;
  r.clock = legacy as RoomClock;
  r.hands ??= [];
  // Fills in `levels` for rooms saved before the schedule existed.
  r.settings = roomSettingsSchema.parse(r.settings);
}

/**
 * Time the server was down is not playing time. A room that was mid-night comes
 * back paused, so a deploy cannot burn the clock or jump several levels at once.
 */
export function absorbDowntime(r: RoomRecord, now: number): boolean {
  const gap = now - r.clock.tickedAt;
  const wasRunning = r.clock.pausedAt === null && (r.phase === 'playing' || r.phase === 'final-hand');
  if (!wasRunning || gap <= DOWNTIME_GRACE_MS) {
    r.clock.tickedAt = now;
    return false;
  }
  r.clock.pausedMs += gap;
  r.clock.pausedAt = now;
  r.phase = 'paused';
  r.clock.tickedAt = now;
  return true;
}
