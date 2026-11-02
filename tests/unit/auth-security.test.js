import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import {
  checkSessionToken,
  createPassphraseHash,
  createSessionToken,
  passphraseHashCost,
  serializeSessionCookie,
  SESSION_MAX_LIFETIME_MS,
  SESSION_MS,
  shouldRefreshSession,
  verifyPassphrase,
  verifySessionToken
} from '../../netlify/functions/_shared/auth-security.mjs';
import { readHiddenPassphrase } from '../../scripts/generate-auth-secrets.mjs';

test('scrypt verifier accepts only the original passphrase', async () => {
  const encoded = await createPassphraseHash('correct horse', {
    salt: Buffer.alloc(16, 7)
  });
  assert.equal(await verifyPassphrase('correct horse', encoded), true);
  assert.equal(await verifyPassphrase('wrong horse', encoded), false);
});

test('signed session expires after thirty days and rejects tampering', async () => {
  const secret = 's'.repeat(32);
  const issued = createSessionToken({
    now: Date.parse('2026-08-01T00:00:00Z'),
    randomBytes: () => Buffer.alloc(16, 3)
  }, secret);
  const beforeExpiry = Date.parse('2026-08-01T00:00:00Z') + SESSION_MS - 1;
  const atExpiry = Date.parse('2026-08-01T00:00:00Z') + SESSION_MS;
  assert.equal((await verifySessionToken(issued.token, secret, beforeExpiry)).valid, true);
  assert.equal((await verifySessionToken(issued.token, secret, atExpiry)).reason, 'expired');
  assert.equal((await verifySessionToken(`${issued.token}x`, secret, beforeExpiry)).valid, false);
  assert.equal((await verifySessionToken(issued.token, secret, atExpiry + 1)).reason, 'expired');
});

test('rejects non-canonical base64url session signatures and password hash components', async () => {
  const secret = 's'.repeat(32);
  const issued = createSessionToken({
    now: Date.parse('2026-08-01T00:00:00Z'),
    randomBytes: () => Buffer.alloc(16, 3)
  }, secret);
  const [payload, signature] = issued.token.split('.');
  const base64url = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const nonCanonicalSignature = `${signature.slice(0, -1)}${base64url[base64url.indexOf(signature.at(-1)) + 1]}`;
  assert.equal((await verifySessionToken(`${payload}.${nonCanonicalSignature}`, secret)).valid, false);

  const encoded = await createPassphraseHash('correct horse', {
    salt: Buffer.alloc(16, 7)
  });
  const parts = encoded.split('$');
  parts[5] = `${parts[5].slice(0, -1)}${base64url[base64url.indexOf(parts[5].at(-1)) + 1]}`;
  assert.equal(await verifyPassphrase('correct horse', parts.join('$')), false);
});

