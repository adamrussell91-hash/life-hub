import { describe, expect, it } from 'vitest';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import {
  STALE_MS,
  SUPER_STALE_MS,
  ageLabel,
  ageTier,
  backlogView,
  detectSuggestions,
  effortOf,
  formatShortWeekday,
  hasVagueDatePhrase,
  initialTriageState,
  isSnoozed,
  lastTriageUndo,
  nextWeekDate,
  nextWeekdayOnOrAfter,
  parseQuickAdd,
  scheduleTargets,
  snapshotFields,
  vagueDateHint,
  thisWeekDate,
  triageQueue,
  triageReducer
} from '@/domain/backlog';

const now = new Date('2026-09-22T10:00:00');

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
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-20T00:00:00.000Z',
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
    ...partial
  };
}

describe('effortOf', () => {
  it('treats estimated_duration as minutes', () => {
    expect(effortOf(task({ id: 'a', title: 'A', estimated_duration: null }))).toBeNull();
    expect(effortOf(task({ id: 'b', title: 'B', estimated_duration: 0 }))).toBe('quick');
    expect(effortOf(task({ id: 'c', title: 'C', estimated_duration: 15 }))).toBe('quick');
    expect(effortOf(task({ id: 'd', title: 'D', estimated_duration: 16 }))).toBe('hour');
    expect(effortOf(task({ id: 'e', title: 'E', estimated_duration: 60 }))).toBe('hour');
    expect(effortOf(task({ id: 'f', title: 'F', estimated_duration: 61 }))).toBe('big');
  });
});

describe('ageTier and stale threshold', () => {
  it('uses 7-day and 30-day boundaries', () => {
    const justUnder7 = task({
      id: 'a',
      title: 'A',
      updated_at: new Date(now.getTime() - STALE_MS / 30 * 7 + 1).toISOString()
    });
    const at7 = task({
      id: 'b',
      title: 'B',
      updated_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    });
    const at29 = task({
      id: 'c',
      title: 'C',
      updated_at: new Date(now.getTime() - STALE_MS + 24 * 60 * 60 * 1000).toISOString()
    });
    const at30 = task({
      id: 'd',
      title: 'D',
      updated_at: new Date(now.getTime() - STALE_MS).toISOString()
    });
    expect(ageTier(justUnder7, now)).toBe('fresh');
    expect(ageTier(at7, now)).toBe('settling');
    expect(ageTier(at29, now)).toBe('settling');
    expect(ageTier(at30, now)).toBe('old');
  });

  it('formats age as days then weeks', () => {
    expect(ageLabel(task({ id: 'a', title: 'A', updated_at: now.toISOString() }), now)).toBe('0d');
    expect(
      ageLabel(
        task({ id: 'b', title: 'B', updated_at: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString() }),
        now
      )
    ).toBe('8d');
    expect(
      ageLabel(
        task({ id: 'c', title: 'C', updated_at: new Date(now.getTime() - 42 * 24 * 60 * 60 * 1000).toISOString() }),
        now
      )
    ).toBe('6w');
  });
});

