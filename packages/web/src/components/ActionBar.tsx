import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Action, LegalActions } from '@calliope/engine';
import { fmt } from '../format.js';
import { BetPanel } from './BetPanel.js';
import { Icon } from './Icon.js';
import { actionFor, currentKeys } from '../keys.js';
import { arm, resolve, stillArmed, type Ahead, type Armed, type PreKind } from '../preActions.js';
import { usingPad } from '../gamepad.js';

interface ActionBarProps {
  legal: LegalActions | null;
  waitingFor: string | null;
  onAction: (a: Action) => void;
  confirmFold: boolean;
  /**
   * When it is not your turn but there is one thing for you to do (deal the
   * next hand, buy back in), it takes the bar's place at the bar's height.
   */
  primary?: { label: string; onClick: () => void } | null;
  /**
   * Where the bet panel opens: a slot at the foot of the table, so it lies over
   * the felt like a slip of paper instead of squeezing the table out from
   * under it. Without one it opens above the buttons.
   */
  panelHost?: HTMLElement | null;
  /**
   * Where the note on whose turn it is goes: the rule above your cards, so it
   * reads before them. Without one it sits in the bar's own top rule.
   */
  noteHost?: HTMLElement | null;
  /**
   * Set while someone else is acting and the player is still in the hand:
   * they may choose now what to do when the action reaches them.
   */
  ahead?: Ahead | null;
  /** Hand number and street, to tell whether a choice made earlier still applies. */
  turnKey?: string;
}

