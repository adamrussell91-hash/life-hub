/**
 * The teacher-only Over time tab on a student's page (`?tab=over-time`). Everything tagged,
 * week by week, against the class; a row per tag with the dated work behind it; deep
 * understandings, marking codes, habits, and the teacher's private notes. Read only, except
 * notes and saved groups. Never marks anything as seen.
 */
import { apiGet, apiPost } from '@/api/client';
import { getCurriculum } from '@/app/curriculum-state';
import { navigate } from '@/app/router';
import { placements } from '@/deep/derive';
import { deepApi, type DeepProgress } from '@/deep/api';
import { piecesFor, type DeepUnderstanding, type Tier } from '@/deep/schema';
import { classEvidence } from '@/evidence/class-evidence';
import { loadInsightContext, type InsightContext } from '@/evidence/context';
import { newGroupId } from '@/evidence/groups';
import type { Source } from '@/evidence/markbook-evidence';
import {
  BAND_LABEL,
  CHIP_KINDS,
  CHIP_LABEL,
  KIND_NAME,
  VOCAB_TAG,
  codeTrend,
  duLadder,
  overTime,
  rangeStart,
  type ChipKind,
  type OtEventKind,
  type OtTag,
  type OverTime,
  type OverTimeRange,
  type TermSpan,
  type VocabWeek
} from '@/evidence/over-time';
import { kindOf, tagLabel } from '@/evidence/tags';
import type { Evidence } from '@/evidence/types';
import { formatDay, sydneyDay, todayInSydney } from '@/markbook/calc';
import { httpMarkbookApi } from '@/markbook/api';
import type { Markbook } from '@/markbook/schema';
import type { MarkbookView } from '@/markbook/types';
import { codeChip } from '@/progress/code-grid';
import type { CodeRow, PieceCol, ReturnedItem } from '@/progress/types';
import { el } from '@/quiz/dom';
import type { Unit } from '@/schemas';
import type { Block } from '@/schemas/block';
import { defaultTermDatesForYear } from '@/scope/timeline-dates';
import './over-time.css';

/** Rows in Every tag before "Show all". */
const TAG_ROWS_SHOWN = 12;

// ── Server contract ──────────────────────────────────────────────────

export type TeacherNote = { id: string; at: string; text: string; tag?: string; edited_at?: string };
export type Habits = {
  organiser: { streak: number; avg_box: number | null; weekly: VocabWeek[] } | null;
  redrafts: number;
  steps: { set: number; acted: number | null };
};
/** What the tab needs from the class's curriculum, already picked out. */
export type ClassFrame = { terms: TermSpan[]; unit: Unit | null; unitStart: string | null; deep: DeepUnderstanding[] };

export type OverTimeApi = {
  markbook: (classId: string) => Promise<MarkbookView>;
  context: () => Promise<InsightContext>;
  frame: (classId: string, today: string) => Promise<ClassFrame>;
  deep: (classId: string, unitId: string) => Promise<DeepProgress>;
  profile: <T>(action: string, extra?: Record<string, unknown>) => Promise<T>;
  lessons: (unit: Unit) => Promise<Array<{ id: string; blocks?: Block[] }>>;
  addMembers: (classId: string, groupId: string, student: string, why: string, today: string) => Promise<Markbook>;
  saveGroup: (classId: string, group: { id: string; name: string; tags: string[]; members: Array<{ student: string; why: string }> }, today: string) => Promise<Markbook>;
};

export type OverTimeViewOptions = {
  classId: string;
  studentId: string;
  name: string;
  /** From the page's `progress` payload: marking codes and returned pieces. */
  codes?: CodeRow[];
  pieces?: PieceCol[];
  loadReturned?: () => Promise<ReturnedItem[]>;
  /** Test seams. */
  api?: Partial<OverTimeApi>;
  today?: string;
};

/** The class's terms, current unit, the unit's first lesson and its deep understandings, from the curriculum. */
async function classFrame(classId: string, today: string): Promise<ClassFrame> {
  const curriculum = await getCurriculum();
  const cls = curriculum.classes.find((c) => c.id === classId);
  const year = Number(today.slice(0, 4));
  const subject = cls ? curriculum.subjects.find((s) => s.id === cls.subject_id) : undefined;
  const scope = subject?.scope_id ? curriculum.scope_sequences.find((s) => s.id === subject.scope_id) : undefined;
  let terms: TermSpan[] = (scope?.terms ?? [])
    .filter((t) => t.start_date && t.end_date)
    .map((t) => ({ number: t.term_number, start: t.start_date!, end: t.end_date! }));
  if (!terms.some((t) => t.start.startsWith(String(year)))) terms = [1, 2, 3, 4].map((n) => ({ number: n, ...defaultTermDatesForYear(year, n) }));
  const unitId = cls?.current_unit_id ?? cls?.active_unit_ids[0];
  const unit = unitId ? (curriculum.units.find((u) => u.id === unitId) ?? null) : null;
  const dates = curriculum.scheduled_lessons.filter((r) => r.class_id === classId && r.unit_id === unitId).map((r) => r.date).sort();
  const deep = (unit?.deep_understandings ?? []) as DeepUnderstanding[];
  return { terms, unit, unitStart: dates[0] ?? null, deep };
}

