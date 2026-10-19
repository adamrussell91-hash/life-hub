// packages/problem-solver/render/gap-radar.ts
// Gap analysis, advanced (toolkit p.55): a red disc with white rings (1 to 10) and one
// white spoke per topic, topic labels round the rim, a yellow polygon for the current
// state over a blue polygon for the objective. A topic appears when its answer is
// accepted. Scores arrive as snapshots; the polygons morph from the previous snapshot
// to the newest. The renderer never calls the API: the page wires `onScore`.
import type { Accent } from './details';
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { nodeTitle } from '../titles.mjs';
import { EASE, canAnimate, cancelAnimations, contestedTag, createDisclosureGroup, detailsCard, nextId, syncContested } from './details';

const SVG = 'http://www.w3.org/2000/svg';
const RINGS = 10;
const RADIUS = 100;
const MORPH_MS = 600;
const MIN_AXES = 3;

export type RadarScores = { current: number[]; objective: number[] };
export type GapRadarView = { el: HTMLDivElement; update(run: PsToolRun): void; onScore(cb: (scores: RadarScores) => void): void; destroy(): void };

type Series = 'current' | 'objective';
const SERIES: Series[] = ['objective', 'current']; // objective underneath so the gap reads as a blue band
const END_META: Record<Series, string> = { current: 'Current state', objective: 'Objective' };
const END_ACCENT: Record<Series, Accent> = { current: 'yellow', objective: 'blue' };

function svgEl<K extends keyof SVGElementTagNameMap>(doc: Document, name: K): SVGElementTagNameMap[K] {
  return doc.createElementNS(SVG, name) as SVGElementTagNameMap[K];
}

const indexOf = (node: PsNode): number => parseSlot(node.slot)?.index ?? 0;
const angleOf = (i: number, n: number): number => -Math.PI / 2 + (i * 2 * Math.PI) / n;

function pointsFor(scores: number[], n: number): string {
  return scores
    .slice(0, n)
    .map((score, i) => {
      const r = (RADIUS * Math.min(Math.max(score, 0), RINGS)) / RINGS;
      const a = angleOf(i, n);
      return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
    })
    .join(' ');
}

function text(doc: Document, tag: 'span' | 'p' | 'label', className: string, value: string): HTMLElement {
  const el = doc.createElement(tag);
  el.className = className;
  el.textContent = value;
  return el;
}

