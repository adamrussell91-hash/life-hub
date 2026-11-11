// apps/tasks/tests/unit/goal-mandala.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderGoalFrame } from '@/views/goal-frame';
import { mandalaHasContent, padPillars, resetMandalaView } from '@/views/goal-mandala';
import type { Goal } from '@/schemas/goal';
import { goal } from './goal-fixtures';

function commit(input: HTMLTextAreaElement | HTMLSelectElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('change'));
}

function mandalaGoal(extra: Partial<Goal> = {}): Goal {
  return goal({
    id: 'g1',
    title: 'Run a half marathon',
    structure: 'mandala',
    frame: {
      mandala: {
        pillars: [
          { id: 'p1', label: 'Base mileage', project_id: 'proj1', actions: [{ id: 'p1a1', label: 'Three easy runs a week', promoted: null }] },
          { id: 'p2', label: 'Sleep', project_id: null, actions: [] }
        ]
      }
    },
    ...extra
  });
}

const projects = [{ id: 'proj1', title: 'Training block' }];

afterEach(() => resetMandalaView());

describe('Mandala structure', () => {
  it('draws a 3×3 grid with the goal in the centre and eight pillar cells', () => {
    const node = renderGoalFrame(mandalaGoal(), vi.fn());
    const cells = node.querySelectorAll('.mandala__cell');
    expect(cells).toHaveLength(9);
    expect(cells[4]!.classList.contains('mandala__cell--centre')).toBe(true);
    expect(cells[4]!.textContent).toContain('Run a half marathon');
    expect(node.querySelectorAll('.mandala__cell--pillar')).toHaveLength(8);
  });

  it('naming a pillar saves all eight slots and keeps the others', () => {
    const onPatch = vi.fn();
    const node = renderGoalFrame(mandalaGoal(), onPatch);
    commit(node.querySelector<HTMLTextAreaElement>('[data-field="mandala.p.2"]')!, 'Strength');
    const pillars = onPatch.mock.calls[0]![0].frame.mandala.pillars;
    expect(pillars).toHaveLength(8);
    expect(pillars[0].label).toBe('Base mileage');
    expect(pillars[0].project_id).toBe('proj1');
    expect(pillars[2].label).toBe('Strength');
  });

  it('shows which named pillars have a project behind them', () => {
    const node = renderGoalFrame(mandalaGoal(), vi.fn(), { projects });
    const [first, second] = [...node.querySelectorAll('.mandala__cell--pillar')];
    expect(first!.querySelector('.mandala__chip--project')!.textContent).toBe('Training block');
    expect(second!.querySelector('.mandala__chip--empty')!.textContent).toBe('No project yet');
    expect(node.querySelector('.mandala__summary')!.textContent).toBe('2 of 8 pillars named · 1 with a project behind it');
  });

  it('an unnamed pillar cannot be opened', () => {
    const node = renderGoalFrame(mandalaGoal(), vi.fn());
    const cells = node.querySelectorAll('.mandala__cell--pillar');
    expect(cells[0]!.querySelector('[data-action="open-pillar"]')).not.toBeNull();
    expect(cells[2]!.querySelector('[data-action="open-pillar"]')).toBeNull();
    expect(cells[2]!.classList.contains('is-empty')).toBe(true);
  });

  it('opens a pillar with its actions and keeps it open after a repaint (V7)', () => {
    const g = mandalaGoal();
    const node = renderGoalFrame(g, vi.fn());
    node.querySelector<HTMLButtonElement>('[data-action="open-pillar"]')!.click();
    const hub = node.querySelector('.mandala__cell--hub')!;
    expect(hub.textContent).toContain('Base mileage');
    expect(hub.classList.contains('tone-sage')).toBe(true);
    expect(node.querySelector<HTMLTextAreaElement>('[data-field="mandala.a.0"]')!.value).toBe('Three easy runs a week');
    // A save repaints the whole card; the pillar stays open.
    const again = renderGoalFrame(g, vi.fn());
    expect(again.querySelector('[data-action="close-pillar"]')).not.toBeNull();
    again.querySelector<HTMLButtonElement>('[data-action="close-pillar"]')!.click();
    expect(again.querySelectorAll('.mandala__cell--pillar')).toHaveLength(8);
  });

  it('links a pillar to a hosted project', () => {
    const onPatch = vi.fn();
    const node = renderGoalFrame(mandalaGoal(), onPatch, { projects });
    node.querySelectorAll<HTMLButtonElement>('[data-action="open-pillar"]')[1]!.click();
    commit(node.querySelector<HTMLSelectElement>('[data-action="pillar-project"]')!, 'proj1');
    expect(onPatch.mock.calls[0]![0].frame.mandala.pillars[1].project_id).toBe('proj1');
  });

  it('promotes an action to the lead measure, clearing any older lead cell', () => {
    const onPatch = vi.fn();
    const g = mandalaGoal({ lead_measure: { label: 'Old lead', per_week: 3 } });
    const node = renderGoalFrame(g, onPatch, { confirm: () => true });
    node.querySelector<HTMLButtonElement>('[data-action="open-pillar"]')!.click();
    commit(node.querySelector<HTMLSelectElement>('[data-action="promote"]')!, 'lead');
    const patch = onPatch.mock.calls[0]![0];
    expect(patch.lead_measure).toEqual({ label: 'Three easy runs a week', per_week: 3 });
    expect(patch.frame.mandala.pillars[0].actions[0].promoted).toEqual({ kind: 'lead', task_id: null });
  });

  it('does not replace a lead measure when the confirm is declined', () => {
    const onPatch = vi.fn();
    const node = renderGoalFrame(mandalaGoal({ lead_measure: { label: 'Old lead', per_week: 1 } }), onPatch, { confirm: () => false });
    node.querySelector<HTMLButtonElement>('[data-action="open-pillar"]')!.click();
    commit(node.querySelector<HTMLSelectElement>('[data-action="promote"]')!, 'lead');
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('promotes an action to a task and records the new task id', () => {
    const onPromoteTask = vi.fn();
    const node = renderGoalFrame(mandalaGoal(), vi.fn(), { onPromoteTask });
    node.querySelector<HTMLButtonElement>('[data-action="open-pillar"]')!.click();
    commit(node.querySelector<HTMLSelectElement>('[data-action="promote"]')!, 'task');
    expect(onPromoteTask).toHaveBeenCalledTimes(1);
    const [label, patchFor] = onPromoteTask.mock.calls[0]!;
    expect(label).toBe('Three easy runs a week');
    expect(patchFor('t9').frame.mandala.pillars[0].actions[0].promoted).toEqual({ kind: 'task', task_id: 't9' });
  });

  it('hides the task option when there is no live page to create one', () => {
    const node = renderGoalFrame(mandalaGoal(), vi.fn());
    node.querySelector<HTMLButtonElement>('[data-action="open-pillar"]')!.click();
    const values = [...node.querySelectorAll<HTMLOptionElement>('[data-action="promote"] option')].map((o) => o.value);
    expect(values).toEqual(['', 'lead']);
  });

  it('shows a promotion only while it still holds', () => {
    const promoted = (kind: 'lead' | 'task', task_id: string | null = null) =>
      mandalaGoal({
        lead_measure: { label: 'Something else', per_week: 1 },
        frame: { mandala: { pillars: [{ id: 'p1', label: 'Base', project_id: null, actions: [{ id: 'a', label: 'Run', promoted: { kind, task_id } }] }] } }
      });
    const open = (g: Goal, ctx = {}) => {
      resetMandalaView();
      const node = renderGoalFrame(g, vi.fn(), ctx);
      node.querySelector<HTMLButtonElement>('[data-action="open-pillar"]')!.click();
      return node;
    };
    // Lead measure changed elsewhere: the cell can be promoted again.
    expect(open(promoted('lead')).querySelector('[data-action="promote"]')).not.toBeNull();
    // Task done.
    expect(open(promoted('task', 't1'), { tasks: [{ id: 't1', status: 'done' }] }).querySelector('.mandala__chip--task')!.textContent).toBe('Task · done');
    // Task deleted.
    expect(open(promoted('task', 't1'), { tasks: [] }).querySelector('.mandala__chip--task')).toBeNull();
  });

  it('pads to eight pillars of eight actions and reports content', () => {
    const pillars = padPillars(mandalaGoal());
    expect(pillars).toHaveLength(8);
    expect(pillars.every((p) => p.actions.length === 8)).toBe(true);
    expect(mandalaHasContent(mandalaGoal())).toBe(true);
    expect(mandalaHasContent(goal({ id: 'x', title: 'x' }))).toBe(false);
  });
});
