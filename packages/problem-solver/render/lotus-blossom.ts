// packages/problem-solver/render/lotus-blossom.ts
// Lotus blossom (toolkit, Devise), drawn as the book does: a red problem disc ringed by
// eight overlapping yellow solution petals, the first at the top and the rest clockwise.
// Out along each petal's direction sits that solution's own flower: a small yellow heart
// carrying the solution's number, ringed by up to eight blue idea petals (idea 1 at the top).
// A flower appears once its solution has an idea; ideas attach by their `petal` link.
// Overview: solution petals and hearts carry numbers and a key under the chart gives the
// titles (the problem's title sits in its disc when the disc is wide enough). Idea petals
// are plain blue; each whole flower is one button that zooms the chart into it.
// Zoomed: a CSS transform on the inner wrapper scales the chart about that flower; its
// petals spread apart so none overlap and become buttons carrying their titles, and the
// heart grows to hold the solution's title. Back (or Escape) returns to the whole blossom.
// Preferred ideas wear an ink ring; each preferred note is a card under the chart. Ideas
// with no petal link (older data) wait in an "Unplaced ideas" row.
import type { Accent } from './details';
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { nodeTitle } from '../titles.mjs';
import { petalsOf } from '../tools/lotus-blossom.mjs';
import { EASE, canAnimate, contestedTag, createDisclosureGroup, detailsCard, nextId } from './details';

export type LotusBlossomView = { el: HTMLDivElement; update(run: PsToolRun): void };

type Kind = 'problem' | 'solution' | 'idea' | 'preferred';

/** Chart units: the chart is 200 across with the problem at (0, 0). Mirrored in the CSS. */
const PETALS = 8;
/** Solution petals sit this far out from the problem; flowers this far. */
const PETAL_AT = 25;
const FLOWER_AT = 70;
/** Idea petals sit this far from their flower's heart in the overview. */
const IDEA_AT = 17;
const POP = 'cubic-bezier(0.34, 1.4, 0.64, 1)';

const KINDS: Kind[] = ['problem', 'solution', 'idea', 'preferred'];
const isKind = (name: string | undefined): name is Kind => KINDS.includes(name as Kind);
const ACCENT: Record<Kind, Accent> = { problem: 'red', solution: 'yellow', idea: 'blue', preferred: 'blue' };

/** Unit direction of petal i (1-based): the first straight up, then clockwise in 45° steps. */
function direction(i: number): { x: number; y: number } {
  const a = ((-90 + (i - 1) * 45) * Math.PI) / 180;
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return { x: r(Math.cos(a)), y: r(Math.sin(a)) };
}

function span(doc: Document, className: string, value = ''): HTMLSpanElement {
  const el = doc.createElement('span');
  el.className = className;
  if (value) el.textContent = value;
  return el;
}

type Shape = {
  id: string;
  kind: Kind;
  index: number;
  node: PsNode;
  item: HTMLDivElement;
  button: HTMLButtonElement;
  meta: HTMLSpanElement;
  title: HTMLSpanElement;
  tag: HTMLSpanElement | null;
  card: HTMLElement;
  /** Ideas: the solution whose flower holds it (null while unplaced) and its petal number there. */
  flower: string | null;
  petal: number;
};

type Flower = {
  id: string;
  index: number;
  el: HTMLDivElement;
  bloom: HTMLButtonElement;
  heart: HTMLSpanElement;
  heartMeta: HTMLSpanElement;
  heartTitle: HTMLSpanElement;
  heartTag: HTMLSpanElement | null;
};

type KeyRow = { row: HTMLButtonElement; title: HTMLSpanElement; count: HTMLSpanElement; tag: HTMLSpanElement | null };

