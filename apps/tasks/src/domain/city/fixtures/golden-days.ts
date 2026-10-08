/**
 * Life City golden days. Made-up records only, never Adam's real data.
 * Times are UTC instants; the comments give Sydney time (AEDT, UTC+11, in October 2026).
 */
import { GoalSchema, type Goal } from '@/schemas/goal';
import { ProjectSchema, type Project } from '@/schemas/project';
import { TaskSchema, type Task } from '@/schemas/task';
import { WorkSessionSchema, type WorkSession } from '@/schemas/work-session';
import type { CityInput } from '@/domain/city/types';

const CREATED = '2026-08-01T00:00:00.000Z';

/** A finished task was last touched when it was finished, as in real records. */
export function task(fields: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return TaskSchema.parse({
    schema_version: 1,
    domain: 'teaching',
    created_at: CREATED,
    updated_at: fields.completed_at ?? fields.created_at ?? CREATED,
    life_wall: null,
    ...fields
  });
}

export function project(fields: Partial<Project> & Pick<Project, 'id' | 'title'>): Project {
  return ProjectSchema.parse({
    schema_version: 1,
    slug: fields.id,
    created_at: CREATED,
    updated_at: CREATED,
    ...fields
  });
}

export function goal(fields: Partial<Goal> & Pick<Goal, 'id' | 'title'>): Goal {
  return GoalSchema.parse({ schema_version: 1, created_at: CREATED, updated_at: CREATED, ...fields });
}

export function session(fields: Partial<WorkSession> & Pick<WorkSession, 'id' | 'started_at'>): WorkSession {
  return WorkSessionSchema.parse({ schema_version: 1, created_at: fields.started_at, updated_at: fields.started_at, ...fields });
}

export const TERMS = [{ term: 4, starts_on: '2026-10-06', ends_on: '2026-12-18' }];

export function emptyInput(): CityInput {
  return {
    tasks: [],
    projects: [],
    goals: [],
    workSessions: [],
    sky: { state: null },
    schoolTerms: TERMS,
    appointments: [],
    mealWindow: null,
    pendingDecisions: []
  };
}

export type GoldenDay = {
  name: string;
  now: Date;
  lastVisitAt: string | null;
  input: CityInput;
};

/**
 * Sunday 16:30 (P2's story). Adam has just ticked "Mark set A" on the Year 10 marking
 * route. Clare is waiting on one decision, with a second queued behind it.
 */
export function sundayAfternoon(): GoldenDay {
  return {
    name: 'Sunday 16:30',
    now: new Date('2026-10-11T05:30:00.000Z'), // Sun 11 Oct, 16:30
    lastVisitAt: '2026-10-11T04:00:00.000Z', // 15:00
    input: {
      ...emptyInput(),
      sky: { state: 8 },
      goals: [goal({ id: 'g_results', title: 'Strong Year 10 results', sphere: 'work' })],
      projects: [
        project({
          id: 'p_marking',
          title: 'Year 10 marking',
          parent_goal_id: 'g_results',
          created_at: '2026-09-01T00:00:00.000Z',
          current_end_date: '2026-10-20'
        })
      ],
      tasks: [
        task({ id: 'm1', title: 'Collect scripts', parent_project_id: 'p_marking', step_order: 0, status: 'done', completed_at: '2026-10-05T03:00:00.000Z' }),
        task({ id: 'm2', title: 'Mark set A', parent_project_id: 'p_marking', step_order: 1, status: 'done', completed_at: '2026-10-11T05:20:00.000Z' }),
        task({ id: 'm3', title: 'Mark set B', parent_project_id: 'p_marking', step_order: 2, due_date: '2026-10-13' }),
        task({ id: 'm4', title: 'Enter results', parent_project_id: 'p_marking', step_order: 3, due_date: '2026-10-16', depends_on: ['m3'] })
      ],
      workSessions: [
        session({ id: 's1', project_id: 'p_marking', started_at: '2026-10-11T04:30:00.000Z' }),
        session({ id: 's2', project_id: 'p_marking', started_at: '2026-10-10T01:00:00.000Z' })
      ],
      pendingDecisions: [
        { id: 'd1', owner: 'Clare', reason: 'Move "Enter results" to Friday?', href: '#/clare', created_at: '2026-10-11T03:00:00.000Z' },
        { id: 'd2', owner: 'Clare', reason: 'Add a marking block on Tuesday?', href: '#/clare', created_at: '2026-10-11T03:30:00.000Z' }
      ]
    }
  };
}

