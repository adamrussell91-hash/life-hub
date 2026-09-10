/**
 * Productivity OS processors — Netlify plain-JS port smoke tests.
 * Covers clarify, schedule around lessons+protected, runway impossible,
 * handoff reconcile, active project limit, threefold sparse.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clarifyDump,
  composeDaySchedule,
  computeDeadlineRunway,
  activeProjectMeter,
  threefoldWorkAudit,
  createWeekMissionHandoff,
  createClareScheduleReturn,
  reconcileClareReturn
} from '../../netlify/functions/_shared/productivity-os.mjs';

describe('clarify', () => {
  it('classifies mixed dump destinations', () => {
    const stack = clarifyDump(
      [
        'Email the parent about homework',
        'Waiting on supplier quote from Acme',
        'Someday learn pottery',
        'Meeting with principal on 2026-09-12',
        'Trash this random note',
        'Plan the open day project and set up stalls and invite speakers'
      ].join('\n')
    );
    assert.equal(stack.items.length, 6);
    assert.deepEqual(
      stack.items.map((i) => i.destination),
      ['next_action', 'waiting', 'someday', 'calendar', 'trash', 'project']
    );
    assert.match(stack.items[1].waiting_on ?? '', /Acme/i);
    assert.equal(stack.items[5].project_next_action, null);
    assert.equal(stack.items[5].ambiguous, true);
    assert.ok(stack.items[5].missing?.includes('project_next_action'));
  });
});

describe('schedule compose', () => {
  it('schedules around lessons and protected windows', () => {
    const result = composeDaySchedule({
      date: '2026-09-08',
      workday: { start: '08:00', end: '16:30', source: 'profile' },
      lessons: [{ start: 11 * 60, end: 12 * 60, title: 'Year 10', kind: 'lesson' }],
      protected_windows: [{ start: 15 * 60, end: 16 * 60 + 30, title: 'Pickup', kind: 'protected' }],
      tasks: [
        { id: 't1', title: 'Mark', estimated_duration: 45, depth: 'shallow' },
        { id: 't2', title: 'Deep plan', estimated_duration: 90, depth: 'deep' }
      ]
    });
    assert.ok(result.proposed.length > 0);
    for (const block of result.proposed) {
      const start = Number(block.start_time.slice(0, 2)) * 60 + Number(block.start_time.slice(3));
      const end = start + block.duration_minutes;
      assert.equal(start >= 11 * 60 && start < 12 * 60, false);
      assert.equal(end > 11 * 60 && end <= 12 * 60, false);
      assert.equal(start >= 15 * 60, false);
    }
  });
});

describe('deadline runway', () => {
  it('marks impossible when capacity is insufficient', () => {
    const runway = computeDeadlineRunway({
      deadline: '2026-09-09',
      remaining_minutes: 400,
      today: '2026-09-08',
      available_minutes_until_deadline: 60
    });
    assert.equal(runway.risk, 'impossible');
    assert.match(runway.note, /Deadline not moved/);
  });
});

describe('handoff reconcile', () => {
  it('requires Hammond cuts when Clare lacks capacity', () => {
    const handoff = createWeekMissionHandoff({
      week_window: { start: '2026-09-08', end: '2026-09-14' },
      selected_outcomes: [{ id: 'o1', title: 'Ship unit', project_ids: ['p2'] }],
      linked_projects: [
        { id: 'p1', title: 'Keep', quality_bar: 'high_quality', decision: 'keep' },
        { id: 'p2', title: 'Protect', quality_bar: 'exceptional', decision: 'protect' }
      ],
      hard_constraints: [],
      fixed_schedule: [],
      protected_windows: [],
      active_project_decisions: [],
      depth_allocation: [],
      quality_expectations: [],
      explicit_deferrals: [],
      evidence_pointers: []
    });
    const ret = createClareScheduleReturn({
      week_window: handoff.week_window,
      planned_work_blocks: [],
      unscheduled_work: [{ id: 'p2', title: 'Ship unit', reason: 'No capacity' }],
      collisions: [],
      deadline_risk: [],
      dependency_risk: [],
      fallback_assumptions: ['workday fallback 08:00–16:30'],
      confidence: 'medium',
      insufficient_capacity: true
    });
    const recon = reconcileClareReturn(handoff, ret);
    assert.equal(recon.status, 'needs_cuts');
    assert.ok(recon.remove_outcomes.length >= 1);
  });
});

describe('active project limit', () => {
  it('meters over/full/ok/unset', () => {
    const projects = [
      { id: 'p1', title: 'A', status: 'active' },
      { id: 'p2', title: 'B', status: 'active' },
      { id: 'p3', title: 'C', status: 'paused' }
    ];
    assert.equal(activeProjectMeter(projects, null).status, 'unset');
    assert.equal(activeProjectMeter(projects, { active_project_limit: 1 }).status, 'over');
    assert.equal(activeProjectMeter(projects, { active_project_limit: 2 }).status, 'full');
    assert.equal(activeProjectMeter(projects, { active_project_limit: 6 }).status, 'ok');
  });
});

describe('threefold sparse', () => {
  it('flags sparse when fewer than three classified sessions', () => {
    const sessions = [
      {
        id: 's1',
        started_at: '2026-09-08T01:00:00.000Z',
        actual_duration_minutes: 40,
        work_mode: 'reactive',
        work_mode_confidence: 'inferred'
      },
      {
        id: 's2',
        started_at: '2026-09-08T03:00:00.000Z',
        actual_duration_minutes: 60,
        work_mode: 'predefined',
        work_mode_confidence: 'explicit'
      }
    ];
    const audit = threefoldWorkAudit(sessions, {
      start: '2026-09-07',
      end: '2026-09-09'
    });
    assert.equal(audit.classified_sessions, 2);
    assert.equal(audit.sparse, true);
  });
});
