import { describe, expect, it } from 'vitest';
import { pickNext, type Box } from '../src/padNav.js';

const box = (left: number, top: number, w = 100, h = 40): Box => ({ left, top, right: left + w, bottom: top + h });

describe('moving focus with a D-pad', () => {
  // Three buttons in a row, as the action bar has, and a row under them.
  const row = [box(0, 0), box(110, 0), box(220, 0)];
  const under = [box(0, 60), box(110, 60), box(220, 60)];
  const all = [...row, ...under];

  it('moves along a row', () => {
    expect(pickNext(row[0]!, all, 'right')).toBe(1);
    expect(pickNext(row[1]!, all, 'right')).toBe(2);
    expect(pickNext(row[1]!, all, 'left')).toBe(0);
  });

  it('moves straight down and up a column', () => {
    expect(pickNext(row[1]!, all, 'down')).toBe(4);
    expect(pickNext(under[2]!, all, 'up')).toBe(2);
  });

  it('stays put at an edge', () => {
    expect(pickNext(row[2]!, all, 'right')).toBe(-1);
    expect(pickNext(row[0]!, all, 'up')).toBe(-1);
  });

  it('prefers the same row to something diagonally nearer', () => {
    const near = box(130, 45, 20, 20); // just below and right
    const far = box(400, 0); // same row, further
    expect(pickNext(row[0]!, [near, far], 'right')).toBe(1);
  });

  it('reaches a wide control below from any button above it', () => {
    const wide = box(0, 100, 320, 40);
    expect(pickNext(row[2]!, [...row, wide], 'down')).toBe(3);
  });
});
