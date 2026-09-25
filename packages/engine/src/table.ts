import { isFullDeck, isJoker, mulberry32, rankOf, shuffle, SUIT_ORDER, suitOf, type Card } from './cards.js';
import { dealsJokers, isWildSpec, NO_WILD, type Wild, wildLabel, wildTest } from './wild.js';
import { bestHand, evaluateCards, type HandRank } from './evaluator.js';
import {
  bettingLabel, legalActions, minBet, playersInHand, playersWhoCanAct, resolveBetting,
} from './betting.js';
import { awardPots, buildPots } from './pots.js';
import { getVariant, hasVariant } from './registry.js';
import { summarizeHand } from './summary.js';
import type {
  Action, HandLogEntry, HandPlayer, HandState, LogKind, SeatIndex, TableConfig, TableEffect, TableEvent, TableState,
} from './types.js';
import type { VariantDefinition } from './variants/types.js';
import { clone } from './util.js';

export class EngineError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}

export const DEFAULT_CONFIG: TableConfig = {
  maxSeats: 8,
  variantMode: { kind: 'locked', variantId: 'holdem' },
  betting: 'variant-default',
  blinds: { small: 5, big: 10 },
  ante: 0,
  bringIn: 5,
  fixedLimit: { small: 10, big: 20 },
  fixedLimitRaiseCap: 4,
  actionSeconds: 30,
  wild: NO_WILD,
};

export function createTable(config: Partial<TableConfig> = {}): TableState {
  const cfg: TableConfig = { ...DEFAULT_CONFIG, ...config };
  if (cfg.maxSeats < 2 || cfg.maxSeats > 10) throw new EngineError('bad-config', 'maxSeats must be 2 to 10');
  return {
    config: cfg,
    seats: Array.from({ length: cfg.maxSeats }, () => null),
    button: -1,
    handNumber: 0,
    hand: null,
    lastVariantId: null,
  };
}

export interface ReduceResult {
  state: TableState;
  effects: TableEffect[];
}

/** Pure reducer. Never mutates its input; throws EngineError on illegal events. */
export function reduce(state: TableState, event: TableEvent): ReduceResult {
  const s: TableState = clone(state);
  const effects: TableEffect[] = [];
  switch (event.type) {
    case 'sit': sit(s, event); break;
    case 'stand': stand(s, event.seat, effects); break;
    case 'sit-out': sitOut(s, event.seat, event.out); break;
    case 'add-chips': addChips(s, event.seat, event.amount); break;
    case 'rename': rename(s, event.seat, event.name); break;
    case 'set-config': setConfig(s, event.config); break;
    case 'start-hand': startHand(s, event.deck, event.variantId, effects); break;
    case 'choose-variant': chooseVariant(s, event.seat, event.variantId, event.wild, effects); break;
    case 'action': applyAction(s, event.seat, event.action, effects); break;
    case 'discard': applyDiscard(s, event.seat, event.cards, effects); break;
    case 'timeout': timeout(s, event.seat, effects); break;
    case 'finish-hand': finishHand(s); break;
    default: throw new EngineError('bad-event', `Unknown event ${(event as { type: string }).type}`);
  }
  return { state: s, effects };
}

// ---------- helpers ----------

function assertSeatIndex(s: TableState, i: number): void {
  if (!Number.isInteger(i) || i < 0 || i >= s.config.maxSeats) throw new EngineError('bad-seat', `No such seat ${i}`);
}

function isHandActive(s: TableState): boolean {
  return s.hand !== null && s.hand.stage !== 'settled';
}

export function eligibleSeats(s: TableState): SeatIndex[] {
  const out: SeatIndex[] = [];
  s.seats.forEach((seat, i) => {
    if (seat && !seat.sittingOut && seat.stack > 0) out.push(i);
  });
  return out;
}

/** First seat strictly after `from` (clockwise, wrapping) that satisfies `pred`, or -1. */
function nextSeat(s: TableState, from: SeatIndex, pred: (i: SeatIndex) => boolean): SeatIndex {
  const n = s.config.maxSeats;
  for (let k = 1; k <= n; k++) {
    const i = (from + k + n) % n;
    if (pred(i)) return i;
  }
  return -1;
}

function inHand(h: HandState, i: SeatIndex): boolean {
  const p = h.players[i];
  return !!p && !p.folded;
}

function needsToAct(h: HandState, i: SeatIndex): boolean {
  const p = h.players[i];
  return !!p && !p.folded && !p.allIn && (!p.acted || p.streetBet !== h.round.currentBet);
}

