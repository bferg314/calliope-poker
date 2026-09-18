import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** The four-module margin the QR spec requires. Without it, scanners fail. */
const QUIET = 4;

/**
 * A QR code drawn as one SVG path.
 *
 * Deliberately dark ink on light stock, like the playing cards, rather than
 * theme colours: on a dark theme a transparent code gives dark modules on a
 * dark quiet zone, which no scanner will read. The plate is painted here so it
 * is right on every theme.
 */
export function QrCode({ text, size = 200 }: { text: string; size?: number }): JSX.Element {
  const { path, extent } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();

    // One rect per run of dark modules rather than per module: fewer nodes, and
    // no hairline seams between neighbours when the browser rounds subpixels.
    const parts: string[] = [];
    for (let row = 0; row < count; row++) {
      let run = 0;
      for (let col = 0; col <= count; col++) {
        const dark = col < count && qr.isDark(row, col);
        if (dark) {
          run += 1;
          continue;
        }
        if (run > 0) {
          parts.push(`M${col - run + QUIET} ${row + QUIET}h${run}v1h-${run}z`);
          run = 0;
        }
      }
    }
    return { path: parts.join(''), extent: count + QUIET * 2 };
  }, [text]);

  return (
    <svg
      className="qr"
      width={size}
      height={size}
      viewBox={`0 0 ${extent} ${extent}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <rect width={extent} height={extent} fill="var(--card-face)" />
      <path d={path} fill="var(--card-ink)" />
    </svg>
  );
}
