import { registerVariant } from '../registry.js';
import { draw5 } from './draw5.js';
import { holdem } from './holdem.js';
import { omaha } from './omaha.js';
import { pineapple } from './pineapple.js';
import { stud5, stud7 } from './stud.js';

export { draw5, holdem, omaha, pineapple, stud5, stud7 };
export type { StreetSpec, VariantDefinition } from './types.js';

/** Registers the games that ship with Calliope, in the order the lobby lists them. */
export function registerBuiltinVariants(): void {
  for (const v of [holdem, omaha, pineapple, stud7, stud5, draw5]) registerVariant(v);
}
