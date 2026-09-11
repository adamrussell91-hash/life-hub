import { describe, expect, it, vi } from 'vitest';
import {
  createDecisionStackCard,
  createScheduleDiffCard
} from '../../design-kit/js/agent-productivity-cards.js';
import { projectNextActionHealth } from '@/views/projects';
import { groupSomedayForReview } from '@/views/someday';
import { collectWorkBlockItems, filterCalendarItems } from '@/domain/calendar';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import type { WorkBlock } from '@/schemas/work-block';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    schema_version: 1,
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: 30,
    actual_duration: null,
    due_date: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    blocked_since: null,
    priority: 'medium',
    parent_project_id: 'p1',
    parent_task_id: null,
    depends_on: [],
    tags: [],
    recurrence_rule: null,
    due_time: null,
    remind_at: null,
    remind_dismissed_at: null,
    attachments: [],
    source: 'manual',
    target_date: null,
    review_at: null,
    waiting_on: null,
    waiting_since: null,
    follow_up_at: null,
    waiting_status: null,
    contexts: [],
    cognitive_load: null,
    depth: null,
    ...partial
  };
}

function project(partial: Partial<Project> & Pick<Project, 'id' | 'title'>): Project {
  return {
    schema_version: 1,
    description: '',
    parent_goal_id: null,
    tags: [],
    arc_summary: '',
    purpose: '',
    desired_outcome: '',
    quality_bar: null,
    review_at: null,
    type: 'standard',
    milestones: [],
    status: 'active',
    baseline_end_date: null,
    current_end_date: null,
    review_summary: null,
    stall_flagged_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    competition_or_event_type: null,
    key_dates: null,
    student_group_reference: null,
    generated_admin_tasks: [],
    drafted_documents: null,
    ...partial
  };
}

describe('clarify stack card', () => {
  it('edits destinations and confirms selected only', () => {
    const confirmed: unknown[] = [];
    const card = createDecisionStackCard(document, {
      pendingId: 'pending_clarify_test',
      items: [
        { id: 'a', text: 'Buy milk', destination: 'next_action' },
        { id: 'b', text: 'Someday trip', destination: 'someday' }
      ],
      onConfirmSelected: (picks) => confirmed.push(picks),
      onConfirmAll: () => confirmed.push('all')
    });
    document.body.append(card);
    const rows = card.querySelectorAll('.prod-card__stack-row');
    expect(rows.length).toBe(2);
    const select = rows[0]!.querySelector('select') as HTMLSelectElement;
    select.value = 'waiting';
    select.dispatchEvent(new Event('change'));
    const checkB = rows[1]!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkB.checked = false;
    checkB.dispatchEvent(new Event('change'));
    const confirmSelected = [...card.querySelectorAll('button')].find(
      (b) => b.textContent === 'Confirm selected'
    )!;
    confirmSelected.click();
    expect(confirmed).toHaveLength(1);
    const picks = confirmed[0] as Array<{ id: string; destination: string }>;
    expect(picks).toHaveLength(1);
    expect(picks[0]!.id).toBe('a');
    expect(picks[0]!.destination).toBe('waiting');
    card.remove();
  });
});

describe('schedule diff ghost', () => {
  it('preview does not write', () => {
    const writes: string[] = [];
    const previews: boolean[] = [];
    const { card, isPreview } = createScheduleDiffCard(document, {
      pendingId: 'pending_schedule_test',
      blocks: [
        { id: 'g1', title: 'Deep block', start_time: '09:00', duration_minutes: 90, ghost: true }
      ],
      onConfirm: () => writes.push('confirm'),
      onPreview: (active) => previews.push(active),
      onDiscard: () => writes.push('discard')
    });
    document.body.append(card);
    const previewBtn = [...card.querySelectorAll('button')].find((b) => b.textContent === 'Preview')!;
    previewBtn.click();
    expect(isPreview()).toBe(true);
    expect(writes).toEqual([]);
    expect(previews).toEqual([true]);
    expect(card.querySelector('.prod-card__ghost-block')?.classList.contains('is-ghost')).toBe(true);
    card.remove();
  });
});

describe('project health indicator', () => {
  it('is quiet when healthy and prompts when missing next action', () => {
    const proj = project({ id: 'p1', title: 'Alpha' });
    const healthy = [
      task({ id: 't1', title: 'Do the thing', parent_project_id: 'p1', status: 'open' })
    ];
    expect(projectNextActionHealth(proj, healthy)).toBeNull();
    const missing = [task({ id: 't2', title: 'Done only', parent_project_id: 'p1', status: 'done' })];
    const hint = projectNextActionHealth(proj, missing);
    expect(hint?.tagName).toBe('BUTTON');
    expect(hint?.textContent).toBe('Add next action');
  });

  it('opens add from Add next action instead of doing nothing', () => {
    const onAdd = vi.fn();
    const hint = projectNextActionHealth(
      project({ id: 'p1', title: 'Alpha' }),
      [task({ id: 't2', title: 'Done only', parent_project_id: 'p1', status: 'done' })],
      onAdd
    );
    expect(hint).not.toBeNull();
    hint!.click();
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

describe('someday review grouping', () => {
  it('groups review-now separately from parked', () => {
    const items = [
      task({ id: 's1', title: 'Due review', bucket: 'someday', review_at: '2026-09-01' }),
      task({ id: 's2', title: 'Later', bucket: 'someday', review_at: '2026-12-01' }),
      task({ id: 's3', title: 'No date', bucket: 'someday', review_at: null })
    ];
    const { reviewNow, parked } = groupSomedayForReview(items, '2026-09-08');
    expect(reviewNow.map((t) => t.id).sort()).toEqual(['s1', 's3']);
    expect(parked.map((t) => t.id)).toEqual(['s2']);
  });
});

describe('calendar planning lens', () => {
  it('toggles planned work layer filtering', () => {
    const blocks: WorkBlock[] = [
      {
        schema_version: 1,
        id: 'wb1',
        task_id: null,
        project_id: null,
        title: 'Plan block',
        date: '2026-09-08',
        start_time: '10:00',
        duration_minutes: 60,
        depth: 'deep',
        status: 'confirmed',
        source: 'manual',
        locked: false,
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z'
      }
    ];
    const items = collectWorkBlockItems(blocks);
    expect(items).toHaveLength(1);
    const withLayer = filterCalendarItems(items, {
      domain: 'all',
      projectId: 'all',
      query: '',
      includeDone: false,
      includeDates: true,
      planningLens: true,
      layers: ['hard_deadline']
    });
    expect(withLayer).toHaveLength(0);
    const shown = filterCalendarItems(items, {
      domain: 'all',
      projectId: 'all',
      query: '',
      includeDone: false,
      includeDates: true,
      planningLens: true,
      layers: ['planned_work']
    });
    expect(shown).toHaveLength(1);
  });
});

void vi;