describe('backlogView', () => {
  const mindworks = project({ id: 'proj_mw', title: 'Mindworks' });

  it('starts from backlogTasks and excludes dated, done, and someday items', () => {
    const view = backlogView(
      [
        task({ id: 'open', title: 'Open' }),
        task({ id: 'dated', title: 'Dated', due_date: '2026-09-22' }),
        task({ id: 'done', title: 'Done', status: 'done' }),
        task({ id: 'dead', title: 'Dead', status: 'dead' }),
        task({ id: 'dream', title: 'Dream', bucket: 'someday' })
      ],
      [],
      now
    );
    expect(view.total).toBe(1);
    expect(view.fresh[0]?.rows.map((row) => row.task.id)).toEqual(['open']);
  });

  it('excludes future review_at as snoozed and reports the count', () => {
    const view = backlogView(
      [
        task({ id: 'fresh', title: 'Fresh' }),
        task({ id: 'later', title: 'Later', review_at: '2026-09-25' }),
        task({ id: 'due', title: 'Due review', review_at: '2026-09-21' })
      ],
      [],
      now
    );
    expect(view.snoozedCount).toBe(1);
    expect(view.snoozed.map((row) => row.task.id)).toEqual(['later']);
    expect(view.fresh.flatMap((group) => group.rows.map((row) => row.task.id)).sort()).toEqual(['due', 'fresh']);
  });

  it('splits stale at the 30-day threshold inclusive', () => {
    const stale = task({
      id: 'stale',
      title: 'Stale',
      updated_at: new Date(now.getTime() - STALE_MS).toISOString()
    });
    const fresh = task({
      id: 'fresh',
      title: 'Fresh',
      updated_at: new Date(now.getTime() - STALE_MS + 1).toISOString()
    });
    const view = backlogView([stale, fresh], [], now);
    expect(view.stale.map((row) => row.task.id)).toEqual(['stale']);
    expect(view.fresh.flatMap((group) => group.rows.map((row) => row.task.id))).toEqual(['fresh']);
  });

  it('groups by hub then project, with a No project bucket', () => {
    const view = backlogView(
      [
        task({ id: 'a', title: 'A', domain: 'life', parent_project_id: 'proj_mw' }),
        task({ id: 'b', title: 'B', domain: 'life' }),
        task({ id: 'c', title: 'C', domain: 'teaching' })
      ],
      [mindworks],
      now
    );
    expect(view.fresh.map((group) => `${group.domain}:${group.projectTitle}`)).toEqual([
      'teaching:No project',
      'life:Mindworks',
      'life:No project'
    ]);
  });

  it('sorts oldest first by default and supports newest, effort, and title', () => {
    const older = task({
      id: 'old',
      title: 'Zebra',
      updated_at: '2026-09-01T00:00:00.000Z',
      estimated_duration: 90
    });
    const newer = task({
      id: 'new',
      title: 'Alpha',
      updated_at: '2026-09-21T00:00:00.000Z',
      estimated_duration: 10
    });
    const ids = (sort: 'oldest' | 'newest' | 'effort' | 'title') =>
      backlogView([older, newer], [], now, { sort }).fresh[0]!.rows.map((row) => row.task.id);

    expect(ids('oldest')).toEqual(['old', 'new']);
    expect(ids('newest')).toEqual(['new', 'old']);
    expect(ids('effort')).toEqual(['new', 'old']);
    expect(ids('title')).toEqual(['new', 'old']);
  });

  it('does not treat in-progress dated work as backlog', () => {
    const view = backlogView(
      [task({ id: 'doing', title: 'Doing', status: 'in_progress', due_date: null })],
      [],
      now
    );
    expect(view.total).toBe(0);
  });
});

describe('scheduleTargets', () => {
  it('uses Friday of the current week on a Tuesday', () => {
    const tuesday = new Date(2026, 8, 22, 10);
    const targets = scheduleTargets(tuesday, [
      task({ id: 'a', title: 'Today', due_date: '2026-09-22' }),
      task({ id: 'b', title: 'Fri', due_date: '2026-09-25' })
    ]);
    expect(targets.map((item) => [item.id, item.dateKey, item.count])).toEqual([
      ['today', '2026-09-22', 1],
      ['tomorrow', '2026-09-23', 0],
      ['this_week', '2026-09-25', 1],
      ['next_week', '2026-09-28', 0]
    ]);
  });

  it('uses Friday when today is Friday', () => {
    const friday = new Date(2026, 8, 25, 9);
    const targets = scheduleTargets(friday);
    expect(targets.find((item) => item.id === 'this_week')?.dateKey).toBe('2026-09-25');
    expect(targets.find((item) => item.id === 'next_week')?.dateKey).toBe('2026-09-28');
  });

  it('uses the following Monday on Saturday and does not collide with next week', () => {
    const saturday = new Date(2026, 8, 26, 11);
    expect(thisWeekDate(saturday).toDateString()).toBe(new Date(2026, 8, 28).toDateString());
    expect(nextWeekDate(saturday).toDateString()).toBe(new Date(2026, 9, 5).toDateString());
    const targets = scheduleTargets(saturday);
    expect(targets.find((item) => item.id === 'this_week')?.dateKey).toBe('2026-09-28');
    expect(targets.find((item) => item.id === 'next_week')?.dateKey).toBe('2026-10-05');
  });

  it('uses the following Monday on Sunday', () => {
    const sunday = new Date(2026, 8, 27, 16);
    const targets = scheduleTargets(sunday);
    expect(targets.find((item) => item.id === 'today')?.dateKey).toBe('2026-09-27');
    expect(targets.find((item) => item.id === 'this_week')?.dateKey).toBe('2026-09-28');
    expect(targets.find((item) => item.id === 'next_week')?.dateKey).toBe('2026-10-05');
  });

  it('crosses a month boundary for next week', () => {
    const friday = new Date(2026, 4, 29, 8);
    const targets = scheduleTargets(friday);
    expect(targets.find((item) => item.id === 'this_week')?.dateKey).toBe('2026-05-29');
    expect(targets.find((item) => item.id === 'next_week')?.dateKey).toBe('2026-06-01');
  });
});

