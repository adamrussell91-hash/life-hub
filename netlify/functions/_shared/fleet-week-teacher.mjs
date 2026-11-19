/**
 * Fleet week, teacher actions (POST /api/lessons/:lesson/game, operator gate;
 * spec §3.3, plan Task 6). The control room sees real names; students never do
 * until the reveal.
 *
 *   campaign_open    { game_id, class_id, mode: 'lesson' | 'week', rounds?, round_cap_s?, cutoff? ('20:00'), balance? } → campaign_state
 *   campaign_state   { game_id, class_id } → names, matches, who has fired, owed reports, flags, standings
 *   campaign_next    lesson mode: close the open round now (it resolves on this request)
 *   void_shot        { round, owner, seq } while that round is open: the shot becomes a void dud that does not return
 *   reject_report    { hit } return a filed damage report to the partner, once
 *   campaign_reveal  (any phase) settle every open hit and recall line (resolved/final); students see names and both fleets
 *   campaign_close   end it and free the class for a new campaign
 */
import { randomBytes } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { draftLessonKey, publishedLessonKey } from './teaching-blobs.mjs';
import { loadRoster } from './class-claims.mjs';
import { deviceHash, read, reject } from './question-drop.mjs';
import { campaignIndexKey, gameKeys } from './game-store.mjs';
import { fleet } from './game-rules.mjs';
import { mapBounded } from './blobs-list.mjs';
import {
  FLEET_TZ, allReports, ensureCampaign, ensureResolved, findCampaign, firstClock, revealCampaign, validZone, weekCloses, isDone, list, loadFleetGame, obj, readWithEtag, reportInputs, roundOpen, roundsOf,
  seedFor, updateJSON
} from './fleet-week-store.mjs';

/** Campaigns kept in a class's index (the oldest drop off). */
const INDEX_KEEP = 20;

/** Week mode's firing days by default (Tuesday to Thursday when opened on a Monday). */
const WEEK_ROUNDS = 3;

/** A pointer whose campaign blob never arrived (its open died half way) is free after this long. */
const POINTER_STALE_MS = 10000;

export const FLEET_TEACHER_ACTIONS = ['campaign_open', 'campaign_state', 'campaign_next', 'void_shot', 'reject_report', 'campaign_reveal', 'campaign_close'];
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

const CUTOFF = /^([01]\d|2[0-3]):[0-5]\d$/;

