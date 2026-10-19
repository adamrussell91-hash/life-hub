// packages/problem-solver/render/force-field.ts
// Force field analysis (toolkit, Analyse): a wide blue goal bar across the top and a tall
// red current-state bar in the middle. Forces for change are blue arrows coming in from
// the left, forces against are yellow arrows coming in from the right, each under its own
// header with a score pill at the foot of the column. Before scoring every arrow sits at
// a neutral length with a hollow head and no number; once scored, its length follows its score
// (1 to 5), the number sits in the arrowhead and the rows run largest first. A rescore
// morphs the lengths and totals from what is on screen and slides rows to their new
// places. On a phone the sides stack, for above against, around a flat current-state bar,
// and the arrows turn to point down (for) and up (against) at it, words still horizontal.
// The renderer never calls the API: the page wires `onScore`.
import type { Accent } from './details';
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';
import { nodeTitle } from '../titles.mjs';
import { forceTotals, forces } from '../tools/force-field.mjs';
import { EASE, canAnimate, contestedTag, createDisclosureGroup, detailsCard, nextId } from './details';

export type ForceScores = { for: number[]; against: number[] };
export type ForceFieldView = { el: HTMLDivElement; update(run: PsToolRun): void; onScore(cb: (scores: ForceScores) => void): void };

type Side = 'for' | 'against';
type Bar = 'goal' | 'current';
type Totals = { for: number; against: number };
type Arrow = { item: HTMLDivElement; button: HTMLButtonElement; num: HTMLSpanElement; title: HTMLSpanElement; side: Side; index: number; score: number | null };

const SIDES: Side[] = ['for', 'against'];
const SIDE_NAME: Record<Side, string> = { for: 'Forces for change', against: 'Forces against change' };
const SIDE_META: Record<Side, string> = { for: 'For', against: 'Against' };
const SIDE_ACCENT: Record<Side, Accent> = { for: 'blue', against: 'yellow' };
const BAR_META: Record<Bar, string> = { goal: 'Goal', current: 'Current state' };
const BAR_ACCENT: Record<Bar, Accent> = { goal: 'blue', current: 'red' };
const MORPH_MS = 600;
const FLIP_MS = 520;
const MAX = 5;
/** Unscored arrows sit at the length of a middling score. */
const NEUTRAL = 3;
/** Arrow length as a share of its column: a 1 is 60% of a 5, as in the book. */
const lengthOf = (score: number): number => 0.6 + (0.4 * (score - 1)) / (MAX - 1);

function span(doc: Document, className: string, value = ''): HTMLSpanElement {
  const el = doc.createElement('span');
  el.className = className;
  if (value) el.textContent = value;
  return el;
}

/** Move without losing focus where the browser can (Element.moveBefore); append otherwise. */
function moveToEnd(parent: HTMLElement, child: HTMLElement): void {
  const mover = (parent as HTMLElement & { moveBefore?: (node: Node, ref: Node | null) => void }).moveBefore;
  if (typeof mover === 'function' && parent.isConnected) {
    try {
      mover.call(parent, child, null);
      return;
    } catch {
      /* fall through */
    }
  }
  parent.append(child);
}

