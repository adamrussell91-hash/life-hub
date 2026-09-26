// apps/tasks/src/views/promote-to-goal.ts
import type { Task } from '@/schemas/task';
import type { GoalLifeArea, GoalSphere, GoalTerm } from '@/schemas/goal';
import { tasksApi } from '@/services/client-api';
import { SPHERE_LABEL, SPHERES } from '@/domain/goal-hosting';
import { LIFE_AREAS, somedayLinkedGoalIds } from '@/domain/someday';
import { currentTerm, flattenTerms, sydneyToday, termYear } from '@/domain/goal-runway';
import { errorMessage } from '@/views/feedback';
import { el } from '@/views/hub-kit';
import { createMorphingClosedFieldPopover } from '../../design-kit/js/morphing-popover.js';

/** G-25: ask sphere / term / life area before promoting a Someday idea to a goal. */
export async function openPromoteToGoalPopover(
  trigger: HTMLElement,
  task: Task,
  onDone: (next: Task) => void
): Promise<void> {
  const prefs = await tasksApi.getHubPrefs().catch(() => ({ school_terms: [] as never[] }));
  const today = sydneyToday();
  const term = currentTerm(flattenTerms(prefs as { school_terms: Array<{ terms: import('@/domain/school-time').SchoolTerm[] }> }), today);
  const year = term ? termYear(term) : Number(today.slice(0, 4));

  let sphere: GoalSphere = task.someday_kind === 'career' ? 'professional' : 'life';
  let termValue = term ? `${year}-${term.term}` : 'ongoing';
  let lifeArea = typeof task.life_area === 'string' ? task.life_area : '';

  const termChoices = [
    { value: 'ongoing', label: 'Ongoing' },
    ...([1, 2, 3, 4] as const).map((n) => ({ value: `${year}-${n}`, label: `Term ${n}` }))
  ];

  const body = el('div', 'promote-goal');
  body.append(el('p', 'meta', 'Sphere, term and life area before it becomes a goal.'));

  const sphereTrigger = el('button', 'hub-chip morphing-popover__trigger', SPHERE_LABEL[sphere]) as HTMLButtonElement;
  sphereTrigger.type = 'button';
  createMorphingClosedFieldPopover({
    root: document,
    trigger: sphereTrigger,
    title: 'Sphere',
    options: SPHERES.map((id) => ({ value: id, label: SPHERE_LABEL[id] })),
    value: sphere,
    onSave(value) {
      sphere = value as GoalSphere;
      sphereTrigger.textContent = SPHERE_LABEL[sphere];
      lifeHost.hidden = sphere !== 'life';
    }
  });

  const termTrigger = el(
    'button',
    'hub-chip morphing-popover__trigger',
    term ? `Term ${term.term}` : 'Ongoing'
  ) as HTMLButtonElement;
  termTrigger.type = 'button';
  createMorphingClosedFieldPopover({
    root: document,
    trigger: termTrigger,
    title: 'Term',
    options: termChoices,
    value: termValue,
    onSave(value) {
      termValue = value;
      termTrigger.textContent = termChoices.find((c) => c.value === value)?.label ?? value;
    }
  });

  const lifeTrigger = el(
    'button',
    'hub-chip morphing-popover__trigger',
    LIFE_AREAS.find((a) => a.id === lifeArea)?.label ?? 'Life area'
  ) as HTMLButtonElement;
  lifeTrigger.type = 'button';
  createMorphingClosedFieldPopover({
    root: document,
    trigger: lifeTrigger,
    title: 'Life area',
    options: [{ value: '', label: 'None' }, ...LIFE_AREAS.map((a) => ({ value: a.id, label: a.label }))],
    value: lifeArea,
    onSave(value) {
      lifeArea = value;
      lifeTrigger.textContent = LIFE_AREAS.find((a) => a.id === value)?.label ?? 'None';
    }
  });
  const lifeHost = el('span');
  lifeHost.hidden = sphere !== 'life';
  lifeHost.append(lifeTrigger);

  const chips = el('div', 'row promote-goal__chips');
  chips.append(sphereTrigger, termTrigger, lifeHost);
  const save = el('button', 'btn btn--primary', 'Create goal');
  save.type = 'button';
  const cancel = el('button', 'btn btn--ghost', 'Cancel');
  cancel.type = 'button';
  const actions = el('div', 'row');
  actions.append(save, cancel);
  body.append(chips, actions);

  document.querySelector('.promote-goal-panel')?.remove();
  const panel = el('div', 'glass-tile promote-goal-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Promote to goal');
  panel.append(body);
  trigger.after(panel);

  cancel.addEventListener('click', () => panel.remove());
  save.addEventListener('click', () => {
    save.disabled = true;
    const selectedTerm: GoalTerm | null =
      termValue === 'ongoing'
        ? null
        : (() => {
            const [y, t] = termValue.split('-').map(Number);
            return { year: y!, term: t as 1 | 2 | 3 | 4 };
          })();
    void tasksApi
      .createGoal({
        title: task.title,
        description: task.description,
        parent_someday_id: task.id,
        sphere,
        term: selectedTerm,
        ...(sphere === 'life' && lifeArea ? { life_area: lifeArea as GoalLifeArea } : {})
      })
      .then((goal) =>
        tasksApi.updateTask(task.id, {
          linked_goal_ids: [...somedayLinkedGoalIds(task), goal.id]
        })
      )
      .then((next) => {
        panel.remove();
        onDone(next);
      })
      .catch((err) => {
        save.disabled = false;
        window.alert(errorMessage(err));
      });
  });
}