async function openCampaign(store, lessonId, body, { k, roster, classId }, now) {
  const mode = body.mode ?? 'lesson';
  if (mode !== 'lesson' && mode !== 'week') reject(400, 'bad_mode', 'Pick week or lesson mode.');
  if (body.cutoff !== undefined && (typeof body.cutoff !== 'string' || !CUTOFF.test(body.cutoff))) reject(400, 'bad_cutoff', 'Give the cut-off as a time, like 20:00.');
  if (!roster.students.length) reject(409, 'need_roster', 'Fleet week needs a class list. Add one first.');
  const { record } = await loadFleetGame(store, k, body.game_id);
  const currentKey = k.campaignCurrent(body.game_id, classId);
  const held = await readWithEtag(store, currentKey);
  if (held.data?.id) {
    const existing = await read(store, k.campaign(body.game_id, held.data.id));
    if (existing && !existing.closed_at) return existing;
    if (!existing && now - (held.data.at ?? 0) < POINTER_STALE_MS) reject(409, 'retry', 'A game is opening. Try again in a moment.');
  }
  const published = await read(store, publishedLessonKey(lessonId));
  const settings = obj(list(published?.game?.games).find((g) => g.id === body.game_id)?.settings);
  const id = randomBytes(8).toString('hex');
  const secret = randomBytes(16).toString('hex');
  const joined = roster.students.map((s) => ownerFor(classId, s.id));
  const campaign = {
    id,
    lesson: lessonId,
    game_id: body.game_id,
    version: record.version,
    class_id: classId,
    mode,
    secret,
    created_at: now,
    settings: {
      // Week mode: placement on the open day, then three firing days (§1.3) unless the teacher says otherwise.
      rounds: mode === 'week' ? clampInt(body.rounds, 1, 8, WEEK_ROUNDS) : clampInt(body.rounds ?? settings.rounds, 2, 8, 5),
      round_cap_ms: clampInt(body.round_cap_s ?? settings.round_cap_s, 60, 600, 240) * 1000,
      placement_cap_ms: clampInt(settings.placement_cap_s, 30, 300, 120) * 1000,
      answer_ms: clampInt(settings.answer_s, 20, 120, 60) * 1000,
      ...(mode === 'week' ? { cutoff: body.cutoff ?? (CUTOFF.test(settings.cutoff ?? '') ? settings.cutoff : '20:00'), tz: validZone(roster.cls.time_zone) ?? FLEET_TZ } : {})
    },
    // Random teams; "mixed by accuracy" balancing arrives with plan 4.
    pairing: fleet.pairTeams(joined, fleet.rng(seedFor(secret, 'teams'))),
    joined,
    students: Object.fromEntries(roster.students.map((s) => [ownerFor(classId, s.id), s.id])),
    revealed_at: null,
    closed_at: null
  };
  // Week mode: every round's close, fixed at the open (placement first).
  if (mode === 'week') campaign.schedule = weekCloses(now, campaign.settings.cutoff, campaign.settings.rounds, campaign.settings.tz);
  // The class pointer first, create-only (or over the closed one we read): a losing open writes nothing.
  const pointed = await store.setJSON(currentKey, { id, at: now }, held.data ? (held.etag ? { onlyIfMatch: held.etag } : {}) : { onlyIfNew: true });
  if (pointed?.modified === false) {
    const theirs = await findCampaign(store, k, body.game_id, classId);
    if (theirs && !theirs.closed_at) return theirs;
    reject(409, 'retry', 'A game is opening. Try again in a moment.');
  }
  await store.setJSON(k.campaignClock(body.game_id, id), firstClock(campaign, now), { onlyIfNew: true });
  await store.setJSON(k.campaign(body.game_id, id), campaign, { onlyIfNew: true });
  // The class index, so student pages with no lesson id can find this campaign's signals.
  await updateJSON(store, campaignIndexKey(classId), (held) => {
    const kept = list(obj(held).campaigns).filter((e) => e?.id !== id);
    return { campaigns: [...kept, { lesson_id: lessonId, game_id: body.game_id, id, at: now }].slice(-INDEX_KEEP) };
  });
  return campaign;
}

const flagged = (w) => !!w && (w.pastes > 0 || w.away > 0 || w.jumps > 0);

