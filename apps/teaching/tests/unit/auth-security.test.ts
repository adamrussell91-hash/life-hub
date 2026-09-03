import { EventEmitter } from 'node:events';
import { describe, it, expect } from 'vitest';
import {
  createPassphraseHash,
  createSessionToken,
  serializeSessionCookie,
  serializeExpiredSessionCookie,
  verifyPassphrase,
  verifySessionToken
} from '../../netlify/functions/_shared/auth-security.mts';
import { readHiddenPassphrase } from '../../scripts/generate-auth-secrets.mjs';

describe('passphrase verification', () => {
  it('accepts only the original passphrase', async () => {
    const encoded = await createPassphraseHash('correct horse', { salt: Buffer.alloc(16, 7) });
    expect(await verifyPassphrase('correct horse', encoded)).toBe(true);
    expect(await verifyPassphrase('wrong horse', encoded)).toBe(false);
  });

  it('rejects malformed or non-canonical encoded hashes', async () => {
    expect(await verifyPassphrase('correct horse', undefined)).toBe(false);
    expect(await verifyPassphrase('correct horse', 'not-a-scrypt-hash')).toBe(false);

    const encoded = await createPassphraseHash('correct horse', { salt: Buffer.alloc(16, 7) });
    const parts = encoded.split('$');
    const base64url = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    parts[5] = `${parts[5].slice(0, -1)}${base64url[base64url.indexOf(parts[5].at(-1)!) + 1]}`;
    expect(await verifyPassphrase('correct horse', parts.join('$'))).toBe(false);
  });
});

describe('session token roundtrip', () => {
  const secret = 's'.repeat(32);

  it('verifies a freshly issued token and rejects it once expired', () => {
    const issued = createSessionToken(
      { now: Date.parse('2026-08-01T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 3) },
      secret
    );

    const fresh = verifySessionToken(issued.token, secret, Date.parse('2026-08-01T11:59:59Z'));
    expect(fresh.valid).toBe(true);
    if (fresh.valid) {
      expect(fresh.payload.jti).toBe(Buffer.alloc(16, 3).toString('base64url'));
    }

    expect(verifySessionToken(issued.token, secret, Date.parse('2026-08-01T12:00:00Z'))).toMatchObject({
      valid: false,
      reason: 'expired'
    });
    expect(issued.expiresAt).toBe(new Date(Date.parse('2026-08-01T12:00:00Z')).toISOString());
  });

  it('rejects a tampered or malformed token', () => {
    const issued = createSessionToken(
      { now: Date.parse('2026-08-01T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 3) },
      secret
    );

    expect(verifySessionToken(`${issued.token}x`, secret).valid).toBe(false);
    expect(verifySessionToken(undefined, secret)).toMatchObject({ valid: false, reason: 'malformed' });
    expect(verifySessionToken('not-a-token', secret)).toMatchObject({ valid: false, reason: 'malformed' });
  });

  it('rejects a non-canonical base64url signature', () => {
    const issued = createSessionToken(
      { now: Date.parse('2026-08-01T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 3) },
      secret
    );
    const [payload, signature] = issued.token.split('.');
    const base64url = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const nonCanonicalSignature = `${signature.slice(0, -1)}${base64url[base64url.indexOf(signature.at(-1)!) + 1]}`;
    expect(verifySessionToken(`${payload}.${nonCanonicalSignature}`, secret).valid).toBe(false);
  });

  it('throws when the session secret is too short', () => {
    expect(() => createSessionToken({ now: Date.now() }, 'short-secret')).toThrow();
    expect(() => verifySessionToken('a.b', 'short-secret')).toThrow();
  });
});

describe('session cookie serialization', () => {
  it('includes every required browser security attribute', () => {
    const cookie = serializeSessionCookie('abc');
    for (const value of ['teaching_hub_session=abc', 'Secure', 'HttpOnly', 'SameSite=None', 'Path=/', 'Max-Age=43200']) {
      expect(cookie).toContain(value);
    }
  });

  it('clears the cookie with a zero max-age', () => {
    const cookie = serializeExpiredSessionCookie();
    expect(cookie).toContain('teaching_hub_session=;');
    expect(cookie).toContain('Max-Age=0');
  });
});

describe('readHiddenPassphrase', () => {
  it('ends on a newline within a pasted data chunk', async () => {
    const input = new FakeTerminalInput();
    const output = { written: '', write(value: string) { this.written += value; } };
    const passphrase = readHiddenPassphrase('Passphrase: ', { input, output } as unknown as Parameters<
      typeof readHiddenPassphrase
    >[1]);
    input.emit('data', 'correct horse\nignored');

    expect(await passphrase).toBe('correct horse');
    expect(input.rawModeCalls).toEqual([true, false]);
    expect(output.written).toBe('Passphrase: \n');
  });
});

class FakeTerminalInput extends EventEmitter {
  rawModeCalls: boolean[] = [];

  setRawMode(value: boolean): void {
    this.rawModeCalls.push(value);
  }

  resume(): void {}

  setEncoding(): void {}
}
