import { bestHand } from '../evaluator.js';
import type { VariantDefinition } from './types.js';

export const holdem: VariantDefinition = {
  id: 'holdem',
  name: "Texas Hold'em",
  family: 'community',
  description: 'Two down cards, five shared. The one everybody knows.',
  players: { min: 2, max: 10 },
  forcedBets: 'blinds',
  defaultBetting: 'no-limit',
  streets: [
    { name: 'preflop', deal: { holeDown: 2 }, bet: true, fixedLimitTier: 'small' },
    { name: 'flop', deal: { community: 3 }, bet: true, fixedLimitTier: 'small' },
    { name: 'turn', deal: { community: 1 }, bet: true, fixedLimitTier: 'big' },
    { name: 'river', deal: { community: 1 }, bet: true, fixedLimitTier: 'big' },
  ],
  evaluate: (hole, board, isWild) => bestHand([...hole, ...board], isWild),
  firstToAct: 'left-of-button',
};
