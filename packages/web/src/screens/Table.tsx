import { useEffect, useMemo, useRef, useState } from 'react';
import {
  bestHand, bestHandOmaha, evaluateCards, getVariant, legalActions, type Action, type HandView, type TableState,
} from '@calliope/engine';
import { stakesLabel, type RoomView } from '@calliope/shared';
import { Board } from '../components/Board.js';
import { Card } from '../components/Card.js';
import { SeatCard } from '../components/Seat.js';
import { ActionBar } from '../components/ActionBar.js';
import { DrawBar } from '../components/DrawBar.js';
import { GameStrip } from '../components/GameStrip.js';
import { Invite } from '../components/Invite.js';
import { useConfirm } from '../components/Modal.js';
import { ThemePicker } from '../components/ThemePicker.js';
import { Toast } from '../components/Toast.js';
import { TurnPop } from '../components/TurnPop.js';
import { bellOn, ringBell, setBellOn } from '../bell.js';
import { copyText } from '../clipboard.js';
import { absoluteUrl, fmt, fmtDuration, fmtMoney } from '../format.js';
import { Link } from '../router.js';
import { useNow, type RoomSocket } from '../ws.js';

/**
 * Where opponent k (1..n-1, clockwise from the viewer) sits in the table area.
 * Phones use fixed slots that leave room for the board between the middle seats;
 * wider screens use an ellipse clamped so seat cards never leave the area.
 */
function seatPosition(k: number, n: number, phone: boolean, seatW: number): { left: string; top: string } {
  const half = seatW / 2;
  if (phone && n === 8) {
    const slots: Record<number, [string, string]> = {
      1: [`${half}px`, '84%'],
      2: [`${half}px`, '48%'],
      3: ['21%', '15%'],
      4: ['50%', '10%'],
      5: ['79%', '15%'],
      6: [`calc(100% - ${half}px)`, '48%'],
      7: [`calc(100% - ${half}px)`, '84%'],
    };
    const [left, top] = slots[k]!;
    return { left, top };
  }
  const angle = (90 + (360 * k) / n) * (Math.PI / 180);
  const cos = Math.cos(angle).toFixed(4);
  const sin = Math.sin(angle).toFixed(4);
  return { left: `calc(50% + (50% - ${half}px) * ${cos})`, top: `calc(50% + (50% - 44px) * ${sin})` };
}