test('session cookie uses every required browser security attribute', () => {
  const cookie = serializeSessionCookie('abc');
  const maxAgeSeconds = Math.floor(SESSION_MS / 1000);
  for (const value of ['life_hub_session=abc', 'Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${maxAgeSeconds}`]) {
    assert.match(cookie, new RegExp(value.replace('/', '\\/')));
  }
});

test('shouldRefreshSession is true only in the second half of the session lifetime', () => {
  const issuedAt = Date.parse('2026-08-01T00:00:00Z');
  const payload = { v: 1, iat: issuedAt, exp: issuedAt + SESSION_MS, jti: 'abc' };
  assert.equal(shouldRefreshSession(payload, issuedAt + SESSION_MS / 2 - 1), false);
  assert.equal(shouldRefreshSession(payload, issuedAt + SESSION_MS / 2), true);
  assert.equal(shouldRefreshSession(payload, issuedAt + SESSION_MS - 1), true);
  assert.equal(shouldRefreshSession(payload, issuedAt + SESSION_MS), false);
});

test('hidden passphrase input ends on a newline within a pasted data chunk', async () => {
  const input = new FakeTerminalInput();
  const output = { written: '', write(value) { this.written += value; } };
  const passphrase = readHiddenPassphrase('Passphrase: ', { input, output });
  input.emit('data', 'correct horse\nignored');

  assert.equal(await passphrase, 'correct horse');
  assert.deepEqual(input.rawModeCalls, [true, false]);
  assert.equal(output.written, 'Passphrase: \n');
});

class FakeTerminalInput extends EventEmitter {
  rawModeCalls = [];

  setRawMode(value) {
    this.rawModeCalls.push(value);
  }

  resume() {}

  setEncoding() {}
}

test('new passphrase hashes use N = 2^17 and the older N = 2^14 format still verifies', async () => {
  const strong = await createPassphraseHash('correct horse', { salt: Buffer.alloc(16, 5) });
  assert.match(strong, /^scrypt\$v1\$131072\$8\$1\$/);
  assert.equal(passphraseHashCost(strong), 131_072);
  assert.equal(await verifyPassphrase('correct horse', strong), true);

  const legacy = await createPassphraseHash('correct horse', { salt: Buffer.alloc(16, 5), cost: 16_384 });
  assert.match(legacy, /^scrypt\$v1\$16384\$8\$1\$/);
  assert.equal(await verifyPassphrase('correct horse', legacy), true);
  assert.equal(await verifyPassphrase('wrong horse', legacy), false);

  // Parameters are read from the string, so a tampered cost cannot verify, and
  // weak or absurd parameters are refused outright.
  const parts = strong.split('$');
  for (const cost of ['16384', '1024', '3', '2097152', '0131072']) {
    assert.equal(await verifyPassphrase('correct horse', [...parts.slice(0, 2), cost, ...parts.slice(3)].join('$')), false, cost);
  }
  assert.equal(await verifyPassphrase('correct horse', strong.replace('$8$1$', '$16$1$')), false);
  await assert.rejects(() => createPassphraseHash('x', { cost: 1000 }), /Unsupported scrypt parameters/);
});

test('a token issued under an older session epoch is revoked; one from the current epoch is valid', async () => {
  const secret = 's'.repeat(32);
  const at = Date.parse('2026-08-01T00:00:00Z');
  const old = createSessionToken({ now: at, randomBytes: () => Buffer.alloc(16, 3), epoch: 2 }, secret);
  const current = createSessionToken({ now: at, randomBytes: () => Buffer.alloc(16, 3), epoch: 3 }, secret);
  assert.deepEqual(await verifySessionToken(old.token, secret, at + 1, { epoch: 3 }), { valid: false, reason: 'revoked' });
  assert.equal((await verifySessionToken(current.token, secret, at + 1, { epoch: 3 })).valid, true);
  let loads = 0;
  const loadEpoch = async () => { loads += 1; return 3; };
  assert.equal((await verifySessionToken(old.token, secret, at + 1, { loadEpoch })).reason, 'revoked');
  assert.equal((await verifySessionToken('garbage', secret, at + 1, { loadEpoch })).valid, false);
  assert.equal(loads, 1, 'a malformed token never costs a Blobs read');
  // The signature check stays synchronous for callers that need it.
  assert.equal(checkSessionToken(old.token, secret, at + 1).valid, true);
});

test('the absolute lifetime cap holds even for a freshly refreshed token', () => {
  const secret = 's'.repeat(32);
  const firstSignIn = Date.parse('2026-08-01T00:00:00Z');
  const refreshedAt = firstSignIn + 80 * 24 * 60 * 60 * 1000;
  const refreshed = createSessionToken({ now: refreshedAt, randomBytes: () => Buffer.alloc(16, 3), authAt: firstSignIn }, secret);
  assert.equal(refreshed.expiresAt, new Date(firstSignIn + SESSION_MAX_LIFETIME_MS).toISOString());
  assert.equal(checkSessionToken(refreshed.token, secret, firstSignIn + SESSION_MAX_LIFETIME_MS - 1).valid, true);
  assert.equal(checkSessionToken(refreshed.token, secret, firstSignIn + SESSION_MAX_LIFETIME_MS).reason, 'expired');
  // Near the cap there is nothing to refresh.
  const payload = { iat: refreshedAt, exp: refreshedAt + SESSION_MS, auth: firstSignIn };
  assert.equal(shouldRefreshSession(payload, refreshedAt + SESSION_MS / 2), false);
});
