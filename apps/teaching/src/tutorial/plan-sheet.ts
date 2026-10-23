// apps/teaching/src/tutorial/plan-sheet.ts
import { apiPost } from '@/api/client';
import { openOverlay } from '@/markbook/overlay';
import { button, el } from '@/quiz/dom';
import type { Evidence, Why } from '@/evidence/types';
import { anonymise, groupingBrief, parseGroups } from './grouping';
import { startTutorial, type StartTutorialInput } from './draft';
import type { TutorialGroup } from './schema';
import './tutorial.css';

export type PlanDeps = { group: (brief: string) => Promise<string>; start: (input: StartTutorialInput) => Promise<string> };
export const httpPlanDeps: PlanDeps = {
  group: (brief) => apiPost<{ text: string }>('/api/tutorial-groups', { brief }).then((r) => r.text),
  start: (input) => startTutorial(input)
};

export type TutorialPlanOptions = {
  classId: string;
  unitId: string;
  sourceLessonId: string;
  tag: string;
  tagLabel: string;
  students: Array<{ id: string; name: string; initials: string }>;
  chosen: string[];
  evidence: Evidence[];
  mistakeText: (why: Why) => string;
  onDone: (lessonId: string) => void;
  deps?: PlanDeps;
};

export const TUTORIAL_PLAN_COST = 'Cost: about 5 cents — one short call. Ann groups them and notes what each group needs; you build the tutorial.';

/**
 * Plan a tutorial: see what Ann is told (no names), let Ann group the students
 * by why and note what each group needs, adjust the groups, then create the
 * tutorial lesson. Ann writes no tutorial content; the teacher builds it.
 */
