// Server-side sign-in state in Netlify Blobs (store `life-hub-auth`, site-local,
// strong consistency):
//
//   session/epoch   { epoch, bumped_at }
//     Every session token carries the epoch it was issued under (`sep`). A token whose
//     epoch is below the stored one is revoked. Logout bumps the epoch, which signs out
//     every browser at once (single-owner app). No record yet means epoch 0, which is
//     also what tokens issued before this existed carry, so they keep working.
//
//   login/failures  { failures, first_failure_at, last_failure_at, locked_until }
//     One global counter shared by /api/auth and /api/knowledge/auth-login, whatever
//     the IP. See LOGIN_THROTTLE below for the policy.
//
// Tests and local tools that run without a Blobs environment get epoch 0 and no
// throttle (the same behaviour as before this existed); a console warning says so.
// A Blobs read error inside a real Netlify environment throws, so session checks
// answer 503 (and never clear the cookie) instead of guessing.

export const AUTH_STORE = 'life-hub-auth';
export const SESSION_EPOCH_KEY = 'session/epoch';
export const LOGIN_FAILURES_KEY = 'login/failures';
const EPOCH_CACHE_MS = 5_000;

/**
 * Global failed-login backoff.
 *  - The first FREE_FAILURES wrong passphrases (from anywhere) cost nothing.
 *  - Each failure after that locks sign-in for BASE_LOCK_MS × 2^(n − FREE_FAILURES),
 *    capped at MAX_LOCK_MS: 30 s, 1 min, 2 min, 4 min, 8 min, then 15 min per failure.
 *  - While locked, attempts are refused with 429 without checking the passphrase and
 *    without extending the lock, so a locked-out attacker cannot keep it growing.
 *  - The counter forgets after RESET_AFTER_MS with no failure; a correct passphrase
 *    clears it at once.
 * The owner is never locked out for more than MAX_LOCK_MS at a time, and existing
 * sessions are untouched. Under a sustained attack the worst case is waiting out one
 * 15-minute lock. To clear it by hand, delete `login/failures` in the `life-hub-auth`
 * Blobs store from the Netlify UI.
 */
export const LOGIN_THROTTLE = Object.freeze({
  FREE_FAILURES: 5,
  BASE_LOCK_MS: 30_000,
  MAX_LOCK_MS: 15 * 60_000,
  RESET_AFTER_MS: 30 * 60_000
});

let warnedMissingEnvironment = false;
let epochCache = null; // { epoch, at }

function isMissingBlobsEnvironment(error) {
  return error?.name === 'MissingBlobsEnvironmentError';
}

function warnMissingEnvironment() {
  if (warnedMissingEnvironment) return;
  warnedMissingEnvironment = true;
  console.warn('auth-state: no Netlify Blobs environment; session revocation and login backoff are off.');
}

/** The auth store, or null when there is no Blobs environment at all (tests, local tools). */
export async function defaultGetAuthStore() {
  const { getStore } = await import('@netlify/blobs');
  try {
    return getStore({ name: AUTH_STORE, consistency: 'strong' });
  } catch (error) {
    if (isMissingBlobsEnvironment(error)) {
      warnMissingEnvironment();
      return null;
    }
    throw error;
  }
}

async function readJson(store, key) {
  try {
    return await store.get(key, { type: 'json', consistency: 'strong' });
  } catch (error) {
    if (isMissingBlobsEnvironment(error)) {
      warnMissingEnvironment();
      return undefined;
    }
    throw error;
  }
}

async function writeJson(store, key, value) {
  if (typeof store.setJSON === 'function') return store.setJSON(key, value);
  return store.set(key, JSON.stringify(value));
}