export function createGapRadarView(doc: Document = document): GapRadarView {
  const root = doc.createElement('div');
  root.className = 'ps-radar';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', 'Gap analysis, advanced');
  const stage = doc.createElement('div');
  stage.className = 'ps-radar__stage';
  const legend = doc.createElement('div');
  legend.className = 'ps-radar__legend';
  legend.append(text(doc, 'span', 'ps-radar__legend-title', 'Performance'));
  const panel = doc.createElement('div');
  panel.className = 'ps-radar__panel';
  const scoring = doc.createElement('div');
  scoring.className = 'ps-radar__scoring';
  const group = createDisclosureGroup();

  let svg: SVGSVGElement | null = null;
  let spokes: SVGGElement | null = null;
  let polygons: SVGGElement | null = null;
  const spokeFor = new Map<string, SVGLineElement>();
  const labelFor = new Map<string, HTMLElement>();
  const keyFor = new Map<Series, HTMLElement>();
  const polygon = new Map<Series, SVGPolygonElement>();
  const drawn = new Set<string>();
  let shown: RadarScores | null = null;
  let frame = 0;
  let snapshotKey = '';
  let axes: PsNode[] = [];
  let latest: RadarScores | null = null;
  let handler: ((scores: RadarScores) => void) | null = null;
  let toggle: HTMLButtonElement | null = null;
  let form: HTMLFormElement | null = null;

  function ensureDisc(): void {
    if (svg) return;
    svg = svgEl(doc, 'svg');
    svg.setAttribute('class', 'ps-radar__svg');
    svg.setAttribute('viewBox', `${-RADIUS} ${-RADIUS} ${RADIUS * 2} ${RADIUS * 2}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const disc = svgEl(doc, 'g');
    disc.setAttribute('class', 'ps-radar__disc');
    const base = svgEl(doc, 'circle');
    base.setAttribute('class', 'ps-radar__base');
    base.setAttribute('r', String(RADIUS));
    disc.append(base);
    // Rings and spokes are drawn over the polygons so scores stay readable.
    spokes = svgEl(doc, 'g');
    spokes.setAttribute('class', 'ps-radar__spokes');
    for (let i = 1; i <= RINGS; i += 1) {
      const ring = svgEl(doc, 'circle');
      ring.setAttribute('class', 'ps-radar__ring');
      ring.setAttribute('r', String((RADIUS * i) / RINGS));
      spokes.append(ring);
    }
    polygons = svgEl(doc, 'g');
    polygons.setAttribute('class', 'ps-radar__polygons');
    svg.append(disc, polygons, spokes);
    stage.prepend(svg);
    if (canAnimate(root)) (svg as unknown as HTMLElement).animate?.([{ opacity: 0, scale: '0.9' }, { opacity: 1, scale: '1' }], { duration: 520, easing: EASE, fill: 'backwards' });
  }

  function itemButton(node: PsNode, accent: Accent, className: string, content: HTMLElement[], aria: string): { item: HTMLElement; button: HTMLButtonElement } {
    const detailsId = nextId('ps-radar-details');
    const item = doc.createElement('div');
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    button.setAttribute('aria-label', `${aria}: ${nodeTitle(node)}${node.state === 'contested' ? ', contested' : ''}. Show details`);
    button.append(...content);
    if (node.state === 'contested') button.append(contestedTag(doc, node));
    item.append(button);
    const card = detailsCard(doc, node, accent, detailsId);
    panel.append(card);
    group.register(card, button);
    return { item, button };
  }

  function addAxis(node: PsNode): HTMLElement {
    const spoke = svgEl(doc, 'line');
    spoke.setAttribute('class', 'ps-radar__spoke');
    spoke.setAttribute('x1', '0');
    spoke.setAttribute('y1', '0');
    spoke.setAttribute('x2', String(RADIUS));
    spoke.setAttribute('y2', '0');
    spoke.setAttribute('pathLength', '1');
    spokes!.append(spoke);
    spokeFor.set(node.id, spoke);
    if (canAnimate(root)) (spoke as unknown as HTMLElement).animate?.([{ strokeDasharray: '1 1', strokeDashoffset: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0 }], { duration: 520, easing: EASE, fill: 'backwards' });
    const { item } = itemButton(node, 'red', 'ps-radar__label-button', [text(doc, 'span', 'ps-radar__meta', `Topic ${indexOf(node)}`), text(doc, 'span', 'ps-radar__title', nodeTitle(node))], `Topic ${indexOf(node)}`);
    item.className = 'ps-radar__label';
    stage.append(item);
    labelFor.set(node.id, item);
    if (canAnimate(item)) item.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: EASE, fill: 'backwards', delay: 120 });
    return item;
  }

  function addKey(node: PsNode, series: Series): HTMLElement {
    const swatch = doc.createElement('span');
    swatch.className = `ps-radar__swatch ps-radar__swatch--${series}`;
    swatch.setAttribute('aria-hidden', 'true');
    const { item } = itemButton(node, END_ACCENT[series], 'ps-radar__key-button', [swatch, text(doc, 'span', 'ps-radar__key-meta', END_META[series]), text(doc, 'span', 'ps-radar__key-title', nodeTitle(node))], END_META[series]);
    item.className = `ps-radar__key ps-radar__key--${series}`;
    legend.append(item);
    keyFor.set(series, item);
    if (canAnimate(item)) item.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE, fill: 'backwards' });
    return item;
  }

  function layout(): void {
    const n = axes.length;
    axes.forEach((node, i) => {
      const a = angleOf(i, n);
      const spoke = spokeFor.get(node.id);
      if (spoke) spoke.style.transform = `rotate(${((a * 180) / Math.PI).toFixed(2)}deg)`;
      const label = labelFor.get(node.id);
      if (label) {
        label.style.setProperty('--cx', Math.cos(a).toFixed(3));
        label.style.setProperty('--cy', Math.sin(a).toFixed(3));
      }
    });
  }

  function polygonEl(series: Series): SVGPolygonElement {
    let el = polygon.get(series);
    if (!el) {
      el = svgEl(doc, 'polygon');
      el.setAttribute('class', `ps-radar__polygon ps-radar__polygon--${series}`);
      el.setAttribute('data-series', series);
      polygon.set(series, el);
      polygons!.append(el);
    }
    return el;
  }

  function paintScores(scores: RadarScores): void {
    const n = axes.length;
    // SERIES lists the objective first so the current state is drawn over it.
    for (const series of SERIES) polygonEl(series).setAttribute('points', pointsFor(scores[series], n));
    shown = { current: [...scores.current], objective: [...scores.objective] };
  }

  /** Morph from what is on screen to the newest snapshot. */
  function showSnapshot(target: RadarScores): void {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    const n = axes.length;
    const animate = canAnimate(root) && typeof requestAnimationFrame === 'function';
    if (!animate) {
      paintScores(target);
      return;
    }
    const from: RadarScores = shown && shown.current.length === n ? shown : { current: new Array(n).fill(0), objective: new Array(n).fill(0) };
    const t0 = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - t0) / MORPH_MS);
      const k = 1 - (1 - t) ** 3;
      const mix = (a: number[], b: number[]): number[] => b.map((value, i) => (a[i] ?? 0) + (value - (a[i] ?? 0)) * k);
      paintScores({ current: mix(from.current, target.current), objective: mix(from.objective, target.objective) });
      if (t < 1) frame = requestAnimationFrame(step);
      else {
        frame = 0;
        paintScores(target);
      }
    };
    frame = requestAnimationFrame(step);
  }

  function openForm(): void {
    if (!form) return;
    const n = axes.length;
    const rows = axes.map((node, i) => {
      const row = doc.createElement('fieldset');
      row.className = 'ps-radar__row';
      const legendEl = doc.createElement('legend');
      legendEl.textContent = nodeTitle(node);
      row.append(legendEl);
      for (const series of ['current', 'objective'] as Series[]) {
        const id = nextId(`ps-radar-${series}`);
        const label = doc.createElement('label');
        label.className = 'ps-radar__field';
        label.htmlFor = id;
        const name = text(doc, 'span', 'ps-radar__field-name', END_META[series]);
        const input = doc.createElement('input');
        input.type = 'range';
        input.min = '1';
        input.max = String(RINGS);
        input.step = '1';
        input.id = id;
        input.name = series;
        input.className = `ps-radar__range ps-radar__range--${series}`;
        input.value = String(latest && latest[series].length === n ? latest[series][i] : series === 'current' ? 5 : 8);
        const out = text(doc, 'span', 'ps-radar__value', input.value);
        input.addEventListener('input', () => {
          out.textContent = input.value;
        });
        label.append(name, input, out);
        row.append(label);
      }
      return row;
    });
    const actions = form.querySelector('.ps-radar__form-actions');
    form.replaceChildren(...rows, ...(actions ? [actions] : []));
  }

  function ensureScoring(): void {
    if (toggle) return;
    toggle = doc.createElement('button');
    toggle.type = 'button';
    toggle.className = 'ps-radar__score';
    toggle.setAttribute('aria-expanded', 'false');
    form = doc.createElement('form');
    form.className = 'ps-radar__form';
    form.hidden = true;
    const actions = doc.createElement('div');
    actions.className = 'ps-radar__form-actions';
    const save = doc.createElement('button');
    save.type = 'submit';
    save.className = 'ps-radar__save';
    save.textContent = 'Save scores';
    const cancel = doc.createElement('button');
    cancel.type = 'button';
    cancel.className = 'ps-radar__cancel';
    cancel.textContent = 'Cancel';
    actions.append(save, cancel);
    form.append(actions);
    const setOpen = (open: boolean): void => {
      form!.hidden = !open;
      toggle!.setAttribute('aria-expanded', String(open));
      if (open) openForm();
    };
    toggle.addEventListener('click', () => setOpen(form!.hidden));
    cancel.addEventListener('click', () => setOpen(false));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const read = (series: Series): number[] => [...form!.querySelectorAll<HTMLInputElement>(`input[name="${series}"]`)].map((input) => Number(input.value));
      handler?.({ current: read('current'), objective: read('objective') });
      setOpen(false);
    });
    scoring.append(toggle, form);
  }

  function update(run: PsToolRun): void {
    const byId = new Map(run.nodes.map((node) => [node.id, node]));
    for (const node of run.nodes) {
      const name = parseSlot(node.slot)?.name;
      if (name !== 'axis' && name !== 'current' && name !== 'objective') continue;
      ensureDisc();
      let item = drawn.has(node.id) ? (labelFor.get(node.id) ?? keyFor.get(name as Series)) : undefined;
      if (!item) {
        item = name === 'axis' ? addAxis(node) : addKey(node, name as Series);
        drawn.add(node.id);
      }
      const button = item.querySelector('button[aria-controls]');
      syncContested(item, byId.get(node.id) ?? node, button, button);
    }

    axes = run.nodes.filter((node) => parseSlot(node.slot)?.name === 'axis').sort((a, b) => indexOf(a) - indexOf(b));
    layout();

    const snapshots = run.radar?.snapshots ?? [];
    const last = snapshots.at(-1) ?? null;
    latest = last ? { current: last.current, objective: last.objective } : null;
    const usable = Boolean(last) && last!.current.length === axes.length && last!.objective.length === axes.length && axes.length >= MIN_AXES;
    if (usable && last) {
      const key = `${axes.length}|${last.current.join()}|${last.objective.join()}`;
      if (key !== snapshotKey) {
        snapshotKey = key;
        showSnapshot({ current: last.current, objective: last.objective });
      }
      for (const el of polygon.values()) el.removeAttribute('hidden');
    } else {
      for (const el of polygon.values()) el.setAttribute('hidden', '');
    }

    if (axes.length >= MIN_AXES) {
      ensureScoring();
      toggle!.textContent = last ? 'Rescore topics' : 'Score each topic';
    }

    if (stage.children.length && !stage.isConnected) root.prepend(stage);
    if (legend.children.length > 1 && !legend.isConnected) root.insertBefore(legend, panel.isConnected ? panel : null);
    if (!panel.isConnected) root.append(panel);
    if (toggle && !scoring.isConnected) root.append(scoring);
    if (scoring.isConnected && root.lastElementChild !== scoring) root.append(scoring);
  }

  return {
    el: root,
    update,
    onScore(cb) {
      handler = cb;
    },
    /** Stop the score morph and any fade still running once the canvas drops this view. */
    destroy() {
      if (frame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      frame = 0;
      cancelAnimations(root);
    }
  };
}
