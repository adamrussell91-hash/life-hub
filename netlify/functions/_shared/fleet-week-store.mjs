/**
 * Fleet week campaigns: storage, the lesson-mode clock and lazy round resolution
 * (spec docs/superpowers/specs/2026-11-19-fleet-week-design.md §1.3, §3.1–3.2;
 * plan docs/superpowers/plans/2026-11-19-fleet-week-1-engine.md, Task 4).
 *
 *   …/campaigns/{id}                  config (create-only, then etag for reveal, close)
 *   …/campaigns/current/{class}       { id }
 *   …/campaigns/{id}/clock            { round, opened_at, closes_at, next?, seen, fired, done } (etag)
 *   …/campaigns/{id}/fleet/{owner}    Ship[] (create-only)
 *   …/campaigns/{id}/shots/{r}/{owner}  committed shots with answers and writing logs (etag append)
 *   …/campaigns/{id}/resolved/{r}     FleetState after round r (create-only); resolved/final at the reveal
 *   …/campaigns/{id}/reports/{owner}  { filed, recall, rejected } (etag)
 *
 * There is no scheduled job. The first request after a round closes resolves it
 * (fleet.resolveRound, pure) and writes the result create-only, so racing
 * requests produce one round. `clock.round` is the round that is open: 0 is
 * placement, 1…rounds are firing rounds, rounds + 1 means every round is done
 * and the campaign waits for the reveal. `now` is always injected.
 */
import { createHmac } from 'node:crypto';
import { mapBounded } from './blobs-list.mjs';
import { read, reject } from './question-drop.mjs';
import { fleet } from './game-rules.mjs';

const STRONG = { type: 'json', consistency: 'strong' };
export const list = (v) => (Array.isArray(v) ? v : []);
export const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
export const SHOTS_PER_ROUND = 4;

export async function readWithEtag(store, key) {
  if (typeof store.getWithMetadata !== 'function') return { data: await read(store, key), etag: null };
  const row = await store.getWithMetadata(key, STRONG);
  return { data: row?.data ?? null, etag: row?.etag ?? null };
}

/**
 * Read, change, write only if nobody wrote in between; retry up to three times.
 * `change(data)` returns the next value, or undefined to write nothing. It may
 * throw (a QuizError) to refuse. Returns `{ data, written }`.
 */
export async function updateJSON(store, key, change) {
  for (let attempt = 0; ; attempt += 1) {
    const held = await readWithEtag(store, key);
    const next = change(held.data == null ? null : structuredClone(held.data));
    if (next === undefined) return { data: held.data, written: false };
    const options = held.data != null ? (held.etag ? { onlyIfMatch: held.etag } : {}) : { onlyIfNew: true };
    const result = await store.setJSON(key, next, options);
    if (result?.modified !== false) return { data: next, written: true };
    if (attempt >= 3) reject(409, 'retry', 'Please send it again.');
  }
}

/** The call-sign hash (decision 11): HMAC-SHA256 of the match secret, cut to 32 bits. */
export const hashFor = (secret) => (s) => createHmac('sha256', secret).update(s).digest().readUInt32BE(0);

/** An opaque per-viewer id for an owner or a hit. Real owners and hit ids never leave the server. */
export const aliasFor = (campaign, viewer, subject) => hashFor(campaign.secret)(`${viewer}>${subject}`).toString(36);

/** The last firing round. */
export const roundsOf = (campaign) => campaign.settings.rounds;

/** True while a round (placement or firing) is open on the clock. */
export const roundOpen = (campaign, clock) => !campaign.revealed_at && !campaign.closed_at && clock.round <= roundsOf(campaign);

/**
 * Who is active in the open round (decision 8): seen since the round opened, or
 * placed (for round 1), or fired in the round before.
 */
export function activeOwners(campaign, clock) {
  const r = clock.round;
  const seen = obj(clock.seen);
  const done = obj(clock.done);
  const fired = obj(clock.fired);
  return list(campaign.joined).filter((o) => seen[o] === r || (r === 1 ? done[o] === 0 : r > 1 && fired[o] === r - 1));
}

/**
 * Lesson mode (§1.3): the open round has closed when its cap has run out, the
 * teacher tapped Next round, or every active player is done (placed, or spent
 * four shots). Nobody active yet means nobody is done.
 */
export function roundClosed(campaign, clock, now) {
  if (!roundOpen(campaign, clock)) return false;
  if (now >= clock.closes_at) return true;
  if (clock.next === clock.round) return true;
  const active = activeOwners(campaign, clock);
  const done = obj(clock.done);
  return active.length > 0 && active.every((o) => done[o] === clock.round);
}

export const capFor = (campaign, round) => (round === 0 ? campaign.settings.placement_cap_ms : campaign.settings.round_cap_ms);

/** A fresh clock at placement. */
export const firstClock = (campaign, now) => ({ round: 0, opened_at: now, closes_at: now + capFor(campaign, 0), seen: {}, fired: {}, done: {} });

/** The state after the last resolved round (the empty state before placement resolves). */
export async function stateBefore(store, k, campaign, round) {
  if (round <= 0) return fleet.emptyState(campaign.pairing);
  const state = await read(store, k.campaignResolved(campaign.game_id, campaign.id, round - 1));
  if (!state) throw new Error(`Fleet week: round ${round - 1} missing`);
  return state;
}

