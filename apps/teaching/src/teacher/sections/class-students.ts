/**
 * Students on a class page: the class list the classroom name picker and
 * groups read from. Type or paste it once (one per line, or a spreadsheet
 * column). "Skip in picker" lives here and only here, so it is never set,
 * shown or hinted at on a lesson page or the board.
 *
 * The list stays on the class record, which is teacher-only. Published class
 * pages build their own allowlisted copy and never include it.
 */
import type { Class, ClassStudent } from '@/schemas';
import { MAX_CLASS_STUDENTS } from '@/schemas';
import { parseStudentList } from '@/blocks/classroom-tools/logic';
import { patchClass } from '@/teacher/schedule-api';
import { peekCurriculum, replaceCurriculum } from '@/app/curriculum-state';
import '@/blocks/classroom-tools/classroom-tools.css';

type Options = {
  /** Test seam. Defaults to PATCH /api/classes/:id. */
  save?: (classId: string, students: ClassStudent[]) => Promise<Class | void>;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Keep the session's curriculum snapshot in step, so an open name picker sees the new list. */
function rememberStudents(classId: string, students: ClassStudent[]): void {
  const curriculum = peekCurriculum();
  if (!curriculum) return;
  replaceCurriculum({
    ...curriculum,
    classes: curriculum.classes.map((cls) => (cls.id === classId ? { ...cls, students } : cls))
  });
}

export function mountClassStudents(host: HTMLElement, cls: Class, options: Options = {}): void {
  const save =
    options.save ??
    (async (classId: string, students: ClassStudent[]) => {
      const updated = await patchClass(classId, { students });
      rememberStudents(classId, students);
      return updated;
    });
  let students: ClassStudent[] = (cls.students ?? []).map((s) => ({ name: s.name, skip_picker: Boolean(s.skip_picker) }));

  const section = el('section', 'class-students');
  section.setAttribute('aria-labelledby', `class-students-${cls.id}`);
  const head = el('div', 'class-students__head');
  const title = el('h2', 'class-students__title', 'Students');
  title.id = `class-students-${cls.id}`;
  const count = el('span', 'class-students__count');
  const edit = el('button', 'btn btn--secondary class-students__edit', 'Edit list');
  edit.type = 'button';
  head.append(title, count, edit);

  const intro = el(
    'p',
    'class-students__hint',
    'The classroom name picker and groups use this list. Use the name each student goes by. Only you see this page.'
  );

  const editor = el('div', 'class-students__editor');
  editor.hidden = true;
  const area = el('textarea', 'class-students__input');
  area.id = `class-students-input-${cls.id}`;
  area.rows = 8;
  area.placeholder = 'One name per line, or paste a column from a spreadsheet';
  area.setAttribute('aria-label', 'Students in this class, one per line');
  const editActions = el('div', 'class-students__actions');
  const saveBtn = el('button', 'btn btn--primary', 'Save list');
  saveBtn.type = 'button';
  const cancel = el('button', 'btn btn--ghost', 'Cancel');
  cancel.type = 'button';
  editActions.append(saveBtn, cancel);
  editor.append(area, editActions);

  const skipHead = el('p', 'class-students__subhead', 'Skip in picker');
  const skipHint = el(
    'p',
    'class-students__hint',
    'A ticked student is quietly left out of the name picker. Groups still include them. Nothing on a lesson or the board shows that anyone is skipped.'
  );
  const list = el('ul', 'class-students__list');
  const empty = el('p', 'class-students__empty', 'No students yet. Choose Edit list and type or paste the class list.');
  const status = el('p', 'class-students__status');
  status.setAttribute('role', 'status');

  section.append(head, intro, editor, skipHead, skipHint, list, empty, status);
  host.append(section);

  const say = (text: string, kind: 'ok' | 'error' = 'ok') => {
    status.textContent = text;
    status.dataset.kind = kind;
  };

  async function persist(next: ClassStudent[], done: string): Promise<boolean> {
    const previous = students;
    students = next;
    paint();
    say('Saving…');
    try {
      await save(cls.id, next);
      cls.students = next;
      say(done);
      return true;
    } catch (error) {
      students = previous;
      paint();
      say(error instanceof Error && error.message ? `Not saved: ${error.message}` : 'Not saved. Check your connection and try again.', 'error');
      return false;
    }
  }

  function paint(): void {
    count.textContent = students.length ? `${students.length}` : '';
    const showList = students.length > 0 && editor.hidden;
    list.hidden = !showList;
    skipHead.hidden = !showList;
    skipHint.hidden = !showList;
    empty.hidden = students.length > 0 || !editor.hidden;
    list.replaceChildren(
      ...students.map((student, i) => {
        const item = el('li', 'class-students__row');
        if (student.skip_picker) item.classList.add('is-skipped');
        const name = el('span', 'class-students__name', student.name);
        const label = el('label', 'class-students__skip');
        const box = el('input');
        box.type = 'checkbox';
        box.id = `class-students-skip-${cls.id}-${i}`;
        box.checked = student.skip_picker;
        box.setAttribute('aria-label', `Skip ${student.name} in the name picker`);
        box.addEventListener('change', () => {
          const next = students.map((s, j) => (j === i ? { ...s, skip_picker: box.checked } : s));
          void persist(next, box.checked ? `${student.name} is skipped in the picker.` : `${student.name} is back in the picker.`);
        });
        label.append(box, el('span', '', 'Skip'));
        item.append(name, label);
        return item;
      })
    );
  }

  edit.addEventListener('click', () => {
    area.value = students.map((s) => s.name).join('\n');
    editor.hidden = false;
    edit.hidden = true;
    say('');
    paint();
    area.focus();
  });
  cancel.addEventListener('click', () => {
    editor.hidden = true;
    edit.hidden = false;
    say('');
    paint();
  });
  saveBtn.addEventListener('click', async () => {
    const next = parseStudentList(area.value, students, MAX_CLASS_STUDENTS);
    const lines = area.value.split(/[\n\r\t]+/).filter((line) => line.trim()).length;
    saveBtn.disabled = true;
    const ok = await persist(next, `Saved ${next.length} ${next.length === 1 ? 'student' : 'students'}.`);
    saveBtn.disabled = false;
    if (ok) {
      editor.hidden = true;
      edit.hidden = false;
      if (lines > MAX_CLASS_STUDENTS) say(`Saved the first ${MAX_CLASS_STUDENTS} names. A class list holds up to ${MAX_CLASS_STUDENTS}.`);
      paint();
    }
  });

  paint();
}
