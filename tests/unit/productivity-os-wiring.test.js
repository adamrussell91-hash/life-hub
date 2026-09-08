/**
 * Productivity OS continuation — multi-block, teaching lessons, Hammond ctx,
 * stale confirm, focus session propose.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeDaySchedule,
  lessonToBusySpan,
  detectStaleScheduleCollisions,
  buildAuthoritativeHardBusy
} from '../../netlify/functions/_shared/productivity-os.mjs';
import { executeHammondProductivity } from '../../netlify/functions/_shared/hammond-productivity.mjs';
import { executeClareWork, planWork } from '../../netlify/functions/_shared/clare-work.mjs';
import { validateProposeActionInput } from '../../netlify/functions/_shared/capabilities/propose-action.mjs';

describe('H: multi work blocks same task_id', () => {
  it('splits remaining minutes across multiple blocks with one task_id', () => {
    const result = composeDaySchedule({
      date: '2026-09-08',
      workday: { start: '08:00', end: '12:00', source: 'profile' },
      lessons: [
        { start: 9 * 60, end: 10 * 60, title: 'Period 1', kind: 'lesson' },
        { start: 10 * 60 + 45, end: 11 * 60 + 45, title: 'Period 2', kind: 'lesson' }
      ],
      tasks: [{ id: 'essay', title: 'Essay', estimated_duration: 90, depth: 'shallow' }]
    });
    assert.ok(result.proposed.length >= 2);
    assert.ok(result.proposed.every((b) => b.task_id === 'essay'));
    assert.equal(
      result.proposed.reduce((s, b) => s + b.duration_minutes, 0),
      90
    );
  });
});

describe('I: teaching lesson shape blocks schedule', () => {
  it('converts date+start_time lessons without duration_minutes into hard busy', () => {
    const span = lessonToBusySpan({
      title: 'Year 10 English',
      date: '2026-09-08',
      start_time: '11:00'
    });
    assert.deepEqual(span, {
      start: 11 * 60,
      end: 12 * 60,
      title: 'Year 10 English',
      kind: 'lesson'
    });

    const composed = planWork('compose', {
      date: '2026-09-08',
      tasks: [
        {
          id: 't1',
          title: 'Mark pack',
          estimated_duration: 45,
          status: 'open',
          due_date: '2026-09-08'
        }
      ],
      lessons: [
        {
          id: 'sl1',
          title: 'Year 10 English',
          date: '2026-09-08',
          start_time: '09:00'
          // no duration_minutes / start_minutes
        }
      ],
      workday: { start: '08:00', end: '12:00', source: 'test' }
    });
    assert.equal(composed.ok, true);
    for (const block of composed.proposed) {
      const start =
        Number(block.start_time.slice(0, 2)) * 60 + Number(block.start_time.slice(3));
      const end = start + block.duration_minutes;
      assert.equal(start >= 9 * 60 && start < 10 * 60, false);
      assert.equal(end > 9 * 60 && end <= 10 * 60, false);
    }
  });
});

describe('J: stale confirm detects new teaching collision', () => {
  it('flags proposed work blocks that collide with authoritative lessons', () => {
    const hardBusy = buildAuthoritativeHardBusy({
      date: '2026-09-08',
      lessons: [{ title: 'New lesson', date: '2026-09-08', start_time: '10:00' }],
      workBlocks: [],
      planningProfile: null
    });
    const check = detectStaleScheduleCollisions({
      proposedBlocks: [
        {
          temp_id: 'wb1',
          task_id: 't1',
          title: 'Mark',
          date: '2026-09-08',
          start_time: '10:00',
          duration_minutes: 45,
          depth: 'shallow',
          selected: true
        }
      ],
      hardBusy
    });
    assert.equal(check.ok, false);
    assert.equal(check.error, 'stale_schedule_collision');
    assert.match(check.conflicts[0].reason, /Collides/);
  });
});

describe('O/P/Q: Hammond tools prefer stored ctx over model arrays', () => {
  it('O: horizons uses ctx direction/areas/goals and ignores model arrays', () => {
    const result = executeHammondProductivity(
      'horizons_chain',
      {
        purpose: 'MODEL PURPOSE SHOULD LOSE',
        vision: 'MODEL VISION SHOULD LOSE',
        principles: ['model'],
        areas: [{ id: 'fake', title: 'Fake area' }],
        goals: [{ id: 'fake', title: 'Fake goal', parent_area_id: 'fake', status: 'active' }],
        focus_type: 'project',
        focus_id: 'p1'
      },
      {
        planning_direction: {
          purpose: 'Teach well',
          principles: ['Depth'],
          vision: 'Calm week'
        },
        areas: [
          {
            id: 'a1',
            title: 'Teaching',
            description: '',
            tags: [],
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z'
          }
        ],
        goals: [
          {
            id: 'g1',
            title: 'Term outcomes',
            parent_area_id: 'a1',
            status: 'active',
            description: '',
            tags: [],
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z'
          }
        ],
        projects: [
          { id: 'p1', title: 'Unit', status: 'active', parent_goal_id: 'g1' }
        ],
        tasks: [{ id: 't1', title: 'Outline', parent_project_id: 'p1', status: 'open' }]
      }
    );
    assert.equal(result.ok, true);
    assert.equal(result.purpose, 'Teach well');
    assert.equal(result.vision, 'Calm week');
    assert.equal(result.area?.title, 'Teaching');
  });

  it('P: threefold_audit uses ctx sessions and ignores model sessions', () => {
    const result = executeHammondProductivity(
      'threefold_audit',
      {
        period_start: '2026-09-07',
        period_end: '2026-09-09',
        sessions: [
          {
            id: 'bogus',
            started_at: '2026-09-08T01:00:00.000Z',
            actual_duration_minutes: 999,
            work_mode: 'defining',
            work_mode_confidence: 'explicit'
          }
        ]
      },
      {
        sessions: [
          {
            id: 's1',
            started_at: '2026-09-08T01:00:00.000Z',
            actual_duration_minutes: 40,
            work_mode: 'reactive',
            work_mode_confidence: 'inferred'
          }
        ]
      }
    );
    assert.equal(result.ok, true);
    assert.equal(result.classified_sessions, 1);
    assert.equal(result.sessions[0].id, 's1');
  });

  it('Q: portfolio_meter uses ctx planning_profile active_project_limit', () => {
    const result = executeHammondProductivity(
      'portfolio_meter',
      { active_project_limit: 99 },
      {
        projects: [
          { id: 'p1', title: 'A', status: 'active' },
          { id: 'p2', title: 'B', status: 'active' }
        ],
        planning_profile: { active_project_limit: 1 }
      }
    );
    assert.equal(result.ok, true);
    assert.equal(result.meter.status, 'over');
    assert.equal(result.meter.limit, 1);
  });
});

describe('G: focus block session persistence via propose', () => {
  it('start/finish return propose writes for work_session', async () => {
    const created = await executeClareWork(
      'focus_block',
      {
        action: 'create',
        outcome: 'Draft intro',
        task_id: 't1',
        depth: 'deep',
        planned_duration_minutes: 50
      },
      { now: new Date('2026-09-08T01:00:00.000Z') }
    );
    assert.equal(created.ok, true);
    const started = await executeClareWork(
      'focus_block',
      { action: 'start', state: created.state },
      { now: new Date('2026-09-08T01:00:00.000Z') }
    );
    assert.equal(started.kind, 'propose');
    assert.ok(started.session_id);
    assert.match(started.proposal.writes[0].path, /^tasks:work_session:/);
    const validated = validateProposeActionInput(started.proposal, { agentSlug: 'clare' });
    assert.equal(validated.ok, true);

    const finished = await executeClareWork(
      'focus_block',
      {
        action: 'finish',
        state: started.state,
        session_id: started.session_id,
        result: 'done'
      },
      { now: new Date('2026-09-08T01:40:00.000Z') }
    );
    assert.equal(finished.kind, 'propose');
    assert.equal(finished.proposal.writes[0].mode, 'append');
    const body = JSON.parse(finished.proposal.writes[0].content);
    assert.equal(body.result, 'done');
    assert.equal(body.actual_duration_minutes, 40);
  });
});
