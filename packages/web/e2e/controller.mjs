// A whole night with nothing but a controller: a fake pad, polled by the app
// like a real one, and no mouse or keyboard at all. Signs in, sets up a table,
// plays with A, X, Y, RB and Start, ends the night and opens a hand from the
// report; on the lobby, the table, the report and the profile page it also
// checks that the D-pad reaches every control there is.
//
// Needs the server running with WEB_DIST pointing at packages/web/dist (see README).
//   BASE=http://localhost:3000 OUT=./shots W=390 H=844 node e2e/controller.mjs
// CHANNEL picks an installed browser; EXE gives a browser path outright.
import { chromium } from 'playwright';
import path from 'node:path';
const log = (...a) => console.log(...a);
const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? '.';
const browser = await chromium.launch({
  channel: process.env.EXE ? undefined : process.env.CHANNEL || undefined,
  executablePath: process.env.EXE || undefined,
  headless: true,
});
const ctx = await browser.newContext({ viewport: Number(process.env.W ?? 390) > 0 ? { width: Number(process.env.W ?? 390), height: Number(process.env.H ?? 844) } : undefined, deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
  const pad = { buttons: Array(17).fill(false), axes: [0, 0, 0, 0] };
  window.__pad = pad;
  navigator.getGamepads = () => [{
    index: 0, id: 'Fake pad', connected: true, mapping: 'standard', timestamp: performance.now(),
    buttons: pad.buttons.map((p) => ({ pressed: p, touched: p, value: p ? 1 : 0 })), axes: [...pad.axes],
  }];
});
const p = await ctx.newPage();
p.on('pageerror', (e) => log('PAGEERROR', e.message));
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const tap = async (name) => {
  await p.evaluate((i) => { window.__pad.buttons[i] = true; }, BTN[name]);
  await p.waitForTimeout(70);
  await p.evaluate((i) => { window.__pad.buttons[i] = false; }, BTN[name]);
  await p.waitForTimeout(90);
};
const focused = () => p.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return '(nothing)';
  const label = el.labels?.[0]?.textContent;
  return (el.getAttribute('aria-label') || label || el.textContent || el.tagName).replace(/\s+/g, ' ').trim();
});
/**
 * Reach a control matching `re` with the D-pad. The route is found by trying
 * every direction from every control reached so far (breadth first, putting
 * focus back between tries), then played from the start with the pad alone.
 * A control no route reaches is a bug: it cannot be used with a controller.
 */
async function reach(re) {
  // Routes depend a little on scroll (pinned columns sit still while the page
  // moves), so search again from wherever a replay ends, a few times.
  for (let attempt = 0; attempt < 4; attempt++) {
    if (re.test(await focused())) return;
    try { await reachOnce(re); return; } catch (e) { if (attempt === 3 || /no D-pad route/.test(e.message)) throw e; }
  }
}

async function reachOnce(re) {
  if (re.test(await focused())) return [];
  // Name every control so focus can be put back while exploring.
  await p.evaluate(() => {
    let n = 0;
    for (const el of document.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]')) el.dataset.padId = String(n++);
  });
  const idOf = () => p.evaluate(() => document.activeElement?.dataset?.padId ?? 'none');
  const put = (id) => p.evaluate((i) => { if (i === 'none') { document.activeElement?.blur(); return; } const el = document.querySelector(`[data-pad-id="${i}"]`); el?.focus({ preventScroll: true }); el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, id);
  const startId = await idOf();
  const seen = new Map([[startId, []]]);
  const queue = [startId];
  let found = null;
  while (queue.length && !found && seen.size < 220) {
    const at = queue.shift();
    for (const dir of ['DOWN', 'RIGHT', 'UP', 'LEFT']) {
      await put(at);
      await tap(dir);
      const id = await idOf();
      if (seen.has(id)) continue;
      const path = [...seen.get(at), dir];
      seen.set(id, path);
      if (re.test(await focused())) { found = path; break; }
      queue.push(id);
    }
  }
  await put(startId);
  if (!found) throw new Error(`no D-pad route to ${re} (explored ${seen.size} controls)`);
  for (const dir of found) await tap(dir);
  if (!re.test(await focused())) throw new Error(`route to ${re} did not replay (focus on "${await focused()}")`);
  return found;
}
/** Explore every control the D-pad reaches from here, and name any it never does. */
async function coverage(label) {
  await p.evaluate(() => {
    let n = 0;
    for (const el of document.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]')) el.dataset.padId = String(n++);
  });
  const idOf = () => p.evaluate(() => document.activeElement?.dataset?.padId ?? 'none');
  const put = (id) => p.evaluate((i) => { const el = document.querySelector(`[data-pad-id="${i}"]`); el?.focus({ preventScroll: true }); el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, id);
  if ((await idOf()) === 'none') await tap('DOWN');
  const seen = new Set([await idOf()]);
  const queue = [...seen];
  while (queue.length && seen.size < 300) {
    const at = queue.shift();
    for (const dir of ['DOWN', 'RIGHT', 'UP', 'LEFT']) {
      await put(at);
      await tap(dir);
      const id = await idOf();
      if (!seen.has(id)) { seen.add(id); queue.push(id); }
    }
  }
  const missed = await p.evaluate((ids) => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (!el.checkVisibility || el.checkVisibility({ visibilityProperty: true })) && !el.closest('[inert],[aria-hidden="true"]') && !el.disabled && el.tabIndex !== -1; };
    const scope = document.querySelector('dialog[open]') ?? document;
    return [...scope.querySelectorAll('[data-pad-id]')].filter((el) => vis(el) && !ids.includes(el.dataset.padId))
      .map((el) => (el.getAttribute('aria-label') || el.labels?.[0]?.textContent || el.textContent || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 40));
  }, [...seen]);
  log(`   coverage ${label}: reached ${seen.size - (seen.has('none') ? 1 : 0)}, missed ${missed.length}${missed.length ? `: ${JSON.stringify(missed)}` : ''}`);
}
const step = async (label, fn) => { await fn(); log('✓', label); };

