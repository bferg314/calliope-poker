// End-to-end walkthrough: creates an identity, opens a table, turns on rising
// stakes, seats three bots, plays a few turns, checks the resume banner and the
// themes, then ends the night through the confirm dialog, screenshotting as it goes.
// Needs the server running with WEB_DIST pointing at packages/web/dist (see README).
//   BASE=http://localhost:3000 OUT=./shots CHANNEL=chrome node e2e/walkthrough.mjs
// CHANNEL picks an installed browser (chrome, msedge); omit it to use the Playwright bundle.
import { chromium } from 'playwright';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? '.';
const out = (n) => path.join(OUT, n);

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
const ctx = await browser.newContext({ viewport: { width: 400, height: 780 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', (e) => log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log('CONSOLE', m.type(), m.text().slice(0, 200)); });
// Nothing should open a native dialog any more; accept and complain if one does.
page.on('dialog', (d) => { log('UNEXPECTED NATIVE DIALOG', d.message()); d.accept(); });

/** Confirm the app's own modal, checking it actually opened. */
async function confirmModal(label) {
  await page.waitForSelector('dialog.modal[open]', { timeout: 5000 });
  await page.locator('dialog.modal .modal-actions .btn').filter({ hasText: label }).click();
  await page.waitForSelector('dialog.modal[open]', { state: 'detached', timeout: 5000 }).catch(() => {});
}

await page.goto(BASE + '/');
await page.waitForSelector('text=A name for the evening');
await page.screenshot({ path: out('01-identity.png') });
await page.getByRole('button', { name: 'Sit down' }).click();
await page.waitForSelector('.ticket');
await page.screenshot({ path: out('02-ticket.png') });
await page.getByRole('button', { name: 'Got it' }).click();
await unlockIfNeeded(page, BASE);
await page.waitForSelector('text=Deal a new table');
await page.screenshot({ path: out('03-landing.png') });
await page.getByRole('button', { name: 'Deal a new table' }).click();
await page.getByRole('button', { name: 'Open the table' }).click();
await page.waitForURL(/\/r\/[A-Z0-9]+/);
await page.waitForSelector('.seat-grid');
const code = page.url().split('/r/')[1];
log('room', code);
await page.screenshot({ path: out('04-lobby.png'), fullPage: true });

// Rising stakes: a level a minute, so the walkthrough can actually see one land.
await page.getByRole('radio', { name: 'Go up on the clock' }).check();
await page.getByLabel('minutes per level').fill('1');
await page.waitForSelector('.ladder-preview');
await page.screenshot({ path: out('05-levels.png'), fullPage: true });
await page.getByRole('button', { name: 'Save settings' }).click();
await page.waitForTimeout(400);

await page.getByRole('button', { name: 'sit here' }).first().click();
await page.waitForTimeout(300);
for (const p of ['aggressive', 'calling station', 'tight']) {
  await page.getByRole('button', { name: '+ bot' }).first().click();
  await page.getByRole('button', { name: p, exact: true }).click();
  await page.waitForTimeout(300);
}
await page.screenshot({ path: out('06-lobby-seated.png'), fullPage: true });
await page.getByRole('button', { name: 'Deal the first hand' }).click();
await page.waitForSelector('.table-area');
await page.waitForTimeout(2500);
await page.screenshot({ path: out('07-table-phone.png') });

// Play until we get a turn, open the bet panel, screenshot, then call/check on.
let betShot = false;
let turns = 0;
const deadline = Date.now() + 60000;
while (Date.now() < deadline && turns < 6) {
  const raise = page.locator('.action-bar .btn-red:not([disabled])');
  const call = page.locator('.action-bar .btn-ink:not([disabled])');
  if (await call.count()) {
    if (!betShot && (await raise.count())) {
      await raise.click();
      await page.waitForTimeout(300);
      if (await page.locator('.bet-panel').count()) {
        await page.screenshot({ path: out('08-bet-panel.png') });
        betShot = true;
        await page.getByRole('button', { name: 'cancel' }).click();
      }
    }
    await call.click();
    turns++;
    await page.waitForTimeout(400);
  } else {
    await page.waitForTimeout(300);
  }
}
log('turns taken', turns);

// The way back in, from the landing page and from the profile.
await page.goto(`${BASE}/`);
await page.waitForSelector('.resume-card', { timeout: 10000 });
await page.screenshot({ path: out('09-resume-landing.png') });
log('resume banner:', (await page.locator('.resume-card .headline').first().textContent())?.trim());

await page.goto(`${BASE}/me`);
await page.waitForSelector('text=your record');
await page.screenshot({ path: out('10-profile.png'), fullPage: true });

// Every theme, on the table.
for (const [i, theme] of ['Paper & ink', 'Midnight', 'Noir', 'Oxblood'].entries()) {
  await page.goto(`${BASE}/me`);
  await page.waitForSelector('.theme-grid');
  if (i === 0) await page.screenshot({ path: out('11-themes.png') });
  await page.getByRole('radio', { name: new RegExp(`^${theme}`) }).click();
  await page.goto(`${BASE}/r/${code}`);
  await page.waitForSelector('.table-area');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out(`12-theme-${theme.toLowerCase().replace(/[^a-z]+/g, '-')}.png`) });
}

// Desktop, back on the default look.
await page.goto(`${BASE}/me`);
await page.waitForSelector('.theme-grid');
await page.getByRole('radio', { name: /^Felt/ }).click();
await page.goto(`${BASE}/r/${code}`);
await page.waitForSelector('.table-area');
await page.setViewportSize({ width: 1280, height: 820 });
await page.waitForTimeout(1200);
await page.screenshot({ path: out('13-table-desktop.png') });

// The stand-up dialog, opened and cancelled.
await page.setViewportSize({ width: 400, height: 780 });
await page.waitForTimeout(400);
await page.locator('.menu-wrap button').first().click();
await page.getByRole('button', { name: 'Stand up' }).click();
await page.waitForSelector('dialog.modal[open]');
await page.screenshot({ path: out('14-modal.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
if (await page.locator('dialog.modal[open]').count()) throw new Error('Escape did not close the dialog');

// End the night for real.
await page.locator('.menu-wrap button').first().click();
await page.getByRole('button', { name: 'End the night' }).click();
await confirmModal('End the night');
await page.waitForSelector('.report-hero', { timeout: 90000 });
await page.waitForTimeout(300);
await page.screenshot({ path: out('15-report.png'), fullPage: true });
log('done');
await browser.close();