export function createLotusBlossomView(doc: Document = document): LotusBlossomView {
  const root = doc.createElement('div');
  root.className = 'ps-lotus';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', 'Lotus blossom');
  // The titles are English; naming the language lets a word too long for a small petal hyphenate.
  root.setAttribute('lang', 'en');

  const group = createDisclosureGroup();
  const shapes = new Map<string, Shape>();
  const flowers = new Map<string, Flower>();
  const keyRows = new Map<string, KeyRow>();
  const picks = new Map<string, { card: HTMLDivElement; ideaMeta: HTMLSpanElement; ideaTitle: HTMLSpanElement }>();
  /** Preferred note id → the idea it marks. */
  const marked = new Map<string, string>();
  const anims = new Map<Element, Animation>();
  let problem: Shape | null = null;
  let zoomed: string | null = null;

  let bar: HTMLDivElement | null = null;
  let hint: HTMLSpanElement | null = null;
  let back: HTMLButtonElement | null = null;
  let stage: HTMLDivElement | null = null;
  let art: HTMLDivElement | null = null;
  let centre: HTMLDivElement | null = null;
  let flowerLayer: HTMLDivElement | null = null;
  let panel: HTMLDivElement | null = null;
  let key: HTMLDivElement | null = null;
  let pickList: HTMLDivElement | null = null;
  let orphans: HTMLDivElement | null = null;
  let orphanList: HTMLDivElement | null = null;

  function play(el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions): void {
    if (!canAnimate(el)) return;
    anims.get(el)?.cancel();
    const anim = (el as HTMLElement).animate(keyframes, { fill: 'backwards', ...options });
    anims.set(el, anim);
    anim.onfinish = () => {
      if (anims.get(el) === anim) anims.delete(el);
    };
  }

  function ensureFrame(): void {
    if (stage) return;
    stage = doc.createElement('div');
    stage.className = 'ps-lotus__stage';
    art = doc.createElement('div');
    art.className = 'ps-lotus__art';
    centre = doc.createElement('div');
    centre.className = 'ps-lotus__centre';
    centre.setAttribute('data-region', 'centre');
    centre.setAttribute('aria-label', 'The problem and its solutions');
    flowerLayer = doc.createElement('div');
    flowerLayer.className = 'ps-lotus__flowers';
    flowerLayer.setAttribute('data-region', 'flowers');
    flowerLayer.setAttribute('aria-label', 'Ideas around each solution');
    art.append(centre, flowerLayer);
    stage.append(art);
    panel = doc.createElement('div');
    panel.className = 'ps-lotus__panel';
    root.append(stage, panel);
    play(stage, [{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: EASE });
  }

  /** The bar above the chart: a hint in the overview, Back while zoomed. It appears with the first flower. */
  function ensureBar(): void {
    if (bar) return;
    bar = doc.createElement('div');
    bar.className = 'ps-lotus__bar';
    hint = span(doc, 'ps-lotus__hint', 'Choose a flower to read its ideas.');
    back = doc.createElement('button');
    back.type = 'button';
    back.className = 'ps-lotus__back';
    back.hidden = true;
    back.append(span(doc, 'ps-lotus__back-arrow', '←'), span(doc, 'ps-lotus__back-text', 'Back to the whole blossom'));
    back.firstElementChild!.setAttribute('aria-hidden', 'true');
    back.addEventListener('click', () => zoomOut());
    bar.append(hint, back);
    root.insertBefore(bar, stage);
    play(bar, [{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: 200, easing: EASE });
  }

  const contested = (node: PsNode): string => (node.state === 'contested' ? ', contested' : '');

  function ideasOf(flowerId: string): Shape[] {
    return [...shapes.values()].filter((s) => s.kind === 'idea' && s.flower === flowerId).sort((a, b) => a.petal - b.petal);
  }

  function solutionOf(id: string | null): Shape | undefined {
    return id ? shapes.get(id) : undefined;
  }

  function ideaCode(shape: Shape): string {
    const sol = solutionOf(shape.flower);
    return sol ? `${sol.index}.${shape.petal}` : '';
  }

  function label(shape: Shape): string {
    const title = nodeTitle(shape.node);
    switch (shape.kind) {
      case 'problem': return `Problem: ${title}${contested(shape.node)}. Show details`;
      case 'solution': return `Solution ${shape.index}: ${title}${contested(shape.node)}. Show details`;
      case 'idea': {
        const sol = solutionOf(shape.flower);
        const where = sol ? `Idea ${shape.petal} for solution ${sol.index}` : 'Unplaced idea';
        const preferred = shape.item.classList.contains('is-preferred') ? ', preferred' : '';
        return `${where}: ${title}${preferred}${contested(shape.node)}. Show details`;
      }
      default: {
        const idea = shapes.get(marked.get(shape.id) ?? '');
        return `Preferred${idea ? ` idea ${nodeTitle(idea.node)}` : ''}: ${title}${contested(shape.node)}. Show details`;
      }
    }
  }

  function syncOpen(): void {
    let open = false;
    for (const shape of shapes.values()) {
      const isOpen = shape.item.classList.contains('is-open');
      if (shape.card.parentElement === panel) shape.card.classList.toggle('is-open', isOpen);
      keyRows.get(shape.id)?.row.setAttribute('aria-expanded', String(isOpen));
      open ||= isOpen;
    }
    root.classList.toggle('has-open', open);
  }

  function addShape(node: PsNode, kind: Kind, index: number): Shape {
    const detailsId = nextId('ps-lotus-details');
    const item = doc.createElement('div');
    item.className = `ps-lotus__item ps-lotus__item--${kind}`;
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = kind === 'preferred' ? 'ps-lotus__pick-button' : 'ps-lotus__shape';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    const meta = span(doc, 'ps-lotus__meta');
    const title = span(doc, 'ps-lotus__title', nodeTitle(node));
    const words = span(doc, 'ps-lotus__words');
    const card = detailsCard(doc, node, ACCENT[kind], detailsId);
    card.setAttribute('data-for', node.id);
    const shape: Shape = { id: node.id, kind, index, node, item, button, meta, title, tag: null, card, flower: null, petal: 0 };

    if (kind === 'problem') {
      meta.textContent = 'Problem';
      words.append(meta, title);
      button.append(words);
      item.append(button);
      centre!.append(item);
      panel!.append(card);
    } else if (kind === 'solution') {
      const d = direction(index);
      item.setAttribute('data-petal', String(index));
      item.style.setProperty('--x', String(d.x * PETAL_AT));
      item.style.setProperty('--y', String(d.y * PETAL_AT));
      meta.textContent = `Solution ${index}`;
      words.append(meta, title);
      button.append(span(doc, 'ps-lotus__code', String(index)), words);
      item.append(button);
      // Petals in number order, so tab order runs round the flower.
      const later = [...centre!.querySelectorAll<HTMLElement>('[data-petal]')].find((el) => Number(el.getAttribute('data-petal')) > index) ?? null;
      centre!.insertBefore(item, later);
      panel!.append(card);
    } else if (kind === 'idea') {
      meta.textContent = 'Idea';
      words.append(meta, title);
      button.append(words);
      item.append(button);
      panel!.append(card);
    } else {
      // A preferred note: a small card under the chart naming the idea it picks.
      const ideaMeta = span(doc, 'ps-lotus__meta', 'Preferred');
      const ideaTitle = span(doc, 'ps-lotus__pick-idea');
      words.append(ideaMeta, ideaTitle, title);
      button.append(words);
      item.append(button, card);
      item.addEventListener('mouseenter', () => highlight(node.id, true));
      item.addEventListener('mouseleave', () => highlight(node.id, false));
      item.addEventListener('focusin', () => highlight(node.id, true));
      item.addEventListener('focusout', () => highlight(node.id, false));
      ensurePicks().append(item);
      picks.set(node.id, { card: item, ideaMeta, ideaTitle });
    }
    if (node.state === 'contested') {
      shape.tag = contestedTag(doc, node);
      words.append(shape.tag);
    }
    group.register(item, button);
    button.addEventListener('click', syncOpen);
    shapes.set(node.id, shape);
    return shape;
  }

  function highlight(pickId: string, on: boolean): void {
    const idea = shapes.get(marked.get(pickId) ?? '');
    idea?.item.classList.toggle('is-highlit', on);
  }

  function ensurePicks(): HTMLDivElement {
    if (pickList) return pickList;
    const region = doc.createElement('div');
    region.className = 'ps-lotus__picks';
    region.setAttribute('data-region', 'preferred');
    region.setAttribute('aria-label', 'Preferred ideas');
    region.append(span(doc, 'ps-lotus__heading', 'Preferred'));
    pickList = doc.createElement('div');
    pickList.className = 'ps-lotus__pick-list';
    region.append(pickList);
    root.insertBefore(region, orphans);
    play(region, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 200, easing: EASE });
    return pickList;
  }

  function ensureOrphans(): HTMLDivElement {
    if (orphanList) return orphanList;
    orphans = doc.createElement('div');
    orphans.className = 'ps-lotus__orphans';
    orphans.setAttribute('data-region', 'unplaced');
    orphans.setAttribute('aria-label', 'Unplaced ideas');
    orphans.append(span(doc, 'ps-lotus__heading', 'Unplaced ideas'));
    orphanList = doc.createElement('div');
    orphanList.className = 'ps-lotus__orphan-list';
    orphans.append(orphanList);
    root.append(orphans);
    return orphanList;
  }

  function ensureFlower(sol: Shape): Flower {
    let flower = flowers.get(sol.id);
    if (flower) return flower;
    const d = direction(sol.index);
    const el = doc.createElement('div');
    el.className = 'ps-lotus__flower';
    el.setAttribute('data-flower', sol.id);
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', `Ideas for solution ${sol.index}`);
    el.style.setProperty('--x', String(d.x * FLOWER_AT));
    el.style.setProperty('--y', String(d.y * FLOWER_AT));
    const bloom = doc.createElement('button');
    bloom.type = 'button';
    bloom.className = 'ps-lotus__bloom';
    bloom.addEventListener('click', () => zoomIn(sol.id));
    const heart = span(doc, 'ps-lotus__heart');
    heart.setAttribute('aria-hidden', 'true');
    const heartMeta = span(doc, 'ps-lotus__meta', `Solution ${sol.index}`);
    const heartTitle = span(doc, 'ps-lotus__title');
    const heartWords = span(doc, 'ps-lotus__words');
    heartWords.append(heartMeta, heartTitle);
    heart.append(span(doc, 'ps-lotus__code', String(sol.index)), heartWords);
    el.append(bloom, heart);
    const later = [...flowers.values()].filter((f) => f.index > sol.index).sort((a, b) => a.index - b.index)[0]?.el ?? null;
    flowerLayer!.insertBefore(el, later);
    flower = { id: sol.id, index: sol.index, el, bloom, heart, heartMeta, heartTitle, heartTag: null };
    flowers.set(sol.id, flower);
    return flower;
  }

  function syncFlower(flower: Flower): void {
    const sol = shapes.get(flower.id)!;
    const ideas = ideasOf(flower.id);
    const title = nodeTitle(sol.node);
    flower.heartTitle.textContent = title;
    if (sol.node.state === 'contested' && !flower.heartTag) {
      flower.heartTag = contestedTag(doc, sol.node);
      flower.heartTitle.after(flower.heartTag);
    } else if (sol.node.state !== 'contested' && flower.heartTag) {
      flower.heartTag.remove();
      flower.heartTag = null;
    }
    flower.bloom.setAttribute('aria-label', `Solution ${sol.index}, ${ideas.length} idea${ideas.length === 1 ? '' : 's'}: ${title}. Zoom in to read them`);
  }

  /** Put an idea in its flower at its petal place, or in the unplaced row. Returns whether it moved. */
  function placeIdea(shape: Shape, flowerId: string | null, petal: number): boolean {
    const moved = shape.flower !== flowerId || shape.petal !== petal || !shape.item.parentElement;
    shape.flower = flowerId;
    shape.petal = petal;
    if (!moved) return false;
    if (flowerId) {
      const flower = flowers.get(flowerId)!;
      const d = direction(petal);
      shape.item.style.setProperty('--dx', String(d.x));
      shape.item.style.setProperty('--dy', String(d.y));
      shape.item.setAttribute('data-petal-of', String(petal));
      shape.meta.textContent = `Idea ${petal}`;
      const later = [...flower.el.querySelectorAll<HTMLElement>('[data-petal-of]')].find((el) => el !== shape.item && Number(el.getAttribute('data-petal-of')) > petal) ?? null;
      flower.el.insertBefore(shape.item, later);
    } else {
      shape.item.removeAttribute('data-petal-of');
      shape.item.style.removeProperty('--dx');
      shape.item.style.removeProperty('--dy');
      shape.meta.textContent = 'Idea';
      ensureOrphans().append(shape.item);
    }
    return true;
  }

  function ensureKey(): HTMLDivElement {
    if (key) return key;
    key = doc.createElement('div');
    key.className = 'ps-lotus__key';
    key.setAttribute('role', 'group');
    key.setAttribute('aria-label', 'Key');
    panel!.after(key);
    play(key, [{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: 240, easing: EASE });
    return key;
  }

  /** Key rows: the problem, then each solution by number, with its title and idea count. */
  function syncKey(): void {
    const order = [...shapes.values()].filter((s) => s.kind === 'problem' || s.kind === 'solution').sort((a, b) => (a.kind === 'problem' ? -1 : b.kind === 'problem' ? 1 : a.index - b.index));
    if (!order.length) return;
    const list = ensureKey();
    order.forEach((shape, i) => {
      let row = keyRows.get(shape.id);
      if (!row) {
        const el = doc.createElement('button');
        el.type = 'button';
        el.className = `ps-lotus__key-row ps-lotus__key-row--${shape.kind}`;
        el.setAttribute('data-key', shape.id);
        el.setAttribute('aria-expanded', 'false');
        el.setAttribute('aria-controls', shape.button.getAttribute('aria-controls')!);
        el.addEventListener('click', () => shape.button.click());
        const title = span(doc, 'ps-lotus__key-title');
        const count = span(doc, 'ps-lotus__key-count');
        el.append(span(doc, 'ps-lotus__key-code', shape.kind === 'problem' ? '' : String(shape.index)), title, count);
        row = { row: el, title, count, tag: null };
        keyRows.set(shape.id, row);
      }
      row.title.textContent = nodeTitle(shape.node);
      if (shape.node.state === 'contested' && !row.tag) {
        row.tag = contestedTag(doc, shape.node);
        row.title.after(row.tag);
      } else if (shape.node.state !== 'contested' && row.tag) {
        row.tag.remove();
        row.tag = null;
      }
      const n = shape.kind === 'solution' ? ideasOf(shape.id).length : 0;
      row.count.textContent = n ? `${n} idea${n === 1 ? '' : 's'}` : '';
      if (list.children[i] !== row.row) list.insertBefore(row.row, list.children[i] ?? null);
    });
  }

  /** Tab stops follow the view: the overview's petals and flowers, or only the zoomed flower's ideas. */
  function syncFocusable(): void {
    root.toggleAttribute('data-zoom', !!zoomed);
    if (zoomed) root.setAttribute('data-zoom', zoomed);
    if (back && hint) {
      back.hidden = !zoomed;
      hint.hidden = !!zoomed;
    }
    centre?.toggleAttribute('inert', !!zoomed);
    for (const flower of flowers.values()) {
      const on = flower.id === zoomed;
      flower.el.classList.toggle('is-zoomed', on);
      flower.el.toggleAttribute('inert', !!zoomed && !on);
      flower.bloom.tabIndex = zoomed ? -1 : 0;
      if (on) {
        stage!.style.setProperty('--fx', flower.el.style.getPropertyValue('--x'));
        stage!.style.setProperty('--fy', flower.el.style.getPropertyValue('--y'));
      }
    }
    for (const shape of shapes.values()) {
      if (shape.kind !== 'idea') continue;
      shape.button.tabIndex = !shape.flower || shape.flower === zoomed ? 0 : -1;
    }
  }

  function zoomIn(id: string): void {
    if (!flowers.has(id)) return;
    zoomed = id;
    syncFocusable();
    ideasOf(id)[0]?.button.focus({ preventScroll: true });
  }

  function zoomOut(): void {
    if (!zoomed) return;
    const flower = flowers.get(zoomed);
    zoomed = null;
    syncFocusable();
    flower?.bloom.focus({ preventScroll: true });
  }

  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && zoomed) {
      event.preventDefault();
      event.stopPropagation();
      zoomOut();
    }
  });

  function update(run: PsToolRun): void {
    const placed = run.nodes
      .map((node) => ({ node, slot: parseSlot(node.slot) }))
      .filter((entry): entry is { node: PsNode; slot: { name: Kind; index: number | null } } => isKind(entry.slot?.name));
    if (!placed.length && !stage) return;

    // Read: the chart's unit in px, once, for the unfold motion.
    const unit = stage && canAnimate(root) ? stage.getBoundingClientRect().width / 200 : 0;

    ensureFrame();
    const fresh: Shape[] = [];
    for (const { node, slot } of placed) {
      let shape = shapes.get(node.id);
      if (!shape) {
        const index = slot.index ?? 0;
        if (slot.name === 'problem' && problem) continue;
        if (slot.name === 'solution') {
          if (index < 1 || index > PETALS) continue;
          if ([...shapes.values()].some((s) => s.kind === 'solution' && s.index === index)) continue;
        }
        shape = addShape(node, slot.name, index);
        if (slot.name === 'problem') problem = shape;
        fresh.push(shape);
      }
      const relabel = shape.node.state !== node.state || nodeTitle(shape.node) !== nodeTitle(node);
      shape.node = node;
      if (relabel) shape.title.textContent = nodeTitle(node);
      shape.item.classList.toggle('is-contested', node.state === 'contested');
    }

    // Ideas to their flowers by petal link, in placement order; the rest are unplaced.
    const solutionIds = new Set([...shapes.values()].filter((s) => s.kind === 'solution').map((s) => s.id));
    const home = new Map<string, { flower: string; petal: number }>();
    for (const [solId, ideaIds] of petalsOf(run) as Map<string, string[]>) {
      if (!solutionIds.has(solId)) continue;
      ideaIds.filter((id) => shapes.get(id)?.kind === 'idea').slice(0, PETALS).forEach((id, i) => home.set(id, { flower: solId, petal: i + 1 }));
    }
    const freshFlowers: Flower[] = [];
    for (const solId of new Set([...home.values()].map((h) => h.flower))) {
      if (!flowers.has(solId)) freshFlowers.push(ensureFlower(shapes.get(solId)!));
    }
    if (flowers.size) ensureBar();
    for (const shape of shapes.values()) {
      if (shape.kind !== 'idea') continue;
      const h = home.get(shape.id);
      placeIdea(shape, h?.flower ?? null, h?.petal ?? 0);
    }
    if (orphans) {
      const any = [...shapes.values()].some((s) => s.kind === 'idea' && !s.flower);
      orphans.hidden = !any;
    }

    // Preferred marks: ring the idea, name it on the card.
    marked.clear();
    for (const edge of run.edges) if (edge.kind === 'marks' && shapes.get(edge.from)?.kind === 'preferred') marked.set(edge.from, edge.to);
    const preferredIdeas = new Set(marked.values());
    for (const shape of shapes.values()) {
      if (shape.kind === 'idea') shape.item.classList.toggle('is-preferred', preferredIdeas.has(shape.id));
    }
    for (const [pickId, pick] of picks) {
      const idea = shapes.get(marked.get(pickId) ?? '');
      const code = idea ? ideaCode(idea) : '';
      pick.ideaMeta.textContent = code ? `Preferred · Idea ${code}` : 'Preferred';
      pick.ideaTitle.textContent = idea ? nodeTitle(idea.node) : '';
      pick.ideaTitle.hidden = !idea;
    }

    for (const flower of flowers.values()) syncFlower(flower);
    for (const shape of shapes.values()) shape.button.setAttribute('aria-label', label(shape));
    syncKey();
    if (zoomed && !flowers.has(zoomed)) zoomed = null;
    syncFocusable();
    syncOpen();

    // Motion: only what is new. The problem pops, petals unfold out of it, a new flower's
    // heart travels out along its petal's line and its ideas open round it.
    if (!canAnimate(root)) return;
    const u = unit || (stage!.getBoundingClientRect().width || 400) / 200;
    const freshIds = new Set(fresh.map((s) => s.id));
    let delay = 0;
    if (problem && freshIds.has(problem.id)) {
      play(problem.button, [{ opacity: 0, transform: 'scale(0.5)' }, { opacity: 1, transform: 'none' }], { duration: 440, easing: POP });
      delay = 80;
    }
    const petals = fresh.filter((s) => s.kind === 'solution').sort((a, b) => a.index - b.index);
    const step = petals.length > 1 ? Math.min(30, 210 / (petals.length - 1)) : 0;
    petals.forEach((s, i) => {
      const d = direction(s.index);
      const from = `translate(${(-d.x * PETAL_AT * u).toFixed(1)}px, ${(-d.y * PETAL_AT * u).toFixed(1)}px) scale(0.3) rotate(-60deg)`;
      play(s.button, [{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }], { duration: 480, delay: delay + Math.round(i * step), easing: EASE });
    });
    if (petals.length) delay += Math.round((petals.length - 1) * step) + 10;
    const freshFlowerIds = new Set(freshFlowers.map((f) => f.id));
    freshFlowers.forEach((f) => {
      const d = direction(f.index);
      const out = (FLOWER_AT - PETAL_AT) * u;
      play(f.heart, [{ opacity: 0, transform: `translate(${(-d.x * out).toFixed(1)}px, ${(-d.y * out).toFixed(1)}px) scale(0.4)` }, { opacity: 1, transform: 'none' }], { duration: 420, delay, easing: EASE });
    });
    const ideas = [...shapes.values()].filter((s) => s.kind === 'idea' && s.flower && (freshIds.has(s.id) || freshFlowerIds.has(s.flower)));
    // Every new flower opens at once, petal by petal round its heart, so a full chart settles inside a second.
    const ideaDelay = delay + (freshFlowers.length ? 100 : 0);
    ideas.forEach((s) => {
      const d = direction(s.petal);
      const from = `translate(${(-d.x * IDEA_AT * u).toFixed(1)}px, ${(-d.y * IDEA_AT * u).toFixed(1)}px) scale(0.2)`;
      play(s.button, [{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }], { duration: 320, delay: ideaDelay + (s.petal - 1) * 25, easing: POP });
    });
    for (const s of fresh) {
      if (s.kind === 'idea' && !s.flower) play(s.item, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: 200, easing: EASE });
      if (s.kind === 'preferred') play(s.item, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 240, easing: EASE });
    }
  }

  return { el: root, update };
}
