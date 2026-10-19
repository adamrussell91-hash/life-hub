// packages/problem-solver/render/decision-matrix.ts
// Decision matrix (toolkit, Decide), drawn as the book draws it: a red header band whose left
// end rises into a large red dome over the criteria and a smaller one over the weight, so the
// band is scalloped there; a yellow arched head over each option column with the option's name;
// "Rating" and "Score" sub-heads in the band under each head. The body is yellow with thin paper
// rules between the rows and between the option columns (none between criteria and weight, or
// between an option's rating and score). Each criterion row has a red half-disc tab bulging out
// of its left edge and a letter code (A, B, C...). The option columns run one row deeper than the
// criteria; a blue Total tag hangs in that foot under each column's score, once scored.
// Before scoring, the weight, rating and score cells show a faint dash. After a snapshot the cells
// fill, totals count up from the last snapshot and the leading column lifts; a tie lifts none
// and says so. A "Score the options" form takes the weights and ratings.
// On a phone (or any panel up to 560px) one option shows at a time, chosen with pill tabs above
// the grid, and a totals strip under it lists every option. The renderer never calls the API:
// the page wires `onScore`.
import type { PsNode, PsToolRun } from '../types';
import { nodeTitle } from '../titles.mjs';
import { criteria as criteriaOf, decisionMatrix, matrixTotals, options as optionsOf } from '../tools/decision-matrix.mjs';
import { EASE, canAnimate, cancelAnimations, createDisclosureGroup, detailsCard, nextId, syncContested } from './details';
import { createChoiceCard } from './choice-card';

export type MatrixScores = { mode: 'percent' | 'rank'; weights: number[]; ratings: number[][] };
export type DecisionMatrixView = {
  el: HTMLDivElement;
  update(run: PsToolRun): void;
  onScore(cb: (scores: MatrixScores) => void): void;
  /** Lay out for a container this many pixels wide (tests; normally the ResizeObserver decides). */
  layout(width: number): void;
  destroy(): void;
};

type Snapshot = MatrixScores & { at: string };
type Cells = { rating: HTMLDivElement; ratingValue: HTMLSpanElement; score: HTMLDivElement; scoreValue: HTMLSpanElement };
type Row = { node: PsNode; item: HTMLDivElement; button: HTMLButtonElement; code: HTMLSpanElement; title: HTMLSpanElement; words: HTMLSpanElement; weightValue: HTMLSpanElement; card: HTMLDivElement };
type Col = {
  node: PsNode;
  item: HTMLDivElement;
  head: HTMLButtonElement;
  meta: HTMLSpanElement;
  title: HTMLSpanElement;
  words: HTMLSpanElement;
  cells: Map<string, Cells>;
  foot: HTMLDivElement;
  total: { tag: HTMLDivElement; value: HTMLSpanElement } | null;
  card: HTMLDivElement;
  tab: HTMLButtonElement;
  tabCode: HTMLSpanElement;
  tabTitle: HTMLSpanElement;
  strip: HTMLDivElement;
  stripCode: HTMLSpanElement;
  stripTitle: HTMLSpanElement;
  stripTotal: HTMLSpanElement;
};

/** Up to and including this many pixels wide, one option shows at a time. */
const COMPACT_MAX = 560;
const COUNT_MS = 600;
const letter = (i: number): string => String.fromCharCode(65 + i);

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

function setText(el: Element, value: string): void {
  if (el.textContent !== value) el.textContent = value;
}

function setStyle(el: HTMLElement, prop: 'gridRow' | 'gridColumn' | 'gridTemplateColumns' | 'gridTemplateRows', value: string): void {
  if (el.style[prop] !== value) el.style[prop] = value;
}

/** A number field's value, or NaN when empty (Number('') would read as 0). */
function numberOf(input: HTMLInputElement): number {
  const raw = input.value.trim();
  return raw === '' ? Number.NaN : Number(raw);
}

/** The latest snapshot, only while it covers exactly the criteria and options now placed. */
function currentSnapshot(run: PsToolRun, nc: number, no: number): Snapshot | null {
  const s = run.scores?.snapshots?.at(-1) as Partial<Snapshot> | undefined;
  if (!s || (s.mode !== 'percent' && s.mode !== 'rank')) return null;
  if (s.weights?.length !== nc || s.ratings?.length !== no || !s.ratings.every((row) => row.length === nc)) return null;
  return s as Snapshot;
}

