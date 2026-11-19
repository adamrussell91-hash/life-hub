/**
 * Fleet week, teacher actions (POST /api/lessons/:lesson/game, operator gate;
 * spec §3.3, plan Task 6). The control room sees real names; students never do
 * until the reveal.
 *
 *   campaign_open    { game_id, class_id, mode: 'lesson', rounds?, round_cap_s?, balance? } → campaign_state
 *   campaign_state   { game_id, class_id } → names, matches, who has fired, owed reports, flags, standings
 */
import { randomBytes } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { draftLessonKey, publishedLessonKey } from './teaching-blobs.mjs';
import { loadRoster } from './class-claims.mjs';
import { deviceHash, read, reject } from './question-drop.mjs';
import { gameKeys } from './game-store.mjs';
import { fleet } from './game-rules.mjs';
import {
  ensureResolved, findCampaign, firstClock, list, loadFleetGame, obj, readWithEtag, roundsOf
} from './fleet-week-store.mjs';

export const FLEET_TEACHER_ACTIONS = ['campaign_open', 'campaign_state'];
export const isFleetTeacherAction = (action) => typeof action === 'string' && (action.startsWith('campaign_') || action === 'void_shot' || action === 'reject_report');

const clampInt = (v, min, max, fallback) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Math.round(Number(v)))) : fallback);
const ownerFor = (classId, studentId) => deviceHash(`student:${classId}:${studentId}`);

async function teacherContext(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) reject(400, 'bad_request', 'Invalid request.');
  if (!isSafeId(lessonId)) reject(404, 'not_found', 'Game not found.');
  const draft = await read(store, draftLessonKey(lessonId));
  if (!draft || isDeletedRecord(draft) || draft.pedagogical_mode !== 'game') reject(404, 'not_found', 'Game not found.');
  const k = gameKeys(lessonId);
  const classId = typeof body.class_id === 'string' ? body.class_id : '';
  const roster = await loadRoster(store, classId);
  if (!roster) reject(404, 'not_found', 'Class not found.');
  return { k, roster, classId: roster.cls.id };
}

async function openCampaign(store, lessonId, body, { k, roster, classId }, now) {
  if (body.mode === 'week') reject(409, 'week_mode_later', 'Week mode isn’t ready yet. Play it in one lesson for now.');
  if (body.mode !== undefined && body.mode !== 'lesson') reject(400, 'bad_mode', 'Pick lesson mode.');
  if (!roster.students.length) reject(409, 'need_roster', 'Fleet week needs a class list. Add one first.');
  const { record } = await loadFleetGame(store, k, body.game_id);
  const currentKey = k.campaignCurrent(body.game_id, classId);
  const held = await readWithEtag(store, currentKey);
  if (held.data?.id) {
    const existing = await read(store, k.campaign(body.game_id, held.data.id));
    if (existing && !existing.closed_at) return existing;
  }
  const published = await read(store, publishedLessonKey(lessonId));
  const settings = obj(list(published?.game?.games).find((g) => g.id === body.game_id)?.settings);
  const id = randomBytes(8).toString('hex');
  const joined = roster.students.map((s) => ownerFor(classId, s.id));
  const campaign = {
    id,
    lesson: lessonId,
    game_id: body.game_id,
    version: record.version,
    class_id: classId,
    mode: 'lesson',
    secret: randomBytes(16).toString('hex'),
    created_at: now,
    settings: {
      rounds: clampInt(body.rounds ?? settings.rounds, 2, 8, 5),
      round_cap_ms: clampInt(body.round_cap_s ?? settings.round_cap_s, 60, 600, 240) * 1000,
      placement_cap_ms: clampInt(settings.placement_cap_s, 30, 300, 120) * 1000,
      answer_ms: clampInt(settings.answer_s, 20, 120, 60) * 1000
    },
    // Random teams; "mixed by accuracy" balancing arrives with plan 4.
    pairing: fleet.pairTeams(joined, fleet.rng(`${id}:teams`)),
    joined,
    students: Object.fromEntries(roster.students.map((s) => [ownerFor(classId, s.id), s.id])),
    revealed_at: null,
    closed_at: null
  };
  await store.setJSON(k.campaign(body.game_id, id), campaign, { onlyIfNew: true });
  await store.setJSON(k.campaignClock(body.game_id, id), firstClock(campaign, now), { onlyIfNew: true });
  const pointed = await store.setJSON(currentKey, { id }, held.data ? (held.etag ? { onlyIfMatch: held.etag } : {}) : { onlyIfNew: true });
  if (pointed?.modified === false) {
    // Another open won the race: use theirs.
    const theirs = await findCampaign(store, k, body.game_id, classId);
    if (theirs) return theirs;
    reject(409, 'retry', 'Please try again.');
  }
  return campaign;
}

/** The control room: real names, teams, the clock and standings. */
async function campaignState(store, k, campaign, roster, now) {
  const { state, clock } = await ensureResolved(store, k, campaign, now);
  const byId = new Map(roster.students.map((s) => [s.id, s]));
  const person = (owner) => {
    const s = byId.get(campaign.students[owner]);
    return { owner, student_id: campaign.students[owner] ?? null, name: s?.name ?? 'Unknown', initials: s?.initials ?? '' };
  };
  return {
    campaign_id: campaign.id,
    mode: campaign.mode,
    round: clock.round,
    rounds: roundsOf(campaign),
    closes_at: clock.closes_at,
    revealed_at: campaign.revealed_at,
    closed_at: campaign.closed_at,
    teams: campaign.pairing.teams.map((t) => ({ id: t.id, ghost: !!t.ghost, members: t.owners.map(person) })),
    matches: campaign.pairing.matches,
    standings: fleet.standings(state, campaign.pairing)
  };
}

/** Teacher actions on a Fleet week campaign. */
export async function fleetTeacherAction(store, lessonId, body, { now = Date.now() } = {}) {
  const ctx = await teacherContext(store, lessonId, body);
  const action = body.action;
  if (!FLEET_TEACHER_ACTIONS.includes(action)) reject(400, 'bad_action', 'Unknown action.');
  if (action === 'campaign_open') {
    const campaign = await openCampaign(store, lessonId, body, ctx, now);
    return campaignState(store, ctx.k, campaign, ctx.roster, now);
  }
  await loadFleetGame(store, ctx.k, body.game_id);
  const campaign = await findCampaign(store, ctx.k, body.game_id, ctx.classId, body.campaign_id);
  if (!campaign) reject(404, 'no_campaign', 'No Fleet week is running for this class.');
  return campaignState(store, ctx.k, campaign, ctx.roster, now);
}
