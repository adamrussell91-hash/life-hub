import { load as loadYaml } from 'js-yaml';
import { verifySessionToken, serializeExpiredSessionCookie } from './_shared/auth-security.mjs';
import {
  errorResponse,
  guardRequestOrigin,
  isConfigured,
  jsonResponse,
  methodNotAllowed,
  misconfiguredResponse,
  preflightResponse,
  readUmbrellaSessionCookie,
  umbrellaSessionSecret,
  withCors
} from './_shared/http.mjs';
import { createGitHubClient, GitHubClientError, GitHubConfigurationError } from './_shared/github-client.mjs';
import { decodeBlob } from './_shared/decode-blob.mjs';
import { buildCanonicalPath } from './_shared/chat-schema.mjs';
import { parseDateRange } from './_shared/repo-policy.mjs';
import { validateCentralNodePatchInput, applyCentralNodePatch } from './_shared/hammond-tools.mjs';
import { renderMarkdown } from './_shared/persist-log.mjs';
import { validateRecord } from '../../apps/life/js/core/validate.js';
import { getSydneyDateKey, getSydneyTimestamp } from '../../apps/life/js/core/time.js';
import { acceptPlan, dismissPlan } from '../../apps/life/js/app/ghost-writes.js';
import { mergeTask } from './tasks.mjs';
import { normalizeTaskRecord } from './_shared/task-shape.mjs';
import { applyDueDatePriorityFloor } from './_shared/task-priority-assess.mjs';
import {
  defaultGetTasksStore,
  getJSON,
  newTaskId,
  readTaskIndex,
  setJSON,
  taskKey,
  writeTaskIndex
} from './_shared/tasks-blobs.mjs';

// Pending ghosts live at the data-repo root, same idea as the CN patch queue.
export const PENDING_CALENDAR_GHOSTS_PATH = 'pending-calendar-ghosts.json';
export const CALENDAR_GHOST_DECISIONS_PATH = 'calendar-ghost-decisions.jsonl';
const CENTRAL_NODE_PATH = 'central-node.md';

const PRIVATE_CACHE = { 'cache-control': 'private, no-store' };
const MAX_BODY_BYTES = 8 * 1024;
const DECISION_KEYS = new Set(['id', 'decision', 'reason']);
const TASK_DOMAINS = new Set(['teaching', 'life', 'wedding', 'health', 'other']);

export const config = { path: '/api/calendar-ghosts' };

function isQueueEntry(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.id === 'string' && value.id.trim() !== ''
    && typeof value.agent === 'string' && value.agent.trim() !== ''
    && typeof value.kind === 'string' && value.kind.trim() !== '';
}

/** Tolerant parse — missing or corrupt content is an empty queue, never a throw. */
export function parsePendingCalendarGhosts(text) {
  if (typeof text !== 'string' || text.trim() === '') return [];
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueueEntry);
  } catch {
    return [];
  }
}

export function serializePendingCalendarGhosts(list) {
  return JSON.stringify(Array.isArray(list) ? list : [], null, 2);
}

function findGhost(list, id) {
  return list.find(entry => entry.id === id) ?? null;
}

function markGhost(list, id, patch) {
  return list.map(entry => (entry.id === id ? { ...entry, ...patch } : entry));
}

function statusOf(entry) {
  return typeof entry.status === 'string' && entry.status ? entry.status : 'pending';
}

function ghostInRange(entry, from, to) {
  const dates = [entry.date, entry.from, entry.chip?.date].filter(date => typeof date === 'string' && date);
  // Undated drafts have no day chip. Keep them listed until Adam decides.
  if (!dates.length) return true;
  return dates.some(date => date >= from && date <= to);
}

export function pendingGhostsInRange(text, from, to) {
  return parsePendingCalendarGhosts(text)
    .filter(entry => statusOf(entry) === 'pending' && ghostInRange(entry, from, to))
    .sort((a, b) => String(a.date ?? a.from ?? '').localeCompare(String(b.date ?? b.from ?? '')) || a.id.localeCompare(b.id));
}

/**
 * The only POST body. Anything else is a client trying to send the writes.
 * Returns the decision, or { error }.
 */
