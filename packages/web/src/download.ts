/**
 * Hand a file to the browser to keep, returning whether it got that far.
 *
 * Unlike copying, this needs no secure context, so a self-hosted Calliope at
 * http://192.168.1.50:8080 saves a file the same as anywhere. What it does need
 * is a download attribute; the handful of browsers without one get the file
 * opened in a tab instead, where it can be saved by hand, and if even that is
 * blocked the caller is told so it can offer the words another way.
 */
export function saveBlob(blob: Blob, filename: string): boolean {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    if (!('download' in link)) return window.open(url, '_blank') !== null;
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } catch {
    return false;
  } finally {
    // Not immediately: revoking before the browser has read the blob cancels
    // the save on some of them.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
