import { presentJournalOverlay, type JournalOverlayHandle } from '@/journal/overlay-host';
import { button, el, icon } from '@/journal/story/dom';

export interface StorySheetHandle {
  /** The scrolling body, for the caller to fill. */
  body: HTMLElement;
  close(): void;
  destroy(): void;
}

export interface StorySheetOptions {
  anchor: HTMLElement;
  /** Spoken name of the dialog. */
  label: string;
  title?: string;
  subtitle?: string;
  onClose?: () => void;
}

/**
 * A bottom sheet for lists of actions. Mounted through the journal overlay
 * host, so Back, Escape and a tap on the dimmed page all close it, and the
 * page behind does not scroll.
 */
export function openStorySheet(options: StorySheetOptions): StorySheetHandle {
  const back = el('div', 'sheet-back story-sheet-back');
  const sheet = el('div', 'story-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', options.label);

  const grab = el('div', 'story-sheet__grab');
  grab.setAttribute('aria-hidden', 'true');
  const body = el('div', 'story-sheet__body');
  if (options.title) body.append(el('h3', 'story-sheet__title', options.title));
  if (options.subtitle) body.append(el('p', 'story-sheet__subtitle num', options.subtitle));
  sheet.append(grab, body);
  back.append(sheet);

  let overlay: JournalOverlayHandle | null = null;
  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    overlay?.release();
    options.onClose?.();
  }

  // Drag the handle down to dismiss.
  let startY: number | null = null;
  let dragged = 0;
  grab.addEventListener('pointerdown', (ev) => {
    startY = ev.clientY;
    dragged = 0;
    grab.setPointerCapture?.(ev.pointerId);
    sheet.style.transition = 'none';
  });
  grab.addEventListener('pointermove', (ev) => {
    if (startY === null) return;
    dragged = Math.max(0, ev.clientY - startY);
    sheet.style.transform = `translateY(${dragged}px)`;
  });
  const endDrag = (): void => {
    if (startY === null) return;
    startY = null;
    sheet.style.transition = '';
    if (dragged > 70) close();
    else sheet.style.transform = '';
  };
  grab.addEventListener('pointerup', endDrag);
  grab.addEventListener('pointercancel', endDrag);

  overlay = presentJournalOverlay(back, { anchor: options.anchor, dismiss: close });
  return { body, close, destroy: close };
}

export interface SheetRowOptions {
  label: string;
  hint?: string;
  paths?: string | string[];
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

/** One tappable row, at least 44px tall, with an optional line of explanation under it. */
export function sheetRow(options: SheetRowOptions): HTMLButtonElement {
  const row = button(`story-sheet__row${options.danger ? ' story-sheet__row--danger' : ''}`);
  if (options.paths) row.append(icon(options.paths));
  const text = el('span', 'story-sheet__row-text');
  text.append(el('span', 'story-sheet__row-label', options.label));
  if (options.hint) text.append(el('span', 'story-sheet__row-hint', options.hint));
  row.append(text);
  if (options.disabled) {
    row.disabled = true;
    if (options.hint) row.setAttribute('aria-description', options.hint);
  }
  if (options.onSelect) row.addEventListener('click', options.onSelect);
  return row;
}
