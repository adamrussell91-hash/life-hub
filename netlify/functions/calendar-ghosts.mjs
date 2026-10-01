import { createHash } from 'node:crypto';
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
import { wallLocalToUtcIso } from './_shared/wall-time.mjs';
import { buildCanonicalPath } from './_shared/chat-schema.mjs';
import { parseDateRange } from './_shared/repo-policy.mjs';
import { validateCentralNodePatchInput, applyCentralNodePatch } from './_shared/hammond-tools.mjs';
import { renderMarkdown } from './_shared/persist-log.mjs';
import { validateRecord } from '../../apps/life/js/core/validate.js';
import { getSydneyDateKey, getSydneyTimestamp } from '../../apps/life/js/core/time.js';
import { acceptPlan, dismissPlan, validateGhost, GHOST_AGENTS } from '../../apps/life/js/app/ghost-writes.js';
import { ghostId, ghostSemanticKey } from '../../apps/life/js/app/ghost-proposer.js';
import {
  ghostsForAlmanacAction,
  loadHorizonAlmanacContext,
  loadProfessionalEventsFromBlobs,
  loadTeachingLessonsFromBlobs,
  readAlmanac,
  readSchoolTerms
} from './almanac.mjs';
import { defaultGetCognitiveStore } from './_shared/cognitive-store.mjs';
import { defaultGetProfessionalStore, getJSON as getProfessionalJSON, setJSON as setProfessionalJSON } from './_shared/professional-blobs.mjs';
import { defaultGetUniversalLinkStore } from './_shared/universal-link-blobs.mjs';
import { createCommunicationRepository } from './_shared/communication-repository.mjs';
import { createMeetingRepository } from './_shared/meeting-repository.mjs';
import { createEventRepository } from './_shared/event-repository.mjs';
import { createUniversalLinkRepository } from './_shared/universal-link-repository.mjs';
import { createAccessContext } from './_shared/entity-access.mjs';
import { mergeTask } from './tasks.mjs';
import { normalizeTaskRecord } from './_shared/task-shape.mjs';
import { applyDueDatePriorityFloor } from './_shared/task-priority-assess.mjs';
import { normalizeGoalRecord } from './_shared/goal-record.mjs';
import { buildGoalRead, goalIdFromGhostId } from './_shared/goal-read.mjs';
import { goalReadKey, loadGoalInputs } from './goal-reads.mjs';
import {
  defaultGetTasksStore,
  getJSON,
  newTaskId,
  readIndex,
  readTaskIndex,
  setJSON,
  taskKey,
  writeIndex,
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

function isLastRun(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date);
}

function normalizeLastRun(value) {
  if (!isLastRun(value)) return null;
  return {
    date: value.date,
    at: typeof value.at === 'string' ? value.at : null,
    newest_record_at: typeof value.newest_record_at === 'string' ? value.newest_record_at : null
  };
}

/**
 * Queue file: legacy `[]` or `{ ghosts, last_run }`.
 * last_run = { date, at, newest_record_at } — set by propose even when nothing is queued.
 */
export function parsePendingCalendarGhostsDoc(text) {
  if (typeof text !== 'string' || text.trim() === '') return { ghosts: [], last_run: null };
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return { ghosts: parsed.filter(isQueueEntry), last_run: null };
    }
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.ghosts)) {
      return {
        ghosts: parsed.ghosts.filter(isQueueEntry),
        last_run: normalizeLastRun(parsed.last_run)
      };
    }
    return { ghosts: [], last_run: null };
  } catch {
    return { ghosts: [], last_run: null };
  }
}

/** Tolerant parse — missing or corrupt content is an empty queue, never a throw. */
export function parsePendingCalendarGhosts(text) {
  return parsePendingCalendarGhostsDoc(text).ghosts;
}

/**
 * Serialize the queue. Pass last_run to write `{ ghosts, last_run }`; omit it to
 * keep the legacy array form (accept/dismiss seeds and visual fixtures).
 */
export function serializePendingCalendarGhosts(list, last_run) {
  const ghosts = Array.isArray(list) ? list : [];
  if (last_run && typeof last_run === 'object') {
    return JSON.stringify({ ghosts, last_run }, null, 2);
  }
  return JSON.stringify(ghosts, null, 2);
}

/**
 * Content fingerprint for chat ghost ids — same day can hold breakfast AND dinner.
 * Tideline auto-proposer still uses bare ghostId(agent, kind, date).
 */
export function chatGhostContentHash(input) {
  const refs = Array.isArray(input?.person_refs)
    ? input.person_refs.filter(ref => typeof ref === 'string').join(',')
    : '';
  const payload = [
    input?.start, input?.end, input?.time, input?.title, input?.subject,
    input?.path, input?.direction, input?.channel, refs,
    input?.follow_up_task?.title, input?.follow_up_task?.due
  ].map(value => String(value ?? '')).join('\0');
  return createHash('sha256').update(payload).digest('hex').slice(0, 8);
}

