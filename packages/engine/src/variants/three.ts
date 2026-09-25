import { evaluateThree } from '../evaluator.js';
import type { VariantDefinition } from './types.js';

/**
 * Three-card games. Hands are ranked by three-card rules (evaluateThree): a
 * straight beats a flush and trips beat both, because with three cards they
 * are the rarer hands.
 */
export const three: VariantDefinition = {
  id: 'three',
  name: 'Three-card Poker',
  description: 'Three down cards and one round of betting. A straight beats a flush here.',
  players: { min: 2, max: 9 },
  forcedBets: 'blinds',
  defaultBetting: 'no-limit',
  streets: [
    { name: 'deal', deal: { holeDown: 3 }, bet: true, fixedLimitTier: 'small' },
  ],
  evaluate: (hole) => evaluateThree(hole),
  firstToAct: 'left-of-button',
};

export const draw3: VariantDefinition = {
  id: 'draw3',
  name: 'Three-card Draw',
  description: 'Three down cards, a bet, then throw away what you do not want and draw again.',
  players: { min: 2, max: 8 },
  forcedBets: 'blinds',
  defaultBetting: 'no-limit',
  streets: [
    { name: 'predraw', deal: { holeDown: 3 }, bet: true, fixedLimitTier: 'small' },
    {
      name: 'draw',
      deal: {},
      draw: { min: 0, max: 3, replace: true },
      bet: true,
      fixedLimitTier: 'big',
    },
  ],
  evaluate: (hole) => evaluateThree(hole),
  firstToAct: 'left-of-button',
};
