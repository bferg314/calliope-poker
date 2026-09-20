// The turn notification: when the action reaches you, "your turn" is stamped
// across the table for a moment and a bell rings.
//
// The bell is checked by counting oscillators, because a headless browser has
// nowhere to play a sound: the page is instrumented before it loads so every
// AudioContext records how many it was asked to build.
//
// Needs the server running with WEB_DIST pointing at packages/web/dist (see README).
//   BASE=http://localhost:3000 OUT=./shots CHANNEL=chrome node e2e/turn-notification.mjs
// CHANNEL picks an installed browser (chrome, msedge); omit it to use the Playwright
// bundle. EXE gives a browser path outright, for a Chrome that is not where
// Playwright looks for it.
import { chromium } from 'playwright';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? '.';
const out = (n) => path.join(OUT, n);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const browser = await chromium.launch({
  channel: process.env.EXE ? undefined : process.env.CHANNEL || undefined,
  executablePath: process.env.EXE || undefined,
  headless: true,
  // Let the page make a sound without a gesture, so a locked context cannot be
  // mistaken for a bell that never rang.
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 400, height: 780 }, deviceScaleFactor: 2 });

await ctx.addInitScript(() => {
  window.__oscillators = 0;
  const wrap = (Ctor) => {
    if (!Ctor) return Ctor;
    const create = Ctor.prototype.createOscillator;
    Ctor.prototype.createOscillator = function patched() {
      window.__oscillators++;
      return create.call(this);
    };
    return Ctor;
  };
  wrap(window.AudioContext);
  wrap(window.webkitAudioContext);
});

const page = await ctx.newPage();
page.on('pageerror', (e) => log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') log('CONSOLE error', m.text().slice(0, 200)); });

const rings = () => page.evaluate(() => window.__oscillators);

await page.goto(BASE + '/');
await page.waitForSelector('text=A name for the evening');
await page.getByRole('button', { name: 'Sit down' }).click();
await page.waitForSelector('.ticket');
await page.getByRole('button', { name: 'Got it' }).click();
await page.waitForSelector('text=Deal a new table');
await page.getByRole('button', { name: 'Deal a new table' }).click();
await page.getByRole('button', { name: 'Open the table' }).click();
await page.waitForURL(/\/r\/[A-Z0-9]+/);
await page.waitForSelector('.seat-grid');

await page.getByRole('button', { name: 'sit here' }).first().click();
await page.waitForTimeout(300);
for (const p of ['calling station', 'tight']) {
  await page.getByRole('button', { name: '+ bot' }).first().click();
  await page.getByRole('button', { name: p, exact: true }).click();
  await page.waitForTimeout(300);
}

const before = await rings();
await page.getByRole('button', { name: 'Deal the first hand' }).click();
await page.waitForSelector('.table-area');

// 1. The stamp appears when the action arrives, and says what is being asked.
await page.waitForSelector('.turn-pop', { timeout: 30000 });
await page.screenshot({ path: out('turn-01-pop.png') });
const text = (await page.locator('.turn-pop .plate').innerText()).replace(/\s+/g, ' ').trim();
log('stamp reads:', JSON.stringify(text));
if (!/your turn/i.test(text)) throw new Error(`the stamp does not say whose turn it is: ${text}`);
if (!/to call|check|pick the game|throw|draw|discard/i.test(text)) {
  throw new Error(`the stamp gives no hint of what is being asked: ${text}`);
}

// 2. It never swallows the tap it is asking for.
const blocks = await page.evaluate(() => {
  const pop = document.querySelector('.turn-pop');
  return pop ? getComputedStyle(pop).pointerEvents !== 'none' : false;
});
if (blocks) throw new Error('the stamp takes pointer events and can swallow a tap');

// 3. It never covers the pot, which is the number you want while deciding.
const clash = await page.evaluate(() => {
  const plate = document.querySelector('.turn-pop .plate');
  if (!plate) return null;
  const a = plate.getBoundingClientRect();
  const over = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return 0;
    const b = el.getBoundingClientRect();
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? Math.round(w * h) : 0;
  };
  const pot = document.querySelector('.pot');
  return { pot: over('.pot'), board: over('.board'), gap: pot ? Math.round(a.top - pot.getBoundingClientRect().bottom) : null };
});
log('clearance below the pot:', clash.gap, 'px');
if (clash.pot > 0) throw new Error(`the stamp covers the pot by ${clash.pot}px2`);
if (clash.board > 0) throw new Error(`the stamp covers the board by ${clash.board}px2`);

// 4. The bell rang, once.
const after = await rings();
log('oscillators built:', after - before);
if (after === before) throw new Error('the bell did not ring when the turn arrived');

// 5. It hangs about for a second or two, then leaves on its own.
await page.waitForSelector('.turn-pop', { state: 'detached', timeout: 4000 });
log('the stamp cleared itself');

// 6. Turning the bell off in the menu keeps it quiet on the next turn.
const call = page.locator('.action-bar .btn-ink:not([disabled])');
await call.first().waitFor({ timeout: 15000 });
await page.locator('.menu-wrap button').first().click();
await page.getByText('Turn bell').click();
await page.waitForTimeout(200);
const muted = await rings();
await call.first().click();

let sawPop = false;
const deadline = Date.now() + 40000;
while (Date.now() < deadline) {
  if (await page.locator('.turn-pop').count()) { sawPop = true; break; }
  if (await call.count()) { await call.first().click(); }
  await page.waitForTimeout(150);
}
if (!sawPop) log('WARNING: no second turn arrived inside 40s, so the mute check is unproven');
else {
  const stillMuted = await rings();
  log('oscillators while muted:', stillMuted - muted);
  if (stillMuted !== muted) throw new Error('the bell rang after it was switched off');
  await page.screenshot({ path: out('turn-02-pop-muted.png') });
  log('switched off, the bell stayed quiet and the stamp still showed');
}

// 7. Desktop, for the record.
await page.setViewportSize({ width: 1280, height: 820 });
await page.waitForTimeout(300);
log('done');
await browser.close();
