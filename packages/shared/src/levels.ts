import { z } from 'zod';

/** The six numbers a level moves together. */
export interface LevelStakes {
  blinds: { small: number; big: number };
  ante: number;
  bringIn: number;
  fixedLimit: { small: number; big: number };
}

export const levelStakesSchema = z.object({
  blinds: z.object({ small: z.number().int().min(0), big: z.number().int().positive() }),
  ante: z.number().int().min(0),
  bringIn: z.number().int().min(0),
  fixedLimit: z.object({ small: z.number().int().positive(), big: z.number().int().positive() }),
});

export const DEFAULT_GROWTH = 1.5;
export const DEFAULT_MAX_LEVEL = 12;

const growthSchema = z.number().min(1.05).max(3);
const maxLevelSchema = z.number().int().min(1).max(40);

/**
 * How the stakes climb. 'off' keeps the host's base stakes all night.
 * Level 0 is always the base stakes; each level multiplies them by `growth`.
 */
export const levelScheduleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('off') }),
  z.object({
    kind: z.literal('time'),
    everyMinutes: z.number().int().min(1).max(240),
    growth: growthSchema,
    maxLevel: maxLevelSchema,
  }),
  z.object({
    kind: z.literal('hands'),
    everyHands: z.number().int().min(1).max(200),
    growth: growthSchema,
    maxLevel: maxLevelSchema,
  }),
]);

export type LevelSchedule = z.infer<typeof levelScheduleSchema>;

export const LEVELS_OFF: LevelSchedule = { kind: 'off' };

export interface LadderOpts {
  growth: number;
  /** Smallest chip on the table; nothing is ever rounded finer than this. */
  chipUnit: number;
}

export function ladderOptsOf(schedule: LevelSchedule, chipUnit: number): LadderOpts {
  return { growth: schedule.kind === 'off' ? DEFAULT_GROWTH : schedule.growth, chipUnit: Math.max(1, Math.floor(chipUnit) || 1) };
}

export function maxLevelOf(schedule: LevelSchedule): number {
  return schedule.kind === 'off' ? 0 : schedule.maxLevel;
}

/**
 * The shape of a blind structure people actually write down: 10, 15, 25, 50, 75,
 * 100, 150 rather than whatever a multiplier happens to land on. Mantissas are
 * scaled by powers of ten and snapped to whole chips.
 */
const NICE_MANTISSAS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];

const niceCache = new Map<string, number[]>();

/** Every recognisable chip value between one chip and `upTo`, ascending. */
function niceValues(unit: number, upTo: number): number[] {
  const key = `${unit}:${upTo}`;
  const hit = niceCache.get(key);
  if (hit) return hit;
  const seen = new Set<number>();
  for (let p = 0; p <= 12; p++) {
    const power = 10 ** p;
    for (const m of NICE_MANTISSAS) {
      const raw = m * power;
      if (raw > upTo * 2) break;
      // Snap to the chips on this table, so a 25-chip game never asks for 30.
      const v = Math.max(unit, Math.round(raw / unit) * unit);
      if (v <= upTo * 2) seen.add(v);
    }
  }
  const out = [...seen].sort((a, b) => a - b);
  niceCache.set(key, out);
  return out;
}

/**
 * The recognisable value closest to `v`. Depends only on `v` and the chip size,
 * so the lobby preview and the server always land on the same number.
 */
function roundChip(v: number, unit: number): number {
  if (v <= 0) return 0;
  const values = niceValues(unit, v * 2 + unit);
  let best = values[0] ?? unit;
  let bestDist = Infinity;
  for (const candidate of values) {
    const dist = Math.abs(candidate - v);
    if (dist < bestDist) { bestDist = dist; best = candidate; }
  }
  return best;
}

/** The smallest recognisable value strictly above `prev`. */
function nextNiceAbove(prev: number, unit: number): number {
  for (const candidate of niceValues(unit, prev * 2 + unit)) {
    if (candidate > prev) return candidate;
  }
  return prev + unit;
}

/** Keep a component strictly above the level below it, even when rounding collapses them. */
function bumpAbove(prev: number, v: number, unit: number): number {
  return v > prev ? v : nextNiceAbove(prev, unit);
}

/**
 * A secondary bet (small blind, small fixed bet, bring-in) keeps its ratio to the
 * headline number instead of being rounded on its own, so 5/10 stays a half.
 */
