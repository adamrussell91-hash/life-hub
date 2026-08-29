import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import {
  createPassphraseHash,
  createSessionToken,
  serializeSessionCookie,
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

test('signed session expires after thirty days and rejects tampering', () => {
  const secret = 's'.repeat(32);
  const issued = createSessionToken({
    now: Date.parse('2026-08-01T00:00:00Z'),
    randomBytes: () => Buffer.alloc(16, 3)
  }, secret);
  const beforeExpiry = Date.parse('2026-08-01T00:00:00Z') + SESSION_MS - 1;
  const atExpiry = Date.parse('2026-08-01T00:00:00Z') + SESSION_MS;
  assert.equal(verifySessionToken(issued.token, secret, beforeExpiry).valid, true);
  assert.equal(verifySessionToken(issued.token, secret, atExpiry).reason, 'expired');
  assert.equal(verifySessionToken(`${issued.token}x`, secret, beforeExpiry).valid, false);
  assert.equal(verifySessionToken(issued.token, secret, atExpiry + 1).reason, 'expired');
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
  assert.equal(verifySessionToken(`${payload}.${nonCanonicalSignature}`, secret).valid, false);

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
