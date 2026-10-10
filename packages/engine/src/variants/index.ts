import { registerVariant } from '../registry.js';
import { atomic } from './atomic.js';
import { cincinnati } from './cincinnati.js';
import { draw5 } from './draw5.js';
import { holdem } from './holdem.js';
import { omaha } from './omaha.js';
import { pineapple } from './pineapple.js';
import { razz } from './razz.js';
import { stud5, stud7 } from './stud.js';
import { draw3, three } from './three.js';
import { bluff } from './bluff.js';

export { atomic, bluff, cincinnati, draw3, draw5, holdem, omaha, pineapple, razz, stud5, stud7, three };
export type { StreetSpec, VariantDefinition } from './types.js';

/** Registers the games that ship with Calliope, in the order the lobby lists them. */
export function registerBuiltinVariants(): void {
  for (const v of [holdem, omaha, pineapple, atomic, cincinnati, stud7, razz, stud5, draw5, three, draw3, bluff]) registerVariant(v);
}
