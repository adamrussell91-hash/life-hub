// packages/decision-book/render/core.ts
// The shared chart core for every Decision Book family renderer. A family draws its own frame
// (axes, cells, curves, lanes) and says where each of its nodes sits (an EntrySpec); the core
// owns everything about the entries themselves, the same way for every chart:
//   - one pill per node, kept as the same element across updates (focus survives a move);
//   - the details card under the chart, one open at a time (Problem Solver's disclosure group);
//   - contested marks kept in step (syncContested), task tags with live status, proposals;
//   - motion only after the first paint: entries drop in, moved entries glide (FLIP);
//   - the kit's states as words: the chart says Empty, In progress or Completed, an open
//     entry is Selected, a contested one carries "! Contested";
//   - the optional `subject` above the frame and the `reflection` under it.
// Scores (plot and scales controls) go out through onScore, as in Problem Solver.
import type { PsNode, PsTaskLink, PsToolRun } from '../../problem-solver/types';
import { nodeTitle } from '../../problem-solver/titles.mjs';
import { parseSlot } from '../../problem-solver/slots.mjs';
import { taskStatusLabel } from '../../problem-solver/render/task-status';
import { EASE, canAnimate, cancelAnimations, createDisclosureGroup, detailsCard, nextId, syncContested } from '../../problem-solver/render/details';

export type Fill = 'red' | 'green' | 'ink' | 'tint';

/** A run of a Decision Book tool: Problem Solver's run shape with a `dm_` tool id (PsToolId stays Problem Solver's own). */
export type DmToolRun = Omit<PsToolRun, 'tool'> & { tool: string };

/** Where one node is drawn. `label` starts its accessible name ("Quick win item 2"). */
export type EntrySpec = {
  node: PsNode;
  host: HTMLElement;
  fill: Fill;
  label: string;
  /** Order inside its host (defaults to the slot index). */
  order?: number;
  /** Inline style the family positions it with (a plot's left and top). */
  style?: Record<string, string>;
  /** A short line under the title (a decision reason's basis). */
  meta?: string;
};

export type ChartContext = {
  doc: Document;
  /** The family's drawing area; it persists between updates. */
  frame: HTMLDivElement;
  /** True on the update that first draws this chart. */
  first: boolean;
  /** Send a scores payload to the canvas (the person placed or scored something). */
  emitScore(payload: Record<string, unknown>): void;
};

export type ChartView = {
  el: HTMLDivElement;
  update(run: DmToolRun): void;
  setTasks(links: PsTaskLink[]): void;
  setProposed(nodeIds: string[]): void;
  onScore(cb: (scores: Record<string, unknown>) => void): void;
  destroy(): void;
};

export type ChartOptions = {
  /** The family key, for class names (`dm-chart--quadrant`). */
  family: string;
  /** The chart's accessible name (the model's name). */
  label: string;
  /** Labels for the framing slots, when the tool has them. */
  subject?: string | null;
  reflection?: string | null;
  /** Draw the frame for this run and return where each family node goes (framing slots excluded). */
  draw(run: DmToolRun, ctx: ChartContext): EntrySpec[];
};

type Entry = {
  node: PsNode;
  spec: EntrySpec;
  item: HTMLDivElement;
  button: HTMLButtonElement;
  head: HTMLSpanElement;
  title: HTMLSpanElement;
  meta: HTMLSpanElement;
  proposed: HTMLSpanElement;
  task: HTMLSpanElement | null;
  card: HTMLDivElement;
  cardKey: string;
};

/** Element with a class name and optional text. */
export function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const out = doc.createElement(tag);
  out.className = className;
  if (text) out.textContent = text;
  return out;
}

export function setText(target: Element, value: string): void {
  if (target.textContent !== value) target.textContent = value;
}

export function setAttr(target: Element, name: string, value: string | null): void {
  if (value === null) {
    if (target.hasAttribute(name)) target.removeAttribute(name);
  } else if (target.getAttribute(name) !== value) target.setAttribute(name, value);
}

