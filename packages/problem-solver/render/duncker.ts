// packages/problem-solver/render/duncker.ts
// Duncker diagram (toolkit, Devise), top to bottom as the book draws it: a red problem box;
// under it two yellow family boxes, the functionally opposite family ("Accept or redefine")
// on the left and the direct one ("Reach the desired state") on the right; each family's
// pathways beneath it, and each pathway's specific solutions beneath that; then a bottom row
// with the yellow redefinition on the left and a wide blue desired state on the right. The
// desired state is placed second in the tool but always sits at the foot, as in the book.
// The evaluation is a card under the diagram, in full.
// A family appears once a pathway with its tag exists. Thin bracket connectors join each
// parent to its children in an SVG overlay, drawn top down. A pathway's solutions sit in a
// row when they fit, else in an indented list with a rail connector; on a narrow panel the
// families stack (opposite first) and the whole diagram becomes an indented tree.
import type { Accent } from './details';
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { nodeTitle } from '../titles.mjs';
import { EASE, canAnimate, cancelAnimations, createDisclosureGroup, detailsCard, nextId, syncContested } from './details';

export type DunckerView = { el: HTMLDivElement; update(run: PsToolRun): void; destroy(): void };

type Kind = 'problem' | 'pathway' | 'solution' | 'redefinition' | 'desired';
type Family = 'opposite' | 'direct';

const SVG = 'http://www.w3.org/2000/svg';
/** Book order: the opposite family on the left, so first in reading and tab order. */
const FAMILIES: Family[] = ['opposite', 'direct'];
const FAMILY_NAME: Record<Family, string> = { opposite: 'Accept or redefine', direct: 'Reach the desired state' };
const FAMILY_LABEL: Record<Family, string> = { opposite: 'Functionally opposite pathways', direct: 'Direct pathways' };
const ACCENT: Record<Kind, Accent> = { problem: 'red', pathway: 'yellow', solution: 'yellow', redefinition: 'yellow', desired: 'blue' };
/** How far down the tree a shape sits: it sets the stagger, so a whole run settles top down. */
const DEPTH: Record<Kind | 'family', number> = { problem: 0, family: 1, pathway: 2, solution: 3, redefinition: 4, desired: 4 };
const LINK_MS = 420;

type Pt = [number, number];
type Box = { l: number; t: number; r: number; b: number; cx: number; cy: number };

type Model = {
  problem: PsNode | null;
  desired: PsNode | null;
  redefinition: PsNode | null;
  evaluation: PsNode | null;
  pathways: Array<{ node: PsNode; family: Family }>;
  solutions: Array<{ node: PsNode; pathway: string }>;
};

/** One of each single slot (the first wins); pathways by tag (untagged reads as direct); solutions by their under edge. */
function readModel(run: PsToolRun): Model {
  const model: Model = { problem: null, desired: null, redefinition: null, evaluation: null, pathways: [], solutions: [] };
  const loose: PsNode[] = [];
  for (const node of run.nodes) {
    const name = parseSlot(node.slot)?.name;
    if (name === 'problem' || name === 'desired' || name === 'redefinition' || name === 'evaluation') model[name] ??= node;
    else if (name === 'pathway') model.pathways.push({ node, family: node.tag === 'opposite' ? 'opposite' : 'direct' });
    else if (name === 'solution') loose.push(node);
  }
  const paths = new Set(model.pathways.map(({ node }) => node.id));
  for (const node of loose) {
    // The tool requires the link, so a solution with no pathway yet has nowhere to sit.
    const edge = run.edges.find((e) => e.kind === 'under' && e.from === node.id && paths.has(e.to));
    if (edge) model.solutions.push({ node, pathway: edge.to });
  }
  return model;
}

function span(doc: Document, className: string, value = ''): HTMLSpanElement {
  const el = doc.createElement('span');
  el.className = className;
  if (value) el.textContent = value;
  return el;
}

function div(doc: Document, className: string): HTMLDivElement {
  const el = doc.createElement('div');
  el.className = className;
  return el;
}

