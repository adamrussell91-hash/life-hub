import { el } from '@/quiz/dom';
import type { InsightContext } from '@/evidence/context';
import { classEvidence } from '@/evidence/class-evidence';
import { moveKind, nextMoves, sortStudents, studentRows, syllabusRows, type Move, type Spread, type StudentSort, type SyllabusRow } from '@/evidence/next-moves';
import type { FocusPins } from '@/evidence/patterns';
import { tagLabel } from '@/evidence/tags';
import type { Evidence } from '@/evidence/types';
import { pct, sectionHead } from '@/evidence/views/parts';
import type { MarkbookView, RosterStudent } from './types';

/**
 * Next steps: what to teach next, where the class stands against the
 * syllabus, and the students who need what. Opens first in the markbook.
 */

export type SyllabusSort = 'weakest' | 'syllabus' | 'change';
/** Kept by the markbook between redraws. */
export type NextState = { syllabusSort: SyllabusSort; studentSort: StudentSort; openOutcomes: Set<string>; showAllMoves: boolean };
export const newNextState = (): NextState => ({ syllabusSort: 'weakest', studentSort: 'need', openOutcomes: new Set(), showAllMoves: false });

export type NextActions = {
  openStudent: (studentId: string) => void;
  followUp?: (tag: string, students: string[], evidence: Evidence[]) => void;
  /** Small group cards: plan a tutorial for the students behind on one tag. */
  planTutorial?: (tag: string, students: string[], evidence: Evidence[]) => void;
  pins: (studentId: string) => FocusPins;
  repaint: () => void;
};

/** Moves shown before "Show all". */
const FIRST_MOVES = 6;

const MOVE_TEXT: Record<Move['kind'], string> = { reteach: 'Reteach to the class', group: 'Pull a small group', move_on: 'Move on' };

function pills<T extends string>(label: string, options: Array<[T, string]>, current: T, onPick: (value: T) => void): HTMLElement {
  const group = el('div', 'ev-switch');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  for (const [value, text] of options) {
    const b = el('button', 'ev-switch__pill', text);
    b.type = 'button';
    b.dataset.sort = value;
    b.setAttribute('aria-pressed', String(value === current));
    b.addEventListener('click', () => {
      const had = document.activeElement === b;
      onPick(value);
      // The view redraws: keep keyboard focus on the pill just pressed.
      if (had) document.querySelector<HTMLElement>(`.ev-switch[aria-label="${label}"] [data-sort="${value}"]`)?.focus();
    });
    group.append(b);
  }
  return group;
}

/** Students by band as one bar, widest band widest. */
function spreadBar(spread: Spread, small = false): HTMLElement {
  const bar = el('span', `mb-next__bar${small ? ' mb-next__bar--small' : ''}`);
  bar.setAttribute('role', 'img');
  const parts: Array<[keyof Spread, string]> = [['weak', 'not yet'], ['developing', 'developing'], ['secure', 'secure'], ['none', 'no marks']];
  bar.setAttribute('aria-label', parts.filter(([k]) => spread[k]).map(([k, text]) => `${spread[k]} ${text}`).join(', ') || 'No students');
  for (const [k] of parts) {
    if (!spread[k]) continue;
    const seg = el('span', `mb-next__seg mb-next__seg--${k}`);
    seg.style.flexGrow = String(spread[k]);
    bar.append(seg);
  }
  return bar;
}

const signed = (change: number | null): string => (change === null ? '' : `${change >= 0 ? '+' : '−'}${Math.abs(Math.round(change * 100))}`);

function legend(): HTMLElement {
  const row = el('p', 'mb-next__legend');
  for (const [k, text] of [['weak', 'not yet'], ['developing', 'developing'], ['secure', 'secure'], ['none', 'no marks']] as const) {
    const item = el('span', 'mb-next__key');
    item.append(el('span', `mb-next__swatch mb-next__seg--${k}`), document.createTextNode(text));
    row.append(item);
  }
  return row;
}

