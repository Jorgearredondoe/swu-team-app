type HideSource = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/**
 * Flushes pending writes when the page is hidden or being unloaded (tab switch, app
 * backgrounded on mobile, navigation away), the last reliable moments to send them.
 * Returns an unbind function.
 */
export function bindFlushOnHide(
  win: HideSource,
  doc: HideSource & { visibilityState: string },
  flush: () => void,
): () => void {
  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') flush();
  };
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pagehide', flush);
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pagehide', flush);
  };
}
