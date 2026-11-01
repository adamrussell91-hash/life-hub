import { describe, expect, it } from 'vitest';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import {
  RUNWAY_SPAN_DAYS,
  buildRunway,
  buildRunwayRow,
  dayAtX,
  dayOffset,
  finishDateChoices,
  horizonPhrase,
  keyAtOffset,
  ledeText,
  monthTicks,
  recommendTool,
  runwayGeometry,
  runwayGroup,
  runwayLede,
  scrubState,
  sessionsForProject,
  spanPct,
  workWindowMinutes,
  type RunwayInput
} from '@/domain/projects-runway';

const NOW = new Date(2026, 9, 5, 9, 0, 0); // Mon 5 Oct 2026, local

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
    job: 'teaching',
    milestones: [],
    status: 'active',
    baseline_end_date: null,
    current_end_date: null,
    review_summary: null,
    stall_flagged_at: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-04T00:00:00.000Z',
    competition_or_event_type: null,
    key_dates: null,
    student_group_reference: null,
    generated_admin_tasks: [],
    drafted_documents: null,
    ...partial
  } as Project;
}

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    schema_version: 1,
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: null,
    actual_duration: null,
    due_date: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-04T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    blocked_since: null,
    priority: 'medium',
    parent_project_id: null,
    parent_task_id: null,
    depends_on: [],
    tags: [],
    recurrence_rule: null,
    due_time: null,
    remind_at: null,
    remind_dismissed_at: null,
    attachments: [],
    source: 'manual',
    ...partial
  } as Task;
}

const key = (days: number) => keyAtOffset(NOW, days);

const fixtures = {
  garden: project({ id: 'p_garden', title: 'Garden beds', current_end_date: key(10) }),
  robotics: project({ id: 'p_robot', title: 'Robotics club', current_end_date: key(60) }),
  undated: project({ id: 'p_undated', title: 'Book swap' }),
  quiet: project({ id: 'p_quiet', title: 'Archive scans', status: 'stalled', stall_flagged_at: '2026-09-01', updated_at: '2026-08-01T00:00:00.000Z', created_at: '2026-07-01T00:00:00.000Z' }),
  waiting: project({ id: 'p_wait', title: 'Grant form', current_end_date: key(30) }),
  done: project({ id: 'p_done', title: 'Poster run', status: 'completed', updated_at: '2026-09-28T00:00:00.000Z' }),
  oldDone: project({ id: 'p_old', title: 'Old fair', status: 'completed', updated_at: '2026-06-01T00:00:00.000Z' })
};

const tasks: Task[] = [
  task({ id: 't_g1', title: 'Buy soil', parent_project_id: 'p_garden', status: 'done', estimated_duration: 30, step_order: 0 }),
  task({ id: 't_g2', title: 'Build frames', parent_project_id: 'p_garden', estimated_duration: 240, step_order: 1 }),
  task({ id: 't_r1', title: 'Order kits', parent_project_id: 'p_robot', step_order: 0 }),
  task({ id: 't_u1', title: 'Pick a shelf', parent_project_id: 'p_undated' }),
  task({ id: 't_q1', title: 'Scan box one', parent_project_id: 'p_quiet', updated_at: '2026-08-01T00:00:00.000Z', created_at: '2026-07-01T00:00:00.000Z' }),
  task({ id: 't_w1', title: 'Hear back on budget', parent_project_id: 'p_wait', waiting_on: 'the business office', waiting_status: 'waiting', waiting_since: '2026-09-25' } as Partial<Task> & Pick<Task, 'id' | 'title'>)
];

function input(extra: Partial<RunwayInput> = {}): RunwayInput {
  const all = Object.values(fixtures);
  return {
    projects: all.filter((p) => p.status !== 'completed'),
    archivedProjects: all.filter((p) => p.status === 'completed'),
    tasks,
    stallIds: new Set(['p_quiet']),
    now: NOW,
    profile: null,
    sessions: [],
    ...extra
  };
}

