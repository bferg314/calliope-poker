// Plays Pineapple and five-card draw through the real UI, checking that the
// discard round works and that the table always says which game is on.
//   BASE=http://localhost:3000 OUT=./shots CHANNEL=chrome node e2e/draw-games.mjs
import { chromium } from 'playwright';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? '.';

// A server started with HOST_KEY only lets its owner open tables. Unlock first
// so this walkthrough works against either kind of server.
async function unlockIfNeeded(page, base) {
  const restricted = await page.evaluate(async (b) => {
    const r = await fetch(b + '/api/instance');
    return (await r.json()).restricted;
  }, base);
  if (!restricted) return;
  const key = process.env.HOST_KEY;
  if (!key) throw new Error('This server is host-only. Set HOST_KEY to run this walkthrough.');
  const ok = await page.evaluate(async ([b, k]) => {
    const r = await fetch(b + '/api/auth/claim-host', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ key: k }),
    });
    return r.ok;
  }, [base, key]);
  if (!ok) throw new Error('HOST_KEY was rejected by the server');
  // The app cached the old permission at load, so pick up the new one.
  await page.reload();
  await page.waitForSelector('text=Deal a new table', { timeout: 10000 });
}

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const browser = await chromium.launch({ channel: process.env.CHANNEL || undefined, headless: true });
const ctx = await browser.newContext({ viewport: { width: 400, height: 820 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); log('PAGEERROR', e.message); });

await page.goto(BASE + '/');
await page.getByRole('button', { name: 'Sit down' }).click();
await page.waitForSelector('.ticket');
await page.getByRole('button', { name: 'Got it' }).click();
await unlockIfNeeded(page, BASE);

/** Open a table locked to one game, seat two bots and deal. */
async function openTable(variantId) {
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: 'Deal a new table' }).click();
  await page.getByRole('button', { name: 'Open the table' }).click();
  await page.waitForSelector('.seat-grid');
  const code = page.url().split('/r/')[1];
  await page.locator('select.select').first().selectOption(variantId);
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'sit here' }).first().click();
  await page.waitForTimeout(300);
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '+ bot' }).first().click();
    await page.getByRole('button', { name: 'loose', exact: true }).click();
    await page.waitForTimeout(250);
  }
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await page.waitForSelector('.table-area');
  return code;
}

/**
 * Play until the draw bar appears, calling or checking along the way, then throw
 * cards away. Returns what the game strip said while drawing.
 */
async function playToDraw(expectName, shot) {
  let strip = null;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await page.locator('.draw-buttons').count()) {
      strip = (await page.locator('.game-strip').textContent())?.replace(/\s+/g, ' ').trim() ?? null;
      await page.screenshot({ path: path.join(OUT, shot) });
      const cards = page.locator('.card-pick');
      const n = await cards.count();
      // Throw away the first card; for draw poker take two.
      const toss = expectName === 'Pineapple' ? 1 : Math.min(2, n);
      for (let i = 0; i < toss; i++) await cards.nth(i).click();
      await page.waitForTimeout(200);
      await page.locator('.draw-buttons .btn-red').click();
      return strip;
    }
    const call = page.locator('.action-bar .btn-ink:not([disabled])');
    if (await call.count()) {
      await call.click();
      await page.waitForTimeout(350);
    } else {
      await page.waitForTimeout(300);
    }
  }
  return null;
}

let failures = 0;

for (const [id, label, shot] of [['pineapple', 'Pineapple', 'draw-pineapple.png'], ['draw5', 'Five-card Draw', 'draw-five-card.png']]) {
  const code = await openTable(id);
  log(`${label}: room ${code}`);
  const stripBefore = (await page.locator('.game-strip').textContent())?.replace(/\s+/g, ' ').trim();
  log(`  strip says: ${stripBefore}`);
  if (!stripBefore?.includes(label)) { log(`  FAIL: the strip does not name ${label}`); failures++; }

  const stripDuringDraw = await playToDraw(label, shot);
  if (!stripDuringDraw) { log('  FAIL: never got a turn to throw cards away'); failures++; continue; }
  log(`  during the draw: ${stripDuringDraw}`);

  // The hand must keep moving once the draw is done.
  let moved = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    if (!(await page.locator('.draw-buttons').count())) { moved = true; break; }
  }
  if (!moved) { log('  FAIL: stuck on the draw'); failures++; }
  else log('  draw completed and play continued');

  const cardCount = await page.locator('.own-seat .card').count();
  log(`  cards in hand after the draw: ${cardCount}`);
  if (label === 'Pineapple' && cardCount !== 2 && cardCount !== 3) { log('  FAIL: wrong card count'); failures++; }
  if (label === 'Five-card Draw' && cardCount !== 5) { log('  FAIL: wrong card count'); failures++; }
}

log('page errors:', errors.length === 0 ? 'none' : errors.join(' | '));
await browser.close();
if (failures > 0 || errors.length > 0) { log(`FAILED (${failures} checks)`); process.exit(1); }
log('passed: both draw games played through the UI');
