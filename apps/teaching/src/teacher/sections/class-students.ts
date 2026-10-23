/**
 * Students on a class page: the class list the classroom name picker and
 * groups read from. Type or paste it once (one per line, or a spreadsheet
 * column). "Skip in picker" lives here and only here, so it is never set,
 * shown or hinted at on a lesson page or the board.
 *
 * Each student has initials for quizzes. A student claims theirs once on their own device. The badge shows who has, and Release lets a student claim again on a new device.
 *
 * The list stays on the class record, which is teacher-only. Published class
 * pages build their own allowlisted copy and never include it.
 */
import type { Class, ClassStudent } from '@/schemas';
import { MAX_CLASS_STUDENTS } from '@/schemas';
import { parseStudentList } from '@/blocks/classroom-tools/logic';
import { apiPost } from '@/api/client';
import { assignInitials, initialsProblems, normaliseInitials } from '@/schemas/student-initials';
import { patchClass } from '@/teacher/schedule-api';
import { peekCurriculum, replaceCurriculum } from '@/app/curriculum-state';
import { createClassFold } from '@/teacher/class-fold';
import '@/blocks/classroom-tools/classroom-tools.css';

type Options = {
  /** Test seam. Defaults to POST /api/classes/:id/claims. */
  claims?: {
    list: (classId: string) => Promise<Record<string, string>>;
    release: (classId: string, studentId: string) => Promise<Record<string, string>>;
  };
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
  const claimsApi = options.claims ?? {
    list: async (classId: string) => (await apiPost<{ claims: Record<string, string> }>(`/api/classes/${encodeURIComponent(classId)}/claims`, { action: 'list' })).claims,
    release: async (classId: string, studentId: string) =>
      (await apiPost<{ claims: Record<string, string> }>(`/api/classes/${encodeURIComponent(classId)}/claims`, { action: 'release', student_id: studentId })).claims
  };
  let students: ClassStudent[] = assignInitials((cls.students ?? []).map((s) => ({ ...s, skip_picker: Boolean(s.skip_picker) })));
  let claims: Record<string, string> | null = null;

  // Folds shut so the page leads with the calendar; open at first when there is no list yet.
  const { details: section, summary: head } = createClassFold(cls.id, 'students', {
    className: 'class-students',
    openByDefault: !students.length
  });
  section.setAttribute('aria-labelledby', `class-students-${cls.id}`);
  head.classList.add('class-students__head');
  const title = el('h2', 'class-students__title', 'Students');
  title.id = `class-students-${cls.id}`;
  const count = el('span', 'class-students__count');
  const edit = el('button', 'btn btn--secondary class-students__edit', 'Edit list');
  edit.type = 'button';
  head.append(title, count, edit);

  const intro = el(
    'p',
    'class-students__hint',
    'The classroom name picker, groups and quiz initials use this list. Use the name each student goes by. Only you see this page.'
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

  const skipHead = el('p', 'class-students__subhead', 'Initials and picker');
  const skipHint = el(
    'p',
    'class-students__hint',
    'A ticked student is quietly left out of the name picker. Groups still include them. Nothing on a lesson or the board shows that anyone is skipped. Students type their initials to take a quiz from the class page.'
  );
  const list = el('ul', 'class-students__list');
  const empty = el('p', 'class-students__empty', 'No students yet. Choose Edit list and type or paste the class list.');
  const status = el('p', 'class-students__status');
  status.setAttribute('role', 'status');

  section.append(intro, editor, skipHead, skipHint, list, empty, status);
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
        const initials = el('input', 'class-students__initials');
        initials.value = student.initials ?? '';
        initials.maxLength = 5;
        initials.autocomplete = 'off';
        initials.setAttribute('aria-label', `Quiz initials for ${student.name}`);
        initials.addEventListener('change', () => {
          const value = normaliseInitials(initials.value);
          const next = students.map((s, j) => (j === i ? { ...s, initials: value } : s));
          const problem = initialsProblems(next).get(i);
          if (problem) {
            initials.value = student.initials ?? '';
            say(problem, 'error');
            return;
          }
          if (value === student.initials) {
            initials.value = value;
            return;
          }
          void persist(next, `${student.name} is now ${value}.`);
        });
        const claimedAt = student.id ? claims?.[student.id] : undefined;
        const claim = el('span', `class-students__claim${claimedAt ? ' is-claimed' : ''}`, claims === null ? '' : claimedAt ? 'Claimed' : 'Not claimed');
        item.append(name, initials, claim);
        if (claimedAt && student.id) {
          const release = el('button', 'btn btn--ghost class-students__release', 'Release');
          release.type = 'button';
          release.setAttribute('aria-label', `Release ${student.initials} so ${student.name} can claim it again`);
          const studentId = student.id;
          release.addEventListener('click', async () => {
            release.disabled = true;
            try {
              claims = await claimsApi.release(cls.id, studentId);
              say(`${student.initials} can be claimed again.`);
            } catch {
              say('Not released. Check your connection and try again.', 'error');
            }
            paint();
          });
          item.append(release);
        }
        item.append(label);
        return item;
      })
    );
  }

  edit.addEventListener('click', (event) => {
    // The button sits in the fold's summary: open the fold rather than toggle it.
    event.preventDefault();
    section.open = true;
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
    const next = assignInitials(parseStudentList(area.value, students, MAX_CLASS_STUDENTS));
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

  void claimsApi
    .list(cls.id)
    .then((found) => {
      claims = found;
      paint();
    })
    .catch(() => {
      // No claims to show (offline, or the class isn't saved yet). The list still works.
    });

  paint();
}
