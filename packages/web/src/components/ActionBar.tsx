import { useEffect, useState } from 'react';
import type { Action, LegalActions } from '@calliope/engine';
import { fmt } from '../format.js';
import { BetPanel } from './BetPanel.js';
import { Icon } from './Icon.js';

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
}

export function ActionBar({ legal, waitingFor, onAction, confirmFold, primary }: ActionBarProps): JSX.Element {
  const [betOpen, setBetOpen] = useState(false);
  const [foldArmed, setFoldArmed] = useState(false);

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
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); fold(); }
      else if (e.key === 'c' || e.key === 'C') { e.preventDefault(); checkCall(); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); betRaise(); }
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
      {betOpen && raise && !raise.fixed && (
        <BetPanel
          legal={legal}
          onConfirm={(to) => { setBetOpen(false); onAction({ type: raise.kind, to }); }}
          onCancel={() => setBetOpen(false)}
        />
      )}
      <div className="buttons">
        <button className="btn" onClick={fold} aria-label="Fold">
          <span>{foldArmed ? 'Really fold?' : 'Fold'}</span>
          <kbd>f</kbd>
        </button>
        <button className="btn btn-ink" onClick={checkCall}>
          <span>{legal.canCheck ? 'Check' : `Call ${fmt(legal.callAmount)}`}</span>
          <kbd>c</kbd>
        </button>
        <button className="btn btn-red" onClick={betRaise} disabled={!raise} aria-expanded={betOpen}>
          <span>{raiseLabel}{raise && !raise.fixed && <Icon name="chevron-right" />}</span>
          <kbd>r</kbd>
        </button>
      </div>
    </div>
  );
}