export function readGhostDecision(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'invalid_request' };
  for (const key of Object.keys(body)) {
    if (!DECISION_KEYS.has(key)) return { error: 'client_write_rejected' };
  }
  if (typeof body.id !== 'string' || body.id.trim() === '') return { error: 'invalid_request' };
  if (body.decision !== 'accept' && body.decision !== 'dismiss') return { error: 'invalid_request' };
  if (body.reason != null && typeof body.reason !== 'string') return { error: 'invalid_request' };
  return { id: body.id, decision: body.decision, reason: typeof body.reason === 'string' ? body.reason : null };
}

function fail(status, code, message) {
  return { status, payload: { ok: false, error: { code, message, retryable: false } } };
}

function applied(plan, { drafts = [], writes = 'applied', retry = null } = {}) {
  const payload = { ok: true, receipt: plan.receipt, writes };
  if (retry) payload.retry = retry;
  if (drafts.length === 1) payload.draft = drafts[0];
  else if (drafts.length > 1) payload.draft = drafts;
  return { status: writes === 'partial' ? 207 : 200, payload };
}

function safeRepoPath(path) {
  return typeof path === 'string' && path.length > 0 && !path.startsWith('/')
    && !path.includes('\\') && !path.includes('\0') && !path.split('/').includes('..');
}

function blockSlug(record) {
  const stem = String(record.title || record.kind || 'block')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const time = String(record.time || '00:00').replace(/[^0-9]/g, '').slice(0, 4) || '0000';
  return `${stem || 'block'}-${time}`;
}

function splitDocument(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?([\s\S]*)$/.exec(String(text ?? '').trim());
  if (!match) return null;
  return { yaml: match[1], body: match[2].trim() };
}

