import type { Lesson } from '@/schemas/lesson';
import type { AssessmentColumn, AssessmentMark } from '@/markbook/schema';
import { httpMarkbookApi, type MarkbookApi } from '@/markbook/api';
import { button, el } from '@/quiz/dom';
import { LEVEL_LABELS, type Level } from './schema';
import { kitId } from './kit-editor';
import type { BoardSub, GroupBoard, SprintTeacherApi } from './api';

/**
 * Sprint marks live in two markbook assessment columns, so the evidence
 * layer, Patterns and Next steps use them like any assessment. Each sprint
 * criterion is a column criterion worth 3: Starting 1, Showing 2, Strong 3.
 */

export type MarkKind = 'prototype' | 'reflection';
const BANDS = [{ label: 'Starting', min: 1 }, { label: 'Showing', min: 2 }, { label: 'Strong', min: 3 }];

/** A criterion id the markbook accepts: kept if it already fits, else made to fit without clashing. */
export function markId(id: string): string {
  if (/^[a-z0-9]{8,24}$/.test(id)) return id;
  const clean = id.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `sc${clean.length}${clean}`.padEnd(8, '0').slice(0, 24);
}

export function sprintColumn(lesson: Lesson, kind: MarkKind, columnId: string): AssessmentColumn {
  const s = lesson.sprint!;
  const list = kind === 'prototype' ? s.criteria : s.reflection_criteria;
  const date = s.phases[4]!.due_date || new Date().toISOString().slice(0, 10);
  return {
    id: columnId,
    kind: 'assessment',
    title: `${lesson.title}: ${kind === 'prototype' ? 'Prototype' : 'Reflection'}`.slice(0, 120),
    date,
    weight: 0,
    criteria: list.map((c) => ({ id: markId(c.id), label: c.text, max: 3, outcomes: c.outcome ? [c.outcome] : [], concepts: [], bands: BANDS }))
  };
}

/**
 * Makes the reflection column if it is missing; returns the ids and the lesson
 * that records them. The prototype isn't marked (the class judges it in Test),
 * so its column is only kept when an earlier sprint already made one.
 */
export async function ensureColumns(lesson: Lesson, markbook: Pick<MarkbookApi, 'saveColumn'>): Promise<{ ids: { prototype: string; reflection: string }; lesson: Lesson }> {
  const s = lesson.sprint!;
  const ids = { prototype: s.columns.prototype ?? '', reflection: s.columns.reflection ?? '' };
  if (!ids.reflection) {
    ids.reflection = kitId();
    await markbook.saveColumn(s.class_id, sprintColumn(lesson, 'reflection', ids.reflection));
  }
  const columns = ids.prototype ? ids : { reflection: ids.reflection };
  return { ids, lesson: { ...lesson, sprint: { ...s, columns } } };
}

