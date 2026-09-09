import type { WorkSession } from '@/schemas/work-session';
import type { WorkBlock } from '@/schemas/work-block';

export type FocusBlockSpec = {
  outcome: string;
  task_id?: string | null;
  project_id?: string | null;
  work_block_id?: string | null;
  planned_duration_minutes: number;
  finish_condition: string;
  depth: 'deep' | 'shallow' | 'admin';
  start_time?: string | null;
};

export type FocusBlockState = {
  status: 'ready' | 'running' | 'finished';
  spec: FocusBlockSpec;
  session: Partial<WorkSession> | null;
  elapsed_minutes: number | null;
};

export function createFocusBlock(spec: FocusBlockSpec): FocusBlockState {
  return {
    status: 'ready',
    spec: {
      ...spec,
      task_id: spec.task_id ?? null,
      project_id: spec.project_id ?? null,
      work_block_id: spec.work_block_id ?? null,
      start_time: spec.start_time ?? null
    },
    session: null,
    elapsed_minutes: null
  };
}

export function startFocusBlock(
  state: FocusBlockState,
  nowIso = new Date().toISOString()
): {
  state: FocusBlockState;
  sessionCreate: {
    task_id: string | null;
    project_id: string | null;
    work_block_id: string | null;
    started_at: string;
    depth: 'deep' | 'shallow' | 'admin';
    work_mode: 'predefined';
    work_mode_confidence: 'explicit';
    source: 'focus_block';
  };
} {
  const sessionCreate = {
    task_id: state.spec.task_id ?? null,
    project_id: state.spec.project_id ?? null,
    work_block_id: state.spec.work_block_id ?? null,
    started_at: nowIso,
    depth: state.spec.depth,
    work_mode: 'predefined' as const,
    work_mode_confidence: 'explicit' as const,
    source: 'focus_block' as const
  };
  return {
    state: {
      ...state,
      status: 'running',
      session: { ...sessionCreate, result: 'open' }
    },
    sessionCreate
  };
}

export function finishFocusBlock(
  state: FocusBlockState,
  result: 'done' | 'partial' | 'stopped',
  nowIso = new Date().toISOString()
): {
  state: FocusBlockState;
  sessionPatch: {
    finished_at: string;
    actual_duration_minutes: number;
    result: 'done' | 'partial' | 'stopped';
  };
} {
  const started = state.session?.started_at ?? nowIso;
  const elapsed = Math.max(
    1,
    Math.round((Date.parse(nowIso) - Date.parse(started)) / 60_000)
  );
  const sessionPatch = {
    finished_at: nowIso,
    actual_duration_minutes: elapsed,
    result
  };
  return {
    state: {
      ...state,
      status: 'finished',
      elapsed_minutes: elapsed,
      session: { ...state.session, ...sessionPatch }
    },
    sessionPatch
  };
}

export function linkFocusToBlock(
  spec: FocusBlockSpec,
  block: WorkBlock
): FocusBlockSpec {
  return {
    ...spec,
    work_block_id: block.id,
    task_id: spec.task_id ?? block.task_id,
    project_id: spec.project_id ?? block.project_id,
    depth: block.depth,
    planned_duration_minutes: block.duration_minutes
  };
}
