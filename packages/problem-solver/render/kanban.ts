// packages/problem-solver/render/kanban.ts
// Kanban (toolkit, Implement), drawn as the book draws it: three tall rounded columns side by
// side. To do is red with a yellow right-pointing triangle under its heading, Doing blue with a
// yellow triangle, Done yellow with a blue triangle. Cards are rounded pills: yellow in To do and
// Doing, blue in Done. Inside Doing, below its cards, a Review stop: its word, a red downward
// triangle and red pills. The four places are the tool's fixed tags (todo, doing, review, done).
// The board appears with the run's first node; each card appears in its tag's place.
// A card that became a real task (setTasks) takes its place from the task's live status
// (columnForStatus; a review card stays in Review until the task is started or finished), carries
// a small link mark with the status, and moves, the same element, when the status changes (FLIP
// by measured centres). A card whose task was deleted goes back to its tag's place, struck
// through, with "Task removed"; an unknown status keeps the last known place. Unlinked cards
// stay where the coach put them. A card with a pending proposal (setProposed) says so.
// With `wip` placed, a badge on the Doing heading gives the limit, and says when Doing is over it.
// Only Doing's own cards count: Review cards wait at the review stop and are not in progress.
// Details open in one panel under the board, so an open card never stretches a column.
// Phone (the root up to 560px wide): the columns stack, each a heading over a wrapping row of pills.
// Options (another book's variant; the defaults draw Problem Solver's board): `columns` without
// 'review' drops the Review stop; `suggestedWip` puts a "Suggested limit" badge on Doing until a
// limit is set; `cardFields` shows each card's effort, help and urgency and adds a small form
// under the board that sets them (sent through onScore).
import type { PsNode, PsTaskLink, PsToolRun } from '../types';
import { nodeTitle } from '../titles.mjs';
import { parseSlot } from '../slots.mjs';
import { CARD_FIELDS, cardFieldsOf, columnForStatus, wipLimit } from '../tools/kanban.mjs';
import { taskStatusLabel } from './task-status';
import { EASE, canAnimate, cancelAnimations, createDisclosureGroup, detailsCard, nextId, syncContested } from './details';

export type KanbanView = {
  el: HTMLDivElement;
  update(run: PsToolRun): void;
  setTasks(links: PsTaskLink[]): void;
  /** Node ids with a task proposal waiting for the person's answer. */
  setProposed(nodeIds: string[]): void;
  /** Card fields set with the board's form (only with `cardFields`). */
  onScore(cb: (payload: Record<string, unknown>) => void): void;
  destroy(): void;
};

export type KanbanOptions = { columns?: readonly Column[]; suggestedWip?: number; cardFields?: boolean };
type Fields = { effort?: string; help?: string; urgency?: string };
const FIELD_WORDS: Record<string, string> = { small: 'Small', medium: 'Medium', large: 'Large', alone: 'Alone', needs_help: 'Needs help', now: 'Now', soon: 'Soon', later: 'Later' };
const FIELD_NAMES: Record<string, string> = { effort: 'Effort', help: 'Help', urgency: 'Urgency' };
/** A card's fields in words, in field order: "Large · Needs help · Soon". */
const fieldWords = (fields: Fields | undefined): string[] => (fields ? (Object.keys(CARD_FIELDS) as (keyof Fields)[]).map((name) => FIELD_WORDS[fields[name] ?? ''] ?? '').filter(Boolean) : []);

type Column = 'todo' | 'doing' | 'review' | 'done';
type Main = 'todo' | 'doing' | 'done';
const MAINS: readonly Main[] = ['todo', 'doing', 'done'];
const COLUMNS: readonly Column[] = ['todo', 'doing', 'review', 'done'];
const NAME: Record<Column, string> = { todo: 'To do', doing: 'Doing', review: 'Review', done: 'Done' };
const COLUMN_FILL: Record<Main, 'red' | 'blue' | 'yellow'> = { todo: 'red', doing: 'blue', done: 'yellow' };
const PILL_FILL: Record<Column, 'yellow' | 'blue' | 'red'> = { todo: 'yellow', doing: 'yellow', review: 'red', done: 'blue' };

