// packages/problem-solver/render/fifteen-percent.ts
// 15% solutions (toolkit, Implement), drawn as the book draws it: three large discs stacked and
// touching. What is red with its top-right quarter blue; Now is yellow with a red ring inside it;
// Go is blue with its top-left quarter red. What and Go carry their word in yellow, Now in blue.
// Each disc appears with its first node: What with `reflect` (its title beside the disc, a button
// for the details), Now with the first `action` (pills beside the disc, odd ones on the left and
// even ones on the right, sliding in toward it), Go with the first `chosen`. A chosen note moves
// the action it picks: the same pill rolls (FLIP by measured centres, a quarter turn on its inner
// wrapper) from beside Now to beside Go (the note's odd slots left, even right), turns blue
// and carries the note as its details.
// A chosen action that became a task (setTasks) shows a small "Task" mark with its live status.
// Details open in one panel under the discs, so an open card never pushes the discs apart.
// Phone (the root up to 480px wide): the discs shrink with the container and each disc's items
// move under it, in slot order.
import type { PsNode, PsTaskLink, PsToolRun } from '../types';
import { nodeTitle } from '../titles.mjs';
import { parseSlot } from '../slots.mjs';
import { taskStatusLabel } from './task-status';
import { EASE, canAnimate, cancelAnimations, createDisclosureGroup, detailsCard, nextId, syncContested } from './details';

export type FifteenPercentView = { el: HTMLDivElement; update(run: PsToolRun): void; setTasks(links: PsTaskLink[]): void; destroy(): void };

type Region = 'what' | 'now' | 'go';
const REGIONS: readonly Region[] = ['what', 'now', 'go'];
const WORD: Record<Region, string> = { what: 'What', now: 'Now', go: 'Go' };
const LABEL: Record<Region, string> = { what: 'What: where you are free to act', now: 'Now: actions you can take', go: 'Go: actions chosen' };

type Row = { region: Region; item: HTMLDivElement; disc: HTMLSpanElement; start: HTMLDivElement; end: HTMLDivElement };
type Note = { node: PsNode; item: HTMLDivElement; button: HTMLButtonElement; head: HTMLSpanElement; title: HTMLSpanElement; card: HTMLDivElement; cardKey: string };
type Pill = {
  /** The action node, or for a chosen note that picks nothing yet, the note itself. */
  node: PsNode;
  chosen: PsNode | null;
  item: HTMLDivElement;
  roll: HTMLSpanElement;
  button: HTMLButtonElement;
  head: HTMLSpanElement;
  title: HTMLSpanElement;
  meta: HTMLSpanElement;
  task: HTMLSpanElement | null;
  card: HTMLDivElement;
  cardKey: string;
};

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
const keyOf = (...nodes: (PsNode | null)[]): string => nodes.map((node) => (node ? `${node.id}\u0000${node.text}\u0000${node.state}\u0000${(node.skills ?? []).join(',')}` : '')).join('\u0001');

