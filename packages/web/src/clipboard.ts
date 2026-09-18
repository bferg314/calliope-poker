/**
 * Copy text, returning whether it worked.
 *
 * The modern clipboard API only exists in a secure context, and a self-hosted
 * Calliope is usually reached at something like http://192.168.1.50:8080, which
 * is not one. So this falls back to the old selection trick, and tells the
 * caller when even that failed so the interface can offer the text to copy by
 * hand instead of silently doing nothing.
 */
export async function copyText(text: string): Promise<boolean> {
  // Not a feature test: writeText can exist and still reject, for a permissions
  // policy or a missing user gesture.
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall through to the old way */
  }

  const previous = document.activeElement as HTMLElement | null;
  const field = document.createElement('textarea');
  field.value = text;
  // contentEditable rather than readOnly, because iOS refuses to select a
  // readOnly field; and offscreen rather than hidden, because display:none
  // cannot take focus.
  field.contentEditable = 'true';
  field.readOnly = false;
  field.setAttribute('aria-hidden', 'true');
  field.style.position = 'fixed';
  field.style.top = '0';
  field.style.left = '0';
  field.style.opacity = '0';
  field.style.pointerEvents = 'none';
  document.body.appendChild(field);

  try {
    field.focus();
    field.select();
    field.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(field);
    previous?.focus?.();
  }
}
