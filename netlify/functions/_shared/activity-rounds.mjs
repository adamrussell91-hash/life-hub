/**
 * Past rounds for the live class activities (brainstorm, continuum line,
 * hinge question, peer feedback).
 *
 * Each block keeps one live round at {base}/active. It goes idle after
 * ROUND_HOURS, or when the teacher ends it, but the students' work stays under
 * {base}/{session}/. Every write of the round state is mirrored to
 *
 *   {base}/{session}/round
 *
 * so the teacher can list past rounds and bring one back: it becomes the live
 * round again, exactly as it was left, for another ROUND_HOURS. Rounds from
 * before the mirror existed are found by listing {base}/ and come back with a
 * fresh round state over the students' saved work.
 */
import { listBlobKeys } from './blobs-list.mjs';

export const ROUND_HOURS = 12;
const STRONG = { type: 'json', consistency: 'strong' };
const SESSION = /^[a-f0-9]{32}$/;

export const validSession = (session) => typeof session === 'string' && SESSION.test(session);
const roundKey = (base, session) => `${base}/${session}/round`;
export const roundExpiry = (now = Date.now()) => now + ROUND_HOURS * 3600_000;

/** Write the live round and its copy under the session. */
export async function saveRound(store, base, activity) {
  await Promise.all([store.setJSON(`${base}/active`, activity), store.setJSON(roundKey(base, activity.session), activity)]);
}

/** Every session that left anything under {base}/. */
async function sessionsUnder(store, base) {
  if (typeof store.list !== 'function') return [];
  const page = await store.list({ prefix: `${base}/`, directories: true });
  // Netlify lists one level as `directories`; a store that ignores the option lists every key.
  const paths = Array.isArray(page?.directories) ? page.directories : (page?.blobs ?? []).map((b) => b?.key ?? '');
  return [...new Set(paths.map((p) => String(p).slice(base.length + 1).split('/')[0]).filter(validSession))];
}

function startedOf(state) {
  if (!state) return null;
  const started = Date.parse(state.started_at ?? state.opened_at ?? '');
  if (Number.isFinite(started)) return new Date(started).toISOString();
  // Older rounds kept only their expiry, set ROUND_HOURS after the start. An ended round lost even that.
  return state.expires > 0 ? new Date(state.expires - ROUND_HOURS * 3600_000).toISOString() : null;
}

/**
 * The block's rounds, newest first, rounds with no known start last.
 * `counted` is the folder with one blob per student (claims, answers).
 */
export async function listRounds(store, base, active, counted) {
  const sessions = await sessionsUnder(store, base);
  if (active && validSession(active.session) && !sessions.includes(active.session)) sessions.push(active.session);
  const now = Date.now();
  const rows = await Promise.all(
    sessions.map(async (session) => {
      const [saved, students] = await Promise.all([store.get(roundKey(base, session), STRONG), listBlobKeys(store, `${base}/${session}/${counted}/`)]);
      const isActive = active?.session === session;
      const state = isActive ? active : saved;
      return {
        session,
        started_at: startedOf(saved ?? state),
        students: students.length,
        live: isActive && active.expires >= now,
        ...(state?.round === 'backup' ? { round: 'backup' } : {})
      };
    })
  );
  return rows.filter((r) => r.live || r.students > 0).sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''));
}

/**
 * The round to bring back, live again for another ROUND_HOURS, with `patch`
 * laid over it. `fresh(session)` builds round state for an older round that
 * kept none. Returns null when the session left nothing behind.
 */
export async function bringBackRound(store, base, session, active, fresh, patch = {}) {
  if (!validSession(session)) return null;
  let state = active?.session === session ? active : await store.get(roundKey(base, session), STRONG);
  if (!state) {
    if (!(await sessionsUnder(store, base)).includes(session)) return null;
    state = fresh(session);
  }
  const activity = { ...state, ...patch, session, expires: roundExpiry(), brought_back_at: new Date().toISOString() };
  await saveRound(store, base, activity);
  return activity;
}