function defaultApi(classId: string, studentId: string): OverTimeApi {
  return {
    markbook: (id) => httpMarkbookApi.load(id),
    context: () => loadInsightContext(),
    frame: classFrame,
    deep: (id, unitId) => deepApi.load(id, unitId),
    profile: <T>(action: string, extra: Record<string, unknown> = {}) =>
      apiPost<T>(`/api/classes/${encodeURIComponent(classId)}/profile`, { action, student_id: studentId, ...extra }),
    lessons: (unit) => Promise.all(unit.lesson_ids.map((id) => apiGet<{ id: string; blocks?: Block[] }>(`/api/lessons/${encodeURIComponent(id)}`).catch(() => null))).then((rows) => rows.filter((l): l is { id: string; blocks?: Block[] } => !!l)),
    addMembers: (id, groupId, student, why, today) => httpMarkbookApi.addMembers(id, groupId, [{ student, why }], today),
    saveGroup: (id, group, today) => httpMarkbookApi.saveGroup(id, group, today)
  };
}

// ── Small drawing helpers ────────────────────────────────────────────

const SVG = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element, text?: string): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  parent?.append(node);
  return node;
}

const EVENT_COLOUR: Record<OtEventKind, string> = { quiz: 'var(--wave)', writing: 'var(--pastel-peach-ink)', viva: 'var(--pastel-lilac-ink)', sprint: 'var(--pastel-sage-ink)' };
const EVENT_NAME: Record<OtEventKind, string> = { quiz: 'Quiz', writing: 'Writing returned', viva: 'Viva', sprint: 'Sprint' };
const TIER_NAME: Record<Tier, string> = { essential: 'Essential', strong: 'Strong', sophisticated: 'Sophisticated' };
const BAND_CLASS = { secure: 'ot-band--secure', growing: 'ot-band--grow', gap: 'ot-band--gap', new: 'ot-band--new' } as const;

const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name;
/** Up to three sources in full; more reads as first to latest with a count. */
const sourceTrail = (names: string[]): string => (names.length <= 3 ? names.join(' → ') : `${names[0]} → ${names[names.length - 1]} · ${names.length} pieces`);

function pills<T extends string>(label: string, options: Array<[T, string]>, current: T, onPick: (v: T) => void): HTMLElement {
  const row = el('div', 'ot-pills');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', label);
  for (const [value, text] of options) {
    const b = el('button', `ot-pill${value === current ? ' is-on' : ''}`, text);
    b.type = 'button';
    b.dataset.value = value;
    b.setAttribute('aria-pressed', String(value === current));
    b.addEventListener('click', () => onPick(value));
    row.append(b);
  }
  return row;
}

/** The big weekly chart: the student's line, the class dashed, events as dots above, holidays as a gap line. */
function trendSvg(t: OverTime, who: string, phone: boolean): SVGSVGElement {
  const W = phone ? 340 : 860;
  const H = phone ? 200 : 230;
  const L = 34, R = 22, T = 34, B = 28;
  const n = t.weeks.length;
  const values = [...t.me, ...t.cls].filter((v): v is number => v !== null);
  let lo = Math.max(0, Math.floor((Math.min(...values, 100) - 5) / 10) * 10);
  let hi = Math.min(100, Math.ceil((Math.max(...values, 0) + 5) / 10) * 10);
  if (hi - lo < 30) {
    hi = Math.min(100, lo + 30);
    lo = hi - 30;
  }
  const x = (i: number): number => (n <= 1 ? (L + W - R) / 2 : L + (i / (n - 1)) * (W - L - R));
  const y = (v: number): number => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const meNow = [...t.me].reverse().find((v): v is number => v !== null);
  const meFirst = t.me.find((v): v is number => v !== null);
  const clsNow = [...t.cls].reverse().find((v): v is number => v !== null);
  const clsFirst = t.cls.find((v): v is number => v !== null);
  const root = svg('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    class: `ot-trend__svg ot-trend__svg--${phone ? 'phone' : 'desk'}`,
    'aria-label': `Weekly score across all tagged work${meFirst !== undefined ? `, ${who} from ${meFirst} to ${meNow} per cent` : ''}${clsFirst !== undefined ? `; class from ${clsFirst} to ${clsNow}` : ''}`
  });
  for (let g = lo; g <= hi; g += 10) {
    svg('line', { x1: L, x2: W - R, y1: y(g), y2: y(g), class: 'ot-grid' }, root);
    svg('text', { x: L - 6, y: y(g) + 4, 'text-anchor': 'end', class: 'ot-axis' }, root, String(g));
  }
  t.weeks.forEach((w, i) => {
    if (!w.gapBefore || i === 0) return;
    const gx = (x(i - 1) + x(i)) / 2;
    svg('line', { x1: gx, x2: gx, y1: T, y2: H - B, class: 'ot-gap' }, root);
    svg('text', { x: gx + 4, y: T + 10, class: 'ot-axis' }, root, 'holidays');
  });
  const byWeek = new Map<number, typeof t.events>();
  for (const e of t.events) byWeek.set(e.week, [...(byWeek.get(e.week) ?? []), e]);
  for (const [week, list] of byWeek) {
    list.forEach((e, k) => {
      const ex = x(week) + (k - (list.length - 1) / 2) * 11;
      const g = svg('g', { class: `ot-event ot-event--${e.kind}` }, root);
      svg('title', {}, g, `${e.title} · ${formatDay(e.date)}`);
      svg('line', { x1: ex, x2: ex, y1: T - 8, y2: H - B, stroke: EVENT_COLOUR[e.kind], 'stroke-opacity': 0.18 }, g);
      svg('circle', { cx: ex, cy: T - 14, r: 5, fill: EVENT_COLOUR[e.kind] }, g);
    });
  }
  const path = (arr: (number | null)[]): string =>
    arr
      .map((v, i) => (v === null ? null : [x(i), y(v)] as const))
      .filter((p): p is readonly [number, number] => p !== null)
      .map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
      .join(' ');
  svg('path', { d: path(t.cls), class: 'ot-line ot-line--cls' }, root);
  svg('path', { d: path(t.me), class: 'ot-line ot-line--me' }, root);
  t.me.forEach((v, i) => {
    if (v === null) return;
    const c = svg('circle', { cx: x(i), cy: y(v), r: 3.5, class: 'ot-dot' }, root);
    svg('title', {}, c, `${t.weeks[i]!.label}: ${v}%`);
  });
  const lastAt = t.me.map((v, i) => (v === null ? -1 : i)).reduce((a, b) => Math.max(a, b), -1);
  if (lastAt >= 0) svg('text', { x: x(lastAt) - 4, y: y(t.me[lastAt]!) - 10, 'text-anchor': 'end', class: 'ot-trend__now' }, root, `${t.me[lastAt]}%`);
  t.weeks.forEach((w, i) => {
    if (phone && i % 2) return;
    svg('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', class: 'ot-axis' }, root, w.label);
  });
  return root;
}

