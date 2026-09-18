// Regression guard: a dealer's-choice table must keep rendering while a hand sits
// in the "choosing" stage, when the hand exists but no game has been picked and
// `hand.variantId` is still empty. Asking the engine for that empty id used to
// throw during render and blank the whole screen.
//   BASE=http://localhost:3000 OUT=./shots CHANNEL=chrome node e2e/dealers-choice.mjs
import { chromium } from 'playwright';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? '.';
const SECONDS = Number(process.env.SECONDS ?? 70);

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
const page = await browser.newPage({ viewport: { width: 400, height: 780 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); log('PAGEERROR', e.message); });

await page.goto(BASE + '/');
await page.getByRole('button', { name: 'Sit down' }).click();
await page.waitForSelector('.ticket');
await page.getByRole('button', { name: 'Got it' }).click();
await unlockIfNeeded(page, BASE);
await page.getByRole('button', { name: 'Deal a new table' }).click();
await page.getByRole('button', { name: 'Open the table' }).click();
await page.waitForSelector('.seat-grid');
const code = page.url().split('/r/')[1];
log('room', code);

await page.getByRole('radio', { name: "Dealer's choice" }).check();
await page.getByRole('button', { name: 'Save settings' }).click();
await page.waitForTimeout(500);

await page.getByRole('button', { name: 'sit here' }).first().click();
await page.waitForTimeout(300);
for (let i = 0; i < 2; i++) {
  await page.getByRole('button', { name: '+ bot' }).first().click();
  await page.getByRole('button', { name: 'tight', exact: true }).click();
  await page.waitForTimeout(300);
}
await page.getByRole('button', { name: 'Deal the first hand' }).click();

let blanked = false;
let sawChoosing = false;
for (let i = 0; i < SECONDS; i++) {
  await page.waitForTimeout(1000);
  if (await page.locator('.choose-panel').count()) sawChoosing = true;
  const hasTable = await page.locator('.table-area').count();
  const rootText = ((await page.locator('#root').textContent()) ?? '').trim();
  if (!hasTable && rootText.length < 5) {
    blanked = true;
    log(`BLANK SCREEN after ${i + 1}s`);
    break;
  }
}
await page.screenshot({ path: path.join(OUT, 'dealers-choice.png') });
log('choosing panel seen:', sawChoosing);
log('page errors:', errors.length === 0 ? 'none' : errors.join(' | '));
await browser.close();

if (blanked || errors.length > 0) {
  log('FAILED');
  process.exit(1);
}
log('passed: the table stayed up through dealer\'s choice');
