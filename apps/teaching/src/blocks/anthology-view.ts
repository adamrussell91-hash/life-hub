import type { AnthologyData, AnthologyItem } from '@/blocks/anthology-collect';
import {
  ANTHOLOGY_GROUPINGS,
  anthologyMapItems,
  anthologyNoteId,
  buildAnthologyGraph,
  type AnthologyGrouping
} from '@/blocks/anthology-graph';
import {
  isKnowledgeNoteId,
  knowledgeNoteId,
  unitTagChoices,
  type KnowledgeApi,
  type KnowledgeDraft,
  type KnowledgeItem
} from '@/blocks/anthology-knowledge';
import {
  factConnections,
  flatQuote,
  noteConnections,
  searchAnthology,
  type LinkedFact,
  type LinkedNote,
  type SearchHit,
  type TechniqueNamer
} from '@/blocks/anthology-connections';
import { lessonCollectionHref } from '@/blocks/collection-resolve';
import { loadLiteraryElements } from '@/blocks/literary-elements';
import { identityName, token, tokenParts } from '@/blocks/peer-feedback-ui';
import '@/blocks/peer-feedback.css';
import { rememberInitials, voiceDevice } from '@/blocks/voice-client';
import { INITIALS_PATTERN, normaliseInitials } from '@/schemas/student-initials';
import type { AnthologyView, Block } from '@/schemas/block';
import type { DockTool } from '../../../knowledge/src/archive/showAllDock';
import type { GraphMount } from '../../../knowledge/src/archive/forceGraphBehavior';
import type { GraphBadge } from '../../../knowledge/src/archive/forceGraph';

/** A CSS colour (possibly `var(--x)`) as the canvas can paint it. */
function canvasColour(colour: string, host: Element): string {
  const name = /^var\((--[\w-]+)\)$/.exec(colour)?.[1];
  if (!name) return colour;
  return getComputedStyle(host).getPropertyValue(name).trim() || '#424860';
}

/**
 * How a class addition sits on the map: the teacher sees the writer's initials, students see
 * the writer's anonymous token. Without either it falls back to a plain ring.
 */
export function knowledgeBadge(item: KnowledgeItem, teacher: boolean, host: Element): GraphBadge | null {
  if (teacher && item.initials) return { text: item.initials };
  if (!item.symbol) return null;
  const parts = tokenParts(item.symbol);
  return { path: parts.path, fill: canvasColour(parts.fill, host) };
}

export type AnthologyViewMode = 'teacher' | 'student' | 'print';

export type BuildAnthologyViewOptions = {
  data: AnthologyData;
  mode: AnthologyViewMode;
  title?: string;
  onMakeCards?: (request: { items: AnthologyItem[]; view: AnthologyView }) => void;
  /** The class's additions. Left out, the map has no Class tab. */
  knowledge?: KnowledgeApi;
};

/** The Show All tools that suit a unit's notes. Grow, Recall, Sharpen and Recent read a note's history. */
const ANTHOLOGY_TOOLS: readonly DockTool[] = ['spark', 'path', 'walk', 'bridges'];

/** What each tool does on a unit's map, in students' words (the "i" in the map's tool row). */
const ANTHOLOGY_TOOL_HINTS: Partial<Record<DockTool, string>> = {
  spark: 'Type an idea or a question. The notes that match it light up, so you can see which poems and themes speak to it.',
  path: 'Pick two notes, from two poems. A signal runs between them through the notes that link them: a chain of evidence you can follow.',
  walk: 'Start from one note and follow a slow signal to the notes linked to it, one step at a time.',
  bridges: 'Shows the notes that join themes together, and the themes that nothing joins yet.'
};

function noteHref(item: AnthologyItem): string {
  return `${lessonCollectionHref(item.lesson_id)}#note=${encodeURIComponent(item.annotation_id)}`;
}

