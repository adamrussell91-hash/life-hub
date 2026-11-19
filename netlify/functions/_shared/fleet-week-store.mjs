/**
 * Fleet week campaigns: storage, the lesson and week clocks and lazy round resolution
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
import { loadRoster } from './class-claims.mjs';
import { fleet } from './game-rules.mjs';
import { list, obj, readWithEtag, updateJSON } from './etag-json.mjs';
import { foldRound } from './fleet-week-fold.mjs';

export { list, obj, readWithEtag, updateJSON };
export const SHOTS_PER_ROUND = 4;
/** Answers may arrive this long after a shot's deadline (network grace). */
export const LATE_GRACE_MS = 2000;

/** The call-sign hash (decision 11): HMAC-SHA256 of the match secret, cut to 32 bits. */
export const hashFor = (secret) => (s) => createHmac('sha256', secret).update(s).digest().readUInt32BE(0);

/**
 * A seed only the server can know (decision 10). Every random choice (teams,
 * auto-placement, the ghost fleet, pings) is seeded from the secret, never from
 * the campaign id, which students see.
 */
export const seedFor = (secret, label) => createHmac('sha256', secret).update(label).digest('hex').slice(0, 32);

/** An opaque per-viewer id for an owner or a hit. Real owners and hit ids never leave the server. */
export const aliasFor = (campaign, viewer, subject) => hashFor(campaign.secret)(`${viewer}>${subject}`).toString(36);

// ---------------------------------------------------------------- the week clock (§1.3, §3.2)

/** Classes carry no time zone yet, so every week-mode clock runs on Sydney time (as sydneyDay in markbook.mjs). */
export const FLEET_TZ = 'Australia/Sydney';

const zoneParts = new Map();
/** Wall-clock parts of instant `t` in `tz`, as numbers. */
function wallAt(tz, t) {
  let f = zoneParts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-AU', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    zoneParts.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(t)).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
  return { y: p.year, m: p.month, d: p.day, hh: p.hour % 24, mm: p.minute, ss: p.second };
}

/** `tz`'s offset from UTC at instant `t`, in ms (wall time minus UTC). */
function offsetAt(tz, t) {
  const w = wallAt(tz, t);
  return Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss) - Math.floor(t / 1000) * 1000;
}

/**
 * The instant a wall time happens in `tz` (pure; Intl only). On a day the
 * clocks change, a wall time inside the skipped hour lands just after it, and
 * one in the repeated hour takes the first of the two.
 */
export function zonedInstant(tz, y, m, d, hh, mm) {
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const HALF_DAY = 12 * 3600 * 1000;
  const tries = [...new Set([wall - HALF_DAY, wall, wall + HALF_DAY].map((t) => wall - offsetAt(tz, t)))];
  const exact = tries.filter((t) => {
    const w = wallAt(tz, t);
    return w.y === y && w.m === m && w.d === d && w.hh === hh && w.mm === mm;
  });
  return exact.length ? Math.min(...exact) : Math.max(...tries);
}

/** `tz`'s calendar day `n` days after the day of instant `t`, as { y, m, d }. */
function dayAfter(tz, t, n) {
  const w = wallAt(tz, t);
  const shifted = new Date(Date.UTC(w.y, w.m - 1, w.d + n));
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() };
}