/**
 * A suspended service. A wedding is a life wall on 14 to 16 October. The Term report
 * route has a stop due inside it, so that route does not run on those days. The Garden
 * route does not, so it runs as normal. Stop order never changes.
 */
export function suspendedService(now = new Date('2026-10-15T01:00:00.000Z')): GoldenDay {
  return {
    name: 'Suspended service',
    now, // default Thu 15 Oct, 12:00, inside the wall so the suspension shows
    lastVisitAt: null,
    input: {
      ...emptyInput(),
      sky: { state: 13 },
      projects: [
        project({ id: 'p_report', title: 'Term report' }),
        project({ id: 'p_garden', title: 'Garden beds' })
      ],
      tasks: [
        task({ id: 'wedding', title: 'Melbourne wedding', domain: 'personal', life_wall: { starts_on: '2026-10-14', ends_on: '2026-10-16', label: 'Wedding' } }),
        task({ id: 'r1', title: 'Draft comments', parent_project_id: 'p_report', step_order: 0, due_date: '2026-10-15' }),
        task({ id: 'r2', title: 'Submit reports', parent_project_id: 'p_report', step_order: 1, due_date: '2026-10-20' }),
        task({ id: 'gb1', title: 'Buy soil', domain: 'personal', parent_project_id: 'p_garden', due_date: '2026-10-25' })
      ]
    }
  };
}

/**
 * Deleted yesterday. A task finished last week was deleted yesterday, a project was
 * removed, and a dream sits in the Someday jar. None may appear anywhere.
 */
export function deletedYesterday(): GoldenDay {
  return {
    name: 'Deleted yesterday',
    now: new Date('2026-10-12T02:00:00.000Z'), // Mon 12 Oct, 13:00
    lastVisitAt: '2026-10-01T00:00:00.000Z',
    input: {
      ...emptyInput(),
      sky: { state: 1 },
      projects: [
        project({ id: 'p_alpha', title: 'Unit plan' }),
        project({ id: 'p_gone', title: 'Old club', status: 'archived_dead', created_at: '2026-10-05T00:00:00.000Z' })
      ],
      tasks: [
        task({
          id: 'a1',
          title: 'Draft outline',
          parent_project_id: 'p_alpha',
          step_order: 0,
          status: 'dead',
          created_at: '2026-10-02T00:00:00.000Z',
          completed_at: '2026-10-06T00:00:00.000Z',
          updated_at: '2026-10-11T00:00:00.000Z'
        }),
        task({ id: 'a2', title: 'Write lessons', parent_project_id: 'p_alpha', step_order: 1 }),
        task({ id: 'gone1', title: 'Club notice', parent_project_id: 'p_gone', created_at: '2026-10-05T00:00:00.000Z' }),
        task({
          id: 'dream',
          title: 'Sail the Whitsundays',
          domain: 'personal',
          bucket: 'someday',
          someday_kind: 'dreams_jar',
          created_at: '2026-10-03T00:00:00.000Z'
        })
      ]
    }
  };
}

/** No check-in this morning. The forecast has no evidence, so the sky says so. */
export function noCheckInMorning(): GoldenDay {
  return {
    name: 'No check-in morning',
    now: new Date('2026-10-12T00:30:00.000Z'), // Mon 12 Oct, 11:30
    lastVisitAt: '2026-10-11T22:00:00.000Z',
    input: {
      ...emptyInput(),
      sky: { state: null },
      projects: [project({ id: 'p_run', title: 'Half marathon base', created_at: '2026-09-01T00:00:00.000Z' })],
      tasks: [task({ id: 'run1', title: 'Long run', domain: 'fitness', parent_project_id: 'p_run', due_date: '2026-10-18' })]
    }
  };
}

export const GOLDEN_DAYS = [sundayAfternoon, suspendedService, deletedYesterday, noCheckInMorning];
