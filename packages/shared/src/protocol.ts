import { z } from 'zod';
import type { HandSummary, TableView } from '@calliope/engine';
import { nameSchema, roomSettingsPatchSchema, type RoomSettings } from './settings.js';
import type { LevelStakes } from './levels.js';

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fold') }),
  z.object({ type: z.literal('check') }),
  z.object({ type: z.literal('call') }),
  z.object({ type: z.literal('bet'), to: z.number().int().positive() }),
  z.object({ type: z.literal('raise'), to: z.number().int().positive() }),
]);

export const BOT_PERSONALITIES = ['tight', 'loose', 'aggressive', 'station'] as const;
export type BotPersonality = (typeof BOT_PERSONALITIES)[number];

export const hostCommandSchema = z.discriminatedUnion('kind', [
  /** Deal the first hand (from the lobby) or resume dealing. */
  z.object({ kind: z.literal('start') }),
  /** Stop dealing new hands; the current hand finishes. */
  z.object({ kind: z.literal('pause') }),
  /** Deal one hand now. Used when the table is not dealing automatically. */
  z.object({ kind: z.literal('deal') }),
  z.object({ kind: z.literal('set-settings'), settings: roomSettingsPatchSchema }),
  z.object({ kind: z.literal('add-bot'), seat: z.number().int().min(0).max(9), personality: z.enum(BOT_PERSONALITIES).optional() }),
  z.object({ kind: z.literal('remove-player'), playerId: z.string().min(1) }),
  z.object({ kind: z.literal('extend'), minutes: z.number().int().positive().max(600) }),
  z.object({ kind: z.literal('end-night') }),
  /** Throw the table away before a single hand has been dealt. */
  z.object({ kind: z.literal('cancel-room') }),
  z.object({ kind: z.literal('transfer-host'), playerId: z.string().min(1) }),
  z.object({ kind: z.literal('rename-room'), name: nameSchema }),
]);

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('action'), action: actionSchema }),
  z.object({ type: z.literal('choose-variant'), variantId: z.string().min(2).max(32) }),
  /** Throw cards away on a draw street. An empty list stands pat. */
  z.object({ type: z.literal('discard'), cards: z.array(z.string().length(2)).max(5) }),
  z.object({ type: z.literal('sit'), seat: z.number().int().min(0).max(9) }),
  z.object({ type: z.literal('stand') }),
  z.object({ type: z.literal('sit-out'), out: z.boolean() }),
  z.object({ type: z.literal('rebuy') }),
  z.object({ type: z.literal('host'), command: hostCommandSchema }),
  z.object({ type: z.literal('ping') }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type HostCommand = z.infer<typeof hostCommandSchema>;

export type RoomPhase = 'lobby' | 'playing' | 'paused' | 'final-hand' | 'ended';

export interface MemberView {
  id: string;
  name: string;
  kind: 'human' | 'bot';
  connected: boolean;
  seat: number | null;
  isHost: boolean;
}

export interface LedgerEntry {
  buyIns: number;
  rebuys: number;
  /** Chips put on the table across all buy-ins. */
  totalIn: number;
}

export interface VariantInfo {
  id: string;
  name: string;
  description: string;
  defaultBetting: 'no-limit' | 'pot-limit' | 'fixed-limit';
  forcedBets: 'blinds' | 'antes-bringin';
  /** How many can play. Five-card draw runs out of cards past six. */
  players: { min: number; max: number };
  /** The game has a discard or draw round. */
  hasDraw: boolean;
}

export interface ReportPlayer {
  id: string;
  name: string;
  kind: 'human' | 'bot';
  buyIns: number;
  rebuys: number;
  totalIn: number;
  finalStack: number;
  net: number;
  handsPlayed: number;
  handsWon: number;
  showdownsSeen: number;
  showdownsWon: number;
  vpipPct: number;
  biggestPotWon: number;
  /**
   * The night in real money, in minor units (cents), and zero throughout when
   * the report's `cash` is null. `cashOut` is the payout: what the bank counts
   * back for the chips they finished with.
   */
  cashIn: number;
  cashOut: number;
  cashNet: number;
}

/**
 * What the night came to in real money. Every amount is in minor units
 * (cents), so the column adds up without a float creeping into it.
 */
export interface NightCash {
  /** The symbol the host typed, printed in front of an amount. */
  currency: string;
  /** What one buy-in costs, and the chips it puts on the table. */
  buyIn: number;
  chipsPerBuyIn: number;
  /** Cash taken over the night, and cash handed back at the end. */
  paidIn: number;
  paidOut: number;
}

export interface NightReport {
  roomCode: string;
  roomName: string;
  startedAt: number | null;
  endedAt: number;
  handsPlayed: number;
  variantsPlayed: Record<string, number>;
  players: ReportPlayer[];
  biggestPot: { amount: number; handNumber: number; winners: string[]; handLabel: string | null } | null;
  mostHandsWon: { name: string; count: number } | null;
  /** Stakes the last hand was played at, and how many levels the night climbed. */
  finalStakes: LevelStakes | null;
  levelsPlayed: number;
  tightest: { name: string; vpipPct: number } | null;
  loosest: { name: string; vpipPct: number } | null;
  /** Null when the host never priced a buy-in and the night was played for nothing. */
  cash: NightCash | null;
}

export interface LevelView {
  /** 0-based. Level 0 is the host's base stakes verbatim. */
  index: number;
  /** The stakes in play right now. */
  stakes: LevelStakes;
  /** What the next level costs, or null at the top of the ladder or when off. */
  next: LevelStakes | null;
  /** Playing-milliseconds until the next level; null on a hands cadence or at the top. */
  msUntilNext: number | null;
  /** Wall time the next level is due; null while paused or on a hands cadence. */
  nextAt: number | null;
  /** Hands left before the next level; null on a time cadence or at the top. */
  handsUntilNext: number | null;
  /** The schedule is frozen because the room is paused. */
  frozen: boolean;
  /** Stakes are climbing at all. */
  rising: boolean;
}

/** One room a player is still part of, for the "back to your game" banner. */
export interface ActiveRoom {
  code: string;
  name: string;
  phase: RoomPhase;
  /** The viewer's seat, or null when they are only watching. */
  seat: number | null;
  stack: number;
  seated: number;
  handCount: number;
  isHost: boolean;
  /** The viewer is the one everybody is waiting on. */
  isYourTurn: boolean;
  /** The viewer must choose the game before the hand can start. */
  isYourChoice: boolean;
  updatedAt: number;
}

export interface RoomView {
  code: string;
  name: string;
  hostId: string;
  hasPassword: boolean;
  phase: RoomPhase;
  settings: RoomSettings;
  table: TableView;
  me: {
    id: string;
    name: string;
    seat: number | null;
    isHost: boolean;
    canRebuy: boolean;
    rebuysUsed: number;
  } | null;
  members: MemberView[];
  ledger: Record<string, LedgerEntry>;
  clock: {
    startedAt: number | null;
    /** Wall time the night ends; null while paused or with no time limit. */
    endsAt: number | null;
    /** Playing-milliseconds left tonight; keeps its value while paused. */
    remainingMs: number | null;
    /** False while the room is paused, so the client can freeze the countdown. */
    running: boolean;
    serverNow: number;
  };
  level: LevelView;
  /** Epoch ms when the current actor or chooser times out. */
  deadline: number | null;
  lastHand: HandSummary | null;
  handCount: number;
  report: NightReport | null;
  variants: VariantInfo[];
  /**
   * Relative (`/r/CODE`) unless the operator set PUBLIC_URL. Resolve it
   * against the page address before showing, copying or encoding it.
   */
  joinUrl: string;
  /**
   * Set on a table opened under the server's public limits: the wall time the
   * server closes it. The hand in progress then finishes and the night ends.
   */
  serverLimit: { expiresAt: number } | null;
}

export type ServerMessage =
  | { type: 'snapshot'; room: RoomView }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong'; now: number };