type Card = {
  node: PsNode;
  item: HTMLDivElement;
  button: HTMLButtonElement;
  head: HTMLSpanElement;
  title: HTMLSpanElement;
  meta: HTMLSpanElement;
  metaText: HTMLSpanElement;
  fields: HTMLSpanElement;
  link: SVGSVGElement | null;
  card: HTMLDivElement;
  cardKey: string;
  /** The place the last known live status gave it; null while unlinked or not yet known. */
  live: Column | null;
};
type Wip = { node: PsNode; button: HTMLButtonElement; badge: HTMLSpanElement; text: HTMLSpanElement; card: HTMLDivElement; cardKey: string };

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const out = doc.createElement(tag);
  out.className = className;
  if (text) out.textContent = text;
  return out;
}

function setText(target: Element, value: string): void {
  if (target.textContent !== value) target.textContent = value;
}

function setAttr(target: Element, name: string, value: string | null): void {
  if (value === null) {
    if (target.hasAttribute(name)) target.removeAttribute(name);
  } else if (target.getAttribute(name) !== value) target.setAttribute(name, value);
}

const nameOf = (node: PsNode): string | undefined => parseSlot(node.slot)?.name;
const indexOf = (node: PsNode): number => parseSlot(node.slot)?.index ?? 0;
const bySlot = (a: PsNode, b: PsNode): number => indexOf(a) - indexOf(b);
const contested = (node: PsNode): string => (node.state === 'contested' ? ', contested' : '');
const keyOf = (node: PsNode): string => `${node.id}\u0000${node.text}\u0000${node.state}\u0000${(node.skills ?? []).join(',')}`;

/** A small chain link, the mark of a card that is a real task (decorative: the label says it). */
function linkMark(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ps-kanban__link');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M6.5 9.5l3-3M7 4.5l1.2-1.2a2.8 2.8 0 0 1 4 4L11 8.5M9 11.5l-1.2 1.2a2.8 2.8 0 0 1-4-4L5 7.5');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.8');
  path.setAttribute('stroke-linecap', 'round');
  svg.append(path);
  return svg;
}