describe('parseQuickAdd', () => {
  it('keeps unmatched tokens in the title and reads mixed tokens', () => {
    const parsed = parseQuickAdd('email Simone re room fri #teaching 15m #followup', now);
    expect(parsed.title).toBe('email Simone re room');
    expect(parsed.domain).toBe('teaching');
    expect(parsed.due_date).toBe('2026-09-25');
    expect(parsed.effort).toBe('quick');
    expect(parsed.estimated_duration).toBe(15);
    expect(parsed.tags).toEqual(['followup']);
  });

  it('understands today, tomorrow, next week, 1h, and d/m', () => {
    expect(parseQuickAdd('buy milk today', now).due_date).toBe('2026-09-22');
    expect(parseQuickAdd('buy milk tomorrow', now).due_date).toBe('2026-09-23');
    expect(parseQuickAdd('plan next week', now).due_date).toBe('2026-09-28');
    expect(parseQuickAdd('essay 1h #life', now)).toMatchObject({
      title: 'essay',
      effort: 'hour',
      estimated_duration: 60,
      domain: 'life'
    });
    expect(parseQuickAdd('pay 25/9', now).due_date).toBe('2026-09-25');
    expect(parseQuickAdd('pay 1/1', now).due_date).toBe('2027-01-01');
  });

  it('leaves a bare title alone', () => {
    expect(parseQuickAdd('Just a thought', now)).toEqual({
      title: 'Just a thought',
      domain: undefined,
      due_date: undefined,
      effort: undefined,
      estimated_duration: undefined,
      tags: []
    });
  });
});

describe('detectSuggestions', () => {
  it('flags vague dates and skips daylight / project-name false positives', () => {
    const fridayClub = project({ id: 'proj_fc', title: 'Friday Club' });
    const suggestions = detectSuggestions(
      [
        task({ id: 'vague', title: 'Call Sam tomorrow' }),
        task({ id: 'daylight', title: 'Daylight saving' }),
        task({ id: 'club', title: 'Friday Club' }),
        task({ id: 'dated', title: 'See them on Friday', due_date: '2026-09-25' })
      ],
      [fridayClub],
      now
    );
    const vague = suggestions.filter((item) => item.kind === 'vague_date');
    expect(vague.map((item) => item.taskIds[0])).toEqual(['vague']);
    expect(hasVagueDatePhrase('Daylight saving')).toBe(false);
    expect(hasVagueDatePhrase('Friday Club')).toBe(true);
    expect(vagueDateHint('Call Sam tomorrow')).toBe('· “tomorrow” has no date');
    expect(vagueDateHint('Daylight saving')).toBeNull();
  });

  it('clusters orphans that share a domain and a close created_at or noun', () => {
    const cluster = detectSuggestions(
      [
        task({
          id: 'a',
          title: 'Fragrance research dump',
          domain: 'life',
          created_at: '2026-09-22T10:00:00.000Z'
        }),
        task({
          id: 'b',
          title: 'Fragrance bottles to sort',
          domain: 'life',
          created_at: '2026-09-22T10:10:00.000Z'
        }),
        task({
          id: 'c',
          title: 'Unrelated lesson',
          domain: 'teaching',
          created_at: '2026-09-22T10:01:00.000Z'
        })
      ],
      [],
      now
    ).filter((item) => item.kind === 'likely_cluster');
    expect(cluster).toHaveLength(1);
    expect(cluster[0]?.taskIds.sort()).toEqual(['a', 'b']);
    expect(cluster[0]?.proposedProjectTitle).toBe('Fragrance');
  });

  it('suggests archiving tasks stale for more than 60 days', () => {
    const suggestions = detectSuggestions(
      [
        task({
          id: 'old',
          title: 'Ancient',
          updated_at: new Date(now.getTime() - SUPER_STALE_MS - 1).toISOString()
        }),
        task({
          id: 'mid',
          title: 'Settling',
          updated_at: new Date(now.getTime() - STALE_MS).toISOString()
        })
      ],
      [],
      now
    ).filter((item) => item.kind === 'stale');
    expect(suggestions.map((item) => item.taskIds[0])).toEqual(['old']);
    expect(suggestions[0]?.proposedMutations[0]).toMatchObject({
      kind: 'task_update',
      patch: { status: 'dead' }
    });
  });
});

