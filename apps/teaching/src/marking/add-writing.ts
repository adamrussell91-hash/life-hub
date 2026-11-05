/**
 * "Add writing": the teacher pastes writing a student handed over outside the
 * app onto that student, names the unit it counts towards and what it is
 * evidence for, then marks it like handed-in writing. No Markbook column.
 * Server: netlify/functions/_shared/added-writing.mjs.
 */
import { apiGet, apiPost } from '@/api/client';
import { getCurriculum } from '@/app/curriculum-state';
import { mountTagRow, type TagRowValue } from '@/deep/tag-row';
import type { DeepUnderstanding } from '@/deep/schema';
import { el, errorText } from '@/quiz/dom';
import '@/deep/block-menu.css';
import './add-writing.css';

export const MAX_ADDED_TEXT = 20000;

export type AddedContext = {
  class: { id: string; title: string };
  students: { id: string; initials: string; name: string }[];
  units: { id: string; title: string }[];
  current_unit_id: string | null;
};
export type AddedRef = { classId: string; studentId: string; piece: string; title: string };
export type AddedSettings = { deep_step?: TagRowValue['steps']; deep_targets?: string[]; deep_skills?: string[] };

export const writingApi = (classId: string) => <T>(body: Record<string, unknown>): Promise<T> =>
  apiPost<T>(`/api/classes/${encodeURIComponent(classId)}/writing`, body);

/** The tags as the server stores them: the keys a block's settings use. */
export function settingsFrom(tags: TagRowValue): AddedSettings {
  return {
    ...(tags.steps.length ? { deep_step: tags.steps } : {}),
    ...(tags.pieces.length ? { deep_targets: tags.pieces } : {}),
    ...(tags.skills.length ? { deep_skills: tags.skills } : {})
  };
}

type Fixed = { classId?: string; studentId?: string };
type Deps = {
  classes?: () => Promise<{ id: string; title: string }[]>;
  context?: (classId: string) => Promise<AddedContext>;
  unit?: (id: string) => Promise<{ deep_understandings?: DeepUnderstanding[] }>;
  add?: (classId: string, body: Record<string, unknown>) => Promise<{ piece: string }>;
};

/** A unit from what the app already holds; the API only for one it hasn't loaded. */
export const unitFromApp = async (id: string): Promise<{ deep_understandings?: DeepUnderstanding[] }> =>
  (await getCurriculum().catch(() => null))?.units.find((u) => u.id === id) ?? apiGet(`/api/units/${encodeURIComponent(id)}`);

const realDeps: Required<Deps> = {
  classes: async () => (await getCurriculum()).classes
    .filter((c) => !c.status || c.status === 'active')
    .map((c) => ({ id: c.id, title: c.display_name || c.title || c.code }))
    .sort((a, b) => a.title.localeCompare(b.title)),
  context: (classId) => writingApi(classId)<AddedContext>({ action: 'context' }),
  unit: unitFromApp,
  add: (classId, body) => writingApi(classId)<{ piece: string }>({ action: 'add', ...body })
};

function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const box = el('label', 'aw-field');
  box.append(el('span', 'aw-field__label', label), control);
  if (hint) box.append(el('span', 'aw-field__hint', hint));
  return box;
}

function select(options: { id: string; title: string }[], value: string | null): HTMLSelectElement {
  const s = el('select', 'aw-input');
  for (const o of options) s.append(Object.assign(el('option', undefined, o.title), { value: o.id, selected: o.id === value }));
  return s;
}

