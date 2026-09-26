// Layout audit: plays every game at several table sizes and checks the table
// at every screen size, so a layout change cannot quietly break a game it was
// not looked at in. See docs/design.md §4.
//
// For each game × player count it opens a table, plays to a late street
// (a four-card board, sixth street, after the draw), stops on the player's own
// turn so the table holds still, and then resizes through every viewport. At
// each one it checks that:
//
//   - no two seats overlap, and no seat covers the board, the pot, the player's
//     own seat, the action bar or the strips above the table;
//   - every seat stays inside the table area, and the whole table inside the window;
//   - the "your turn" stamp and the result line cover no seat and not the pot;
//   - the page never scrolls sideways;
//   - every control can be hit anywhere within a 44px square around its middle;
//   - cards are big enough to read (own, board, and opponents' face-up cards);
//   - the table does not jump between hands.
//
// It also walks the landing page, lobby, profile and night report for overflow
// and tap targets. Screenshots of everything go to OUT. Exits 1 on any failure.
//
// Needs the server running with WEB_DIST pointing at packages/web/dist (see README),
// without a HOST_KEY (or with HOST_KEY set here too).
//   BASE=http://localhost:3000 OUT=./shots EXE="C:/Program Files/Google/Chrome/Application/chrome.exe" node e2e/layout-audit.mjs
// CHANNEL picks an installed browser instead of EXE. Narrow the run with
// VARIANTS=holdem,stud7 COUNTS=8 VIEWPORTS=360x640,844x390.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = process.env.OUT ?? './layout-shots';
fs.mkdirSync(OUT, { recursive: true });
const out = (n) => path.join(OUT, n);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const list = (v, d) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : d);

const MAX_PLAYERS = { holdem: 8, omaha: 8, pineapple: 8, stud5: 8, stud7: 8, draw5: 6, three: 8, draw3: 8, bluff: 8 };
const VARIANTS = list(process.env.VARIANTS, ['holdem', 'omaha', 'pineapple', 'stud5', 'stud7', 'draw5', 'three', 'draw3', 'bluff']);
const COUNTS = list(process.env.COUNTS, ['3', '6', '8']).map(Number);
const VIEWPORTS = list(process.env.VIEWPORTS, ['360x640', '390x844', '412x915', '768x1024', '844x390', '1280x800', '1440x900', '1920x1080'])
  .map((s) => { const [width, height] = s.split('x').map(Number); return { width, height, tag: s }; });
const THEMES = ['Felt', 'Paper & ink', 'Midnight', 'Noir', 'Oxblood'];

