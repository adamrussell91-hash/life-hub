import { el } from '@/quiz/dom';
import type { InsightContext } from '@/evidence/context';
import { classEvidence } from '@/evidence/class-evidence';
import { pct } from '@/evidence/views/parts';
import { RUNG_IDS } from '@/skills/schema';
import { RUNG_LETTER, RUNG_NAME, sortPoints, syllabusGrid, type GridCell, type GridLine, type PointRow, type PointSort } from '@/evidence/syllabus-grid';
import type { Evidence } from '@/evidence/types';
import type { MarkbookView, RosterStudent } from './types';

/**
 * The Grid: syllabus dot points down the side, students across. A dot point
 * opens into its outcomes, concept bullets, skills (on their ladder) and, when
 * asked for, techniques. Opens first in the markbook.
 */

/** Kept by the markbook between redraws. */
export type SyllabusGridState = { sort: PointSort; open: Set<string>; techniques: boolean; showEmpty: boolean };
export const newSyllabusGridState = (): SyllabusGridState => ({ sort: 'weakest', open: new Set(), techniques: false, showEmpty: false });

export type SyllabusGridActions = {
  openStudent: (studentId: string) => void;
  followUp?: (tag: string, students: string[], evidence: Evidence[]) => void;
  planTutorial?: (tag: string, students: string[], evidence: Evidence[]) => void;
  repaint: () => void;
};

const BAND_TEXT = { weak: 'not yet', developing: 'developing', secure: 'secure' } as const;

function cellText(cell: GridCell, ladder: boolean): string {
  if (ladder) return cell.rung === null ? 'no marks' : cell.rung === 'below' ? 'building towards Capable' : RUNG_NAME[cell.rung];
  return cell.band === null ? 'no marks' : `${BAND_TEXT[cell.band]}, ${pct(cell.mean)}`;
}

function cellClass(cell: GridCell | undefined, ladder: boolean): string {
  if (!cell) return 'mbg-cell mbg-cell--none';
  if (ladder) return `mbg-cell mbg-cell--r-${cell.rung ?? 'none'}`;
  return `mbg-cell mbg-cell--${cell.band ?? 'none'}`;
}

function cellFor(line: GridLine, student: RosterStudent): HTMLElement {
  const cell = line.cells[student.id];
  const span = el('span', cellClass(cell, line.ladder), line.ladder && cell?.rung && cell.rung !== 'below' ? RUNG_LETTER[cell.rung] : '');
  span.setAttribute('role', 'img');
  span.setAttribute('aria-label', `${student.name}: ${cell ? cellText(cell, line.ladder) : 'no marks'}`);
  return span;
}

function classText(line: GridLine): string {
  if (line.ladder) return line.classRung === null ? '–' : line.classRung === 'below' ? 'Building' : RUNG_NAME[line.classRung];
  return pct(line.mean);
}

function legend(): HTMLElement {
  const wrap = el('div', 'mbg__legend');
  const row = (label: string, items: Array<[string, string]>): HTMLElement => {
    const p = el('p', 'mb-next__legend');
    p.append(el('span', 'mbg__legend-label', label));
    for (const [cls, text] of items) {
      const k = el('span', 'mb-next__key');
      k.append(el('span', `mbg-cell mbg-cell--sw ${cls}`), document.createTextNode(text));
      p.append(k);
    }
    return p;
  };
  wrap.append(
    row('Outcomes and techniques', [['mbg-cell--weak', 'not yet'], ['mbg-cell--developing', 'developing'], ['mbg-cell--secure', 'secure'], ['mbg-cell--none', 'no marks']]),
    row('Skills, on their ladder', [
      ['mbg-cell--r-below', 'building towards Capable'],
      ...RUNG_IDS.map((r): [string, string] => [`mbg-cell--r-${r}`, `${RUNG_LETTER[r]} ${RUNG_NAME[r]}`]),
      ['mbg-cell--none', 'no marks']
    ])
  );
  return wrap;
}

function pills<T extends string>(label: string, options: Array<[T, string]>, current: T, onPick: (value: T) => void): HTMLElement {
  const group = el('div', 'ev-switch');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  for (const [value, text] of options) {
    const b = el('button', 'ev-switch__pill', text);
    b.type = 'button';
    b.dataset.sort = value;
    b.setAttribute('aria-pressed', String(value === current));
    b.addEventListener('click', () => onPick(value));
    group.append(b);
  }
  return group;
}

