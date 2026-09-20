// The night report settles up in cash as well as chips: the viewer's own
// payout, a cash figure under every chip figure in the ledger, and a closing
// row for the bank. A night played for nothing prints no money at all.
//
// Needs the server running with WEB_DIST pointing at packages/web/dist (see README).
//   BASE=http://localhost:3000 OUT=./shots CHANNEL=chrome node e2e/night-report.mjs
// CHANNEL picks an installed browser (chrome, msedge); omit it to use the Playwright
// bundle. EXE gives a browser path outright, for a Chrome that is not where
// Playwright looks for it.
import { chromium } from 'playwright';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? '.';
const PLAY_MS = Number(process.env.SECONDS ?? 30) * 1000;
const out = (n) => path.join(OUT, n);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let failures = 0;
const check = (label, ok, detail = '') => {
  log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({
  channel: process.env.EXE ? undefined : process.env.CHANNEL || undefined,
  executablePath: process.env.EXE || undefined,
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 400, height: 780 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', (e) => { log('PAGEERROR', e.message); failures++; });

async function identify(p) {
  await p.goto(BASE + '/');
  await p.getByRole('button', { name: 'Sit down' }).click();
  await p.waitForSelector('.ticket');
  await p.getByRole('button', { name: 'Got it' }).click();
  await p.waitForSelector('text=Deal a new table');
}

/** A table with the viewer and three bots, dealt and playing. */
async function openTable(p, { buyInValue } = {}) {
  await p.goto(BASE + '/');
  await p.getByRole('button', { name: 'Deal a new table' }).click();
  await p.getByRole('button', { name: 'Open the table' }).click();
  await p.waitForURL(/\/r\/[A-Z0-9]+/);
  await p.waitForSelector('.seat-grid');
  if (buyInValue !== undefined) {
    await p.getByLabel('a buy-in is worth').fill(String(buyInValue));
    await p.getByRole('button', { name: 'Save settings' }).click();
    await p.waitForTimeout(400);
  }
  await p.getByRole('button', { name: 'sit here' }).first().click();
  await p.waitForTimeout(300);
  for (const kind of ['aggressive', 'calling station', 'loose']) {
    await p.getByRole('button', { name: '+ bot' }).first().click();
    await p.getByRole('button', { name: kind, exact: true }).click();
    await p.waitForTimeout(300);
  }
  await p.getByRole('button', { name: 'Deal the first hand' }).click();
  await p.waitForSelector('.table-area');
  return p.url().split('/r/')[1];
}

/** Call along, so chips actually move before the night is called. */
async function playFor(p, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const call = p.locator('.action-bar .btn-ink:not([disabled])');
    if (await call.count()) { await call.first().click(); await p.waitForTimeout(250); }
    else await p.waitForTimeout(250);
  }
}

async function endNight(p) {
  await p.locator('.menu-wrap button').first().click();
  await p.getByRole('button', { name: 'End the night' }).click();
  await p.waitForSelector('dialog.modal[open]');
  await p.locator('dialog.modal .modal-actions .btn').filter({ hasText: 'End the night' }).click();
  await p.waitForSelector('.report-hero', { timeout: 90000 });
  await p.waitForTimeout(400);
}

await identify(page);

// ---- a night played for money ----
const code = await openTable(page);
log('room', code);
await playFor(page, PLAY_MS);
await endNight(page);

check('the viewer is told what they take home', (await page.locator('.payout').count()) === 1);
log('payout:', (await page.locator('.payout').innerText()).replace(/\n+/g, ' · '));
const cashLines = await page.locator('.ledger tbody .cash').allInnerTexts();
check('every chip figure in the ledger carries its cash', cashLines.length === 12, `${cashLines.length} cash figures`);
check('the bank closes the ledger', (await page.locator('.ledger tfoot .cash').count()) === 2);
check('the rate is printed', (await page.getByText(/Chips cash at .* per /).count()) === 1);
await page.screenshot({ path: out('night-report.png'), fullPage: true });

// The money on the page is the money on the report, and it balances.
const report = await page.evaluate(async (c) => (await fetch(`/api/rooms/${c}/report`)).json(), code);
const paid = report.players.reduce((a, p) => a + p.cashOut, 0);
check('the payouts add up to the cash that came in the door',
  paid === report.cash.paidOut && report.cash.paidOut === report.cash.paidIn,
  `in ${report.cash.paidIn}, out ${report.cash.paidOut}, paid ${paid}`);
check('nobody is owed a cent that nobody lost', report.players.reduce((a, p) => a + p.cashNet, 0) === 0);
check('the payouts are whole cents', report.players.every((p) => Number.isInteger(p.cashOut)));

// ---- a night played for nothing ----
const free = await openTable(page, { buyInValue: 0 });
log('room', free, 'priced at nothing');
await playFor(page, 4000);
await endNight(page);
check('no money on a night that was played for nothing',
  (await page.locator('.payout').count()) === 0 && (await page.locator('.ledger .cash').count()) === 0);
check('and the ledger still has everybody on it', (await page.locator('.ledger tbody tr').count()) === 4);

log(failures ? `${failures} FAILURES` : 'all good');
await browser.close();
process.exit(failures ? 1 : 0);
