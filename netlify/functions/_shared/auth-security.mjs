import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { UMBRELLA_SESSION_COOKIE } from './umbrella-auth.mjs';
import { loadSessionEpoch } from './auth-state.mjs';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
// New hashes use N = 2^17 (OWASP's scrypt floor). The parameters live in the hash
// string (scrypt$v1$N$r$p$salt$hash), so the older N = 2^14 hash already in the
// environment still verifies; re-run `npm run generate:auth` to upgrade it.
export const SCRYPT_COST = 131_072;
export const LEGACY_SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_MIN_COST = LEGACY_SCRYPT_COST;
const SCRYPT_MAX_COST = 1_048_576; // 2^20 → 1 GiB at r = 8; refuse anything heavier
const HASH_LENGTH = 32;
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_REFRESH_AFTER_MS = SESSION_MS / 2;
// Refresh keeps a session going, but never past this long after the passphrase was typed.
export const SESSION_MAX_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
// life-hub.adam-russell.com and api.adam-russell.com share the same registrable domain,
// so SameSite=Lax keeps the cookie first-party on mobile Safari while still sending it
// on same-site cross-origin fetch(..., { credentials: 'include' }).
const SESSION_COOKIE_ATTRIBUTES = 'Path=/; Secure; HttpOnly; SameSite=Lax';

