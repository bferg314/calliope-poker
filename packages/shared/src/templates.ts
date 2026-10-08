import { z } from 'zod';
import { DEFAULT_ROOM_SETTINGS, roomSettingsSchema, type RoomSettings } from './settings.js';

/**
 * A host's saved table setup, to deal a new table from or load into the
 * lobby. It holds the room settings only: never the table's name, password or
 * bots. Templates belong to an identity, so they follow it to any device.
 */

/** How many templates one identity may keep. */
export const MAX_TEMPLATES = 20;

export const templateNameSchema = z.string().trim().min(1, 'Give the template a name').max(40);

/**
 * How a template ends the night. A wall-clock end is kept as a time of day,
 * not the moment it was set for, or the template would be stale by tomorrow.
 */
export const templateEndSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('last-standing') }),
  z.object({ kind: z.literal('time'), minutes: z.number().int().positive().max(24 * 60) }),
  z.object({ kind: z.literal('clock'), hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59) }),
]);

export const templateSettingsSchema = roomSettingsSchema.extend({ end: templateEndSchema });

export type TemplateSettings = z.infer<typeof templateSettingsSchema>;

export const saveTemplateSchema = z.object({
  name: templateNameSchema,
  settings: templateSettingsSchema,
});

export const updateTemplateSchema = z
  .object({ name: templateNameSchema.optional(), settings: templateSettingsSchema.optional() })
  .refine((b) => b.name !== undefined || b.settings !== undefined, 'Nothing to change');

export interface TableTemplate {
  id: string;
  name: string;
  /**
   * As it was saved, which may predate settings added since. Read it with
   * `fromTemplateSettings`, never as a RoomSettings.
   */
  settings: unknown;
  updatedAt: number;
}

/** A room's settings as a template keeps them. A clock end is read in local time. */
export function toTemplateSettings(settings: RoomSettings): TemplateSettings {
  const { end } = settings;
  if (end.kind !== 'at') return { ...settings, end };
  const d = new Date(end.at);
  return { ...settings, end: { kind: 'clock', hour: d.getHours(), minute: d.getMinutes() } };
}

/** The next time the local clock reads h:m, today or else tomorrow. */
export function nextOccurrence(h: number, m: number, now: number): number {
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/**
 * Settings for a table dealt from a template, saved by any earlier version.
 * Each setting that still reads is kept and the rest fall back to the
 * defaults, so a template outlives new settings and changed ones. Games that
 * are no longer on this server are dropped.
 */
export function fromTemplateSettings(saved: unknown, variantIds: readonly string[], now: number): RoomSettings {
  const out: RoomSettings = { ...DEFAULT_ROOM_SETTINGS };
  const src = saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : {};
  const shape = roomSettingsSchema.shape;
  for (const key of Object.keys(shape) as (keyof RoomSettings)[]) {
    if (key === 'end' || !(key in src)) continue;
    const parsed = shape[key].safeParse(src[key]);
    if (parsed.success) (out as Record<string, unknown>)[key] = parsed.data;
  }

  const end = templateEndSchema.safeParse(src.end);
  if (end.success) {
    out.end = end.data.kind === 'clock'
      ? { kind: 'at', at: nextOccurrence(end.data.hour, end.data.minute, now) }
      : end.data;
  }

  const known = new Set(variantIds);
  const vm = out.variantMode;
  if (vm.kind === 'locked' && !known.has(vm.variantId)) {
    out.variantMode = DEFAULT_ROOM_SETTINGS.variantMode;
  } else if (vm.kind === 'dealers-choice') {
    const allowed = vm.allowed.filter((id) => known.has(id));
    out.variantMode = allowed.length ? { kind: 'dealers-choice', allowed } : DEFAULT_ROOM_SETTINGS.variantMode;
  }
  return out;
}
