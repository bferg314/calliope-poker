import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  getVariant, legalActions, type Action, type HandView, type TableState,
} from '@calliope/engine';
import { SERVER_LIMIT_WARNING_MINUTES, stakesLabel, type RoomView } from '@calliope/shared';
import { Board, Pot } from '../components/Board.js';
import { Card } from '../components/Card.js';
import { useActiveDeck } from '../decks.js';
import { SeatCard } from '../components/Seat.js';
import { ActionBar } from '../components/ActionBar.js';
import { DrawBar } from '../components/DrawBar.js';
import { GameStrip } from '../components/GameStrip.js';
import { Invite } from '../components/Invite.js';
import { useConfirm } from '../components/Modal.js';
import { ThemePicker } from '../components/ThemePicker.js';
import { Toast } from '../components/Toast.js';
import { TurnPop } from '../components/TurnPop.js';
import { LastHandPop } from '../components/LastHandPop.js';
import { bellOn, ringBell, setBellOn } from '../bell.js';
import { copyText } from '../clipboard.js';
import { absoluteUrl, fmt, fmtDuration, fmtMoney } from '../format.js';
import { Link } from '../router.js';
import { useNow, type RoomSocket } from '../ws.js';
import { Icon } from '../components/Icon.js';
import { useChipFlights, useDealFromDeck } from '../tableMotion.js';

/**
 * How the table is laid out, decided once here and handed to CSS as
 * `data-layout` so the two can never disagree (docs/design.md §4):
 *
 * - `phone`: portrait, narrower than 900px. Seats in a horseshoe grid.
 * - `short`: a phone on its side or any window under 520px tall. The table on
 *   the left, your own seat and the action bar in a column on the right.
 * - `wide`: 900px and up. Seats on an ellipse round the felt.
 */
type TableLayout = 'phone' | 'short' | 'wide';

const LAYOUT_QUERIES: [TableLayout, string][] = [
  ['short', '(max-height: 519px) and (min-aspect-ratio: 1/1)'],
  ['wide', '(min-width: 900px)'],
];

function currentLayout(): TableLayout {
  for (const [layout, q] of LAYOUT_QUERIES) if (window.matchMedia(q).matches) return layout;
  return 'phone';
}

function useTableLayout(): TableLayout {
  const [layout, setLayout] = useState(currentLayout);
  useEffect(() => {
    const mqs = LAYOUT_QUERIES.map(([, q]) => window.matchMedia(q));
    const onChange = (): void => setLayout(currentLayout());
    for (const mq of mqs) mq.addEventListener('change', onChange);
    return () => { for (const mq of mqs) mq.removeEventListener('change', onChange); };
  }, []);
  return layout;
}

/** The size of an element, kept up to date. */
function useSize(): [(el: HTMLElement | null) => void, { width: number; height: number }] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!el) return;
    const measure = (): void => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.width - r.width) < 1 && Math.abs(s.height - r.height) < 1 ? s : { width: r.width, height: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size];
}

/**
 * Which opponents sit up the left side, across the top and down the right, in
 * the phone's horseshoe. Clockwise from the player, who is at the bottom: the
 * first opponent is at the bottom of the left column.
 */
function horseshoe(m: number): { left: number; top: number; right: number } {
  if (m <= 2) return { left: 0, top: m, right: 0 };
  if (m <= 5) return { left: 1, top: m - 2, right: 1 };
  return { left: 2, top: m - 4, right: 2 };
}

/**
 * Where opponent k of m sits on the wide table's ellipse: evenly round it, with
 * the player's own place at the bottom counted as one of the positions.
 */
function ellipsePosition(k: number, m: number): CSSProperties {
  const angle = (90 + (360 * k) / (m + 1)) * (Math.PI / 180);
  return { '--cos': Math.cos(angle).toFixed(4), '--sin': Math.sin(angle).toFixed(4) } as CSSProperties;
}

