/**
 * Word tray under a rich text block in a lesson.
 *
 * Lessons replace the floating dictionary card with a tray attached to the
 * bottom of the text. Words the teacher pinned sit in a slim strip of pills;
 * a pill or a lit word in the text opens the tray, which pushes the next block
 * down rather than covering the passage. One word is open at a time.
 *
 * The tray has up to two steps:
 *   Play with the word  The morphemic matrix, built from the tapped word, when
 *                       the word belongs to a known family.
 *   Copy it down        What to write in their book: the word in parts, its
 *                       meaning in their own words, a word they built and a
 *                       sentence. "I've copied it" ticks the pill.
 *
 * Copied words are kept in this browser only, like matrix progress.
 */
import { createMorphemicMatrix, findMorphology, readFoundMorphology, type MorphologyFamily } from '@/blocks/morphology';
import { WORD_HELP_KIND_LABEL, type WordHelpEntry } from '@/blocks/word-help';

type Step = 'play' | 'copy';

const TONE: Record<'front' | 'prefix' | 'ending', string> = { front: 'gold', prefix: 'peach', ending: 'sage' };

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

export function copiedStorageKey(lessonId: string): string {
  return `teaching-hub:word-copied:${lessonId}`;
}

function readCopied(lessonId: string, storage: Storage | null): Set<string> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(copiedStorageKey(lessonId)) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeCopied(lessonId: string, storage: Storage | null, copied: Set<string>): void {
  try {
    storage?.setItem(copiedStorageKey(lessonId), JSON.stringify([...copied]));
  } catch {
    /* private window or full storage: the tick just does not persist */
  }
}

const key = (word: string): string => word.trim().toLowerCase();

/** The word split into its matrix parts, as tiles. Empty when the word is not in the family's list. */
function partTiles(family: MorphologyFamily, word: string): HTMLElement | null {
  const entry = family.words.find((candidate) => candidate.word === key(word));
  if (!entry) return null;
  const parts = el('span', 'word-tray__parts');
  const add = (slot: 'front' | 'prefix' | 'ending', id: string) => {
    if (!id) return;
    const list = slot === 'front' ? family.fronts : slot === 'prefix' ? family.prefixes : family.endings;
    const label = (list.find((item) => item.id === id)?.label ?? id).replace(/-/g, '');
    parts.append(el('span', `morph-matrix__tile morph-matrix__tile--${TONE[slot]}`, label));
  };
  add('front', entry.front);
  add('prefix', entry.prefix);
  parts.append(el('span', 'morph-matrix__tile morph-matrix__tile--base', family.base));
  add('ending', entry.ending);
  return parts;
}

export function createWordTray(options: {
  lessonId: string;
  /** Words shown as pills in the strip. */
  pinned: WordHelpEntry[];
  copyStep: boolean;
  storage?: Storage | null;
}): { root: HTMLElement; open: (entry: WordHelpEntry, anchor?: HTMLElement) => void; close: () => void } {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const copied = readCopied(options.lessonId, storage);

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
      pill.replaceChildren();
      if (copied.has(word)) {
        const tick = el('span', 'word-tray__tick', '✓');
        tick.setAttribute('aria-hidden', 'true');
        pill.append(tick);
      }
      pill.append(el('span', '', entry.word), el('span', 'word-tray__chev', '›'));
      pill.setAttribute('aria-label', `${entry.word}${copied.has(word) ? ', copied down' : ''}`);
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

    const steps: Step[] = [...(family ? (['play'] as const) : []), ...(options.copyStep ? (['copy'] as const) : [])];
    if (steps.length === 0) return;

    const panes = new Map<Step, HTMLElement>();
    const tabs = el('div', 'word-tray__steps');
    tabs.setAttribute('role', 'tablist');
    const tabButtons = new Map<Step, HTMLButtonElement>();
    steps.forEach((step, index) => {
      const button = el('button', 'word-tray__step');
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.append(el('span', 'word-tray__step-n', String(index + 1)), step === 'play' ? 'Play with the word' : 'Copy it down');
      button.addEventListener('click', () => show(step));
      tabButtons.set(step, button);
      tabs.append(button);
    });
    if (steps.length > 1) panel.append(tabs);

    function show(step: Step): void {
      for (const [name, button] of tabButtons) button.setAttribute('aria-selected', String(name === step));
      for (const [name, pane] of panes) pane.hidden = name !== step;
      if (step === 'copy') paintCopy();
    }

    if (family) {
      const play = el('div', 'word-tray__pane');
      play.append(createMorphemicMatrix(family, storage, { start: entry.word }));
      if (options.copyStep) {
        const next = el('button', 'btn btn--primary word-tray__next', 'Copy it down →');
        next.type = 'button';
        next.addEventListener('click', () => show('copy'));
        play.append(next);
      }
      panes.set('play', play);
      panel.append(play);
    }

    const copy = el('div', 'word-tray__pane');
    function paintCopy(): void {
      copy.replaceChildren();
      const book = el('div', 'word-tray__book');
      const line = (label: string, ...rest: Array<Node | string>) => {
        const p = el('p', 'word-tray__line');
        if (label) p.append(el('span', 'word-tray__line-label', label));
        p.append(...rest);
        return p;
      };
      const blank = (hint: string) => el('span', 'word-tray__blank', hint);
      const parts = family ? partTiles(family, entry.word) : null;
      book.append(line('', el('strong', 'word-tray__copy-word', entry.word), ...(parts ? [parts] : [])));
      book.append(line('Means:', blank('in your own words')));
      if (family) {
        const built = readFoundMorphology(family, storage).find((word) => word !== key(entry.word));
        book.append(line('I built:', el('strong', '', built ?? '…'), ' = ', blank('its meaning')));
      }
      book.append(line('My sentence:', blank('your own sentence')));

      const foot = el('div', 'word-tray__copy-foot');
      const done = copied.has(key(entry.word));
      const check = el('button', done ? 'word-tray__check is-done' : 'word-tray__check', done ? '✓ Copied into my book' : "I've copied it into my book");
      check.type = 'button';
      check.setAttribute('aria-pressed', String(done));
      check.addEventListener('click', () => {
        if (copied.has(key(entry.word))) copied.delete(key(entry.word));
        else copied.add(key(entry.word));
        writeCopied(options.lessonId, storage, copied);
        paintCopy();
        paintPills();
      });
      foot.append(check, el('span', 'word-tray__hint', 'Write it, don’t type it.'));
      copy.append(book, foot);
    }
    if (options.copyStep) {
      panes.set('copy', copy);
      panel.append(copy);
    }
    show(steps[0]);
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
