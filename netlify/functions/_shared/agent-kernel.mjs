/**
 * Phase 1 agent kernel — typed turn state beside the existing chat path.
 * Pilot: Chadwick training review and Clare daily focus.
 * ponytail: classifier is token lexicons, not one regex per paraphrase.
 * Upgrade: small model planTurn when a cheap classifier is available.
 */
import { randomUUID } from 'node:crypto';
import {
  getFitnessSnapshot,
  getTrainingVolume,
  getLoadStatus,
  getPainTrainingSummary,
  getBodyState
} from './fitness-tools.mjs';
import { compareWorkoutWindows } from './workout-history.mjs';
import { getTasksFocus } from './domain-retrieval.mjs';
import { getTasksOpenLoops } from './domain-analysis.mjs';
import { planWork } from './clare-work.mjs';
import { composeEvidenceClaims } from './evidence-packs.mjs';
import {
  memoryInterpretationLines,
  memoryPromptBlock,
  parseMemoryStore,
  searchMemories
} from './agent-memory.mjs';

export const KERNEL_PILOT_SLUGS = Object.freeze(['chadwick', 'clare']);
export const WRITE_GATEWAY_TOOLS = Object.freeze([
  'os_propose_action',
  'create_task',
  'update_task',
  'clare_mutate',
  'propose_central_node_patch',
  'remember_write_memory'
]);

const STAGES = ['plan', 'retrieve', 'assess', 'resolve', 'compose'];

const TRAIN = new Set([
  'train', 'training', 'workout', 'workouts', 'gym', 'lift', 'lifting',
  'session', 'sessions', 'fitness', 'strength', 'progress', 'programme',
  'program', 'volume', 'weight', 'weights', 'exercise', 'exercises',
  'stronger', 'recap', 'overview', 'gains', 'deload', 'programming'
]);
const DECLINE = new Set([
  'decline', 'weaker', 'weak', 'stall', 'stalled', 'plateau', 'regress',
  'worse', 'overtrain', 'overtrained', 'pain', 'hurt', 'hurting',
  'shoulder', 'knee', 'load', 'flat', 'drop', 'dropping', 'performance'
]);
const FOCUS = new Set([
  'today', 'focus', 'priority', 'prioritise', 'prioritize', 'priorities',
  'plate', 'overdue', 'next', 'plan', 'planning', 'schedule', 'morning',
  'sweep', 'task', 'tasks', 'triage', 'start', 'deadline', 'due',
  'blocked', 'stale', 'workload', 'capacity', 'day', 'board'
]);
const CAPTURE = new Set(['create', 'add', 'dump', 'inbox', 'capture']);
const GREET = new Set(['hi', 'hey', 'hello', 'yo', 'thanks', 'cheers', 'bro', 'mate', 'just', 'saying']);

export function agentKernelEnabled({ env = {}, flag, slug } = {}) {
  if (!KERNEL_PILOT_SLUGS.includes(slug)) return false;
  if (flag === true) return true;
  const raw = env.LIFE_HUB_AGENT_KERNEL;
  return raw === '1' || raw === 'true';
}

function tokenize(message) {
  return String(message ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .flatMap(word => {
      const out = [word];
      if (word.endsWith("'s")) out.push(word.slice(0, -2));
      if (word.endsWith('ing') && word.length > 5) {
        const stem = word.slice(0, -3);
        out.push(stem, `${stem}e`);
      }
      if (word.endsWith('ed') && word.length > 4) out.push(word.slice(0, -2));
      if (word.endsWith('s') && word.length > 3) out.push(word.slice(0, -1));
      return out;
    })
    .filter(Boolean);
}

function hits(words, lexicon) {
  return words.some(word => lexicon.has(word));
}

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object') return { ok: false, error: 'missing_plan' };
  if (!plan.workflow || !plan.goal) return { ok: false, error: 'incomplete_plan' };
  if (plan.workflow !== 'none') {
    if (!Array.isArray(plan.requiredSources) || !plan.requiredSources.length) {
      return { ok: false, error: 'incomplete_plan' };
    }
    if (!Array.isArray(plan.completion) || !plan.completion.length) {
      return { ok: false, error: 'incomplete_plan' };
    }
  }
  return { ok: true, plan };
}