type Shape = { item: HTMLDivElement; button: HTMLButtonElement; meta: HTMLSpanElement; title: HTMLSpanElement; card: HTMLElement; kind: Kind; node: PsNode };
type Group = { el: HTMLDivElement; solutions: HTMLDivElement; family: Family };
type FamilyEl = { el: HTMLDivElement; head: HTMLDivElement; paths: HTMLDivElement };
/** holder: the element whose CSS says comb or rail; kin: the shapes the link fans out to, with this one. */
type Ends = { from: () => HTMLElement | null; to: () => HTMLElement | null; holder: () => HTMLElement | null; kin: () => HTMLElement[] };
type Link = Ends & { key: string; path: SVGPathElement; anims: Animation[] };

export function createDunckerView(doc: Document = document): DunckerView {
  const root = doc.createElement('div');
  root.className = 'ps-duncker';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', 'Duncker diagram');

  const group = createDisclosureGroup();
  const shapes = new Map<string, Shape>();
  const groups = new Map<string, Group>();
  const families = new Map<Family, FamilyEl>();
  const links = new Map<string, Link>();
  let chart: HTMLDivElement | null = null;
  let overlay: SVGSVGElement | null = null;
  let problemRegion: HTMLDivElement | null = null;
  let whatCaption: HTMLDivElement | null = null;
  let familyRegion: HTMLDivElement | null = null;
  let howCaption: HTMLDivElement | null = null;
  let bottom: HTMLDivElement | null = null;
  let panel: HTMLDivElement | null = null;
  let evaluation: { item: HTMLDivElement; text: HTMLParagraphElement; head: HTMLDivElement; more: HTMLButtonElement; node: PsNode } | null = null;
  let evalRegion: HTMLDivElement | null = null;
  let observer: ResizeObserver | null = null;

  function ensureChart(): HTMLDivElement {
    if (chart) return chart;
    chart = div(doc, 'ps-duncker__chart');
    overlay = doc.createElementNS(SVG, 'svg') as SVGSVGElement;
    overlay.setAttribute('class', 'ps-duncker__links');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('focusable', 'false');
    problemRegion = div(doc, 'ps-duncker__region ps-duncker__region--problem');
    problemRegion.setAttribute('data-region', 'problem');
    problemRegion.setAttribute('aria-label', 'The problem');
    whatCaption = div(doc, 'ps-duncker__caption ps-duncker__caption--what');
    whatCaption.setAttribute('aria-hidden', 'true');
    whatCaption.append(span(doc, 'ps-duncker__caption-text', 'What to do'));
    whatCaption.hidden = true;
    bottom = div(doc, 'ps-duncker__region ps-duncker__region--bottom');
    bottom.setAttribute('data-region', 'bottom');
    bottom.setAttribute('aria-label', 'Where it ends');
    chart.append(overlay, problemRegion, whatCaption, bottom);
    panel = div(doc, 'ps-duncker__panel');
    root.append(chart, panel);
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(() => layout());
      observer.observe(chart);
    }
    return chart;
  }

  /** Back to an empty run (a full undo): no frame is left behind. */
  function teardown(): void {
    for (const link of links.values()) for (const anim of link.anims) anim.cancel();
    observer?.disconnect();
    observer = null;
    root.replaceChildren();
    shapes.clear();
    groups.clear();
    families.clear();
    links.clear();
    chart = overlay = problemRegion = whatCaption = familyRegion = howCaption = bottom = panel = evalRegion = null;
    evaluation = null;
  }

  function ensureFamilyRegion(): HTMLDivElement {
    if (familyRegion) return familyRegion;
    familyRegion = div(doc, 'ps-duncker__region ps-duncker__region--families');
    familyRegion.setAttribute('data-region', 'families');
    familyRegion.setAttribute('aria-label', 'Pathways and their solutions');
    howCaption = div(doc, 'ps-duncker__caption ps-duncker__caption--how');
    howCaption.setAttribute('aria-hidden', 'true');
    howCaption.append(span(doc, 'ps-duncker__caption-text', 'How to do it'));
    familyRegion.append(howCaption);
    chart!.insertBefore(familyRegion, bottom);
    return familyRegion;
  }

  function ensureFamily(family: Family): { fam: FamilyEl; fresh: boolean } {
    const have = families.get(family);
    if (have) return { fam: have, fresh: false };
    const el = div(doc, `ps-duncker__family ps-duncker__family--${family}`);
    el.setAttribute('data-family', family);
    el.setAttribute('aria-label', FAMILY_LABEL[family]);
    const head = div(doc, 'ps-duncker__head');
    head.append(span(doc, 'ps-duncker__head-text', FAMILY_NAME[family]));
    const paths = div(doc, 'ps-duncker__paths');
    el.append(head, paths);
    const region = ensureFamilyRegion();
    const later = FAMILIES.slice(FAMILIES.indexOf(family) + 1).map((f) => families.get(f)?.el).find(Boolean) ?? howCaption;
    region.insertBefore(el, later ?? null);
    const fam = { el, head, paths };
    families.set(family, fam);
    return { fam, fresh: true };
  }

  function removeFamily(family: Family): void {
    families.get(family)?.el.remove();
    families.delete(family);
    if (!families.size && familyRegion) {
      familyRegion.remove();
      familyRegion = howCaption = null;
    }
  }

  function syncOpen(): void {
    for (const shape of shapes.values()) shape.card.classList.toggle('is-open', shape.item.classList.contains('is-open'));
  }

  function labelFor(shape: Shape): string {
    const contested = shape.node.state === 'contested' ? ', contested' : '';
    const where = shape.kind === 'pathway' ? ` (${FAMILY_NAME[shape.node.tag === 'opposite' ? 'opposite' : 'direct'].toLowerCase()})` : '';
    return `${shape.meta.textContent}${where}: ${nodeTitle(shape.node)}${contested}. Show details`;
  }

  function addShape(node: PsNode, kind: Kind): Shape {
    const detailsId = nextId('ps-duncker-details');
    const item = div(doc, `ps-duncker__item ps-duncker__item--${kind}`);
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'ps-duncker__box';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    const words = span(doc, 'ps-duncker__words');
    const meta = span(doc, 'ps-duncker__meta');
    const title = span(doc, 'ps-duncker__title', nodeTitle(node));
    words.append(meta, title);
    button.append(words);
    item.append(button);
    const card = detailsCard(doc, node, ACCENT[kind], detailsId);
    card.setAttribute('data-for', node.id);
    panel!.append(card);
    group.register(item, button);
    button.addEventListener('click', syncOpen);
    const shape: Shape = { item, button, meta, title, card, kind, node };
    shapes.set(node.id, shape);
    return shape;
  }

  function removeShape(id: string): void {
    const shape = shapes.get(id);
    if (!shape) return;
    shape.item.remove();
    shape.card.remove();
    shapes.delete(id);
  }

  /** Paint a shape's words for its node: meta, title, contested tag, label. */
  function paint(shape: Shape, node: PsNode, meta: string): void {
    shape.node = node;
    if (shape.meta.textContent !== meta) shape.meta.textContent = meta;
    const title = nodeTitle(node);
    if (shape.title.textContent !== title) shape.title.textContent = title;
    syncContested(shape.item, node, shape.title.parentElement, shape.button);
    const label = labelFor(shape);
    if (shape.button.getAttribute('aria-label') !== label) shape.button.setAttribute('aria-label', label);
  }

  /** Put child into parent at position index, moving only what is out of place. */
  function placeAt(parent: HTMLElement, child: HTMLElement, index: number, offset = 0): void {
    const at = parent.children[index + offset] ?? null;
    if (at !== child) parent.insertBefore(child, at);
  }

  function ensureEvaluation(node: PsNode): boolean {
    if (evaluation) return false;
    const detailsId = nextId('ps-duncker-details');
    evalRegion = div(doc, 'ps-duncker__region ps-duncker__region--evaluation');
    evalRegion.setAttribute('data-region', 'evaluation');
    evalRegion.setAttribute('aria-label', 'Evaluation');
    const item = div(doc, 'ps-duncker__evaluation');
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    const head = div(doc, 'ps-duncker__eval-head');
    head.append(span(doc, 'ps-duncker__eval-meta', 'Evaluation'));
    const text = doc.createElement('p');
    text.className = 'ps-duncker__eval-text';
    const more = doc.createElement('button');
    more.type = 'button';
    more.className = 'ps-duncker__more';
    more.textContent = 'Details';
    more.setAttribute('aria-expanded', 'false');
    more.setAttribute('aria-controls', detailsId);
    const card = detailsCard(doc, node, 'blue', detailsId);
    // The card repeats the answer, so here it carries only the skills and any objection.
    card.querySelector('.ps-details__text')?.remove();
    item.append(head, text, more, card);
    group.register(item, more);
    evalRegion.append(item);
    root.append(evalRegion);
    evaluation = { item, text, head, more, node };
    return true;
  }

  function paintEvaluation(node: PsNode): void {
    if (!evaluation) return;
    evaluation.node = node;
    if (evaluation.text.textContent !== node.text) evaluation.text.textContent = node.text;
    syncContested(evaluation.item, node, evaluation.head, evaluation.more);
  }

  function removeEvaluation(): void {
    evalRegion?.remove();
    evalRegion = null;
    evaluation = null;
  }

  function addLink(key: string, ends: Ends): Link {
    const path = doc.createElementNS(SVG, 'path') as SVGPathElement;
    path.setAttribute('class', 'ps-duncker__link');
    path.setAttribute('data-link', key);
    path.setAttribute('pathLength', '1');
    overlay!.append(path);
    const link: Link = { ...ends, key, path, anims: [] };
    links.set(key, link);
    return link;
  }

  function removeLink(key: string): void {
    const link = links.get(key);
    if (!link) return;
    for (const anim of link.anims) anim.cancel();
    link.path.remove();
    links.delete(key);
  }

  function drawIn(link: Link, delay: number): void {
    for (const anim of link.anims) anim.cancel();
    link.anims = [];
    if (!canAnimate(link.path)) return;
    link.anims.push(link.path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: LINK_MS, delay, easing: EASE, fill: 'backwards' }));
  }

  /** Layout box of el inside the chart (offsets, so a shape mid-animation is measured where it settles). */
  function boxOf(el: HTMLElement): Box | null {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!w || !h) return null;
    let l = 0;
    let t = 0;
    let at: HTMLElement | null = el;
    while (at && at !== chart) {
      l += at.offsetLeft;
      t += at.offsetTop;
      at = at.offsetParent as HTMLElement | null;
    }
    if (at !== chart) {
      // The chart is not in the offset chain (an unusual containing block): fall back to rects.
      const a = el.getBoundingClientRect();
      const c = chart!.getBoundingClientRect();
      l = a.left - c.left;
      t = a.top - c.top;
    }
    return { l, t, r: l + w, b: t + h, cx: l + w / 2, cy: t + h / 2 };
  }

  /**
   * A comb from a parent's bottom centre: down to a bar, along it, down into the child's top.
   * A rail (children listed beneath, indented): down a line just left of them, then into each.
   */
  function route(parent: Box, child: Box, siblings: Box[], rail: boolean): Pt[] {
    if (rail) {
      const x = Math.min(...siblings.map((s) => s.l)) - 11;
      return [[x, parent.b], [x, child.cy], [child.l, child.cy]];
    }
    const top = Math.min(...siblings.map((s) => s.t));
    const bar = parent.b + Math.max(4, Math.min(12, (top - parent.b) / 2));
    if (Math.abs(parent.cx - child.cx) < 1) return [[child.cx, parent.b], [child.cx, child.t]];
    return [[parent.cx, parent.b], [parent.cx, bar], [child.cx, bar], [child.cx, child.t]];
  }

  /** Measure everything, then write every connector. */
  function layout(): void {
    if (!chart || !overlay) return;
    const width = chart.offsetWidth;
    const height = chart.offsetHeight;
    // Reads: boxes, and each holder's connector style (set by the CSS for the layout in use).
    const measured = [...links.values()].map((link) => {
      const from = link.from();
      const to = link.to();
      const holder = link.holder();
      const rail = holder ? getComputedStyle(holder).getPropertyValue('--ps-duncker-link').trim() === 'rail' : false;
      return { link, a: from ? boxOf(from) : null, b: to ? boxOf(to) : null, sibs: link.kin().map(boxOf).filter((b): b is Box => Boolean(b)), rail };
    });
    // Writes.
    const box = `0 0 ${Math.max(width, 1)} ${Math.max(height, 1)}`;
    if (overlay.getAttribute('viewBox') !== box) overlay.setAttribute('viewBox', box);
    for (const { link, a, b, sibs, rail } of measured) {
      if (!a || !b) {
        link.path.setAttribute('hidden', '');
        continue;
      }
      link.path.removeAttribute('hidden');
      const points = route(a, b, sibs.length ? sibs : [b], rail);
      const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
      if (link.path.getAttribute('d') !== d) link.path.setAttribute('d', d);
    }
  }

  function popIn(el: HTMLElement, delay: number): void {
    if (canAnimate(el)) el.animate([{ opacity: 0, transform: 'translateY(-8px) scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay, easing: EASE, fill: 'backwards' });
  }

  function update(run: PsToolRun): void {
    const model = readModel(run);
    const empty = !model.problem && !model.desired && !model.redefinition && !model.evaluation && !model.pathways.length;
    if (empty) {
      if (chart) teardown();
      return;
    }
    ensureChart();

    // Drop what an undo took away: shapes, pathway groups, then empty families and their links.
    const wanted = new Set<string>();
    for (const n of [model.problem, model.desired, model.redefinition]) if (n) wanted.add(n.id);
    for (const { node } of model.pathways) wanted.add(node.id);
    for (const { node } of model.solutions) wanted.add(node.id);
    for (const id of [...shapes.keys()]) if (!wanted.has(id)) removeShape(id);
    for (const [id, g] of [...groups]) {
      if (!model.pathways.some(({ node }) => node.id === id)) {
        g.el.remove();
        groups.delete(id);
      }
    }
    for (const family of FAMILIES) if (families.has(family) && !model.pathways.some((p) => p.family === family)) removeFamily(family);
    if (evaluation && evaluation.node.id !== model.evaluation?.id) removeEvaluation();

    const fresh: Array<{ el: HTMLElement; depth: number }> = [];
    const ensure = (node: PsNode, kind: Kind): Shape => {
      let shape = shapes.get(node.id);
      if (!shape || shape.kind !== kind) {
        if (shape) removeShape(node.id);
        shape = addShape(node, kind);
        fresh.push({ el: shape.button, depth: DEPTH[kind] });
      }
      return shape;
    };

    if (model.problem) {
      const shape = ensure(model.problem, 'problem');
      if (shape.item.parentElement !== problemRegion) problemRegion!.append(shape.item);
      paint(shape, model.problem, 'Problem');
    }

    // Families, in book order, then each family's pathways in the order they were placed.
    const grow: Record<Family, number> = { opposite: 0, direct: 0 };
    for (const family of FAMILIES) {
      const paths = model.pathways.filter((p) => p.family === family);
      if (!paths.length) continue;
      const { fam, fresh: isNew } = ensureFamily(family);
      if (isNew) fresh.push({ el: fam.head, depth: DEPTH.family });
      paths.forEach(({ node }, i) => {
        let g = groups.get(node.id);
        if (!g) {
          const el = div(doc, 'ps-duncker__path');
          el.setAttribute('data-pathway', node.id);
          const solutions = div(doc, 'ps-duncker__solutions');
          el.append(solutions);
          g = { el, solutions, family };
          groups.set(node.id, g);
        }
        g.family = family;
        placeAt(fam.paths, g.el, i);
        const shape = ensure(node, 'pathway');
        if (g.el.firstElementChild !== shape.item) g.el.prepend(shape.item);
        paint(shape, node, `Path ${i + 1}`);
        g.el.setAttribute('aria-label', `Path ${i + 1}, ${nodeTitle(node)}, and its solutions`);

        const sols = model.solutions.filter((s) => s.pathway === node.id);
        sols.forEach((s, j) => {
          const sol = ensure(s.node, 'solution');
          placeAt(g!.solutions, sol.item, j);
          paint(sol, s.node, `Solution ${j + 1}`);
        });
        g.el.setAttribute('data-count', String(sols.length));
        g.el.style.setProperty('--count', String(Math.max(sols.length, 1)));
        grow[family] += Math.max(sols.length, 1);
      });
    }
    // Groups left behind in a family their pathway moved out of were moved by placeAt above.
    if (familyRegion) {
      const present = FAMILIES.filter((f) => families.has(f));
      // Explicit columns: the caption holds the middle row, so auto-placement would push the
      // families (which span every row) out into new columns.
      present.forEach((f, i) => {
        const col = String(i + 1);
        if (families.get(f)!.el.style.gridColumnStart !== col) families.get(f)!.el.style.gridColumnStart = col;
      });
      const cols = present.map((f) => `minmax(0, ${grow[f]}fr)`).join(' ');
      if (familyRegion.style.gridTemplateColumns !== cols) familyRegion.style.gridTemplateColumns = cols;
      familyRegion.setAttribute('data-families', String(families.size));
    }
    whatCaption!.hidden = !families.size;
    chart!.classList.toggle('has-both', families.size === 2);

    // The foot: the redefinition on the left, the desired state on the right.
    const foot: Array<[PsNode | null, Kind, string]> = [[model.redefinition, 'redefinition', 'Redefined problem'], [model.desired, 'desired', 'Desired state']];
    let at = 0;
    for (const [node, kind, meta] of foot) {
      if (!node) continue;
      const shape = ensure(node, kind);
      placeAt(bottom!, shape.item, at);
      paint(shape, node, meta);
      at += 1;
    }
    bottom!.setAttribute('data-count', String(at));

    if (model.evaluation) {
      if (ensureEvaluation(model.evaluation)) fresh.push({ el: evaluation!.item, depth: 5 });
      paintEvaluation(model.evaluation);
    }
    if (evalRegion && root.lastElementChild !== evalRegion) root.append(evalRegion);

    // Connectors: problem to each family, family to each pathway, pathway to each solution.
    // Each end is looked up at layout time, so a link follows its shapes through any move.
    const items = (el: HTMLElement | null | undefined, pick: (kid: HTMLElement) => HTMLElement | null): HTMLElement[] =>
      el ? ([...el.children] as HTMLElement[]).map(pick).filter((kid): kid is HTMLElement => Boolean(kid)) : [];
    const want = new Map<string, Ends & { depth: number }>();
    if (model.problem) {
      const p = model.problem.id;
      for (const family of families.keys()) {
        want.set(`family:${family}`, {
          from: () => shapes.get(p)?.item ?? null,
          to: () => families.get(family)?.head ?? null,
          holder: () => familyRegion,
          kin: () => [...families.values()].map((f) => f.head),
          depth: DEPTH.family
        });
      }
    }
    for (const { node, family } of model.pathways) {
      want.set(`pathway:${node.id}`, {
        from: () => families.get(family)?.head ?? null,
        to: () => shapes.get(node.id)?.item ?? null,
        holder: () => families.get(family)?.paths ?? null,
        kin: () => items(families.get(family)?.paths, (kid) => kid.firstElementChild as HTMLElement | null),
        depth: DEPTH.pathway
      });
    }
    for (const { node, pathway } of model.solutions) {
      want.set(`solution:${node.id}`, {
        from: () => shapes.get(pathway)?.item ?? null,
        to: () => shapes.get(node.id)?.item ?? null,
        holder: () => groups.get(pathway)?.solutions ?? null,
        kin: () => items(groups.get(pathway)?.solutions, (kid) => kid),
        depth: DEPTH.solution
      });
    }
    for (const key of [...links.keys()]) if (!want.has(key)) removeLink(key);
    const drawn: Array<{ link: Link; depth: number }> = [];
    for (const [key, ends] of want) {
      if (links.has(key)) continue;
      drawn.push({ link: addLink(key, ends), depth: ends.depth });
    }

    syncOpen();
    layout();

    // New shapes settle top down; each connector draws in just as its child arrives.
    fresh.sort((a, b) => a.depth - b.depth);
    const step = fresh.length > 1 ? Math.min(40, 360 / (fresh.length - 1)) : 0;
    const startAt = new Map<number, number>();
    fresh.forEach(({ el, depth }, i) => {
      const delay = Math.round(i * step);
      if (!startAt.has(depth)) startAt.set(depth, delay);
      popIn(el, delay);
    });
    drawn.forEach(({ link, depth }) => drawIn(link, Math.max(0, (startAt.get(depth) ?? 0) - 120)));
  }

  /** Stop the size watch and any connector or pop-in still running once the canvas drops this view. */
  function destroy(): void {
    observer?.disconnect();
    observer = null;
    for (const link of links.values()) for (const anim of link.anims) anim.cancel();
    cancelAnimations(root);
  }

  return { el: root, update, destroy };
}
