/**
 * The keys that work while a player draws or throws cards away: a digit picks
 * that card, counted left to right, the arrows move between the cards, Enter
 * draws, and Escape puts everything back. Pure, so it can be tested without
 * a page.
 */

export type DrawCommand =
  | { kind: 'toggle'; index: number }
  | { kind: 'move'; by: 1 | -1 }
  | { kind: 'confirm' }
  | { kind: 'clear' };

/**
 * What a key press asks of the draw, if anything. `cards` is how many cards
 * the hand shows. A press with Ctrl, Alt or the command key held is the
 * browser's or the system's, never the table's.
 */
export function drawCommandFor(e: KeyboardEvent, cards: number): DrawCommand | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (/^[1-9]$/.test(e.key)) {
    const index = Number(e.key) - 1;
    return index < cards ? { kind: 'toggle', index } : null;
  }
  switch (e.key) {
    case 'ArrowLeft': return { kind: 'move', by: -1 };
    case 'ArrowRight': return { kind: 'move', by: 1 };
    case 'Enter': return { kind: 'confirm' };
    case 'Escape':
    case 'Backspace': return { kind: 'clear' };
    default: return null;
  }
}

/** Where the arrows go from card `from`: along the hand, stopping at either end. */
export function stepCard(from: number, by: 1 | -1, cards: number): number {
  if (cards <= 0) return -1;
  if (from < 0) return by > 0 ? 0 : cards - 1;
  return Math.max(0, Math.min(cards - 1, from + by));
}
