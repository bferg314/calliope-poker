import { bestHand } from '../evaluator.js';
import type { VariantDefinition } from './types.js';

/**
 * Crazy Pineapple, the version people actually play at home: three hole cards,
 * bet, flop, bet, then everyone throws one away before the turn. From there it
 * is Hold'em.
 */
export const pineapple: VariantDefinition = {
  id: 'pineapple',
  name: 'Pineapple',
  description: 'Three down cards, five shared. Everyone throws one away after the flop.',
  players: { min: 2, max: 10 },
  forcedBets: 'blinds',
  defaultBetting: 'no-limit',
  streets: [
    { name: 'preflop', deal: { holeDown: 3 }, bet: true, fixedLimitTier: 'small' },
    { name: 'flop', deal: { community: 3 }, bet: true, fixedLimitTier: 'small' },
    {
      name: 'turn',
      deal: { community: 1 },
      draw: { min: 1, max: 1, replace: false },
      bet: true,
      fixedLimitTier: 'big',
    },
    { name: 'river', deal: { community: 1 }, bet: true, fixedLimitTier: 'big' },
  ],
  evaluate: (hole, board) => bestHand([...hole, ...board]),
  firstToAct: 'left-of-button',
};