export const SVG_NS = 'http://www.w3.org/2000/svg';

/** An SVG element with attributes. */
export function svg<K extends keyof SVGElementTagNameMap>(doc: Document, tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const out = doc.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) out.setAttribute(name, value);
  return out;
}

export const slotName = (node: PsNode): string => parseSlot(node.slot)?.name ?? '';
export const slotIndex = (node: PsNode): number => parseSlot(node.slot)?.index ?? 0;
const FRAMING = new Set(['subject', 'reflection']);

const STATE_WORDS = { empty: 'Empty', populated: 'In progress', completed: 'Completed' } as const;

export function createChart(opts: ChartOptions, doc: Document = document): ChartView {
  const root = el(doc, 'div', `dm-chart dm-chart--${opts.family}`);
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', opts.label);
  const state = el(doc, 'p', 'dm-chart__state');
  const subjectBox = el(doc, 'div', 'dm-chart__subject');
  const frame = el(doc, 'div', 'dm-chart__frame');
  const reflectionBox = el(doc, 'div', 'dm-chart__reflection');
  const panel = el(doc, 'div', 'dm-chart__panel');
  if (opts.subject) subjectBox.append(el(doc, 'span', 'dm-chart__slot-label', opts.subject));
  if (opts.reflection) reflectionBox.append(el(doc, 'span', 'dm-chart__slot-label', opts.reflection));
  root.append(state, ...(opts.subject ? [subjectBox] : []), frame, ...(opts.reflection ? [reflectionBox] : []), panel);

  const entries = new Map<string, Entry>();
  const group = createDisclosureGroup({
    onChange() {
      for (const entry of entries.values()) {
        const open = entry.card.classList.contains('is-open');
        entry.item.classList.toggle('is-selected', open);
        setAttr(entry.item, 'data-state', open ? 'selected' : entry.node.state === 'contested' ? 'contested' : 'populated');
      }
    }
  });
  let links = new Map<string, string>();
  let proposed = new Set<string>();
  let scoreCb: ((scores: Record<string, unknown>) => void) | null = null;
  let lastRun: DmToolRun | null = null;
  let painted = false;
  let destroyed = false;

  const ctx: ChartContext = {
    doc,
    frame,
    first: true,
    emitScore(payload) {
      if (!destroyed) scoreCb?.(payload);
    }
  };

  function makeEntry(spec: EntrySpec): Entry {
    const detailsId = nextId('dm-details');
    const item = el(doc, 'div', 'dm-entry');
    item.setAttribute('data-shape', '');
    const button = el(doc, 'button', 'dm-entry__pill');
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    const head = el(doc, 'span', 'dm-entry__head');
    const title = el(doc, 'span', 'dm-entry__title');
    head.append(title);
    const meta = el(doc, 'span', 'dm-entry__meta');
    meta.hidden = true;
    const waiting = el(doc, 'span', 'dm-entry__meta dm-entry__proposed', 'Proposed task');
    waiting.hidden = true;
    button.append(head, meta, waiting);
    item.append(button);
    const card = el(doc, 'div', 'ps-details');
    card.id = detailsId;
    group.register(card, button);
    return { node: spec.node, spec, item, button, head, title, meta, proposed: waiting, task: null, card, cardKey: '' };
  }

  function dropEntry(id: string): void {
    const entry = entries.get(id);
    if (!entry) return;
    if (entry.card.classList.contains('is-open')) group.close();
    group.unregister(entry.card);
    cancelAnimations(entry.item);
    entry.item.remove();
    entry.card.remove();
    entries.delete(id);
  }

  /** Words, fill, meta, task tag and details in step with the node. True when the task tag first appears. */
  function syncEntry(entry: Entry, spec: EntrySpec): boolean {
    const { node } = spec;
    entry.node = node;
    entry.spec = spec;
    setAttr(entry.item, 'data-node', node.id);
    setAttr(entry.card, 'data-for', node.id);
    setAttr(entry.item, 'data-fill', spec.fill);
    setAttr(entry.item, 'data-state', entry.card.classList.contains('is-open') ? 'selected' : node.state === 'contested' ? 'contested' : 'populated');
    entry.item.style.order = String(spec.order ?? slotIndex(node));
    for (const [name, value] of Object.entries(spec.style ?? {})) if (entry.item.style.getPropertyValue(name) !== value) entry.item.style.setProperty(name, value);
    setText(entry.title, nodeTitle(node));
    entry.meta.hidden = !spec.meta;
    setText(entry.meta, spec.meta ?? '');

    const status = links.get(node.id);
    const removed = status === 'removed';
    const linked = status !== undefined && !removed;
    const label = status === undefined ? '' : taskStatusLabel(status);
    setAttr(entry.item, 'data-task-status', status ?? null);
    entry.item.classList.toggle('is-task', linked);
    entry.item.classList.toggle('is-removed', removed);
    const waiting = status === undefined && proposed.has(node.id);
    entry.proposed.hidden = !waiting;

    let born = false;
    if (status === undefined) {
      entry.task?.remove();
      entry.task = null;
    } else {
      if (!entry.task) {
        entry.task = el(doc, 'span', 'dm-entry__task');
        entry.task.append(el(doc, 'span', 'dm-entry__task-mark'), el(doc, 'span', 'dm-entry__task-status'));
        entry.button.append(entry.task);
        born = true;
      }
      entry.task.classList.toggle('is-removed', removed);
      setText(entry.task.children[0], removed ? label : 'Task');
      setText(entry.task.children[1], removed ? '' : label);
      (entry.task.children[1] as HTMLElement).hidden = removed || !label;
    }

    const taskWords = removed ? ', task removed' : linked ? (label ? `, task: ${label}` : ', task') : waiting ? ', proposed task' : '';
    const contested = node.state === 'contested' ? ', contested' : '';
    setAttr(entry.button, 'aria-label', `${spec.label}: ${nodeTitle(node)}${spec.meta ? ` (${spec.meta})` : ''}${taskWords}${contested}. Show details`);
    const key = `${node.text}\u0000${node.state}\u0000${node.objection ?? ''}\u0000${(node.skills ?? []).join(',')}\u0000${spec.fill}`;
    if (entry.cardKey !== key) {
      const fresh = detailsCard(doc, node, 'red', entry.card.id);
      const inner = fresh.querySelector('.ps-details__card');
      if (inner) inner.className = `ps-details__card dm-details__card dm-details__card--${spec.fill}`;
      entry.card.replaceChildren(...fresh.childNodes);
      entry.cardKey = key;
    }
    syncContested(entry.item, node, entry.head, entry.button);
    return born;
  }

  function framingSpecs(run: DmToolRun): EntrySpec[] {
    const out: EntrySpec[] = [];
    for (const node of run.nodes) {
      const name = slotName(node);
      if (name === 'subject' && opts.subject) out.push({ node, host: subjectBox, fill: 'ink', label: opts.subject });
      if (name === 'reflection' && opts.reflection) out.push({ node, host: reflectionBox, fill: 'ink', label: opts.reflection });
    }
    return out;
  }

  function layout(run: DmToolRun, justConfirmed: Set<string> = new Set()): void {
    ctx.first = !painted;
    const familyNodes = { ...run, nodes: run.nodes.filter((node) => !FRAMING.has(slotName(node))) };
    const specs = [...framingSpecs(run), ...opts.draw(familyNodes, ctx)];
    // Scores alone (a radar scored before any note) count as content.
    const kind = run.status === 'done' ? 'completed' : run.nodes.length || run.scores?.snapshots?.length ? 'populated' : 'empty';
    setAttr(root, 'data-state', kind);
    setText(state, STATE_WORDS[kind]);
    const wanted = new Map(specs.map((spec) => [spec.node.id, spec]));

    // Reads first: where each entry stands now, before anything moves.
    const before = new Map<Entry, DOMRect>();
    if (painted) for (const [id, entry] of entries) if (wanted.has(id) && entry.item.isConnected) before.set(entry, entry.item.getBoundingClientRect());
    const active = doc.activeElement;
    const focused = active instanceof HTMLElement && active !== root && root.contains(active) ? active : null;

    for (const id of [...entries.keys()]) if (!wanted.has(id)) dropEntry(id);
    const fresh: Entry[] = [];
    const tagged: Entry[] = [];
    for (const spec of specs) {
      let entry = entries.get(spec.node.id);
      if (!entry) {
        entry = makeEntry(spec);
        entries.set(spec.node.id, entry);
        fresh.push(entry);
      }
      if (syncEntry(entry, spec) && justConfirmed.has(spec.node.id)) tagged.push(entry);
      if (entry.item.parentElement !== spec.host) spec.host.append(entry.item);
    }
    // Hosts keep their entries in order (a node can change slot or host on another device).
    for (const host of new Set(specs.map((spec) => spec.host))) {
      const items = [...host.querySelectorAll(':scope > .dm-entry')] as HTMLDivElement[];
      const sorted = [...items].sort((a, b) => Number(a.style.order) - Number(b.style.order));
      if (sorted.some((item, i) => items[i] !== item)) for (const item of sorted) host.append(item);
    }
    // Details cards in reading order (document order of their entries).
    const order = [...root.querySelectorAll('.dm-entry')].map((item) => [...entries.values()].find((entry) => entry.item === item)!.card);
    order.forEach((card, i) => {
      if (panel.children[i] !== card) panel.insertBefore(card, panel.children[i] ?? null);
    });
    if (focused?.isConnected && doc.activeElement !== focused) focused.focus({ preventScroll: true });

    if (painted) {
      const moving = [...before.keys()];
      for (const entry of moving) cancelAnimations(entry.item);
      const after = new Map<Entry, DOMRect>();
      for (const entry of moving) after.set(entry, entry.item.getBoundingClientRect());
      for (const [entry, rect] of after) {
        const was = before.get(entry)!;
        const dx = was.left + was.width / 2 - (rect.left + rect.width / 2);
        const dy = was.top + was.height / 2 - (rect.top + rect.height / 2);
        if ((Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) || !canAnimate(entry.item)) continue;
        entry.item.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 520, easing: EASE });
      }
      for (const entry of fresh) {
        if (!canAnimate(entry.item)) continue;
        entry.item.animate([{ opacity: 0, transform: 'translateY(-16px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 80, easing: EASE, fill: 'backwards' });
      }
      for (const entry of tagged) {
        if (!entry.task || !canAnimate(entry.task)) continue;
        entry.task.animate([{ opacity: 0, transform: 'scale(0.7)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EASE, fill: 'backwards' });
      }
    }
    painted = true;
  }

  return {
    el: root,
    update(run) {
      if (destroyed) return;
      lastRun = run;
      layout(run);
    },
    setTasks(next) {
      if (destroyed) return;
      const map = new Map(next.map((link) => [link.nodeId, link.status]));
      if (map.size === links.size && [...map].every(([id, status]) => links.get(id) === status)) return;
      const confirmed = new Set([...map.keys()].filter((id) => !links.has(id) && proposed.has(id)));
      links = map;
      if (lastRun) layout(lastRun, confirmed);
    },
    setProposed(nodeIds) {
      if (destroyed) return;
      const next = new Set(nodeIds);
      if (next.size === proposed.size && [...next].every((id) => proposed.has(id))) return;
      proposed = next;
      if (lastRun) layout(lastRun);
    },
    onScore(cb) {
      scoreCb = cb;
    },
    destroy() {
      destroyed = true;
      cancelAnimations(root);
    }
  };
}