/** Opens the dialog. Resolves with the new piece, or null when cancelled. */
export function openAddWriting(fixed: Fixed = {}, deps: Deps = {}): Promise<AddedRef | null> {
  const use = { ...realDeps, ...deps };
  return new Promise((resolve) => {
    const dialog = el('dialog', 'du-sheet aw-sheet');
    dialog.setAttribute('aria-label', 'Add writing');
    const form = el('form', 'du-sheet__form');
    form.method = 'dialog';
    form.append(el('h2', 'aw-title', 'Add writing'), el('p', 'aw-sub', 'Writing a student gave you outside the app. It goes on their record, not the Markbook.'));

    const classBox = el('div', 'aw-slot');
    const studentBox = el('div', 'aw-slot');
    const title = Object.assign(el('input', 'aw-input'), { type: 'text', maxLength: 120, placeholder: 'e.g. Speech draft 2' });
    const unitBox = el('div', 'aw-slot');
    const tagsBox = el('div', 'aw-slot');
    const text = Object.assign(el('textarea', 'aw-input aw-text'), { rows: 10, placeholder: 'Paste their writing here' });
    const count = el('span', 'aw-field__hint');
    const paintCount = (): void => {
      const n = text.value.length;
      count.textContent = n > MAX_ADDED_TEXT ? `${n.toLocaleString('en-AU')} characters. The most is ${MAX_ADDED_TEXT.toLocaleString('en-AU')}.` : `${n.toLocaleString('en-AU')} characters`;
      count.classList.toggle('is-over', n > MAX_ADDED_TEXT);
    };
    text.addEventListener('input', paintCount);
    paintCount();
    const textField = field('Their writing', text);
    textField.append(count);

    const error = el('p', 'aw-error');
    error.setAttribute('role', 'alert');
    const actions = el('div', 'du-sheet__actions');
    const cancel = Object.assign(el('button', 'btn', 'Cancel'), { type: 'button' });
    const save = Object.assign(el('button', 'btn btn--primary', 'Add and mark'), { type: 'button' });
    actions.append(cancel, save);
    form.append(classBox, studentBox, field('Title', title), unitBox, tagsBox, textField, error, actions);
    dialog.append(form);

    let classId = fixed.classId ?? '';
    let studentSelect: HTMLSelectElement | null = null;
    let unitSelect: HTMLSelectElement | null = null;
    let tags: TagRowValue = { steps: [], skills: [], pieces: [] };
    let loadToken = 0;

    const paintTags = async (unitId: string): Promise<void> => {
      const token = ++loadToken;
      tags = { steps: [], skills: [], pieces: [] };
      tagsBox.replaceChildren(el('p', 'aw-field__hint', 'Loading the unit…'));
      const unit = unitId ? await use.unit(unitId).catch(() => null) : null;
      if (token !== loadToken) return;
      const deep = unit?.deep_understandings ?? [];
      if (!deep.length) {
        tagsBox.replaceChildren(el('p', 'aw-field__hint', 'This unit has no deep understandings yet, so this piece takes codes and a comment only.'));
        return;
      }
      const row = mountTagRow({ value: tags, deep, parts: { steps: true, skills: true, pieces: 'several' }, rubric: true, heading: 'What it’s evidence for', onChange: (next) => { tags = next; } });
      tagsBox.replaceChildren(row.root);
    };

    const paintContext = async (): Promise<void> => {
      studentBox.replaceChildren();
      unitBox.replaceChildren();
      tagsBox.replaceChildren();
      studentSelect = null;
      unitSelect = null;
      if (!classId) return;
      studentBox.append(el('p', 'aw-field__hint', 'Loading the class…'));
      try {
        const ctx = await use.context(classId);
        if (ctx.class.id !== classId) return;
        if (fixed.studentId) {
          const who = ctx.students.find((s) => s.id === fixed.studentId);
          studentBox.replaceChildren(el('p', 'aw-who', who ? `For ${who.name} · ${ctx.class.title}` : 'That student isn’t on this class list.'));
        } else {
          studentSelect = select(ctx.students.map((s) => ({ id: s.id, title: `${s.name} (${s.initials})` })), null);
          studentSelect.prepend(Object.assign(el('option', undefined, 'Choose a student'), { value: '', selected: true }));
          studentBox.replaceChildren(field('Student', studentSelect));
        }
        if (!ctx.units.length) {
          unitBox.replaceChildren(el('p', 'aw-error', 'This class has no units yet. Add a unit to the class first.'));
          return;
        }
        unitSelect = select(ctx.units, ctx.current_unit_id);
        unitSelect.addEventListener('change', () => void paintTags(unitSelect!.value));
        unitBox.replaceChildren(field('Counts towards', unitSelect, 'Its rubric feeds this unit’s progress.'));
        await paintTags(unitSelect.value);
      } catch (e) {
        studentBox.replaceChildren(el('p', 'aw-error', errorText(e, 'Couldn’t load that class. Try again.')));
      }
    };

    if (fixed.classId) void paintContext();
    else {
      classBox.append(el('p', 'aw-field__hint', 'Loading your classes…'));
      void use.classes().then(
        (classes) => {
          const s = select(classes, null);
          s.prepend(Object.assign(el('option', undefined, 'Choose a class'), { value: '', selected: true }));
          s.addEventListener('change', () => { classId = s.value; void paintContext(); });
          classBox.replaceChildren(field('Class', s));
        },
        (e: unknown) => classBox.replaceChildren(el('p', 'aw-error', errorText(e, 'Couldn’t load your classes.')))
      );
    }

    let result: AddedRef | null = null;
    save.addEventListener('click', async () => {
      const studentId = fixed.studentId ?? studentSelect?.value ?? '';
      const wanted = title.value.trim();
      const problem = !classId ? 'Choose a class.' : !studentId ? 'Choose a student.' : !wanted ? 'Give the piece a title.' : !unitSelect?.value ? 'Pick the unit this counts towards.' : !text.value.trim() ? 'Paste the writing first.' : text.value.length > MAX_ADDED_TEXT ? 'That’s too long to add.' : '';
      if (problem) { error.textContent = problem; return; }
      error.textContent = '';
      save.disabled = true;
      try {
        const { piece } = await use.add(classId, { student_id: studentId, title: wanted, unit_id: unitSelect!.value, settings: settingsFrom(tags), text: text.value });
        result = { classId, studentId, piece, title: wanted };
        dialog.close();
      } catch (e) {
        error.textContent = errorText(e, 'That didn’t save. Try again.');
      } finally {
        save.disabled = false;
      }
    });
    cancel.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    });
    document.body.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  });
}