function nextActor(s: TableState, h: HandState, from: SeatIndex): SeatIndex | null {
  const i = nextSeat(s, from, (j) => needsToAct(h, j));
  return i === -1 ? null : i;
}

function log(h: HandState, kind: LogKind, seat: SeatIndex | null, text: string, action?: Action): void {
  const entry: HandLogEntry = { kind, seat, text };
  if (action) entry.action = action;
  h.log.push(entry);
}

function nameOf(s: TableState, h: HandState, seat: SeatIndex): string {
  return h.players[seat]?.name ?? s.seats[seat]?.name ?? `Seat ${seat + 1}`;
}

function allowedVariants(s: TableState): string[] {
  const m = s.config.variantMode;
  return m.kind === 'locked' ? [m.variantId] : m.allowed;
}

// ---------- seating ----------

function sit(s: TableState, e: Extract<TableEvent, { type: 'sit' }>): void {
  assertSeatIndex(s, e.seat);
  if (s.seats[e.seat]) throw new EngineError('seat-taken', 'That seat is taken');
  if (!Number.isInteger(e.stack) || e.stack < 0) throw new EngineError('bad-stack', 'Stack must be a whole number');
  if (!e.player.name.trim()) throw new EngineError('bad-name', 'A name is required');
  if (s.seats.some((x) => x?.playerId === e.player.id)) throw new EngineError('already-seated', 'Already at the table');
  if (isHandActive(s) && s.hand!.players[e.seat]) throw new EngineError('seat-in-hand', 'That seat is still in the hand');
  s.seats[e.seat] = { playerId: e.player.id, name: e.player.name, kind: e.player.kind, stack: e.stack, sittingOut: false };
}

function stand(s: TableState, seat: SeatIndex, effects: TableEffect[]): void {
  assertSeatIndex(s, seat);
  if (!s.seats[seat]) throw new EngineError('empty-seat', 'Nobody is in that seat');
  const h = s.hand;
  if (h && h.stage !== 'settled') {
    const p = h.players[seat];
    if (p && h.stage === 'choosing') {
      h.players[seat] = null;
      s.seats[seat] = null;
      if (playersInHand(h).length < 2) {
        s.hand = null;
        s.handNumber--;
        return;
      }
      if (h.chooser === seat) autoChoose(s, effects);
      return;
    }
    if (p && !p.folded) {
      p.folded = true;
      p.acted = true;
      log(h, 'action', seat, `${p.name} leaves the table`);
      s.seats[seat] = null;
      if (h.round.actor === seat) h.round.actor = nextActor(s, h, seat);
      proceed(s, effects);
      return;
    }
  }
  s.seats[seat] = null;
}

function sitOut(s: TableState, seat: SeatIndex, out: boolean): void {
  assertSeatIndex(s, seat);
  const seatState = s.seats[seat];
  if (!seatState) throw new EngineError('empty-seat', 'Nobody is in that seat');
  seatState.sittingOut = out;
}

function addChips(s: TableState, seat: SeatIndex, amount: number): void {
  assertSeatIndex(s, seat);
  const seatState = s.seats[seat];
  if (!seatState) throw new EngineError('empty-seat', 'Nobody is in that seat');
  if (!Number.isInteger(amount) || amount <= 0) throw new EngineError('bad-amount', 'Amount must be a positive whole number');
  const h = s.hand;
  if (h && h.stage !== 'settled' && h.players[seat] && !h.players[seat]!.folded) {
    throw new EngineError('in-hand', 'Chips can be added after the hand');
  }
  seatState.stack += amount;
}

function rename(s: TableState, seat: SeatIndex, name: string): void {
  assertSeatIndex(s, seat);
  const seatState = s.seats[seat];
  if (!seatState) throw new EngineError('empty-seat', 'Nobody is in that seat');
  if (!name.trim()) throw new EngineError('bad-name', 'A name is required');
  seatState.name = name;
  const p = s.hand?.players[seat];
  if (p && p.playerId === seatState.playerId) p.name = name;
}