/** The marking panel: each student's work, their self-check, a level per criterion and a comment. */
export function mountMarking(host: HTMLElement, o: { kind: MarkKind; board: GroupBoard; api: SprintTeacherApi; getLesson: () => Lesson; emitLesson: (next: Lesson) => void; markbook?: MarkbookApi }): void {
  const markbook = o.markbook ?? httpMarkbookApi;
  const subs: BoardSub[] = (o.kind === 'prototype' ? o.board.subs.prototype : o.board.subs.test).filter((x) => x.sub?.submitted_at);
  const root = el('div', 'smark');
  host.replaceChildren(root);
  if (!subs.length) { root.append(el('p', 'sprint-note', 'Nothing is in to mark yet.')); return; }
  let at = 0;
  let ids: { prototype: string; reflection: string } | null = null;
  let marks: Record<string, Record<string, unknown>> = {};

  const start = async () => {
    try {
      const made = await ensureColumns(o.getLesson(), markbook);
      const had = o.getLesson().sprint!.columns;
      if (had.prototype !== made.ids.prototype || had.reflection !== made.ids.reflection) o.emitLesson(made.lesson);
      ids = made.ids;
      marks = (await markbook.load(o.getLesson().sprint!.class_id)).markbook.marks;
      paint();
    } catch (e) {
      root.replaceChildren(el('p', 'sprint-submit__err', e instanceof Error ? e.message : 'The markbook didn’t load.'));
    }
  };

  function paint(): void {
    const lesson = o.getLesson();
    const s = lesson.sprint!;
    const list = o.kind === 'prototype' ? s.criteria : s.reflection_criteria;
    const columnId = ids![o.kind];
    const row = subs[at]!;
    const p = row.sub!.payload as Record<string, unknown>;
    const old = (marks[columnId]?.[row.student_id] as AssessmentMark | undefined) ?? { criteria: {} };
    const levels: Record<string, number> = { ...old.criteria };
    let comment = old.feedback ?? '';
    root.replaceChildren(el('h3', '', `${o.kind === 'prototype' ? 'Prototype part' : 'Reflection'}: ${row.name} (${at + 1} of ${subs.length})`));
    const work = el('div', 'smark__work');
    if (o.kind === 'prototype') {
      if (p.text) work.append(el('p', '', String(p.text)));
      if (p.link) work.append(button(`Open link: ${String(p.link)}`, 'ghost', () => window.open(String(p.link), '_blank', 'noopener')));
      for (const id of (p.files as string[] | undefined) ?? []) work.append(button('Open their file', 'ghost', async () => window.open(await o.api.fileUrl(id), '_blank', 'noopener')));
      // A student with two or more parts built each one separately.
      Object.values((p.builds as Record<string, { text: string; link: string; files: string[] }> | undefined) ?? {}).forEach((b, i, all) => {
        work.append(el('h4', '', `Part ${i + 1} of ${all.length}`));
        if (b.text) work.append(el('p', '', b.text));
        if (b.link) work.append(button(`Open link: ${b.link}`, 'ghost', () => window.open(b.link, '_blank', 'noopener')));
        for (const id of b.files) work.append(button('Open their file', 'ghost', async () => window.open(await o.api.fileUrl(id), '_blank', 'noopener')));
      });
    } else {
      for (const r of (p.reflection as string[] | undefined) ?? []) work.append(el('p', '', r));
      if (p.quote) work.append(el('p', 'sprint-note', `Quoted: ${String(p.quote)}`));
    }
    root.append(work);
    const self = (p.self as Record<string, Level> | undefined) ?? {};
    for (const c of list) {
      const box = el('div', 'smark__crit');
      box.append(el('p', 'sprint-field__label', c.text));
      if (self[c.id]) box.append(el('p', 'sprint-note', `They judged: ${LEVEL_LABELS[self[c.id]! - 1]} · ${String((p.self_why as Record<string, string> | undefined)?.[c.id] ?? '')}`));
      const gap = el('p', 'sprint-note');
      const lv = el('div', 'sprint-levels');
      LEVEL_LABELS.forEach((name, i) => {
        const b = el('button', 'btn btn--secondary sprint-level', name);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(levels[markId(c.id)] === i + 1));
        b.addEventListener('click', () => {
          levels[markId(c.id)] = i + 1;
          lv.querySelectorAll('.sprint-level').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          const theirs = self[c.id];
          gap.textContent = theirs && Math.abs(theirs - (i + 1)) >= 2 ? `Talk this one through: they judged ${LEVEL_LABELS[theirs - 1]}, you marked ${name}.` : '';
        });
        lv.append(b);
      });
      box.append(lv, gap);
      root.append(box);
    }
    const note = el('textarea', 'qz-input');
    note.rows = 3;
    note.maxLength = 2000;
    note.value = comment;
    note.setAttribute('aria-label', 'Comment');
    note.addEventListener('input', () => { comment = note.value; });
    const err = el('p', 'sprint-submit__err');
    const save = async (next: boolean) => {
      try {
        const book = await markbook.setMark(s.class_id, columnId, row.student_id, { criteria: levels, ...(comment.trim() ? { feedback: comment.trim() } : {}) });
        marks = book.marks;
        if (next && at < subs.length - 1) { at += 1; paint(); } else err.textContent = 'Saved.';
      } catch (e) {
        err.textContent = e instanceof Error ? e.message : 'That didn’t save.';
      }
    };
    root.append(note, button('Save', 'secondary', () => void save(false)), button('Save and next student', 'primary', () => void save(true)), err);
  }

  root.append(el('p', 'sprint-note', 'Opening the markbook…'));
  void start();
}
