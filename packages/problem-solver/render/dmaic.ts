// packages/problem-solver/render/dmaic.ts
// DMAIC cycle (toolkit, Implement), drawn as the book draws it: five rounded blue bands stacked
// with even paper gaps, Define, Measure, Analyse, Improve, Control. Each band carries, from the
// left, a red disc with its large yellow letter, a yellow right-pointing triangle, the phase name
// in white, then the node's title for the pass shown and a short description in our own words.
// A dashed yellow loop runs down the bands' right padding from Improve back up to Define: a small
// yellow triangle at Improve points into the line, and an arrowhead at Define points back into
// the band. The loop draws in once the run has a `repeat` node.
// Passes: the bands carry one pass's titles at a time. Pass tabs (from pass 2) pick which; the
// default is the current pass, and a "Pass N" badge sits beside the D disc. A band with no node
// for the pass shown is faint (pale blue, ink text). Control does not depend on the pass. The
// reason for going round again shows in a small card under the loop.
// Phone (the root up to 480px wide): the description moves under the phase name, the title under
// that, and the loop sits in a narrower right padding.
import type { PsNode, PsToolRun } from '../types';
import { nodeTitle } from '../titles.mjs';
import { parseSlot } from '../slots.mjs';
import { EASE, canAnimate, cancelAnimations, createDisclosureGroup, detailsCard, nextId, syncContested } from './details';

export type DmaicView = { el: HTMLDivElement; update(run: PsToolRun): void; destroy(): void };

type Phase = 'define' | 'measure' | 'analyse' | 'improve' | 'control';
const PHASES: readonly Phase[] = ['define', 'measure', 'analyse', 'improve', 'control'];
const PHASE: Record<Phase, { letter: string; name: string; words: string }> = {
  define: { letter: 'D', name: 'Define', words: 'Say what is wrong, what good looks like and who is involved.' },
  measure: { letter: 'M', name: 'Measure', words: 'Set the baseline: what to count, and the numbers today.' },
  analyse: { letter: 'A', name: 'Analyse', words: 'Read the numbers to find the causes worth tackling.' },
  improve: { letter: 'I', name: 'Improve', words: 'Try fixes small first, keep the best, go round if it falls short.' },
  control: { letter: 'C', name: 'Control', words: 'Hold the gain: who checks what, how often, and when to revisit.' }
};
const MAX_PASSES = 3;
const SVG_NS = 'http://www.w3.org/2000/svg';

type Band = {
  phase: Phase;
  item: HTMLDivElement;
  fill: HTMLSpanElement;
  button: HTMLButtonElement;
  content: HTMLSpanElement[];
  head: HTMLSpanElement;
  title: HTMLSpanElement;
  card: HTMLDivElement;
  /** The node the band shows now, and the key its details card was built from. */
  shown: string | null;
  cardKey: string;
};
type Repeat = { node: PsNode; item: HTMLDivElement; head: HTMLDivElement; meta: HTMLSpanElement; text: HTMLParagraphElement; more: HTMLButtonElement; card: HTMLDivElement };
type Loop = { svg: SVGSVGElement; reveal: SVGPathElement; edge: SVGPathElement; line: SVGPathElement; heads: SVGPathElement[]; draw: boolean };

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const out = doc.createElement(tag);
  out.className = className;
  if (text) out.textContent = text;
  return out;
}

function svg<K extends keyof SVGElementTagNameMap>(doc: Document, tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const out = doc.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [key, value] of Object.entries(attrs)) out.setAttribute(key, value);
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
const contested = (node: PsNode): string => (node.state === 'contested' ? ', contested' : '');
const cardKeyOf = (node: PsNode): string => `${node.id}\u0000${node.text}\u0000${(node.skills ?? []).join(',')}`;

/** The passes a run has reached: the highest phase index, or one past the highest repeat. */
export function dmaicPasses(run: PsToolRun): number {
  let passes = 1;
  for (const node of run.nodes) {
    const name = nameOf(node);
    const index = indexOf(node);
    if (!index) continue;
    if (name === 'repeat') passes = Math.max(passes, index + 1);
    else if (name === 'define' || name === 'measure' || name === 'analyse' || name === 'improve') passes = Math.max(passes, index);
  }
  return Math.min(passes, MAX_PASSES);
}

