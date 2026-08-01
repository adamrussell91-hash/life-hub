import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPassphraseHash,
  createSessionToken,
  serializeSessionCookie,
  verifyPassphrase,
  verifySessionToken
} from '../../netlify/functions/_shared/auth-security.mjs';

test('scrypt verifier accepts only the original passphrase', async () => {
  const encoded = await createPassphraseHash('correct horse', {
    salt: Buffer.alloc(16, 7)
  });
  assert.equal(await verifyPassphrase('correct horse', encoded), true);
  assert.equal(await verifyPassphrase('wrong horse', encoded), false);
});

test('signed session expires after eight hours and rejects tampering', () => {
  const secret = 's'.repeat(32);
  const issued = createSessionToken({
    now: Date.parse('2026-08-01T00:00:00Z'),
    randomBytes: () => Buffer.alloc(16, 3)
  }, secret);
  assert.equal(verifySessionToken(issued.token, secret, Date.parse('2026-08-01T07:59:59Z')).valid, true);
  assert.equal(verifySessionToken(`${issued.token}x`, secret, Date.parse('2026-08-01T01:00:00Z')).valid, false);
  assert.equal(verifySessionToken(issued.token, secret, Date.parse('2026-08-01T08:00:01Z')).reason, 'expired');
});

test('session cookie uses every required browser security attribute', () => {
  const cookie = serializeSessionCookie('abc');
  for (const value of ['life_hub_session=abc', 'Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=28800']) {
    assert.match(cookie, new RegExp(value.replace('/', '\\/')));
  }
});
