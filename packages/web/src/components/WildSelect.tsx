import { RANK_PLURALS, type Wild } from '@calliope/engine';

/** A wild choice as one string, for a native select: 'none', 'deuces', 'rank:7'. */
function encode(w: Wild): string {
  return w.kind === 'rank' ? `rank:${w.rank}` : w.kind;
}

function decode(v: string): Wild {
  if (v.startsWith('rank:')) return { kind: 'rank', rank: Number(v.slice(5)) };
  return { kind: v as Exclude<Wild['kind'], 'rank'> } as Wild;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Which cards are wild: none, the jokers, deuces, the one-eyed jacks, or any
 * one rank. Deuces are listed by their own name, so the ranks start at three.
 */
export function WildSelect({ value, onChange, disabled = false, id }: { value: Wild; onChange: (w: Wild) => void; disabled?: boolean; id?: string }): JSX.Element {
  return (
    <select id={id} className="select" disabled={disabled} value={encode(value)} onChange={(e) => onChange(decode(e.target.value))}>
      <option value="none">No wild cards</option>
      <option value="jokers">Jokers wild</option>
      <option value="deuces">Deuces wild</option>
      <option value="one-eyed-jacks">One-eyed jacks wild</option>
      {Array.from({ length: 12 }, (_, i) => i + 3).map((r) => (
        <option key={r} value={`rank:${r}`}>{cap(RANK_PLURALS[r]!)} wild</option>
      ))}
    </select>
  );
}
