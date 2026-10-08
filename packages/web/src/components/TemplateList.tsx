import { useEffect, useState } from 'react';
import { fromTemplateSettings, type TableTemplate, type VariantInfo } from '@calliope/shared';
import { api, ApiError } from '../api.js';
import { useConfirm } from './Modal.js';
import { templateSummary, useTemplates } from '../templates.js';

/** The identity's saved table setups, to rename or throw away. */
export function TemplateList(): JSX.Element {
  const templates = useTemplates();
  const confirm = useConfirm();
  const [variants, setVariants] = useState<VariantInfo[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<VariantInfo[]>('GET', '/api/variants').then(setVariants, () => undefined);
  }, []);

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const rename = (t: TableTemplate): Promise<void> => run(async () => {
    await templates.rename(t.id, name.trim());
    setEditing(null);
  });

  const remove = (t: TableTemplate): Promise<void> => run(async () => {
    const ok = await confirm({
      title: `Delete "${t.name}"?`,
      body: <p>Tables already dealt from it keep their settings. This cannot be undone.</p>,
      confirmLabel: 'Delete it',
      tone: 'danger',
    });
    if (ok) await templates.remove(t.id);
  });

  const list = templates.list;
  if (list === null) return <p className="micro">{templates.error ?? 'Loading…'}</p>;

  return (
    <div className="stack">
      {list.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          None yet. Set up a table in its lobby, then keep the settings as a template to deal the same game again.
        </p>
      ) : (
        <ul className="template-list">
          {list.map((t) => (
            <li key={t.id}>
              {editing === t.id ? (
                <form className="row" onSubmit={(e) => { e.preventDefault(); void rename(t); }}>
                  <input className="input grow" aria-label="template name" maxLength={40} value={name} autoFocus onChange={(e) => setName(e.target.value)} />
                  <button className="btn" type="submit" disabled={busy || !name.trim() || name.trim() === t.name}>Rename</button>
                  <button className="btn btn-quiet" type="button" onClick={() => setEditing(null)}>never mind</button>
                </form>
              ) : (
                <div className="row row-between">
                  <div className="template-name">
                    <strong>{t.name}</strong>
                    {variants && <span className="micro">{templateSummary(fromTemplateSettings(t.settings, variants.map((v) => v.id), Date.now()), variants)}</span>}
                  </div>
                  <div className="row">
                    <button className="btn btn-quiet btn-small" disabled={busy} onClick={() => { setEditing(t.id); setName(t.name); }}>rename</button>
                    <button className="btn btn-quiet btn-small" disabled={busy} onClick={() => void remove(t)}>delete</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
