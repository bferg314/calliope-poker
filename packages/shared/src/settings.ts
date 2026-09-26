import { z } from 'zod';
import { LEVELS_OFF, levelScheduleSchema, type LevelStakes } from './levels.js';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const roomCodeSchema = z
  .string()
  .transform((s) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''))
  .pipe(z.string().length(ROOM_CODE_LENGTH).regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]+$`)));

export const nameSchema = z.string().trim().min(1).max(24);

export const phraseSchema = z
  .array(z.string().trim().toLowerCase())
  .length(5, 'A phrase has exactly five words')
  .refine((words) => words.every((w) => /^[a-z]{3,20}$/.test(w)), 'Each word needs at least three letters')
  .refine((words) => new Set(words).size === 5, 'Use five different words');

export const chipDenominationSchema = z.object({
  value: z.number().int().positive(),
  label: z.string().trim().min(1).max(12),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const DEFAULT_DENOMINATIONS = [
  { value: 1, label: 'white', color: '#F4EFE3' },
  { value: 5, label: 'red', color: '#B3261E' },
  { value: 25, label: 'green', color: '#2E5E4E' },
  { value: 100, label: 'black', color: '#1B1A17' },
  { value: 500, label: 'purple', color: '#5A3E6B' },
  { value: 1000, label: 'yellow', color: '#C9A227' },
];

export const variantModeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('locked'), variantId: z.string().min(2).max(32) }),
  z.object({ kind: z.literal('dealers-choice'), allowed: z.array(z.string().min(2).max(32)).min(1).max(16) }),
]);

/** Which cards are wild; see engine/src/wild.ts. Jokers are only dealt when they are. */
export const wildSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('jokers') }),
  z.object({ kind: z.literal('deuces') }),
  z.object({ kind: z.literal('one-eyed-jacks') }),
  z.object({ kind: z.literal('rank'), rank: z.number().int().min(2).max(14) }),
]);

export const bettingStructureSchema = z.enum(['no-limit', 'pot-limit', 'fixed-limit']);

export const roomSettingsSchema = z.object({
  variantMode: variantModeSchema,
  /** Wild cards for a table locked to one game; in dealer's choice the dealer picks them each hand. */
  wild: wildSchema.default({ kind: 'none' }),
  betting: z.union([bettingStructureSchema, z.literal('variant-default')]),
  blinds: z.object({ small: z.number().int().min(0), big: z.number().int().positive() }),
  ante: z.number().int().min(0),
  bringIn: z.number().int().min(0),
  fixedLimit: z.object({ small: z.number().int().positive(), big: z.number().int().positive() }),
  actionSeconds: z.number().int().min(5).max(600),
  chips: z.object({
    /** Real-world value of one buy-in, display only. */
    buyInValue: z.number().min(0),
    currency: z.string().trim().max(4),
    /** Chips a buy-in is worth at the table. */
    buyInChips: z.number().int().positive(),
    denominations: z.array(chipDenominationSchema).min(1).max(8),
  }),
  rebuys: z.object({
    allowed: z.boolean(),
    /** Maximum re-buys per player, or null for unlimited. */
    maxCount: z.number().int().min(0).nullable(),
    /** Re-buys close this many minutes after the first hand, or null for never. */
    untilMinutes: z.number().int().positive().nullable(),
  }),
  end: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('last-standing') }),
    z.object({ kind: z.literal('time'), minutes: z.number().int().positive().max(24 * 60) }),
    /** A wall-clock deadline in epoch ms; pausing does not push it back. */
    z.object({ kind: z.literal('at'), at: z.number().int().positive() }),
  ]),
  /** Stakes that climb during the night. Level 0 is always the blinds/ante above. */
  levels: levelScheduleSchema.default(LEVELS_OFF),
  /** Deal the next hand automatically once the last one settles. */
  autoDeal: z.boolean(),
  /** Draw the seats at random when the first hand is dealt; they stay put after that. */
  shuffleSeats: z.boolean().default(false),
  /** Pause between a hand settling and the next deal. */
  settleSeconds: z.number().int().min(2).max(60),
});

export type RoomSettings = z.infer<typeof roomSettingsSchema>;
export type ChipDenomination = z.infer<typeof chipDenominationSchema>;

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  variantMode: { kind: 'locked', variantId: 'holdem' },
  wild: { kind: 'none' },
  betting: 'variant-default',
  blinds: { small: 5, big: 10 },
  ante: 0,
  bringIn: 5,
  fixedLimit: { small: 10, big: 20 },
  actionSeconds: 30,
  chips: { buyInValue: 20, currency: '$', buyInChips: 1000, denominations: DEFAULT_DENOMINATIONS },
  rebuys: { allowed: true, maxCount: null, untilMinutes: null },
  end: { kind: 'time', minutes: 120 },
  levels: LEVELS_OFF,
  autoDeal: true,
  shuffleSeats: false,
  settleSeconds: 6,
};

export const roomSettingsPatchSchema = roomSettingsSchema.partial();

export const createRoomSchema = z.object({
  name: nameSchema.optional(),
  password: z.string().max(64).optional(),
  settings: roomSettingsPatchSchema.optional(),
});

/** The stakes a night starts at: level 0 of the ladder. */
export function baseStakesOf(settings: RoomSettings): LevelStakes {
  return {
    blinds: { ...settings.blinds },
    ante: settings.ante,
    bringIn: settings.bringIn,
    fixedLimit: { ...settings.fixedLimit },
  };
}

/** The smallest chip on the table. Stakes are never rounded finer than this. */
export function chipUnitOf(settings: RoomSettings): number {
  const values = settings.chips.denominations.map((d) => d.value).filter((v) => v > 0);
  return values.length ? Math.min(...values) : 1;
}