/** The how-to is the teacher's; students only learn there's nothing here yet. */
function emptyMessage(mode: AnthologyViewMode): string {
  if (mode !== 'teacher') return 'Nothing collected here yet.';
  return 'Tick Add to unit anthology on a note in any lesson of this unit, and give it a theme. Students see notes from published lessons only.';
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

type Moderation = 'show' | 'hide' | 'delete';

/** A class addition: its title, the line from the article, what it tells us, and its tags. */
function knowledgeCard(item: KnowledgeItem, onModerate?: (action: Moderation) => void): HTMLElement {
  const card = document.createElement('article');
  card.className = 'block-anthology__card block-anthology__card--class';
  const title = document.createElement('p');
  title.className = 'block-anthology__card-title';
  title.textContent = item.title;
  const quote = document.createElement('p');
  quote.className = 'block-anthology__card-quote';
  quote.textContent = `“${item.quote}”`;
  if (item.symbol) {
    const head = document.createElement('div');
    head.className = 'block-anthology__card-head';
    const mark = token(item.symbol, 'sm');
    mark.title = identityName(item.symbol);
    head.append(mark, title);
    card.append(head, quote);
  } else {
    card.append(title, quote);
  }
  if (item.info) {
    const info = document.createElement('p');
    info.className = 'block-anthology__card-note';
    info.textContent = item.info;
    card.append(info);
  }
  const chips = document.createElement('div');
  chips.className = 'block-anthology__chips';
  for (const theme of item.themes) chips.append(chip(theme, 'theme'));
  for (const concept of item.concepts) chips.append(chip(concept, 'concept'));
  card.append(chips);
  if (onModerate) {
    const foot = document.createElement('div');
    foot.className = 'block-anthology__card-foot';
    const who = document.createElement('span');
    who.className = 'block-anthology__card-meta';
    const when = new Date(item.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    const state = item.status === 'waiting' ? 'Waiting' : item.status === 'hidden' ? 'Hidden' : '';
    who.textContent = [item.initials, when, state].filter(Boolean).join(' · ');
    foot.append(who);
    const button = (label: string, action: Moderation) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--ghost btn--small';
      btn.textContent = label;
      btn.addEventListener('click', () => onModerate(action));
      foot.append(btn);
    };
    if (item.status === 'shown') button('Hide', 'hide');
    else button('Show', 'show');
    button('Delete', 'delete');
    card.append(foot);
  }
  return card;
}

function formField(label: string, control: HTMLInputElement | HTMLTextAreaElement): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'block-anthology__field';
  const text = document.createElement('span');
  text.textContent = label;
  wrap.append(text, control);
  return wrap;
}

