/**
 * Sealing for Check-in records. AES-256-GCM, a key derived (HKDF-SHA256) from CHECK_IN_KEY, a fresh
 * 12-byte IV per write, and the blob key as associated data so a sealed value can't be moved to
 * another record. There is no plaintext fallback: with no key set, nothing is written or read.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { QuizError } from './question-drop.mjs';

export const CHECK_IN_KEY_ENV = 'CHECK_IN_KEY';
const MIN_SECRET_LENGTH = 32;
const INFO = 'life-hub/check-in/v1';

export function checkInKey(env = process.env) {
  const secret = typeof env?.[CHECK_IN_KEY_ENV] === 'string' ? env[CHECK_IN_KEY_ENV].trim() : '';
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new QuizError(503, 'check_in_key_unset', 'Check-ins are locked until their key is set on the server.');
  }
  return Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), INFO, 32));
}

export function seal(value, key, aad) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ct: ciphertext.toString('base64') };
}

export function open(sealed, key, aad) {
  if (!sealed || sealed.v !== 1 || typeof sealed.iv !== 'string' || typeof sealed.tag !== 'string' || typeof sealed.ct !== 'string') {
    throw new QuizError(500, 'corrupt', 'A check-in couldn’t be read.');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'));
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    const plain = Buffer.concat([decipher.update(Buffer.from(sealed.ct, 'base64')), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  } catch {
    throw new QuizError(500, 'corrupt', 'A check-in couldn’t be read.');
  }
}
