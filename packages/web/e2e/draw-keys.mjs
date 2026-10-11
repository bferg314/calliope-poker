// Draws without a mouse: Badugi with the keyboard (digits, arrows, Space,
// Escape and Enter), then with a controller (focus lands on the first card,
// A throws, the D-pad walks the hand, Y draws), then Pineapple's one-card
// discard from the keyboard. Betting along the way uses the same input.
//
// Needs the server running with WEB_DIST pointing at packages/web/dist (see README).
//   BASE=http://localhost:3000 OUT=./shots node e2e/draw-keys.mjs
// CHANNEL picks an installed browser; EXE gives a browser path outright.
import { chromium } from 'playwright';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? '.';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const browser = await chromium.launch({
  channel: process.env.EXE ? undefined : process.env.CHANNEL || undefined,
  executablePath: process.env.EXE || undefined,
  headless: true,
});
// Wide, so the card numbers and key labels are drawn.
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
  const pad = { buttons: Array(17).fill(false), axes: [0, 0, 0, 0] };
  window.__pad = pad;
  navigator.getGamepads = () => [{
    index: 0, id: 'Fake pad', connected: true, mapping: 'standard', timestamp: performance.now(),
    buttons: pad.buttons.map((p) => ({ pressed: p, touched: p, value: p ? 1 : 0 })), axes: [...pad.axes],
  }];
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); log('PAGEERROR', e.message); });

const BTN = { A: 0, B: 1, Y: 3, RIGHT: 15 };
const tap = async (name) => {
  await page.evaluate((i) => { window.__pad.buttons[i] = true; }, BTN[name]);
  await page.waitForTimeout(70);
  await page.evaluate((i) => { window.__pad.buttons[i] = false; }, BTN[name]);
  await page.waitForTimeout(90);
};
const tossed = () => page.locator('.own-seat .card-pick.tossed').count();
const focusedCard = () => page.evaluate(() => [...document.querySelectorAll('.own-seat .card-pick')].indexOf(document.activeElement));

let failures = 0;
const check = (ok, what) => { if (ok) log('  ok:', what); else { log('  FAIL:', what); failures++; } };

await page.goto(BASE + '/');
await page.getByRole('button', { name: 'Sit down' }).click();
await page.waitForSelector('.ticket');
await page.getByRole('button', { name: 'Got it' }).click();
await page.waitForSelector('text=Deal a new table', { timeout: 10000 });

/** Open a table locked to one game, seat two calling bots and deal. */
async function openTable(variantId) {
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: 'Deal a new table' }).click();
  await page.getByRole('button', { name: 'Open the table' }).click();
  await page.waitForSelector('.seat-grid');
  await page.locator('select.select').first().selectOption(variantId);
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'sit here' }).first().click();
  await page.waitForTimeout(300);
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '+ bot' }).first().click();
    await page.getByRole('button', { name: 'calling station', exact: true }).click();
    await page.waitForTimeout(250);
  }
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await page.waitForSelector('.table-area');
}

/** Bet with `act` until the draw bar comes round. False if it never does. */
async function toDraw(act) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await page.locator('.draw-buttons').count()) { await page.waitForTimeout(300); return true; }
    if (await page.locator('.action-bar .btn-ink:not([disabled])').count()) { await act(); await page.waitForTimeout(400); }
    else await page.waitForTimeout(250);
  }
  return false;
}
const drawGone = async () => {
  for (let i = 0; i < 20; i++) { if (!(await page.locator('.draw-buttons').count())) return true; await page.waitForTimeout(150); }
  return false;
};

log('Badugi, from the keyboard');
await openTable('badugi');
check(await toDraw(() => page.keyboard.press('c')), 'the draw came round');
await page.screenshot({ path: path.join(OUT, 'draw-keys-badugi.png') });
check((await page.locator('.own-seat .card-key').first().textContent()) === '1', 'the first card is numbered 1');
await page.keyboard.press('1');
await page.keyboard.press('3');
check((await tossed()) === 2, '1 and 3 throw two cards');
check((await page.locator('.draw-go').textContent())?.startsWith('Draw 2'), 'the button says Draw 2');
await page.keyboard.press('3');
check((await tossed()) === 1, '3 again keeps that card');
await page.keyboard.press('Escape');
check((await tossed()) === 0, 'Escape puts everything back');
await page.keyboard.press('ArrowRight');
check((await focusedCard()) === 0, 'the right arrow starts on the first card');
await page.keyboard.press('ArrowRight');
check((await focusedCard()) === 1, 'and moves along to the second');
await page.keyboard.press('Space');
check((await tossed()) === 1, 'Space throws the card you are on');
await page.screenshot({ path: path.join(OUT, 'draw-keys-picked.png') });
await page.keyboard.press('Enter');
check(await drawGone(), 'Enter draws, rather than pressing the focused card');
check((await page.locator('.own-seat .hand-label').textContent())?.includes('drew 1'), 'one card was drawn');

log('Badugi, with a controller');
await page.evaluate(() => window.dispatchEvent(new Event('gamepadconnected')));
await tap('B'); // the pad is in use from here
check(await toDraw(() => tap('A')), 'the next draw came round');
check((await focusedCard()) === 0, 'the draw puts focus on the first card');
await tap('A');
await tap('RIGHT');
await tap('A');
check((await tossed()) === 2, 'A, right, A throws two cards');
await page.screenshot({ path: path.join(OUT, 'draw-keys-pad.png') });
await tap('Y');
check(await drawGone(), 'Y draws');

log('Pineapple, from the keyboard');
await openTable('pineapple');
await page.evaluate(() => { delete document.documentElement.dataset.input; });
check(await toDraw(() => page.keyboard.press('c')), 'the discard came round');
await page.keyboard.press('2');
await page.keyboard.press('3');
check((await tossed()) === 1, 'a second digit swaps which one card is thrown');
await page.keyboard.press('Enter');
check(await drawGone(), 'Enter throws it away');

log('page errors:', errors.length === 0 ? 'none' : errors.join(' | '));
await browser.close();
if (failures > 0 || errors.length > 0) { log(`FAILED (${failures} checks)`); process.exit(1); }
log('passed: draws work from the keyboard and a controller');
