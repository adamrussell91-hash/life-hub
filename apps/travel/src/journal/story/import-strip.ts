import { button, el } from '@/journal/story/dom';

export interface StripAction {
  label: string;
  onSelect: () => void;
}

export interface StripMessage {
  text: string;
  /** Smaller lines under the headline: what was skipped and why. */
  notes?: string[];
  actions?: StripAction[];
  tone?: 'plain' | 'problem';
  /** Leaves by itself after this long. Omit to stay until dismissed or replaced. */
  autoHideMs?: number;
}

export interface ImportStripHandle {
  el: HTMLElement;
  /** "Reading 4 of 12 photos…" with a progress line. */
  reading(done: number, total: number): void;
  message(message: StripMessage): void;
  hide(): void;
  destroy(): void;
}

export const STRIP_HIDE_AFTER_MS = 10_000;

/**
 * A slim status line above the dock for work that needs no sheet: photos
 * being read and filed, what was skipped, and Undo. It is not an overlay:
 * the story stays usable under it and Back is untouched.
 */
export function mountImportStrip(): ImportStripHandle {
  const strip = el('div', 'story-strip');
  strip.setAttribute('role', 'status');
  strip.setAttribute('aria-live', 'polite');
  strip.setAttribute('data-import-strip', '');
  strip.hidden = true;

  const text = el('div', 'story-strip__text');
  const headline = el('p', 'story-strip__headline num');
  const notes = el('p', 'story-strip__notes num');
  text.append(headline, notes);
  const bar = el('progress', 'story-strip__bar');
  bar.max = 1;
  const actions = el('div', 'story-strip__actions');
  const close = button('story-strip__close', '×');
  close.setAttribute('aria-label', 'Dismiss');
  strip.append(text, actions, close, bar);

  let timer: ReturnType<typeof setTimeout> | null = null;
  const clearTimer = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  function hide(): void {
    clearTimer();
    strip.hidden = true;
  }
  close.addEventListener('click', hide);

  function reading(done: number, total: number): void {
    clearTimer();
    strip.hidden = false;
    strip.classList.remove('story-strip--problem');
    headline.textContent =
      done >= total
        ? `Filing ${total} photo${total === 1 ? '' : 's'}…`
        : total === 1
          ? 'Reading 1 photo…'
          : `Reading ${Math.min(done + 1, total)} of ${total} photos…`;
    notes.textContent = '';
    notes.hidden = true;
    actions.replaceChildren();
    close.hidden = true;
    bar.hidden = false;
    bar.value = total > 0 ? done / total : 0;
  }

  function message(m: StripMessage): void {
    clearTimer();
    strip.hidden = false;
    strip.classList.toggle('story-strip--problem', m.tone === 'problem');
    headline.textContent = m.text;
    notes.textContent = (m.notes ?? []).join(' · ');
    notes.hidden = !m.notes?.length;
    bar.hidden = true;
    close.hidden = false;
    actions.replaceChildren(
      ...(m.actions ?? []).map((action) => {
        const btn = button('story-strip__action', action.label);
        btn.addEventListener('click', action.onSelect);
        return btn;
      }),
    );
    if (m.autoHideMs) timer = setTimeout(hide, m.autoHideMs);
  }

  return { el: strip, reading, message, hide, destroy: hide };
}
