import { useRef, useState } from 'react';
import { copyText } from '../clipboard.js';
import { absoluteUrl } from '../format.js';
import { QrCode } from './QrCode.js';
import { Icon } from './Icon.js';

type CopyState = 'idle' | 'copied' | 'manual';

interface InviteProps {
  code: string;
  joinUrl: string;
  hasPassword?: boolean;
  /** Bigger in a dialog, where it is the only thing on screen. */
  qrSize?: number;
}

/**
 * Everything somebody needs to get to this table: the code to read aloud, a QR
 * to point a phone at, and the link to send.
 */
export function Invite({ code, joinUrl, hasPassword = false, qrSize = 160 }: InviteProps): JSX.Element {
  const [state, setState] = useState<CopyState>('idle');
  const linkRef = useRef<HTMLInputElement>(null);
  // The server may send this relative; nobody can scan or send a relative link.
  const link = absoluteUrl(joinUrl);

  const copy = async (): Promise<void> => {
    if (await copyText(link)) {
      setState('copied');
      setTimeout(() => setState('idle'), 1600);
      return;
    }
    // Copying is blocked on plain http, so offer the text instead of failing quietly.
    setState('manual');
    linkRef.current?.focus();
    linkRef.current?.select();
  };

  return (
    <div className="invite">
      <div className="invite-code">
        <div className="label">room code</div>
        <div className="code-big">{code}</div>
      </div>
      <div className="invite-qr">
        <QrCode text={link} size={qrSize} />
        <div className="micro">Point a camera at it</div>
      </div>
      <div className="invite-link">
        <input
          ref={linkRef}
          className="input"
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Join link"
        />
        <button className="btn" onClick={() => void copy()}>
          <Icon name={state === 'copied' ? 'check' : 'copy'} />
          {state === 'copied' ? 'Copied' : state === 'manual' ? 'Copy it now' : 'Copy link'}
        </button>
      </div>
      {state === 'manual' && (
        <p className="micro" style={{ margin: 0 }}>
          This browser will not let the page reach the clipboard, which happens on a plain http address.
          The link is selected, so copy it yourself.
        </p>
      )}
      {hasPassword && <div className="micro">This table has a password. Tell people in person.</div>}
    </div>
  );
}
