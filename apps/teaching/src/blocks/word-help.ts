/**
 * Dictionary scan on rich text blocks.
 *
 * A scan returns cards for the challenging words in a block. A teacher's scan
 * is saved on `block.settings.word_help` and ships with the published lesson;
 * a student's own scan is fetched on demand. Either way the stored HTML is
 * never touched: matching words are wrapped in buttons at render time, and a
 * tap opens a dictionary card.
 */
import { positionHubFloating } from '../../design-kit/js/hub-floating.js';
import { createMorphologyToggle, findMorphology } from '@/blocks/morphology';

export type WordHelpKind = 'technical' | 'uncommon' | 'foreign' | 'archaic' | 'long' | 'idiom';

export type WordHelpEntry = {
  word: string;
  kind: WordHelpKind;
  part_of_speech: string;
  pronunciation: string;
  definition: string;
  etymology: string;
  example: string;
  /** Shown as a pill in the word strip under the text (lessons only). */
  pinned?: boolean;
  /** Typed in by the teacher rather than found by a scan. Always pinned. */
  added?: boolean;
};

/** `copy_step: false` hides the Copy it down step in the word tray. */
export type WordHelpData = { words: WordHelpEntry[]; scanned_at: string; copy_step?: boolean };

export const WORD_HELP_KIND_LABEL: Record<WordHelpKind, string> = {
  technical: 'Technical',
  uncommon: 'Uncommon',
  foreign: 'Borrowed',
  archaic: 'Old-fashioned',
  long: 'Long word',
  idiom: 'Phrase'
};

const KINDS = new Set(Object.keys(WORD_HELP_KIND_LABEL));
const SKIP_INSIDE = 'a, button, code, .word-help-term';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Cards from any untrusted list; drops entries with no word or definition. */
export function normaliseWordHelp(value: unknown): WordHelpEntry[] {
  if (!Array.isArray(value)) return [];
  const out: WordHelpEntry[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const word = text(entry.word);
    const definition = text(entry.definition);
    if (!word || !definition) continue;
    const kind = text(entry.kind);
    out.push({
      word,
      kind: (KINDS.has(kind) ? kind : 'uncommon') as WordHelpKind,
      part_of_speech: text(entry.part_of_speech),
      pronunciation: text(entry.pronunciation),
      definition,
      etymology: text(entry.etymology),
      example: text(entry.example),
      ...(entry.added === true ? { added: true, pinned: true } : entry.pinned === true ? { pinned: true } : {})
    });
  }
  return out;
}

/** The teacher's saved scan on a block, if any. */
export function readWordHelp(block: { settings?: Record<string, unknown> }): WordHelpEntry[] {
  const saved = block.settings?.word_help as { words?: unknown } | undefined;
  return normaliseWordHelp(saved?.words);
}

/** Whether the word tray offers its Copy it down step. On unless the teacher turned it off. */
export function readCopyStep(block: { settings?: Record<string, unknown> }): boolean {
  const saved = block.settings?.word_help as { copy_step?: unknown } | undefined;
  return saved?.copy_step !== false;
}

/** What opens when a lit word is tapped: the floating card, or a lesson's word tray. */
export type OpenWord = (anchor: HTMLElement, entry: WordHelpEntry) => void;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ');
}

/** Words that actually appear in `plain`, so a stale scan never lists missing words. */
export function wordsPresentIn(plain: string, words: WordHelpEntry[]): WordHelpEntry[] {
  return words.filter((entry) => {
    const pattern = escapeRegExp(entry.word).replace(/\s+/g, '\\s+');
    return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, 'iu').test(plain);
  });
}

/**
 * Wrap every occurrence of each word inside `root` in a button that opens its
 * card. Links, code and earlier wraps are left alone. Returns the number of
 * words wrapped at least once.
 */
export function applyWordHelp(root: HTMLElement, words: WordHelpEntry[], openWord: OpenWord = openWordCard): number {
  removeWordHelp(root);
  if (words.length === 0) return 0;
  const byKey = new Map(words.map((entry) => [matchKey(entry.word), entry]));
  const alternatives = [...byKey.keys()]
    .sort((a, b) => b.length - a.length)
    .map((key) => escapeRegExp(key).replace(/ /g, '\\s+'));
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'giu');

  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.closest(SKIP_INSIDE)) nodes.push(node as Text);
  }

  const order = new Map<string, number>();
  for (const node of nodes) {
    const value = node.data;
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    let last = 0;
    const fragment = doc.createDocumentFragment();
    while ((match = pattern.exec(value))) {
      const key = matchKey(match[0]);
      const entry = byKey.get(key);
      if (!entry) continue;
      if (!order.has(key)) order.set(key, order.size);
      fragment.append(value.slice(last, match.index));
      fragment.append(createTerm(doc, match[0], entry, order.get(key)!, openWord));
      last = match.index + match[0].length;
    }
    if (last === 0) continue;
    fragment.append(value.slice(last));
    node.replaceWith(fragment);
  }
  root.classList.toggle('word-help-on', order.size > 0);
  return order.size;
}

