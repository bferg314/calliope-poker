/**
 * Reading Open Playing Cards decks, the format Card Atelier exports
 * (https://github.com/bferg314/card-atelier/blob/main/docs/open-playing-cards.md).
 *
 * No DOM here: the build uses this to check the starter decks under public/decks,
 * and the browser uses it to check a deck a player imports.
 */
import type { Card, Suit } from '@calliope/engine';

export interface OpenDeckCard {
  id: string;
  kind: 'standard' | 'joker';
  suit: string | null;
  rank: string | null;
  label: string;
  name: string;
  color: string;
  image?: string;
  vector?: string;
}

export interface OpenDeck {
  format: 'open-playing-cards';
  version: 1;
  deckId?: string;
  contentHash?: string;
  deckType?: string;
  name: string;
  author?: string;
  description?: string;
  license?: string;
  source?: string;
  card: {
    widthMm: number;
    heightMm: number;
    cornerRadiusMm: number;
    bleedMm?: number;
    imageWidth?: number;
    imageHeight?: number;
    dpi?: number;
  };
  suits: { id: string; name: string; symbol: string; color: string }[];
  back: { image?: string; vector?: string };
  cards: OpenDeckCard[];
}

/** How a deck's images sit in a card box, as fractions of the trimmed card width. */
export interface DeckGeometry {
  /** Trimmed height over trimmed width. */
  aspect: number;
  /** Corner radius. */
  radius: number;
  /** Bleed on each side, to be cropped off on screen. */
  bleed: number;
  /** Pixel width of every PNG, bleed included. */
  pixelWidth?: number;
  /**
   * The smallest corner index, as a fraction of the trimmed card height, from
   * the ranks' `indexHeightMm`. Absent when the deck does not say.
   */
  index?: number;
}

/** The facts Calliope keeps about a deck, without its images. */
export interface DeckMeta {
  id: string;
  name: string;
  author?: string;
  license?: string;
  source?: string;
  contentHash?: string;
  geometry: DeckGeometry;
}

/** A card's pictures as the file references them: a PNG, an SVG, or both. */
export interface PictureRefs {
  image?: string;
  vector?: string;
}

/** The one picture a card is drawn from. Vector when the deck has it: sharp at any size. */
export interface Picture {
  src: string;
  vector: boolean;
}

/** A deck shipped under public/decks, as the build hands it to the app. Paths are relative to the site root. */
export interface StarterDeck {
  meta: DeckMeta;
  back: Picture;
  faces: Record<Card, Picture>;
}

export type DeckCheck =
  | {
      ok: true;
      deck: OpenDeck;
      meta: DeckMeta;
      /** Picture references for each engine card code, as written in the file. */
      faces: Map<Card, PictureRefs>;
      back: PictureRefs;
    }
  | { ok: false; error: string };

/** The well-known ids of a french-52 deck, mapped to the engine's card codes. */
const SUIT_CODE: Record<string, Suit> = { spades: 's', hearts: 'h', diamonds: 'd', clubs: 'c' };
const RANK_CODE: Record<string, string> = {
  A: 'A', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', '10': 'T', J: 'J', Q: 'Q', K: 'K',
};

/** Map a french-52 card to its engine code: hearts-K → Kh, spades-10 → Ts. */
export function cardCodeFor(suit: string, rank: string): Card | null {
  const s = SUIT_CODE[suit];
  const r = RANK_CODE[rank];
  return s && r ? `${r}${s}` : null;
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function positive(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x > 0;
}

function optionalString(x: unknown): string | undefined {
  return typeof x === 'string' && x.trim() ? x.trim() : undefined;
}

/** A data: URI of the right type, or a path inside the deck's own folder. Nothing that reaches outside it. */
export function isImageRef(ref: unknown, kind: 'png' | 'svg' = 'png'): ref is string {
  if (typeof ref !== 'string' || !ref) return false;
  if (ref.startsWith('data:')) return kind === 'png' ? ref.startsWith('data:image/png;base64,') : /^data:image\/svg\+xml[;,]/.test(ref);
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('/') || ref.startsWith('\\')) return false;
  return !ref.split(/[\\/]/).some((part) => part === '..');
}

/** A card's usable pictures; null when it has neither, 'bad' when one is present but malformed. */
function pictureRefs(x: Record<string, unknown>): PictureRefs | null | 'bad' {
  const refs: PictureRefs = {};
  if (x.image !== undefined && x.image !== null) {
    if (!isImageRef(x.image, 'png')) return 'bad';
    refs.image = x.image;
  }
  if (x.vector !== undefined && x.vector !== null) {
    if (!isImageRef(x.vector, 'svg')) return 'bad';
    refs.vector = x.vector;
  }
  return refs.image || refs.vector ? refs : null;
}