function setConfig(s: TableState, patch: Partial<TableConfig>): void {
  if (patch.maxSeats !== undefined && patch.maxSeats !== s.config.maxSeats) {
    throw new EngineError('bad-config', 'The number of seats cannot change once the table exists');
  }
  const next: TableConfig = { ...s.config, ...patch };
  const ids = next.variantMode.kind === 'locked' ? [next.variantMode.variantId] : next.variantMode.allowed;
  if (ids.length === 0) throw new EngineError('bad-config', 'Choose at least one game');
  for (const id of ids) if (!hasVariant(id)) throw new EngineError('bad-config', `Unknown game ${id}`);
  for (const [k, v] of Object.entries({
    small: next.blinds.small, big: next.blinds.big, ante: next.ante, bringIn: next.bringIn,
    flSmall: next.fixedLimit.small, flBig: next.fixedLimit.big, actionSeconds: next.actionSeconds,
  })) {
    if (!Number.isInteger(v) || v < 0) throw new EngineError('bad-config', `${k} must be a whole number`);
  }
  if (next.blinds.big <= 0 || next.fixedLimit.small <= 0) throw new EngineError('bad-config', 'Bets must be positive');
  if (next.wild !== undefined && !isWildSpec(next.wild)) throw new EngineError('bad-config', 'Those are not wild cards Calliope knows');
  s.config = next;
}

// ---------- hand lifecycle ----------

function startHand(s: TableState, deck: string[], variantId: string | undefined, effects: TableEffect[]): void {
  if (isHandActive(s)) throw new EngineError('hand-in-progress', 'A hand is already in progress');
  if (!isFullDeck(deck)) throw new EngineError('bad-deck', 'A full shuffled deck is required');
  const eligible = eligibleSeats(s);
  if (eligible.length < 2) throw new EngineError('not-enough-players', 'At least two players with chips are needed');

  let button: SeatIndex;
  if (s.button === -1 || !s.seats[s.button]) {
    // First hand: "deal for the button" using the shuffled deck's top card.
    const first = deck.find((c) => !isJoker(c))!;
    button = s.button === -1 ? eligible[rankOf(first) % eligible.length]! : nextSeat(s, s.button, (i) => eligible.includes(i));
  } else {
    button = nextSeat(s, s.button, (i) => eligible.includes(i));
  }
  s.button = button;
  s.handNumber++;

  const hand: HandState = {
    number: s.handNumber,
    variantId: '',
    betting: 'no-limit',
    deck: deck.slice(),
    streetIndex: -1,
    board: [],
    players: Array.from({ length: s.config.maxSeats }, () => null),
    round: { actor: null, currentBet: 0, lastRaiseSize: 0, raises: 0 },
    stage: 'choosing',
    button,
    chooser: null,
    muck: [],
    results: null,
    log: [],
  };
  for (const i of eligible) {
    const seat = s.seats[i]!;
    hand.players[i] = {
      seat: i, playerId: seat.playerId, name: seat.name, kind: seat.kind,
      holeDown: [], holeUp: [], streetBet: 0, committed: 0,
      folded: false, allIn: false, acted: false, revealed: false, vpip: false, pfr: false,
      discarded: [], drew: 0,
      startStack: seat.stack,
    };
  }
  s.hand = hand;

  const mode = s.config.variantMode;
  if (variantId) {
    if (!allowedVariants(s).includes(variantId)) throw new EngineError('bad-variant', 'That game is not allowed at this table');
    deal(s, variantId, s.config.wild, effects);
  } else if (mode.kind === 'locked') {
    deal(s, mode.variantId, s.config.wild, effects);
  } else {
    hand.chooser = button;
    log(hand, 'info', button, `${nameOf(s, hand, button)} has the deal and chooses the game`);
    effects.push({ type: 'await-choice', seat: button });
  }
}

function chooseVariant(s: TableState, seat: SeatIndex, variantId: string, wild: Wild | undefined, effects: TableEffect[]): void {
  const h = s.hand;
  if (!h || h.stage !== 'choosing') throw new EngineError('not-choosing', 'No game to choose right now');
  if (h.chooser !== seat) throw new EngineError('not-your-turn', 'It is not your choice');
  if (!allowedVariants(s).includes(variantId)) throw new EngineError('bad-variant', 'That game is not allowed at this table');
  if (wild !== undefined && !isWildSpec(wild)) throw new EngineError('bad-wild', 'Those are not wild cards Calliope knows');
  deal(s, variantId, wild ?? NO_WILD, effects);
}

function autoChoose(s: TableState, effects: TableEffect[]): void {
  const allowed = allowedVariants(s);
  const id = s.lastVariantId && allowed.includes(s.lastVariantId) ? s.lastVariantId : allowed[0]!;
  deal(s, id, s.config.wild, effects);
}

function postStreetBet(s: TableState, h: HandState, seat: SeatIndex, amount: number): number {
  const p = h.players[seat]!;
  const st = s.seats[seat]!;
  const a = Math.min(amount, st.stack);
  st.stack -= a;
  p.streetBet += a;
  if (st.stack === 0) p.allIn = true;
  return a;
}

