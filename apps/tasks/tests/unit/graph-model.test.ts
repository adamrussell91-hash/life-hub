import { describe, expect, it } from 'vitest';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import {
  collisions,
  criticalPath,
  doFirst,
  nodeState,
  orbitBody,
  pace,
  projectRoute,
  projectedDates,
  serviceStatus,
  unlockCount,
  wouldCreateCycle
} from '@/domain/graph-model';

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
    parent_project_id: 'proj_a',
    parent_task_id: null,
    depends_on: [],
    tags: [],
    recurrence_rule: null,
    due_time: null,
    remind_at: null,
    remind_dismissed_at: null,
    attachments: [],
    source: 'manual',
    waiting_on: null,
    waiting_since: null,
    follow_up_at: null,
    waiting_status: null,
    ...partial
  };
}

function project(partial: Partial<Project> = {}): Project {
  return {
    schema_version: 1,
    id: 'proj_a',
    title: 'MindWorks',
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
    current_end_date: '2026-09-30',
    review_summary: null,
    stall_flagged_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    competition_or_event_type: null,
    key_dates: null,
    student_group_reference: null,
    generated_admin_tasks: [],
    drafted_documents: null,
    expected_headcount: null,
    active_escalation: null,
    linked_program_id: null,
    ...partial
  };
}

const now = new Date('2026-09-10T10:00:00');

describe('nodeState', () => {
  it('marks done tasks done', () => {
    const done = task({ id: 't1', title: 'Done', status: 'done' });
    expect(nodeState(done, [done], now).state).toBe('done');
  });

  it('marks the first unfinished project task current', () => {
    const a = task({ id: 'a', title: 'A', step_order: 0, status: 'done' });
    const b = task({ id: 'b', title: 'B', step_order: 1, status: 'open' });
    expect(nodeState(b, [a, b], now).state).toBe('current');
    expect(nodeState(a, [a, b], now).state).toBe('done');
  });

  it('marks later unfinished tasks open when nothing blocks them', () => {
    const a = task({ id: 'a', title: 'A', step_order: 0, status: 'open' });
    const b = task({ id: 'b', title: 'B', step_order: 1, status: 'open' });
    expect(nodeState(b, [a, b], now).state).toBe('open');
  });

  it('marks a task blocked when a dependency is unfinished', () => {
    const a = task({ id: 'a', title: 'A', status: 'open' });
    const b = task({ id: 'b', title: 'B', depends_on: ['a'] });
    expect(nodeState(b, [a, b], now).state).toBe('blocked');
  });

  it('marks waiting_status waiting and follow_up_due as waiting', () => {
    const waiting = task({ id: 'w', title: 'W', waiting_status: 'waiting' });
    const follow = task({ id: 'f', title: 'F', waiting_status: 'follow_up_due' });
    expect(nodeState(waiting, [waiting], now).state).toBe('waiting');
    expect(nodeState(follow, [follow], now).state).toBe('waiting');
  });

  it('marks the current task stalled when the project has gone quiet', () => {
    const stale = task({
      id: 's',
      title: 'Stale',
      created_at: '2026-06-01T00:00:00.000Z',
      updated_at: '2026-06-01T00:00:00.000Z'
    });
    expect(nodeState(stale, [stale], now).state).toBe('stalled');
  });

  it('marks overdue when the due date has passed', () => {
    const late = task({
      id: 'l',
      title: 'Late',
      due_date: '2026-09-01',
      step_order: 1,
      parent_project_id: 'proj_a'
    });
    const current = task({ id: 'c', title: 'Current', step_order: 0, due_date: '2026-09-20' });
    expect(nodeState(late, [current, late], now).state).toBe('overdue');
    expect(nodeState(late, [current, late], now).overdue).toBe(true);
  });

  it('sets noDate, dueSoon and onCriticalPath flags', () => {
    const a = task({ id: 'a', title: 'A', due_date: null, estimated_duration: 60 });
    const b = task({
      id: 'b',
      title: 'B',
      due_date: '2026-09-14',
      depends_on: ['a'],
      estimated_duration: 60
    });
    const flags = nodeState(b, [a, b], now);
    expect(nodeState(a, [a, b], now).noDate).toBe(true);
    expect(flags.dueSoon).toBe(true);
    expect(flags.onCriticalPath).toBe(true);
  });
});

