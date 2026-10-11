import { describe, expect, it } from 'vitest';
import { drawCommandFor, stepCard } from '../src/drawKeys.js';

const press = (key: string, mods: Partial<KeyboardEvent> = {}) => ({ key, ctrlKey: false, altKey: false, metaKey: false, ...mods }) as KeyboardEvent;

describe('draw keys', () => {
  it('pick a card by its place in the hand, counting from one', () => {
    expect(drawCommandFor(press('1'), 5)).toEqual({ kind: 'toggle', index: 0 });
    expect(drawCommandFor(press('4'), 4)).toEqual({ kind: 'toggle', index: 3 });
  });

  it('ignore a digit past the last card, and zero', () => {
    expect(drawCommandFor(press('5'), 4)).toBeNull();
    expect(drawCommandFor(press('0'), 5)).toBeNull();
  });

  it('walk the hand with the arrows, draw on Enter and put back on Escape', () => {
    expect(drawCommandFor(press('ArrowLeft'), 5)).toEqual({ kind: 'move', by: -1 });
    expect(drawCommandFor(press('ArrowRight'), 5)).toEqual({ kind: 'move', by: 1 });
    expect(drawCommandFor(press('Enter'), 5)).toEqual({ kind: 'confirm' });
    expect(drawCommandFor(press('Escape'), 5)).toEqual({ kind: 'clear' });
    expect(drawCommandFor(press('Backspace'), 5)).toEqual({ kind: 'clear' });
  });

  it('leave Ctrl, Alt and Cmd presses, and other keys, to the browser', () => {
    expect(drawCommandFor(press('1', { ctrlKey: true }), 5)).toBeNull();
    expect(drawCommandFor(press('Enter', { altKey: true }), 5)).toBeNull();
    expect(drawCommandFor(press('ArrowRight', { metaKey: true }), 5)).toBeNull();
    expect(drawCommandFor(press('f'), 5)).toBeNull();
    expect(drawCommandFor(press(' '), 5)).toBeNull();
  });

  it('step along the hand and stop at either end', () => {
    expect(stepCard(1, 1, 4)).toBe(2);
    expect(stepCard(3, 1, 4)).toBe(3);
    expect(stepCard(0, -1, 4)).toBe(0);
  });

  it('start from an end when no card has focus yet', () => {
    expect(stepCard(-1, 1, 4)).toBe(0);
    expect(stepCard(-1, -1, 4)).toBe(3);
    expect(stepCard(-1, 1, 0)).toBe(-1);
  });
});
