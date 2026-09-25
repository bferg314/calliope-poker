import { registerVariant } from '../registry.js';
import { draw5 } from './draw5.js';
import { holdem } from './holdem.js';
import { omaha } from './omaha.js';
import { pineapple } from './pineapple.js';
import { stud5, stud7 } from './stud.js';
import { draw3, three } from './three.js';

export { draw3, draw5, holdem, omaha, pineapple, stud5, stud7, three };
export type { StreetSpec, VariantDefinition } from './types.js';

/** Registers the games that ship with Calliope, in the order the lobby lists them. */
export function registerBuiltinVariants(): void {
  for (const v of [holdem, omaha, pineapple, stud7, stud5, draw5, three, draw3]) registerVariant(v);
}
