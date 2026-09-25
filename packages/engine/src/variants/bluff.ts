import { evaluateCards } from '../evaluator.js';
import type { VariantDefinition } from './types.js';

/**
 * Blind Man's Bluff, or Indian poker: one card each, held to the forehead, so
 * everyone can see it but you. One round of betting on what the others'
 * cards say about yours, then the highest card wins. Aces are high, suits do
 * not count, and a tie splits the pot.
 *
 * The card is dealt face up; `ownUpCardsHidden` keeps it out of its owner's
 * view until the showdown.
 */
export const bluff: VariantDefinition = {
  id: 'bluff',
  name: "Blind Man's Bluff",
  description: 'One card each, on your forehead: everyone sees it but you. High card wins.',
  players: { min: 2, max: 10 },
  forcedBets: 'blinds',
  defaultBetting: 'no-limit',
  streets: [
    { name: 'first', deal: { holeUp: 1 }, bet: true, fixedLimitTier: 'small' },
  ],
  evaluate: (hole) => evaluateCards(hole),
  firstToAct: 'left-of-button',
  ownUpCardsHidden: true,
};
