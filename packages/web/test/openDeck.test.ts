import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cardCodeFor, checkOpenDeck, isImageRef, isSvg, pngSize, resolveImagePath } from '../src/openDeck.js';

// Two exports of the same deck: trimmed with transparent corners, and with a 2mm print bleed.
const fixture = (deck: string, file: string): URL => new URL(`fixtures/${deck}/${file}`, import.meta.url);
const classic = (deck = 'classic'): Record<string, unknown> => JSON.parse(readFileSync(fixture(deck, 'deck.json'), 'utf8'));
const png = (deck: string): Uint8Array => new Uint8Array(readFileSync(fixture(deck, 'spades-2.png')));

describe('checkOpenDeck', () => {
  it('maps the classic starter deck onto the 52 engine cards', () => {
    const check = checkOpenDeck(classic());
    if (!check.ok) throw new Error(check.error);
    expect(check.faces.size).toBe(52);
    expect(check.faces.get('Kh')).toEqual({ image: 'cards/hearts-K.png' });
    expect(check.faces.get('Ts')).toEqual({ image: 'cards/spades-10.png' });
    expect(check.faces.get('Ac')).toEqual({ image: 'cards/clubs-A.png' });
    expect(check.back).toEqual({ image: 'back.png' });
    expect(check.meta.id).toBe('81531664-def2-46a4-bbc9-3eae51c90855');
    expect(check.meta.license).toBe('CC0-1.0');
    expect(check.meta.geometry.aspect).toBeCloseTo(88.9 / 63.5);
    // This fixture predates indexHeightMm, so the legibility rule falls back to its default.
    expect(check.meta.geometry.index).toBeUndefined();
  });

  it('keeps the smallest corner index, so cards too small to read it are drawn as tiles', () => {
    const ranks = (classic().ranks as Record<string, unknown>[] | undefined) ?? [{ id: 'A' }, { id: 'K' }];
    const deck = { ...classic(), ranks: ranks.map((r, i) => ({ ...r, indexHeightMm: i === 0 ? 8.89 : 10 })) };
    const check = checkOpenDeck(deck);
    if (!check.ok) throw new Error(check.error);
    expect(check.meta.geometry.index).toBeCloseTo(0.1);
  });

  it('refuses what Calliope cannot deal from', () => {
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ ...classic(), format: 'something-else' }, /not an Open Playing Cards deck/],
      [{ ...classic(), version: 2 }, /version 2/],
      [{ ...classic(), deckType: undefined }, /french-52/],
      [{ ...classic(), cards: (classic().cards as unknown[]).slice(1) }, /51 of the 52/],
      [{ ...classic(), back: { image: '../../etc/passwd' } }, /no card back/],
    ];
    for (const [deck, error] of cases) {
      const check = checkOpenDeck(deck);
      expect(check.ok).toBe(false);
      if (!check.ok) expect(check.error).toMatch(error);
    }
  });

  it('falls back to the name for decks without a deckId', () => {
    const deck = classic();
    delete deck.deckId;
    const check = checkOpenDeck(deck);
    expect(check.ok && check.meta.id).toBe('name:Classic Deck');
  });

  it('keeps the first two jokers as *1 and *2, and leaves a third in the box', () => {
    const deck = classic();
    for (const n of [1, 2, 3]) {
      (deck.cards as unknown[]).push({ id: `joker-${n}`, kind: 'joker', suit: null, rank: null, image: `cards/joker-${n}.png` });
    }
    const check = checkOpenDeck(deck);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.faces.get('*1')).toEqual({ image: 'cards/joker-1.png' });
    expect(check.faces.get('*2')).toEqual({ image: 'cards/joker-2.png' });
    expect(check.faces.size).toBe(54);
  });

  it('is complete without jokers', () => {
    const check = checkOpenDeck(classic());
    expect(check.ok && check.faces.has('*1')).toBe(false);
  });
});