export function planTurn({ slug, message } = {}) {
  const words = tokenize(message);
  const greetingOnly = words.length > 0 && words.every(word => GREET.has(word));

  if (slug === 'chadwick' && !greetingOnly && (hits(words, TRAIN) || hits(words, DECLINE))) {
    const decline = hits(words, DECLINE);
    const required = ['get_fitness_snapshot', 'compare_workout_windows'];
    if (decline) required.push('get_load_status', 'get_pain_training_summary', 'get_body_state');
    return validatePlan({
      workflow: 'training_review',
      goal: decline ? 'Explain training status with load/pain coverage' : 'Review training across recent windows',
      domain: 'fitness',
      requiredSources: required,
      optionalSources: decline ? ['get_training_volume'] : ['get_training_volume', 'get_body_state'],
      tools: [...required, 'get_training_volume', 'get_body_state'],
      risk: decline ? 'high' : 'low',
      writeIntent: false,
      retrieve: true,
      completion: decline
        ? ['snapshot_or_named_gap', 'window_or_named_gap', 'pain_or_named_gap']
        : ['snapshot_or_named_gap', 'window_or_named_gap']
    });
  }

  if (slug === 'clare' && !greetingOnly && hits(words, FOCUS) && !hits(words, CAPTURE)) {
    return validatePlan({
      workflow: 'daily_focus',
      goal: 'Name a realistic next move from task, project, and calendar state',
      domain: 'tasks',
      requiredSources: ['get_tasks_focus'],
      optionalSources: ['get_tasks_open_loops', 'plan_work'],
      tools: ['get_tasks_focus', 'inspect_board', 'plan_work', 'check_calendars'],
      risk: 'low',
      writeIntent: false,
      retrieve: true,
      completion: ['focus_or_named_gap']
    });
  }

  return validatePlan({
    workflow: 'none',
    goal: 'no_retrieval',
    domain: slug ?? null,
    requiredSources: [],
    optionalSources: [],
    tools: [],
    risk: 'low',
    writeIntent: false,
    retrieve: false,
    completion: []
  });
}

function emptyStores() {
  return {
    workouts: [],
    composition: [],
    measurements: [],
    tasks: [],
    projects: [],
    lessons: [],
    loadErrors: {}
  };
}

function runTool(name, stores, today, now) {
  const workouts = stores.workouts ?? [];
  const tasks = stores.tasks ?? [];
  const projects = stores.projects ?? [];
  const lessons = stores.lessons ?? [];
  const loadErrors = stores.loadErrors ?? {};

  if (name === 'get_fitness_snapshot') return getFitnessSnapshot(workouts, today);
  if (name === 'compare_workout_windows') return compareWorkoutWindows(workouts, today);
  if (name === 'get_training_volume') return getTrainingVolume(workouts, today);
  if (name === 'get_load_status') return getLoadStatus(workouts, today);
  if (name === 'get_pain_training_summary') return getPainTrainingSummary(workouts, today);
  if (name === 'get_body_state') {
    return getBodyState({
      compositionRecords: stores.composition ?? [],
      measurementRecords: stores.measurements ?? []
    });
  }
  if (name === 'get_tasks_focus') {
    if (loadErrors.tasks) return { ok: false, error: loadErrors.tasks };
    return getTasksFocus(tasks, projects, { now });
  }
  if (name === 'get_tasks_open_loops') {
    if (loadErrors.tasks) return { ok: false, error: loadErrors.tasks };
    return getTasksOpenLoops(tasks, projects, { now });
  }
  if (name === 'plan_work') {
    return planWork('collisions', { tasks, lessons, date: today, now });
  }
  return { ok: false, error: 'unknown_tool' };
}

function recordTrace(state, stage, summary) {
  const key = `${state.id}:${stage}:${state.trace.length}`;
  if (state.idempotencyKeys.includes(key)) return state;
  state.idempotencyKeys.push(key);
  state.trace.push({ stage, at: new Date().toISOString(), summary, key });
  return state;
}

export function createTurnState({ slug, message, today, now = new Date(), stores, sourceMeta } = {}) {
  return {
    id: randomUUID(),
    slug,
    message,
    today,
    now,
    stores: stores ?? emptyStores(),
    sourceMeta: sourceMeta ?? {},
    stage: 'idle',
    plan: null,
    evidence: {},
    coverage: { missing: [], truncated: [], failed: [] },
    conflicts: [],
    memory: [],
    memoryMeta: { kept: 0, omitted: 0 },
    memoryLoadError: stores?.memoryLoadError ?? null,
    actions: [],
    answer: null,
    claims: [],
    limitations: [],
    sufficient: false,
    complete: false,
    continuationTools: [],
    promptBlock: '',
    interpretationBlock: '',
    trace: [],
    idempotencyKeys: [],
    halted: null
  };
}

