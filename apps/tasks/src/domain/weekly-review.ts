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
  next_action_titles?: Record<string, string>;
  waiting_decisions?: Record<string, { action: string; follow_up_at?: string | null }>;
  someday_decisions?: Record<string, { action: string; review_at?: string | null }>;
  status?: 'in_progress' | 'awaiting_confirm' | 'complete';
  pending_changes: Array<{
    id?: string;
    kind?: string;
    summary: string;
    selected: boolean;
    confirmable?: boolean;
    project_id?: string;
    title?: string;
    task_id?: string;
    action?: string;
    follow_up_at?: string | null;
    review_at?: string | null;
    destination?: string;
  }>;
  updated_at: string;
};


export function buildWeeklyPendingChanges(state: WeeklyReviewState) {
  const nextTitles = state.next_action_titles ?? {};
  const waitingDecisions = state.waiting_decisions ?? {};
  const somedayDecisions = state.someday_decisions ?? {};
  const capture = (state.capture?.items ?? [])
    .filter((i) => i.destination !== 'trash' && i.destination !== 'reference')
    .map((i) => ({
      id: i.id,
      kind: 'capture',
      destination: i.destination,
      summary: `Clarify → ${i.destination}: ${i.text.slice(0, 60)}`,
      selected: true,
      confirmable: true
    }));
  const nextActions = (state.project_health ?? [])
    .filter((h) => h.health === 'missing_next_action')
    .map((h) => {
      const title = (nextTitles[h.project_id] ?? '').trim();
      if (!title) {
        return {
          id: `project_health:${h.project_id}`,
          kind: 'informational',
          project_id: h.project_id,
          summary: `Project ${h.project_id} needs a next action — provide a concrete next action before Confirm`,
          selected: false,
          confirmable: false
        };
      }
      return {
        id: `next_action:${h.project_id}`,
        kind: 'next_action',
        project_id: h.project_id,
        title,
        summary: `Create next action “${title}” for project ${h.project_id}`,
        selected: true,
        confirmable: true
      };
    });
  const waiting = (state.waiting ?? []).flatMap((item) => {
    const decision = waitingDecisions[item.task_id];
    if (!decision?.action) {
      if (!item.needs_action) return [];
      return [{
        id: `waiting:${item.task_id}:needs_decision`,
        kind: 'informational',
        task_id: item.task_id,
        summary: `Waiting “${item.title}” needs a decision`,
        selected: false,
        confirmable: false
      }];
    }
    return [{
      id: `waiting:${item.task_id}:${decision.action}`,
      kind: 'waiting',
      task_id: item.task_id,
      action: decision.action,
      follow_up_at: decision.follow_up_at ?? null,
      summary: `Waiting ${decision.action}: ${item.title}`,
      selected: true,
      confirmable: true
    }];
  });
  const someday = (state.someday_due ?? []).map((item) => {
    const decision = somedayDecisions[item.task_id];
    if (!decision?.action) {
      return {
        id: `someday:${item.task_id}:needs_decision`,
        kind: 'informational',
        task_id: item.task_id,
        summary: `Someday “${item.title}” is due for review`,
        selected: false,
        confirmable: false
      };
    }
    return {
      id: `someday:${item.task_id}:${decision.action}`,
      kind: 'someday',
      task_id: item.task_id,
      action: decision.action,
      review_at: decision.review_at ?? null,
      summary: `Someday ${decision.action}: ${item.title}`,
      selected: true,
      confirmable: true
    };
  });
  const schedule = ((state.schedule as { proposed?: Array<Record<string, unknown>>; blocks?: Array<Record<string, unknown>> } | null)?.proposed
    ?? (state.schedule as { blocks?: Array<Record<string, unknown>> } | null)?.blocks
    ?? [])
    .filter((b) => b && b.selected !== false)
    .map((b, index) => ({
      id: String(b.write_path || b.id || `schedule:${index}`),
      kind: 'schedule_block',
      summary: `Schedule ${String(b.date || '')} ${String(b.start_time || b.start || '')} · ${String(b.title || 'block')}`.trim(),
      selected: true,
      confirmable: true
    }));
  return [...capture, ...nextActions, ...waiting, ...someday, ...schedule];
}

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
    next_action_titles: {},
    waiting_decisions: {},
    someday_decisions: {},
    status: 'in_progress',
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
    next_action_titles?: Record<string, string>;
    waiting_decisions?: Record<string, { action: string; follow_up_at?: string | null }>;
    someday_decisions?: Record<string, { action: string; review_at?: string | null }>;
  }
): WeeklyReviewState {
  state = {
    ...state,
    next_action_titles: { ...(state.next_action_titles ?? {}), ...(input.next_action_titles ?? {}) },
    waiting_decisions: { ...(state.waiting_decisions ?? {}), ...(input.waiting_decisions ?? {}) },
    someday_decisions: { ...(state.someday_decisions ?? {}), ...(input.someday_decisions ?? {}) }
  };
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
      : buildWeeklyPendingChanges(state),
    updated_at: new Date().toISOString()
  };
}
