import { el } from '@/quiz/dom';
import type { InsightContext } from '@/evidence/context';
import { classEvidence } from '@/evidence/class-evidence';
import { byTag, defaultKind, kindsPresent, trend, type TrendPoint } from '@/evidence/patterns';
import { tagLabel } from '@/evidence/tags';
import type { Evidence, StudentBand, TagKind } from '@/evidence/types';
import { pct, sectionHead, tagSwitch } from '@/evidence/views/parts';
import { assessments } from './calc';
import { sparkline } from './grid';
import { band4 } from './insight';
import { openOverlay } from './overlay';
import type { MarkbookView, RosterStudent } from './types';

/** Sort orders for the Detail tables, kept by the markbook between redraws. */
export type DetailState = {
  kind: TagKind | null;
  tagSort: { col: 'tag' | 'now' | 'change' | 'evidence'; asc: boolean };
  /** A tag column, or null for the student's name. */
  heatSort: { tag: string | null; asc: boolean };
};
export const newDetailState = (): DetailState => ({ kind: null, tagSort: { col: 'now', asc: true }, heatSort: { tag: null, asc: true } });

/** A column heading that sorts its table; pressing it again turns the order round. */
function sortHeading(text: string, active: boolean, asc: boolean, onSort: () => void): HTMLTableCellElement {
  const th = el('th');
  th.scope = 'col';
  th.setAttribute('aria-sort', active ? (asc ? 'ascending' : 'descending') : 'none');
  const b = el('button', 'mb-sort', text);
  b.type = 'button';
  b.dataset.sortCol = text;
  if (active) b.append(el('span', 'mb-sort__arrow', asc ? ' ↑' : ' ↓'));
  b.addEventListener('click', () => {
    onSort();
    // The table redraws: keep focus on the same heading.
    th.closest('.mb-patterns')?.querySelector<HTMLButtonElement>(`.mb-sort[data-sort-col="${CSS.escape(text)}"]`)?.focus();
  });
  th.append(b);
  return th;
}

export type PatternsActions = {
  openStudent: (studentId: string) => void;
  /** Phase 7: offer Ann a follow-up for a group of students on one tag. */
  followUp?: (tag: string, students: string[], evidence: Evidence[]) => void;
};

const SVG = 'http://www.w3.org/2000/svg';
/** Room one x-axis label needs, in viewBox units. */
const LABEL_WIDTH = 80;
let sheetCount = 0;

/** Median and middle half per quiz or task, oldest first. */
function trendChart(points: TrendPoint[]): SVGSVGElement {
  const root = document.createElementNS(SVG, 'svg');
  root.setAttribute('viewBox', '0 0 640 140');
  root.setAttribute('class', 'mb-trend');
  root.setAttribute('role', 'img');
  const title = document.createElementNS(SVG, 'title');
  title.textContent = points.length ? `Class median from ${pct(points[0]!.median)} to ${pct(points[points.length - 1]!.median)}` : 'No marks yet';
  root.append(title);
  const x = (i: number): number => (points.length < 2 ? 340 : 60 + (i * 540) / (points.length - 1));
  const y = (share: number): number => 110 - share * 90;
  const add = (tag: string, attrs: Record<string, string | number>, text?: string) => {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    if (text) n.textContent = text;
    root.append(n);
  };
  for (const share of [0, 0.5, 1]) {
    add('line', { x1: 40, x2: 620, y1: y(share), y2: y(share), class: 'mb-trend__grid' });
    add('text', { x: 4, y: y(share) + 4, class: 'mb-trend__tick' }, `${share * 100}%`);
  }
  // A label needs about 80 units; with many sources show every nth, always the first and last.
  const last = points.length - 1;
  const step = last > 0 ? Math.max(1, Math.ceil(LABEL_WIDTH / (540 / last))) : 1;
  const labelled = (i: number): boolean => i === 0 || i === last || (i % step === 0 && last - i >= step);
  if (points.length > 1) {
    const band = [...points.map((p, i) => `${x(i)},${y(p.q3)}`), ...points.map((p, i) => `${x(i)},${y(p.q1)}`).reverse()].join(' ');
    add('polygon', { points: band, class: 'mb-trend__band' });
    add('polyline', { points: points.map((p, i) => `${x(i)},${y(p.median)}`).join(' '), class: 'mb-trend__line' });
  }
  points.forEach((p, i) => {
    add('circle', { cx: x(i), cy: y(p.median), r: 4, class: 'mb-trend__dot' });
    if (!labelled(i)) return;
    // The first and last labels keep inside the chart.
    const anchor = points.length > 1 && i === 0 ? 'start' : points.length > 1 && i === last ? 'end' : 'middle';
    const at = anchor === 'start' ? x(i) - 20 : anchor === 'end' ? x(i) + 20 : x(i);
    add('text', { x: at, y: 134, 'text-anchor': anchor, class: 'mb-trend__tick' }, p.title.length > 14 ? `${p.title.slice(0, 13)}…` : p.title);
  });
  return root;
}

