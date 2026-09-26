import type { Card } from '../cards.js';
import type { HandRank } from '../evaluator.js';
import type { WildTest } from '../wild.js';
import type { BettingStructure } from '../types.js';

export interface StreetSpec {
  /** Short name for logs and effects: 'preflop', 'flop', 'third', and so on. */
  name: string;
  deal: {
    /** Face-down cards dealt to each player. */
    holeDown?: number;
    /** Face-up cards dealt to each player. */
    holeUp?: number;
    /** Shared cards dealt to the board. */
    community?: number;
  };
  /**
   * Players throw cards away at the start of this street, before anything is
   * dealt. Pineapple throws exactly one away and gets nothing back; draw poker
   * throws up to five and is dealt that many replacements.
   */
  draw?: {
    min: number;
    max: number;
    /** Deal a replacement for each card thrown away. */
    replace: boolean;
  };
  /** Whether a betting round follows the deal. */
  bet: boolean;
  /** Which fixed-limit bet size applies on this street. */
  fixedLimitTier: 'small' | 'big';
}

export type VariantFamily = 'community' | 'stud' | 'draw' | 'other';

export interface VariantDefinition {
  id: string;
  name: string;
  /** The kind of game, which the dealer's-choice picker groups by. */
  family: VariantFamily;
  description: string;
  players: { min: number; max: number };
  forcedBets: 'blinds' | 'antes-bringin';
  defaultBetting: BettingStructure;
  streets: StreetSpec[];
  /** Best hand from a player's cards (down + up) and the board, with any wild cards. */
  evaluate: (hole: readonly Card[], board: readonly Card[], isWild?: WildTest) => HandRank;
  /**
   * Who opens betting on streets after the first.
   * 'left-of-button' for blind games, 'best-showing' for stud.
   */
  firstToAct: 'left-of-button' | 'best-showing';
  /**
   * Blind Man's Bluff: face-up cards are shown to everyone except the player
   * holding them, until the showdown. The cards are dealt as ordinary up cards;
   * only the view each player is sent changes (see viewFor).
   */
  ownUpCardsHidden?: boolean;
}