describe('helpers', () => {
  it('maps french-52 ids to engine codes', () => {
    expect(cardCodeFor('hearts', 'K')).toBe('Kh');
    expect(cardCodeFor('diamonds', '10')).toBe('Td');
    expect(cardCodeFor('stars', 'K')).toBeNull();
  });

  it('keeps image references inside the deck', () => {
    expect(isImageRef('cards/hearts-K.png')).toBe(true);
    expect(isImageRef('data:image/png;base64,AAAA')).toBe(true);
    expect(isImageRef('data:image/svg+xml;base64,AAAA')).toBe(false);
    expect(isImageRef('https://example.com/a.png')).toBe(false);
    expect(isImageRef('/abs.png')).toBe(false);
    expect(isImageRef('cards/../../x.png')).toBe(false);
    expect(resolveImagePath('my-deck/deck.json', './cards/a.png')).toBe('my-deck/cards/a.png');
    expect(resolveImagePath('deck.json', 'back.png')).toBe('back.png');
  });

  it('reads PNG size', () => {
    expect(pngSize(png('classic'))).toEqual({ width: 375, height: 525 });
    expect(pngSize(new Uint8Array(readFileSync(fixture('classic-vector', 'spades-2.svg'))))).toBeNull();
  });

  it('describes bleed in the geometry, to be cropped off on screen', () => {
    const check = checkOpenDeck(classic('classic-bleed'));
    if (!check.ok) throw new Error(check.error);
    const { geometry } = check.meta;
    expect(geometry.bleed).toBeCloseTo(2 / 63.5);
    expect(geometry.pixelWidth).toBe(399);
    expect(geometry.aspect).toBeCloseTo(88.9 / 63.5);
    expect(pngSize(png('classic-bleed'))).toEqual({ width: 399, height: 549 });
  });
});

describe('vector cards', () => {
  it('reads both pictures of each card, so a reader can prefer the SVG', () => {
    const check = checkOpenDeck(classic('classic-vector'));
    if (!check.ok) throw new Error(check.error);
    expect(check.faces.get('Kh')).toEqual({ image: 'cards/hearts-K.png', vector: 'cards/hearts-K.svg' });
    expect(check.back).toEqual({ image: 'back.png', vector: 'back.svg' });
  });

  it('accepts a vector-only deck, with no pixel size to state', () => {
    const deck = classic('classic-vector');
    const strip = (x: Record<string, unknown>): void => void delete x.image;
    (deck.cards as Record<string, unknown>[]).forEach(strip);
    strip(deck.back as Record<string, unknown>);
    const card = deck.card as Record<string, unknown>;
    delete card.imageWidth;
    delete card.imageHeight;
    const check = checkOpenDeck(deck);
    if (!check.ok) throw new Error(check.error);
    expect(check.faces.get('2s')).toEqual({ vector: 'cards/spades-2.svg' });
    expect(check.meta.geometry.pixelWidth).toBeUndefined();
  });

  it('refuses a card with no picture, or a picture of the wrong type', () => {
    const none = classic('classic-vector');
    const first = (none.cards as Record<string, unknown>[])[0]!;
    delete first.image;
    delete first.vector;
    expect(checkOpenDeck(none)).toMatchObject({ ok: false, error: expect.stringMatching(/no usable picture/) });

    const wrong = classic('classic-vector');
    (wrong.cards as Record<string, unknown>[])[0]!.vector = 'data:image/png;base64,AAAA';
    expect(checkOpenDeck(wrong)).toMatchObject({ ok: false, error: expect.stringMatching(/no usable picture/) });
  });

  it('recognises an SVG document', () => {
    const svg = new Uint8Array(readFileSync(fixture('classic-vector', 'spades-2.svg')));
    expect(isSvg(svg)).toBe(true);
    expect(isSvg(new TextEncoder().encode('<?xml version="1.0"?>\n<!-- made by hand -->\n<svg viewBox="0 0 1 1"/>'))).toBe(true);
    expect(isSvg(new TextEncoder().encode('<html><svg/></html>'))).toBe(false);
    expect(isSvg(new Uint8Array(readFileSync(fixture('classic-vector', 'spades-2.png'))))).toBe(false);
    expect(isImageRef('data:image/svg+xml;base64,AAAA', 'svg')).toBe(true);
    expect(isImageRef('data:image/svg+xml,%3Csvg%3E', 'svg')).toBe(true);
    expect(isImageRef('data:image/png;base64,AAAA', 'svg')).toBe(false);
  });
});
