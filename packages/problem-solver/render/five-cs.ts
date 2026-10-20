// packages/problem-solver/render/five-cs.ts
// 5 Cs documentation (toolkit, Document), drawn as the book draws it on two pages.
// The pie: a thin red rim, a thin paper ring, then five equal slices. Clockwise from the top left:
// yellow Contextualise across the top, blue Categorise upper right, yellow Condense lower right,
// red Correct at the bottom and blue Correspond on the left. Each slice's heading sits at its
// centroid with the latest answer's title under it. The five Cs are the tool, so the slices show
// from the start as faint paper with a thin ink rule; an accepted answer grows the slice's colour
// out from the centre. Condense can hold several answers: the slice shows the latest and a count,
// and its details card lists them all.
// The Correspond card: a blue rounded card listing the naming rules, each with a yellow dot (do)
// or a red dot (don't). Once the name exists it shows above the rows, and each strict rule gets a
// tick or a cross; the three rules left to judgement say "coach".
// Once all five are answered, a paper card previews this tool's part of the case file.
// Phone (the root up to 480px wide): the slices carry their number only, and a key under the pie
// pairs each number with its heading and latest answer; the key items are the touch targets.
import type { Accent } from './details';
import type { PsNode, PsToolRun } from '../types';
import { nodeTitle } from '../titles.mjs';
import { parseSlot } from '../slots.mjs';
import { FIVE_CS, correspondName, fiveCs } from '../tools/five-cs.mjs';
import { NAMING_RULES, namingChecks } from '../naming.mjs';
import { EASE, canAnimate, cancelAnimations, contestedTag, createDisclosureGroup, detailsCard, nextId, syncContested, syncObjectionNote } from './details';

export type FiveCsView = { el: HTMLDivElement; update(run: PsToolRun): void; destroy(): void };

type C = 'contextualise' | 'categorise' | 'condense' | 'correct' | 'correspond';
const CS = FIVE_CS as readonly C[];

/**
 * Each slice: its heading, a short line in our words shown while it waits, its colour, its number
 * on a phone, and where it starts, in degrees clockwise from 12 o'clock (each spans 72).
 */
const SLICE: Record<C, { heading: string; hint: string; tone: Accent; num: number; from: number }> = {
  contextualise: { heading: 'Contextualise', hint: 'Why it is kept, and for whom', tone: 'yellow', num: 1, from: 306 },
  categorise: { heading: 'Categorise', hint: 'Where it is filed', tone: 'blue', num: 2, from: 18 },
  condense: { heading: 'Condense', hint: 'The few things worth keeping', tone: 'yellow', num: 3, from: 90 },
  correct: { heading: 'Correct', hint: 'What was fixed or has changed', tone: 'red', num: 4, from: 162 },
  correspond: { heading: 'Correspond', hint: 'What it is called', tone: 'blue', num: 5, from: 234 }
};

// The pie, in a 100 x 100 box: rim and ring each about 1.2% of the diameter (measured off the book).
const SVG = 'http://www.w3.org/2000/svg';
const RIM = 50;
const RING = 48.8;
const PIE = 47.6;
/** A label's centre sits this far out from the middle, as a share of the pie's radius (the book's 0.58). */
const LABEL_AT = 0.58;

const rad = (deg: number): number => (deg * Math.PI) / 180;
const f = (n: number): string => n.toFixed(2);
const point = (deg: number, r: number): [number, number] => [50 + r * Math.sin(rad(deg)), 50 - r * Math.cos(rad(deg))];
function sector(from: number): string {
  const [x1, y1] = point(from, PIE);
  const [x2, y2] = point(from + 72, PIE);
  return `M50 50 L${f(x1)} ${f(y1)} A${PIE} ${PIE} 0 0 1 ${f(x2)} ${f(y2)} Z`;
}

