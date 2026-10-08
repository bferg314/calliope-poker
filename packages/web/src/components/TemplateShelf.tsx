import { useState } from 'react';
import { fromTemplateSettings, type RoomSettings, type VariantInfo } from '@calliope/shared';
import { ApiError } from '../api.js';
import { useConfirm } from './Modal.js';
import { Section } from '../screens/Settings.js';
import { templateSummary, type Templates } from '../templates.js';

interface TemplateShelfProps {
  templates: Templates;
  variants: VariantInfo[];
  /** The form as it stands, unsaved edits and all: what "save" keeps. */
  draft: RoomSettings;
  /** Fill the form from a template. The host still saves it like any edit. */
  onLoad: (settings: RoomSettings) => void;
}

/**
 * Load a saved setup into the settings form, or keep the form as one. A load
 * only fills the form, so it lands as unsaved edits the host can look over.
 */
export function TemplateShelf({ templates, variants, draft, onLoad }: TemplateShelfProps): JSX.Element {
  const confirm = useConfirm();
  const list = templates.list ?? [];
  const [chosen, setChosen] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const picked = list.find((t) => t.id === chosen) ?? null;

  const load = (): void => {
    if (!picked) return;
    onLoad(fromTemplateSettings(picked.settings, variants.map((v) => v.id), Date.now()));
    setName(picked.name);
    setError(null);
    setNote(`Loaded "${picked.name}". Save the settings to use it.`);
  };

  const save = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const same = list.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
      if (same) {
        const ok = await confirm({
          title: `Replace "${same.name}"?`,
          body: <p>The template keeps these settings in place of the ones it has now.</p>,
          confirmLabel: 'Replace it',
        });
        if (!ok) return;
        await templates.overwrite(same.id, draft);
        setChosen(same.id);
      } else {
        setChosen(await templates.save(trimmed, draft));
      }
      setNote(`Saved as "${same?.name ?? trimmed}".`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the template');
    } finally {
      setBusy(false);
    }
  };

  const summary = list.length === 0 ? 'none saved yet' : `${list.length} saved`;

  return (
    <Section title="Templates" summary={summary}>
      <div className="stack template-shelf">
        {list.length > 0 && (
          <div className="field">
            <span className="label">start from a template</span>
            <div className="row">
              <select className="select grow" aria-label="template" value={chosen} onChange={(e) => setChosen(e.target.value)}>
                <option value="">Choose a template</option>
                {list.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button className="btn" disabled={!picked} onClick={load}>Load</button>
            </div>
            {picked && <span className="micro">{templateSummary(fromTemplateSettings(picked.settings, variants.map((v) => v.id), Date.now()), variants)}</span>}
          </div>
        )}
        <form className="field" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <span className="label">keep these settings as a template</span>
          <div className="row">
            <input className="input grow" aria-label="template name" placeholder="Friday night" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn" type="submit" disabled={busy || !name.trim()}>Save as template</button>
          </div>
        </form>
        {note && <p className="micro" role="status" style={{ margin: 0 }}>{note}</p>}
        {(error ?? templates.error) && <div className="error">{error ?? templates.error}</div>}
      </div>
    </Section>
  );
}