function deal(s: TableState, variantId: string, wild: Wild | undefined, effects: TableEffect[]): void {
  const h = s.hand!;
  const v = getVariant(variantId);
  const cfg = s.config;
  const players = h.players.filter((p): p is HandPlayer => p !== null);
  if (players.length > v.players.max) throw new EngineError('too-many-players', `${v.name} seats at most ${v.players.max}`);
  if (players.length < v.players.min) throw new EngineError('not-enough-players', `${v.name} needs at least ${v.players.min}`);

  h.variantId = variantId;
  h.betting = resolveBetting(cfg, v);
  h.stage = 'betting';
  h.chooser = null;
  s.lastVariantId = variantId;
  log(h, 'info', null, `Hand #${h.number}: ${v.name}, ${bettingLabel(h.betting)}`);
  // Jokers are shuffled in every time, and only stay when they are wild. Taking
  // them out of a shuffled deck leaves the rest of it as random as it was.
  h.wild = wild ?? NO_WILD;
  if (!dealsJokers(h.wild)) h.deck = h.deck.filter((c) => !isJoker(c));
  const wilds = wildLabel(h.wild);
  if (wilds) log(h, 'info', null, cap(wilds));

  const ante = v.forcedBets === 'antes-bringin' ? Math.max(cfg.ante, 0) : cfg.ante;
  if (ante > 0) {
    for (const p of players) {
      const st = s.seats[p.seat]!;
      const a = Math.min(ante, st.stack);
      st.stack -= a;
      p.committed += a;
      if (st.stack === 0) p.allIn = true;
    }
    log(h, 'pot', null, `Everyone antes ${ante}`);
  }

  if (v.forcedBets === 'blinds') {
    const headsUp = players.length === 2;
    const sb = headsUp ? h.button : nextSeat(s, h.button, (i) => inHand(h, i));
    const bb = nextSeat(s, sb, (i) => inHand(h, i));
    const sbPosted = postStreetBet(s, h, sb, cfg.blinds.small);
    const bbPosted = postStreetBet(s, h, bb, cfg.blinds.big);
    log(h, 'pot', sb, `${nameOf(s, h, sb)} posts the small blind ${sbPosted}`);
    log(h, 'pot', bb, `${nameOf(s, h, bb)} posts the big blind ${bbPosted}`);
    h.round = { actor: null, currentBet: cfg.blinds.big, lastRaiseSize: cfg.blinds.big, raises: 1 };
    dealStreet(s, h, v, 0, effects);
    h.round.actor = nextActor(s, h, bb);
  } else {
    h.round = { actor: null, currentBet: 0, lastRaiseSize: minBet(cfg, v), raises: 0 };
    dealStreet(s, h, v, 0, effects);
    const bi = bringInSeat(s, h);
    const posted = postStreetBet(s, h, bi, cfg.bringIn);
    h.players[bi]!.acted = true;
    h.round.currentBet = posted;
    log(h, 'pot', bi, `${nameOf(s, h, bi)} brings it in for ${posted}`);
    h.round.actor = nextActor(s, h, bi);
  }
  proceed(s, effects);
}

/** Lowest up card brings it in; ties broken by suit (clubs lowest), then seat order. */
function bringInSeat(s: TableState, h: HandState): SeatIndex {
  let best: SeatIndex = -1;
  let bestKey = Infinity;
  for (const p of playersInHand(h)) {
    const up = p.holeUp[p.holeUp.length - 1];
    if (!up) continue;
    // A wild card showing is as good as an ace, so it never brings it in.
    const key = wildTest(h.wild)?.(up) ? 15 * 4 : rankOf(up) * 4 + SUIT_ORDER[suitOf(up)];
    if (key < bestKey) { bestKey = key; best = p.seat; }
  }
  if (best === -1) best = nextSeat(s, h.button, (i) => inHand(h, i));
  return best;
}


// ---------- drawing and discarding ----------

/** The draw rules for the street in progress, or null if it has none. */
function drawSpecOf(h: HandState, v: VariantDefinition): { min: number; max: number; replace: boolean } | null {
  return v.streets[h.streetIndex]?.draw ?? null;
}

function needsToDiscard(h: HandState, i: SeatIndex): boolean {
  const p = h.players[i];
  return !!p && !p.folded && !p.acted;
}

/**
 * A seed made from what has already happened this hand. Deterministic, so a
 * replay reshuffles the muck the same way, but not predictable to a player who
 * cannot see the thrown-away cards.
 */