/** The names of the students behind on a dot point, with the two things to do about it. */
function pullAside(row: PointRow, students: RosterStudent[], evidence: Evidence[], actions: SyllabusGridActions): HTMLElement {
  const box = el('div', 'mbg-aside');
  const byId = new Map(students.map((s) => [s.id, s]));
  const marked = Object.values(row.line.cells).some((c) => c.band !== null);
  if (!marked) {
    box.append(el('p', 'mbg-aside__text', 'No marks reach this dot point yet.'));
    return box;
  }
  if (!row.weak.length) {
    box.append(el('p', 'mbg-aside__text', 'Every student with marks here has reached developing or secure.'));
    return box;
  }
  const names = row.weak.map((id) => byId.get(id)?.name ?? 'Removed student').join(', ');
  const text = el('p', 'mbg-aside__text');
  text.append(el('strong', undefined, 'Pull aside: '), document.createTextNode(names));
  box.append(text);
  const tools = el('div', 'mb-move__tools');
  if (actions.followUp) {
    const ann = el('button', 'btn btn--secondary mbg-ann', 'Ann drafts follow-up');
    ann.type = 'button';
    ann.addEventListener('click', () => actions.followUp?.(row.tag, row.weak, evidence));
    tools.append(ann);
  }
  if (actions.planTutorial) {
    const plan = el('button', 'btn btn--secondary mbg-tutorial', 'Plan a tutorial');
    plan.type = 'button';
    plan.addEventListener('click', () => actions.planTutorial?.(row.tag, row.weak, evidence));
    tools.append(plan);
  }
  box.append(tools);
  return box;
}

function groupsOf(row: PointRow, state: SyllabusGridState): Array<{ title: string; lines: GridLine[] }> {
  const groups = [
    { title: 'Outcomes', lines: row.outcomes },
    { title: 'Skills, on their ladder', lines: row.skills }
  ];
  if (state.techniques) groups.push({ title: 'Techniques', lines: row.techniques });
  return groups.filter((g) => g.lines.length);
}

function conceptsBlock(row: PointRow): HTMLElement | null {
  if (!row.concepts.length) return null;
  const box = el('div', 'mbg-concepts');
  box.append(el('p', 'mbg-concepts__title', 'Concepts · linked to this dot point, with no marks of their own'));
  const list = el('ul', 'mbg-concepts__list');
  for (const c of row.concepts) {
    const li = el('li');
    li.append(el('strong', undefined, `${c.name} ${c.ref}`), document.createTextNode(` ${c.text}`));
    list.append(li);
  }
  box.append(list);
  return box;
}

function lineLabel(line: GridLine): HTMLElement {
  const wrap = el('span', 'mbg-line__name');
  wrap.append(el('span', 'mbg-line__label', line.label));
  if (line.sub) wrap.append(el('span', 'mbg-line__sub', line.sub));
  return wrap;
}

function spreadBar(line: GridLine): HTMLElement {
  const bar = el('span', 'mb-next__bar mb-next__bar--small');
  bar.setAttribute('role', 'img');
  const parts = [['weak', 'not yet'], ['developing', 'developing'], ['secure', 'secure'], ['none', 'no marks']] as const;
  bar.setAttribute('aria-label', parts.filter(([k]) => line.spread[k]).map(([k, t]) => `${line.spread[k]} ${t}`).join(', ') || 'No students');
  for (const [k] of parts) {
    if (!line.spread[k]) continue;
    const seg = el('span', `mb-next__seg mb-next__seg--${k}`);
    seg.style.flexGrow = String(line.spread[k]);
    bar.append(seg);
  }
  return bar;
}

