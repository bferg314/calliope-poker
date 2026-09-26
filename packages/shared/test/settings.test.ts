import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SETTINGS, roomSettingsSchema } from '../src/settings.js';

describe('default room settings', () => {
  it('run a two-hour night', () => {
    expect(roomSettingsSchema.parse(DEFAULT_ROOM_SETTINGS).end).toEqual({ kind: 'time', minutes: 120 });
  });

  it('accept a night that ends at a clock time', () => {
    const at = Date.UTC(2026, 8, 26, 23, 30);
    expect(roomSettingsSchema.parse({ ...DEFAULT_ROOM_SETTINGS, end: { kind: 'at', at } }).end).toEqual({ kind: 'at', at });
  });
});
