import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SETTINGS, type RoomSettings } from '../src/settings.js';
import {
  fromTemplateSettings, nextOccurrence, saveTemplateSchema, templateSettingsSchema, toTemplateSettings, updateTemplateSchema,
} from '../src/templates.js';

const VARIANTS = ['holdem', 'omaha', 'seven-card-stud'];
const NOW = new Date(2026, 9, 8, 19, 0).getTime();

describe('saving a template', () => {
  it('keeps a wall-clock end as a time of day', () => {
    const at = new Date(2026, 9, 8, 23, 30).getTime();
    const saved = toTemplateSettings({ ...DEFAULT_ROOM_SETTINGS, end: { kind: 'at', at } });
    expect(saved.end).toEqual({ kind: 'clock', hour: 23, minute: 30 });
    expect(templateSettingsSchema.parse(saved)).toEqual(saved);
  });

  it('keeps every other setting as it is', () => {
    const settings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS, ante: 5, end: { kind: 'last-standing' } };
    expect(toTemplateSettings(settings)).toEqual(settings);
  });

  it('needs a name, and something to change', () => {
    expect(saveTemplateSchema.safeParse({ name: '  ', settings: toTemplateSettings(DEFAULT_ROOM_SETTINGS) }).success).toBe(false);
    expect(updateTemplateSchema.safeParse({}).success).toBe(false);
    expect(updateTemplateSchema.safeParse({ name: 'Friday' }).success).toBe(true);
  });
});

describe('dealing from a template', () => {
  it('comes back as it was saved', () => {
    const settings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS, blinds: { small: 25, big: 50 }, variantMode: { kind: 'locked', variantId: 'omaha' } };
    expect(fromTemplateSettings(toTemplateSettings(settings), VARIANTS, NOW)).toEqual(settings);
  });

  it('ends at the next time the clock reads the saved time', () => {
    const later = fromTemplateSettings({ ...DEFAULT_ROOM_SETTINGS, end: { kind: 'clock', hour: 23, minute: 30 } }, VARIANTS, NOW);
    expect(later.end).toEqual({ kind: 'at', at: new Date(2026, 9, 8, 23, 30).getTime() });
    const tomorrow = fromTemplateSettings({ ...DEFAULT_ROOM_SETTINGS, end: { kind: 'clock', hour: 1, minute: 0 } }, VARIANTS, NOW);
    expect(tomorrow.end).toEqual({ kind: 'at', at: new Date(2026, 9, 9, 1, 0).getTime() });
  });

  it('fills settings an older template never had from the defaults', () => {
    const { levels: _levels, shuffleSeats: _shuffle, ...old } = { ...DEFAULT_ROOM_SETTINGS, ante: 10 };
    const settings = fromTemplateSettings(old, VARIANTS, NOW);
    expect(settings.ante).toBe(10);
    expect(settings.levels).toEqual(DEFAULT_ROOM_SETTINGS.levels);
    expect(settings.shuffleSeats).toBe(false);
  });

  it('drops a setting that no longer reads, and keeps the rest', () => {
    const settings = fromTemplateSettings({ ...DEFAULT_ROOM_SETTINGS, actionSeconds: 9000, ante: 10 }, VARIANTS, NOW);
    expect(settings.actionSeconds).toBe(DEFAULT_ROOM_SETTINGS.actionSeconds);
    expect(settings.ante).toBe(10);
  });

  it('leaves out games this server no longer deals', () => {
    const dc = fromTemplateSettings({ variantMode: { kind: 'dealers-choice', allowed: ['holdem', 'gone', 'omaha'] } }, VARIANTS, NOW);
    expect(dc.variantMode).toEqual({ kind: 'dealers-choice', allowed: ['holdem', 'omaha'] });
    const none = fromTemplateSettings({ variantMode: { kind: 'dealers-choice', allowed: ['gone'] } }, VARIANTS, NOW);
    expect(none.variantMode).toEqual(DEFAULT_ROOM_SETTINGS.variantMode);
    const locked = fromTemplateSettings({ variantMode: { kind: 'locked', variantId: 'gone' } }, VARIANTS, NOW);
    expect(locked.variantMode).toEqual(DEFAULT_ROOM_SETTINGS.variantMode);
  });

  it('reads junk as the defaults', () => {
    expect(fromTemplateSettings(null, VARIANTS, NOW)).toEqual(DEFAULT_ROOM_SETTINGS);
    expect(fromTemplateSettings('nope', VARIANTS, NOW)).toEqual(DEFAULT_ROOM_SETTINGS);
  });
});

describe('the next occurrence of a time', () => {
  it('is today while it is still ahead, else tomorrow', () => {
    expect(nextOccurrence(20, 0, NOW)).toBe(new Date(2026, 9, 8, 20, 0).getTime());
    expect(nextOccurrence(19, 0, NOW)).toBe(new Date(2026, 9, 9, 19, 0).getTime());
  });
});
