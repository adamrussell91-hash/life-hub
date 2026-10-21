import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';

/** Shared fixtures for the Voice block and feedback code tests. */

const SECRET = 's'.repeat(32);
export const ORIGIN = 'https://life-hub.adam-russell.com';
export const operatorEnv = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET, SITE_ORIGIN: ORIGIN };
export const operatorNow = () => Date.parse('2026-08-01T01:00:00Z');
const session = createSessionToken({ now: Date.parse('2026-08-01T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;

/** A Request with (or without) the teacher's session cookie. */
export function operatorRequest(path, method = 'GET', body, { cookie = true, headers = {} } = {}) {
  const isJson = body !== undefined && !(body instanceof FormData);
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      ...(isJson ? { 'content-type': 'application/json' } : {}),
      ...headers
    },
    body: body === undefined ? undefined : isJson ? JSON.stringify(body) : body
  });
}

/** In-memory Blobs store covering the calls these handlers make. */
export function memoryStore(seed = []) {
  const data = new Map(seed);
  const meta = new Map();
  return {
    data,
    async get(key, options = {}) {
      if (!data.has(key)) return null;
      const value = data.get(key);
      if (options.type === 'arrayBuffer') return value;
      return structuredClone(value);
    },
    async getWithMetadata(key) {
      if (!data.has(key)) return null;
      return { data: data.get(key), metadata: meta.get(key) ?? {} };
    },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value));
      return { modified: true };
    },
    async set(key, value, options) {
      data.set(key, value);
      meta.set(key, options?.metadata ?? {});
    },
    async delete(key) {
      data.delete(key);
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    }
  };
}

export async function json(response) {
  const body = await response.json();
  assert.ok(body, 'response has a body');
  return body;
}
