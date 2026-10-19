// packages/problem-solver/render/morphological.ts
// Morphological analysis (toolkit, Decide), drawn as the book draws it: a red header row with the
// subject names, and under each subject a column of attribute cells in alternating light and
// darker yellow rows (the stripes run across the whole grid), with thin paper gaps between the
// columns and empty striped cells filling the shorter columns. A scenario shows as one blue oval
// per column, sitting on the attribute it picks, joined by a blue line that zig-zags from column
// to column behind the ovals. Several scenarios get tabs; only the selected one's ovals show.
// A contradiction is a chip under the grid ("A cannot go with B") and a small red notch on both
// of its cells; a scenario holding such a pair draws its line dashed in red with a cross between
// the two clashing ovals, and its tab says so. The problem is a card above the grid; the
// evaluation and the Chosen option are cards below it.
// Phone (the root up to 560px wide): the grid stays, coded. Subjects read S1, S2..., each cell
// its code (S2·3), and a key under the grid pairs every code with its title; the key items are
// the 44px targets.
import type { PsNode, PsToolRun } from '../types';
import { nodeTitle } from '../titles.mjs';
import { parseSlot } from '../slots.mjs';
import { attributesOf, consistent, contradictionPairs, picksOf, subjectsOf } from '../tools/morphological.mjs';
import { EASE, canAnimate, cancelAnimations, createDisclosureGroup, detailsCard, nextId, syncContested } from './details';
import type { Accent } from './details';
import { createChoiceCard } from './choice-card';

export type MorphologicalView = {
  el: HTMLDivElement;
  update(run: PsToolRun): void;
  /** Lay out for a container this many pixels wide (tests; normally the ResizeObserver decides). */
  layout(width: number): void;
  destroy(): void;
};

const SVG = 'http://www.w3.org/2000/svg';
/** Up to and including this many pixels wide, the grid shows codes and a key. */
const COMPACT_MAX = 560;
const LINE_MS = 520;

type Cell = { node: PsNode; item: HTMLDivElement; button: HTMLButtonElement; oval: HTMLSpanElement; code: HTMLSpanElement; title: HTMLSpanElement; card: HTMLDivElement; subject: string };
type Column = { node: PsNode; item: HTMLDivElement; head: HTMLButtonElement; code: HTMLSpanElement; title: HTMLSpanElement; words: HTMLSpanElement; card: HTMLDivElement; fillers: HTMLDivElement[] };
type Scenario = { node: PsNode; pill: HTMLButtonElement; meta: HTMLSpanElement; title: HTMLSpanElement; words: HTMLSpanElement; clash: HTMLSpanElement; card: HTMLDivElement; tab: HTMLButtonElement; tabTitle: HTMLSpanElement; tabClash: HTMLSpanElement };
type Clash = { node: PsNode; chip: HTMLButtonElement; text: HTMLSpanElement; words: HTMLSpanElement; card: HTMLDivElement; pair: string[] };
type Composed = { item: HTMLDivElement; head: HTMLDivElement; text: HTMLParagraphElement; more: HTMLButtonElement; id: string };
type KeyGroup = { el: HTMLDivElement; head: HTMLButtonElement; code: HTMLSpanElement; title: HTMLSpanElement; list: HTMLDivElement };
type KeyRow = { el: HTMLButtonElement; code: HTMLSpanElement; title: HTMLSpanElement };

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const out = doc.createElement(tag);
  out.className = className;
  if (text) out.textContent = text;
  return out;
}

function setText(target: Element, value: string): void {
  if (target.textContent !== value) target.textContent = value;
}

function setAttr(target: Element, name: string, value: string): void {
  if (target.getAttribute(name) !== value) target.setAttribute(name, value);
}

const indexOf = (node: PsNode): number => parseSlot(node.slot)?.index ?? 0;
const bySlot = (a: PsNode, b: PsNode): number => indexOf(a) - indexOf(b);
const named = (run: PsToolRun, name: string): PsNode[] => run.nodes.filter((node) => parseSlot(node.slot)?.name === name).sort(bySlot);
const contested = (node: PsNode): string => (node.state === 'contested' ? ', contested' : '');