async function applyLifeStep(opened, step, { nowIso, ghostId }) {
  if (step.mode === 'create') {
    const record = {
      ...step.record,
      schema_version: 1,
      id: `cb-${ghostId}`,
      type: 'calendar_block',
      created_at: nowIso,
      updated_at: nowIso,
      source: 'calendar-ghost'
    };
    const errors = validateRecord(record);
    if (errors.length) return fail(400, 'invalid_record', errors[0]);
    let path;
    try {
      path = buildCanonicalPath({ type: record.type, date: record.date, slug: blockSlug(record) });
    } catch {
      return fail(400, 'invalid_record', 'This calendar block could not be stored.');
    }
    return { path, content: renderMarkdown(record, '') };
  }

  if (step.mode === 'update') {
    if (!safeRepoPath(step.path)) return fail(400, 'invalid_record', 'This record path is not allowed.');
    const existing = await opened.readFile(step.path);
    if (typeof existing !== 'string') return fail(400, 'record_missing', 'The record this ghost updates is not in the repository.');
    const parts = splitDocument(existing);
    if (!parts) return fail(400, 'invalid_record', 'The record this ghost updates could not be read.');
    let parsed;
    try {
      parsed = loadYaml(parts.yaml);
    } catch {
      return fail(400, 'invalid_record', 'The record this ghost updates could not be read.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return fail(400, 'invalid_record', 'The record this ghost updates could not be read.');
    }
    const record = { ...parsed, ...step.fields, updated_at: nowIso };
    const errors = validateRecord(record);
    if (errors.length) return fail(400, 'invalid_record', errors[0]);
    return { path: step.path, content: renderMarkdown(record, parts.body) };
  }

  return fail(400, 'invalid_record', 'Unknown life record write.');
}

async function applyTaskStep(store, step) {
  if (step.method === 'PATCH') {
    const existing = await getJSON(store, taskKey(step.id));
    if (!existing || typeof existing !== 'object') {
      throw Object.assign(new Error('Task not found'), { code: 'task_not_found' });
    }
    const next = normalizeTaskRecord(applyDueDatePriorityFloor(mergeTask(existing, step.body ?? {}), step.body ?? {}));
    await setJSON(store, taskKey(step.id), next);
    return;
  }
  if (step.method === 'POST') {
    const body = step.body ?? {};
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    // acceptPlan's create_task body has no domain. tasks.mjs requires one;
    // Life is the hub default when the plan omits it.
    const domain = typeof body.domain === 'string' && body.domain ? body.domain : 'life';
    if (!title || !TASK_DOMAINS.has(domain)) {
      throw Object.assign(new Error('title and a valid domain are required'), { code: 'validation_error' });
    }
    const timestamp = new Date().toISOString();
    const id = newTaskId();
    const task = normalizeTaskRecord({
      schema_version: 1,
      id,
      title,
      description: typeof body.notes === 'string' ? body.notes : '',
      kind: 'task',
      bucket: 'active',
      domain,
      status: typeof body.status === 'string' && body.status ? body.status : 'open',
      priority: 'medium',
      parent_project_id: null,
      created_at: timestamp,
      updated_at: timestamp,
      completed_at: null,
      depends_on: [],
      tags: [],
      attachments: [],
      source: typeof body.source === 'string' ? body.source : 'manual',
      due_date: typeof body.due_date === 'string' ? body.due_date : null
    });
    await setJSON(store, taskKey(id), task);
    const ids = await readTaskIndex(store);
    await writeTaskIndex(store, [...ids, id]);
    return;
  }
  throw Object.assign(new Error('Unknown tasks method'), { code: 'invalid_task_step' });
}

async function settle(opened, { id, decision, reason, today, nowIso }) {
  const queue = parsePendingCalendarGhosts(await opened.readFile(PENDING_CALENDAR_GHOSTS_PATH));
  const entry = findGhost(queue, id);
  if (!entry) return fail(404, 'ghost_not_found', 'No pending ghost matches this id.');
  const status = statusOf(entry);
  if (status === 'dismissed') return fail(409, 'already_dismissed', 'This ghost was already dismissed.');
  if (status === 'accepted' && entry.tasks_pending !== true) {
    return fail(409, 'already_accepted', 'This ghost was already accepted.');
  }
  if (status === 'accepted' && decision === 'dismiss') {
    return fail(409, 'already_accepted', 'This ghost was already accepted.');
  }

  let plan;
  try {
    plan = decision === 'accept' ? acceptPlan(entry, { today }) : dismissPlan(entry, { reason });
  } catch (error) {
    const message = error instanceof TypeError ? error.message : 'This ghost could not be validated.';
    return fail(400, 'invalid_ghost', message);
  }

  // Step 1 already landed. Retry runs only the tasks steps.
  if (status === 'accepted' && entry.tasks_pending === true) {
    return { kind: 'tasks-only', plan, taskSteps: plan.steps.filter(step => step.target === 'tasks') };
  }

  if (decision === 'dismiss') {
    const changed = new Map();
    changed.set(PENDING_CALENDAR_GHOSTS_PATH, serializePendingCalendarGhosts(markGhost(queue, id, {
      status: 'dismissed',
      decided_at: nowIso
    })));
    const prior = await opened.readFile(CALENDAR_GHOST_DECISIONS_PATH);
    const line = JSON.stringify({ ...plan.decision, at: nowIso });
    const base = typeof prior === 'string' ? prior : '';
    const prefix = base === '' || base.endsWith('\n') ? base : `${base}\n`;
    changed.set(CALENDAR_GHOST_DECISIONS_PATH, `${prefix}${line}\n`);
    return { kind: 'dismiss', changed, plan, taskSteps: [], drafts: [], message: `chore(calendar): dismiss ${id}` };
  }

  const changed = new Map();
  const drafts = [];
  const taskSteps = [];
  let central = await opened.readFile(CENTRAL_NODE_PATH);
  let centralTouched = false;

  for (const step of plan.steps) {
    if (step.target === 'draft') {
      // Shown to copy. Nothing is sent and nothing is stored as a message.
      drafts.push({ to: step.to ?? null, text: typeof step.text === 'string' ? step.text : '' });
      continue;
    }
    if (step.target === 'tasks') {
      taskSteps.push(step);
      continue;
    }
    if (step.target === 'central_node') {
      if (typeof central !== 'string') return fail(404, 'central_node_missing', 'Central Node is not available.');
      // Accept is the confirmation. Ghost patches are auto-class (a short
      // coordination line). chat-confirm's auto_class_rejected rule does not
      // apply here: that endpoint only confirms confirm-class patches, and
      // Adam has already pressed Accept.
      const patch = validateCentralNodePatchInput(step.patch);
      if (!patch) return fail(400, 'invalid_patch', 'This Central Node patch could not be validated.');
      const next = applyCentralNodePatch(central, patch);
      if (!next) return fail(400, 'apply_failed', 'This Central Node patch could not be applied.');
      central = next;
      centralTouched = true;
      continue;
    }
    if (step.target === 'life_record') {
      const written = await applyLifeStep(opened, step, { nowIso, ghostId: id });
      if (written.status) return written;
      changed.set(written.path, written.content);
      continue;
    }
    return fail(400, 'unknown_step', 'This ghost plan has a step the server cannot run.');
  }

  if (centralTouched) changed.set(CENTRAL_NODE_PATH, central);
  changed.set(PENDING_CALENDAR_GHOSTS_PATH, serializePendingCalendarGhosts(markGhost(queue, id, {
    status: 'accepted',
    decided_at: nowIso,
    // Set before the tasks call so a failure in step 2 still has a retry marker.
    ...(taskSteps.length ? { tasks_pending: true } : {})
  })));
  return {
    kind: 'accept',
    changed,
    plan,
    taskSteps,
    drafts,
    message: `chore(calendar): accept ${id}`
  };
}

async function clearTasksPending(open, commit, id) {
  const opened = await open();
  const queue = parsePendingCalendarGhosts(await opened.readFile(PENDING_CALENDAR_GHOSTS_PATH));
  const entry = findGhost(queue, id);
  if (!entry || entry.tasks_pending !== true) return;
  const changed = new Map([[
    PENDING_CALENDAR_GHOSTS_PATH,
    serializePendingCalendarGhosts(markGhost(queue, id, { tasks_pending: false }))
  ]]);
  await commit(changed, opened.base, `chore(calendar): tasks applied ${id}`);
}

/**
 * Execute one stored ghost. `open` reads a snapshot, `commit` writes one
 * GitHub commit (or the mock equivalent). Tasks run only after that commit.
 */
export async function runGhostDecision({ open, commit, tasksStore, decision, today, nowIso }) {
  // ponytail: one stale-SHA retry. On write_conflict, re-read and rebuild from
  // the current tree. A second conflict is returned to the client.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const opened = await open();
    const settlement = await settle(opened, { ...decision, today, nowIso });
    if (settlement.status) return settlement;
    if (settlement.kind === 'tasks-only') {
      return finishTasks({ open, commit, tasksStore, id: decision.id, settlement });
    }
    try {
      if (settlement.changed.size) await commit(settlement.changed, opened.base, settlement.message);
    } catch (error) {
      if (error instanceof GitHubClientError && error.code === 'write_conflict' && attempt === 0) continue;
      throw error;
    }
    return finishTasks({ open, commit, tasksStore, id: decision.id, settlement });
  }
  return fail(409, 'write_conflict', 'The repository changed while accepting. Try again.');
}

