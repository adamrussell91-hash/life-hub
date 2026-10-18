import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeAllJournalOverlays,
  journalOverlayOpenCount,
  presentJournalOverlay,
} from '@/journal/overlay-host';

function sheetIn(anchor: HTMLElement) {
  const back = document.createElement('div');
  back.className = 'sheet-back';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  const button = document.createElement('button');
  sheet.append(button);
  back.append(sheet);
  return { back, sheet, button };
}

afterEach(() => {
  closeAllJournalOverlays();
  document.body.replaceChildren();
});

describe('journal overlay host', () => {
  it('mounts the sheet inside the backdrop so taps on the sheet never dismiss it', () => {
    const anchor = document.body;
    const { back, sheet, button } = sheetIn(anchor);
    const dismiss = vi.fn();
    const handle = presentJournalOverlay(back, { anchor, dismiss });
    expect(back.isConnected).toBe(true);
    expect(back.contains(sheet)).toBe(true);

    button.click();
    sheet.click();
    expect(dismiss).not.toHaveBeenCalled();

    back.click();
    expect(dismiss).toHaveBeenCalledTimes(1);
    handle.release();
    expect(back.isConnected).toBe(false);
  });

  it('closes only the top overlay on Escape and stacks later overlays above earlier ones', () => {
    const anchor = document.body;
    const first = sheetIn(anchor);
    const second = sheetIn(anchor);
    const dismissFirst = vi.fn();
    const dismissSecond = vi.fn();
    presentJournalOverlay(first.back, { anchor, dismiss: dismissFirst });
    presentJournalOverlay(second.back, { anchor, dismiss: dismissSecond });

    expect(first.back.style.getPropertyValue('--journal-overlay-depth')).toBe('0');
    expect(second.back.style.getPropertyValue('--journal-overlay-depth')).toBe('1');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dismissSecond).toHaveBeenCalledTimes(1);
    expect(dismissFirst).not.toHaveBeenCalled();
  });

  it('treats browser Back as dismiss for the top overlay and re-arms it if the sheet stays open', async () => {
    // Earlier tests closed overlays via history.back(); this test DOM never
    // reports those, so let the host stop waiting for them first.
    await new Promise((resolve) => setTimeout(resolve, 900));
    const anchor = document.body;
    const { back } = sheetIn(anchor);
    const dismiss = vi.fn(); // guarded sheet: declines to close (unsaved edits)
    presentJournalOverlay(back, { anchor, dismiss });
    const pushes = vi.spyOn(history, 'pushState');

    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(pushes).toHaveBeenCalledTimes(1);
    expect(journalOverlayOpenCount()).toBe(1);
  });

  it('locks the page behind while open and restores the scroll position after', () => {
    const anchor = document.body;
    const { back } = sheetIn(anchor);
    const handle = presentJournalOverlay(back, { anchor, dismiss: () => handle.release() });
    expect(document.body.style.position).toBe('fixed');
    handle.release();
    expect(document.body.style.position).toBe('');
    expect(journalOverlayOpenCount()).toBe(0);
  });
});
