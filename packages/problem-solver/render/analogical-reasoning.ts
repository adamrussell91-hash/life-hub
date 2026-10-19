// packages/problem-solver/render/analogical-reasoning.ts
// Analogical reasoning (toolkit, Devise): a flow of fixed stations laid out as the book
// draws it. A red source box leads right to a yellow analogue box (the book's target, with
// a yellow Expand box above it and a two-way arrow), on to Match, down to Filter and down to
// a blue Solved? circle. Yes runs down to a blue Retain box; No runs left to Revise, up to
// Search and back up into the analogue.
// Each station lights (fills in its book colour) once its slot for the round on show is
// placed; until then it is a pale label, never a button. Revise and Search light when the
// round ended unsolved. Round tabs above the flow (from the second analogue) switch which
// round the stations show, defaulting to the newest. When the newest round newly ends
// unsolved, a small marker travels the No loop. Arrows are drawn in an SVG overlay from the
// stations' measured boxes. On a narrow panel the stations form one column with the loop
// in a second column on the right.
import type { Accent } from './details';
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { nodeTitle } from '../titles.mjs';
import { analogicalReasoning } from '../tools/analogical-reasoning.mjs';
import { EASE, canAnimate, contestedTag, createDisclosureGroup, detailsCard, nextId } from './details';

export type AnalogicalReasoningView = { el: HTMLDivElement; update(run: PsToolRun): void };

type Key = 'source' | 'expand' | 'analogue' | 'match' | 'filter' | 'solved' | 'revise' | 'search' | 'retain';
type Round = { index: number; target: PsNode; rules: PsNode[]; filtered: PsNode | null; assess: PsNode | null };
type Model = { source: PsNode | null; retain: PsNode | null; rounds: Round[]; next: Set<string> };

const SVG = 'http://www.w3.org/2000/svg';
/** Reading and tab order follows the flow: the chain, the loop, then the way out. */
const KEYS: Key[] = ['source', 'expand', 'analogue', 'match', 'filter', 'solved', 'revise', 'search', 'retain'];
/** meta: the small caps line on a lit station (the book's word); name: the label on an unlit one. */
const INFO: Record<Key, { meta: string; name: string; accent: Accent; label: string }> = {
  source: { meta: 'Source', name: 'Source', accent: 'red', label: 'Source problem' },
  expand: { meta: '', name: 'Expand', accent: 'yellow', label: 'Expand' },
  analogue: { meta: 'Target', name: 'Analogue', accent: 'yellow', label: 'Analogue (target)' },
  match: { meta: 'Match', name: 'Match', accent: 'yellow', label: 'Match rules' },
  filter: { meta: 'Filter', name: 'Filter', accent: 'yellow', label: 'Filter' },
  solved: { meta: 'Solved?', name: 'Solved?', accent: 'blue', label: 'Problem solved?' },
  revise: { meta: '', name: 'Revise', accent: 'yellow', label: 'Revise' },
  search: { meta: '', name: 'Search', accent: 'yellow', label: 'Search' },
  retain: { meta: 'Retain', name: 'Retain', accent: 'blue', label: 'Retain' }
};
/** What a screen reader hears for a station that is not lit, or lit without a node. */
const QUIET: Partial<Record<Key, string>> = {
  expand: 'set other analogies aside for later',
  revise: 'this round was not solved',
  search: 'look for another analogue'
};

type LinkSpec = { key: string; from: Key; to: Key; offset?: number; label?: 'Yes' | 'No' };
const LINKS: LinkSpec[] = [
  { key: 'source-analogue', from: 'source', to: 'analogue' },
  { key: 'expand-analogue', from: 'expand', to: 'analogue', offset: -7 },
  { key: 'analogue-expand', from: 'analogue', to: 'expand', offset: 7 },
  { key: 'analogue-match', from: 'analogue', to: 'match' },
  { key: 'match-filter', from: 'match', to: 'filter' },
  { key: 'filter-solved', from: 'filter', to: 'solved' },
  { key: 'solved-retain', from: 'solved', to: 'retain', label: 'Yes' },
  { key: 'solved-revise', from: 'solved', to: 'revise', label: 'No' },
  { key: 'revise-search', from: 'revise', to: 'search' },
  { key: 'search-analogue', from: 'search', to: 'analogue' }
];
const LOOP = ['solved-revise', 'revise-search', 'search-analogue'];
/** Gap between a shape and the arrow that leaves or reaches it, and the arrowhead's size. */
const GAP = 3;
const HEAD_LEN = 10;
const HEAD_HALF = 6;
const LOOP_MS = 900;

