import { vi } from 'vitest';
import { HUB_HOLD_MS, closeHubMenu } from '../../../design-kit/js/hub-list.js';

/** Open a ··· trigger and return the menu item for `action` (data-list-action or data-block-action). */
export function menuItem(trigger: Element, action: string): HTMLButtonElement | null {
  closeHubMenu();
  (trigger as HTMLButtonElement).click();
  return document.querySelector<HTMLButtonElement>(
    `.hub-action-menu [data-list-action="${action}"], .hub-action-menu [data-block-action="${action}"]`
  );
}

/** Press and hold a hold-to-confirm control long enough to fire it. */
export function hold(button: HTMLElement): void {
  vi.useFakeTimers();
  try {
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    vi.advanceTimersByTime(HUB_HOLD_MS + 20);
  } finally {
    vi.useRealTimers();
  }
}

/** Open the row/tab menu and hold its Delete item. */
export function holdDelete(trigger: Element): void {
  const del = menuItem(trigger, 'delete');
  if (!del) throw new Error('no delete item');
  hold(del);
}

export function clickMenuAction(trigger: Element, action: string): void {
  const item = menuItem(trigger, action);
  if (!item) throw new Error(`no ${action} item`);
  item.click();
}