/** A valid IANA zone name, or null. */
export function validZone(tz) {
  if (typeof tz !== 'string' || !tz) return null;
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

/** Day of the week of a calendar day (0 Sunday … 6 Saturday); the date is already in the class's zone. */
const weekdayOf = (day) => new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay();
/** Placement days: Monday to Thursday, so at least one firing day follows in the same school week. */
const PLACEMENT_DAYS = new Set([1, 2, 3, 4]);
/** Firing days: the school week, Monday to Friday. */
const SCHOOL_DAYS = new Set([1, 2, 3, 4, 5]);

/**
 * Week mode's clock (§1.3), following the school week: when each round
 * closes, `[placement, firing 1, …, firing rounds]`. Placement runs from the
 * open to a cut-off on a Monday to Thursday: today's when the campaign opens
 * before it on one of those days, else the next such day's. So a campaign
 * opened on a Friday or over the weekend places until Monday's cut-off. Each
 * firing round then closes at the cut-off on the next school day, skipping
 * Saturday and Sunday. Days and weekdays are the class's time zone's (Sydney),
 * so a round on a day the clocks change still closes at the wall-clock cut-off.
 * Pure: the same open time, cut-off, rounds and zone always give the same times.
 */
export function weekCloses(openedAt, cutoff, rounds, tz = FLEET_TZ) {
  const [hh, mm] = String(cutoff).split(':').map(Number);
  const closeOn = (n) => {
    const day = dayAfter(tz, openedAt, n);
    return { day, at: zonedInstant(tz, day.y, day.m, day.d, hh, mm) };
  };
  let n = 0;
  while (!PLACEMENT_DAYS.has(weekdayOf(closeOn(n).day)) || closeOn(n).at <= openedAt) n += 1;
  const closes = [closeOn(n).at];
  while (closes.length < rounds + 1) {
    n += 1;
    if (SCHOOL_DAYS.has(weekdayOf(closeOn(n).day))) closes.push(closeOn(n).at);
  }
  return closes;
}

/** The last firing round. */
export const roundsOf = (campaign) => campaign.settings.rounds;

/** True while a round (placement or firing) is open on the clock. */
export const roundOpen = (campaign, clock) => !campaign.revealed_at && !campaign.closed_at && clock.round <= roundsOf(campaign);

/** The cap has run out or the teacher tapped Next round: no new shots, though open ones may still be answered. */
export const roundClosing = (clock, now) => now >= clock.closes_at || clock.next === clock.round;

/**
 * Whether an owner is done this round: `done[owner] = { round, until }`. A
 * player's fourth commit sets `until` to that shot's deadline (plus grace), and
 * their fourth answer brings it to the answer time, so an unanswered last shot
 * holds the round only until its time runs out. Done from just after `until`.
 */
export const isDone = (clock, owner, round, now) => {
  const d = obj(clock.done)[owner];
  return !!d && d.round === round && now > (d.until ?? 0);
};

/** Whether `owner` may fire in `round`: a late joiner waits for the round after they joined (§3.5). */
export const firesIn = (campaign, owner, round) => (obj(campaign.late)[owner] ?? 0) <= round;

/**
 * Owners whose student has left the class list (§3.5). Their ships stay and
 * their partner fires alone. With no class record at all, nobody counts as gone.
 */
export async function absentOwners(store, campaign) {
  const roster = await loadRoster(store, campaign.class_id);
  if (!roster) return [];
  const ids = new Set(roster.students.map((s) => s.id));
  return list(campaign.joined).filter((o) => !ids.has(obj(campaign.students)[o]));
}

/**
 * Who is active in the open round (decision 8): seen since the round opened, or
 * placed (for round 1), or fired in the round before.
 */
export function activeOwners(campaign, clock) {
  const r = clock.round;
  const seen = obj(clock.seen);
  const done = obj(clock.done);
  const fired = obj(clock.fired);
  return list(campaign.joined).filter((o) => firesIn(campaign, o, r)).filter((o) => seen[o] === r || (r === 1 ? done[o]?.round === 0 : r > 1 && fired[o] === r - 1));
}

/** A committed shot still waiting for its answer holds the round open (`open[owner] = { round, until }`). */
const heldOpen = (clock, now) => Object.values(obj(clock.open)).some((h) => h?.round === clock.round && now <= h.until);

/**
 * Lesson mode (§1.3). The open round closes at its cap or on Next round, but
 * never while a committed shot can still be answered (its deadline plus grace).
 * It closes early when everyone needed is done: placement (round 0) needs every
 * rostered player in the pairing to have placed; a firing round needs every
 * active player (decision 8) to be done. Nobody active yet means nobody is done.
 */
export function roundClosed(campaign, clock, now) {
  if (!roundOpen(campaign, clock)) return false;
  // Week mode closes by the clock only: no early close and no Next round (§1.3).
  if (campaign.mode === 'week') return now >= clock.closes_at && !heldOpen(clock, now);
  if (clock.round === 0) {
    if (roundClosing(clock, now)) return true;
    // Placement waits for the whole class: every rostered player in the pairing (never the ghost) must place.
    const players = campaign.pairing.teams.filter((t) => !t.ghost).flatMap((t) => t.owners.filter((o) => !list(t.late).includes(o)));
    return players.length > 0 && players.every((o) => isDone(clock, o, 0, now));
  }
  if (roundClosing(clock, now)) return !heldOpen(clock, now);
  const active = activeOwners(campaign, clock);
  return active.length > 0 && active.every((o) => isDone(clock, o, clock.round, now));
}

export const capFor = (campaign, round) => (round === 0 ? campaign.settings.placement_cap_ms : campaign.settings.round_cap_ms);

/** When round `round` closes if it opens at `now`: the cap in lesson mode, the schedule's cut-off in week mode. */
export const closeFor = (campaign, round, now) => (campaign.mode === 'week' ? list(campaign.schedule)[round] ?? now : now + capFor(campaign, round));

/** A fresh clock at placement. */
export const firstClock = (campaign, now) => ({ round: 0, opened_at: now, closes_at: closeFor(campaign, 0, now), seen: {}, fired: {}, open: {}, done: {} });

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
  for (const r of Object.values(reports).map(obj)) {
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

/** The rules' input for a round, and the stored shots behind it (for the learning-data fold). */
async function roundInput(store, k, campaign, round) {
  const base = { pairing: campaign.pairing, round, seed: seedFor(campaign.secret, `seed:${round}`), placements: {}, shots: [] };
  let stored = [];
  const reports = reportInputs(await allReports(store, k, campaign));
  if (round === 0) {
    const owners = list(campaign.joined);
    const rows = await mapBounded(owners, 8, (o) => read(store, k.campaignFleet(campaign.game_id, campaign.id, o)));
    owners.forEach((o, i) => { if (Array.isArray(rows[i])) base.placements[o] = rows[i]; });
  } else {
    stored = await roundShots(store, k, campaign, round);
    base.shots = stored.map(toShot);
  }
  return { input: { ...base, ...reports, absent: await absentOwners(store, campaign) }, stored };
}

/** A fold that started this long ago and never finished (its request died) may be taken over. */
export const FOLD_LEASE_MS = 60000;

/**
 * Fold round `r` into the learning data at most once at a time (§4). The
 * `folded/{r}` marker is claimed create-only (or taken over once its lease
 * has run out), the fold runs, and the marker becomes `{ done: true }`. A fold
 * that throws gives its claim back, so the next request tries again. Never
 * throws: a failed fold never stops play. True when this call folded the round.
 */
export async function foldOnce(store, k, campaign, state, r, stored, now) {
  const key = k.campaignFolded(campaign.game_id, campaign.id, r);
  const held = await readWithEtag(store, key);
  if (held.data?.done || (held.data && now - (held.data.at ?? 0) < FOLD_LEASE_MS)) return false;
  const claimed = await store.setJSON(key, { at: now }, held.data ? (held.etag ? { onlyIfMatch: held.etag } : {}) : { onlyIfNew: true });
  if (claimed?.modified === false) return false;
  try {
    await foldRound(store, k, campaign, state, r, stored, { now });
    await store.setJSON(key, { done: true, at: now });
    return true;
  } catch (e) {
    console.error('fleet week: fold failed', campaign.id, r, e?.message);
    try {
      await store.delete(key);
    } catch {
      // The lease runs out on its own.
    }
    return false;
  }
}

/** Retry: fold every resolved firing round that has no `{ done }` marker, in order. One small read per round otherwise. */
export async function ensureFolded(store, k, campaign, clock, now) {
  const last = Math.min(clock.round - 1, roundsOf(campaign));
  if (last < 1) return;
  const rounds = Array.from({ length: last }, (_, i) => i + 1);
  const marks = await mapBounded(rounds, 8, (r) => read(store, k.campaignFolded(campaign.game_id, campaign.id, r)));
  for (const [i, r] of rounds.entries()) {
    if (marks[i]?.done) continue;
    const state = await read(store, k.campaignResolved(campaign.game_id, campaign.id, r));
    if (!state) continue;
    await foldOnce(store, k, campaign, state, r, await roundShots(store, k, campaign, r), now);
  }
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
    if (!roundClosed(campaign, clock, now)) {
      // Any resolved round whose fold failed or never ran is folded now.
      await ensureFolded(store, k, campaign, clock, now);
      return { state: await stateBefore(store, k, campaign, clock.round), clock };
    }
    const r = clock.round;
    const resolvedKey = k.campaignResolved(campaign.game_id, campaign.id, r);
    let state = await read(store, resolvedKey);
    if (!state) {
      const { input, stored } = await roundInput(store, k, campaign, r);
      const next = fleet.resolveRound(await stateBefore(store, k, campaign, r), input);
      const written = await store.setJSON(resolvedKey, next, { onlyIfNew: true });
      if (written?.modified === false) {
        state = await read(store, resolvedKey);
      } else {
        state = next;
        // The request that wrote the round folds it into the learning data straight away (§4).
        if (r >= 1) await foldOnce(store, k, campaign, next, r, stored, now);
      }
    }
    const round = r + 1;
    // Week mode catching up over missed rounds: each round opened when the one before it closed.
    const openedAt = campaign.mode === 'week' ? Math.min(now, clock.closes_at) : now;
    const advanced = {
      ...clock, round, opened_at: openedAt, closes_at: round <= roundsOf(campaign) ? closeFor(campaign, round, now) : null
    };
    delete advanced.next;
    await store.setJSON(clockKey, advanced, held.etag ? { onlyIfMatch: held.etag } : {});
    // Won or lost the race, the loop re-reads the clock.
  }
  reject(409, 'retry', 'Please send it again.');
}

/**
 * Open the reveal (§1.3, §3.5: the teacher can do it at any phase): settle every
 * open hit and recall line from the last resolved state into resolved/final,
 * then stamp `revealed_at`. Shots in a round still open are dropped. Idempotent.
 */
export async function revealCampaign(store, k, campaign, now) {
  if (campaign.revealed_at) return campaign;
  const { state } = await ensureResolved(store, k, campaign, now);
  const finalKey = k.campaignResolved(campaign.game_id, campaign.id, 'final');
  const settled = fleet.settleAll(state, { ...reportInputs(await allReports(store, k, campaign)), pairing: campaign.pairing, absent: await absentOwners(store, campaign) });
  await store.setJSON(finalKey, settled, { onlyIfNew: true });
  const { data } = await updateJSON(store, k.campaign(campaign.game_id, campaign.id), (c) => (c.revealed_at ? undefined : { ...c, revealed_at: now }));
  return data;
}

/**
 * ensureResolved, and in week mode the reveal too: it opens by itself once the
 * last firing round has closed and resolved (§1.3). Returns the campaign as it
 * now stands with the state and clock.
 */
export async function ensureCampaign(store, k, campaign, now) {
  const resolved = await ensureResolved(store, k, campaign, now);
  if (campaign.mode !== 'week' || campaign.revealed_at || campaign.closed_at || resolved.clock.round <= roundsOf(campaign)) return { campaign, ...resolved };
  return { campaign: await revealCampaign(store, k, campaign, now), ...resolved };
}

/**
 * Change the clock for one owner in one round, in one etag write. `change(clock)`
 * returns the fields to merge, or undefined when nothing needs writing. Does
 * nothing once the clock has moved on.
 */
export async function touchClock(store, k, campaign, round, change) {
  return updateJSON(store, k.campaignClock(campaign.game_id, campaign.id), (clock) => {
    if (!clock || clock.round !== round) return undefined;
    const patch = change(clock);
    return patch ? { ...clock, ...patch } : undefined;
  });
}

/** Record `seen` or `fired` at most once per round per owner. */
export async function markClock(store, k, campaign, field, owner, round) {
  return touchClock(store, k, campaign, round, (clock) => (obj(clock[field])[owner] === round ? undefined : { [field]: { ...obj(clock[field]), [owner]: round } }));
}

/** Set `done[owner] = { round, until }` unless it already says so. */
export async function markDone(store, k, campaign, owner, round, until) {
  return touchClock(store, k, campaign, round, (clock) => {
    const d = obj(clock.done)[owner];
    if (d && d.round === round && d.until === until) return undefined;
    return { done: { ...obj(clock.done), [owner]: { round, until } } };
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
