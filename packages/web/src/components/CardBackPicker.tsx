import { useState } from 'react';
import { applyCardBack, CARD_BACKS, currentCardBack, type CardBackId } from '../cardBacks.js';
import { Card } from './Card.js';

/** A device-local card-back preference, independent of the table theme. */
export function CardBackPicker(): JSX.Element {
  const [selected, setSelected] = useState<CardBackId>(currentCardBack());

  const pick = (id: CardBackId): void => {
    setSelected(id);
    applyCardBack(id);
  };

  return (
    <div className="card-back-grid" role="radiogroup" aria-label="Card back">
      {CARD_BACKS.map((back) => (
        <button
          key={back.id}
          type="button"
          role="radio"
          aria-checked={selected === back.id}
          className={`card-back-swatch ${selected === back.id ? 'on' : ''}`}
          data-card-back={back.id}
          onClick={() => pick(back.id)}
        >
          <Card card={null} width={48} title={`${back.name} card back`} />
          <span>
            <span className="name">{back.name}</span>
            <span className="micro">{back.blurb}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