type Pt = [number, number];
type Box = { l: number; t: number; r: number; b: number; cx: number; cy: number; w: number };

function span(doc: Document, className: string, value = ''): HTMLSpanElement {
  const el = doc.createElement('span');
  el.className = className;
  if (value) el.textContent = value;
  return el;
}

function svgEl<K extends keyof SVGElementTagNameMap>(doc: Document, tag: K): SVGElementTagNameMap[K] {
  return doc.createElementNS(SVG, tag) as SVGElementTagNameMap[K];
}

/** Rounds in order. Rules belong to the round of the analogue placed most recently before them. */
function readModel(run: PsToolRun): Model {
  let source: PsNode | null = null;
  let retain: PsNode | null = null;
  const byIndex = new Map<number, Round>();
  let current: Round | null = null;
  for (const node of run.nodes) {
    const slot = parseSlot(node.slot);
    if (!slot) continue;
    if (slot.name === 'source') source ??= node;
    else if (slot.name === 'retain') retain ??= node;
    else if (slot.name === 'target' && slot.index && !byIndex.has(slot.index)) {
      current = { index: slot.index, target: node, rules: [], filtered: null, assess: null };
      byIndex.set(slot.index, current);
    } else if (slot.name === 'rule' && current) current.rules.push(node);
    else if ((slot.name === 'filtered' || slot.name === 'assess') && slot.index) {
      const round = byIndex.get(slot.index);
      if (round && !round[slot.name]) round[slot.name] = node;
    }
  }
  const rounds = [...byIndex.values()].sort((a, b) => a.index - b.index);
  return { source, retain, rounds, next: new Set(analogicalReasoning.nextSlots(run) as string[]) };
}

/** A straight arrow between shapes that share a column or a row, else one elbow. */
function route(a: Box, b: Box, offset = 0): Pt[] {
  const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
  const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
  if (ox > 8) {
    const x = (Math.max(a.l, b.l) + Math.min(a.r, b.r)) / 2 + offset;
    return b.t >= a.b ? [[x, a.b + GAP], [x, b.t - GAP]] : [[x, a.t - GAP], [x, b.b + GAP]];
  }
  if (oy > 8) {
    const y = (Math.max(a.t, b.t) + Math.min(a.b, b.b)) / 2 + offset;
    return b.l >= a.r ? [[a.r + GAP, y], [b.l - GAP, y]] : [[a.l - GAP, y], [b.r + GAP, y]];
  }
  const startY = b.cy < a.t ? a.t - GAP : a.b + GAP;
  const endX = b.cx < a.l ? b.r + GAP : b.l - GAP;
  return [[a.cx, startY], [a.cx, b.cy], [endX, b.cy]];
}

/** The line stops short of the tip so its end hides under the head. */
function shapes(points: Pt[]): { line: string; head: string } {
  const [tx, ty] = points[points.length - 1];
  const [px, py] = points[points.length - 2];
  const len = Math.hypot(tx - px, ty - py) || 1;
  const dx = (tx - px) / len;
  const dy = (ty - py) / len;
  const bx = tx - dx * HEAD_LEN;
  const by = ty - dy * HEAD_LEN;
  const line = points.slice(0, -1).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ') + ` L${(tx - dx * (HEAD_LEN - 1)).toFixed(1)} ${(ty - dy * (HEAD_LEN - 1)).toFixed(1)}`;
  const head = `M${tx.toFixed(1)} ${ty.toFixed(1)} L${(bx - dy * HEAD_HALF).toFixed(1)} ${(by + dx * HEAD_HALF).toFixed(1)} L${(bx + dy * HEAD_HALF).toFixed(1)} ${(by - dx * HEAD_HALF).toFixed(1)} Z`;
  return { line, head };
}

