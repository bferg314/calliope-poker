import type { ChipDenomination } from '@calliope/shared';

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** A printed token: filled circle, ink ring, four dashes, the value in the middle. */
export function Chip({ denom, size = 28 }: { denom: ChipDenomination; size?: number }): JSX.Element {
  const light = luminance(denom.color) > 0.6;
  const text = light ? '#1b1a17' : '#fbf8f1';
  const dash = light ? '#1b1a17' : '#fbf8f1';
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={`${denom.value} chip`}>
      <circle cx="20" cy="20" r="18.5" fill={denom.color} stroke="#1b1a17" strokeWidth="2" />
      <circle cx="20" cy="20" r="13" fill="none" stroke={dash} strokeWidth="0.8" strokeDasharray="6 14.4" strokeDashoffset="3" />
      <text x="20" y="24" textAnchor="middle" fontSize={denom.value >= 1000 ? 9 : 11} fontFamily="var(--font-ui)" fontWeight="600" fill={text}>
        {denom.value}
      </text>
    </svg>
  );
}

/** Break an amount into chips using the room's denominations (largest first), capped. */
export function chipsFor(amount: number, denoms: ChipDenomination[], max = 6): ChipDenomination[] {
  const sorted = [...denoms].sort((a, b) => b.value - a.value);
  const out: ChipDenomination[] = [];
  let left = amount;
  for (const d of sorted) {
    while (left >= d.value && out.length < max) {
      out.push(d);
      left -= d.value;
    }
  }
  return out;
}

export function ChipStack({ amount, denoms, size = 22 }: { amount: number; denoms: ChipDenomination[]; size?: number }): JSX.Element | null {
  if (amount <= 0) return null;
  const chips = chipsFor(amount, denoms, 5);
  return (
    <span className="chip-stack" style={{ height: size + (chips.length - 1) * 3, width: size }} aria-hidden="true">
      {chips.map((c, i) => (
        <span key={i} style={{ position: 'absolute', bottom: i * 3, left: 0, lineHeight: 0 }}>
          <Chip denom={c} size={size} />
        </span>
      ))}
    </span>
  );
}
