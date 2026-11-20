/**
 * One code per lesson per calendar day (Sydney) for the live class activities
 * (continuum line, brainstorm). A student types it once; their device's secret
 * token is then good for every round in that lesson until midnight, so each
 * new round joins on its own. The code keeps one day's rounds apart from the
 * next, and the token is random, so nobody can learn or pass on someone
 * else's place.
 *
 *   lesson-pass/{lesson}/{day}                       { code, created_at }  create-only
 *   lesson-pass/{lesson}/{day}/devices/{token_hash}  { at }               create-only
 *
 * Who a symbol belongs to, for the teacher only, sits beside each round:
 *
 *   {base}/{session}/who/{symbol}   { class_id, student_id, initials, at }
 *
 * It comes from the class initials claim the quiz uses (class-claims.mjs),
 * never from anything a student types here, and never leaves the server in a
 * student or display reply.
 */
import { randomInt } from 'node:crypto';
import { claimFor, loadRoster } from './class-claims.mjs';
import { isSafeId } from './class-examples.mjs';

const STRONG = { type: 'json', consistency: 'strong' };
const TOKEN = /^[a-f0-9]{48}$/;
const HASH = /^[a-f0-9]{64}$/;

/** Today's date in Sydney, YYYY-MM-DD. */
export function lessonDay(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}

const passKey = (lesson, day) => `lesson-pass/${lesson}/${day}`;
const deviceKey = (lesson, day, tokenHash) => `lesson-pass/${lesson}/${day}/devices/${tokenHash}`;

/** Today's code for the lesson, made on first ask. Two teachers' screens racing get the same one. */
export async function ensureLessonPass(store, lesson, now = Date.now()) {
  if (!isSafeId(lesson)) return null;
  const day = lessonDay(now);
  const existing = await store.get(passKey(lesson, day), STRONG);
  if (existing?.code) return { day, code: existing.code };
  await store.setJSON(passKey(lesson, day), { code: String(randomInt(100000, 1000000)), created_at: new Date(now).toISOString() }, { onlyIfNew: true });
  const won = await store.get(passKey(lesson, day), STRONG);
  return won?.code ? { day, code: won.code } : null;
}

/** Today's code, or null when no round has been started in the lesson today. */
export async function todayPass(store, lesson, now = Date.now()) {
  if (!isSafeId(lesson)) return null;
  const day = lessonDay(now);
  const pass = await store.get(passKey(lesson, day), STRONG);
  return pass?.code ? { day, code: pass.code } : null;
}

/** True when this device typed today's code in this lesson. */
export async function hasLessonPass(store, lesson, tokenHash, now = Date.now()) {
  if (!isSafeId(lesson) || !HASH.test(String(tokenHash ?? ''))) return false;
  return !!(await store.get(deviceKey(lesson, lessonDay(now), tokenHash), STRONG));
}

/**
 * Checks a typed code against today's and, when it matches, lets the device
 * in for the rest of the day. Returns true on a match.
 */
export async function usePassCode(store, lesson, code, tokenHash, now = Date.now()) {
  const digits = String(code ?? '').replace(/\D/g, '');
  if (!digits || !HASH.test(String(tokenHash ?? ''))) return false;
  const pass = await todayPass(store, lesson, now);
  if (!pass || pass.code !== digits) return false;
  await store.setJSON(deviceKey(lesson, pass.day, tokenHash), { at: new Date(now).toISOString() }, { onlyIfNew: true });
  return true;
}

/**
 * Whether a device may join a round: it holds today's pass, it typed today's
 * code, or it typed the round's own code (rounds started before lesson codes).
 * Returns 'ok', 'need_code' or 'wrong_code'.
 */
export async function admit(store, lesson, activity, code, tokenHash, now = Date.now()) {
  if (await hasLessonPass(store, lesson, tokenHash, now)) return 'ok';
  const digits = String(code ?? '').replace(/\D/g, '');
  if (!digits) return 'need_code';
  if (await usePassCode(store, lesson, digits, tokenHash, now)) return 'ok';
  if (activity?.code && digits === activity.code) return 'ok';
  return 'wrong_code';
}

const whoKey =(base, session, symbol) => `${base}/${session}/who/${symbol}`;

/**
 * Records whose symbol this is in the round, from the device's class initials
 * claim. Quietly does nothing when the page has no class or the device hasn't
 * claimed initials yet. Returns true when the round now knows who it is.
 */
export async function noteWho(store, base, session, symbol, body) {
  if (!symbol || !session) return false;
  const classId = typeof body?.class_id === 'string' ? body.class_id : '';
  if (!isSafeId(classId) || !TOKEN.test(String(body?.class_token ?? ''))) return false;
  const roster = await loadRoster(store, classId);
  const student = roster ? await claimFor(store, roster, body.class_token) : null;
  if (!student) return false;
  const known = await store.get(whoKey(base, session, symbol), STRONG);
  if (known?.student_id === student.id && known?.class_id === classId && known?.initials === student.initials) return true;
  await store.setJSON(whoKey(base, session, symbol), { class_id: classId, student_id: student.id, initials: student.initials, at: new Date().toISOString() });
  return true;
}

/**
 * Teacher only: initials for the round's symbols, read fresh from each class
 * list so a renamed student shows their current initials. Symbols nobody has
 * linked are left out.
 */
export async function initialsFor(store, base, session, symbols) {
  const rows = await Promise.all(symbols.map((symbol) => store.get(whoKey(base, session, symbol), STRONG)));
  const classIds = [...new Set(rows.filter(Boolean).map((r) => r.class_id).filter(isSafeId))];
  const rosters = new Map(await Promise.all(classIds.map(async (id) => [id, await loadRoster(store, id)])));
  const out = {};
  symbols.forEach((symbol, i) => {
    const row = rows[i];
    if (!row) return;
    const now = rosters.get(row.class_id)?.students.find((s) => s.id === row.student_id);
    const initials = now?.initials ?? row.initials;
    if (typeof initials === 'string' && initials) out[symbol] = initials;
  });
  return out;
}

/**
 * A device naming a round it joined before: finds its symbol by the token it
 * kept and records who it was. Lets rounds run before initials were kept pick
 * them up when students next open the lesson.
 */
export async function linkPastRound(store, base, session, tokenHash, body) {
  if (!/^[a-f0-9]{32}$|^self$/.test(String(session ?? '')) || !HASH.test(String(tokenHash ?? ''))) return false;
  const mine = await store.get(`${base}/${session}/tokens/${tokenHash}`, STRONG);
  if (!mine?.symbol) return false;
  return noteWho(store, base, session, mine.symbol, body);
}
