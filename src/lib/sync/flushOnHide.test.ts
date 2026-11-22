import { describe, expect, it, vi } from 'vitest';
import { bindFlushOnHide } from './flushOnHide.ts';

function env(visibilityState: 'visible' | 'hidden') {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState });
  return { win, doc };
}

describe('bindFlushOnHide', () => {
  it('flushes when the page becomes hidden, not when it becomes visible', () => {
    const { win, doc } = env('hidden');
    const flush = vi.fn();
    bindFlushOnHide(win, doc, flush);
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(flush).toHaveBeenCalledTimes(1);
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('flushes on pagehide', () => {
    const { win, doc } = env('visible');
    const flush = vi.fn();
    bindFlushOnHide(win, doc, flush);
    win.dispatchEvent(new Event('pagehide'));
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('stops listening after unbind', () => {
    const { win, doc } = env('hidden');
    const flush = vi.fn();
    const unbind = bindFlushOnHide(win, doc, flush);
    unbind();
    doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('pagehide'));
    expect(flush).not.toHaveBeenCalled();
  });
});
