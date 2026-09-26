import { currentKeys } from './keys.js';
import { pickNext, type Direction } from './padNav.js';

/**
 * Playing with a game controller, on every screen from the landing page to the
 * night report. It adds no screens of its own: the D-pad moves focus from
 * control to control, A presses, B goes back, and the table's buttons are
 * reached through the keys the app already listens for. So anything a
 * keyboard can do, a controller can.
 *
 * Buttons use the browser's standard mapping (Xbox names; on a PlayStation
 * pad A is cross, B circle, X square, Y triangle):
 *
 *   D-pad / left stick   move between controls
 *   A                    press. On a number, slider or list, start changing
 *                        it; A again is done (and Enter, which places a bet)
 *   B                    back: stop changing a value, close the dialog, the
 *                        bet slip or the menu
 *   X / Y                fold / bet or raise, as the fold and raise keys do
 *   LB / RB              on a number or slider, ten steps down or up
 *   Start                the table menu
 *   Right stick          scroll
 *
 * The D-pad always moves, so every control can be reached: a value is only
 * changed once A has picked it up, the way a console menu does it.
 */

const A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, START = 9;
const UP = 12, DOWN = 13, LEFT = 14, RIGHT = 15;

/** How long a held direction waits before it repeats, and then how often. */
const REPEAT_AFTER = 380;
const REPEAT_EVERY = 110;
const STICK = 0.55;

const FOCUSABLE = [
  'button:not([disabled])',
  'a[href]',
  'input:not([type=hidden]):not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** The number, slider or list the D-pad is changing, after A picked it up. */
let editing: HTMLElement | null = null;

function setEditing(el: HTMLElement | null): void {
  editing?.removeAttribute('data-pad-editing');
  editing = el;
  el?.setAttribute('data-pad-editing', '');
}

function isValue(el: Element | null): el is HTMLInputElement | HTMLSelectElement {
  return el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && (el.type === 'number' || el.type === 'range'));
}

/** While a controller is in use, the page says so, and focus is drawn boldly. */
function markPad(): void {
  if (document.documentElement.dataset.input !== 'pad') document.documentElement.dataset.input = 'pad';
}

export function usingPad(): boolean {
  return document.documentElement.dataset.input === 'pad';
}

/** Where focus may go: inside an open dialog or menu if there is one, else the page. */
function scope(): ParentNode {
  return document.querySelector('dialog[open]') ?? document.querySelector('.menu[role=menu]') ?? document;
}

function candidates(): HTMLElement[] {
  return [...scope().querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (el.closest('[inert], [aria-hidden="true"]')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    return el.checkVisibility ? el.checkVisibility({ visibilityProperty: true }) : true;
  });
}