export function renderSyllabusGrid(
  view: MarkbookView,
  students: RosterStudent[],
  ctx: InsightContext,
  state: SyllabusGridState,
  actions: SyllabusGridActions,
  narrow: boolean
): HTMLElement {
  const root = el('div', 'mbg');
  const listed = students.filter((s) => !s.removed);
  const { evidence } = classEvidence(view, ctx);
  const rows = syllabusGrid(evidence, ctx.alignment ?? null, ctx.outcomes, ctx, listed.map((s) => s.id));
  if (!rows.length) {
    root.append(el('p', 'mb__empty', 'No syllabus is loaded for this subject, so dot points can’t be drawn. Marks has the table of quizzes and tasks.'));
    return root;
  }
  const sorted = sortPoints(rows, state.sort);
  const marked = sorted.filter((r) => r.line.mean !== null);
  const empty = sorted.filter((r) => r.line.mean === null);

  const bar = el('div', 'mbg__bar');
  bar.append(pills<PointSort>('Sort dot points', [['weakest', 'Weakest first'], ['syllabus', 'Syllabus order']], state.sort, (v) => {
    state.sort = v;
    actions.repaint();
    root.ownerDocument.querySelector<HTMLElement>(`.mbg [data-sort="${v}"]`)?.focus();
  }));
  const tech = el('button', 'ev-switch__pill mbg__tech', 'Show techniques');
  tech.type = 'button';
  tech.setAttribute('aria-pressed', String(state.techniques));
  tech.addEventListener('click', () => {
    state.techniques = !state.techniques;
    actions.repaint();
    root.ownerDocument.querySelector<HTMLElement>('.mbg__tech')?.focus();
  });
  bar.append(tech);
  root.append(bar, legend());

  const toggle = (row: PointRow): void => {
    if (state.open.has(row.tag)) state.open.delete(row.tag);
    else state.open.add(row.tag);
    actions.repaint();
    root.ownerDocument.querySelector<HTMLElement>(`.mbg-row__toggle[data-tag="${CSS.escape(row.tag)}"]`)?.focus();
  };
  const toggleButton = (row: PointRow): HTMLButtonElement => {
    const b = el('button', 'mbg-row__toggle');
    b.type = 'button';
    b.dataset.tag = row.tag;
    b.setAttribute('aria-expanded', String(state.open.has(row.tag)));
    b.append(el('span', 'mbg-row__label', row.label), el('span', 'mbg-row__area', row.areaName));
    b.addEventListener('click', () => toggle(row));
    return b;
  };

  const shown = state.showEmpty ? [...marked, ...empty] : marked;

  if (narrow) {
    const list = el('div', 'mbg-stack');
    for (const row of shown) {
      const open = state.open.has(row.tag);
      const card = el('section', `mbg-card${open ? ' is-open' : ''}`);
      const head = toggleButton(row);
      const meta = el('span', 'mbg-card__meta');
      meta.append(spreadBar(row.line), el('span', 'mbg-card__pct', classText(row.line)));
      head.append(meta);
      card.append(head);
      if (open) {
        for (const g of groupsOf(row, state)) {
          card.append(el('h5', 'mbg-group', g.title));
          for (const line of g.lines) {
            const item = el('div', 'mbg-line');
            const right = el('span', 'mbg-line__right');
            if (line.ladder) right.append(el('span', 'mbg-line__rung', classText(line)));
            else right.append(spreadBar(line), el('span', 'mbg-card__pct', classText(line)));
            item.append(lineLabel(line), right);
            card.append(item);
          }
        }
        const concepts = conceptsBlock(row);
        if (concepts) card.append(concepts);
        card.append(pullAside(row, students, evidence, actions));
      }
      list.append(card);
    }
    root.append(list);
  } else {
    const wrap = el('div', 'mbg__scroll');
    const table = el('table', 'mbg__table');
    const head = el('thead');
    const hr = el('tr');
    hr.append(el('th', 'mbg__corner', 'Syllabus dot point'), el('th', 'mbg__class', 'Class'));
    for (const s of listed) {
      const th = el('th', 'mbg__student');
      const b = el('button', 'mbg__initials mb-patterns__name', s.initials);
      b.type = 'button';
      b.title = s.name;
      b.dataset.student = s.id;
      b.setAttribute('aria-label', `${s.name}, open their panel`);
      b.addEventListener('click', () => actions.openStudent(s.id));
      th.append(b);
      hr.append(th);
    }
    head.append(hr);
    const body = el('tbody');
    const span = listed.length + 2;
    const lineRow = (line: GridLine, kind: string): HTMLElement => {
      const tr = el('tr', `mbg-line-row mbg-line-row--${kind}`);
      const th = el('th', 'mbg-line__head');
      th.scope = 'row';
      th.append(lineLabel(line));
      const cls = el('td', 'mbg__class', classText(line));
      tr.append(th, cls);
      for (const s of listed) {
        const td = el('td', 'mbg__cell');
        td.append(cellFor(line, s));
        tr.append(td);
      }
      return tr;
    };
    for (const row of shown) {
      const open = state.open.has(row.tag);
      const tr = el('tr', `mbg-row${open ? ' is-open' : ''}${row.line.mean === null ? ' is-empty' : ''}`);
      const th = el('th', 'mbg-row__head');
      th.scope = 'row';
      th.append(toggleButton(row));
      tr.append(th, el('td', 'mbg__class', classText(row.line)));
      for (const s of listed) {
        const td = el('td', 'mbg__cell');
        td.append(cellFor(row.line, s));
        tr.append(td);
      }
      body.append(tr);
      if (!open) continue;
      for (const g of groupsOf(row, state)) {
        const gh = el('tr', 'mbg-group-row');
        const cell = el('th', undefined, g.title);
        cell.colSpan = span;
        gh.append(cell);
        body.append(gh);
        for (const line of g.lines) body.append(lineRow(line, line.ladder ? 'skill' : g.title === 'Techniques' ? 'tech' : 'out'));
      }
      const extras = el('tr', 'mbg-extras-row');
      const td = el('td');
      td.colSpan = span;
      const concepts = conceptsBlock(row);
      if (concepts) td.append(concepts);
      td.append(pullAside(row, students, evidence, actions));
      extras.append(td);
      body.append(extras);
    }
    table.append(head, body);
    wrap.append(table);
    root.append(wrap);
  }
  if (!marked.length) root.append(el('p', 'mb__empty', 'No marks reach a dot point yet. Add dot points to a quiz’s lesson, or outcomes to a task’s criteria.'));
  if (empty.length) {
    const more = el('button', 'btn btn--ghost mb-next__more', state.showEmpty ? 'Hide dot points with no marks' : `Show ${empty.length} dot point${empty.length === 1 ? '' : 's'} with no marks`);
    more.type = 'button';
    more.addEventListener('click', () => {
      state.showEmpty = !state.showEmpty;
      actions.repaint();
    });
    root.append(more);
  }
  return root;
}