export function createMorphologicalView(doc: Document = document): MorphologicalView {
  const root = doc.createElement('div');
  root.className = 'ps-morph';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Morphological analysis');
  root.setAttribute('data-compact', 'false');
  const group = createDisclosureGroup();
  const choice = createChoiceCard(doc, group);

  // Fixed pieces, created on demand and kept in this order in the root.
  let problem: Composed | null = null;
  let evaluation: Composed | null = null;
  let frame: {
    bar: HTMLDivElement;
    tabs: HTMLDivElement;
    pills: HTMLDivElement;
    chart: HTMLDivElement;
    grid: HTMLDivElement;
    overlay: SVGSVGElement;
    line: SVGPolylineElement | null;
    marker: SVGGElement | null;
    key: HTMLDivElement;
  } | null = null;
  let clashes: HTMLDivElement | null = null;
  const panel = el(doc, 'div', 'ps-morph__panel');
  const after = el(doc, 'div', 'ps-morph__after');

  const columns = new Map<string, Column>();
  const cells = new Map<string, Cell>();
  const scenarios = new Map<string, Scenario>();
  const chips = new Map<string, Clash>();
  const keyGroups = new Map<string, KeyGroup>();
  const keyRows = new Map<string, KeyRow>();
  let subjectOrder: PsNode[] = [];
  let scenarioOrder: PsNode[] = [];
  let lastRun: PsToolRun | null = null;
  let selected: string | null = null;
  let picked = false;
  /** What the scenario line last drew (scenario, picks, clash), so it draws in only on change. */
  let lineKey = '';
  /** Nothing animates until the run on screen has been drawn once (a saved run arrives still). */
  let painted = false;
  let destroyed = false;
  let compact = false;
  let width = 0;
  let widthOverride: number | null = null;

  // ---------------------------------------------------------------- helpers

  function shapeButton(className: string, detailsId: string): HTMLButtonElement {
    const button = el(doc, 'button', className);
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    return button;
  }

  function card(node: PsNode, accent: Accent, detailsId: string, button: HTMLButtonElement): HTMLDivElement {
    const out = detailsCard(doc, node, accent, detailsId);
    out.setAttribute('data-for', node.id);
    panel.append(out);
    group.register(out, button);
    return out;
  }

  function drop(target: HTMLElement): void {
    group.unregister(target);
    target.remove();
  }

  function arrange(): void {
    const want = [problem?.item, frame?.bar, frame?.chart, frame?.key, clashes, panel, after].filter(Boolean) as HTMLElement[];
    want.forEach((child, i) => {
      if (root.children[i] !== child) root.insertBefore(child, root.children[i] ?? null);
    });
    for (const child of [...root.children]) if (!want.includes(child as HTMLElement)) child.remove();
  }

  function rise(target: HTMLElement, delay = 0): void {
    if (!canAnimate(target)) return;
    target.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay, easing: EASE, fill: 'backwards' });
  }

  function fade(target: Element, delay = 0): void {
    if (!canAnimate(target)) return;
    (target as HTMLElement).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay, easing: EASE, fill: 'backwards' });
  }

  // ---------------------------------------------------------------- composed cards (problem, evaluation)

  function syncComposed(current: Composed | null, node: PsNode | undefined, kind: 'problem' | 'evaluation', host: HTMLElement | null, fresh: HTMLElement[]): Composed | null {
    if (current && current.id !== node?.id) {
      group.unregister(current.item);
      current.item.remove();
      current = null;
    }
    if (!node) return null;
    if (!current) {
      const detailsId = nextId('ps-morph-details');
      const item = el(doc, 'div', `ps-morph__card ps-morph__card--${kind}`);
      item.setAttribute('data-node', node.id);
      const head = el(doc, 'div', 'ps-morph__card-head');
      head.append(el(doc, 'span', 'ps-morph__card-meta', kind === 'problem' ? 'Problem' : 'Evaluation'));
      const text = el(doc, 'p', 'ps-morph__card-text');
      const more = el(doc, 'button', 'ps-morph__more', 'Details');
      more.type = 'button';
      more.setAttribute('aria-expanded', 'false');
      more.setAttribute('aria-controls', detailsId);
      more.setAttribute('aria-label', `${kind === 'problem' ? 'Problem' : 'Evaluation'}. Show details`);
      const details = detailsCard(doc, node, kind === 'problem' ? 'red' : 'yellow', detailsId);
      details.setAttribute('data-for', node.id);
      // The card shows the answer in full, so its details carry only skills and any objection.
      details.querySelector('.ps-details__text')?.remove();
      item.append(head, text, more, details);
      group.register(item, more);
      current = { item, head, text, more, id: node.id };
      fresh.push(item);
    }
    setText(current.text, node.text);
    syncContested(current.item, node, current.head, current.more);
    if (host && host.firstElementChild !== current.item) host.prepend(current.item);
    return current;
  }

  // ---------------------------------------------------------------- frame

  function ensureFrame(fresh: HTMLElement[]): NonNullable<typeof frame> {
    if (frame) return frame;
    const bar = el(doc, 'div', 'ps-morph__bar');
    const tabs = el(doc, 'div', 'ps-morph__tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Scenario shown');
    tabs.hidden = true;
    const pills = el(doc, 'div', 'ps-morph__pills');
    bar.append(tabs, pills);
    bar.hidden = true;
    const chart = el(doc, 'div', 'ps-morph__chart');
    const grid = el(doc, 'div', 'ps-morph__grid');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Subjects and their attributes');
    const overlay = doc.createElementNS(SVG, 'svg') as SVGSVGElement;
    overlay.setAttribute('class', 'ps-morph__lines');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('focusable', 'false');
    chart.append(grid, overlay);
    const key = el(doc, 'div', 'ps-morph__key');
    key.setAttribute('role', 'group');
    key.setAttribute('aria-label', 'Key');
    key.hidden = true;
    frame = { bar, tabs, pills, chart, grid, overlay, line: null, marker: null, key };
    observer?.observe(chart);
    fresh.push(chart);
    return frame;
  }

  // ---------------------------------------------------------------- subjects and attributes

  function addColumn(node: PsNode): Column {
    const detailsId = nextId('ps-morph-details');
    const item = el(doc, 'div', 'ps-morph__subject');
    item.setAttribute('data-for', node.id);
    item.setAttribute('role', 'group');
    const head = shapeButton('ps-morph__head', detailsId);
    head.setAttribute('data-node', node.id);
    head.setAttribute('data-shape', '');
    head.setAttribute('data-fill', 'red');
    const words = el(doc, 'span', 'ps-morph__words');
    const code = el(doc, 'span', 'ps-morph__meta ps-morph__code');
    code.setAttribute('aria-hidden', 'true');
    const title = el(doc, 'span', 'ps-morph__title');
    words.append(code, title);
    head.append(words);
    item.append(head);
    const col: Column = { node, item, head, code, title, words, card: card(node, 'red', detailsId, head), fillers: [] };
    columns.set(node.id, col);
    return col;
  }

  function removeColumn(id: string): void {
    const col = columns.get(id);
    if (!col) return;
    drop(col.card);
    col.item.remove();
    columns.delete(id);
    const g = keyGroups.get(id);
    g?.el.remove();
    keyGroups.delete(id);
  }

  function addCell(node: PsNode, subject: string): Cell {
    const detailsId = nextId('ps-morph-details');
    const item = el(doc, 'div', 'ps-morph__cell');
    item.setAttribute('data-node', node.id);
    item.setAttribute('data-target-ok', '');
    const button = shapeButton('ps-morph__cell-button', detailsId);
    const oval = el(doc, 'span', 'ps-morph__oval');
    oval.setAttribute('data-shape', '');
    oval.setAttribute('data-fill', 'yellow');
    const code = el(doc, 'span', 'ps-morph__meta ps-morph__code');
    code.setAttribute('aria-hidden', 'true');
    const title = el(doc, 'span', 'ps-morph__title');
    oval.append(code, title);
    button.append(oval);
    item.append(button);
    const out: Cell = { node, item, button, oval, code, title, card: card(node, 'yellow', detailsId, button), subject };
    cells.set(node.id, out);
    return out;
  }

  function removeCell(id: string): void {
    const cell = cells.get(id);
    if (!cell) return;
    drop(cell.card);
    cell.item.remove();
    cells.delete(id);
    keyRows.get(id)?.el.remove();
    keyRows.delete(id);
  }

  // ---------------------------------------------------------------- scenarios

  function addScenario(node: PsNode): Scenario {
    const detailsId = nextId('ps-morph-details');
    const pill = shapeButton('ps-morph__scenario', detailsId);
    pill.setAttribute('data-node', node.id);
    pill.setAttribute('data-shape', '');
    pill.setAttribute('data-fill', 'blue');
    const words = el(doc, 'span', 'ps-morph__words');
    const meta = el(doc, 'span', 'ps-morph__meta');
    const title = el(doc, 'span', 'ps-morph__title');
    const clash = el(doc, 'span', 'ps-morph__tag ps-morph__clash-tag', 'Clashes');
    words.append(meta, title, clash);
    pill.append(words);
    frame!.pills.append(pill);
    const tab = el(doc, 'button', 'ps-morph__tab');
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', 'false');
    tab.setAttribute('data-for', node.id);
    const tabTitle = el(doc, 'span', 'ps-morph__tab-title');
    const tabClash = el(doc, 'span', 'ps-morph__tag ps-morph__clash-tag', 'Clashes');
    tab.append(tabTitle, tabClash);
    tab.addEventListener('click', () => {
      picked = true;
      select(node.id);
    });
    // Arrow keys move along the tabs (roving focus), as a tab list should.
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      const all = scenarioOrder.map((s) => scenarios.get(s.id)!.tab);
      const next = all[(all.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
      event.preventDefault();
      next.click();
      next.focus();
    });
    frame!.tabs.append(tab);
    const out: Scenario = { node, pill, meta, title, words, clash, card: card(node, 'blue', detailsId, pill), tab, tabTitle, tabClash };
    scenarios.set(node.id, out);
    return out;
  }

  function removeScenario(id: string): void {
    const s = scenarios.get(id);
    if (!s) return;
    drop(s.card);
    s.pill.remove();
    s.tab.remove();
    scenarios.delete(id);
    if (selected === id) {
      selected = null;
      picked = false;
    }
  }

  // ---------------------------------------------------------------- contradictions

  function ensureClashes(): HTMLDivElement {
    if (clashes) return clashes;
    clashes = el(doc, 'div', 'ps-morph__clashes');
    clashes.setAttribute('role', 'group');
    clashes.setAttribute('aria-label', 'Pairs that cannot go together');
    return clashes;
  }

  function flag(pair: string[], on: boolean): void {
    for (const id of pair) cells.get(id)?.item.classList.toggle('is-flagged', on);
  }

  function addChip(node: PsNode): Clash {
    const detailsId = nextId('ps-morph-details');
    const chip = shapeButton('ps-morph__chip', detailsId);
    chip.setAttribute('data-node', node.id);
    chip.setAttribute('data-shape', '');
    chip.setAttribute('data-fill', 'card');
    const mark = el(doc, 'span', 'ps-morph__chip-mark');
    mark.setAttribute('aria-hidden', 'true');
    const words = el(doc, 'span', 'ps-morph__words');
    const text = el(doc, 'span', 'ps-morph__title ps-morph__chip-text');
    words.append(text);
    chip.append(mark, words);
    const out: Clash = { node, chip, text, words, card: card(node, 'red', detailsId, chip), pair: [] };
    // Hovering or focusing the chip outlines both of its cells.
    const on = (): void => flag(out.pair, true);
    const off = (): void => flag(out.pair, false);
    chip.addEventListener('mouseenter', on);
    chip.addEventListener('mouseleave', off);
    chip.addEventListener('focus', on);
    chip.addEventListener('blur', off);
    chips.set(node.id, out);
    return out;
  }

  function removeChip(id: string): void {
    const c = chips.get(id);
    if (!c) return;
    flag(c.pair, false);
    drop(c.card);
    c.chip.remove();
    chips.delete(id);
  }

  // ---------------------------------------------------------------- key (phone)

  /** Key items forward to the shape's button, so one card and one disclosure serve both. */
  function syncKeyState(): void {
    for (const [id, row] of keyRows) setAttr(row.el, 'aria-expanded', cells.get(id)?.button.getAttribute('aria-expanded') ?? 'false');
    for (const [id, g] of keyGroups) setAttr(g.head, 'aria-expanded', columns.get(id)?.head.getAttribute('aria-expanded') ?? 'false');
  }

  function keyButton(className: string, controls: string, target: () => HTMLButtonElement | undefined): { el: HTMLButtonElement; code: HTMLSpanElement; title: HTMLSpanElement } {
    const button = el(doc, 'button', className);
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', controls);
    const code = el(doc, 'span', 'ps-morph__key-code');
    const title = el(doc, 'span', 'ps-morph__key-title');
    button.append(code, title);
    button.addEventListener('click', () => target()?.click());
    return { el: button, code, title };
  }

  function syncKey(attrsBySubject: Map<string, PsNode[]>): void {
    const key = frame!.key;
    subjectOrder.forEach((subject, i) => {
      let g = keyGroups.get(subject.id);
      if (!g) {
        const box = el(doc, 'div', 'ps-morph__key-group');
        box.setAttribute('data-for', subject.id);
        const head = keyButton('ps-morph__key-head', columns.get(subject.id)!.head.getAttribute('aria-controls')!, () => columns.get(subject.id)?.head);
        const list = el(doc, 'div', 'ps-morph__key-rows');
        box.append(head.el, list);
        g = { el: box, head: head.el, code: head.code, title: head.title, list };
        keyGroups.set(subject.id, g);
      }
      if (key.children[i] !== g.el) key.insertBefore(g.el, key.children[i] ?? null);
      setText(g.code, `S${i + 1}`);
      setText(g.title, nodeTitle(subject));
      setAttr(g.head, 'aria-label', `S${i + 1}, subject: ${nodeTitle(subject)}${contested(subject)}. Show details`);
      g.head.classList.toggle('is-contested', subject.state === 'contested');
      (attrsBySubject.get(subject.id) ?? []).forEach((attr, j) => {
        let row = keyRows.get(attr.id);
        if (!row) {
          const made = keyButton('ps-morph__key-row', cells.get(attr.id)!.button.getAttribute('aria-controls')!, () => cells.get(attr.id)?.button);
          made.el.setAttribute('data-for', attr.id);
          row = made;
          keyRows.set(attr.id, row);
        }
        if (g!.list.children[j] !== row.el) g!.list.insertBefore(row.el, g!.list.children[j] ?? null);
        const code = `S${i + 1}·${j + 1}`;
        setText(row.code, code);
        setText(row.title, nodeTitle(attr));
        setAttr(row.el, 'aria-label', `${code}: ${nodeTitle(attr)}${contested(attr)}. Show details`);
        row.el.classList.toggle('is-contested', attr.state === 'contested');
      });
    });
    syncKeyState();
  }

  // ---------------------------------------------------------------- the scenario line

  function ensureLine(): void {
    if (!frame || frame.line) return;
    const line = doc.createElementNS(SVG, 'polyline') as SVGPolylineElement;
    line.setAttribute('class', 'ps-morph__line');
    line.setAttribute('data-scenario-line', '');
    frame.overlay.append(line);
    frame.line = line;
  }

  function dropLine(): void {
    if (!frame) return;
    if (frame.line) cancelAnimations(frame.overlay);
    frame.line?.remove();
    frame.marker?.remove();
    frame.line = null;
    frame.marker = null;
    lineKey = '';
  }

  /** The picked cells left to right, and the first clashing pair among them (if any). */
  function scenarioState(): { picks: Cell[]; clash: [Cell, Cell] | null; ok: boolean } {
    if (!lastRun || !selected) return { picks: [], clash: null, ok: true };
    const chosen = new Set(picksOf(lastRun, selected) as string[]);
    const picks = subjectOrder.map((s) => [...cells.values()].find((c) => c.subject === s.id && chosen.has(c.node.id))).filter((c): c is Cell => Boolean(c));
    const pair = (contradictionPairs(lastRun) as string[][]).find(([a, b]) => chosen.has(a) && chosen.has(b));
    const clash = pair && cells.get(pair[0]) && cells.get(pair[1]) ? ([cells.get(pair[0])!, cells.get(pair[1])!] as [Cell, Cell]) : null;
    return { picks, clash, ok: consistent(lastRun, selected) as boolean };
  }

  /** Measure the ovals (all reads first), then write the line and the clash cross. */
  function drawLine(): void {
    if (!frame || !frame.line) return;
    const { picks, clash, ok } = scenarioState();
    // Reads.
    const box = frame.chart.getBoundingClientRect();
    const centre = (cell: Cell): [number, number] => {
      const r = cell.oval.getBoundingClientRect();
      return [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top];
    };
    const points = picks.map(centre);
    const cross = clash ? [centre(clash[0]), centre(clash[1])] : null;
    // Writes.
    const view = `0 0 ${Math.max(box.width, 1).toFixed(1)} ${Math.max(box.height, 1).toFixed(1)}`;
    setAttr(frame.overlay, 'viewBox', view);
    setAttr(frame.line, 'points', points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '));
    setAttr(frame.line, 'data-consistent', String(ok));
    if (ok) setAttr(frame.line, 'pathLength', '1');
    else frame.line.removeAttribute('pathLength');
    if (cross) {
      if (!frame.marker) {
        const marker = doc.createElementNS(SVG, 'g') as SVGGElement;
        marker.setAttribute('class', 'ps-morph__cross');
        marker.setAttribute('data-clash-marker', '');
        const ring = doc.createElementNS(SVG, 'circle');
        ring.setAttribute('r', '10');
        const x = doc.createElementNS(SVG, 'path');
        x.setAttribute('d', 'M-4.5 -4.5 L4.5 4.5 M4.5 -4.5 L-4.5 4.5');
        marker.append(ring, x);
        frame.overlay.append(marker);
        frame.marker = marker;
      }
      const mx = (cross[0][0] + cross[1][0]) / 2;
      const my = (cross[0][1] + cross[1][1]) / 2;
      setAttr(frame.marker, 'transform', `translate(${mx.toFixed(1)} ${my.toFixed(1)})`);
    } else if (frame.marker) {
      frame.marker.remove();
      frame.marker = null;
    }
  }

  /** Draw the line in, left to right, when the scenario it shows has changed (never at rest). */
  function animateLine(): void {
    if (!frame?.line) return;
    const { picks, ok } = scenarioState();
    const key = `${selected}|${picks.map((c) => c.node.id).join()}|${ok}`;
    if (key === lineKey) return;
    lineKey = key;
    if (!painted || !canAnimate(frame.line as unknown as Element)) return;
    cancelAnimations(frame.overlay);
    const line = frame.line as unknown as HTMLElement;
    if (ok) line.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: LINE_MS, easing: EASE, fill: 'backwards' });
    else line.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: EASE, fill: 'backwards' });
    if (frame.marker && canAnimate(frame.marker as unknown as Element)) {
      (frame.marker as unknown as HTMLElement).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 220, easing: EASE, fill: 'backwards' });
    }
  }

  // ---------------------------------------------------------------- selection and layout

  function place(): void {
    if (!frame || !lastRun) return;
    const chosen = selected ? new Set(picksOf(lastRun, selected) as string[]) : new Set<string>();
    for (const cell of cells.values()) {
      const on = chosen.has(cell.node.id);
      cell.item.classList.toggle('is-picked', on);
      setAttr(cell.oval, 'data-fill', on ? 'blue' : 'yellow');
    }
    for (const s of scenarioOrder) {
      const sc = scenarios.get(s.id)!;
      const on = s.id === selected;
      sc.pill.hidden = !on;
      setAttr(sc.tab, 'aria-selected', String(on));
      sc.tab.tabIndex = on ? 0 : -1;
    }
    frame.tabs.hidden = scenarioOrder.length < 2;
    frame.bar.hidden = !scenarioOrder.length;
    if (scenarioOrder.length) ensureLine();
    else dropLine();
    // A card never stays open for a scenario that is no longer showing.
    for (const sc of scenarios.values()) if (sc.pill.hidden && sc.card.classList.contains('is-open')) group.close();
    drawLine();
    animateLine();
  }

  function select(id: string): void {
    if (destroyed || selected === id) return;
    selected = id;
    group.close();
    syncKeyState();
    place();
  }

  function setCompact(next: boolean): void {
    if (next === compact) return;
    compact = next;
    root.setAttribute('data-compact', String(compact));
    if (frame) frame.key.hidden = !compact || !subjectOrder.length;
    drawLine();
  }

  // Container width decides codes and key (phone) or names in the cells; size changes move the line.
  const observer =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          if (destroyed) return;
          if (widthOverride === null) {
            const w = root.getBoundingClientRect().width;
            if (w && Math.abs(w - width) >= 0.5) {
              width = w;
              setCompact(w <= COMPACT_MAX);
            }
          }
          drawLine();
        })
      : null;
  observer?.observe(root);

  // Key items mirror their shape's open state, whatever opened or closed it.
  root.addEventListener('click', syncKeyState);
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') syncKeyState();
  });

  // ---------------------------------------------------------------- update

  function teardown(): void {
    for (const c of columns.values()) group.unregister(c.card);
    for (const c of cells.values()) group.unregister(c.card);
    for (const s of scenarios.values()) group.unregister(s.card);
    for (const c of chips.values()) group.unregister(c.card);
    if (problem) group.unregister(problem.item);
    if (evaluation) group.unregister(evaluation.item);
    choice.reset();
    cancelAnimations(root);
    if (frame) observer?.unobserve(frame.chart);
    root.replaceChildren();
    panel.replaceChildren();
    after.replaceChildren();
    columns.clear();
    cells.clear();
    scenarios.clear();
    chips.clear();
    keyGroups.clear();
    keyRows.clear();
    problem = evaluation = null;
    frame = null;
    clashes = null;
    subjectOrder = [];
    scenarioOrder = [];
    selected = null;
    picked = false;
    lineKey = '';
  }

  function update(run: PsToolRun): void {
    if (destroyed) return;
    lastRun = run;
    if (!run.nodes.length) {
      if (root.children.length) teardown();
      painted = true;
      return;
    }
    const fresh: HTMLElement[] = [];
    const freshCells: HTMLElement[] = [];
    const subjects = (subjectsOf(run) as PsNode[]).slice().sort(bySlot);
    const subjectIds = new Set(subjects.map((s) => s.id));
    const attrsBySubject = new Map<string, PsNode[]>(subjects.map((s) => [s.id, attributesOf(run, s.id) as PsNode[]]));
    const attrSubject = new Map<string, string>();
    for (const [sid, attrs] of attrsBySubject) for (const a of attrs) attrSubject.set(a.id, sid);
    const scenarioNodes = named(run, 'scenario');
    const scenarioIds = new Set(scenarioNodes.map((s) => s.id));
    const contradictionNodes = named(run, 'contradiction');
    const contradictionIds = new Set(contradictionNodes.map((c) => c.id));

    // Drop what an undo took away, whole families at a time.
    for (const id of [...cells.keys()]) if (attrSubject.get(id) !== cells.get(id)!.subject) removeCell(id);
    for (const id of [...columns.keys()]) if (!subjectIds.has(id)) removeColumn(id);
    for (const id of [...scenarios.keys()]) if (!scenarioIds.has(id)) removeScenario(id);
    for (const id of [...chips.keys()]) if (!contradictionIds.has(id)) removeChip(id);

    problem = syncComposed(problem, named(run, 'problem')[0], 'problem', null, fresh);

    // The grid comes with the first subject, and goes with the last.
    if (subjects.length) ensureFrame(fresh);
    else if (frame) {
      observer?.unobserve(frame.chart);
      frame = null;
    }
    subjectOrder = subjects;
    if (frame) {
      const rows = Math.max(1, ...subjects.map((s) => attrsBySubject.get(s.id)!.length));
      frame.grid.style.gridTemplateColumns = `repeat(${subjects.length}, minmax(0, 1fr))`;
      frame.grid.style.gridTemplateRows = `auto repeat(${rows}, minmax(var(--ps-morph-row), auto))`;
      subjects.forEach((subject, i) => {
        let col = columns.get(subject.id);
        if (!col) {
          col = addColumn(subject);
          if (!fresh.includes(frame!.chart)) fresh.push(col.head);
        }
        col.node = subject;
        if (frame!.grid.children[i] !== col.item) frame!.grid.insertBefore(col.item, frame!.grid.children[i] ?? null);
        setAttr(col.item, 'data-subject', String(i + 1));
        setAttr(col.item, 'aria-label', `Subject ${i + 1}: ${nodeTitle(subject)}`);
        col.item.style.gridRow = `1 / span ${rows + 1}`;
        setText(col.code, `S${i + 1}`);
        setText(col.title, nodeTitle(subject));
        setAttr(col.head, 'aria-label', `Subject ${i + 1}: ${nodeTitle(subject)}${contested(subject)}. Show details`);
        syncContested(col.head, subject, col.words, col.head);
        // Attribute cells, top to bottom in edge order, then empty striped cells to the foot.
        const attrs = attrsBySubject.get(subject.id)!;
        attrs.forEach((attr, j) => {
          let cell = cells.get(attr.id);
          if (!cell) {
            cell = addCell(attr, subject.id);
            freshCells.push(cell.item);
          }
          cell.node = attr;
          const at = col!.item.children[1 + j];
          if (at !== cell.item) col!.item.insertBefore(cell.item, at ?? null);
          setAttr(cell.item, 'data-attribute', String(j + 1));
          setAttr(cell.item, 'data-line', String(j + 1));
          const code = `S${i + 1}·${j + 1}`;
          setText(cell.code, code);
          setText(cell.title, nodeTitle(attr));
          setAttr(cell.button, 'aria-label', `${code}, ${nodeTitle(subject)}: ${nodeTitle(attr)}${contested(attr)}. Show details`);
          syncContested(cell.item, attr, cell.oval, cell.button);
        });
        const want = rows - attrs.length;
        while (col.fillers.length > want) col.fillers.pop()!.remove();
        while (col.fillers.length < want) {
          const filler = el(doc, 'div', 'ps-morph__filler');
          filler.setAttribute('aria-hidden', 'true');
          col.fillers.push(filler);
        }
        col.fillers.forEach((filler, k) => {
          setAttr(filler, 'data-line', String(attrs.length + k + 1));
          if (col!.item.children[1 + attrs.length + k] !== filler) col!.item.insertBefore(filler, col!.item.children[1 + attrs.length + k] ?? null);
        });
      });
    }

    // Scenarios: a pill (the shape, with details) and a tab each.
    scenarioOrder = frame ? scenarioNodes : [];
    if (frame) {
      scenarioNodes.forEach((node, j) => {
        let sc = scenarios.get(node.id);
        if (!sc) sc = addScenario(node);
        sc.node = node;
        if (frame!.pills.children[j] !== sc.pill) frame!.pills.insertBefore(sc.pill, frame!.pills.children[j] ?? null);
        if (frame!.tabs.children[j] !== sc.tab) frame!.tabs.insertBefore(sc.tab, frame!.tabs.children[j] ?? null);
        const ok = consistent(run, node.id) as boolean;
        setText(sc.meta, `Scenario ${j + 1}`);
        setText(sc.title, nodeTitle(node));
        setText(sc.tabTitle, `Scenario ${j + 1}`);
        sc.clash.hidden = ok;
        sc.tabClash.hidden = ok;
        setAttr(sc.tab, 'data-consistent', String(ok));
        setAttr(sc.tab, 'aria-label', `Scenario ${j + 1}${ok ? '' : ', clashes'}`);
        setAttr(sc.pill, 'aria-label', `Scenario ${j + 1}: ${nodeTitle(node)}${ok ? '' : ', clashes'}${contested(node)}. Show details`);
        syncContested(sc.pill, node, sc.words, sc.pill);
      });
    } else for (const id of [...scenarios.keys()]) removeScenario(id);
    // Which scenario shows: the person's pick, else the newest.
    if (scenarioOrder.length) {
      if (!selected || !scenarioIds.has(selected) || !picked) selected = scenarioOrder[scenarioOrder.length - 1].id;
    } else selected = null;

    // Contradictions: chips under the grid, and a notch on both cells.
    const pairs = new Map<string, string[]>();
    for (const c of contradictionNodes) {
      const ids = run.edges.filter((e) => e.kind === 'pair' && e.from === c.id).map((e) => e.to);
      pairs.set(c.id, ids);
    }
    const freshChips: HTMLElement[] = [];
    if (contradictionNodes.length) ensureClashes();
    contradictionNodes.forEach((node, k) => {
      let chip = chips.get(node.id);
      if (!chip) {
        chip = addChip(node);
        freshChips.push(chip.chip);
      }
      chip.node = node;
      const pair = pairs.get(node.id)!;
      if (chip.pair.join() !== pair.join()) {
        flag(chip.pair, false);
        chip.pair = pair;
      }
      if (clashes!.children[k] !== chip.chip) clashes!.insertBefore(chip.chip, clashes!.children[k] ?? null);
      const names = pair.map((id) => run.nodes.find((n) => n.id === id)).map((n) => (n ? nodeTitle(n) : '?'));
      const words = `${names[0] ?? '?'} cannot go with ${names[1] ?? '?'}`;
      setText(chip.text, words);
      setAttr(chip.chip, 'aria-label', `Contradiction: ${words}${contested(node)}. Show details`);
      syncContested(chip.chip, node, chip.words, chip.chip);
    });
    if (clashes && !contradictionNodes.length) {
      clashes.remove();
      clashes = null;
    }
    // Notches: one small mark per contradiction on each of its cells.
    const wantNotch = new Map<string, Set<string>>();
    for (const [cid, ids] of pairs) for (const id of ids) if (cells.has(id)) wantNotch.set(id, (wantNotch.get(id) ?? new Set()).add(cid));
    for (const cell of cells.values()) {
      const want = wantNotch.get(cell.node.id) ?? new Set<string>();
      for (const notch of [...cell.item.children].filter((child) => child.classList.contains('ps-morph__notch'))) {
        const id = notch.getAttribute('data-for')!;
        if (!want.has(id)) notch.remove();
        else want.delete(id);
      }
      for (const id of want) {
        const notch = el(doc, 'span', 'ps-morph__notch');
        notch.setAttribute('data-for', id);
        notch.setAttribute('aria-hidden', 'true');
        cell.item.append(notch);
      }
      cell.item.classList.toggle('has-clash', wantNotch.has(cell.node.id));
    }

    evaluation = syncComposed(evaluation, named(run, 'evaluation')[0], 'evaluation', after, fresh);
    choice.sync(run, after, painted);
    if (frame) {
      frame.key.hidden = !compact || !subjectOrder.length;
      syncKey(attrsBySubject);
    }
    arrange();
    place();

    // Motion for what is new, never on the first paint of a saved run.
    if (painted) {
      for (const node of fresh) {
        if (frame && node === frame.chart) {
          // The header row sweeps in left to right, then the stripes fade in.
          [...node.querySelectorAll<HTMLElement>('.ps-morph__head')].forEach((head, i) => {
            if (canAnimate(head)) head.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 360, delay: i * 60, easing: EASE, fill: 'backwards' });
          });
          node.querySelectorAll('.ps-morph__filler').forEach((f, i) => fade(f, 120 + Math.min(i * 30, 240)));
        } else if (node.classList.contains('ps-morph__head')) {
          if (canAnimate(node)) node.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 360, easing: EASE, fill: 'backwards' });
        } else rise(node);
      }
      freshCells.forEach((cell, i) => fade(cell, Math.min(i * 50, 300)));
      freshChips.forEach((chip, i) => rise(chip, i * 60));
    }
    painted = true;
  }

  return {
    el: root,
    update,
    layout(px: number) {
      widthOverride = px;
      setCompact(px <= COMPACT_MAX);
    },
    /** Stop the size watch and any motion once the canvas drops this view. */
    destroy() {
      destroyed = true;
      observer?.disconnect();
      cancelAnimations(root);
    }
  };
}