/** Whether bytes look like an SVG document: an <svg> root, after any XML declaration, comments or doctype. */
export function isSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, 1024)).replace(/^﻿/, '');
  return /^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head);
}

/** Check a parsed deck file and map it onto the 52 cards Calliope deals. */
export function checkOpenDeck(raw: unknown): DeckCheck {
  if (!isObject(raw) || raw.format !== 'open-playing-cards') {
    return { ok: false, error: 'This is not an Open Playing Cards deck.' };
  }
  if (raw.version !== 1) {
    return { ok: false, error: `This deck uses version ${String(raw.version)} of the format, which Calliope cannot read yet.` };
  }
  if (raw.deckType !== 'french-52') {
    return { ok: false, error: 'Calliope needs a standard 52-card deck (deckType "french-52").' };
  }
  const card = raw.card;
  if (!isObject(card) || !positive(card.widthMm) || !positive(card.heightMm)) {
    return { ok: false, error: 'The deck does not say how big its cards are.' };
  }
  const bleedMm = typeof card.bleedMm === 'number' && card.bleedMm > 0 ? card.bleedMm : 0;
  const cornerMm = typeof card.cornerRadiusMm === 'number' && card.cornerRadiusMm > 0 ? card.cornerRadiusMm : 0;
  const back = isObject(raw.back) ? pictureRefs(raw.back) : null;
  if (!back || back === 'bad') {
    return { ok: false, error: 'The deck has no card back.' };
  }
  if (!Array.isArray(raw.cards)) {
    return { ok: false, error: 'The deck has no cards.' };
  }

  const faces = new Map<Card, PictureRefs>();
  for (const c of raw.cards) {
    if (!isObject(c) || c.kind !== 'standard') continue; // jokers are not dealt
    const code = typeof c.suit === 'string' && typeof c.rank === 'string' ? cardCodeFor(c.suit, c.rank) : null;
    if (!code) return { ok: false, error: `Card ${String(c.id)} is not part of a standard deck.` };
    if (faces.has(code)) return { ok: false, error: `Card ${String(c.id)} appears twice.` };
    const refs = pictureRefs(c);
    if (!refs || refs === 'bad') return { ok: false, error: `Card ${String(c.id)} has no usable picture.` };
    faces.set(code, refs);
  }
  const hasPng = back.image !== undefined || [...faces.values()].some((f) => f.image !== undefined);
  if (hasPng && (!positive(card.imageWidth) || !positive(card.imageHeight))) {
    return { ok: false, error: 'The deck does not say how many pixels its PNGs are.' };
  }
  if (faces.size !== 52) {
    return { ok: false, error: `The deck has ${faces.size} of the 52 standard cards.` };
  }

  const indexHeights = (Array.isArray(raw.ranks) ? raw.ranks : [])
    .map((r) => (isObject(r) && positive(r.indexHeightMm) ? r.indexHeightMm : null))
    .filter((h): h is number => h !== null);

  const name = optionalString(raw.name) ?? 'Untitled deck';
  const contentHash = optionalString(raw.contentHash);
  const meta: DeckMeta = {
    // Original v1 files have no deckId; the name is the best identity they offer.
    id: optionalString(raw.deckId) ?? `name:${name}`,
    name,
    author: optionalString(raw.author),
    license: optionalString(raw.license),
    source: optionalString(raw.source),
    contentHash,
    geometry: {
      aspect: card.heightMm / card.widthMm,
      radius: cornerMm / card.widthMm,
      bleed: bleedMm / card.widthMm,
      ...(positive(card.imageWidth) ? { pixelWidth: card.imageWidth } : {}),
      ...(indexHeights.length ? { index: Math.min(...indexHeights) / card.heightMm } : {}),
    },
  };
  return { ok: true, deck: raw as unknown as OpenDeck, meta, faces, back };
}

/** Width and height from a PNG's header, or null when the bytes are not a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Resolve an image path against the folder of the deck's JSON, as a zip entry name. */
export function resolveImagePath(jsonPath: string, ref: string): string {
  const dir = jsonPath.includes('/') ? jsonPath.slice(0, jsonPath.lastIndexOf('/') + 1) : '';
  return (dir + ref.replace(/\\/g, '/')).replace(/(^|\/)\.\//g, '$1');
}
