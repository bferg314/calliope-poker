import { useEffect, useState } from 'react';
import type { HandDetail, HandListItem } from '@calliope/shared';
import { api, ApiError } from '../api.js';
import { fmt } from '../format.js';
import { HandReview } from './HandReview.js';
import { useConfirm } from './Modal.js';

/** A long night shows its most recent hands first, and the rest on asking. */
const FIRST_SHOWN = 20;

function winnersLine(h: HandListItem): string {
  if (h.winners.length === 0) return 'nobody won';
  const label = h.showdown && h.winners[0]!.handLabel ? ` with ${h.winners[0]!.handLabel.toLowerCase()}` : '';
  if (h.winners.length === 1) return `${h.winners[0]!.name} won ${fmt(h.winners[0]!.amount)}${label}`;
  return `${h.winners.map((w) => w.name).join(' and ')} split it${label}`;
}

/**
 * Every hand of the night, newest first, each one a way into its review: the
 * same page as the last hand at the table, for any hand, after the fact.
 */
export function HandHistory({ code }: { code: string }): JSX.Element | null {
  const confirm = useConfirm();
  const [hands, setHands] = useState<HandListItem[] | null>(null);
  const [all, setAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<HandListItem[]>('GET', `/api/rooms/${code}/hands`)
      .then((list) => setHands([...list].reverse()))
      .catch(() => setHands([]));
  }, [code]);

  const open = async (number: number): Promise<void> => {
    setError(null);
    try {
      const { hand, variantName } = await api<HandDetail>('GET', `/api/rooms/${code}/hands/${number}`);
      await confirm({ title: `Hand ${number}`, body: <HandReview hand={hand} variantName={variantName} />, confirmLabel: 'Done', hideCancel: true, wide: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not open that hand');
    }
  };

  if (!hands || hands.length === 0) return null;
  const shown = all ? hands : hands.slice(0, FIRST_SHOWN);
  return (
    <section className="hand-history">
      <div className="label">every hand</div>
      <ol className="hand-history-list">
        {shown.map((h) => (
          <li key={h.number}>
            <button type="button" className="hand-history-row" onClick={() => void open(h.number)}>
              <span className="what">
                <span className="num">Hand {h.number}</span>
                <span className="micro"> · {h.variantName}{h.wild ? ` · ${h.wild}` : ''}</span>
              </span>
              <span className="pot num">{fmt(h.potTotal)}</span>
              <span className="who micro">{winnersLine(h)}</span>
            </button>
          </li>
        ))}
      </ol>
      {!all && hands.length > FIRST_SHOWN && (
        <button type="button" className="btn btn-quiet" onClick={() => setAll(true)}>Show all {hands.length} hands</button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
