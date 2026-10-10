import { bestLow } from '../evaluator.js';
import type { VariantDefinition } from './types.js';

/**
 * Razz: seven-card stud for the lowest hand. Aces are low, straights and
 * flushes do not count, and pairs are bad, so A-2-3-4-5 is the nuts. The
 * highest card showing brings it in, and the lowest hand showing acts first.
 */
export const razz: VariantDefinition = {
  id: 'razz',
  name: 'Razz',
  family: 'stud',
  description: 'Seven-card stud where the lowest hand wins. Aces are low; straights and flushes do not count.',
  players: { min: 2, max: 8 },
  forcedBets: 'antes-bringin',
  defaultBetting: 'fixed-limit',
  streets: [
    { name: 'third', deal: { holeDown: 2, holeUp: 1 }, bet: true, fixedLimitTier: 'small' },
    { name: 'fourth', deal: { holeUp: 1 }, bet: true, fixedLimitTier: 'small' },
    { name: 'fifth', deal: { holeUp: 1 }, bet: true, fixedLimitTier: 'big' },
    { name: 'sixth', deal: { holeUp: 1 }, bet: true, fixedLimitTier: 'big' },
    { name: 'seventh', deal: { holeDown: 1 }, bet: true, fixedLimitTier: 'big' },
  ],
  evaluate: (hole, board, isWild) => bestLow([...hole, ...board], isWild),
  firstToAct: 'best-showing',
  lowball: true,
};
