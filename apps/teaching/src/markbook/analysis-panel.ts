import { el } from '@/quiz/dom';
import { stepChart } from '@/progress/step-chart';
import { skillPath } from '@/progress/skill-path';
import { codeGrid } from '@/progress/code-grid';
import { placeName } from '@/progress/story-text';
import type { CodeRow, PieceCol, Place, SkillRow, Story, TargetRow } from '@/progress/types';
import '@/progress/progress.css';

export type AnalysisStudent = {
  pieces: PieceCol[];
  outcomes: TargetRow[];
  concepts: TargetRow[];
  skills: { strand: string; rows: SkillRow[] }[];
  codes: CodeRow[];
  next?: unknown[];
  unseen?: number;
};
export type ClassPattern = { key: string; step: Place; students: string[]; names: string[]; code_id: string | null };
export type AnalysisData = { student: AnalysisStudent; class_patterns: ClassPattern[] };
export type AnalysisOptions = {
  /** Display name for a target key such as `out:abc`. */
  outcomeName: (key: string) => string;
  onGroup: (studentIds: string[], pattern: ClassPattern) => void;
};

/** One line per row, in the teacher's words, from the same stories the student sees. */
function saysLine(story: Story, name: string, codeOf: (id: string | null) => string | null, pieces: PieceCol[]): string | null {
  if (story.kind === 'holding') {
    const code = codeOf(story.code_id);
    return `Holding at ${placeName(story.step)} on ${name} for ${story.count} pieces.${code ? ` ${code} each time.` : ''}`;
  }
  if (story.kind === 'moved_up') {
    const piece = pieces.find((p) => p.id === story.piece_id);
    return `Up to ${placeName(story.to)} on ${name}${piece ? ` since ${piece.label}` : ''}.`;
  }
  if (story.kind === 'few') return `${name} has just started showing up.`;
  return null;
}

export function analysisPanel(data: AnalysisData, o: AnalysisOptions): HTMLElement {
  const root = el('section', 'mb-analysis');
  const { student } = data;
  const codeOf = (id: string | null): string | null => (id ? (student.codes.find((c) => c.code_id === id)?.code ?? null) : null);

  const says = el('div', 'an-says');
  says.append(el('h5', 'mb-form__label', 'What the data says'));
  const list = el('ul', 'an-says__list');
  const rows: { name: string; row: { story: Story } }[] = [
    ...student.outcomes.map((r) => ({ name: r.name, row: r })),
    ...student.concepts.map((r) => ({ name: r.name, row: r })),
    ...student.skills.flatMap((s) => s.rows.map((r) => ({ name: r.name, row: r })))
  ];
  for (const { name, row } of rows) {
    const line = saysLine(row.story, name, codeOf, student.pieces);
    if (line) list.append(el('li', undefined, line));
  }
  if (!list.children.length) list.append(el('li', 'mb__empty', 'No returned pieces yet.'));
  says.append(list);
  root.append(says);

  const targets = [...student.outcomes, ...student.concepts];
  if (targets.length) {
    const charts = el('div', 'an-charts');
    for (const row of targets) {
      const block = el('div', 'an-chart');
      block.append(el('h5', 'mb-form__label', row.name), stepChart(row.cells as (Place | null)[], student.pieces));
      charts.append(block);
    }
    root.append(charts);
  }
  for (const group of student.skills) {
    const block = el('div', 'an-skills');
    block.append(el('h5', 'mb-form__label', group.strand));
    for (const row of group.rows) block.append(el('p', 'an-skills__name', row.name), skillPath(row));
    root.append(block);
  }
  if (student.codes.length) root.append(el('h5', 'mb-form__label', 'Codes by piece'), codeGrid(student.codes, student.pieces));

  const cls = el('div', 'an-class');
  cls.append(el('h5', 'mb-form__label', 'Class: holding on the same step'));
  if (!data.class_patterns.length) cls.append(el('p', 'mb__empty', 'No group of three or more is holding together yet.'));
  const known = new Map<string, string>([...student.outcomes, ...student.concepts].map((r) => [r.key, r.name]));
  for (const g of student.skills) for (const r of g.rows) known.set(r.key, r.name);
  for (const p of data.class_patterns) {
    const code = codeOf(p.code_id) ?? (p.code_id ? p.code_id.toUpperCase() : null);
    const line = el('p', 'an-class__line', `${p.students.length} students holding at ${placeName(p.step)} on ${known.get(p.key) ?? o.outcomeName(p.key)}${code ? `; top code ${code}` : ''}`);
    line.title = p.names.join(', ');
    const make = el('button', 'btn btn--ghost', 'Make a group');
    make.type = 'button';
    make.dataset.action = 'group';
    make.addEventListener('click', () => o.onGroup(p.students, p));
    const row = el('div', 'an-class__row');
    row.append(line, make);
    cls.append(row);
  }
  root.append(cls);
  return root;
}
