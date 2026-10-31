import type { AnthologyData, AnthologyItem } from '@/blocks/anthology-collect';
import {
  ANTHOLOGY_GROUPINGS,
  anthologyMapItems,
  anthologyNoteId,
  buildAnthologyGraph,
  type AnthologyGrouping
} from '@/blocks/anthology-graph';
import { lessonCollectionHref } from '@/blocks/collection-resolve';
import type { AnthologyView, Block } from '@/schemas/block';
import type { DockTool } from '../../../knowledge/src/archive/showAllDock';
import type { GraphMount } from '../../../knowledge/src/archive/forceGraphBehavior';

export type AnthologyViewMode = 'teacher' | 'student' | 'print';

export type BuildAnthologyViewOptions = {
  data: AnthologyData;
  mode: AnthologyViewMode;
  title?: string;
  onMakeCards?: (request: { items: AnthologyItem[]; view: AnthologyView }) => void;
};

/** The Show All tools that suit a unit's notes. Grow, Recall, Sharpen and Recent read a note's history. */
const ANTHOLOGY_TOOLS: readonly DockTool[] = ['spark', 'path', 'walk', 'bridges'];

function noteHref(item: AnthologyItem): string {
  return `${lessonCollectionHref(item.lesson_id)}#note=${encodeURIComponent(item.annotation_id)}`;
}

function emptyMessage(): string {
  return 'Tick Add to unit anthology on a note in any lesson of this unit, and give it a theme.';
}

function canDraw(): boolean {
  try {
    return Boolean(document.createElement('canvas').getContext('2d'));
  } catch {
    return false;
  }
}

function itemMatches(item: AnthologyItem, query: string): boolean {
  if (!query) return true;
  const hay = `${item.quote} ${item.note} ${item.lesson_title} ${item.themes.join(' ')} ${item.concepts.join(' ')}`;
  return hay.toLowerCase().includes(query.toLowerCase());
}

/** How long a block that left the page is watched for coming back before it is let go. */
const REATTACH_WAIT_MS = 60_000;

/**
 * Run `mount` once `host` is on the page, tear it down when it leaves, and run it again if it
 * comes back (a re-render or a folded section moves the block rather than rebuilding it).
 */
export function mountWhileConnected(host: HTMLElement, mount: () => () => void): void {
  let tries = 0;
  let stop: (() => void) | null = null;
  let letGo = 0;
  const watch = new MutationObserver(() => {
    if (host.isConnected && !stop) {
      window.clearTimeout(letGo);
      stop = mount();
    } else if (!host.isConnected && stop) {
      stop();
      stop = null;
      letGo = window.setTimeout(() => watch.disconnect(), REATTACH_WAIT_MS);
    }
  });
  const start = () => {
    if (!host.isConnected) {
      if (tries++ < 600) requestAnimationFrame(start);
      return;
    }
    stop = mount();
    watch.observe(document.body, { childList: true, subtree: true });
  };
  requestAnimationFrame(start);
}

function chip(text: string, kind: 'theme' | 'concept'): HTMLElement {
  const span = document.createElement('span');
  span.className = `block-anthology__chip block-anthology__chip--${kind}`;
  span.textContent = text;
  return span;
}

function noteCard(item: AnthologyItem, textTitle: string, mode: AnthologyViewMode): HTMLElement {
  const card = document.createElement('article');
  card.className = 'block-anthology__card';
  const quote = document.createElement('p');
  quote.className = 'block-anthology__card-quote';
  quote.textContent = `“${item.quote.replace(/\s+/g, ' ').trim()}”`;
  const meta = document.createElement('p');
  meta.className = 'block-anthology__card-meta';
  meta.textContent = [textTitle, item.line_number > 0 ? `line ${item.line_number}` : '', item.layer_name]
    .filter(Boolean)
    .join(' · ');
  card.append(quote, meta);
  if (item.note) {
    const note = document.createElement('p');
    note.className = 'block-anthology__card-note';
    note.textContent = item.note;
    card.append(note);
  }
  if (item.themes.length || item.concepts.length) {
    const chips = document.createElement('div');
    chips.className = 'block-anthology__chips';
    for (const theme of item.themes) chips.append(chip(theme, 'theme'));
    for (const concept of item.concepts) chips.append(chip(concept, 'concept'));
    card.append(chips);
  }
  const foot = document.createElement('div');
  foot.className = 'block-anthology__card-foot';
  const open = document.createElement('a');
  open.className = 'block-anthology__card-open';
  open.href = noteHref(item);
  open.textContent = 'Open in the lesson';
  foot.append(open);
  if (mode === 'teacher' && item.published === false) {
    const tag = document.createElement('span');
    tag.className = 'block-anthology__unpublished';
    tag.textContent = 'Not published';
    foot.append(tag);
  }
  card.append(foot);
  return card;
}

/** Paper has no canvas to pan: print lists each theme's notes instead. */
function printList(items: AnthologyItem[], titles: Map<string, string>): HTMLElement {
  const body = document.createElement('div');
  body.className = 'block-anthology__print';
  const themes = [...new Set(items.flatMap((item) => item.themes))].sort((a, b) => a.localeCompare(b));
  for (const theme of themes) {
    const heading = document.createElement('h4');
    heading.className = 'block-anthology__print-theme block-subtitle';
    heading.textContent = theme;
    const list = document.createElement('ul');
    for (const item of items.filter((row) => row.themes.includes(theme))) {
      const li = document.createElement('li');
      const where = [titles.get(item.block_id) ?? item.lesson_title, item.line_number > 0 ? `l.${item.line_number}` : '']
        .filter(Boolean)
        .join(' ');
      li.textContent = `“${item.quote.replace(/\s+/g, ' ').trim()}” (${where})`;
      list.append(li);
    }
    body.append(heading, list);
  }
  return body;
}

