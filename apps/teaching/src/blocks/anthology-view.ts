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
import { lessonCollectionHref } from '@/blocks/collection-resolve';
import { rememberInitials, voiceDevice } from '@/blocks/voice-client';
import { INITIALS_PATTERN, normaliseInitials } from '@/schemas/student-initials';
import type { AnthologyView, Block } from '@/schemas/block';
import type { DockTool } from '../../../knowledge/src/archive/showAllDock';
import type { GraphMount } from '../../../knowledge/src/archive/forceGraphBehavior';

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
  card.append(title, quote);
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
  const knowledgeApi = options.knowledge;
  let grouping: AnthologyGrouping = 'theme';
  let layer: 'teacher' | 'class' = knowledgeApi && !knowledgeApi.teacher ? 'class' : 'teacher';
  let knowledge: KnowledgeItem[] = [];
  const knowledgeById = new Map<string, KnowledgeItem>();
  let query = '';
  let graph: GraphMount | null = null;

  /** Only shown additions go on the map; the teacher reviews the rest underneath. */
  const onMap = () => (layer === 'class' ? knowledge.filter((item) => !item.status || item.status === 'shown') : []);
  const redraw = () => graph?.setModel(buildAnthologyGraph(options.data, grouping, onMap()));

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
  const showCard = (card: HTMLElement) => {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'block-anthology__pop-close';
    close.setAttribute('aria-label', 'Close this note');
    close.textContent = '×';
    close.addEventListener('click', closePop);
    card.prepend(close);
    pop.classList.remove('block-anthology__pop--form');
    pop.replaceChildren(card);
    pop.hidden = false;
    pop.scrollTop = 0;
  };
  frame.append(stage, pop);

  const review = document.createElement('details');
  review.className = 'block-anthology__review';
  review.hidden = true;

  const moderateFor = (item: KnowledgeItem) =>
    knowledgeApi?.moderate
      ? (action: Moderation) => {
          void knowledgeApi.moderate!(item.id, action)
            .then(() => {
              closePop();
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
    knowledgeById.clear();
    for (const item of knowledge) knowledgeById.set(knowledgeNoteId(item.id), item);
    paintCount();
    paintReview();
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
          const { status } = await knowledgeApi.add(draft);
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
  hint.textContent = 'Click a dot to read its note. Drag to move around; scroll or pinch to zoom.';

  root.append(bar, frame, hint, review);

  if (canDraw()) {
    let generation = 0;
    mountWhileConnected(stage, () => {
      const mine = ++generation;
      closePop();
      void import('../../../knowledge/src/archive/forceGraph').then(({ mountForceGraph }) => {
        if (mine !== generation || !stage.isConnected) return;
        graph = mountForceGraph(
          stage,
          buildAnthologyGraph(options.data, grouping, onMap()),
          {
            onNoteSelect: (note) => {
              if (!note) return closePop();
              if (isKnowledgeNoteId(note.pageId)) {
                const item = knowledgeById.get(note.pageId);
                return item ? showCard(knowledgeCard(item, moderateFor(item))) : closePop();
              }
              const item = byId.get(note.pageId);
              return item
                ? showCard(noteCard(item, titles.get(item.block_id) ?? item.lesson_title, options.mode))
                : closePop();
            }
          },
          {
            variant: 'showAll',
            search: query,
            excerptFor: (id) => {
              const known = knowledgeById.get(id);
              if (known) return `${known.quote} ${known.info} ${known.themes.join(' ')} ${known.concepts.join(' ')}`;
              const item = byId.get(id);
              return item ? `${item.note} ${item.themes.join(' ')} ${item.concepts.join(' ')}` : '';
            },
            tools: ANTHOLOGY_TOOLS,
            theme: 'light',
            labelZoom: { topics: 0, notes: 1.6 },
            ringFor: isKnowledgeNoteId
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
