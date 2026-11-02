import { withAppBase } from '@/app/base-path';
import { isCurriculumLinesV2 } from '@/schemas/block';
import type { Unit } from '@/schemas';
import { loadSkills } from '@/skills/api';
import type { SkillsContinuum } from '@/skills/schema';
import type { CurriculumResponse } from '@/teacher/nav';
import { saveSubjectLines, yearNetworkUnits } from '@/teacher/network-context';
import { el, ghostButton, mountLinesEditor } from '@/network/lines-editor';
import { loadAlignment } from './coverage-panel';
import { buildYearCoverage, type CoverageCell, type CoverageRow, type YearCoverage, type YearUnit } from './year-coverage';
import '@/network/network.css';
import './year-coverage.css';

const STATE_TEXT: Record<CoverageCell['state'], string> = { taught: '', extra: '', gap: 'none yet', later: 'expected', none: '' };
const tone = (n: number) => (n >= 8 ? 4 : n >= 5 ? 3 : n >= 3 ? 2 : 1);

function mapFocusArea(unit: Unit): string | undefined {
  for (const block of unit.blocks ?? []) {
    if (block.block_type === 'curriculum_lines' && isCurriculumLinesV2(block.content) && block.content.focus_area) return block.content.focus_area;
  }
  return undefined;
}

/** The subject's units in scope order, each lesson with its dot points. */
export function yearUnits(curriculum: CurriculumResponse, subjectId: string): YearUnit[] {
  const lessons = new Map(curriculum.lessons.map((l) => [l.id, l]));
  const units = new Map(curriculum.units.map((u) => [u.id, u]));
  return yearNetworkUnits(curriculum, subjectId).map((u) => {
    const unit = units.get(u.id)!;
    const focusArea = mapFocusArea(unit);
    return {
      id: u.id,
      title: u.title,
      ...(focusArea ? { focusArea } : {}),
      lessons: u.lessons.map((l) => {
        const full = lessons.get(l.id);
        return { id: l.id, title: l.title || 'Untitled lesson', href: withAppBase(`/lessons/${l.id}`), ...(full?.dot_points ? { dot_points: full.dot_points } : {}) };
      })
    };
  });
}

/**
 * Scope & Sequence → Coverage: the year's syllabus coverage as a grid. Rows
 * are concepts, skills strands and outcomes (plus each area's dot points);
 * columns are the focus areas. Cells fill from the dot points tagged on
 * lessons. Tap a cell to list its lessons.
 */