// The rule marks, drawn in a 20 x 20 box.
const TICK = '<circle cx="10" cy="10" r="10" class="ps-fivecs__mark-disc"/><path d="M5.6 10.4l3 3 5.8-6.6" class="ps-fivecs__mark-line"/>';
const CROSS = '<circle cx="10" cy="10" r="10" class="ps-fivecs__mark-disc"/><path d="M6.6 6.6l6.8 6.8M13.4 6.6l-6.8 6.8" class="ps-fivecs__mark-line"/>';
const RESULT = { true: 'passes', false: 'does not pass yet', coach: 'for the coach to judge' } as const;
type Ok = keyof typeof RESULT;

type Slice = {
  c: C;
  item: HTMLDivElement;
  shape: HTMLDivElement;
  button: HTMLButtonElement;
  head: HTMLSpanElement;
  title: HTMLSpanElement;
  count: HTMLSpanElement;
  art: SVGGElement;
  grow: SVGGElement;
  details: HTMLDivElement;
  inner: HTMLDivElement;
  keyItem: HTMLButtonElement;
  keyTitle: HTMLSpanElement;
  keyTag: HTMLSpanElement | null;
  ids: string;
  latest: string | null;
};
type Rule = { id: string; item: HTMLDivElement; mark: HTMLSpanElement; result: HTMLSpanElement; ok: Ok | null; anim: Animation | null };
type CaseFile = { el: HTMLDivElement; name: HTMLParagraphElement; rows: Record<'purpose' | 'filed' | 'kept' | 'corrections', HTMLElement> };

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const out = doc.createElement(tag);
  out.className = className;
  if (text) out.textContent = text;
  return out;
}
function svgEl<K extends keyof SVGElementTagNameMap>(doc: Document, tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const out = doc.createElementNS(SVG, tag) as SVGElementTagNameMap[K];
  for (const [name, value] of Object.entries(attrs)) out.setAttribute(name, value);
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

const indexOf = (node: PsNode): number => parseSlot(node.slot)?.index ?? 0;
const cardKeyOf = (node: PsNode): string => `${node.text}\u0000${node.title ?? ''}\u0000${(node.skills ?? []).join(',')}`;

function readModel(run: PsToolRun): Record<C, PsNode[]> {
  const model = Object.fromEntries(CS.map((c) => [c, [] as PsNode[]])) as Record<C, PsNode[]>;
  for (const node of run.nodes) {
    const name = parseSlot(node.slot)?.name as C | undefined;
    if (name && name in model) model[name].push(node);
  }
  model.condense.sort((a, b) => indexOf(a) - indexOf(b));
  return model;
}

export function createFiveCsView(doc: Document = document): FiveCsView {
  const root = doc.createElement('div');
  root.className = 'ps-fivecs';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', '5 Cs documentation');

  const slices = new Map<C, Slice>();
  const rules = new Map<string, Rule>();
  /** One details card per node, made once and kept while the node lasts. */
  const cards = new Map<string, { card: HTMLElement; key: string }>();
  const group = createDisclosureGroup({ onChange: syncOpen });
  let caseFile: CaseFile | null = null;
  let shownName: string | null = null;
  /** Nothing animates until the run on screen has been drawn once (a saved run arrives still). */
  let painted = false;
  let destroyed = false;

  // ---------------------------------------------------------------- the pie

  const stage = el(doc, 'div', 'ps-fivecs__pie');
  stage.setAttribute('data-region', 'pie');
  stage.setAttribute('role', 'group');
  stage.setAttribute('aria-label', 'The five Cs');
  const svg = svgEl(doc, 'svg', { class: 'ps-fivecs__art', viewBox: '0 0 100 100', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(svgEl(doc, 'circle', { class: 'ps-fivecs__rim', cx: '50', cy: '50', r: String(RIM) }), svgEl(doc, 'circle', { class: 'ps-fivecs__ring', cx: '50', cy: '50', r: String(RING) }));
  const outlines = svgEl(doc, 'g', { class: 'ps-fivecs__outlines' });
  const list = el(doc, 'div', 'ps-fivecs__slices');
  list.setAttribute('role', 'list');
  list.setAttribute('aria-label', 'The five Cs');
  const key = el(doc, 'div', 'ps-fivecs__key');
  // The key repeats the slices as larger touch targets on a phone; screen readers use the slices.
  key.setAttribute('aria-hidden', 'true');
  const panel = el(doc, 'div', 'ps-fivecs__panel');

  for (const c of CS) {
    const slice = makeSlice(c);
    slices.set(c, slice);
    svg.append(slice.art);
    list.append(slice.item);
    key.append(slice.keyItem);
    panel.append(slice.details);
    // The open or focused slice's ring is its own outline, drawn over every slice.
    const d = sector(SLICE[c].from);
    const ring = svgEl(doc, 'g', { class: 'ps-fivecs__outline', 'data-art': c });
    ring.append(svgEl(doc, 'path', { class: 'ps-fivecs__outline-under', d }), svgEl(doc, 'path', { class: 'ps-fivecs__outline-ink', d }));
    outlines.append(ring);
  }
  svg.append(outlines);
  stage.append(svg, list);

  function makeSlice(c: C): Slice {
    const words = SLICE[c];
    const detailsId = nextId('ps-fivecs-details');
    const d = sector(words.from);
    const art = svgEl(doc, 'g', { class: 'ps-fivecs__slice', 'data-art': c, 'data-tone': words.tone, 'data-filled': 'false' });
    // The colour lies on an inner group with no transform of its own, so it can grow from the centre.
    const grow = svgEl(doc, 'g', { class: 'ps-fivecs__grow' });
    grow.append(svgEl(doc, 'path', { class: 'ps-fivecs__paint', d }));
    art.append(svgEl(doc, 'path', { class: 'ps-fivecs__ghost', d }), grow);

    const item = el(doc, 'div', `ps-fivecs__item ps-fivecs__item--${c}`);
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-slice', c);
    item.setAttribute('data-filled', 'false');
    const [x, y] = point(words.from + 36, PIE * LABEL_AT);
    item.style.left = `${f(x)}%`;
    item.style.top = `${f(y)}%`;
    const shape = el(doc, 'div', 'ps-fivecs__shape');
    shape.setAttribute('data-shape', '');
    shape.setAttribute('data-fill', 'paper');
    shape.setAttribute('data-tone', words.tone);
    const button = el(doc, 'button', 'ps-fivecs__button');
    button.type = 'button';
    button.disabled = true;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    // Phone slices carry a number only; the key item for the same slice is the 44px target.
    button.setAttribute('data-target-ok', '');
    const num = el(doc, 'span', 'ps-fivecs__num', String(words.num));
    num.setAttribute('aria-hidden', 'true');
    const head = el(doc, 'span', 'ps-fivecs__head');
    const count = el(doc, 'span', 'ps-fivecs__tag ps-fivecs__count');
    head.append(el(doc, 'span', 'ps-fivecs__heading', words.heading), count);
    const title = el(doc, 'span', 'ps-fivecs__title ps-fivecs__title--hint', words.hint);
    button.append(num, head, title);
    shape.append(button);
    item.append(shape);

    const details = el(doc, 'div', 'ps-details');
    details.id = detailsId;
    details.setAttribute('data-slice-for', c);
    const inner = el(doc, 'div', 'ps-details__inner');
    details.append(inner);
    group.register(details, button);

    const keyItem = el(doc, 'button', 'ps-fivecs__key-item');
    keyItem.type = 'button';
    keyItem.tabIndex = -1;
    keyItem.disabled = true;
    keyItem.setAttribute('data-tone', words.tone);
    const keyWords = el(doc, 'span', 'ps-fivecs__key-words');
    const keyTitle = el(doc, 'span', 'ps-fivecs__key-title');
    keyWords.append(el(doc, 'span', 'ps-fivecs__key-meta', words.heading), keyTitle);
    keyItem.append(el(doc, 'span', 'ps-fivecs__key-code', String(words.num)), keyWords);
    // Focus goes to the slice button, so it never rests inside the aria-hidden key.
    keyItem.addEventListener('click', () => {
      button.click();
      button.focus({ preventScroll: true });
    });

    setAttr(button, 'aria-label', `${words.heading}: not yet answered`);
    return { c, item, shape, button, head, title, count, art, grow, details, inner, keyItem, keyTitle, keyTag: null, ids: '', latest: null };
  }

  function syncOpen(): void {
    for (const slice of slices.values()) {
      const open = slice.details.classList.contains('is-open');
      slice.item.classList.toggle('is-open', open);
      slice.keyItem.classList.toggle('is-open', open);
      outlines.querySelector(`[data-art="${slice.c}"]`)?.classList.toggle('is-open', open);
    }
  }

  // ---------------------------------------------------------------- the Correspond card

  const rulesCard = el(doc, 'div', 'ps-fivecs__rules');
  rulesCard.setAttribute('data-region', 'correspond');
  rulesCard.setAttribute('role', 'group');
  rulesCard.setAttribute('aria-label', 'Correspond');
  rulesCard.setAttribute('data-shape', '');
  rulesCard.setAttribute('data-fill', 'blue');
  const nameChip = el(doc, 'p', 'ps-fivecs__name');
  nameChip.setAttribute('data-shape', '');
  nameChip.setAttribute('data-fill', 'paper');
  nameChip.hidden = true;
  const ruleList = el(doc, 'div', 'ps-fivecs__rule-list');
  ruleList.setAttribute('role', 'list');
  ruleList.setAttribute('aria-label', 'Naming rules');
  for (const rule of NAMING_RULES) {
    const item = el(doc, 'div', 'ps-fivecs__rule');
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-rule', rule.id);
    item.setAttribute('data-kind', rule.kind);
    const dot = el(doc, 'span', 'ps-fivecs__dot');
    dot.setAttribute('aria-hidden', 'true');
    const mark = el(doc, 'span', 'ps-fivecs__mark');
    mark.setAttribute('aria-hidden', 'true');
    const result = el(doc, 'span', 'ps-fivecs__sr');
    item.append(dot, el(doc, 'span', 'ps-fivecs__rule-label', rule.label), result, mark);
    ruleList.append(item);
    rules.set(rule.id, { id: rule.id, item, mark, result, ok: null, anim: null });
  }
  rulesCard.append(el(doc, 'p', 'ps-fivecs__rules-title', 'Correspond'), el(doc, 'p', 'ps-fivecs__rules-sub', 'How the record is named'), nameChip, ruleList);

  root.append(stage, key, panel, rulesCard);

  // ---------------------------------------------------------------- slices

  function cardFor(c: C, node: PsNode, many: boolean): HTMLElement {
    const wanted = `${many}\u0000${cardKeyOf(node)}`;
    const have = cards.get(node.id);
    if (have && have.key === wanted) {
      syncObjectionNote(have.card, node);
      return have.card;
    }
    const card = detailsCard(doc, node, SLICE[c].tone, '').querySelector<HTMLElement>('.ps-details__card')!;
    card.setAttribute('data-for', node.id);
    if (many) card.prepend(el(doc, 'p', 'ps-fivecs__card-head', nodeTitle(node)));
    have?.card.replaceWith(card);
    cards.set(node.id, { card, key: wanted });
    return card;
  }

  function pruneCards(run: PsToolRun): void {
    const live = new Set(run.nodes.map((node) => node.id));
    for (const [id, { card }] of cards) {
      if (live.has(id)) continue;
      card.remove();
      cards.delete(id);
    }
  }

  function syncSlice(slice: Slice, nodes: PsNode[], animate: boolean): void {
    const words = SLICE[slice.c];
    const latest = nodes[nodes.length - 1] ?? null;
    const was = slice.latest;
    const wasFilled = slice.ids !== '';
    if (!latest) {
      if (!wasFilled) return;
      if (slice.details.classList.contains('is-open')) group.close();
      cancelAnimations(slice.item);
      cancelAnimations(slice.grow);
      slice.inner.replaceChildren();
      slice.ids = '';
      slice.latest = null;
      setAttr(slice.item, 'data-node', null);
      setAttr(slice.item, 'data-filled', 'false');
      setAttr(slice.art, 'data-filled', 'false');
      setAttr(slice.shape, 'data-fill', 'paper');
      slice.shape.classList.remove('is-filled');
      slice.item.classList.remove('is-contested');
      slice.head.querySelector('.ps-objection')?.remove();
      slice.keyTag?.remove();
      slice.title.classList.add('ps-fivecs__title--hint');
      setText(slice.title, words.hint);
      setText(slice.count, '');
      setText(slice.keyTitle, '');
      slice.button.disabled = true;
      slice.keyItem.disabled = true;
      slice.keyItem.classList.remove('is-filled');
      setAttr(slice.button, 'aria-label', `${words.heading}: not yet answered`);
      return;
    }
    slice.ids = nodes.map((node) => node.id).join(' ');
    slice.latest = latest.id;
    setAttr(slice.item, 'data-node', slice.ids);
    setAttr(slice.item, 'data-filled', 'true');
    setAttr(slice.art, 'data-filled', 'true');
    setAttr(slice.shape, 'data-fill', words.tone);
    slice.shape.classList.add('is-filled');
    slice.button.disabled = false;
    slice.keyItem.disabled = false;
    slice.keyItem.classList.add('is-filled');
    const title = nodeTitle(latest);
    const extra = nodes.length - 1;
    slice.title.classList.remove('ps-fivecs__title--hint');
    setText(slice.title, title);
    setText(slice.count, extra > 0 ? `+${extra}` : '');
    setText(slice.keyTitle, extra > 0 ? `${title} (+${extra})` : title);

    const contested = nodes.find((node) => node.state === 'contested') ?? null;
    syncContested(slice.item, contested ?? latest, slice.head);
    if (contested) {
      slice.keyTag ??= contestedTag(doc, contested);
      slice.keyTag.title = contested.objection ?? '';
      if (!slice.keyTag.parentNode) slice.keyTitle.after(slice.keyTag);
    } else slice.keyTag?.remove();
    const many = extra > 0 ? `, ${nodes.length} entries` : '';
    setAttr(slice.button, 'aria-label', `${words.heading}: ${title}${many}${contested ? ', contested' : ''}. Show details`);

    const wanted = nodes.map((node) => cardFor(slice.c, node, slice.c === 'condense'));
    const have = [...slice.inner.children];
    if (wanted.length !== have.length || wanted.some((card, i) => card !== have[i])) slice.inner.replaceChildren(...wanted);

    if (!animate || was === latest.id) return;
    // A slice filling grows its colour out from the centre and fades its words in; a new latest
    // answer in a filled slice only fades its words in.
    if (!wasFilled && canAnimate(slice.grow)) {
      cancelAnimations(slice.grow);
      slice.grow.animate([{ opacity: 0.5, transform: 'scale(0.6)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE, fill: 'backwards' });
    }
    for (const part of [slice.head, slice.title]) {
      if (!canAnimate(part)) continue;
      cancelAnimations(part);
      part.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: wasFilled ? 0 : 180, easing: EASE, fill: 'backwards' });
    }
  }

  // ---------------------------------------------------------------- rules

  function syncRules(name: string | null, animate: boolean): void {
    if (name === null) {
      nameChip.hidden = true;
      setText(nameChip, '');
      shownName = null;
      for (const rule of rules.values()) {
        rule.anim?.cancel();
        rule.anim = null;
        if (rule.ok === null) continue;
        rule.ok = null;
        setAttr(rule.item, 'data-ok', null);
        rule.mark.replaceChildren();
        setText(rule.result, '');
      }
      return;
    }
    nameChip.hidden = false;
    setText(nameChip, name);
    if (animate && shownName !== null && shownName !== name && canAnimate(nameChip)) {
      cancelAnimations(nameChip);
      nameChip.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: EASE, fill: 'backwards' });
    }
    shownName = name;
    let changed = 0;
    for (const check of namingChecks(name)) {
      const rule = rules.get(check.id)!;
      const ok: Ok = check.ok === null ? 'coach' : check.ok ? 'true' : 'false';
      if (rule.ok === ok) continue;
      rule.ok = ok;
      setAttr(rule.item, 'data-ok', ok);
      setText(rule.result, `, ${RESULT[ok]}`);
      if (ok === 'coach') rule.mark.replaceChildren(el(doc, 'span', 'ps-fivecs__tag ps-fivecs__coach', 'coach'));
      else {
        const icon = svgEl(doc, 'svg', { class: 'ps-fivecs__mark-icon', viewBox: '0 0 20 20', focusable: 'false' });
        icon.innerHTML = ok === 'true' ? TICK : CROSS;
        rule.mark.replaceChildren(icon);
      }
      // The marks tick in one after another when the name arrives (or a revision changes them).
      rule.anim?.cancel();
      rule.anim = null;
      if (animate && canAnimate(rule.mark)) {
        rule.anim = rule.mark.animate([{ opacity: 0, transform: 'scale(0.5)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: changed * 80, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', fill: 'backwards' });
      }
      changed += 1;
    }
  }

  // ---------------------------------------------------------------- case file preview

  function makeCaseFile(): CaseFile {
    const card = el(doc, 'div', 'ps-fivecs__casefile');
    card.setAttribute('data-casefile', '');
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', 'Case file preview');
    card.setAttribute('data-shape', '');
    card.setAttribute('data-fill', 'card');
    const name = el(doc, 'p', 'ps-fivecs__title ps-fivecs__casefile-name');
    const rows = el(doc, 'dl', 'ps-fivecs__casefile-rows');
    const row = (label: string): HTMLElement => {
      const value = el(doc, 'dd', 'ps-fivecs__casefile-value');
      rows.append(el(doc, 'dt', 'ps-fivecs__meta', label), value);
      return value;
    };
    const out: CaseFile = { el: card, name, rows: { purpose: row('Purpose'), filed: row('Filed'), kept: row('Kept'), corrections: row('Corrections') } };
    card.append(el(doc, 'p', 'ps-fivecs__meta ps-fivecs__casefile-kind', 'Case file'), name, rows);
    return out;
  }

  function syncCaseFile(run: PsToolRun, model: Record<C, PsNode[]>, animate: boolean): void {
    if (!fiveCs.complete(run)) {
      if (caseFile) {
        cancelAnimations(caseFile.el);
        caseFile.el.remove();
        caseFile = null;
      }
      return;
    }
    const born = !caseFile;
    caseFile ??= makeCaseFile();
    if (born) root.append(caseFile.el);
    const kept = model.condense;
    setText(caseFile.name, correspondName(run) ?? '');
    setText(caseFile.rows.purpose, nodeTitle(model.contextualise[0]));
    setText(caseFile.rows.filed, nodeTitle(model.categorise[0]));
    setText(caseFile.rows.kept, `${kept.length} kept, first: ${nodeTitle(kept[0])}`);
    setText(caseFile.rows.corrections, nodeTitle(model.correct[0]));
    if (born && animate && canAnimate(caseFile.el)) {
      caseFile.el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 200, easing: EASE, fill: 'backwards' });
    }
  }

  // ---------------------------------------------------------------- update

  function update(run: PsToolRun): void {
    if (destroyed) return;
    const animate = painted;
    const model = readModel(run);
    pruneCards(run);
    for (const slice of slices.values()) syncSlice(slice, model[slice.c], animate);
    syncRules(model.correspond.length ? correspondName(run) : null, animate);
    syncCaseFile(run, model, animate);
    painted = true;
  }

  return {
    el: root,
    update,
    /** Stop any motion and ignore later updates once the canvas drops this view. */
    destroy() {
      destroyed = true;
      for (const rule of rules.values()) rule.anim?.cancel();
      cancelAnimations(root);
    }
  };
}
