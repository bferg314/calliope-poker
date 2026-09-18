export function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

export function fmtSigned(n: number): string {
  return n > 0 ? `+${fmt(n)}` : fmt(n);
}

export function fmtMoney(value: number, currency: string): string {
  const s = Number.isInteger(value) ? fmt(value) : value.toFixed(2);
  return `${currency}${s}`;
}

/** mm:ss or h:mm:ss for a duration in ms. */
export function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}

export function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