export function buildAnthologyView(
  block: Extract<Block, { block_type: 'anthology' }>,
  options: BuildAnthologyViewOptions
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'block-anthology';
  root.dataset.blockId = block.id;

  const titleText = options.title ?? block.content.title;
  if (titleText?.trim()) {
    const title = document.createElement('h3');
    title.className = 'block-anthology__title block-title';
    title.textContent = titleText.trim();
    root.append(title);
  }

  const titles = new Map(options.data.texts.map((text) => [text.block_id, text.title]));
  const items = anthologyMapItems(options.data);

  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'block-anthology__empty block-empty';
    empty.textContent = emptyMessage();
    root.append(empty);
    return root;
  }

  if (options.mode === 'print') {
    root.append(printList(items, titles));
    return root;
  }

  const byId = new Map(items.map((item) => [anthologyNoteId(item), item]));
  let grouping: AnthologyGrouping = 'theme';
  let query = '';
  let graph: GraphMount | null = null;

  const bar = document.createElement('div');
  bar.className = 'block-anthology__bar';

  const pills = document.createElement('div');
  pills.className = 'hub-pills block-anthology__groupings';
  pills.setAttribute('role', 'toolbar');
  pills.setAttribute('aria-label', 'Group the map by');
  const paintPills = () => {
    pills.replaceChildren();
    for (const option of ANTHOLOGY_GROUPINGS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hub-pills__btn';
      btn.textContent = option.label;
      btn.setAttribute('aria-pressed', option.id === grouping ? 'true' : 'false');
      btn.addEventListener('click', () => {
        if (grouping === option.id) return;
        grouping = option.id;
        paintPills();
        graph?.setModel(buildAnthologyGraph(options.data, grouping));
      });
      pills.append(btn);
    }
  };
  paintPills();

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'block-anthology__search';
  search.placeholder = 'Find a word, quote or idea';
  search.setAttribute('aria-label', 'Find in the anthology');
  search.addEventListener('input', () => {
    query = search.value.trim();
    graph?.setSearch(query);
  });

  const count = document.createElement('span');
  count.className = 'block-anthology__count';
  const textCount = new Set(items.map((item) => item.block_id)).size;
  count.textContent = `${items.length} notes · ${textCount} ${textCount === 1 ? 'text' : 'texts'}`;

  bar.append(pills, search, count);

  if (options.mode === 'teacher' && options.onMakeCards) {
    const make = document.createElement('button');
    make.type = 'button';
    make.className = 'btn btn--secondary block-anthology__make-cards';
    make.textContent = 'Make cards from these notes';
    make.title = 'Flashcards from the technique-tagged notes on the map, or those matching your search';
    make.addEventListener('click', () => {
      options.onMakeCards?.({ items: items.filter((item) => itemMatches(item, query)), view: 'theme' });
    });
    bar.append(make);
  }

  const frame = document.createElement('div');
  frame.className = 'block-anthology__map graph-wrap';
  const stage = document.createElement('div');
  stage.className = 'block-anthology__stage graph-stage';
  // The chosen note's card floats on the map, just under its dot (the map centres the dot it opens).
  const pop = document.createElement('div');
  pop.className = 'block-anthology__pop';
  pop.hidden = true;
  const closePop = () => {
    pop.hidden = true;
    pop.replaceChildren();
  };
  const showPop = (item: AnthologyItem | undefined) => {
    if (!item) {
      closePop();
      return;
    }
    const card = noteCard(item, titles.get(item.block_id) ?? item.lesson_title, options.mode);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'block-anthology__pop-close';
    close.setAttribute('aria-label', 'Close this note');
    close.textContent = '×';
    close.addEventListener('click', closePop);
    card.prepend(close);
    pop.replaceChildren(card);
    pop.hidden = false;
    pop.scrollTop = 0;
  };
  frame.append(stage, pop);

  const hint = document.createElement('p');
  hint.className = 'block-anthology__hint';
  hint.textContent = 'Click a dot to read its note. Drag to move around; scroll or pinch to zoom.';

  root.append(bar, frame, hint);

  if (canDraw()) {
    let generation = 0;
    mountWhileConnected(stage, () => {
      const mine = ++generation;
      closePop();
      void import('../../../knowledge/src/archive/forceGraph').then(({ mountForceGraph }) => {
        if (mine !== generation || !stage.isConnected) return;
        graph = mountForceGraph(
          stage,
          buildAnthologyGraph(options.data, grouping),
          {
            onNoteSelect: (note) => showPop(note ? byId.get(note.pageId) : undefined)
          },
          {
            variant: 'showAll',
            search: query,
            excerptFor: (id) => {
              const item = byId.get(id);
              return item ? `${item.note} ${item.themes.join(' ')} ${item.concepts.join(' ')}` : '';
            },
            tools: ANTHOLOGY_TOOLS,
            theme: 'light',
            labelZoom: { topics: 0, notes: 1.6 }
          }
        );
      });
      return () => {
        generation++;
        graph?.();
        graph = null;
      };
    });
  }

  return root;
}
