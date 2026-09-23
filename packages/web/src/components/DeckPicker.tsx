import { useEffect, useRef, useState } from 'react';
import { DeckImportError, importDeck, previewArt, removeDeck, selectDeck, useDecks, type DeckArt, type DeckListing } from '../decks.js';
import { Card } from './Card.js';
import { useConfirm } from './Modal.js';

const OUTCOME: Record<string, string> = {
  added: 'Added',
  updated: 'Updated',
  unchanged: 'Already here, unchanged:',
};

/** The deck cards are drawn with, local to this device. Faces and back come together from the deck. */
export function DeckPicker(): JSX.Element {
  const { list, activeId } = useDecks();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setBusy(true);
    setNote(null);
    setError(null);
    try {
      const { name, outcome } = await importDeck(file);
      setNote(`${OUTCOME[outcome]} ${name}.`);
    } catch (e) {
      setError(e instanceof DeckImportError ? e.message : 'That deck could not be imported.');
      if (!(e instanceof DeckImportError)) console.warn(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const onRemove = async (listing: DeckListing): Promise<void> => {
    const ok = await confirm({
      title: `Remove ${listing.meta.name}?`,
      body: <p>It is taken off this device. Import the file again to get it back.</p>,
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    setNote(null);
    setError(null);
    await removeDeck(listing.meta.id).catch(() => setError('That deck could not be removed.'));
  };

  return (
    <>
      <div className="deck-grid" role="radiogroup" aria-label="Deck">
        {list.map((listing) => (
          <DeckSwatch
            key={`${listing.origin}:${listing.meta.id}`}
            listing={listing}
            on={listing.meta.id === activeId}
            onPick={() => void selectDeck(listing.meta.id)}
            onRemove={listing.origin === 'imported' ? () => void onRemove(listing) : undefined}
          />
        ))}
      </div>
      <div className="row deck-import">
        <button type="button" className="btn btn-small" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Importing…' : 'Import a deck'}
        </button>
        <input
          ref={input}
          type="file"
          accept=".zip,.json,application/zip,application/json"
          hidden
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </div>
      <p className="micro">
        An Open Playing Cards deck, the .zip or the .cards.json, from Card Atelier or anything else that writes the format. It stays on this device.
      </p>
      {note && <p className="micro" role="status">{note}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

function DeckSwatch({ listing, on, onPick, onRemove }: { listing: DeckListing; on: boolean; onPick: () => void; onRemove?: () => void }): JSX.Element {
  const { meta, origin } = listing;
  const [preview, setPreview] = useState<DeckArt | null>(null);

  useEffect(() => {
    let revoke = (): void => {};
    let live = true;
    previewArt({ meta, origin })
      .then((p) => {
        revoke = p.revoke;
        if (live) setPreview({ meta, back: p.back, faces: new Map([['As', p.ace]]) });
        else p.revoke();
      })
      .catch(() => setPreview(null));
    return () => {
      live = false;
      revoke();
    };
  }, [meta, origin]);

  const source = meta.source ? hostOf(meta.source) : null;
  return (
    <div className={`deck-swatch ${on ? 'on' : ''}`}>
      <button type="button" role="radio" aria-checked={on} className="deck-choose" onClick={onPick}>
        <span className="deck-preview" style={{ height: 48 * meta.geometry.aspect }}>
          {preview && (
            <>
              <Card card={null} width={48} deck={preview} title={`${meta.name} back`} />
              <Card card="As" width={48} deck={preview} title={`${meta.name} ace of spades`} />
            </>
          )}
        </span>
        <span>
          <span className="name">{meta.name}</span>
          <span className="micro">{meta.author ? `by ${meta.author}` : origin === 'imported' ? 'imported' : ''}</span>
        </span>
      </button>
      {(source || onRemove) && (
        <div className="deck-foot micro">
          {source && (
            <a href={meta.source} target="_blank" rel="noreferrer">
              {source}
            </a>
          )}
          {onRemove && (
            <button type="button" className="deck-remove" onClick={onRemove}>
              remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.host : null;
  } catch {
    return null;
  }
}