function muckSeed(h: HandState): number {
  let hash = 2166136261 ^ h.number;
  for (const card of [...h.muck, ...h.board]) {
    for (let i = 0; i < card.length; i++) {
      hash ^= card.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

/**
 * Take `n` cards off the deck, shuffling the muck back in if it runs dry, which
 * a full table of draw poker will do. A player is never handed back a card they
 * have just thrown away.
 */
function takeCards(h: HandState, n: number, keepOut: readonly Card[]): Card[] {
  const out: Card[] = [];
  for (let i = 0; i < n; i++) {
    if (h.deck.length === 0) {
      const pool = h.muck.filter((c) => !keepOut.includes(c));
      if (pool.length === 0) break;
      h.muck = h.muck.filter((c) => keepOut.includes(c));
      h.deck.push(...shuffle(pool, mulberry32(muckSeed(h))));
      log(h, 'deal', null, 'The deck ran out, so the discards were shuffled back in');
    }
    const card = h.deck.shift();
    if (!card) break;
    out.push(card);
  }
  return out;
}

/** Open the discard phase for a street that has one. */
function startDiscard(s: TableState, h: HandState, v: VariantDefinition, idx: number, effects: TableEffect[]): void {
  const spec = v.streets[idx]!;
  h.streetIndex = idx;
  h.stage = 'discarding';
  for (const p of h.players) if (p) { p.acted = false; p.drew = 0; }
  const first = nextSeat(s, h.button, (i) => needsToDiscard(h, i));
  h.round.actor = first === -1 ? null : first;
  const draw = spec.draw!;
  log(h, 'street', null, draw.replace ? 'The draw' : 'Everyone throws one away');
  effects.push({ type: 'street', streetIndex: idx, name: spec.name });
}

/**
 * What to throw away when a player cannot choose: they ran out of time, or they
 * are all in and the hand is running out. Keeps whichever cards leave the best
 * hand against the board.
 */
function autoDiscard(h: HandState, v: VariantDefinition, p: HandPlayer): Card[] {
  const spec = drawSpecOf(h, v);
  if (!spec || spec.min === 0) return []; // draw poker: stand pat
  const hole = p.holeDown;
  const isWild = wildTest(h.wild);
  let best: { cards: Card[]; value: number } | null = null;
  for (let i = 0; i < hole.length; i++) {
    const kept = hole.filter((_, k) => k !== i);
    const pool = [...kept, ...h.board];
    const value = pool.length > 0 ? bestHand(pool, isWild).value : isWild?.(hole[i]!) ? -15 : -rankOf(hole[i]!);
    if (!best || value > best.value) best = { cards: [hole[i]!], value };
  }
  return best ? best.cards : hole.slice(0, spec.min);
}

/** Move one player's chosen cards to the muck, and deal replacements if the game gives them. */
function throwAway(h: HandState, p: HandPlayer, cards: readonly Card[], replace: boolean): void {
  for (const card of cards) {
    const at = p.holeDown.indexOf(card);
    if (at >= 0) p.holeDown.splice(at, 1);
    p.discarded.push(card);
    h.muck.push(card);
  }
  p.drew = 0;
  if (replace && cards.length > 0) {
    const fresh = takeCards(h, cards.length, cards);
    p.holeDown.push(...fresh);
    p.drew = fresh.length;
  }
  p.acted = true;
}

function applyDiscard(s: TableState, seat: SeatIndex, cards: Card[], effects: TableEffect[]): void {
  const h = s.hand;
  if (!h || h.stage !== 'discarding') throw new EngineError('not-discarding', 'Nobody is drawing right now');
  if (h.round.actor !== seat) throw new EngineError('not-your-turn', 'It is not your turn to draw');
  const v = getVariant(h.variantId);
  const spec = drawSpecOf(h, v);
  if (!spec) throw new EngineError('not-discarding', 'There is no draw on this street');
  const p = h.players[seat];
  if (!p || p.folded) throw new EngineError('not-in-hand', 'You are not in this hand');

  const unique = [...new Set(cards)];
  if (unique.length !== cards.length) throw new EngineError('bad-discard', 'Pick each card once');
  if (cards.length < spec.min || cards.length > spec.max) {
    throw new EngineError('bad-discard', spec.min === spec.max
      ? `Throw away exactly ${spec.min}`
      : `Throw away between ${spec.min} and ${spec.max}`);
  }
  for (const card of cards) {
    if (!p.holeDown.includes(card)) throw new EngineError('bad-discard', 'That card is not in your hand');
  }

  throwAway(h, p, cards, spec.replace);
  const verb = spec.replace
    ? cards.length === 0 ? `${p.name} stands pat` : `${p.name} draws ${cards.length}`
    : `${p.name} throws one away`;
  log(h, 'action', seat, verb);
  const next = nextSeat(s, seat, (i) => needsToDiscard(h, i));
  h.round.actor = next === -1 ? null : next;
  proceed(s, effects);
}

/** Everyone still in throws away automatically, for an all-in runout. */
function autoDiscardAll(s: TableState, h: HandState, v: VariantDefinition): void {
  const spec = drawSpecOf(h, v);
  if (!spec) return;
  for (let k = 1; k <= s.config.maxSeats; k++) {
    const i = (h.button + k) % s.config.maxSeats;
    const p = h.players[i];
    if (!p || p.folded || p.acted) continue;
    throwAway(h, p, autoDiscard(h, v, p), spec.replace);
  }
  h.round.actor = null;
}

function dealStreet(s: TableState, h: HandState, v: VariantDefinition, idx: number, effects: TableEffect[]): void {
  const spec = v.streets[idx]!;
  h.streetIndex = idx;
  const order: HandPlayer[] = [];
  for (let k = 1; k <= s.config.maxSeats; k++) {
    const i = (h.button + k) % s.config.maxSeats;
    if (inHand(h, i)) order.push(h.players[i]!);
  }
  const down = spec.deal.holeDown ?? 0;
  const up = spec.deal.holeUp ?? 0;
  const community = spec.deal.community ?? 0;
  const needed = order.length * (down + up) + community;
  if (down + up + community === 0) {
    // A pure draw street, already handled by the discard phase.
  } else if (h.deck.length < needed && down + up > 0) {
    // Stud with a full table can run out of cards: the last card is dealt shared.
    const c = h.deck.shift()!;
    h.board.push(c);
    log(h, 'street', null, `Not enough cards for everyone; a shared card is dealt: ${logCard(c)}`);
  } else {
    for (let c = 0; c < down; c++) for (const p of order) p.holeDown.push(h.deck.shift()!);
    for (let c = 0; c < up; c++) for (const p of order) p.holeUp.push(h.deck.shift()!);
    const dealt: string[] = [];
    for (let c = 0; c < community; c++) { const card = h.deck.shift()!; h.board.push(card); dealt.push(card); }
    if (community > 0) log(h, 'street', null, `${cap(spec.name)}: ${dealt.map(logCard).join(' ')}`);
    else log(h, 'street', null, `${cap(spec.name)} street dealt`);
  }
  effects.push({ type: 'street', streetIndex: idx, name: spec.name });
}

/** A card as the log writes it: its code, except a joker, which is named. */
function logCard(c: Card): string {
  return isJoker(c) ? 'Joker' : c;
}

function cap(x: string): string {
  return x.charAt(0).toUpperCase() + x.slice(1);
}

function startRound(s: TableState, h: HandState, v: VariantDefinition): void {
  for (const p of h.players) if (p) p.acted = false;
  h.round = { actor: null, currentBet: 0, lastRaiseSize: minBet(s.config, v), raises: 0 };
  let first: SeatIndex;
  if (v.firstToAct === 'best-showing') {
    first = -1;
    let bestVal = -1;
    for (let k = 1; k <= s.config.maxSeats; k++) {
      const i = (h.button + k) % s.config.maxSeats;
      if (!inHand(h, i)) continue;
      const up = h.players[i]!.holeUp.slice(-5);
      const val = up.length ? evaluateCards(up, wildTest(h.wild)).value : 0;
      if (val > bestVal) { bestVal = val; first = i; }
    }
    if (first !== -1) log(h, 'info', first, `${nameOf(s, h, first)} shows the best hand and acts first`);
  } else {
    first = h.button;
    first = nextSeat(s, first, (i) => needsToAct(h, i));
  }
  if (first === -1) { h.round.actor = null; return; }
  h.round.actor = needsToAct(h, first) ? first : nextActor(s, h, first);
}

function collectBets(s: TableState, h: HandState): void {
  const ps = h.players.filter((p): p is HandPlayer => p !== null);
  let top: HandPlayer | null = null;
  for (const p of ps) if (!top || p.streetBet > top.streetBet) top = p;
  if (top && top.streetBet > 0) {
    let othersMax = 0;
    for (const p of ps) if (p !== top) othersMax = Math.max(othersMax, p.streetBet);
    if (top.streetBet > othersMax) {
      const refund = top.streetBet - othersMax;
      const st = s.seats[top.seat];
      if (st && st.playerId === top.playerId) {
        top.streetBet = othersMax;
        st.stack += refund;
        if (top.allIn && st.stack > 0) top.allIn = false;
        log(h, 'pot', top.seat, `${top.name} takes back ${refund} that was not called`);
      }
    }
  }
  let collected = 0;
  for (const p of ps) { p.committed += p.streetBet; collected += p.streetBet; p.streetBet = 0; }
  h.round.currentBet = 0;
  if (collected > 0) {
    let pot = 0;
    for (const p of ps) pot += p.committed;
    log(h, 'pot', null, `Pot is ${pot}`);
  }
}

function revealAll(h: HandState): void {
  for (const p of playersInHand(h)) p.revealed = true;
}

/** Drive the hand forward until it needs a player's input or settles. */
function proceed(s: TableState, effects: TableEffect[]): void {
  const h = s.hand!;
  const v = getVariant(h.variantId);
  for (;;) {
    if (h.stage === 'settled' || h.stage === 'choosing') return;
    if (playersInHand(h).length === 1) {
      collectBets(s, h);
      settle(s, h, false, effects);
      return;
    }
    if (h.stage === 'betting') {
      if (h.round.actor !== null) {
        effects.push({ type: 'await-action', seat: h.round.actor });
        return;
      }
      collectBets(s, h);
      if (h.streetIndex + 1 >= v.streets.length) {
        settle(s, h, true, effects);
        return;
      }
      if (playersWhoCanAct(h).length <= 1) {
        h.stage = 'runout';
        revealAll(h);
        continue;
      }
      const next = h.streetIndex + 1;
      // A street with a draw stops for it before anything is dealt.
      if (v.streets[next]!.draw) {
        startDiscard(s, h, v, next, effects);
        continue;
      }
      dealStreet(s, h, v, next, effects);
      startRound(s, h, v);
      continue;
    }
    if (h.stage === 'discarding') {
      if (h.round.actor !== null) {
        const spec = drawSpecOf(h, v)!;
        effects.push({ type: 'await-discard', seat: h.round.actor, min: spec.min, max: spec.max, replace: spec.replace });
        return;
      }
      // Everybody has drawn: deal whatever this street deals, then bet.
      dealStreet(s, h, v, h.streetIndex, effects);
      h.stage = 'betting';
      if (v.streets[h.streetIndex]!.bet) startRound(s, h, v);
      else h.round.actor = null;
      continue;
    }
    // runout
    while (h.streetIndex + 1 < v.streets.length) {
      const idx = h.streetIndex + 1;
      if (v.streets[idx]!.draw) {
        h.streetIndex = idx;
        for (const p of h.players) if (p) p.acted = false;
        autoDiscardAll(s, h, v);
      }
      dealStreet(s, h, v, idx, effects);
    }
    settle(s, h, true, effects);
    return;
  }
}

function applyAction(s: TableState, seat: SeatIndex, action: Action, effects: TableEffect[]): void {
  const h = s.hand;
  if (!h || h.stage !== 'betting') throw new EngineError('not-betting', 'No betting is happening');
  if (h.round.actor !== seat) throw new EngineError('not-your-turn', 'It is not your turn');
  const legal = legalActions(s, seat);
  if (!legal) throw new EngineError('not-your-turn', 'It is not your turn');
  const p = h.players[seat]!;
  const st = s.seats[seat]!;
  const first = h.streetIndex === 0;

  switch (action.type) {
    case 'fold': {
      p.folded = true;
      p.acted = true;
      log(h, 'action', seat, `${p.name} folds`, action);
      break;
    }
    case 'check': {
      if (!legal.canCheck) throw new EngineError('cannot-check', `You need ${legal.toCall} to call`);
      p.acted = true;
      log(h, 'action', seat, `${p.name} checks`, action);
      break;
    }
    case 'call': {
      if (legal.toCall === 0) throw new EngineError('nothing-to-call', 'Nothing to call; check instead');
      const amt = legal.callAmount;
      st.stack -= amt;
      p.streetBet += amt;
      p.acted = true;
      if (st.stack === 0) p.allIn = true;
      if (first) p.vpip = true;
      log(h, 'action', seat, `${p.name} calls ${amt}${p.allIn ? ', all in' : ''}`, action);
      break;
    }
    case 'bet':
    case 'raise': {
      if (!legal.raise) throw new EngineError('cannot-raise', 'You cannot raise right now');
      const to = action.to;
      if (!Number.isInteger(to)) throw new EngineError('bad-amount', 'Amount must be a whole number');
      if (to < legal.raise.min || to > legal.raise.max) {
        throw new EngineError('bad-amount', `Amount must be between ${legal.raise.min} and ${legal.raise.max}`);
      }
      const amt = to - p.streetBet;
      const cb = h.round.currentBet;
      const raiseSize = to - cb;
      const completion = cb > 0 && cb < legal.step && to >= legal.step;
      const full = legal.raise.fixed || raiseSize >= h.round.lastRaiseSize || completion;
      st.stack -= amt;
      p.streetBet = to;
      p.acted = true;
      if (st.stack === 0) p.allIn = true;
      if (first) { p.vpip = true; p.pfr = true; }
      if (full) {
        for (const o of h.players) if (o && o !== p) o.acted = false;
        h.round.lastRaiseSize = Math.max(raiseSize, legal.step);
        h.round.raises++;
      }
      h.round.currentBet = to;
      const verb = cb === 0 ? `bets ${to}` : `raises to ${to}`;
      log(h, 'action', seat, `${p.name} ${verb}${p.allIn ? ', all in' : ''}`, action);
      break;
    }
    default:
      throw new EngineError('bad-action', 'Unknown action');
  }
  h.round.actor = nextActor(s, h, seat);
  proceed(s, effects);
}

function timeout(s: TableState, seat: SeatIndex, effects: TableEffect[]): void {
  const h = s.hand;
  if (!h) throw new EngineError('no-hand', 'No hand in progress');
  if (h.stage === 'choosing') {
    if (h.chooser !== seat) throw new EngineError('not-your-turn', 'Not the chooser');
    autoChoose(s, effects);
    return;
  }
  if (h.stage === 'discarding') {
    if (h.round.actor !== seat) throw new EngineError('not-your-turn', 'Not the actor');
    const v = getVariant(h.variantId);
    const p = h.players[seat]!;
    log(h, 'info', seat, `${p.name} ran out of time`);
    applyDiscard(s, seat, autoDiscard(h, v, p), effects);
    return;
  }
  if (h.stage !== 'betting' || h.round.actor !== seat) throw new EngineError('not-your-turn', 'Not the actor');
  const legal = legalActions(s, seat)!;
  const p = h.players[seat]!;
  log(h, 'info', seat, `${p.name} ran out of time`);
  applyAction(s, seat, legal.canCheck ? { type: 'check' } : { type: 'fold' }, effects);
}

function settle(s: TableState, h: HandState, showdown: boolean, effects: TableEffect[]): void {
  const v = getVariant(h.variantId);
  const contenders = playersInHand(h);
  const ranks = new Map<SeatIndex, HandRank>();
  if (showdown) {
    for (const p of contenders) {
      p.revealed = true;
      ranks.set(p.seat, v.evaluate([...p.holeDown, ...p.holeUp], h.board, wildTest(h.wild)));
    }
  } else {
    for (const p of contenders) ranks.set(p.seat, { category: 0, ranks: [], value: 0, label: '', cards: [] });
  }
  const pots = buildPots(h.players);
  const awards = awardPots(pots, ranks, h.button, s.config.maxSeats);
  const winners = new Set<SeatIndex>();
  for (const award of awards) {
    for (const [seatKey, amt] of Object.entries(award.payouts)) {
      const seat = Number(seatKey);
      const st = s.seats[seat];
      const p = h.players[seat];
      if (st && p && st.playerId === p.playerId) st.stack += amt;
      winners.add(seat);
    }
    const names = award.winners.map((w) => nameOf(s, h, w));
    const label = showdown && award.winners[0] !== undefined ? ranks.get(award.winners[0])?.label : undefined;
    const potName = awards.length > 1 ? (award === awards[0] ? 'the main pot' : 'a side pot') : 'the pot';
    if (names.length === 1) {
      log(h, 'result', award.winners[0]!, `${names[0]} wins ${potName} of ${award.amount}${label ? ` with ${label.toLowerCase()}` : ''}`);
    } else if (names.length > 1) {
      log(h, 'result', null, `${names.join(' and ')} split ${potName} of ${award.amount}${label ? ` with ${label.toLowerCase()}` : ''}`);
    }
  }
  const net: Record<SeatIndex, number> = {};
  const hands: Record<SeatIndex, HandRank> = {};
  for (const p of h.players) {
    if (!p) continue;
    const st = s.seats[p.seat];
    net[p.seat] = st && st.playerId === p.playerId ? st.stack - p.startStack : -p.committed;
    if (showdown && ranks.has(p.seat)) hands[p.seat] = ranks.get(p.seat)!;
  }
  h.results = { showdown, pots: awards, hands, net, winners: [...winners] };
  h.stage = 'settled';
  h.round.actor = null;
  effects.push({ type: 'hand-settled', summary: summarizeHand(s) });
}

function finishHand(s: TableState): void {
  if (!s.hand) throw new EngineError('no-hand', 'No hand to finish');
  if (s.hand.stage !== 'settled') throw new EngineError('hand-in-progress', 'The hand is not over');
  s.hand = null;
}
