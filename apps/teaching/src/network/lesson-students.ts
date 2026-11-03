import { sortStudents } from '@/markbook/calc';
import type { LessonStudents } from '@/markbook/api';
import { el, ghostButton } from './lines-editor';

export type LessonStudentsApi = {
  lessonStudents: (classId: string, lessonId: string) => Promise<LessonStudents>;
  setLessonStudents: (classId: string, lessonId: string, studentIds: string[]) => Promise<unknown>;
};

/**
 * "Students" on a side lesson: tick who sees it on their My progress map, class by class. Loads the
 * first time a side lesson shows it; each change saves at once, in order. Teacher views are unaffected.
 */
export function mountLessonStudents(
  lessonId: string,
  classes: ReadonlyArray<{ id: string; name: string }>,
  api: LessonStudentsApi
): { open(): HTMLElement } {
  const row = el('div', 'lesson-flow__row lesson-flow__row--top');
  row.append(el('span', 'lesson-flow__label', 'Students'));
  const body = el('div', 'lesson-flow__students');
  row.append(body);
  let loaded = false;

  function mountClass(host: HTMLElement, cls: { id: string; name: string }, data: LessonStudents): void {
    const students = sortStudents(data.students);
    const started = new Set(data.started);
    let ticked = new Set(data.ticked);
    let queue: Promise<unknown> = Promise.resolve();
    const note = el('p', 'lesson-flow__hint');
    note.setAttribute('role', 'status');

    const save = (next: Set<string>) => {
      const before = ticked;
      ticked = next;
      paint();
      queue = queue.then(() => api.setLessonStudents(cls.id, lessonId, [...next])).catch(() => {
        ticked = before;
        paint();
        note.textContent = 'Couldn’t save that. Try again.';
      });
    };

    function paint(): void {
      const count = students.filter((s) => ticked.has(s.id) || started.has(s.id)).length;
      note.textContent = count ? `${count} of ${students.length} see this on their map` : 'Nobody sees this on their map yet';
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
      tools.append(note, ghostButton('Everyone', () => save(new Set(students.map((s) => s.id)))), ghostButton('Clear', () => save(new Set())));
      host.replaceChildren(...(classes.length > 1 ? [el('p', 'lesson-flow__students-class', cls.name)] : []), tools, pills);
    }
    paint();
  }

  function load(): void {
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
          if (data.students.length) mountClass(host, cls, data);
          else host.replaceChildren(el('span', 'lesson-flow__hint', `${cls.name} has no class list yet`));
        },
        () => host.replaceChildren(el('span', 'lesson-flow__hint', `Couldn’t load ${cls.name}. Reload to try again.`))
      );
    }
  }

  return {
    open() {
      if (!loaded) {
        loaded = true;
        load();
      }
      return row;
    }
  };
}
