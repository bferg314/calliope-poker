import { describe, expect, it } from 'vitest';
import { actionFor, DEFAULT_KEYS, presetOf, validKeys } from '../src/keys.js';

const press = (key: string, mods: Partial<KeyboardEvent> = {}) => ({ key, ctrlKey: false, altKey: false, metaKey: false, ...mods }) as KeyboardEvent;

describe('table keys', () => {
  it('start on F, C and R', () => {
    expect(DEFAULT_KEYS).toEqual({ fold: 'f', call: 'c', raise: 'r' });
    expect(presetOf(DEFAULT_KEYS)).toBe('fcr');
  });

  it('name the presets, and call anything else your own', () => {
    expect(presetOf({ fold: 'a', call: 's', raise: 'd' })).toBe('asd');
    expect(presetOf({ fold: 'j', call: 'k', raise: 'l' })).toBe('jkl');
    expect(presetOf({ fold: '1', call: '2', raise: '3' })).toBe('custom');
  });

  it('take three different letters or numbers, and nothing else', () => {
    expect(validKeys({ fold: 'q', call: 'w', raise: 'e' })).toBe(true);
    expect(validKeys({ fold: 'q', call: 'q', raise: 'e' })).toBe(false);
    expect(validKeys({ fold: ' ', call: 'w', raise: 'e' })).toBe(false);
    expect(validKeys({ fold: 'Enter', call: 'w', raise: 'e' })).toBe(false);
    expect(validKeys({ fold: 'q', call: 'w' })).toBe(false);
  });

  it('match a press whatever the case, but never with Ctrl, Alt or Cmd held', () => {
    const keys = { fold: 'a', call: 's', raise: 'd' };
    expect(actionFor(press('a'), keys)).toBe('fold');
    expect(actionFor(press('S'), keys)).toBe('call');
    expect(actionFor(press('d'), keys)).toBe('raise');
    expect(actionFor(press('f'), keys)).toBeNull();
    expect(actionFor(press('s', { ctrlKey: true }), keys)).toBeNull();
    expect(actionFor(press('d', { metaKey: true }), keys)).toBeNull();
  });
});
