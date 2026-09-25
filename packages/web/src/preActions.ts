import type { Action, LegalActions } from '@calliope/engine';

/**
 * Acting before your turn. While someone else is deciding, a player can set
 * what they will do when the action reaches them. Everything here is decided
 * in the browser: when the turn arrives the action is sent like any other, so
 * the server never holds an intention a player might have changed their mind
 * about.
 *
 * Only a choice that still means what it meant when it was made is carried
 * out. "Check / fold" always does: it checks if it can and folds if not. A
 * call or a raise was made at a price, and if anyone bets or raises in the
 * meantime the price has changed, so the choice is dropped and the player
 * decides again.
 */

export type PreKind = 'check-fold' | 'call' | 'raise';

/** Where a waiting player stands: the street they are on and what it would cost them now. */
export interface Ahead {
  /** Hand number and street: a choice lasts one street of one hand. */
  key: string;
  /** Chips needed to match the bet, as things stand. */
  toCall: number;
  /** Whether the first bet on the street would be theirs, or a raise. */
  raiseKind: 'bet' | 'raise';
  /** Whether they have chips beyond the call, and so could raise at all. */
  canRaise: boolean;
}

export interface Armed {
  kind: PreKind;
  key: string;
  toCall: number;
}

export function arm(kind: PreKind, ahead: Ahead): Armed {
  return { kind, key: ahead.key, toCall: ahead.toCall };
}

/** Whether a choice still stands as the table moves on around the player. */
export function stillArmed(armed: Armed, ahead: Ahead | null): boolean {
  if (!ahead || ahead.key !== armed.key) return false;
  return armed.kind === 'check-fold' || ahead.toCall === armed.toCall;
}

/**
 * What a choice comes to now that it is the player's turn, or null when it no
 * longer stands and the player must decide for themselves.
 */
export function resolve(armed: Armed, key: string, legal: LegalActions): Action | null {
  if (armed.key !== key) return null;
  if (armed.kind === 'check-fold') return legal.canCheck ? { type: 'check' } : { type: 'fold' };
  if (legal.toCall !== armed.toCall) return null;
  if (armed.kind === 'call') return legal.canCheck ? { type: 'check' } : { type: 'call' };
  return legal.raise ? { type: legal.raise.kind, to: legal.raise.min } : null;
}
