import { useState } from 'react';
import { applyTheme, currentTheme, THEMES, type ThemeId } from '../themes.js';
import { Card } from './Card.js';

/**
 * Theme swatches. Each one renders inside its own `data-theme`, so the tokens
 * cascade and the swatch is a true miniature of the table rather than a guess.
 */
export function ThemePicker({ compact = false }: { compact?: boolean }): JSX.Element {
  const [theme, setTheme] = useState<ThemeId>(currentTheme());
  const pick = (id: ThemeId): void => {
    setTheme(id);
    applyTheme(id);
  };

  if (compact) {
    return (
      <div className="theme-dots" role="radiogroup" aria-label="Look">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={theme === t.id}
            aria-label={t.name}
            title={t.name}
            className={`theme-dot ${theme === t.id ? 'on' : ''}`}
            data-theme={t.id}
            onClick={() => pick(t.id)}
          >
            <span className="dot-ink" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="theme-grid" role="radiogroup" aria-label="Look">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={theme === t.id}
          aria-label={t.name}
          className={`theme-swatch ${theme === t.id ? 'on' : ''}`}
          onClick={() => pick(t.id)}
        >
          <span className="preview" data-theme={t.id} aria-hidden="true">
            <span className="felt-strip">
              <Card card="As" width={26} />
              <Card card="Kh" width={26} />
              <span className="pot-mark">120</span>
            </span>
            <span className="chips">
              <span className="swatch-btn quiet">fold</span>
              <span className="swatch-btn red">raise</span>
            </span>
          </span>
          <span className="name">{t.name}</span>
          <span className="micro">{t.blurb}</span>
        </button>
      ))}
    </div>
  );
}
