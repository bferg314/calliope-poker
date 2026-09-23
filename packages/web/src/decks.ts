import { useSyncExternalStore } from 'react';
import { unzipSync } from 'fflate';
import type { Card } from '@calliope/engine';
import starters from 'virtual:starter-decks';
import { dropRenditions } from './renditions.js';
import { checkOpenDeck, isSvg, pngSize, resolveImagePath, type DeckMeta, type Picture, type PictureRefs } from './openDeck.js';

/**
 * The deck the player draws cards with. Starter decks ship under public/decks and are
 * served as plain files; decks a player imports live in IndexedDB as blobs and are drawn
 * from object URLs made once when the deck is chosen. A card is drawn from its SVG when
 * the deck has one, its PNG otherwise. The choice is local to
 * the device, like the table theme.
 */

/** What a card needs to draw itself from a deck. */
export interface DeckArt {
  meta: DeckMeta;
  back: Picture;
  faces: ReadonlyMap<Card, Picture>;
}

export interface DeckListing {
  meta: DeckMeta;
  origin: 'starter' | 'imported';
}

interface DecksState {
  list: DeckListing[];
  activeId: string;
  /** Null while an imported deck loads, or when it could not be read. */
  active: DeckArt | null;
}

interface StoredMeta {
  id: string;
  meta: DeckMeta;
  importedAt: number;
}

/** The picture each card is drawn from; an SVG blob has type image/svg+xml. */
interface StoredArt {
  id: string;
  back: Blob;
  faces: Record<Card, Blob>;
}

const SVG_TYPE = 'image/svg+xml';

const PREF = 'calliope.deck';
const DB_NAME = 'calliope-decks';
const MAX_IMPORT_BYTES = 64 * 1024 * 1024;

const starterArt = new Map<string, DeckArt>(
  starters.map((d) => [
    d.meta.id,
    {
      meta: d.meta,
      back: atBase(d.back),
      faces: new Map(Object.entries(d.faces).map(([code, picture]) => [code, atBase(picture)])),
    },
  ]),
);
const DEFAULT_ID = starters[0]!.meta.id;

function atBase(picture: Picture): Picture {
  return { ...picture, src: import.meta.env.BASE_URL + picture.src };
}

let imported: StoredMeta[] = [];
const preferred = storedPreference();
// A starter deck draws from the first render; an imported one arrives once initDecks has read it.
let state: DecksState = { list: listing(), activeId: preferred, active: starterArt.get(preferred) ?? null };
/** Object URLs behind the active imported deck, revoked when it is replaced. */
let activeUrls: string[] = [];
const listeners = new Set<() => void>();