/** Board card width: as big as the room allows, never smaller than a card can be read at. */
function boardCardWidth(layout: TableLayout, area: { width: number; height: number }, slots: number, opponents: number): number {
  if (!area.width || slots === 0) return layout === 'wide' ? 72 : 48;
  if (layout === 'wide') {
    // The biggest board that clears every seat on the upper half of the
    // ellipse. Mirrors the CSS: seats are --seat-w (168px) by about 2 ×
    // --seat-hh (104px), inset 8px; the board's bottom edge is at 48%.
    const { width: W, height: H } = area;
    const seatHalfW = 84;
    const seatHalfH = 52;
    const fits = (cw: number): boolean => {
      const boardHalfW = (slots * cw + (slots - 1) * 4) / 2;
      const boardTop = H * 0.48 - cw * 1.4;
      for (let k = 1; k <= opponents; k++) {
        const a = ((90 + (360 * k) / (opponents + 1)) * Math.PI) / 180;
        const cy = H / 2 + (H / 2 - seatHalfH - 8) * Math.sin(a);
        if (cy + seatHalfH < boardTop - 4) continue; // clear above the board
        const dx = Math.abs((W / 2 - seatHalfW - 8) * Math.cos(a));
        if (dx - seatHalfW - 8 < boardHalfW) return false;
      }
      return true;
    };
    let cw = Math.round(Math.min(120, H * 0.18, (W * 0.5) / slots));
    while (cw > 56 && !fits(cw)) cw -= 2;
    return cw;
  }
  const byWidth = (area.width - 16 - (slots - 1) * 4) / slots;
  // Two seats stacked in each side column take most of the height a phone has.
  const crowded = horseshoe(opponents).left >= 2;
  const byHeight = (area.height * (crowded ? 0.19 : 0.24)) / 1.4;
  return Math.round(Math.min(64, Math.max(48, Math.min(byWidth, byHeight))));
}

/**
 * The player's own cards: the loudest thing on the screen, as big as the seat
 * allows. Sized for the most cards this game can deal, so they do not shrink
 * street by street, and overlapped only when even the smallest readable size
 * will not fit side by side. Returns the width and the step from one card to the next.
 */
function ownCardSize(layout: TableLayout, width: number, count: number): { cw: number; step: number; beside: boolean } {
  const gap = 6;
  if (layout === 'wide') {
    const cw = count <= 3 ? 112 : count <= 5 ? 88 : 76;
    return { cw, step: cw + gap, beside: true };
  }
  const avail = Math.max(0, width - 24);
  if (count <= 2) {
    const cw = Math.round(Math.min(88, Math.max(72, (avail - 132 - gap * (count - 1)) / count)));
    return { cw, step: cw + gap, beside: true };
  }
  const max = count >= 4 ? 64 : 72;
  const fit = (avail - gap * (count - 1)) / count;
  if (fit >= 64) {
    const cw = Math.round(Math.min(max, fit));
    return { cw, step: cw + gap, beside: false };
  }
  return { cw: 64, step: Math.floor((avail - 64) / (count - 1)), beside: false };
}

/** The most cards a player holds in this game, face up and down together. */
function maxHoleCards(variantId: string | null | undefined): number {
  if (!variantId) return 2;
  try {
    return getVariant(variantId).streets.reduce((a, s) => a + (s.deal.holeDown ?? 0) + (s.deal.holeUp ?? 0), 0) || 2;
  } catch {
    return 2;
  }
}

/**
 * Whether this game deals some cards face up, as stud does. Only then is it
 * worth marking which of a player's own cards the table cannot see: in hold'em
 * or draw every one of them is hidden, and a mark on each says nothing.
 */
function dealsUpCards(variantId: string | null | undefined): boolean {
  if (!variantId) return false;
  try {
    return getVariant(variantId).streets.some((s) => (s.deal.holeUp ?? 0) > 0);
  } catch {
    return false;
  }
}

/** Blind Man's Bluff and the like: your own up cards are the ones you cannot see. */
function hidesOwnUpCards(variantId: string | null | undefined): boolean {
  if (!variantId) return false;
  try {
    return !!getVariant(variantId).ownUpCardsHidden;
  } catch {
    return false;
  }
}

/**
 * A player's cards in the order they were dealt. Down and up cards are kept
 * apart, so stud's seventh-street down card would otherwise sit beside the
 * first two; walking the streets puts each card back where it came.
 */
function dealOrder<T>(variantId: string | null | undefined, down: T[], up: T[]): { c: T; k: string; down: boolean }[] {
  const out: { c: T; k: string; down: boolean }[] = [];
  let d = 0;
  let u = 0;
  const take = (n: number, from: T[], at: number, tag: string): number => {
    const end = Math.min(from.length, at + n);
    for (let i = at; i < end; i++) out.push({ c: from[i]!, k: `${tag}${i}`, down: tag === 'd' });
    return end;
  };
  try {
    if (variantId) {
      for (const s of getVariant(variantId).streets) {
        d = take(s.deal.holeDown ?? 0, down, d, 'd');
        u = take(s.deal.holeUp ?? 0, up, u, 'u');
      }
    }
  } catch {
    // Unknown variant: fall through and show what's left, down then up.
  }
  take(Infinity, down, d, 'd');
  take(Infinity, up, u, 'u');
  return out;
}

