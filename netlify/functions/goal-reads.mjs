// netlify/functions/goal-reads.mjs
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetTasksStore, getJSON, listJSON, setJSON, TASK_PREFIX } from './_shared/tasks-blobs.mjs';
import { normalizeGoalRecord } from './_shared/goal-record.mjs';
import { basisUpdatedAt, buildGoalRead, termsFromHubPrefs } from './_shared/goal-read.mjs';
import {
  currentTermRef,
  goalMatchesTermFilter,
  parseTermQuery,
  termRefsFromHubPrefs
} from './_shared/goal-term-filter.mjs';
import {
  cooledKindsFromDecisions,
  decisionsKey,
  quietLinesForCooled
} from './_shared/goal-dismissal-learn.mjs';
import { getSydneyDateKey } from '../../apps/life/js/core/time.js';

export const config = { path: '/api/goal-reads' };
const HUB_PREFS_KEY = 'meta/hub_prefs';

export function goalReadKey(goalId) {
  return `goal_reads/${goalId}`;
}

function records(list) {
  return list.filter(item => item && typeof item === 'object' && !Array.isArray(item) && typeof item.id === 'string');
}

export async function loadGoalInputs(store) {
  const [goals, projects, tasks, prefs] = await Promise.all([
    listJSON(store, 'goals/'),
    listJSON(store, 'projects/'),
    listJSON(store, TASK_PREFIX),
    getJSON(store, HUB_PREFS_KEY)
  ]);
  return {
    goals: records(goals).map(normalizeGoalRecord),
    projects: records(projects),
    tasks: records(tasks),
    terms: termsFromHubPrefs(prefs),
    termRefs: termRefsFromHubPrefs(prefs),
    prefs
  };
}

/** Why a read must be recomputed, or null when the saved one is fresh. */
export function staleReason(cached, { today, basis }) {
  if (!cached?.read) return 'first';
  if (cached.read.computed_on !== today) return 'daily';
  if (basis > (cached.read.basis_updated_at ?? '')) return 'changed';
  return null;
}

export async function readForGoal(store, goal, inputs, {
  today,
  force = false,
  slots = [],
  binding = null,
  calendarLooked = false,
  lifeHubLooked = false,
  cooledKinds = new Set(),
  model = null
} = {}) {
  const cached = await getJSON(store, goalReadKey(goal.id));
  const basis = basisUpdatedAt(goal, inputs.projects, inputs.tasks);
  const reason = force ? 'manual' : staleReason(cached, { today, basis });
  if (!reason) return { read: cached.read, reason: cached.reason ?? 'daily' };
  const dismissed = Array.isArray(cached?.dismissed) ? cached.dismissed : [];
  let read = buildGoalRead({
    goal,
    projects: inputs.projects,
    tasks: inputs.tasks,
    terms: inputs.terms,
    today,
    dismissed,
    slots,
    binding,
    calendarLooked,
    lifeHubLooked,
    cooledKinds,
    model: null
  });
  // G-32: one Haiku call per recompute; fall back silently.
  try {
    const { fetchVerdictModel } = await import('./_shared/goal-verdict-model.mjs');
    const model = await fetchVerdictModel({ read, goal });
    if (model && !model.fallback) {
      read = buildGoalRead({
        goal,
        projects: inputs.projects,
        tasks: inputs.tasks,
        terms: inputs.terms,
        today,
        dismissed,
        slots,
        binding,
        calendarLooked,
        lifeHubLooked,
        cooledKinds,
        model
      });
    } else if (model?.fallback) {
      read = { ...read, model_fallback: true, verdict_source: 'deterministic' };
    }
  } catch (err) {
    console.warn('goal-reads: model verdict skipped', err?.message ?? err);
    read = { ...read, model_fallback: true, verdict_source: 'deterministic' };
  }
  await setJSON(store, goalReadKey(goal.id), {
    read,
    dismissed,
    reason,
    stuck_reason: cached?.stuck_reason ?? null
  });
  return { read, reason };
}