function publish(next: Partial<DecksState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDecks(): DecksState {
  return useSyncExternalStore(subscribe, () => state);
}

export function useActiveDeck(): DeckArt | null {
  return useSyncExternalStore(subscribe, () => state.active);
}

function storedPreference(): string {
  try {
    return localStorage.getItem(PREF) ?? DEFAULT_ID;
  } catch {
    return DEFAULT_ID;
  }
}

/** Imported decks first replace a starter with the same id: an edited copy of a starter deck wins. */
function listing(): DeckListing[] {
  const mine = new Set(imported.map((d) => d.id));
  return [
    ...starters.filter((d) => !mine.has(d.meta.id)).map((d) => ({ meta: d.meta, origin: 'starter' as const })),
    ...[...imported].sort((a, b) => b.importedAt - a.importedAt).map((d) => ({ meta: d.meta, origin: 'imported' as const })),
  ];
}

/** Read the imported decks and load the preferred deck. Called once at start-up. */
export async function initDecks(): Promise<void> {
  try {
    imported = await readAll<StoredMeta>('meta');
  } catch (err) {
    console.warn('Could not read imported decks', err);
    imported = [];
  }
  publish({ list: listing() });
  await selectDeck(state.activeId, { remember: false });
}

/** Make a deck the one cards are drawn with. Falls back to the default deck if it is gone. */
export async function selectDeck(id: string, { remember = true } = {}): Promise<void> {
  if (remember) {
    try {
      localStorage.setItem(PREF, id);
    } catch {
      /* private mode */
    }
  }
  const mine = imported.some((d) => d.id === id);
  if (!mine) {
    const art = starterArt.get(id) ?? starterArt.get(DEFAULT_ID)!;
    swapActive(art.meta.id, art, []);
    warm(art);
    return;
  }
  if (state.activeId !== id) publish({ activeId: id });
  try {
    const stored = await readOne<StoredArt>('art', id);
    if (!stored) throw new Error('missing art');
    if (state.activeId !== id) return; // chosen something else meanwhile
    const urls: string[] = [];
    const url = (blob: Blob): Picture => {
      const u = URL.createObjectURL(blob);
      urls.push(u);
      return { src: u, vector: blob.type === SVG_TYPE };
    };
    const faces = new Map(Object.entries(stored.faces).map(([code, blob]) => [code, url(blob)]));
    const meta = imported.find((d) => d.id === id)!.meta;
    swapActive(id, { meta, back: url(stored.back), faces }, urls);
  } catch (err) {
    console.warn(`Could not load deck ${id}`, err);
    if (state.activeId === id) await selectDeck(DEFAULT_ID, { remember: false });
  }
}

function swapActive(id: string, art: DeckArt, urls: string[]): void {
  const old = activeUrls;
  activeUrls = urls;
  publish({ activeId: id, active: art });
  // Cards re-render with the new URLs first; only then let the old ones go.
  setTimeout(() => {
    dropRenditions(old);
    old.forEach((u) => URL.revokeObjectURL(u));
  }, 1000);
}

/** Fetch a starter deck's images ahead of the first deal, so cards never pop in. */
function warm(art: DeckArt): void {
  const load = (): void => {
    for (const picture of [art.back, ...art.faces.values()]) {
      const img = new Image();
      img.decoding = 'async';
      img.src = picture.src;
    }
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(load, { timeout: 3000 });
  else setTimeout(load, 500);
}

/** Back and ace of spades for a picker swatch. The caller revokes the URLs it gets for imported decks. */
export async function previewArt(listing: DeckListing): Promise<{ back: Picture; ace: Picture; revoke: () => void }> {
  if (listing.origin === 'starter') {
    const art = starterArt.get(listing.meta.id)!;
    return { back: art.back, ace: art.faces.get('As')!, revoke: () => {} };
  }
  const stored = await readOne<StoredArt>('art', listing.meta.id);
  if (!stored) throw new Error('missing art');
  const back = URL.createObjectURL(stored.back);
  const ace = URL.createObjectURL(stored.faces.As!);
  return {
    back: { src: back, vector: stored.back.type === SVG_TYPE },
    ace: { src: ace, vector: stored.faces.As!.type === SVG_TYPE },
    revoke: () => {
      URL.revokeObjectURL(back);
      URL.revokeObjectURL(ace);
    },
  };
}

export class DeckImportError extends Error {}

export interface ImportResult {
  name: string;
  outcome: 'added' | 'updated' | 'unchanged';
}

/**
 * Import an Open Playing Cards deck, either the single .cards.json with embedded images
 * or the .zip with the images as files. The deck becomes the active one.
 */
export async function importDeck(file: File): Promise<ImportResult> {
  if (file.size > MAX_IMPORT_BYTES) throw new DeckImportError('That file is too large to be a deck.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;

  let raw: unknown;
  let image: (ref: string) => Uint8Array;
  if (isZip) {
    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(bytes, { filter: (f) => !f.name.startsWith('__MACOSX/') });
    } catch {
      throw new DeckImportError('That zip could not be opened.');
    }
    const jsonPath = Object.keys(entries)
      .filter((n) => n.toLowerCase().endsWith('.json'))
      .sort((a, b) => depth(a) - depth(b) || Number(!a.endsWith('deck.json')) - Number(!b.endsWith('deck.json')))[0];
    if (!jsonPath) throw new DeckImportError('The zip has no deck file in it.');
    raw = parseJson(new TextDecoder().decode(entries[jsonPath]));
    image = (ref) => {
      if (ref.startsWith('data:')) return dataUriBytes(ref);
      const path = resolveImagePath(jsonPath, ref);
      const found = entries[path];
      if (!found) throw new DeckImportError(`The zip is missing ${path}.`);
      return found;
    };
  } else {
    raw = parseJson(new TextDecoder().decode(bytes));
    image = (ref) => {
      if (!ref.startsWith('data:')) throw new DeckImportError('This deck keeps its pictures in separate files. Import the .zip export instead.');
      return dataUriBytes(ref);
    };
  }

  const check = checkOpenDeck(raw);
  if (!check.ok) throw new DeckImportError(check.error);
  const { meta, deck } = check;
  const png = (ref: string, what: string): Uint8Array => {
    const data = image(ref);
    const size = pngSize(data);
    if (!size || size.width !== deck.card.imageWidth || size.height !== deck.card.imageHeight) {
      throw new DeckImportError(`The picture for ${what} is not a ${deck.card.imageWidth}×${deck.card.imageHeight} PNG.`);
    }
    return data;
  };
  /** Keep one picture per card: the vector when there is one, since it is sharp at any size and smaller. */
  const keep = (refs: PictureRefs, what: string): Blob => {
    if (refs.vector) {
      const data = image(refs.vector);
      if (!isSvg(data)) throw new DeckImportError(`The picture for ${what} is not an SVG.`);
      return new Blob([data as Uint8Array<ArrayBuffer>], { type: SVG_TYPE });
    }
    return new Blob([png(refs.image!, what) as Uint8Array<ArrayBuffer>], { type: 'image/png' });
  };
  const faces: Record<Card, Blob> = {};
  for (const [code, refs] of check.faces) faces[code] = keep(refs, code);
  const back = keep(check.back, 'the back');

  const previous = imported.find((d) => d.id === meta.id);
  const outcome: ImportResult['outcome'] = !previous
    ? 'added'
    : previous.meta.contentHash && previous.meta.contentHash === meta.contentHash
      ? 'unchanged'
      : 'updated';
  const record: StoredMeta = { id: meta.id, meta, importedAt: Date.now() };
  await writeDeck(record, { id: meta.id, back, faces });
  imported = [...imported.filter((d) => d.id !== meta.id), record];
  publish({ list: listing() });
  await selectDeck(meta.id);
  return { name: meta.name, outcome };
}

/** Remove an imported deck. A starter deck it was standing in for comes back. */
export async function removeDeck(id: string): Promise<void> {
  const db = await openDb();
  await done(
    (() => {
      const tx = db.transaction(['meta', 'art'], 'readwrite');
      tx.objectStore('meta').delete(id);
      tx.objectStore('art').delete(id);
      return tx;
    })(),
  );
  imported = imported.filter((d) => d.id !== id);
  publish({ list: listing() });
  if (state.activeId === id) await selectDeck(starterArt.has(id) ? id : DEFAULT_ID);
}

function depth(path: string): number {
  return path.split('/').length;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new DeckImportError('That file is not a deck: it could not be read as JSON.');
  }
}

/** Bytes of a data: URI, base64 or percent-encoded (an SVG is often written either way). */
function dataUriBytes(uri: string): Uint8Array {
  const comma = uri.indexOf(',');
  if (!uri.slice(0, comma).includes(';base64')) return new TextEncoder().encode(decodeURIComponent(uri.slice(comma + 1)));
  const binary = atob(uri.slice(comma + 1));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// ---------- IndexedDB ----------

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      // Metadata apart from the images, so listing decks never reads megabytes of PNG.
      req.result.createObjectStore('meta', { keyPath: 'id' });
      req.result.createObjectStore('art', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => (dbPromise = null));
  return dbPromise;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

async function readAll<T>(store: 'meta' | 'art'): Promise<T[]> {
  const db = await openDb();
  return request(db.transaction(store).objectStore(store).getAll() as IDBRequest<T[]>);
}

async function readOne<T>(store: 'meta' | 'art', id: string): Promise<T | undefined> {
  const db = await openDb();
  return request(db.transaction(store).objectStore(store).get(id) as IDBRequest<T | undefined>);
}

async function writeDeck(meta: StoredMeta, art: StoredArt): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['meta', 'art'], 'readwrite');
  tx.objectStore('meta').put(meta);
  tx.objectStore('art').put(art);
  await done(tx);
}
