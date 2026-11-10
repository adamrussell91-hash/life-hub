// apps/tasks/src/views/thinking/library.ts
// #/think-library: Browse all. Every map option (not the tool-level ones), every snare and the
// Problem Solver toolkit tools, in four families. Tabs and a search box narrow the grid; a model
// card opens its tool; a snare card opens in place to show what to ask yourself and what helps.
import './library.css';
import { el } from '@/views/hub-kit';
import { allOptions, FAMILIES, SNARES } from '../../../../../packages/thinking-map/index.mjs';
import { TOOLS as PS_TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';
import { coverFor, type CoverFamily } from './library-covers';
import { optionLabel, toolName, toolRoute } from './map';

export type LibraryFamily = CoverFamily;
export type LibraryTab = 'all' | LibraryFamily;

export type LibraryCard = {
  id: string;
  family: LibraryFamily;
  title: string;
  when: string;
  /** "Decision Maker", "Protocol", "Problem Solver" or "Snare". */
  tool: string;
  href: string | null;
  snare?: { check: string; counters: string[] };
};

type RawOption = { id: string; tool: string; kind: string; title: string; when: string; family: string | null };
type RawSnare = { id: string; title: string; when: string; check: string; counters: readonly string[] };
type RawPsTool = { id?: string; name?: string; when?: string };

export const FAMILY_LABEL: Record<LibraryFamily, string> = { action: 'Action', insight: 'Insight', frame: 'Frame', snare: 'Snare' };
const TAB_LABEL: Record<LibraryTab, string> = { all: 'All', action: 'Actions', insight: 'Insights', frame: 'Frames', snare: 'Snares' };
const TABS: LibraryTab[] = ['all', ...(FAMILIES as readonly LibraryFamily[])];

const BANNER: Record<LibraryTab, { image: string; text: string }> = {
  all: { image: 'welcome', text: 'Everything in one place: tools to act with, ideas to see with, frames to ask with, and snares to watch for. Pick a card to open it.' },
  action: { image: 'actions', text: 'Tools that get something done: work out the problem, weigh the options, then commit and follow through.' },
  insight: { image: 'insights', text: 'Ways of seeing that change what you notice: how people, change and rules of thumb really behave.' },
  frame: { image: 'frames', text: 'Questions and angles that reframe a situation before you decide what to do about it.' },
  snare: { image: 'snares', text: 'Common slips in thinking. Open one to see how it feels from the inside and what helps.' }
};

const BOOK_PREFIX = /^(dm|gt|rb|ch|cb|cm)_/;

/** Where an option opens: protocols go to Knowledge, everything else to its tool. */
export function optionHref(tool: string, kind: string): string | null {
  if (kind === 'protocol') return '/knowledge/#protocols';
  return toolRoute(tool);
}

/** Every card on the page, in map order, with Problem Solver's toolkit tools after its models. */
export function buildCards(): LibraryCard[] {
  const cards: LibraryCard[] = [];
  for (const o of allOptions() as readonly RawOption[]) {
    if (o.kind === 'tool' || !o.family) continue;
    cards.push({ id: o.id, family: o.family as LibraryFamily, title: o.title, when: o.when, tool: toolName(o.tool), href: optionHref(o.tool, o.kind) });
  }
  const psRoute = toolRoute('problem-solver');
  for (const [id, def] of Object.entries(PS_TOOLS as Record<string, RawPsTool>)) {
    // A toolkit tool the map already lists as a model (swot, pareto…) keeps its one card.
    if (BOOK_PREFIX.test(id) || cards.some((c) => c.id === id)) continue;
    cards.push({ id, family: 'action', title: def.name ?? id, when: def.when ?? '', tool: 'Problem Solver', href: psRoute });
  }
  for (const s of SNARES as readonly RawSnare[]) {
    cards.push({ id: s.id, family: 'snare', title: s.title, when: s.when, tool: 'Snare', href: null, snare: { check: s.check, counters: [...s.counters] } });
  }
  return cards;
}

/** Cards for a tab whose title or when line contains the query (case-insensitive). */
export function filterCards(cards: readonly LibraryCard[], tab: LibraryTab, query: string): LibraryCard[] {
  const q = query.trim().toLowerCase();
  return cards.filter((c) => (tab === 'all' || c.family === tab) && (!q || `${c.title} ${c.when}`.toLowerCase().includes(q)));
}

export function tabCounts(cards: readonly LibraryCard[]): Record<LibraryTab, number> {
  const out: Record<LibraryTab, number> = { all: cards.length, action: 0, insight: 0, frame: 0, snare: 0 };
  for (const c of cards) out[c.family] += 1;
  return out;
}

const assetUrl = (name: string): string => {
  const base = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base}thinking-tools/${name}.jpg`;
};

function coverEl(card: LibraryCard): HTMLElement {
  const { recipe, svg } = coverFor(card.id, card.family);
  const box = el('div', 'tl-cover');
  box.dataset.recipe = recipe;
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = svg;
  return box;
}

function cardBody(card: LibraryCard): HTMLElement[] {
  return [
    coverEl(card),
    el('p', 'tl-card__family', FAMILY_LABEL[card.family]),
    el('h3', 'tl-card__title', card.title),
    el('p', 'tl-card__when', card.when),
    el('p', 'tl-card__tool', card.tool)
  ];
}

function counterHref(optionId: string): string | null {
  const o = (allOptions() as readonly RawOption[]).find((x) => x.id === optionId);
  return o ? optionHref(o.tool, o.kind) : null;
}

function snareCard(card: LibraryCard): HTMLElement {
  const root = el('article', 'tl-card tl-card--snare');
  const head = el('button', 'tl-card__head') as HTMLButtonElement;
  head.type = 'button';
  head.setAttribute('aria-expanded', 'false');
  const panelId = `tl-panel-${card.id}`;
  head.setAttribute('aria-controls', panelId);
  head.append(...cardBody(card));
  const panel = el('div', 'tl-card__panel');
  panel.id = panelId;
  panel.hidden = true;
  panel.append(el('p', 'tl-card__ask-label', 'Ask yourself'), el('p', 'tl-card__ask', card.snare!.check));
  const counters = card.snare!.counters.filter((id) => counterHref(id));
  if (counters.length) {
    const list = el('ul', 'tl-card__counters');
    for (const id of counters) {
      const link = el('a', 'tl-card__counter', optionLabel(id)) as HTMLAnchorElement;
      link.href = counterHref(id)!;
      const li = el('li');
      li.append(link);
      list.append(li);
    }
    panel.append(el('p', 'tl-card__ask-label', 'What helps'), list);
  }
  head.addEventListener('click', () => {
    const open = head.getAttribute('aria-expanded') !== 'true';
    head.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    root.classList.toggle('is-open', open);
  });
  root.append(head, panel);
  return root;
}

function linkCard(card: LibraryCard): HTMLElement {
  if (!card.href) {
    const plain = el('article', 'tl-card');
    plain.append(...cardBody(card));
    return plain;
  }
  const link = el('a', 'tl-card tl-card--link') as HTMLAnchorElement;
  link.href = card.href;
  link.append(...cardBody(card));
  return link;
}

export const cardElement = (card: LibraryCard): HTMLElement => (card.snare ? snareCard(card) : linkCard(card));

export function renderLibraryView(canvas: HTMLElement): void {
  const cards = buildCards();
  const counts = tabCounts(cards);
  let tab: LibraryTab = 'all';
  let query = '';

  const page = el('div', 'tl-page');
  const back = el('a', 'tl-back', 'Back to Think it through') as HTMLAnchorElement;
  back.href = '#/think';
  const tabs = el('div', 'tl-tabs');
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', 'Family');
  const buttons = new Map<LibraryTab, HTMLButtonElement>();
  for (const t of TABS) {
    const b = el('button', 'tl-tab') as HTMLButtonElement;
    b.type = 'button';
    b.dataset.tab = t;
    b.append(document.createTextNode(`${TAB_LABEL[t]} `), el('span', 'tl-tab__count', String(counts[t])));
    b.addEventListener('click', () => {
      tab = t;
      sync();
    });
    buttons.set(t, b);
    tabs.append(b);
  }
  const search = el('input', 'tl-search') as HTMLInputElement;
  search.type = 'search';
  search.placeholder = 'Search by name or when to use it';
  search.setAttribute('aria-label', 'Search tools');
  search.addEventListener('input', () => {
    query = search.value;
    sync();
  });
  const controls = el('div', 'tl-controls');
  controls.append(tabs, search);

  const banner = el('section', 'tl-banner');
  const grid = el('div', 'tl-grid');
  const empty = el('p', 'tl-empty', 'Nothing matches that. Try a shorter word, or pick All.');
  empty.hidden = true;
  const live = el('p', 'tl-count');
  live.setAttribute('role', 'status');

  function sync(): void {
    for (const [t, b] of buttons) b.setAttribute('aria-pressed', String(t === tab));
    const art = BANNER[tab];
    const img = el('img', 'tl-banner__img') as HTMLImageElement;
    img.src = assetUrl(art.image);
    img.alt = '';
    img.loading = 'lazy';
    const copy = el('div', 'tl-banner__copy');
    copy.append(el('h2', 'tl-banner__title', TAB_LABEL[tab]), el('p', 'tl-banner__text', art.text));
    banner.replaceChildren(img, copy);
    const shown = filterCards(cards, tab, query);
    grid.replaceChildren(...shown.map(cardElement));
    empty.hidden = shown.length > 0;
    live.textContent = `${shown.length} ${shown.length === 1 ? 'card' : 'cards'}`;
  }

  page.append(back, banner, controls, live, grid, empty);
  const root = el('div', 'tl-root');
  root.append(page);
  canvas.replaceChildren(root);
  sync();
}

export function unmountLibraryView(): void {
  // Nothing is polled or listened to outside the page.
}
