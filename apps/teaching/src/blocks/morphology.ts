/**
 * Morphemic matrix on the dictionary card and the lesson word tray.
 *
 * A matrix is a base plus the prefixes and suffixes that attach to it. A
 * student builds words from the morphemes (prefix, base, suffix), sees each
 * established word's definition as it is built, reads the prefix's relatives,
 * and counts words found out of the total so "find them all" works as a small
 * game. Built-in matrices live in data/morphology-families.ts; lessons also
 * load matrices from the shared library (morphemic-client.ts).
 *
 * Progress is a list of found words kept in this browser only. Nothing is sent
 * to the server and nothing is marked.
 */
import {
  MORPHOLOGY_FAMILIES,
  type MorphologyFamily,
  type MorphologySlot,
  type MorphologyWord
} from '@/data/morphology-families';

export type { MorphologyFamily };

type SlotName = 'front' | 'prefix' | 'ending';
type Selection = Record<SlotName, string>;

// `front` is an outer prefix (un- in un + ortho + dox); `ending` is the suffix.
const GROUPS: Array<{ slot: SlotName; tone: 'gold' | 'peach' | 'sage' }> = [
  { slot: 'front', tone: 'gold' },
  { slot: 'prefix', tone: 'peach' },
  { slot: 'ending', tone: 'sage' }
];

/** Prefix, or Prefix 1 and Prefix 2 in word order when a matrix has both; Suffix. */
function groupLabel(family: MorphologyFamily, slot: SlotName): string {
  if (slot === 'ending') return 'Suffix';
  if (family.fronts.length === 0 || family.prefixes.length === 0) return 'Prefix';
  return slot === 'front' ? 'Prefix 1' : 'Prefix 2';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function slotsFor(family: MorphologyFamily, slot: SlotName): MorphologySlot[] {
  return slot === 'front' ? family.fronts : slot === 'prefix' ? family.prefixes : family.endings;
}

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * The built-in matrix a word belongs to, or null. Matches the whole word,
 * ignoring case; for a phrase, the first of its words that has one.
 */
export function findMorphology(
  word: string,
  families: MorphologyFamily[] = MORPHOLOGY_FAMILIES
): MorphologyFamily | null {
  const key = word.trim().toLowerCase();
  if (!key) return null;
  for (const candidate of [key, ...key.split(/\s+/)]) {
    const family = families.find((entry) => entry.words.some((item) => item.word === candidate));
    if (family) return family;
  }
  return null;
}

/** The word in a phrase that the matrix builds, so the matrix opens on it. */
export function matrixWordIn(family: MorphologyFamily, word: string): string | null {
  const key = word.trim().toLowerCase();
  return [key, ...key.split(/\s+/)].find((candidate) => family.words.some((entry) => entry.word === candidate)) ?? null;
}

export function morphologyStorageKey(family: MorphologyFamily): string {
  return `teaching-hub:morphology:${family.id}`;
}

function readFound(family: MorphologyFamily, storage: Storage | null): string[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(morphologyStorageKey(family)) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    const known = new Set(family.words.map((entry) => entry.word));
    return parsed.filter((item): item is string => typeof item === 'string' && known.has(item));
  } catch {
    return [];
  }
}

function writeFound(family: MorphologyFamily, storage: Storage | null, found: string[]): void {
  try {
    storage?.setItem(morphologyStorageKey(family), JSON.stringify(found));
  } catch {
    /* private window or full storage: progress just does not persist */
  }
}

export function matchMorphologyWord(family: MorphologyFamily, selection: Selection): MorphologyWord | null {
  return (
    family.words.find(
      (entry) =>
        entry.front === selection.front && entry.prefix === selection.prefix && entry.ending === selection.ending
    ) ?? null
  );
}

function spell(family: MorphologyFamily, selection: Selection): string {
  return `${selection.front}${selection.prefix}${family.base}${selection.ending}`;
}

/**
 * The matrix itself: build row, chips, result, counter and found words.
 * `start` builds that word on open, so the student begins from the word they tapped.
 */
