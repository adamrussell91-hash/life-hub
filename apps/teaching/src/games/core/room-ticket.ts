import type { Role, TicketPayload } from './room-protocol';

/**
 * Room tickets and signed server-to-server bodies (spec §3.3). One
 * implementation for Netlify (Node 22) and the Worker: Web Crypto only
 * (`crypto.subtle`, `btoa`/`atob`, TextEncoder), all global in both.
 *
 *   ticket    base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, first part))
 *   body sig  header `x-game-room-signature: t=<unix ms>,s=<base64url(HMAC(secret, t + "." + body))>`
 *
 * HMAC checks use `crypto.subtle.verify`, which compares in constant time.
 */

export const TICKET_LIFE_MS: Record<Role, number> = { student: 3 * 60 * 60 * 1000, teacher: 6 * 60 * 60 * 1000, board: 6 * 60 * 60 * 1000 };
export const SIGNATURE_HEADER = 'x-game-room-signature';
/** A signed body older or newer than this is refused (replays, skewed clocks). */
export const SIGNATURE_SKEW_MS = 5 * 60 * 1000;

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

const keyCache = new Map<string, Promise<CryptoKey>>();
function hmacKey(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 16) throw new Error('GAME_ROOM_SECRET is missing or too short.');
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    keyCache.set(secret, key);
  }
  return key;
}

async function sign(secret: string, text: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(text))));
}

async function verify(secret: string, text: string, sig: string): Promise<boolean> {
  const bytes = unb64url(sig);
  if (!bytes || bytes.length !== 32) return false;
  return crypto.subtle.verify('HMAC', await hmacKey(secret), bytes, enc.encode(text));
}

const ROLES: ReadonlySet<string> = new Set(['teacher', 'student', 'board']);

/** Signs a ticket. `exp` defaults to now + the role's life. */
export async function signTicket(secret: string, payload: Omit<TicketPayload, 'exp'> & { exp?: number }, now: number): Promise<string> {
  const full: TicketPayload = { ...payload, exp: payload.exp ?? now + TICKET_LIFE_MS[payload.role] };
  const body = b64url(enc.encode(JSON.stringify(full)));
  return `${body}.${await sign(secret, body)}`;
}

export type TicketCheck = { ok: true; ticket: TicketPayload } | { ok: false; code: 'bad_ticket' | 'expired' | 'wrong_room' | 'wrong_role' };

/** Checks a ticket's signature, expiry and (when given) its room and role. */
export async function verifyTicket(secret: string, token: unknown, now: number, expect: { room?: string; roles?: Role[] } = {}): Promise<TicketCheck> {
  if (typeof token !== 'string' || token.length > 2000) return { ok: false, code: 'bad_ticket' };
  const [body, sig, more] = token.split('.');
  if (!body || !sig || more !== undefined) return { ok: false, code: 'bad_ticket' };
  if (!(await verify(secret, body, sig))) return { ok: false, code: 'bad_ticket' };
  const bytes = unb64url(body);
  let payload: TicketPayload;
  try {
    payload = JSON.parse(dec.decode(bytes ?? new Uint8Array()));
  } catch {
    return { ok: false, code: 'bad_ticket' };
  }
  if (!payload || typeof payload.room !== 'string' || typeof payload.owner !== 'string' || !ROLES.has(payload.role) || typeof payload.exp !== 'number') return { ok: false, code: 'bad_ticket' };
  if (payload.exp <= now) return { ok: false, code: 'expired' };
  if (expect.room !== undefined && payload.room !== expect.room) return { ok: false, code: 'wrong_room' };
  if (expect.roles && !expect.roles.includes(payload.role)) return { ok: false, code: 'wrong_role' };
  return { ok: true, ticket: payload };
}

/** The `x-game-room-signature` header value for a body (room create, fold). */
export async function signBody(secret: string, body: string, now: number): Promise<string> {
  return `t=${now},s=${await sign(secret, `${now}.${body}`)}`;
}

/** True when `header` signs `body` with this secret, within the allowed clock skew. */
export async function verifyBody(secret: string, body: string, header: string | null | undefined, now: number): Promise<boolean> {
  const m = /^t=(\d{1,16}),s=([A-Za-z0-9_-]{20,100})$/.exec(String(header ?? ''));
  if (!m) return false;
  const t = Number(m[1]);
  if (Math.abs(now - t) > SIGNATURE_SKEW_MS) return false;
  return verify(secret, `${t}.${body}`, m[2] as string);
}

/** A ticket from `Authorization: Ticket …`. */
export function ticketFromAuthorization(header: string | null | undefined): string | null {
  const m = /^Ticket\s+(\S+)$/.exec(String(header ?? '').trim());
  return m ? (m[1] as string) : null;
}
