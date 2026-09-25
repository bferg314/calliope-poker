import { useEffect, useState, type ReactNode } from 'react';
import {
  baseStakesOf, BOT_PERSONALITIES, chipUnitOf, DEFAULT_GROWTH, DEFAULT_MAX_LEVEL, ladderOptsOf, levelLadder,
  type LevelSchedule, type RoomSettings, type VariantInfo,
} from '@calliope/shared';
import { Chip } from '../components/Chip.js';
import { WildSelect } from '../components/WildSelect.js';
import { wildLabel } from '@calliope/engine';
import { fmt, fmtMoney } from '../format.js';
import { Icon } from '../components/Icon.js';

interface SettingsProps {
  settings: RoomSettings;
  variants: VariantInfo[];
  editable: boolean;
  onSave: (patch: Partial<RoomSettings>) => void;
  /** Told whenever there are edits the host has not saved yet. */
  onDirtyChange?: (dirty: boolean) => void;
}

const BETTING_LABEL: Record<string, string> = { 'no-limit': 'No limit', 'pot-limit': 'Pot limit', 'fixed-limit': 'Fixed limit' };

/**
 * One part of the form, folded to a line that says what it is set to, so the
 * whole form reads at a glance and a phone does not scroll past it all.
 */
export function Section({ title, summary, open = false, children }: { title: string; summary: string; open?: boolean; children: ReactNode }): JSX.Element {
  return (
    <details className="settings-section" open={open}>
      <summary>
        <h3>{title}</h3>
        <span className="section-summary">{summary}</span>
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

export function Num({ label, value, onChange, min = 0, disabled }: { label: string; value: number; onChange: (n: number) => void; min?: number; disabled: boolean }): JSX.Element {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input className="input num" type="number" inputMode="numeric" min={min} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** The room's settings as a printed form. Host edits; others read. */
export function Settings({ settings, variants, editable, onSave, onDirtyChange }: SettingsProps): JSX.Element {
  const [draft, setDraft] = useState<RoomSettings>(settings);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(settings);
  }, [settings, dirty]);

  // Told from an effect, never from inside an event handler that runs during
  // render, so the parent is only ever updated after this component commits.
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const save = (): void => {
    onSave(draft);
    setDirty(false);
  };

  const set = <K extends keyof RoomSettings>(key: K, value: RoomSettings[K]): void => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  };

  const vm = draft.variantMode;
  const dc = vm.kind === 'dealers-choice';
  const allowed: string[] = vm.kind === 'dealers-choice' ? vm.allowed : [vm.variantId];
  const usesBlinds = variants.filter((v) => allowed.includes(v.id)).some((v) => v.forcedBets === 'blinds');
  const usesAntes = variants.filter((v) => allowed.includes(v.id)).some((v) => v.forcedBets === 'antes-bringin');
  const ro = !editable;
  const levels: LevelSchedule = draft.levels;
  const growth = levels.kind === 'off' ? DEFAULT_GROWTH : levels.growth;
  const maxLevel = levels.kind === 'off' ? DEFAULT_MAX_LEVEL : levels.maxLevel;
  // The same pure generator the server uses, so the preview cannot disagree with play.
  const ladder = levelLadder(baseStakesOf(draft), ladderOptsOf(levels, chipUnitOf(draft)), Math.min(maxLevel + 1, 8));

  const discard = (): void => {
    setDraft(settings);
    setDirty(false);
  };
  const gameName = dc ? "Dealer's choice" : variants.find((v) => v.id === allowed[0])?.name ?? allowed[0];
  const lockedVariant = dc ? null : variants.find((v) => v.id === allowed[0]);
  const wild = draft.wild ?? { kind: 'none' as const };
  const wildLine = wildLabel(wild);
  const bettingLabel = draft.betting === 'variant-default' ? 'usual betting' : BETTING_LABEL[draft.betting]!.toLowerCase();
  const rebuysLine = !draft.rebuys.allowed
    ? 'no re-buys'
    : `${draft.rebuys.maxCount === null ? 'any number' : `up to ${draft.rebuys.maxCount}`}${draft.rebuys.untilMinutes === null ? '' : ` in the first ${draft.rebuys.untilMinutes} min`}`;
  const levelsLine = levels.kind === 'off' ? 'the same all night' : levels.kind === 'time' ? `up every ${levels.everyMinutes} min` : `up every ${levels.everyHands} hands`;
  const endLine = `${draft.end.kind === 'time' ? `after ${draft.end.minutes} minutes` : 'last one standing'} · ${draft.autoDeal ? 'deals itself' : 'the host deals'}`;

  return (
    <div className="stack">
      <div className="settings-form">
        <Section title="Game" summary={`${gameName}${wildLine ? ` · ${wildLine}` : ''} · ${bettingLabel}${usesBlinds ? ` · blinds ${fmt(draft.blinds.small)}/${fmt(draft.blinds.big)}` : ''}${usesAntes ? ` · ante ${fmt(draft.ante)}` : ''}`} open={editable}>
          <div className="row">
            <label className="check">
              <input type="radio" name="mode" disabled={ro} checked={!dc} onChange={() => set('variantMode', { kind: 'locked', variantId: allowed[0] ?? 'holdem' })} />
              One game all night
            </label>
            <label className="check">
              <input type="radio" name="mode" disabled={ro} checked={dc} onChange={() => set('variantMode', { kind: 'dealers-choice', allowed: allowed.length ? allowed : ['holdem'] })} />
              Dealer's choice
            </label>
          </div>
          {dc ? (
            <div className="row">
              {variants.map((v) => (
                <label key={v.id} className="check">
                  <input
                    type="checkbox"
                    disabled={ro}
                    checked={allowed.includes(v.id)}
                    onChange={(e) => {
                      const next = e.target.checked ? [...allowed, v.id] : allowed.filter((x) => x !== v.id);
                      if (next.length) set('variantMode', { kind: 'dealers-choice', allowed: next });
                    }}
                  />
                  {v.name}
                </label>
              ))}
            </div>
          ) : (
            <select className="select" disabled={ro} value={allowed[0]} onChange={(e) => set('variantMode', { kind: 'locked', variantId: e.target.value })}>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          )}
          {lockedVariant && <p className="micro" style={{ margin: 0 }}>{lockedVariant.description}</p>}
          <div className="settings-grid">
            <label className="field span-2">
              <span className="label">wild cards</span>
              <WildSelect value={wild} disabled={ro} onChange={(w) => set('wild', w)} />
              {dc && <span className="micro">In dealer's choice the dealer picks them with the game. This is where the choice starts.</span>}
            </label>
            <label className="field span-2">
              <span className="label">betting</span>
              <select className="select" disabled={ro} value={draft.betting} onChange={(e) => set('betting', e.target.value as RoomSettings['betting'])}>
                <option value="variant-default">Usual for each game</option>
                <option value="no-limit">No limit</option>
                <option value="pot-limit">Pot limit</option>
                <option value="fixed-limit">Fixed limit</option>
              </select>
            </label>
            {usesBlinds && <Num label="small blind" value={draft.blinds.small} disabled={ro} onChange={(n) => set('blinds', { ...draft.blinds, small: n })} />}
            {usesBlinds && <Num label="big blind" value={draft.blinds.big} min={1} disabled={ro} onChange={(n) => set('blinds', { ...draft.blinds, big: n })} />}
            <Num label={usesAntes ? 'ante' : 'ante (optional)'} value={draft.ante} disabled={ro} onChange={(n) => set('ante', n)} />
            {usesAntes && <Num label="bring-in" value={draft.bringIn} disabled={ro} onChange={(n) => set('bringIn', n)} />}
            <Num label="small bet (fixed limit)" value={draft.fixedLimit.small} min={1} disabled={ro} onChange={(n) => set('fixedLimit', { ...draft.fixedLimit, small: n })} />
            <Num label="big bet (fixed limit)" value={draft.fixedLimit.big} min={1} disabled={ro} onChange={(n) => set('fixedLimit', { ...draft.fixedLimit, big: n })} />
            <Num label="seconds to act" value={draft.actionSeconds} min={5} disabled={ro} onChange={(n) => set('actionSeconds', n)} />
          </div>
        </Section>

        <Section title="Chips" summary={`${fmtMoney(draft.chips.buyInValue, draft.chips.currency)} for ${fmt(draft.chips.buyInChips)} chips · ${draft.chips.denominations.length} colours`}>
          <div className="settings-grid">
            <label className="field">
              <span className="label">currency</span>
              <input className="input" maxLength={4} disabled={ro} value={draft.chips.currency} onChange={(e) => set('chips', { ...draft.chips, currency: e.target.value })} />
            </label>
            <Num label="a buy-in is worth" value={draft.chips.buyInValue} disabled={ro} onChange={(n) => set('chips', { ...draft.chips, buyInValue: n })} />
            <Num label="chips per buy-in" value={draft.chips.buyInChips} min={1} disabled={ro} onChange={(n) => set('chips', { ...draft.chips, buyInChips: n })} />
          </div>
          <div className="chip-legend">
            {draft.chips.denominations.map((d, i) => (
              <div key={i} className="item">
                <Chip denom={d} size={26} />
                {editable ? (
                  <>
                    <input className="input num" style={{ width: 72 }} type="number" min={1} value={d.value} onChange={(e) => {
                      const next = draft.chips.denominations.map((x, k) => (k === i ? { ...x, value: Number(e.target.value) || 1 } : x));
                      set('chips', { ...draft.chips, denominations: next });
                    }} />
                    <input className="input" style={{ width: 84 }} maxLength={12} value={d.label} onChange={(e) => {
                      const next = draft.chips.denominations.map((x, k) => (k === i ? { ...x, label: e.target.value } : x));
                      set('chips', { ...draft.chips, denominations: next });
                    }} />
                    <input type="color" value={d.color} aria-label="chip colour" onChange={(e) => {
                      const next = draft.chips.denominations.map((x, k) => (k === i ? { ...x, color: e.target.value } : x));
                      set('chips', { ...draft.chips, denominations: next });
                    }} />
                    {draft.chips.denominations.length > 1 && (
                      <button className="btn btn-quiet btn-small" onClick={() => set('chips', { ...draft.chips, denominations: draft.chips.denominations.filter((_, k) => k !== i) })} aria-label={`Remove the ${d.label} chip`}><Icon name="close" /></button>
                    )}
                  </>
                ) : (
                  <span>{d.label} · {fmt(d.value)}</span>
                )}
              </div>
            ))}
            {editable && draft.chips.denominations.length < 8 && (
              <button className="btn btn-small" onClick={() => set('chips', { ...draft.chips, denominations: [...draft.chips.denominations, { value: 5000, label: 'plum', color: '#5A3E6B' }] })}>
                + chip
              </button>
            )}
          </div>
        </Section>

        <Section title="Re-buys" summary={rebuysLine}>
          <label className="check">
            <input type="checkbox" disabled={ro} checked={draft.rebuys.allowed} onChange={(e) => set('rebuys', { ...draft.rebuys, allowed: e.target.checked })} />
            Allow re-buys
          </label>
          {draft.rebuys.allowed && (
            <div className="settings-grid">
              <label className="field">
                <span className="label">at most (blank for unlimited)</span>
                <input className="input num" type="number" min={0} disabled={ro} value={draft.rebuys.maxCount ?? ''} placeholder="unlimited" onChange={(e) => set('rebuys', { ...draft.rebuys, maxCount: e.target.value === '' ? null : Number(e.target.value) })} />
              </label>
              <label className="field">
                <span className="label">only in the first (minutes)</span>
                <input className="input num" type="number" min={1} disabled={ro} value={draft.rebuys.untilMinutes ?? ''} placeholder="all night" onChange={(e) => set('rebuys', { ...draft.rebuys, untilMinutes: e.target.value === '' ? null : Number(e.target.value) })} />
              </label>
            </div>
          )}
        </Section>

        <Section title="Rising stakes" summary={levelsLine}>
          <div className="row">
            <label className="check">
              <input type="radio" name="levels" disabled={ro} checked={levels.kind === 'off'} onChange={() => set('levels', { kind: 'off' })} />
              Stay the same all night
            </label>
            <label className="check">
              <input type="radio" name="levels" disabled={ro} checked={levels.kind === 'time'} onChange={() => set('levels', { kind: 'time', everyMinutes: 20, growth, maxLevel })} />
              Go up on the clock
            </label>
            <label className="check">
              <input type="radio" name="levels" disabled={ro} checked={levels.kind === 'hands'} onChange={() => set('levels', { kind: 'hands', everyHands: 10, growth, maxLevel })} />
              Go up every so many hands
            </label>
          </div>
          {levels.kind !== 'off' && (
            <>
              <div className="settings-grid">
                {levels.kind === 'time' ? (
                  <Num label="minutes per level" min={1} disabled={ro} value={levels.everyMinutes} onChange={(n) => set('levels', { ...levels, everyMinutes: Math.max(1, n) })} />
                ) : (
                  <Num label="hands per level" min={1} disabled={ro} value={levels.everyHands} onChange={(n) => set('levels', { ...levels, everyHands: Math.max(1, n) })} />
                )}
                <label className="field">
                  <span className="label">how fast they climb</span>
                  <select className="select" disabled={ro} value={String(growth)} onChange={(e) => set('levels', { ...levels, growth: Number(e.target.value) })}>
                    <option value="1.25">Gentle (1.25x)</option>
                    <option value="1.5">Usual (1.5x)</option>
                    <option value="2">Steep (2x)</option>
                    <option value="3">Brutal (3x)</option>
                  </select>
                </label>
                <Num label="stop after level" min={1} disabled={ro} value={maxLevel} onChange={(n) => set('levels', { ...levels, maxLevel: Math.min(40, Math.max(1, n)) })} />
              </div>
              <div className="ladder-preview">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>level</th>
                      {usesBlinds && <th className="num">blinds</th>}
                      <th className="num">ante</th>
                      {usesAntes && <th className="num">bring-in</th>}
                      <th className="num">limit bets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ladder.map((l, i) => (
                      <tr key={i} className={i === 0 ? 'now' : undefined}>
                        <td>{i + 1}{i === 0 ? ' (start)' : ''}</td>
                        {usesBlinds && <td className="num">{fmt(l.blinds.small)}/{fmt(l.blinds.big)}</td>}
                        <td className="num">{l.ante === 0 ? '—' : fmt(l.ante)}</td>
                        {usesAntes && <td className="num">{l.bringIn === 0 ? '—' : fmt(l.bringIn)}</td>}
                        <td className="num">{fmt(l.fixedLimit.small)}/{fmt(l.fixedLimit.big)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="micro">
                Built from the stakes above and rounded to whole chips. Stakes only change between hands, and the clock
                stops while the table is paused.
                {draft.ante === 0 && usesAntes ? ' Set a starting ante for it to climb too.' : ''}
              </p>
            </>
          )}
        </Section>

        <Section title="End of the night" summary={endLine}>
          <div className="row">
            <label className="check">
              <input type="radio" name="end" disabled={ro} checked={draft.end.kind === 'last-standing'} onChange={() => set('end', { kind: 'last-standing' })} />
              Last one standing
            </label>
            <label className="check">
              <input type="radio" name="end" disabled={ro} checked={draft.end.kind === 'time'} onChange={() => set('end', { kind: 'time', minutes: 120 })} />
              Time limit
            </label>
            {draft.end.kind === 'time' && (
              <input className="input num" style={{ width: 110 }} type="number" min={1} disabled={ro} value={draft.end.minutes} onChange={(e) => set('end', { kind: 'time', minutes: Number(e.target.value) || 1 })} aria-label="minutes" />
            )}
            {draft.end.kind === 'time' && <span className="micro">minutes, then one last hand</span>}
          </div>
          <div className="settings-grid">
            <label className="check">
              <input type="checkbox" disabled={ro} checked={draft.autoDeal} onChange={(e) => set('autoDeal', e.target.checked)} />
              Deal the next hand automatically
            </label>
            <Num label="pause between hands (seconds)" value={draft.settleSeconds} min={2} disabled={ro} onChange={(n) => set('settleSeconds', n)} />
          </div>
        </Section>
      </div>

      {/*
        * Unsaved edits hold up the deal, so the way to save them stays in
        * view wherever the host has scrolled: a bar along the foot of the
        * window, there only while there is something to save.
        */}
      {editable && dirty && (
        <>
          <div className="save-bar-space" aria-hidden="true" />
          <div className="save-bar" role="region" aria-label="Unsaved settings">
            <span className="save-bar-note">You have unsaved settings.</span>
            <button className="btn btn-quiet" onClick={discard}>discard</button>
            <button className="btn btn-ink" onClick={save}>Save settings</button>
          </div>
        </>
      )}
    </div>
  );
}

export function personalityLabel(p: (typeof BOT_PERSONALITIES)[number]): string {
  return p === 'station' ? 'calling station' : p;
}