export function mountYearCoverageView(host: HTMLElement, curriculum: CurriculumResponse, subjectId: string): void {
  const subject = curriculum.subjects.find((s) => s.id === subjectId);
  if (!subject) return;
  const root = el('div', 'ycov');
  host.replaceChildren(root);
  root.append(el('p', 'ycov__hint', 'Loading the syllabus…'));
  let linesOpen = false;
  let cov: YearCoverage | null = null;
  let picked: { row: string; area: number } | null = null;
  const shut = new Set<string>();

  void Promise.all([loadAlignment(), loadSkills().catch((): SkillsContinuum | null => null)])
    .then(([doc, skills]) => {
      cov = buildYearCoverage(doc, skills, yearUnits(curriculum, subjectId));
      paint();
    })
    .catch(() => root.replaceChildren(el('p', 'ycov__hint', 'The syllabus couldn’t be loaded. Try again in a moment.')));

  function toolbar(): HTMLElement {
    const bar = el('div', 'net-year__bar');
    const lines = ghostButton(linesOpen ? 'Hide lines' : 'Edit lines', () => { linesOpen = !linesOpen; paint(); });
    lines.setAttribute('aria-expanded', String(linesOpen));
    bar.append(lines, el('span', 'net-year__hint', 'Cells fill from the dot points tagged on lessons. Tap a number for its lessons.'));
    return bar;
  }

  function linesPanel(): HTMLElement {
    const panel = el('div', 'net-year__lines');
    panel.append(el('h3', 'net-year__heading', 'Lines'));
    panel.append(el('p', 'net-year__hint', 'The lines every unit map in this subject shares. Trains are syllabus groupings, metro lines are concepts, light rail is skills.'));
    mountLinesEditor(panel, {
      lines: subject!.network_lines ?? [],
      syllabus: true,
      onSave: (next) => saveSubjectLines(curriculum, subjectId, next)
    });
    return panel;
  }

  function legend(): HTMLElement {
    const box = el('div', 'ycov__legend');
    const item = (cls: string, text: string) => {
      const span = el('span');
      span.append(el('i', `ycov__key ${cls}`), document.createTextNode(text));
      box.append(span);
    };
    item('ycov__c--t3', 'Taught (darker = more lessons)');
    item('ycov__c--gap', 'Expected, no lesson yet');
    item('ycov__c--later', 'Expected, area not planned yet');
    item('ycov__c--extra', 'Taught beyond what’s expected');
    return box;
  }

  function areaHead(i: number): HTMLElement {
    const a = cov!.areas[i]!;
    const th = el('th', 'ycov__area');
    th.scope = 'col';
    th.append(el('span', 'ycov__area-name', a.name));
    const meta = el('span', 'ycov__area-meta');
    if (a.planned) meta.append(el('span', 'ycov__live', `${a.tagged} of ${a.lessonCount} ${a.lessonCount === 1 ? 'lesson' : 'lessons'} tagged`));
    else if (a.units.length) meta.append(`${a.lessonCount} ${a.lessonCount === 1 ? 'lesson' : 'lessons'} · `, el('b', undefined, 'none tagged yet'));
    else meta.textContent = 'Not in the scope and sequence yet';
    th.append(meta);
    return th;
  }

  function yearCell(row: CoverageRow): HTMLElement {
    const td = el('td', 'ycov__year');
    const { expected, taught, gaps } = row.year;
    if (!expected) td.append(el('span', 'ycov__soon', '·'));
    else if (gaps) td.append(el('span', 'ycov__gap-text', `${gaps} ${gaps === 1 ? 'gap' : 'gaps'}`), ` · ${taught}/${expected} areas`);
    else if (taught === expected) td.append(el('span', 'ycov__ok', `✓ all ${expected}`));
    else td.append(el('span', 'ycov__soon', `${taught} of ${expected} ${expected === 1 ? 'area' : 'areas'} so far`));
    return td;
  }

  function cell(row: CoverageRow, i: number): HTMLElement {
    const td = el('td', 'ycov__cell');
    const c = row.cells[i]!;
    if (c.state === 'none') return td;
    const n = c.lessons.length;
    const cls = c.state === 'taught' ? `ycov__c--t${tone(n)}` : `ycov__c--${c.state}`;
    if (n) {
      const b = el('button', `ycov__c ${cls}`, c.state === 'extra' ? `${n} extra` : String(n));
      b.type = 'button';
      const on = picked?.row === row.id && picked.area === i;
      if (on) b.classList.add('ycov__c--on');
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', `${row.name}, ${cov!.areas[i]!.name}: ${n} ${n === 1 ? 'lesson' : 'lessons'}`);
      b.addEventListener('click', () => { picked = on ? null : { row: row.id, area: i }; paint(); });
      td.append(b);
    } else td.append(el('span', `ycov__c ${cls}`, STATE_TEXT[c.state]));
    return td;
  }

  function group(tbody: HTMLTableSectionElement, id: string, title: string, rows: HTMLTableRowElement[]): void {
    const tr = el('tr', `ycov__group${shut.has(id) ? ' ycov__group--shut' : ''}`);
    const td = el('td');
    td.colSpan = cov!.areas.length + 2;
    const b = el('button', 'ycov__fold');
    b.type = 'button';
    b.setAttribute('aria-expanded', String(!shut.has(id)));
    b.append(el('span', 'ycov__chev', '▾'), title, el('span', 'ycov__count', String(rows.length)));
    b.addEventListener('click', () => { if (shut.has(id)) shut.delete(id); else shut.add(id); paint(); });
    td.append(b);
    tr.append(td);
    tbody.append(tr);
    if (!shut.has(id)) tbody.append(...rows);
  }

  function rowEl(row: CoverageRow): HTMLTableRowElement {
    const tr = el('tr');
    const th = el('th', 'ycov__rowhead');
    th.scope = 'row';
    const name = el('span', 'ycov__rowname', row.name);
    if (row.detail) name.title = row.detail;
    th.append(name);
    tr.append(th, ...cov!.areas.map((_, i) => cell(row, i)), yearCell(row));
    return tr;
  }

  function pointsRow(): HTMLTableRowElement {
    const tr = el('tr');
    const th = el('th', 'ycov__rowhead');
    th.scope = 'row';
    th.append(el('span', 'ycov__rowname', 'U and R points'));
    tr.append(th);
    for (const a of cov!.areas) {
      const td = el('td', 'ycov__cell');
      const box = el('div', 'ycov__pts');
      for (const p of a.points) {
        const n = p.lessons.length;
        const chip = el('span', `ycov__pt ycov__pt--${n ? 'on' : a.planned ? 'gap' : 'later'}`, p.id);
        chip.title = `${p.id} ${p.short}${n ? ` · ${n} ${n === 1 ? 'lesson' : 'lessons'}` : ''}`;
        box.append(chip);
      }
      td.append(box);
      tr.append(td);
    }
    const all = cov!.areas.reduce((n, a) => n + a.points.length, 0);
    const taught = cov!.areas.reduce((n, a) => n + a.points.filter((p) => p.lessons.length).length, 0);
    const yr = el('td', 'ycov__year');
    yr.append(el('span', 'ycov__soon', `${taught} of ${all} points`));
    tr.append(yr);
    return tr;
  }

  function side(): HTMLElement {
    const aside = el('aside', 'ycov__side');
    const rows = [...cov!.concepts, ...cov!.skills, ...cov!.outcomes];
    const row = picked ? rows.find((r) => r.id === picked!.row) : undefined;
    if (row && picked) {
      const c = row.cells[picked.area]!;
      aside.append(el('h3', 'ycov__side-title', `${row.name} · ${cov!.areas[picked.area]!.name}`));
      if (row.detail) aside.append(el('p', 'ycov__hint', row.detail));
      aside.append(el('p', 'ycov__hint', `${c.lessons.length} ${c.lessons.length === 1 ? 'lesson' : 'lessons'}`));
      const ol = el('ol', 'ycov__lessons');
      for (const lesson of c.lessons) {
        const li = el('li');
        const a = el('a', undefined, lesson.title);
        if (lesson.href) a.href = lesson.href;
        li.append(a);
        ol.append(li);
      }
      aside.append(ol);
    } else {
      aside.append(el('h3', 'ycov__side-title', 'Tap a number'), el('p', 'ycov__hint', 'Its lessons show here.'));
    }
    const gaps = el('div', 'ycov__gaps');
    gaps.append(el('h4', 'ycov__gaps-title', 'Gaps in areas you’re teaching'));
    if (!cov!.areas.some((a) => a.planned)) gaps.append(el('p', 'ycov__hint', 'Tag dot points on lessons to see gaps here.'));
    else if (!cov!.gaps.length) gaps.append(el('p', 'ycov__hint', 'Every concept, skill, outcome and dot point these areas expect has a lesson.'));
    else {
      const ul = el('ul', 'ycov__gap-list');
      for (const g of cov!.gaps) ul.append(el('li', undefined, `${g.label} (${g.area})`));
      gaps.append(ul);
    }
    aside.append(gaps);
    return aside;
  }

  function paint(): void {
    if (!cov) return;
    const table = el('table', 'ycov__table');
    const thead = el('thead');
    const hr = el('tr');
    const corner = el('th', 'ycov__rowhead');
    corner.scope = 'col';
    const yearHead = el('th', 'ycov__area');
    yearHead.scope = 'col';
    yearHead.append(el('span', 'ycov__area-name', 'Across the year'));
    hr.append(corner, ...cov.areas.map((_, i) => areaHead(i)), yearHead);
    thead.append(hr);
    const tbody = el('tbody');
    group(tbody, 'points', 'Dot points', [pointsRow()]);
    group(tbody, 'concepts', 'Concepts', cov.concepts.map(rowEl));
    if (cov.skills.length) group(tbody, 'skills', 'Skills', cov.skills.map(rowEl));
    group(tbody, 'outcomes', 'Outcomes', cov.outcomes.map(rowEl));
    table.append(thead, tbody);
    const scroll = el('div', 'ycov__scroll');
    scroll.append(table);
    const body = el('div', 'ycov__body');
    body.append(scroll, side());
    const keep = root.querySelector<HTMLElement>('.ycov__scroll')?.scrollLeft ?? 0;
    root.replaceChildren(toolbar(), ...(linesOpen ? [linesPanel()] : []), legend(), body);
    scroll.scrollLeft = keep;
  }
}