describe('triageReducer', () => {
  it('records an action and undo restores the exact prior values', () => {
    const before = { due_date: null as string | null, review_at: '2026-09-01', status: 'open' };
    let state = triageReducer(initialTriageState(), { type: 'init', queue: ['t1', 't2'] });
    state = triageReducer(state, { type: 'record', taskId: 't1', before, outcome: 'scheduled' });
    expect(state.index).toBe(1);
    expect(state.counts.scheduled).toBe(1);
    expect(lastTriageUndo(state)?.before).toEqual(before);

    state = triageReducer(state, { type: 'undo' });
    expect(state.index).toBe(0);
    expect(state.counts.scheduled).toBe(0);
    expect(state.undo).toEqual([]);
    expect(before).toEqual({ due_date: null, review_at: '2026-09-01', status: 'open' });
  });

  it('skip and undo restore the skipped slot without inventing a patch', () => {
    let state = triageReducer(initialTriageState(['a', 'b']), { type: 'skip' });
    expect(state.index).toBe(1);
    expect(state.counts.skipped).toBe(1);
    state = triageReducer(state, { type: 'undo' });
    expect(state.index).toBe(0);
    expect(state.counts.skipped).toBe(0);
    expect(lastTriageUndo(state)).toBeNull();
  });

  it('snapshotFields only captures keys that will change', () => {
    const current = task({ id: 't', title: 'Keep', due_date: null, review_at: '2026-09-01' });
    expect(snapshotFields(current, { due_date: '2026-09-22', review_at: null })).toEqual({
      due_date: null,
      review_at: '2026-09-01'
    });
  });
});

describe('helpers', () => {
  it('builds a triage queue of suggestions, then stale, then fresh oldest first', () => {
    const suggested = task({ id: 's', title: 'Call tomorrow', updated_at: '2026-09-21T00:00:00.000Z' });
    const stale = task({
      id: 'old',
      title: 'Old',
      updated_at: new Date(now.getTime() - STALE_MS).toISOString()
    });
    const olderFresh = task({ id: 'f1', title: 'F1', updated_at: '2026-09-10T00:00:00.000Z' });
    const newerFresh = task({ id: 'f2', title: 'F2', updated_at: '2026-09-18T00:00:00.000Z' });
    const view = backlogView([suggested, stale, olderFresh, newerFresh], [], now);
    const suggestions = detectSuggestions([suggested, stale, olderFresh, newerFresh], [], now);
    expect(triageQueue(view, suggestions)[0]).toBe('s');
    expect(triageQueue(view, suggestions)).toContain('old');
    const freshOrder = triageQueue(view, suggestions).filter((id) => id === 'f1' || id === 'f2');
    expect(freshOrder).toEqual(['f1', 'f2']);
  });

  it('formats short weekday labels and weekday lookup', () => {
    expect(formatShortWeekday('2026-09-25')).toBe('Fri 25 Sep');
    expect(nextWeekdayOnOrAfter(now, 5).getDate()).toBe(25);
    expect(isSnoozed(task({ id: 'a', title: 'A', review_at: '2026-09-23' }), now)).toBe(true);
    expect(isSnoozed(task({ id: 'b', title: 'B', review_at: '2026-09-21' }), now)).toBe(false);
  });
});
