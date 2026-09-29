/**
 * POST /api/calendar-rescue  { reason, ghosts: [...] }
 *
 * "Day changed": queue a rescue as Hammond's calendar ghosts. The client proposes
 * (rescue-plan.js, from the calendar it is showing); this endpoint only accepts
 * a narrow set of proposal kinds, validates each exactly as any ghost is
 * validated, and queues them. Nothing is written to Tasks or Life here. Accept
 * goes through POST /api/calendar-ghosts like every other ghost.
 *
 * A new rescue supersedes today's earlier pending rescue ghosts.
 */
import { createHash } from 'node:crypto';
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { createGitHubClient, GitHubClientError, GitHubConfigurationError } from './_shared/github-client.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { getSydneyDateKey, getSydneyTimestamp } from '../../apps/life/js/core/time.js';
import { validateGhost } from '../../apps/life/js/app/ghost-writes.js';
import {
  PENDING_CALENDAR_GHOSTS_PATH,
  parsePendingCalendarGhostsDoc,
  serializePendingCalendarGhosts
} from './calendar-ghosts.mjs';
import { openAlmanacRepo } from './almanac.mjs';

export const config = { path: '/api/calendar-rescue' };

export const RESCUE_REASONS = new Set(['late', 'derailed', 'worse', 'changed']);
const RESCUE_KINDS = new Set(['move_block', 'protect_block']);
const FIELDS = {
  move_block: ['kind', 'blockId', 'from', 'date', 'start', 'end', 'title', 'reason'],
  protect_block: ['kind', 'date', 'start', 'end', 'title', 'reason']
};
const MAX_GHOSTS = 12;

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 10);
}

/**
 * Validate one proposed rescue ghost and build its queue entry. Throws TypeError.
 * Only allowlisted kinds and fields; agent is always Hammond.
 */
export function rescueEntry(input, { today, nowIso }) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('ghost must be an object');
  if (!RESCUE_KINDS.has(input.kind)) throw new TypeError(`rescue cannot propose ${input.kind}`);
  const allowed = FIELDS[input.kind];
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) throw new TypeError(`unexpected field ${key}`);
  }
  if (input.kind === 'move_block' && input.from !== today) throw new TypeError('rescue only moves today’s blocks');
  if (typeof input.date !== 'string' || input.date < today) throw new TypeError('rescue cannot move into the past');
  const reason = typeof input.reason === 'string' ? input.reason.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  const title = typeof input.title === 'string' ? input.title.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  const ghost = {
    ...input,
    title,
    reason,
    agent: 'hammond',
    id: `rescue-${today}-${input.kind}-${hash({ ...input, title })}`
  };
  validateGhost(ghost);
  const label = input.kind === 'move_block'
    ? `Move “${title || 'work block'}”`
    : title || 'Protected time';
  return {
    ...ghost,
    label,
    meta: reason ? `Hammond · ${reason}` : 'Hammond · rescue',
    chip: {
      date: ghost.date,
      start: ghost.start,
      end: ghost.end,
      kind: input.kind === 'protect_block' ? 'health' : 'task'
    },
    created_at: nowIso,
    status: 'pending',
    via: 'rescue'
  };
}

/** Today's earlier pending rescue ghosts step aside for the new set. */
export function supersedeRescue(list, today, nowIso) {
  return list.map((entry) => (entry?.via === 'rescue' && (entry.status ?? 'pending') === 'pending'
    && String(entry.id ?? '').startsWith(`rescue-${today}-`)
    ? { ...entry, status: 'superseded', decided_at: nowIso }
    : entry));
}

export function createCalendarRescueHandler(deps = {}) {
  const createClient = deps.createGitHubClient ?? createGitHubClient;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    const parsed = await readJsonObject(request);
    if (parsed.error) return withCors(parsed.error, request, env);
    const body = parsed.value;
    for (const key of Object.keys(body)) {
      if (key !== 'reason' && key !== 'ghosts') {
        return withCors(errorResponse(400, 'client_write_rejected', 'Only reason and ghosts are accepted.', false), request, env);
      }
    }
    if (!RESCUE_REASONS.has(body.reason) || !Array.isArray(body.ghosts) || body.ghosts.length > MAX_GHOSTS) {
      return withCors(errorResponse(400, 'invalid_request', 'Provide a reason and up to 12 proposals.', false), request, env);
    }
    const instant = new Date(now());
    const today = getSydneyDateKey(instant);
    const nowIso = getSydneyTimestamp(instant);
    let entries;
    try {
      entries = body.ghosts.map((ghost) => rescueEntry(ghost, { today, nowIso }));
    } catch (error) {
      return withCors(errorResponse(400, 'invalid_ghost', error instanceof Error ? error.message : 'Invalid proposal.', false), request, env);
    }

    let client;
    try {
      client = createClient({ env, fetchImpl });
    } catch (error) {
      if (error instanceof GitHubConfigurationError) return withCors(errorResponse(503, 'misconfigured', 'Repository is not configured.', false), request, env);
      return withCors(errorResponse(503, 'github_unavailable', 'The repository is temporarily unavailable.', true), request, env);
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const opened = await openAlmanacRepo(client);
        const doc = parsePendingCalendarGhostsDoc(await opened.readFile(PENDING_CALENDAR_GHOSTS_PATH));
        const kept = supersedeRescue(doc.ghosts, today, nowIso).filter((entry) => !entries.some((next) => next.id === entry.id));
        const content = serializePendingCalendarGhosts([...kept, ...entries], doc.last_run);
        if (entries.length || kept.length !== doc.ghosts.length || content !== serializePendingCalendarGhosts(doc.ghosts, doc.last_run)) {
          await client.commitFiles({
            files: [{ path: PENDING_CALENDAR_GHOSTS_PATH, content }],
            message: `chore(calendar): rescue (${body.reason}) · ${entries.length} proposal${entries.length === 1 ? '' : 's'}`,
            parentSha: opened.base.commitSha,
            baseTreeSha: opened.base.treeSha
          });
        }
        return withCors(okResponse(200, { ghosts: entries }), request, env);
      } catch (error) {
        if (error instanceof GitHubClientError && error.code === 'write_conflict' && attempt === 0) continue;
        return withCors(errorResponse(503, 'github_unavailable', 'The repository is temporarily unavailable.', true), request, env);
      }
    }
    return withCors(errorResponse(409, 'write_conflict', 'The repository changed while saving. Try again.', true), request, env);
  }, deps);
}

export default createCalendarRescueHandler();