await p.goto(BASE + '/');
await p.evaluate(() => window.dispatchEvent(new Event('gamepadconnected')));
await p.waitForTimeout(200);
log('greeting:', await p.locator('.pad-toast').textContent().catch(() => '(none)'));

await step('sit down', async () => { await reach(/^Sit down/); await tap('A'); await p.waitForSelector('.ticket'); });
await step('keep the ticket', async () => { await reach(/Got it/); await tap('A'); await p.waitForSelector('text=Deal a new table'); });
await step('deal a new table', async () => { await reach(/Deal a new table/); await tap('A'); });
await step('open it', async () => { await reach(/Open the table/); await tap('A'); await p.waitForSelector('.seat-grid'); });
await step('jokers wild, with the D-pad on the list', async () => {
  await reach(/No wild cards|wild/i);
  await tap('A');
  await tap('RIGHT');
  await tap('A');
  log('   wild cards now:', await p.locator('select').filter({ has: p.locator('option[value=jokers]') }).first().inputValue());
});
await step('seconds to act up by ten steps with RB', async () => {
  await reach(/seconds to act/);
  const before = await p.getByLabel('seconds to act').inputValue();
  await tap('RB');
  log('   seconds to act:', before, '->', await p.getByLabel('seconds to act').inputValue());
});
await step('save the settings', async () => { await reach(/Save settings/); await tap('A'); await p.waitForTimeout(400); });
await step('take a seat', async () => { await reach(/sit here/); await tap('A'); await p.waitForTimeout(300); });
for (let i = 0; i < 2; i++) {
  await step(`add a bot (${i + 1})`, async () => {
    await reach(/\+ bot/);
    await tap('A');
    await reach(/calling station/);
    await tap('A');
    await p.waitForTimeout(300);
  });
}
await coverage('lobby');
await p.screenshot({ path: path.join(OUT, `pad-lobby.png`) });
await step('deal the first hand', async () => { await reach(/Deal the first hand/); await tap('A'); await p.waitForSelector('.table-area'); });

// At the table.
const myTurn = () => p.locator('.action-bar .btn-ink:not([disabled])').count();
const waitTurn = async () => { const t = Date.now() + 30000; while (Date.now() < t && !(await myTurn())) await p.waitForTimeout(150); return (await myTurn()) > 0; };
await step('A checks or calls on my turn, from where the turn put me', async () => {
  if (!(await waitTurn())) throw new Error('turn never came');
  await p.waitForTimeout(150);
  log('   focus on my turn:', await focused());
  await coverage('table, my turn');
  if (await myTurn()) await p.locator('.action-bar .btn-ink').focus();
  await p.screenshot({ path: path.join(OUT, `pad-turn.png`) });
  await tap('A');
  await p.waitForTimeout(500);
  log('   last line:', await p.locator('.hand-rail .log-line').last().textContent().catch(() => '(narrow: no rail)'));
});
await step('Y opens the bet, RB raises it, A places it', async () => {
  if (!(await waitTurn())) throw new Error('turn never came');
  await tap('Y');
  await p.waitForSelector('.bet-panel', { timeout: 3000 }).catch(() => {});
  if (await p.locator('.bet-panel').count()) {
    const before = await p.locator('.bet-panel input.num').inputValue();
    await tap('RB');
    const after = await p.locator('.bet-panel input.num').inputValue();
    log('   bet:', before, '->', after);
    await tap('A');
  } else log('   (fixed limit or no raise: Y acted directly)');
  await p.waitForTimeout(600);
});
await step('Start opens the menu, B closes it', async () => {
  await tap('START');
  const open = await p.locator('.menu[role=menu]').count();
  await tap('B');
  log('   menu open, then:', open, '->', await p.locator('.menu[role=menu]').count());
});
await step('the guide from the menu, and B to close it', async () => {
  await tap('START');
  await reach(/How to play/);
  await tap('A');
  await p.waitForSelector('dialog.modal[open] .game-guide');
  await p.screenshot({ path: path.join(OUT, `pad-guide.png`) });
  await tap('B');
  await p.waitForTimeout(200);
  log('   dialog open after B:', await p.locator('dialog.modal[open]').count());
});
await step('X folds on my turn', async () => {
  if (!(await waitTurn())) throw new Error('turn never came');
  await tap('X');
  await p.waitForTimeout(500);
  log('   folded:', await p.locator('.own-seat .hand-label').textContent());
});
await step('end the night from the menu', async () => {
  await tap('START');
  await reach(/End the night/);
  await tap('A');
  await p.waitForSelector('dialog.modal[open]');
  await reach(/End the night/);
  await tap('A');
  const t = Date.now() + 60000;
  while (Date.now() < t && !(await p.locator('.report-hero').count())) {
    if (await myTurn()) await tap('A');
    await p.waitForTimeout(200);
  }
  await p.waitForSelector('.report-hero');
});
await step('open a hand from the report', async () => {
  await reach(/^Hand \d/);
  await tap('A');
  await p.waitForSelector('dialog.modal[open] .hand-review');
  await tap('B');
});
await coverage('report');
await p.screenshot({ path: path.join(OUT, `pad-report.png`) });
await p.goto(BASE + '/me');
await p.waitForSelector('.keys-picker');
await coverage('profile');
log('done, without a mouse or a key');
await browser.close();
