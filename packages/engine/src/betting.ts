import { getVariant } from './registry.js';
import type {
  BettingStructure, HandPlayer, HandState, LegalActions, SeatIndex, TableConfig, TableState,
} from './types.js';
import type { VariantDefinition } from './variants/types.js';

export function resolveBetting(config: TableConfig, variant: VariantDefinition): BettingStructure {
  return config.betting === 'variant-default' ? variant.defaultBetting : config.betting;
}

/** The smallest legal opening bet: the big blind, or the small fixed bet in ante games. */
export function minBet(config: TableConfig, variant: VariantDefinition): number {
  return variant.forcedBets === 'blinds' ? config.blinds.big : config.fixedLimit.small;
}

export function fixedBetSize(config: TableConfig, variant: VariantDefinition, streetIndex: number): number {
  const tier = variant.streets[streetIndex]?.fixedLimitTier ?? 'small';
  return tier === 'big' ? config.fixedLimit.big : config.fixedLimit.small;
}

/** Everything committed so far, including bets on the current street. */
export function potTotal(hand: HandState): number {
  let total = 0;
  for (const p of hand.players) if (p) total += p.committed + p.streetBet;
  return total;
}

export function playersInHand(hand: HandState): HandPlayer[] {
  return hand.players.filter((p): p is HandPlayer => p !== null && !p.folded);
}

export function playersWhoCanAct(hand: HandState): HandPlayer[] {
  return playersInHand(hand).filter((p) => !p.allIn);
}

export function bettingLabel(b: BettingStructure): string {
  return b === 'no-limit' ? 'no limit' : b === 'pot-limit' ? 'pot limit' : 'fixed limit';
}

/**
 * What the seat may do right now, or null if it is not that seat's turn.
 * Shared by the server (validation), the client (buttons) and the bots.
 */
export function legalActions(state: TableState, seat: SeatIndex): LegalActions | null {
  const hand = state.hand;
  if (!hand || hand.stage !== 'betting' || hand.round.actor !== seat) return null;
  const p = hand.players[seat];
  const s = state.seats[seat];
  if (!p || !s || p.folded || p.allIn) return null;

  const variant = getVariant(hand.variantId);
  const config = state.config;
  const stack = s.stack;
  const cb = hand.round.currentBet;
  const toCall = cb - p.streetBet;
  const callAmount = Math.min(toCall, stack);
  const step = minBet(config, variant);
  const pot = potTotal(hand);
  const base = { seat, canFold: true, canCheck: toCall === 0, callAmount, toCall, step, potTotal: pot };

  // No raise when: nothing beyond the call, nobody else could respond, or the player
  // already acted this street and is only facing an incomplete (short all-in) raise.
  const others = playersWhoCanAct(hand).filter((o) => o.seat !== seat);
  if (stack <= toCall || others.length === 0 || (p.acted && toCall > 0)) return { ...base, raise: null };

  const maxTo = p.streetBet + stack;
  const kind = cb === 0 ? 'bet' : 'raise';

  if (hand.betting === 'fixed-limit') {
    if (hand.round.raises >= config.fixedLimitRaiseCap && playersInHand(hand).length > 2) {
      return { ...base, raise: null };
    }
    const size = fixedBetSize(config, variant, hand.streetIndex);
    const to = Math.min(cb === 0 ? size : cb < size ? size : cb + size, maxTo);
    return { ...base, raise: { kind, min: to, max: to, fixed: true } };
  }

  const bringInStreet = variant.forcedBets === 'antes-bringin' && hand.streetIndex === 0 && hand.round.raises === 0;
  let min: number;
  if (cb === 0) min = step;
  else if (bringInStreet && cb < step) min = step; // completing the bring-in
  else min = cb + Math.max(hand.round.lastRaiseSize, step);
  min = Math.min(min, maxTo);

  let max: number;
  if (hand.betting === 'no-limit') {
    max = maxTo;
  } else {
    // Pot limit: the raise may be as large as the pot after the call.
    max = Math.min(maxTo, cb + toCall + pot);
    if (max < min) max = min;
  }
  return { ...base, raise: { kind, min, max, fixed: false } };
}