describe('runway grouping', () => {
  it('sorts projects into needs you, in the air, on the ground and landed', () => {
    const model = buildRunway(input());
    const ids = (group: string) => model.groups.find((g) => g.id === group)!.rows.map((r) => r.project.id);
    expect(ids('in_air')).toEqual(['p_garden', 'p_robot']);
    // Stalled first, then waiting, then undated healthy.
    expect(ids('on_ground')).toEqual(['p_quiet', 'p_wait', 'p_undated']);
    expect(ids('landed')).toEqual(['p_done']);
    expect(ids('needs_you')).toEqual([]);
    expect(model.stuck.map((r) => r.project.id)).toEqual(ids('on_ground'));
  });

  it('puts blocked or flagged dated projects under needs you', () => {
    expect(runwayGroup({ live: true, endKey: key(5), health: 'blocked', lifecycle: 'planning' })).toBe('needs_you');
    expect(runwayGroup({ live: true, endKey: key(5), health: 'healthy', lifecycle: 'needs_attention' })).toBe('needs_you');
    expect(runwayGroup({ live: true, endKey: key(5), health: 'healthy', lifecycle: 'on_the_go' })).toBe('in_air');
    expect(runwayGroup({ live: true, endKey: null, health: 'blocked', lifecycle: 'planning' })).toBe('on_ground');
    expect(runwayGroup({ live: true, endKey: key(5), health: 'missing_next_action', lifecycle: 'planning' })).toBe('on_ground');
    expect(runwayGroup({ live: false, endKey: null, health: 'healthy', lifecycle: 'completed' })).toBe('landed');
  });

  it('moves a project to needs you once every task is done', () => {
    const allDone = tasks.map((t) => (t.parent_project_id === 'p_garden' ? { ...t, status: 'done' as const } : t));
    const model = buildRunway(input({ tasks: allDone }));
    const row = model.rows.find((r) => r.project.id === 'p_garden')!;
    expect(row.group).toBe('needs_you');
    expect(row.needsYouReason).toMatch(/ready to close/);
  });

  it('counts running load and reads the planning-profile limit', () => {
    const model = buildRunway(input({ profile: { work_windows: undefined as never, runway_buffer_minutes: null, active_project_limit: 2 } }));
    expect(model.loadLimit).toBe(2);
    expect(model.running).toBeGreaterThan(0);
    expect(buildRunway(input()).loadLimit).toBe(3);
  });
});

