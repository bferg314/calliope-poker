import { bestHand } from '../evaluator.js';
import type { VariantDefinition } from './types.js';

/**
 * Atomic Pineapple: five hole cards, and one thrown away after each of the
 * first three betting rounds, before the flop, the turn and the river. By the
 * river everyone is down to two, and from there it is Hold'em.
 *
 * Capped at nine: ten players would need 55 cards.
 */
export const atomic: VariantDefinition = {
  id: 'atomic',
  name: 'Atomic Pineapple',
  family: 'community',
  description: 'Five down cards, five shared. Throw one away before the flop, the turn and the river.',
  players: { min: 2, max: 9 },
  forcedBets: 'blinds',
  defaultBetting: 'no-limit',
  streets: [
    { name: 'preflop', deal: { holeDown: 5 }, bet: true, fixedLimitTier: 'small' },
    { name: 'flop', deal: { community: 3 }, draw: { min: 1, max: 1, replace: false }, bet: true, fixedLimitTier: 'small' },
    { name: 'turn', deal: { community: 1 }, draw: { min: 1, max: 1, replace: false }, bet: true, fixedLimitTier: 'big' },
    { name: 'river', deal: { community: 1 }, draw: { min: 1, max: 1, replace: false }, bet: true, fixedLimitTier: 'big' },
  ],
  evaluate: (hole, board, isWild) => bestHand([...hole, ...board], isWild),
  firstToAct: 'left-of-button',
};
