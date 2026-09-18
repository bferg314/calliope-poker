import { bestHand } from '../evaluator.js';
import type { VariantDefinition } from './types.js';

export const stud7: VariantDefinition = {
  id: 'stud7',
  name: 'Seven-card Stud',
  description: 'Two down, four up, one down. Antes and a bring-in, no board.',
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
  evaluate: (hole, board) => bestHand([...hole, ...board]),
  firstToAct: 'best-showing',
};

export const stud5: VariantDefinition = {
  id: 'stud5',
  name: 'Five-card Stud',
  description: 'One down, four up. The old one from the westerns.',
  players: { min: 2, max: 10 },
  forcedBets: 'antes-bringin',
  defaultBetting: 'fixed-limit',
  streets: [
    { name: 'second', deal: { holeDown: 1, holeUp: 1 }, bet: true, fixedLimitTier: 'small' },
    { name: 'third', deal: { holeUp: 1 }, bet: true, fixedLimitTier: 'small' },
    { name: 'fourth', deal: { holeUp: 1 }, bet: true, fixedLimitTier: 'big' },
    { name: 'fifth', deal: { holeUp: 1 }, bet: true, fixedLimitTier: 'big' },
  ],
  evaluate: (hole, board) => bestHand([...hole, ...board]),
  firstToAct: 'best-showing',
};