describe('runway rows', () => {
  it('picks the first executable next action and builds one segment per task', () => {
    const row = buildRunwayRow(fixtures.garden, input());
    expect(row.nextAction).toEqual({ taskId: 't_g2', title: 'Build frames' });
    expect(row.segments.map((s) => [s.taskId, s.done])).toEqual([
      ['t_g1', true],
      ['t_g2', false]
    ]);
    expect([row.done, row.total]).toEqual([1, 2]);
  });

  it('only plans a runway when open tasks carry estimates', () => {
    const garden = buildRunwayRow(fixtures.garden, input());
    expect(garden.needMinutes).toBe(240);
    expect(garden.runway).not.toBeNull();
    expect(garden.startByKey).toBe(key(10 - 2)); // 240 min = two 120-minute work days
    const robotics = buildRunwayRow(fixtures.robotics, input());
    expect(robotics.needMinutes).toBeNull();
    expect(robotics.runway).toBeNull();
    expect(robotics.startByKey).toBeNull();
  });

  it('marks a project tight when free work-window time runs short', () => {
    const windows = { mon: [{ start: '16:00', end: '16:30' }], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
    const row = buildRunwayRow(fixtures.garden, input({ profile: { work_windows: windows, runway_buffer_minutes: 60, active_project_limit: null } }));
    expect(row.freeMinutes).toBe(60); // two Mondays before the finish
    expect(row.tight).toBe(true);
  });

  it('names who a waiting project is held up by', () => {
    const row = buildRunwayRow(fixtures.waiting, input());
    expect(row.health).toBe('waiting_only');
    expect(row.waiting).toEqual({ who: 'the business office', days: 10 });
    expect(row.reason).toBe('Everything left is waiting on the business office (10 days).');
  });

  it('treats a stall-window project as stalled with quiet weeks', () => {
    const row = buildRunwayRow(fixtures.quiet, input());
    expect(row.health).toBe('stalled');
    expect(row.quietWeeks).toBeGreaterThanOrEqual(9);
    expect(row.reason).toMatch(/^No movement for \d+ weeks\.$/);
  });

  it('places milestones, gates and review markers on the axis', () => {
    const gated = project({
      id: 'p_gate',
      title: 'Science night',
      current_end_date: key(40),
      milestones: [
        { id: 'm1', project_id: 'p_gate', title: 'Venue booked', due_date: key(20), status: 'open', depends_on: ['t_dep'] },
        { id: 'm2', project_id: 'p_gate', title: 'Too far', due_date: key(RUNWAY_SPAN_DAYS + 5), status: 'open' }
      ]
    });
    const extra = [
      task({ id: 't_dep', title: 'Call the venue', parent_project_id: 'p_gate', due_date: key(12) }),
      task({ id: 't_other', title: 'Plan stations', parent_project_id: 'p_gate' })
    ];
    const row = buildRunwayRow(gated, input({
      tasks: [...tasks, ...extra],
      sessions: [{ tool: 'decision_maker', id: 's1', title: 'Which night?', phase: 'explore', links: [{ kind: 'project', id: 'p_gate' }], reviewDue: key(15) }]
    }));
    expect(row.milestones).toEqual([{ day: 20, title: 'Venue booked', dateKey: key(20), done: false }]);
    expect(row.gates).toEqual([{ day: 12, title: 'Call the venue', dateKey: key(12) }]);
    expect(row.reviews).toEqual([{ day: 15, title: 'Which night?', dateKey: key(15), tool: 'decision_maker', href: '#/decision-maker?id=s1' }]);
    expect(row.sessions[0]?.phaseLabel).toBe('Explore');
  });
});

describe('thinking tools', () => {
  it('recommends a tool from health', () => {
    expect(recommendTool({ live: true, health: 'stalled', waiting: null, idleDays: 49 })?.tool).toBe('problem_solver');
    expect(recommendTool({ live: true, health: 'stalled', waiting: null, idleDays: 49 })?.why).toMatch(/^Seven weeks/);
    expect(recommendTool({ live: true, health: 'waiting_only', waiting: { who: 'the office', days: 3 }, idleDays: 0 })).toMatchObject({
      tool: 'communication_book',
      why: expect.stringContaining('the office')
    });
    expect(recommendTool({ live: true, health: 'blocked', waiting: null, idleDays: 0 })?.tool).toBe('communication_book');
    expect(recommendTool({ live: true, health: 'missing_next_action', waiting: null, idleDays: 0 })?.tool).toBe('gear_shifter');
    expect(recommendTool({ live: true, health: 'healthy', waiting: null, idleDays: 0 })).toBeNull();
    expect(recommendTool({ live: false, health: 'stalled', waiting: null, idleDays: 90 })).toBeNull();
  });

  it('matches sessions by project link and skips archived ones', () => {
    const list = sessionsForProject(
      [
        { tool: 'communication_book', id: 'a', title: 'Ask', phase: 'plan', links: [{ kind: 'project', id: 'p1' }] },
        { tool: 'problem_solver', id: 'b', title: 'Why', phase: 'define', links: [{ kind: 'project', id: 'p1' }] },
        { tool: 'gear_shifter', id: 'c', title: 'Gone', phase: 'start', status: 'archived', links: [{ kind: 'project', id: 'p1' }] },
        { tool: 'rules_book', id: 'd', title: 'Other', phase: 'frame', links: [{ kind: 'task', id: 'p1' }] }
      ],
      'p1'
    );
    expect(list.map((s) => s.id)).toEqual(['b', 'a']);
    expect(list[0]?.href).toBe('#/problem-solver?id=b');
  });
});

describe('runway lede', () => {
  it('says what lands, who needs you, what is tight and what is stuck', () => {
    const text = ledeText(runwayLede(buildRunway(input()), 0, NOW));
    expect(text).toBe('Garden beds lands in the next three weeks. Three are stuck on the ground.');
  });

  it('marks project names for the highlight', () => {
    const segments = runwayLede(buildRunway(input()), 0, NOW);
    expect(segments[0]).toEqual({ text: 'Garden beds', kind: 'name', projectId: 'p_garden' });
    expect(segments.at(-1)?.kind).toBe('warn');
  });

  it('adds needs-you reasons and tight projects', () => {
    const allDone = tasks.map((t) => (t.parent_project_id === 'p_garden' ? { ...t, status: 'done' as const } : t));
    const windows = { mon: [{ start: '16:00', end: '16:30' }], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
    const tightTasks = [...allDone, task({ id: 't_r2', title: 'Wire motors', parent_project_id: 'p_robot', estimated_duration: 600 })];
    const text = ledeText(
      runwayLede(buildRunway(input({ tasks: tightTasks, profile: { work_windows: windows, runway_buffer_minutes: null, active_project_limit: null } })), 0, NOW)
    );
    expect(text).toContain('Garden beds is ready to close.');
    expect(text).toContain('Robotics club is tight on free time.');
  });

  it('looks ahead when scrubbed', () => {
    const text = ledeText(runwayLede(buildRunway(input()), 20, NOW, (k) => `[${k}]`));
    expect(text).toBe(`Looking ahead to [${key(20)}]. By then Garden beds should have landed, with 1 task still open. Three still haven’t left the ground.`);
  });

  it('handles an empty portfolio', () => {
    const text = ledeText(runwayLede(buildRunway(input({ projects: [], archivedProjects: [] })), 0, NOW));
    expect(text).toMatch(/No live projects yet/);
  });

  it('phrases the horizon', () => {
    expect(horizonPhrase(21)).toBe('three weeks');
    expect(horizonPhrase(7)).toBe('week');
    expect(horizonPhrase(10)).toBe('10 days');
  });
});

describe('scrubbing', () => {
  const row = { live: true, endDay: 30, startByDay: 20, done: 0 };
  it('flags a row late once the view passes its end', () => {
    expect(scrubState(row, 0)).toEqual({ late: false, shouldStart: false });
    expect(scrubState(row, 30)).toEqual({ late: true, shouldStart: false });
    expect(scrubState({ ...row, endDay: -2 }, 0).late).toBe(true);
  });
  it('flags should-start between start-by and the end when nothing is done', () => {
    expect(scrubState(row, 19).shouldStart).toBe(false);
    expect(scrubState(row, 20).shouldStart).toBe(true);
    expect(scrubState({ ...row, done: 1 }, 25).shouldStart).toBe(false);
    expect(scrubState({ ...row, startByDay: null }, 25).shouldStart).toBe(false);
  });
  it('never flags undated or landed rows', () => {
    expect(scrubState({ ...row, endDay: null }, 50)).toEqual({ late: false, shouldStart: false });
    expect(scrubState({ ...row, live: false }, 50)).toEqual({ late: false, shouldStart: false });
  });
});

describe('runway geometry', () => {
  it('maps days onto the span and back', () => {
    expect(spanPct(60)).toBe(50);
    expect(spanPct(-5)).toBe(0);
    expect(spanPct(500)).toBe(100);
    expect(dayAtX(150, 100, 200)).toBe(30);
    expect(dayAtX(0, 100, 200, 1)).toBe(1);
    expect(dayAtX(999, 100, 200)).toBe(RUNWAY_SPAN_DAYS);
    expect(dayOffset(key(12), NOW)).toBe(12);
    expect(dayOffset(null, NOW)).toBeNull();
  });

  it('draws bar, flag, buffer and start-by from the row', () => {
    const row = buildRunwayRow(fixtures.garden, input());
    const geo = runwayGeometry(row)!;
    expect(geo.barPct).toBeCloseTo((10 / RUNWAY_SPAN_DAYS) * 100);
    expect(geo.flagPct).toBe(geo.barPct);
    expect(geo.flip).toBe(false);
    expect(geo.buffer!.widthPct).toBeCloseTo((1 / RUNWAY_SPAN_DAYS) * 100);
    expect(geo.startByPct).toBeCloseTo((8 / RUNWAY_SPAN_DAYS) * 100);
  });

  it('flips the flag label near the right edge and pins ends beyond the axis', () => {
    const far = runwayGeometry({ endDay: 200, bufferDays: 0, startByDay: null, runway: null })!;
    expect(far.flagPct).toBe(100);
    expect(far.flip).toBe(true);
    expect(far.beyond).toBe(true);
    expect(far.buffer).toBeNull();
    expect(far.startByPct).toBeNull();
    expect(runwayGeometry({ endDay: null, bufferDays: 0, startByDay: null, runway: null })).toBeNull();
  });

  it('ticks month starts inside the span', () => {
    const ticks = monthTicks(NOW);
    expect(ticks[0]).toEqual({ day: 27, label: 'Nov' });
    expect(ticks.every((t) => t.day >= 0 && t.day <= RUNWAY_SPAN_DAYS)).toBe(true);
  });
});

describe('free time and finish dates', () => {
  it('sums work windows up to the end day, or says unknown', () => {
    const windows = { mon: [{ start: '09:00', end: '10:30' }], tue: [], wed: [{ start: '13:00', end: '14:00' }], thu: [], fri: [], sat: [], sun: [] };
    expect(workWindowMinutes(windows, NOW, key(7))).toBe(150);
    expect(workWindowMinutes(windows, NOW, key(0))).toBe(0);
    const empty = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
    expect(workWindowMinutes(empty, NOW, key(7))).toBeNull();
    expect(workWindowMinutes(null, NOW, key(7))).toBeNull();
  });

  it('offers end of this term and next term, else two and six weeks', () => {
    const terms = [
      { term: 3 as const, starts_on: '2026-07-20', ends_on: '2026-09-25' },
      { term: 4 as const, starts_on: '2026-10-12', ends_on: '2026-12-18' },
      { term: 1 as const, starts_on: '2027-02-01', ends_on: '2027-04-09' }
    ];
    expect(finishDateChoices(terms, NOW)).toEqual([
      { label: 'End of this term', key: '2026-12-18' },
      { label: 'End of next term', key: '2027-04-09' }
    ]);
    expect(finishDateChoices([], NOW)).toEqual([
      { label: 'In two weeks', key: key(14) },
      { label: 'In six weeks', key: key(42) }
    ]);
  });
});

describe('ready to close', () => {
  it('needs you even when the quiet window marks it stalled', () => {
    const allDone = tasks.map((t) => (t.parent_project_id === 'p_quiet' ? { ...t, status: 'done' as const } : t));
    const quietDated = { ...fixtures.quiet, status: 'active' as const, stall_flagged_at: null, current_end_date: key(-30) };
    const row = buildRunwayRow(quietDated, input({ tasks: allDone }));
    expect(row.readyToClose).toBe(true);
    expect(row.group).toBe('needs_you');
    expect(row.recommendation).toBeNull();
    expect(row.needsYouReason).toMatch(/ready to close/);
  });
});