function focus(el: HTMLElement): void {
  el.focus({ preventScroll: true, focusVisible: true } as FocusOptions);
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** Somewhere sensible to start: the main action on screen, else the first control. */
function home(list: HTMLElement[]): HTMLElement | undefined {
  return list.find((el) => el.matches('.btn-ink, .btn-red')) ?? list[0];
}

function move(dir: Direction): void {
  const list = candidates();
  const current = document.activeElement as HTMLElement | null;
  if (!current || current === document.body || !list.includes(current)) {
    const start = home(list);
    if (start) focus(start);
    return;
  }
  const i = pickNext(current.getBoundingClientRect(), list.map((el) => el.getBoundingClientRect()), dir);
  if (i >= 0) focus(list[i]!);
}

function fire(el: HTMLElement, type: string): void {
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

function key(target: EventTarget, k: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

/** Left or right on a control that has a value: nudge it. True if it did. */
function adjust(dir: 1 | -1, steps = 1): boolean {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement && (el.type === 'number' || el.type === 'range')) {
    for (let i = 0; i < steps; i++) { if (dir > 0) el.stepUp(); else el.stepDown(); }
    fire(el, 'input');
    fire(el, 'change');
    return true;
  }
  if (el instanceof HTMLSelectElement && steps === 1) {
    const next = el.selectedIndex + dir;
    if (next < 0 || next >= el.options.length) return true;
    el.selectedIndex = next;
    fire(el, 'change');
    return true;
  }
  return false;
}

function press(): void {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) { move('down'); return; }
  if (isValue(el)) {
    // Pick the value up to change it; A again puts it down, as Enter would.
    if (editing === el) { setEditing(null); key(el, 'Enter'); } else setEditing(el);
    return;
  }
  // A text field cannot be typed into with a pad; A submits it, as Enter would.
  if (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit'].includes(el.type)) { key(el, 'Enter'); return; }
  if (el instanceof HTMLTextAreaElement) return;
  el.click();
}

function back(): void {
  if (editing) { setEditing(null); return; }
  const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
  if (dialog) {
    // The dialog's own way out: its cancel button, or its only button.
    dialog.querySelector<HTMLElement>('.modal-actions .btn')?.click();
    return;
  }
  const menu = document.querySelector('.menu[role=menu]');
  if (menu) {
    document.querySelector<HTMLElement>('.menu-wrap > button')?.click();
    return;
  }
  key(document.activeElement ?? document.body, 'Escape');
}

/** Scroll whatever the focus sits in, or the page. */
function scroll(dy: number): void {
  let el: HTMLElement | null = document.activeElement as HTMLElement | null;
  while (el && el !== document.body) {
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) { el.scrollBy(0, dy); return; }
    el = el.parentElement;
  }
  const dialog = document.querySelector<HTMLElement>('dialog[open]');
  if (dialog && dialog.scrollHeight > dialog.clientHeight) { dialog.scrollBy(0, dy); return; }
  window.scrollBy(0, dy);
}

interface Held { since: number; last: number }

/** What each pad's buttons were last frame, to act on presses rather than holds. */
const was = new Map<number, boolean[]>();
const held = new Map<string, Held>();

/** True on the frame a direction goes down, then again at the repeat rate while it is held. */
function repeat(id: string, down: boolean, now: number): boolean {
  if (!down) { held.delete(id); return false; }
  const h = held.get(id);
  if (!h) { held.set(id, { since: now, last: now }); return true; }
  if (now - h.since >= REPEAT_AFTER && now - h.last >= REPEAT_EVERY) { h.last = now; return true; }
  return false;
}

function onDirection(dir: Direction): void {
  if (editing && editing === document.activeElement) {
    adjust(dir === 'right' || dir === 'up' ? 1 : -1);
    return;
  }
  setEditing(null);
  move(dir);
}

function poll(now: number): void {
  const pads = navigator.getGamepads?.() ?? [];
  let any = false;
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    any = true;
    const b = pad.buttons.map((x) => x.pressed);
    const prev = was.get(pad.index) ?? [];
    was.set(pad.index, b);
    const pressed = (i: number): boolean => !!b[i] && !prev[i];
    const lx = pad.axes[0] ?? 0;
    const ly = pad.axes[1] ?? 0;
    const ry = pad.axes[3] ?? 0;
    const dirs: [Direction, boolean][] = [
      ['up', !!b[UP] || ly < -STICK],
      ['down', !!b[DOWN] || ly > STICK],
      ['left', !!b[LEFT] || lx < -STICK],
      ['right', !!b[RIGHT] || lx > STICK],
    ];
    let acted = false;
    for (const [dir, down] of dirs) {
      if (repeat(`${pad.index}:${dir}`, down, now)) { onDirection(dir); acted = true; }
    }
    if (Math.abs(ry) > 0.2) { scroll(ry * 18); acted = true; }
    if (pressed(A)) { press(); acted = true; }
    if (pressed(B)) { back(); acted = true; }
    if (pressed(X)) { key(window, currentKeys().fold); acted = true; }
    if (pressed(Y)) { key(window, currentKeys().raise); acted = true; }
    if (repeat(`${pad.index}:lb`, !!b[LB], now)) { adjust(-1, 10); acted = true; }
    if (repeat(`${pad.index}:rb`, !!b[RB], now)) { adjust(1, 10); acted = true; }
    if (pressed(START)) { document.querySelector<HTMLElement>('.menu-wrap > button')?.click(); acted = true; }
    if (acted) markPad();
  }
  if (any) requestAnimationFrame(poll);
  else running = false;
}

let running = false;

function run(): void {
  if (running) return;
  running = true;
  requestAnimationFrame(poll);
}

/** A short word, the first time a controller says hello, on what its buttons do. */
function greet(): void {
  const note = document.createElement('div');
  note.className = 'toast pad-toast';
  note.setAttribute('role', 'status');
  note.textContent = 'Controller ready: A to press, B to go back, X to fold, Y to bet, Start for the menu';
  document.body.appendChild(note);
  window.setTimeout(() => note.remove(), 5000);
}

/** Listen for controllers. Once, as the app starts. */
export function startGamepad(): void {
  if (typeof navigator === 'undefined' || !('getGamepads' in navigator)) return;
  window.addEventListener('gamepadconnected', () => { greet(); markPad(); run(); });
  // The bet slip opens on its amount: with a pad, it opens ready to change.
  document.addEventListener('focusin', (e) => {
    const el = e.target as Element | null;
    if (usingPad() && el?.matches('.bet-panel input.num')) setEditing(el as HTMLElement);
    else if (editing && el !== editing) setEditing(null);
  });
  // A mouse or a finger hands the page back; the bold focus goes with it.
  window.addEventListener('pointerdown', () => { delete document.documentElement.dataset.input; }, { passive: true });
  if ([...navigator.getGamepads()].some((p) => p?.connected)) run();
}