export function createDecisionMatrixView(doc: Document = document): DecisionMatrixView {
  const root = doc.createElement('div');
  root.className = 'ps-matrix';
  // The grid is the list (rows and columns); the root also holds the tabs, notes and form.
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Decision matrix');
  root.setAttribute('data-compact', 'false');
  const group = createDisclosureGroup();
  const choice = createChoiceCard(doc, group);

  let frame: { tabs: HTMLDivElement; grid: HTMLDivElement; strip: HTMLDivElement; note: HTMLParagraphElement; panel: HTMLDivElement; foot: HTMLDivElement } | null = null;
  const rows = new Map<string, Row>();
  const cols = new Map<string, Col>();
  let order: { crits: PsNode[]; opts: PsNode[] } = { crits: [], opts: [] };
  let lastRun: PsToolRun | null = null;
  let snapshot: Snapshot | null = null;
  let lastAt: string | null = null;
  /** Nothing animates until the run on screen has been drawn once (a saved run arrives still). */
  let painted = false;

  // Phone: which option shows, and whether the person picked it (then it no longer follows the leader).
  let compact = false;
  let width = 0;
  let widthOverride: number | null = null;
  let selected: string | null = null;
  let picked = false;

  // Totals on screen, so a count-up starts where the last one left off.
  const shownTotals = new Map<string, number>();
  let targetTotals = new Map<string, number>();
  let raf = 0;
  let destroyed = false;

  // Score form.
  let handler: ((scores: MatrixScores) => void) | null = null;
  let scoring: HTMLDivElement | null = null;
  let toggle: HTMLButtonElement | null = null;
  let form: HTMLFormElement | null = null;
  let formBody: HTMLDivElement | null = null;
  let sumLine: HTMLParagraphElement | null = null;
  let message: HTMLParagraphElement | null = null;
  let save: HTMLButtonElement | null = null;
  let formKey = '';

  // ---------------------------------------------------------------- frame

  function ensureFrame(): boolean {
    if (frame) return false;
    const tabs = div(doc, 'ps-matrix__tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Option shown');
    tabs.hidden = true;
    const grid = div(doc, 'ps-matrix__grid');
    grid.setAttribute('role', 'list');
    grid.setAttribute('aria-label', 'Decision matrix');
    const domeBig = div(doc, 'ps-matrix__dome ps-matrix__dome--big');
    const domeSmall = div(doc, 'ps-matrix__dome ps-matrix__dome--small');
    for (const dome of [domeBig, domeSmall]) dome.setAttribute('aria-hidden', 'true');
    const bandCriteria = div(doc, 'ps-matrix__band ps-matrix__band--criteria');
    const bandWeight = div(doc, 'ps-matrix__band ps-matrix__band--weight');
    bandCriteria.append(span(doc, 'ps-matrix__band-label', 'Criteria'));
    bandWeight.append(span(doc, 'ps-matrix__band-label ps-matrix__band-label--tilt', 'Weight'));
    for (const band of [bandCriteria, bandWeight]) {
      band.setAttribute('data-shape', '');
      band.setAttribute('data-fill', 'red');
      band.setAttribute('aria-hidden', 'true');
    }
    grid.append(domeBig, domeSmall, bandCriteria, bandWeight);
    const strip = div(doc, 'ps-matrix__strip');
    strip.setAttribute('aria-label', 'Totals for every option');
    strip.hidden = true;
    const note = doc.createElement('p');
    note.className = 'ps-matrix__note';
    note.setAttribute('role', 'status');
    const panel = div(doc, 'ps-matrix__panel');
    const foot = div(doc, 'ps-matrix__after');
    root.append(tabs, grid, strip, note, panel, foot);
    frame = { tabs, grid, strip, note, panel, foot };
    if (painted && canAnimate(grid)) {
      for (const [i, dome] of [domeBig, domeSmall].entries()) dome.animate([{ transform: 'scaleY(0)' }, { transform: 'none' }], { duration: 460, delay: 80 + i * 60, easing: EASE, fill: 'backwards' });
      for (const band of [bandCriteria, bandWeight]) band.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 420, easing: EASE, fill: 'backwards' });
    }
    return true;
  }

  /** Back to an empty run (a full undo): nothing of the frame is left behind. */
  function teardown(): void {
    for (const row of rows.values()) group.unregister(row.card);
    for (const col of cols.values()) group.unregister(col.card);
    choice.reset();
    stopCount();
    cancelAnimations(root);
    root.replaceChildren();
    rows.clear();
    cols.clear();
    shownTotals.clear();
    targetTotals = new Map();
    frame = null;
    scoring = toggle = form = formBody = sumLine = message = save = null;
    selected = null;
    picked = false;
  }

  // ---------------------------------------------------------------- shapes

  function titleButton(className: string, detailsId: string): HTMLButtonElement {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    return button;
  }

  function addRow(node: PsNode): Row {
    const detailsId = nextId('ps-matrix-details');
    const item = div(doc, 'ps-matrix__row');
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    const tab = div(doc, 'ps-matrix__row-tab');
    tab.setAttribute('aria-hidden', 'true');
    const button = titleButton('ps-matrix__criterion', detailsId);
    button.setAttribute('data-shape', '');
    button.setAttribute('data-fill', 'yellow');
    const code = span(doc, 'ps-matrix__meta ps-matrix__code');
    code.setAttribute('aria-hidden', 'true');
    const words = span(doc, 'ps-matrix__words');
    const title = span(doc, 'ps-matrix__title');
    words.append(title);
    button.append(code, words);
    const weight = div(doc, 'ps-matrix__cell ps-matrix__cell--weight');
    weight.setAttribute('data-shape', '');
    weight.setAttribute('data-fill', 'yellow');
    const weightValue = span(doc, 'ps-matrix__value');
    weight.append(weightValue);
    item.append(tab, button, weight);
    const card = detailsCard(doc, node, 'red', detailsId);
    card.setAttribute('data-for', node.id);
    frame!.panel.append(card);
    group.register(card, button);
    const row: Row = { node, item, button, code, title, words, weightValue, card };
    rows.set(node.id, row);
    return row;
  }

  function addCells(col: Col, critId: string): Cells {
    const make = (kind: 'rating' | 'score'): [HTMLDivElement, HTMLSpanElement] => {
      const cell = div(doc, `ps-matrix__cell ps-matrix__cell--${kind}`);
      cell.setAttribute('data-cell', kind);
      cell.setAttribute('data-for', critId);
      cell.setAttribute('data-shape', '');
      cell.setAttribute('data-fill', 'yellow');
      const value = span(doc, 'ps-matrix__value');
      cell.append(value);
      return [cell, value];
    };
    const [rating, ratingValue] = make('rating');
    const [score, scoreValue] = make('score');
    col.item.insertBefore(rating, col.foot);
    col.item.insertBefore(score, col.foot);
    const cells = { rating, ratingValue, score, scoreValue };
    col.cells.set(critId, cells);
    return cells;
  }

  function addCol(node: PsNode): Col {
    const detailsId = nextId('ps-matrix-details');
    const item = div(doc, 'ps-matrix__option');
    item.id = nextId('ps-matrix-option');
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-node', node.id);
    const head = titleButton('ps-matrix__head', detailsId);
    head.setAttribute('data-shape', '');
    head.setAttribute('data-fill', 'yellow');
    const words = span(doc, 'ps-matrix__words');
    const meta = span(doc, 'ps-matrix__meta');
    const title = span(doc, 'ps-matrix__title');
    words.append(meta, title);
    head.append(words);
    const bands = (['Rating', 'Score'] as const).map((label) => {
      const band = div(doc, `ps-matrix__band ps-matrix__band--${label.toLowerCase()}`);
      band.setAttribute('data-shape', '');
      band.setAttribute('data-fill', 'red');
      band.setAttribute('aria-hidden', 'true');
      band.append(span(doc, 'ps-matrix__band-label ps-matrix__band-label--tilt', label));
      return band;
    });
    const foot = div(doc, 'ps-matrix__foot');
    item.append(head, ...bands, foot);
    const card = detailsCard(doc, node, 'yellow', detailsId);
    card.setAttribute('data-for', node.id);
    frame!.panel.append(card);
    group.register(card, head);

    const tab = doc.createElement('button');
    tab.type = 'button';
    tab.className = 'ps-matrix__tab';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', 'false');
    tab.setAttribute('aria-controls', item.id);
    tab.setAttribute('data-for', node.id);
    const tabCode = span(doc, 'ps-matrix__tab-code');
    const tabTitle = span(doc, 'ps-matrix__tab-title');
    tab.append(tabCode, tabTitle);
    tab.addEventListener('click', () => {
      picked = true;
      select(node.id);
    });
    // Arrow keys move along the tabs (roving focus), as a tab list should.
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      const all = order.opts.map((opt) => cols.get(opt.id)!.tab);
      const next = all[(all.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
      event.preventDefault();
      next.click();
      next.focus();
    });
    frame!.tabs.append(tab);

    const strip = div(doc, 'ps-matrix__strip-item');
    strip.setAttribute('data-for', node.id);
    const stripCode = span(doc, 'ps-matrix__strip-code');
    const stripTitle = span(doc, 'ps-matrix__strip-title');
    const stripTotal = span(doc, 'ps-matrix__strip-total');
    strip.append(stripCode, stripTitle, stripTotal);
    frame!.strip.append(strip);

    const col: Col = { node, item, head, meta, title, words, cells: new Map(), foot, total: null, card, tab, tabCode, tabTitle, strip, stripCode, stripTitle, stripTotal };
    cols.set(node.id, col);
    return col;
  }

  function removeRow(id: string): void {
    const row = rows.get(id);
    if (!row) return;
    group.unregister(row.card);
    row.item.remove();
    row.card.remove();
    rows.delete(id);
    for (const col of cols.values()) {
      const cells = col.cells.get(id);
      cells?.rating.remove();
      cells?.score.remove();
      col.cells.delete(id);
    }
  }

  function removeCol(id: string): void {
    const col = cols.get(id);
    if (!col) return;
    group.unregister(col.card);
    for (const el of [col.item, col.card, col.tab, col.strip]) el.remove();
    cols.delete(id);
    shownTotals.delete(id);
    if (selected === id) {
      selected = null;
      picked = false;
    }
  }

  const contested = (node: PsNode): string => (node.state === 'contested' ? ', contested' : '');

  function paintRow(row: Row, node: PsNode, i: number): void {
    row.node = node;
    row.item.setAttribute('data-row', String(i + 1));
    setText(row.code, letter(i));
    setText(row.title, nodeTitle(node));
    const label = `Criterion ${letter(i)}: ${nodeTitle(node)}${contested(node)}. Show details`;
    if (row.button.getAttribute('aria-label') !== label) row.button.setAttribute('aria-label', label);
    syncContested(row.item, node, row.words, row.button);
  }

  function paintCol(col: Col, node: PsNode, j: number): void {
    col.node = node;
    const n = String(j + 1);
    col.item.setAttribute('data-option', n);
    setText(col.meta, `Option ${n}`);
    setText(col.title, nodeTitle(node));
    setText(col.tabCode, n);
    setText(col.tabTitle, nodeTitle(node));
    setText(col.stripCode, n);
    setText(col.stripTitle, nodeTitle(node));
    const label = `Option ${n}: ${nodeTitle(node)}${contested(node)}. Show details`;
    if (col.head.getAttribute('aria-label') !== label) col.head.setAttribute('aria-label', label);
    syncContested(col.item, node, col.words, col.head);
  }

  // ---------------------------------------------------------------- scores and totals

  const formatTotal = (value: number, mode: Snapshot['mode']): string => (mode === 'percent' ? value.toFixed(1) : String(Math.round(value)));

  function paintCells(): void {
    const s = snapshot;
    order.crits.forEach((crit, i) => {
      const row = rows.get(crit.id)!;
      const w = s?.weights[i];
      setText(row.weightValue, s && w !== undefined ? (s.mode === 'percent' ? `${w}%` : `Rank ${w}`) : '');
      order.opts.forEach((opt, j) => {
        const cells = cols.get(opt.id)!.cells.get(crit.id)!;
        const rating = s?.ratings[j]?.[i];
        const ok = s && w !== undefined && rating !== undefined;
        setText(cells.ratingValue, ok ? String(rating) : '');
        setText(cells.scoreValue, ok ? ((rating! * w!) / (s!.mode === 'percent' ? 100 : 1)).toFixed(1) : '');
      });
    });
  }

  function writeTotals(values: Map<string, number>): void {
    const mode = snapshot?.mode ?? 'percent';
    for (const [id, value] of values) {
      shownTotals.set(id, value);
      const col = cols.get(id);
      if (!col) continue;
      const text = formatTotal(value, mode);
      if (col.total) setText(col.total.value, text);
      setText(col.stripTotal, text);
    }
  }

  function stopCount(): void {
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    raf = 0;
  }

  /** Count the totals from what is on screen to the targets over 600ms. */
  function countTo(targets: Map<string, number>, animate: boolean): void {
    stopCount();
    if (!animate || typeof requestAnimationFrame !== 'function' || !canAnimate(root)) {
      writeTotals(targets);
      return;
    }
    const from = new Map([...targets.keys()].map((id) => [id, shownTotals.get(id) ?? 0]));
    const t0 = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - t0) / COUNT_MS);
      const k = 1 - (1 - t) ** 3;
      writeTotals(new Map([...targets].map(([id, to]) => [id, t >= 1 ? to : from.get(id)! + (to - from.get(id)!) * k])));
      raf = t < 1 ? requestAnimationFrame(step) : 0;
    };
    raf = requestAnimationFrame(step);
  }

  function syncTotals(): void {
    const result = snapshot && lastRun ? (matrixTotals(lastRun) as { totals: number[]; leader: number | null } | null) : null;
    const next = new Map<string, number>();
    if (result) order.opts.forEach((opt, j) => next.set(opt.id, result.totals[j]));
    const fresh: HTMLDivElement[] = [];
    for (const opt of order.opts) {
      const col = cols.get(opt.id)!;
      if (result && !col.total) {
        const tag = div(doc, 'ps-matrix__total');
        tag.setAttribute('data-total', String(order.opts.indexOf(opt) + 1));
        tag.setAttribute('data-shape', '');
        tag.setAttribute('data-fill', 'blue');
        const value = span(doc, 'ps-matrix__total-value');
        tag.append(span(doc, 'ps-matrix__tag', 'Total'), value);
        col.foot.append(tag);
        col.total = { tag, value };
        fresh.push(tag);
      } else if (!result && col.total) {
        col.total.tag.remove();
        col.total = null;
      }
      if (col.total) col.total.tag.setAttribute('data-total', String(order.opts.indexOf(opt) + 1));
      if (!result) setText(col.stripTotal, '');
      col.item.classList.toggle('is-leading', !!result && result.leader === order.opts.indexOf(opt));
      col.strip.classList.toggle('is-leading', !!result && result.leader === order.opts.indexOf(opt));
    }
    if (!result) shownTotals.clear();
    // Compared with the last targets, not the screen, so an identical update mid-count changes nothing.
    const moved = next.size !== targetTotals.size || [...next].some(([id, v]) => targetTotals.get(id) !== v);
    targetTotals = next;
    if (result && moved) countTo(next, painted);
    if (painted) for (const tag of fresh) if (canAnimate(tag)) tag.animate([{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 120, easing: EASE, fill: 'backwards' });
    const tie = !!result && result.leader === null;
    setText(frame!.note, tie ? 'Tied at the top' : '');
    frame!.note.classList.toggle('is-tie', tie);
  }

  // ---------------------------------------------------------------- layout

  /** Write the grid tracks and every placement for the options that show. */
  function place(): void {
    if (!frame) return;
    const m = order.crits.length;
    const shown = compact ? order.opts.filter((opt) => opt.id === selected) : order.opts;
    setStyle(frame.grid, 'gridTemplateColumns', ['var(--ps-matrix-gutter)', 'minmax(0, 1.9fr)', 'minmax(0, 1fr)', ...shown.flatMap(() => ['minmax(0, 1fr)', 'minmax(0, 1fr)'])].join(' '));
    setStyle(frame.grid, 'gridTemplateRows', ['auto', 'auto', ...order.crits.map(() => 'minmax(var(--ps-matrix-row), auto)'), 'auto'].join(' '));
    order.crits.forEach((crit, i) => setStyle(rows.get(crit.id)!.item, 'gridRow', String(3 + i)));
    order.opts.forEach((opt) => {
      const col = cols.get(opt.id)!;
      const at = shown.indexOf(opt);
      col.item.hidden = at < 0;
      if (at >= 0) {
        setStyle(col.item, 'gridColumn', `${4 + 2 * at} / span 2`);
        setStyle(col.item, 'gridRow', `1 / span ${m + 3}`);
      }
      order.crits.forEach((crit, i) => {
        const cells = col.cells.get(crit.id)!;
        for (const cell of [cells.rating, cells.score]) {
          setStyle(cell, 'gridRow', String(3 + i));
          // The first line sits right under the band, with no paper rule above it.
          if (cell.getAttribute('data-line') !== String(i + 1)) cell.setAttribute('data-line', String(i + 1));
        }
      });
      setStyle(col.foot, 'gridRow', String(3 + m));
      const on = opt.id === selected;
      col.tab.setAttribute('aria-selected', String(on));
      col.tab.tabIndex = on ? 0 : -1;
      col.strip.classList.toggle('is-selected', on);
    });
    frame.tabs.hidden = !compact || !order.opts.length;
    frame.strip.hidden = !compact || !order.opts.length;
    root.setAttribute('data-compact', String(compact));
  }

  /** No details card stays open for an option that is no longer showing. */
  function closeHidden(): void {
    for (const col of cols.values()) if (col.item.hidden && col.card.classList.contains('is-open')) group.close();
  }

  function select(id: string): void {
    if (selected === id && frame) return;
    selected = id;
    place();
    closeHidden();
  }

  function setCompact(next: boolean): void {
    if (next === compact) return;
    compact = next;
    place();
    closeHidden();
  }

  function layoutFor(px: number): void {
    widthOverride = px;
    setCompact(px <= COMPACT_MAX);
  }

  // Container width decides one option at a time (phone) or all of them.
  const observer =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          if (destroyed || widthOverride !== null) return;
          const w = root.getBoundingClientRect().width;
          if (!w || Math.abs(w - width) < 0.5) return;
          width = w;
          setCompact(w <= COMPACT_MAX);
        })
      : null;
  observer?.observe(root);

  // ---------------------------------------------------------------- score form

  function field(label: string, aria: string, value: string, attrs: Record<string, string>): HTMLLabelElement {
    const wrap = doc.createElement('label');
    wrap.className = 'ps-matrix__field';
    const name = span(doc, 'ps-matrix__field-name', label);
    const input = doc.createElement('input');
    input.type = 'number';
    input.inputMode = 'numeric';
    input.step = '1';
    input.className = 'ps-matrix__input';
    input.setAttribute('aria-label', aria);
    for (const [k, v] of Object.entries(attrs)) input.setAttribute(k, v);
    input.value = value;
    wrap.append(name, input);
    return wrap;
  }

  function readForm(): MatrixScores {
    const mode = (form!.querySelector<HTMLInputElement>('input[name="ps-matrix-mode"]:checked')?.value ?? 'percent') as MatrixScores['mode'];
    const weights = order.crits.map((crit) => numberOf(form!.querySelector<HTMLInputElement>(`input[data-weight="${crit.id}"]`)!));
    const ratings = order.opts.map((opt) => order.crits.map((crit) => numberOf(form!.querySelector<HTMLInputElement>(`input[data-rating="${opt.id}:${crit.id}"]`)!)));
    return { mode, weights, ratings };
  }

  /** The live line, the validation message and whether Save is allowed. */
  function validate(): void {
    if (!form || !lastRun) return;
    const scores = readForm();
    const sum = scores.weights.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
    setText(sumLine!, scores.mode === 'percent' ? `Adds up to ${sum} of 100` : `Use 1 to ${order.crits.length} once each`);
    for (const input of form.querySelectorAll<HTMLInputElement>('input[data-weight]')) {
      input.min = scores.mode === 'percent' ? '0' : '1';
      input.max = scores.mode === 'percent' ? '100' : String(order.crits.length);
    }
    const problem = decisionMatrix.validateScores(lastRun, scores) as string | null;
    setText(message!, problem ?? '');
    message!.hidden = !problem;
    save!.disabled = !!problem;
  }

  const keyOf = (): string => `${order.crits.map((n) => n.id).join()}|${order.opts.map((n) => n.id).join()}`;

  /** Build the fields, filled from what was typed (keep), else the latest snapshot. */
  function buildForm(keep: Map<string, string> | null): void {
    if (!form || !formBody) return;
    const prior = lastRun?.scores?.snapshots?.at(-1) as Partial<Snapshot> | undefined;
    const mode = keep?.get('mode') ?? (prior?.mode === 'rank' ? 'rank' : 'percent');
    const modes = doc.createElement('fieldset');
    modes.className = 'ps-matrix__modes';
    const modeLegend = doc.createElement('legend');
    modeLegend.textContent = 'Weights as';
    modes.append(modeLegend);
    for (const [value, text] of [['percent', 'Percent'], ['rank', 'Rank']] as const) {
      const label = doc.createElement('label');
      label.className = 'ps-matrix__mode';
      const radio = doc.createElement('input');
      radio.type = 'radio';
      radio.name = 'ps-matrix-mode';
      radio.value = value;
      radio.checked = value === mode;
      label.append(radio, span(doc, 'ps-matrix__mode-name', text));
      modes.append(label);
    }

    const weights = doc.createElement('fieldset');
    weights.className = 'ps-matrix__group';
    const weightLegend = doc.createElement('legend');
    weightLegend.textContent = 'Weights';
    weights.append(weightLegend);
    order.crits.forEach((crit, i) => {
      const was = keep?.get(`w:${crit.id}`) ?? (Number.isInteger(prior?.weights?.[i]) ? String(prior!.weights![i]) : '');
      weights.append(field(`${letter(i)}  ${nodeTitle(crit)}`, `Weight for ${nodeTitle(crit)}`, was, { 'data-weight': crit.id }));
    });
    sumLine = doc.createElement('p');
    sumLine.className = 'ps-matrix__sum';
    sumLine.setAttribute('aria-live', 'polite');
    weights.append(sumLine);

    const ratingSets = order.opts.map((opt, j) => {
      const set = doc.createElement('fieldset');
      set.className = 'ps-matrix__group ps-matrix__group--option';
      const legend = doc.createElement('legend');
      legend.textContent = `Option ${j + 1}: ${nodeTitle(opt)}`;
      set.append(legend);
      order.crits.forEach((crit, i) => {
        const was = keep?.get(`r:${opt.id}:${crit.id}`) ?? (Number.isInteger(prior?.ratings?.[j]?.[i]) ? String(prior!.ratings![j][i]) : '');
        set.append(field(`${letter(i)}  ${nodeTitle(crit)}`, `Rating for ${nodeTitle(opt)} on ${nodeTitle(crit)}`, was, { 'data-rating': `${opt.id}:${crit.id}`, min: '1', max: '10' }));
      });
      return set;
    });
    formBody.replaceChildren(modes, weights, ...ratingSets);
    formKey = keyOf();
    validate();
  }

  function keepTyped(): Map<string, string> {
    const keep = new Map<string, string>();
    const mode = form!.querySelector<HTMLInputElement>('input[name="ps-matrix-mode"]:checked');
    if (mode) keep.set('mode', mode.value);
    for (const input of form!.querySelectorAll<HTMLInputElement>('input[data-weight]')) keep.set(`w:${input.getAttribute('data-weight')}`, input.value);
    for (const input of form!.querySelectorAll<HTMLInputElement>('input[data-rating]')) keep.set(`r:${input.getAttribute('data-rating')}`, input.value);
    return keep;
  }

  /** Opening fills from the latest snapshot and focuses the first field; closing returns to the toggle. */
  function setOpen(open: boolean): void {
    if (!form || !toggle) return;
    form.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      buildForm(null);
      (form.querySelector<HTMLInputElement>('input:checked') ?? form.querySelector<HTMLInputElement>('input'))?.focus();
    } else toggle.focus();
  }

  function ensureScoring(): void {
    if (scoring) return;
    scoring = div(doc, 'ps-matrix__scoring');
    toggle = doc.createElement('button');
    toggle.type = 'button';
    toggle.className = 'ps-matrix__score';
    toggle.textContent = 'Score the options';
    toggle.setAttribute('aria-expanded', 'false');
    form = doc.createElement('form');
    form.className = 'ps-matrix__form';
    form.id = nextId('ps-matrix-form');
    form.setAttribute('aria-label', 'Weight the criteria and rate each option');
    form.hidden = true;
    form.noValidate = true;
    toggle.setAttribute('aria-controls', form.id);
    formBody = div(doc, 'ps-matrix__form-body');
    message = doc.createElement('p');
    message.className = 'ps-matrix__message';
    message.setAttribute('aria-live', 'polite');
    const actions = div(doc, 'ps-matrix__form-actions');
    actions.setAttribute('role', 'group');
    actions.setAttribute('aria-label', 'Score actions');
    const cancel = doc.createElement('button');
    cancel.type = 'button';
    cancel.className = 'ps-matrix__cancel';
    cancel.textContent = 'Cancel';
    save = doc.createElement('button');
    save.type = 'submit';
    save.className = 'ps-matrix__save';
    save.textContent = 'Save scores';
    actions.append(cancel, save);
    form.append(formBody, message, actions);
    toggle.addEventListener('click', () => setOpen(form!.hidden));
    cancel.addEventListener('click', () => setOpen(false));
    form.addEventListener('input', validate);
    form.addEventListener('change', validate);
    form.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      validate();
      if (save!.disabled) return;
      handler?.(readForm());
      setOpen(false);
    });
    scoring.append(toggle, form);
  }

  // ---------------------------------------------------------------- update

  function update(run: PsToolRun): void {
    lastRun = run;
    const crits = criteriaOf(run) as PsNode[];
    const opts = optionsOf(run) as PsNode[];
    if (!crits.length && !opts.length) {
      if (frame) teardown();
      painted = true;
      return;
    }
    ensureFrame();

    // Drop what an undo took away: rows (and their cells in every column), then columns.
    const critIds = new Set(crits.map((n) => n.id));
    const optIds = new Set(opts.map((n) => n.id));
    for (const id of [...rows.keys()]) if (!critIds.has(id)) removeRow(id);
    for (const id of [...cols.keys()]) if (!optIds.has(id)) removeCol(id);
    order = { crits, opts };

    const newRows: HTMLElement[] = [];
    const newCols: Col[] = [];
    const newCells: HTMLElement[] = [];
    crits.forEach((node, i) => {
      let row = rows.get(node.id);
      if (!row) {
        row = addRow(node);
        newRows.push(row.item);
      }
      const at = frame!.grid.children[4 + i];
      if (at !== row.item) frame!.grid.insertBefore(row.item, at ?? null);
      paintRow(row, node, i);
    });
    opts.forEach((node, j) => {
      let col = cols.get(node.id);
      if (!col) {
        col = addCol(node);
        newCols.push(col);
      }
      // Columns follow every row in the DOM, in option order; tabs and strip items likewise.
      const at = frame!.grid.children[4 + crits.length + j];
      if (at !== col.item) frame!.grid.insertBefore(col.item, at ?? null);
      if (frame!.tabs.children[j] !== col.tab) frame!.tabs.insertBefore(col.tab, frame!.tabs.children[j] ?? null);
      if (frame!.strip.children[j] !== col.strip) frame!.strip.insertBefore(col.strip, frame!.strip.children[j] ?? null);
      crits.forEach((crit, i) => {
        let cells = col!.cells.get(crit.id);
        if (!cells) {
          cells = addCells(col!, crit.id);
          if (!newCols.includes(col!)) newCells.push(cells.rating, cells.score);
        }
        // Keep cells in row order before the foot, so reading order follows the rows.
        const want = col!.item.children[3 + 2 * i];
        if (want !== cells.rating) col!.item.insertBefore(cells.rating, want ?? col!.foot);
        if (cells.rating.nextElementSibling !== cells.score) col!.item.insertBefore(cells.score, cells.rating.nextElementSibling);
      });
      paintCol(col, node, j);
    });

    // Scores: cells, totals, the leader and the tie note.
    snapshot = currentSnapshot(run, crits.length, opts.length);
    const at = (run.scores?.snapshots?.at(-1) as { at?: string } | undefined)?.at ?? null;
    const newSnapshot = at !== lastAt;
    lastAt = at;
    paintCells();
    syncTotals();

    // Which option the phone shows: the person's pick, else the leader after a new snapshot, else the first.
    const result = snapshot ? (matrixTotals(run) as { leader: number | null } | null) : null;
    if (!selected || !optIds.has(selected)) {
      selected = opts[result?.leader ?? 0]?.id ?? opts[0]?.id ?? null;
    } else if (newSnapshot && !picked && result && result.leader !== null) {
      selected = opts[result.leader].id;
    }
    place();
    closeHidden();

    // Scoring once there are two criteria and two options.
    if (crits.length >= 2 && opts.length >= 2) {
      ensureScoring();
      if (form && !form.hidden && formKey !== keyOf()) {
        const active = doc.activeElement as HTMLElement | null;
        const focusedKey = active?.closest('form') === form ? active!.getAttribute('data-weight') ?? active!.getAttribute('data-rating') : null;
        buildForm(keepTyped());
        const back = focusedKey ? form.querySelector<HTMLInputElement>(`input[data-weight="${focusedKey}"], input[data-rating="${focusedKey}"]`) : null;
        if (focusedKey) (back ?? form.querySelector<HTMLInputElement>('input'))?.focus();
      } else if (form && !form.hidden) validate();
    }
    if (crits.length >= 2 && opts.length >= 2) {
      if (scoring!.parentElement !== frame!.foot) frame!.foot.prepend(scoring!);
    } else if (scoring?.parentElement) {
      // An undo took scoring away: close the form (without stealing focus) and detach it.
      form!.hidden = true;
      toggle!.setAttribute('aria-expanded', 'false');
      scoring.remove();
    }
    choice.sync(run, frame!.foot, painted);

    // Motion for what is new, never on the first paint of a saved run.
    if (painted) {
      const stagger = (i: number): number => Math.min(i * 60, 300);
      newRows.forEach((el, i) => {
        if (canAnimate(el)) el.animate([{ opacity: 0, transform: 'translateY(-12px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: stagger(i), easing: EASE, fill: 'backwards' });
      });
      newCols.forEach((col, i) => {
        if (col.item.hidden || !canAnimate(col.head)) return;
        col.head.animate([{ transform: 'scaleY(0)' }, { transform: 'none' }], { duration: 460, delay: stagger(i), easing: EASE, fill: 'backwards' });
        for (const el of col.item.querySelectorAll<HTMLElement>('.ps-matrix__band, .ps-matrix__cell, .ps-matrix__foot')) {
          el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: stagger(i) + 200, easing: EASE, fill: 'backwards' });
        }
      });
      for (const el of newCells) if (canAnimate(el)) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: 160, easing: EASE, fill: 'backwards' });
    }
    painted = true;
  }

  return {
    el: root,
    update,
    onScore(cb) {
      handler = cb;
    },
    layout: layoutFor,
    /** Stop the size watch, the count-up and any motion once the canvas drops this view. */
    destroy() {
      destroyed = true;
      observer?.disconnect();
      stopCount();
      cancelAnimations(root);
    }
  };
}