function evidenceSheet(title: string, items: Evidence[], sourceTitle: (source: string) => string, itemName: (e: Evidence) => string): void {
  const body = el('div', 'mb-sheet');
  const heading = el('h3', 'mb-form__title', title);
  heading.id = `mb-ev-${(sheetCount += 1)}`;
  const close = el('button', 'btn btn--secondary mb-sheet__close', 'Close');
  close.type = 'button';
  const list = el('ul', 'mb-attempt');
  for (const e of items) list.append(el('li', undefined, `${sourceTitle(e.source)} · ${itemName(e)} · ${pct(e.share)}`));
  body.append(close, heading, list);
  const opened = openOverlay(body, { labelledBy: heading.id });
  close.addEventListener('click', () => opened.close());
}

const short = (text: string): string => (text.length > 60 ? `${text.slice(0, 57)}…` : text);

/** A question's prompt or a criterion's label, for the evidence sheet; the raw id only when neither is found. */
function itemNamer(view: MarkbookView): (e: Evidence) => string {
  const names = new Map<string, string>();
  for (const q of view.quizzes) for (const question of q.questions) names.set(`quiz:${q.lesson_id}|${question.id}`, question.prompt || 'Question');
  for (const column of assessments(view.markbook)) for (const c of column.criteria) names.set(`assess:${column.id}|${column.id}:${c.id}`, c.label);
  return (e) => {
    const id = e.source.startsWith('quiz:') ? e.item.split('#')[0]! : e.item;
    return short(names.get(`${e.source}|${id}`) ?? id);
  };
}

