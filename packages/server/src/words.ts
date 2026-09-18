import { randomInt } from 'node:crypto';
import { WORDS } from './wordlist.js';

const ADJECTIVES = [
  'Quiet', 'Brisk', 'Amber', 'Velvet', 'Sable', 'Copper', 'Marbled', 'Gilded', 'Lucky', 'Sly',
  'Steady', 'Wry', 'Bold', 'Calm', 'Dapper', 'Hasty', 'Jolly', 'Keen', 'Lofty', 'Merry',
  'Nimble', 'Plucky', 'Rusty', 'Salty', 'Tidy', 'Vivid', 'Witty', 'Zesty', 'Crisp', 'Dusky',
  'Early', 'Faded', 'Grand', 'Humble', 'Inky', 'Jaunty', 'Lanky', 'Mellow', 'Noble', 'Odd',
  'Proud', 'Quick', 'Rowdy', 'Snug', 'Tall', 'Upright', 'Vast', 'Warm', 'Young', 'Sturdy',
];

const NOUNS = [
  'Heron', 'Fox', 'Otter', 'Badger', 'Crane', 'Finch', 'Hare', 'Ibis', 'Jay', 'Kestrel',
  'Lark', 'Magpie', 'Newt', 'Osprey', 'Plover', 'Quail', 'Raven', 'Stoat', 'Tern', 'Vole',
  'Wren', 'Lynx', 'Moth', 'Pike', 'Rook', 'Swift', 'Toad', 'Weasel', 'Owl', 'Bear',
  'Wolf', 'Stag', 'Trout', 'Sparrow', 'Beetle', 'Hedgehog', 'Falcon', 'Marten', 'Grouse', 'Puffin',
];

const pick = <T>(xs: readonly T[]): T => xs[randomInt(xs.length)]!;

/** A friendly name for the evening, e.g. "Quiet Heron". */
export function randomUsername(): string {
  return `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
}

/** Five distinct words from the EFF short list. */
export function randomPhrase(): string[] {
  const words = new Set<string>();
  while (words.size < 5) words.add(pick(WORDS));
  return [...words];
}

export function normalizePhrase(words: readonly string[]): string[] {
  return words.map((w) => w.trim().toLowerCase());
}
