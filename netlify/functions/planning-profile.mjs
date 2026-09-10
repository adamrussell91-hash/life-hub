import {
  errorResponse,
  methodNotAllowed,
  okResponse,
  withCors
} from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetTasksStore, getJSON, setJSON } from './_shared/tasks-blobs.mjs';

export const config = { path: '/api/planning-profile' };

const PLANNING_PROFILE_KEY = 'meta/planning_profile';

const EMPTY_WINDOWS = {
  mon: [],
  tue: [],
  wed: [],
  thu: [],
  fri: [],
  sat: [],
  sun: []
};

export const DEFAULT_PLANNING_PROFILE = {
  schema_version: 1,
  id: 'default',
  active_project_limit: null,
  work_windows: { ...EMPTY_WINDOWS },
  protected_windows: { ...EMPTY_WINDOWS },
  deep_work_preference: {
    target_blocks_per_week: null,
    min_block_minutes: 90
  },
  shutdown_preference: {
    preferred_time: null,
    require_tomorrow_block: false
  },
  runway_buffer_minutes: null,
  updated_at: null
};

function cloneWindows(raw) {
  const next = { ...EMPTY_WINDOWS };
  if (!raw || typeof raw !== 'object') return next;
  for (const day of Object.keys(EMPTY_WINDOWS)) {
    const list = Array.isArray(raw[day]) ? raw[day] : [];
    next[day] = list
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        start: typeof item.start === 'string' ? item.start : '',
        end: typeof item.end === 'string' ? item.end : '',
        ...(typeof item.label === 'string' ? { label: item.label } : {})
      }))
      .filter((item) => item.start && item.end);
  }
  return next;
}

export function normalizePlanningProfile(raw) {
  const base = {
    ...DEFAULT_PLANNING_PROFILE,
    ...(raw && typeof raw === 'object' ? raw : {}),
    id: 'default',
    schema_version: 1
  };
  return {
    ...base,
    active_project_limit:
      base.active_project_limit == null || base.active_project_limit === ''
        ? null
        : Number(base.active_project_limit),
    work_windows: cloneWindows(base.work_windows),
    protected_windows: cloneWindows(base.protected_windows),
    deep_work_preference: {
      target_blocks_per_week:
        base.deep_work_preference?.target_blocks_per_week == null
          ? null
          : Number(base.deep_work_preference.target_blocks_per_week),
      min_block_minutes: Number(base.deep_work_preference?.min_block_minutes ?? 90)
    },
    shutdown_preference: {
      preferred_time:
        typeof base.shutdown_preference?.preferred_time === 'string'
          ? base.shutdown_preference.preferred_time
          : null,
      require_tomorrow_block: Boolean(base.shutdown_preference?.require_tomorrow_block)
    },
    runway_buffer_minutes:
      base.runway_buffer_minutes == null || base.runway_buffer_minutes === ''
        ? null
        : Number(base.runway_buffer_minutes)
  };
}

function validateProfile(profile) {
  if (
    profile.active_project_limit != null &&
    (!Number.isInteger(profile.active_project_limit) || profile.active_project_limit <= 0)
  ) {
    return 'active_project_limit must be a positive integer';
  }
  if (
    profile.runway_buffer_minutes != null &&
    (!Number.isFinite(profile.runway_buffer_minutes) || profile.runway_buffer_minutes < 0)
  ) {
    return 'runway_buffer_minutes must be a non-negative number';
  }
  if (
    !Number.isFinite(profile.deep_work_preference.min_block_minutes) ||
    profile.deep_work_preference.min_block_minutes <= 0
  ) {
    return 'deep_work_preference.min_block_minutes must be a positive number';
  }
  return null;
}

export function createPlanningProfileHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      if (request.method === 'GET') {
        const raw = await getJSON(store, PLANNING_PROFILE_KEY);
        return withCors(okResponse(200, normalizePlanningProfile(raw)), request, env);
      }

      if (request.method === 'PATCH' || request.method === 'PUT') {
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        const existing = normalizePlanningProfile(await getJSON(store, PLANNING_PROFILE_KEY));
        const next = normalizePlanningProfile({
          ...existing,
          ...parsed.value,
          deep_work_preference: {
            ...existing.deep_work_preference,
            ...(parsed.value.deep_work_preference ?? {})
          },
          shutdown_preference: {
            ...existing.shutdown_preference,
            ...(parsed.value.shutdown_preference ?? {})
          },
          id: 'default',
          updated_at: new Date().toISOString()
        });
        const validationError = validateProfile(next);
        if (validationError) {
          return withCors(
            errorResponse(400, 'validation_error', validationError, false),
            request,
            env
          );
        }
        await setJSON(store, PLANNING_PROFILE_KEY, next);
        return withCors(okResponse(200, next), request, env);
      }

      return withCors(methodNotAllowed('GET, PATCH, PUT, OPTIONS'), request, env);
    } catch {
      return withCors(
        errorResponse(503, 'tasks_blobs_unbound', 'Tasks content store is not bound.', true),
        request,
        env
      );
    }
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'tasks_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Tasks content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetTasksStore
  });
}

export default createPlanningProfileHandler();
