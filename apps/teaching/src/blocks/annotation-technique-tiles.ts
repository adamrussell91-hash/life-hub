/**
 * Technique tiles: a reader's switch that makes Periodic Table techniques loud
 * on the poem. Each tagged phrase takes its family colour and wears a bold
 * tile (symbol + name); tapping either opens the technique card under that
 * line instead of in the side panel.
 */
import type { LiteraryFamily, LiteraryTechnique } from '@/blocks/literary-elements';

const PREF_KEY = 'lh-annotation-technique-tiles';

/** The reader's own choice survives reloads on this device; off by default. */
export function readTilesPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeTilesPref(on: boolean): void {
  try {
    if (on) localStorage.setItem(PREF_KEY, '1');
    else localStorage.removeItem(PREF_KEY);
  } catch {
    // Storage may be blocked; the switch still works until the page reloads.
  }
}

export type TileTechnique = {
  technique: LiteraryTechnique;
  family: LiteraryFamily | undefined;
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** Sets the family colour every tile piece reads (`--tile-c`). */
export function paintTileColour(node: HTMLElement, family: LiteraryFamily | undefined): void {
  if (family) node.style.setProperty('--tile-c', family.colour);
  if (family) node.dataset.family = family.key;
}

/** The bold tile that sits right after a tagged phrase. */
export function buildTechniqueTile(
  annotationId: string,
  tile: TileTechnique,
  open: boolean,
  onToggle: () => void
): HTMLButtonElement {
  const btn = el('button', 'block-annotation__tile');
  btn.type = 'button';
  btn.dataset.tileFor = annotationId;
  paintTileColour(btn, tile.family);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.setAttribute(
    'aria-label',
    `${tile.technique.name}: ${open ? 'close' : 'open'} card`
  );
  btn.append(
    el('span', 'block-annotation__tile-sym', tile.technique.symbol),
    el('span', 'block-annotation__tile-name', tile.technique.name)
  );
  btn.addEventListener('click', onToggle);
  return btn;
}

/** The card that opens under the line: technique, the teacher's note, then the full card. */
export function buildTileCard(input: {
  annotationId: string;
  tile: TileTechnique;
  quote: string;
  note: HTMLElement | null;
  fullCard: HTMLElement;
  onClose: () => void;
}): HTMLElement {
  const { technique, family } = input.tile;
  const card = el('section', 'block-annotation__tile-card');
  card.dataset.tileCardFor = input.annotationId;
  card.setAttribute('aria-label', `${technique.name} card`);
  paintTileColour(card, family);

  const head = el('div', 'block-annotation__tile-card-head');
  head.append(el('span', 'block-annotation__tile-card-sym', technique.symbol));
  const titles = el('div', 'block-annotation__tile-card-titles');
  titles.append(
    el('p', 'block-annotation__tile-card-name', technique.name),
    el('p', 'block-annotation__tile-card-family', family ? `${family.name} family` : 'Technique')
  );
  head.append(titles);
  const close = el('button', 'block-annotation__tile-card-close', 'Close');
  close.type = 'button';
  close.addEventListener('click', input.onClose);
  head.append(close);
  card.append(head);

  const body = el('div', 'block-annotation__tile-card-body');
  if (input.quote) body.append(el('p', 'block-annotation__tile-card-quote', `“${input.quote}”`));
  if (input.note && input.note.textContent?.trim()) {
    const here = el('div', 'block-annotation__tile-card-here');
    here.append(el('p', 'block-annotation__tile-card-label', 'What it does here'), input.note);
    body.append(here);
  }
  if (technique.definition?.trim()) {
    const what = el('div', 'block-annotation__tile-card-what');
    what.append(
      el('p', 'block-annotation__tile-card-label', 'What it is'),
      el('p', undefined, technique.definition)
    );
    if (technique.effect?.trim()) what.append(el('p', 'block-annotation__tile-card-effect', technique.effect));
    body.append(what);
  }
  const more = el('details', 'block-annotation__tile-card-more');
  more.append(
    el('summary', undefined, `More about ${technique.name.toLowerCase()}: origin, connections, practice`),
    input.fullCard
  );
  body.append(more);
  card.append(body);
  return card;
}