/** Add to the class map: a title, the line from the article, what it tells us, and the unit's own tags. */
function knowledgeForm(
  tags: { themes: string[]; concepts: string[] },
  onSend: (draft: KnowledgeDraft) => Promise<string>,
  onClose: () => void
): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'block-anthology__card block-anthology__add-form';
  form.noValidate = true;
  const heading = document.createElement('p');
  heading.className = 'block-anthology__card-title';
  heading.textContent = 'Add to the class map';

  const title = document.createElement('input');
  title.name = 'title';
  title.maxLength = 80;
  title.placeholder = 'A short name for it';
  const quote = document.createElement('textarea');
  quote.name = 'quote';
  quote.maxLength = 600;
  quote.rows = 3;
  quote.placeholder = 'The line from the article';
  const info = document.createElement('textarea');
  info.name = 'info';
  info.maxLength = 1200;
  info.rows = 3;
  info.placeholder = 'What it tells us';
  const initials = document.createElement('input');
  initials.name = 'initials';
  initials.maxLength = 6;
  initials.placeholder = 'TT or TT2';
  initials.autocomplete = 'off';
  initials.value = voiceDevice().initials ?? '';

  const picked = new Set<string>();
  const kindOf = new Map<string, 'theme' | 'concept'>();
  const tagRow = document.createElement('div');
  tagRow.className = 'block-anthology__chips';
  const groups: Array<['theme' | 'concept', string[]]> = [
    ['theme', tags.themes],
    ['concept', tags.concepts]
  ];
  for (const [kind, list] of groups) {
    for (const tag of list) {
      kindOf.set(tag, kind);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `block-anthology__tag block-anthology__chip block-anthology__chip--${kind}`;
      btn.textContent = tag;
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', () => {
        if (picked.has(tag)) picked.delete(tag);
        else picked.add(tag);
        btn.setAttribute('aria-pressed', String(picked.has(tag)));
      });
      tagRow.append(btn);
    }
  }
  const tagLabel = document.createElement('span');
  tagLabel.className = 'block-anthology__field-label';
  tagLabel.textContent = 'Themes and concepts';

  const error = document.createElement('p');
  error.className = 'block-anthology__add-error';
  error.setAttribute('role', 'alert');
  const actions = document.createElement('div');
  actions.className = 'block-anthology__card-foot';
  const send = document.createElement('button');
  send.type = 'submit';
  send.className = 'btn btn--primary btn--small';
  send.textContent = 'Add it';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn--ghost btn--small';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', onClose);
  actions.append(send, cancel);

  form.append(
    heading,
    formField('Title', title),
    formField('Quote or line', quote),
    formField('What it tells us', info),
    tagLabel,
    tagRow,
    formField('Your initials', initials),
    error,
    actions
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const draft: KnowledgeDraft = {
      title: title.value.trim(),
      quote: quote.value.trim(),
      info: info.value.trim(),
      themes: [...picked].filter((tag) => kindOf.get(tag) === 'theme'),
      concepts: [...picked].filter((tag) => kindOf.get(tag) === 'concept'),
      initials: normaliseInitials(initials.value)
    };
    const problem = !draft.title
      ? 'Give it a short title.'
      : !draft.quote
        ? 'Add the quote or line from the article.'
        : !draft.themes.length && !draft.concepts.length
          ? 'Pick at least one theme or concept.'
          : !INITIALS_PATTERN.test(draft.initials)
            ? 'Type your initials, as on the class list.'
            : '';
    error.textContent = problem;
    if (problem) return;
    send.disabled = true;
    rememberInitials(draft.initials);
    void onSend(draft)
      .then((message) => {
        error.textContent = message;
      })
      .catch((e: unknown) => {
        error.textContent = e instanceof Error && e.message ? e.message : 'That did not send. Try again.';
      })
      .finally(() => {
        send.disabled = false;
      });
  });
  return form;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** How many links a panel list shows before "Show all". */
const PANEL_LIST_START = 5;

/** A heading, a one-line why, and a list that folds after five. */
function panelSection(heading: string, why: string, rows: HTMLElement[], empty: string): HTMLElement {
  const section = el('section', 'block-anthology__panel-section');
  section.append(el('h4', 'block-anthology__panel-heading', `${heading} (${rows.length})`));
  if (why) section.append(el('p', 'block-anthology__panel-why', why));
  if (!rows.length) {
    section.append(el('p', 'block-anthology__panel-empty', empty));
    return section;
  }
  const list = el('div', 'block-anthology__links');
  list.append(...rows.slice(0, PANEL_LIST_START));
  section.append(list);
  if (rows.length > PANEL_LIST_START) {
    const more = el('button', 'btn btn--ghost btn--small block-anthology__more', `Show all ${rows.length}`);
    more.type = 'button';
    more.addEventListener('click', () => {
      list.replaceChildren(...rows);
      more.remove();
    });
    section.append(more);
  }
  return section;
}

function sharedChips(shared: string[]): HTMLElement {
  const chips = el('span', 'block-anthology__chips block-anthology__link-tags');
  for (const tag of shared) chips.append(chip(tag, 'theme'));
  return chips;
}

function noteLink(row: LinkedNote, onOpen: () => void, showShared = true): HTMLButtonElement {
  const btn = el('button', 'block-anthology__link');
  btn.type = 'button';
  btn.append(
    el('span', 'block-anthology__link-where', [row.poem, row.technique].filter(Boolean).join(' · ')),
    el('span', 'block-anthology__link-text', `“${flatQuote(row.item.quote)}”`)
  );
  if (showShared && row.shared.length) btn.append(sharedChips(row.shared));
  btn.addEventListener('click', onOpen);
  return btn;
}