/** The control room: real names, who has fired this round, owed reports, writing flags with their logs, standings. */
async function campaignState(store, k, opened, roster, now) {
  const { campaign, state, clock } = await ensureCampaign(store, k, opened, now);
  const shown = (campaign.revealed_at && (await read(store, k.campaignResolved(campaign.game_id, campaign.id, 'final')))) || state;
  const byId = new Map(roster.students.map((s) => [s.id, s]));
  const nameOf = (owner) => byId.get(campaign.students[owner])?.name ?? 'Unknown';
  const owners = list(campaign.joined);
  const lastRound = Math.min(clock.round, roundsOf(campaign));
  const rounds = Array.from({ length: Math.max(0, lastRound) }, (_, i) => i + 1);
  const shotRows = await mapBounded(rounds.flatMap((r) => owners.map((o) => [r, o])), 8, ([r, o]) => read(store, k.campaignShots(campaign.game_id, campaign.id, r, o)));
  const shotsBy = new Map();
  rounds.flatMap((r) => owners.map((o) => [r, o])).forEach(([r, o], i) => shotsBy.set(`${r}:${o}`, list(shotRows[i])));
  const reports = await allReports(store, k, campaign);
  const { rejected } = reportInputs(reports);

  const flags = [];
  for (const [key, shots] of shotsBy) {
    for (const s of shots) {
      if (flagged(s.writing)) flags.push({ kind: 'answer', owner: s.owner, name: nameOf(s.owner), round: Number(key.split(':')[0]), square: s.square, seq: s.seq, pastes: s.writing.pastes, away: s.writing.away, jumps: s.writing.jumps, writing: s.writing });
    }
  }
  for (const [owner, r] of Object.entries(reports)) {
    for (const [hit, f] of Object.entries(obj(r.filed))) if (flagged(f.writing)) flags.push({ kind: 'report', owner: f.by ?? owner, name: nameOf(f.by ?? owner), round: f.round, hit, pastes: f.writing.pastes, away: f.writing.away, jumps: f.writing.jumps, writing: f.writing });
    for (const [ship, line] of Object.entries(obj(r.recall))) if (flagged(line.writing)) flags.push({ kind: 'recall', owner, name: nameOf(owner), round: line.round, ship, pastes: line.writing.pastes, away: line.writing.away, jumps: line.writing.jumps, writing: line.writing });
  }

  const filings = Object.entries(reports).flatMap(([owner, r]) => Object.entries(obj(r.filed)).map(([hit, f]) => ({ hit, owner: f.by ?? owner, ...f })));
  const owed = shown.hits.filter((h) => h.status === 'owed').map((h) => {
    const filing = filings.find((f) => f.hit === h.id);
    const times = rejected[h.id] ?? 0;
    return {
      hit: h.id, team: h.team, by: nameOf(h.owner), square: h.square, round: h.round, due: h.round + 1 + Math.min(times, 1), rejected: times,
      filed: filing ? { by: nameOf(filing.owner), text: filing.text, round: filing.round } : null
    };
  });
  const member = (owner) => ({
    owner, student_id: campaign.students[owner] ?? null, name: nameOf(owner), initials: byId.get(campaign.students[owner])?.initials ?? '',
    shots: (shotsBy.get(`${clock.round}:${owner}`) ?? []).length, done: isDone(clock, owner, clock.round, now), seen: obj(clock.seen)[owner] === clock.round
  });
  return {
    campaign_id: campaign.id,
    mode: campaign.mode,
    ...(campaign.mode === 'week' ? { cutoff: campaign.settings.cutoff, tz: campaign.settings.tz, schedule: list(campaign.schedule) } : {}),
    round: clock.round,
    rounds: roundsOf(campaign),
    closes_at: clock.closes_at,
    revealed_at: campaign.revealed_at,
    closed_at: campaign.closed_at,
    teams: campaign.pairing.teams.map((t) => ({ id: t.id, ghost: !!t.ghost, members: t.owners.map(member), fleet: list(shown.fleets?.[t.id]), damage: shown.damage?.[t.id] ?? 0 })),
    matches: campaign.pairing.matches.map((m) => ({ ...m, ended: !!shown.ended?.[m.id] })),
    owed,
    flags,
    log: shown.log.map((l) => ({ round: l.round, results: l.results.map((r) => ({ ...r, name: nameOf(r.owner) })) })),
    standings: fleet.standings(shown, campaign.pairing),
    // The server clock, so the control room's countdown never trusts the device's.
    now,
    // Every shot committed in the open round, for Void shot (`owner` and `seq` are what void_shot takes). No answer text.
    shots: roundOpen(campaign, clock) && clock.round >= 1
      ? owners.flatMap((o) => (shotsBy.get(`${clock.round}:${o}`) ?? []).map((s) => ({
        round: clock.round, owner: o, owner_name: nameOf(o), seq: s.seq, square: s.square, square_label: fleet.squareLabel(s.square), sure: !!s.sure,
        answered: typeof s.correct === 'boolean', ...(s.voided ? { voided: true } : {})
      })))
      : []
  };
}

