import { registerBuiltinVariants } from './variants/index.js';

registerBuiltinVariants();

export * from './cards.js';
export * from './evaluator.js';
export * from './betting.js';
export * from './pots.js';
export * from './registry.js';
export * from './table.js';
export * from './summary.js';
export * from './view.js';
export * from './types.js';
export { bluff, draw3, draw5, holdem, omaha, pineapple, stud5, stud7, three } from './variants/index.js';
export type { StreetSpec, VariantDefinition } from './variants/index.js';
