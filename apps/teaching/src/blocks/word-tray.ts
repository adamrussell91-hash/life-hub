/**
 * Word tray under a rich text block in a lesson.
 *
 * Lessons replace the floating dictionary card with a tray attached to the
 * bottom of the text. Words the teacher pinned sit in a slim strip of pills;
 * a pill or a lit word in the text opens the tray, which pushes the next block
 * down rather than covering the passage. One word is open at a time.
 *
 * The tray holds the word's meaning and, when the word belongs to a known
 * family, the morphemic matrix built from the tapped word.
 */
import { createMorphemicMatrix, findMorphology } from '@/blocks/morphology';
import { WORD_HELP_KIND_LABEL, type WordHelpEntry } from '@/blocks/word-help';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const key = (word: string): string => word.trim().toLowerCase();

export function createWordTray(options: {
  /** Words shown as pills in the strip. */
  pinned: WordHelpEntry[];
  storage?: Storage | null;
}): { root: HTMLElement; open: (entry: WordHelpEntry, anchor?: HTMLElement) => void; close: () => void } {
  const storage = options.storage === undefined ? browserStorage() : options.storage;

  const root = el('div', 'word-tray');
  const strip = el('div', 'word-tray__strip');
  const panel = el('section', 'word-tray__panel');
  panel.hidden = true;
  panel.tabIndex = -1;
  root.append(strip, panel);

  let current: WordHelpEntry | null = null;
  let anchor: HTMLElement | null = null;

  const pills = new Map<string, HTMLButtonElement>();
  if (options.pinned.length) {
    strip.append(el('span', 'word-tray__label', 'Words'));
    for (const entry of options.pinned) {
      const pill = el('button', 'word-tray__pill');
      pill.type = 'button';
      pill.dataset.word = key(entry.word);
      pill.setAttribute('aria-expanded', 'false');
      pill.addEventListener('click', () => open(entry, pill));
      pills.set(key(entry.word), pill);
      strip.append(pill);
    }
  }
  strip.hidden = pills.size === 0;

  function paintPills(): void {
    for (const [word, pill] of pills) {
      const entry = options.pinned.find((candidate) => key(candidate.word) === word)!;
      pill.replaceChildren(el('span', '', entry.word), el('span', 'word-tray__chev', '›'));
      pill.setAttribute('aria-expanded', String(current !== null && key(current.word) === word));
    }
  }

  function close(returnFocus = false): void {
    if (!current) return;
    current = null;
    panel.hidden = true;
    panel.replaceChildren();
    anchor?.setAttribute('aria-expanded', 'false');
    if (returnFocus) anchor?.focus({ preventScroll: true });
    anchor = null;
    paintPills();
  }

  function open(entry: WordHelpEntry, from?: HTMLElement): void {
    if (current && key(current.word) === key(entry.word)) {
      close(true);
      return;
    }
    anchor?.setAttribute('aria-expanded', 'false');
    current = entry;
    anchor = from ?? null;
    anchor?.setAttribute('aria-expanded', 'true');
    paint();
    paintPills();
    panel.hidden = false;
    panel.focus({ preventScroll: true });
    panel.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }

  function paint(): void {
    const entry = current!;
    const family = findMorphology(entry.word);
    panel.replaceChildren();
    panel.setAttribute('aria-label', `Word: ${entry.word}`);

    const head = el('div', 'word-tray__head');
    head.append(el('h3', 'word-tray__word', entry.word));
    if (entry.pronunciation) head.append(el('span', 'word-tray__say', entry.pronunciation));
    const tags = el('span', 'word-tray__tags');
    if (entry.part_of_speech) tags.append(el('span', 'word-card__tag', entry.part_of_speech));
    if (!entry.added) tags.append(el('span', `word-card__tag word-card__tag--${entry.kind}`, WORD_HELP_KIND_LABEL[entry.kind]));
    if (tags.childElementCount) head.append(tags);
    const closeButton = el('button', 'word-tray__close', '×');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close');
    closeButton.addEventListener('click', () => close(true));
    head.append(closeButton);
    panel.append(head, el('p', 'word-tray__def', entry.definition));
    if (entry.example) panel.append(el('p', 'word-tray__example', entry.example));
    if (entry.etymology) {
      const origin = el('p', 'word-tray__origin');
      origin.append(el('span', 'word-tray__origin-label', 'Origin '), entry.etymology);
      panel.append(origin);
    }

    if (family) panel.append(createMorphemicMatrix(family, storage, { start: entry.word }));
  }

  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close(true);
    }
  });
  // The teacher canvas selects a block on click; using the tray is not that.
  root.addEventListener('pointerdown', (event) => event.stopPropagation());

  paintPills();
  return { root, open: (entry, from) => open(entry, from), close: () => close(false) };
}
