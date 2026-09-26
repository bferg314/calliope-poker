import { bestHand } from '../evaluator.js';
import type { VariantDefinition } from './types.js';

/**
 * Five-card draw. No board at all: five cards down, a bet, then everyone throws
 * away what they do not want and is dealt that many back.
 *
 * Capped at six players because a full table can run through the deck; when it
 * does, the engine shuffles the discards back in.
 */
export const draw5: VariantDefinition = {
  id: 'draw5',
  name: 'Five-card Draw',
  family: 'draw',
  description: 'Five down cards, no board. Throw away what you do not want and draw again.',
  players: { min: 2, max: 6 },
  forcedBets: 'blinds',
  defaultBetting: 'no-limit',
  streets: [
    { name: 'predraw', deal: { holeDown: 5 }, bet: true, fixedLimitTier: 'small' },
    {
      name: 'draw',
      deal: {},
      draw: { min: 0, max: 5, replace: true },
      bet: true,
      fixedLimitTier: 'big',
    },
  ],
  evaluate: (hole, _board, isWild) => bestHand(hole, isWild),
  firstToAct: 'left-of-button',
};