function ownHandLabel(hand: HandView | null, seat: number | null): string | null {
  if (!hand || seat === null) return null;
  const p = hand.players[seat];
  if (!p || p.folded) return null;
  const hole = [...p.holeDown, ...p.holeUp].filter((c): c is string => c !== null);
  if (hole.length === 0) return null;
  // The game's own rules, so three-card hands rank as three-card hands. A game
  // that cannot rank yet (Omaha before the flop) throws, and shows nothing.
  try {
    return getVariant(hand.variantId).evaluate(hole, hand.board).label;
  } catch {
    return null;
  }
}

export function Table({ room, socket }: { room: RoomView; socket: RoomSocket }): JSX.Element {
  const now = useNow(250) + socket.skew;
  const confirm = useConfirm();
  const layout = useTableLayout();
  const wide = layout === 'wide';
  const [tableAreaRef, area] = useSize();
  const [betSlot, setBetSlot] = useState<HTMLDivElement | null>(null);
  const table = room.table;
  const hand = table.hand;
  const me = room.me;
  const mySeat = me?.seat ?? null;
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmFold, setConfirmFold] = useState(() => {
    try { return localStorage.getItem('calliope.confirmFold') === '1'; } catch { return false; }
  });
  const [bell, setBell] = useState(bellOn);
  const [announce, setAnnounce] = useState('');
  const [levelUp, setLevelUp] = useState<string | null>(null);
  const [turnPop, setTurnPop] = useState(false);
  const [lastHandPop, setLastHandPop] = useState(false);
  const seenPhase = useRef(room.phase);
  const [selected, setSelected] = useState<string[]>([]);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const seenLevel = useRef(room.level.index);
  const screenRef = useRef<HTMLDivElement>(null);
  const wasMyTurn = useRef(false);

  const legal = useMemo(() => {
    if (mySeat === null || !hand || hand.stage !== 'betting' || hand.round.actor !== mySeat) return null;
    try {
      return legalActions(table as unknown as TableState, mySeat);
    } catch {
      return null;
    }
  }, [table, hand, mySeat]);

  // In dealer's choice the hand exists before anyone has picked a game, and
  // variantId is empty until they do. Asking the engine for '' throws.
  const variant = hand && hand.variantId ? getVariant(hand.variantId) : null;
  // Between hands the table still shows the game it is set to, so the board
  // keeps its slots (or has none, for stud and draw) and nothing moves.
  const mode = room.settings.variantMode;
  const tableVariant = variant ?? (mode.kind === 'locked' ? getVariant(mode.variantId) : null);
  const boardSlots = tableVariant ? tableVariant.streets.reduce((a, s) => a + (s.deal.community ?? 0), 0) : 5;
  const drawSpec = variant && hand?.stage === 'discarding' ? variant.streets[hand.streetIndex]?.draw ?? null : null;
  const myDraw = drawSpec && hand?.round.actor === mySeat && mySeat !== null ? drawSpec : null;
  const actorSeat = hand?.stage === 'betting' || hand?.stage === 'discarding'
    ? hand.round.actor
    : hand?.stage === 'choosing' ? hand.chooser : null;
  const actorName = actorSeat !== null && actorSeat !== undefined ? table.seats[actorSeat]?.name ?? null : null;
  const myTurn = mySeat !== null && actorSeat === mySeat;
  // What the turn is actually asking for, so the popup is worth more than a nudge.
  const turnHint = hand?.stage === 'choosing'
    ? 'pick the game'
    : myDraw
      ? myDraw.replace ? 'the draw' : myDraw.max === 1 ? 'throw one away' : 'the discard'
      : legal
        ? legal.canCheck
          // The big blind can check and *raise*, not bet, so ask the engine
          // rather than guessing: the hint has to match the button beneath it.
          ? legal.raise ? `check or ${legal.raise.kind}` : 'check'
          : `${fmt(legal.callAmount)} to call`
        : null;
  const timerFraction = room.deadline ? Math.max(0, (room.deadline - now) / (room.settings.actionSeconds * 1000)) : null;
  const settled = hand?.stage === 'settled';
  const winners = new Set(settled ? hand!.results!.winners : []);
  const winAmounts: Record<number, number> = {};
  if (settled) for (const pot of hand!.results!.pots) for (const [s, a] of Object.entries(pot.payouts)) winAmounts[Number(s)] = (winAmounts[Number(s)] ?? 0) + a;

  useDealFromDeck(screenRef, hand?.number ?? null);
  const flights = useChipFlights(screenRef, hand, winAmounts, room.settings.chips.denominations);

  // Screen reader announcements from the log.
  const lastLog = hand?.log[hand.log.length - 1]?.text ?? '';
  useEffect(() => {
    if (legal) setAnnounce('Your turn');
    else if (lastLog) setAnnounce(lastLog);
  }, [legal, lastLog]);

  /*
   * The table going into its last hand is announced once, on the change itself:
   * someone who reconnects partway through it gets the strip, not the plate.
   * After the log's announcement, so the same deal does not talk over it.
   */
  useEffect(() => {
    const was = seenPhase.current;
    seenPhase.current = room.phase;
    if (room.phase === 'final-hand' && was !== 'final-hand') {
      setLastHandPop(true);
      setAnnounce('Last hand of the night');
    }
  }, [room.phase]);

  useEffect(() => {
    if (!lastHandPop) return;
    const hide = (): void => setLastHandPop(false);
    const timer = window.setTimeout(hide, 3000);
    window.addEventListener('pointerdown', hide, { passive: true });
    window.addEventListener('keydown', hide);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', hide);
      window.removeEventListener('keydown', hide);
    };
  }, [lastHandPop]);

  /*
   * The action reaching you is the one thing you may have looked away for, so
   * ring a bell and stamp "your turn" onto the table. Edge-triggered on the turn
   * itself: a redraw mid-turn must not ring again, and two turns in the same
   * hand must both ring. Acting takes the stamp down with it.
   */
  useEffect(() => {
    if (myTurn === wasMyTurn.current) return;
    wasMyTurn.current = myTurn;
    setTurnPop(myTurn);
    if (myTurn) ringBell();
  }, [myTurn]);

  /*
   * How long it hangs about. This is kept apart from the ring above so that the
   * timer is owned by the stamp being up rather than by the edge that raised it:
   * an effect that both rings once and times out cannot survive its own cleanup,
   * and would leave the stamp on the table for the rest of the hand in dev.
   * A tap or a keypress lifts it early, so somebody already watching gets the
   * board straight back. While the last-hand plate is up the stamp waits its
   * turn behind it, so the two never sit on the table at once.
   */
  useEffect(() => {
    if (!turnPop || lastHandPop) return;
    const hide = (): void => setTurnPop(false);
    const timer = window.setTimeout(hide, 1600);
    window.addEventListener('pointerdown', hide, { passive: true });
    window.addEventListener('keydown', hide);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', hide);
      window.removeEventListener('keydown', hide);
    };
  }, [turnPop, lastHandPop]);

  useEffect(() => {
    if (room.level.index <= seenLevel.current) {
      seenLevel.current = room.level.index;
      return;
    }
    seenLevel.current = room.level.index;
    setLevelUp(stakesLabel(room.level.stakes));
    const timer = window.setTimeout(() => setLevelUp(null), 9000);
    return () => window.clearTimeout(timer);
  }, [room.level.index, room.level.stakes]);

  useEffect(() => {
    setSelected([]);
  }, [hand?.number, hand?.streetIndex, hand?.stage, hand?.round.actor]);

  const showInvite = async (): Promise<void> => {
    await confirm({
      title: 'Invite someone',
      body: <Invite code={room.code} joinUrl={room.joinUrl} hasPassword={room.hasPassword} qrSize={200} />,
      confirmLabel: 'Done',
      hideCancel: true,
    });
  };

  const copyLink = async (): Promise<void> => {
    const ok = await copyText(absoluteUrl(room.joinUrl));
    if (ok) {
      setCopyNote('Join link copied');
      setTimeout(() => setCopyNote(null), 2000);
    } else {
      void showInvite(); // clipboard is blocked, so show it to copy by hand
    }
  };

  const send = (a: Action): void => socket.send({ type: 'action', action: a });
  const toggleCard = (card: string): void => {
    if (!myDraw) return;
    setSelected((cur) => {
      if (cur.includes(card)) return cur.filter((c) => c !== card);
      if (cur.length >= myDraw.max) return myDraw.max === 1 ? [card] : cur;
      return [...cur, card];
    });
  };
  const chips = room.settings.chips;
  const rebuy = async (): Promise<void> => {
    const worth = chips.buyInValue > 0 ? ` That is ${fmtMoney(chips.buyInValue, chips.currency)} into the ledger.` : '';
    if (await confirm({
      title: `Re-buy ${fmt(chips.buyInChips)} chips?`,
      body: <p>You buy back in for another {fmt(chips.buyInChips)} chips.{worth}</p>,
      confirmLabel: 'Re-buy',
    })) socket.send({ type: 'rebuy' });
  };
  const isHost = !!me?.isHost;
  const n = table.seats.length;
  const viewer = mySeat ?? 0;
  const denoms = room.settings.chips.denominations;
  const clockLeft = room.clock.endsAt !== null ? room.clock.endsAt - now : room.clock.remainingMs;
  const level = room.level;
  const msToLevel = level.nextAt !== null ? level.nextAt - now : level.msUntilNext;

  // Everyone else at the table, clockwise from the player. Empty seats are not
  // drawn: the host adds bots from the menu, and a watcher takes the next seat
  // from their own panel, so an open chair is not worth the room on the felt.
  const opponents: number[] = [];
  for (let k = mySeat === null ? 0 : 1; k < n; k++) {
    const idx = (viewer + k) % n;
    if (table.seats[idx]) opponents.push(idx);
  }
  const m = opponents.length;
  const split = wide ? { left: 0, top: m, right: 0 } : horseshoe(m);
  const shoe = {
    // The left column is filled bottom to top, so it is listed top first.
    left: opponents.slice(0, split.left).reverse(),
    top: opponents.slice(split.left, split.left + split.top),
    right: opponents.slice(split.left + split.top),
  };
  const sides = split.left + split.right > 0;
  const boardCardW = boardCardWidth(layout, area, boardSlots, m);
  const seatCardW = wide ? 30 : 22;
  const seatEl = (idx: number): JSX.Element => {
    const seat = table.seats[idx]!;
    const member = room.members.find((mm) => mm.id === seat.playerId);
    return (
      <div key={idx} className="seat" data-seat={idx} style={wide ? ellipsePosition(opponents.indexOf(idx) + 1, m) : undefined}>
        <SeatCard
          seat={seat}
          player={hand?.players[idx] ?? null}
          isButton={!!hand && hand.button === idx}
          toAct={actorSeat === idx}
          timerFraction={actorSeat === idx ? timerFraction : null}
          connected={member?.connected ?? true}
          isWinner={winners.has(idx)}
          winAmount={winAmounts[idx] ?? 0}
          handLabel={settled && hand!.results!.hands[idx] ? hand!.results!.hands[idx]!.label : null}
          denoms={denoms}
          cardWidth={seatCardW}
        />
      </div>
    );
  };

  // The strip under the top bar carries whatever the table is waiting on, in
  // place of the notice bars that used to push the table down every hand.
  const seatedWithChips = table.seats.filter((st) => st && st.stack > 0 && !st.sittingOut).length;
  // Out of chips, the next thing to do is buy back in, so it goes where the
  // buttons are rather than in a corner of the seat.
  const canRebuyNow = !!me?.canRebuy && mySeat !== null && table.seats[mySeat]?.stack === 0 && !legal;
  const canDeal = isHost && room.phase === 'playing' && !hand && !room.settings.autoDeal && seatedWithChips >= 2;
  // A public table the server will close soon says so, well before it happens.
  const closesIn = room.serverLimit ? room.serverLimit.expiresAt - now : null;
  const closingSoon = closesIn !== null && closesIn <= SERVER_LIMIT_WARNING_MINUTES * 60_000;
  const stripNote = hand?.stage === 'discarding'
    ? (drawSpec?.replace ? 'the draw' : 'everyone throws one away')
    : levelUp
      ? `stakes are up: ${levelUp}`
      : room.phase === 'final-hand'
        ? 'last hand of the night'
        : closingSoon
          ? `the server closes this table in ${fmtDuration(Math.max(0, closesIn!))}`
        : room.phase === 'paused'
          ? isHost ? 'paused. resume from the menu' : 'paused, and so is the clock'
          : room.phase === 'playing' && !hand
            ? seatedWithChips < 2
              ? 'waiting for a second player'
              : room.settings.autoDeal
                ? 'shuffling'
                : isHost ? 'deal when you are ready' : 'waiting for the host to deal'
            : null;
  const stripAlert = !!levelUp || room.phase === 'final-hand' || closingSoon;

  const resultLine = settled
    ? hand!.log.filter((l) => l.kind === 'result').map((l) => l.text).join(' · ')
    : null;

  return (
    <div className="table-screen" data-layout={layout} ref={screenRef}>
      <header className="table-top">
        <Link to="/" className="brand">Calliope</Link>
        <button
          className="room-code smallcaps room-code-button hit"
          onClick={() => void copyLink()}
          title="Copy the join link"
          aria-label={`Room ${room.code}. Copy the join link.`}
        >
          {room.code}
        </button>
        {clockLeft !== null && (
          <span
            className={`clock ${room.phase === 'final-hand' ? 'final' : ''}`}
            title={room.clock.running ? 'Time left tonight' : 'Paused'}
            style={room.clock.running ? undefined : { opacity: 0.6 }}
          >
            {room.phase === 'final-hand' ? 'last hand' : fmtDuration(clockLeft)}
          </span>
        )}
        {level.rising && (
          <span className={`level-chip ${msToLevel !== null && msToLevel <= 60_000 ? 'due' : ''}`} title="Stakes are rising">
            <span className="label">lvl {level.index + 1}</span>
            <span className="stake">{stakesLabel(level.stakes)}</span>
            {level.next && (
              <span className="until">
                {msToLevel !== null
                  ? `up in ${fmtDuration(Math.max(0, msToLevel))}`
                  : level.handsUntilNext !== null
                    ? `up in ${level.handsUntilNext} ${level.handsUntilNext === 1 ? 'hand' : 'hands'}`
                    : ''}
              </span>
            )}
          </span>
        )}
        <span className="grow" />
        <span className="micro hand-count">hand {room.handCount + (hand ? 1 : 0)}</span>
        <div className="menu-wrap">
          <button className="btn btn-quiet btn-small" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-haspopup="menu">
            <span className="topbar-name">{me?.name ?? 'menu'}</span>
            <Icon name="chevron-down" />
          </button>
          {menuOpen && (
            <div className="menu" role="menu" onClick={() => setMenuOpen(false)}>
              {me && mySeat !== null && (
                <button className="btn" onClick={() => socket.send({ type: 'sit-out', out: !table.seats[mySeat]?.sittingOut })}>
                  {table.seats[mySeat]?.sittingOut ? 'Deal me back in' : 'Sit out a while'}
                </button>
              )}
              {me && mySeat !== null && (
                <button
                  className="btn"
                  onClick={() => void (async () => {
                    const capped = room.settings.rebuys.maxCount !== null;
                    if (await confirm({
                      title: 'Stand up?',
                      body: (
                        <p>
                          Your {fmt(table.seats[mySeat]?.stack ?? 0)} chips come off the table and the seat opens up.
                          {capped ? ' Sitting back down later spends one of your re-buys.' : ' You can sit back down later.'}
                        </p>
                      ),
                      confirmLabel: 'Stand up',
                      tone: 'danger',
                    })) socket.send({ type: 'stand' });
                  })()}
                >
                  Stand up
                </button>
              )}
              {me?.canRebuy && (
                <button className="btn" onClick={() => void rebuy()}>
                  Re-buy {fmt(room.settings.chips.buyInChips)} chips
                </button>
              )}
              {/*
                * Toggles stay put: closing the menu on this click would unmount
                * the label before the browser gets to activate the checkbox
                * inside it, and the tick would never move.
                */}
              <div className="menu-checks" onClick={(e) => e.stopPropagation()}>
                <label className="check">
                  <input type="checkbox" checked={confirmFold} onChange={(e) => { setConfirmFold(e.target.checked); try { localStorage.setItem('calliope.confirmFold', e.target.checked ? '1' : '0'); } catch { /* ignore */ } }} />
                  Confirm folds
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={bell}
                    onChange={(e) => {
                      setBell(e.target.checked);
                      setBellOn(e.target.checked);
                      if (e.target.checked) ringBell(); // so you hear what you just chose
                    }}
                  />
                  Turn bell
                </label>
              </div>
              {isHost && (
                <>
                  <div className="menu-head label">host</div>
                  {room.phase === 'playing' ? (
                    <button className="btn" onClick={() => socket.send({ type: 'host', command: { kind: 'pause' } })}>Pause after this hand</button>
                  ) : room.phase === 'paused' ? (
                    <button className="btn" onClick={() => socket.send({ type: 'host', command: { kind: 'start' } })}>Resume dealing</button>
                  ) : null}
                  {!room.settings.autoDeal && room.phase === 'playing' && !hand && (
                    <button className="btn" onClick={() => socket.send({ type: 'host', command: { kind: 'deal' } })}>Deal the next hand</button>
                  )}
                  <button className="btn" onClick={() => socket.send({ type: 'host', command: { kind: 'extend', minutes: 15 } })}>Add 15 minutes</button>
                  <button className="btn" onClick={() => socket.send({ type: 'host', command: { kind: 'add-bot', seat: table.seats.findIndex((s) => s === null) } })} disabled={!table.seats.some((s) => s === null)}>Add a bot</button>
                  <button
                    className="btn"
                    onClick={() => void (async () => {
                      if (await confirm({
                        title: 'End the night?',
                        body: (
                          <p>
                            {hand ? 'The hand in progress finishes first, then the' : 'The'} night report is worked out and the
                            table closes. Nobody can play another hand afterwards.
                          </p>
                        ),
                        confirmLabel: 'End the night',
                        tone: 'danger',
                      })) socket.send({ type: 'host', command: { kind: 'end-night' } });
                    })()}
                  >
                    End the night
                  </button>
                </>
              )}
              <div className="menu-head label">look</div>
              <div onClick={(e) => e.stopPropagation()}>
                <ThemePicker compact />
              </div>
              <button className="btn" onClick={() => void showInvite()}>Invite someone</button>
              <Link to="/me" className="btn">My record</Link>
            </div>
          )}
        </div>
      </header>

      <GameStrip room={room} note={stripNote} alert={stripAlert} />

      <div className="table-layout">
        <div className={`table-main ${layout === 'short' ? 'side-by-side' : ''}`}>
          <div
            className={`table-area ${sides ? 'has-sides' : ''}`}
            ref={tableAreaRef}
            style={{ '--board-card': `${boardCardW}px`, '--seat-card': `${seatCardW}px` } as CSSProperties}
          >
            <div className="table-surface" aria-hidden="true" />
            <div className="seats seats-top">{shoe.top.map(seatEl)}</div>
            <Board hand={hand} slots={boardSlots} cardWidth={boardCardW} />
            <div className="seats seats-left">{shoe.left.map(seatEl)}</div>
            <div className="middle">
              <Pot hand={hand} />
              <div className="stage">
                {resultLine && <div className="result-line">{resultLine}</div>}
                {turnPop && !lastHandPop && <TurnPop hint={turnHint} />}
              </div>
            </div>
            <div className="seats seats-right">{shoe.right.map(seatEl)}</div>
            <div className="bet-slot" ref={setBetSlot} />
            {lastHandPop && <LastHandPop />}
            {hand?.stage === 'choosing' && (
              <div className="choose-panel">
                <div className="label">{hand.chooser === mySeat ? 'your deal. pick the game' : `${actorName ?? 'the dealer'} is choosing the game`}</div>
                {hand.chooser === mySeat &&
                  (room.settings.variantMode.kind === 'dealers-choice' ? room.settings.variantMode.allowed : []).map((id) => {
                    const v = room.variants.find((x) => x.id === id);
                    const seated = hand.players.filter(Boolean).length;
                    const tooMany = !!v && seated > v.players.max;
                    return (
                      <button
                        key={id}
                        className="btn choose-game"
                        disabled={tooMany}
                        title={tooMany ? `${v?.name} seats at most ${v?.players.max}` : v?.description}
                        onClick={() => socket.send({ type: 'choose-variant', variantId: id })}
                      >
                        <span className="choose-name">{v?.name ?? id}</span>
                        <span className="micro">
                          {tooMany ? `needs ${v?.players.max} or fewer` : v?.description}
                        </span>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>

          <OwnSeat room={room} socket={socket} layout={layout} maxCards={maxHoleCards(tableVariant?.id)} mySeat={mySeat} toAct={myTurn} winAmount={mySeat !== null ? winAmounts[mySeat] ?? 0 : 0} timerFraction={actorSeat === mySeat ? timerFraction : null} selectable={!!myDraw} selected={selected} onToggleCard={toggleCard} />

          {mySeat !== null && (myDraw ? (
            <DrawBar
              spec={myDraw}
              selected={selected}
              onClear={() => setSelected([])}
              onConfirm={(cards) => socket.send({ type: 'discard', cards })}
            />
          ) : (
            <ActionBar
              legal={legal}
              waitingFor={legal ? null : actorName}
              onAction={send}
              confirmFold={confirmFold}
              panelHost={betSlot}
              primary={
                canRebuyNow
                  ? { label: `Re-buy ${fmt(chips.buyInChips)} chips`, onClick: () => void rebuy() }
                  : canDeal
                    ? { label: 'Deal the next hand', onClick: () => socket.send({ type: 'host', command: { kind: 'deal' } }) }
                    : null
              }
            />
          ))}
        </div>

        <aside className="hand-rail">
          <div className="label">this hand</div>
          {hand ? (
            <div>
              <div className="italic">{variant?.name}</div>
              {hand.log.slice(-14).map((l, i) => (
                <div key={i} className={`log-line ${l.kind === 'result' ? 'result' : ''}`}>{l.text}</div>
              ))}
            </div>
          ) : (
            <div className="muted">Between hands.</div>
          )}
          {room.lastHand && !hand && (
            <>
              <div className="label">last hand</div>
              {room.lastHand.winners.map((w) => (
                <div key={w.seat} className="log-line result">
                  {room.lastHand!.players.find((p) => p.seat === w.seat)?.name} won {fmt(w.amount)}{w.handLabel ? ` with ${w.handLabel.toLowerCase()}` : ''}
                </div>
              ))}
            </>
          )}
        </aside>
      </div>

      {flights}
      <div className="sr-only" aria-live="polite">{announce}</div>
      <Toast text={copyNote ?? socket.error?.message ?? (socket.status !== 'open' ? 'Reconnecting…' : null)} />
    </div>
  );
}

function OwnSeat({ room, socket, layout, maxCards, mySeat, toAct, winAmount, timerFraction, selectable, selected, onToggleCard }: {
  room: RoomView;
  socket: RoomSocket;
  layout: TableLayout;
  /** The most cards this game deals a player, which is what the seat is sized for. */
  maxCards: number;
  mySeat: number | null;
  toAct: boolean;
  winAmount: number;
  timerFraction: number | null;
  selectable: boolean;
  selected: string[];
  onToggleCard: (card: string) => void;
}): JSX.Element {
  const table = room.table;
  const hand = table.hand;
  const me = room.me;
  const art = useActiveDeck();
  const [seatRef, box] = useSize();
  if (mySeat === null) {
    const open = table.seats.findIndex((s) => s === null);
    return (
      <div className="own-seat watching">
        <div className="who">
          <div className="name">{me?.name ?? 'Watching'}</div>
          <div className="muted">You're watching.</div>
        </div>
        {me && open !== -1 && room.phase !== 'ended' && (
          <button className="btn btn-ink" onClick={() => socket.send({ type: 'sit', seat: open })}>Take a seat</button>
        )}
      </div>
    );
  }
  const seat = table.seats[mySeat]!;
  const p = hand?.players[mySeat] ?? null;
  const cards = p && !p.folded ? dealOrder(hand?.variantId, p.holeDown, p.holeUp) : [];
  const markDown = !!p && !p.revealed && dealsUpCards(hand?.variantId);
  // In Blind Man's Bluff your own card is face down to you and up to everyone else.
  const blind = !!p && hidesOwnUpCards(hand?.variantId);
  const drewNote = p && p.drew > 0 ? `drew ${p.drew}` : null;
  const label = hand?.stage === 'settled' && hand.results?.hands[mySeat] ? hand.results.hands[mySeat]!.label : ownHandLabel(hand, mySeat);
  const { cw, step, beside } = ownCardSize(layout, box.width, Math.max(maxCards, cards.length));
  const cardH = Math.round(cw * (art?.meta.geometry.aspect ?? 7 / 5));
  const status = p?.folded
    ? 'Folded'
    : seat.sittingOut && !p
      ? 'Sitting out'
      : label ?? (blind && !p!.revealed ? 'Everyone sees your card but you' : seat.stack === 0 ? 'Out of chips' : '');
  return (
    <div
      ref={seatRef}
      className={`own-seat ${toAct ? 'to-act' : ''} ${beside ? 'beside' : 'above'}`}
      data-seat={mySeat}
      data-max-cards={Math.max(maxCards, cards.length)}
      style={{ '--own-card-h': `${cardH}px` } as CSSProperties}
    >
      <div className="who">
        <div className="name">
          <span className="who-name">{seat.name}</span>
          {hand && hand.button === mySeat && <span className="dealer-button" title="Dealer">D</span>}
          {p?.allIn && <span className="allin">all in</span>}
        </div>
        {toAct && timerFraction !== null && (
          <div className="timer" aria-hidden="true">
            <i style={{ width: `${Math.max(0, Math.min(100, timerFraction * 100))}%` }} />
          </div>
        )}
        <div className="own-stack num">
          {fmt(seat.stack)}
          {winAmount > 0 && <span className="win-delta"> +{fmt(winAmount)}</span>}
          {p && p.streetBet > 0 && <span className="micro bet"> · bet {fmt(p.streetBet)}</span>}
        </div>
        <div className="hand-label">
          {status}
          {drewNote && <span className="micro"> · {drewNote}</span>}
        </div>
      </div>
      <div className={`cards ${selectable ? 'selectable' : ''} ${step < cw ? 'overlapped' : ''}`}>
        {cards.map(({ c, k, down }, i) => (
          <button
            // A blind card shown at the end is a new card to draw: it turns over.
            key={`${hand?.number ?? 0}-${k}${blind && !down && c ? '-shown' : ''}`}
            type="button"
            disabled={!selectable || !c}
            className={`card-pick ${c && selected.includes(c) ? 'tossed' : ''}`}
            aria-pressed={!!c && selected.includes(c)}
            style={i > 0 ? { marginLeft: step - cw } : undefined}
            onClick={() => c && onToggleCard(c)}
          >
            <Card
              card={c}
              width={cw}
              delay={i * 60}
              className={blind && !down && c ? 'flip-in' : ''}
              title={blind && !down && !c ? 'Your card, which everyone else can see' : undefined}
            />
            {blind && !down && !c && (
              <span className="down-mark" style={{ animationDelay: `${i * 60}ms` }}>
                <Icon name="eye" />
                <span className="smallcaps">they see it</span>
              </span>
            )}
            {markDown && down && (
              <span className="down-mark" style={{ animationDelay: `${i * 60}ms` }}>
                <Icon name="eye-off" />
                <span className="smallcaps">hidden</span>
              </span>
            )}
            {selectable && <span className="toss-mark" aria-hidden="true">throw</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
