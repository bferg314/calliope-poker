import { describe, expect, it } from 'vitest';
import { evaluateCards, evaluateThree, listVariants } from '@calliope/engine';
import { FIVE_CARD_RANKS, GUIDES, THREE_CARD_RANKS } from '../src/guides.js';

describe('how to play', () => {
  it('has a guide for every game the server can deal', () => {
    for (const v of listVariants()) expect(GUIDES[v.id], v.id).toBeDefined();
  });

  it('shows each hand with cards that really make it, best first', () => {
    const natural = FIVE_CARD_RANKS.filter((r) => !r.wildOnly);
    let last = Infinity;
    for (const r of natural) {
      const h = evaluateCards(r.example);
      expect(h.label.startsWith(r.name) || (r.name === 'High card' && h.label.endsWith('high')), `${r.name}: ${h.label}`).toBe(true);
      expect(h.value).toBeLessThan(last);
      last = h.value;
    }
    last = Infinity;
    for (const r of THREE_CARD_RANKS) {
      const h = evaluateThree(r.example);
      expect(h.value, r.name).toBeLessThan(last);
      last = h.value;
    }
  });
});