function scaledTo(headline: number, ratio: number, unit: number, min: number): number {
  const v = Math.max(unit, Math.round((headline * ratio) / unit) * unit);
  return Math.max(min, v);
}

/** Min last, so a cap always wins over the strictly-increasing floor. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Build levels 0..count-1. Level 0 is the base stakes verbatim; the host's own
 * numbers are never rounded. Built as a left fold so a component can never
 * plateau: if rounding would repeat the previous value it is bumped one clean
 * step instead, and that bump compounds forward.
 *
 * A component the host set to zero stays zero at every level. The schedule
 * scales the forced bets a game actually uses; it never invents one.
 */
export function levelLadder(base: LevelStakes, opts: LadderOpts, count: number): LevelStakes[] {
  const unit = Math.max(1, Math.floor(opts.chipUnit) || 1);
  const growth = Math.max(1.0001, opts.growth);
  // Orderings that hold at level 0 are preserved at every level; ones that do not are left alone.
  const capSmall = base.blinds.small <= base.blinds.big;
  const capFixed = base.fixedLimit.small <= base.fixedLimit.big;
  const capBringIn = base.bringIn > 0 && base.bringIn <= base.fixedLimit.small;

  const out: LevelStakes[] = [{
    blinds: { ...base.blinds },
    ante: base.ante,
    bringIn: base.bringIn,
    fixedLimit: { ...base.fixedLimit },
  }];

  for (let n = 1; n < count; n++) {
    const prev = out[n - 1]!;
    const f = growth ** n;

    const big = bumpAbove(prev.blinds.big, roundChip(base.blinds.big * f, unit), unit);
    const small = base.blinds.small === 0
      ? 0
      : clamp(
          scaledTo(big, base.blinds.small / base.blinds.big, unit, prev.blinds.small + unit),
          prev.blinds.small + unit,
          capSmall ? big : Number.POSITIVE_INFINITY,
        );

    const flBig = bumpAbove(prev.fixedLimit.big, roundChip(base.fixedLimit.big * f, unit), unit);
    const flSmall = clamp(
      scaledTo(flBig, base.fixedLimit.small / base.fixedLimit.big, unit, prev.fixedLimit.small + unit),
      prev.fixedLimit.small + unit,
      capFixed ? flBig : Number.POSITIVE_INFINITY,
    );

    const ante = base.ante === 0 ? 0 : bumpAbove(prev.ante, roundChip(base.ante * f, unit), unit);
    const bringIn = base.bringIn === 0
      ? 0
      : clamp(
          Math.max(prev.bringIn + unit, scaledTo(flSmall, base.bringIn / base.fixedLimit.small, unit, prev.bringIn + unit)),
          prev.bringIn + unit,
          capBringIn ? flSmall : Number.POSITIVE_INFINITY,
        );

    out.push({ blinds: { small, big }, ante, bringIn, fixedLimit: { small: flSmall, big: flBig } });
  }
  return out;
}

/** The stakes at one level. Pure, so the server can recompute it after a restart. */
export function stakesForLevel(base: LevelStakes, opts: LadderOpts, level: number): LevelStakes {
  const n = Math.max(0, Math.floor(level));
  const ladder = levelLadder(base, opts, n + 1);
  return ladder[n]!;
}

export function sameStakes(a: LevelStakes, b: LevelStakes): boolean {
  return (
    a.blinds.small === b.blinds.small &&
    a.blinds.big === b.blinds.big &&
    a.ante === b.ante &&
    a.bringIn === b.bringIn &&
    a.fixedLimit.small === b.fixedLimit.small &&
    a.fixedLimit.big === b.fixedLimit.big
  );
}

/** "5/10" or "5/10, ante 1" — the short form for the top bar and the lobby preview. */
export function stakesLabel(s: LevelStakes, opts: { antes?: boolean; blinds?: boolean } = {}): string {
  const showBlinds = opts.blinds ?? true;
  const showAntes = opts.antes ?? s.ante > 0;
  const parts: string[] = [];
  if (showBlinds) parts.push(`${s.blinds.small}/${s.blinds.big}`);
  if (showAntes && s.ante > 0) parts.push(`ante ${s.ante}`);
  if (!showBlinds && s.bringIn > 0) parts.push(`bring-in ${s.bringIn}`);
  return parts.join(', ');
}
