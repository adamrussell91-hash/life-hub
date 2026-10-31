import '../styles/walkthrus-proof.css';
import type { Proof, ProofLesson, ProofRow } from '@/api/walkthrus-proof';

/**
 * Proof on the WalkThrus board: pure DOM builders the board calls.
 *   proofMark          the small mark on a tile: '+', '−', 'few' (not enough lessons yet), or null
 *   renderWhatsWorking the ranked list in Learning
 *   renderProofStrip   the strip in a tile's panel: a dot per lesson, the two averages, the counts
 *
 * Both renderers append their section to `host` and return it; the caller clears the host if it wants.
 *
 * Copy rule: numbers, the class and the counts only. The words "works", "worked", "better" and
 * "effective" never appear; the reader draws the conclusion.
 */

export type ProofMark = '+' | '−' | 'few';

const rowsFor = (tileId: string, proof: Proof | null | undefined): ProofRow[] => (proof?.rows ?? []).filter((r) => r.tile_id === tileId);

/**
 * The mark on a tile. Null when the tile has no scored lessons at all. With enough lessons in at
 * least one class, the sign of the summed differences of those classes ('+' for zero or more);
 * otherwise 'few'.
 */
export function proofMark(tileId: string, proof: Proof | null | undefined): ProofMark | null {
  const rows = rowsFor(tileId, proof);
  if (!rows.length) return null;
  const enough = rows.filter((r) => r.enough && r.diff !== null);
  if (!enough.length) return 'few';
  return enough.reduce((s, r) => s + (r.diff ?? 0), 0) < 0 ? '−' : '+';
}

/** "+12 points", "−3 points", "0 points": the difference in percentage points. */
export function formatPoints(diff: number | null): string {
  if (diff === null) return '–';
  const points = Math.round(diff * 100);
  if (points === 0) return '0 points';
  return `${points > 0 ? '+' : '−'}${Math.abs(points)} ${Math.abs(points) === 1 ? 'point' : 'points'}`;
}

const pct = (score: number | null): string => (score === null ? '–' : `${Math.round(score * 100)}%`);
const lessons = (n: number): string => `${n} ${n === 1 ? 'lesson' : 'lessons'}`;

