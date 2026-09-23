import { useEffect, useReducer } from 'react';
import type { Picture } from './openDeck.js';

/**
 * Card PNGs shrunk to the exact device-pixel size they are drawn at. (An SVG needs none of
 * this: the browser rasterises it at whatever size it is drawn.)
 *
 * A deck's PNGs are print-sized (375px wide for Card Atelier's default), and a browser
 * shrinking one five-fold for a 72px card in one step leaves it soft on a 1x screen.
 * Resampled once with a high-quality filter at the exact size, the same card is crisp.
 * Renditions live for the session as small PNG blobs; a card shows the original until
 * its rendition is ready, a few milliseconds later.
 */

const ready = new Map<string, string>();
const pending = new Map<string, Promise<void>>();

function keyOf(src: string, w: number, h: number): string {
  return `${w}x${h}|${src}`;
}

/**
 * The image to draw a picture from at `width`×`height` CSS pixels: the vector as it is,
 * or a PNG rendition. `sourceWidth` is the PNG's own pixel width, when known, so nothing is ever enlarged.
 */
export function useRendition(picture: Picture, width: number, height: number, sourceWidth?: number): string {
  const src = picture.src;
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const w = Math.round(width * dpr);
  const h = Math.round(height * dpr);
  const wanted = !picture.vector && (!sourceWidth || w < sourceWidth);
  const key = keyOf(src, w, h);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!wanted || ready.has(key)) return;
    let live = true;
    let job = pending.get(key);
    if (!job) {
      job = shrink(src, w, h)
        .then((url) => void ready.set(key, url))
        .catch(() => void ready.set(key, src))
        .finally(() => pending.delete(key));
      pending.set(key, job);
    }
    void job.then(() => live && rerender());
    return () => {
      live = false;
    };
  }, [key, wanted, src, w, h]);

  return (wanted && ready.get(key)) || src;
}

/** Forget the renditions of images that are gone, such as a deck's revoked object URLs. */
export function dropRenditions(srcs: Iterable<string>): void {
  const gone = new Set(srcs);
  for (const [key, url] of ready) {
    if (gone.has(key.slice(key.indexOf('|') + 1))) {
      ready.delete(key);
      if (!gone.has(url)) URL.revokeObjectURL(url);
    }
  }
}

async function shrink(src: string, w: number, h: number): Promise<string> {
  const blob = await (await fetch(src)).blob();
  let bitmap = await createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
  if (bitmap.width !== w || bitmap.height !== h) {
    // A browser that ignores the resize options: halve in steps instead, which a
    // plain bilinear filter handles cleanly, then make the last small step.
    bitmap.close();
    bitmap = await createImageBitmap(blob);
    let from: CanvasImageSource = bitmap;
    let fw = bitmap.width;
    let fh = bitmap.height;
    while (fw / 2 >= w) {
      fw = Math.round(fw / 2);
      fh = Math.round(fh / 2);
      from = draw(from, fw, fh);
    }
    const canvas = draw(from, w, h);
    bitmap.close();
    return URL.createObjectURL(await toBlob(canvas));
  }
  const canvas = draw(bitmap, w, h);
  bitmap.close();
  return URL.createObjectURL(await toBlob(canvas));
}

function draw(from: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(from, 0, 0, w, h);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}