export function createKanbanView(doc: Document = document, options: KanbanOptions = {}): KanbanView {
  const columns: readonly Column[] = options.columns ?? COLUMNS;
  const withReview = columns.includes('review');
  const tagOf = (node: PsNode): Column => (columns.includes(node.tag as Column) ? (node.tag as Column) : 'todo');
  const root = doc.createElement('div');
  root.className = 'ps-kanban';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Kanban');
  const group = createDisclosureGroup();

  const board = el(doc, 'div', 'ps-kanban__board');
  const panel = el(doc, 'div', 'ps-kanban__panel');
  const lanes = new Map<Column, HTMLDivElement>();
  let doingHead: HTMLDivElement | null = null;
  const cards = new Map<string, Card>();
  let wip: Wip | null = null;
  let suggested: HTMLSpanElement | null = null;
  let fieldsOf: Record<string, Fields> = {};
  let fieldsForm: HTMLFormElement | null = null;
  let cardSelect: HTMLSelectElement | null = null;
  const fieldSelects = new Map<string, HTMLSelectElement>();
  let scoreCb: ((payload: Record<string, unknown>) => void) | null = null;
  let links = new Map<string, string>();
  let proposed = new Set<string>();
  let lastRun: PsToolRun | null = null;
  /** Nothing animates until the run on screen has been drawn once (a saved run arrives still). */
  let painted = false;
  let destroyed = false;

  // ---------------------------------------------------------------- board

  function triangle(kind: string): HTMLSpanElement {
    const mark = el(doc, 'span', `ps-kanban__arrow ps-kanban__arrow--${kind}`);
    mark.setAttribute('aria-hidden', 'true');
    return mark;
  }

  function lane(column: Column): HTMLDivElement {
    const out = el(doc, 'div', `ps-kanban__lane ps-kanban__lane--${column}`);
    out.setAttribute('data-column', column);
    lanes.set(column, out);
    return out;
  }

  function buildBoard(): void {
    for (const main of MAINS) {
      const col = el(doc, 'div', `ps-kanban__col ps-kanban__col--${main}`);
      col.setAttribute('role', 'group');
      col.setAttribute('aria-label', NAME[main]);
      col.setAttribute('data-region', main);
      col.setAttribute('data-shape', '');
      col.setAttribute('data-fill', COLUMN_FILL[main]);
      const head = el(doc, 'div', 'ps-kanban__head');
      head.append(triangle(main), el(doc, 'span', 'ps-kanban__name', NAME[main]));
      if (main === 'doing') doingHead = head;
      col.append(head, lane(main));
      if (main === 'doing' && withReview) {
        const review = el(doc, 'div', 'ps-kanban__review');
        review.setAttribute('role', 'group');
        review.setAttribute('aria-label', NAME.review);
        review.setAttribute('data-region', 'review');
        review.append(el(doc, 'span', 'ps-kanban__name ps-kanban__name--review', NAME.review), triangle('review'), lane('review'));
        col.append(review);
      }
      board.append(col);
    }
    root.append(board);
    if (options.cardFields) root.append(buildFieldsForm());
    root.append(panel);
  }

  /** The form under the board that sets one card's effort, help and urgency. */
  function buildFieldsForm(): HTMLFormElement {
    fieldsForm = el(doc, 'form', 'ps-kanban__fields-form');
    fieldsForm.setAttribute('aria-label', 'Card details');
    const pick = el(doc, 'label', 'ps-kanban__field');
    pick.append(el(doc, 'span', 'ps-kanban__field-label', 'Card'));
    cardSelect = el(doc, 'select', 'ps-kanban__select');
    cardSelect.addEventListener('change', prefillFields);
    pick.append(cardSelect);
    fieldsForm.append(pick);
    for (const [name, values] of Object.entries(CARD_FIELDS) as [string, readonly string[]][]) {
      const label = el(doc, 'label', 'ps-kanban__field');
      label.append(el(doc, 'span', 'ps-kanban__field-label', FIELD_NAMES[name]));
      const select = el(doc, 'select', 'ps-kanban__select');
      for (const value of values) {
        const option = el(doc, 'option', '', FIELD_WORDS[value]);
        option.value = value;
        select.append(option);
      }
      label.append(select);
      fieldsForm.append(label);
      fieldSelects.set(name, select);
    }
    const save = el(doc, 'button', 'ps-kanban__fields-save', 'Save card details');
    save.type = 'button';
    save.addEventListener('click', () => {
      if (!cardSelect?.value || destroyed) return;
      scoreCb?.({ card: cardSelect.value, ...Object.fromEntries([...fieldSelects].map(([name, select]) => [name, select.value])) });
    });
    fieldsForm.append(save);
    return fieldsForm;
  }

  function prefillFields(): void {
    const fields = cardSelect ? fieldsOf[cardSelect.value] : undefined;
    for (const [name, select] of fieldSelects) select.value = fields?.[name as keyof Fields] ?? (CARD_FIELDS as Record<string, readonly string[]>)[name][0];
  }

  /** The form's card list in step with the cards on the board. */
  function syncFieldsForm(nodes: PsNode[]): void {
    if (!cardSelect) return;
    const key = nodes.map((node) => `${node.id}=${nodeTitle(node)}`).join('|');
    if (cardSelect.getAttribute('data-key') !== key) {
      const keep = cardSelect.value;
      cardSelect.replaceChildren(...nodes.map((node) => {
        const option = el(doc, 'option', '', nodeTitle(node));
        option.value = node.id;
        return option;
      }));
      if (nodes.some((node) => node.id === keep)) cardSelect.value = keep;
      cardSelect.setAttribute('data-key', key);
    }
    if (!fieldsForm?.contains(doc.activeElement)) prefillFields();
  }

  // ---------------------------------------------------------------- cards

  function makeCard(node: PsNode): Card {
    const detailsId = nextId('ps-kanban-details');
    const item = el(doc, 'div', 'ps-kanban__card');
    item.setAttribute('data-shape', '');
    const button = el(doc, 'button', 'ps-kanban__pill');
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    const head = el(doc, 'span', 'ps-kanban__card-head');
    const title = el(doc, 'span', 'ps-kanban__title');
    head.append(title);
    const meta = el(doc, 'span', 'ps-kanban__meta');
    const metaText = el(doc, 'span', 'ps-kanban__meta-text');
    meta.append(metaText);
    meta.hidden = true;
    const fields = el(doc, 'span', 'ps-kanban__fields');
    fields.hidden = true;
    button.append(head, fields, meta);
    item.append(button);
    const card = el(doc, 'div', 'ps-details');
    card.id = detailsId;
    group.register(card, button);
    return { node, item, button, head, title, meta, metaText, fields, link: null, card, cardKey: '', live: null };
  }

  function dropCard(id: string): void {
    const card = cards.get(id);
    if (!card) return;
    if (card.card.classList.contains('is-open')) group.close();
    group.unregister(card.card);
    cancelAnimations(card.item);
    card.item.remove();
    card.card.remove();
    cards.delete(id);
  }

  /** Where a card belongs now, and whether it got there by its first known status (no motion). */
  function placeOf(card: Card): { column: Column; snap: boolean } {
    const tag = tagOf(card.node);
    const status = links.get(card.node.id);
    if (status === undefined || status === 'removed') {
      card.live = null;
      return { column: tag, snap: false };
    }
    if (status === 'unknown') return { column: card.live ?? tag, snap: false };
    let column: Column = columnForStatus(status) as Column;
    // The Tasks hub has no review status: a review card waits in Review until work starts or ends.
    if (tag === 'review' && column === 'todo') column = 'review';
    const snap = card.live === null;
    card.live = column;
    return { column, snap };
  }

  /** Keep a card's words, colour, marks and details in step with its node, column and task. */
  function syncCard(card: Card, node: PsNode, column: Column): void {
    card.node = node;
    setAttr(card.item, 'data-node', node.id);
    setAttr(card.card, 'data-for', node.id);
    setAttr(card.item, 'data-fill', PILL_FILL[column]);
    card.item.style.order = String(indexOf(node));
    setText(card.title, nodeTitle(node));

    const status = links.get(node.id);
    const removed = status === 'removed';
    const linked = status !== undefined && !removed;
    const label = linked ? taskStatusLabel(status) : '';
    setAttr(card.item, 'data-task-status', status ?? null);
    card.item.classList.toggle('is-task', linked);
    card.item.classList.toggle('is-removed', removed);
    const waiting = !linked && !removed && proposed.has(node.id);
    const metaText = removed ? 'Task removed' : linked ? (label ? `Task · ${label}` : 'Task') : waiting ? 'Proposed task' : '';
    setText(card.metaText, metaText);
    card.meta.hidden = !metaText;
    if (linked && !card.link) {
      card.link = linkMark(doc);
      card.meta.prepend(card.link);
    } else if (!linked && card.link) {
      card.link.remove();
      card.link = null;
    }

    const words = fieldWords(fieldsOf[node.id]);
    setText(card.fields, words.join(' · '));
    card.fields.hidden = !words.length;
    const taskWords = removed ? ', task removed' : linked ? (label ? `, task: ${label}` : ', task') : waiting ? ', proposed task' : '';
    setAttr(card.button, 'aria-label', `Card ${indexOf(node)}: ${nodeTitle(node)}${words.length ? `, ${words.join(', ')}` : ''}${taskWords}${contested(node)}. Show details`);
    const key = `${keyOf(node)}\u0001${column}`;
    if (card.cardKey !== key) {
      card.card.replaceChildren(...detailsCard(doc, node, PILL_FILL[column], card.card.id).childNodes);
      card.cardKey = key;
    }
    syncContested(card.item, node, card.head, card.button);
  }

  // ---------------------------------------------------------------- WIP

  /** Before a limit is set, the suggested one; it says so when Doing goes over it. */
  function syncSuggested(show: boolean, doing: number): void {
    const limit = options.suggestedWip;
    if (!show || !limit || !doingHead) {
      suggested?.remove();
      suggested = null;
      return;
    }
    if (!suggested) {
      suggested = el(doc, 'span', 'ps-kanban__badge ps-kanban__suggested');
      suggested.setAttribute('data-shape', '');
      doingHead.append(suggested);
    }
    const over = doing > limit;
    suggested.classList.toggle('is-over', over);
    setAttr(suggested, 'data-fill', over ? 'card' : 'yellow');
    // Never colour alone: the words change when Doing is over the suggestion.
    setText(suggested, over ? `Over suggested limit (${doing} of ${limit})` : `Suggested limit ${limit}`);
  }

  function syncWip(node: PsNode | undefined, doing: number): void {
    if (!node || !doingHead) {
      if (wip) {
        if (wip.card.classList.contains('is-open')) group.close();
        group.unregister(wip.card);
        wip.button.remove();
        wip.card.remove();
        wip = null;
      }
      return;
    }
    if (!wip || wip.node.id !== node.id) {
      syncWip(undefined, 0);
      const detailsId = nextId('ps-kanban-details');
      const button = el(doc, 'button', 'ps-kanban__wip');
      button.type = 'button';
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', detailsId);
      const badge = el(doc, 'span', 'ps-kanban__badge');
      badge.setAttribute('data-shape', '');
      const text = el(doc, 'span', 'ps-kanban__tag');
      badge.append(text);
      button.append(badge);
      doingHead.append(button);
      const card = el(doc, 'div', 'ps-details');
      card.id = detailsId;
      group.register(card, button);
      wip = { node, button, badge, text, card, cardKey: '' };
    }
    wip.node = node;
    setAttr(wip.button, 'data-node', node.id);
    setAttr(wip.card, 'data-for', node.id);
    const limit: number | null = wipLimit({ nodes: [node] });
    const over = limit !== null && doing > limit;
    wip.button.classList.toggle('is-over', over);
    setAttr(wip.badge, 'data-fill', over ? 'card' : 'yellow');
    // Never colour alone: the words change when Doing is over the limit (the count never splits).
    const words = limit === null ? nodeTitle(node) : over ? `Over limit (${doing}\u00a0of\u00a0${limit})` : `Limit ${limit}`;
    setText(wip.text, words);
    setAttr(wip.button, 'aria-label', `Work in progress: ${words}${limit !== null && !over ? `, ${doing} in Doing` : ''}, Review cards not counted${contested(node)}. Show details`);
    const key = keyOf(node);
    if (wip.cardKey !== key) {
      wip.card.replaceChildren(...detailsCard(doc, node, 'blue', wip.card.id).childNodes);
      wip.cardKey = key;
    }
    syncContested(wip.button, node, wip.badge, wip.button);
  }

  // ---------------------------------------------------------------- layout

  /** Draw the run: create, place and move cards. Motion only after the first paint. */
  function layout(run: PsToolRun): void {
    const nodes = run.nodes.filter((node) => nameOf(node) === 'card').sort(bySlot);
    const wipNode = run.nodes.find((node) => node.slot === 'wip');
    if (!nodes.length && !wipNode) {
      if (root.children.length) teardown();
      painted = true;
      return;
    }
    if (!board.parentElement) buildBoard();
    const wanted = new Set(nodes.map((node) => node.id));

    // Reads first: where each card stands now, before anything moves.
    const before = new Map<Card, DOMRect>();
    if (painted) for (const [id, card] of cards) if (wanted.has(id) && card.item.isConnected) before.set(card, card.item.getBoundingClientRect());
    // Moving an element drops its focus: remember what had it, to give it back after the writes.
    const active = doc.activeElement;
    const focused = active instanceof HTMLElement && active !== root && root.contains(active) ? active : null;

    for (const id of [...cards.keys()]) if (!wanted.has(id)) dropCard(id);

    const fresh: Card[] = [];
    /** Cards placed by their first known status: they arrive there still. */
    const still = new Set<Card>();
    let moved = false;
    for (const node of nodes) {
      let card = cards.get(node.id);
      if (!card) {
        card = makeCard(node);
        cards.set(node.id, card);
        fresh.push(card);
      }
      card.node = node;
      const { column, snap } = placeOf(card);
      syncCard(card, node, column);
      const target = lanes.get(column)!;
      if (card.item.parentElement !== target) {
        if (snap) still.add(card);
        else if (card.item.parentElement) moved = true;
        target.append(card.item);
      }
    }
    // Keep each lane in slot order (a card can also change slot on another device).
    for (const target of lanes.values()) {
      const items = [...target.children] as HTMLDivElement[];
      const sorted = [...items].sort((a, b) => Number(a.style.order) - Number(b.style.order));
      const at = sorted.findIndex((item, i) => items[i] !== item);
      if (at >= 0) target.append(...sorted.slice(at));
    }

    syncWip(wipNode, lanes.get('doing')!.children.length);
    syncSuggested(!wipNode, lanes.get('doing')!.children.length);
    syncFieldsForm(nodes);

    // Details cards sit in one panel under the board, in reading order.
    const order = [...(wip ? [wip.card] : []), ...columns.flatMap((column) => [...lanes.get(column)!.children].map((child) => [...cards.values()].find((c) => c.item === child)!.card))];
    order.forEach((card, i) => {
      if (panel.children[i] !== card) panel.insertBefore(card, panel.children[i] ?? null);
    });
    if (focused?.isConnected && doc.activeElement !== focused) focused.focus({ preventScroll: true });

    // A change made only of first-known statuses (a saved board's statuses arriving) draws still.
    const quiet = still.size > 0 && !moved && !fresh.length;
    if (painted && !quiet) {
      // An interrupted move still offsets its card: stop every one first (the before rects already
      // hold where they are drawn), then read all the new places, then write the motion.
      const moving = [...before.keys()].filter((card) => !still.has(card));
      for (const card of moving) cancelAnimations(card.item);
      const after = new Map<Card, DOMRect>();
      for (const card of moving) after.set(card, card.item.getBoundingClientRect());
      for (const [card, rect] of after) {
        const was = before.get(card)!;
        const dx = was.left + was.width / 2 - (rect.left + rect.width / 2);
        const dy = was.top + was.height / 2 - (rect.top + rect.height / 2);
        if ((Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) || !canAnimate(card.item)) continue;
        card.item.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 520, easing: EASE });
      }
      for (const card of fresh) {
        if (!canAnimate(card.item)) continue;
        card.item.animate([{ opacity: 0, transform: 'translateY(-22px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 80, easing: EASE, fill: 'backwards' });
      }
    }
    painted = true;
  }

  function teardown(): void {
    for (const id of [...cards.keys()]) dropCard(id);
    syncWip(undefined, 0);
    syncSuggested(false, 0);
    fieldsForm = null;
    cardSelect = null;
    fieldSelects.clear();
    cancelAnimations(root);
    for (const target of lanes.values()) target.replaceChildren();
    lanes.clear();
    board.replaceChildren();
    doingHead = null;
    root.replaceChildren();
  }

  function update(run: PsToolRun): void {
    if (destroyed) return;
    lastRun = run;
    fieldsOf = options.cardFields ? (cardFieldsOf(run) as Record<string, Fields>) : {};
    layout(run);
  }

  function setTasks(next: PsTaskLink[]): void {
    if (destroyed) return;
    const map = new Map(next.map((link) => [link.nodeId, link.status]));
    if (map.size === links.size && [...map].every(([id, status]) => links.get(id) === status)) return;
    links = map;
    if (lastRun) layout(lastRun);
  }

  function setProposed(nodeIds: string[]): void {
    if (destroyed) return;
    const next = new Set(nodeIds);
    if (next.size === proposed.size && [...next].every((id) => proposed.has(id))) return;
    proposed = next;
    if (lastRun) layout(lastRun);
  }

  return {
    el: root,
    update,
    setTasks,
    setProposed,
    onScore(cb) {
      scoreCb = cb;
    },
    /** Stop any motion and ignore later calls once the canvas drops this view. */
    destroy() {
      destroyed = true;
      cancelAnimations(root);
    }
  };
}
