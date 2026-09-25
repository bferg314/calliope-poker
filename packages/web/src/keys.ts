/**
 * The keys that act at the table: fold, check or call, and bet or raise.
 * Stored per device in `localStorage`, like the theme: the keyboard is the
 * device's, not the player's.
 */

export type TableAction = 'fold' | 'call' | 'raise';
export type KeyMap = Record<TableAction, string>;

export const PRESETS: readonly { id: string; keys: KeyMap }[] = [
  { id: 'fcr', keys: { fold: 'f', call: 'c', raise: 'r' } },
  { id: 'asd', keys: { fold: 'a', call: 's', raise: 'd' } },
  { id: 'jkl', keys: { fold: 'j', call: 'k', raise: 'l' } },
];

export const DEFAULT_KEYS: KeyMap = PRESETS[0]!.keys;

const STORE = 'calliope.keys';

/** A key a player may give an action: one letter or digit. */
export function isActionKey(k: string): boolean {
  return /^[a-z0-9]$/.test(k);
}

/** Three keys, each usable, none the same. */
export function validKeys(k: Partial<KeyMap> | null | undefined): k is KeyMap {
  if (!k || typeof k !== 'object') return false;
  const all = [k.fold, k.call, k.raise];
  return all.every((x) => typeof x === 'string' && isActionKey(x)) && new Set(all).size === 3;
}

export function currentKeys(): KeyMap {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Partial<KeyMap> | null;
    return validKeys(stored) ? stored : DEFAULT_KEYS;
  } catch {
    return DEFAULT_KEYS; // private mode, or something unreadable
  }
}

export function setKeys(k: KeyMap): void {
  if (!validKeys(k)) return;
  try {
    localStorage.setItem(STORE, JSON.stringify(k));
  } catch {
    /* private mode: the choice lasts this page only */
  }
}

/** Which preset a map is, or 'custom'. */
export function presetOf(k: KeyMap): string {
  return PRESETS.find((p) => p.keys.fold === k.fold && p.keys.call === k.call && p.keys.raise === k.raise)?.id ?? 'custom';
}

/**
 * The action a key press asks for, if any. A press with Ctrl, Alt or the
 * command key held is the browser's or the system's, never the table's.
 */
export function actionFor(e: KeyboardEvent, keys: KeyMap): TableAction | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  const k = e.key.toLowerCase();
  if (k === keys.fold) return 'fold';
  if (k === keys.call) return 'call';
  if (k === keys.raise) return 'raise';
  return null;
}
