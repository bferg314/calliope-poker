import { rankOf, suitOf, type Card as CardCode, type Suit } from '@calliope/engine';

const RANK_TEXT: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

/** Suit shapes in a 100×100 box. */
export function SuitShape({ suit }: { suit: Suit }): JSX.Element {
  switch (suit) {
    case 'h':
      return <path d="M50 92C22 66 4 48 4 28 4 14 15 4 28 4c10 0 18 6 22 14 4-8 12-14 22-14 13 0 24 10 24 24 0 20-18 38-46 64z" />;
    case 'd':
      return <path d="M50 4l40 46-40 46L10 50z" />;
    case 's':
      return <path d="M50 4C30 30 6 44 6 62c0 13 10 22 22 22 9 0 16-5 20-12-2 12-8 20-16 26h36c-8-6-14-14-16-26 4 7 11 12 20 12 12 0 22-9 22-22C94 44 70 30 50 4z" />;
    default:
      return (
        <g>
          <circle cx="50" cy="26" r="18" />
          <circle cx="26" cy="56" r="18" />
          <circle cx="74" cy="56" r="18" />
          <path d="M44 56h12l6 40H38z" />
        </g>
      );
    }
}

interface CardProps {
  /** A card code, or null for a face-down card. */
  card: CardCode | null;
  width?: number;
  className?: string;
  /** Delay for the deal-in animation, in ms. */
  delay?: number;
  title?: string;
}

/**
 * A printed playing card. 5:7 ratio, oversized corner index so the top-left alone
 * reads at 36px wide. Two inks only.
 */
export function Card({ card, width = 64, className = '', delay = 0, title }: CardProps): JSX.Element {
  const height = (width * 7) / 5;
  const style = { width, height, animationDelay: `${delay}ms` } as const;
  if (card === null) {
    return (
      <svg className={`card card-back ${className}`} style={style} viewBox="0 0 100 140" role="img" aria-label={title ?? 'Face-down card'}>
        <defs>
          <pattern id="lattice" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path d="M0 5h10M5 0v10" stroke="var(--card-back-ink)" strokeWidth="0.8" fill="none" />
          </pattern>
        </defs>
        <rect x="1" y="1" width="98" height="138" rx="6" fill="var(--card-back)" stroke="var(--card-edge)" strokeWidth="1" />
        <rect x="8" y="8" width="84" height="124" rx="3" fill="url(#lattice)" stroke="var(--card-back-ink)" strokeWidth="1" />
        <rect x="34" y="58" width="32" height="24" rx="2" fill="var(--card-back)" stroke="var(--card-back-ink)" strokeWidth="1" />
        <text x="50" y="74" textAnchor="middle" fontSize="9" fontFamily="var(--font-display)" fill="var(--card-back-ink)" fontStyle="italic">
          C
        </text>
      </svg>
    );
  }
  const rank = rankOf(card);
  const suit = suitOf(card);
  const red = suit === 'h' || suit === 'd';
  const ink = red ? 'var(--card-red)' : 'var(--card-ink)';
  const rankText = RANK_TEXT[rank] ?? '?';
  const court = rank >= 11 && rank <= 13;
  const label = title ?? `${rankText} of ${suit === 'h' ? 'hearts' : suit === 'd' ? 'diamonds' : suit === 's' ? 'spades' : 'clubs'}`;
  const indexSize = rankText.length === 2 ? 30 : 38;
  return (
    <svg className={`card card-face ${className}`} style={style} viewBox="0 0 100 140" role="img" aria-label={label}>
      <rect x="1" y="1" width="98" height="138" rx="6" fill="var(--card-face)" stroke="var(--card-edge)" strokeWidth="1" />
      {/* Top-left index */}
      <g fill={ink}>
        <text x="8" y="40" fontSize={indexSize} fontFamily="var(--font-display)" fontWeight="600" style={{ fontVariationSettings: '"opsz" 72' }}>
          {rankText}
        </text>
        <g transform="translate(9 46) scale(0.2)">
          <SuitShape suit={suit} />
        </g>
      </g>
      {/* Bottom-right index, rotated */}
      <g fill={ink} transform="rotate(180 50 70)">
        <text x="8" y="40" fontSize={indexSize} fontFamily="var(--font-display)" fontWeight="600" style={{ fontVariationSettings: '"opsz" 72' }}>
          {rankText}
        </text>
        <g transform="translate(9 46) scale(0.2)">
          <SuitShape suit={suit} />
        </g>
      </g>
      {/* Centre */}
      {court ? (
        <g>
          <rect x="34" y="44" width="32" height="52" fill="none" stroke={ink} strokeWidth="1.2" />
          <rect x="37" y="47" width="26" height="46" fill="none" stroke={ink} strokeWidth="0.6" />
          <text x="50" y="82" textAnchor="middle" fontSize="34" fontFamily="var(--font-display)" fontStyle="italic" fill={ink} style={{ fontVariationSettings: '"opsz" 144' }}>
            {rankText}
          </text>
          <g transform="translate(45 50) scale(0.1)" fill={ink}>
            <SuitShape suit={suit} />
          </g>
        </g>
      ) : (
        <g fill={ink} transform={`translate(${50 - 17} ${70 - 17}) scale(0.34)`}>
          <SuitShape suit={suit} />
        </g>
      )}
      {rank === 14 && suit === 's' && (
        <text x="50" y="112" textAnchor="middle" fontSize="6" letterSpacing="1.5" fontFamily="var(--font-ui)" fill={ink}>
          CALLIOPE
        </text>
      )}
    </svg>
  );
}
