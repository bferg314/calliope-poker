import { bestHand } from '../evaluator.js';
import type { VariantDefinition } from './types.js';

/**
 * Cincinnati: five hole cards and five shared, turned over one at a time with
 * a round of betting after each. Best five of all ten, so big hands are common.
 *
 * Capped at nine: ten players would need 55 cards.
 */
export const cincinnati: VariantDefinition = {
  id: 'cincinnati',
  name: 'Cincinnati',
  family: 'community',
  description: 'Five down cards, five shared turned one at a time. Best five of all ten.',
  players: { min: 2, max: 9 },
  forcedBets: 'blinds',
  defaultBetting: 'no-limit',
  streets: [
    { name: 'preflop', deal: { holeDown: 5 }, bet: true, fixedLimitTier: 'small' },
    { name: 'first shared card', deal: { community: 1 }, bet: true, fixedLimitTier: 'small' },
    { name: 'second shared card', deal: { community: 1 }, bet: true, fixedLimitTier: 'small' },
    { name: 'third shared card', deal: { community: 1 }, bet: true, fixedLimitTier: 'big' },
    { name: 'fourth shared card', deal: { community: 1 }, bet: true, fixedLimitTier: 'big' },
    { name: 'last shared card', deal: { community: 1 }, bet: true, fixedLimitTier: 'big' },
  ],
  evaluate: (hole, board, isWild) => bestHand([...hole, ...board], isWild),
  firstToAct: 'left-of-button',
};
