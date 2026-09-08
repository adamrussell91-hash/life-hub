import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { clarifyDump, type ClarifyStack } from '@/domain/clarify';
import { listWaitingItems, type WaitingItem } from '@/domain/waiting';
import { inspectActiveProjectsHealth, type ProjectHealthResult } from '@/domain/project-health';
import { isReviewDue } from '@/domain/date-truth';
import type { ScheduleComposeResult } from '@/domain/schedule-compose';

export const WEEKLY_REVIEW_STAGES = [
  'capture',
  'past_calendar',
  'upcoming_calendar',
  'waiting',
  'projects',
  'someday',
  'build_week',
  'confirm'
] as const;

export type WeeklyReviewStage = (typeof WEEKLY_REVIEW_STAGES)[number];

export type WeeklyReviewState = {
  id: string;
  current_stage: WeeklyReviewStage;
  completed: WeeklyReviewStage[];
  capture: ClarifyStack | null;
  past_calendar_notes: string[];
  upcoming_calendar_notes: string[];
  waiting: WaitingItem[];
  project_health: ProjectHealthResult[];
  someday_due: Array<{ task_id: string; title: string; review_at: string }>;
  schedule: ScheduleComposeResult | null;
  pending_changes: Array<{ summary: string; selected: boolean }>;
  updated_at: string;
};

export function createWeeklyReview(id = `wr_${Date.now()}`): WeeklyReviewState {
  return {
    id,
    current_stage: 'capture',
    completed: [],
    capture: null,
    past_calendar_notes: [],
    upcoming_calendar_notes: [],
    waiting: [],
    project_health: [],
    someday_due: [],
    schedule: null,
    pending_changes: [],
    updated_at: new Date().toISOString()
  };
}

function advance(state: WeeklyReviewState, stage: WeeklyReviewStage): WeeklyReviewState {
  const idx = WEEKLY_REVIEW_STAGES.indexOf(stage);
  const next = WEEKLY_REVIEW_STAGES[Math.min(idx + 1, WEEKLY_REVIEW_STAGES.length - 1)]!;
  const completed = [...new Set([...state.completed, stage])];
  return {
    ...state,
    current_stage: next,
    completed,
    updated_at: new Date().toISOString()
  };
}

export function runWeeklyReviewStage(
  state: WeeklyReviewState,
  input: {
    dump_text?: string;
    past_notes?: string[];
    upcoming_notes?: string[];
    tasks?: Task[];
    projects?: Project[];
    today_key?: string;
    schedule?: ScheduleComposeResult | null;
  }
): WeeklyReviewState {
  const stage = state.current_stage;
  if (stage === 'capture') {
    const capture = clarifyDump(input.dump_text ?? '');
    return advance({ ...state, capture }, 'capture');
  }
  if (stage === 'past_calendar') {
    return advance(
      { ...state, past_calendar_notes: input.past_notes ?? state.past_calendar_notes },
      'past_calendar'
    );
  }
  if (stage === 'upcoming_calendar') {
    return advance(
      {
        ...state,
        upcoming_calendar_notes: input.upcoming_notes ?? state.upcoming_calendar_notes
      },
      'upcoming_calendar'
    );
  }
  if (stage === 'waiting') {
    const today = input.today_key ?? new Date().toISOString().slice(0, 10);
    return advance(
      { ...state, waiting: listWaitingItems(input.tasks ?? [], today) },
      'waiting'
    );
  }
  if (stage === 'projects') {
    return advance(
      {
        ...state,
        project_health: inspectActiveProjectsHealth(input.projects ?? [], input.tasks ?? [])
      },
      'projects'
    );
  }
  if (stage === 'someday') {
    const today = input.today_key ?? new Date().toISOString().slice(0, 10);
    const someday_due = (input.tasks ?? [])
      .filter((t) => t.bucket === 'someday' && isReviewDue(t, today))
      .map((t) => ({
        task_id: t.id,
        title: t.title,
        review_at: t.review_at!
      }));
    return advance({ ...state, someday_due }, 'someday');
  }
  if (stage === 'build_week') {
    return advance({ ...state, schedule: input.schedule ?? null }, 'build_week');
  }
  // confirm
  return {
    ...state,
    current_stage: 'confirm',
    completed: [...new Set([...state.completed, 'confirm' as WeeklyReviewStage])],
    pending_changes: state.pending_changes.length
      ? state.pending_changes
      : [
          ...(state.capture?.items
            .filter((i) => i.destination !== 'trash' && i.destination !== 'reference')
            .map((i) => ({
              summary: `Clarify → ${i.destination}: ${i.text.slice(0, 60)}`,
              selected: true
            })) ?? []),
          ...state.project_health
            .filter((h) => h.health === 'missing_next_action')
            .map((h) => ({
              summary: `Project ${h.project_id} needs a next action`,
              selected: true
            }))
        ],
    updated_at: new Date().toISOString()
  };
}
