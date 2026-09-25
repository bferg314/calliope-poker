import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Action, LegalActions } from '@calliope/engine';
import { fmt } from '../format.js';
import { BetPanel } from './BetPanel.js';
import { Icon } from './Icon.js';
import { actionFor, currentKeys } from '../keys.js';

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
}

export function ActionBar({ legal, waitingFor, onAction, confirmFold, primary, panelHost }: ActionBarProps): JSX.Element {
  const [betOpen, setBetOpen] = useState(false);
  const [foldArmed, setFoldArmed] = useState(false);
  // Chosen on the profile page, so read once as the table opens.
  const [keys] = useState(currentKeys);

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
    if (!legal) return;
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const act = actionFor(e, keys);
      if (!act) return;
      e.preventDefault();
      if (act === 'fold') fold();
      else if (act === 'call') checkCall();
      else betRaise();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
          <span>{waitingFor ? `Waiting for ${waitingFor}` : 'Waiting for the next hand'}</span>
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
        <button className="btn btn-ink" onClick={checkCall}>
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