export function renderNextSteps(view: MarkbookView, students: RosterStudent[], ctx: InsightContext, state: NextState, actions: NextActions): HTMLElement {
  const root = el('div', 'mb-next');
  const { evidence, sources } = classEvidence(view, ctx);
  const label = (tag: string): string => tagLabel(tag, ctx);
  const listed = students.filter((s) => !s.removed);
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const names = (ids: string[]): string => ids.map((id) => nameOf.get(id) ?? 'Removed student').join(', ');
  const kind = moveKind(evidence);

  // What to do next.
  const movesHost = el('div', 'mb-next__moves');
  const moves = kind ? nextMoves(evidence.filter((e) => nameOf.has(e.student)), kind) : [];
  if (!moves.length) {
    movesHost.append(el('p', 'mb__empty', kind ? 'No clear move yet. A tag needs marks from at least three students on two or more questions.' : 'No tagged marks yet. Tag quiz questions or task criteria to see next steps.'));
  }
  const shown = state.showAllMoves ? moves : moves.slice(0, FIRST_MOVES);
  for (const move of shown) {
    const card = el('article', `mb-move mb-move--${move.kind}`);
    card.dataset.tag = move.tag;
    card.append(el('p', 'mb-move__kind', MOVE_TEXT[move.kind]), el('h4', 'mb-move__tag', move.parts.map((p) => label(p.tag)).join(' · ')));
    const meta =
      move.kind === 'reteach'
        ? `${pct(move.mean)} · ${move.students.length} of ${move.assessed} not there yet`
        : move.kind === 'group'
          ? move.parts.length > 1
            ? `${move.students.length} students behind on ${move.parts.length}`
            : `Class ${pct(move.mean)} · ${move.students.length} well behind`
          : `${pct(move.mean)} · ${move.secure.length} of ${move.assessed} secure`;
    card.append(el('p', 'mb-move__meta', meta));
    const who = move.kind === 'move_on' ? move.secure : move.students;
    const list = el('p', 'mb-move__who', move.kind === 'move_on' ? `Ready to extend: ${names(who)}` : names(who));
    list.hidden = move.kind !== 'group';
    const tools = el('div', 'mb-move__tools');
    if (move.kind !== 'group') {
      const toggle = el('button', 'btn btn--ghost mb-move__toggle', move.kind === 'move_on' ? 'Who can extend' : 'Who');
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => {
        list.hidden = !list.hidden;
        toggle.setAttribute('aria-expanded', String(!list.hidden));
      });
      tools.append(toggle);
    }
    if (move.kind !== 'move_on' && actions.followUp) {
      // A merged group gets a follow-up per tag, for the students behind on it; each quiz stays on one thing.
      for (const part of move.parts) {
        const ann = el('button', 'btn btn--secondary mb-move__ann', move.parts.length > 1 ? `Ann drafts: ${label(part.tag)}` : 'Ann drafts follow-up');
        ann.type = 'button';
        ann.addEventListener('click', () => actions.followUp?.(part.tag, part.students, evidence));
        tools.append(ann);
      }
    }
    if (move.kind === 'group' && actions.planTutorial) {
      for (const part of move.parts) {
        const plan = el('button', 'btn btn--secondary mb-move__tutorial', move.parts.length > 1 ? `Plan a tutorial: ${label(part.tag)}` : 'Plan a tutorial');
        plan.type = 'button';
        plan.addEventListener('click', () => actions.planTutorial?.(part.tag, part.students, evidence));
        tools.append(plan);
      }
    }
    card.append(list, tools);
    movesHost.append(card);
  }
  if (moves.length > FIRST_MOVES) {
    const more = el('button', 'btn btn--ghost mb-next__more', state.showAllMoves ? 'Show fewer' : `Show all ${moves.length}`);
    more.type = 'button';
    more.addEventListener('click', () => {
      state.showAllMoves = !state.showAllMoves;
      actions.repaint();
    });
    movesHost.append(more);
  }
  root.append(sectionHead('Next steps'), movesHost);

  // The syllabus, outcome by outcome.
  const syllabus = syllabusRows(evidence, sources, listed.map((s) => s.id));
  const outcomeOrder = new Map(ctx.outcomes.map((o, i) => [`out:${o.id}`, i]));
  const sorted = [...syllabus].sort((a, b) =>
    state.syllabusSort === 'syllabus'
      ? (outcomeOrder.get(a.tag) ?? 999) - (outcomeOrder.get(b.tag) ?? 999) || label(a.tag).localeCompare(label(b.tag), undefined, { numeric: true })
      : state.syllabusSort === 'change'
        ? (a.change === null ? 1 : 0) - (b.change === null ? 1 : 0) || (a.change ?? 0) - (b.change ?? 0)
        : a.mean - b.mean
  );
  const sylHost = el('div', 'mb-next__syllabus');
  if (!sorted.length) sylHost.append(el('p', 'mb__empty', 'No syllabus links yet. Add dot points to a quiz’s lesson, or outcomes to a task’s criteria.'));
  else sylHost.append(legend());
  const rowFace = (row: SyllabusRow, small: boolean): HTMLElement => {
    const face = el('span', 'mb-syl__face');
    const name = el('span', 'mb-syl__name');
    name.append(el('span', 'mb-syl__code', label(row.tag)));
    const title = row.tag.startsWith('out:') ? ctx.outcomes.find((o) => `out:${o.id}` === row.tag)?.title : undefined;
    if (title) name.append(el('span', 'mb-syl__title', title));
    const nums = el('span', 'mb-syl__nums', pct(row.mean));
    if (row.change !== null) nums.append(el('span', `mb-syl__change${row.change < 0 ? ' is-down' : ''}`, signed(row.change)));
    face.append(name, spreadBar(row.spread, small), nums);
    return face;
  };
  for (const row of sorted) {
    if (!row.parts.length) {
      const flat = el('div', 'mb-syl mb-syl--flat');
      flat.append(rowFace(row, false));
      sylHost.append(flat);
      continue;
    }
    const details = el('details', 'mb-syl');
    details.dataset.tag = row.tag;
    details.open = state.openOutcomes.has(row.tag);
    details.addEventListener('toggle', () => {
      if (details.open) state.openOutcomes.add(row.tag);
      else state.openOutcomes.delete(row.tag);
    });
    const summary = el('summary', 'mb-syl__summary');
    summary.append(rowFace(row, false));
    const parts = el('div', 'mb-syl__parts');
    for (const part of [...row.parts].sort((a, b) => a.mean - b.mean)) {
      const line = el('div', 'mb-syl__part');
      line.append(rowFace(part, true));
      parts.append(line);
    }
    details.append(summary, parts);
    sylHost.append(details);
  }
  root.append(
    sectionHead('Syllabus', sorted.length > 1 ? pills<SyllabusSort>('Sort outcomes', [['weakest', 'Weakest'], ['syllabus', 'Syllabus order'], ['change', 'Biggest drop']], state.syllabusSort, (v) => { state.syllabusSort = v; actions.repaint(); }) : undefined),
    sylHost
  );

  // Students, most need first.
  const rows = kind ? sortStudents(studentRows(evidence, sources, listed.map((s) => s.id), kind, actions.pins), state.studentSort, (id) => nameOf.get(id) ?? '') : [];
  const list = el('ul', 'mb-next__students');
  const byId = new Map(students.map((s) => [s.id, s]));
  for (const row of rows) {
    const s = byId.get(row.student)!;
    const item = el('li', 'mb-who');
    const name = el('button', 'mb-who__name mb-patterns__name', `${s.initials} · ${s.name}`);
    name.type = 'button';
    name.dataset.student = s.id;
    name.addEventListener('click', () => actions.openStudent(s.id));
    const avg = el('span', 'mb-who__avg', pct(row.mean));
    if (row.change !== null && Math.abs(row.change) >= 0.05) {
      const arrow = el('span', `mb-who__trend ${row.change < 0 ? 'is-down' : 'is-up'}`, row.change < 0 ? '↓' : '↑');
      arrow.setAttribute('aria-label', `${signed(row.change)} since their first`);
      avg.append(arrow);
    }
    const chips = el('span', 'mb-who__chips');
    if (row.mean === null) chips.append(el('span', 'mb-who__chip', 'No marks yet'));
    for (const need of row.need) chips.append(el('span', `mb-who__chip ${need.mean !== null && need.mean < 0.5 ? 'is-low' : 'is-mid'}`, `${label(need.tag)} ${pct(need.mean)}`));
    if (row.mean !== null && !row.need.length && row.secure) chips.append(el('span', 'mb-who__chip is-high', `Secure on ${row.secure} of ${row.tags} · extend`));
    item.append(name, avg, chips);
    list.append(item);
  }
  root.append(
    sectionHead('Students', rows.length > 1 ? pills<StudentSort>('Sort students', [['need', 'Most need'], ['name', 'Name'], ['overall', 'Lowest average'], ['change', 'Biggest drop']], state.studentSort, (v) => { state.studentSort = v; actions.repaint(); }) : undefined),
    rows.length ? list : el('p', 'mb__empty', 'No tagged marks yet.')
  );
  return root;
}