function epochOf(record) {
  const n = Number(record?.epoch);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

/** Clear the per-instance epoch cache — tests only. */
export function resetAuthStateCache() {
  epochCache = null;
}

/**
 * The current session epoch. Cached per warm instance for EPOCH_CACHE_MS, so a logout
 * reaches other warm instances within a few seconds. Throws on a real Blobs error.
 */
export async function loadSessionEpoch({ getStore = defaultGetAuthStore, now = Date.now(), useCache = true } = {}) {
  if (useCache && epochCache && now - epochCache.at >= 0 && now - epochCache.at < EPOCH_CACHE_MS) {
    return epochCache.epoch;
  }
  const store = await getStore();
  if (!store) return 0;
  const record = await readJson(store, SESSION_EPOCH_KEY);
  if (record === undefined) return 0;
  const epoch = epochOf(record);
  epochCache = { epoch, at: now };
  return epoch;
}

/** Revoke every session issued so far. Returns the new epoch (or null without Blobs). */
export async function bumpSessionEpoch({ getStore = defaultGetAuthStore, now = Date.now() } = {}) {
  const store = await getStore();
  if (!store) return null;
  const record = await readJson(store, SESSION_EPOCH_KEY);
  if (record === undefined) return null;
  const epoch = epochOf(record) + 1;
  await writeJson(store, SESSION_EPOCH_KEY, { epoch, bumped_at: new Date(now).toISOString() });
  epochCache = { epoch, at: now };
  return epoch;
}

function lockFor(failures) {
  const over = failures - LOGIN_THROTTLE.FREE_FAILURES;
  if (over < 0) return 0;
  return Math.min(LOGIN_THROTTLE.MAX_LOCK_MS, LOGIN_THROTTLE.BASE_LOCK_MS * 2 ** over);
}

function liveFailures(record, now) {
  if (!record || typeof record !== 'object') return null;
  const last = Number(record.last_failure_at);
  if (!Number.isFinite(last) || now - last > LOGIN_THROTTLE.RESET_AFTER_MS) return null;
  return record;
}

/**
 * Before checking a passphrase. → { allowed: true } | { allowed: false, retryAfterMs }
 * Fails open on a Blobs error (Netlify's per-IP rate limit still applies).
 */
export async function checkLoginAllowed({ getStore = defaultGetAuthStore, now = Date.now() } = {}) {
  try {
    const store = await getStore();
    if (!store) return { allowed: true };
    const record = liveFailures(await readJson(store, LOGIN_FAILURES_KEY), now);
    const lockedUntil = Number(record?.locked_until);
    if (Number.isFinite(lockedUntil) && lockedUntil > now) {
      return { allowed: false, retryAfterMs: lockedUntil - now };
    }
    return { allowed: true };
  } catch (error) {
    console.warn(`auth-state: login backoff unavailable (${error?.name ?? 'error'})`);
    return { allowed: true };
  }
}

/** After a wrong passphrase. Returns the stored state (or null without Blobs). */
export async function recordLoginFailure({ getStore = defaultGetAuthStore, now = Date.now() } = {}) {
  try {
    const store = await getStore();
    if (!store) return null;
    const previous = liveFailures(await readJson(store, LOGIN_FAILURES_KEY), now);
    const failures = (Number(previous?.failures) || 0) + 1;
    const lock = lockFor(failures);
    const next = {
      failures,
      first_failure_at: Number(previous?.first_failure_at) || now,
      last_failure_at: now,
      locked_until: lock ? now + lock : null
    };
    await writeJson(store, LOGIN_FAILURES_KEY, next);
    return next;
  } catch (error) {
    console.warn(`auth-state: could not record a failed sign-in (${error?.name ?? 'error'})`);
    return null;
  }
}

/** After a correct passphrase. */
export async function clearLoginFailures({ getStore = defaultGetAuthStore } = {}) {
  try {
    const store = await getStore();
    if (!store) return;
    const previous = await readJson(store, LOGIN_FAILURES_KEY);
    if (previous && typeof store.delete === 'function') await store.delete(LOGIN_FAILURES_KEY);
  } catch {
    // A stale counter only delays the next wrong guess.
  }
}
