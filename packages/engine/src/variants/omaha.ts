import { bestHandOmaha } from '../evaluator.js';
import type { VariantDefinition } from './types.js';

export const omaha: VariantDefinition = {
  id: 'omaha',
  name: 'Omaha',
  description: 'Four down cards, use exactly two of them with three from the board.',
  players: { min: 2, max: 10 },
  forcedBets: 'blinds',
  defaultBetting: 'pot-limit',
  streets: [
    { name: 'preflop', deal: { holeDown: 4 }, bet: true, fixedLimitTier: 'small' },
    { name: 'flop', deal: { community: 3 }, bet: true, fixedLimitTier: 'small' },
    { name: 'turn', deal: { community: 1 }, bet: true, fixedLimitTier: 'big' },
    { name: 'river', deal: { community: 1 }, bet: true, fixedLimitTier: 'big' },
  ],
  evaluate: (hole, board, isWild) => bestHandOmaha(hole, board, isWild),
  firstToAct: 'left-of-button',
};
