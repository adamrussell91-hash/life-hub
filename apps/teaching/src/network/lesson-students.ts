import { sortStudents } from '@/markbook/calc';
import type { LessonStudents } from '@/markbook/api';
import { el, ghostButton } from './lines-editor';

export type LessonStudentsApi = {
  lessonStudents: (classId: string, lessonId: string) => Promise<LessonStudents>;
  setLessonStudents: (classId: string, lessonId: string, studentIds: string[]) => Promise<unknown>;
  /** A core lesson: the students doing it. Everyone else on the class list is left out. */
  setCoreStudents: (classId: string, lessonId: string, studentIds: string[]) => Promise<unknown>;
};

/** Side: nobody until ticked. Core: everyone until unticked. */
export type StudentsMode = 'side' | 'core';

/**
 * "Students" on a lesson: who sees it on their My progress map, class by class. A side lesson starts
 * with nobody ticked; a core lesson starts with everyone ticked, and unticking leaves a student out.
 * Loads the first time it shows, and again if the lesson switches between core and side; each change
 * saves at once, in order. Teacher views are unaffected.
 */
export function mountLessonStudents(
  lessonId: string,
  classes: ReadonlyArray<{ id: string; name: string }>,
  api: LessonStudentsApi
): { open(mode?: StudentsMode): HTMLElement } {
  const row = el('div', 'lesson-flow__row lesson-flow__row--top');
  row.append(el('span', 'lesson-flow__label', 'Students'));
  const body = el('div', 'lesson-flow__students');
  row.append(body);
  let loaded: StudentsMode | null = null;

  function mountClass(host: HTMLElement, cls: { id: string; name: string }, data: LessonStudents, mode: StudentsMode): void {
    const students = sortStudents(data.students);
    const started = new Set(data.started);
    const left = new Set(data.excused ?? []);
    let ticked = new Set(mode === 'core' ? students.map((s) => s.id).filter((id) => !left.has(id)) : data.ticked);
    let queue: Promise<unknown> = Promise.resolve();
    const note = el('p', 'lesson-flow__hint');
    note.setAttribute('role', 'status');

    const save = (next: Set<string>) => {
      const before = ticked;
      ticked = next;
      paint();
      queue = queue.then(() => (mode === 'core' ? api.setCoreStudents : api.setLessonStudents)(cls.id, lessonId, [...next])).catch(() => {
        ticked = before;
        paint();
        note.textContent = 'Couldn’t save that. Try again.';
      });
    };

    function paint(): void {
      const count = students.filter((s) => ticked.has(s.id) || started.has(s.id)).length;
      note.textContent =
        mode === 'core'
          ? count === students.length
            ? 'Everyone does this lesson'
            : `${count} of ${students.length} do this lesson. Unticked students don’t see it on their map`
          : count
            ? `${count} of ${students.length} see this on their map`
            : 'Nobody sees this on their map yet';
      const pills = el('div', 'lesson-flow__pills');
      for (const s of students) {
        const on = ticked.has(s.id);
        const kept = !on && started.has(s.id);
        const b = el('button', `lesson-flow__pill${on ? ' lesson-flow__pill--on' : ''}${kept ? ' lesson-flow__pill--kept' : ''}`, kept ? `${s.name} · started` : s.name);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(on));
        if (kept) b.title = 'Already started this lesson, so it stays on their map';
        b.addEventListener('click', () => {
          const next = new Set(ticked);
          if (on) next.delete(s.id);
          else next.add(s.id);
          save(next);
        });
        pills.append(b);
      }
      const tools = el('div', 'lesson-flow__chips lesson-flow__students-tools');
      const everyone = ghostButton('Everyone', () => save(new Set(students.map((s) => s.id))));
      // A core lesson nobody does isn't core: only the side list offers Clear.
      tools.append(note, everyone, ...(mode === 'side' ? [ghostButton('Clear', () => save(new Set()))] : []));
      host.replaceChildren(...(classes.length > 1 ? [el('p', 'lesson-flow__students-class', cls.name)] : []), tools, pills);
    }
    paint();
  }

  function load(mode: StudentsMode): void {
    body.replaceChildren();
    if (!classes.length) {
      body.append(el('span', 'lesson-flow__hint', 'Add the unit to a class to pick its students'));
      return;
    }
    for (const cls of classes) {
      const host = el('div', 'lesson-flow__students-group');
      host.append(el('span', 'lesson-flow__hint', 'Loading students…'));
      body.append(host);
      api.lessonStudents(cls.id, lessonId).then(
        (data) => {
          if (loaded !== mode) return;
          if (data.students.length) mountClass(host, cls, data, mode);
          else host.replaceChildren(el('span', 'lesson-flow__hint', `${cls.name} has no class list yet`));
        },
        () => host.replaceChildren(el('span', 'lesson-flow__hint', `Couldn’t load ${cls.name}. Reload to try again.`))
      );
    }
  }

  return {
    open(mode: StudentsMode = 'side') {
      if (loaded !== mode) {
        loaded = mode;
        load(mode);
      }
      return row;
    }
  };
}