const browser = await chromium.launch({
  channel: process.env.EXE ? undefined : process.env.CHANNEL || undefined,
  executablePath: process.env.EXE || undefined,
  headless: true,
});
const ctx = await browser.newContext({ viewport: { width: 400, height: 780 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));
page.on('dialog', (d) => d.accept());

const failures = [];
const fail = (where, what) => { failures.push(`${where}: ${what}`); };

/**
 * Everything the audit checks on one screen, run in the page. Returns a list of
 * problems, each one sentence.
 */
function probe({ table }) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const problems = [];
  const rect = (el) => el.getBoundingClientRect();
  const shown = (el) => {
    if (!el) return false;
    // Catches what a box model misses, such as the inside of a closed <details>.
    if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
    const r = rect(el);
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  const overlap = (a, b) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
  const view = { left: 0, top: 0, right: W, bottom: H };
  const label = (el) =>
    (el.getAttribute('aria-label') || el.textContent || el.className || el.tagName).toString().replace(/\s+/g, ' ').trim().slice(0, 30);

  const overflowX = document.documentElement.scrollWidth - W;
  if (overflowX > 0) problems.push(`page scrolls sideways by ${overflowX}px`);

  // Tap targets: the middle and four points 21px out from it must all land on the control.
  const controls = document.querySelectorAll('button, a[href], input:not([type=hidden]), select, summary, [role=button], [role=radio]');
  for (const el of controls) {
    if (!shown(el) || el.disabled) continue;
    if (el.closest('[inert], dialog:not([open])')) continue;
    // With a modal up, only what is in it can be pressed.
    const modal = document.querySelector('dialog[open]');
    if (modal && !modal.contains(el)) continue;
    // A label wrapping a checkbox or radio is its hit area.
    const target = el.matches('input[type=checkbox], input[type=radio]') ? el.closest('label') ?? el : el;
    const r = rect(target);
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // Scrolled away; checked when scrolled to. The window's last pixel counts as
    // away too: elementFromPoint rounds a point there onto the edge and finds nothing.
    if (cx < 0 || cy < 0 || cx > W - 1 || cy > H - 1) continue;
    const hits = [[0, 0], [-21, 0], [21, 0], [0, -21], [0, 21]].every(([dx, dy]) => {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x > W - 1 || y > H - 1) return true;
      const hit = document.elementFromPoint(x, y);
      return !!hit && target.contains(hit);
    });
    if (!hits) problems.push(`tap target under 44px: "${label(el)}" (${Math.round(r.width)}×${Math.round(r.height)})`);
  }

  if (!table) return problems;

  const area = document.querySelector('.table-area');
  if (!area) return [...problems, 'no table area'];
  const areaR = rect(area);
  const seats = [...document.querySelectorAll('.table-area .seat-card')].filter(shown);
  const named = (el) => el.querySelector('.name')?.textContent?.trim() || 'open seat';
  const fixed = [
    ['board', document.querySelector('.board .cards')],
    ['pot', document.querySelector('.board .pot')],
    ['own seat', document.querySelector('.own-seat')],
    ['action bar', document.querySelector('.action-bar, .draw-bar')],
    ['game strip', document.querySelector('.game-strip')],
    ['top bar', document.querySelector('.table-top')],
  ].filter(([, el]) => shown(el));

  for (let i = 0; i < seats.length; i++) {
    const a = rect(seats[i]);
    if (!inside(a, areaR)) problems.push(`seat "${named(seats[i])}" leaves the table area`);
    if (!inside(a, view)) problems.push(`seat "${named(seats[i])}" leaves the window`);
    for (let j = i + 1; j < seats.length; j++) {
      if (overlap(a, rect(seats[j]))) problems.push(`seats "${named(seats[i])}" and "${named(seats[j])}" overlap`);
    }
    for (const [what, el] of fixed) if (overlap(a, rect(el))) problems.push(`seat "${named(seats[i])}" covers the ${what}`);
    // A seat's own cards and chips must stay inside it.
    for (const bit of seats[i].querySelectorAll('.card, .card-tile, .chip-stack')) {
      if (!inside(rect(bit), a)) { problems.push(`seat "${named(seats[i])}" spills its cards or chips`); break; }
    }
  }
  for (const [what, el] of fixed) {
    if (!inside(rect(el), view)) problems.push(`the ${what} leaves the window`);
  }
  const board = document.querySelector('.board .cards');
  if (shown(board) && !inside(rect(board), areaR)) problems.push('the board leaves the table area');

  const pot = document.querySelector('.board .pot');
  for (const [what, sel] of [['turn stamp', '.turn-pop .plate'], ['result line', '.result-line']]) {
    const el = document.querySelector(sel);
    if (!shown(el)) continue;
    const r = rect(el);
    for (const s of seats) if (overlap(r, rect(s))) problems.push(`the ${what} covers seat "${named(s)}"`);
    if (shown(pot) && overlap(r, rect(pot))) problems.push(`the ${what} covers the pot`);
    if (board && shown(board) && overlap(r, rect(board))) problems.push(`the ${what} covers the board`);
    if (!inside(r, view)) problems.push(`the ${what} leaves the window`);
  }

  // Cards big enough to read.
  const phone = W < 900;
  const own = [...document.querySelectorAll('.own-seat .card')].filter(shown).map(rect).sort((a, b) => a.left - b.left);
  if (own.length) {
    // The seat is sized for the most cards the game deals, so that is what the minimum follows.
    const most = Number(document.querySelector('.own-seat')?.getAttribute('data-max-cards')) || own.length;
    const widest = Math.max(...own.map((r) => r.width));
    const min = phone ? (most <= 3 ? 72 : 64) : most <= 3 ? 100 : 72;
    if (widest < min - 0.5) problems.push(`own cards drawn at ${Math.round(widest)}px (want ≥${min} in a ${most}-card game)`);
    for (let i = 0; i < own.length - 1; i++) {
      const showing = own[i + 1].left - own[i].left;
      if (showing < 28) { problems.push(`own cards overlap so only ${Math.round(showing)}px of a card shows`); break; }
    }
  }
  const boardCards = [...document.querySelectorAll('.board .card, .board .slot')].filter(shown);
  if (boardCards.length) {
    const w = Math.min(...boardCards.map((el) => rect(el).width));
    if (w < 47.5) problems.push(`board cards drawn at ${Math.round(w)}px (want ≥48)`);
  }
  for (const s of seats) {
    for (const el of s.querySelectorAll('.card-face, .card-tile')) {
      if (!shown(el)) continue;
      if (el.classList.contains('card-tile')) {
        const rank = el.querySelector('.rank');
        const px = rank ? parseFloat(getComputedStyle(rank).fontSize) : 0;
        if (px < 12) { problems.push(`seat "${named(s)}" face-up tile rank at ${px}px (want ≥12)`); break; }
      } else if (rect(el).width < 60) {
        problems.push(`seat "${named(s)}" face-up card drawn at ${Math.round(rect(el).width)}px, too small to read`);
        break;
      }
    }
  }
  return problems;
}