function doPlan(state) {
  const validated = planTurn({ slug: state.slug, message: state.message });
  if (!validated.ok) {
    state.limitations.push({ tool: 'planTurn', kind: 'failed', text: validated.error });
    state.plan = { workflow: 'none', goal: 'invalid', retrieve: false, requiredSources: [], optionalSources: [], tools: [], completion: [] };
  } else {
    state.plan = validated.plan;
  }
  state.stage = 'planned';
  return recordTrace(state, 'plan', state.plan.workflow);
}

function recallLayeredMemory(state) {
  if (state.memoryLoadError) return 'memory_failed';
  const loaded = parseMemoryStore(state.stores?.memories ?? []);
  if (!loaded.ok) {
    state.memoryLoadError = loaded.error;
    state.memory = [];
    state.memoryMeta = { kept: 0, omitted: 0 };
    return 'memory_failed';
  }
  const recalled = searchMemories(loaded, state.message, {
    agent: state.slug,
    now: state.now instanceof Date ? state.now : new Date(state.now),
    domain: state.plan?.domain,
    limit: 8
  });
  state.memory = recalled.items;
  state.memoryMeta = { kept: recalled.kept, omitted: recalled.omitted };
  return `memory=${recalled.kept}`;
}

function doRetrieve(state) {
  if (!state.plan?.retrieve) {
    state.stage = 'retrieved';
    return recordTrace(state, 'retrieve', 'skipped');
  }
  const names = [...state.plan.requiredSources];
  if (state.slug === 'clare' && (state.stores.lessons ?? []).length) names.push('plan_work');
  if (state.slug === 'clare') names.push('get_tasks_open_loops');
  if (state.slug === 'chadwick' && !names.includes('get_training_volume')) names.push('get_training_volume');
  for (const name of names) {
    if (state.evidence[name]) continue;
    state.evidence[name] = runTool(name, state.stores, state.today, state.now);
  }
  const memoryNote = recallLayeredMemory(state);
  state.stage = 'retrieved';
  return recordTrace(state, 'retrieve', `${Object.keys(state.evidence).join(',')}|${memoryNote}`);
}

function limitationFor(tool, result) {
  if (result == null) return { tool, kind: 'missing', text: `${tool} returned nothing` };
  if (result.ok === false || result.error) {
    return { tool, kind: 'failed', text: String(result.error || `${tool} failed`) };
  }
  if (result.truncated) {
    return { tool, kind: 'truncated', text: `${tool} truncated kept=${result.kept ?? '?'} omitted=${result.omitted ?? '?'}` };
  }
  if (result.conflict) return { tool, kind: 'conflict', text: result.conflict.kind || 'conflict' };
  return null;
}

