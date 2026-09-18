// Checks the three lobby and sharing behaviours end to end:
//   1. unsaved settings block "Deal the first hand"
//   2. cancelling a table removes it for everyone
//   3. the join link can be copied from a table in play, and the QR renders
//   BASE=http://localhost:3000 OUT=./shots CHANNEL=chrome node e2e/lobby-and-sharing.mjs
import { chromium } from 'playwright';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? '.';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let failures = 0;
const check = (label, ok, detail = '') => {
  log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ channel: process.env.CHANNEL || undefined, headless: true });
const ctx = await browser.newContext({
  viewport: { width: 900, height: 900 },
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await ctx.newPage();
page.on('pageerror', (e) => { log('PAGEERROR', e.message); failures++; });

async function identify(p) {
  await p.goto(BASE + '/');
  await p.getByRole('button', { name: 'Sit down' }).click();
  await p.waitForSelector('.ticket');
  await p.getByRole('button', { name: 'Got it' }).click();
}

async function openTable(p) {
  await p.goto(BASE + '/');
  await p.getByRole('button', { name: 'Deal a new table' }).click();
  await p.getByRole('button', { name: 'Open the table' }).click();
  await p.waitForSelector('.seat-grid');
  return p.url().split('/r/')[1];
}

await identify(page);

// ---- 1. unsaved settings block the deal ----
let code = await openTable(page);
log('room', code);
for (let i = 0; i < 2; i++) {
  await page.getByRole('button', { name: '+ bot' }).first().click();
  await page.getByRole('button', { name: 'loose', exact: true }).click();
  await page.waitForTimeout(250);
}
const deal = page.getByRole('button', { name: 'Deal the first hand' });
check('deal is available before any edit', await deal.isEnabled());

await page.getByLabel('seconds to act').fill('45');
await page.waitForTimeout(250);
check('an unsaved edit disables the deal', !(await deal.isEnabled()));
check('and says why', await page.getByText('You have unsaved settings.').isVisible());

await page.getByRole('button', { name: 'Save them' }).click();
await page.waitForTimeout(500);
check('saving re-enables the deal', await deal.isEnabled());
check('the setting actually reached the server',
  (await page.getByLabel('seconds to act').inputValue()) === '45');
await page.screenshot({ path: path.join(OUT, 'unsaved-settings.png'), fullPage: true });

// ---- 2. cancelling a table ----
// A second person joins and waits in the lobby.
const guest = await ctx.browser().newContext();
const guestPage = await guest.newPage();
await identify(guestPage);
await guestPage.goto(`${BASE}/r/${code}`);
await guestPage.getByRole('button', { name: 'Sit down at this table' }).click();
await guestPage.waitForSelector('.seat-grid');
check('a guest is waiting in the lobby', true);

await page.getByRole('button', { name: 'Cancel this table' }).click();
await page.waitForSelector('dialog.modal[open]');
await page.screenshot({ path: path.join(OUT, 'cancel-confirm.png') });
await page.locator('dialog.modal .modal-actions .btn').filter({ hasText: 'Cancel the table' }).click();

await page.waitForURL((u) => !u.pathname.startsWith('/r/'), { timeout: 10000 });
check('the host is taken back to the start', !page.url().includes('/r/'));

await guestPage.waitForSelector('text=The host cancelled this table', { timeout: 10000 });
check('the guest is told the table was cancelled', true);
await guestPage.screenshot({ path: path.join(OUT, 'cancelled.png') });

const gone = await page.evaluate(async (c) => (await fetch(`/api/rooms/${c}`)).status, code);
check('the table is gone from the server', gone === 404, `status ${gone}`);
const listed = await page.evaluate(async () => (await (await fetch('/api/me/rooms')).json()).rooms.length);
check('and gone from the resume banner', listed === 0, `${listed} left`);
await guest.close();

// ---- 3. sharing from a table in play ----
code = await openTable(page);
for (let i = 0; i < 2; i++) {
  await page.getByRole('button', { name: '+ bot' }).first().click();
  await page.getByRole('button', { name: 'loose', exact: true }).click();
  await page.waitForTimeout(250);
}
check('the lobby shows a QR', (await page.locator('.invite .qr').count()) === 1);
await page.getByRole('button', { name: 'Deal the first hand' }).click();
await page.waitForSelector('.table-area');
await page.waitForTimeout(1200);

await page.locator('.room-code-button').click();
await page.waitForTimeout(500);
const copied = await page.evaluate(() => navigator.clipboard.readText());
// The whole link, not just the tail: a wrong host is the failure that matters,
// and it is invisible to anyone testing on the same machine that serves the app.
const want = new URL(`/r/${code}`, BASE).href;
check('tapping the room code copies the join link', copied === want, `${copied} (want ${want})`);
check('and says so', await page.getByText('Join link copied').isVisible());

await page.locator('.menu-wrap button').first().click();
await page.getByRole('button', { name: 'Invite someone' }).click();
await page.waitForSelector('dialog.modal[open] .qr');
const modules = await page.evaluate(() => {
  const svg = document.querySelector('dialog.modal .qr');
  return { viewBox: svg.getAttribute('viewBox'), paths: svg.querySelectorAll('path').length };
});
check('the dialog renders a QR', modules.paths === 1, JSON.stringify(modules));
check('the link beside the QR is absolute and points here',
  (await page.locator('dialog.modal .invite-link input').inputValue()) === want);
const buttons = await page.locator('dialog.modal .modal-actions .btn').count();
check('the invite dialog has one button', buttons === 1, `${buttons} buttons`);
await page.screenshot({ path: path.join(OUT, 'invite-dialog.png') });

await browser.close();
log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
