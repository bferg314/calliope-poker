import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { checkOpenDeck, isSvg, pngSize, resolveImagePath, type Picture, type PictureRefs, type StarterDeck } from './src/openDeck.js';

const ID = 'virtual:starter-decks';
const RESOLVED = `\0${ID}`;

/**
 * Checks every deck under public/decks/<folder>/deck.json at build time and hands the app
 * their metadata and image paths as `virtual:starter-decks`. A deck that is not a complete
 * french-52 pack, has no licence, or has a missing or malformed picture fails the build.
 * `order` lists folders first to last; the first is the default deck.
 */
export function starterDecks(options: { order: string[] }): Plugin {
  let root = '';
  const decksDir = (): string => resolve(root, 'public', 'decks');
  return {
    name: 'calliope-starter-decks',
    configResolved(config) {
      root = config.root;
    },
    resolveId(id) {
      return id === ID ? RESOLVED : undefined;
    },
    load(id) {
      if (id !== RESOLVED) return undefined;
      const decks = readStarterDecks(decksDir(), options.order);
      return `export default ${JSON.stringify(decks)};`;
    },
    configureServer(server) {
      server.watcher.add(decksDir());
      server.watcher.on('all', (_event, file) => {
        if (!resolve(file).startsWith(decksDir())) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      });
    },
  };
}

function readStarterDecks(dir: string, order: string[]): StarterDeck[] {
  if (!existsSync(dir)) throw new Error(`No starter decks: ${dir} does not exist`);
  const folders = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => rankOf(a, order) - rankOf(b, order) || a.localeCompare(b));
  const decks: StarterDeck[] = [];
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const folder of folders) {
    const jsonPath = join(dir, folder, 'deck.json');
    if (!existsSync(jsonPath)) {
      problems.push(`${folder}: no deck.json (unzip the Open Playing Cards export here)`);
      continue;
    }
    const check = checkOpenDeck(JSON.parse(readFileSync(jsonPath, 'utf8')));
    if (!check.ok) {
      problems.push(`${folder}: ${check.error}`);
      continue;
    }
    const { meta, deck } = check;
    if (!meta.license) problems.push(`${folder}: no licence. A deck without one cannot be shipped.`);
    if (ids.has(meta.id)) problems.push(`${folder}: deckId ${meta.id} is already used by another starter deck`);
    ids.add(meta.id);

    /** Check a file beside deck.json and return its path under the site root. */
    const file = (ref: string, kind: 'png' | 'svg'): string | null => {
      if (ref.startsWith('data:')) {
        problems.push(`${folder}: pictures must be files beside deck.json, not embedded`);
        return null;
      }
      const rel = resolveImagePath('deck.json', ref);
      const abs = join(dir, folder, rel);
      if (!existsSync(abs)) {
        problems.push(`${folder}: missing ${rel}`);
        return null;
      }
      const bytes = readFileSync(abs);
      if (kind === 'svg' && !isSvg(bytes)) {
        problems.push(`${folder}: ${rel} is not an SVG`);
        return null;
      }
      if (kind === 'png') {
        const size = pngSize(bytes);
        if (!size || size.width !== deck.card.imageWidth || size.height !== deck.card.imageHeight) {
          problems.push(`${folder}: ${rel} is not a ${deck.card.imageWidth}×${deck.card.imageHeight} PNG`);
          return null;
        }
      }
      return `decks/${folder}/${rel}`;
    };
    /** Every picture a card names is checked; the card is drawn from its vector when it has one. */
    const picture = (refs: PictureRefs): Picture | null => {
      const png = refs.image !== undefined ? file(refs.image, 'png') : null;
      const svg = refs.vector !== undefined ? file(refs.vector, 'svg') : null;
      if (svg) return { src: svg, vector: true };
      return png ? { src: png, vector: false } : null;
    };
    const back = picture(check.back);
    const faces: Record<string, Picture> = {};
    for (const [code, refs] of check.faces) {
      const p = picture(refs);
      if (p) faces[code] = p;
    }
    if (back) decks.push({ meta, back, faces });
  }
  if (problems.length) throw new Error(`Starter decks in ${dir}:\n  ${problems.join('\n  ')}`);
  if (!decks.length) throw new Error(`No starter decks in ${dir}`);
  return decks;
}

function rankOf(folder: string, order: string[]): number {
  const i = order.indexOf(folder);
  return i < 0 ? order.length : i;
}
