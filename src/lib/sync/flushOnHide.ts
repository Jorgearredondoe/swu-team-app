type HideSource = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/**
 * Flushes pending writes when the page is hidden or being unloaded (tab switch, app
 * backgrounded on mobile, navigation away). Returns an unbind function.
 *
 * Best effort only. `visibilitychange` -> hidden is the primary path: it fires before
 * most closes and while the page can still run network requests. `pagehide` is a
 * fallback, but a normal fetch started during unload may be cancelled by the browser,
 * so edits made within the debounce window right before closing the tab can be lost
 * (they were never confirmed, so the next load shows the last saved value). A
 * `keepalive` fetch would need the raw PostgREST request and auth headers instead of
 * supabase-js, so it is intentionally not used.
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
