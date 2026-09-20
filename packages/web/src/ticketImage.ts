/**
 * The five-word ticket, drawn as a PNG somebody can keep on their phone.
 *
 * Drawn here rather than photographed off the page, because what is on screen
 * is one theme of several and half of them are dark: a saved dark rectangle is
 * a poor thing to read five words off a year later. So the image is printed
 * stock and dark ink whatever the theme, the same choice the cards and the QR
 * make, and it carries the one instruction the words are useless without.
 */

const STOCK = '#fbf8f1';
const PAGE = '#f4efe3';
const INK = '#1b1a17';
const INK_2 = '#5b574d';
const INK_3 = '#9a9384';

const DISPLAY = "'Fraunces Variable', 'Iowan Old Style', Georgia, serif";
const UI = "'Instrument Sans Variable', 'Helvetica Neue', Arial, sans-serif";

/** Laid out in the page's own pixels; SCALE only decides how sharp it prints. */
const W = 760;
const SCALE = 3;
/** Page margin around the stock, and stock edge to text. */
const PAD = 28;
const INSET = 48;
const CONTENT = W - (PAD + INSET) * 2;

/** Big first, shrinking only as far as five chosen words make necessary. */
const WORD_SIZES = [40, 34, 28, 22];

const TRACKING = 1.4;

function trackedWidth(ctx: CanvasRenderingContext2D, text: string): number {
  return [...text].reduce((w, ch) => w + ctx.measureText(ch).width, 0) + Math.max(0, text.length - 1) * TRACKING;
}

/** Canvas has no letter-spacing everywhere yet, and small caps labels need it. */
function tracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + TRACKING;
  }
}

/** A small caps label, as on the page: uppercase, tracked, quiet ink. */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: 'left' | 'right' = 'left'): void {
  ctx.font = `500 13px ${UI}`;
  ctx.fillStyle = align === 'right' ? INK_3 : INK_2;
  const caps = text.toUpperCase();
  tracked(ctx, caps, align === 'right' ? x - trackedWidth(ctx, caps) : x, y);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The words at the largest size that keeps them to two lines. Generated words
 * are never longer than five letters, but a player may choose their own five,
 * each up to twenty, and those still have to fit on the stock.
 */
function layoutWords(ctx: CanvasRenderingContext2D, words: string[]): { size: number; lines: string[][] } {
  let best = { size: WORD_SIZES[WORD_SIZES.length - 1]!, lines: [words] };
  for (const size of WORD_SIZES) {
    ctx.font = `500 ${size}px ${DISPLAY}`;
    const gap = ctx.measureText(' · ').width;
    const lines: string[][] = [];
    let line: string[] = [];
    let used = 0;
    for (const word of words) {
      const width = ctx.measureText(word).width;
      if (line.length > 0 && used + gap + width > CONTENT) {
        lines.push(line);
        line = [];
        used = 0;
      }
      used += (line.length > 0 ? gap : 0) + width;
      line.push(word);
    }
    if (line.length > 0) lines.push(line);
    best = { size, lines };
    if (lines.length <= 2) break;
  }
  return best;
}

/** Fonts the page has loaded still have to be asked for before canvas will use them. */
async function readyFonts(): Promise<void> {
  const wanted = [`italic 500 36px ${DISPLAY}`, `500 40px ${DISPLAY}`, `500 14px ${UI}`, `500 13px ${UI}`];
  try {
    await Promise.all(wanted.map((font) => document.fonts.load(font)));
  } catch {
    // The serif and sans fallbacks still print something readable.
  }
}

/** A dashed rule round the stock, with a punched hole either side, as on screen. */
function drawStock(ctx: CanvasRenderingContext2D, height: number): void {
  ctx.fillStyle = PAGE;
  ctx.fillRect(0, 0, W, height);

  const right = W - PAD;
  const bottom = height - PAD;
  ctx.fillStyle = STOCK;
  ctx.fillRect(PAD, PAD, right - PAD, bottom - PAD);

  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.strokeRect(PAD + 0.75, PAD + 0.75, right - PAD - 1.5, bottom - PAD - 1.5);

  for (const x of [PAD, right]) {
    ctx.beginPath();
    ctx.arc(x, height / 2, 14, 0, Math.PI * 2);
    ctx.fillStyle = PAGE;
    ctx.fill();
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

/**
 * Render the ticket. Null when the browser will not give up the bitmap, which
 * the caller should say out loud rather than leave a button that does nothing.
 */
export async function ticketImage(words: string[], name: string): Promise<Blob | null> {
  await readyFonts();

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Measure first: the words and the note decide how tall the stock has to be.
  const left = PAD + INSET;
  const set = layoutWords(ctx, words);
  const leading = Math.round(set.size * 1.35);
  ctx.font = `500 14px ${UI}`;
  const note = [
    ...wrapText(ctx, `Type these five words with the name ${name} to get your history back another night.`, CONTENT),
    'Nobody can recover them for you.',
  ];

  const firstWord = PAD + 232;
  const lastWord = firstWord + (set.lines.length - 1) * leading;
  const firstNote = lastWord + 52;
  const lastNote = firstNote + (note.length - 1) * 21;
  const imprint = lastNote + 38;
  const height = imprint + 30 + PAD;

  // Sizing the canvas clears it, so everything above this line only measured.
  canvas.width = W * SCALE;
  canvas.height = height * SCALE;
  ctx.scale(SCALE, SCALE);

  drawStock(ctx, height);

  label(ctx, 'keep this ticket', left, PAD + 40);
  label(ctx, new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }), W - left, PAD + 40, 'right');

  ctx.strokeStyle = INK_3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, PAD + 58.5);
  ctx.lineTo(W - left, PAD + 58.5);
  ctx.stroke();

  label(ctx, 'name', left, PAD + 96);
  ctx.font = `italic 500 36px ${DISPLAY}`;
  ctx.fillStyle = INK;
  ctx.fillText(name, left, PAD + 140);

  label(ctx, 'the five words', left, PAD + 182);
  set.lines.forEach((line, row) => {
    let x = left;
    const y = firstWord + row * leading;
    line.forEach((word, i) => {
      ctx.font = `500 ${set.size}px ${DISPLAY}`;
      ctx.fillStyle = INK;
      ctx.fillText(word, x, y);
      x += ctx.measureText(word).width;
      if (i < line.length - 1) {
        ctx.fillStyle = INK_3;
        ctx.fillText(' · ', x, y);
        x += ctx.measureText(' · ').width;
      }
    });
  });

  ctx.font = `500 14px ${UI}`;
  ctx.fillStyle = INK_2;
  note.forEach((line, i) => ctx.fillText(line, left, firstNote + i * 21));

  label(ctx, 'calliope poker', W - left, imprint, 'right');

  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

/** Something recognisable in a downloads folder a month from now. */
export function ticketFileName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug ? `calliope-ticket-${slug}.png` : 'calliope-ticket.png';
}