export function removeWordHelp(root: HTMLElement): void {
  for (const term of root.querySelectorAll<HTMLElement>('.word-help-term')) {
    term.replaceWith(term.ownerDocument.createTextNode(term.textContent ?? ''));
  }
  root.normalize();
  root.classList.remove('word-help-on');
}

function createTerm(
  doc: Document,
  label: string,
  entry: WordHelpEntry,
  index: number,
  openWord: OpenWord
): HTMLButtonElement {
  const term = doc.createElement('button');
  term.type = 'button';
  term.className = 'word-help-term';
  term.textContent = label;
  term.style.setProperty('--word-help-i', String(Math.min(index, 20)));
  term.setAttribute('aria-haspopup', 'dialog');
  term.setAttribute('aria-label', `${label}: show meaning`);
  // The teacher canvas selects a block on click; a word tap is not that.
  term.addEventListener('pointerdown', (event) => event.stopPropagation());
  term.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openWord(term, entry);
  });
  return term;
}

// --------------------------------------------------------------------- card

let closeOpenCard: (() => void) | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, value?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

export function buildWordCard(entry: WordHelpEntry, onClose: () => void, onLayout: () => void = () => {}): HTMLElement {
  const card = el('div', 'word-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', `Dictionary: ${entry.word}`);

  const head = el('div', 'word-card__head');
  const title = el('div', 'word-card__title');
  title.append(el('h3', 'word-card__word', entry.word));
  if (entry.pronunciation) title.append(el('p', 'word-card__say', entry.pronunciation));
  const close = el('button', 'word-card__close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  close.addEventListener('click', onClose);
  head.append(title, close);

  const tags = el('p', 'word-card__tags');
  if (entry.part_of_speech) tags.append(el('span', 'word-card__tag', entry.part_of_speech));
  tags.append(el('span', `word-card__tag word-card__tag--${entry.kind}`, WORD_HELP_KIND_LABEL[entry.kind]));

  card.append(head, tags, el('p', 'word-card__definition', entry.definition));
  if (entry.example) {
    const example = el('p', 'word-card__example');
    example.append(el('span', 'word-card__label', 'Example'), el('span', 'word-card__example-text', entry.example));
    card.append(example);
  }
  if (entry.etymology) {
    const origin = el('p', 'word-card__origin');
    origin.append(el('span', 'word-card__label', 'Origin'), el('span', '', entry.etymology));
    card.append(origin);
  }
  // Words that belong to a known family get a morphemic matrix under the card.
  const family = findMorphology(entry.word);
  if (family) card.append(createMorphologyToggle(family, onLayout));
  return card;
}

export function openWordCard(anchor: HTMLElement, entry: WordHelpEntry): void {
  closeOpenCard?.();
  const doc = anchor.ownerDocument;
  const card = buildWordCard(entry, () => close(true), () => place());
  doc.body.append(card);
  anchor.setAttribute('aria-expanded', 'true');

  const place = () => {
    void positionHubFloating(anchor, card, { placement: 'bottom-start', offset: 8 }).catch(() => {});
  };
  place();
  const onPointer = (event: Event) => {
    if (!card.contains(event.target as Node) && event.target !== anchor) close(false);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close(true);
  };
  doc.addEventListener('pointerdown', onPointer, true);
  doc.addEventListener('keydown', onKey);
  doc.defaultView?.addEventListener('resize', place);
  doc.defaultView?.addEventListener('scroll', place, true);
  card.tabIndex = -1;
  card.focus({ preventScroll: true });

  function close(returnFocus: boolean): void {
    if (closeOpenCard !== closer) return;
    closeOpenCard = null;
    card.remove();
    anchor.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('pointerdown', onPointer, true);
    doc.removeEventListener('keydown', onKey);
    doc.defaultView?.removeEventListener('resize', place);
    doc.defaultView?.removeEventListener('scroll', place, true);
    if (returnFocus) anchor.focus({ preventScroll: true });
  }
  const closer = () => close(false);
  closeOpenCard = closer;
}

// ----------------------------------------------------------------- scanning

/** The sweep that runs over the text while a scan is working. */
export function setScanning(root: HTMLElement, on: boolean): void {
  root.classList.toggle('word-help-scanning', on);
  if (on) {
    root.classList.remove('word-help-revealed');
  } else if (root.classList.contains('word-help-on')) {
    // One staggered shimmer as the words light up, then they settle.
    root.classList.add('word-help-revealed');
  }
}

export const DICTIONARY_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M9 7.5h7M9 11h5"/></svg>';