export function ghostContentFingerprint(ghost) {
  const refs = Array.isArray(ghost?.person_refs)
    ? ghost.person_refs.filter(ref => typeof ref === 'string').join(',')
    : '';
  return [
    ghost?.start, ghost?.end, ghost?.time, ghost?.title, ghost?.subject,
    ghost?.path, ghost?.direction, ghost?.channel, refs,
    ghost?.follow_up_task?.title, ghost?.follow_up_task?.due
  ].map(value => String(value ?? '')).join('\0');
}

/** Display chip kind for a pending ghost on Tideline (matches accepted block colours). */
export function ghostChipDisplayKind(kind) {
  if (kind === 'schedule_workout') return 'fitness';
  if (kind === 'log_comm' || kind === 'book_comm') return 'comm';
  if (kind === 'pro_meeting') return 'professional';
  if (kind === 'pro_event') return 'event';
  return 'health';
}

function addMinutesHhmm(hhmm, minutes) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const total = h * 60 + m + minutes;
  const wrapped = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

function chipForChatGhost(input, dateKey) {
  const kind = input.kind;
  const timedKinds = new Set([
    'outing', 'meal_block', 'schedule_workout', 'protect_block', 'bedtime',
    'log_comm', 'book_comm', 'pro_meeting', 'pro_event', 'reschedule_block'
  ]);
  if (!timedKinds.has(kind) || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  let start = typeof input.start === 'string' && input.start ? input.start : null;
  let end = typeof input.end === 'string' && input.end ? input.end : null;
  if (!start && typeof input.time === 'string' && input.time) {
    start = input.time;
    end = addMinutesHhmm(input.time, 30);
  }
  if (!start || !end) return null;
  return {
    date: dateKey,
    start,
    end,
    kind: ghostChipDisplayKind(kind)
  };
}

/**
 * Build and validate a queue entry from a chat tool call.
 * Agent is forced to the calling slug. Id is deterministic and content-hashed
 * so two outings on the same day do not collide.
 */
export function calendarGhostFromToolInput(input, { agent, nowIso }) {
  if (!agent || !(agent in GHOST_AGENTS)) throw new TypeError(`Unknown agent: ${agent}`);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Ghost input must be an object');
  }
  const kind = input.kind;
  if (kind === 'reschedule_block' || kind === 'cancel_block') {
    const path = typeof input.path === 'string' ? input.path : '';
    if (!path.startsWith('data/calendar/')) {
      throw new TypeError(`${kind} path must start with data/calendar/`);
    }
  }
  const dateKey = typeof input.date === 'string' && input.date
    ? input.date
    : typeof input.from === 'string' && input.from
      ? input.from
      : typeof input.due === 'string' && input.due
        ? input.due
        : 'undated';
  const id = `${ghostId(agent, kind, dateKey)}-${chatGhostContentHash(input)}`;
  const ghost = { ...input, id, agent };
  validateGhost(ghost);
  const chip = chipForChatGhost(ghost, dateKey);
  const label = typeof ghost.title === 'string' && ghost.title.trim()
    ? ghost.title.trim()
    : (typeof ghost.subject === 'string' && ghost.subject.trim() ? ghost.subject.trim() : kind);
  return {
    ...ghost,
    ...(chip ? { chip, label } : {}),
    created_at: nowIso,
    status: 'pending',
    via: 'chat'
  };
}

/**
 * True if this entry is already in the list.
 * Chat proposals use content-hashed ids (breakfast ≠ dinner same day) — match by id only.
 * Tideline auto-proposer still dedupes by semantic key (agent+kind+date+target).
 */
export function alreadyQueued(list, entry) {
  if (entry?.via === 'chat') {
    return (list ?? []).some(item => item.id === entry.id);
  }
  const key = ghostSemanticKey(entry);
  return (list ?? []).some(item =>
    item.id === entry.id || (key && ghostSemanticKey(item) === key));
}

