import { legalActions, playersInHand, type Action, type LegalActions, type TableState } from '@calliope/engine';
import type { BotPersonality } from '@calliope/shared';
import { estimateStrength } from './strength.js';

export { estimateStrength, chenStrength } from './strength.js';
export { chooseDiscards, drawKeep } from './discard.js';

export interface PersonalityParams {
  /** Shifts every strength estimate: positive plays more hands. */
  looseness: number;
  /** 0..1 how often a good hand bets or raises rather than calls. */
  aggression: number;
  /** 0..1 chance of betting with nothing. */
  bluff: number;
  /** 0..1 reluctance to fold once invested. */
  callDown: number;
}

export const PERSONALITIES: Record<BotPersonality, PersonalityParams> = {
  tight: { looseness: -0.1, aggression: 0.6, bluff: 0.03, callDown: 0.2 },
  loose: { looseness: 0.15, aggression: 0.4, bluff: 0.08, callDown: 0.5 },
  aggressive: { looseness: 0.05, aggression: 0.9, bluff: 0.16, callDown: 0.35 },
  station: { looseness: 0.25, aggression: 0.15, bluff: 0.01, callDown: 0.9 },
};

/** Bots are named after typefaces, which suits the printed look. */
export const BOT_NAMES = [
  'Bembo', 'Caslon', 'Bodoni', 'Didot', 'Garamond', 'Jenson', 'Baskerville', 'Clarendon',
  'Rockwell', 'Perpetua', 'Franklin', 'Palatino', 'Minion', 'Sabon', 'Plantin', 'Fournier',
  'Walbaum', 'Cochin', 'Goudy', 'Kennerley', 'Centaur', 'Joanna', 'Bulmer', 'Melior',
];

/** Uniform random number in [0, 1). */
export type Random = () => number;

const clamp = (x: number): number => Math.max(0, Math.min(1, x));

function roundToStep(x: number, step: number): number {
  return Math.max(step, Math.round(x / step) * step);
}

function sized(legal: LegalActions, strength: number, p: PersonalityParams, rng: Random): Action {
  const raise = legal.raise!;
  if (raise.fixed) return { type: raise.kind, to: raise.min };
  if (strength > 0.9 && rng() < p.aggression * 0.5) return { type: raise.kind, to: raise.max };
  const fraction = 0.45 + strength * 0.4 + p.aggression * 0.2 + (rng() - 0.5) * 0.15;
  const amount = roundToStep(legal.potTotal * fraction, legal.step);
  const base = raise.kind === 'bet' ? 0 : legal.toCall;
  const to = Math.min(raise.max, Math.max(raise.min, raise.min - base + amount));
  return { type: raise.kind, to };
}

/**
 * Decide what a bot does when it is its turn. Pure given the rng.
 * Throws if it is not the seat's turn.
 */
export function decideAction(state: TableState, seat: number, personality: BotPersonality, rng: Random): Action {
  const legal = legalActions(state, seat);
  if (!legal) throw new Error('Bot asked to act out of turn');
  const p = PERSONALITIES[personality];
  const h = state.hand!;
  const opponents = playersInHand(h).length - 1;
  let s = estimateStrength(state, seat);
  s = Math.pow(s, 1 + 0.12 * Math.max(0, opponents - 1));
  s = clamp(s + p.looseness * 0.4 + (rng() - 0.5) * 0.08);

  const stack = state.seats[seat]!.stack;
  const toCall = legal.callAmount;

  if (legal.canCheck) {
    const wantBet = s > 0.55 - p.aggression * 0.15 || rng() < p.bluff;
    if (wantBet && legal.raise) return sized(legal, s, p, rng);
    return { type: 'check' };
  }

  const potOdds = toCall / (legal.potTotal + toCall);
  const raiseThreshold = 0.72 - p.aggression * 0.12;
  if (legal.raise && s > raiseThreshold && rng() < 0.35 + p.aggression * 0.55) return sized(legal, s, p, rng);
  if (legal.raise && toCall < stack * 0.08 && rng() < p.bluff * 0.5) return sized(legal, Math.max(s, 0.5), p, rng);

  let needed = potOdds + 0.1 - p.callDown * 0.12;
  if (toCall > stack * 0.5) needed = Math.max(needed, 0.62 - p.callDown * 0.2);
  if (s >= needed) return { type: 'call' };
  if (toCall <= legal.step && s > 0.28 - p.looseness * 0.2) return { type: 'call' };
  return { type: 'fold' };
}

/** Dealer's choice: bots pick at random from what the table allows. */
export function chooseVariant(allowed: readonly string[], rng: Random): string {
  return allowed[Math.floor(rng() * allowed.length)] ?? allowed[0]!;
}

export function pickBotName(taken: readonly string[], rng: Random): string {
  const free = BOT_NAMES.filter((n) => !taken.includes(n));
  if (free.length === 0) return `${BOT_NAMES[Math.floor(rng() * BOT_NAMES.length)]} ${Math.floor(rng() * 90) + 10}`;
  return free[Math.floor(rng() * free.length)]!;
}