describe('projectRoute', () => {
  it('orders stations by step_order, then due date, then created_at', () => {
    const tasks = [
      task({ id: 'c', title: 'C', step_order: 2, created_at: '2026-08-03T00:00:00.000Z' }),
      task({ id: 'a', title: 'A', step_order: 0, due_date: '2026-09-20' }),
      task({ id: 'b', title: 'B', step_order: 1, due_date: '2026-09-12' })
    ];
    expect(projectRoute(project(), tasks).mainline.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('places a milestone after the depends_on task', () => {
    const tasks = [
      task({ id: 'a', title: 'Write', step_order: 0 }),
      task({ id: 'b', title: 'Print', step_order: 1 })
    ];
    const route = projectRoute(
      project({
        milestones: [
          {
            id: 'ms1',
            project_id: 'proj_a',
            title: 'Draft locked',
            due_date: null,
            status: 'open',
            depends_on: ['a']
          }
        ]
      }),
      tasks
    );
    expect(route.stations.map((s) => s.id)).toEqual(['a', 'ms1', 'b']);
    expect(route.stations[1]?.kind).toBe('milestone');
  });

  it('nests children with parent_task_id as a branch', () => {
    const parent = task({ id: 'p', title: 'Parent', step_order: 0 });
    const child = task({ id: 'c', title: 'Child', step_order: 1, parent_task_id: 'p' });
    const nested = task({ id: 'n', title: 'Nested', step_order: 2, parent_task_id: 'c' });
    const route = projectRoute(project(), [parent, child, nested]);
    expect(route.stations.find((s) => s.id === 'c')?.parentStationId).toBe('p');
    expect(route.stations.find((s) => s.id === 'n')?.parentStationId).toBe('c');
    expect(route.mainline.map((s) => s.id)).toEqual(['p']);
  });

  it('marks a cross-project depends_on as an interchange', () => {
    const other = task({ id: 'o', title: 'Other', parent_project_id: 'proj_b' });
    const mine = task({ id: 'm', title: 'Mine', depends_on: ['o'] });
    const route = projectRoute(project(), [other, mine]);
    expect(route.stations.find((s) => s.id === 'm')?.interchangeProjectIds).toEqual(['proj_b']);
  });
});

describe('pace and serviceStatus', () => {
  it('returns null pace when there is no terminus', () => {
    const p = project({ current_end_date: null });
    const tasks = [task({ id: 'a', title: 'A', due_date: null })];
    expect(pace(p, tasks, now)).toBeNull();
  });

  it('reports behind pace when fewer stations are done than the ghost', () => {
    const tasks = [
      task({ id: 'a', title: 'A', step_order: 0, status: 'done' }),
      task({ id: 'b', title: 'B', step_order: 1 }),
      task({ id: 'c', title: 'C', step_order: 2 }),
      task({ id: 'd', title: 'D', step_order: 3 })
    ];
    const measured = pace(project({ created_at: '2026-08-01T00:00:00.000Z', current_end_date: '2026-09-20' }), tasks, now);
    expect(measured).not.toBeNull();
    expect(measured!.behind).toBeGreaterThan(0);
    expect(measured!.actualDone).toBe(1);
  });

  it('reports ahead of pace when more stations are done than the ghost', () => {
    const tasks = [
      task({ id: 'a', title: 'A', step_order: 0, status: 'done' }),
      task({ id: 'b', title: 'B', step_order: 1, status: 'done' }),
      task({ id: 'c', title: 'C', step_order: 2, status: 'done' }),
      task({ id: 'd', title: 'D', step_order: 3 })
    ];
    const measured = pace(
      project({ created_at: '2026-09-01T00:00:00.000Z', current_end_date: '2026-10-30' }),
      tasks,
      now
    );
    expect(measured).not.toBeNull();
    expect(measured!.behind).toBeLessThan(0);
  });

  it('returns arrived when every station is done', () => {
    const tasks = [task({ id: 'a', title: 'A', status: 'done' })];
    expect(serviceStatus(project(), tasks, now).status).toBe('arrived');
  });

  it('returns suspended when the project is stalled', () => {
    const tasks = [
      task({
        id: 'a',
        title: 'A',
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z'
      })
    ];
    expect(serviceStatus(project({ updated_at: '2026-06-01T00:00:00.000Z' }), tasks, now).status).toBe(
      'suspended'
    );
  });

  it('returns major_delays when behind by two or more', () => {
    const tasks = [
      task({ id: 'a', title: 'A', step_order: 0, status: 'done' }),
      task({ id: 'b', title: 'B', step_order: 1 }),
      task({ id: 'c', title: 'C', step_order: 2 }),
      task({ id: 'd', title: 'D', step_order: 3 }),
      task({ id: 'e', title: 'E', step_order: 4 })
    ];
    const status = serviceStatus(
      project({ created_at: '2026-07-01T00:00:00.000Z', current_end_date: '2026-09-15', updated_at: '2026-09-09T00:00:00.000Z' }),
      tasks.map((item) => ({ ...item, updated_at: '2026-09-09T00:00:00.000Z' })),
      now
    );
    expect(status.status).toBe('major_delays');
  });

  it('returns minor_delays when a station ahead is blocked', () => {
    const a = task({ id: 'a', title: 'A', step_order: 0, status: 'open', updated_at: '2026-09-09T00:00:00.000Z' });
    const b = task({
      id: 'b',
      title: 'B',
      step_order: 1,
      depends_on: ['x'],
      updated_at: '2026-09-09T00:00:00.000Z'
    });
    const status = serviceStatus(
      project({ current_end_date: '2026-12-01', updated_at: '2026-09-09T00:00:00.000Z' }),
      [a, b],
      now
    );
    expect(status.status).toBe('minor_delays');
  });

  it('does not treat same-line unfinished deps as a service delay', () => {
    const a = task({ id: 'a', title: 'A', step_order: 0, status: 'in_progress', updated_at: '2026-09-09T00:00:00.000Z' });
    const b = task({
      id: 'b',
      title: 'B',
      step_order: 1,
      depends_on: ['a'],
      updated_at: '2026-09-09T00:00:00.000Z'
    });
    expect(
      serviceStatus(
        project({ created_at: '2026-09-01T00:00:00.000Z', current_end_date: '2026-12-01', updated_at: '2026-09-09T00:00:00.000Z' }),
        [a, b],
        now
      ).status
    ).toBe('good_service');
  });

  it('is not behind pace until the ghost fully passes a station', () => {
    const tasks = [
      task({ id: 'a', title: 'A', step_order: 0 }),
      task({ id: 'b', title: 'B', step_order: 1 }),
      task({ id: 'c', title: 'C', step_order: 2 })
    ];
    const measured = pace(
      project({ created_at: '2026-09-14T00:00:00.000Z', current_end_date: '2026-10-14' }),
      tasks,
      new Date('2026-09-22T09:00:00+10:00')
    );
    expect(measured).not.toBeNull();
    expect(measured!.ghostAt).toBeGreaterThan(0);
    expect(measured!.ghostAt).toBeLessThan(1);
    expect(measured!.behind).toBeLessThanOrEqual(0);
  });

  it('returns good_service when none of the delay rules fire', () => {
    const a = task({
      id: 'a',
      title: 'A',
      step_order: 0,
      status: 'done',
      updated_at: '2026-09-09T00:00:00.000Z'
    });
    const b = task({ id: 'b', title: 'B', step_order: 1, updated_at: '2026-09-09T00:00:00.000Z' });
    expect(
      serviceStatus(
        project({ created_at: '2026-09-01T00:00:00.000Z', current_end_date: '2026-12-01', updated_at: '2026-09-09T00:00:00.000Z' }),
        [a, b],
        now
      ).status
    ).toBe('good_service');
  });
});

describe('projectedDates', () => {
  it('walks a dependency chain', () => {
    const a = task({ id: 'a', title: 'A', estimated_duration: 480, due_date: null });
    const b = task({ id: 'b', title: 'B', depends_on: ['a'], estimated_duration: 480, due_date: null });
    const dates = projectedDates([a, b], [project()], now);
    expect(dates.get('a')?.start).toBe('2026-09-10');
    expect(dates.get('b')?.start).toBe(dates.get('a')?.finish);
  });

  it('assumes one working day when there is no estimate', () => {
    const a = task({ id: 'a', title: 'A', estimated_duration: null, due_date: null });
    const dates = projectedDates([a], [project()], now);
    expect(dates.get('a')?.finish >= dates.get('a')!.start).toBe(true);
  });

  it('lets an explicit due date beat the forward pass when it is later', () => {
    const a = task({ id: 'a', title: 'A', estimated_duration: 30, due_date: '2026-10-01' });
    const dates = projectedDates([a], [project()], now);
    expect(dates.get('a')?.finish).toBe('2026-10-01');
    expect(dates.get('a')?.late).toBe(false);
  });

  it('flags a task whose projected finish is after its due date', () => {
    const a = task({ id: 'a', title: 'A', estimated_duration: 480, due_date: null });
    const b = task({
      id: 'b',
      title: 'B',
      depends_on: ['a'],
      estimated_duration: 480,
      due_date: '2026-09-10'
    });
    expect(projectedDates([a, b], [project()], now).get('b')?.late).toBe(true);
  });

  it('applies what-if overrides', () => {
    const a = task({ id: 'a', title: 'A', estimated_duration: 30, due_date: '2026-09-12' });
    const dates = projectedDates([a], [project()], now, { a: { due_date: '2026-09-20' } });
    expect(dates.get('a')?.finish).toBe('2026-09-20');
  });
});

describe('unlockCount, criticalPath and doFirst', () => {
  it('counts unfinished downstream tasks', () => {
    const a = task({ id: 'a', title: 'A' });
    const b = task({ id: 'b', title: 'B', depends_on: ['a'] });
    const c = task({ id: 'c', title: 'C', depends_on: ['b'], status: 'done' });
    const d = task({ id: 'd', title: 'D', depends_on: ['b'] });
    expect(unlockCount('a', [a, b, c, d])).toBe(2);
  });

  it('returns the longest duration-weighted path', () => {
    const a = task({ id: 'a', title: 'A', estimated_duration: 30 });
    const b = task({ id: 'b', title: 'B', depends_on: ['a'], estimated_duration: 30 });
    const c = task({ id: 'c', title: 'C', estimated_duration: 240 });
    expect(criticalPath('proj_a', [a, b, c])).toEqual(['c']);
    const long = task({ id: 'd', title: 'D', depends_on: ['b'], estimated_duration: 240 });
    expect(criticalPath('proj_a', [a, b, c, long])).toEqual(['a', 'b', 'd']);
  });

  it('ranks ready tasks by unlock × pressure ÷ effort', () => {
    const tiny = task({
      id: 'tiny',
      title: 'Tiny',
      estimated_duration: 15,
      due_date: '2026-09-12'
    });
    const blocker = task({
      id: 'block',
      title: 'Block',
      estimated_duration: 120,
      due_date: '2026-10-01'
    });
    const child = task({
      id: 'child',
      title: 'Child',
      depends_on: ['tiny'],
      due_date: '2026-09-12',
      estimated_duration: 30
    });
    const ranks = doFirst([tiny, blocker, child], now);
    expect(ranks[0]?.taskId).toBe('tiny');
    expect(ranks[0]?.explanation).toMatch(/Frees 1 task/);
    expect(ranks[0]?.explanation).toMatch(/minutes/);
  });
});

describe('orbitBody and collisions', () => {
  it('puts overdue tasks in the core (14 + min(days,4)×3)', () => {
    const late = task({ id: 'late', title: 'Late', due_date: '2026-09-01' });
    const body = orbitBody(late, now, 0);
    expect(body).not.toBeNull();
    expect(body!.radius).toBe(14 + 4 * 3);
    expect(body!.heat).toBe(1);
  });

  it('places day 0 at the overdue core', () => {
    const today = task({ id: 't', title: 'Today', due_date: '2026-09-10' });
    const body = orbitBody(today, now, 0);
    expect(body!.effectiveDays).toBe(0);
    expect(body!.radius).toBe(14);
  });

  it('places day 30 at RMAX', () => {
    const later = task({ id: 't', title: 'Later', due_date: '2026-10-10' });
    const body = orbitBody(later, now, 0);
    expect(body!.effectiveDays).toBe(30);
    expect(body!.radius).toBeCloseTo(262, 0);
  });

  it('places more than 30 days in the later belt', () => {
    const far = task({ id: 't', title: 'Far', due_date: '2026-11-20' });
    expect(orbitBody(far, now, 0)!.radius).toBe(292);
  });

  it('places the ghost at a fractional mainline index', () => {
    const tasks = [
      task({ id: 'a', title: 'A', step_order: 0, status: 'done' }),
      task({ id: 'b', title: 'B', step_order: 1 }),
      task({ id: 'c', title: 'C', step_order: 2 }),
      task({ id: 'd', title: 'D', step_order: 3 })
    ];
    const measured = pace(project({ created_at: '2026-08-01T00:00:00.000Z', current_end_date: '2026-09-20' }), tasks, now);
    expect(measured!.ghostAt).not.toBe(Math.round(measured!.ghostAt));
    expect(measured!.ghostAt).toBeGreaterThan(0);
  });

  it('finds a collision from capacity minutes', () => {
    const tasks = [
      task({ id: 'a', title: 'A', due_date: '2026-09-10', estimated_duration: 180, priority: 'high' }),
      task({ id: 'b', title: 'B', due_date: '2026-09-10', estimated_duration: 180, priority: 'low' }),
      task({ id: 'c', title: 'C', due_date: '2026-09-10', estimated_duration: 90, priority: 'medium' })
    ];
    const hits = collisions(tasks, now, 1);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.suggestedMoveId).toBe('b');
  });

  it('treats three undated-estimate tasks on one day as a collision', () => {
    const tasks = [
      task({ id: 'a', title: 'A', due_date: '2026-09-11', estimated_duration: null }),
      task({ id: 'b', title: 'B', due_date: '2026-09-11', estimated_duration: null }),
      task({ id: 'c', title: 'C', due_date: '2026-09-11', estimated_duration: null })
    ];
    expect(collisions(tasks, now, 2).some((hit) => hit.dateKey === '2026-09-11')).toBe(true);
  });

  it('rejects a cyclic link', () => {
    const a = task({ id: 'a', title: 'A', depends_on: ['b'] });
    const b = task({ id: 'b', title: 'B' });
    expect(wouldCreateCycle('a', 'b', [a, b])).toBe(true);
    expect(wouldCreateCycle('b', 'a', [a, b])).toBe(false);
  });
});