/** True on a narrow phone, where the own-seat cards have to give up room. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 400px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 400px)');
    const onChange = (): void => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

function useWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 900px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const onChange = (): void => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

function ownHandLabel(hand: HandView | null, seat: number | null): string | null {
  if (!hand || seat === null) return null;
  const p = hand.players[seat];
  if (!p || p.folded) return null;
  const hole = [...p.holeDown.filter((c): c is string => c !== null), ...p.holeUp];
  if (hole.length === 0) return null;
  try {
    if (hand.variantId === 'omaha') {
      if (hand.board.length < 3) return null;
      return bestHandOmaha(hole, hand.board).label;
    }
    const all = [...hole, ...hand.board];
    return all.length <= 5 ? evaluateCards(all).label : bestHand(all).label;
  } catch {
    return null;
  }
}

export function Table({ room, socket }: { room: RoomView; socket: RoomSocket }): JSX.Element {
  const now = useNow(250) + socket.skew;
  const confirm = useConfirm();
  const wide = useWide();
  const seatW = wide ? 140 : 84;
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
  const [selected, setSelected] = useState<string[]>([]);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const seenLevel = useRef(room.level.index);
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
  const boardSlots = variant ? variant.streets.reduce((a, s) => a + (s.deal.community ?? 0), 0) : 5;
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

  // Screen reader announcements from the log.
  const lastLog = hand?.log[hand.log.length - 1]?.text ?? '';
  useEffect(() => {
    if (legal) setAnnounce('Your turn');
    else if (lastLog) setAnnounce(lastLog);
  }, [legal, lastLog]);

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
   * board straight back.
   */
  useEffect(() => {
    if (!turnPop) return;
    const hide = (): void => setTurnPop(false);
    const timer = window.setTimeout(hide, 1600);
    window.addEventListener('pointerdown', hide, { passive: true });
    window.addEventListener('keydown', hide);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', hide);
      window.removeEventListener('keydown', hide);
    };
  }, [turnPop]);

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

  const resultLine = settled
    ? hand!.log.filter((l) => l.kind === 'result').map((l) => l.text).join(' · ')
    : null;

  return (
    <div className="table-screen">
      <header className="table-top">
        <Link to="/" className="brand">Calliope</Link>
        <button
          className="room-code smallcaps room-code-button"
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
            {me?.name ?? 'menu'} ▾
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

      <GameStrip
        room={room}
        note={hand?.stage === 'discarding'
          ? (drawSpec?.replace ? 'the draw' : 'everyone throws one away')
          : null}
      />
      {levelUp && <div className="notice-bar final">Stakes are up: {levelUp}</div>}
      {room.phase === 'paused' && <div className="notice-bar">Dealing is paused, and so is the clock. {isHost ? 'Resume from the menu.' : 'The host will resume.'}</div>}
      {room.phase === 'final-hand' && <div className="notice-bar final">Last hand of the night.</div>}
      {room.phase === 'playing' && !hand && (
        <div className="notice-bar">
          {table.seats.filter((s) => s && s.stack > 0 && !s.sittingOut).length < 2 ? 'Waiting for a second player with chips.' : 'Shuffling…'}
        </div>
      )}

      <div className="table-layout">
        <div className="table-main">
          <div className="table-area">
            <div className="table-surface" aria-hidden="true" />
            {Array.from({ length: n - 1 }, (_, i) => {
              const k = i + 1;
              const idx = (viewer + k) % n;
              const seat = table.seats[idx] ?? null;
              const player = hand?.players[idx] ?? null;
              const member = seat ? room.members.find((m) => m.id === seat.playerId) : undefined;
              return (
                <div key={idx} className="seat" style={seatPosition(k, n, !wide, seatW)}>
                  <SeatCard
                    seat={seat}
                    player={player}
                    index={idx}
                    isButton={!!hand && hand.button === idx}
                    toAct={actorSeat === idx}
                    timerFraction={actorSeat === idx ? timerFraction : null}
                    connected={member?.connected ?? true}
                    isWinner={winners.has(idx)}
                    winAmount={winAmounts[idx] ?? 0}
                    handLabel={settled && hand!.results!.hands[idx] ? hand!.results!.hands[idx]!.label : null}
                    denoms={denoms}
                    cardWidth={wide ? 36 : 24}
                    onSit={me && mySeat === null && room.phase !== 'ended' ? () => socket.send({ type: 'sit', seat: idx }) : undefined}
                    onAddBot={isHost && !seat ? () => socket.send({ type: 'host', command: { kind: 'add-bot', seat: idx } }) : undefined}
                  />
                </div>
              );
            })}
            <Board hand={hand} slots={boardSlots} cardWidth={wide ? 72 : 40} />
            {resultLine && <div className="result-line">{resultLine}</div>}
            {turnPop && <TurnPop hint={turnHint} />}
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

          <OwnSeat room={room} socket={socket} mySeat={mySeat} toAct={myTurn} winAmount={mySeat !== null ? winAmounts[mySeat] ?? 0 : 0} timerFraction={actorSeat === mySeat ? timerFraction : null} onRebuy={rebuy} selectable={!!myDraw} selected={selected} onToggleCard={toggleCard} />

          {mySeat !== null && (myDraw ? (
            <DrawBar
              spec={myDraw}
              selected={selected}
              onClear={() => setSelected([])}
              onConfirm={(cards) => socket.send({ type: 'discard', cards })}
            />
          ) : (
            <ActionBar legal={legal} waitingFor={legal ? null : actorName} onAction={send} confirmFold={confirmFold} />
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

      <div className="sr-only" aria-live="polite">{announce}</div>
      <Toast text={copyNote ?? socket.error?.message ?? (socket.status !== 'open' ? 'Reconnecting…' : null)} />
    </div>
  );
}

function OwnSeat({ room, socket, mySeat, toAct, winAmount, timerFraction, onRebuy, selectable, selected, onToggleCard }: {
  room: RoomView;
  socket: RoomSocket;
  mySeat: number | null;
  toAct: boolean;
  winAmount: number;
  timerFraction: number | null;
  onRebuy: () => Promise<void>;
  selectable: boolean;
  selected: string[];
  onToggleCard: (card: string) => void;
}): JSX.Element {
  const table = room.table;
  const hand = table.hand;
  const me = room.me;
  if (mySeat === null) {
    const open = table.seats.findIndex((s) => s === null);
    return (
      <div className="own-seat">
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
  const cards = p && !p.folded ? [...p.holeDown.map((c, i) => ({ c, k: `d${i}` })), ...p.holeUp.map((c, i) => ({ c, k: `u${i}` }))] : [];
  const drewNote = p && p.drew > 0 ? `drew ${p.drew}` : null;
  const label = hand?.stage === 'settled' && hand.results?.hands[mySeat] ? hand.results.hands[mySeat]!.label : ownHandLabel(hand, mySeat);
  const wide = useWide();
  const narrow = useNarrow();
  const many = cards.length >= 5;
  const cw = many
    ? (wide ? 64 : narrow ? 40 : 44)
    : cards.length > 2
      ? (wide ? 84 : narrow ? 52 : 60)
      : wide ? 112 : narrow ? 72 : 88;
  return (
    <div className={`own-seat ${toAct ? 'to-act' : ''} ${many ? 'many-cards' : ''}`}>
      <div className={`cards ${selectable ? 'selectable' : ''}`}>
        {cards.map(({ c, k }, i) => (
          <button
            key={k}
            type="button"
            disabled={!selectable || !c}
            className={`card-pick ${c && selected.includes(c) ? 'tossed' : ''}`}
            aria-pressed={!!c && selected.includes(c)}
            onClick={() => c && onToggleCard(c)}
          >
            <Card card={c} width={cw} delay={i * 60} />
            {selectable && <span className="toss-mark" aria-hidden="true">throw</span>}
          </button>
        ))}
      </div>
      <div className="who">
        <div className="name">
          {seat.name}
          {hand && hand.button === mySeat && <span className="dealer-button" title="Dealer">D</span>}
          {p?.allIn && <span className="allin">all in</span>}
        </div>
        {toAct && timerFraction !== null && (
          <div className="timer" style={{ maxWidth: 200 }} aria-hidden="true">
            <i style={{ width: `${Math.max(0, Math.min(100, timerFraction * 100))}%` }} />
          </div>
        )}
        <div className="stack num">
          {fmt(seat.stack)}
          {winAmount > 0 && <span className="win-delta"> +{fmt(winAmount)}</span>}
          {p && p.streetBet > 0 && <span className="micro"> · {fmt(p.streetBet)} in</span>}
        </div>
        <div className="hand-label">
          {p?.folded ? 'Folded' : seat.sittingOut && !p ? 'Sitting out' : label ?? (seat.stack === 0 ? 'Out of chips' : '')}
          {drewNote && <span className="micro"> · {drewNote}</span>}
        </div>
      </div>
      <div className="side-actions">
        {me?.canRebuy && seat.stack === 0 && (
          <button className="btn btn-red btn-small" onClick={() => void onRebuy()}>Re-buy</button>
        )}
      </div>
    </div>
  );
}