async function check(where, { table = false, shot = null } = {}) {
  // Cards in flight from the deck are scaled and away from their seat, so let
  // them land first. A deal takes under a second, well inside the turn stamp.
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations()
      .filter((a) => ['deal-in', 'flip-in', 'chip-place'].includes(a.animationName))
      .map((a) => a.finished.catch(() => {}))),
    new Promise((r) => setTimeout(r, 1200)),
  ]));
  const problems = await page.evaluate(probe, { table });
  for (const p of new Set(problems)) fail(where, p);
  if (shot) await page.screenshot({ path: out(shot) });
  return problems.length;
}

async function unlockIfNeeded() {
  const restricted = await page.evaluate(async (b) => (await (await fetch(b + '/api/instance')).json()).restricted, BASE);
  if (!restricted) return;
  const key = process.env.HOST_KEY;
  if (!key) throw new Error('This server is host-only. Set HOST_KEY to run the audit.');
  await page.evaluate(async ([b, k]) => fetch(b + '/api/auth/claim-host', {
    method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ key: k }),
  }), [BASE, key]);
  await page.reload();
}

async function openTable(variant, players, checkLobby) {
  await page.setViewportSize({ width: 400, height: 780 });
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: 'Deal a new table' }).click();
  await page.getByRole('button', { name: 'Open the table' }).click();
  await page.waitForSelector('.seat-grid');
  await page.locator('select.select').first().selectOption(variant);
  // Long enough that the table holds still while the audit resizes it.
  await page.getByLabel('seconds to act').fill('180');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'sit here' }).first().click();
  await page.waitForTimeout(250);
  for (let i = 1; i < players; i++) {
    await page.getByRole('button', { name: '+ bot' }).first().click();
    await page.getByRole('button', { name: 'calling station', exact: true }).click();
    await page.waitForTimeout(200);
  }
  if (checkLobby) {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize(vp);
      await check(`lobby @${vp.tag}`, { shot: `lobby-${vp.tag}.png` });
    }
    await page.setViewportSize({ width: 400, height: 780 });
  }
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await page.waitForSelector('.table-area');
}

/** Has the hand got far enough to show the table at its fullest? */
async function lateEnough(variant) {
  return page.evaluate((v) => {
    const board = document.querySelectorAll('.board .card-face, .board .card-tile').length;
    const own = document.querySelectorAll('.own-seat .card').length;
    const drew = /drew \d/.test(document.querySelector('.own-seat')?.textContent ?? '');
    if (v === 'stud7') return own >= 6;
    if (v === 'stud5') return own >= 4;
    if (v === 'draw5' || v === 'draw3') return drew;
    if (v === 'three') return own >= 3;
    if (v === 'bluff') return own >= 1;
    return board >= 4;
  }, variant);
}

