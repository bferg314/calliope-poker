/**
 * Moving focus with a D-pad: from where you are, to the nearest control in
 * the direction pressed. Pure geometry, so it can be tested without a page.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The index of the best box to move to, or -1 when nothing lies that way.
 *
 * A box counts as "that way" when its centre is past the current one's centre
 * in the direction pressed. Boxes in line with the current one (sharing its
 * row for left and right, its column for up and down) come first, so pressing
 * right on a button moves along its row even past something diagonally
 * nearer. Only when nothing is in line does the nearest box off the line win,
 * with distance across the direction counting double.
 */
export function pickNext(from: Box, boxes: readonly Box[], dir: Direction): number {
  const cx = (from.left + from.right) / 2;
  const cy = (from.top + from.bottom) / 2;
  const horizontal = dir === 'left' || dir === 'right';
  const sign = dir === 'right' || dir === 'down' ? 1 : -1;
  let best = -1;
  let bestScore = Infinity;
  let bestInLine = false;
  boxes.forEach((b, i) => {
    const bx = (b.left + b.right) / 2;
    const by = (b.top + b.bottom) / 2;
    const along = (horizontal ? bx - cx : by - cy) * sign;
    if (along <= 1) return;
    const overlaps = horizontal
      ? b.top < from.bottom - 1 && b.bottom > from.top + 1
      : b.left < from.right - 1 && b.right > from.left + 1;
    const across = overlaps ? 0 : Math.abs(horizontal ? by - cy : bx - cx);
    const score = along + across * 2;
    if (bestInLine && !overlaps) return;
    if ((overlaps && !bestInLine) || score < bestScore) { bestScore = score; best = i; bestInLine = overlaps; }
  });
  return best;
}
