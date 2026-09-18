import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from 'react';

export interface ConfirmOptions {
  title: string;
  /** One or two sentences saying what will happen. */
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' colours the confirm red and puts the keyboard on cancel first. */
  tone?: 'danger' | 'normal';
  /** One button only, for a dialog that just shows something. */
  hideCancel?: boolean;
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

/**
 * One dialog for the whole app, exposed as a promise so call sites read the same
 * way window.confirm did. Built on <dialog> so focus trapping, Escape and
 * top-layer stacking come from the browser rather than from our z-index ladder.
 */
export function ConfirmProvider({ children }: { children: ReactNode }): JSX.Element {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        const next: Pending = { ...options, resolve };
        pendingRef.current?.resolve(false); // a second ask supersedes the first
        pendingRef.current = next;
        setPending(next);
      }),
    [],
  );

  const settle = useCallback((ok: boolean) => {
    const p = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    p?.resolve(ok);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pending && !dialog.open) {
      dialog.showModal();
      // Destructive dialogs start on cancel, so Enter never fires the damage.
      const focus = pending.tone === 'danger' ? cancelRef.current : confirmRef.current;
      focus?.focus();
    } else if (!pending && dialog.open) {
      dialog.close();
    }
  }, [pending]);

  const danger = pending?.tone === 'danger';
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={dialogRef}
        className="modal"
        aria-labelledby="modal-title"
        onClose={() => settle(false)}
        onCancel={() => settle(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) settle(false); // the backdrop
        }}
      >
        {pending && (
          <div className="modal-sheet">
            <h2 id="modal-title">{pending.title}</h2>
            {pending.body && <div className="modal-body">{pending.body}</div>}
            <div className="modal-actions">
              {!pending.hideCancel && (
                <button ref={cancelRef} type="button" className="btn" onClick={() => settle(false)}>
                  {pending.cancelLabel ?? 'Never mind'}
                </button>
              )}
              <button
                ref={confirmRef}
                type="button"
                className={danger ? 'btn btn-red' : 'btn btn-ink'}
                onClick={() => settle(true)}
              >
                {pending.confirmLabel ?? 'Yes'}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}

/** Ask the player to confirm. Resolves false on Escape, cancel or a backdrop click. */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm outside ConfirmProvider');
  return confirm;
}