async function nextRound(store, k, campaign) {
  if (campaign.mode !== 'lesson') reject(409, 'lesson_only', 'Next round is for lesson mode.');
  await updateJSON(store, k.campaignClock(campaign.game_id, campaign.id), (clock) => (roundOpen(campaign, clock) ? { ...clock, next: clock.round } : undefined));
}

async function voidShot(store, k, campaign, body, now) {
  const { clock } = await ensureResolved(store, k, campaign, now);
  const round = Number(body.round);
  if (round !== clock.round || round < 1 || !roundOpen(campaign, clock)) {
    // Voiding a resolved round would rewrite history; plan 3 revisits the latest one.
    reject(409, 'too_late', 'That round has closed. A shot can only be voided while its round is open.');
  }
  if (typeof body.owner !== 'string' || !list(campaign.joined).includes(body.owner)) reject(404, 'no_shot', 'That shot isn’t in this round.');
  await updateJSON(store, k.campaignShots(campaign.game_id, campaign.id, round, body.owner), (held) => {
    const shots = list(held);
    const at = shots.findIndex((s) => s.seq === Number(body.seq));
    if (at < 0) reject(404, 'no_shot', 'That shot isn’t in this round.');
    if (shots[at].voided) return undefined;
    shots[at] = { ...shots[at], voided: true };
    return shots;
  });
}

async function rejectReport(store, k, campaign, body, now) {
  const { state } = await ensureResolved(store, k, campaign, now);
  const hit = state.hits.find((h) => h.id === body.hit);
  if (!hit) reject(404, 'bad_hit', 'That hit isn’t in this game.');
  if (hit.status !== 'owed') reject(409, 'settled', 'That hit has already been scored.');
  // Filings and their rejections live in the shooter's reports blob: one etag write does both.
  await updateJSON(store, k.campaignReports(campaign.game_id, campaign.id, hit.owner), (held) => {
    const r = obj(held);
    if ((obj(r.rejected)[hit.id] ?? 0) >= 1) reject(409, 'returned_once', 'Already returned once.');
    if (!obj(r.filed)[hit.id]) reject(409, 'not_filed', 'Nothing has been filed for that hit yet.');
    const filed = { ...obj(r.filed) };
    delete filed[hit.id];
    return { ...r, filed, rejected: { ...obj(r.rejected), [hit.id]: 1 } };
  });
}

async function close(store, k, campaign, now) {
  const { data } = await updateJSON(store, k.campaign(campaign.game_id, campaign.id), (c) => (c.closed_at ? undefined : { ...c, closed_at: now }));
  const currentKey = k.campaignCurrent(campaign.game_id, campaign.class_id);
  const current = await read(store, currentKey);
  if (current?.id === campaign.id) await store.delete(currentKey);
  await updateJSON(store, campaignIndexKey(campaign.class_id), (held) => {
    const kept = list(obj(held).campaigns);
    const left = kept.filter((e) => e?.id !== campaign.id);
    return held && left.length !== kept.length ? { campaigns: left } : undefined;
  });
  return data;
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
  let campaign = await findCampaign(store, ctx.k, body.game_id, ctx.classId, body.campaign_id);
  if (!campaign) reject(404, 'no_campaign', 'No Fleet week is running for this class.');
  // The keys the campaign opened with: a republish never changes a running game.
  await loadFleetGame(store, ctx.k, campaign.game_id, campaign.version);
  if (action !== 'campaign_state' && campaign.closed_at) reject(409, 'closed', 'This game has finished.');
  if (action === 'campaign_next') await nextRound(store, ctx.k, campaign);
  if (action === 'void_shot') await voidShot(store, ctx.k, campaign, body, now);
  if (action === 'reject_report') await rejectReport(store, ctx.k, campaign, body, now);
  if (action === 'campaign_reveal') campaign = await revealCampaign(store, ctx.k, campaign, now);
  if (action === 'campaign_close') campaign = await close(store, ctx.k, campaign, now);
  return campaignState(store, ctx.k, campaign, ctx.roster, now);
}