async function finishTasks({ open, commit, tasksStore, id, settlement }) {
  if (!settlement.taskSteps.length) return applied(settlement.plan, { drafts: settlement.drafts ?? [] });
  try {
    const store = await tasksStore();
    for (const step of settlement.taskSteps) await applyTaskStep(store, step);
    try {
      await clearTasksPending(open, commit, id);
    } catch {
      return applied(settlement.plan, { drafts: settlement.drafts, writes: 'partial', retry: 'tasks' });
    }
    return applied(settlement.plan, { drafts: settlement.drafts ?? [] });
  } catch {
    return applied(settlement.plan, { drafts: settlement.drafts, writes: 'partial', retry: 'tasks' });
  }
}

function withPrivateCache(response) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', PRIVATE_CACHE['cache-control']);
  return new Response(response.body, { status: response.status, headers });
}

export function createCalendarGhostsHandler({
  env = process.env,
  fetchImpl = fetch,
  verifySessionToken: verify = verifySessionToken,
  serializeExpiredSessionCookie: clearCookie = serializeExpiredSessionCookie,
  createGitHubClient: createClient = createGitHubClient,
  now = Date.now,
  getTasksStore = defaultGetTasksStore
} = {}) {
  return async function calendarGhostsHandler(request) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    return withCors(await handle(request), request, env);
  };

  async function handle(request) {
    if (request.method !== 'GET' && request.method !== 'POST') {
      return withPrivateCache(methodNotAllowed('GET, POST'));
    }
    const originError = guardRequestOrigin(request, env);
    if (originError) return withPrivateCache(originError);
    if (!isConfigured(env)) return withPrivateCache(misconfiguredResponse());

    let session;
    try {
      session = verify(readUmbrellaSessionCookie(request), umbrellaSessionSecret(env), now());
    } catch {
      return withPrivateCache(misconfiguredResponse());
    }
    if (!session.valid) {
      return errorResponse(401, 'unauthenticated', 'Please sign in to continue.', false, {
        ...PRIVATE_CACHE,
        'set-cookie': clearCookie()
      });
    }

    let client;
    try {
      client = createClient({ env, fetchImpl });
    } catch (error) {
      if (error instanceof GitHubConfigurationError) return withPrivateCache(misconfiguredResponse());
      return withPrivateCache(errorResponse(503, 'github_unavailable', 'The repository is temporarily unavailable.', true, PRIVATE_CACHE));
    }

    const open = async () => {
      const resolved = await client.resolveTree();
      const blobs = new Map(
        (resolved.tree ?? [])
          .filter(entry => entry?.type === 'blob' && typeof entry.path === 'string')
          .map(entry => [entry.path, entry.sha])
      );
      return {
        base: { commitSha: resolved.commitSha, treeSha: resolved.treeSha },
        async readFile(path) {
          const sha = blobs.get(path);
          if (!sha) return null;
          return decodeBlob(await client.readBlob(sha));
        }
      };
    };
    const commit = (changed, base, message) => client.commitFiles({
      files: [...changed.entries()].map(([path, content]) => ({ path, content })),
      message,
      parentSha: base.commitSha,
      baseTreeSha: base.treeSha
    });

    try {
      if (request.method === 'GET') {
        const url = new URL(request.url);
        try {
          parseDateRange(url);
        } catch {
          return jsonResponse(400, fail(400, 'invalid_date_range', 'Provide from and to as YYYY-MM-DD.').payload, PRIVATE_CACHE);
        }
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');
        const opened = await open();
        const ghosts = pendingGhostsInRange(await opened.readFile(PENDING_CALENDAR_GHOSTS_PATH), from, to);
        return jsonResponse(200, { ok: true, ghosts }, PRIVATE_CACHE);
      }

      const text = await request.text();
      if (Buffer.byteLength(text) > MAX_BODY_BYTES) {
        return jsonResponse(400, fail(400, 'invalid_request', 'The request body is too large.').payload, PRIVATE_CACHE);
      }
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return jsonResponse(400, fail(400, 'invalid_request', 'The request body was not valid JSON.').payload, PRIVATE_CACHE);
      }
      const decision = readGhostDecision(parsed);
      if (decision.error === 'client_write_rejected') {
        return jsonResponse(400, fail(400, 'client_write_rejected', 'The client cannot send writes.').payload, PRIVATE_CACHE);
      }
      if (decision.error) {
        return jsonResponse(400, fail(400, 'invalid_request', 'Provide id and decision.').payload, PRIVATE_CACHE);
      }

      const instant = new Date(now());
      const result = await runGhostDecision({
        open,
        commit,
        tasksStore: () => getTasksStore(env),
        decision,
        today: getSydneyDateKey(instant),
        nowIso: getSydneyTimestamp(instant)
      });
      return jsonResponse(result.status, result.payload, PRIVATE_CACHE);
    } catch (error) {
      if (error instanceof GitHubClientError) {
        return jsonResponse(error.code === 'write_conflict' ? 409 : 503, {
          ok: false,
          error: {
            code: error.code,
            message: 'The repository is temporarily unavailable.',
            retryable: error.retryable === true
          }
        }, PRIVATE_CACHE);
      }
      return jsonResponse(503, {
        ok: false,
        error: { code: 'github_unavailable', message: 'The repository is temporarily unavailable.', retryable: true }
      }, PRIVATE_CACHE);
    }
  }
}

export default createCalendarGhostsHandler();