/**
 * Call along (and throw away the first card when asked) until the hand is late
 * enough and it is our turn, checking the turn stamp each time it lands.
 */
async function playToLateStreet(where, variant) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await page.locator('.turn-pop .plate').count()) await check(`${where} (turn stamp)`, { table: true });
    const draw = page.locator('.draw-buttons .btn-red');
    const call = page.locator('.action-bar .btn-ink:not([disabled])');
    const myTurn = (await draw.count()) > 0 || (await call.count()) > 0;
    if (myTurn && (await lateEnough(variant))) return true;
    await page.waitForTimeout((await actOnce()) ? 300 : 200);
  }
  return false;
}

/** Take one turn if it is ours: throw away the first card when asked, otherwise check or call. */
async function actOnce() {
  const draw = page.locator('.draw-buttons .btn-red');
  if (await draw.count()) {
    const picks = page.locator('.card-pick:not([disabled])');
    if (!(await page.locator('.card-pick.tossed').count())) await picks.first().click().catch(() => {});
    await draw.first().click().catch(() => {});
    return true;
  }
  const call = page.locator('.action-bar .btn-ink:not([disabled])');
  if (await call.count()) {
    await call.first().click().catch(() => {});
    return true;
  }
  return false;
}

async function tableRect() {
  return page.evaluate(() => {
    const r = document.querySelector('.table-area')?.getBoundingClientRect();
    const h = (sel) => Math.round(document.querySelector(sel)?.getBoundingClientRect().height ?? 0);
    return r ? { top: r.top, left: r.left, width: r.width, height: r.height, parts: `strip ${h('.game-strip')}, own ${h('.own-seat')}, bar ${h('.action-bar')}` } : null;
  });
}

// ---- Identity and landing ----
await page.goto(BASE + '/');
await page.getByRole('button', { name: 'Sit down' }).click();
await page.waitForSelector('.ticket');
await page.getByRole('button', { name: 'Got it' }).click();
await unlockIfNeeded();
await page.waitForSelector('text=Deal a new table');
for (const vp of VIEWPORTS) {
  await page.setViewportSize(vp);
  await check(`landing @${vp.tag}`, { shot: `landing-${vp.tag}.png` });
}

// ---- Every game at every table size ----
let lastCode = null;
for (const variant of VARIANTS) {
  for (const players of COUNTS) {
    if (players > MAX_PLAYERS[variant]) continue;
    const where = `${variant} ×${players}`;
    log(where);
    await openTable(variant, players, variant === VARIANTS[0] && players === COUNTS[0]);
    lastCode = page.url().split('/r/')[1];
    // Play at a different window size each time, so the turn stamp is checked at all of them.
    const playAt = VIEWPORTS[(VARIANTS.indexOf(variant) * COUNTS.length + COUNTS.indexOf(players)) % VIEWPORTS.length];
    await page.setViewportSize(playAt);
    if (!(await playToLateStreet(`${where} @${playAt.tag}`, variant))) fail(where, 'never reached a late street on our turn');
    await page.waitForTimeout(1800); // let the stamp lift
    for (const vp of VIEWPORTS) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(250);
      await check(`${where} @${vp.tag}`, { table: true, shot: `table-${variant}-${players}-${vp.tag}.png` });
    }

    // Showdown: call to the end, check the result line, then watch the table
    // between hands for any jump.
    const phone = VIEWPORTS[0];
    await page.setViewportSize(phone);
    await page.waitForTimeout(250);

    // The bet panel, opened: it may lie over the table, but must not squeeze it.
    const raise = page.locator('.action-bar .btn-red:not([disabled])[aria-expanded]');
    if (await raise.count()) {
      await raise.first().click();
      await page.waitForTimeout(300);
      if (await page.locator('.bet-panel').count()) {
        await check(`${where} bet panel @${phone.tag}`, { table: true, shot: `bet-${variant}-${players}-${phone.tag}.png` });
        await page.getByRole('button', { name: 'cancel' }).click();
        await page.waitForTimeout(200);
      }
    }
    const during = await tableRect();
    const until = Date.now() + 60_000;
    while (Date.now() < until && !(await page.locator('.result-line').count())) {
      await actOnce();
      await page.waitForTimeout(200);
    }
    if (await page.locator('.result-line').count()) {
      await check(`${where} settled @${phone.tag}`, { table: true, shot: `settled-${variant}-${players}-${phone.tag}.png` });
      let worst = 0;
      let worstParts = '';
      const watchUntil = Date.now() + 9000;
      while (Date.now() < watchUntil) {
        const r = await tableRect();
        const d = r && during ? Math.max(Math.abs(r.top - during.top), Math.abs(r.height - during.height), Math.abs(r.width - during.width)) : 0;
        if (d > worst) { worst = d; worstParts = `${during.parts} → ${r.parts}`; }
        await page.waitForTimeout(150);
      }
      if (worst > 1) fail(`${where} @${phone.tag}`, `the table moves ${Math.round(worst)}px between hands (${worstParts})`);
    } else {
      fail(where, 'never saw the hand settle');
    }
  }
}