export function ActionBar({ legal, waitingFor, onAction, confirmFold, primary, panelHost, noteHost, ahead = null, turnKey = '' }: ActionBarProps): JSX.Element {
  const note = (text: string): JSX.Element => {
    const el = <div className="pre-note" role="status"><span>{text}</span></div>;
    return noteHost ? createPortal(el, noteHost) : el;
  };
  const [betOpen, setBetOpen] = useState(false);
  const [foldArmed, setFoldArmed] = useState(false);
  // Chosen on the profile page, so read once as the table opens.
  const [keys] = useState(currentKeys);
  const [armed, setArmed] = useState<Armed | null>(null);
  const [dropped, setDropped] = useState<string | null>(null);
  // The turn a choice made ahead was carried out on. Until the table moves on,
  // the bar shows it going through rather than live buttons to press twice.
  const [sentOn, setSentOn] = useState<string | null>(null);
  const checkCallRef = useRef<HTMLButtonElement>(null);
  const turnSig = legal ? `${turnKey}:${legal.seat}:${legal.toCall}` : null;
  const auto = legal && armed ? resolve(armed, turnKey, legal) : null;

  // A choice made ahead stops standing once the price it was made at changes.
  useEffect(() => {
    if (!armed || legal) return;
    if (stillArmed(armed, ahead)) return;
    setArmed(null);
    if (ahead && ahead.key === armed.key) setDropped('The bet went up, so that was cleared');
  }, [armed, legal, ahead?.key, ahead?.toCall]);

  // The action has reached the player: carry out what they chose, if it still stands.
  useEffect(() => {
    if (!legal) { setSentOn(null); return; }
    if (!armed) return;
    setArmed(null);
    if (auto) {
      setSentOn(turnSig);
      onAction(auto);
    } else if (armed.key === turnKey) {
      setDropped('The bet went up: your turn');
    }
    // Otherwise the street it was chosen on has ended: it lapses without a word.
  }, [legal]);

  // With a controller, the turn arriving puts you on check or call, so A plays it
  // and the D-pad reaches fold and raise either side.
  useEffect(() => {
    if (legal && usingPad()) checkCallRef.current?.focus({ preventScroll: true });
  }, [legal?.seat, turnKey, !!legal]);

  // Should the table not take it, the buttons come back rather than wait forever.
  useEffect(() => {
    if (!sentOn) return;
    const t = window.setTimeout(() => setSentOn(null), 2000);
    return () => window.clearTimeout(t);
  }, [sentOn]);

  useEffect(() => {
    if (!dropped) return;
    const t = window.setTimeout(() => setDropped(null), 3000);
    return () => window.clearTimeout(t);
  }, [dropped]);

  const toggle = (kind: PreKind): void => {
    if (!ahead) return;
    if (kind === 'raise' && !ahead.canRaise) return;
    setDropped(null);
    setArmed((cur) => (cur?.kind === kind ? null : arm(kind, ahead)));
  };

  useEffect(() => {
    setBetOpen(false);
    setFoldArmed(false);
  }, [legal?.seat, legal?.toCall, legal?.raise?.min]);

  const fold = (): void => {
    if (!legal) return;
    if (confirmFold && legal.toCall > 0 && !foldArmed) { setFoldArmed(true); return; }
    onAction({ type: 'fold' });
  };
  const checkCall = (): void => {
    if (!legal) return;
    onAction(legal.canCheck ? { type: 'check' } : { type: 'call' });
  };
  const betRaise = (): void => {
    if (!legal?.raise) return;
    if (legal.raise.fixed) onAction({ type: legal.raise.kind, to: legal.raise.min });
    else setBetOpen((o) => !o);
  };

  useEffect(() => {
    if (!legal && !ahead) return;
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const act = actionFor(e, keys);
      if (!act) return;
      e.preventDefault();
      if (legal && (auto || sentOn === turnSig)) return; // already done, as chosen
      // Before your turn the same keys set what you will do.
      if (!legal) toggle(act === 'fold' ? 'check-fold' : act);
      else if (act === 'fold') fold();
      else if (act === 'call') checkCall();
      else betRaise();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (legal && (auto || sentOn === turnSig)) {
    // A choice made ahead is going through: nothing here to press.
    return (
      <div className="action-bar waiting-bar">
        <div className="buttons" aria-hidden="true">
          <button className="btn" disabled tabIndex={-1}>Fold</button>
          <button className="btn" disabled tabIndex={-1}>Check</button>
          <button className="btn" disabled tabIndex={-1}>Bet</button>
        </div>
        <div className="waiting"><span>Done, as you chose</span></div>
      </div>
    );
  }

  if (!legal) {
    if (primary) {
      return (
        <div className="action-bar">
          <div className="buttons single">
            <button className="btn btn-red primary-action" onClick={primary.onClick}>
              <span>{primary.label}</span>
            </button>
          </div>
        </div>
      );
    }
    const waiting = waitingFor ? `Waiting for ${waitingFor}` : 'Waiting for the next hand';
    if (ahead) {
      // Someone else is deciding: the buttons are live, and set what you will do.
      const on = (k: PreKind): boolean => armed?.kind === k;
      const pre = (k: PreKind, label: string, disabled = false): JSX.Element => (
        <button type="button" className={`btn pre ${on(k) ? 'on' : ''}`} aria-pressed={on(k)} disabled={disabled} onClick={() => toggle(k)}>
          <span>{on(k) && <Icon name="check" />}{label}</span>
          <kbd>{k === 'check-fold' ? keys.fold : k === 'call' ? keys.call : keys.raise}</kbd>
        </button>
      );
      return (
        <div className="action-bar waiting-bar ahead">
          {note(dropped ?? (armed ? `${waiting} · set for your turn` : `${waiting} · choose ahead`))}
          <div className="buttons">
            {pre('check-fold', ahead.toCall > 0 ? 'Fold' : 'Check / fold')}
            {pre('call', ahead.toCall > 0 ? `Call ${fmt(ahead.toCall)}` : 'Check')}
            {pre('raise', ahead.raiseKind === 'bet' ? 'Min bet' : 'Min raise', !ahead.canRaise)}
          </div>
        </div>
      );
    }
    // The buttons stay where they will be, faint, with the reason printed over
    // them: the bar is the same height whoever is acting, so nothing above it moves.
    return (
      <div className="action-bar waiting-bar">
        <div className="buttons" aria-hidden="true">
          <button className="btn" disabled tabIndex={-1}>Fold</button>
          <button className="btn" disabled tabIndex={-1}>Check</button>
          <button className="btn" disabled tabIndex={-1}>Bet</button>
        </div>
        <div className="waiting">
          <span>{dropped ?? waiting}</span>
        </div>
      </div>
    );
  }

  const raise = legal.raise;
  const raiseLabel = raise
    ? raise.fixed
      ? raise.kind === 'bet' ? `Bet ${fmt(raise.min)}` : `Raise to ${fmt(raise.min)}`
      : raise.kind === 'bet' ? 'Bet' : 'Raise'
    : 'Raise';

  return (
    <div className="action-bar">
      {dropped && note(dropped)}
      {betOpen && raise && !raise.fixed && (() => {
        const panel = (
          <BetPanel
            legal={legal}
            onConfirm={(to) => { setBetOpen(false); onAction({ type: raise.kind, to }); }}
            onCancel={() => setBetOpen(false)}
          />
        );
        return panelHost ? createPortal(panel, panelHost) : panel;
      })()}
      <div className="buttons">
        <button className="btn" onClick={fold} aria-label="Fold">
          <span>{foldArmed ? 'Really fold?' : 'Fold'}</span>
          <kbd>{keys.fold}</kbd>
        </button>
        <button ref={checkCallRef} className="btn btn-ink" onClick={checkCall}>
          <span>{legal.canCheck ? 'Check' : `Call ${fmt(legal.callAmount)}`}</span>
          <kbd>{keys.call}</kbd>
        </button>
        <button className="btn btn-red" onClick={betRaise} disabled={!raise} aria-expanded={betOpen}>
          <span>{raiseLabel}{raise && !raise.fixed && <Icon name="chevron-right" />}</span>
          <kbd>{keys.raise}</kbd>
        </button>
      </div>
    </div>
  );
}