type Station = {
  key: Key;
  item: HTMLDivElement;
  shape: HTMLSpanElement;
  meta: HTMLSpanElement;
  title: HTMLSpanElement;
  quiet: HTMLSpanElement;
  button: HTMLButtonElement | null;
  details: HTMLDivElement | null;
  inner: HTMLDivElement | null;
  count: HTMLSpanElement | null;
  glyph: HTMLSpanElement | null;
  tag: HTMLSpanElement | null;
  nodes: PsNode[];
  lit: boolean;
};
type Link = { spec: LinkSpec; g: SVGGElement; line: SVGPathElement; head: SVGPathElement; text: SVGTextElement | null; lit: boolean; points: Pt[]; anims: Animation[] };

export function createAnalogicalReasoningView(doc: Document = document): AnalogicalReasoningView {
  const root = doc.createElement('div');
  root.className = 'ps-analogy';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', 'Analogical reasoning');

  const group = createDisclosureGroup();
  const stations = new Map<Key, Station>();
  const links = new Map<string, Link>();
  /** One details card per node, made once and moved in and out of its station's panel. */
  const cards = new Map<string, HTMLElement>();
  const tabs: HTMLButtonElement[] = [];
  let tablist: HTMLDivElement | null = null;
  let chart: HTMLDivElement | null = null;
  let overlay: SVGSVGElement | null = null;
  let marker: HTMLSpanElement | null = null;
  let markerAnims: Animation[] = [];
  let panel: HTMLDivElement | null = null;
  let model: Model = { source: null, retain: null, rounds: [], next: new Set() };
  /** The round the reader picked, or null to follow the newest. */
  let picked: number | null = null;

  function ensureChart(): HTMLDivElement {
    if (chart) return chart;
    chart = doc.createElement('div');
    chart.className = 'ps-analogy__chart';
    chart.setAttribute('data-region', 'flow');
    overlay = svgEl(doc, 'svg');
    overlay.setAttribute('class', 'ps-analogy__links');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('focusable', 'false');
    chart.append(overlay);
    for (const key of KEYS) addStation(key);
    for (const spec of LINKS) addLink(spec);
    marker = span(doc, 'ps-analogy__marker');
    marker.setAttribute('aria-hidden', 'true');
    chart.append(marker);
    panel = doc.createElement('div');
    panel.className = 'ps-analogy__panel';
    root.append(chart, panel);
    if (canAnimate(chart)) chart.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, easing: EASE, fill: 'backwards' });
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => layout()).observe(chart);
    return chart;
  }

  function addStation(key: Key): void {
    const item = doc.createElement('div');
    item.className = `ps-analogy__station ps-analogy__station--${key} is-${INFO[key].accent}`;
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-station', key);
    const shape = span(doc, 'ps-analogy__shape');
    const words = span(doc, 'ps-analogy__words');
    const meta = span(doc, 'ps-analogy__meta');
    const title = span(doc, 'ps-analogy__title');
    const quiet = span(doc, 'ps-analogy__sr');
    words.append(meta, title, quiet);
    shape.append(words);
    item.append(shape);
    chart!.append(item);
    stations.set(key, { key, item, shape, meta, title, quiet, button: null, details: null, inner: null, count: null, glyph: null, tag: null, nodes: [], lit: false });
  }

  function addLink(spec: LinkSpec): void {
    const g = svgEl(doc, 'g');
    g.setAttribute('class', 'ps-analogy__link');
    g.setAttribute('data-link', spec.key);
    const line = svgEl(doc, 'path');
    line.setAttribute('class', 'ps-analogy__line');
    line.setAttribute('pathLength', '1');
    const head = svgEl(doc, 'path');
    head.setAttribute('class', 'ps-analogy__head');
    g.append(line, head);
    let text: SVGTextElement | null = null;
    if (spec.label) {
      text = svgEl(doc, 'text');
      text.setAttribute('class', 'ps-analogy__answer');
      text.textContent = spec.label;
      g.append(text);
    }
    overlay!.append(g);
    links.set(spec.key, { spec, g, line, head, text, lit: false, points: [], anims: [] });
  }

  /** The station becomes a button the first time it holds a node; it goes back to a plain label when it holds none. */
  function setInteractive(st: Station, on: boolean): void {
    if (on) {
      if (!st.button) {
        const id = nextId('ps-analogy-details');
        st.button = doc.createElement('button');
        st.button.type = 'button';
        st.button.className = 'ps-analogy__button';
        st.button.setAttribute('aria-expanded', 'false');
        st.button.setAttribute('aria-controls', id);
        st.details = doc.createElement('div');
        st.details.className = 'ps-details';
        st.details.id = id;
        st.details.setAttribute('data-for', st.key);
        st.inner = doc.createElement('div');
        st.inner.className = 'ps-details__inner';
        st.details.append(st.inner);
        group.register(st.item, st.button);
        st.button.addEventListener('click', syncOpen);
      }
      if (st.button.parentNode !== st.item) {
        st.button.append(st.shape);
        st.item.prepend(st.button);
        panel!.append(st.details!);
      }
    } else if (st.button?.parentNode === st.item) {
      st.item.classList.remove('is-open');
      st.button.setAttribute('aria-expanded', 'false');
      st.item.prepend(st.shape);
      st.button.remove();
      st.details!.classList.remove('is-open');
      st.details!.remove();
    }
  }

  function syncOpen(): void {
    for (const st of stations.values()) st.details?.classList.toggle('is-open', st.item.classList.contains('is-open'));
  }

  function cardFor(node: PsNode, st: Station): HTMLElement {
    let card = cards.get(node.id);
    if (!card) {
      card = detailsCard(doc, node, INFO[st.key].accent, '').querySelector<HTMLElement>('.ps-details__card')!;
      card.setAttribute('data-for', node.id);
      if (st.key === 'match') {
        const head = doc.createElement('p');
        head.className = 'ps-analogy__rule-title';
        head.textContent = nodeTitle(node);
        card.prepend(head);
      }
      cards.set(node.id, card);
    }
    return card;
  }

  const newest = (): Round | null => model.rounds[model.rounds.length - 1] ?? null;
  function shown(): Round | null {
    if (picked !== null) return model.rounds.find((round) => round.index === picked) ?? newest();
    return newest();
  }

  /** The nodes a station holds for a round, and whether it is lit. */
  function stateOf(key: Key, round: Round | null): { nodes: PsNode[]; lit: boolean } {
    const one = (node: PsNode | null | undefined) => (node ? [node] : []);
    let nodes: PsNode[] = [];
    switch (key) {
      case 'source': nodes = one(model.source); break;
      case 'analogue': nodes = one(round?.target); break;
      case 'match': nodes = round?.rules ?? []; break;
      case 'filter': nodes = one(round?.filtered); break;
      case 'solved': nodes = one(round?.assess); break;
      case 'retain': nodes = round && round === newest() ? one(model.retain) : []; break;
      case 'revise':
      case 'search': {
        // The No loop: this round ended unsolved and another round follows or may follow.
        const after = round ? `target:${round.index + 1}` : '';
        const unsolved = round?.assess?.tag === 'unsolved' && (model.rounds.some((r) => r.index === round.index + 1) || model.next.has(after));
        return { nodes: [], lit: Boolean(unsolved) };
      }
      default: break;
    }
    return { nodes, lit: nodes.length > 0 };
  }

  function contestedNode(nodes: PsNode[]): PsNode | null {
    return nodes.find((node) => node.state === 'contested') ?? null;
  }

  function buttonLabel(st: Station, round: Round | null): string {
    const head = INFO[st.key].label;
    const where = st.key === 'source' || st.key === 'retain' || !round ? '' : `, round ${round.index}`;
    const contested = contestedNode(st.nodes) ? ', contested' : '';
    if (st.key === 'match') {
      const count = st.nodes.length;
      return `${head}${where}: ${count} ${count === 1 ? 'rule' : 'rules'}, latest ${nodeTitle(st.nodes[count - 1])}${contested}. Show details`;
    }
    const node = st.nodes[0];
    const result = st.key === 'solved' ? (node.tag === 'solved' ? 'solved, ' : node.tag === 'unsolved' ? 'not solved, ' : '') : '';
    return `${head}${where}: ${result}${nodeTitle(node)}${contested}. Show details`;
  }

  /** Paint a station for the round on show. Returns whether it newly lit or changed what it shows. */
  function paint(st: Station, round: Round | null): { lit: boolean; changed: boolean; grew: boolean } {
    const { nodes, lit } = stateOf(st.key, round);
    const before = st.nodes.map((n) => n.id).join(' ');
    const ids = nodes.map((n) => n.id).join(' ');
    const wasLit = st.lit;
    const grew = st.key === 'match' && nodes.length > st.nodes.length && before !== '' && ids.startsWith(before);
    st.nodes = nodes;
    st.lit = lit;
    st.item.classList.toggle('is-lit', lit);
    if (ids) st.item.setAttribute('data-node', ids);
    else st.item.removeAttribute('data-node');

    const primary = st.key === 'match' ? nodes[nodes.length - 1] : nodes[0];
    const meta = primary ? INFO[st.key].meta : st.key === 'analogue' ? INFO.analogue.meta : '';
    if (st.meta.textContent !== meta) st.meta.textContent = meta;
    st.meta.hidden = !meta;
    const title = primary ? nodeTitle(primary) : INFO[st.key].name;
    if (st.title.textContent !== title) st.title.textContent = title;
    st.item.classList.toggle('has-node', Boolean(primary));
    const quiet = primary ? '' : lit ? `, ${QUIET[st.key] ?? 'done'}` : st.key === 'expand' ? `, ${QUIET.expand}` : ', not reached yet';
    if (st.quiet.textContent !== quiet) st.quiet.textContent = quiet;

    // Match counts its rules; Solved? shows a tick or a cross by the assessment's tag.
    if (st.key === 'match') {
      if (nodes.length && !st.count) {
        st.count = span(doc, 'ps-analogy__count');
        st.count.setAttribute('aria-hidden', 'true');
        st.shape.append(st.count);
      }
      if (st.count) {
        st.count.hidden = !nodes.length;
        if (st.count.textContent !== String(nodes.length)) st.count.textContent = String(nodes.length);
      }
    }
    if (st.key === 'solved') {
      const result = primary?.tag === 'solved' || primary?.tag === 'unsolved' ? primary.tag : null;
      if (result) st.item.setAttribute('data-result', result);
      else st.item.removeAttribute('data-result');
      if (result && !st.glyph) {
        st.glyph = span(doc, 'ps-analogy__glyph');
        st.glyph.setAttribute('aria-hidden', 'true');
        st.title.before(st.glyph);
      }
      if (st.glyph) {
        st.glyph.hidden = !result;
        const mark = result === 'solved' ? '✓' : result === 'unsolved' ? '✕' : '';
        if (st.glyph.textContent !== mark) st.glyph.textContent = mark;
      }
    }

    const contested = contestedNode(nodes);
    st.item.classList.toggle('is-contested', Boolean(contested));
    if (contested) {
      if (!st.tag) st.tag = contestedTag(doc, contested);
      st.tag.title = contested.objection ?? '';
      if (st.tag.parentNode !== st.title.parentNode) st.quiet.before(st.tag);
    } else st.tag?.remove();

    setInteractive(st, nodes.length > 0);
    if (st.button && nodes.length) {
      st.button.setAttribute('aria-label', buttonLabel(st, round));
      const wanted = nodes.map((node) => cardFor(node, st));
      const have = [...st.inner!.children];
      if (wanted.length !== have.length || wanted.some((card, i) => card !== have[i])) st.inner!.replaceChildren(...wanted);
    }
    return { lit: lit && !wasLit, changed: before !== ids, grew };
  }

  function syncTabs(): void {
    const focused = tablist?.contains(doc.activeElement) ?? false;
    if (model.rounds.length < 2) {
      // Back to one round (an undo): the tabs go, and focus with them, to the flow's first button.
      tablist?.remove();
      tablist = null;
      tabs.length = 0;
      if (focused) stations.get('source')?.button?.focus();
      return;
    }
    // Drop the tabs of rounds that have gone, so arrow keys never land on a stale one.
    let lostFocus = false;
    for (let i = tabs.length - 1; i >= 0; i -= 1) {
      if (model.rounds.some((round) => round.index === Number(tabs[i].dataset.round))) continue;
      if (tabs[i] === doc.activeElement) lostFocus = true;
      tabs[i].remove();
      tabs.splice(i, 1);
    }
    if (!tablist) {
      tablist = doc.createElement('div');
      tablist.className = 'ps-analogy__tabs';
      tablist.setAttribute('role', 'tablist');
      tablist.setAttribute('aria-label', 'Rounds');
      tablist.addEventListener('keydown', onTabKey);
      root.insertBefore(tablist, chart);
      if (canAnimate(tablist)) tablist.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EASE, fill: 'backwards' });
    }
    for (const round of model.rounds) {
      let tab = tabs.find((t) => Number(t.dataset.round) === round.index);
      if (!tab) {
        tab = doc.createElement('button');
        tab.type = 'button';
        tab.className = 'ps-analogy__tab';
        tab.setAttribute('role', 'tab');
        tab.dataset.round = String(round.index);
        tab.append(span(doc, 'ps-analogy__tab-name', `Round ${round.index}`), span(doc, 'ps-analogy__tab-mark'));
        tab.lastElementChild!.setAttribute('aria-hidden', 'true');
        const index = round.index;
        tab.addEventListener('click', () => pick(index));
        tabs.push(tab);
        tabs.sort((a, b) => Number(a.dataset.round) - Number(b.dataset.round));
        tablist.insertBefore(tab, tabs[tabs.indexOf(tab) + 1] ?? null);
      }
      const tag = round.assess?.tag;
      const mark = tag === 'solved' ? '✓' : tag === 'unsolved' ? '✕' : '';
      const markEl = tab.lastElementChild as HTMLElement;
      if (markEl.textContent !== mark) markEl.textContent = mark;
      tab.setAttribute('aria-label', `Round ${round.index}${tag === 'solved' ? ', solved' : tag === 'unsolved' ? ', not solved' : ''}`);
    }
    const current = shown()?.index;
    for (const tab of tabs) {
      const on = Number(tab.dataset.round) === current;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on && lostFocus && focused) tab.focus();
    }
  }

  function onTabKey(event: KeyboardEvent): void {
    const at = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    let to = at;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') to = (at + 1) % tabs.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') to = (at - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') to = 0;
    else if (event.key === 'End') to = tabs.length - 1;
    else return;
    event.preventDefault();
    pick(Number(tabs[to].dataset.round));
    tabs[to].focus();
  }

  function pick(index: number): void {
    picked = index === newest()?.index ? null : index;
    stopMarker();
    render(false);
  }

  /** Paint every station and link for the round on show, then lay out the arrows. */
  function render(fromRun: boolean): void {
    const round = shown();
    syncTabs();
    const lit: Station[] = [];
    const changed: Station[] = [];
    const grew: Station[] = [];
    for (const st of stations.values()) {
      const result = paint(st, round);
      if (result.lit && fromRun) lit.push(st);
      else if (result.changed && st.nodes.length) changed.push(st);
      if (result.grew && fromRun) grew.push(st);
    }
    syncOpen();
    const drawn: Link[] = [];
    for (const link of links.values()) {
      const on = stations.get(link.spec.from)!.lit && stations.get(link.spec.to)!.lit;
      if (on && !link.lit) drawn.push(link);
      if (!on && link.lit) {
        // Un-lit before its draw-in ran: drop the pending animation.
        for (const anim of link.anims) anim.cancel();
        link.anims = [];
      }
      link.lit = on;
      link.g.classList.toggle('is-lit', on);
    }
    root.setAttribute('data-round', String(round?.index ?? 0));
    layout();

    // Newly lit stations pop in their book order; a station that now shows another round's
    // node fades its words in; arrows draw in once both their ends are lit.
    lit.forEach((st, i) => {
      if (canAnimate(st.shape)) st.shape.animate([{ opacity: 0.4, transform: 'scale(0.9)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: i * 40, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', fill: 'backwards' });
    });
    for (const st of changed) {
      const words = st.shape.querySelector('.ps-analogy__words');
      if (words && canAnimate(words)) words.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: EASE, fill: 'backwards' });
    }
    for (const st of grew) {
      if (st.count && canAnimate(st.count)) st.count.animate([{ transform: 'scale(1.5)' }, { transform: 'none' }], { duration: 380, easing: EASE });
    }
    // A whole run arriving at once still settles inside about 900ms.
    const after = fromRun ? Math.min(lit.length * 40, 160) + 80 : 0;
    drawn.forEach((link, i) => drawIn(link, after + i * 25));
  }

  function drawIn(link: Link, delay: number): void {
    for (const anim of link.anims) anim.cancel();
    link.anims = [];
    if (!canAnimate(link.line)) return;
    link.anims.push(link.line.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 380, delay, easing: EASE, fill: 'backwards' }));
    link.anims.push(link.head.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: delay + 240, easing: EASE, fill: 'backwards' }));
  }

  /**
   * Measure every station, then write every arrow. Layout boxes (offsets), not client rects:
   * a station popping in is scaled for a moment, and its arrows must meet its settled edge.
   * The station is the shape's offset parent and the chart is the station's.
   */
  function layout(): void {
    if (!chart || !overlay) return;
    const width = chart.offsetWidth;
    const height = chart.offsetHeight;
    const boxes = new Map<Key, Box | null>();
    for (const [key, st] of stations) {
      const w = st.shape.offsetWidth;
      const h = st.shape.offsetHeight;
      const l = st.item.offsetLeft + st.shape.offsetLeft;
      const t = st.item.offsetTop + st.shape.offsetTop;
      boxes.set(key, w && h ? { l, t, r: l + w, b: t + h, cx: l + w / 2, cy: t + h / 2, w } : null);
    }
    overlay.setAttribute('viewBox', `0 0 ${Math.max(width, 1)} ${Math.max(height, 1)}`);
    for (const link of links.values()) {
      const a = boxes.get(link.spec.from);
      const b = boxes.get(link.spec.to);
      if (!a || !b) {
        link.points = [];
        link.g.setAttribute('hidden', '');
        continue;
      }
      link.g.removeAttribute('hidden');
      const points = route(a, b, link.spec.offset);
      link.points = points;
      const { line, head } = shapes(points);
      if (link.line.getAttribute('d') !== line) link.line.setAttribute('d', line);
      if (link.head.getAttribute('d') !== head) link.head.setAttribute('d', head);
      if (link.text) {
        const [[x1, y1], [x2, y2]] = points;
        const across = Math.abs(y2 - y1) < 1;
        link.text.setAttribute('x', (across ? (x1 + x2) / 2 : x1 - 9).toFixed(1));
        link.text.setAttribute('y', (across ? y1 + 17 : (y1 + y2) / 2 + 4).toFixed(1));
        link.text.setAttribute('text-anchor', across ? 'middle' : 'end');
      }
    }
  }

  function stopMarker(): void {
    for (const anim of markerAnims) anim.cancel();
    markerAnims = [];
  }

  /** A small marker runs the No loop once: Solved? to Revise, up through Search, into the analogue. */
  function runMarker(): void {
    if (!marker || !canAnimate(marker)) return;
    const points = LOOP.flatMap((key) => links.get(key)!.points);
    if (points.length < 2) return;
    const lengths = points.map((p, i) => (i ? Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) : 0));
    const total = lengths.reduce((sum, d) => sum + d, 0);
    if (!total) return;
    let run = 0;
    const frames = points.map(([x, y], i) => {
      run += lengths[i];
      return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`, offset: run / total };
    });
    markerAnims = [
      marker.animate(frames, { duration: LOOP_MS, delay: 260, easing: 'ease-in-out' }),
      marker.animate([{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration: LOOP_MS, delay: 260, easing: 'linear' })
    ];
  }

  function update(run: PsToolRun): void {
    stopMarker();
    const next = readModel(run);
    if (!chart && !next.source && !next.rounds.length && !next.retain) return;
    // Opening a saved run, or an undo back to an earlier ending, must not replay the loop.
    const first = !chart;
    const known = new Set(model.rounds.map((round) => round.assess?.id).filter(Boolean));
    // Following the newest: stay there as rounds arrive. A pick of a round that has gone
    // (an undo) falls back to the newest.
    model = next;
    if (picked !== null && !model.rounds.some((round) => round.index === picked)) picked = null;
    ensureChart();
    render(true);

    // The marker runs only when the newest round has just ended unsolved, in front of the reader.
    const last = newest();
    const assess = last?.assess;
    if (!first && assess?.tag === 'unsolved' && !known.has(assess.id) && shown() === last && stations.get('search')!.lit) runMarker();
  }

  return { el: root, update };
}