export function createMorphemicMatrix(
  family: MorphologyFamily,
  storage: Storage | null = browserStorage(),
  options: { start?: string } = {}
): HTMLElement {
  const total = family.words.length;
  const startKey = options.start ? matrixWordIn(family, options.start) : null;
  const startWord = family.words.find((entry) => entry.word === startKey);
  const selection: Selection = {
    front: startWord?.front ?? '',
    prefix: startWord?.prefix ?? '',
    ending: startWord?.ending ?? ''
  };
  let found = readFound(family, storage);
  let isNew = false;
  let armed = false;
  let armTimer: ReturnType<typeof setTimeout> | null = null;

  const root = el('section', 'morph-matrix');
  root.setAttribute('aria-label', `Morphemic matrix for ${family.base}`);

  const head = el('div', 'morph-matrix__head');
  const heading = el('div', 'morph-matrix__heading');
  heading.append(el('p', 'morph-matrix__title', family.source ? `Base: ${family.base}, from ${family.source}` : `Base: ${family.base}`));
  if (family.meaning) heading.append(el('p', 'morph-matrix__meaning', `“${family.meaning}”`));
  // A phrase opens the matrix of one of its words; say which.
  if (startKey && options.start && startKey !== options.start.trim().toLowerCase()) {
    const from = el('p', 'morph-matrix__from', 'Base of ');
    from.append(el('strong', '', startKey));
    heading.append(from);
  }
  const score = el('div', 'morph-matrix__score');
  const count = el('p', 'morph-matrix__count');
  const pips = el('div', 'morph-matrix__pips');
  pips.setAttribute('aria-hidden', 'true');
  score.append(count, pips);
  head.append(heading, score);

  const assembly = el('div', 'morph-matrix__assembly');
  const chipsHost = el('div', 'morph-matrix__chips');
  const cousins = el('p', 'morph-matrix__cousins');
  const result = el('div', 'morph-matrix__result');
  result.setAttribute('aria-live', 'polite');
  const foundHost = el('div', 'morph-matrix__found');
  const done = el('p', 'morph-matrix__done', `All ${total} found.`);
  done.hidden = true;

  const chipButtons: Array<{ slot: SlotName; id: string; button: HTMLButtonElement }> = [];
  for (const group of GROUPS) {
    const items = slotsFor(family, group.slot);
    if (items.length === 0) continue;
    const wrap = el('div', 'morph-matrix__group');
    wrap.append(el('span', 'morph-matrix__label', groupLabel(family, group.slot)));
    const row = el('div', 'morph-matrix__row');
    for (const item of items) {
      const button = el('button', `morph-matrix__chip morph-matrix__chip--${group.tone}`, item.label);
      button.type = 'button';
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        selection[group.slot] = selection[group.slot] === item.id ? '' : item.id;
        isNew = false;
        paint();
      });
      chipButtons.push({ slot: group.slot, id: item.id, button });
      row.append(button);
    }
    wrap.append(row);
    chipsHost.append(wrap);
  }

  function labelFor(slot: SlotName, id: string): string {
    return slotsFor(family, slot).find((item) => item.id === id)?.label ?? id;
  }

  function paintAssembly(): void {
    assembly.replaceChildren();
    const tile = (slot: SlotName, tone: string, placeholder: string): HTMLElement =>
      selection[slot]
        ? el('span', `morph-matrix__tile morph-matrix__tile--${tone}`, labelFor(slot, selection[slot]))
        : el('span', 'morph-matrix__tile morph-matrix__tile--empty', placeholder);
    // Only the slots this matrix uses, so an empty prefix box never hints at a prefix that does not exist.
    if (family.fronts.length) assembly.append(tile('front', 'gold', 'prefix'));
    if (family.prefixes.length) assembly.append(tile('prefix', 'peach', 'prefix'));
    assembly.append(el('span', 'morph-matrix__tile morph-matrix__tile--base', family.base));
    if (family.endings.length) assembly.append(tile('ending', 'sage', 'suffix'));
  }

  function paintResult(): void {
    result.replaceChildren();
    const any = selection.front || selection.prefix || selection.ending;
    if (!any) {
      result.append(el('p', 'morph-matrix__nudge', 'Choose parts to build a word.'));
      return;
    }
    const match = matchMorphologyWord(family, selection);
    if (!match) {
      result.append(
        el('p', 'morph-matrix__word', spell(family, selection)),
        el(
          'p',
          'morph-matrix__nudge',
          !selection.front && !selection.prefix
            ? `${family.base} is a bound base. Add a prefix to make a word.`
            : 'Not an established word. Try another path.'
        )
      );
      return;
    }
    if (!found.includes(match.word)) {
      found = [match.word, ...found];
      isNew = true;
      writeFound(family, storage, found);
    }
    if (isNew) result.append(el('span', 'morph-matrix__new', 'New word found'));
    result.append(
      el('p', 'morph-matrix__word', match.word),
      el('p', 'morph-matrix__def', match.definition),
      el('p', 'morph-matrix__example', match.example)
    );
  }

  function paintFound(refocusWord?: string): void {
    const n = found.length;
    count.textContent = `${n} of ${total} found`;
    pips.replaceChildren();
    for (let i = 0; i < total; i += 1) pips.append(el('span', i < n ? 'morph-matrix__pip is-on' : 'morph-matrix__pip'));
    foundHost.replaceChildren();
    const current = matchMorphologyWord(family, selection)?.word;
    for (const word of found) {
      const chip = el('button', word === current ? 'morph-matrix__found-chip is-current' : 'morph-matrix__found-chip', word);
      chip.type = 'button';
      chip.dataset.word = word;
      chip.addEventListener('click', () => {
        const entry = family.words.find((candidate) => candidate.word === word);
        if (!entry) return;
        selection.front = entry.front;
        selection.prefix = entry.prefix;
        selection.ending = entry.ending;
        isNew = false;
        paint(word);
      });
      foundHost.append(chip);
    }
    if (n > 0) {
      const again = el('button', 'morph-matrix__again', 'Start again');
      again.type = 'button';
      again.addEventListener('click', () => {
        if (!armed) {
          armed = true;
          again.textContent = 'Tap again to clear';
          armTimer = setTimeout(() => {
            armed = false;
            again.textContent = 'Start again';
          }, 3000);
          return;
        }
        if (armTimer) clearTimeout(armTimer);
        armed = false;
        found = [];
        selection.front = selection.prefix = selection.ending = '';
        isNew = false;
        writeFound(family, storage, found);
        paint();
      });
      foundHost.append(again);
    }
    done.hidden = n !== total;
    if (refocusWord) foundHost.querySelector<HTMLElement>(`[data-word="${refocusWord}"]`)?.focus({ preventScroll: true });
  }

  function paintChips(): void {
    for (const { slot, id, button } of chipButtons) button.setAttribute('aria-pressed', String(selection[slot] === id));
    const notes = (['front', 'prefix'] as const)
      .map((slot) => slotsFor(family, slot).find((item) => item.id === selection[slot])?.cousins)
      .filter((note): note is string => Boolean(note));
    cousins.textContent = notes.join(' ');
  }

  function paint(refocusWord?: string): void {
    paintAssembly();
    paintChips();
    paintResult();
    paintFound(refocusWord);
  }

  root.append(head, assembly, chipsHost, cousins, result, foundHost, done);
  paint();
  return root;
}

/**
 * The row on a dictionary card that opens the matrix. `onLayout` runs after the
 * panel opens or closes so the card can reposition itself.
 */
export function createMorphologyToggle(
  family: MorphologyFamily,
  onLayout: () => void,
  storage?: Storage | null
): HTMLElement {
  const wrap = el('div', 'morph');
  const button = el('button', 'morph__toggle');
  button.type = 'button';
  button.setAttribute('aria-expanded', 'false');
  button.append(
    el('span', 'morph__toggle-label', 'Morphemic matrix'),
    el('span', 'morph__toggle-meta', `${family.words.length} words`)
  );
  const panel = el('div', 'morph__panel');
  panel.hidden = true;
  let matrix: HTMLElement | null = null;
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    if (open && !matrix) {
      matrix = storage === undefined ? createMorphemicMatrix(family) : createMorphemicMatrix(family, storage);
      panel.append(matrix);
    }
    wrap.closest('.word-card')?.classList.toggle('word-card--matrix', open);
    onLayout();
  });
  wrap.append(button, panel);
  return wrap;
}
