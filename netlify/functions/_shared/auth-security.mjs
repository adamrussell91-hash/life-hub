import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const HASH_LENGTH = 32;
const SESSION_MS = 8 * 60 * 60 * 1000;
const SESSION_COOKIE_ATTRIBUTES = 'Path=/; Secure; HttpOnly; SameSite=Strict';

export async function createPassphraseHash(passphrase, { salt = randomBytes(16) } = {}) {
  const saltBuffer = Buffer.from(salt);
  const hash = await derivePassphraseHash(passphrase, saltBuffer);
  return `scrypt$v1$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$${saltBuffer.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassphrase(passphrase, encoded) {
  const parsed = parsePassphraseHash(encoded);
  if (!parsed) return false;

  try {
    const actual = await derivePassphraseHash(passphrase, parsed.salt);
    return actual.length === parsed.hash.length && timingSafeEqual(actual, parsed.hash);
  } catch {
    return false;
  }
}

export function createSessionToken({ now = Date.now(), randomBytes: bytes = randomBytes } = {}, secret) {
  assertSessionSecret(secret);
  const payload = { v: 1, iat: now, exp: now + SESSION_MS, jti: bytes(16).toString('base64url') };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return { token: `${encoded}.${signature}`, expiresAt: new Date(payload.exp).toISOString() };
}

export function verifySessionToken(token, secret, now = Date.now()) {
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
  if (now > payload.exp) return { valid: false, reason: 'expired' };
  return { valid: true, payload };
}

export function serializeSessionCookie(token) {
  return `life_hub_session=${token}; Max-Age=28800; ${SESSION_COOKIE_ATTRIBUTES}`;
}

export function serializeExpiredSessionCookie() {
  return `life_hub_session=; Max-Age=0; ${SESSION_COOKIE_ATTRIBUTES}`;
}

async function derivePassphraseHash(passphrase, salt) {
  return Buffer.from(await scryptAsync(passphrase, salt, HASH_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: 64 * 1024 * 1024
  }));
}

function parsePassphraseHash(encoded) {
  if (typeof encoded !== 'string') return null;
  const parts = encoded.split('$');
  if (parts.length !== 7 || parts[0] !== 'scrypt' || parts[1] !== 'v1' ||
      parts[2] !== String(SCRYPT_COST) || parts[3] !== String(SCRYPT_BLOCK_SIZE) ||
      parts[4] !== String(SCRYPT_PARALLELIZATION)) {
    return null;
  }
  const salt = decodeCanonicalBase64Url(parts[5]);
  const hash = decodeCanonicalBase64Url(parts[6]);
  return salt && hash && salt.length > 0 && hash.length === HASH_LENGTH ? { salt, hash } : null;
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
  return payload && typeof payload === 'object' && payload.v === 1 &&
    Number.isFinite(payload.iat) && Number.isFinite(payload.exp) &&
    payload.exp === payload.iat + SESSION_MS && Boolean(decodeCanonicalBase64Url(payload.jti));
}

function assertSessionSecret(secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('Session secret must be at least 32 UTF-8 bytes.');
  }
}
