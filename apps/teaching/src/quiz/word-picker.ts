import { passageWords, type WordSpan } from '@/quiz/core';
import { el } from '@/quiz/dom';

/**
 * A passage you select words in: tap the first word, then the last. The
 * student player and the question builder both use it for Spot the
 * technique, so a selection means the same words everywhere.
 *
 * Every word is a button, but only one sits in the tab order; the arrow keys
 * move between words, so a long passage is one tab stop.
 */

export type WordMark = { state?: 'found' | 'right' | 'part' | 'wrong' | 'answer'; badge?: string };

export type WordPicker = {
  root: HTMLElement;
  /** Repaints the per-word marks, e.g. after a spot is added or removed. */
  paint(marks: (index: number) => WordMark | undefined): void;
  clear(): void;
};

export function mountWordPicker(options: {
  passage: string;
  disabled?: boolean;
  label: string;
  onSelect?: (span: WordSpan | null) => void;
}): WordPicker {
  const words = passageWords(options.passage);
  const root = el('div', 'qz-words');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', options.label);
  const buttons: HTMLButtonElement[] = [];
  let anchor: number | null = null;
  let selection: WordSpan | null = null;
  let focusAt = 0;

  let line = 0;
  let para = el('p', 'qz-words__line');
  root.append(para);
  words.forEach((word, i) => {
    if (word.line !== line) {
      line = word.line;
      para = el('p', 'qz-words__line');
      root.append(para);
    } else if (i > 0) {
      para.append(document.createTextNode(' '));
    }
    const b = el('button', 'qz-word', word.text);
    b.type = 'button';
    b.disabled = !!options.disabled;
    b.tabIndex = i === 0 ? 0 : -1;
    b.addEventListener('click', () => tap(i));
    b.addEventListener('keydown', (event) => {
      const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: words.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      focus(Math.max(0, Math.min(words.length - 1, next)));
    });
    buttons.push(b);
    para.append(b);
  });

  function focus(i: number): void {
    buttons[focusAt]!.tabIndex = -1;
    focusAt = i;
    buttons[i]!.tabIndex = 0;
    buttons[i]!.focus();
  }

  // First tap starts a selection, second tap ends it, a third starts again.
  function tap(i: number): void {
    if (anchor === null) {
      anchor = i;
      selection = { from: i, to: i };
    } else {
      selection = { from: Math.min(anchor, i), to: Math.max(anchor, i) };
      anchor = null;
    }
    focusAt = i;
    buttons.forEach((b, n) => (b.tabIndex = n === i ? 0 : -1));
    showSelection();
    options.onSelect?.(selection);
  }

  function showSelection(): void {
    buttons.forEach((b, n) => {
      const on = !!selection && n >= selection.from && n <= selection.to;
      b.setAttribute('aria-pressed', String(on));
    });
  }

  return {
    root,
    paint(marks) {
      buttons.forEach((b, n) => {
        const mark = marks(n);
        if (mark?.state) b.dataset.state = mark.state;
        else delete b.dataset.state;
        if (mark?.badge) b.dataset.badge = mark.badge;
        else delete b.dataset.badge;
      });
    },
    clear() {
      anchor = null;
      selection = null;
      showSelection();
    }
  };
}

/** The selected words as text, without trailing punctuation. */
export function spanText(passage: string, span: WordSpan): string {
  return passageWords(passage)
    .slice(span.from, span.to + 1)
    .map((w) => w.text)
    .join(' ')
    .replace(/^["“‘'(]+|[,.;:!?"”’')]+$/g, '');
}