export function createForceFieldView(doc: Document = document): ForceFieldView {
  const root = doc.createElement('div');
  root.className = 'ps-force';
  root.setAttribute('role', 'list');
  root.setAttribute('aria-label', 'Force field analysis');
  const panel = doc.createElement('div');
  panel.className = 'ps-force__panel';
  const group = createDisclosureGroup();

  let stage: HTMLDivElement | null = null;
  const sideEl = new Map<Side, HTMLDivElement>();
  const listEl = new Map<Side, HTMLDivElement>();
  const totalEl = new Map<Side, { pill: HTMLDivElement; value: HTMLSpanElement }>();
  const bars = new Map<Bar, HTMLDivElement>();
  const barIds = new Map<Bar, string>();
  const arrows = new Map<string, Arrow>();
  let badge: HTMLParagraphElement | null = null;

  /** What is on screen now, so a morph starts where the last one left off. */
  const shownLen = new Map<string, number>();
  let shownTotals: Totals | null = null;
  let targetTotals: Totals | null = null;
  let frame = 0;
  const flips = new Map<HTMLElement, Animation>();

  let handler: ((scores: ForceScores) => void) | null = null;
  let scoring: HTMLDivElement | null = null;
  let toggle: HTMLButtonElement | null = null;
  let form: HTMLFormElement | null = null;
  let formKey = '';
  let latest: ForceScores | null = null;
  let order: Record<Side, PsNode[]> = { for: [], against: [] };

  function ensureStage(): void {
    if (stage) return;
    stage = doc.createElement('div');
    stage.className = 'ps-force__stage';
    for (const side of SIDES) {
      const region = doc.createElement('div');
      region.className = `ps-force__side ps-force__side--${side}`;
      region.setAttribute('data-region', side);
      region.setAttribute('aria-label', SIDE_NAME[side]);
      const head = span(doc, `ps-force__head ps-force__head--${side}`, SIDE_NAME[side]);
      const list = doc.createElement('div');
      list.className = 'ps-force__arrows';
      region.append(head, list);
      sideEl.set(side, region);
      listEl.set(side, list);
      stage.append(region);
      if (canAnimate(head)) head.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: side === 'for' ? 120 : 200, easing: EASE, fill: 'backwards' });
    }
    root.prepend(stage);
  }

  function makeButton(className: string, label: string, detailsId: string): HTMLButtonElement {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    button.setAttribute('aria-label', label);
    return button;
  }

  function makeItem(node: PsNode, className: string): HTMLDivElement {
    const item = doc.createElement('div');
    item.className = className;
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    return item;
  }

  const contested = (node: PsNode): string => (node.state === 'contested' ? ', contested' : '');

  function addBar(node: PsNode, bar: Bar): HTMLDivElement {
    ensureStage();
    const detailsId = nextId('ps-force-details');
    const item = makeItem(node, `ps-force__${bar}`);
    const button = makeButton(`ps-force__bar ps-force__bar--${bar}`, `${BAR_META[bar]}: ${nodeTitle(node)}${contested(node)}. Show details`, detailsId);
    const words = span(doc, 'ps-force__words');
    words.append(span(doc, 'ps-force__meta', BAR_META[bar]), span(doc, 'ps-force__title', nodeTitle(node)));
    if (node.state === 'contested') words.append(contestedTag(doc, node));
    button.append(words);
    item.append(button);
    const card = detailsCard(doc, node, BAR_ACCENT[bar], detailsId);
    panel.append(card);
    group.register(card, button);
    if (bar === 'goal') stage!.prepend(item);
    else stage!.insertBefore(item, sideEl.get('against')!);
    bars.set(bar, item);
    barIds.set(bar, node.id);
    if (canAnimate(button)) {
      const from = bar === 'goal' ? 'inset(0 100% 0 0 round 10px)' : 'inset(0 0 100% 0 round 10px)';
      button.animate([{ clipPath: from }, { clipPath: 'inset(0 0 0 0 round 10px)' }], { duration: 520, easing: EASE, fill: 'backwards' });
      words.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: 300, easing: EASE, fill: 'backwards' });
    }
    return item;
  }

  function arrowLabel(node: PsNode, arrow: Pick<Arrow, 'side' | 'index' | 'score'>): string {
    const scored = arrow.score === null ? 'not scored yet' : `scored ${arrow.score} of ${MAX}`;
    return `${SIDE_NAME[arrow.side]} ${arrow.index}: ${nodeTitle(node)}, ${scored}${contested(node)}. Show details`;
  }

  function addArrow(node: PsNode, side: Side, index: number): Arrow {
    ensureStage();
    const detailsId = nextId('ps-force-details');
    const item = makeItem(node, `ps-force__item ps-force__item--${side} is-unscored`);
    item.setAttribute('data-side', side);
    const button = makeButton(`ps-force__arrow ps-force__arrow--${side}`, '', detailsId);
    const shape = span(doc, 'ps-force__shape');
    shape.setAttribute('aria-hidden', 'true');
    // Unscored arrows keep a solid shaft (for contrast) and show this hollow head instead of a number.
    const tip = span(doc, 'ps-force__tip');
    tip.setAttribute('aria-hidden', 'true');
    const words = span(doc, 'ps-force__words');
    const title = span(doc, 'ps-force__title', nodeTitle(node));
    // The contested chip shares the meta line, so a contested arrow is no taller than the rest.
    const metaRow = span(doc, 'ps-force__meta-row');
    metaRow.append(span(doc, 'ps-force__meta', `${SIDE_META[side]} ${index}`));
    if (node.state === 'contested') metaRow.append(contestedTag(doc, node));
    words.append(metaRow, title);
    const num = span(doc, 'ps-force__num');
    num.setAttribute('aria-hidden', 'true');
    button.append(shape, tip, words, num);
    item.append(button);
    const card = detailsCard(doc, node, SIDE_ACCENT[side], detailsId);
    panel.append(card);
    group.register(card, button);
    listEl.get(side)!.append(item);
    const arrow: Arrow = { item, button, num, title, side, index, score: null };
    button.setAttribute('aria-label', arrowLabel(node, arrow));
    arrows.set(node.id, arrow);
    return arrow;
  }

  /** A new arrow grows out from its tail to its head, then its words fade in. */
  function animateArrow(arrow: Arrow, delay: number, upright: boolean): void {
    if (!canAnimate(arrow.button)) return;
    const from = upright ? (arrow.side === 'for' ? 'inset(0 0 100% 0)' : 'inset(100% 0 0 0)') : arrow.side === 'for' ? 'inset(0 100% 0 0)' : 'inset(0 0 0 100%)';
    arrow.button.animate([{ clipPath: from }, { clipPath: 'inset(0 0 0 0)' }], { duration: 480, delay, easing: EASE, fill: 'backwards' });
    for (const el of [arrow.button.querySelector('.ps-force__words'), arrow.num]) {
      (el as HTMLElement | null)?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: delay + 260, easing: EASE, fill: 'backwards' });
    }
  }

  function setLength(id: string, score: number): void {
    shownLen.set(id, score);
    arrows.get(id)?.button.style.setProperty('--len', lengthOf(score).toFixed(4));
  }

  function setTotals(totals: Totals): void {
    shownTotals = totals;
    for (const side of SIDES) {
      const value = totalEl.get(side)?.value;
      if (value) value.textContent = String(Math.round(totals[side]));
    }
  }

  /** Morph lengths and totals from what is on screen to the targets, over 600ms. */
  function morph(targets: Map<string, number>): void {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    const goal = targetTotals;
    const animate = canAnimate(root) && typeof requestAnimationFrame === 'function';
    if (!animate) {
      for (const [id, score] of targets) setLength(id, score);
      if (goal) setTotals(goal);
      return;
    }
    const from = new Map([...targets.keys()].map((id) => [id, shownLen.get(id) ?? targets.get(id)!]));
    const fromTotals: Totals = shownTotals ?? { for: 0, against: 0 };
    const t0 = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - t0) / MORPH_MS);
      const k = 1 - (1 - t) ** 3;
      for (const [id, score] of targets) setLength(id, from.get(id)! + (score - from.get(id)!) * k);
      if (goal) setTotals({ for: fromTotals.for + (goal.for - fromTotals.for) * k, against: fromTotals.against + (goal.against - fromTotals.against) * k });
      if (t < 1) frame = requestAnimationFrame(step);
      else frame = 0;
    };
    frame = requestAnimationFrame(step);
  }

  /** Put each side's rows in score order; rows that moved slide from where they were (FLIP). */
  function reorder(wanted: Record<Side, HTMLDivElement[]>, fresh: Set<HTMLElement>): void {
    if (!stage) return;
    const stale = SIDES.filter((side) => {
      const now = [...listEl.get(side)!.children];
      return wanted[side].some((el, i) => now[i] !== el);
    });
    if (!stale.length) return;
    const animate = canAnimate(root);
    const moving = stale.flatMap((side) => wanted[side]).filter((el) => !fresh.has(el));
    // Read every first position before any write (positions include a slide still in flight).
    const first = animate ? new Map(moving.map((el) => [el, el.getBoundingClientRect().top])) : null;
    const active = doc.activeElement as HTMLElement | null;
    for (const el of moving) {
      flips.get(el)?.cancel();
      flips.delete(el);
    }
    for (const side of stale) for (const el of wanted[side]) moveToEnd(listEl.get(side)!, el);
    // Moving a row must not drop the focus of the arrow inside it.
    if (active && active !== doc.activeElement && root.contains(active)) active.focus({ preventScroll: true });
    if (!first) return;
    const last = new Map(moving.map((el) => [el, el.getBoundingClientRect().top]));
    for (const el of moving) {
      const dy = first.get(el)! - last.get(el)!;
      if (Math.abs(dy) < 1) continue;
      const slide = el.animate([{ transform: `translateY(${dy.toFixed(1)}px)` }, { transform: 'none' }], { duration: FLIP_MS, easing: EASE });
      flips.set(el, slide);
      slide.onfinish = () => flips.delete(el);
    }
  }

  function ensureTotal(side: Side): void {
    if (totalEl.has(side)) return;
    const pill = doc.createElement('div');
    pill.className = `ps-force__total ps-force__total--${side}`;
    pill.setAttribute('data-total', side);
    const value = span(doc, 'ps-force__total-value', '–');
    pill.append(span(doc, 'ps-force__total-label', 'Score'), value);
    sideEl.get(side)!.append(pill);
    totalEl.set(side, { pill, value });
    if (canAnimate(pill)) pill.animate([{ opacity: 0, transform: 'scale(0.85)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: 200, easing: EASE, fill: 'backwards' });
  }

  /** The live region exists (empty) from the start, so its first message is announced. */
  function syncBadge(totals: Totals | null): void {
    if (!badge) {
      badge = doc.createElement('p');
      badge.className = 'ps-force__badge';
      badge.setAttribute('role', 'status');
      stage!.after(badge);
    }
    const drivers = !!totals && totals.for > totals.against;
    const text = !totals ? '' : drivers ? 'Drivers outweigh restrainers' : 'Restrainers hold';
    badge.classList.toggle('is-drivers', drivers);
    if (badge.textContent === text) return;
    const appearing = !badge.textContent && !!text;
    badge.textContent = text;
    if (appearing && canAnimate(badge)) badge.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: 420, easing: EASE, fill: 'backwards' });
  }

  // Score form: one 1-to-5 slider per force, grouped by side, in slot order.

  function buildForm(keep: Map<string, string>): void {
    if (!form) return;
    const groups = SIDES.map((side) => {
      const fieldset = doc.createElement('fieldset');
      fieldset.className = `ps-force__group ps-force__group--${side}`;
      const legend = doc.createElement('legend');
      legend.textContent = SIDE_NAME[side];
      fieldset.append(legend);
      order[side].forEach((node, i) => {
        const id = nextId(`ps-force-${side}`);
        const field = doc.createElement('div');
        field.className = 'ps-force__field';
        const label = doc.createElement('label');
        label.className = 'ps-force__field-name';
        label.htmlFor = id;
        label.textContent = nodeTitle(node);
        const input = doc.createElement('input');
        input.type = 'range';
        input.min = '1';
        input.max = String(MAX);
        input.step = '1';
        input.id = id;
        input.name = side;
        input.className = `ps-force__range ps-force__range--${side}`;
        input.setAttribute('data-for-node', node.id);
        const prior = latest?.[side]?.[i];
        input.value = keep.get(node.id) ?? String(Number.isInteger(prior) ? prior : NEUTRAL);
        const out = doc.createElement('output');
        out.className = 'ps-force__value';
        // The slider announces its own value; the visible number would only repeat it.
        out.setAttribute('aria-hidden', 'true');
        out.textContent = input.value;
        // --pct drives the filled part of the track (WebKit has no range progress pseudo-element).
        const fill = (): void => {
          out.textContent = input.value;
          input.style.setProperty('--pct', `${((Number(input.value) - 1) / (MAX - 1)) * 100}%`);
        };
        fill();
        input.addEventListener('input', fill);
        field.append(label, input, out);
        fieldset.append(field);
      });
      return fieldset;
    });
    const actions = form.querySelector('.ps-force__form-actions');
    form.replaceChildren(...groups, ...(actions ? [actions] : []));
  }

  function keyOfForces(): string {
    return SIDES.map((side) => order[side].map((node) => node.id).join()).join('|');
  }

  /** Opening focuses the first slider; closing (save, cancel, Escape) always returns to the toggle. */
  function setOpen(open: boolean): void {
    if (!form || !toggle) return;
    form.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      buildForm(new Map());
      formKey = keyOfForces();
      form.querySelector<HTMLInputElement>('input')?.focus();
    } else toggle.focus();
  }

  function ensureScoring(): void {
    if (scoring) return;
    scoring = doc.createElement('div');
    scoring.className = 'ps-force__scoring';
    toggle = doc.createElement('button');
    toggle.type = 'button';
    toggle.className = 'ps-force__score';
    toggle.textContent = 'Score the forces';
    toggle.setAttribute('aria-expanded', 'false');
    form = doc.createElement('form');
    form.className = 'ps-force__form';
    form.id = nextId('ps-force-form');
    form.setAttribute('aria-label', 'Score the forces from 1 to 5');
    form.hidden = true;
    toggle.setAttribute('aria-controls', form.id);
    const actions = doc.createElement('div');
    actions.className = 'ps-force__form-actions';
    actions.setAttribute('role', 'group');
    actions.setAttribute('aria-label', 'Score actions');
    const cancel = doc.createElement('button');
    cancel.type = 'button';
    cancel.className = 'ps-force__cancel';
    cancel.textContent = 'Cancel';
    const save = doc.createElement('button');
    save.type = 'submit';
    save.className = 'ps-force__save';
    save.textContent = 'Save scores';
    actions.append(cancel, save);
    form.append(actions);
    toggle.addEventListener('click', () => setOpen(form!.hidden));
    cancel.addEventListener('click', () => setOpen(false));
    form.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const read = (side: Side): number[] => [...form!.querySelectorAll<HTMLInputElement>(`input[name="${side}"]`)].map((input) => Number(input.value));
      handler?.({ for: read('for'), against: read('against') });
      setOpen(false);
    });
    scoring.append(toggle, form);
  }

  function update(run: PsToolRun): void {
    const fresh: Arrow[] = [];
    for (const node of run.nodes) {
      const slot = parseSlot(node.slot);
      if (!slot) continue;
      if (slot.name === 'goal' || slot.name === 'current') {
        const bar = slot.name as Bar;
        if (!bars.has(bar)) addBar(node, bar);
        bars.get(bar)!.classList.toggle('is-contested', node.state === 'contested');
      } else if ((slot.name === 'for' || slot.name === 'against') && slot.index) {
        let arrow = arrows.get(node.id);
        if (!arrow) {
          arrow = addArrow(node, slot.name, slot.index);
          fresh.push(arrow);
        }
        arrow.item.classList.toggle('is-contested', node.state === 'contested');
      }
    }

    order = { for: forces(run, 'for') as PsNode[], against: forces(run, 'against') as PsNode[] };
    const snapshot = run.scores?.snapshots?.at(-1) as (Partial<ForceScores> & { at: string }) | undefined;
    latest = snapshot ? { for: snapshot.for ?? [], against: snapshot.against ?? [] } : null;

    // Scores, state and the number in each head.
    const targets = new Map<string, number>();
    const wanted = {} as Record<Side, HTMLDivElement[]>;
    for (const side of SIDES) {
      const rows = order[side].map((node, i) => {
        const arrow = arrows.get(node.id)!;
        const value = latest?.[side]?.[i];
        const score = Number.isInteger(value) && value! >= 1 && value! <= MAX ? value! : null;
        if (score !== arrow.score) {
          const was = arrow.score;
          arrow.score = score;
          arrow.item.classList.toggle('is-unscored', score === null);
          if (score === null) arrow.item.removeAttribute('data-score');
          else arrow.item.setAttribute('data-score', String(score));
          arrow.num.textContent = score === null ? '' : String(score);
          if (score !== null && was !== score && !fresh.includes(arrow) && canAnimate(arrow.num)) {
            arrow.num.animate([{ opacity: 0, transform: 'scale(0.4)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: 260, easing: EASE, fill: 'backwards' });
          }
        }
        arrow.button.setAttribute('aria-label', arrowLabel(node, arrow));
        targets.set(node.id, score ?? NEUTRAL);
        return { arrow, score, slot: i };
      });
      // Largest first; unscored after the scored; equal scores keep slot order.
      rows.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.slot - b.slot);
      wanted[side] = rows.map((row) => row.arrow.item);
      if (order[side].length) ensureTotal(side);
    }

    // New arrows start at their own length and grow in; the rest morph.
    for (const arrow of fresh) {
      const id = arrow.item.getAttribute('data-node')!;
      setLength(id, targets.get(id)!);
    }
    targetTotals = forceTotals(run) as Totals | null;
    const lengthsMoved = [...targets].some(([id, score]) => Math.abs((shownLen.get(id) ?? score) - score) > 1e-6);
    const totalsMoved = !!targetTotals && (!shownTotals || shownTotals.for !== targetTotals.for || shownTotals.against !== targetTotals.against);
    if (lengthsMoved || totalsMoved) morph(targets);
    if (!targetTotals) for (const side of SIDES) if (totalEl.has(side)) totalEl.get(side)!.value.textContent = '–';

    reorder(wanted, new Set(fresh.map((arrow) => arrow.item)));
    if (fresh.length) {
      // One style read for the batch: on a phone (--force-flow: column) the arrows grow vertically.
      const upright = getComputedStyle(fresh[0].button).getPropertyValue('--force-flow').trim() === 'column';
      for (const side of SIDES) wanted[side].filter((el) => fresh.some((arrow) => arrow.item === el)).forEach((el, i) => animateArrow(arrows.get(el.getAttribute('data-node')!)!, i * 70, upright));
    }

    if (stage) syncBadge(targetTotals);

    if (order.for.length && order.against.length) {
      ensureScoring();
      // The forces changed under an open form: rebuild it, keeping what was entered.
      if (form && !form.hidden && formKey !== keyOfForces()) {
        const keep = new Map([...form.querySelectorAll<HTMLInputElement>('input[type="range"]')].map((input) => [input.getAttribute('data-for-node')!, input.value]));
        const active = doc.activeElement as HTMLElement | null;
        // closest() rather than form.contains(): happy-dom's form.contains misses its own fields.
        const inForm = !!active && active.closest('form') === form;
        const focused = inForm ? active!.getAttribute('data-for-node') : null;
        buildForm(keep);
        formKey = keyOfForces();
        // Back to the same force; if it was removed, or focus sat on a field the rebuild dropped, the
        // first slider. Focus on Save or Cancel stays put (those buttons survive the rebuild).
        if (focused || (inForm && !active!.isConnected)) ((focused ? form.querySelector<HTMLInputElement>(`input[data-for-node="${focused}"]`) : null) ?? form.querySelector<HTMLInputElement>('input'))?.focus();
      }
    }

    if (stage && !panel.isConnected) root.append(panel);
    if (scoring && !scoring.isConnected) root.append(scoring);
  }

  return {
    el: root,
    update,
    onScore(cb) {
      handler = cb;
    }
  };
}