function factLink(row: LinkedFact, onOpen: () => void): HTMLButtonElement {
  const btn = el('button', 'block-anthology__link block-anthology__link--fact');
  btn.type = 'button';
  btn.append(el('span', 'block-anthology__link-title', row.item.title));
  const words = row.item.info || flatQuote(row.item.quote);
  if (words) btn.append(el('span', 'block-anthology__link-text', words));
  if (row.shared.length) btn.append(sharedChips(row.shared));
  btn.addEventListener('click', onOpen);
  return btn;
}

/** The note set out as one row of the anatomy table: Poem, Technique, Quotation, Effect. */
function anatomyRow(row: ReturnType<typeof noteConnections>['row']): HTMLElement {
  const grid = el('dl', 'block-anthology__row');
  const cell = (label: string, value: string, fallback: string, extra = '') => {
    grid.append(el('dt', '', label));
    const dd = el('dd', value ? extra : 'block-anthology__row-blank', value || fallback);
    grid.append(dd);
  };
  cell('Poem', row.poem, '');
  cell('Technique', row.technique, 'Name the technique yourself');
  cell('Quotation', row.quote ? `“${row.quote}”${row.line > 0 ? ` (line ${row.line})` : ''}` : '', '', 'block-anthology__row-quote');
  cell('Effect', row.effect, 'Write the effect on the reader yourself');
  grid.append(el('dt', '', 'So… why?'));
  grid.append(el('dd', 'block-anthology__row-blank', 'Pick a class fact below for the purpose and context'));
  return grid;
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
    empty.textContent = emptyMessage(options.mode);
    root.append(empty);
    return root;
  }

  if (options.mode === 'print') {
    root.append(printList(items, titles));
    return root;
  }

  const byId = new Map(items.map((item) => [anthologyNoteId(item), item]));
  const knowledgeApi = options.knowledge;
  let grouping: AnthologyGrouping = 'theme';
  let layer: 'teacher' | 'class' = knowledgeApi && !knowledgeApi.teacher ? 'class' : 'teacher';
  let knowledge: KnowledgeItem[] = [];
  const knowledgeById = new Map<string, KnowledgeItem>();
  const justAdded = new Map<string, KnowledgeItem>();
  let query = '';
  let graph: GraphMount | null = null;

  /** Only shown additions go on the map; the teacher reviews the rest underneath. */
  const onMap = () => (layer === 'class' ? knowledge.filter((item) => !item.status || item.status === 'shown') : []);
  const redraw = () => graph?.setModel(buildAnthologyGraph(options.data, grouping, onMap(), nameOf));

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
        redraw();
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
    focus = null;
    paintPanel();
  });

  const count = document.createElement('span');
  count.className = 'block-anthology__count';
  const textCount = new Set(items.map((item) => item.block_id)).size;
  const paintCount = () => {
    const extra = onMap().length;
    count.textContent = `${items.length} notes · ${textCount} ${textCount === 1 ? 'text' : 'texts'}${
      extra ? ` · ${extra} from the class` : ''
    }`;
  };
  paintCount();

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
    pop.classList.remove('block-anthology__pop--form');
    pop.replaceChildren();
  };
  frame.append(stage, pop);

  // Beside the map: the chosen note as a table row and what it links to, or the search's matches.
  const panel = el('aside', 'block-anthology__panel');
  panel.setAttribute('aria-label', 'What this note links to');
  panel.setAttribute('aria-live', 'polite');
  const body = el('div', 'block-anthology__body');
  body.append(frame, panel);

  type Focus = { kind: 'note' | 'fact'; id: string } | null;
  let focus: Focus = null;
  const techniqueNames = new Map<string, string>();
  const nameOf: TechniqueNamer = (id) => techniqueNames.get(id);
  const shownKnowledge = () => knowledge.filter((item) => !item.status || item.status === 'shown');

  let hitCache: { query: string; ids: Set<string> } | null = null;
  const searchHitIds = () => {
    if (hitCache?.query !== query) {
      const ids = searchAnthology(query, options.data, shownKnowledge(), nameOf).map((hit) =>
        hit.kind === 'note' ? anthologyNoteId(hit.item) : knowledgeNoteId(hit.item.id)
      );
      hitCache = { query, ids: new Set(ids) };
    }
    return hitCache.ids;
  };

  /** Go to a note or fact: on the map when its dot is there, else straight to the panel. */
  const openId = (id: string) => {
    if (graph?.selectNote?.(id)) return;
    focus = { kind: isKnowledgeNoteId(id) ? 'fact' : 'note', id };
    paintPanel();
  };
  const openNote = (item: AnthologyItem) => openId(anthologyNoteId(item));
  const openFact = (item: KnowledgeItem) => openId(knowledgeNoteId(item.id));

  const panelHead = (label: string) => {
    const head = el('div', 'block-anthology__panel-head');
    head.append(el('p', 'block-anthology__panel-label', label));
    if (query) {
      const back = el('button', 'btn btn--ghost btn--small', 'Back to matches');
      back.type = 'button';
      back.addEventListener('click', () => {
        focus = null;
        paintPanel();
      });
      head.append(back);
    }
    const close = el('button', 'block-anthology__pop-close block-anthology__panel-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => {
      focus = null;
      paintPanel();
    });
    head.append(close);
    return head;
  };

  const addFactButton = () => {
    if (!knowledgeApi) return null;
    const btn = el('button', 'btn btn--secondary btn--small', 'Add a fact to the class map');
    btn.type = 'button';
    btn.addEventListener('click', () => {
      if (layer !== 'class') {
        layer = 'class';
        paintLayers();
        paintCount();
        redraw();
      }
      add.click();
    });
    return btn;
  };

  const notePanel = (item: AnthologyItem): HTMLElement[] => {
    const links = noteConnections(item, options.data, shownKnowledge(), nameOf);
    const out: HTMLElement[] = [panelHead('Your table row'), anatomyRow(links.row)];
    const facts = panelSection(
      'So… why? Class facts that fit',
      'Facts the class added on the same theme or concept. Use one to explain the purpose and context.',
      links.facts.map((row) => factLink(row, () => openFact(row.item))),
      'No class facts share this note’s themes yet. Add one from your pre-reading.'
    );
    const addBtn = links.facts.length ? null : addFactButton();
    if (addBtn) facts.append(addBtn);
    out.push(facts);
    if (links.row.technique) {
      out.push(
        panelSection(
          `${links.row.technique} in other poems`,
          'Is the pattern kept the same, or does it change? Why?',
          links.sameTechnique.map((row) => noteLink(row, () => openNote(row.item))),
          'No other poem has a note on this technique yet.'
        )
      );
    }
    out.push(
      panelSection(
        'Same idea in other poems',
        'Notes from other poems on a shared theme or concept.',
        links.sameIdea.map((row) => noteLink(row, () => openNote(row.item))),
        'No other poem shares these themes yet.'
      )
    );
    const foot = el('div', 'block-anthology__card-foot');
    const open = el('a', 'block-anthology__card-open', 'Open in the lesson');
    open.href = noteHref(item);
    foot.append(open);
    if (options.mode === 'teacher' && item.published === false) {
      foot.append(el('span', 'block-anthology__unpublished', 'Not published'));
    }
    out.push(foot);
    return out;
  };

  const factPanel = (item: KnowledgeItem): HTMLElement[] => {
    const links = factConnections(item, options.data, shownKnowledge(), nameOf);
    return [
      panelHead('Class fact'),
      knowledgeCard(item, moderateFor(item)),
      panelSection(
        'Poem notes this fact helps explain',
        'Use it in the So… why? column for any of these.',
        links.notes.map((row) => noteLink(row, () => openNote(row.item))),
        'No poem note shares this fact’s themes yet.'
      ),
      panelSection(
        'Other class facts on this',
        '',
        links.facts.map((row) => factLink(row, () => openFact(row.item))),
        'No other class fact shares these themes yet.'
      )
    ];
  };

  const searchPanel = (hits: SearchHit[]): HTMLElement[] => {
    const head = el('div', 'block-anthology__panel-head');
    head.append(el('p', 'block-anthology__panel-label', `Matches for “${query}” (${hits.length})`));
    const rows = hits.map((hit) =>
      hit.kind === 'note'
        ? noteLink({ item: hit.item, poem: hit.poem, technique: hit.technique, shared: [] }, () => openNote(hit.item), false)
        : factLink({ item: hit.item, shared: [] }, () => openFact(hit.item))
    );
    if (!rows.length) return [head, el('p', 'block-anthology__panel-empty', 'Nothing matches. Try one word, a poem or a technique.')];
    const list = el('div', 'block-anthology__links');
    list.append(...rows);
    return [head, list];
  };

  function paintPanel(): void {
    const note = focus?.kind === 'note' ? byId.get(focus.id) : undefined;
    const fact = focus?.kind === 'fact' ? knowledgeById.get(focus.id) : undefined;
    if (note) panel.replaceChildren(...notePanel(note));
    else if (fact) panel.replaceChildren(...factPanel(fact));
    else if (query) panel.replaceChildren(...searchPanel(searchAnthology(query, options.data, shownKnowledge(), nameOf)));
    else {
      panel.replaceChildren(
        el('p', 'block-anthology__panel-label', 'What links to what'),
        el(
          'p',
          'block-anthology__panel-empty',
          'Click a dot, or search, to see a note as a table row: its poem, technique, quote and effect, the class facts that explain why, and the same technique or idea in other poems.'
        )
      );
    }
    panel.scrollTop = 0;
    // On a phone the panel sits under the map: bring a chosen note's links into view.
    if (focus && panel.getBoundingClientRect().top > frame.getBoundingClientRect().bottom - 1) {
      panel.scrollIntoView?.({ block: 'start' });
    }
  }

  const review = document.createElement('details');
  review.className = 'block-anthology__review';
  review.hidden = true;

  const moderateFor = (item: KnowledgeItem) =>
    knowledgeApi?.moderate
      ? (action: Moderation) => {
          void knowledgeApi.moderate!(item.id, action)
            .then(() => {
              closePop();
              focus = null;
              return loadKnowledge();
            })
            .catch(() => window.alert('That did not save. Try again.'));
        }
      : undefined;

  const paintReview = () => {
    const off = knowledge.filter((item) => item.status === 'waiting' || item.status === 'hidden');
    review.hidden = !knowledgeApi?.teacher || off.length === 0;
    const summary = document.createElement('summary');
    summary.textContent = `Waiting or hidden (${off.length})`;
    const list = document.createElement('div');
    list.className = 'block-anthology__review-list';
    for (const item of off) list.append(knowledgeCard(item, moderateFor(item)));
    review.replaceChildren(summary, list);
  };

  async function loadKnowledge(): Promise<void> {
    if (!knowledgeApi) return;
    try {
      knowledge = await knowledgeApi.list();
    } catch {
      knowledge = [];
    }
    // The server's list can lag a fresh add by a few seconds; keep what we just sent until it shows.
    for (const [id, item] of justAdded) {
      if (knowledge.some((row) => row.id === id)) justAdded.delete(id);
      else knowledge = [...knowledge, item];
    }
    hitCache = null;
    knowledgeById.clear();
    for (const item of knowledge) knowledgeById.set(knowledgeNoteId(item.id), item);
    paintCount();
    paintReview();
    paintPanel();
    redraw();
  }

  const layers = document.createElement('div');
  layers.className = 'hub-pills block-anthology__layers';
  layers.setAttribute('role', 'toolbar');
  layers.setAttribute('aria-label', 'Whose notes');
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn btn--secondary block-anthology__add';
  add.textContent = 'Add to the class map';
  const paintLayers = () => {
    layers.replaceChildren();
    const choices: Array<['teacher' | 'class', string]> = [
      ['teacher', 'Teacher'],
      ['class', 'Class']
    ];
    for (const [id, label] of choices) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hub-pills__btn';
      btn.textContent = label;
      btn.setAttribute('aria-pressed', String(layer === id));
      btn.addEventListener('click', () => {
        if (layer === id) return;
        layer = id;
        paintLayers();
        paintCount();
        closePop();
        redraw();
      });
      layers.append(btn);
    }
    add.hidden = layer !== 'class';
  };

  add.addEventListener('click', () => {
    if (!knowledgeApi) return;
    pop.replaceChildren(
      knowledgeForm(
        unitTagChoices(options.data),
        async (draft) => {
          const { item, status } = await knowledgeApi.add(draft);
          if (status === 'shown' || knowledgeApi.teacher) {
            justAdded.set(item.id, knowledgeApi.teacher ? { ...item, initials: draft.initials, status } : item);
          }
          await loadKnowledge();
          if (status === 'waiting') return 'Thanks. It will appear once your teacher has checked it.';
          closePop();
          return '';
        },
        closePop
      )
    );
    pop.classList.add('block-anthology__pop--form');
    pop.hidden = false;
    pop.scrollTop = 0;
  });

  if (knowledgeApi) {
    paintLayers();
    bar.append(layers, pills, search, count, add);
  } else {
    bar.append(pills, search, count);
  }

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

  const hint = document.createElement('p');
  hint.className = 'block-anthology__hint';
  hint.textContent = 'Click a dot to see what it links to. Drag to move around; scroll or pinch to zoom.';

  root.append(bar, body, hint, review);
  paintPanel();
  void loadLiteraryElements()
    .then((table) => {
      for (const technique of table.techniques) techniqueNames.set(technique.id, technique.name);
      hitCache = null;
      paintPanel();
      redraw();
    })
    .catch(() => {});

  if (canDraw()) {
    let generation = 0;
    mountWhileConnected(stage, () => {
      const mine = ++generation;
      closePop();
      void import('../../../knowledge/src/archive/forceGraph').then(({ mountForceGraph }) => {
        if (mine !== generation || !stage.isConnected) return;
        graph = mountForceGraph(
          stage,
          buildAnthologyGraph(options.data, grouping, onMap(), nameOf),
          {
            onNoteSelect: (note) => {
              closePop();
              focus = note ? { kind: isKnowledgeNoteId(note.pageId) ? 'fact' : 'note', id: note.pageId } : null;
              paintPanel();
            }
          },
          {
            variant: 'showAll',
            search: query,
            excerptFor: (id) => {
              const known = knowledgeById.get(id);
              if (known) return `${known.quote} ${known.info} ${known.themes.join(' ')} ${known.concepts.join(' ')}`;
              const item = byId.get(id);
              if (!item) return '';
              const technique = item.technique_id ? (nameOf(item.technique_id) ?? '') : '';
              const poem = titles.get(item.block_id) ?? item.lesson_title;
              return `${item.note} ${technique} ${poem} ${item.themes.join(' ')} ${item.concepts.join(' ')}`;
            },
            tools: ANTHOLOGY_TOOLS,
            toolHints: ANTHOLOGY_TOOL_HINTS,
            theme: 'light',
            labelZoom: { topics: 0, notes: 1.6 },
            ringFor: isKnowledgeNoteId,
            // Light up every note the panel's matches list, so the map and the list agree.
            searchMatches: (id) => searchHitIds().has(id),
            badgeFor: (id) => {
              const item = knowledgeById.get(id);
              return item ? knowledgeBadge(item, Boolean(knowledgeApi?.teacher), stage) : null;
            }
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

  if (knowledgeApi) void loadKnowledge();

  return root;
}