/** "(6 lessons with it, 9 without)" */
export function formatCounts(row: ProofRow): string {
  return `(${lessons(row.ran.n)} with it, ${row.none.n} without)`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const classOf = (proof: Proof, classId: string): string => proof.classes?.[classId] ?? 'Class';

export interface WhatsWorkingOptions {
  titleOf: (tileId: string) => string;
  codeOf?: (tileId: string) => string | null;
  onOpen?: (tileId: string) => void;
}

function listRow(row: ProofRow, proof: Proof, opts: WhatsWorkingOptions): HTMLElement {
  const item = el('li', `wtp-row${row.enough ? '' : ' is-few'}`);
  const open = el('button', 'wtp-row__open');
  open.type = 'button';
  open.dataset.tile = row.tile_id;
  const code = opts.codeOf?.(row.tile_id);
  if (code) open.append(el('span', 'wtp-row__code', code));
  const name = el('span', 'wtp-row__name', opts.titleOf(row.tile_id));
  const cls = el('span', 'wtp-row__class', classOf(proof, row.class_id));
  const diff = el('span', `wtp-row__diff${row.diff !== null && row.diff < 0 ? ' is-minus' : ''}`, formatPoints(row.diff));
  const counts = el('span', 'wtp-row__counts', formatCounts(row));
  const partly = row.partly.n ? el('span', 'wtp-row__partly', `${row.partly.n} partly`) : null;
  open.append(name, cls, diff, counts, ...(partly ? [partly] : []));
  open.setAttribute('aria-label', `${opts.titleOf(row.tile_id)}, ${classOf(proof, row.class_id)}: ${formatPoints(row.diff)} ${formatCounts(row)}`);
  if (opts.onOpen) open.addEventListener('click', () => opts.onOpen!(row.tile_id));
  else open.disabled = true;
  item.append(open);
  return item;
}

/**
 * "What's working": every tile and class ranked, the largest difference first. Rows with fewer
 * than 4 lessons on either side sit under a line marked "Not enough lessons yet".
 */
export function renderWhatsWorking(host: HTMLElement, proof: Proof | null | undefined, opts: WhatsWorkingOptions): HTMLElement {
  const wrap = el('section', 'wtp');
  wrap.setAttribute('aria-label', 'What’s working');
  wrap.append(el('h2', 'wtp__title', 'What’s working'));
  const rows = proof?.rows ?? [];
  if (!proof || !rows.length) {
    wrap.append(el('p', 'wtp__empty', 'No scored lessons with a WalkThru yet. Tick the steps in a lesson that has a quiz.'));
    host.append(wrap);
    return wrap;
  }
  wrap.append(el('p', 'wtp__key', 'Class quiz score in lessons with it, minus the same class’s lessons with no WalkThru run.'));
  const enough = rows.filter((r) => r.enough);
  const few = rows.filter((r) => !r.enough);
  if (enough.length) {
    const list = el('ol', 'wtp__list');
    for (const row of enough) list.append(listRow(row, proof, opts));
    wrap.append(list);
  }
  if (few.length) {
    wrap.append(el('p', 'wtp__divider', 'Not enough lessons yet'));
    const list = el('ul', 'wtp__list wtp__list--few');
    for (const row of few) list.append(listRow(row, proof, opts));
    wrap.append(list);
  }
  host.append(wrap);
  return wrap;
}

function dot(lesson: ProofLesson, hollow: boolean): HTMLElement {
  const d = el('span', `wtp-dot${hollow ? ' is-hollow' : ''}`);
  d.style.left = `${Math.max(0, Math.min(100, lesson.score * 100))}%`;
  d.title = `${lesson.date ?? 'Undated'} · ${pct(lesson.score)}${hollow ? ' · partly' : ''}`;
  return d;
}

function avgLine(mean: number | null, className: string, label: string): HTMLElement | null {
  if (mean === null) return null;
  const line = el('span', `wtp-avg ${className}`);
  line.style.left = `${mean * 100}%`;
  line.title = `${label}: ${pct(mean)}`;
  return line;
}

/**
 * The Proof strip in a tile's panel: per class, a dot per ran lesson placed by its score (partly
 * runs hollow, not averaged), the average with it and without any WalkThru, and the counts.
 */
export function renderProofStrip(host: HTMLElement, tileId: string, proof: Proof | null | undefined): HTMLElement {
  const wrap = el('section', 'wtp-strip');
  wrap.append(el('h3', 'wtp-strip__title', 'Proof'));
  const rows = proof ? rowsFor(tileId, proof) : [];
  if (!proof || !rows.length) {
    wrap.append(el('p', 'wtp__empty', 'No scored lessons with this yet.'));
    host.append(wrap);
    return wrap;
  }
  for (const row of rows) {
    const block = el('div', 'wtp-class');
    const head = el('div', 'wtp-class__head');
    head.append(el('span', 'wtp-class__name', classOf(proof, row.class_id)), el('span', `wtp-row__diff${row.diff !== null && row.diff < 0 ? ' is-minus' : ''}`, formatPoints(row.diff)));
    const track = el('div', 'wtp-track');
    track.setAttribute('role', 'img');
    track.setAttribute('aria-label', `Lesson scores from 0 to 100%: ${row.ran.lessons.map((l) => pct(l.score)).join(', ') || 'none'} with it${row.partly.n ? `; ${row.partly.lessons.map((l) => pct(l.score)).join(', ')} partly` : ''}`);
    const none = avgLine(row.none.mean, 'is-none', 'Average without any WalkThru');
    const ran = avgLine(row.ran.mean, 'is-ran', 'Average with it');
    if (none) track.append(none);
    if (ran) track.append(ran);
    for (const lesson of row.ran.lessons) track.append(dot(lesson, false));
    for (const lesson of row.partly.lessons) track.append(dot(lesson, true));
    const scale = el('div', 'wtp-scale');
    scale.append(el('span', '', '0%'), el('span', '', '100%'));
    const facts = el('dl', 'wtp-facts');
    const fact = (term: string, value: string, className: string): void => {
      const dt = el('dt', className, term);
      facts.append(dt, el('dd', '', value));
    };
    fact('With it', `${pct(row.ran.mean)} average · ${lessons(row.ran.n)}`, 'is-ran');
    fact('No WalkThru', `${pct(row.none.mean)} average · ${lessons(row.none.n)}`, 'is-none');
    if (row.partly.n) fact('Partly', `${lessons(row.partly.n)}, not averaged`, 'is-partly');
    block.append(head, track, scale, facts);
    if (!row.enough) block.append(el('p', 'wtp-class__few', 'Not enough lessons yet (4 each side)'));
    wrap.append(block);
  }
  host.append(wrap);
  return wrap;
}