async function loadHammondExtras(store, deps = {}) {
  const decisionsDoc = await getJSON(store, decisionsKey()).catch(() => null);
  const cooledKinds = cooledKindsFromDecisions(decisionsDoc?.decisions ?? []);
  const quiet = quietLinesForCooled(cooledKinds);
  let slots = [];
  let binding = null;
  let calendarLooked = false;
  let lifeHubLooked = false;
  if (typeof deps.loadCalendarContext === 'function') {
    try {
      const ctx = await deps.loadCalendarContext();
      slots = Array.isArray(ctx?.slots) ? ctx.slots : [];
      binding = ctx?.binding ?? null;
      calendarLooked = Boolean(ctx?.calendarLooked);
      lifeHubLooked = Boolean(ctx?.lifeHubLooked);
    } catch (err) {
      console.warn('goal-reads: calendar context skipped', err?.message ?? err);
    }
  }
  return { slots, binding, calendarLooked, lifeHubLooked, cooledKinds, quiet };
}

/** Active goals for the landing strip: selected term, or current term + Ongoing. */
export function goalsForTermFilter(goals, { termQuery, termRefs, today }) {
  const explicit = parseTermQuery(termQuery);
  const selected = explicit ?? currentTermRef(termRefs, today);
  const includeOngoing = !explicit;
  return goals.filter(goal =>
    goal.status === 'active' && goalMatchesTermFilter(goal, selected, { includeOngoing })
  );
}

export function createGoalReadsHandler(deps = {}) {
  const now = deps.now ?? Date.now;
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      const today = getSydneyDateKey(new Date(now()));
      const extras = await loadHammondExtras(store, deps);
      if (request.method === 'GET') {
        const inputs = await loadGoalInputs(store);
        const url = new URL(request.url);
        const goalId = url.searchParams.get('goal_id');
        if (goalId) {
          const goal = inputs.goals.find(item => item.id === goalId);
          if (!goal) return withCors(errorResponse(404, 'not_found', 'Goal not found', false), request, env);
          const result = await readForGoal(store, goal, inputs, { today, ...extras });
          return withCors(okResponse(200, { ...result, quiet: extras.quiet }), request, env);
        }
        const filtered = goalsForTermFilter(inputs.goals, {
          termQuery: url.searchParams.get('term'),
          termRefs: inputs.termRefs,
          today
        });
        const reads = [];
        for (const goal of filtered) {
          reads.push(await readForGoal(store, goal, inputs, { today, ...extras }));
        }
        return withCors(okResponse(200, { reads, quiet: extras.quiet }), request, env);
      }
      if (request.method === 'POST') {
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        // G-33 undo cooldown
        if (parsed.value?.action === 'undo_cooldown' && typeof parsed.value.kind === 'string') {
          const { clearKindCooldown } = await import('./_shared/goal-dismissal-learn.mjs');
          await clearKindCooldown(store, parsed.value.kind, { getJSON, setJSON });
          return withCors(okResponse(200, { ok: true, kind: parsed.value.kind }), request, env);
        }
        const goalId = typeof parsed.value.goal_id === 'string' ? parsed.value.goal_id : '';
        const inputs = await loadGoalInputs(store);
        const goal = inputs.goals.find(item => item.id === goalId);
        if (!goal) return withCors(errorResponse(404, 'not_found', 'Goal not found', false), request, env);
        const result = await readForGoal(store, goal, inputs, { today, force: true, ...extras });
        return withCors(okResponse(200, { ...result, quiet: extras.quiet }), request, env);
      }
      return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    } catch {
      return withCors(errorResponse(503, 'tasks_blobs_unbound', 'Tasks content store is not bound.', true), request, env);
    }
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'tasks_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Tasks content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetTasksStore
  });
}

export default createGoalReadsHandler();
