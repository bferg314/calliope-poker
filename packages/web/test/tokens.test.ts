import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The design system's rules, checked rather than hoped for. See docs/design.md §2 and §8.

const src = fileURLToPath(new URL('../src/', import.meta.url));
const tokensCss = readFileSync(path.join(src, 'styles/tokens.css'), 'utf8');

/** Each theme's block, keyed by theme id: token name → value. */
function themes(): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  const block = /((?::root,\s*)?\[data-theme='([a-z-]+)'\])\s*\{([^}]*)\}/g;
  for (const m of tokensCss.matchAll(block)) {
    const decls = new Map<string, string>();
    for (const d of m[3]!.matchAll(/(--[a-z0-9-]+|color-scheme):\s*([^;]+);/g)) decls.set(d[1]!, d[2]!.trim());
    out.set(m[2]!, decls);
  }
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p, ext) : ext.test(name) ? [p] : [];
  });
}

const all = themes();
const felt = all.get('felt')!;
// The colour tokens are the ones Felt, the default, gives a hex value.
const colourTokens = [...felt].filter(([, v]) => /^#[0-9a-f]{6}$/i.test(v)).map(([k]) => k);

describe('themes', () => {
  it('ships the five themes', () => {
    expect([...all.keys()].sort()).toEqual(['felt', 'midnight', 'noir', 'oxblood', 'paper-ink']);
  });

  for (const [id, t] of all) {
    it(`${id} defines every colour token`, () => {
      const missing = ['color-scheme', ...colourTokens].filter((k) => !t.has(k));
      expect(missing).toEqual([]);
    });

    it(`${id} reads well`, () => {
      const c = (a: string, b: string): number => contrast(t.get(a)!, t.get(b)!);
      expect(c('--ink', '--paper')).toBeGreaterThanOrEqual(7);
      expect(c('--ink-2', '--paper')).toBeGreaterThanOrEqual(4.5);
      expect(c('--on-red', '--red')).toBeGreaterThanOrEqual(4.5);
      expect(c('--ink-disabled', '--paper-3')).toBeGreaterThanOrEqual(3);
      expect(c('--ink-disabled', '--paper')).toBeGreaterThanOrEqual(3);
      expect(c('--ink', '--seat-bg')).toBeGreaterThanOrEqual(7);
    });
  }
});

describe('styles use tokens', () => {
  const css = files(src, /\.css$/).filter((f) => !f.endsWith('tokens.css'));
  const tsx = files(src, /\.tsx?$/);

  it('sets no raw font sizes', () => {
    const raw = [
      ...css.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/font-size:\s*(?!\s|var\(|inherit)([^;]+);/g)].map((m) => `${path.basename(f)}: ${m[1]}`)),
      ...tsx.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/fontSize:\s*'(?!var\(|inherit)([^']+)'/g)].map((m) => `${path.basename(f)}: ${m[1]}`)),
    ];
    expect(raw).toEqual([]);
  });

  it('keeps colours in tokens.css', () => {
    // Chip colours are room data, and the saved ticket and theme chrome are
    // printed the same whatever the theme, so those files carry their own.
    const exempt = new Set(['Chip.tsx', 'Settings.tsx', 'ticketImage.ts', 'themes.ts']);
    const raw = [...css, ...tsx]
      .filter((f) => !exempt.has(path.basename(f)))
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b(?![-\w])/gi)].map((m) => `${path.basename(f)}: ${m[0]}`));
    expect(raw).toEqual([]);
  });

  it('prints rather than glows: no shadows, blurs or gradients', () => {
    const raw = css.flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .filter((l) => /box-shadow|filter:\s*blur|backdrop-filter|gradient\(/.test(l))
        // An inset hairline is a printed double rule; the select's caret is two triangles.
        .filter((l) => !/box-shadow:\s*inset 0 0 0 1px/.test(l) && !/linear-gradient\((45|135)deg/.test(l))
        .map((l) => `${path.basename(f)}: ${l.trim()}`),
    );
    expect(raw).toEqual([]);
  });
});
