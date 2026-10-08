import { useCallback, useEffect, useState } from 'react';
import { toTemplateSettings, type RoomSettings, type TableTemplate, type VariantInfo } from '@calliope/shared';
import { wildLabel } from '@calliope/engine';
import { api, ApiError } from './api.js';
import { fmt, fmtTime } from './format.js';

/**
 * The host's saved table setups, kept on the server against their identity
 * so they follow it from device to device. See shared/src/templates.ts.
 */
export interface Templates {
  /** Null until the first load comes back. */
  list: TableTemplate[] | null;
  error: string | null;
  refresh(): Promise<void>;
  /** Save under a new name. Throws an ApiError with code 'template-exists' when it is taken. */
  save(name: string, settings: RoomSettings): Promise<string>;
  /** Replace the settings kept under an existing template. */
  overwrite(id: string, settings: RoomSettings): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
}

export function useTemplates(enabled = true): Templates {
  const [list, setList] = useState<TableTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ templates: TableTemplate[] }>('GET', '/api/me/templates');
      setList(r.templates);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load your templates');
    }
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  const save = useCallback(async (name: string, settings: RoomSettings) => {
    const r = await api<{ id: string }>('POST', '/api/me/templates', { name, settings: toTemplateSettings(settings) });
    await refresh();
    return r.id;
  }, [refresh]);

  const overwrite = useCallback(async (id: string, settings: RoomSettings) => {
    await api('PUT', `/api/me/templates/${id}`, { settings: toTemplateSettings(settings) });
    await refresh();
  }, [refresh]);

  const rename = useCallback(async (id: string, name: string) => {
    await api('PUT', `/api/me/templates/${id}`, { name });
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await api('DELETE', `/api/me/templates/${id}`);
    await refresh();
  }, [refresh]);

  return { list, error, refresh, save, overwrite, rename, remove };
}

/** One line saying what a template deals: "Omaha · blinds 25/50 · 1,000 chips · ends 11:30 PM". */
export function templateSummary(s: RoomSettings, variants: VariantInfo[]): string {
  const vm = s.variantMode;
  const games = vm.kind === 'dealers-choice' ? vm.allowed : [vm.variantId];
  const game = vm.kind === 'dealers-choice'
    ? `Dealer's choice of ${games.length}`
    : variants.find((v) => v.id === vm.variantId)?.name ?? vm.variantId;
  const inPlay = variants.filter((v) => games.includes(v.id));
  const stakes = inPlay.some((v) => v.forcedBets === 'blinds') || inPlay.length === 0
    ? `blinds ${fmt(s.blinds.small)}/${fmt(s.blinds.big)}`
    : `ante ${fmt(s.ante)}`;
  const wild = s.wild.kind === 'none' ? null : wildLabel(s.wild);
  const end = s.end.kind === 'time'
    ? `${s.end.minutes} min`
    : s.end.kind === 'at' ? `ends ${fmtTime(s.end.at)}` : 'last one standing';
  return [game, wild, stakes, `${fmt(s.chips.buyInChips)} chips`, end].filter(Boolean).join(' · ');
}

/** The template a new table was last dealt from on this device, if any. */
const LAST = 'calliope.template';

export function lastTemplateId(): string | null {
  try { return localStorage.getItem(LAST); } catch { return null; }
}

export function setLastTemplateId(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST, id);
    else localStorage.removeItem(LAST);
  } catch { /* ignore */ }
}
