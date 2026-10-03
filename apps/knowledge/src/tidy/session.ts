/**
 * Verifies a umbrella session token in the research Worker with WebCrypto.
 * Same format and rules as verifySessionToken in
 * netlify/functions/_shared/auth-security.mjs: `<payload>.<signature>`, both
 * canonical base64url, HMAC-SHA256 over the payload part, payload
 * `{ v: 1, iat, exp, jti }` with a 30-day life.
 */

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), ch => ch.charCodeAt(0));
    return encodeBase64Url(bytes) === value ? bytes : null;
  } catch {
    return null;
  }
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function validPayload(payload: unknown): payload is { v: 1; iat: number; exp: number; jti: string } {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    p.v === 1 &&
    typeof p.iat === "number" && Number.isFinite(p.iat) &&
    typeof p.exp === "number" && Number.isFinite(p.exp) &&
    p.exp === p.iat + SESSION_MS &&
    typeof p.jti === "string" && decodeBase64Url(p.jti) !== null
  );
}

export async function verifySessionToken(token: string, secret: string, now = Date.now()): Promise<boolean> {
  if (!secret || new TextEncoder().encode(secret).length < 32 || typeof token !== "string") return false;
  const [encoded, signature, ...extra] = token.split(".");
  if (extra.length || !encoded || !signature) return false;
  const payloadBytes = decodeBase64Url(encoded);
  const supplied = decodeBase64Url(signature);
  if (!payloadBytes || !supplied) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  // subtle.verify compares in constant time.
  const ok = await crypto.subtle.verify("HMAC", key, supplied, new TextEncoder().encode(encoded));
  if (!ok) return false;
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return false;
  }
  return validPayload(payload) && now < payload.exp;
}
