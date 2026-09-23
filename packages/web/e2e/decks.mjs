// Decks end to end: the starter deck draws the table sharp at every size, a deck imports from the single-file .cards.json and from the .zip, a
// deck that is not french-52 is refused, and removing an imported copy of the starter
// brings the starter back.
// Needs the server running with WEB_DIST pointing at packages/web/dist (see README).
//   BASE=http://localhost:3000 OUT=./shots EMBEDDED=deck.cards.json ZIP=deck.cards.zip BAD=other.cards.json node e2e/decks.mjs
// EMBEDDED must have deckId test-embedded-1 (PNG or SVG pictures, as data: URIs); ZIP may be the starter's own export.
// CHANNEL picks an installed browser (chrome, msedge); EXE gives a browser path outright.
// DPR sets the device pixel ratio (default 2); DPR=1 shows what a standard desktop screen gets.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? '.';
const out = (n) => path.join(OUT, n);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const browser = await chromium.launch({
  channel: process.env.EXE ? undefined : process.env.CHANNEL || undefined,
  executablePath: process.env.EXE || undefined,
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 400, height: 780 }, deviceScaleFactor: Number(process.env.DPR ?? 2) });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
// The session check before Sit down answers 401 by design.
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('401')) problems.push(`console: ${m.text().slice(0, 200)}`); });

await page.goto(BASE + '/');
await page.getByRole('button', { name: 'Sit down' }).click();
await page.getByRole('button', { name: 'Got it' }).click();
await page.getByRole('button', { name: 'Deal a new table' }).click();
await page.getByRole('button', { name: 'Open the table' }).click();
await page.waitForURL(/\/r\/[A-Z0-9]+/);
const room = page.url();
await page.getByRole('button', { name: 'sit here' }).first().click();
await page.waitForTimeout(300);
for (const p of ['aggressive', 'calling station']) {
  await page.getByRole('button', { name: '+ bot' }).first().click();
  await page.getByRole('button', { name: p, exact: true }).click();
  await page.waitForTimeout(300);
}
await page.getByRole('button', { name: 'Deal the first hand' }).click();
await page.waitForSelector('.own-seat .card-art img');
await page.waitForTimeout(2000);

const STARTER = '81531664-def2-46a4-bbc9-3eae51c90855';
const own = page.locator('.own-seat .card-art').first();
assert.equal(await own.getAttribute('data-deck'), STARTER, 'own card drawn from the starter deck');
const backs = page.locator('.seat .card-art.card-back');
if (await backs.count()) assert.equal(await backs.first().getAttribute('data-deck'), STARTER, 'face-down seat cards use the deck back');

/**
 * Every deck card draws sharp: an SVG as it is, a PNG from a rendition at exactly its
 * on-screen device-pixel size.
 */
async function assertCrisp(label) {
  const exact = () =>
    [...document.querySelectorAll('.card-art img')].every((i) => {
      if (!i.complete || !i.naturalWidth) return false;
      return i.parentElement.dataset.picture === 'vector' || i.naturalWidth === Math.round(i.getBoundingClientRect().width * devicePixelRatio);
    });
  await page.waitForFunction(exact, undefined, { timeout: 5000 }).catch(() => {});
  const cards = await page.$$eval('.card-art img', (imgs) =>
    imgs.map((i) => ({
      picture: i.parentElement.dataset.picture,
      natural: i.naturalWidth,
      drawn: Math.round(i.getBoundingClientRect().width * devicePixelRatio),
    })),
  );
  const off = cards.filter((c) => !c.natural || (c.picture === 'png' && c.natural !== c.drawn));
  assert.equal(off.length, 0, `${label}: every card drawn sharp (${JSON.stringify(off.slice(0, 3))})`);
  const vectors = cards.filter((c) => c.picture === 'vector').length;
  log(`${label}: ${cards.length} cards, ${vectors} from SVG, ${cards.length - vectors} from exact-size PNG renditions`);
  return { vectors, total: cards.length };
}
const table = await assertCrisp('phone table');
assert.equal(table.vectors, table.total, 'the starter deck draws from its SVGs');
await page.screenshot({ path: out('decks-01-table-phone.png') });
log('phone table: drawn from the starter deck');

// Call along until the flop: board cards are the smallest face-up cards on a phone.
const deadline = Date.now() + 45000;
while (Date.now() < deadline && (await page.locator('.board .card-art').count()) < 3) {
  const call = page.locator('.action-bar .btn-ink:not([disabled])');
  if (await call.count()) await call.click();
  await page.waitForTimeout(400);
}
await page.waitForTimeout(800);
await assertCrisp('phone flop');
await page.screenshot({ path: out('decks-01b-flop-phone.png') });

await page.setViewportSize({ width: 1280, height: 820 });
await page.waitForTimeout(800);
await assertCrisp('wide table');
await page.screenshot({ path: out('decks-02-table-wide.png') });
await page.setViewportSize({ width: 400, height: 780 });

// The picker, and imports.
await page.goto(BASE + '/me');
await page.waitForSelector('.deck-grid .deck-swatch.on');
await page.locator('.deck-grid').scrollIntoViewIfNeeded();
await page.screenshot({ path: out('decks-03-picker.png') });
assert.equal(await page.locator('.deck-swatch').count(), 1, 'one starter deck listed');

const input = page.locator('input[type=file]');
if (process.env.BAD) {
  await input.setInputFiles(process.env.BAD);
  await page.waitForSelector('.error[role=alert]');
  log('refused:', await page.locator('.error[role=alert]').textContent());
}
if (process.env.EMBEDDED) {
  await input.setInputFiles(process.env.EMBEDDED);
  await page.waitForSelector('[role=status]');
  log('embedded:', await page.locator('[role=status]').textContent());
  assert.equal(await page.locator('.deck-swatch').count(), 2, 'imported deck listed beside the starter');
  assert.equal(await page.locator('.deck-swatch.on .name').textContent(), await page.locator('.deck-swatch').nth(1).locator('.name').textContent(), 'imported deck becomes active');
  await page.screenshot({ path: out('decks-04-imported.png') });
  await page.goto(room);
  await page.waitForSelector('.own-seat .card-art img');
  assert.equal(await page.locator('.own-seat .card-art').first().getAttribute('data-deck'), 'test-embedded-1', 'table draws the imported deck');
  log('table draws the imported deck');
  // It survives a reload.
  await page.reload();
  await page.waitForSelector('.own-seat .card-art[data-deck="test-embedded-1"]', { timeout: 5000 });
  await assertCrisp('imported deck');
  log('imported deck still chosen after reload');
  await page.goto(BASE + '/me');
  await page.waitForSelector('.deck-swatch.on');
}
if (process.env.ZIP) {
  const before = await page.locator('.deck-swatch').count();
  await input.setInputFiles(process.env.ZIP);
  await page.waitForFunction(() => document.querySelector('[role=status]')?.textContent?.includes('Classic'));
  log('zip:', await page.locator('[role=status]').textContent());
  assert.equal(await page.locator('.deck-swatch').count(), before, 'an imported copy of the starter stands in for it');
  await page.screenshot({ path: out('decks-05-zip.png') });
  // Remove the copy: the starter comes back and is chosen again.
  await page.locator('.deck-swatch.on .deck-remove').click();
  await page.locator('dialog.modal .modal-actions .btn').filter({ hasText: 'Remove' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.deck-swatch.on .deck-foot')].every((f) => !f.textContent.includes('remove')));
  log('removed the copy; starter chosen again');
}

await browser.close();
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
log('ok');