/** A row's small chart: its history and the class's latest as a dashed line. */
function spark(row: OtTag, w: number, h: number): SVGSVGElement {
  const root = svg('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, 'aria-hidden': 'true', class: 'ot-spark' });
  const n = row.history.length;
  const y = (v: number): number => h - 3 - (v / 100) * (h - 6);
  const x = (i: number): number => (n <= 1 ? w / 2 : (i / (n - 1)) * (w - 6) + 3);
  if (row.cls !== null) svg('line', { x1: 0, x2: w, y1: y(row.cls), y2: y(row.cls), class: 'ot-spark__cls' }, root);
  const pts = row.history.map((v, i) => (v === null ? null : [x(i), y(v)] as const)).filter((p): p is readonly [number, number] => p !== null);
  const down = (row.change ?? 0) < 0;
  svg('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' '), class: `ot-spark__line${down ? ' is-down' : ''}` }, root);
  for (const p of pts) svg('circle', { cx: p[0], cy: p[1], r: 2.4, class: `ot-spark__dot${down ? ' is-down' : ''}` }, root);
  return root;
}

function miniBars(values: number[], w: number, h: number, tone: string): SVGSVGElement {
  const root = svg('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, 'aria-hidden': 'true', class: `ot-bars ot-bars--${tone}` });
  const mx = Math.max(...values, 1);
  const bw = Math.max(2, w / values.length - 3);
  values.forEach((v, i) => {
    const bh = Math.max(v > 0 ? 2 : 1, (v / mx) * h);
    svg('rect', { x: i * (bw + 3), y: h - bh, width: bw, height: bh, rx: 2, opacity: (0.4 + 0.6 * ((i + 1) / values.length)).toFixed(2), class: v > 0 ? '' : 'is-zero' }, root);
  });
  return root;
}

// ── The view ─────────────────────────────────────────────────────────

type Sort = 'change' | 'weakest' | 'recent';
type Loaded = { view: MarkbookView; ctx: InsightContext; evidence: Evidence[]; sources: Source[]; frame: ClassFrame; active: Set<string>; deepProgress: DeepProgress | null };

export function mountOverTime(options: OverTimeViewOptions): HTMLElement {
  const { classId, studentId, name } = options;
  const api: OverTimeApi = { ...defaultApi(classId, studentId), ...options.api };
  const today = options.today ?? todayInSydney();
  const first = firstName(name);

  const root = el('div', 'ot-root');
  const banner = el('p', 'ot-private');
  banner.append(el('b', undefined, 'Only you see this tab.'), document.createTextNode(` ${first} sees the other tabs, never this one.`));
  const rangeHost = el('div', 'ot-range');
  const mainHost = el('div', 'ot-main');
  const duHost = el('section', 'ot-sec ot-du-sec');
  const writingHost = el('section', 'ot-sec');
  const habitsHost = el('section', 'ot-sec');
  const notesHost = el('section', 'ot-sec ot-notes-sec');
  root.append(banner, rangeHost, mainHost, duHost, writingHost, habitsHost, notesHost);
  mainHost.append(el('p', 'pm-empty', 'Loading their tagged work…'));

  let range: OverTimeRange = 'year';
  let kind: ChipKind | 'all' = 'all';
  let sort: Sort = 'change';
  // Long lists (a full syllabus) start trimmed; one press shows the rest.
  let showAll = false;
  const open = new Set<string>();
  let picking: string | null = null;
  let groupMessage = '';
  let loaded: Loaded | null = null;
  let habits: Habits | null = null;
  let notes: TeacherNote[] = [];
  let notesError = '';
  let taught: Map<string, number> | null = null;
  const label = (tag: string): string => (tag === VOCAB_TAG ? 'Unit vocabulary' : loaded ? tagLabel(tag, { ...loaded.ctx, deep: loaded.frame.deep }) : tag);

  // ── Range ──
  function paintRange(): void {
    const row = pills<OverTimeRange>('Show', [['unit', 'Unit'], ['term', 'Term'], ['year', 'Year']], range, (v) => {
      range = v;
      paintRange();
      paintMain();
    });
    rangeHost.replaceChildren(el('span', 'ot-range__label', 'Show'), row);
  }
  paintRange();

  function computed(): OverTime | null {
    if (!loaded) return null;
    const { view, evidence, sources, frame, active } = loaded;
    return overTime(evidence, studentId, {
      range,
      today,
      terms: frame.terms,
      unitStart: frame.unitStart,
      sources,
      active,
      label,
      vocab: habits?.organiser?.weekly ?? null,
      partOf: (source, item) => partOf(view, source, item)
    });
  }

  // ── Moves, trend and Every tag ──
  function paintMain(): void {
    if (!loaded) return;
    const t = computed()!;
    if (!t.tags.length) {
      mainHost.replaceChildren(el('p', 'pm-empty ot-empty', `Nothing tagged yet for ${name}. Tagged quiz questions, marked work and vivas will show here.`));
      return;
    }
    const parts: HTMLElement[] = [];
    const moves = el('div', 'ot-moves');
    const card = (k: 'up' | 'down' | 'stuck', title: string, move: NonNullable<OverTime['moves']['rising']>, head: string): void => {
      const c = el('div', `ot-move ot-move--${k}`);
      c.append(el('div', 'ot-move__k', title), el('div', 'ot-move__t', head), el('div', 'ot-move__w', move.reason));
      moves.append(c);
    };
    const m = t.moves;
    if (m.rising) card('up', 'Rising', m.rising, `${label(m.rising.tag)}, ${m.rising.from}% → ${m.rising.to}%`);
    if (m.slipping) card('down', 'Slipping', m.slipping, `${label(m.slipping.tag)}, ${m.slipping.from}% → ${m.slipping.to}%`);
    if (m.stuck) {
      const s = m.stuck;
      // A narrow band reads as a band; a wide one (a mix-up across good and bad days) as first to latest.
      const narrow = s.lo !== undefined && s.hi !== undefined && s.hi - s.lo <= 10;
      const head = narrow ? `${label(s.tag)}, ${s.lo === s.hi ? `${s.lo}%` : `${s.lo}–${s.hi}%`}` : s.from !== null && s.to !== null ? `${label(s.tag)}, ${s.from}% → ${s.to}%` : label(s.tag);
      card('stuck', 'Stuck', s, head);
    }
    if (moves.childElementCount) parts.push(moves);

    parts.push(el('h2', 'ot-h2', 'Everything tagged, week by week'), el('p', 'ot-sub', 'Latest attempt at every tagged quiz item, marked piece, viva line and organiser card. Dashed line is the class.'));
    const trend = el('div', 'ot-panel ot-trend');
    if (t.me.some((v) => v !== null)) trend.append(trendSvg(t, first, false), trendSvg(t, first, true));
    else trend.append(el('p', 'pm-empty', 'Only organiser practice so far in this range.'));
    const legend = el('div', 'ot-legend');
    const key = (cls: string, text: string, colour?: string): void => {
      const s = el('span');
      const i = el('i', cls);
      if (colour) i.style.background = colour;
      s.append(i, document.createTextNode(text));
      legend.append(s);
    };
    key('ot-key ot-key--me', first);
    key('ot-key ot-key--cls', 'Class');
    for (const k of ['quiz', 'writing', 'viva', 'sprint'] as OtEventKind[]) if (t.events.some((e) => e.kind === k)) key('ot-key ot-key--ev', EVENT_NAME[k], EVENT_COLOUR[k]);
    trend.append(legend);
    parts.push(trend);

    parts.push(el('h2', 'ot-h2', 'Every tag'), el('p', 'ot-sub', 'Click a row to see the work behind it.'));
    const present = CHIP_KINDS.filter((k) => t.tags.some((r) => r.kind === k));
    if (kind !== 'all' && !present.includes(kind)) kind = 'all';
    parts.push(
      pills<ChipKind | 'all'>('Kind of tag', [['all', 'Everything'], ...present.map((k): [ChipKind, string] => [k, CHIP_LABEL[k]])], kind, (v) => {
        kind = v;
        showAll = false;
        paintMain();
      })
    );
    const sortRow = el('div', 'ot-sortrow');
    sortRow.append(
      el('span', 'ot-range__label', 'Sort by'),
      pills<Sort>('Sort by', [['change', 'Biggest change'], ['weakest', 'Weakest now'], ['recent', 'Most recent']], sort, (v) => {
        sort = v;
        paintMain();
      })
    );
    parts.push(sortRow, tagRows(t));
    mainHost.replaceChildren(...parts);
  }

  function tagRows(t: OverTime): HTMLElement {
    const box = el('div', 'ot-rows');
    const head = el('div', 'ot-row ot-row--head');
    head.append(el('div', undefined, 'Tag'), el('div', undefined, 'Over time'), el('div', undefined, 'Now'), el('div', 'ot-chg', 'Change'), el('div', 'ot-cls', 'Class'));
    box.append(head);
    const sorters: Record<Sort, (a: OtTag, b: OtTag) => number> = {
      change: (a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0),
      weakest: (a, b) => (a.now ?? 101) - (b.now ?? 101),
      recent: (a, b) => b.last.localeCompare(a.last)
    };
    const list = t.tags.filter((r) => kind === 'all' || r.kind === kind).sort((a, b) => sorters[sort](a, b) || label(a.tag).localeCompare(label(b.tag)));
    const shown = showAll || list.length <= TAG_ROWS_SHOWN ? list : list.slice(0, TAG_ROWS_SHOWN);
    for (const r of shown) {
      const isOpen = open.has(r.tag);
      const row = el('div', `ot-row${isOpen ? ' is-open' : ''}`);
      row.dataset.tag = r.tag;
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-expanded', String(isOpen));
      const nameCell = el('div', 'ot-row__name');
      nameCell.append(document.createTextNode(label(r.tag)), el('span', `ot-band ${BAND_CLASS[r.band]}`, BAND_LABEL[r.band]));
      const sub = el('small', undefined, `${KIND_NAME[r.kind]} · ${plural(r.pieces, 'piece')}`);
      sub.append(el('span', 'ot-pc', ` · ${r.change === null ? 'one piece' : signed(r.change)}${r.cls !== null ? ` · class ${r.cls}%` : ''}`));
      nameCell.append(sub);
      const sparkCell = el('div', 'ot-row__spark');
      sparkCell.append(spark(r, 132, 30));
      const chg = el('div', 'ot-chg');
      chg.append(r.change === null ? el('span', 'ot-flat', '1 piece') : el('span', r.change > 0 ? 'ot-pos' : r.change < 0 ? 'ot-neg' : 'ot-flat', signed(r.change)));
      row.append(nameCell, sparkCell, el('div', 'ot-now', r.now === null ? '–' : `${r.now}%`), chg, el('div', 'ot-cls', r.cls === null ? '–' : `${r.cls}%`));
      const toggle = (): void => {
        if (open.has(r.tag)) open.delete(r.tag);
        else open.add(r.tag);
        paintMain();
        mainHost.querySelector<HTMLElement>(`.ot-row[data-tag="${CSS.escape(r.tag)}"]`)?.focus();
      };
      row.addEventListener('click', toggle);
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle();
        }
      });
      box.append(row);
      if (isOpen) box.append(detail(r));
    }
    if (shown.length < list.length) {
      const more = el('button', 'ot-more', `Show all ${list.length} tags`);
      more.type = 'button';
      more.addEventListener('click', () => {
        showAll = true;
        paintMain();
      });
      const wrap = el('div', 'ot-wrap');
      wrap.append(box, more);
      return wrap;
    }
    return box;
  }

  function detail(r: OtTag): HTMLElement {
    const d = el('div', 'ot-detail');
    const ul = el('ul', 'ot-evlist');
    for (const e of r.evidence) {
      const li = el('li');
      const s = el('span', 'ot-evlist__s', e.title);
      s.append(el('em', undefined, ` · ${e.part}`));
      li.append(el('span', 'ot-evlist__d', formatDay(e.date)), s, el('span', 'ot-evlist__m', e.mark));
      ul.append(li);
    }
    d.append(ul);
    const mine = notes.filter((n) => n.tag === r.tag);
    if (mine.length) {
      const nl = el('ul', 'ot-evlist ot-evlist--notes');
      for (const n of mine) {
        const li = el('li');
        li.append(el('span', 'ot-evlist__d', formatDay(sydneyDay(n.at))), el('span', 'ot-evlist__s', n.text), el('span', 'ot-evlist__m', 'Your note'));
        nl.append(li);
      }
      d.append(nl);
    }
    const act = el('div', 'ot-act');
    const nextStep = el('button', 'ot-act__btn', 'Make it a next step');
    nextStep.type = 'button';
    nextStep.title = 'Starts a private note with this tag. Nothing goes to the student.';
    nextStep.addEventListener('click', () => draftNextStep(r.tag));
    const group = el('button', 'ot-act__btn', 'Add to a group');
    group.type = 'button';
    group.setAttribute('aria-expanded', String(picking === r.tag));
    group.addEventListener('click', () => {
      picking = picking === r.tag ? null : r.tag;
      groupMessage = '';
      paintMain();
    });
    act.append(nextStep, group);
    if (r.kind !== 'vocab') {
      const openTag = el('button', 'ot-act__btn', 'Open the tag');
      openTag.type = 'button';
      openTag.addEventListener('click', () => {
        const k = kindOf(r.tag);
        navigate(`/classes/${encodeURIComponent(classId)}?mb=detail${k ? `&kind=${k}` : ''}`);
      });
      act.append(openTag);
    }
    d.append(act);
    if (picking === r.tag) d.append(groupPicker(r));
    return d;
  }

  /** The class's saved groups this student isn't in yet, and a new group for this one tag. */
  function groupPicker(r: OtTag): HTMLElement {
    const box = el('div', 'ot-picker');
    const view = loaded!.view;
    const groups = (view.markbook.groups ?? []).filter((g) => g.retired === null);
    const why = `Over time: ${label(r.tag)}`;
    const done = (markbook: Markbook, text: string): void => {
      loaded!.view = { ...view, markbook };
      groupMessage = text;
      picking = r.tag;
      paintMain();
    };
    const fail = (): void => {
      groupMessage = 'That didn’t save. Try again.';
      paintMain();
    };
    for (const g of groups) {
      const inIt = g.members.some((m) => m.student === studentId && m.left === null);
      const b = el('button', 'ot-pill', inIt ? `In ${g.name}` : `Add to ${g.name}`);
      b.type = 'button';
      b.disabled = inIt;
      b.addEventListener('click', () => void api.addMembers(classId, g.id, studentId, why, today).then((mb) => done(mb, `Added to ${g.name}.`), fail));
      box.append(b);
    }
    // A new group for this tag alone, unless one is already running.
    if (r.kind !== 'vocab' && !groups.some((g) => g.tags.length === 1 && g.tags[0] === r.tag)) {
      const make = el('button', 'ot-pill', `New group: ${label(r.tag)}`);
      make.type = 'button';
      make.addEventListener('click', () =>
        void api.saveGroup(classId, { id: newGroupId(), name: label(r.tag).slice(0, 120), tags: [r.tag], members: [{ student: studentId, why }] }, today).then((mb) => done(mb, `New group made: ${label(r.tag)}.`), fail)
      );
      box.append(make);
    }
    if (!box.childElementCount) box.append(el('p', 'pm-empty', 'No saved groups in this class yet.'));
    if (groupMessage) {
      const msg = el('p', 'ot-picker__msg', groupMessage);
      msg.setAttribute('role', 'status');
      box.append(msg);
    }
    return box;
  }

  // ── Deep understandings ──
  function paintDu(): void {
    if (!loaded) return;
    const { frame, evidence, sources, deepProgress } = loaded;
    if (!frame.deep.length) {
      duHost.replaceChildren();
      return;
    }
    // Pieces ticked as used in writing count, at the day they were ticked.
    const ticks: Evidence[] = [];
    for (const [block, byStudent] of Object.entries(deepProgress?.writing ?? {})) {
      const mine = byStudent[studentId];
      if (!mine) continue;
      const date = sydneyDay(mine.at);
      for (const p of mine.used) ticks.push({ item: `${block}#${p}`, tags: [`kp:${p}`], share: 1, why: [], student: studentId, source: `deep:${block}`, date, confidence: null });
      for (const p of mine.missed) ticks.push({ item: `${block}#${p}`, tags: [`kp:${p}`], share: 0, why: [], student: studentId, source: `deep:${block}`, date, confidence: null });
    }
    const rows = duLadder([...evidence, ...ticks], studentId, frame.deep, [...sources, ...Object.keys(deepProgress?.writing ?? {}).map((b) => ({ source: `deep:${b}`, title: 'Writing' }))]);
    const panel = el('div', 'ot-panel ot-du');
    for (const r of rows) {
      const row = el('div', 'ot-du__row');
      const n = el('div', 'ot-du__n', r.claim || 'Untitled deep understanding');
      const lessons = taught?.get(r.id);
      n.append(el('small', undefined, r.sources.length ? sourceTrail(r.sources) : `Not tested yet${lessons ? ` · taught in ${plural(lessons, 'lesson')}` : ''}`));
      const ladder = el('div', 'ot-ladder');
      ladder.setAttribute('role', 'img');
      ladder.setAttribute('aria-label', r.now ? `Best piece now: ${TIER_NAME[r.now]}${r.was ? `, started at ${TIER_NAME[r.was]}` : ''}` : 'No piece held yet');
      for (const tier of ['essential', 'strong', 'sophisticated'] as Tier[]) ladder.append(el('span', tier === r.now ? 'is-on' : tier === r.was ? 'is-was' : '', TIER_NAME[tier]));
      row.append(n, ladder);
      panel.append(row);
    }
    duHost.replaceChildren(el('h2', 'ot-h2', 'Deep understandings'), el('p', 'ot-sub', `Where ${first}’s best piece sits now. Pale blue is where it started.`), panel);
    if (taught === null && rows.some((r) => !r.sources.length) && frame.unit) {
      taught = new Map();
      void api.lessons(frame.unit).then((lessons) => {
        const counts = new Map<string, number>();
        for (const du of frame.deep) {
          const ids = new Set(piecesFor(du, frame.deep).map((p) => p.id));
          const at = new Set<string>();
          for (const [piece, list] of placements(lessons, du.id).taught) if (ids.has(piece)) list.forEach((l) => at.add(l));
          counts.set(du.id, at.size);
        }
        taught = counts;
        paintDu();
      }, () => undefined);
    }
  }

  // ── Writing and speaking ──
  function paintWriting(returned: ReturnedItem[] | null): void {
    const codes = options.codes ?? [];
    const pieces = options.pieces ?? [];
    const two = el('div', 'ot-two');
    const codePanel = el('div', 'ot-panel ot-codes');
    if (!codes.length) codePanel.append(el('p', 'pm-empty', 'No marking codes on returned work yet.'));
    for (const c of codes) {
      const row = el('div', 'ot-code');
      const lab = el('div', 'ot-code__lab');
      lab.append(codeChip(c.code, c.colour), document.createTextNode(` ${c.label}`));
      const dots = el('div', 'ot-dots');
      dots.setAttribute('role', 'img');
      dots.setAttribute('aria-label', `${c.code} on ${c.hit} of ${c.of} pieces`);
      c.cells.forEach((cell, i) => {
        const s = el('span', cell === null ? 'is-na' : cell > 0 ? (c.positive ? 'is-s' : 'is-n') : '');
        s.title = `${pieces[i]?.label ?? 'Piece'}${cell === null ? ': n/a' : cell > 0 ? `: ${cell}` : ''}`;
        dots.append(s);
      });
      const tr = codeTrend(c.cells);
      // Fewer of a next-step code is good news; more of a strength is too.
      const good = tr === null || tr === 'same' ? null : c.positive ? tr === 'more' : tr === 'fewer';
      row.append(lab, dots, el('div', `ot-code__tr ${good === null ? 'ot-flat' : good ? 'ot-pos' : 'ot-neg'}`, tr ?? ''));
      codePanel.append(row);
    }
    const piecePanel = el('div', 'ot-panel');
    const list = el('ul', 'ot-pieces');
    const items: Array<{ title: string; meta: string; tick: string; ok: boolean }> = returned
      ? returned
          .filter((r) => r.kind === 'written' || r.kind === 'viva')
          .map((r) => ({
            title: r.title,
            meta: [formatDay(r.date), r.kind === 'viva' ? 'viva' : 'writing', r.codes.length ? plural(r.codes.length, 'code') : '', r.redraft === 'sent' ? 'redraft handed in' : r.redraft === 'asked' ? 'redraft asked for' : ''].filter(Boolean).join(' · '),
            tick: r.redraft === 'sent' ? 'Acted on' : r.redraft === 'asked' ? 'Waiting' : '',
            ok: r.redraft === 'sent'
          }))
      : pieces.map((p) => ({ title: p.label, meta: `${p.date} · ${p.kind}`, tick: '', ok: false }));
    for (const it of items) {
      const li = el('li');
      const left = el('div');
      left.append(el('b', undefined, it.title), el('small', undefined, it.meta));
      li.append(left, el('span', `ot-tick${it.ok ? ' is-ok' : ''}`, it.tick));
      list.append(li);
    }
    piecePanel.append(items.length ? list : el('p', 'pm-empty', returned === null && options.loadReturned ? 'Loading returned pieces…' : 'No returned pieces yet.'));
    two.append(codePanel, piecePanel);
    writingHost.replaceChildren(el('h2', 'ot-h2', 'Writing and speaking'), el('p', 'ot-sub', 'Your marking codes on each returned piece, oldest on the left. Green is a strength, orange a next step.'), two);
  }

  // ── Habits ──
  function paintHabits(): void {
    const tiles: HTMLElement[] = [];
    const tile = (value: string, text: string, bars: SVGSVGElement | null): void => {
      const t = el('div', 'ot-hab');
      t.append(el('div', 'ot-hab__v', value), el('div', 'ot-hab__l', text));
      if (bars) t.append(bars);
      tiles.push(t);
    };
    if (loaded) {
      const start = rangeStart(range, today, loaded.frame.terms, loaded.frame.unitStart);
      const due = loaded.view.quizzes.filter((q) => !q.hidden && q.date <= today && q.date >= start && Object.keys(q.scores).length).sort((a, b) => a.date.localeCompare(b.date));
      if (due.length) {
        const onTime = due.map((q) => {
          const s = q.scores[studentId];
          return s && sydneyDay(s.submitted_at) <= q.date ? 1 : 0;
        });
        tile(`${onTime.reduce<number>((a, b) => a + b, 0)} of ${due.length}`, 'quizzes done on time', miniBars(onTime, 110, 22, 'wave'));
      }
    }
    if (habits?.organiser) {
      const o = habits.organiser;
      tile(plural(o.streak, 'day'), `organiser streak${o.avg_box !== null ? ` · avg box ${Math.round(o.avg_box * 10) / 10}` : ''}`, o.weekly.length ? miniBars(o.weekly.map((w) => w.seen), 110, 22, 'gold') : null);
    }
    if (habits && habits.steps.acted !== null && habits.steps.set > 0) {
      const { set, acted } = habits.steps;
      tile(`${acted} of ${set}`, 'next steps acted on', miniBars(Array.from({ length: set }, (_, i) => (i < acted ? 1 : 0)), Math.min(110, set * 20), 22, 'sage'));
    }
    if (habits) tile(String(habits.redrafts), `${habits.redrafts === 1 ? 'redraft' : 'redrafts'} handed in`, habits.redrafts ? miniBars(Array.from({ length: habits.redrafts }, () => 1), Math.min(110, habits.redrafts * 20), 22, 'lilac') : null);
    if (!tiles.length) {
      habitsHost.replaceChildren();
      return;
    }
    const grid = el('div', 'ot-habits');
    grid.append(...tiles);
    habitsHost.replaceChildren(el('h2', 'ot-h2', 'Habits'), grid);
  }

  // ── My notes ──
  const draft = el('textarea', 'ot-notes__input');
  draft.placeholder = 'What did you notice? e.g. Asked a sharp question about the ending today';
  draft.setAttribute('aria-label', 'New private note');
  draft.maxLength = 2000;
  const tagPick = el('select', 'ot-notes__tag');
  tagPick.setAttribute('aria-label', 'Tag for this note');
  const saveBtn = el('button', 'btn btn--primary', 'Save note');
  saveBtn.type = 'button';
  let editing: string | null = null;
  let confirmDelete: string | null = null;

  function tagOptions(select: HTMLSelectElement, current: string | null): void {
    const t = computed();
    const tags = [...new Set([...(t?.tags.map((r) => r.tag) ?? []), ...(current ? [current] : [])])].sort((a, b) => label(a).localeCompare(label(b)));
    select.replaceChildren();
    const none = el('option', undefined, 'No tag');
    none.value = '';
    select.append(none);
    for (const tag of tags) {
      const o = el('option', undefined, label(tag));
      o.value = tag;
      select.append(o);
    }
    select.value = current ?? '';
  }

  async function saveNote(note: { id?: string; text: string; tag: string | null }): Promise<boolean> {
    try {
      const r = await api.profile<{ notes: TeacherNote[] }>('note_save', { note });
      notes = r.notes;
      notesError = '';
      return true;
    } catch {
      notesError = 'That note didn’t save. Try again.';
      return false;
    }
  }

  saveBtn.addEventListener('click', () => {
    const text = draft.value.trim();
    if (!text) return;
    saveBtn.disabled = true;
    void saveNote({ text, tag: tagPick.value || null }).then((ok) => {
      saveBtn.disabled = false;
      if (ok) {
        draft.value = '';
        tagPick.value = '';
      }
      paintNotes();
      paintMain();
    });
  });

  function draftNextStep(tag: string): void {
    tagOptions(tagPick, tag);
    if (!draft.value.trim()) draft.value = `Next step: ${label(tag)}. `;
    notesHost.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    draft.focus();
    draft.setSelectionRange(draft.value.length, draft.value.length);
  }

  function paintNotes(): void {
    const keepTag = tagPick.value || null;
    tagOptions(tagPick, keepTag);
    const panel = el('div', 'ot-panel ot-notes');
    const bar = el('div', 'ot-notes__bar');
    bar.append(tagPick, saveBtn);
    panel.append(draft, bar);
    if (notesError) {
      const err = el('p', 'ot-notes__err', notesError);
      err.setAttribute('role', 'alert');
      panel.append(err);
    }
    const list = el('ul', 'ot-nlist');
    for (const n of notes) {
      const li = el('li');
      li.dataset.note = n.id;
      const body = el('div', 'ot-nlist__body');
      if (editing === n.id) {
        const box = el('textarea', 'ot-notes__input');
        box.value = n.text;
        box.maxLength = 2000;
        box.setAttribute('aria-label', 'Edit note');
        const pick = el('select', 'ot-notes__tag');
        pick.setAttribute('aria-label', 'Tag for this note');
        tagOptions(pick, n.tag ?? null);
        const save = el('button', 'btn btn--primary', 'Save');
        save.type = 'button';
        save.addEventListener('click', () => {
          const text = box.value.trim();
          if (!text) return;
          void saveNote({ id: n.id, text, tag: pick.value || null }).then((ok) => {
            if (ok) editing = null;
            paintNotes();
            paintMain();
          });
        });
        const cancel = el('button', 'btn btn--ghost', 'Cancel');
        cancel.type = 'button';
        cancel.addEventListener('click', () => {
          editing = null;
          paintNotes();
        });
        const row = el('div', 'ot-notes__bar');
        row.append(pick, save, cancel);
        body.append(box, row);
      } else {
        const text = el('span', 'ot-nlist__text', n.text);
        if (n.tag) text.append(el('span', 'ot-tagged', label(n.tag)));
        const tools = el('span', 'ot-nlist__tools');
        const edit = el('button', 'ot-link', 'Edit');
        edit.type = 'button';
        edit.addEventListener('click', () => {
          editing = n.id;
          confirmDelete = null;
          paintNotes();
        });
        const del = el('button', 'ot-link ot-link--danger', confirmDelete === n.id ? 'Delete for good' : 'Delete');
        del.type = 'button';
        del.addEventListener('click', () => {
          if (confirmDelete !== n.id) {
            confirmDelete = n.id;
            paintNotes();
            return;
          }
          void api.profile<{ notes: TeacherNote[] }>('note_delete', { note_id: n.id }).then(
            (r) => {
              notes = r.notes;
              confirmDelete = null;
              notesError = '';
              paintNotes();
              paintMain();
            },
            () => {
              notesError = 'That note didn’t delete. Try again.';
              paintNotes();
            }
          );
        });
        tools.append(edit, del);
        body.append(text, tools);
      }
      li.append(el('span', 'ot-nlist__d', `${formatDay(sydneyDay(n.at))}${n.edited_at ? ' · edited' : ''}`), body);
      list.append(li);
    }
    if (notes.length) panel.append(list);
    notesHost.replaceChildren(el('h2', 'ot-h2', 'My notes'), el('p', 'ot-sub', 'Private jottings. Pick a tag and the note sits on that tag’s timeline too.'), panel);
  }

  // ── Loading ──
  paintNotes();
  paintWriting(null);
  void (options.loadReturned?.() ?? Promise.resolve(null)).then(
    (items) => paintWriting(items),
    () => paintWriting([])
  );
  void api.profile<{ notes: TeacherNote[] }>('notes').then(
    (r) => {
      notes = r.notes ?? [];
      paintNotes();
      paintMain();
    },
    () => {
      notesError = 'Couldn’t load your notes. Try again in a moment.';
      paintNotes();
    }
  );
  void api.profile<Habits>('habits').then(
    (h) => {
      habits = h;
      paintHabits();
      paintMain();
      paintNotes();
    },
    () => undefined
  );
  void Promise.all([api.markbook(classId), api.context(), api.frame(classId, today)]).then(
    async ([view, ctx, frame]) => {
      const deepProgress = frame.unit && frame.deep.length ? await api.deep(classId, frame.unit.id).catch(() => null) : null;
      const { evidence, sources } = classEvidence(view, { ...ctx, deep: frame.deep });
      loaded = { view, ctx, evidence, sources, frame, active: new Set(view.students.filter((s) => !s.removed).map((s) => s.id)), deepProgress };
      paintMain();
      paintDu();
      paintHabits();
      paintNotes();
    },
    () => mainHost.replaceChildren(el('p', 'pm-empty', 'Couldn’t load their tagged work. Try again in a moment.'))
  );
  return root;
}

/** Which question, criterion or rubric an item is. */
function partOf(view: MarkbookView, source: string, item: string): string | null {
  if (source.startsWith('quiz:')) {
    const quiz = view.quizzes.find((q) => q.id === source || `quiz:${q.lesson_id}` === source);
    const qid = item.split('#')[0]!;
    const at = quiz?.questions.findIndex((q) => q.id === qid) ?? -1;
    return at >= 0 ? `Q${at + 1}` : null;
  }
  if (source.startsWith('assess:')) {
    const col = view.markbook.columns.find((c) => `assess:${c.id}` === source);
    const crit = col && col.kind === 'assessment' ? col.criteria.find((c) => item === `${col.id}:${c.id}`) : undefined;
    return crit?.label ?? null;
  }
  if (source.startsWith('work:')) return item.startsWith('v:') ? 'viva rubric' : 'rubric';
  return null;
}