export async function createPassphraseHash(passphrase, { salt = randomBytes(16), cost = SCRYPT_COST } = {}) {
  const saltBuffer = Buffer.from(salt);
  const params = { N: cost, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELIZATION };
  if (!validScryptParams(params)) throw new Error('Unsupported scrypt parameters.');
  const hash = await derivePassphraseHash(passphrase, saltBuffer, params);
  return `scrypt$v1$${params.N}$${params.r}$${params.p}$${saltBuffer.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassphrase(passphrase, encoded) {
  const parsed = parsePassphraseHash(encoded);
  if (!parsed) return false;

  try {
    const actual = await derivePassphraseHash(passphrase, parsed.salt, parsed.params);
    return actual.length === parsed.hash.length && timingSafeEqual(actual, parsed.hash);
  } catch {
    return false;
  }
}

/** The scrypt cost a stored hash uses, or null if it does not parse. */
export function passphraseHashCost(encoded) {
  return parsePassphraseHash(encoded)?.params.N ?? null;
}

/**
 * Sign a session. `epoch` is the server-side session epoch it is issued under (see
 * auth-state.mjs); `authAt` is when the passphrase was typed, carried forward on
 * refresh so SESSION_MAX_LIFETIME_MS caps the whole chain. Synchronous: live scripts
 * mint tokens with it directly.
 */
export function createSessionToken({
  now = Date.now(),
  randomBytes: bytes = randomBytes,
  epoch = 0,
  authAt = now
} = {}, secret) {
  assertSessionSecret(secret);
  const sep = Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : 0;
  const auth = Number.isFinite(authAt) && authAt <= now ? authAt : now;
  const payload = { v: 1, iat: now, exp: now + SESSION_MS, jti: bytes(16).toString('base64url'), sep, auth };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return { token: `${encoded}.${signature}`, expiresAt: new Date(sessionEndsAt(payload)).toISOString() };
}

/** When this session stops working: its own expiry or the absolute cap, whichever is first. */
export function sessionEndsAt(payload) {
  const exp = Number(payload?.exp);
  return Math.min(exp, sessionAuthAt(payload) + SESSION_MAX_LIFETIME_MS);
}

/** First sign-in time. Tokens from before the cap existed count from their own iat. */
export function sessionAuthAt(payload) {
  return Number.isFinite(payload?.auth) ? payload.auth : Number(payload?.iat);
}

/** The epoch a token was issued under (0 for tokens from before revocation existed). */
export function sessionEpochOf(payload) {
  return Number.isSafeInteger(payload?.sep) ? payload.sep : 0;
}

/**
 * Full session check: signature, expiry, absolute lifetime, then the server-side
 * epoch (revocation). Async because the epoch lives in Netlify Blobs. Throws when the
 * epoch cannot be read in a real Blobs environment; callers answer 503 then.
 *
 * Pass `{ epoch }` to skip the Blobs read (tests, or a caller that already has it),
 * or `{ loadEpoch }` to inject the loader.
 */
export async function verifySessionToken(token, secret, now = Date.now(), { epoch, loadEpoch = loadSessionEpoch } = {}) {
  const checked = checkSessionToken(token, secret, now);
  if (!checked.valid) return checked;
  const current = Number.isSafeInteger(epoch) ? epoch : await loadEpoch({ now });
  if (sessionEpochOf(checked.payload) < current) return { valid: false, reason: 'revoked' };
  return checked;
}

/** Signature, shape, expiry and absolute lifetime only (no Blobs read). Synchronous. */
export function checkSessionToken(token, secret, now = Date.now()) {
  assertSessionSecret(secret);
  if (typeof token !== 'string') return { valid: false, reason: 'malformed' };

  const [encoded, signature, ...extra] = token.split('.');
  const encodedPayload = decodeCanonicalBase64Url(encoded);
  const supplied = decodeCanonicalBase64Url(signature);
  if (extra.length || !encodedPayload || !supplied) {
    return { valid: false, reason: 'malformed' };
  }

  const expected = createHmac('sha256', secret).update(encoded).digest();
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return { valid: false, reason: 'invalid-signature' };
  }

  let payload;
  try {
    payload = JSON.parse(encodedPayload.toString('utf8'));
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (!isValidSessionPayload(payload)) return { valid: false, reason: 'malformed' };
  if (now >= payload.exp) return { valid: false, reason: 'expired' };
  if (now >= sessionAuthAt(payload) + SESSION_MAX_LIFETIME_MS) return { valid: false, reason: 'expired' };
  return { valid: true, payload };
}

export function serializeSessionCookie(token) {
  const maxAgeSeconds = Math.floor(SESSION_MS / 1000);
  return `${UMBRELLA_SESSION_COOKIE}=${token}; Max-Age=${maxAgeSeconds}; ${SESSION_COOKIE_ATTRIBUTES}`;
}

export function shouldRefreshSession(payload, now = Date.now()) {
  if (!payload || !Number.isFinite(payload.iat) || !Number.isFinite(payload.exp)) return false;
  const remaining = payload.exp - now;
  if (!(remaining > 0 && remaining <= SESSION_REFRESH_AFTER_MS)) return false;
  // Nothing to gain once the absolute cap is sooner than the current expiry.
  return sessionAuthAt(payload) + SESSION_MAX_LIFETIME_MS > payload.exp;
}

export function serializeExpiredSessionCookie() {
  return `${UMBRELLA_SESSION_COOKIE}=; Max-Age=0; ${SESSION_COOKIE_ATTRIBUTES}`;
}

async function derivePassphraseHash(passphrase, salt, { N, r, p }) {
  return Buffer.from(await scryptAsync(passphrase, salt, HASH_LENGTH, {
    N,
    r,
    p,
    // scrypt needs 128·N·r bytes; leave headroom over that.
    maxmem: 128 * N * r * 2
  }));
}

function validScryptParams({ N, r, p }) {
  return Number.isSafeInteger(N) && N >= SCRYPT_MIN_COST && N <= SCRYPT_MAX_COST && (N & (N - 1)) === 0 &&
    r === SCRYPT_BLOCK_SIZE && p === SCRYPT_PARALLELIZATION;
}

function parsePassphraseHash(encoded) {
  if (typeof encoded !== 'string') return null;
  const parts = encoded.split('$');
  if (parts.length !== 7 || parts[0] !== 'scrypt' || parts[1] !== 'v1') return null;
  if (![parts[2], parts[3], parts[4]].every(part => /^[1-9]\d{0,7}$/.test(part))) return null;
  const params = { N: Number(parts[2]), r: Number(parts[3]), p: Number(parts[4]) };
  if (!validScryptParams(params)) return null;
  const salt = decodeCanonicalBase64Url(parts[5]);
  const hash = decodeCanonicalBase64Url(parts[6]);
  return salt && hash && salt.length > 0 && hash.length === HASH_LENGTH ? { salt, hash, params } : null;
}

function decodeCanonicalBase64Url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const decoded = Buffer.from(value, 'base64url');
    return decoded.toString('base64url') === value ? decoded : null;
  } catch {
    return null;
  }
}

function isValidSessionPayload(payload) {
  if (!payload || typeof payload !== 'object' || payload.v !== 1) return false;
  if (!Number.isFinite(payload.iat) || !Number.isFinite(payload.exp)) return false;
  if (payload.exp !== payload.iat + SESSION_MS || !decodeCanonicalBase64Url(payload.jti)) return false;
  // `sep` and `auth` are absent on tokens issued before revocation and the lifetime cap.
  if (payload.sep !== undefined && !(Number.isSafeInteger(payload.sep) && payload.sep >= 0)) return false;
  if (payload.auth !== undefined &&
      !(Number.isFinite(payload.auth) && payload.auth <= payload.iat &&
        payload.iat - payload.auth < SESSION_MAX_LIFETIME_MS)) {
    return false;
  }
  return true;
}

function assertSessionSecret(secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('Session secret must be at least 32 UTF-8 bytes.');
  }
}
