import { bestBadugi, bestDeuceSeven } from '../evaluator.js';
import type { StreetSpec, VariantDefinition } from './types.js';

/** A bet, then three draws with a bet after each: small bets for the first two rounds, big after. */
function tripleDraw(cards: number): StreetSpec[] {
  const draw = { min: 0, max: cards, replace: true };
  return [
    { name: 'predraw', deal: { holeDown: cards }, bet: true, fixedLimitTier: 'small' },
    { name: 'first-draw', deal: {}, draw, bet: true, fixedLimitTier: 'small' },
    { name: 'second-draw', deal: {}, draw, bet: true, fixedLimitTier: 'big' },
    { name: 'third-draw', deal: {}, draw, bet: true, fixedLimitTier: 'big' },
  ];
}

/**
 * 2-7 Triple Draw: five cards down and three draws, and the worst poker hand
 * wins. Aces are high, straights and flushes count against you, so 7-5-4-3-2
 * of mixed suits is the nuts. Six players at most, as in five-card draw: with
 * three draws the engine shuffles the discards back in when the deck runs out.
 */
export const draw27: VariantDefinition = {
  id: 'draw27',
  name: '2-7 Triple Draw',
  family: 'draw',
  description: 'Five down and three draws for the worst hand. Aces are high; straights and flushes count against you.',
  players: { min: 2, max: 6 },
  forcedBets: 'blinds',
  defaultBetting: 'fixed-limit',
  streets: tripleDraw(5),
  evaluate: (hole, _board, isWild) => bestDeuceSeven(hole, isWild),
  firstToAct: 'left-of-button',
  lowball: true,
};

/**
 * Badugi: four cards down and three draws, for four different suits and four
 * different ranks, aces low. A-2-3-4 of four suits is the nuts.
 */
export const badugi: VariantDefinition = {
  id: 'badugi',
  name: 'Badugi',
  family: 'draw',
  description: 'Four down and three draws, for four low cards of four different suits.',
  players: { min: 2, max: 6 },
  forcedBets: 'blinds',
  defaultBetting: 'fixed-limit',
  streets: tripleDraw(4),
  evaluate: (hole, _board, isWild) => bestBadugi(hole, isWild),
  firstToAct: 'left-of-button',
  lowball: true,
};