/** Append one ghost to the queue text. Returns the next serialized queue. */
export function appendPendingCalendarGhost(queueText, entry) {
  const doc = parsePendingCalendarGhostsDoc(queueText);
  if (alreadyQueued(doc.ghosts, entry)) {
    return {
      content: serializePendingCalendarGhosts(doc.ghosts, doc.last_run),
      added: false,
      list: doc.ghosts
    };
  }
  const next = [...doc.ghosts, entry];
  return {
    content: serializePendingCalendarGhosts(next, doc.last_run),
    added: true,
    list: next
  };
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

/** Stable task id for a ghost accept, so a retry finds the row it already wrote. */
export function ghostTaskId(ghostId) {
  return `ghost-${ghostId}`;
}

/** Stable professional blob key so Confirm + Accept cannot double-create. */
export function ghostProfessionalAcceptKey(ghostId) {
  return `ghost-accept/${ghostId}`;
}

function uuidFromGhostSeed(seed) {
  const hex = createHash('sha256').update(String(seed)).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Accept of a book_comm / log_comm / pro_meeting / pro_event ghost. */
export async function applyProfessionalStep(deps, step, { ghostId = null } = {}) {
  const boundGhostId = ghostId || step.ghostId || null;
  if (boundGhostId && typeof deps.getJSON === 'function') {
    const prior = await deps.getJSON(ghostProfessionalAcceptKey(boundGhostId));
    if (prior && typeof prior === 'object' && prior.record) return prior.record;
  }

  const remember = async (record) => {
    if (boundGhostId && typeof deps.setJSON === 'function') {
      await deps.setJSON(ghostProfessionalAcceptKey(boundGhostId), {
        action: step.action,
        record,
        at: new Date().toISOString()
      });
    }
    return record;
  };

  if (step.action === 'log_communication') {
    const time = typeof step.time === 'string' && step.time ? step.time : '12:00';
    const timeZone = step.time_zone || 'Australia/Sydney';
    const occurred = wallLocalToUtcIso(`${step.date}T${time}`, timeZone);
    const personRefs = Array.isArray(step.person_refs) ? step.person_refs : [];
    const createInput = {
      direction: step.direction,
      channel: step.channel,
      occurred_at: occurred,
      time_zone: timeZone,
      subject: step.title || step.subject || '',
      summary: typeof step.summary === 'string' ? step.summary : '',
      links: personRefs.map((ref) => ({ relationship_type: 'recipient', target_ref: ref }))
    };
    if (boundGhostId && typeof deps.createCommunicationWithId === 'function') {
      const id = `communication_${uuidFromGhostSeed(`log_comm:${boundGhostId}`)}`;
      const { communication } = await deps.createCommunicationWithId(id, createInput);
      return remember(communication);
    }
    const { communication } = await deps.createCommunication(createInput);
    return remember(communication);
  }
  if (step.action === 'create_meeting') {
    if (typeof deps.createMeeting !== 'function') {
      throw new TypeError('createMeeting is not available for this ghost accept');
    }
    const timeZone = step.time_zone || 'Australia/Sydney';
    const scheduled_start = step.scheduled_start
      || wallLocalToUtcIso(`${step.date}T${step.start}`, timeZone);
    const scheduled_end = step.scheduled_end
      || wallLocalToUtcIso(`${step.date}T${step.end}`, timeZone);
    const attendeeRefs = Array.isArray(step.attendee_refs) ? step.attendee_refs : [];
    const { meeting } = await deps.createMeeting({
      title: step.title,
      scheduled_start,
      scheduled_end,
      time_zone: timeZone,
      location_text: step.location_text ?? null,
      agenda: step.agenda ?? null,
      notes: step.notes ?? null,
      links: attendeeRefs.map((ref) => ({ relationship_type: 'attendee', target_ref: ref })),
      ...(boundGhostId ? { client_key: `ghost:${boundGhostId}` } : {})
    });
    return remember(meeting);
  }
  if (step.action === 'create_event') {
    if (typeof deps.createEvent !== 'function') {
      throw new TypeError('createEvent is not available for this ghost accept');
    }
    const timeZone = step.time_zone || 'Australia/Sydney';
    const start = step.start_iso || wallLocalToUtcIso(`${step.date}T${step.start}`, timeZone);
    const end = step.end_iso || wallLocalToUtcIso(`${step.date}T${step.end}`, timeZone);
    const attendeeRefs = Array.isArray(step.attendee_refs) ? step.attendee_refs : [];
    const { event } = await deps.createEvent({
      title: step.title,
      start,
      end,
      time_zone: timeZone,
      event_type: step.event_type || 'professional_development',
      all_day: step.all_day === true,
      location_text: step.location_text ?? null,
      hours: step.hours ?? null,
      links: attendeeRefs.map((ref) => ({ relationship_type: 'attendee', target_ref: ref })),
      ...(boundGhostId ? { client_key: `ghost:${boundGhostId}` } : {})
    });
    return remember(event);
  }
  if (step.action !== 'create_communication') throw new TypeError(`Unknown professional step: ${step.action}`);
  const start = wallLocalToUtcIso(`${step.date}T${step.time}`, step.time_zone);
  const end = new Date(Date.parse(start) + step.duration_min * 60_000).toISOString();
  const { communication } = await deps.createCommunication({
    direction: 'outbound',
    channel: step.channel,
    occurred_at: start,
    scheduled_start: start,
    scheduled_end: end,
    time_zone: step.time_zone,
    purpose_tag: step.purpose_tag,
    subject: step.title,
    links: step.person_refs.map((ref) => ({ relationship_type: 'recipient', target_ref: ref }))
  });
  if (step.thread_ref) {
    await deps.createLink({ source_ref: `professional:communication:${communication.id}`, target_ref: step.thread_ref, relationship_type: 'in_thread' });
  }
  return remember(communication);
}

/**
 * Display-only propose-action payload for chat Confirm, bound to a queued ghost id.
 * Confirm executes runGhostDecision — this write is never applied as a real file change.
 */
export function calendarGhostConfirmProposal(ghost) {
  const id = typeof ghost?.id === 'string' ? ghost.id : 'ghost';
  const kind = typeof ghost?.kind === 'string' ? ghost.kind : 'ghost';
  const title = String(ghost?.title || ghost?.subject || kind).replace(/\s+/g, ' ').trim();
  const date = ghost?.date || ghost?.due || ghost?.from || '';
  const when = date
    ? (ghost?.start && ghost?.end
      ? `${date} ${ghost.start}–${ghost.end}`
      : ghost?.time
        ? `${date} ${ghost.time}`
        : date)
    : '';
  const intent = when
    ? `Confirm calendar proposal: ${kind} — ${title} (${when})`
    : `Confirm calendar proposal: ${kind} — ${title}`;
  const reason = typeof ghost?.reason === 'string' && ghost.reason.trim()
    ? `\n\nWhy: ${ghost.reason.trim()}`
    : '';
  const content = `# Calendar ghost (confirm only)\n\nId: ${id}\nKind: ${kind}\n${title ? `Title: ${title}\n` : ''}${when ? `When: ${when}\n` : ''}${reason}\n\nAccepting runs the same plan as calendar Accept. This file is not written.\n`;
  return {
    intent,
    reads: ['pending-calendar-ghosts.json'],
    writes: [{
      path: `data/os/calendar-ghost-confirm/${id}.md`,
      mode: 'create',
      content,
      diff: intent
    }],
    surfaces: ['confirm_card', 'calendar']
  };
}

/**
 * Queue a pending calendar ghost and open a chat Confirm card bound to the
 * same ghost id. Shared by propose_calendar_ghost and propose_log_communication.
 *
 * `validateProposeActionInput` is injected so this module stays free of the
 * propose-action ↔ registry import cycle.
 */
export async function queueCalendarGhostDualPath({
  client,
  entry,
  agentSlug,
  proposeOsAction,
  send,
  validateProposeActionInput,
  findLivePendingByCalendarGhostId = null,
  extraWrites = null,
  intent = null,
  surfaces = null
}) {
  const tree = await client.resolveTree();
  const blob = (tree.tree ?? []).find(item => item.path === PENDING_CALENDAR_GHOSTS_PATH && item.type === 'blob');
  const prior = blob ? decodeBlob(await client.readBlob(blob.sha)) : '[]';
  const { content, added, list } = appendPendingCalendarGhost(prior, entry);
  let bound = entry;
  if (!added) {
    const matched = (list ?? []).find(item => item.id === entry.id)
      || (list ?? []).find(item => ghostSemanticKey(item) && ghostSemanticKey(item) === ghostSemanticKey(entry));
    if (!matched) {
      return { ok: false, error: 'ghost_conflict', detail: 'Could not bind to an existing calendar proposal.' };
    }
    const matchedStatus = statusOf(matched);
    if (matchedStatus === 'accepted' || matchedStatus === 'dismissed') {
      return {
        ok: false,
        error: 'ghost_already_decided',
        detail: `This calendar proposal was already ${matchedStatus}.`,
        id: matched.id
      };
    }
    if (ghostContentFingerprint(matched) !== ghostContentFingerprint(entry)) {
      return {
        ok: false,
        error: 'ghost_conflict',
        detail: 'A different proposal is already queued for this slot.',
        id: matched.id
      };
    }
    bound = matched;
  } else {
    await client.writeFile({
      path: PENDING_CALENDAR_GHOSTS_PATH,
      content,
      ...(blob?.sha ? { sha: blob.sha } : {}),
      message: `chore(calendar): propose ${entry.id}`
    });
  }
  const reply = bound.kind === 'log_comm'
    ? 'Ready to log — Confirm here or Accept on the calendar.'
    : 'Proposed on your calendar. Confirm here or Accept on the calendar.';
  if (typeof send === 'function') {
    send({
      type: 'calendar_ghost_proposed',
      id: bound.id,
      reply
    });
  }
  const confirmInput = calendarGhostConfirmProposal(bound);
  const companions = Array.isArray(extraWrites) ? extraWrites.filter(Boolean) : [];
  const proposalInput = companions.length
    ? {
      ...confirmInput,
      intent: (typeof intent === 'string' && intent.trim()) || confirmInput.intent,
      surfaces: Array.isArray(surfaces) && surfaces.length
        ? surfaces
        : ['confirm_card', 'calendar', 'governance_log'],
      writes: [...companions, ...confirmInput.writes]
    }
    : confirmInput;
  const validated = typeof validateProposeActionInput === 'function'
    ? validateProposeActionInput(proposalInput, { agentSlug })
    : { ok: false };
  let pendingId = null;
  if (validated.ok && typeof proposeOsAction === 'function') {
    const existing = typeof findLivePendingByCalendarGhostId === 'function'
      ? findLivePendingByCalendarGhostId(bound.id)
      : null;
    if (existing && typeof existing.id === 'string' && existing.id.trim()) {
      // Re-surface the same Confirm card instead of twinning the queue / narrating
      // "re-queued" with no action_proposal SSE for Adam to tap.
      pendingId = existing.id.trim();
      if (typeof send === 'function') {
        send({
          type: 'action_proposal',
          proposal: existing.proposal && typeof existing.proposal === 'object'
            ? existing.proposal
            : validated.proposal,
          id: pendingId
        });
      }
    } else {
      pendingId = await proposeOsAction(validated.proposal, { calendarGhostId: bound.id });
    }
  }
  const writes = validated.ok
    ? validated.proposal.writes
    : proposalInput.writes;
  // Never tell the model "awaiting_confirm" without a chat Confirm id — that is
  // how Clare claims cards exist while the DOM has none.
  if (!pendingId) {
    return {
      ok: true,
      status: 'calendar_queued',
      id: bound.id,
      ghost_status: added ? 'queued' : 'already_queued',
      intent: validated.ok ? validated.proposal.intent : proposalInput.intent,
      writes: writes.map(write => ({
        path: write.path,
        mode: write.mode,
        diff: write.diff
      })),
      card: false,
      reply: added
        ? 'Queued on the calendar. Accept it there — no chat Confirm card opened.'
        : 'Already on the calendar. Accept it there — no chat Confirm card opened.'
    };
  }
  return {
    ok: true,
    status: 'awaiting_confirm',
    id: bound.id,
    ghost_status: added ? 'queued' : 'already_queued',
    intent: validated.ok ? validated.proposal.intent : proposalInput.intent,
    writes: writes.map(write => ({
      path: write.path,
      mode: write.mode,
      diff: write.diff
    })),
    pendingId,
    card: true,
    reply
  };
}

export async function applyTaskStep(store, step, { ghostId } = {}) {
  if (step.method === 'PATCH' && step.collection === 'goals') {
    const key = `goals/${step.id}`;
    const existing = await getJSON(store, key);
    if (!existing || typeof existing !== 'object') {
      throw Object.assign(new Error('Goal not found'), { code: 'goal_not_found' });
    }
    await setJSON(store, key, normalizeGoalRecord({ ...existing, ...(step.body ?? {}), updated_at: new Date().toISOString() }));
    return;
  }
  if (step.method === 'PATCH' && step.collection === 'work_blocks') {
    const key = `work_blocks/${step.id}`;
    const existing = await getJSON(store, key);
    if (!existing || typeof existing !== 'object') {
      throw Object.assign(new Error('Work block not found'), { code: 'work_block_not_found' });
    }
    const body = step.body ?? {};
    const next = { ...existing, updated_at: new Date().toISOString() };
    if (typeof body.date === 'string') next.date = body.date;
    if (typeof body.start_time === 'string') next.start_time = body.start_time;
    if (Number.isFinite(body.duration_minutes) && body.duration_minutes > 0) next.duration_minutes = body.duration_minutes;
    await setJSON(store, key, next);
    return;
  }
  if (step.method === 'POST' && step.collection === 'work_blocks') {
    const body = step.body ?? {};
    const minutes = Number(body.duration_minutes);
    if (typeof body.title !== 'string' || !body.title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '')
      || !/^\d{2}:\d{2}$/.test(body.start_time ?? '') || !(minutes > 0)) {
      throw Object.assign(new Error('title, date, start_time and duration are required'), { code: 'validation_error' });
    }
    // Idempotent on the ghost: a retried accept never makes a second block.
    const id = ghostId ? `wblock-${String(ghostId).replace(/[^a-z0-9-]/gi, '-').slice(0, 80)}` : `wblock-${Date.now().toString(36)}`;
    const key = `work_blocks/${id}`;
    const stamp = new Date().toISOString();
    if (!(await getJSON(store, key))) {
      await setJSON(store, key, {
        schema_version: 1,
        id,
        title: body.title.trim(),
        date: body.date,
        start_time: body.start_time,
        duration_minutes: Math.round(minutes),
        task_id: typeof body.task_id === 'string' ? body.task_id : null,
        project_id: null,
        depth: 'deep',
        status: 'confirmed',
        source: typeof body.source === 'string' ? body.source : 'agent',
        locked: false,
        created_at: stamp,
        updated_at: stamp
      });
    }
    const ids = await readIndex(store, 'work_blocks/_index');
    if (!ids.includes(id)) await writeIndex(store, 'work_blocks/_index', [...ids, id]);
    return;
  }
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
    const baseId = ghostId ? ghostTaskId(ghostId) : newTaskId();
    const id = ghostId && typeof step.suffix === 'string' && step.suffix ? `${baseId}-${step.suffix}` : baseId;
    if (ghostId) {
      const existing = await getJSON(store, taskKey(id));
      if (existing && typeof existing === 'object') {
        const ids = await readTaskIndex(store);
        if (!ids.includes(id)) await writeTaskIndex(store, [...ids, id]);
        return;
      }
    }
    const task = normalizeTaskRecord({
      schema_version: 1,
      id,
      title,
      description: typeof body.notes === 'string' ? body.notes : '',
      kind: body.kind === 'step' && typeof body.parent_task_id === 'string' ? 'step' : 'task',
      bucket: 'active',
      domain,
      status: typeof body.status === 'string' && body.status ? body.status : 'open',
      priority: 'medium',
      parent_project_id: null,
      parent_goal_id: typeof body.parent_goal_id === 'string' ? body.parent_goal_id : null,
      parent_task_id: typeof body.parent_task_id === 'string' ? body.parent_task_id : null,
      step_order: Number.isInteger(body.step_order) ? body.step_order : 0,
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
  const doc = parsePendingCalendarGhostsDoc(await opened.readFile(PENDING_CALENDAR_GHOSTS_PATH));
  const queue = doc.ghosts;
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

  // Step 1 already landed. Retry runs only the tasks/professional steps.
  if (status === 'accepted' && entry.tasks_pending === true) {
    return { kind: 'tasks-only', plan, taskSteps: plan.steps.filter(step => step.target === 'tasks' || step.target === 'professional') };
  }

  if (decision === 'dismiss') {
    const changed = new Map();
    changed.set(PENDING_CALENDAR_GHOSTS_PATH, serializePendingCalendarGhosts(markGhost(queue, id, {
      status: 'dismissed',
      decided_at: nowIso
    }), doc.last_run));
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
    if (step.target === 'professional') {
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
  }), doc.last_run));
  return {
    kind: 'accept',
    changed,
    plan,
    taskSteps,
    drafts,
    message: `chore(calendar): accept ${id}`
  };
}

/** Almanac ghosts are recomputed, not queued. Same writes as settle, with no queue file. */
async function settleAlmanac(opened, plans, { nowIso }) {
  const changed = new Map();
  const drafts = [];
  const taskSteps = [];
  let central = await opened.readFile(CENTRAL_NODE_PATH);
  let centralTouched = false;

  for (const plan of plans) {
    for (const step of plan.steps) {
      if (step.target === 'draft') {
        drafts.push({ to: step.to ?? null, text: typeof step.text === 'string' ? step.text : '' });
        continue;
      }
      if (step.target === 'tasks') {
        taskSteps.push({ ...step, ghostId: plan.ghostId });
        continue;
      }
      if (step.target === 'central_node') {
        if (typeof central !== 'string') return fail(404, 'central_node_missing', 'Central Node is not available.');
        const patch = validateCentralNodePatchInput(step.patch);
        if (!patch) return fail(400, 'invalid_patch', 'This Central Node patch could not be validated.');
        const next = applyCentralNodePatch(central, patch);
        if (!next) return fail(400, 'apply_failed', 'This Central Node patch could not be applied.');
        central = next;
        centralTouched = true;
        continue;
      }
      if (step.target === 'life_record') {
        const written = await applyLifeStep(opened, step, { nowIso, ghostId: plan.ghostId });
        if (written.status) return written;
        changed.set(written.path, written.content);
        continue;
      }
      return fail(400, 'unknown_step', 'This ghost plan has a step the server cannot run.');
    }
  }

  if (centralTouched) changed.set(CENTRAL_NODE_PATH, central);
  return {
    kind: 'accept',
    changed,
    plan: { receipt: plans.map(plan => plan.receipt).join(' ') },
    taskSteps,
    drafts,
    message: `chore(calendar): accept ${plans[0].ghostId}`
  };
}

async function runAlmanacGhostDecision({
  open, commit, tasksStore, decision, today, nowIso, lessons = [], professionalEvents = [], horizon = null
}) {
  if (decision.decision === 'dismiss') return applied({ receipt: 'Dismissed. Nothing written.' });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const opened = await open();
    const terms = await readSchoolTerms(tasksStore);
    const view = await readAlmanac({
      readFile: path => opened.readFile(path),
      listPaths: () => (typeof opened.listPaths === 'function' ? opened.listPaths() : []),
      today,
      terms,
      lessons,
      professionalEvents,
      horizon
    });
    const ghosts = ghostsForAlmanacAction(decision.id, view);
    if (!ghosts) return fail(404, 'ghost_not_found', 'No pending ghost matches this id.');

    const plans = [];
    for (const ghost of ghosts) {
      try {
        plans.push(acceptPlan(ghost, { today }));
      } catch (error) {
        const message = error instanceof TypeError ? error.message : 'This ghost could not be validated.';
        return fail(400, 'invalid_ghost', message);
      }
    }

    if (plans.every(plan => plan.steps.every(step => step.target === 'draft'))) {
      const drafts = plans.flatMap(plan => plan.steps
        .filter(step => step.target === 'draft')
        .map(step => ({ to: step.to ?? null, text: typeof step.text === 'string' ? step.text : '' })));
      return applied({ receipt: plans.map(plan => plan.receipt).join(' ') }, { drafts });
    }

    // A successful create already stored ghost-<id>. A retry must not write the line again.
    if (plans.every(plan => plan.steps.some(step => step.target === 'tasks' && step.method === 'POST'))) {
      const store = await tasksStore();
      let allExist = true;
      for (const plan of plans) {
        const existing = await getJSON(store, taskKey(ghostTaskId(plan.ghostId)));
        if (!existing || typeof existing !== 'object') {
          allExist = false;
          break;
        }
      }
      if (allExist) return applied({ receipt: plans.map(plan => plan.receipt).join(' ') });
    }

    const settlement = await settleAlmanac(opened, plans, { nowIso });
    if (settlement.status) return settlement;
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

async function clearTasksPending(open, commit, id) {
  const opened = await open();
  const doc = parsePendingCalendarGhostsDoc(await opened.readFile(PENDING_CALENDAR_GHOSTS_PATH));
  const entry = findGhost(doc.ghosts, id);
  if (!entry || entry.tasks_pending !== true) return;
  const changed = new Map([[
    PENDING_CALENDAR_GHOSTS_PATH,
    serializePendingCalendarGhosts(markGhost(doc.ghosts, id, { tasks_pending: false }), doc.last_run)
  ]]);
  await commit(changed, opened.base, `chore(calendar): tasks applied ${id}`);
}

/** Goal ghosts are recomputed from Hammond's goal read, not queued (spec: Goals redesign). */
async function runGoalGhostDecision({ open, commit, tasksStore, decision, today, nowIso }) {
  const goalId = goalIdFromGhostId(decision.id);
  if (!goalId) return fail(404, 'ghost_not_found', 'No pending ghost matches this id.');
  const store = await tasksStore();
  const { appendDecision } = await import('./_shared/goal-dismissal-learn.mjs');

  const kindGuess = decision.id.includes('-block-')
    ? 'protect_block'
    : decision.id.includes('-rest-')
      ? 'goal_rest_weeks'
      : decision.id.includes('-split-')
        ? 'split_task'
        : decision.id.includes('-move-')
          ? 'move_task'
          : decision.id.includes('-start')
            ? 'create_task'
            : 'unknown';

  if (decision.decision === 'dismiss') {
    const cached = (await getJSON(store, goalReadKey(goalId))) ?? {};
    const dismissed = [...new Set([...(Array.isArray(cached.dismissed) ? cached.dismissed : []), decision.id])];
    const read = cached.read ? { ...cached.read, ghosts: (cached.read.ghosts ?? []).filter(g => g.id !== decision.id) } : null;
    await setJSON(store, goalReadKey(goalId), { ...cached, read, dismissed });
    const ghostKind = cached.read?.ghosts?.find?.(g => g.id === decision.id)?.kind ?? kindGuess;
    await appendDecision(store, { kind: ghostKind, outcome: 'dismiss', at: nowIso }, { getJSON, setJSON }).catch(() => undefined);
    return applied({ receipt: 'Dismissed. Nothing written.' });
  }

  const inputs = await loadGoalInputs(store);
  const goal = inputs.goals.find(item => item.id === goalId);
  if (!goal) return fail(404, 'ghost_not_found', 'No pending ghost matches this id.');
  // Accept the proposal the panel showed. A fresh read can omit it and 404 a confirm that is still on screen.
  const cached = (await getJSON(store, goalReadKey(goalId))) ?? {};
  const cachedGhost = cached.read?.ghosts?.find(item => item.id === decision.id);
  const read = cachedGhost
    ? null
    : buildGoalRead({ goal, projects: inputs.projects, tasks: inputs.tasks, terms: inputs.terms, today });
  const ghost = cachedGhost ?? read.ghosts.find(item => item.id === decision.id);
  if (!ghost) return fail(404, 'ghost_not_found', 'This proposal no longer applies.');

  let plan;
  try {
    plan = acceptPlan(ghost, { today });
  } catch (error) {
    return fail(400, 'invalid_ghost', error instanceof TypeError ? error.message : 'This ghost could not be validated.');
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const opened = await open();
    const settlement = await settleAlmanac(opened, [plan], { nowIso });
    if (settlement.status) return settlement;
    try {
      if (settlement.changed.size) await commit(settlement.changed, opened.base, settlement.message);
    } catch (error) {
      if (error instanceof GitHubClientError && error.code === 'write_conflict' && attempt === 0) continue;
      throw error;
    }
    const result = await finishTasks({ open, commit, tasksStore, id: decision.id, settlement });
    const cached = (await getJSON(store, goalReadKey(goalId))) ?? {};
    await setJSON(store, goalReadKey(goalId), { ...cached, read: null });
    await appendDecision(store, { kind: ghost.kind, outcome: 'accept', at: nowIso }, { getJSON, setJSON }).catch(() => undefined);
    return result;
  }
  return fail(409, 'write_conflict', 'The repository changed while accepting. Try again.');
}

/**
 * Execute one stored ghost. `open` reads a snapshot, `commit` writes one
 * GitHub commit (or the mock equivalent). Tasks run only after that commit.
 */
export async function runGhostDecision({
  open, commit, tasksStore, professionalDeps, decision, today, nowIso, lessons = [], professionalEvents = [], horizon = null
}) {
  if (typeof decision.id === 'string' && decision.id.startsWith('alm-')) {
    return runAlmanacGhostDecision({
      open, commit, tasksStore, decision, today, nowIso, lessons, professionalEvents, horizon
    });
  }
  if (typeof decision.id === 'string' && decision.id.startsWith('goal-')) {
    return runGoalGhostDecision({ open, commit, tasksStore, decision, today, nowIso });
  }
  // ponytail: one stale-SHA retry. On write_conflict, re-read and rebuild from
  // the current tree. A second conflict is returned to the client.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const opened = await open();
    const settlement = await settle(opened, { ...decision, today, nowIso });
    if (settlement.status) return settlement;
    if (settlement.kind === 'tasks-only') {
      return finishTasks({ open, commit, tasksStore, professionalDeps, id: decision.id, settlement });
    }
    try {
      if (settlement.changed.size) await commit(settlement.changed, opened.base, settlement.message);
    } catch (error) {
      if (error instanceof GitHubClientError && error.code === 'write_conflict' && attempt === 0) continue;
      throw error;
    }
    return finishTasks({ open, commit, tasksStore, professionalDeps, id: decision.id, settlement });
  }
  return fail(409, 'write_conflict', 'The repository changed while accepting. Try again.');
}

async function finishTasks({ open, commit, tasksStore, professionalDeps, id, settlement }) {
  if (!settlement.taskSteps.length) return applied(settlement.plan, { drafts: settlement.drafts ?? [] });
  try {
    const store = await tasksStore();
    for (const step of settlement.taskSteps) {
      if (step.target === 'professional') {
        await applyProfessionalStep(await professionalDeps(), step, { ghostId: step.ghostId ?? id });
      } else {
        await applyTaskStep(store, step, { ghostId: step.ghostId ?? id });
      }
    }
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
  getTasksStore = defaultGetTasksStore,
  getCognitiveStore = defaultGetCognitiveStore,
  loadLessons = loadTeachingLessonsFromBlobs,
  loadProfessionalEvents = loadProfessionalEventsFromBlobs
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
        listPaths() { return [...blobs.keys()]; },
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
        const instant = new Date(now());
        const today = getSydneyDateKey(instant);
        const nowIso = getSydneyTimestamp(instant);

        // Calendar open: refresh proposals when the range covers today and
        // the last run is stale or Life records for today changed. Load school
        // terms / lessons / professional events only when a refresh will run.
        if (from <= today && to >= today) {
          try {
            const {
              runCalendarGhostsPropose,
              peekRefreshDue
            } = await import('./_shared/calendar-ghosts-propose.mjs');
            const due = await peekRefreshDue({
              open,
              today,
              nowMs: instant.getTime()
            });
            if (due) {
              const tasksStoreFn = () => getTasksStore(env);
              const terms = await readSchoolTerms(tasksStoreFn);
              const [lessons, professionalEvents] = await Promise.all([
                loadLessons(env),
                loadProfessionalEvents(env)
              ]);
              await runCalendarGhostsPropose({
                open,
                commit,
                today,
                nowIso,
                nowMs: instant.getTime(),
                terms,
                lessons,
                professionalEvents,
                trigger: 'refresh'
              });
            }
          } catch (error) {
            console.warn('calendar-ghosts GET refresh propose failed', error);
          }
        }

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
      let lessons = [];
      let professionalEvents = [];
      let horizon = null;
      if (decision.id.startsWith('alm-')) {
        [lessons, professionalEvents, horizon] = await Promise.all([
          loadLessons(env),
          loadProfessionalEvents(env),
          loadHorizonAlmanacContext(env, { getCognitiveStore })
        ]);
      }
      const result = await runGhostDecision({
        open,
        commit,
        tasksStore: () => getTasksStore(env),
        professionalDeps: async () => {
          const professionalStore = await defaultGetProfessionalStore(env);
          const repo = createCommunicationRepository({ store: professionalStore, env });
          const meetingRepo = createMeetingRepository({ store: professionalStore, env });
          const eventRepo = createEventRepository({ store: professionalStore, env });
          const universalLinkStore = await defaultGetUniversalLinkStore(env);
          const links = createUniversalLinkRepository({ store: universalLinkStore });
          const accessContext = createAccessContext({ workflow: 'life' });
          return {
            createCommunication: (input) => repo.createCommunication(input),
            createMeeting: (input) => meetingRepo.createMeeting(input),
            createEvent: (input) => eventRepo.createEvent(input),
            createLink: (link) => links.createLink(link, accessContext),
            getJSON: (key) => getProfessionalJSON(professionalStore, key),
            setJSON: (key, value) => setProfessionalJSON(professionalStore, key, value)
          };
        },
        decision,
        today: getSydneyDateKey(instant),
        nowIso: getSydneyTimestamp(instant),
        lessons,
        professionalEvents,
        horizon
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