// ---- Themes, on the last table ----
if (lastCode) {
  for (const theme of THEMES) {
    await page.setViewportSize({ width: 400, height: 780 });
    await page.goto(`${BASE}/me`);
    await page.waitForSelector('.theme-grid');
    await page.getByRole('radio', { name: new RegExp(`^${theme.replace('&', '\\&')}`) }).click();
    await page.goto(`${BASE}/r/${lastCode}`);
    await page.waitForSelector('.table-area');
    await page.waitForTimeout(800);
    await page.screenshot({ path: out(`theme-${theme.toLowerCase().replace(/[^a-z]+/g, '-')}.png`) });
  }
  await page.goto(`${BASE}/me`);
  await page.getByRole('radio', { name: /^Felt/ }).click();
}

// ---- Profile ----
await page.goto(`${BASE}/me`);
await page.waitForSelector('text=your profile');
for (const vp of VIEWPORTS) {
  await page.setViewportSize(vp);
  await check(`profile @${vp.tag}`, { shot: `profile-${vp.tag}.png` });
}

// ---- Night report, from the last table ----
if (lastCode) {
  await page.setViewportSize({ width: 400, height: 780 });
  await page.goto(`${BASE}/r/${lastCode}`);
  await page.waitForSelector('.table-area');
  await page.locator('.menu-wrap button').first().click();
  await page.getByRole('button', { name: 'End the night' }).click();
  await page.waitForSelector('dialog.modal[open]');
  await check('end-night dialog @400x780', { shot: 'dialog-400x780.png' });
  await page.locator('dialog.modal .modal-actions .btn').filter({ hasText: 'End the night' }).click();
  const endBy = Date.now() + 90_000;
  while (Date.now() < endBy && (await page.locator('.report-hero').count()) === 0) {
    await actOnce();
    await page.waitForTimeout(250);
  }
  if (await page.locator('.report-hero').count()) {
    for (const vp of VIEWPORTS) {
      await page.setViewportSize(vp);
      await check(`report @${vp.tag}`, { shot: `report-${vp.tag}.png` });
    }
  } else {
    fail('report', 'the night never ended');
  }
}

await browser.close();

// ---- Summary ----
const byProblem = new Map();
for (const f of failures) {
  const [where, ...rest] = f.split(': ');
  const what = rest.join(': ');
  if (!byProblem.has(what)) byProblem.set(what, []);
  byProblem.get(what).push(where);
}
fs.writeFileSync(out('layout-audit.json'), JSON.stringify(failures, null, 2));
if (failures.length === 0) {
  log('layout audit passed');
} else {
  log(`${failures.length} problems (${byProblem.size} distinct):`);
  for (const [what, wheres] of [...byProblem].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${what}  ×${wheres.length}  e.g. ${wheres.slice(0, 3).join('; ')}`);
  }
  process.exitCode = 1;
}