export function renderPatterns(view: MarkbookView, students: RosterStudent[], ctx: InsightContext, actions: PatternsActions, state: DetailState = newDetailState()): HTMLElement {
  const root = el('div', 'mb-patterns');
  const { evidence, sources } = classEvidence(view, ctx);
  const label = (tag: string): string => tagLabel(tag, ctx);
  const titleOf = new Map(sources.map((s) => [s.source, s.title]));
  const names = new Map(students.map((s) => [s.id, s]));
  const itemName = itemNamer(view);
  const kinds = kindsPresent(evidence);
  // Families read better than twenty techniques; a technique is a press away.
  let kind: TagKind = state.kind && kinds.includes(state.kind) ? state.kind : kinds.includes('fam') ? 'fam' : defaultKind(evidence);

  root.append(sectionHead('Class over time'), trendChart(trend(evidence, sources)));
  const tagsHost = el('div', 'mb-patterns__tags');
  const heatHost = el('div', 'mb-patterns__heat');
  root.append(tagsHost, heatHost);

  const paint = (): void => {
    const changeOf = new Map<string, number | null>();
    const pointsOf = new Map<string, TrendPoint[]>();
    for (const r of byTag(evidence, kind)) {
      const points = trend(evidence, sources, r.tag);
      pointsOf.set(r.tag, points);
      changeOf.set(r.tag, points.length > 1 ? points[points.length - 1]!.median - points[0]!.median : null);
    }
    const { col, asc } = state.tagSort;
    const dir = asc ? 1 : -1;
    const rows = byTag(evidence, kind).sort((a, b) => {
      if (col === 'tag') return dir * label(a.tag).localeCompare(label(b.tag));
      if (col === 'evidence') return dir * (a.questions - b.questions) || a.mean - b.mean;
      if (col === 'change') {
        const x = changeOf.get(a.tag) ?? null;
        const y = changeOf.get(b.tag) ?? null;
        return (x === null ? 1 : 0) - (y === null ? 1 : 0) || dir * ((x ?? 0) - (y ?? 0));
      }
      return dir * (a.mean - b.mean) || label(a.tag).localeCompare(label(b.tag));
    });
    const table = el('table', 'mb-grid__table mb-patterns__table');
    const head = el('tr');
    const sortBy = (c: DetailState['tagSort']['col']) => () => {
      state.tagSort = { col: c, asc: state.tagSort.col === c ? !state.tagSort.asc : true };
      paint();
    };
    head.append(
      sortHeading('Tag', col === 'tag', asc, sortBy('tag')),
      sortHeading('Now', col === 'now', asc, sortBy('now')),
      sortHeading('Change', col === 'change', asc, sortBy('change'))
    );
    for (const h of ['Trend']) {
      const th = el('th', undefined, h);
      th.scope = 'col';
      head.append(th);
    }
    head.append(sortHeading('Evidence', col === 'evidence', asc, sortBy('evidence')));
    const groupsHead = el('th', undefined, 'Groups');
    groupsHead.scope = 'col';
    head.append(groupsHead);
    table.append(head);
    /** The group button whose students are listed under its row; pressing it again closes the list. */
    let openGroup: HTMLButtonElement | null = null;
    const closeGroup = (): void => {
      table.querySelector('.mb-patterns__expand')?.remove();
      openGroup?.setAttribute('aria-expanded', 'false');
      openGroup = null;
    };
    for (const r of rows) {
      const points = pointsOf.get(r.tag) ?? [];
      const change = changeOf.get(r.tag) ?? null;
      const tr = el('tr');
      const groups = el('td', 'mb-patterns__groups');
      for (const band of ['weak', 'developing', 'secure'] as StudentBand[]) {
        const ids = r.groups[band];
        if (!ids.length) continue;
        const b = el('button', `mb-patterns__group mb-band--${band === 'weak' ? 'low' : band === 'developing' ? 'mid' : 'high'}`, String(ids.length));
        b.type = 'button';
        b.dataset.group = band;
        b.setAttribute('aria-label', `${ids.length} ${band} on ${label(r.tag)}`);
        b.setAttribute('aria-expanded', 'false');
        b.addEventListener('click', () => {
          const wasOpen = openGroup === b;
          closeGroup();
          if (wasOpen) return;
          const holder = el('tr', 'mb-patterns__expand');
          const cell = el('td');
          cell.colSpan = 6;
          const list = el('div', 'mb-patterns__list');
          list.append(el('p', undefined, `${label(r.tag)}, ${band}: ${ids.map((id) => names.get(id)?.name ?? 'Removed student').join(', ')}`));
          if (actions.followUp) {
            const ann = el('button', 'btn btn--secondary', 'Ann drafts follow-up quiz');
            ann.type = 'button';
            ann.addEventListener('click', () => actions.followUp?.(r.tag, ids, evidence));
            list.append(ann);
          }
          cell.append(list);
          holder.append(cell);
          tr.after(holder);
          b.setAttribute('aria-expanded', 'true');
          openGroup = b;
        });
        groups.append(b);
      }
      const spark = el('td');
      if (points.length > 1) spark.append(sparkline(points.map((p) => p.median * 100)));
      const name = el('th', undefined, label(r.tag));
      name.scope = 'row';
      tr.append(
        name,
        el('td', undefined, pct(r.mean)),
        el('td', undefined, change === null ? '–' : `${change >= 0 ? '+' : '−'}${Math.abs(Math.round(change * 100))}`),
        spark,
        el('td', undefined, `${r.questions} ${r.questions === 1 ? 'question' : 'questions'}`),
        groups
      );
      table.append(tr);
    }
    const wrap = el('div', 'mb-grid');
    wrap.append(table);
    tagsHost.replaceChildren(sectionHead('Tags', kinds.length > 1 ? tagSwitch(kinds, kind, (k) => { kind = k; state.kind = k; paint(); }) : undefined), rows.length ? wrap : el('p', 'mb__empty', 'No tagged marks yet.'));
    if (!rows.length) {
      heatHost.replaceChildren();
      return;
    }

    const heat = el('table', 'mb-grid__table mb-patterns__heatmap');
    const hr = el('tr');
    const meanOf = (studentId: string, tag: string): { mean: number; items: Evidence[] } | null => {
      const mine = evidence.filter((e) => e.student === studentId && e.tags.includes(tag) && e.share !== null);
      return mine.length ? { mean: mine.reduce((a, e) => a + (e.share as number), 0) / mine.length, items: mine } : null;
    };
    const heatSort = state.heatSort.tag && rows.some((r) => r.tag === state.heatSort.tag) ? state.heatSort : { tag: null, asc: state.heatSort.tag ? true : state.heatSort.asc };
    const sortHeat = (tag: string | null) => () => {
      state.heatSort = { tag, asc: state.heatSort.tag === tag ? !state.heatSort.asc : true };
      paint();
    };
    const corner = sortHeading('Student', heatSort.tag === null, heatSort.asc, sortHeat(null));
    corner.classList.add('mb-grid__student');
    hr.append(corner);
    for (const r of rows) hr.append(sortHeading(label(r.tag), heatSort.tag === r.tag, heatSort.asc, sortHeat(r.tag)));
    heat.append(hr);
    const hdir = heatSort.asc ? 1 : -1;
    const ordered = [...students].sort((a, b) => {
      if (heatSort.tag === null) return hdir * a.name.localeCompare(b.name);
      const x = meanOf(a.id, heatSort.tag)?.mean ?? null;
      const y = meanOf(b.id, heatSort.tag)?.mean ?? null;
      return (x === null ? 1 : 0) - (y === null ? 1 : 0) || hdir * ((x ?? 0) - (y ?? 0)) || a.name.localeCompare(b.name);
    });
    for (const s of ordered) {
      const tr = el('tr');
      const name = el('th', 'mb-grid__student');
      name.scope = 'row';
      const nb = el('button', 'mb-patterns__name', `${s.initials} · ${s.name}`);
      nb.type = 'button';
      nb.dataset.student = s.id;
      nb.addEventListener('click', () => actions.openStudent(s.id));
      name.append(nb);
      tr.append(name);
      for (const r of rows) {
        const found = meanOf(s.id, r.tag);
        const td = el('td');
        if (found) {
          const { mean, items: mine } = found;
          const b = el('button', `mb-patterns__cell mb-band--${band4(mean * 100)}`, String(Math.round(mean * 100)));
          b.type = 'button';
          b.dataset.student = s.id;
          b.setAttribute('aria-label', `${s.name}, ${label(r.tag)}: ${Math.round(mean * 100)}% from ${mine.length}`);
          b.addEventListener('click', () => evidenceSheet(`${s.name} · ${label(r.tag)}`, mine, (src) => titleOf.get(src) ?? src, itemName));
          td.append(b);
        } else td.append(el('span', 'mb-heat--none', '–'));
        tr.append(td);
      }
      heat.append(tr);
    }
    const heatWrap = el('div', 'mb-grid');
    heatWrap.append(heat);
    heatHost.replaceChildren(sectionHead('Students × tags'), heatWrap);
  };
  paint();
  return root;
}