export function createDmaicView(doc: Document = document): DmaicView {
  const root = doc.createElement('div');
  root.className = 'ps-dmaic';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'DMAIC cycle');
  const group = createDisclosureGroup();

  let tabs: HTMLDivElement | null = null;
  let chart: HTMLDivElement | null = null;
  let stack: HTMLDivElement | null = null;
  let badge: HTMLSpanElement | null = null;
  let loop: Loop | null = null;
  const repeatHost = el(doc, 'div', 'ps-dmaic__repeats');
  const panel = el(doc, 'div', 'ps-dmaic__panel');
  const bands = new Map<Phase, Band>();
  const repeats = new Map<string, Repeat>();
  const tabButtons: HTMLButtonElement[] = [];

  let lastRun: PsToolRun | null = null;
  let passes = 1;
  let shownPass = 1;
  let picked = false;
  /** Nothing animates until the run on screen has been drawn once (a saved run arrives still). */
  let painted = false;
  let destroyed = false;
  let frameRequest = 0;

  // ---------------------------------------------------------------- frame

  function makeBand(phase: Phase): Band {
    const words = PHASE[phase];
    const detailsId = nextId('ps-dmaic-details');
    const item = el(doc, 'div', `ps-dmaic__band ps-dmaic__band--${phase}`);
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-phase', phase);
    item.setAttribute('data-shape', '');
    item.setAttribute('data-fill', 'paper');
    // The blue lies on its own layer, so it can wipe in from the left when the band fills.
    const fill = el(doc, 'span', 'ps-dmaic__fill');
    fill.setAttribute('aria-hidden', 'true');
    const button = el(doc, 'button', 'ps-dmaic__button');
    button.type = 'button';
    button.disabled = true;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    const disc = el(doc, 'span', 'ps-dmaic__disc');
    disc.setAttribute('aria-hidden', 'true');
    disc.setAttribute('data-letter', words.letter);
    const triangle = el(doc, 'span', 'ps-dmaic__triangle');
    triangle.setAttribute('aria-hidden', 'true');
    const name = el(doc, 'span', 'ps-dmaic__name', words.name);
    const head = el(doc, 'span', 'ps-dmaic__head');
    const title = el(doc, 'span', 'ps-dmaic__title');
    head.append(title);
    head.hidden = true;
    const desc = el(doc, 'span', 'ps-dmaic__desc', words.words);
    button.append(disc, triangle, name, head, desc);
    item.append(fill, button);
    const card = el(doc, 'div', 'ps-details');
    card.id = detailsId;
    panel.append(card);
    group.register(card, button);
    return { phase, item, fill, button, content: [name, head, desc], head, title, card, shown: null, cardKey: '' };
  }

  function ensureFrame(fresh: HTMLElement[]): void {
    if (stack) return;
    tabs = el(doc, 'div', 'ps-dmaic__tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Pass shown');
    tabs.hidden = true;
    // The chart holds the list of bands and, over it, the loop (outside the list).
    chart = el(doc, 'div', 'ps-dmaic__chart');
    stack = el(doc, 'div', 'ps-dmaic__stack');
    stack.setAttribute('role', 'list');
    stack.setAttribute('aria-label', 'Phases');
    for (const phase of PHASES) {
      const band = makeBand(phase);
      bands.set(phase, band);
      stack.append(band.item);
    }
    chart.append(stack);
    observer?.observe(chart);
    fresh.push(...[...bands.values()].map((band) => band.item));
  }

  function teardown(): void {
    for (const band of bands.values()) group.unregister(band.card);
    for (const repeat of repeats.values()) group.unregister(repeat.item);
    if (chart) observer?.unobserve(chart);
    cancelAnimations(root);
    root.replaceChildren();
    repeatHost.replaceChildren();
    panel.replaceChildren();
    bands.clear();
    repeats.clear();
    tabButtons.length = 0;
    tabs = null;
    chart = null;
    stack = null;
    badge = null;
    loop = null;
    passes = 1;
    shownPass = 1;
    picked = false;
  }

  /** Keep the root's children in their fixed order: tabs, bands, details, repeat reasons. */
  function arrange(): void {
    const want = [tabs, chart, panel, repeatHost].filter(Boolean) as HTMLElement[];
    want.forEach((child, i) => {
      if (root.children[i] !== child) root.insertBefore(child, root.children[i] ?? null);
    });
    for (const child of [...root.children]) if (!want.includes(child as HTMLElement)) child.remove();
  }

  // ---------------------------------------------------------------- tabs

  function syncTabs(): void {
    if (!tabs) return;
    while (tabButtons.length < passes) {
      const pass = tabButtons.length + 1;
      const tab = el(doc, 'button', 'ps-dmaic__tab', `Pass ${pass}`);
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('data-pass', String(pass));
      tab.addEventListener('click', () => {
        if (destroyed) return;
        picked = true;
        showPass(pass);
      });
      // Arrow keys move along the tabs (roving focus), as a tab list should.
      tab.addEventListener('keydown', (event) => {
        if (destroyed || (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft')) return;
        const at = tabButtons.indexOf(tab);
        const next = tabButtons[(at + (event.key === 'ArrowRight' ? 1 : tabButtons.length - 1)) % tabButtons.length];
        event.preventDefault();
        next.click();
        next.focus();
      });
      tabButtons.push(tab);
      tabs.append(tab);
    }
    while (tabButtons.length > passes) tabButtons.pop()!.remove();
    tabs.hidden = passes < 2;
    tabButtons.forEach((tab, i) => {
      const on = i + 1 === shownPass;
      setAttr(tab, 'aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    });
  }

  function showPass(pass: number): void {
    if (destroyed || pass === shownPass || !lastRun) return;
    shownPass = pass;
    // A pass change never leaves a card open for a node that has gone from its band.
    group.close();
    paint(lastRun, painted);
  }

  // ---------------------------------------------------------------- bands

  function syncBand(band: Band, node: PsNode | undefined, animate: boolean): void {
    const was = band.shown;
    const placed = Boolean(node);
    const label = band.phase === 'control' ? PHASE.control.name : `${PHASE[band.phase].name}, pass ${shownPass}`;
    if (!node) {
      if (was !== null) {
        if (band.card.classList.contains('is-open')) group.close();
        band.card.replaceChildren();
        band.cardKey = '';
      }
      band.shown = null;
      setAttr(band.item, 'data-node', null);
      setAttr(band.card, 'data-for', null);
      band.item.classList.remove('is-placed', 'is-contested');
      setAttr(band.item, 'data-fill', 'paper');
      band.head.hidden = true;
      band.head.querySelector('.ps-objection')?.remove();
      band.button.disabled = true;
      setAttr(band.button, 'aria-label', `${label}: not yet placed`);
      return;
    }
    if (was !== node.id && band.card.classList.contains('is-open')) group.close();
    band.shown = node.id;
    setAttr(band.item, 'data-node', node.id);
    setAttr(band.card, 'data-for', node.id);
    band.item.classList.add('is-placed');
    setAttr(band.item, 'data-fill', 'blue');
    band.head.hidden = false;
    band.button.disabled = false;
    setText(band.title, nodeTitle(node));
    setAttr(band.button, 'aria-label', `${label}: ${nodeTitle(node)}${contested(node)}. Show details`);
    const key = cardKeyOf(node);
    if (band.cardKey !== key) {
      const built = detailsCard(doc, node, 'blue', band.card.id);
      band.card.replaceChildren(...built.childNodes);
      band.cardKey = key;
    }
    syncContested(band.item, node, band.head, band.button);
    if (!animate || was === node.id) return;
    // Arrival: the blue wipes in from the left; a new title for a band already filled fades in.
    if (was === null && placed && canAnimate(band.fill)) {
      cancelAnimations(band.fill);
      band.fill.animate([{ clipPath: 'inset(0 100% 0 0 round 14px)' }, { clipPath: 'inset(0 0 0 0 round 14px)' }], { duration: 480, easing: EASE, fill: 'backwards' });
    }
    for (const part of band.content) {
      if (!canAnimate(part)) continue;
      cancelAnimations(part);
      part.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: was === null ? 180 : 0, easing: EASE, fill: 'backwards' });
    }
  }

  function syncBadge(animate: boolean): void {
    const define = bands.get('define');
    if (!define) return;
    if (passes < 2) {
      badge?.remove();
      badge = null;
      return;
    }
    let born = false;
    if (!badge) {
      badge = el(doc, 'span', 'ps-dmaic__badge ps-dmaic__tag');
      badge.setAttribute('data-shape', '');
      badge.setAttribute('data-fill', 'yellow');
      badge.setAttribute('aria-hidden', 'true');
      born = true;
    }
    if (badge.parentElement !== define.button) define.button.append(badge);
    setText(badge, `Pass ${shownPass}`);
    if (born && animate && canAnimate(badge)) badge.animate([{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EASE, fill: 'backwards' });
  }

  // ---------------------------------------------------------------- repeat loop

  function ensureLoop(animate: boolean): void {
    if (loop || !chart) return;
    const maskId = nextId('ps-dmaic-loop');
    const out = svg(doc, 'svg', { class: 'ps-dmaic__loop', 'aria-hidden': 'true', focusable: 'false' });
    out.setAttribute('data-loop', '');
    const mask = svg(doc, 'mask', { id: maskId, maskUnits: 'userSpaceOnUse' });
    const reveal = svg(doc, 'path', { class: 'ps-dmaic__loop-reveal', pathLength: '1' });
    mask.append(reveal);
    const lines = svg(doc, 'g', { mask: `url(#${maskId})` });
    // The blue edge under the yellow dashes keeps them clear of the paper in the gaps.
    const edge = svg(doc, 'path', { class: 'ps-dmaic__loop-edge' });
    const line = svg(doc, 'path', { class: 'ps-dmaic__loop-line' });
    lines.append(edge, line);
    const heads = [svg(doc, 'path', { class: 'ps-dmaic__loop-head' }), svg(doc, 'path', { class: 'ps-dmaic__loop-head' })];
    out.append(mask, lines, ...heads);
    chart.append(out);
    loop = { svg: out, reveal, edge, line, heads, draw: animate };
    scheduleLayout();
  }

  function dropLoop(): void {
    if (!loop) return;
    cancelAnimations(loop.svg as unknown as Element);
    loop.svg.remove();
    loop = null;
  }

  /** Measure the Define and Improve bands, then draw the loop down the right padding. */
  function layoutLoop(): void {
    if (destroyed || !loop || !chart) return;
    const define = bands.get('define')!.item;
    const improve = bands.get('improve')!.item;
    // Reads first.
    const box = chart.getBoundingClientRect();
    const top = define.getBoundingClientRect();
    const bottom = improve.getBoundingClientRect();
    const gutter = parseFloat(getComputedStyle(chart).getPropertyValue('--ps-dmaic-gutter')) || 44;
    if (!box.width || !top.height) return;
    // Writes.
    const yTop = top.top - box.top + top.height / 2;
    const yBottom = bottom.top - box.top + bottom.height / 2;
    const right = top.right - box.left;
    const x = right - gutter * 0.36;
    const head = Math.max(7, gutter * 0.2);
    const start = right - gutter * 0.62;
    const d = `M ${start} ${yBottom} H ${x} V ${yTop} H ${start}`;
    loop.svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    loop.svg.setAttribute('width', String(box.width));
    loop.svg.setAttribute('height', String(box.height));
    for (const path of [loop.reveal, loop.edge, loop.line]) path.setAttribute('d', d);
    // At Improve a triangle points into the line; at Define an arrowhead points back into the band.
    loop.heads[0].setAttribute('d', `M ${start - head} ${yBottom - head * 0.75} L ${start} ${yBottom} L ${start - head} ${yBottom + head * 0.75} Z`);
    loop.heads[1].setAttribute('d', `M ${start} ${yTop - head * 0.75} L ${start - head} ${yTop} L ${start} ${yTop + head * 0.75} Z`);
    if (loop.draw) {
      loop.draw = false;
      if (canAnimate(loop.reveal)) {
        loop.reveal.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 760, easing: EASE, fill: 'backwards' });
        loop.heads[0].animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE, fill: 'backwards' });
        loop.heads[1].animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 640, easing: EASE, fill: 'backwards' });
      }
    }
  }

  function scheduleLayout(): void {
    if (destroyed || frameRequest || typeof requestAnimationFrame !== 'function') return;
    frameRequest = requestAnimationFrame(() => {
      frameRequest = 0;
      layoutLoop();
    });
  }

  const observer =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          if (destroyed || !loop) return;
          layoutLoop();
        })
      : null;

  // ---------------------------------------------------------------- repeat reasons

  function makeRepeat(node: PsNode): Repeat {
    const detailsId = nextId('ps-dmaic-details');
    const item = el(doc, 'div', 'ps-dmaic__repeat');
    item.setAttribute('data-node', node.id);
    item.setAttribute('data-repeat', String(indexOf(node)));
    const head = el(doc, 'div', 'ps-dmaic__repeat-head');
    const meta = el(doc, 'span', 'ps-dmaic__meta');
    head.append(meta);
    const text = el(doc, 'p', 'ps-dmaic__repeat-text');
    const more = el(doc, 'button', 'ps-dmaic__more', 'Details');
    more.type = 'button';
    more.setAttribute('aria-expanded', 'false');
    more.setAttribute('aria-controls', detailsId);
    const card = detailsCard(doc, node, 'yellow', detailsId);
    card.setAttribute('data-for', node.id);
    // The card shows the reason in full, so its details carry only skills and any objection.
    card.querySelector('.ps-details__text')?.remove();
    item.append(head, text, more, card);
    group.register(item, more);
    return { node, item, head, meta, text, more, card };
  }

  function dropRepeat(id: string): void {
    const repeat = repeats.get(id);
    if (!repeat) return;
    if (repeat.item.classList.contains('is-open')) group.close();
    group.unregister(repeat.item);
    repeat.item.remove();
    repeats.delete(id);
  }

  // ---------------------------------------------------------------- paint

  /** Draw the bands, badge, loop and reason for the pass shown. */
  function paint(run: PsToolRun, animate: boolean): void {
    const at = (name: string, index: number | null): PsNode | undefined =>
      run.nodes.find((node) => nameOf(node) === name && (index === null || indexOf(node) === index));
    for (const phase of PHASES) syncBand(bands.get(phase)!, phase === 'control' ? at('control', null) : at(phase, shownPass), animate);
    syncTabs();
    syncBadge(animate);

    // The reason that joins the pass shown to the loop: its own, else the one that began it.
    const reason = at('repeat', shownPass) ?? (shownPass > 1 ? at('repeat', shownPass - 1) : undefined);
    for (const repeat of repeats.values()) {
      const on = repeat.node.id === reason?.id;
      if (!on && repeat.item.classList.contains('is-open')) group.close();
      if (repeat.item.hidden === on) {
        repeat.item.hidden = !on;
        if (on && animate && canAnimate(repeat.item)) {
          cancelAnimations(repeat.item);
          repeat.item.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE, fill: 'backwards' });
        }
      }
    }
  }

  // ---------------------------------------------------------------- update

  function update(run: PsToolRun): void {
    if (destroyed) return;
    lastRun = run;
    const hasDefine = run.nodes.some((node) => nameOf(node) === 'define');
    if (!hasDefine) {
      if (root.children.length) teardown();
      painted = true;
      return;
    }
    const fresh: HTMLElement[] = [];
    ensureFrame(fresh);

    const before = passes;
    passes = dmaicPasses(run);
    // A new pass is news: show it, even over a pass the person picked earlier.
    if (passes > before) picked = false;
    if (!picked || shownPass > passes) shownPass = passes;

    // Repeat reasons: one card each, shown for the passes it joins.
    const reasons = run.nodes.filter((node) => nameOf(node) === 'repeat' && indexOf(node) > 0).sort((a, b) => indexOf(a) - indexOf(b));
    const reasonIds = new Set(reasons.map((node) => node.id));
    for (const id of [...repeats.keys()]) if (!reasonIds.has(id)) dropRepeat(id);
    reasons.forEach((node, i) => {
      let repeat = repeats.get(node.id);
      if (!repeat) {
        repeat = makeRepeat(node);
        repeat.item.hidden = true;
        repeats.set(node.id, repeat);
      }
      repeat.node = node;
      if (repeatHost.children[i] !== repeat.item) repeatHost.insertBefore(repeat.item, repeatHost.children[i] ?? null);
      setAttr(repeat.item, 'data-repeat', String(indexOf(node)));
      setText(repeat.meta, `Round again after pass ${indexOf(node)}`);
      setText(repeat.text, node.text);
      setAttr(repeat.more, 'aria-label', `Reason for going round after pass ${indexOf(node)}${contested(node)}. Show details`);
      syncContested(repeat.item, node, repeat.head, repeat.more);
    });

    if (reasons.length) ensureLoop(painted);
    else dropLoop();

    paint(run, painted);
    arrange();
    if (loop) scheduleLayout();

    // The frame rises in, band by band, the first time it appears after the first paint.
    if (painted) {
      fresh.forEach((band, i) => {
        if (!canAnimate(band)) return;
        band.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: i * 60, easing: EASE, fill: 'backwards' });
      });
    }
    painted = true;
  }

  return {
    el: root,
    update,
    /** Stop the size watch, any pending frame and any motion once the canvas drops this view. */
    destroy() {
      destroyed = true;
      observer?.disconnect();
      if (frameRequest && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameRequest);
      frameRequest = 0;
      cancelAnimations(root);
    }
  };
}
