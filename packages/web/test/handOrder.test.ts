import { describe, expect, it } from 'vitest';
import { readingOrder } from '../src/handOrder.js';

describe('a winning hand in reading order', () => {
  it('puts the made part first, then the kickers, high to low', () => {
    expect(readingOrder(['8c', 'Ad', '8h', 'Jh', '8s'])).toEqual(['8c', '8h', '8s', 'Ad', 'Jh']);
  });

  it('reads a full house trips first and two pair high pair first', () => {
    expect(readingOrder(['3h', 'Kh', '3s', 'Kd', 'Ks'])).toEqual(['Kh', 'Kd', 'Ks', '3h', '3s']);
    expect(readingOrder(['4c', 'Qd', '9s', '4d', 'Qh'])).toEqual(['Qd', 'Qh', '4c', '4d', '9s']);
  });

  it('runs a straight down from the top', () => {
    expect(readingOrder(['5c', '9d', '7h', '6s', '8c'])).toEqual(['9d', '8c', '7h', '6s', '5c']);
  });

  it('sets wild cards and jokers at the end', () => {
    const deucesWild = (c: string): boolean => c.startsWith('2');
    expect(readingOrder(['2h', 'Ac', '*1', 'Ad', 'Kc'], deucesWild)).toEqual(['Ac', 'Ad', 'Kc', '2h', '*1']);
  });
});
