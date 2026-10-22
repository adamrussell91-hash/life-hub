import type { NetworkLine } from '@/schemas/block';
import { lineColour } from '@/network/colour';
import { loadSkills } from '@/skills/api';
import type { SkillsContinuum } from '@/skills/schema';
import { fetchAlignment } from './api';
import { focusAreaFor, unitCoverage, type CoverageItem, type CoverageLesson, type LineCoverage } from './coverage';
import type { Alignment } from './schema';
import './coverage.css';

let alignmentLoad: Promise<Alignment> | null = null;

/** The alignment, fetched once per page and shared by the maps and lesson pages that need it. */
export function loadAlignment(): Promise<Alignment> {
  alignmentLoad ??= fetchAlignment().then((r) => r.alignment);
  alignmentLoad.catch(() => { alignmentLoad = null; });
  return alignmentLoad;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export type CoveragePanelOptions = {
  lines: readonly NetworkLine[];
  lessons: readonly CoverageLesson[];
  unitTitle?: string;
  /** The map's chosen focus area, if any. */
  focusArea?: string;
};

/**
 * Under a unit map, for teachers: one row per line with the syllabus items it
 * covers (filled) and the ones no lesson on it teaches yet (hollow), the
 * outcomes it reaches, and the unit's gaps. Tap an item to see who teaches it.
 * Draws nothing when the unit isn't in a syllabus the alignment knows.
 */
export function mountCoveragePanel(host: HTMLElement, options: CoveragePanelOptions): void {
  const root = el('section', 'cov');
  root.setAttribute('aria-label', 'Syllabus coverage');
  root.hidden = true;
  host.append(root);
  void Promise.all([loadAlignment(), loadSkills().catch((): SkillsContinuum | null => null)])
    .then(([doc, skills]) => {
      const area = focusAreaFor(doc, options.unitTitle, options.focusArea);
      if (!area) return;
      paint(root, unitCoverage(doc, skills, area, options.lines, options.lessons), doc);
      root.hidden = false;
    })
    .catch(() => { /* No alignment for this subject: the map stands on its own. */ });
}

function paint(root: HTMLElement, cov: ReturnType<typeof unitCoverage>, doc: Alignment): void {
  const detail = el('p', 'cov__detail');
  detail.setAttribute('role', 'status');
  const head = el('div', 'cov__head');
  head.append(el('h4', 'cov__title', 'Syllabus coverage'), el('span', 'cov__area', cov.area.name));
  const legend = el('p', 'cov__legend', 'Filled: a lesson on this line teaches it. Hollow: not yet. Tap one to see where.');
  const rows = el('div', 'cov__rows');
  for (const row of cov.rows) rows.append(rowView(row, detail));
  const gaps = el('p', 'cov__gaps');
  const parts: string[] = [];
  if (cov.gaps.points.length) parts.push(`dot points ${cov.gaps.points.join(', ')}`);
  if (cov.gaps.outcomes.length) parts.push(`${cov.gaps.outcomes.length === 1 ? 'outcome' : 'outcomes'} ${cov.gaps.outcomes.join(', ')}`);
  gaps.textContent = parts.length ? `Not taught yet in this unit: ${parts.join(' · ')}` : 'Every dot point in this focus area is taught, and every outcome is reached.';
  if (!parts.length) gaps.classList.add('cov__gaps--done');
  const outcomeName = (n: number) => doc.outcomes.find((o) => o.n === n)?.code ?? String(n);
  gaps.title = cov.gaps.outcomes.map(outcomeName).join(', ');
  root.replaceChildren(head, legend, rows, gaps, detail);
}

function rowView(row: LineCoverage, detail: HTMLElement): HTMLElement {
  const r = el('div', `cov__row cov__row--${row.line.alignment?.kind ?? 'none'}`);
  const badge = el('span', `cov__badge cov__badge--${row.line.mode}`, row.line.short || row.line.name.slice(0, 4).toUpperCase());
  badge.style.setProperty('--net-colour', lineColour(row.line.colour));
  badge.title = row.line.name;
  const what = el('span', 'cov__what', row.heading || 'Not linked to the syllabus yet');
  if (!row.heading) what.classList.add('cov__what--none');
  r.append(badge, what);
  const items = el('div', 'cov__items');
  if (!row.heading) items.append(el('span', 'cov__hint', 'Link it in the subject’s lines.'));
  else if (!row.items.length) items.append(el('span', 'cov__hint', 'Nothing in this focus area.'));
  for (const item of row.items) items.append(itemView(item, row, detail));
  const outs = el('div', 'cov__outcomes');
  outs.setAttribute('aria-label', 'Outcomes reached');
  for (const n of row.outcomes) outs.append(el('span', 'cov__outcome', String(n)));
  r.append(items, outs);
  return r;
}

function itemView(item: CoverageItem, row: LineCoverage, detail: HTMLElement): HTMLElement {
  const strand = row.line.alignment?.kind === 'strand';
  const b = el('button', `cov__item${strand ? ' cov__item--pill' : ''}${item.covered ? ' cov__item--on' : ''}`, item.label);
  b.type = 'button';
  b.title = item.title;
  b.setAttribute('aria-label', `${item.label}: ${item.covered ? `taught in ${item.lessons.join(', ')}` : 'not taught yet'}`);
  b.addEventListener('click', () => {
    detail.textContent = item.covered
      ? `${row.line.short || row.line.name} · ${item.label}: ${item.title} Taught in ${item.lessons.join(', ')}.`
      : `${row.line.short || row.line.name} · ${item.label}: ${item.title} No lesson on this line teaches it yet.`;
  });
  return b;
}
