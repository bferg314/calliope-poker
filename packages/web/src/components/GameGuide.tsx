import { useState } from 'react';
import { isJoker, wildLabel, type Wild } from '@calliope/engine';
import { FIVE_CARD_RANKS, GUIDES, THREE_CARD_RANKS } from '../guides.js';
import { Card } from './Card.js';
import { useConfirm } from './Modal.js';

/**
 * How to play: for one game, or for each game a dealer might call, with a row
 * of names to move between them. What wins is shown with cards, best first,
 * because "does a flush beat a straight here?" is the question people ask.
 */
export function GameGuide({ games, first, wild }: { games: { id: string; name: string }[]; first?: string; wild?: Wild | null }): JSX.Element {
  const known = games.filter((g) => GUIDES[g.id]);
  const [id, setId] = useState(first && GUIDES[first] ? first : known[0]?.id ?? '');
  const guide = GUIDES[id];
  const wilds = wildLabel(wild);
  if (!guide) return <p>No guide for this game yet.</p>;
  const ranks = guide.ranking === 'three' ? THREE_CARD_RANKS : FIVE_CARD_RANKS.filter((r) => !r.wildOnly || wilds);

  return (
    <div className="game-guide">
      {known.length > 1 && (
        <div className="game-guide-tabs" role="tablist" aria-label="Games">
          {known.map((g) => (
            <button key={g.id} type="button" role="tab" aria-selected={g.id === id} className={`btn btn-small ${g.id === id ? 'btn-ink' : 'btn-quiet'}`} onClick={() => setId(g.id)}>
              {g.name}
            </button>
          ))}
        </div>
      )}
      {known.length > 1 && <h3>{known.find((g) => g.id === id)?.name}</h3>}
      <p className="game-guide-summary">{guide.summary}</p>

      <div>
        <div className="label">a hand</div>
        <ol className="game-guide-steps">
          {guide.steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      </div>

      <div>
        <div className="label">what wins</div>
        {guide.ranking === 'high-card' ? (
          <p>The highest card. Aces are high and suits do not count, so two kings split the pot.</p>
        ) : (
          <ol className="game-guide-ranks">
            {ranks.map((r) => (
              <li key={r.name}>
                <span className="name">{r.name}</span>
                <span className="cards">
                  {r.example.map((c, i) => <Card key={i} card={c} width={26} mode="tile" wild={isJoker(c)} />)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {(guide.notes.length > 0 || wilds) && (
        <ul className="game-guide-notes">
          {guide.notes.map((n, i) => <li key={i}>{n}</li>)}
          {wilds && (
            <li>
              <strong>{wilds.charAt(0).toUpperCase() + wilds.slice(1)}.</strong> A wild card stands for any card at all, even one you already
              hold, and is ringed on the table. With wild cards, five of a kind beats a straight flush.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Open the guide in the app's dialog. */
export function useGameGuide(): (games: { id: string; name: string }[], first?: string, wild?: Wild | null) => void {
  const confirm = useConfirm();
  return (games, first, wild) => {
    const title = games.length === 1 ? `How to play ${games[0]!.name}` : 'How to play';
    void confirm({ title, body: <GameGuide games={games} first={first} wild={wild} />, confirmLabel: 'Done', hideCancel: true, wide: true });
  };
}
