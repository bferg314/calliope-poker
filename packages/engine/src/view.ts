import type { Card } from './cards.js';
import { getVariant, hasVariant } from './registry.js';
import type { HandPlayer, HandState, SeatIndex, TableState } from './types.js';
import { clone } from './util.js';

/** A hand player as seen by one viewer: hidden cards are null. */
export interface HandPlayerView extends Omit<HandPlayer, 'holeDown' | 'holeUp'> {
  holeDown: (Card | null)[];
  /** Null only for the viewer's own up cards in a game that hides them from their owner. */
  holeUp: (Card | null)[];
}

export interface HandView extends Omit<HandState, 'deck' | 'players'> {
  deckRemaining: number;
  players: (HandPlayerView | null)[];
}

export interface TableView extends Omit<TableState, 'hand'> {
  hand: HandView | null;
  /** The viewer's seat, or null for spectators. */
  viewerSeat: SeatIndex | null;
}

/**
 * Redact the table for one viewer. The deck is removed and other players' face-down
 * cards are hidden unless they have been revealed. In a game whose up cards are
 * hidden from their owner (Blind Man's Bluff), the viewer's own up cards are
 * hidden too, until the showdown. Pass null for a spectator.
 */
export function viewFor(state: TableState, viewerPlayerId: string | null): TableView {
  const viewerSeat = state.seats.findIndex((s) => s !== null && s.playerId === viewerPlayerId);
  const { hand, ...rest } = state;
  if (!hand) return { ...clone(rest), hand: null, viewerSeat: viewerSeat === -1 ? null : viewerSeat };
  const { deck, players, ...handRest } = hand;
  const ownUpHidden = hasVariant(hand.variantId) && !!getVariant(hand.variantId).ownUpCardsHidden;
  const view: HandView = {
    ...clone(handRest),
    deckRemaining: deck.length,
    players: players.map((p) => {
      if (!p) return null;
      const mine = viewerPlayerId !== null && p.playerId === viewerPlayerId;
      const { holeDown, holeUp, ...pr } = p;
      return {
        ...clone(pr),
        holeDown: mine || p.revealed ? [...holeDown] : holeDown.map(() => null),
        holeUp: mine && ownUpHidden && !p.revealed ? holeUp.map(() => null) : [...holeUp],
      };
    }),
  };
  return { ...clone(rest), hand: view, viewerSeat: viewerSeat === -1 ? null : viewerSeat };
}