export function createFifteenPercentView(doc: Document = document): FifteenPercentView {
  const root = doc.createElement('div');
  root.className = 'ps-fifteen';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', '15% solutions');
  const group = createDisclosureGroup();

  const chart = el(doc, 'div', 'ps-fifteen__chart');
  const panel = el(doc, 'div', 'ps-fifteen__panel');
  const rows = new Map<Region, Row>();
  let note: Note | null = null;
  const pills = new Map<string, Pill>();
  let links = new Map<string, string>();
  let lastRun: PsToolRun | null = null;
  /** Nothing animates until the run on screen has been drawn once (a saved run arrives still). */
  let painted = false;
  let destroyed = false;

  // ---------------------------------------------------------------- discs

  function makeRow(region: Region): Row {
    const item = el(doc, 'div', `ps-fifteen__row ps-fifteen__row--${region}`);
    item.setAttribute('role', 'group');
    item.setAttribute('aria-label', LABEL[region]);
    item.setAttribute('data-region', region);
    const start = el(doc, 'div', 'ps-fifteen__lane ps-fifteen__lane--start');
    const end = el(doc, 'div', 'ps-fifteen__lane ps-fifteen__lane--end');
    // The disc is the book's picture; the row's label says its word for assistive tech.
    const disc = el(doc, 'span', `ps-fifteen__disc ps-fifteen__disc--${region}`);
    disc.setAttribute('aria-hidden', 'true');
    disc.setAttribute('data-shape', '');
    disc.setAttribute('data-fill', region === 'what' ? 'red' : region === 'now' ? 'yellow' : 'blue');
    if (region === 'now') disc.append(el(doc, 'span', 'ps-fifteen__ring'));
    disc.append(el(doc, 'span', 'ps-fifteen__word', WORD[region]));
    item.append(start, disc, end);
    return { region, item, disc, start, end };
  }

  /** Show or drop a disc's row; a row that arrives after the first paint grows in. */
  function syncRow(region: Region, want: boolean, animate: boolean): Row | null {
    let row = rows.get(region) ?? null;
    if (!want) {
      if (row) {
        cancelAnimations(row.item);
        row.item.remove();
        rows.delete(region);
      }
      return null;
    }
    if (!row) {
      row = makeRow(region);
      rows.set(region, row);
      if (animate && canAnimate(row.disc)) {
        row.disc.animate([{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'none' }], { duration: 460, easing: EASE, fill: 'backwards' });
      }
    }
    const at = REGIONS.filter((r) => rows.has(r)).indexOf(region);
    if (chart.children[at] !== row.item) chart.insertBefore(row.item, chart.children[at] ?? null);
    return row;
  }

  // ---------------------------------------------------------------- What

  function syncNote(node: PsNode | undefined, animate: boolean): void {
    if (!node) {
      if (note) {
        if (note.card.classList.contains('is-open')) group.close();
        group.unregister(note.card);
        note.item.remove();
        note.card.remove();
        note = null;
      }
      return;
    }
    let born = false;
    if (!note || note.node.id !== node.id) {
      syncNote(undefined, false);
      const detailsId = nextId('ps-fifteen-details');
      const item = el(doc, 'div', 'ps-fifteen__note');
      item.setAttribute('data-shape', '');
      item.setAttribute('data-fill', 'card');
      const button = el(doc, 'button', 'ps-fifteen__note-button');
      button.type = 'button';
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', detailsId);
      const head = el(doc, 'span', 'ps-fifteen__head');
      const title = el(doc, 'span', 'ps-fifteen__title');
      head.append(title);
      button.append(head, el(doc, 'span', 'ps-fifteen__more', 'Details'));
      item.append(button);
      const card = el(doc, 'div', 'ps-details');
      card.id = detailsId;
      group.register(card, button);
      note = { node, item, button, head, title, card, cardKey: '' };
      born = true;
    }
    note.node = node;
    setAttr(note.item, 'data-node', node.id);
    setAttr(note.card, 'data-for', node.id);
    setText(note.title, nodeTitle(node));
    setAttr(note.button, 'aria-label', `Where you are free to act: ${nodeTitle(node)}${contested(node)}. Show details`);
    const key = keyOf(node);
    if (note.cardKey !== key) {
      note.card.replaceChildren(...detailsCard(doc, node, 'red', note.card.id).childNodes);
      note.cardKey = key;
    }
    syncContested(note.item, node, note.head, note.button);
    const row = rows.get('what')!;
    if (note.item.parentElement !== row.end) row.end.append(note.item);
    if (born && animate && canAnimate(note.item)) {
      note.item.animate([{ opacity: 0, transform: 'translateX(14px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 160, easing: EASE, fill: 'backwards' });
    }
  }

  // ---------------------------------------------------------------- pills

  function makePill(node: PsNode): Pill {
    const detailsId = nextId('ps-fifteen-details');
    const item = el(doc, 'div', 'ps-fifteen__pill');
    item.setAttribute('data-shape', '');
    const roll = el(doc, 'span', 'ps-fifteen__roll');
    const button = el(doc, 'button', 'ps-fifteen__pill-button');
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    const head = el(doc, 'span', 'ps-fifteen__head');
    const title = el(doc, 'span', 'ps-fifteen__title');
    head.append(title);
    const meta = el(doc, 'span', 'ps-fifteen__meta');
    meta.hidden = true;
    button.append(head, meta);
    roll.append(button);
    item.append(roll);
    const card = el(doc, 'div', 'ps-details');
    card.id = detailsId;
    group.register(card, button);
    return { node, chosen: null, item, roll, button, head, title, meta, task: null, card, cardKey: '' };
  }

  function dropPill(id: string): void {
    const pill = pills.get(id);
    if (!pill) return;
    if (pill.card.classList.contains('is-open')) group.close();
    group.unregister(pill.card);
    cancelAnimations(pill.item);
    pill.item.remove();
    pill.card.remove();
    pills.delete(id);
  }

  /** Keep a pill's words, colour, details and task mark in step with its action and note. */
  function syncPill(pill: Pill, node: PsNode, chosen: PsNode | null): void {
    const was = pill.chosen?.id ?? null;
    pill.node = node;
    pill.chosen = chosen;
    const picked = Boolean(chosen);
    // Close a card whose subject changes (a note picks or lets go of this action).
    if (was !== (chosen?.id ?? null) && pill.card.classList.contains('is-open')) group.close();
    setAttr(pill.item, 'data-node', node.id);
    setAttr(pill.item, 'data-chosen', chosen && chosen.id !== node.id ? chosen.id : null);
    setAttr(pill.item, 'data-fill', picked ? 'blue' : 'yellow');
    pill.item.classList.toggle('is-picked', picked);
    pill.item.style.order = String(indexOf(chosen ?? node));
    setText(pill.title, nodeTitle(node));
    // A picked action carries its note's title (usually when) under its own.
    const metaText = chosen && chosen.id !== node.id ? nodeTitle(chosen) : '';
    setText(pill.meta, metaText);
    pill.meta.hidden = !metaText;

    // The task mark: only a chosen note can become a task.
    const status = chosen ? links.get(chosen.id) : undefined;
    const label = status === undefined ? null : taskStatusLabel(status);
    if (label === null) {
      pill.task?.remove();
      pill.task = null;
    } else {
      if (!pill.task) {
        pill.task = el(doc, 'span', 'ps-fifteen__task');
        pill.task.setAttribute('data-shape', '');
        pill.task.setAttribute('data-fill', 'yellow');
        pill.task.append(el(doc, 'span', 'ps-fifteen__tag ps-fifteen__task-mark'), el(doc, 'span', 'ps-fifteen__tag ps-fifteen__task-status'));
        pill.button.append(pill.task);
      }
      const removed = status === 'removed';
      pill.task.classList.toggle('is-removed', removed);
      setAttr(pill.task, 'data-fill', removed ? 'card' : 'yellow');
      setText(pill.task.children[0], removed ? label : 'Task');
      setText(pill.task.children[1], removed ? '' : label);
      (pill.task.children[1] as HTMLElement).hidden = removed || !label;
    }

    const subject = chosen ?? node;
    const taskWords = label === null ? '' : status === 'removed' ? ', task removed' : label ? `, task: ${label}` : ', task';
    const lead = picked ? `Chosen action: ${nodeTitle(node)}${metaText ? `, ${metaText}` : ''}` : `Action ${indexOf(node)}: ${nodeTitle(node)}`;
    // Contested if either the action or its note is.
    const disputed = node.state === 'contested' ? node : chosen?.state === 'contested' ? chosen : subject;
    setAttr(pill.button, 'aria-label', `${lead}${taskWords}${contested(disputed)}. Show details`);
    const key = keyOf(node, chosen);
    if (pill.cardKey !== key) {
      const built = detailsCard(doc, subject, picked ? 'blue' : 'yellow', pill.card.id);
      const card = built.querySelector('.ps-details__card');
      // A picked action's details lead with the action in full, then the note that picked it.
      if (card && chosen && chosen.id !== node.id) {
        const action = el(doc, 'p', 'ps-fifteen__action-text', node.text);
        card.prepend(action);
        if (node.state === 'contested' && chosen.state !== 'contested') card.append(...detailsCard(doc, node, 'blue', '').querySelectorAll('.ps-details__note'));
      }
      pill.card.replaceChildren(...built.childNodes);
      pill.cardKey = key;
    }
    setAttr(pill.card, 'data-for', subject.id);
    syncContested(pill.item, disputed, pill.head, null);
  }

  // ---------------------------------------------------------------- tasks

  function setTasks(next: PsTaskLink[]): void {
    if (destroyed) return;
    const map = new Map(next.map((link) => [link.nodeId, link.status]));
    const same = map.size === links.size && [...map].every(([id, status]) => links.get(id) === status);
    if (same) return;
    links = map;
    if (!lastRun) return;
    for (const pill of pills.values()) {
      const had = Boolean(pill.task);
      syncPill(pill, pill.node, pill.chosen);
      if (!had && pill.task && painted && canAnimate(pill.task)) {
        pill.task.animate([{ opacity: 0, transform: 'scale(0.7)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EASE, fill: 'backwards' });
      }
    }
  }

  // ---------------------------------------------------------------- update

  function teardown(): void {
    syncNote(undefined, false);
    for (const id of [...pills.keys()]) dropPill(id);
    for (const region of REGIONS) syncRow(region, false, false);
    cancelAnimations(root);
    root.replaceChildren();
  }

  function update(run: PsToolRun): void {
    if (destroyed) return;
    lastRun = run;
    const reflect = run.nodes.find((node) => nameOf(node) === 'reflect');
    const actions = run.nodes.filter((node) => nameOf(node) === 'action').sort(bySlot);
    const notes = run.nodes.filter((node) => nameOf(node) === 'chosen').sort(bySlot);
    if (!reflect && !actions.length && !notes.length) {
      if (root.children.length) teardown();
      painted = true;
      return;
    }

    // Which note picks which action (one each, as the tool allows).
    const byId = new Map(run.nodes.map((node) => [node.id, node]));
    const pickOf = new Map<string, PsNode>();
    const picksFor = new Set<string>();
    for (const chosen of notes) {
      const to = run.edges.find((edge) => edge.kind === 'picks' && edge.from === chosen.id)?.to;
      const action = to ? byId.get(to) : undefined;
      if (action && nameOf(action) === 'action' && !pickOf.has(action.id)) {
        pickOf.set(action.id, chosen);
        picksFor.add(chosen.id);
      }
    }
    // A pill per action, plus one for any note that picks nothing yet.
    const loose = notes.filter((chosen) => !picksFor.has(chosen.id));
    const wanted = new Set([...actions, ...loose].map((node) => node.id));

    // Reads first: where each pill stands now, before anything moves.
    const before = new Map<string, DOMRect>();
    if (painted) for (const [id, pill] of pills) if (wanted.has(id) && pill.item.isConnected) before.set(id, pill.item.getBoundingClientRect());

    for (const id of [...pills.keys()]) if (!wanted.has(id)) dropPill(id);

    if (!chart.parentElement) root.append(chart, panel);
    const what = syncRow('what', Boolean(reflect), painted);
    syncRow('now', actions.length > 0, painted);
    const go = syncRow('go', notes.length > 0, painted);
    if (what) syncNote(reflect, painted);
    else syncNote(undefined, false);

    const fresh: Pill[] = [];
    const moved = new Set<Pill>();
    for (const node of [...actions, ...loose]) {
      let pill = pills.get(node.id);
      if (!pill) {
        pill = makePill(node);
        pills.set(node.id, pill);
        fresh.push(pill);
      }
      const chosen = nameOf(node) === 'chosen' ? node : pickOf.get(node.id) ?? null;
      const wasPicked = Boolean(pill.chosen);
      syncPill(pill, node, chosen);
      // Place it beside Now by its action's slot, or beside Go by its note's slot: odd left, even
      // right, so neither list outgrows its disc and the discs stay touching.
      const row = chosen ? go! : rows.get('now')!;
      const lane = indexOf(chosen ?? node) % 2 === 1 ? row.start : row.end;
      if (pill.item.parentElement !== lane) {
        if (pill.item.parentElement && wasPicked !== Boolean(chosen)) moved.add(pill);
        lane.append(pill.item);
      }
    }
    // Keep each lane in slot order.
    for (const row of rows.values()) {
      for (const lane of [row.start, row.end]) {
        const items = [...lane.children].filter((child) => child.classList.contains('ps-fifteen__pill')) as HTMLDivElement[];
        const sorted = [...items].sort((a, b) => Number(a.style.order) - Number(b.style.order));
        const at = sorted.findIndex((item, i) => items[i] !== item);
        if (at >= 0) lane.append(...sorted.slice(at));
      }
    }

    // Details cards sit in one panel under the discs, in reading order.
    const cards = [note?.card, ...[...rows.values()].flatMap((row) => [...row.start.children, ...row.end.children].map((child) => [...pills.values()].find((p) => p.item === child)?.card))].filter(Boolean) as HTMLDivElement[];
    cards.forEach((card, i) => {
      if (panel.children[i] !== card) panel.insertBefore(card, panel.children[i] ?? null);
    });

    if (painted) {
      // Reads, all of them, before any motion is written.
      const after = new Map<Pill, DOMRect>();
      for (const [id, rect] of before) {
        const pill = pills.get(id);
        if (pill) after.set(pill, pill.item.getBoundingClientRect());
      }
      for (const [pill, rect] of after) {
        const was = before.get(pill.node.id)!;
        const dx = was.left + was.width / 2 - (rect.left + rect.width / 2);
        const dy = was.top + was.height / 2 - (rect.top + rect.height / 2);
        if ((Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) || !canAnimate(pill.item)) continue;
        cancelAnimations(pill.item);
        pill.item.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 620, easing: EASE });
        // Rolling between Now and Go: a quarter turn on the inner wrapper.
        if (moved.has(pill)) pill.roll.animate([{ transform: `rotate(${pill.chosen ? -90 : 90}deg)` }, { transform: 'none' }], { duration: 620, easing: EASE });
      }
      for (const pill of fresh) {
        if (!canAnimate(pill.item)) continue;
        const left = pill.item.parentElement?.classList.contains('ps-fifteen__lane--start');
        pill.item.animate([{ opacity: 0, transform: `translateX(${left ? -18 : 18}px)` }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 120, easing: EASE, fill: 'backwards' });
      }
    }
    painted = true;
  }

  return {
    el: root,
    update,
    setTasks,
    /** Stop any motion and ignore later calls once the canvas drops this view. */
    destroy() {
      destroyed = true;
      cancelAnimations(root);
    }
  };
}