export function openTutorialPlan(o: TutorialPlanOptions): HTMLElement {
  const deps = o.deps ?? httpPlanDeps;
  const sheet = el('div', 'mb-sheet tut-plan');
  const heading = el('h3', 'mb-form__title', `Tutorial: ${o.tagLabel}`);
  heading.id = `tut-plan-${Math.random().toString(36).slice(2, 8)}`;
  const listed = new Set(o.students.map((s) => s.id));
  const picked = o.chosen.filter((id) => listed.has(id));
  const anon = anonymise(picked, o.evidence, o.tag);
  const brief = groupingBrief({ tagLabel: o.tagLabel, rows: anon.rows, mistakeText: o.mistakeText, roster: o.students });
  const byId = new Map(o.students.map((s) => [s.id, s]));
  const error = el('p', 'mb-form__error');
  error.setAttribute('aria-live', 'polite');
  const groupsHost = el('div', 'tut-plan__groups');
  let groups: TutorialGroup[] = [];
  let busy = false;
  const handle = { close: () => {} };

  function moveStudent(id: string, to: string | null): void {
    groups = groups.map((x) => ({ ...x, students: x.students.filter((y) => y !== id), evidence: x.evidence.filter((e) => e.student !== id) }));
    if (to) groups = groups.map((x) => (x.id === to ? { ...x, students: [...x.students, id] } : x));
    groups = groups.filter((x) => x.students.length);
    paintGroups();
    const back = groupsHost.querySelector<HTMLElement>(`[data-student="${CSS.escape(id)}"] .hub-pills__btn[aria-pressed="true"]`) ?? groupsHost.querySelector<HTMLElement>('.tut-plan__name') ?? groupBtn;
    back.focus();
  }

  function paintGroups(): void {
    groupsHost.replaceChildren(
      ...groups.map((g, gi) => {
        const card = el('section', 'tut-plan__group');
        const name = el('input', 'mb-form__input tut-plan__name');
        name.value = g.name;
        name.maxLength = 80;
        name.setAttribute('aria-label', 'Group name');
        name.addEventListener('input', () => (groups[gi] = { ...groups[gi]!, name: name.value.trim().slice(0, 80) || `Group ${gi + 1}` }));
        card.append(name);
        if (g.why) card.append(el('p', 'tut-plan__why', g.why));
        card.append(el('p', 'tut-plan__goal', g.goal));
        const notes = el('textarea', 'mb-form__input tut-plan__notes');
        notes.value = g.notes ?? '';
        notes.maxLength = 1200;
        notes.rows = 4;
        notes.placeholder = 'What this group needs';
        notes.setAttribute('aria-label', `Notes for ${g.name}`);
        notes.addEventListener('input', () => {
          const text = notes.value.slice(0, 1200);
          const { notes: _old, ...rest } = groups[gi]!;
          groups[gi] = text.trim() ? { ...rest, notes: text } : rest;
        });
        card.append(notes);
        const list = el('ul', 'tut-plan__students');
        for (const id of g.students) {
          const s = byId.get(id);
          const item = el('li', 'tut-plan__student');
          item.dataset.student = id;
          item.append(el('span', 'tut-plan__who', s ? `${s.initials} · ${s.name}` : 'Removed student'));
          const quote = g.evidence.find((e) => e.student === id)?.quote;
          if (quote) item.append(el('span', 'tut-plan__quote', `“${quote}”`));
          const pills = el('div', 'hub-pills hub-pills--loose tut-plan__move');
          pills.setAttribute('role', 'group');
          pills.setAttribute('aria-label', `Group for ${s?.initials ?? 'student'}`);
          const pill = (text: string, to: string | null, on: boolean) => {
            const b = el('button', 'hub-pills__btn', text);
            b.type = 'button';
            b.setAttribute('aria-pressed', String(on));
            b.classList.toggle('is-active', on);
            b.addEventListener('click', () => {
              if (!on) moveStudent(id, to);
            });
            return b;
          };
          for (const other of groups) pills.append(pill(other.name, other.id, other.id === g.id));
          pills.append(pill('Leave out', null, false));
          item.append(pills);
          list.append(item);
        }
        card.append(list);
        return card;
      })
    );
    draft.hidden = groups.length === 0;
  }

  const groupBtn = button('Ask Ann to group them', 'primary', async () => {
    if (busy) return;
    busy = true;
    groupBtn.disabled = true;
    error.textContent = '';
    try {
      groups = parseGroups(await deps.group(brief), anon.keys);
      paintGroups();
      groupBtn.textContent = 'Group again';
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : 'Try again.';
    } finally {
      busy = false;
      groupBtn.disabled = false;
    }
  });
  groupBtn.classList.add('tut-plan__group-btn');
  const draft = button('Create tutorial', 'primary', async () => {
    if (busy || !groups.length) return;
    busy = true;
    draft.disabled = true;
    error.textContent = '';
    try {
      const id = await deps.start({ unitId: o.unitId, afterLessonId: o.sourceLessonId, classId: o.classId, tag: o.tag, tagLabel: o.tagLabel, groups });
      busy = false;
      handle.close();
      o.onDone(id);
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : 'Try again.';
      busy = false;
      draft.disabled = false;
    }
  });
  draft.classList.add('tut-plan__draft');
  draft.hidden = true;
  const actions = el('div', 'mb-form__actions');
  actions.append(button('Cancel', 'secondary', () => {
    // A tutorial being created can't be called off: the lesson would still appear.
    if (!busy) handle.close();
  }), draft);
  sheet.append(
    heading,
    el('p', 'mb__empty', `Ann groups ${picked.length} students by why they get ${o.tagLabel} wrong and notes what each group needs. You can rename groups and move anyone before you create the tutorial. Only these students will see it.`),
    el('h4', 'mb-form__label', 'What Ann is told (no names)'),
    el('pre', 'ev-plan__brief', brief),
    el('p', 'mb__empty', TUTORIAL_PLAN_COST),
    groupBtn,
    groupsHost,
    error,
    actions
  );
  const opened = openOverlay(sheet, { labelledBy: heading.id, canClose: () => !busy });
  handle.close = opened.close;
  return sheet;
}
