// Checks table templates end to end:
//   1. the host keeps a table's settings as a template from the lobby
//   2. a new table is dealt straight from it
//   3. a template loads into the form as unsaved edits, and saving reuses a name only after asking
//   4. the profile renames and deletes it
//   BASE=http://localhost:3000 OUT=./shots node e2e/templates.mjs
// CHANNEL picks an installed browser (chrome, msedge); EXE gives a browser path outright.
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

const browser = await chromium.launch({
  channel: process.env.EXE ? undefined : process.env.CHANNEL || undefined,
  executablePath: process.env.EXE || undefined,
  headless: true,
});
// A phone: the seat a host is as likely to set up from as any.
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => { log('PAGEERROR', e.message); failures++; });

async function identify(p) {
  await p.goto(BASE + '/');
  await p.getByRole('button', { name: 'Sit down' }).click();
  await p.waitForSelector('.ticket');
  await p.getByRole('button', { name: 'Got it' }).click();
}

const actSeconds = () => page.getByLabel('seconds to act');
const openShelf = () => page.locator('summary', { hasText: 'Templates' }).click();
const noSideScroll = async (label) => {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${label} fits the phone`, wide <= 0, `${wide}px over`);
};

await identify(page);

// ---- 1. keep a table's settings ----
await page.getByRole('button', { name: 'Deal a new table' }).click();
check('with no templates, the new-table form offers none', !(await page.getByLabel('Start from a template').count()));
await page.getByRole('button', { name: 'Open the table' }).click();
await page.waitForSelector('.seat-grid');
await actSeconds().fill('45');
await page.getByRole('button', { name: 'Save settings' }).click();
await page.waitForTimeout(300);

await openShelf();
check('the shelf starts empty', await page.locator('summary', { hasText: 'none saved yet' }).isVisible());
await page.getByLabel('template name').fill('Friday');
await page.getByRole('button', { name: 'Save as template' }).click();
await page.getByText('Saved as "Friday".').waitFor();
check('saving says so', true);
check('the shelf counts it', await page.locator('summary', { hasText: '1 saved' }).isVisible());
await noSideScroll('the lobby with the shelf open');
await page.screenshot({ path: path.join(OUT, 'templates-lobby.png'), fullPage: true });

// ---- 2. deal a table from it ----
await page.goto(BASE + '/');
await page.getByRole('button', { name: 'Deal a new table' }).click();
const picker = page.getByLabel('Start from a template');
await picker.waitFor();
await picker.selectOption({ label: 'Friday' });
check('the picker says what the template deals', await page.getByText(/Texas Hold'em · blinds 5\/10/).isVisible());
await page.screenshot({ path: path.join(OUT, 'templates-new-table.png'), fullPage: true });
await page.getByRole('button', { name: 'Open the table' }).click();
await page.waitForSelector('.seat-grid');
check('the new table has the template\'s settings', (await actSeconds().inputValue()) === '45');
check('and nothing waits to be saved', !(await page.locator('.save-bar').count()));

// ---- 3. load into the form, and save over a name ----
await actSeconds().fill('20');
await page.getByRole('button', { name: 'Save settings' }).click();
await page.waitForTimeout(300);
await openShelf();
await page.getByLabel('template', { exact: true }).selectOption({ label: 'Friday' });
await page.getByRole('button', { name: 'Load', exact: true }).click();
check('loading fills the form', (await actSeconds().inputValue()) === '45');
check('as edits still to save', await page.locator('.save-bar').isVisible());
await page.getByRole('button', { name: 'Save settings' }).click();
await page.waitForTimeout(300);

await actSeconds().fill('60');
await page.getByLabel('template name').fill('friday');
await page.getByRole('button', { name: 'Save as template' }).click();
await page.getByRole('dialog').getByText('Replace "Friday"?').waitFor();
check('reusing a name asks first', true);
await page.getByRole('button', { name: 'Replace it' }).click();
await page.getByText('Saved as "Friday".').waitFor();
check('and keeps one template, not two', await page.locator('summary', { hasText: '1 saved' }).isVisible());
await page.getByRole('button', { name: 'discard' }).click();

// ---- 4. rename and delete from the profile ----
await page.goto(BASE + '/me');
const row = page.locator('.template-list li', { hasText: 'Friday' });
await row.waitFor();
check('the profile lists it with what it deals', await row.getByText('blinds 5/10').isVisible());
await noSideScroll('the profile');
await page.screenshot({ path: path.join(OUT, 'templates-profile.png'), fullPage: true });
await row.getByRole('button', { name: 'rename' }).click();
await page.locator('.template-list').getByLabel('template name').fill('Saturday');
await page.locator('.template-list').getByRole('button', { name: 'Rename' }).click();
await page.locator('.template-list li', { hasText: 'Saturday' }).waitFor();
check('renaming sticks', true);
await page.locator('.template-list li', { hasText: 'Saturday' }).getByRole('button', { name: 'delete' }).click();
await page.getByRole('button', { name: 'Delete it' }).click();
await page.getByText('None yet.').waitFor();
check('deleting empties the list', true);

await page.goto(BASE + '/');
await page.getByRole('button', { name: 'Deal a new table' }).click();
await page.waitForTimeout(500);
check('and the new-table form goes back to standard settings', !(await page.getByLabel('Start from a template').count()));

await browser.close();
log(failures ? `${failures} failure(s)` : 'all good');
process.exit(failures ? 1 : 0);