export function assessEvidence(state) {
  const coverage = { missing: [], truncated: [], failed: [] };
  const conflicts = [];
  const limitations = [];

  for (const [tool, result] of Object.entries(state.evidence)) {
    const limit = limitationFor(tool, result);
    if (limit) {
      limitations.push(limit);
      if (limit.kind === 'missing') coverage.missing.push(tool);
      if (limit.kind === 'failed') coverage.failed.push(tool);
      if (limit.kind === 'truncated') coverage.truncated.push(tool);
      if (limit.kind === 'conflict') conflicts.push(limit);
    }
  }

  const snap = state.evidence.get_fitness_snapshot;
  if (state.plan?.workflow === 'training_review') {
    if (!snap || snap.ok === false) {
      limitations.push({ tool: 'get_fitness_snapshot', kind: 'missing', text: 'Fitness snapshot unavailable' });
      coverage.missing.push('get_fitness_snapshot');
    } else if (!snap.last_completed_date) {
      limitations.push({
        tool: 'get_fitness_snapshot',
        kind: 'missing',
        text: 'No completed sessions in the loaded window'
      });
      coverage.missing.push('completed_sessions');
    }
    const compare = state.evidence.compare_workout_windows;
    if (compare && compare.ok !== false && (compare.previous?.count === 0 || compare.current?.count === 0)) {
      limitations.push({
        tool: 'compare_workout_windows',
        kind: 'missing',
        text: 'A comparison window has no sessions'
      });
      coverage.missing.push('compare_window');
    }
    if ((state.plan.requiredSources ?? []).includes('get_pain_training_summary')) {
      const pain = state.evidence.get_pain_training_summary;
      if (!pain || pain.ok === false) {
        limitations.push({ tool: 'get_pain_training_summary', kind: 'missing', text: 'Pain summary unavailable' });
        coverage.missing.push('pain');
      }
    }
  }

  if (state.plan?.workflow === 'daily_focus') {
    const focus = state.evidence.get_tasks_focus;
    if (!focus || focus.ok === false || focus.error) {
      limitations.push({
        tool: 'get_tasks_focus',
        kind: 'failed',
        text: focus?.error || 'Tasks store unavailable'
      });
      coverage.failed.push('tasks');
    }
  }

  if (state.memoryLoadError) {
    limitations.push({
      tool: 'layered_memory',
      kind: 'failed',
      text: 'Layered memory store unavailable'
    });
    coverage.failed.push('layered_memory');
  } else if ((state.memoryMeta?.omitted ?? 0) > 0) {
    limitations.push({
      tool: 'layered_memory',
      kind: 'truncated',
      text: `Memory recall truncated kept=${state.memoryMeta.kept} omitted=${state.memoryMeta.omitted}`
    });
    coverage.truncated.push('layered_memory');
  }

  const required = state.plan?.requiredSources ?? [];
  const requiredPresent = required.every(tool => {
    const result = state.evidence[tool];
    return result && result.ok !== false && !result.error;
  });
  const namedGaps = limitations.length > 0;
  state.coverage = coverage;
  state.conflicts = conflicts;
  state.limitations = limitations;
  state.sufficient = requiredPresent && (state.plan?.workflow === 'training_review' ? Boolean(snap?.last_completed_date) : requiredPresent);
  state.complete = state.sufficient && coverage.truncated.length === 0 && conflicts.length === 0 && coverage.missing.length === 0;
  state.continuationTools = [...new Set([...coverage.truncated, ...coverage.missing, ...coverage.failed])];
  state.honest = state.sufficient || namedGaps;
  state.stage = 'assessed';
  return recordTrace(state, 'assess', state.complete ? 'complete' : `gaps=${limitations.map(item => item.kind).join(',') || 'none'}`);
}

function doResolve(state) {
  state.stage = 'resolved';
  return recordTrace(state, 'resolve', `${state.conflicts.length} conflicts`);
}

function doCompose(state) {
  const composed = composeEvidenceClaims(state.evidence);
  state.claims = composed.claims;
  for (const limit of composed.limitations) {
    if (!state.limitations.some(item => item.tool === limit.tool && item.kind === limit.kind)) {
      state.limitations.push(limit);
    }
  }
  state.complete = state.complete && composed.complete === true && state.limitations.length === 0;
  const claimLines = state.claims.map(claim => `- ${claim.text} (via ${claim.tool}, ${claim.kind})`);
  const limitLines = state.limitations.map(item => `- [${item.kind}] ${item.text}`);
  state.promptBlock = [
    `Agent kernel turn ${state.id}`,
    `Workflow: ${state.plan?.workflow} — ${state.plan?.goal}`,
    `Stage: ${state.stage} · sufficient=${state.sufficient} · complete=${state.complete}`,
    `Stores: ${Object.keys(state.evidence).join(', ') || 'none'}`,
    'Claims:',
    ...(claimLines.length ? claimLines : ['- none']),
    'Limitations:',
    ...(limitLines.length ? limitLines : ['- none']),
    memoryPromptBlock(state.memory, state.memoryMeta),
    state.complete
      ? 'Coverage is complete for the planned sources.'
      : 'Coverage is incomplete. Name every material limitation. Do not give a clean-sounding conclusion from missing, failed, truncated, or conflicted evidence.'
  ].join('\n');
  const pain = state.claims.some(claim => claim.fact === 'pain_site' || claim.fact === 'pain_flag_count' || claim.fact === 'pain_site_count');
  const overdue = state.claims.some(claim => claim.fact === 'overdue_title');
  const collisions = Number(state.claims.find(claim => claim.fact === 'collision_count')?.value ?? 0) > 0;
  state.interpretationBlock = [
    'Kernel interpretation (authoritative for this turn):',
    '- Claims above are retrieved or calculated from Life Hub stores. Do not invent extra rows.',
    '- Limitations outrank a tidy narrative. If a required source failed or is empty, say so.',
    pain
      ? '- Active pain evidence is present. Do not programme or recommend as if that constraint is absent.'
      : '- No pain claim was retrieved this turn. Do not invent a pain constraint.',
    overdue
      ? `- Overdue work is present (${state.claims.find(claim => claim.fact === 'overdue_title')?.value}). Do not ignore it when naming the next move.`
      : '- No overdue title was retrieved. Do not invent one.',
    collisions
      ? '- Teaching and tasks collide on the planned day. Do not present the day as an empty workday from 08:00.'
      : '',
    ...memoryInterpretationLines(state.memory)
  ].filter(Boolean).join('\n');
  state.answer = {
    claims: state.claims,
    limitations: state.limitations,
    sufficient: state.sufficient,
    complete: state.complete
  };
  state.stage = 'composed';
  return recordTrace(state, 'compose', `${state.claims.length} claims / ${state.limitations.length} limitations`);
}