/** Every player's reports blob, by owner. */
export async function allReports(store, k, campaign) {
  const owners = list(campaign.joined);
  const rows = await mapBounded(owners, 8, (o) => read(store, k.campaignReports(campaign.game_id, campaign.id, o)));
  return Object.fromEntries(owners.map((o, i) => [o, obj(rows[i])]));
}

/** What the rules read from the reports (decision 6, §1.5): filed hit → round, rejections, recall lines by `${target}:${ship}`. */
export function reportInputs(reports) {
  const filed = {};
  const rejected = {};
  const recalls = {};
  for (const r of Object.values(reports)) {
    for (const [hit, f] of Object.entries(obj(r.filed))) filed[hit] = f.round;
    for (const [hit, n] of Object.entries(obj(r.rejected))) rejected[hit] = Math.max(rejected[hit] ?? 0, n);
    for (const [key, line] of Object.entries(obj(r.recall))) recalls[key] = line.correct === true;
  }
  return { filed, rejected, recalls };
}

/** A stored shot as the rules see it: unanswered at close → correct null (no answer in time). */
const toShot = (s) => ({
  seq: s.seq, owner: s.owner, square: s.square, sure: !!s.sure, variant: s.variant, item: s.item,
  correct: typeof s.correct === 'boolean' ? s.correct : null, returning: !!s.returning, ...(s.voided ? { voided: true } : {})
});

/** Every owner's shots for a round, as stored. */
export async function roundShots(store, k, campaign, round) {
  const owners = list(campaign.joined);
  const rows = await mapBounded(owners, 8, (o) => read(store, k.campaignShots(campaign.game_id, campaign.id, round, o)));
  return owners.flatMap((o, i) => list(rows[i]));
}

async function roundInput(store, k, campaign, round) {
  const base = { pairing: campaign.pairing, round, seed: `${campaign.id}:${round}`, placements: {}, shots: [] };
  const reports = reportInputs(await allReports(store, k, campaign));
  if (round === 0) {
    const owners = list(campaign.joined);
    const rows = await mapBounded(owners, 8, (o) => read(store, k.campaignFleet(campaign.game_id, campaign.id, o)));
    owners.forEach((o, i) => { if (Array.isArray(rows[i])) base.placements[o] = rows[i]; });
  } else {
    base.shots = (await roundShots(store, k, campaign, round)).map(toShot);
  }
  return { ...base, ...reports };
}

/**
 * Resolve every closed round, one at a time and in order (resolveRound refuses
 * to skip). Each resolved state is written create-only; a racing request that
 * loses reads the stored copy. Then the clock advances with an etag; on a
 * conflict it is re-read and the loop goes on. Returns the latest state and clock.
 */
export async function ensureResolved(store, k, campaign, now) {
  const clockKey = k.campaignClock(campaign.game_id, campaign.id);
  for (let guard = 0; guard < 40; guard += 1) {
    const held = await readWithEtag(store, clockKey);
    const clock = held.data;
    if (!clock) throw new Error('Fleet week: clock missing');
    if (!roundClosed(campaign, clock, now)) return { state: await stateBefore(store, k, campaign, clock.round), clock };
    const r = clock.round;
    const resolvedKey = k.campaignResolved(campaign.game_id, campaign.id, r);
    let state = await read(store, resolvedKey);
    if (!state) {
      const next = fleet.resolveRound(await stateBefore(store, k, campaign, r), await roundInput(store, k, campaign, r));
      const written = await store.setJSON(resolvedKey, next, { onlyIfNew: true });
      state = written?.modified === false ? await read(store, resolvedKey) : next;
    }
    const round = r + 1;
    const advanced = {
      ...clock, round, opened_at: now, closes_at: round <= roundsOf(campaign) ? now + capFor(campaign, round) : null
    };
    delete advanced.next;
    await store.setJSON(clockKey, advanced, held.etag ? { onlyIfMatch: held.etag } : {});
    // Won or lost the race, the loop re-reads the clock.
  }
  reject(409, 'retry', 'Please send it again.');
}

/** Record something on the clock at most once per round per owner (`seen`, `fired`, `done`). */
export async function markClock(store, k, campaign, field, owner, round) {
  const key = k.campaignClock(campaign.game_id, campaign.id);
  return updateJSON(store, key, (clock) => {
    if (!clock || clock.round !== round || obj(clock[field])[owner] === round) return undefined;
    return { ...clock, [field]: { ...obj(clock[field]), [owner]: round } };
  });
}

/** The published fleet game: keys by version (the campaign's version once open) and its public settings. */
export async function loadFleetGame(store, k, gameId, version) {
  const current = version ? { version } : await read(store, k.current);
  const record = current?.version ? await read(store, k.version(current.version)) : null;
  if (!record) reject(409, 'not_published', 'Publish the game first.');
  const keys = typeof gameId === 'string' ? record.games?.[gameId] : null;
  if (!keys) reject(400, 'bad_game', 'That game isn’t in this lesson.');
  if (keys.kind !== 'fleet_week' || !keys.live?.fleet) reject(400, 'bad_game', 'That isn’t a Fleet week game.');
  return { record, keys };
}

/** The campaign a class is playing, or one named by id (still readable once closed). Null when there is none. */
export async function findCampaign(store, k, gameId, classId, campaignId) {
  if (typeof campaignId === 'string' && /^[a-f0-9]{16}$/.test(campaignId)) {
    const c = await read(store, k.campaign(gameId, campaignId));
    return c && c.class_id === classId ? c : null;
  }
  const current = await read(store, k.campaignCurrent(gameId, classId));
  return current?.id ? read(store, k.campaign(gameId, current.id)) : null;
}
