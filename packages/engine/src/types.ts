import type { Card } from './cards.js';
import type { HandRank } from './evaluator.js';

export type SeatIndex = number;
export type BettingStructure = 'no-limit' | 'pot-limit' | 'fixed-limit';

export type VariantMode =
  | { kind: 'locked'; variantId: string }
  | { kind: 'dealers-choice'; allowed: string[] };

export interface TableConfig {
  maxSeats: number;
  variantMode: VariantMode;
  /** 'variant-default' uses each variant's conventional structure. */
  betting: BettingStructure | 'variant-default';
  blinds: { small: number; big: number };
  /** Ante posted by everyone each hand. Required for stud; optional elsewhere. */
  ante: number;
  /** Stud bring-in, posted by the lowest showing card. */
  bringIn: number;
  /** Fixed-limit bet sizes. Also the minimum bet in no/pot-limit stud. */
  fixedLimit: { small: number; big: number };
  /** Maximum bets per street in fixed limit (a bet plus raises). Ignored heads-up. */
  fixedLimitRaiseCap: number;
  actionSeconds: number;
}

export interface Seat {
  playerId: string;
  name: string;
  kind: 'human' | 'bot';
  stack: number;
  sittingOut: boolean;
}

export interface HandPlayer {
  seat: SeatIndex;
  playerId: string;
  name: string;
  kind: 'human' | 'bot';
  holeDown: Card[];
  holeUp: Card[];
  /** Chips bet on the current street, not yet in the pot. */
  streetBet: number;
  /** Chips committed to the pot on earlier streets. */
  committed: number;
  folded: boolean;
  allIn: boolean;
  /** Has acted since the last full raise on this street. */
  acted: boolean;
  /** Down cards are visible to everyone (showdown or all-in runout). */
  revealed: boolean;
  /** Voluntarily put chips in on the first street (not a forced bet). */
  vpip: boolean;
  /** Bet or raised on the first street. */
  pfr: boolean;
  /** Cards this player has thrown away, in order. */
  discarded: Card[];
  /** How many they took on the last draw, for the table to show. */
  drew: number;
  startStack: number;
}

export interface BettingRound {
  actor: SeatIndex | null;
  /** The highest street bet any player has made this street. */
  currentBet: number;
  /** Size of the last full raise, used for the minimum raise. */
  lastRaiseSize: number;
  /** Bets and raises this street, for the fixed-limit cap. */
  raises: number;
}

export type HandStage = 'choosing' | 'betting' | 'discarding' | 'runout' | 'settled';

export interface PotAward {
  amount: number;
  eligible: SeatIndex[];
  winners: SeatIndex[];
  payouts: Record<SeatIndex, number>;
}

export interface HandResult {
  showdown: boolean;
  pots: PotAward[];
  /** Seat → hand rank for every revealed hand. */
  hands: Record<SeatIndex, HandRank>;
  /** Seat → chips won or lost this hand. */
  net: Record<SeatIndex, number>;
  winners: SeatIndex[];
}

export type LogKind = 'info' | 'deal' | 'action' | 'street' | 'pot' | 'result';

export interface HandLogEntry {
  kind: LogKind;
  seat: SeatIndex | null;
  text: string;
  action?: Action;
}

export interface HandState {
  number: number;
  /** Empty while stage is 'choosing': the dealer has not picked a game yet. */
  variantId: string;
  betting: BettingStructure;
  /** Remaining undealt cards. Never sent to clients. */
  deck: Card[];
  /** Index into the variant's streets; -1 before the first deal. */
  streetIndex: number;
  board: Card[];
  players: (HandPlayer | null)[];
  round: BettingRound;
  stage: HandStage;
  button: SeatIndex;
  /** Seat that must choose the variant in dealer's-choice mode. */
  chooser: SeatIndex | null;
  /** Cards thrown away this hand, shuffled back in if the deck runs out. */
  muck: Card[];
  results: HandResult | null;
  log: HandLogEntry[];
}

export interface TableState {
  config: TableConfig;
  seats: (Seat | null)[];
  /** Seat with the button in the last (or current) hand; -1 before any hand. */
  button: SeatIndex;
  handNumber: number;
  hand: HandState | null;
  lastVariantId: string | null;
}

export type Action =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'bet'; to: number }
  | { type: 'raise'; to: number };

export interface LegalActions {
  seat: SeatIndex;
  canFold: boolean;
  canCheck: boolean;
  /** Chips the player would put in by calling (already capped at their stack). */
  callAmount: number;
  /** Chips needed to match the current bet, ignoring stack. */
  toCall: number;
  /** null when the player cannot bet or raise. Amounts are "to" totals for the street. */
  raise: { kind: 'bet' | 'raise'; min: number; max: number; fixed: boolean } | null;
  /** The minimum bet increment, useful for sliders. */
  step: number;
  potTotal: number;
}

export type TableEvent =
  | { type: 'sit'; seat: SeatIndex; player: { id: string; name: string; kind: 'human' | 'bot' }; stack: number }
  | { type: 'stand'; seat: SeatIndex }
  | { type: 'sit-out'; seat: SeatIndex; out: boolean }
  | { type: 'add-chips'; seat: SeatIndex; amount: number }
  | { type: 'rename'; seat: SeatIndex; name: string }
  | { type: 'set-config'; config: Partial<TableConfig> }
  | { type: 'start-hand'; deck: Card[]; variantId?: string }
  | { type: 'choose-variant'; seat: SeatIndex; variantId: string }
  | { type: 'action'; seat: SeatIndex; action: Action }
  | { type: 'discard'; seat: SeatIndex; cards: Card[] }
  | { type: 'timeout'; seat: SeatIndex }
  | { type: 'finish-hand' };

export type TableEffect =
  | { type: 'await-choice'; seat: SeatIndex }
  | { type: 'await-action'; seat: SeatIndex }
  | { type: 'await-discard'; seat: SeatIndex; min: number; max: number; replace: boolean }
  | { type: 'street'; streetIndex: number; name: string }
  | { type: 'hand-settled'; summary: HandSummary };

export interface HandSummaryPlayer {
  seat: SeatIndex;
  playerId: string;
  name: string;
  kind: 'human' | 'bot';
  holeDown: Card[];
  holeUp: Card[];
  folded: boolean;
  vpip: boolean;
  pfr: boolean;
  sawShowdown: boolean;
  wonShowdown: boolean;
  won: number;
  net: number;
  startStack: number;
  endStack: number;
  handLabel: string | null;
}

/** The forced bets a hand was dealt at. Structurally the shared LevelStakes. */
export interface HandStakes {
  blinds: { small: number; big: number };
  ante: number;
  bringIn: number;
  fixedLimit: { small: number; big: number };
}

export interface HandSummary {
  number: number;
  variantId: string;
  betting: BettingStructure;
  /** What the blinds and antes were for this hand. */
  stakes: HandStakes;
  board: Card[];
  potTotal: number;
  showdown: boolean;
  button: SeatIndex;
  players: HandSummaryPlayer[];
  winners: { seat: SeatIndex; playerId: string; amount: number; handLabel: string | null }[];
  log: HandLogEntry[];
}