export function proposeAction(state, action) {
  const key = action?.idempotencyKey || `${state.id}:action:${action?.intent || 'unknown'}`;
  if (state.idempotencyKeys.includes(key)) {
    return { state, duplicate: true, action: state.actions.find(item => item.idempotencyKey === key) ?? null };
  }
  const entry = { ...action, idempotencyKey: key, status: 'pending' };
  state.idempotencyKeys.push(key);
  state.actions.push(entry);
  state.stage = 'proposed';
  recordTrace(state, 'action', entry.intent || 'propose');
  return { state, duplicate: false, action: entry };
}

export function runAgentKernel(input = {}) {
  const state = input.state ?? createTurnState(input);
  const steps = {
    plan: doPlan,
    retrieve: doRetrieve,
    assess: assessEvidence,
    resolve: doResolve,
    compose: doCompose
  };
  for (const stage of STAGES) {
    if (stageCompleted(state, stage)) continue;
    if (input.failAt === stage) {
      state.halted = stage;
      return state;
    }
    steps[stage](state);
  }
  return state;
}

function stageCompleted(state, stage) {
  const order = {
    idle: -1,
    planned: 0,
    retrieved: 1,
    assessed: 2,
    resolved: 3,
    composed: 4,
    proposed: 4
  };
  return (order[state.stage] ?? -1) >= STAGES.indexOf(stage);
}

export function resumeAgentKernel(state, input = {}) {
  return runAgentKernel({ ...input, state, failAt: input.failAt ?? null });
}

export function selectKernelTools(tools, planned = []) {
  const allow = new Set([...planned, ...WRITE_GATEWAY_TOOLS]);
  return (tools ?? []).filter(tool => tool?.name && allow.has(tool.name));
}

export function applyKernelToTurn({
  slug,
  message,
  today,
  now = new Date(),
  stores,
  sourceMeta,
  tools = [],
  env = {},
  flag
} = {}) {
  if (!agentKernelEnabled({ env, flag, slug })) {
    return { enabled: false, tools, forceToolChoice: null, promptBlock: '', interpretationBlock: '', kernel: null };
  }
  const kernel = runAgentKernel({ slug, message, today, now, stores, sourceMeta });
  if (kernel.plan?.workflow === 'none') {
    return { enabled: true, tools, forceToolChoice: false, promptBlock: '', interpretationBlock: '', kernel };
  }
  return {
    enabled: true,
    tools: selectKernelTools(tools, kernel.plan.tools),
    forceToolChoice: !kernel.sufficient && kernel.continuationTools.length > 0,
    promptBlock: kernel.promptBlock,
    interpretationBlock: kernel.interpretationBlock,
    kernel
  };
}

export function kernelTraceEvent(kernel) {
  if (!kernel) return null;
  return {
    type: 'kernel_trace',
    turnId: kernel.id,
    workflow: kernel.plan?.workflow ?? null,
    sufficient: kernel.sufficient,
    complete: kernel.complete,
    tools: Object.keys(kernel.evidence ?? {}),
    limitationKinds: [...new Set((kernel.limitations ?? []).map(item => item.kind))],
    stages: (kernel.trace ?? []).map(item => item.stage),
    memoryKept: kernel.memoryMeta?.kept ?? 0,
    memoryOmitted: kernel.memoryMeta?.omitted ?? 0
  };
}
